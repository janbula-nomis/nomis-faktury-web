/**
 * netlify/functions/kontrola-najmu.js
 * Kontrola přiřazení přijatých nájemních plateb ke smlouvám (od v4.58).
 *
 * Jan 2026-08-08: *"můžeš systémově zkontrolovat přijaté platby za nájmy ke
 * smlouvám a upravit jejich přiřazení?"*
 *
 * Funkce je ČISTĚ ČTECÍ - nic nezapisuje ani nenavrhuje do tabulky. Vrátí
 * seznam nálezů a u části z nich návrh opravy; opravu provede až člověk
 * klepnutím v appce, které pošle běžný PATCH na /api/banka (přehození
 * platby na jinou smlouvu) nebo /api/smlouvy (doplnění nájemní jednotky).
 * **Nedodělávat sem zápis** - celá appka stojí na tom, že navrhne a člověk
 * potvrdí, a hromadné přepsání přiřazení plateb je přesně ta operace, kde
 * by se to nejvíc vymstilo.
 *
 * Vlastní logika je v lib/kontrolaNajmu.js (čistý výpočet, testovatelný
 * bez Googlu). Tady je jen načtení dat a omezení na firmy uživatele.
 *
 * GET ?rok=RRRR[&firma=Nazev]
 *   -> { rok, nalezy: [ … ], prehled: { … } }
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { zkontrolujNajmy } = require('../../lib/kontrolaNajmu');
const { json } = require('../../lib/http');

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
  // Stejné omezení jako u zbytku Nemovitostí (rozhodnuto 2026-07-27).
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Nemovitosti jsou dostupné jen administrátorovi a účetní.' });
  }
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const qs = event.queryStringParameters || {};
  const rok = String(qs.rok || '').trim();
  if (!/^\d{4}$/.test(rok)) return json(400, { error: 'Zadejte rok ve tvaru RRRR.' });

  const firma = String(qs.firma || '').trim();
  if (firma && !maPristupKFirme(uzivatel, firma)) {
    return json(403, { error: 'Nemáte přístup k této firmě.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    const [{ rows: smlouvyVsechny }, { rows: pohybyVsechny }, najemniData] = await Promise.all([
      readSheetObjects(sheets, spreadsheetId, 'Smlouvy'),
      readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby'),
      // List vzniká až po /api/setup z v4.57 - bez něj se kontrola musí
      // spustit taky, jen kontrola "bez-jednotky" nic nenajde.
      readSheetObjects(sheets, spreadsheetId, 'Najemni_jednotky').catch(() => ({ rows: [] })),
    ]);

    // Omezení na firmy uživatele. Nepřístupné řádky se tiše vynechají -
    // stejná konvence jako u seznamů jinde v appce (viz §3 API dokumentu).
    const smlouvy = (smlouvyVsechny || [])
      .filter((s) => maPristupKFirme(uzivatel, s.Firma))
      .filter((s) => !firma || s.Firma === firma);
    const viditelneSmlouvyIds = new Set(smlouvy.map((s) => s.ID));
    const pohyby = (pohybyVsechny || [])
      .filter((p) => maPristupKFirme(uzivatel, p.Firma))
      // Pohyb bez viditelné smlouvy by se stejně nedal vyhodnotit a jen by
      // rozšířil, co funkce čte.
      .filter((p) => !p.Smlouva_ID || viditelneSmlouvyIds.has(p.Smlouva_ID));

    // Nájemní jednotky se scopují přes středisko smluv, které uživatel vidí.
    const viditelnaStrediska = new Set(smlouvy.map((s) => s.Stredisko).filter(Boolean));
    const najemniJednotky = (najemniData.rows || []).filter((n) => viditelnaStrediska.has(n.Stredisko));

    const vysledek = zkontrolujNajmy({ pohyby, smlouvy, najemniJednotky, rok });
    return json(200, vysledek);
  } catch (e) {
    return json(500, { error: e.message });
  }
};
