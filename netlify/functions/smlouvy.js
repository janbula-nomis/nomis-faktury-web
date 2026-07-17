/**
 * netlify/functions/smlouvy.js
 * Správa Smluv (trvalé příkazy - nájem, elektřina, leasing apod., od v3.19,
 * viz claude/nomis-faktury-backlog.md) - list "Smlouvy" v Sheets.
 *
 * Přístup jen pro role "admin" a "ucetni" - stejné omezení jako u
 * Bankovních výpisů (netlify/functions/banka.js), protože Smlouvy jsou
 * s bankovními pohyby úzce propojené (viz Bankovni_pohyby.Smlouva_ID).
 *
 * GET    ?firma=Nazev  -> { smlouvy: [...], prilohy: [...] } smluv dané
 *                         firmy + jejich přílohy (Smlouvy_Prilohy, od
 *                         v3.21 - viz lib/smlouvyPrilohySchema.js).
 * GET    (bez firma)   -> totéž pro všechny smlouvy viditelné uživateli
 *                         (admin vše, účetní jen firmy, které má přiřazené) -
 *                         používá se v hlavní záložce Smlouvy.
 * POST   { Firma, Nazev, Druha_strana?, Stredisko?, Typ?, Perioda?,
 *          Ocekavana_castka?, Mena?, Platnost_od?, Platnost_do?,
 *          Zdrojovy_soubor_URL?, Poznamka?, Aktivni? } -> založí novou
 *          smlouvu ručně, bez souboru/AI
 *          (Aktivni výchozí "ANO"). Založení PŘES nahraný soubor + AI
 *          vytěžení appka řeší samostatně, viz smlouvy-upload.js a
 *          smlouvy-upload-dokoncit.js.
 * PATCH  { id, zmeny } -> úprava libovolných polí smlouvy
 * DELETE ?id=X -> smazání smlouvy; appka zároveň "odpojí" bankovní pohyby
 *          napojené na smazanou smlouvu (Bankovni_pohyby.Smlouva_ID == id),
 *          vrátí je do stavu "Nespárováno" (stejný vzor jako u smazání
 *          Dokladu, viz netlify/functions/doklady.js), a smaže i všechny
 *          přílohy smlouvy ze Smlouvy_Prilohy (appka soubory samotné na
 *          Drive neodstraňuje, stejná konvence jako u smazání Dokladu).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { SMLOUVY_HEADERS } = require('../../lib/smlouvySchema');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
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
    return json(403, { error: 'Smlouvy jsou dostupné jen administrátorovi a účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const firma = (event.queryStringParameters || {}).firma;
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');

      // Placeholder smlouva "Zpracovává se" ještě nemá potvrzenou Firmu -
      // appka ji přesto appka ukáže tomu, kdo ji nahrál (nebo adminovi),
      // stejná logika jako u placeholder Dokladů (viz doklady.js).
      const viditelnostSmlouvy = (r) =>
        (r.Firma && maPristupKFirme(uzivatel, r.Firma)) ||
        (!r.Firma && (uzivatel.role === 'admin' || r.Nahral_uzivatel === uzivatel.jmeno));

      let viditelne;
      if (firma) {
        if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
        viditelne = rows.filter((r) => r.Firma === firma || (!r.Firma && viditelnostSmlouvy(r)));
      } else {
        viditelne = rows.filter(viditelnostSmlouvy);
      }

      // Přílohy appka vrací rovnou spolu se smlouvami (ne jako samostatný
      // dotaz na smlouvu) - frontend si je seskupí podle Smlouva_ID lokálně,
      // stejný vzor jako u ostatních 1:N vztahů v appce (např. propojený
      // doklad u bankovního pohybu). List Smlouvy_Prilohy nemusí ještě
      // existovat na starší appce bez znovu spuštěného /api/setup.
      let prilohy = [];
      try {
        const viditelnaId = new Set(viditelne.map((r) => r.ID));
        const { rows: prilohyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy_Prilohy');
        prilohy = prilohyVsechny.filter((p) => viditelnaId.has(p.Smlouva_ID));
      } catch (e) {
        // List Smlouvy_Prilohy zatím neexistuje - appka jen vrátí prázdné
        // pole, ať appka nespadne, dokud se znovu nespustí /api/setup.
      }

      return json(200, { smlouvy: viditelne, prilohy });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.Firma || '').trim();
      const nazev = String(telo.Nazev || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
      if (!nazev) return json(400, { error: 'Název smlouvy je povinný.' });

      const smlouva = {
        ID: crypto.randomUUID(),
        Firma: firma,
        Nazev: nazev,
        Druha_strana: String(telo.Druha_strana || '').trim(),
        Stredisko: String(telo.Stredisko || '').trim(),
        Typ: String(telo.Typ || '').trim(),
        Perioda: String(telo.Perioda || '').trim(),
        Ocekavana_castka: telo.Ocekavana_castka !== undefined ? String(telo.Ocekavana_castka).trim() : '',
        Mena: String(telo.Mena || 'CZK').trim() || 'CZK',
        Platnost_od: String(telo.Platnost_od || '').trim(),
        Platnost_do: String(telo.Platnost_do || '').trim(),
        Zdrojovy_soubor_URL: String(telo.Zdrojovy_soubor_URL || '').trim(),
        Zdrojovy_soubor_ID: String(telo.Zdrojovy_soubor_ID || '').trim(),
        Poznamka: String(telo.Poznamka || '').trim(),
        Aktivni: String(telo.Aktivni || 'ANO').trim() || 'ANO',
      };
      await appendRow(sheets, spreadsheetId, 'Smlouvy', SMLOUVY_HEADERS, smlouva);

      return json(200, { ok: true, smlouva });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID smlouvy.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
      const smlouva = rows.find((r) => r.ID === id);
      if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });
      if (!maPristupKFirme(uzivatel, smlouva.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const aktualizovana = Object.assign({}, smlouva, zmeny || {});
      await updateRow(sheets, spreadsheetId, 'Smlouvy', SMLOUVY_HEADERS, smlouva._row, aktualizovana);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID smlouvy.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
      const smlouva = rows.find((r) => r.ID === id);
      if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });
      if (!maPristupKFirme(uzivatel, smlouva.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      await deleteRow(sheets, spreadsheetId, 'Smlouvy', smlouva._row);

      // Cascade: bankovní pohyby napojené na smazanou smlouvu appka vrátí
      // do stavu "Nespárováno", ať v Bankovních výpisech nezůstane pohyb
      // odkazující na smlouvu, která už neexistuje (stejný vzor jako
      // cascade při smazání Dokladu, viz netlify/functions/doklady.js).
      try {
        const { rows: pohyby } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
        const napojenePohyby = pohyby.filter((p) => p.Smlouva_ID === id);
        for (const pohyb of napojenePohyby) {
          const aktualizovany = Object.assign({}, pohyb, { Smlouva_ID: '', Stav_parovani: 'Nespárováno' });
          await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, aktualizovany);
        }
      } catch (e) {
        // List Bankovni_pohyby nemusí existovat - smazání smlouvy se kvůli
        // tomu nemá zastavit.
      }

      // Cascade (od v3.21): appka smaže i všechny přílohy smlouvy ze
      // Smlouvy_Prilohy (soubory samotné appka na Drive neodstraňuje,
      // stejná konvence jako u smazání Dokladu). Maže od NEJVYŠŠÍHO čísla
      // řádku k nejnižšímu, ať mazání jednoho řádku neposune čísla řádků
      // těch, které appka teprve má smazat.
      try {
        const { rows: prilohyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy_Prilohy');
        const prilohyKSmazani = prilohyVsechny
          .filter((p) => p.Smlouva_ID === id)
          .sort((a, b) => b._row - a._row);
        for (const priloha of prilohyKSmazani) {
          await deleteRow(sheets, spreadsheetId, 'Smlouvy_Prilohy', priloha._row);
        }
      } catch (e) {
        // List Smlouvy_Prilohy nemusí existovat (starší appka bez znovu
        // spuštěného /api/setup) - smazání smlouvy se kvůli tomu nemá zastavit.
      }

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
