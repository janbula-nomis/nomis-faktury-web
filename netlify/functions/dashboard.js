/**
 * netlify/functions/dashboard.js
 * GET (Bearer token) -> souhrny nákladů (podle firmy, kategorie, měsíce)
 * z dokladů viditelných pro přihlášeného uživatele.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  try {
    const sheets = await getSheetsClient();
    const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');

    const viditelne = rows.filter((r) => {
      if (uzivatel.role === 'admin') return true;
      const firma = r.Firma_potvrzena || r.Firma_AI_odhad;
      return uzivatel.firmy.includes(firma);
    });

    const souhrnPodleFirmy = {};
    const souhrnPodleKategorie = {};
    const souhrnPodleMesice = {};

    viditelne.forEach((r) => {
      const firma = r.Firma_potvrzena || r.Firma_AI_odhad || '(nepřiřazeno)';
      const kategorie = r.Kategorie || '(bez kategorie)';
      const mesic = String(r.Datum_dokladu || '').slice(0, 7) || '(bez data)';
      // r.Castka přichází z readSheetObjects (FORMATTED_VALUE) - u částky s
      // haléři se může vrátit v českém formátu s čárkou (např. "2029,91"),
      // na což by obyčejné parseFloat() tiše uřízlo desetiny (vrátilo by 2029)
      // - proto parsujCastkuZListu, ať součty v Přehledu nejsou nepřesné.
      const castka = parsujCastkuZListu(r.Castka);

      souhrnPodleFirmy[firma] = (souhrnPodleFirmy[firma] || 0) + castka;
      souhrnPodleKategorie[kategorie] = (souhrnPodleKategorie[kategorie] || 0) + castka;
      souhrnPodleMesice[mesic] = (souhrnPodleMesice[mesic] || 0) + castka;
    });

    return json(200, {
      pocetDokladu: viditelne.length,
      souhrnPodleFirmy,
      souhrnPodleKategorie,
      souhrnPodleMesice,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
