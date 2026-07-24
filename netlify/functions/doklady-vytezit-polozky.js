/**
 * netlify/functions/doklady-vytezit-polozky.js
 * POST (Bearer token) { id } (id = Doklady.ID, doklad musí mít Zdrojovy_soubor_ID)
 * -> ZPĚTNÉ vytěžení položek u už dřív zpracovaného (i schváleného) dokladu:
 *    appka znovu stáhne zdrojový soubor z Drive (Doklady.Zdrojovy_soubor_ID,
 *    appka ho v Drive nikdy nemaže - stejný princip jako fáze 2 nahrání,
 *    viz upload-dokoncit.js), znovu zavolá AI extrakci (lib/gemini.js,
 *    extrahujDataZDokladu) a nahradí položky dokladu v listu Doklady_Polozky
 *    (lib/polozkyHelpers.js, nahradPolozky - staré položky smaže, nové
 *    zapíše, appka je nezdvojí ani při opakovaném vytěžení).
 *
 * Na rozdíl od upload-dokoncit.js appka tímhle NIKDY nemění žádné hlavičkové
 * pole dokladu samotného (Dodavatel/Castka/Kategorie/Firma_potvrzena/Stav/...)
 * - jde čistě o doplnění/aktualizaci položek u dokladu, jehož ostatní údaje
 * uživatel/účetní už zkontroloval/schválil a appka je nesmí přepsat (viz Jan:
 * "můžeme zpětně vytěžit doklady?" - výslovně jen o položky, ne o přepsání
 * hlavičky). Právě proto appka tenhle endpoint drží samostatně od upload-
 * dokoncit.js, i když sdílí většinu kódu (stažení souboru z Drive + Gemini).
 *
 * Přístup: appka kontroluje přístup přes klasickou "maPristupKDokladu"
 * (stejná jako doklady.js), NE přes zvláštní pravidlo pro placeholdery jako
 * upload-dokoncit.js - tenhle endpoint se typicky volá u dokladu, který už
 * MÁ potvrzenou firmu (jinak by "zpětné vytěžení" nedávalo smysl). Editaci
 * položek appka běžnému uživateli zakazuje u už schváleného dokladu (stejně
 * jako u doklady-polozky.js) - admin/účetní mohou vytěžit kdykoli.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { extrahujDataZDokladu } = require('../../lib/gemini');
const { DOKLADY_POLOZKY_HEADERS } = require('../../lib/dokladyPolozkySchema');
const { nahradPolozky } = require('../../lib/polozkyHelpers');
const { json } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKDokladu(uzivatel, doklad) {
  if (uzivatel.role === 'admin') return true;
  const firma = doklad.Firma_potvrzena || doklad.Firma_AI_odhad;
  return (uzivatel.firmy || []).includes(firma);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  try {
    const { id } = JSON.parse(event.body || '{}');
    if (!id) return json(400, { error: 'Chybí ID dokladu.' });

    const sheets = await getSheetsClient();
    const { rows: doklady } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
    const doklad = doklady.find((r) => r.ID === id);
    if (!doklad) return json(404, { error: 'Doklad nenalezen.' });
    if (!maPristupKDokladu(uzivatel, doklad)) return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
    if (!jeUcetniNeboAdmin(uzivatel) && doklad.Stav === 'Schváleno') {
      return json(403, {
        error: 'Tento doklad už byl schválen - zpětné vytěžení položek provede administrátor nebo účetní.',
      });
    }
    if (!doklad.Zdrojovy_soubor_ID) {
      return json(400, { error: 'Doklad nemá přiložený zdrojový soubor k vytěžení.' });
    }

    const drive = await getDriveClient();
    const metadata = await drive.files.get({ fileId: doklad.Zdrojovy_soubor_ID, fields: 'mimeType' });
    const mimeType = metadata.data.mimeType || 'application/octet-stream';
    const obsah = await drive.files.get(
      { fileId: doklad.Zdrojovy_soubor_ID, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(obsah.data);

    const { rows: firmy } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Firmy');
    const extrakce = await extrahujDataZDokladu(buffer, mimeType, firmy);

    const nove = await nahradPolozky(
      sheets, process.env.SPREADSHEET_ID, 'Doklady_Polozky', DOKLADY_POLOZKY_HEADERS,
      'Doklad_ID', id, extrakce.polozky
    );

    return json(200, { ok: true, polozky: nove });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
