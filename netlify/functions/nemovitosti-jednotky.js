/**
 * netlify/functions/nemovitosti-jednotky.js
 * Správa Jednotek (od v4.36, modul Nemovitosti - backlog položka 19) - list
 * "Nemovitosti_Jednotky" v Sheets. Jednotka je DOPLŇKOVÝ, bohatší záznam
 * navázaný na existující středisko (viz lib/nemovitostiJednotkySchema.js) -
 * appka NENÍ novou konkurenční entitou nahrazující středisko, veškerá
 * účetní logika (Doklady/Smlouvy/Bankovní pohyby/Dashboard) zůstává
 * navázaná na Stredisko beze změny.
 *
 * Přístup jen pro role "admin" a "ucetni" (rozhodnuto AskUserQuestion
 * 2026-07-27 - viz claude/nomis-faktury-backlog.md) - stejné omezení jako
 * u Smluv (netlify/functions/smlouvy.js), který appka používá jako
 * vzor pro tenhle soubor.
 *
 * GET    ?firma=Nazev  -> { jednotky: [...] } jednotek dané firmy.
 * GET    (bez firma)   -> totéž pro všechny jednotky viditelné uživateli
 *                         (admin vše, účetní jen firmy, které má přiřazené).
 * POST   { Firma, Stredisko, Adresa?, Katastralni_uzemi?, Cislo_LV?,
 *          Plocha_m2?, Dispozice?, Podlazi?, Poznamka? } -> založí novou
 *          jednotku. Appka nedovolí dvě jednotky na STEJNÉ středisko
 *          (1 středisko typu Nemovitost = max. 1 jednotka).
 * PATCH  { id, zmeny } -> úprava jednotky (Stredisko appka needituje -
 *          klíč pro odvození Firmy u Klíčů/Měřidel/Revize, stejná
 *          konvence jako Firmy.Nazev/Strediska.Nazev).
 * DELETE ?id=X -> smazání jednotky (appka NEMAŽE navázané Klíče/Měřidla/
 *          Revize - ty zůstávají u střediska dál, appka je jen přestane
 *          zobrazovat pod jednotkou, dokud se nezaloží nová se stejným
 *          střediskem; historická data appka nikdy nemaže automaticky).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { NEMOVITOSTI_JEDNOTKY_HEADERS } = require('../../lib/nemovitostiJednotkySchema');
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
    return json(403, { error: 'Nemovitosti jsou dostupné jen administrátorovi a účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const firma = String((event.queryStringParameters || {}).firma || '').trim();
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Jednotky');

      let viditelne;
      if (firma) {
        if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
        viditelne = rows.filter((r) => r.Firma === firma);
      } else {
        viditelne = rows.filter((r) => maPristupKFirme(uzivatel, r.Firma));
      }

      return json(200, { jednotky: viditelne });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.Firma || '').trim();
      const stredisko = String(telo.Stredisko || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
      if (!stredisko) return json(400, { error: 'Vyberte středisko.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Jednotky');
      if (existujici.some((j) => j.Stredisko === stredisko)) {
        return json(409, { error: 'Tohle středisko už má založenou jednotku.' });
      }

      const jednotka = {
        ID: crypto.randomUUID(),
        Firma: firma,
        Stredisko: stredisko,
        // (v4.57) Nazev je nepovinný - když ho Jan nevyplní, appka jednotku
        // popíše Střediskem jako před v4.57 (viz schéma).
        Nazev: String(telo.Nazev || '').trim(),
        Adresa: String(telo.Adresa || '').trim(),
        Katastralni_uzemi: String(telo.Katastralni_uzemi || '').trim(),
        Cislo_LV: String(telo.Cislo_LV || '').trim(),
        Plocha_m2: telo.Plocha_m2 !== undefined ? String(telo.Plocha_m2).trim() : '',
        Dispozice: String(telo.Dispozice || '').trim(),
        Podlazi: String(telo.Podlazi || '').trim(),
        // (v4.57) WiFi heslo se ukládá ČITELNĚ - rozbor proč je v hlavičce
        // lib/nemovitostiJednotkySchema.js. Sem nepatří nic citlivějšího.
        Wifi_sit: String(telo.Wifi_sit || '').trim(),
        Wifi_heslo: String(telo.Wifi_heslo || '').trim(),
        Poznamka: String(telo.Poznamka || '').trim(),
      };
      await appendRow(sheets, spreadsheetId, 'Nemovitosti_Jednotky', NEMOVITOSTI_JEDNOTKY_HEADERS, jednotka);

      return json(200, { ok: true, jednotka });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID jednotky.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Jednotky');
      const jednotka = rows.find((r) => r.ID === id);
      if (!jednotka) return json(404, { error: 'Jednotka nenalezena.' });
      if (!maPristupKFirme(uzivatel, jednotka.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const upravene = Object.assign({}, zmeny || {});
      delete upravene.Stredisko; // klíč pro Klíče/Měřidla/Revize se needituje, viz komentář nahoře
      delete upravene.ID;

      const aktualizovana = Object.assign({}, jednotka, upravene);
      await updateRow(sheets, spreadsheetId, 'Nemovitosti_Jednotky', NEMOVITOSTI_JEDNOTKY_HEADERS, jednotka._row, aktualizovana);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID jednotky.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Jednotky');
      const jednotka = rows.find((r) => r.ID === id);
      if (!jednotka) return json(404, { error: 'Jednotka nenalezena.' });
      if (!maPristupKFirme(uzivatel, jednotka.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      await deleteRow(sheets, spreadsheetId, 'Nemovitosti_Jednotky', jednotka._row);

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
