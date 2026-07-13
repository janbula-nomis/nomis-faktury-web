/**
 * netlify/functions/vydaneFaktury.js
 * Evidence vydaných (odchozích) faktur - opak Dokladů (to jsou přijaté
 * faktury/účtenky). List "Vydane_faktury" v Sheets.
 *
 * GET    ?firma=Nazev (nepovinné) -> { faktury: [...] }
 *          bez parametru firma appka vrátí vše, k čemu má uživatel přístup
 * POST   { Firma, Cislo_faktury, Zakaznik, ICO_zakaznika, Datum_vystaveni,
 *          Datum_splatnosti, Castka, Mena, Poznamka } -> nová faktura
 * PATCH  { id, zmeny: { Stav?, Datum_uhrady?, Poznamka?, ... } }
 *          -> typicky označení Uhrazeno/Neuhrazeno, oprava údajů
 *
 * Přístup: role "admin" a "ucetni" vidí a spravují vše, běžný uživatel jen
 * faktury firem ze svého seznamu Firmy (stejný princip jako u Dokladů).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow } = require('../../lib/sheetsHelpers');
const { VYDANE_FAKTURY_HEADERS } = require('../../lib/vydaneFakturySchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni' || (uzivatel.firmy || []).includes(firma);
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
      const firmaFiltr = (event.queryStringParameters || {}).firma;
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
      const viditelne = rows.filter((r) => maPristupKFirme(uzivatel, r.Firma));
      const vysledek = firmaFiltr ? viditelne.filter((r) => r.Firma === firmaFiltr) : viditelne;
      return json(200, { faktury: vysledek });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.Firma || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const cisloFaktury = String(telo.Cislo_faktury || '').trim();
      const zakaznik = String(telo.Zakaznik || '').trim();
      const castka = Number(telo.Castka);
      if (!zakaznik) return json(400, { error: 'Vyplňte zákazníka.' });
      if (!castka || Number.isNaN(castka)) return json(400, { error: 'Vyplňte platnou částku.' });

      const radek = {
        ID: crypto.randomUUID(),
        Firma: firma,
        Cislo_faktury: cisloFaktury,
        Zakaznik: zakaznik,
        ICO_zakaznika: String(telo.ICO_zakaznika || '').trim(),
        Datum_vystaveni: String(telo.Datum_vystaveni || '').trim(),
        Datum_splatnosti: String(telo.Datum_splatnosti || '').trim(),
        Castka: castka,
        Mena: String(telo.Mena || 'CZK').trim() || 'CZK',
        Stav: 'Neuhrazeno',
        Datum_uhrady: '',
        Poznamka: String(telo.Poznamka || '').trim(),
        Vytvoril: uzivatel.jmeno || '',
        Datum_vytvoreni: new Date().toISOString(),
      };

      await appendRow(sheets, spreadsheetId, 'Vydane_faktury', VYDANE_FAKTURY_HEADERS, radek);
      return json(200, { ok: true, faktura: radek });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID faktury.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
      const faktura = rows.find((r) => r.ID === id);
      if (!faktura) return json(404, { error: 'Faktura nenalezena.' });
      if (!maPristupKFirme(uzivatel, faktura.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const aktualizovana = Object.assign({}, faktura, zmeny || {});
      await updateRow(sheets, spreadsheetId, 'Vydane_faktury', VYDANE_FAKTURY_HEADERS, faktura._row, aktualizovana);

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
