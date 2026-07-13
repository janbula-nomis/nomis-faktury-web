/**
 * netlify/functions/upload.js
 * POST (Bearer token) { filename, mimeType, dataBase64 }
 * -> nahraje soubor do Drive složky Inbox, zavolá AI extrakci (Gemini),
 *    zkontroluje duplicity a zapíše nový řádek do listu Doklady se stavem
 *    "Ke kontrole" (nebo "Možná duplicita").
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
const { readSheetObjects, appendRow } = require('../../lib/sheetsHelpers');
const { extrahujDataZDokladu } = require('../../lib/gemini');
const { isMoznaDuplicita } = require('../../lib/duplicity');
const { najdiHistorickouShodu } = require('../../lib/dokladyHistorie');
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
    const { rows: firmy } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Firmy');
    const extrakce = await extrahujDataZDokladu(buffer, mimeType, firmy);

    const { rows: existujiciDoklady } = await readSheetObjects(
      sheets,
      process.env.SPREADSHEET_ID,
      'Doklady'
    );
    const duplicita = isMoznaDuplicita(existujiciDoklady, extrakce);

    // "Učení ze zkušenosti": pokud appka u stejného dodavatele (podle IČO,
    // jinak podle normalizovaného názvu) najde dřív RUČNĚ potvrzené doklady,
    // rovnou převezme jejich firmu/kategorii/středisko místo čerstvého AI
    // odhadu - viz lib/dokladyHistorie.js pro zdůvodnění, proč jen z
    // potvrzených dokladů, ne z holých AI odhadů.
    const historickaShoda = najdiHistorickouShodu(existujiciDoklady, extrakce.dodavatel, extrakce.ico_dodavatele);

    const radek = {
      ID: crypto.randomUUID(),
      Datum_zpracovani: new Date().toISOString(),
      Typ: extrakce.typ || '',
      Zdrojovy_soubor_URL: nahranySoubor.data.webViewLink || '',
      Zdrojovy_soubor_ID: nahranySoubor.data.id,
      Dodavatel: extrakce.dodavatel || '',
      ICO_dodavatele: extrakce.ico_dodavatele || '',
      Odberatel_text: extrakce.odberatel_text || '',
      Datum_dokladu: extrakce.datum_dokladu || '',
      Cislo_dokladu: extrakce.cislo_dokladu || '',
      Castka: extrakce.castka || '',
      Mena: extrakce.mena || '',
      DPH: extrakce.dph || '',
      Variabilni_symbol: extrakce.variabilni_symbol || '',
      Firma_AI_odhad: extrakce.firma_odhad || '',
      Firma_potvrzena: (historickaShoda && historickaShoda.firma) || '',
      Kategorie: (historickaShoda && historickaShoda.kategorie) || extrakce.kategorie || '',
      Stredisko: (historickaShoda && historickaShoda.stredisko) || extrakce.stredisko_odhad || '',
      SPZ_auta: extrakce.spz_auta || '',
      Stav: duplicita ? 'Možná duplicita' : 'Ke kontrole',
      Poznamka:
        extrakce.poznamka_ai ||
        (historickaShoda
          ? 'Firma/kategorie/středisko doplněny podle ' + historickaShoda.pocetShod +
            ' dřívějšího potvrzeného dokladu od stejného dodavatele - zkontrolujte.'
          : ''),
      Nahral_uzivatel: uzivatel.jmeno || '',
    };

    await appendRow(sheets, process.env.SPREADSHEET_ID, 'Doklady', DOKLADY_HEADERS, radek);

    return json(200, { ok: true, doklad: radek });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
