/**
 * netlify/functions/vydane-faktury-upload.js
 * POST (Bearer token) { filename, mimeType, dataBase64 }
 * -> Fáze 1 (rychlá) nahrání VYDANÉ faktury s AI vytěžením (od v3.22, viz
 *    claude/nomis-faktury-backlog.md, položka 5A) - appka nahraje soubor
 *    do Drive (STEJNÁ Inbox složka jako Doklady/Smlouvy) a rovnou založí
 *    nový řádek v listu Vydane_faktury se stavem "Zpracovává se" (zatím bez
 *    vytažených údajů). Fáze 2 (AI extrakce, viz vydane-faktury-upload-
 *    dokoncit.js) frontend zavolá hned poté - stejný dvoufázový vzor a
 *    stejné zdůvodnění (riziko timeoutu appka rozděluje na rychlé bezpečné
 *    uložení + pomalejší AI extrakci) jako u Dokladů (upload.js, v3.9) a
 *    Smluv (smlouvy-upload.js, v3.21).
 *
 * Appka tohle nabízí jako DALŠÍ možnost vedle ručního zadání (viz existující
 * formulář "Přidat vydanou fakturu" v záložce Vydané faktury) - ne náhradu.
 */
const { Readable } = require('stream');
const crypto = require('crypto');
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { appendRow } = require('../../lib/sheetsHelpers');
const { VYDANE_FAKTURY_HEADERS } = require('../../lib/vydaneFakturySchema');
const { json } = require('../../lib/http');

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
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
    const { filename, mimeType, dataBase64 } = JSON.parse(event.body || '{}');
    if (!filename || !mimeType || !dataBase64) {
      return json(400, { error: 'Chybí soubor (filename/mimeType/dataBase64).' });
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 4.5 * 1024 * 1024) {
      return json(413, { error: 'Soubor je moc velký (limit cca 4,5 MB po kompresi).' });
    }

    const drive = await getDriveClient();
    const nahranySoubor = await drive.files.create({
      requestBody: { name: filename, parents: [process.env.INBOX_FOLDER_ID] },
      media: { mimeType, body: bufferToStream(buffer) },
      fields: 'id, webViewLink',
    });

    const sheets = await getSheetsClient();
    const radek = {
      ID: crypto.randomUUID(),
      Firma: '',
      Cislo_faktury: '',
      Jednotka: '',
      Zakaznik: '',
      ICO_zakaznika: '',
      Datum_vystaveni: '',
      Datum_splatnosti: '',
      Castka: '',
      Mena: '',
      Stav: 'Zpracovává se',
      Datum_uhrady: '',
      Poznamka: '',
      Vytvoril: uzivatel.jmeno || '',
      Datum_vytvoreni: new Date().toISOString(),
      Zdrojovy_soubor_URL: nahranySoubor.data.webViewLink || '',
      Zdrojovy_soubor_ID: nahranySoubor.data.id,
      Nahral_uzivatel: uzivatel.jmeno || '',
    };

    await appendRow(sheets, process.env.SPREADSHEET_ID, 'Vydane_faktury', VYDANE_FAKTURY_HEADERS, radek);

    return json(200, { ok: true, faktura: radek });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
