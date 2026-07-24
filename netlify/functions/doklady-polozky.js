/**
 * netlify/functions/doklady-polozky.js
 * GET    ?doklad_id=X          -> { polozky: [...] } (položky konkrétního dokladu, seřazené podle Poradi)
 * POST   { doklad_id, nazev, mnozstvi, cena, sazba_dph } -> přidá NOVOU položku na konec (Poradi = max+1)
 * PATCH  { id, zmeny }         -> upraví existující položku (Nazev/Mnozstvi/Cena/SazbaDPH/Poradi)
 * DELETE ?id=X                 -> smaže položku
 *
 * Appka od v4.27 u Dokladů kromě souhrnné částky eviduje i jednotlivé řádky
 * (viz lib/dokladyPolozkySchema.js - export do Money S3, Jan poslal vzorové
 * XML). Tenhle endpoint slouží k RUČNÍ správě položek (doplnění/oprava/
 * smazání jednotlivého řádku) - hromadné nahrazení VŠECH položek najednou
 * (AI vytěžení, zpětné vytěžení) appka dělá přes lib/polozkyHelpers.js
 * (nahradPolozky), volané z upload-dokoncit.js / doklady-vytezit-polozky.js.
 *
 * Přístup: appka kontroluje přístup přes RODIČOVSKÝ doklad (Doklady.ID ==
 * Doklad_ID), stejná logika jako v doklady.js (maPristupKDokladu) - žádná
 * samostatná firma u položky není, položka firmu/přístup dědí od dokladu.
 * Editace/mazání položek u už SCHVÁLENÉHO dokladu appka omezuje stejně jako
 * editaci samotného dokladu (jen admin/účetní) - položky jsou součást
 * dokladu, ne nezávislý záznam.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { DOKLADY_POLOZKY_HEADERS } = require('../../lib/dokladyPolozkySchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKDokladu(uzivatel, doklad) {
  if (uzivatel.role === 'admin') return true;
  const firma = doklad.Firma_potvrzena || doklad.Firma_AI_odhad;
  return (uzivatel.firmy || []).includes(firma);
}

async function najdiDokladNeboChybu(sheets, spreadsheetId, dokladId) {
  const { rows: doklady } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
  return doklady.find((r) => r.ID === dokladId) || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const dokladId = String((event.queryStringParameters || {}).doklad_id || '').trim();
      if (!dokladId) return json(400, { error: 'Chybí doklad_id.' });

      const doklad = await najdiDokladNeboChybu(sheets, spreadsheetId, dokladId);
      if (!doklad) return json(404, { error: 'Doklad nenalezen.' });
      if (!maPristupKDokladu(uzivatel, doklad)) return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Doklady_Polozky');
      const polozky = rows
        .filter((r) => r.Doklad_ID === dokladId)
        .sort((a, b) => (Number(a.Poradi) || 0) - (Number(b.Poradi) || 0));

      return json(200, { polozky });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const dokladId = String(telo.doklad_id || '').trim();
      if (!dokladId) return json(400, { error: 'Chybí doklad_id.' });

      const doklad = await najdiDokladNeboChybu(sheets, spreadsheetId, dokladId);
      if (!doklad) return json(404, { error: 'Doklad nenalezen.' });
      if (!maPristupKDokladu(uzivatel, doklad)) return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
      if (!jeUcetniNeboAdmin(uzivatel) && doklad.Stav === 'Schváleno') {
        return json(403, { error: 'Tento doklad už byl schválen - položky upravuje administrátor nebo účetní.' });
      }

      const nazev = String(telo.nazev || '').trim();
      if (!nazev) return json(400, { error: 'Vyplňte název položky.' });

      const { rows: stavajici } = await readSheetObjects(sheets, spreadsheetId, 'Doklady_Polozky');
      const polozkyDokladu = stavajici.filter((r) => r.Doklad_ID === dokladId);
      const maxPoradi = polozkyDokladu.reduce((max, r) => Math.max(max, Number(r.Poradi) || 0), 0);

      const radek = {
        ID: crypto.randomUUID(),
        Doklad_ID: dokladId,
        Nazev: nazev,
        Mnozstvi: telo.mnozstvi !== undefined && telo.mnozstvi !== null && telo.mnozstvi !== '' ? telo.mnozstvi : 1,
        Cena: telo.cena !== undefined && telo.cena !== null && telo.cena !== '' ? telo.cena : 0,
        SazbaDPH: telo.sazba_dph !== undefined && telo.sazba_dph !== null ? String(telo.sazba_dph) : '',
        Poradi: maxPoradi + 1,
      };

      await appendRow(sheets, spreadsheetId, 'Doklady_Polozky', DOKLADY_POLOZKY_HEADERS, radek);
      return json(200, { ok: true, polozka: radek });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID položky.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Doklady_Polozky');
      const polozka = rows.find((r) => r.ID === id);
      if (!polozka) return json(404, { error: 'Položka nenalezena.' });

      const doklad = await najdiDokladNeboChybu(sheets, spreadsheetId, polozka.Doklad_ID);
      if (!doklad) return json(404, { error: 'Doklad k položce nenalezen.' });
      if (!maPristupKDokladu(uzivatel, doklad)) return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
      if (!jeUcetniNeboAdmin(uzivatel) && doklad.Stav === 'Schváleno') {
        return json(403, { error: 'Tento doklad už byl schválen - položky upravuje administrátor nebo účetní.' });
      }

      const aktualizovana = Object.assign({}, polozka, zmeny || {});
      await updateRow(sheets, spreadsheetId, 'Doklady_Polozky', DOKLADY_POLOZKY_HEADERS, polozka._row, aktualizovana);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID položky.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Doklady_Polozky');
      const polozka = rows.find((r) => r.ID === id);
      if (!polozka) return json(404, { error: 'Položka nenalezena.' });

      const doklad = await najdiDokladNeboChybu(sheets, spreadsheetId, polozka.Doklad_ID);
      if (!doklad) return json(404, { error: 'Doklad k položce nenalezen.' });
      if (!maPristupKDokladu(uzivatel, doklad)) return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
      if (!jeUcetniNeboAdmin(uzivatel) && doklad.Stav === 'Schváleno') {
        return json(403, { error: 'Tento doklad už byl schválen - položky upravuje administrátor nebo účetní.' });
      }

      await deleteRow(sheets, spreadsheetId, 'Doklady_Polozky', polozka._row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
