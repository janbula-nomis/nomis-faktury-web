/**
 * netlify/functions/smlouvy-prilohy.js
 * Správa jednotlivých příloh smlouvy (od v3.21, viz lib/smlouvyPrilohySchema.js).
 * Listing příloh appka řeší rovnou v GET /smlouvy (viz smlouvy.js) - tahle
 * funkce slouží jen k odebrání JEDNÉ přílohy, bez zásahu do zbytku smlouvy
 * (cascade smazání VŠECH příloh při smazání celé smlouvy appka řeší přímo
 * v netlify/functions/smlouvy.js, DELETE).
 *
 * DELETE ?id=X (Bearer token, role admin/ucetni) -> smaže jeden řádek
 *   Smlouvy_Prilohy. Appka soubor samotný na Drive neodstraňuje (stejná
 *   konvence jako u smazání Dokladu/Smlouvy).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, deleteRow } = require('../../lib/sheetsHelpers');
const { json } = require('../../lib/http');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Smlouvy jsou dostupné jen administrátorovi a účetní.' });
  }

  if (event.httpMethod !== 'DELETE') return json(405, { error: 'Method not allowed' });

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const id = (event.queryStringParameters || {}).id;
    if (!id) return json(400, { error: 'Chybí ID přílohy.' });

    const { rows: prilohyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy_Prilohy');
    const priloha = prilohyVsechny.find((p) => p.ID === id);
    if (!priloha) return json(404, { error: 'Příloha nenalezena.' });

    const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
    const smlouva = smlouvyVsechny.find((s) => s.ID === priloha.Smlouva_ID);
    if (smlouva && !maPristupKFirme(uzivatel, smlouva.Firma)) {
      return json(403, { error: 'Nemáte přístup k této firmě.' });
    }
    // Pokud appka nadřazenou smlouvu nenajde (osiřelá příloha po nějaké
    // dřívější nekonzistenci), appka smazání povolí adminovi/účetní - lepší
    // umožnit úklid, než osiřelou přílohu navěky nechat viset.

    await deleteRow(sheets, spreadsheetId, 'Smlouvy_Prilohy', priloha._row);

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
