/**
 * netlify/functions/predkontace.js
 * Správa předkontací (od v4.32) - list "Predkontace" v Sheets, viz
 * lib/predkontaceSchema.js pro plné zdůvodnění. Stejný CRUD vzor jako
 * netlify/functions/strediska.js.
 *
 * GET    -> { predkontace: [...] } smí kterýkoli přihlášený uživatel (appka
 *           mapu Firma+Kategorie -> Kod potřebuje i při GET náhledu exportu),
 *           POST/PATCH/DELETE jen role "admin"/"ucetni" (jde o účetní
 *           nastavení, stejné omezení jako export-money-s3.js).
 * POST   { Firma, Kategorie, Kod } -> nový řádek (appka odmítne duplicitní
 *           kombinaci Firma+Kategorie - má jich mít nejvýš jednu, jinak by
 *           export nevěděl, kterou použít)
 * PATCH  { row, zmeny } -> úprava kteréhokoli pole
 * DELETE ?row=N -> smaže řádek (kombinace zůstane bez kódu - appka export
 *           posílá prázdný PredKontac, stejně jako když řádek nikdy nebyl)
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { PREDKONTACE_HEADERS } = require('../../lib/predkontaceSchema');
const { json } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (event.httpMethod !== 'GET' && !jeUcetniNeboAdmin(uzivatel)) {
    return json(403, { error: 'Tuto akci může provést jen administrátor nebo účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Predkontace');
      return json(200, { predkontace: rows });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.Firma || '').trim();
      const kategorie = String(telo.Kategorie || '').trim();
      const kod = String(telo.Kod || '').trim();
      if (!firma) return json(400, { error: 'Firma je povinná.' });
      if (!kategorie) return json(400, { error: 'Kategorie je povinná.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Predkontace');
      if (existujici.some((p) => p.Firma === firma && p.Kategorie === kategorie)) {
        return json(409, { error: 'Pro tuhle firmu a kategorii už předkontace existuje - upravte ji místo založení nové.' });
      }

      await appendRow(sheets, spreadsheetId, 'Predkontace', PREDKONTACE_HEADERS, {
        Firma: firma,
        Kategorie: kategorie,
        Kod: kod,
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Predkontace');
      const soucasny = rows.find((p) => p._row === row);
      if (!soucasny) return json(404, { error: 'Předkontace nenalezena.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      const novaFirma = zmeny.Firma !== undefined ? String(zmeny.Firma).trim() : soucasny.Firma;
      const novaKategorie = zmeny.Kategorie !== undefined ? String(zmeny.Kategorie).trim() : soucasny.Kategorie;
      if ((zmeny.Firma !== undefined || zmeny.Kategorie !== undefined)) {
        const koliduje = rows.some((p) => p._row !== row && p.Firma === novaFirma && p.Kategorie === novaKategorie);
        if (koliduje) {
          return json(409, { error: 'Pro tuhle firmu a kategorii už předkontace existuje.' });
        }
      }

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Predkontace', PREDKONTACE_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Predkontace', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
