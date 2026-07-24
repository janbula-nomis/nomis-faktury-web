/**
 * netlify/functions/vydane-faktury-vytezit-polozky.js
 * Zrcadlový protějšek doklady-vytezit-polozky.js, jen pro VYDANÉ (appkou
 * vystavené) faktury. Viz ten soubor pro plné zdůvodnění (proč appka
 * zpětné vytěžení drží samostatně od vydane-faktury-upload-dokoncit.js a
 * proč se nikdy nedotýká hlavičkových polí faktury).
 *
 * POST (Bearer token) { id } (id = Vydane_faktury.ID, faktura musí mít
 * Zdrojovy_soubor_ID - appka faktury vytvořené RUČNĚ přes vydaneFaktury.js
 * POST žádný zdrojový soubor nemá, u těch zpětné vytěžení nedává smysl).
 *
 * Přístup: maPristupKFirme (stejná jako vydaneFaktury.js). Editaci položek
 * appka běžnému uživateli zakazuje u už UHRAZENÉ faktury - admin/účetní
 * mohou vytěžit kdykoli.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { extrahujDataZVydaneFaktury } = require('../../lib/gemini');
const { VYDANE_FAKTURY_POLOZKY_HEADERS } = require('../../lib/vydaneFakturyPolozkySchema');
const { nahradPolozky } = require('../../lib/polozkyHelpers');
const { json } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni' || (uzivatel.firmy || []).includes(firma);
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
    if (!id) return json(400, { error: 'Chybí ID faktury.' });

    const sheets = await getSheetsClient();
    const { rows: faktury } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Vydane_faktury');
    const faktura = faktury.find((r) => r.ID === id);
    if (!faktura) return json(404, { error: 'Faktura nenalezena.' });
    if (!maPristupKFirme(uzivatel, faktura.Firma)) return json(403, { error: 'Nemáte přístup k této faktuře.' });
    if (!jeUcetniNeboAdmin(uzivatel) && faktura.Stav === 'Uhrazeno') {
      return json(403, {
        error: 'Tato faktura už byla uhrazena - zpětné vytěžení položek provede administrátor nebo účetní.',
      });
    }
    if (!faktura.Zdrojovy_soubor_ID) {
      return json(400, { error: 'Faktura nemá přiložený zdrojový soubor k vytěžení.' });
    }

    const drive = await getDriveClient();
    const metadata = await drive.files.get({ fileId: faktura.Zdrojovy_soubor_ID, fields: 'mimeType' });
    const mimeType = metadata.data.mimeType || 'application/octet-stream';
    const obsah = await drive.files.get(
      { fileId: faktura.Zdrojovy_soubor_ID, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(obsah.data);

    const { rows: firmy } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Firmy');
    const extrakce = await extrahujDataZVydaneFaktury(buffer, mimeType, firmy);

    const nove = await nahradPolozky(
      sheets, process.env.SPREADSHEET_ID, 'Vydane_Faktury_Polozky', VYDANE_FAKTURY_POLOZKY_HEADERS,
      'Faktura_ID', id, extrakce.polozky
    );

    return json(200, { ok: true, polozky: nove });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
