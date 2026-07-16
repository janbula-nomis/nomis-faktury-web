/**
 * netlify/functions/banka.js
 * Bankovní výpisy a jejich párování s doklady. List "Bankovni_pohyby"
 * v Sheets. Přístup jen pro role "admin" a "ucetni" (běžný uživatel se
 * SPZ/dokladovými právy sem nevidí - jde o citlivější finanční data).
 *
 * GET    ?firma=Nazev             -> { pohyby: [...] }
 * POST   { firma, obsahSouboru, format?, ignorovatNesouladUctu? }
 *          -> naimportuje výpis. format je "json" (výchozí, George Business
 *             export), "csv" nebo "xlsx" (viz lib/bankImportTabular.js).
 *             U json/csv je obsahSouboru čitelný text, u xlsx base64 (appka
 *             posílá binární obsah souboru zakódovaný jako base64, protože
 *             xlsx není textový formát).
 * POST   { firma, akce: "prepocitatShody" }
 *          -> (od v3.12) appka normálně navrhuje shodu dokladu k pohybu jen
 *             v okamžiku importu výpisu, podle dokladů, které v tu chvíli
 *             existují - pokud doklad k pohybu přibyde (nahraje se) až
 *             POZDĚJI, pohyb zůstane "Nespárováno" navždy, dokud appka
 *             znovu nezkusí porovnat. Tahle akce přepočítá návrhy pro
 *             všechny dosud "Nespárováno" pohyby dané firmy proti aktuálním
 *             dokladům, beze změny už rozhodnutých pohybů (Navrženo/
 *             Potvrzeno/Bez dokladu appka nechává být).
 * PATCH  { id, zmeny: { Doklad_ID?, Stav_parovani?, Poznamka? } }
 *          -> potvrzení/zamítnutí návrhu, ruční přiřazení dokladu,
 *             označení "Bez dokladu", poznámka
 *
 * Firma může mít víc bankovních účtů (od v3.6, viz list "Ucty" a
 * lib/uctySchema.js) - kontrola shody účtu při importu ("ucet_nesedi")
 * hlídá shodu s KTERÝMKOLI známým účtem firmy (Ucty + starší legacy pole
 * Firmy.Bankovni_ucet), ne jen jedním.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, appendRows, updateRow } = require('../../lib/sheetsHelpers');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { UCTY_HEADERS } = require('../../lib/uctySchema');
const { parsujGeorgeExport, jeBezDokladu, navrhniShodu, parsujCastkuZListu } = require('../../lib/bankHelpers');
const { parsujCsvVypis, parsujXlsxVypis } = require('../../lib/bankImportTabular');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Bankovní výpisy jsou dostupné jen administrátorovi a účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const firma = (event.queryStringParameters || {}).firma;
      if (!firma) return json(400, { error: 'Chybí parametr firma.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      const proFirmu = rows.filter((r) => r.Firma === firma);
      return json(200, { pohyby: proFirmu });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.firma || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      if (telo.akce === 'prepocitatShody') {
        const { rows: pohybyVsechnyFirmy } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
        const pohybyFirmy = pohybyVsechnyFirmy.filter((p) => p.Firma === firma);

        const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
        // Doklad appka nesmí navrhnout, pokud už je přiřazený k JAKÉMUKOLI
        // pohybu dané firmy (ne jen k těm právě přepočítávaným) - jinak by
        // mohla stejný doklad nabídnout dvakrát dvěma různým pohybům.
        const jizPouzitaDokladId = new Set(pohybyFirmy.filter((p) => p.Doklad_ID).map((p) => p.Doklad_ID));
        const kandidatiDoklady = dokladyVsechny.filter(
          (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma && !jizPouzitaDokladId.has(d.ID)
        );

        // Appka projde nespárované pohyby od nejstaršího - u víc shodných
        // kandidátů tak dostane přednost ten, který je datem blíž tomu
        // dřívějšímu pohybu.
        const nesparovane = pohybyFirmy
          .filter((p) => p.Stav_parovani === 'Nespárováno')
          .slice()
          .sort((a, b) => String(a.Datum || '').localeCompare(String(b.Datum || '')));

        let noveNavrzeno = 0;
        for (const pohyb of nesparovane) {
          const pProNavrh = {
            castka: parsujCastkuZListu(pohyb.Castka),
            protistrana: pohyb.Protistrana || '',
            popis: pohyb.Popis || '',
            variabilni_symbol: pohyb.Variabilni_symbol || '',
            datum: pohyb.Datum || '',
          };
          const navrh = navrhniShodu(pProNavrh, kandidatiDoklady);
          if (!navrh || navrh.skore < 2) continue;

          await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, {
            ...pohyb,
            Doklad_ID: navrh.dokladId,
            Stav_parovani: 'Navrženo',
          });
          noveNavrzeno += 1;
          // ať appka nenabídne stejný doklad dvakrát dvěma různým pohybům
          // v rámci tohohle jednoho přepočtu
          const idx = kandidatiDoklady.findIndex((d) => d.ID === navrh.dokladId);
          if (idx >= 0) kandidatiDoklady.splice(idx, 1);
        }

        return json(200, {
          ok: true,
          zkontrolovano: nesparovane.length,
          noveNavrzeno,
          zustavaNesparovano: nesparovane.length - noveNavrzeno,
        });
      }

      if (!telo.obsahSouboru) return json(400, { error: 'Chybí obsah souboru.' });

      const format = String(telo.format || 'json').trim().toLowerCase();
      let rozpar;
      try {
        if (format === 'csv') {
          rozpar = parsujCsvVypis(telo.obsahSouboru);
        } else if (format === 'xlsx' || format === 'xls') {
          rozpar = parsujXlsxVypis(telo.obsahSouboru);
        } else {
          rozpar = parsujGeorgeExport(telo.obsahSouboru);
        }
      } catch (e) {
        return json(400, { error: e.message });
      }

      const { rows: firmyRadky } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const firmaRadek = firmyRadky.find((f) => f.Nazev === firma);
      if (!firmaRadek) return json(404, { error: 'Firma "' + firma + '" nebyla nalezena.' });

      // Firma může mít víc účtů (typicky CZK + EUR) - appka kontrolu shody
      // dělá proti MNOŽINĚ všech známých účtů firmy, ne jen jednomu. Zdroj:
      // list Ucty (od v3.6) + starší jedno pole Bankovni_ucet v listu Firmy
      // (appka ho dál čte jako "legacy" jeden účet, nic se nemigruje).
      const { rows: uctyRadky } = await readSheetObjects(sheets, spreadsheetId, 'Ucty');
      const uctyFirmy = uctyRadky.filter((u) => u.Firma === firma);
      const znameUctyFirmy = new Set(
        uctyFirmy.map((u) => String(u.Cislo_uctu || '').trim()).filter(Boolean)
      );
      const legacyUcet = String(firmaRadek.Bankovni_ucet || '').trim();
      if (legacyUcet) znameUctyFirmy.add(legacyUcet);

      if (
        znameUctyFirmy.size > 0 && rozpar.ownerAccountNumber &&
        !znameUctyFirmy.has(rozpar.ownerAccountNumber) && !telo.ignorovatNesouladUctu
      ) {
        return json(409, {
          error: 'ucet_nesedi',
          varovani:
            'Vybrali jste firmu "' + firma + '" (známé účty: ' + Array.from(znameUctyFirmy).join(', ') +
            '), ale tenhle výpis patří k účtu ' + rozpar.ownerAccountNumber +
            (rozpar.ownerAccountTitle ? ' (' + rozpar.ownerAccountTitle + ')' : '') +
            '. Opravdu pokračovat?',
          detekovanyUcet: rozpar.ownerAccountNumber,
          detekovanyNazev: rozpar.ownerAccountTitle,
        });
      }

      const { rows: existujiciPohyby } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      const znameHashe = new Set(existujiciPohyby.map((p) => p.Zdroj_hash));

      const { rows: doklady } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
      const jizPouzitaDokladId = new Set(
        existujiciPohyby.filter((p) => p.Doklad_ID).map((p) => p.Doklad_ID)
      );
      const kandidatiDoklady = doklady.filter(
        (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma && !jizPouzitaDokladId.has(d.ID)
      );

      const datumImportu = new Date().toISOString().slice(0, 10);
      const novePohyby = [];
      let pocetDuplicit = 0;
      let pocetNavrzeno = 0;
      let pocetBezDokladu = 0;
      let pocetNesparovano = 0;

      rozpar.polozky.forEach((p) => {
        if (znameHashe.has(p.hash)) {
          pocetDuplicit += 1;
          return;
        }

        let stav = 'Nespárováno';
        let dokladId = '';

        if (p.castka > 0) {
          stav = 'Bez dokladu';
          pocetBezDokladu += 1;
        } else if (jeBezDokladu(p.typ_pohybu)) {
          stav = 'Bez dokladu';
          pocetBezDokladu += 1;
        } else {
          const navrh = navrhniShodu(p, kandidatiDoklady);
          if (navrh && navrh.skore >= 2) {
            stav = 'Navrženo';
            dokladId = navrh.dokladId;
            pocetNavrzeno += 1;
            // ať appka v rámci jednoho importu nenabídne stejný doklad
            // dvakrát dvěma různým platbám
            const idx = kandidatiDoklady.findIndex((d) => d.ID === dokladId);
            if (idx >= 0) kandidatiDoklady.splice(idx, 1);
          } else {
            pocetNesparovano += 1;
          }
        }

        novePohyby.push({
          ID: crypto.randomUUID(),
          Firma: firma,
          Cislo_uctu_vlastni: rozpar.ownerAccountNumber || '',
          Datum: p.datum,
          Castka: p.castka,
          Mena: p.mena,
          Typ_pohybu: p.typ_pohybu,
          Protistrana: p.protistrana,
          Cislo_uctu_protistrany: p.cislo_uctu_protistrany,
          Variabilni_symbol: p.variabilni_symbol,
          Konstantni_symbol: p.konstantni_symbol,
          Specificky_symbol: p.specificky_symbol,
          Popis: p.popis,
          Doklad_ID: dokladId,
          Stav_parovani: stav,
          Poznamka: '',
          Zdroj_hash: p.hash,
          Datum_importu: datumImportu,
        });
      });

      if (novePohyby.length > 0) {
        await appendRows(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, novePohyby);
      }

      // Pohodlnostní doplnění: pokud appka o firmě zatím NEZNÁ žádný účet
      // (ani Ucty, ani legacy Firmy.Bankovni_ucet) a výpis nesl číslo účtu
      // (George JSON), appka ho rovnou založí jako první řádek v Ucty - ať
      // Jan nemusí po prvním importu nic ručně doplňovat. U dalších účtů
      // firmy (když už první existuje) appka nic sama nezakládá - jen
      // hlídá shodu s tím, co je v Ucty/Firmy, viz "ucet_nesedi" výš.
      let ucetUlozenNove = false;
      if (znameUctyFirmy.size === 0 && rozpar.ownerAccountNumber) {
        try {
          await appendRow(sheets, spreadsheetId, 'Ucty', UCTY_HEADERS, {
            ID: crypto.randomUUID(),
            Firma: firma,
            Cislo_uctu: rozpar.ownerAccountNumber,
            Mena: (rozpar.polozky[0] && rozpar.polozky[0].mena) || 'CZK',
            Popis: rozpar.ownerAccountTitle || '',
          });
          ucetUlozenNove = true;
        } catch (e) {
          // nekritické - jen pohodlnostní doplnění, import samotný už proběhl
        }
      }

      return json(200, {
        ok: true,
        pridano: novePohyby.length,
        duplicitni: pocetDuplicit,
        navrzeno: pocetNavrzeno,
        bezDokladu: pocetBezDokladu,
        nesparovano: pocetNesparovano,
        detekovanyUcet: rozpar.ownerAccountNumber,
        ucetUlozenNove,
      });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID pohybu.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      const pohyb = rows.find((r) => r.ID === id);
      if (!pohyb) return json(404, { error: 'Pohyb nenalezen.' });
      if (!maPristupKFirme(uzivatel, pohyb.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const aktualizovany = Object.assign({}, pohyb, zmeny || {});
      await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, aktualizovany);

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
