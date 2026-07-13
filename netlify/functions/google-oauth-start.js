/**
 * netlify/functions/google-oauth-start.js
 *
 * Appka běží jako neverifikovaná OAuth 2.0 appka (viz lib/google.js) - proto
 * jí Google refresh token vydrží jen ~7 dní a je potřeba ho pravidelně
 * obnovovat. Tahle dvojice funkcí (google-oauth-start + google-oauth-callback)
 * dělá obnovu otázkou jednoho kliknutí a přihlášení místo ručního postupu
 * přes Google Cloud Console / OAuth Playground.
 *
 * Použití: admin v appce klikne na tlačítko "Připojit Google účet znovu",
 * které otevře nové okno na
 *   /.netlify/functions/google-oauth-start?token=<aktuální Bearer token appky>
 * Funkce ověří, že jde o platného přihlášeného admina, a přesměruje ho na
 * Google souhlasnou obrazovku. Po odsouhlasení Google přesměruje zpět na
 * google-oauth-callback, která zobrazí nový refresh token ke zkopírování
 * (appka ho neumí sama zapsat do Netlify proměnných prostředí, to zůstává
 * poslední ruční krok).
 *
 * Důležité: přesná adresa
 *   https://VAŠE-DOMÉNA.netlify.app/.netlify/functions/google-oauth-callback
 * musí být přidaná mezi "Authorized redirect URIs" u OAuth Client ID
 * v Google Cloud Console (Credentials), jinak Google vrátí
 * "redirect_uri_mismatch". Viz README-DEPLOY.md.
 */
const { verifyToken } = require('../../lib/auth');
const { google } = require('googleapis');

exports.handler = async (event) => {
  const dotaz = event.queryStringParameters || {};
  const token = dotaz.token;

  let uzivatel;
  try {
    uzivatel = verifyToken(token, process.env.SESSION_SECRET);
  } catch (e) {
    return { statusCode: 401, body: 'Neplatný nebo vypršelý přihlašovací token appky: ' + e.message };
  }
  if (uzivatel.role !== 'admin') {
    return { statusCode: 403, body: 'Tuto akci může provést jen administrátor appky.' };
  }

  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return { statusCode: 500, body: 'Chybí GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET v Netlify env proměnných.' };
  }

  const host = (event.headers || {}).host;
  const redirectUri = 'https://' + host + '/.netlify/functions/google-oauth-callback';

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });

  return { statusCode: 302, headers: { Location: url } };
};
