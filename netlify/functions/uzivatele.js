/**
 * netlify/functions/uzivatele.js
 * Správa uživatelů appky – jen pro roli "admin". List "Uzivatele" v Sheets.
 *
 * GET    -> { uzivatele: [...], firmyDostupne: [...] }
 * POST   { Jmeno, PIN, Firmy: [...], Role } -> vytvoří nového uživatele
 * PATCH  { row, zmeny: { Jmeno, PIN, Firmy: [...], Role } } -> upraví uživatele
 * DELETE ?row=N -> smaže uživatele (řádek v Sheetu)
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { json } = require('../../lib/http');

const UZIVATELE_HEADERS = ['Jmeno', 'PIN', 'Firmy', 'Role'];

function normalizujFirmy(hodnota) {
  if (Array.isArray(hodnota)) return hodnota.filter(Boolean).join(', ');
  return String(hodnota || '').trim();
}

const PLATNE_ROLE = ['admin', 'ucetni'];

function normalizujRoli(hodnota) {
  return PLATNE_ROLE.includes(hodnota) ? hodnota : '';
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
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Uzivatele');
      const { rows: firmy } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      return json(200, {
        uzivatele: rows,
        firmyDostupne: firmy.map((f) => f.Nazev).filter(Boolean),
      });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const jmeno = String(telo.Jmeno || '').trim();
      const pin = String(telo.PIN || '').trim();
      const firmy = normalizujFirmy(telo.Firmy);
      const role = normalizujRoli(telo.Role);

      if (!jmeno || !pin) return json(400, { error: 'Jméno a PIN jsou povinné.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Uzivatele');
      if (existujici.some((u) => String(u.PIN).trim() === pin)) {
        return json(409, { error: 'Tento PIN už používá jiný uživatel, zvolte jiný.' });
      }

      await appendRow(sheets, spreadsheetId, 'Uzivatele', UZIVATELE_HEADERS, {
        Jmeno: jmeno,
        PIN: pin,
        Firmy: firmy,
        Role: role,
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      if (zmeny.Firmy !== undefined) zmeny.Firmy = normalizujFirmy(zmeny.Firmy);
      if (zmeny.Role !== undefined) zmeny.Role = normalizujRoli(zmeny.Role);
      if (zmeny.Jmeno !== undefined) zmeny.Jmeno = String(zmeny.Jmeno).trim();
      if (zmeny.PIN !== undefined) zmeny.PIN = String(zmeny.PIN).trim();

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Uzivatele');
      const soucasny = rows.find((u) => u._row === row);
      if (!soucasny) return json(404, { error: 'Uživatel nenalezen.' });

      if (zmeny.PIN) {
        const koliduje = rows.some((u) => u._row !== row && String(u.PIN).trim() === zmeny.PIN);
        if (koliduje) return json(409, { error: 'Tento PIN už používá jiný uživatel, zvolte jiný.' });
      }

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Uzivatele', UZIVATELE_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Uzivatele', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
