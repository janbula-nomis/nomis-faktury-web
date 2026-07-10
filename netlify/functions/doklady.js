/**
 * netlify/functions/doklady.js
 * GET (Bearer token)   -> seznam dokladů viditelných pro přihlášeného uživatele
 * PATCH (Bearer token) { id, zmeny } -> úprava/schválení konkrétního dokladu
 *   (zmeny je objekt s podmnožinou sloupců k přepsání, typicky
 *    Firma_potvrzena, Kategorie, SPZ_auta, Stav, ...)
 *
 * Přístup: role "admin" vidí vše, ostatní jen doklady, kde Firma_potvrzena
 * (nebo pokud ještě není potvrzená, Firma_AI_odhad) je v jejich seznamu firem.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { json } = require('../../lib/http');

function maPristupKDokladu(uzivatel, doklad) {
  if (uzivatel.role === 'admin') return true;
  const firma = doklad.Firma_potvrzena || doklad.Firma_AI_odhad;
  return uzivatel.firmy.includes(firma);
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

  if (event.httpMethod === 'GET') {
    try {
      const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
      const viditelne = rows.filter((r) => maPristupKDokladu(uzivatel, r));
      return json(200, { doklady: viditelne });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  if (event.httpMethod === 'PATCH') {
    try {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID dokladu.' });

      const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
      const doklad = rows.find((r) => r.ID === id);
      if (!doklad) return json(404, { error: 'Doklad nenalezen.' });
      if (!maPristupKDokladu(uzivatel, doklad)) {
        return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
      }

      const aktualizovany = Object.assign({}, doklad, zmeny || {});
      await updateRow(
        sheets,
        process.env.SPREADSHEET_ID,
        'Doklady',
        DOKLADY_HEADERS,
        doklad._row,
        aktualizovany
      );

      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
