/**
 * netlify/functions/upload-dokoncit.js
 * POST (Bearer token) { id }
 * -> Fáze 2 nahrání dokladu (viz upload.js pro fázi 1 a vysvětlení, proč je
 *    to rozdělené na dvě volání od v3.9): stáhne soubor doklad uložený ve
 *    fázi 1 zpátky z Drive, zavolá AI extrakci (Gemini), zkontroluje
 *    duplicity, dohledá historickou shodu podle dodavatele a přepíše
 *    doklad z placeholder stavu "Zpracovává se" na "Ke kontrole" (nebo
 *    "Možná duplicita") s vytaženými údaji.
 *
 * Appka soubor stahuje znovu z Drive (ne z těla požadavku) záměrně - díky
 * tomu jde tuhle fázi kdykoli později zopakovat (tlačítko "Dokončit
 * zpracování" u dokladu v záložce Doklady) bez nutnosti znovu cokoliv
 * nahrávat, i kdyby mezitím uživatel zavřel appku/prohlížeč.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { extrahujDataZDokladu } = require('../../lib/gemini');
const { isMoznaDuplicita } = require('../../lib/duplicity');
const { najdiHistorickouShodu } = require('../../lib/dokladyHistorie');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
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
    if (!id) return json(400, { error: 'Chybí ID dokladu.' });

    const sheets = await getSheetsClient();
    const { rows: existujiciDoklady } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
    const doklad = existujiciDoklady.find((r) => r.ID === id);
    if (!doklad) return json(404, { error: 'Doklad nenalezen.' });

    // Placeholder řádek ještě nemá potvrzenou/odhadnutou firmu, takže
    // klasickou kontrolu přístupu podle firmy (viz doklady.js) nejde použít
    // - dokončit zpracování smí ten, kdo doklad nahrál, nebo admin.
    if (uzivatel.role !== 'admin' && doklad.Nahral_uzivatel !== uzivatel.jmeno) {
      return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
    }
    if (!doklad.Zdrojovy_soubor_ID) {
      return json(400, { error: 'Doklad nemá přiložený soubor ke zpracování.' });
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

    const duplicita = isMoznaDuplicita(
      existujiciDoklady.filter((r) => r.ID !== id),
      extrakce
    );

    // "Učení ze zkušenosti" - viz stejné zdůvodnění v (dřívějším) upload.js:
    // pokud appka u stejného dodavatele najde dřív RUČNĚ potvrzené doklady,
    // rovnou převezme jejich firmu/kategorii/středisko místo čerstvého AI
    // odhadu.
    const historickaShoda = najdiHistorickouShodu(
      existujiciDoklady.filter((r) => r.ID !== id),
      extrakce.dodavatel,
      extrakce.ico_dodavatele
    );

    const aktualizovany = Object.assign({}, doklad, {
      Typ: extrakce.typ || '',
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
    });

    await updateRow(sheets, process.env.SPREADSHEET_ID, 'Doklady', DOKLADY_HEADERS, doklad._row, aktualizovany);

    return json(200, { ok: true, doklad: aktualizovany });
  } catch (e) {
    // Zpracování se nepovedlo (typicky Gemini dočasně přetížené) - appka
    // placeholder řádek NEMĚNÍ (zůstává "Zpracovává se", soubor je
    // bezpečně uložený na Drive), ať to jde kdykoli zkusit znovu tlačítkem
    // "Dokončit zpracování" bez nutnosti cokoliv nahrávat znovu.
    return json(500, { error: e.message });
  }
};
