/**
 * netlify/functions/qr-platba.js
 * GET (Bearer token) ?id=<Doklad ID>
 * -> appka sestaví QR Platbu (viz lib/qrPlatba.js pro plné zdůvodnění a
 *    algoritmus) pro daný SCHVÁLENÝ doklad a vrátí { spayd, qrObrazek } -
 *    `spayd` je čitelný text (appka ho zobrazí jako záložní možnost, kdyby
 *    QR kód nešel naskenovat), `qrObrazek` je QR kód jako PNG data URL
 *    (appka ho rovnou zobrazí v <img>, žádný soubor appka nikam neukládá).
 *
 * Appka QR Platbu omezuje na role admin/účetní (jde o přípravu platby -
 * stejné omezení jako export-money-s3.js) a jen na doklady ve stavu
 * "Schváleno" (appka nechce nabízet platbu k dokladu, který ještě čeká na
 * kontrolu/může být duplicita).
 *
 * DŮLEŽITÉ (viz lib/qrPlatba.js): appka QR kód jen PŘIPRAVÍ k naskenování v
 * bankovní appce uživatele - appka nikdy sama nic neplatí ani se nepřipojuje
 * k žádnému bankovnímu účtu.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { vytvorSpaydRetezec, vytvorQrKodDataUrl } = require('../../lib/qrPlatba');
const { json } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  if (!jeUcetniNeboAdmin(uzivatel)) {
    return json(403, { error: 'QR Platbu smí připravit jen administrátor nebo účetní.' });
  }

  try {
    const id = String((event.queryStringParameters || {}).id || '').trim();
    if (!id) return json(400, { error: 'Chybí id dokladu.' });

    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
    const doklad = dokladyVsechny.find((d) => d.ID === id);
    if (!doklad) return json(404, { error: 'Doklad nenalezen.' });

    if (doklad.Stav !== 'Schváleno') {
      return json(400, { error: 'QR Platbu lze připravit jen pro schválený doklad.' });
    }
    if (!doklad.Cislo_uctu_dodavatele) {
      return json(400, {
        error:
          'Doklad nemá vyplněné číslo účtu dodavatele - doplňte ho ručně v detailu dokladu ' +
          '(appka ho zkouší vytěžit automaticky, ale ne vždy je na dokladu čitelné/uvedené).',
      });
    }

    const spayd = vytvorSpaydRetezec(doklad);
    const qrObrazek = await vytvorQrKodDataUrl(spayd);

    return json(200, { ok: true, spayd, qrObrazek });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
