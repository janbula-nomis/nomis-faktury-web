/**
 * lib/auth.js
 * Minimalistický podpis/ověření tokenu (JWT-like, HMAC-SHA256), bez
 * externí závislosti. Token nese jméno uživatele, seznam firem, ke
 * kterým má přístup, a roli. Platnost 12 hodin.
 */
const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(headerEnc, bodyEnc, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(headerEnc + '.' + bodyEnc)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signToken(payload, secret, expiresInSeconds) {
  if (!secret) throw new Error('Chybí SESSION_SECRET (nastavte v Netlify env proměnných).');
  const exp = expiresInSeconds || 60 * 60 * 12;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = Object.assign({}, payload, { iat: now, exp: now + exp });

  const headerEnc = base64url(JSON.stringify(header));
  const bodyEnc = base64url(JSON.stringify(body));
  const signature = sign(headerEnc, bodyEnc, secret);

  return headerEnc + '.' + bodyEnc + '.' + signature;
}

function verifyToken(token, secret) {
  if (!secret) throw new Error('Chybí SESSION_SECRET (nastavte v Netlify env proměnných).');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Neplatný formát tokenu.');

  const [headerEnc, bodyEnc, signature] = parts;
  const ocekavanyPodpis = sign(headerEnc, bodyEnc, secret);
  if (ocekavanyPodpis !== signature) throw new Error('Neplatný podpis tokenu.');

  const body = JSON.parse(Buffer.from(bodyEnc, 'base64').toString('utf8'));
  if (body.exp && Math.floor(Date.now() / 1000) > body.exp) {
    throw new Error('Přihlášení vypršelo, přihlaste se prosím znovu.');
  }
  return body;
}

module.exports = { signToken, verifyToken };
