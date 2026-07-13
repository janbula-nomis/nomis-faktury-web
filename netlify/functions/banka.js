/**
 * netlify/functions/banka.js
 * Bankovní výpisy a jejich párování s doklady. List "Bankovni_pohyby"
 * v Sheets. Přístup jen pro role "admin" a "ucetni" (běžný uživatel se
 * SPZ/dokladovými právy sem nevidí - jde o citlivější finanční data).
 *
 * GET    ?firma=Nazev             -> { pohyby: [...] }
 * POST   { firma, obsahSouboru, ignorovatNesouladUctu? }
 *          -> naimportuje George Business JSON export (viz lib/bankHelpers.js)
 * PATCH  { id, zmeny: { Doklad_ID?, Stav_parovani?, Poznamka? } }
 *          -> potvrzení/zamítnutí návrhu, ruční přiřazení dokladu,
 *             označení "Bez dokladu", poznámka
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRows, updateRow } = require('../../lib/sheetsHelpers');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { parsujGeorgeExport, jeBezDokladu, navrhniShodu } = require('../../lib/bankHelpers');
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
      if (!telo.obsahSouboru) return json(400, { error: 'Chybí obsah souboru.' });

      let rozpar;
      try {
        rozpar = parsujGeorgeExport(telo.obsahSouboru);
      } catch (e) {
        return json(400, { error: e.message });
      }

      const { rows: firmyRadky } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const firmaRadek = firmyRadky.find((f) => f.Nazev === firma);
      if (!firmaRadek) return json(404, { error: 'Firma "' + firma + '" nebyla nalezena.' });

      const ulozenyUcet = String(firmaRadek.Bankovni_ucet || '').trim();
      let ucetPozn = null;
      if (ulozenyUcet && rozpar.ownerAccountNumber && ulozenyUcet !== rozpar.ownerAccountNumber && !telo.ignorovatNesouladUctu) {
        return json(409, {
          error: 'ucet_nesedi',
          varovani:
            'Vybrali jste firmu "' + firma + '" (uložený účet ' + ulozenyUcet + '), ale tenhle výpis patří ' +
            'k účtu ' + rozpar.ownerAccountNumber + (rozpar.ownerAccountTitle ? ' (' + rozpar.ownerAccountTitle + ')' : '') +
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

      let ucetUlozenNove = false;
      if (!ulozenyUcet && rozpar.ownerAccountNumber) {
        try {
          await updateRow(
            sheets,
            spreadsheetId,
            'Firmy',
            ['Nazev', 'ICO', 'DIC', 'Platce_DPH', 'Bankovni_ucet'],
            firmaRadek._row,
            Object.assign({}, firmaRadek, { Bankovni_ucet: rozpar.ownerAccountNumber })
          );
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
