/**
 * netlify/functions/kniha-jizd-prehled.js
 * GET (Bearer token) -> souhrn Knihy jízd podle AUTA a MĚSÍCE/ROKU (backlog,
 * položka 16) - kolik km appka najezdila (Kniha_jizd) a kolik litrů appka
 * natankovala (Doklady, Kategorie = "Palivo") u daného auta, plus průměrná
 * spotřeba v l/100 km. Stejný vzor jako netlify/functions/danovy-prehled.js
 * (rozpad podle měsíce i roku zároveň, appka vždy počítá "rok" jako
 * kalendářní rok).
 *
 * Spárování appka dělá NA ÚROVNI auta a měsíce (dle rozhodnutí Jana
 * 2026-07-19) - NE spárování konkrétního tankování ke konkrétní jízdě.
 * Auto appka pozná ve OBOU listech přes stejný řetězec (Kniha_jizd.Auto /
 * Doklady.Stredisko, např. "Auto - Tesla") - appka od v3.8 nemá u Dokladů
 * samostatné SPZ pole (viz lib/knihaJizdSchema.js).
 *
 * Přístup: stejně jako u Kniha jízd (kniha-jizd.js) - kdokoli s přístupem
 * k dané firmě, bez omezení jen na admin/účetní.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
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

    // souhrn[typObdobi][obdobi][auto] = { km, litry }
    const souhrn = { mesic: {}, rok: {} };
    function zajistiPolozku(typObdobi, obdobi, auto) {
      if (!souhrn[typObdobi][obdobi]) souhrn[typObdobi][obdobi] = {};
      if (!souhrn[typObdobi][obdobi][auto]) souhrn[typObdobi][obdobi][auto] = { km: 0, litry: 0 };
      return souhrn[typObdobi][obdobi][auto];
    }
    function pripocti(datum, auto, pole, hodnota) {
      if (!auto || !hodnota) return;
      const mesic = String(datum || '').slice(0, 7);
      if (!mesic) return;
      const rok = mesic.slice(0, 4);
      zajistiPolozku('mesic', mesic, auto)[pole] += hodnota;
      zajistiPolozku('rok', rok, auto)[pole] += hodnota;
    }

    try {
      const { rows: jizdyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Kniha_jizd');
      jizdyVsechny
        .filter((j) => maPristupKFirme(uzivatel, j.Firma))
        .forEach((j) => {
          const km = parsujCastkuZListu(j.Ujete_km);
          pripocti(j.Datum, j.Auto, 'km', km);
        });
    } catch (e) {
      // List Kniha_jizd nemusí ještě existovat (appka bez znovu spuštěného
      // /api/setup po tomhle vydání) - appka jen nechá souhrn prázdný.
    }

    try {
      const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
      dokladyVsechny
        .filter((d) => d.Kategorie === 'Palivo' && d.Stav !== 'Zpracovává se')
        .filter((d) => maPristupKFirme(uzivatel, d.Firma_potvrzena || d.Firma_AI_odhad))
        .forEach((d) => {
          const litry = parsujCastkuZListu(d.Mnozstvi_litru);
          pripocti(d.Datum_dokladu, d.Stredisko, 'litry', litry);
        });
    } catch (e) {
      // Nemělo by nastat (Doklady appka má vždy), ale appka se přesto nemá zastavit.
    }

    function serazenySouhrn(typObdobi) {
      const vysledek = {};
      Object.keys(souhrn[typObdobi]).forEach((obdobi) => {
        vysledek[obdobi] = {};
        Object.keys(souhrn[typObdobi][obdobi]).forEach((auto) => {
          const p = souhrn[typObdobi][obdobi][auto];
          vysledek[obdobi][auto] = {
            km: zaokrouhli(p.km),
            litry: zaokrouhli(p.litry),
            prumSpotreba: p.km > 0 ? zaokrouhli((p.litry / p.km) * 100) : null,
          };
        });
      });
      return vysledek;
    }

    const souhrnMesicni = serazenySouhrn('mesic');
    const souhrnRocni = serazenySouhrn('rok');

    const obdobiMesice = Object.keys(souhrnMesicni).sort((a, b) => b.localeCompare(a));
    const obdobiRoky = Object.keys(souhrnRocni).sort((a, b) => b.localeCompare(a));

    // Appka vrátí i kompletní seznam aut, která se v souhrnu objevují (napříč
    // obdobími), ať frontend umí vykreslit i auto, které v aktuálně
    // vybraném roce nemá žádná data (appka pak jen ukáže nuly).
    const vsechnaAuta = Array.from(
      new Set(
        Object.values(souhrnRocni).flatMap((r) => Object.keys(r))
      )
    ).sort();

    return json(200, { obdobiMesice, obdobiRoky, souhrnMesicni, souhrnRocni, vsechnaAuta });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
