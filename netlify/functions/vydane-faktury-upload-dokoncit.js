/**
 * netlify/functions/vydane-faktury-upload-dokoncit.js
 * POST (Bearer token) { id } (id = ID vydané faktury)
 * -> Fáze 2 nahrání vydané faktury (viz vydane-faktury-upload.js pro fázi 1
 *    a stejné zdůvodnění dvoufázového nahrání jako u Dokladů/Smluv): appka
 *    najde placeholder fakturu založenou ve fázi 1, stáhne si soubor
 *    zpátky z Drive (ne z těla požadavku - díky tomu jde tuhle fázi kdykoli
 *    později zopakovat tlačítkem "Dokončit zpracování" bez nutnosti znovu
 *    cokoliv nahrávat), zavolá AI vytěžení (Gemini, lib/gemini.js ->
 *    extrahujDataZVydaneFaktury) a přepíše fakturu z placeholder stavu
 *    "Zpracovává se" na "Neuhrazeno" s vytaženými údaji.
 *
 * Appka NIKDY sama nic nepotvrzuje - vytažené údaje čekají na kontrolu/
 * úpravu v appce (záložka Vydané faktury), přesně jako AI odhad u Dokladů/Smluv.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { extrahujDataZVydaneFaktury } = require('../../lib/gemini');
const { isMoznaDuplicitaFaktura } = require('../../lib/duplicity');
const { VYDANE_FAKTURY_HEADERS } = require('../../lib/vydaneFakturySchema');
const { json } = require('../../lib/http');

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
    const { rows: existujiciFaktury } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Vydane_faktury');
    const faktura = existujiciFaktury.find((r) => r.ID === id);
    if (!faktura) return json(404, { error: 'Faktura nenalezena.' });

    // Placeholder faktura ještě nemá potvrzenou Firmu, takže klasickou
    // kontrolu přístupu podle firmy nejde použít - dokončit zpracování smí
    // ten, kdo soubor nahrál, nebo admin/účetní (stejná logika jako u
    // Dokladů/Smluv).
    if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni' && faktura.Nahral_uzivatel !== uzivatel.jmeno) {
      return json(403, { error: 'Nemáte přístup k této faktuře.' });
    }
    if (!faktura.Zdrojovy_soubor_ID) {
      return json(400, { error: 'Faktura nemá přiložený soubor ke zpracování.' });
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

    // (v4.0) Kontrola duplicity - appka do téhle verze u Vydaných faktur
    // vůbec neměla protějšek k isMoznaDuplicita() u Dokladů, takže opakované
    // nahrání/zpracování stejné faktury (např. omylem dvakrát nahraný stejný
    // soubor) tiše založilo druhý identický řádek. Srovnává se proti VŠEM
    // ostatním už zpracovaným fakturám (ne proti sobě samé, ne proti jiným
    // dosud nezpracovaným placeholderům).
    const duplicita = isMoznaDuplicitaFaktura(
      existujiciFaktury.filter((r) => r.ID !== id && r.Stav !== 'Zpracovává se'),
      extrakce
    );

    const aktualizovana = Object.assign({}, faktura, {
      Firma: extrakce.firma_odhad || '',
      Cislo_faktury: extrakce.cislo_faktury || '',
      Jednotka: extrakce.jednotka_odhad || '',
      Zakaznik: extrakce.zakaznik || '',
      ICO_zakaznika: extrakce.ico_zakaznika || '',
      Datum_vystaveni: extrakce.datum_vystaveni || '',
      Datum_splatnosti: extrakce.datum_splatnosti || '',
      Castka: extrakce.castka || '',
      Mena: extrakce.mena || 'CZK',
      Stav: duplicita ? 'Možná duplicita' : 'Neuhrazeno',
      Poznamka: extrakce.poznamka_ai || '',
    });

    await updateRow(sheets, process.env.SPREADSHEET_ID, 'Vydane_faktury', VYDANE_FAKTURY_HEADERS, faktura._row, aktualizovana);

    return json(200, { ok: true, faktura: aktualizovana });
  } catch (e) {
    // Zpracování se nepovedlo (typicky Gemini dočasně přetížené) - appka
    // placeholder řádek NEMĚNÍ (zůstává "Zpracovává se", soubor je bezpečně
    // uložený na Drive), ať to jde kdykoli zkusit znovu tlačítkem "Dokončit
    // zpracování" bez nutnosti cokoliv nahrávat znovu.
    return json(500, { error: e.message });
  }
};
