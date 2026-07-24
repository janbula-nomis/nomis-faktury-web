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
 *
 * Od v3.19: appka se hned po dokončení zpracování (u hlavního dokladu i
 * KAŽDÉHO dalšího z multi-scanu) rovnou pokusí najít odpovídající dosud
 * "Nespárováno" bankovní pohyb stejné firmy - dřív appka párování zkoušela
 * jen při IMPORTU výpisu nebo na ruční tlačítko "Spustit kontrolu dokladů"
 * (banka.js, `prepocitatShody`), takže doklad nahraný AŽ PO importu výpisu
 * zůstával v Bankovních výpisech nesprávně "Nespárováno", dokud si toho
 * někdo nevšiml a nekliknul na kontrolu ručně (viz claude/nomis-faktury-
 * backlog.md, diagnóza z 2026-07-17). Appka najdenou shodu jen NAVRHNE
 * (Stav_parovani = "Navrženo"), stejně jako u ostatních cest párování -
 * pořád čeká na potvrzení účetní, appka nic nepotvrzuje sama.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects, updateRow, appendRows } = require('../../lib/sheetsHelpers');
const { extrahujDataZDokladu } = require('../../lib/gemini');
const { isMoznaDuplicita } = require('../../lib/duplicity');
const { najdiHistorickouShodu } = require('../../lib/dokladyHistorie');
const { navrhniShodu, parsujCastkuZListu } = require('../../lib/bankHelpers');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { DOKLADY_POLOZKY_HEADERS } = require('../../lib/dokladyPolozkySchema');
const { nahradPolozky } = require('../../lib/polozkyHelpers');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

