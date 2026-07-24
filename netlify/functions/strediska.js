/**
 * netlify/functions/strediska.js
 * Správa středisek (od v4.25) - list "Strediska" v Sheets. Dřív bylo
 * středisko natvrdo zadané pole MOZNOSTI_STREDISKA v public/app.js - teď je
 * to samostatný spravovatelný číselník (stejný princip jako Firmy/Auta/Ucty).
 *
 * GET    -> { strediska: [...] }  smí kterýkoli přihlášený uživatel (potřeba
 *           pro výběr střediska v Dokladech/Smlouvách/Bankovních pohybech/
 *           Knize jízd), POST/PATCH/DELETE jen role "admin".
 * POST   { Nazev, Typ } -> nové středisko (Aktivni se vždy nastaví na 'ANO')
 * PATCH  { row, zmeny } -> úprava (Nazev se z bezpečnostních důvodů nemění
 *          přes appku - viz poznámka níže, jen Typ a Aktivni)
 * DELETE ?row=N -> smaže středisko
 *
 * Pozn.: Nazev střediska je použitý jako "klíč" i jinde (Doklady.Stredisko,
 * Smlouvy.Stredisko, Bankovni_pohyby.Stredisko) - appka to nijak automaticky
 * nepřejmenovává na jiných místech. Proto editace názvu existujícího
 * střediska touhle cestou není povolená (jen při vytvoření nového) - zabraňuje
 * to nechtěnému rozjetí vazeb. Místo přejmenování/mazání použitého střediska
 * doporučujeme ho jen deaktivovat (Aktivni = 'NE').
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { STREDISKA_HEADERS } = require('../../lib/strediskaSchema');
const { json } = require('../../lib/http');

function normalizujTyp(hodnota) {
  return hodnota === 'Auto' ? 'Auto' : 'Nemovitost';
}

function normalizujAktivni(hodnota) {
  return hodnota === 'NE' ? 'NE' : 'ANO';
}

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
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Strediska');
      return json(200, { strediska: rows });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const nazev = String(telo.Nazev || '').trim();
      if (!nazev) return json(400, { error: 'Název střediska je povinný.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Strediska');
      if (existujici.some((s) => s.Nazev === nazev)) {
        return json(409, { error: 'Středisko s tímto přesným názvem už existuje.' });
      }

      await appendRow(sheets, spreadsheetId, 'Strediska', STREDISKA_HEADERS, {
        Nazev: nazev,
        Typ: normalizujTyp(telo.Typ),
        Aktivni: 'ANO',
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      delete zmeny.Nazev; // název střediska se přes appku neupravuje, viz komentář nahoře
      if (zmeny.Typ !== undefined) zmeny.Typ = normalizujTyp(zmeny.Typ);
      if (zmeny.Aktivni !== undefined) zmeny.Aktivni = normalizujAktivni(zmeny.Aktivni);

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Strediska');
      const soucasny = rows.find((s) => s._row === row);
      if (!soucasny) return json(404, { error: 'Středisko nenalezeno.' });

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Strediska', STREDISKA_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Strediska', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
