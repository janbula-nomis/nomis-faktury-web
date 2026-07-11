/**
 * netlify/functions/auta.js
 * Správa vozidel – jen pro roli "admin". List "Auta" v Sheets.
 *
 * GET    -> { auta: [...] }
 * POST   { SPZ, Model, Firma, Ridic } -> nové auto
 * PATCH  { row, zmeny } -> úprava auta
 * DELETE ?row=N -> smaže auto
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { json } = require('../../lib/http');

const AUTA_HEADERS = ['SPZ', 'Model', 'Firma', 'Ridic'];

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
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Auta');
      const { rows: firmy } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      return json(200, { auta: rows, firmyDostupne: firmy.map((f) => f.Nazev).filter(Boolean) });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const spz = String(telo.SPZ || '').trim();
      if (!spz) return json(400, { error: 'SPZ je povinná.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Auta');
      if (existujici.some((a) => a.SPZ === spz)) {
        return json(409, { error: 'Auto s touto SPZ už existuje.' });
      }

      await appendRow(sheets, spreadsheetId, 'Auta', AUTA_HEADERS, {
        SPZ: spz,
        Model: String(telo.Model || '').trim(),
        Firma: String(telo.Firma || '').trim(),
        Ridic: String(telo.Ridic || '').trim(),
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      ['SPZ', 'Model', 'Firma', 'Ridic'].forEach((k) => {
        if (zmeny[k] !== undefined) zmeny[k] = String(zmeny[k]).trim();
      });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Auta');
      const soucasny = rows.find((a) => a._row === row);
      if (!soucasny) return json(404, { error: 'Auto nenalezeno.' });

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Auta', AUTA_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Auta', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