// Zkusí k právě dokončenému dokladu najít odpovídající "Nespárováno"
// bankovní pohyb stejné firmy a navrhnout shodu (viz komentář výš, v3.19).
// Nekritické - pokud cokoli selže (list Bankovni_pohyby neexistuje, appka
// běží bez zapnuté Banky apod.), appka zpracování dokladu kvůli tomu
// nemá shodit, jen návrh přeskočí.
async function zkusAutomatickySparovatSBankou(sheets, spreadsheetId, doklad) {
  try {
    const firma = doklad.Firma_potvrzena || doklad.Firma_AI_odhad;
    if (!firma) return;
    // Doklad hrazený mimo účet (hotově) nemá s bankou co párovat - viz
    // stejná logika u nabídky "vyberte doklad" (v3.18).
    if (String(doklad.Hrazeno_mimo_ucet || '').trim() === 'ANO') return;

    const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
    const nesparovaneFirmy = pohybyVsechny.filter((p) => p.Firma === firma && p.Stav_parovani === 'Nespárováno');
    if (nesparovaneFirmy.length === 0) return;

    // navrhniShodu bere JEDEN pohyb a seznam kandidátních DOKLADŮ - appka
    // tu logiku použije obráceně (jeden nový doklad, víc kandidátních
    // pohybů), ať se chování přesně shoduje s prepocitatShody v banka.js.
    let nejlepsiPohyb = null;
    let nejlepsiSkore = 0;
    nesparovaneFirmy.forEach((pohyb) => {
      const pProNavrh = {
        castka: parsujCastkuZListu(pohyb.Castka),
        protistrana: pohyb.Protistrana || pohyb.Popis || '',
        popis: pohyb.Popis || '',
        variabilni_symbol: pohyb.Variabilni_symbol || '',
        datum: pohyb.Datum || '',
      };
      const navrh = navrhniShodu(pProNavrh, [doklad]);
      if (navrh && navrh.skore >= 2 && navrh.skore > nejlepsiSkore) {
        nejlepsiSkore = navrh.skore;
        nejlepsiPohyb = pohyb;
      }
    });

    if (nejlepsiPohyb) {
      await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, nejlepsiPohyb._row, {
        ...nejlepsiPohyb,
        Doklad_ID: doklad.ID,
        Stav_parovani: 'Navrženo',
      });
    }
  } catch (e) {
    // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
    // dokončení zpracování dokladu se kvůli tomu nemá zastavit.
  }
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
      Sazba_DPH: extrakce.sazba_dph || '',
      Variabilni_symbol: extrakce.variabilni_symbol || '',
      Firma_AI_odhad: extrakce.firma_odhad || '',
      Firma_potvrzena: (historickaShoda && historickaShoda.firma) || '',
      Kategorie: (historickaShoda && historickaShoda.kategorie) || extrakce.kategorie || '',
      Stredisko: (historickaShoda && historickaShoda.stredisko) || extrakce.stredisko_odhad || '',
      SPZ_auta: extrakce.spz_auta || '',
      Mnozstvi_litru: extrakce.mnozstvi_litru || '',
      Druh_paliva: extrakce.druh_paliva || '',
      Stav: duplicita ? 'Možná duplicita' : 'Ke kontrole',
      Poznamka:
        extrakce.poznamka_ai ||
        (historickaShoda
          ? 'Firma/kategorie/středisko doplněny podle ' + historickaShoda.pocetShod +
            ' dřívějšího potvrzeného dokladu od stejného dodavatele - zkontrolujte.'
          : ''),
    });

    await updateRow(sheets, process.env.SPREADSHEET_ID, 'Doklady', DOKLADY_HEADERS, doklad._row, aktualizovany);

    // Od v4.27 (export do Money S3, viz netlify/functions/export-money-
    // s3.js) appka rovnou uloží i položky, které Gemini vytěžila (viz
    // lib/gemini.js, klíč "polozky") - `nahradPolozky` nejdřív smaže
    // případné starší položky téhož dokladu (při čerstvém zpracování
    // placeholderu žádné být nemohou, ale funkce je stejná jako u
    // ZPĚTNÉHO vytěžení, viz doklady-vytezit-polozky.js), pak zapíše nové.
    await nahradPolozky(
      sheets, process.env.SPREADSHEET_ID, 'Doklady_Polozky', DOKLADY_POLOZKY_HEADERS,
      'Doklad_ID', aktualizovany.ID, extrakce.polozky
    );

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
    const polozkyDalsichDokladu = []; // { dokladId, polozky } - viz smyčka po appendRows níže
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
        Sazba_DPH: dalsi.sazba_dph || '',
        Variabilni_symbol: dalsi.variabilni_symbol || '',
        Firma_AI_odhad: dalsi.firma_odhad || '',
        Firma_potvrzena: (historickaShodaDalsi && historickaShodaDalsi.firma) || '',
        Kategorie: (historickaShodaDalsi && historickaShodaDalsi.kategorie) || dalsi.kategorie || '',
        Stredisko: (historickaShodaDalsi && historickaShodaDalsi.stredisko) || dalsi.stredisko_odhad || '',
        SPZ_auta: dalsi.spz_auta || '',
        Mnozstvi_litru: dalsi.mnozstvi_litru || '',
        Druh_paliva: dalsi.druh_paliva || '',
        Stav: duplicitaDalsi ? 'Možná duplicita' : 'Ke kontrole',
        Poznamka: poznamkaFragmenty.join(' '),
        Nahral_uzivatel: aktualizovany.Nahral_uzivatel,
      };

      noveDoklady.push(novyDoklad);
      polozkyDalsichDokladu.push({ dokladId: novyDoklad.ID, polozky: dalsi.polozky });
      znameDoklady = znameDoklady.concat([novyDoklad]);
    });

    if (noveDoklady.length > 0) {
      await appendRows(sheets, process.env.SPREADSHEET_ID, 'Doklady', DOKLADY_HEADERS, noveDoklady);
    }

    // Položky KAŽDÉHO dalšího dokladu z multi-scanu appka uloží stejně jako
    // u hlavního dokladu výš (viz komentář tam) - postupně, ne najednou.
    for (const polozka of polozkyDalsichDokladu) {
      await nahradPolozky(
        sheets, process.env.SPREADSHEET_ID, 'Doklady_Polozky', DOKLADY_POLOZKY_HEADERS,
        'Doklad_ID', polozka.dokladId, polozka.polozky
      );
    }

    // v3.19: appka zkusí rovnou navrhnout spárování s bankou pro hlavní
    // doklad i pro každý další z multi-scanu - postupně (ne najednou), ať
    // appka nemůže omylem navrhnout STEJNÝ bankovní pohyb dvěma různým
    // dokladům z jednoho zpracování (každé volání čte Bankovni_pohyby
    // znovu, takže vidí i změnu z právě předchozího volání).
    await zkusAutomatickySparovatSBankou(sheets, process.env.SPREADSHEET_ID, aktualizovany);
    for (const novy of noveDoklady) {
      await zkusAutomatickySparovatSBankou(sheets, process.env.SPREADSHEET_ID, novy);
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
