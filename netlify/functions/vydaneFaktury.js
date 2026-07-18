/**
 * netlify/functions/vydaneFaktury.js
 * Evidence vydaných (odchozích) faktur - opak Dokladů (to jsou přijaté
 * faktury/účtenky). List "Vydane_faktury" v Sheets.
 *
 * GET    ?firma=Nazev (nepovinné) -> { faktury: [...] }
 *          bez parametru firma appka vrátí vše, k čemu má uživatel přístup
 * POST   { Firma, Cislo_faktury, Jednotka, Zakaznik, ICO_zakaznika, Datum_vystaveni,
 *          Datum_splatnosti, Castka, Mena, Poznamka } -> nová faktura
 * PATCH  { id, zmeny: { Stav?, Datum_uhrady?, Poznamka?, ... } }
 *          -> typicky označení Uhrazeno/Neuhrazeno, oprava údajů
 *
 * Přístup: role "admin" a "ucetni" vidí a spravují vše, běžný uživatel jen
 * faktury firem ze svého seznamu Firmy (stejný princip jako u Dokladů).
 *
 * Od v3.22: appka nabízí i AI vytěžení faktury ze souboru jako ALTERNATIVU
 * k ručnímu zadání přes tenhle POST - viz netlify/functions/vydane-faktury-
 * upload.js (fáze 1) a vydane-faktury-upload-dokoncit.js (fáze 2), stejný
 * dvoufázový vzor jako u Dokladů/Smluv. Faktura ve stavu "Zpracovává se"
 * (placeholder z fáze 1) appka zobrazuje jen tomu, kdo ji nahrál, nebo
 * adminovi/účetní (ještě nemá potvrzenou Firmu).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { VYDANE_FAKTURY_HEADERS } = require('../../lib/vydaneFakturySchema');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
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

      // Placeholder faktura "Zpracovává se" (od v3.22, AI vytěžení ze
      // souboru) ještě nemá potvrzenou Firmu - appka ji přesto ukáže tomu,
      // kdo ji nahrál (nebo adminovi/účetní), stejná logika jako u
      // placeholder Dokladů/Smluv.
      const viditelnostFaktury = (r) =>
        (r.Firma && maPristupKFirme(uzivatel, r.Firma)) ||
        (!r.Firma && (uzivatel.role === 'admin' || uzivatel.role === 'ucetni' || r.Nahral_uzivatel === uzivatel.jmeno));

      const viditelne = rows.filter(viditelnostFaktury);
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
        Jednotka: String(telo.Jednotka || '').trim(),
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

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID faktury.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
      const faktura = rows.find((r) => r.ID === id);
      if (!faktura) return json(404, { error: 'Faktura nenalezena.' });
      if (!maPristupKFirme(uzivatel, faktura.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      await deleteRow(sheets, spreadsheetId, 'Vydane_faktury', faktura._row);

      // Cascade: bankovní pohyby napárované na smazanou vydanou fakturu appka
      // vrátí do stavu "Bez dokladu" (NE "Nespárováno" - to je konvence pro
      // výdajovou stranu/Doklady a Smlouvy; příjmová strana bez přiřazení
      // faktury je "Bez dokladu", viz banka.js).
      try {
        const { rows: pohyby } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
        const napojenePohyby = pohyby.filter((p) => p.Vydana_faktura_ID === id);
        for (const pohyb of napojenePohyby) {
          const aktualizovany = Object.assign({}, pohyb, { Vydana_faktura_ID: '', Stav_parovani: 'Bez dokladu' });
          await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, aktualizovany);
        }
      } catch (e) {
        // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
        // smazání faktury appka nemá kvůli tomu shodit.
      }

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
