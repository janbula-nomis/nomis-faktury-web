/**
 * netlify/functions/dashboard-firmy.js
 * GET (Bearer token) -> data pro NOVOU záložku "Dashboard" (od v3.22, viz
 * claude/nomis-faktury-backlog.md, položka 4) - na rozdíl od dřívější
 * záložky "Přehled plateb" (jeden souhrn napříč VŠEMI firmami dohromady;
 * od v4.6 zrušená a nahrazená Daňovým přehledem, viz backlog položka 9 a
 * netlify/functions/danovy-prehled.js) appka tady vrací VŠECHNY firmy
 * viditelné uživateli VEDLE SEBE, každou se svými vlastními čísly (žádný
 * přepínač/filtr firmy).
 *
 * Pro každou viditelnou firmu appka počítá za KLOUZAVÉ OKNO POSLEDNÍCH 12
 * MĚSÍCŮ (od 1. dne měsíce před 11 měsíci do dneška):
 *   - příjmy/výdaje/rozdíl (čistý tok), rozpad podle střediska
 *   - provozní upozornění: počet dokladů čekajících na schválení (Stav !=
 *     "Schváleno", stejná definice jako sekce "Ke schválení" v záložce
 *     Přijaté faktury/Doklady), počet nespárovaných bankovních pohybů
 *     (Stav_parovani == "Nespárováno")
 *
 * Výdaje appka počítá stejnou logikou, jakou dřív používala záložka Přehled
 * plateb: doklady
 * dané firmy (mimo placeholder "Zpracovává se") PLUS bankovní pohyby
 * přiřazené jako trvalý příkaz ke Smlouvě se ZÁPORNOU částkou
 * (Stav_parovani == "Trvalý příkaz") - středisko u těch appka bere ze
 * samotné Smlouvy (lib/smlouvySchema.js, pole Stredisko), protože pohyb
 * sám středisko nenese. Příjmy appka počítá ze TŘÍ zdrojů bankovních
 * pohybů: (a) Stav_parovani == "Příjem přiřazen" (příchozí platba, které
 * účetní ručně přiřadila středisko), (b) OD v3.23 i Stav_parovani ==
 * "Spárováno - vydaná faktura" (příchozí platba potvrzeně spárovaná s
 * konkrétní Vydanou fakturou, v3.22) - středisko appka u těchhle bere z
 * pole `Jednotka` napárované faktury (lib/vydaneFakturySchema.js). Do
 * v3.23 appka tenhle druhý zdroj v Dashboardu OMYLEM vůbec nepočítala -
 * Jan to nahlásil jako "uhrazené (vydané faktury) se nepropisuje do
 * dashboardu". (c) bankovní pohyby přiřazené jako trvalý příkaz ke
 * Smlouvě se KLADNOU částkou (Stav_parovani == "Trvalý příkaz", stejný
 * stav jako u výdajů výš, appka pohyby rozlišuje podle znaménka částky) -
 * appka bere středisko přímo z pohybu, kam ho appka zkopírovala ze
 * Smlouvy při potvrzení/návrhu (viz netlify/functions/banka.js), se
 * zálohou na Smlouva.Stredisko. Do v4.19 appka tenhle zdroj vůbec
 * neuměla (nájemní příjem appka tehdy ještě neuměla párovat se
 * Smlouvou), v4.19-v4.23 šlo o samostatný stav "Spárováno - nájemní
 * smlouva" jen pro nájmy (appka po zrušení samostatné entity Nemovitosti,
 * Jan: "nemovitost je zase jen středisko", řešila nájemní příjem čistě
 * přes Středisko) - OD v4.24 (Jan: "příchozí platby musí mít stejně jako
 * odchozí možnost přiřadit smlouvu/trvalý příkaz") appka tenhle
 * nájemně-specifický mechanismus sjednotila se stejným obecným "trvalý
 * příkaz", jaký appka od v3.19 používá u odchozích plateb - appka proto
 * dál PRO JISTOTU počítá i starší, dosud nepřevedené pohyby se stavem
 * "Spárováno - nájemní smlouva" (appka existující data retroaktivně
 * needituje, viz zavedená konvence).
 *
 * Appka navíc vrací globální (ne per-firma) upozornění googleAuthVarovani -
 * pokud selže i jen základní čtení listu Firmy/Doklady (typicky vypršelý/
 * odvolaný Google refresh token, viz lib/google.js), appka radši vrátí
 * HTTP 200 s prázdnými daty + varováním, než aby celá záložka Dashboard
 * spadla na chybu 500 - uživatel tak aspoň uvidí srozumitelné upozornění
 * místo prázdné/rozbité obrazovky.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');

function jePravdepodobneChybaGoogleAuth(e) {
  const zprava = String((e && e.message) || '');
  return (
    /GOOGLE_OAUTH|invalid_grant|invalid_client|unauthorized_client|invalid_token|token.*expired|401/i.test(zprava)
  );
}

function vypoctiZacatekOkna() {
  const ted = new Date();
  // Klouzavé okno posledních 12 měsíců VČETNĚ aktuálního - appka bere 1.
  // den měsíce před 11 měsíci (11 měsíců zpátky + aktuální měsíc = 12).
  const zacatek = new Date(ted.getFullYear(), ted.getMonth() - 11, 1);
  const rok = zacatek.getFullYear();
  const mesic = String(zacatek.getMonth() + 1).padStart(2, '0');
  return rok + '-' + mesic + '-01';
}

// Od v4.26 (Jan: "v dashboard pracuje v Kč ale u některých firem jsou to
// EUR, musí rozlišit měnu") - appka do téhle verze sčítala příjmy/výdaje
// VŠECH zdrojů (Doklady, Bankovní pohyby) do jednoho čísla na firmu bez
// ohledu na jejich skutečnou měnu (`Mena` u Dokladu i Bankovního pohybu, viz
// lib/dokladySchema.js a lib/bankSchema.js) - u firmy, která hospodaří jen
// v CZK, appka na tom "náhodou" neselhala, ale jakmile měla firma i EUR
// doklady/platby (typicky zahraniční nemovitost/nájemce), appka EUR částky
// prostě přičetla k CZK součtu, jako by šlo o stejnou měnu, a frontend to
// navíc vždycky popsal jako "Kč" (viz formatCastkaCele v public/app.js) -
// číslo tak bylo zcela nesmyslné. Appka teď každou položku přičte do součtu
// PODLE JEJÍ VLASTNÍ MĚNY (`normalizujMenu` níž, prázdná appka bere jako
// CZK stejně jako zbytek appky) - výsledek appka vrací jako mapu
// měna -> částka (`prijmyPodleMeny`/`vydajePodleMeny`/`rozdilPodleMeny`,
// stejně tak rozpad podle střediska), appka žádnou měnu NEPŘEPOČÍTÁVÁ na
// jinou (appka nemá k dispozici kurzovní lístek) - frontend zobrazí
// samostatný řádek za každou měnu, se kterou appka u firmy fakticky nashromáždí
// alespoň jednu položku v okně posledních 12 měsíců.
function normalizujMenu(mena) {
  const m = String(mena || '').trim().toUpperCase();
  return m || 'CZK';
}

function pripoctiCelkem(mapaPodleMeny, mena, castka) {
  const m = normalizujMenu(mena);
  mapaPodleMeny[m] = (mapaPodleMeny[m] || 0) + castka;
}

function pripoctiStredisko(mapaStredisek, stredisko, mena, castka) {
  if (!mapaStredisek[stredisko]) mapaStredisek[stredisko] = {};
  pripoctiCelkem(mapaStredisek[stredisko], mena, castka);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  const zacatekOkna = vypoctiZacatekOkna();

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const [{ rows: firmyVsechny }, { rows: doklady }] = await Promise.all([
      readSheetObjects(sheets, spreadsheetId, 'Firmy'),
      readSheetObjects(sheets, spreadsheetId, 'Doklady'),
    ]);

    const viditelneFirmy = (firmyVsechny || [])
      .map((f) => f.Nazev)
      .filter(Boolean)
      .filter((nazev) => uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(nazev));

    // Bankovní pohyby, Smlouvy a Vydané faktury appka čte odděleně - appka
    // bez zapnuté Banky (starší appka, nebo Jan si ji zatím nezapnul) tyhle
    // listy nemusí mít vůbec založené, Dashboard má fungovat i tak (jen bez
    // příjmové části a bez trvalých příkazů ve výdajích).
    let pohybyVsechny = [];
    let smlouvyVsechny = [];
    let fakturyVsechny = [];
    try {
      const [{ rows: p }, { rows: s }, { rows: f }] = await Promise.all([
        readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby'),
        readSheetObjects(sheets, spreadsheetId, 'Smlouvy'),
        readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury').catch(() => ({ rows: [] })),
      ]);
      pohybyVsechny = p;
      smlouvyVsechny = s;
      fakturyVsechny = f;
    } catch (e) {
      // Banka appka zatím nemá zapnutou - Dashboard pokračuje bez ní.
    }

    const strediskoPodleSmlouvy = {};
    smlouvyVsechny.forEach((s) => {
      if (s.ID) strediskoPodleSmlouvy[s.ID] = s.Stredisko || '(bez střediska)';
    });

    // (v3.23) Jednotka napárované Vydané faktury appka používá jako
    // "středisko" pro rozpad příjmů z potvrzených plateb faktur - mirror
    // strediskoPodleSmlouvy výš.
    const jednotkaPodleFaktury = {};
    fakturyVsechny.forEach((f) => {
      if (f.ID) jednotkaPodleFaktury[f.ID] = f.Jednotka || '(bez střediska)';
    });

    const vysledky = viditelneFirmy.map((firma) => {
      const strediskaPrijmy = {};
      const strediskaVydaje = {};
      const prijmyPodleMeny = {};
      const vydajePodleMeny = {};

      doklady
        .filter((d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma)
        .filter((d) => d.Stav !== 'Zpracovává se')
        .filter((d) => String(d.Datum_dokladu || '') >= zacatekOkna)
        .forEach((d) => {
          const stredisko = d.Stredisko || '(bez střediska)';
          const castka = parsujCastkuZListu(d.Castka);
          pripoctiStredisko(strediskaVydaje, stredisko, d.Mena, castka);
          pripoctiCelkem(vydajePodleMeny, d.Mena, castka);
        });

      const pohybyTetoFirmy = pohybyVsechny.filter((p) => p.Firma === firma);

      // (v4.24) "Trvalý příkaz" appka od téhle verze používá i na příjmové
      // straně (Jan: "příchozí platby musí mít stejně jako odchozí možnost
      // přiřadit smlouvu/trvalý příkaz", appka to sjednotila s dřívějším
      // "Spárováno - nájemní smlouva" - viz netlify/functions/banka.js) -
      // appka proto MUSÍ každý pohyb rozlišit podle ZNAMÉNKA částky, ne ho
      // rovnou počítat jako výdaj jako dřív. Výdajová strana (záporná
      // částka) appka bere středisko ze SAMOTNÉ Smlouvy (pohyb sám středisko
      // nenese - beze změny oproti dřívějšku), příjmová strana (kladná
      // částka) appka bere středisko PŘÍMO z pohybu (appka ho tam zkopírovala
      // ze smlouvy při potvrzení/návrhu, viz banka.js), se zálohou na
      // Smlouva.Stredisko, kdyby kopírování z nějakého důvodu chybělo.
      pohybyTetoFirmy
        .filter((p) => p.Stav_parovani === 'Trvalý příkaz')
        .filter((p) => String(p.Datum || '') >= zacatekOkna)
        .forEach((p) => {
          const castka = parsujCastkuZListu(p.Castka);
          if (castka > 0) {
            const stredisko = p.Stredisko || strediskoPodleSmlouvy[p.Smlouva_ID] || '(bez střediska)';
            pripoctiStredisko(strediskaPrijmy, stredisko, p.Mena, castka);
            pripoctiCelkem(prijmyPodleMeny, p.Mena, castka);
          } else {
            const abs = Math.abs(castka);
            const stredisko = strediskoPodleSmlouvy[p.Smlouva_ID] || '(smlouva)';
            pripoctiStredisko(strediskaVydaje, stredisko, p.Mena, abs);
            pripoctiCelkem(vydajePodleMeny, p.Mena, abs);
          }
        });

      pohybyTetoFirmy
        .filter((p) => p.Stav_parovani === 'Příjem přiřazen')
        .filter((p) => String(p.Datum || '') >= zacatekOkna)
        .forEach((p) => {
          const castka = parsujCastkuZListu(p.Castka);
          const stredisko = p.Stredisko || '(bez střediska)';
          pripoctiStredisko(strediskaPrijmy, stredisko, p.Mena, castka);
          pripoctiCelkem(prijmyPodleMeny, p.Mena, castka);
        });

      // (v3.23) Platby potvrzeně spárované s Vydanou fakturou appka do
      // téhle chvíle v Dashboardu vůbec nepočítala - viz komentář nahoře
      // v hlavičce souboru ("uhrazené se nepropisuje do dashboardu").
      pohybyTetoFirmy
        .filter((p) => p.Stav_parovani === 'Spárováno - vydaná faktura')
        .filter((p) => String(p.Datum || '') >= zacatekOkna)
        .forEach((p) => {
          const castka = parsujCastkuZListu(p.Castka);
          const stredisko = jednotkaPodleFaktury[p.Vydana_faktura_ID] || '(bez střediska)';
          pripoctiStredisko(strediskaPrijmy, stredisko, p.Mena, castka);
          pripoctiCelkem(prijmyPodleMeny, p.Mena, castka);
        });

      // (v4.23) Platby potvrzeně spárované s nájemní Smlouvou (appka od
      // v4.23 zrušila samostatnou entitu Nemovitosti a nájemní příjem
      // kategorizuje čistě přes Středisko, viz netlify/functions/banka.js) -
      // appka bere Středisko přímo z pohybu (appka ho tam kopíruje ze
      // smlouvy při potvrzení/návrhu), se zálohou na aktuální
      // Smlouva.Stredisko pro starší pohyby, kde by kopírování z nějakého
      // důvodu selhalo.
      pohybyTetoFirmy
        .filter((p) => p.Stav_parovani === 'Spárováno - nájemní smlouva')
        .filter((p) => String(p.Datum || '') >= zacatekOkna)
        .forEach((p) => {
          const castka = parsujCastkuZListu(p.Castka);
          const stredisko = p.Stredisko || strediskoPodleSmlouvy[p.Smlouva_ID] || '(bez střediska)';
          pripoctiStredisko(strediskaPrijmy, stredisko, p.Mena, castka);
          pripoctiCelkem(prijmyPodleMeny, p.Mena, castka);
        });

      // Provozní upozornění appka počítá BEZ ohledu na klouzavé okno 12
      // měsíců - doklad čekající na schválení nebo nespárovaný pohyb je
      // potřeba vyřešit bez ohledu na to, jak starý je.
      const dokladyKeSchvaleni = doklady.filter(
        (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma && d.Stav !== 'Schváleno'
      ).length;
      const pohybyNesparovane = pohybyTetoFirmy.filter((p) => p.Stav_parovani === 'Nespárováno').length;

      // Appka rozdíl (příjmy - výdaje) počítá zvlášť PRO KAŽDOU měnu, se
      // kterou appka u téhle firmy v okně vůbec něco napočítala (sjednocení
      // klíčů obou map) - appka nikdy nesčítá napříč měnami dohromady.
      const rozdilPodleMeny = {};
      new Set([...Object.keys(prijmyPodleMeny), ...Object.keys(vydajePodleMeny)]).forEach((mena) => {
        rozdilPodleMeny[mena] = (prijmyPodleMeny[mena] || 0) - (vydajePodleMeny[mena] || 0);
      });

      return {
        firma,
        prijmyPodleMeny,
        vydajePodleMeny,
        rozdilPodleMeny,
        strediskaPrijmy,
        strediskaVydaje,
        dokladyKeSchvaleni,
        pohybyNesparovane,
      };
    });

    return json(200, {
      firmy: vysledky,
      obdobiOd: zacatekOkna,
      googleAuthVarovani: false,
    });
  } catch (e) {
    if (jePravdepodobneChybaGoogleAuth(e)) {
      return json(200, {
        firmy: [],
        obdobiOd: zacatekOkna,
        googleAuthVarovani: true,
        googleAuthChyba: e.message,
      });
    }
    return json(500, { error: e.message });
  }
};
