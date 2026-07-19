/**
 * netlify/functions/kniha-jizd-import.js
 * Import CSV uložených cest pro Knihu jízd (backlog, položka 16, doplněno
 * v4.8 po obdržení reálného ukázkového souboru od Jana pro auto Defender).
 * Parser samotný je v lib/knihaJizdImportCest.js (viz tam pro popis
 * očekávaného formátu sloupců) - tenhle soubor už jen appce doplní Firmu/
 * Auto/Řidiče (appka je ze souboru neumí poznat - export appka dostává
 * vždycky za JEDNO konkrétní auto) a řeší dedup + zápis do Sheets.
 *
 * POST { Firma, Auto, Ridic?, obsahSouboru } -> naimportuje jízdy.
 * Přístup: stejně jako u ostatních firemních dat (kniha-jizd.js) - kdokoli
 * s přístupem k dané firmě.
 *
 * Appka NEPÁRUJE jednotlivou jízdu s konkrétním tankováním (dle rozhodnutí
 * Jana - agregace jen po měsíci/autě, viz kniha-jizd-prehled.js) - appka
 * importované jízdy jen přidá do Kniha_jizd, souhrn už je spočítá stejně
 * jako u ručně zadaných.
 */
const crypto = require('crypto');
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRows } = require('../../lib/sheetsHelpers');
const { KNIHA_JIZD_HEADERS } = require('../../lib/knihaJizdSchema');
const { parsujCsvUlozenychCest } = require('../../lib/knihaJizdImportCest');
const { json } = require('../../lib/http');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  try {
    const telo = JSON.parse(event.body || '{}');
    const firma = String(telo.Firma || '').trim();
    const auto = String(telo.Auto || '').trim();
    const ridic = String(telo.Ridic || '').trim();

    if (!firma) return json(400, { error: 'Vyberte firmu.' });
    if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
    if (!auto) return json(400, { error: 'Vyberte auto, ke kterému soubor patří.' });
    if (!telo.obsahSouboru) return json(400, { error: 'Chybí obsah souboru.' });

    let rozpar;
    try {
      rozpar = parsujCsvUlozenychCest(telo.obsahSouboru);
    } catch (e) {
      return json(400, { error: e.message });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const { rows: existujiciJizdy } = await readSheetObjects(sheets, spreadsheetId, 'Kniha_jizd');
    const znameHashe = new Set(existujiciJizdy.map((j) => j.Zdroj_hash).filter(Boolean));

    const datumVytvoreni = new Date().toISOString();
    const noveJizdy = [];
    let pocetDuplicit = 0;

    rozpar.jizdy.forEach((j) => {
      const hash = crypto.createHash('sha256').update(auto + '|' + j.hashZaklad).digest('hex');
      if (znameHashe.has(hash)) {
        pocetDuplicit += 1;
        return;
      }
      znameHashe.add(hash);
      noveJizdy.push({
        ID: crypto.randomUUID(),
        Firma: firma,
        Auto: auto,
        Ridic: ridic,
        Datum: j.datum,
        Ucel_cesty: j.ucelCesty,
        Ujete_km: String(j.vzdalenostKm),
        Pocatecni_tachometr: '',
        Konecny_tachometr: '',
        Zdroj: 'Import CSV',
        Poznamka: j.poznamka,
        Vytvoril: uzivatel.jmeno,
        Datum_vytvoreni: datumVytvoreni,
        Zdroj_hash: hash,
      });
    });

    if (noveJizdy.length > 0) {
      await appendRows(sheets, spreadsheetId, 'Kniha_jizd', KNIHA_JIZD_HEADERS, noveJizdy);
    }

    return json(200, {
      ok: true,
      celkemVSouboru: rozpar.jizdy.length,
      naimportovano: noveJizdy.length,
      duplicitni: pocetDuplicit,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
