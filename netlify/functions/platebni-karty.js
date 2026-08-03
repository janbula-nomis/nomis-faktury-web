/**
 * netlify/functions/platebni-karty.js
 * Správa platebních karet (od v4.52) - list "Platebni_karty" v Sheets, viz
 * lib/platebniKartySchema.js. Stejný CRUD vzor jako
 * netlify/functions/predkontace.js.
 *
 * Jan (2026-08-03): *"je důležité zavést při vytěžování registraci
 * platebních karet a ty vést v databázi administrace, používat při návrhu
 * přiřazení plateb"*.
 *
 * BEZPEČNOST: appka ukládá jen POSLEDNÍ 4 ČÍSLICE (posledniCtyri ze
 * schématu). Ořezává se to TADY na serveru, ne v prohlížeči - kdyby to
 * dělal jen frontend, stačilo by poslat POST ručně a celé číslo karty by
 * skončilo v tabulce, kterou Jan sdílí s účetní. Tuhle kontrolu neobcházet.
 *
 * GET    -> { karty: [...] } smí kterýkoli přihlášený uživatel (appka
 *           karty potřebuje při návrhu párování a v detailu dokladu).
 *           POST/PATCH/DELETE jen role "admin"/"ucetni".
 * POST   { Cislo_karty, Firma, Ucet, Drzitel, Popis, Stav, Poznamka }
 *           -> nová karta. Duplicitní čtyřčíslí u téže firmy appka odmítne.
 * PATCH  { row, zmeny } -> úprava kteréhokoli pole
 * DELETE ?row=N -> smaže kartu (doklady, které na ni odkazují, zůstanou -
 *           appka u nich jen přestane kartu poznávat)
 *
 * Karty, které appka založila sama při vytěžování dokladu, mají Stav
 * "Doplnit" - zakládá je netlify/functions/upload.js přes
 * lib/platebniKartyHelpers.js, ne tenhle endpoint.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const {
  PLATEBNI_KARTY_HEADERS, STAV_AKTIVNI, STAV_DOPLNIT, posledniCtyri, dalsiIdKarty,
} = require('../../lib/platebniKartySchema');
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
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Platebni_karty');
      // Pojistka i na čtení: kdyby se do tabulky někdy dostalo delší číslo
      // ručním zápisem přímo v Sheets, appka ho ven pošle stejně ořezané.
      const karty = rows.map((k) => Object.assign({}, k, { Cislo_karty: posledniCtyri(k.Cislo_karty) }));
      return json(200, { karty });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const cislo = posledniCtyri(telo.Cislo_karty);
      const firma = String(telo.Firma || '').trim();
      if (!cislo) return json(400, { error: 'Zadejte poslední čtyři číslice karty.' });
      if (!firma) return json(400, { error: 'Firma je povinná.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Platebni_karty');
      if (existujici.some((k) => k.Firma === firma && posledniCtyri(k.Cislo_karty) === cislo)) {
        return json(409, { error: 'Karta s tímhle čtyřčíslím už u té firmy je - upravte ji místo založení nové.' });
      }

      const stav = String(telo.Stav || '').trim() === STAV_DOPLNIT ? STAV_DOPLNIT : STAV_AKTIVNI;

      await appendRow(sheets, spreadsheetId, 'Platebni_karty', PLATEBNI_KARTY_HEADERS, {
        ID: dalsiIdKarty(existujici),
        Cislo_karty: cislo,
        Firma: firma,
        Ucet: String(telo.Ucet || '').trim(),
        Drzitel: String(telo.Drzitel || '').trim(),
        Popis: String(telo.Popis || '').trim(),
        Stav: stav,
        Poznamka: String(telo.Poznamka || '').trim(),
        Datum_zalozeni: new Date().toISOString().slice(0, 10),
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Platebni_karty');
      const soucasna = rows.find((k) => k._row === row);
      if (!soucasna) return json(404, { error: 'Karta nenalezena.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      // ID appka měnit nedovolí - odkazují na něj doklady.
      delete zmeny.ID;
      if (zmeny.Cislo_karty !== undefined) {
        zmeny.Cislo_karty = posledniCtyri(zmeny.Cislo_karty);
        if (!zmeny.Cislo_karty) return json(400, { error: 'Zadejte poslední čtyři číslice karty.' });
      }

      const novaFirma = zmeny.Firma !== undefined ? String(zmeny.Firma).trim() : soucasna.Firma;
      const noveCislo = zmeny.Cislo_karty !== undefined
        ? zmeny.Cislo_karty
        : posledniCtyri(soucasna.Cislo_karty);
      if (zmeny.Firma !== undefined || zmeny.Cislo_karty !== undefined) {
        const koliduje = rows.some(
          (k) => k._row !== row && k.Firma === novaFirma && posledniCtyri(k.Cislo_karty) === noveCislo,
        );
        if (koliduje) return json(409, { error: 'Karta s tímhle čtyřčíslím už u té firmy je.' });
      }

      const aktualizovana = Object.assign({}, soucasna, zmeny);
      await updateRow(sheets, spreadsheetId, 'Platebni_karty', PLATEBNI_KARTY_HEADERS, row, aktualizovana);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Platebni_karty', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
