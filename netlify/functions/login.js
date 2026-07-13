/**
 * netlify/functions/login.js
 * GET  -> { jmena: [...] }              veřejný seznam jmen pro rozbalovací
 *                                        seznam na přihlašovací obrazovce
 *                                        (záměrně BEZ PIN/firem/role).
 * POST { jmeno, pin } -> { token, jmeno, firmy, role }
 * Jméno+PIN se hledá v listu "Uzivatele" (sloupce: Jmeno, PIN, Firmy, Role) -
 * musí sedět obojí zároveň (jméno se porovnává bez ohledu na velikost
 * písmen). Firmy je čárkou oddělený seznam přesných názvů z listu Firmy.
 * Role "admin" vidí všechny doklady bez ohledu na firmu.
 *
 * Pozn. k bezpečnosti: jde o jednoduché PIN přihlášení pro malý důvěryhodný
 * tým (desítky dokladů měsíčně). Není to náhrada silného ověření identity –
 * pokud by se okruh uživatelů rozšířil nebo šlo o citlivější data, stojí za
 * úvahu přechod na plnohodnotné účty (např. Google OAuth) nebo alespoň
 * hashování PINů a omezení počtu pokusů (rate limiting). Chybová hláška při
 * neúspěchu záměrně neříká, jestli bylo špatně jméno nebo PIN.
 */
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { signToken } = require('../../lib/auth');
const { json } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  if (event.httpMethod === 'GET') {
    try {
      const sheets = await getSheetsClient();
      const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Uzivatele');
      const jmena = rows
        .map((u) => String(u.Jmeno || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'cs'));
      return json(200, { jmena });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { jmeno, pin } = JSON.parse(event.body || '{}');
    if (!jmeno) return json(400, { error: 'Vyberte jméno.' });
    if (!pin) return json(400, { error: 'Chybí PIN.' });

    const sheets = await getSheetsClient();
    const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Uzivatele');

    const uzivatel = rows.find(
      (u) =>
        String(u.Jmeno || '').trim().toLowerCase() === String(jmeno).trim().toLowerCase() &&
        String(u.PIN).trim() === String(pin).trim()
    );
    if (!uzivatel) return json(401, { error: 'Neplatné jméno nebo PIN.' });

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
