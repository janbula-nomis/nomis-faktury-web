/**
 * netlify/functions/upload.js
 * POST (Bearer token) { filename, mimeType, dataBase64 }
 * -> Fáze 1 (rychlá): nahraje soubor do Drive složky Inbox a rovnou zapíše
 *    nový řádek do listu Doklady se stavem "Zpracovává se" (zatím bez
 *    vytažených údajů). Vrací se hned, jakmile je soubor bezpečně uložený.
 *
 * Fáze 2 (pomalá - AI extrakce, kontrola duplicity) běží v samostatné funkci
 * netlify/functions/upload-dokoncit.js, kterou frontend zavolá hned po
 * úspěšné fázi 1 (viz public/app.js, nahratDoklad()).
 *
 * Pozn. proč je to rozdělené na dvě volání (od v3.9): dřív appka dělala
 * všechno (upload na Drive + čtení Firmy + AI extrakce přes až 3 modely +
 * kontrola duplicity + historie + zápis) v jednom synchronním volání -
 * pokud bylo Gemini pomalejší (i jen mírně přetížené), celková doba klidně
 * přesáhla časový limit Netlify funkce/brány a appka místo jasné chyby
 * skončila neprůhledným "Chyba serveru (504)" - a to i když se soubor
 * mezitím v pořádku nahrál na Drive, uživatel to ale nepoznal a musel by
 * fotku/soubor nahrávat celou znovu. Rozdělením na dvě fáze appka:
 *   1) rychle a bezpečně uloží soubor (riziko timeoutu na tomhle kroku je
 *      minimální - jde jen o jedno volání Drive API),
 *   2) až pak zkouší pomalejší AI extrakci - když se to nepovede (Gemini
 *      přetížené), doklad zůstává viditelný v Doklady se stavem
 *      "Zpracovává se" a appka nabídne tlačítko "Dokončit zpracování" pro
 *      opakování bez nutnosti cokoliv nahrávat znovu.
 *
 * Pozn. k velikosti souboru: Netlify Functions mají limit cca 6 MB na
 * tělo požadavku. Base64 přidává ~33 % navíc, takže originální soubor by
 * měl být do cca 4 MB – frontend proto fotky před odesláním zmenšuje
 * (viz public/app.js).
 */
const { Readable } = require('stream');
const crypto = require('crypto');
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { appendRow } = require('../../lib/sheetsHelpers');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
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
      Datum_zpracovani: new Date().toISOString(),
      Typ: '',
      Zdrojovy_soubor_URL: nahranySoubor.data.webViewLink || '',
      Zdrojovy_soubor_ID: nahranySoubor.data.id,
      Dodavatel: '',
      ICO_dodavatele: '',
      Odberatel_text: '',
      Datum_dokladu: '',
      Cislo_dokladu: '',
      Castka: '',
      Mena: '',
      DPH: '',
      Variabilni_symbol: '',
      Firma_AI_odhad: '',
      Firma_potvrzena: '',
      Kategorie: '',
      Stredisko: '',
      SPZ_auta: '',
      Stav: 'Zpracovává se',
      Poznamka: '',
      Nahral_uzivatel: uzivatel.jmeno || '',
    };

    await appendRow(sheets, process.env.SPREADSHEET_ID, 'Doklady', DOKLADY_HEADERS, radek);

    return json(200, { ok: true, doklad: radek });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
