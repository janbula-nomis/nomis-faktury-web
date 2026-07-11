/**
 * netlify/functions/firmy.js
 * Správa firem – jen pro roli "admin". List "Firmy" v Sheets.
 *
 * GET    -> { firmy: [...] }
 * POST   { Nazev, ICO, DIC, Platce_DPH } -> nová firma
 * PATCH  { row, zmeny } -> úprava firmy (Nazev se z bezpečnostních důvodů
 *          nemění přes appku - viz poznámka níže, jen ICO/DIC/Platce_DPH)
 * DELETE ?row=N -> smaže firmu
 *
 * Pozn.: Název firmy je použitý jako "klíč" i jinde (Doklady.Firma_potvrzena,
 * Uzivatele.Firmy) - appka to nijak automaticky nepřejmenovává na jiných
 * místech. Proto editace názvu existující firmy touhle cestou není povolená
 * (jen při vytvoření nové firmy) - zabraňuje to nechtěnému rozjetí vazeb.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { json } = require('../../lib/http');

const FIRMY_HEADERS = ['Nazev', 'ICO', 'DIC', 'Platce_DPH'];

function normalizujPlatceDph(hodnota) {
  return hodnota === 'ANO' ? 'ANO' : 'NE';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
    if (uzivatel.role !== 'admin') {
      const err = new Error('Tuto akci může provést jen administrátor.');
      err.statusCode = 403;
      throw err;
    }
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      return json(200, { firmy: rows });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const nazev = String(telo.Nazev || '').trim();
      if (!nazev) return json(400, { error: 'Název firmy je povinný.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      if (existujici.some((f) => f.Nazev === nazev)) {
        return json(409, { error: 'Firma s tímto přesným názvem už existuje.' });
      }

      await appendRow(sheets, spreadsheetId, 'Firmy', FIRMY_HEADERS, {
        Nazev: nazev,
        ICO: String(telo.ICO || '').trim(),
        DIC: String(telo.DIC || '').trim(),
        Platce_DPH: normalizujPlatceDph(telo.Platce_DPH),
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      delete zmeny.Nazev; // název firmy se přes appku neupravuje, viz komentář nahoře
      if (zmeny.Platce_DPH !== undefined) zmeny.Platce_DPH = normalizujPlatceDph(zmeny.Platce_DPH);
      if (zmeny.ICO !== undefined) zmeny.ICO = String(zmeny.ICO).trim();
      if (zmeny.DIC !== undefined) zmeny.DIC = String(zmeny.DIC).trim();

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const soucasny = rows.find((f) => f._row === row);
      if (!soucasny) return json(404, { error: 'Firma nenalezena.' });

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Firmy', FIRMY_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Firmy', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
