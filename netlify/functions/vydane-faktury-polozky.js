/**
 * netlify/functions/vydane-faktury-polozky.js
 * Zrcadlový protějšek doklady-polozky.js, jen pro VYDANÉ (appkou vystavené)
 * faktury (list "Vydane_Faktury_Polozky", vazba přes Faktura_ID). Viz ten
 * soubor pro plné zdůvodnění (proč appka RUČNÍ CRUD drží zvlášť od
 * hromadného nahrazení přes lib/polozkyHelpers.js).
 *
 * GET    ?faktura_id=X          -> { polozky: [...] }
 * POST   { faktura_id, nazev, mnozstvi, cena, sazba_dph } -> nová položka na konec
 * PATCH  { id, zmeny }          -> úprava položky
 * DELETE ?id=X                  -> smazání položky
 *
 * Přístup: appka kontroluje přes RODIČOVSKOU fakturu (Vydane_faktury.ID ==
 * Faktura_ID), stejná logika jako vydaneFaktury.js (maPristupKFirme).
 * Editaci/mazání appka zakazuje běžnému uživateli u už UHRAZENÉ faktury
 * (stejná konvence jako u samotné faktury) - admin/účetní vždy mohou.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { VYDANE_FAKTURY_POLOZKY_HEADERS } = require('../../lib/vydaneFakturyPolozkySchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni' || (uzivatel.firmy || []).includes(firma);
}

async function najdiFakturuNeboChybu(sheets, spreadsheetId, fakturaId) {
  const { rows: faktury } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
  return faktury.find((r) => r.ID === fakturaId) || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const fakturaId = String((event.queryStringParameters || {}).faktura_id || '').trim();
      if (!fakturaId) return json(400, { error: 'Chybí faktura_id.' });

      const faktura = await najdiFakturuNeboChybu(sheets, spreadsheetId, fakturaId);
      if (!faktura) return json(404, { error: 'Faktura nenalezena.' });
      if (!maPristupKFirme(uzivatel, faktura.Firma)) return json(403, { error: 'Nemáte přístup k této faktuře.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_Faktury_Polozky');
      const polozky = rows
        .filter((r) => r.Faktura_ID === fakturaId)
        .sort((a, b) => (Number(a.Poradi) || 0) - (Number(b.Poradi) || 0));

      return json(200, { polozky });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const fakturaId = String(telo.faktura_id || '').trim();
      if (!fakturaId) return json(400, { error: 'Chybí faktura_id.' });

      const faktura = await najdiFakturuNeboChybu(sheets, spreadsheetId, fakturaId);
      if (!faktura) return json(404, { error: 'Faktura nenalezena.' });
      if (!maPristupKFirme(uzivatel, faktura.Firma)) return json(403, { error: 'Nemáte přístup k této faktuře.' });
      if (!jeUcetniNeboAdmin(uzivatel) && faktura.Stav === 'Uhrazeno') {
        return json(403, { error: 'Tato faktura už byla uhrazena - položky upravuje administrátor nebo účetní.' });
      }

      const nazev = String(telo.nazev || '').trim();
      if (!nazev) return json(400, { error: 'Vyplňte název položky.' });

      const { rows: stavajici } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_Faktury_Polozky');
      const polozkyFaktury = stavajici.filter((r) => r.Faktura_ID === fakturaId);
      const maxPoradi = polozkyFaktury.reduce((max, r) => Math.max(max, Number(r.Poradi) || 0), 0);

      const radek = {
        ID: crypto.randomUUID(),
        Faktura_ID: fakturaId,
        Nazev: nazev,
        Mnozstvi: telo.mnozstvi !== undefined && telo.mnozstvi !== null && telo.mnozstvi !== '' ? telo.mnozstvi : 1,
        Cena: telo.cena !== undefined && telo.cena !== null && telo.cena !== '' ? telo.cena : 0,
        SazbaDPH: telo.sazba_dph !== undefined && telo.sazba_dph !== null ? String(telo.sazba_dph) : '',
        Poradi: maxPoradi + 1,
      };

      await appendRow(sheets, spreadsheetId, 'Vydane_Faktury_Polozky', VYDANE_FAKTURY_POLOZKY_HEADERS, radek);
      return json(200, { ok: true, polozka: radek });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID položky.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_Faktury_Polozky');
      const polozka = rows.find((r) => r.ID === id);
      if (!polozka) return json(404, { error: 'Položka nenalezena.' });

      const faktura = await najdiFakturuNeboChybu(sheets, spreadsheetId, polozka.Faktura_ID);
      if (!faktura) return json(404, { error: 'Faktura k položce nenalezena.' });
      if (!maPristupKFirme(uzivatel, faktura.Firma)) return json(403, { error: 'Nemáte přístup k této faktuře.' });
      if (!jeUcetniNeboAdmin(uzivatel) && faktura.Stav === 'Uhrazeno') {
        return json(403, { error: 'Tato faktura už byla uhrazena - položky upravuje administrátor nebo účetní.' });
      }

      const aktualizovana = Object.assign({}, polozka, zmeny || {});
      await updateRow(sheets, spreadsheetId, 'Vydane_Faktury_Polozky', VYDANE_FAKTURY_POLOZKY_HEADERS, polozka._row, aktualizovana);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID položky.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_Faktury_Polozky');
      const polozka = rows.find((r) => r.ID === id);
      if (!polozka) return json(404, { error: 'Položka nenalezena.' });

      const faktura = await najdiFakturuNeboChybu(sheets, spreadsheetId, polozka.Faktura_ID);
      if (!faktura) return json(404, { error: 'Faktura k položce nenalezena.' });
      if (!maPristupKFirme(uzivatel, faktura.Firma)) return json(403, { error: 'Nemáte přístup k této faktuře.' });
      if (!jeUcetniNeboAdmin(uzivatel) && faktura.Stav === 'Uhrazeno') {
        return json(403, { error: 'Tato faktura už byla uhrazena - položky upravuje administrátor nebo účetní.' });
      }

      await deleteRow(sheets, spreadsheetId, 'Vydane_Faktury_Polozky', polozka._row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
