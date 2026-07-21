/**
 * netlify/functions/firmy.js
 * Správa firem. List "Firmy" v Sheets.
 *
 * GET    -> { firmy: [...] }  smí kterýkoli přihlášený uživatel (potřeba
 *           např. pro výběr firmy v záložce Bankovní výpisy),
 *           POST/PATCH/DELETE jen role "admin".
 *
 * Pozn. (v4.10): GET dřív vracel VŠECHNY firmy komukoli přihlášenému bez
 * ohledu na roli/přiřazené firmy - běžný uživatel tak sice měl doklady/
 * vydané faktury/daňový přehled správně scoped jen na svoje přiřazené
 * firmy (viz `maPristupKFirme`/`maPristupKDokladu` v jednotlivých
 * funkcích), ale ve VÝBĚRU firmy (např. při potvrzení dokladu) viděl a
 * mohl zvolit i firmu, ke které nemá přístup. Appka teď GET odpověď
 * scopuje stejně jako ostatní firemní data - role "admin" vidí vše,
 * ostatní (vč. "ucetni") jen firmy ze svého seznamu `Uzivatele.Firmy`.
 * POST   { Nazev, ICO, DIC, Platce_DPH, Bankovni_ucet } -> nová firma
 * PATCH  { row, zmeny } -> úprava firmy (Nazev se z bezpečnostních důvodů
 *          nemění přes appku - viz poznámka níže, jen ostatní pole)
 * DELETE ?row=N -> smaže firmu
 *
 * Pozn.: Název firmy je použitý jako "klíč" i jinde (Doklady.Firma_potvrzena,
 * Uzivatele.Firmy) - appka to nijak automaticky nepřejmenovává na jiných
 * místech. Proto editace názvu existující firmy touhle cestou není povolená
 * (jen při vytvoření nové firmy) - zabraňuje to nechtěnému rozjetí vazeb.
 *
 * Pozn. k Bankovni_ucet: číslo účtu (tvar "prefix-cislo/kod" nebo jen
 * "cislo/kod") slouží k tomu, aby appka při importu bankovního výpisu
 * (viz netlify/functions/banka.js) mohla upozornit, pokud si uživatel
 * vybral firmu, která neodpovídá účtu ve skutečném výpisu.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { json } = require('../../lib/http');

const FIRMY_HEADERS = ['Nazev', 'ICO', 'DIC', 'Platce_DPH', 'Bankovni_ucet'];

function normalizujPlatceDph(hodnota) {
  return hodnota === 'ANO' ? 'ANO' : 'NE';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (event.httpMethod !== 'GET' && uzivatel.role !== 'admin') {
    return json(403, { error: 'Tuto akci může provést jen administrátor.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const viditelne = uzivatel.role === 'admin'
        ? rows
        : rows.filter((f) => (uzivatel.firmy || []).includes(f.Nazev));
      return json(200, { firmy: viditelne });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const nazev = String(telo.Nazev || '').trim();
      if (!nazev) return json(400, { error: 'Název firmy je povinný.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      if (existujici.some((f) => f.Nazev === nazev)) {
        return json(409, { error: 'Firma s tímto přesným názvem už existuje.' });
      }

      await appendRow(sheets, spreadsheetId, 'Firmy', FIRMY_HEADERS, {
        Nazev: nazev,
        ICO: String(telo.ICO || '').trim(),
        DIC: String(telo.DIC || '').trim(),
        Platce_DPH: normalizujPlatceDph(telo.Platce_DPH),
        Bankovni_ucet: String(telo.Bankovni_ucet || '').trim(),
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      delete zmeny.Nazev; // název firmy se přes appku neupravuje, viz komentář nahoře
      if (zmeny.Platce_DPH !== undefined) zmeny.Platce_DPH = normalizujPlatceDph(zmeny.Platce_DPH);
      if (zmeny.ICO !== undefined) zmeny.ICO = String(zmeny.ICO).trim();
      if (zmeny.DIC !== undefined) zmeny.DIC = String(zmeny.DIC).trim();
      if (zmeny.Bankovni_ucet !== undefined) zmeny.Bankovni_ucet = String(zmeny.Bankovni_ucet).trim();

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const soucasny = rows.find((f) => f._row === row);
      if (!soucasny) return json(404, { error: 'Firma nenalezena.' });

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Firmy', FIRMY_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Firmy', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
