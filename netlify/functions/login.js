/**
 * netlify/functions/login.js
 * POST { pin } -> { token, jmeno, firmy, role }
 * PIN se hledá v listu "Uzivatele" (sloupce: Jmeno, PIN, Firmy, Role).
 * Firmy je čárkou oddělený seznam přesných názvů z listu Firmy.
 * Role "admin" vidí všechny doklady bez ohledu na firmu.
 *
 * Pozn. k bezpečnosti: jde o jednoduché PIN přihlášení pro malý důvěryhodný
 * tým (desítky dokladů měsíčně). Není to náhrada silného ověření identity –
 * pokud by se okruh uživatelů rozšířil nebo šlo o citlivější data, stojí za
 * úvahu přechod na plnohodnotné účty (např. Google OAuth) nebo alespoň
 * hashování PINů a omezení počtu pokusů (rate limiting).
 */
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { signToken } = require('../../lib/auth');
const { json } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { pin } = JSON.parse(event.body || '{}');
    if (!pin) return json(400, { error: 'Chybí PIN.' });

    const sheets = await getSheetsClient();
    const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Uzivatele');

    const uzivatel = rows.find((u) => String(u.PIN).trim() === String(pin).trim());
    if (!uzivatel) return json(401, { error: 'Neplatný PIN.' });

    const firmy = String(uzivatel.Firmy || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const role = uzivatel.Role || 'user';

    const token = signToken({ jmeno: uzivatel.Jmeno, firmy, role }, process.env.SESSION_SECRET);

    return json(200, { token, jmeno: uzivatel.Jmeno, firmy, role });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
