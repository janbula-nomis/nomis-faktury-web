/**
 * netlify/functions/smlouvy-upload-dokoncit.js
 * POST (Bearer token) { id } (id = ID smlouvy)
 * -> Fáze 2 nahrání smlouvy (viz smlouvy-upload.js pro fázi 1 a stejné
 *    zdůvodnění dvoufázového nahrání jako u Dokladů, v3.9): appka najde
 *    přílohu právě nahranou ve fázi 1, stáhne si soubor zpátky z Drive,
 *    zavolá AI vytěžení (Gemini, lib/gemini.js -> extrahujDataZeSmlouvy) a
 *    přepíše smlouvu z placeholder stavu "Zpracovává se" na hotovou
 *    (Stav: '') s vytaženými údaji.
 *
 * Appka soubor stahuje znovu z Drive (ne z těla požadavku) záměrně - díky
 * tomu jde tuhle fázi kdykoli později zopakovat (tlačítko "Dokončit
 * zpracování" u smlouvy) bez nutnosti znovu cokoliv nahrávat, i kdyby
 * mezitím uživatel zavřel appku/prohlížeč - stejný vzor jako
 * upload-dokoncit.js u Dokladů.
 *
 * Appka NIKDY sama nic nepotvrzuje - vytažené údaje čekají na kontrolu/
 * úpravu v appce (záložka Smlouvy), přesně jako AI odhad u Dokladů.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { extrahujDataZeSmlouvy } = require('../../lib/gemini');
const { SMLOUVY_HEADERS } = require('../../lib/smlouvySchema');
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
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Smlouvy jsou dostupné jen administrátorovi a účetní.' });
  }

  try {
    const { id } = JSON.parse(event.body || '{}');
    if (!id) return json(400, { error: 'Chybí ID smlouvy.' });

    const sheets = await getSheetsClient();
    const { rows: existujiciSmlouvy } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Smlouvy');
    const smlouva = existujiciSmlouvy.find((r) => r.ID === id);
    if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });

    // Placeholder smlouva ještě nemá potvrzenou Firmu, takže klasickou
    // kontrolu přístupu podle firmy nejde použít - dokončit zpracování smí
    // ten, kdo soubor nahrál, nebo admin (stejná logika jako u Dokladů).
    if (uzivatel.role !== 'admin' && smlouva.Nahral_uzivatel !== uzivatel.jmeno) {
      return json(403, { error: 'Nemáte přístup k této smlouvě.' });
    }

    const { rows: prilohyVsechny } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Smlouvy_Prilohy');
    const priloha = prilohyVsechny.find((p) => p.Smlouva_ID === id);
    if (!priloha || !priloha.Zdrojovy_soubor_ID) {
      return json(400, { error: 'Smlouva nemá přiložený soubor ke zpracování.' });
    }

    const drive = await getDriveClient();
    const metadata = await drive.files.get({ fileId: priloha.Zdrojovy_soubor_ID, fields: 'mimeType' });
    const mimeType = metadata.data.mimeType || 'application/octet-stream';
    const obsah = await drive.files.get(
      { fileId: priloha.Zdrojovy_soubor_ID, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(obsah.data);

    const { rows: firmy } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Firmy');
    const extrakce = await extrahujDataZeSmlouvy(buffer, mimeType, firmy);

    const aktualizovana = Object.assign({}, smlouva, {
      Firma: extrakce.firma_odhad || '',
      Nazev: extrakce.nazev || priloha.Nazev_souboru || 'Nová smlouva',
      Druha_strana: extrakce.druha_strana || '',
      Stredisko: extrakce.stredisko_odhad || '',
      Typ: extrakce.typ || '',
      Perioda: extrakce.perioda || '',
      Ocekavana_castka: extrakce.ocekavana_castka || '',
      Mena: extrakce.mena || 'CZK',
      Platnost_od: extrakce.platnost_od || '',
      Platnost_do: extrakce.platnost_do || '',
      Poznamka: extrakce.poznamka_ai || '',
      Stav: '',
    });

    await updateRow(sheets, process.env.SPREADSHEET_ID, 'Smlouvy', SMLOUVY_HEADERS, smlouva._row, aktualizovana);

    return json(200, { ok: true, smlouva: aktualizovana });
  } catch (e) {
    // Zpracování se nepovedlo (typicky Gemini dočasně přetížené) - appka
    // placeholder řádek NEMĚNÍ (zůstává "Zpracovává se", soubor je bezpečně
    // uložený na Drive), ať to jde kdykoli zkusit znovu tlačítkem "Dokončit
    // zpracování" bez nutnosti cokoliv nahrávat znovu.
    return json(500, { error: e.message });
  }
};
