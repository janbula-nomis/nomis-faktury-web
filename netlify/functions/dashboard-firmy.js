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

// Od v4.26.1 (Jan: "CZK nebo EUR se musí zobrazovat na základě měny
// bankovních účtů") - appka dřív u bankovního pohybu brala měnu z pole
// `Mena` uloženého NA POHYBU, které appka odvodila při importu výpisu ze
// sloupce/metadat souboru (viz lib/bankImportTabular.js) - tahle hodnota
// appce může snadno "ujet" (chybějící sloupec s měnou, špatně rozpoznaná
// hlavička apod.). List Účty (`Ucty`, viz lib/uctySchema.js) má u
// KAŽDÉHO bankovního účtu firmy jednu pevnou měnu (appka ji tam nastaví
// při založení účtu, ať už automaticky při prvním importu, nebo ručně v
// Nastavení) - účet logicky vždycky drží jen jednu měnu, takže je to
// spolehlivější zdroj pravdy. Appka proto měnu bankovního pohybu odvozuje
// PŘEDNOSTNĚ podle jeho vlastního účtu (`Cislo_uctu_vlastni` -> Ucty.Mena),
// a jen když appka k číslu účtu nenajde odpovídající řádek v Účtech
// (starší data, smazaný účet, import přes "účet nesedí"), spadne zpátky na
// měnu uloženou přímo na pohybu (beze změny oproti dřívějšku). Appka
// samotnou hodnotu `Bankovni_pohyby.Mena` v Sheets nijak nepřepisuje - jen
// mění, kterou měnu použije pro zobrazení/výpočet.
//
// Od v4.47 (Jan: "potřebuji abys na CZK účtech pracoval jen s měnou účtu CZK
// a na EUR jen s EUR, v Dashboardu je HUF a EUR na CZK účtu firmy, to tak
// nesmí být") - ta záloha na `p.Mena` byla přesně ta díra, kterou Janovi na
// CZK firmu prosákl řádek "Výdaje (HUF)". Zaplatí-li Jan kartou na maďarské
// pumpě, banka do výpisu klidně napíše původní měnu transakce (HUF), i když
// z účtu odešly koruny - appka to pak vzala jako plnohodnotnou třetí měnu
// firmy. Bankovní pohyb ale ze své podstaty NEMŮŽE být v jiné měně než účet,
// na kterém je zaúčtovaný: částka v pohybu je to, co banka opravdu strhla
// nebo připsala. Appka proto `p.Mena` už nepoužívá vůbec a řadí zálohy takto:
//   1. měna účtu podle `Cislo_uctu_vlastni` (nejspolehlivější),
//   2. má-li firma jen JEDEN účet (resp. všechny její účty stejnou měnu),
//      appka vezme tu - u drtivé většiny firem je to tenhle případ a starší
//      pohyby bez vyplněného čísla vlastního účtu tím přestanou vyskakovat
//      jako cizí měna,
//   3. teprve když firma má víc účtů v RŮZNÝCH měnách a u pohybu appka
//      nepozná, na kterém z nich je, spadne na CZK - tady už appka nemá jak
//      hádat a je poctivější držet se výchozí měny appky než čísla z výpisu,
//      o kterém appka právě zjistila, že mu nemůže věřit.
function vytvorMenyUctu(uctyVsechny, firmyVsechny) {
  const menaPodleUctu = {};
  (uctyVsechny || []).forEach((u) => {
    if (u.Cislo_uctu) menaPodleUctu[u.Cislo_uctu] = normalizujMenu(u.Mena);
  });

  // Měny účtů po firmách. Legacy pole `Firmy.Bankovni_ucet` (jeden účet
  // před v3.6, viz lib/uctySchema.js) měnu nenese - je-li to jediný účet
  // firmy, je to podle konvence appky CZK.
  const menyFirmy = {};
  const pridej = (firma, mena) => {
    if (!firma) return;
    if (!menyFirmy[firma]) menyFirmy[firma] = new Set();
    menyFirmy[firma].add(normalizujMenu(mena));
  };
  (uctyVsechny || []).forEach((u) => pridej(u.Firma, u.Mena));
  (firmyVsechny || []).forEach((f) => {
    if (f.Bankovni_ucet && !(menyFirmy[f.Nazev] || {}).size) pridej(f.Nazev, 'CZK');
  });

  return {
    // Seznam měn, ve kterých firma vůbec smí něco vykázat - appka ho posílá
    // i na frontend (odznak "CZK"/"EUR" v hlavičce karty).
    menyFirmy: (firma) => Array.from(menyFirmy[firma] || []).sort((a, b) =>
      (a === 'CZK' ? -1 : b === 'CZK' ? 1 : a.localeCompare(b))),
    menaPohybu: (p) => {
      if (p.Cislo_uctu_vlastni && menaPodleUctu[p.Cislo_uctu_vlastni]) {
        return menaPodleUctu[p.Cislo_uctu_vlastni];
      }
      const meny = Array.from(menyFirmy[p.Firma] || []);
      return meny.length === 1 ? meny[0] : 'CZK';
    },
  };
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
    let uctyVsechny = [];
    try {
      const [{ rows: p }, { rows: s }, { rows: f }, { rows: u }] = await Promise.all([
        readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby'),
        readSheetObjects(sheets, spreadsheetId, 'Smlouvy'),
        readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury').catch(() => ({ rows: [] })),
        readSheetObjects(sheets, spreadsheetId, 'Ucty').catch(() => ({ rows: [] })),
      ]);
      pohybyVsechny = p;
      smlouvyVsechny = s;
      fakturyVsechny = f;
      uctyVsechny = u;
    } catch (e) {
      // Banka appka zatím nemá zapnutou - Dashboard pokračuje bez ní.
    }
    const { menyFirmy, menaPohybu } = vytvorMenyUctu(uctyVsechny, firmyVsechny);

    // v4.34 (Jan: "v dashboard uvádět částky pouze v měně účtu") - appka
    // dosud u Dokladů (na rozdíl od Bankovních pohybů, viz vytvorMenyUctu
    // výš od v4.26.1) brala měnu přímo z pole `Mena` NA DOKLADU (appka ho
    // vytěží/appka ho ručně zadá při zpracování) - to appce může "ujet"
    // stejně jako u pohybu (překlep, špatně rozpoznaná měna), ale doklad
    // sám žádný účet nenese, takže appka nemá odkud spolehlivější měnu vzít
    // BEZ DALŠÍHO KROKU. Appka proto zkusí doklad dohledat mezi Bankovními
    // pohyby PODLE Doklad_ID (appka tenhle svazek už používá pro spárování
    // výdaje s odchozí platbou, viz banka.js) - je-li doklad spárovaný s
    // konkrétní platbou, appka převezme měnu ÚČTU, kterým platba prošla
    // (stejně spolehlivý zdroj jako u pohybů samotných). Není-li doklad
    // (zatím) spárovaný, appka na Janovo výslovné potvrzení (AskUserQuestion)
    // NECHÁVÁ beze změny - zůstane v měně uvedené přímo na dokladu, jak appka
    // dělala dosud, dokud párování neproběhne.
    //
    // v4.47 tenhle poslední odstavec ruší a opravuje u toho tiššího, ale
    // horšího brouka: appka si od v4.34 brala z účtu jen MĚNU, ale ČÁSTKU
    // pořád z dokladu. Účtenka z maďarské pumpy na 15 000 HUF spárovaná s
    // korunovou platbou se tedy do CZK součtu započítala jako 15 000 Kč,
    // místo těch zhruba 1 400 Kč, které banka reálně strhla - součet byl
    // desetinásobně mimo a nebylo to na kartě nijak vidět. Appka proto u
    // spárovaného dokladu bere z platby OBOJÍ, měnu i částku (Jan to výslovně
    // potvrdil: "Částku z platby"). Platby se u jednoho dokladu sčítají -
    // doklad může být uhrazený na několikrát a jinak by ten poslední pohyb
    // přebil předchozí.
    //
    // Nespárovaný doklad v cizí měně appka do součtů NEDÁVÁ (Janův výběr
    // "Nezapočítat a napsat to pod kartu") - kurzovní lístek appka nemá a
    // vymýšlet si ho nebude, přičíst číslo z účtenky do CZK součtu by byla
    // přesně ta chyba, kvůli které tahle verze vznikla. Aby to ale nebylo
    // tiché zametení pod koberec, appka takové doklady spočítá a pošle je
    // na frontend zvlášť (`cizeMeny`), kde je karta vypíše pod součty.
    const platbaPodleDokladu = {};
    pohybyVsechny.forEach((p) => {
      if (!p.Doklad_ID) return;
      const zaznam = platbaPodleDokladu[p.Doklad_ID] || { mena: menaPohybu(p), castka: 0 };
      zaznam.castka += Math.abs(parsujCastkuZListu(p.Castka));
      platbaPodleDokladu[p.Doklad_ID] = zaznam;
    });

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

      // Měny, ve kterých firma vůbec smí něco vykázat - tedy měny jejích
      // bankovních účtů. Firma bez jediného účtu (appka ji zná, ale banku
      // pro ni Jan zatím nezapnul) se chová jako korunová.
      const menyUctu = menyFirmy(firma);
      const povoleneMeny = new Set(menyUctu.length > 0 ? menyUctu : ['CZK']);

      // Doklady v cizí měně, které appka nezapočítala (viz komentář výš) -
      // mapa měna -> součet, plus prostý počet dokladů pro větu na kartě.
      const cizeMenyCastky = {};
      let cizeMenyPocet = 0;

      doklady
        .filter((d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma)
        .filter((d) => d.Stav !== 'Zpracovává se')
        .filter((d) => String(d.Datum_dokladu || '') >= zacatekOkna)
        .forEach((d) => {
          const stredisko = d.Stredisko || '(bez střediska)';
          // v4.32: Dobropis (opravný daňový doklad) SNIŽUJE dřívější náklad,
          // ne přičítá nový - appka proto částku odečte (záporné znaménko),
          // stejný princip jako u DPH bilance v danovy-prehled.js, viz
          // lib/dokladySchema.js pro plné zdůvodnění.
          const znamenko = d.Typ_dokladu === 'Dobropis' ? -1 : 1;

          // Spárovaný doklad: appka bere měnu i částku z platby, protože ta
          // je vždycky v měně účtu a je to částka, která z účtu opravdu odešla.
          const platba = platbaPodleDokladu[d.ID];
          if (platba) {
            pripoctiStredisko(strediskaVydaje, stredisko, platba.mena, platba.castka * znamenko);
            pripoctiCelkem(vydajePodleMeny, platba.mena, platba.castka * znamenko);
            return;
          }

          // Nespárovaný doklad: měna z dokladu se musí shodovat s měnou
          // některého účtu firmy, jinak ho appka nezapočítá a jen ho vykáže.
          const mena = normalizujMenu(d.Mena);
          const castka = parsujCastkuZListu(d.Castka);
          if (!povoleneMeny.has(mena)) {
            cizeMenyCastky[mena] = (cizeMenyCastky[mena] || 0) + castka;
            cizeMenyPocet += 1;
            return;
          }
          pripoctiStredisko(strediskaVydaje, stredisko, mena, castka * znamenko);
          pripoctiCelkem(vydajePodleMeny, mena, castka * znamenko);
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
            pripoctiStredisko(strediskaPrijmy, stredisko, menaPohybu(p), castka);
            pripoctiCelkem(prijmyPodleMeny, menaPohybu(p), castka);
          } else {
            const abs = Math.abs(castka);
            const stredisko = strediskoPodleSmlouvy[p.Smlouva_ID] || '(smlouva)';
            pripoctiStredisko(strediskaVydaje, stredisko, menaPohybu(p), abs);
            pripoctiCelkem(vydajePodleMeny, menaPohybu(p), abs);
          }
        });

      pohybyTetoFirmy
        .filter((p) => p.Stav_parovani === 'Příjem přiřazen')
        .filter((p) => String(p.Datum || '') >= zacatekOkna)
        .forEach((p) => {
          const castka = parsujCastkuZListu(p.Castka);
          const stredisko = p.Stredisko || '(bez střediska)';
          pripoctiStredisko(strediskaPrijmy, stredisko, menaPohybu(p), castka);
          pripoctiCelkem(prijmyPodleMeny, menaPohybu(p), castka);
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
          pripoctiStredisko(strediskaPrijmy, stredisko, menaPohybu(p), castka);
          pripoctiCelkem(prijmyPodleMeny, menaPohybu(p), castka);
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
          pripoctiStredisko(strediskaPrijmy, stredisko, menaPohybu(p), castka);
          pripoctiCelkem(prijmyPodleMeny, menaPohybu(p), castka);
        });

      // Provozní upozornění appka počítá BEZ ohledu na klouzavé okno 12
      // měsíců - doklad čekající na schválení nebo nespárovaný pohyb je
      // potřeba vyřešit bez ohledu na to, jak starý je.
      const dokladyKeSchvaleni = doklady.filter(
        (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma && d.Stav !== 'Schváleno'
      ).length;
      const pohybyNesparovane = pohybyTetoFirmy.filter((p) => p.Stav_parovani === 'Nespárováno').length;

      // (v4.48) Jan: "na dashboard zobrazit v tlačítku kolik čeká na
      // vyřízení?" - k tlačítku Vydané faktury patří počet faktur PO
      // SPLATNOSTI. Ten se do téhle chvíle nikde nepočítal: frontend si ho
      // odvozoval sám při vykreslení seznamu (vfJePoSplatnosti v
      // public/app.js), jenže odznáček na tlačítku appka musí umět vykreslit
      // i ve chvíli, kdy Jan seznam Vydaných faktur vůbec neotevřel - proto
      // to samé pravidlo počítá i tady.
      //
      // Pravidlo je schválně DOSLOVA stejné jako ve frontendu: faktura je po
      // splatnosti, jen když je Stav 'Neuhrazeno' A Datum_splatnosti je
      // ostře menší než dnešek. Nikde se neukládá žádný stav "Po splatnosti"
      // - je to čistě odvozené z dnešního data, takže appka nic nepřepočítává
      // na pozadí a číslo se "samo" opraví, jakmile Jan fakturu označí za
      // uhrazenou. Kdyby se pravidlo někdy měnilo, musí se změnit na OBOU
      // místech naráz, jinak odznáček ukazuje jiné číslo než seznam pod ním.
      const dnes = new Date().toISOString().slice(0, 10);
      const fakturyPoSplatnosti = fakturyVsechny.filter(
        (f) => f.Firma === firma && f.Stav === 'Neuhrazeno' && f.Datum_splatnosti && f.Datum_splatnosti < dnes
      ).length;

      // Appka rozdíl (příjmy - výdaje) počítá zvlášť PRO KAŽDOU měnu, se
      // kterou appka u téhle firmy v okně vůbec něco napočítala (sjednocení
      // klíčů obou map) - appka nikdy nesčítá napříč měnami dohromady.
      const rozdilPodleMeny = {};
      new Set([...Object.keys(prijmyPodleMeny), ...Object.keys(vydajePodleMeny)]).forEach((mena) => {
        rozdilPodleMeny[mena] = (prijmyPodleMeny[mena] || 0) - (vydajePodleMeny[mena] || 0);
      });

      return {
        firma,
        menyUctu,
        prijmyPodleMeny,
        vydajePodleMeny,
        rozdilPodleMeny,
        strediskaPrijmy,
        strediskaVydaje,
        dokladyKeSchvaleni,
        pohybyNesparovane,
        fakturyPoSplatnosti,
        cizeMeny: { pocet: cizeMenyPocet, castky: cizeMenyCastky },
      };
    });

    // (v4.48) Režim "jen počítadla" - appka ho volá kvůli odznakům na
    // tlačítkách hlavního menu (viz vykresliPocitadla() v public/app.js).
    //
    // Proč vůbec existuje: Dashboard je od v4.30 pro běžnou roli ZAMČENÝ
    // ("uživatel vidí přijaté, vydané a bank výpisy, víc nic") a plná
    // odpověď téhle funkce nese příjmy, výdaje a rozpad po střediscích -
    // tedy přesně ta čísla, která běžný uživatel vidět nemá. Odznak
    // "kolik čeká na vyřízení" ale dává smysl každé roli. Appka proto
    // umí odpovědět osekaně: jen tři počty na firmu, žádná částka.
    // Kdyby se sem někdy dopisovalo další pole, musí se rozmyslet, jestli
    // patří i do téhle větve - výchozí odpověď je NE. Pozor, ať se
    // historie neopakuje.
    const jenPocitadla = String(((event.queryStringParameters || {}).jen_pocitadla) || '') === '1';
    if (jenPocitadla) {
      return json(200, {
        firmy: vysledky.map((f) => ({
          firma: f.firma,
          dokladyKeSchvaleni: f.dokladyKeSchvaleni,
          pohybyNesparovane: f.pohybyNesparovane,
          fakturyPoSplatnosti: f.fakturyPoSplatnosti,
        })),
        googleAuthVarovani: false,
      });
    }

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
