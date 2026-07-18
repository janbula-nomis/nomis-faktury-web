/**
 * netlify/functions/danovy-prehled.js
 * GET (Bearer token) -> Daňový přehled (od v4.6, nahrazuje dřívější
 * záložku/endpoint "Přehled plateb" - netlify/functions/dashboard.js, viz
 * claude/nomis-faktury-backlog.md, položka 9). Obsah dřívějšího Přehledu
 * plateb (Čistý tok, rozpad výdajů/příjmů podle firmy/kategorie/střediska/
 * měsíce) appka NIKAM nepřesouvá - podle rozhodnutí Jana (2026-07-17) se
 * zjednodušeně nahrazuje tímhle Daňovým přehledem, ne rozšiřuje.
 *
 * Appka vrací dvě části:
 *
 * 1) dphBilance - měsíční bilance DPH (kolik appka/firma DOSTANE nebo
 *    ZAPLATÍ) - POČÍTÁ SE automaticky z rozdílu DPH na Vydaných fakturách
 *    (výstup) a DPH na Doklady (vstup), POUZE za firmy, které mají v listu
 *    "Firmy" nastaveno Platce_DPH = "ANO" (dnes jen NOMIS Investment).
 *    Appka NIKDY sama neodvádí/nepotvrzuje platbu - jen spočítá saldo jako
 *    podklad pro přiznání. Saldo appka počítá jako:
 *      saldo = DPH na vydaných fakturách za měsíc - DPH na dokladech za měsíc
 *    Kladné saldo = appka na výstupu vybrala víc DPH, než na vstupu
 *    zaplatila -> firma bude typicky DOPLÁCET finančnímu úřadu. Záporné
 *    saldo = appka zaplatila víc DPH na vstupu, než vybrala na výstupu ->
 *    firmě typicky vzniká NÁROK na vrácení. NOMIS Investment je měsíční
 *    plátce (potvrzeno Janem 2026-07-18), appka proto bilanci počítá a
 *    zobrazuje po KALENDÁŘNÍCH MĚSÍCÍCH (ne kvartálně).
 *
 * 2) zaplaceneDane - SKUTEČNĚ zaplacené ostatní daně (daň z příjmu, daň z
 *    nemovitostí; silniční daň appka zatím nepodporuje - viz backlog,
 *    odloženo na později) - appka je NEDOPOČÍTÁVÁ, jen SČÍTÁ bankovní
 *    pohyby, které účetní ručně přiřadila k dani (Stav_parovani = "Daňová
 *    platba", Typ_dane = "Dan_z_prijmu" nebo "Dan_z_nemovitosti") přes
 *    akci "Přiřadit k dani" v záložce Bankovní výpisy - stejný princip
 *    manuálního přiřazení jako u "Trvalý příkaz" (appka NEROZPOZNÁVÁ
 *    automaticky podle protistrany/textu).
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
    const platciDph = firmyVsechny
      .filter((f) => String(f.Platce_DPH || '').trim() === 'ANO')
      .filter((f) => maPristupKFirme(uzivatel, f.Nazev))
      .map((f) => f.Nazev);

    // dphBilance[mesic][firma] = { dphVydane, dphPrijate, saldo }
    const dphBilance = {};
    function zajistiMesicFirmu(mesic, firma) {
      if (!dphBilance[mesic]) dphBilance[mesic] = {};
      if (!dphBilance[mesic][firma]) dphBilance[mesic][firma] = { dphVydane: 0, dphPrijate: 0 };
      return dphBilance[mesic][firma];
    }

    if (platciDph.length > 0) {
      try {
        const { rows: fakturyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
        fakturyVsechny.forEach((f) => {
          if (!platciDph.includes(f.Firma)) return;
          const dph = parsujCastkuZListu(f.DPH);
          if (!dph) return;
          const mesic = String(f.Datum_vystaveni || '').slice(0, 7);
          if (!mesic) return;
          zajistiMesicFirmu(mesic, f.Firma).dphVydane += dph;
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
          const mesic = String(d.Datum_dokladu || '').slice(0, 7);
          if (!mesic) return;
          zajistiMesicFirmu(mesic, firma).dphPrijate += dph;
        });
      } catch (e) {
        // Nemělo by nastat (Doklady appka má vždy), ale appka se přesto nemá zastavit.
      }
    }

    const dphBilanceSeznam = [];
    Object.keys(dphBilance)
      .sort()
      .forEach((mesic) => {
        Object.keys(dphBilance[mesic])
          .sort()
          .forEach((firma) => {
            const polozka = dphBilance[mesic][firma];
            dphBilanceSeznam.push({
              mesic,
              firma,
              dphVydane: Math.round(polozka.dphVydane * 100) / 100,
              dphPrijate: Math.round(polozka.dphPrijate * 100) / 100,
              saldo: Math.round((polozka.dphVydane - polozka.dphPrijate) * 100) / 100,
            });
          });
      });

    // zaplaceneDane[firma][typDane] = { celkem, podleMesice: {mesic: castka} }
    const zaplaceneDane = {};
    try {
      const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      pohybyVsechny
        .filter((p) => p.Stav_parovani === 'Daňová platba' && p.Typ_dane)
        .filter((p) => maPristupKFirme(uzivatel, p.Firma))
        .forEach((p) => {
          const firma = p.Firma || '(nepřiřazeno)';
          const typ = p.Typ_dane;
          const castka = Math.abs(parsujCastkuZListu(p.Castka));
          const mesic = String(p.Datum || '').slice(0, 7) || '(bez data)';

          if (!zaplaceneDane[firma]) zaplaceneDane[firma] = {};
          if (!zaplaceneDane[firma][typ]) zaplaceneDane[firma][typ] = { celkem: 0, podleMesice: {} };
          zaplaceneDane[firma][typ].celkem += castka;
          zaplaceneDane[firma][typ].podleMesice[mesic] = (zaplaceneDane[firma][typ].podleMesice[mesic] || 0) + castka;
        });
    } catch (e) {
      // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
      // Daňový přehled se kvůli tomu nemá přestat načítat, jen bez téhle části.
    }

    return json(200, {
      platciDph,
      dphBilance: dphBilanceSeznam,
      zaplaceneDane,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
