/**
 * netlify/functions/google-oauth-callback.js
 * Druhá půlka self-service obnovy Google refresh tokenu, viz
 * google-oauth-start.js. Google sem přesměruje po odsouhlasení přístupu
 * s parametrem ?code=..., funkce ho vymění za nový refresh token a zobrazí
 * ho ke zkopírování - appka ho neumí sama zapsat do Netlify proměnných
 * prostředí, takže poslední ruční krok (vložit hodnotu do Netlify + Trigger
 * deploy) zůstává na vás.
 */
const { google } = require('googleapis');

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function stranka(nadpis, obsahHtml) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body:
      '<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escapeHtml(nadpis) + '</title>' +
      '<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:640px;' +
      'margin:40px auto;padding:0 16px;line-height:1.5;color:#1a1a1a}' +
      'input{width:100%;padding:10px;font-size:14px;font-family:monospace;' +
      'box-sizing:border-box;margin:8px 0;border:1px solid #ccc;border-radius:4px}' +
      'button{padding:8px 16px;font-size:14px;cursor:pointer;border-radius:4px;' +
      'border:1px solid #888;background:#f5f5f5}' +
      'code{background:#f2f2f2;padding:2px 5px;border-radius:3px}</style>' +
      '</head><body>' + obsahHtml + '</body></html>',
  };
}

exports.handler = async (event) => {
  const dotaz = event.queryStringParameters || {};

  if (dotaz.error) {
    return stranka(
      'Přístup odepřen',
      '<h1>Přístup odepřen</h1><p>Google vrátil chybu: <code>' + escapeHtml(dotaz.error) +
      '</code>. Zkuste to prosím znovu z appky (tlačítko „Připojit Google účet znovu“).</p>'
    );
  }

  const code = dotaz.code;
  if (!code) {
    return stranka(
      'Chybí autorizační kód',
      '<h1>Chybí autorizační kód</h1><p>Tuhle stránku prosím neotevírejte přímo - ' +
      'použijte tlačítko v appce.</p>'
    );
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const host = (event.headers || {}).host;
  const redirectUri = 'https://' + host + '/.netlify/functions/google-oauth-callback';

  try {
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return stranka(
        'Chybí refresh token',
        '<h1>Google refresh token tentokrát nevrátil</h1>' +
        '<p>To se stává, pokud appka od stejného Google účtu souhlas už jednou dostala. ' +
        'Jděte na <a href="https://myaccount.google.com/permissions" target="_blank">' +
        'myaccount.google.com/permissions</a>, appce odeberte přístup, a zkuste tlačítko ' +
        '„Připojit Google účet znovu“ v appce spustit znovu.</p>'
      );
    }

    return stranka(
      'Google účet znovu připojen',
      '<h1>Google účet znovu připojen ✓</h1>' +
      '<p>Zkopírujte hodnotu níže a v Netlify (Site settings → Environment variables) ji ' +
      'vložte jako proměnnou <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> (přepište starou hodnotu). ' +
      'Pak klikněte <strong>Deploys → Trigger deploy → Deploy site</strong>, ať appka novou ' +
      'hodnotu opravdu použije.</p>' +
      '<input type="text" readonly value="' + escapeHtml(tokens.refresh_token) +
      '" onclick="this.select()" id="token-pole">' +
      '<button onclick="navigator.clipboard.writeText(document.getElementById(' +
      '\'token-pole\').value).then(() => { this.textContent = \'Zkopírováno!\'; })">' +
      'Zkopírovat</button>' +
      '<p style="color:#666;font-size:13px;margin-top:24px">Tuhle stránku pak můžete zavřít.</p>'
    );
  } catch (e) {
    return stranka('Chyba', '<h1>Něco se nepovedlo</h1><p>' + escapeHtml(e.message) + '</p>');
  }
};
