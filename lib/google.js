/**
 * lib/google.js
 * Autentizace ke Google API přes OAuth 2.0 pod VAŠÍM vlastním Google účtem
 * (ne přes service account). Appka nahrává soubory a čte/zapisuje Sheets
 * s vaší identitou a vaší diskovou kvótou.
 *
 * Proč ne service account: Google service accounty nemají vlastní úložiště
 * na Disku ("Service Accounts do not have storage quota") a nemohou tak
 * vytvářet nové soubory v běžné osobní Google Disk složce – jen v placeném
 * Google Workspace Shared Drive. Pro appku provozovanou pod osobním Google
 * účtem je proto potřeba OAuth s refresh tokenem místo service accountu.
 *
 * Jaký OAuth scope při autorizaci (OAuth Playground) vyžádat:
 *   https://www.googleapis.com/auth/spreadsheets
 *   https://www.googleapis.com/auth/drive.file   (NE plný .../auth/drive!)
 * Plný scope "drive" je Google "restricted scope" - vyžadoval by placené
 * bezpečnostní posouzení (CASA), jinak appce zůstane refresh token omezený
 * na 7 dní i po publikaci do "In production". "drive.file" mezi restricted
 * scopes nepatří, takže appka může zůstat neverifikovaná a token přesto
 * vydrží napořád. Podrobnosti a důsledky (appka smí zapisovat jen do
 * souborů/složek, které si sama vytvořila) viz lib/driveHelpers.js.
 *
 * Očekávané proměnné prostředí (Netlify env):
 *   GOOGLE_OAUTH_CLIENT_ID      – Client ID z OAuth 2.0 Client (Google Cloud Console)
 *   GOOGLE_OAUTH_CLIENT_SECRET  – Client Secret ke stejnému Client ID
 *   GOOGLE_OAUTH_REFRESH_TOKEN  – refresh token získaný jednorázově (viz README-DEPLOY.md)
 *   SPREADSHEET_ID              – ID tabulky Google Sheets
 *   INBOX_FOLDER_ID             – ID Drive složky pro nové doklady
 */
const { google } = require('googleapis');

// Poznámka k robustnosti: hodnoty z Netlify env proměnných vždy .trim()-ujeme.
// Při ručním kopírování Client ID/Secret/refresh tokenu mezi Google Cloud
// Console, OAuth Playground a Netlify formulářem se snadno "přichytí" mezera
// nebo nový řádek navíc (neviditelné při běžném pohledu na maskované pole
// v Netlify) - Google pak takovou hodnotu odmítne, typicky s chybou
// "unauthorized_client" nebo "invalid_client", i když hodnota vypadá správně.
//
// Zámerně NEKEŠUJEME OAuth2Client mezi voláními (na rozdíl od dřívější verze
// s modulovou proměnnou `cachedAuth`) - vytvoření klienta je čistě lokální
// operace bez síťového volání, takže na výkonu to nic nestojí, a vyhneme se
// tak riziku, že "teplý" Netlify Function kontejner mezi requesty použije
// zastaralé (např. před rotací Client Secret) přihlašovací údaje.
function getAuth() {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Chybí GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN ' +
      '(nastavte v Netlify env proměnných, viz README-DEPLOY.md).'
    );
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

async function getSheetsClient() {
  // OAuth2Client si access token obnovuje sám podle potřeby při volání API
  // (na rozdíl od JWT klienta service accountu není potřeba ruční .authorize()).
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}

module.exports = { getSheetsClient, getDriveClient };
