/**
 * netlify/functions/danovy-prehled.js
 * GET (Bearer token) -> Daňový přehled (od v4.6, nahrazuje dřívější
 * záložku/endpoint "Přehled plateb" - netlify/functions/dashboard.js, viz
 * claude/nomis-faktury-backlog.md, položka 9). Od v4.6.1 appka vrací data
 * jako TABULKU (firmy × druhy daně) s možností přepnout MĚSÍČNÍ/ROČNÍ
 * pohled - "rok" appka VŽDY počítá jako KALENDÁŘNÍ rok (leden-prosinec,
 * daňové období), NIKDY jako klouzavé okno (na rozdíl od záložky
 * Dashboard, která klouzavé okno používá záměrně pro jiný účel - rychlý
 * provozní přehled, ne daňové přiznání).
 *
 * Appka vrací dvě části, obě ROZPADEM PODLE MĚSÍCE i PODLE ROKU zároveň
 * (frontend si podle zvoleného přepínače vybere, kterou použije):
 *
 * 1) dphBilanceMesicni/dphBilanceRocni - bilance DPH (kolik appka/firma
 *    DOSTANE nebo ZAPLATÍ) - POČÍTÁ SE automaticky z rozdílu DPH na
 *    Vydaných fakturách (výstup) a DPH na Dokladech (vstup), POUZE za
 *    firmy s Firmy.Platce_DPH = "ANO" (dnes jen NOMIS Investment). Appka
 *    NIKDY sama neodvádí/nepotvrzuje platbu - jen spočítá saldo jako
 *    podklad pro přiznání:
 *      saldo = DPH na vydaných fakturách za období - DPH na dokladech za období
 *    Kladné saldo = firma bude typicky DOPLÁCET finančnímu úřadu. Záporné
 *    saldo = firmě typicky vzniká NÁROK na vrácení.
 *
 * 2) danovePlatbyMesicni/danovePlatbyRocni - SKUTEČNĚ zaplacené/vrácené
 *    částky (DPH, daň z příjmu, daň z nemovitostí; silniční daň appka
 *    zatím nepodporuje - odloženo) - appka je NEDOPOČÍTÁVÁ, jen SČÍTÁ SE
 *    ZNAMÉNKEM bankovní pohyby, které účetní ručně přiřadila k dani
 *    (Stav_parovani = "Daňová platba") přes akci "Přiřadit k dani" v
 *    záložce Bankovní výpisy - záporná částka = appka/firma zaplatila,
 *    kladná = appce/firmě bylo vráceno (typicky přeplatek). Appka tenhle
 *    typ appka NEROZPOZNÁVÁ automaticky podle protistrany/textu (stejná
 *    filozofie jako "Trvalý příkaz"). U DPH appka drží tohle číslo
 *    ZÁMĚRNĚ odděleně od vypočtené DPH bilance výše - jde o dvě různá
 *    čísla vedle sebe v tabulce (kolik appka spočítala z dokladů/faktur
 *    vs. kolik reálně prošlo bankou).
 *
 * List Bankovni_pohyby/Vydane_faktury nemusí existovat (appka bez zapnuté
 * Banky, nebo bez vydaných faktur) - appka v tom případě jen nechá
 * příslušnou část prázdnou, zbytek Daňového přehledu dál funguje.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni' || (uzivatel.firmy || []).includes(firma);
}

function zaokrouhli(cislo) {
  return Math.round(cislo * 100) / 100;
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

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const { rows: firmyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
    const viditelneFirmy = firmyVsechny.filter((f) => maPristupKFirme(uzivatel, f.Nazev)).map((f) => f.Nazev);
    const platciDph = firmyVsechny
      .filter((f) => String(f.Platce_DPH || '').trim() === 'ANO')
      .filter((f) => maPristupKFirme(uzivatel, f.Nazev))
      .map((f) => f.Nazev);

    // dphBilance[typObdobi][obdobi][firma] = { dphVydane, dphPrijate }
    const dphBilance = { mesic: {}, rok: {} };
    function zajistiDphPolozku(typObdobi, obdobi, firma) {
      if (!dphBilance[typObdobi][obdobi]) dphBilance[typObdobi][obdobi] = {};
      if (!dphBilance[typObdobi][obdobi][firma]) dphBilance[typObdobi][obdobi][firma] = { dphVydane: 0, dphPrijate: 0 };
      return dphBilance[typObdobi][obdobi][firma];
    }
    function pripoctiDph(datum, firma, pole, castka) {
      const mesic = String(datum || '').slice(0, 7);
      if (!mesic) return;
      const rok = mesic.slice(0, 4);
      zajistiDphPolozku('mesic', mesic, firma)[pole] += castka;
      zajistiDphPolozku('rok', rok, firma)[pole] += castka;
    }

    if (platciDph.length > 0) {
      try {
        const { rows: fakturyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
        fakturyVsechny.forEach((f) => {
          if (!platciDph.includes(f.Firma)) return;
          const dph = parsujCastkuZListu(f.DPH);
          if (!dph) return;
          pripoctiDph(f.Datum_vystaveni, f.Firma, 'dphVydane', dph);
        });
      } catch (e) {
        // List Vydane_faktury nemusí existovat - appka jen nechá výstup prázdný.
      }

      try {
        const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
        dokladyVsechny.forEach((d) => {
          if (d.Stav === 'Zpracovává se') return;
          const firma = d.Firma_potvrzena || d.Firma_AI_odhad;
          if (!platciDph.includes(firma)) return;
          const dph = parsujCastkuZListu(d.DPH);
          if (!dph) return;
          pripoctiDph(d.Datum_dokladu, firma, 'dphPrijate', dph);
        });
      } catch (e) {
        // Nemělo by nastat (Doklady appka má vždy), ale appka se přesto nemá zastavit.
      }
    }

    function serazenaBilance(typObdobi) {
      const vysledek = {};
      Object.keys(dphBilance[typObdobi]).forEach((obdobi) => {
        vysledek[obdobi] = {};
        Object.keys(dphBilance[typObdobi][obdobi]).forEach((firma) => {
          const p = dphBilance[typObdobi][obdobi][firma];
          vysledek[obdobi][firma] = {
            dphVydane: zaokrouhli(p.dphVydane),
            dphPrijate: zaokrouhli(p.dphPrijate),
            saldo: zaokrouhli(p.dphVydane - p.dphPrijate),
          };
        });
      });
      return vysledek;
    }

    // danovePlatby[typObdobi][obdobi][firma][typDane] = castka SE ZNAMÉNKEM
    // (záporná = zaplaceno, kladná = vráceno) - viz komentář v hlavičce
    // souboru, appka od v4.6.1 už nebere Math.abs.
    const danovePlatby = { mesic: {}, rok: {} };
    function pripoctiDan(typObdobi, obdobi, firma, typ, castka) {
      if (!danovePlatby[typObdobi][obdobi]) danovePlatby[typObdobi][obdobi] = {};
      if (!danovePlatby[typObdobi][obdobi][firma]) danovePlatby[typObdobi][obdobi][firma] = {};
      danovePlatby[typObdobi][obdobi][firma][typ] = (danovePlatby[typObdobi][obdobi][firma][typ] || 0) + castka;
    }

    try {
      const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      pohybyVsechny
        .filter((p) => p.Stav_parovani === 'Daňová platba' && p.Typ_dane)
        .filter((p) => maPristupKFirme(uzivatel, p.Firma))
        .forEach((p) => {
          const firma = p.Firma || '(nepřiřazeno)';
          const typ = p.Typ_dane;
          const castka = parsujCastkuZListu(p.Castka);
          const mesic = String(p.Datum || '').slice(0, 7) || '(bez data)';
          const rok = mesic.slice(0, 4) || '(bez data)';
          pripoctiDan('mesic', mesic, firma, typ, castka);
          pripoctiDan('rok', rok, firma, typ, castka);
        });
    } catch (e) {
      // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
      // Daňový přehled se kvůli tomu nemá přestat načítat, jen bez téhle části.
    }

    function serazeneDanovePlatby(typObdobi) {
      const vysledek = {};
      Object.keys(danovePlatby[typObdobi]).forEach((obdobi) => {
        vysledek[obdobi] = {};
        Object.keys(danovePlatby[typObdobi][obdobi]).forEach((firma) => {
          vysledek[obdobi][firma] = {};
          Object.keys(danovePlatby[typObdobi][obdobi][firma]).forEach((typ) => {
            vysledek[obdobi][firma][typ] = zaokrouhli(danovePlatby[typObdobi][obdobi][firma][typ]);
          });
        });
      });
      return vysledek;
    }

    const dphBilanceMesicni = serazenaBilance('mesic');
    const dphBilanceRocni = serazenaBilance('rok');
    const danovePlatbyMesicni = serazeneDanovePlatby('mesic');
    const danovePlatbyRocni = serazeneDanovePlatby('rok');

    const obdobiMesice = Array.from(
      new Set([...Object.keys(dphBilanceMesicni), ...Object.keys(danovePlatbyMesicni)])
    ).sort((a, b) => b.localeCompare(a));
    const obdobiRoky = Array.from(
      new Set([...Object.keys(dphBilanceRocni), ...Object.keys(danovePlatbyRocni)])
    ).sort((a, b) => b.localeCompare(a));

    return json(200, {
      platciDph,
      firmy: viditelneFirmy,
      obdobiMesice,
      obdobiRoky,
      dphBilanceMesicni,
      dphBilanceRocni,
      danovePlatbyMesicni,
      danovePlatbyRocni,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
