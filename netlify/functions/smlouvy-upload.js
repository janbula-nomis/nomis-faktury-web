/**
 * netlify/functions/smlouvy-upload.js
 * POST (Bearer token, role admin/ucetni) { filename, mimeType, dataBase64, smlouva_id? }
 *
 * Nahrání souboru (scan/PDF smlouvy, roční vyúčtování apod.) na Drive a
 * založení odpovídajícího řádku v listu "Smlouvy_Prilohy" (od v3.21 - viz
 * claude/nomis-faktury-backlog.md a Janovo zadání "registr smluv s
 * přílohou"). Appka soubory smlouvy ukládá do STEJNÉ Inbox složky jako
 * doklady (žádná nová Drive složka/env proměnná není potřeba) - rozlišuje
 * je jen to, ze kterého listu Sheets na ně appka odkazuje.
 *
 * Appka rozlišuje dvě situace podle toho, jestli tělo požadavku obsahuje
 * `smlouva_id`:
 *
 * 1) BEZ `smlouva_id` - "Nahrát smlouvu" (nová smlouva, dvoufázově jako
 *    u dokladu, viz upload.js/upload-dokoncit.js): appka rovnou založí i
 *    nový (zatím prázdný) řádek v listu Smlouvy se stavem "Zpracovává se" -
 *    frontend hned poté zavolá smlouvy-upload-dokoncit.js (fáze 2, AI
 *    vytěžení), který ho doplní. Vrací { ok:true, smlouva, priloha }.
 *
 * 2) S `smlouva_id` - "Přidat přílohu" k JIŽ EXISTUJÍCÍ smlouvě (např.
 *    doplnění letošního vyúčtování k už založené smlouvě o nájmu) - appka
 *    jen uloží soubor a přidá řádek do Smlouvy_Prilohy, bez AI (jednofázově -
 *    žádné riziko timeoutu, jde jen o jedno volání Drive API). Vrací
 *    { ok:true, priloha }.
 */
const { Readable } = require('stream');
const crypto = require('crypto');
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects, appendRow } = require('../../lib/sheetsHelpers');
const { SMLOUVY_HEADERS, dalsiPoradiSmlouvy } = require('../../lib/smlouvySchema');
const { SMLOUVY_PRILOHY_HEADERS } = require('../../lib/smlouvyPrilohySchema');
const { json } = require('../../lib/http');

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
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
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Smlouvy jsou dostupné jen administrátorovi a účetní.' });
  }

  try {
    const { filename, mimeType, dataBase64, smlouva_id: smlouvaId } = JSON.parse(event.body || '{}');
    if (!filename || !mimeType || !dataBase64) {
      return json(400, { error: 'Chybí soubor (filename/mimeType/dataBase64).' });
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 4.5 * 1024 * 1024) {
      return json(413, { error: 'Soubor je moc velký (limit cca 4,5 MB po kompresi).' });
    }

    const sheets = await getSheetsClient();

    // Případ 2: přidání přílohy k JIŽ EXISTUJÍCÍ smlouvě - ověřit přístup
    // dřív, než appka cokoli nahraje na Drive.
    let existujiciSmlouva = null;
    if (smlouvaId) {
      const { rows: smlouvyVsechny } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Smlouvy');
      existujiciSmlouva = smlouvyVsechny.find((s) => s.ID === smlouvaId);
      if (!existujiciSmlouva) return json(404, { error: 'Smlouva nenalezena.' });
      if (!maPristupKFirme(uzivatel, existujiciSmlouva.Firma)) {
        return json(403, { error: 'Nemáte přístup k této firmě.' });
      }
    }

    const drive = await getDriveClient();
    const nahranySoubor = await drive.files.create({
      requestBody: { name: filename, parents: [process.env.INBOX_FOLDER_ID] },
      media: { mimeType, body: bufferToStream(buffer) },
      fields: 'id, webViewLink',
    });

    if (smlouvaId) {
      const priloha = {
        ID: crypto.randomUUID(),
        Smlouva_ID: smlouvaId,
        Nazev_souboru: filename,
        Zdrojovy_soubor_URL: nahranySoubor.data.webViewLink || '',
        Zdrojovy_soubor_ID: nahranySoubor.data.id,
        Datum_nahrani: new Date().toISOString(),
        Nahral_uzivatel: uzivatel.jmeno || '',
      };
      await appendRow(sheets, process.env.SPREADSHEET_ID, 'Smlouvy_Prilohy', SMLOUVY_PRILOHY_HEADERS, priloha);
      return json(200, { ok: true, priloha });
    }

    // Případ 1: nová smlouva - placeholder řádek se stavem "Zpracovává se",
    // stejný vzor jako u Dokladů (viz upload.js) - fáze 2 (AI vytěžení)
    // frontend zavolá hned poté (smlouvy-upload-dokoncit.js). Pořadí appka
    // přiděluje hned tady (v4.14) - appka ho appka i placeholderu přidá na
    // konec vlastního pořadí uživatele, ať appka novou smlouvu neukáže
    // uprostřed seznamu ještě před dokončením AI zpracování.
    const { rows: existujiciSmlouvyPoPoradi } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Smlouvy').catch(
      () => ({ rows: [] })
    );
    const smlouva = {
      ID: crypto.randomUUID(),
      Firma: '',
      Nazev: '',
      Stredisko: '',
      Typ: '',
      Perioda: '',
      Ocekavana_castka: '',
      Platnost_od: '',
      Platnost_do: '',
      Zdrojovy_soubor_URL: '',
      Zdrojovy_soubor_ID: '',
      Poznamka: '',
      Aktivni: 'ANO',
      Stav: 'Zpracovává se',
      Nahral_uzivatel: uzivatel.jmeno || '',
      Poradi: String(dalsiPoradiSmlouvy(existujiciSmlouvyPoPoradi)),
    };
    await appendRow(sheets, process.env.SPREADSHEET_ID, 'Smlouvy', SMLOUVY_HEADERS, smlouva);

    const priloha = {
      ID: crypto.randomUUID(),
      Smlouva_ID: smlouva.ID,
      Nazev_souboru: filename,
      Zdrojovy_soubor_URL: nahranySoubor.data.webViewLink || '',
      Zdrojovy_soubor_ID: nahranySoubor.data.id,
      Datum_nahrani: new Date().toISOString(),
      Nahral_uzivatel: uzivatel.jmeno || '',
    };
    await appendRow(sheets, process.env.SPREADSHEET_ID, 'Smlouvy_Prilohy', SMLOUVY_PRILOHY_HEADERS, priloha);

    return json(200, { ok: true, smlouva, priloha });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
