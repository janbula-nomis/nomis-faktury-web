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
 *
 * Od v3.14: pokud appka na jedné fotce/scanu pozná víc SAMOSTATNÝCH dokladů
 * vedle sebe (běžné, když se vyfotí/naskenuje víc účtenek najednou na jeden
 * list - viz lib/gemini.js, klíč "dalsi_doklady"), první doklad appka
 * zapíše do původního (placeholder) řádku a KAŽDÝ DALŠÍ založí jako nový
 * samostatný řádek se stejným zdrojovým souborem - odpověď pak navíc
 * obsahuje `dalsiDoklady` (pole nově založených dokladů).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects, updateRow, appendRows } = require('../../lib/sheetsHelpers');
const { extrahujDataZDokladu } = require('../../lib/gemini');
const { isMoznaDuplicita } = require('../../lib/duplicity');
const { najdiHistorickouShodu } = require('../../lib/dokladyHistorie');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

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

    // Oprava/novinka v3.14: appka umí poznat, když je na jedné fotce/scanu
    // víc SAMOSTATNÝCH dokladů vedle sebe (běžné, když se vyfotí/naskenuje
    // víc účtenek najednou na jeden list - viz lib/gemini.js, klíč
    // "dalsi_doklady"). První/nejvýraznější doklad appka zpracovala výše
    // (aktualizovala jím placeholder řádek) - každý DALŠÍ appka založí jako
    // nový samostatný řádek se stejným zdrojovým souborem (scan/foto je
    // společné pro všechny), ať jde každý zvlášť zkontrolovat/schválit/
    // kategorizovat. Appka kontroluje duplicity/historii i mezi doklady
    // vytvořenými v RÁMCI TOHOTO JEDNOHO zpracování (ne jen proti už dřív
    // existujícím) - jinak by dva stejné doklady z jednoho scanu mohly
    // obě dvě vypadat jako "nové".
    const dalsiDokladyRaw = Array.isArray(extrakce.dalsi_doklady) ? extrakce.dalsi_doklady : [];
    const noveDoklady = [];
    let znameDoklady = existujiciDoklady.filter((r) => r.ID !== id).concat([aktualizovany]);

    dalsiDokladyRaw.forEach((dalsi) => {
      if (!dalsi || typeof dalsi !== 'object') return;

      const duplicitaDalsi = isMoznaDuplicita(znameDoklady, dalsi);
      const historickaShodaDalsi = najdiHistorickouShodu(znameDoklady, dalsi.dodavatel, dalsi.ico_dodavatele);

      const poznamkaFragmenty = [];
      if (dalsi.poznamka_ai) poznamkaFragmenty.push(dalsi.poznamka_ai);
      poznamkaFragmenty.push('Appka tenhle doklad rozpoznala jako jeden z víc dokladů na společném scanu.');
      if (historickaShodaDalsi) {
        poznamkaFragmenty.push(
          'Firma/kategorie/středisko doplněny podle ' + historickaShodaDalsi.pocetShod +
            ' dřívějšího potvrzeného dokladu od stejného dodavatele - zkontrolujte.'
        );
      }

      const novyDoklad = {
        ID: crypto.randomUUID(),
        Datum_zpracovani: aktualizovany.Datum_zpracovani,
        Typ: dalsi.typ || '',
        Zdrojovy_soubor_URL: aktualizovany.Zdrojovy_soubor_URL,
        Zdrojovy_soubor_ID: aktualizovany.Zdrojovy_soubor_ID,
        Dodavatel: dalsi.dodavatel || '',
        ICO_dodavatele: dalsi.ico_dodavatele || '',
        Odberatel_text: dalsi.odberatel_text || '',
        Datum_dokladu: dalsi.datum_dokladu || '',
        Cislo_dokladu: dalsi.cislo_dokladu || '',
        Castka: dalsi.castka || '',
        Mena: dalsi.mena || '',
        DPH: dalsi.dph || '',
        Variabilni_symbol: dalsi.variabilni_symbol || '',
        Firma_AI_odhad: dalsi.firma_odhad || '',
        Firma_potvrzena: (historickaShodaDalsi && historickaShodaDalsi.firma) || '',
        Kategorie: (historickaShodaDalsi && historickaShodaDalsi.kategorie) || dalsi.kategorie || '',
        Stredisko: (historickaShodaDalsi && historickaShodaDalsi.stredisko) || dalsi.stredisko_odhad || '',
        SPZ_auta: dalsi.spz_auta || '',
        Stav: duplicitaDalsi ? 'Možná duplicita' : 'Ke kontrole',
        Poznamka: poznamkaFragmenty.join(' '),
        Nahral_uzivatel: aktualizovany.Nahral_uzivatel,
      };

      noveDoklady.push(novyDoklad);
      znameDoklady = znameDoklady.concat([novyDoklad]);
    });

    if (noveDoklady.length > 0) {
      await appendRows(sheets, process.env.SPREADSHEET_ID, 'Doklady', DOKLADY_HEADERS, noveDoklady);
    }

    return json(200, { ok: true, doklad: aktualizovany, dalsiDoklady: noveDoklady });
  } catch (e) {
    // Zpracování se nepovedlo (typicky Gemini dočasně přetížené) - appka
    // placeholder řádek NEMĚNÍ (zůstává "Zpracovává se", soubor je
    // bezpečně uložený na Drive), ať to jde kdykoli zkusit znovu tlačítkem
    // "Dokončit zpracování" bez nutnosti cokoliv nahrávat znovu.
    return json(500, { error: e.message });
  }
};
