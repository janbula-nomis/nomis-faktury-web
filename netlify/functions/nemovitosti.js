/**
 * netlify/functions/nemovitosti.js
 * Správa Nemovitostí (od v4.19, viz lib/nemovitostiSchema.js) - list
 * "Nemovitosti" v Sheets. Stejný CRUD vzor jako netlify/functions/
 * kniha-jizd.js/smlouvy.js, bez nahrávání souboru/AI vytěžení - appka tu
 * nemovitost jen ručně eviduje (název, adresa, poznámka).
 *
 * Přístup jen pro role "admin" a "ucetni" - stejné omezení jako u Smluv/
 * Bankovních výpisů (viz lib/nemovitostiSchema.js, komentář v hlavičce).
 *
 * GET    ?firma=Nazev  -> { nemovitosti: [...] } nemovitostí dané firmy
 * GET    (bez firma)   -> { nemovitosti: [...] } všech viditelných uživateli
 * POST   { Firma, Nazev, Adresa?, Poznamka?, Aktivni? } -> založí novou
 *          nemovitost (Aktivni výchozí "ANO"), appka ji přidá na konec
 *          vlastního pořadí (stejně jako u Smluv, viz dalsiPoradiNemovitosti).
 * PATCH  { id, zmeny } -> úprava libovolných polí nemovitosti
 * DELETE ?id=X -> smazání nemovitosti; appka zároveň "odpojí" všechny
 *          Smlouvy napojené na smazanou nemovitost (Smlouvy.Nemovitost_ID
 *          == id), ať v Registru smluv nezůstane smlouva odkazující na
 *          nemovitost, která už neexistuje (stejný vzor jako cascade při
 *          smazání Smlouvy u Bankovních výpisů, viz smlouvy.js).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { NEMOVITOSTI_HEADERS, dalsiPoradiNemovitosti } = require('../../lib/nemovitostiSchema');
const { SMLOUVY_HEADERS } = require('../../lib/smlouvySchema');
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
      const firma = (event.queryStringParameters || {}).firma;
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti');

      let viditelne;
      if (firma) {
        if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
        viditelne = rows.filter((r) => r.Firma === firma);
      } else {
        viditelne = rows.filter((r) => maPristupKFirme(uzivatel, r.Firma));
      }

      return json(200, { nemovitosti: viditelne });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.Firma || '').trim();
      const nazev = String(telo.Nazev || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
      if (!nazev) return json(400, { error: 'Název nemovitosti je povinný.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti');
      const poradi = dalsiPoradiNemovitosti(existujici);

      const nemovitost = {
        ID: crypto.randomUUID(),
        Firma: firma,
        Nazev: nazev,
        Adresa: String(telo.Adresa || '').trim(),
        Poznamka: String(telo.Poznamka || '').trim(),
        Aktivni: String(telo.Aktivni || 'ANO').trim() || 'ANO',
        Poradi: String(poradi),
      };
      await appendRow(sheets, spreadsheetId, 'Nemovitosti', NEMOVITOSTI_HEADERS, nemovitost);

      return json(200, { ok: true, nemovitost });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID nemovitosti.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti');
      const nemovitost = rows.find((r) => r.ID === id);
      if (!nemovitost) return json(404, { error: 'Nemovitost nenalezena.' });
      if (!maPristupKFirme(uzivatel, nemovitost.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const aktualizovana = Object.assign({}, nemovitost, zmeny || {});
      await updateRow(sheets, spreadsheetId, 'Nemovitosti', NEMOVITOSTI_HEADERS, nemovitost._row, aktualizovana);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID nemovitosti.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti');
      const nemovitost = rows.find((r) => r.ID === id);
      if (!nemovitost) return json(404, { error: 'Nemovitost nenalezena.' });
      if (!maPristupKFirme(uzivatel, nemovitost.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      await deleteRow(sheets, spreadsheetId, 'Nemovitosti', nemovitost._row);

      try {
        const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
        const napojeneSmlouvy = smlouvyVsechny.filter((s) => s.Nemovitost_ID === id);
        for (const smlouva of napojeneSmlouvy) {
          const aktualizovana = Object.assign({}, smlouva, { Nemovitost_ID: '' });
          await updateRow(sheets, spreadsheetId, 'Smlouvy', SMLOUVY_HEADERS, smlouva._row, aktualizovana);
        }
      } catch (e) {
        // List Smlouvy nemusí existovat - smazání nemovitosti se kvůli tomu
        // nemá zastavit.
      }

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
