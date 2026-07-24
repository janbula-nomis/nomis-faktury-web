/**
 * netlify/functions/kniha-jizd.js
 * Kniha jízd (backlog, položka 16, zadáno 2026-07-19) - list "Kniha_jizd"
 * v Sheets, evidence JEDNOTLIVÝCH JÍZD (ruční zadání; import CSV z Janova
 * externího zdroje uložených cest zatím appka neumí - čeká na ukázkový
 * soubor, viz claude/nomis-faktury-backlog.md).
 *
 * Přístup: STEJNĚ jako u ostatních firemních dat (Doklady/Auta) - kdokoli
 * s přístupem k dané firmě, BEZ omezení jen na admin/účetní (na rozdíl od
 * Bankovních výpisů/Smluv) - dle Janova rozhodnutí 2026-07-19.
 *
 * GET    ?firma=Nazev  -> { jizdy: [...] } jízd dané firmy
 * GET    (bez firma)   -> { jizdy: [...] } všech jízd viditelných uživateli
 *                         (admin vše, ostatní jen firmy, které mají přiřazené)
 * POST   { Firma, Auto, Ridic?, Datum, Ucel_cesty?, Ujete_km?,
 *          Pocatecni_tachometr?, Konecny_tachometr?, Poznamka? } -> založí
 *          novou jízdu ručně. Pokud Ujete_km není zadáno, ale appka má oba
 *          stavy tachometru, dopočítá si km z jejich rozdílu.
 * PATCH  { id, zmeny } -> úprava libovolných polí jízdy
 * DELETE ?id=X -> smazání jízdy
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { KNIHA_JIZD_HEADERS } = require('../../lib/knihaJizdSchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

function dopocitejKm(telo) {
  if (telo.Ujete_km !== undefined && telo.Ujete_km !== null && String(telo.Ujete_km).trim() !== '') {
    return String(telo.Ujete_km).trim();
  }
  const pocatecni = parseFloat(telo.Pocatecni_tachometr);
  const konecny = parseFloat(telo.Konecny_tachometr);
  if (!isNaN(pocatecni) && !isNaN(konecny) && konecny >= pocatecni) {
    return String(konecny - pocatecni);
  }
  return '';
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
      // Oprava v4.22 - appka firmu z query parametru ořezává stejně jako
      // při zápisu (POST) - viz plné vysvětlení v banka.js.
      const firma = String((event.queryStringParameters || {}).firma || '').trim();
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Kniha_jizd');

      let viditelne;
      if (firma) {
        if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
        viditelne = rows.filter((r) => r.Firma === firma);
      } else {
        viditelne = rows.filter((r) => maPristupKFirme(uzivatel, r.Firma));
      }

      return json(200, { jizdy: viditelne });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.Firma || '').trim();
      const auto = String(telo.Auto || '').trim();
      const datum = String(telo.Datum || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
      if (!auto) return json(400, { error: 'Vyberte auto.' });
      if (!datum) return json(400, { error: 'Datum jízdy je povinné.' });

      const jizda = {
        ID: crypto.randomUUID(),
        Firma: firma,
        Auto: auto,
        Ridic: String(telo.Ridic || '').trim(),
        Datum: datum,
        Ucel_cesty: String(telo.Ucel_cesty || '').trim(),
        Ujete_km: dopocitejKm(telo),
        Pocatecni_tachometr: telo.Pocatecni_tachometr !== undefined ? String(telo.Pocatecni_tachometr).trim() : '',
        Konecny_tachometr: telo.Konecny_tachometr !== undefined ? String(telo.Konecny_tachometr).trim() : '',
        Zdroj: 'Rucne',
        Poznamka: String(telo.Poznamka || '').trim(),
        Vytvoril: uzivatel.jmeno,
        Datum_vytvoreni: new Date().toISOString(),
      };
      await appendRow(sheets, spreadsheetId, 'Kniha_jizd', KNIHA_JIZD_HEADERS, jizda);

      return json(200, { ok: true, jizda });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID jízdy.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Kniha_jizd');
      const jizda = rows.find((r) => r.ID === id);
      if (!jizda) return json(404, { error: 'Jízda nenalezena.' });
      if (!maPristupKFirme(uzivatel, jizda.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const zmenySDopoctem = Object.assign({}, zmeny || {});
      if (zmenySDopoctem.Ujete_km === undefined) {
        const spojene = Object.assign({}, jizda, zmenySDopoctem);
        const dopocitane = dopocitejKm(spojene);
        if (dopocitane && dopocitane !== jizda.Ujete_km) zmenySDopoctem.Ujete_km = dopocitane;
      }

      const aktualizovana = Object.assign({}, jizda, zmenySDopoctem);
      await updateRow(sheets, spreadsheetId, 'Kniha_jizd', KNIHA_JIZD_HEADERS, jizda._row, aktualizovana);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID jízdy.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Kniha_jizd');
      const jizda = rows.find((r) => r.ID === id);
      if (!jizda) return json(404, { error: 'Jízda nenalezena.' });
      if (!maPristupKFirme(uzivatel, jizda.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      await deleteRow(sheets, spreadsheetId, 'Kniha_jizd', jizda._row);

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
