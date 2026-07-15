/**
 * netlify/functions/ucty.js
 * Správa bankovních účtů firem (od v3.6) - list "Ucty" v Sheets. Firma může
 * mít víc účtů (typicky CZK + EUR), tenhle list appce umožňuje evidovat
 * libovolný počet účtů na firmu (na rozdíl od staršího jednoho pole
 * Bankovni_ucet v listu Firmy, které appka dál čte jako jeden "legacy"
 * známý účet - viz banka.js).
 *
 * GET    -> { ucty: [...], firmyDostupne: [...] } smí kterýkoli přihlášený
 *           uživatel (stejný princip jako u Auta - potřeba i mimo admin
 *           kontext), POST/PATCH/DELETE jen role "admin".
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { UCTY_HEADERS } = require('../../lib/uctySchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (event.httpMethod !== 'GET' && uzivatel.role !== 'admin') {
    return json(403, { error: 'Tuto akci může provést jen administrátor.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Ucty');
      const { rows: firmy } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      return json(200, { ucty: rows, firmyDostupne: firmy.map((f) => f.Nazev).filter(Boolean) });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const cisloUctu = String(telo.Cislo_uctu || '').trim();
      const firma = String(telo.Firma || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!cisloUctu) return json(400, { error: 'Číslo účtu je povinné.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Ucty');
      if (existujici.some((u) => u.Cislo_uctu === cisloUctu)) {
        return json(409, { error: 'Účet s tímto číslem už v seznamu existuje.' });
      }

      const radek = {
        ID: crypto.randomUUID(),
        Firma: firma,
        Cislo_uctu: cisloUctu,
        Mena: String(telo.Mena || 'CZK').trim() || 'CZK',
        Popis: String(telo.Popis || '').trim(),
      };
      await appendRow(sheets, spreadsheetId, 'Ucty', UCTY_HEADERS, radek);

      return json(200, { ok: true, ucet: radek });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      ['Firma', 'Cislo_uctu', 'Mena', 'Popis'].forEach((k) => {
        if (zmeny[k] !== undefined) zmeny[k] = String(zmeny[k]).trim();
      });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Ucty');
      const soucasny = rows.find((u) => u._row === row);
      if (!soucasny) return json(404, { error: 'Účet nenalezen.' });

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Ucty', UCTY_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Ucty', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
