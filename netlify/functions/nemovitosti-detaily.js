/**
 * netlify/functions/nemovitosti-detaily.js
 * Konsolidovaná správa čtyř malých listů, které appka vždy zobrazuje
 * pohromadě u jedné Jednotky (od v4.36, modul Nemovitosti - backlog
 * položka 19): Klíče, Měřidla, Měřidla_Odečty, Revize - viz
 * lib/nemovitostiDetailySchema.js. Appka je záměrně NEDĚLÁ jako čtyři
 * samostatné netlify funkce (byly by skoro identické, jen s jiným názvem
 * listu) - jedna funkce je obsluhuje podle parametru `entita`
 * ('klice' | 'meridla' | 'meridla_odecty' | 'revize').
 *
 * Přístup jen pro role "admin" a "ucetni" (rozhodnuto AskUserQuestion
 * 2026-07-27 - viz claude/nomis-faktury-backlog.md).
 *
 * Klíče/Měřidla/Revize jsou navázané přímo na Stredisko - appka Firmu pro
 * kontrolu přístupu odvozuje přes Nemovitosti_Jednotky (Strediska sama o
 * sobě pole Firma nemají, viz lib/strediskaSchema.js). Měřidla_Odečty jsou
 * navázané na konkrétní Měřidlo (Meridlo_ID) - appka Firmu odvozuje o
 * úroveň hlouběji: Meridlo_ID -> Meridlo.Stredisko -> Jednotka.Firma.
 *
 * GET    ?entita=X&stredisko=Y (nebo &meridlo_id=Y u meridla_odecty)
 *        -> { polozky: [...] } appka vrátí buď všechno viditelné dané roli
 *           (bez stredisko/meridlo_id), nebo jen záznamy jednoho střediska/
 *           měřidla.
 * POST   ?entita=X  { ...pole dané entity } -> založí nový záznam. Appka u
 *           klice/meridla/revize vyžaduje, aby zadané Stredisko mělo
 *           existující Jednotku (jinak neumí odvodit Firmu/přístup), u
 *           meridla_odecty vyžaduje existující Meridlo_ID.
 * PATCH  ?entita=X  { id, zmeny } -> úprava záznamu.
 * DELETE ?entita=X&id=Y -> smazání záznamu.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const {
  KLICE_HEADERS, MERIDLA_HEADERS, MERIDLA_ODECTY_HEADERS, REVIZE_HEADERS,
} = require('../../lib/nemovitostiDetailySchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

const ENTITY_CONFIG = {
  klice: { sheet: 'Klice', headers: KLICE_HEADERS, klicPole: 'Stredisko' },
  meridla: { sheet: 'Meridla', headers: MERIDLA_HEADERS, klicPole: 'Stredisko' },
  meridla_odecty: { sheet: 'Meridla_Odecty', headers: MERIDLA_ODECTY_HEADERS, klicPole: 'Meridlo_ID' },
  revize: { sheet: 'Revize', headers: REVIZE_HEADERS, klicPole: 'Stredisko' },
};

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

async function nactiMapaStrediskoFirma(sheets, spreadsheetId) {
  const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Jednotky');
  const mapa = {};
  rows.forEach((j) => { if (j.Stredisko) mapa[j.Stredisko] = j.Firma; });
  return mapa;
}

// Appka pro daný záznam (řádek Klíčů/Měřidel/Měřidla_Odečty/Revize) zjistí
// Firmu, ke které patří - u meridla_odecty appka musí nejdřív najít
// Stredisko přes Meridlo_ID (o úroveň hlouběji, viz komentář nahoře).
async function zjistiFirmuZaznamu(sheets, spreadsheetId, konfig, radek, mapaStrediskoFirma) {
  if (konfig.klicPole === 'Stredisko') {
    return mapaStrediskoFirma[radek.Stredisko];
  }
  // meridla_odecty
  const { rows: meridlaVsechna } = await readSheetObjects(sheets, spreadsheetId, 'Meridla');
  const meridlo = meridlaVsechna.find((m) => m.ID === radek.Meridlo_ID);
  if (!meridlo) return undefined;
  return mapaStrediskoFirma[meridlo.Stredisko];
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
    return json(403, { error: 'Nemovitosti jsou dostupné jen administrátorovi a účetní.' });
  }

  const qs = event.queryStringParameters || {};
  const entita = String(qs.entita || '').trim();
  const konfig = ENTITY_CONFIG[entita];
  if (!konfig) {
    return json(400, { error: 'Neznámá entita. Očekává se klice, meridla, meridla_odecty nebo revize.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    const mapaStrediskoFirma = await nactiMapaStrediskoFirma(sheets, spreadsheetId);

    if (event.httpMethod === 'GET') {
      const { rows } = await readSheetObjects(sheets, spreadsheetId, konfig.sheet);

      let radky = rows;
      // meridla_odecty appka scopuje podle meridlo_id, ostatní podle stredisko.
      if (konfig.klicPole === 'Meridlo_ID' && qs.meridlo_id) {
        radky = radky.filter((r) => r.Meridlo_ID === qs.meridlo_id);
      } else if (konfig.klicPole === 'Stredisko' && qs.stredisko) {
        radky = radky.filter((r) => r.Stredisko === qs.stredisko);
      }

      const viditelne = [];
      for (const radek of radky) {
        const firma = await zjistiFirmuZaznamu(sheets, spreadsheetId, konfig, radek, mapaStrediskoFirma);
        if (firma && maPristupKFirme(uzivatel, firma)) viditelne.push(radek);
      }

      return json(200, { polozky: viditelne });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');

      let firma;
      if (konfig.klicPole === 'Stredisko') {
        const stredisko = String(telo.Stredisko || '').trim();
        if (!stredisko) return json(400, { error: 'Vyberte středisko.' });
        firma = mapaStrediskoFirma[stredisko];
        if (!firma) return json(400, { error: 'Tohle středisko zatím nemá založenou Jednotku (Nemovitosti).' });
      } else {
        const meridloId = String(telo.Meridlo_ID || '').trim();
        if (!meridloId) return json(400, { error: 'Chybí Meridlo_ID.' });
        const { rows: meridlaVsechna } = await readSheetObjects(sheets, spreadsheetId, 'Meridla');
        const meridlo = meridlaVsechna.find((m) => m.ID === meridloId);
        if (!meridlo) return json(404, { error: 'Měřidlo nenalezeno.' });
        firma = mapaStrediskoFirma[meridlo.Stredisko];
      }
      if (!firma || !maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const zaznam = { ID: crypto.randomUUID() };
      konfig.headers.forEach((h) => {
        if (h === 'ID') return;
        zaznam[h] = telo[h] !== undefined ? String(telo[h]).trim() : '';
      });
      await appendRow(sheets, spreadsheetId, konfig.sheet, konfig.headers, zaznam);

      return json(200, { ok: true, polozka: zaznam });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, konfig.sheet);
      const zaznam = rows.find((r) => r.ID === id);
      if (!zaznam) return json(404, { error: 'Záznam nenalezen.' });

      const firma = await zjistiFirmuZaznamu(sheets, spreadsheetId, konfig, zaznam, mapaStrediskoFirma);
      if (!firma || !maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const upravene = Object.assign({}, zmeny || {});
      delete upravene.ID;
      delete upravene[konfig.klicPole]; // klíčové pole (Stredisko/Meridlo_ID) se needituje

      const aktualizovany = Object.assign({}, zaznam, upravene);
      await updateRow(sheets, spreadsheetId, konfig.sheet, konfig.headers, zaznam._row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = qs.id;
      if (!id) return json(400, { error: 'Chybí ID.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, konfig.sheet);
      const zaznam = rows.find((r) => r.ID === id);
      if (!zaznam) return json(404, { error: 'Záznam nenalezen.' });

      const firma = await zjistiFirmuZaznamu(sheets, spreadsheetId, konfig, zaznam, mapaStrediskoFirma);
      if (!firma || !maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      await deleteRow(sheets, spreadsheetId, konfig.sheet, zaznam._row);

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
