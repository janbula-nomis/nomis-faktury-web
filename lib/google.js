/**
 * lib/google.js
 * Autentizace ke Google API přes servisní účet (service account) – appka
 * se autorizuje sama za sebe, uživatelé appky nepotřebují vlastní Google
 * účet. Servisní účet musí mít sdílený přístup (Editor) k dané tabulce
 * Google Sheets a ke složkám na Disku – viz README-DEPLOY.md.
 *
 * Očekávané proměnné prostředí (Netlify env):
 *   GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 – celý JSON klíč servisního účtu, base64
 *   SPREADSHEET_ID                    – ID tabulky Google Sheets
 *   INBOX_FOLDER_ID                   – ID Drive složky pro nové doklady
 */
const { google } = require('googleapis');

let cachedAuth = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;

  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!encoded) {
    throw new Error('Chybí GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 (nastavte v Netlify env proměnných).');
  }

  const klic = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  cachedAuth = new google.auth.JWT(klic.client_email, null, klic.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ]);
  return cachedAuth;
}

async function getSheetsClient() {
  const auth = getAuth();
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

async function getDriveClient() {
  const auth = getAuth();
  await auth.authorize();
  return google.drive({ version: 'v3', auth });
}

module.exports = { getSheetsClient, getDriveClient };
