/**
 * lib/requireAuth.js
 * Ověří Bearer token v hlavičce Authorization a vrátí dekódovaný obsah
 * (jmeno, firmy, role). Při chybě vyhodí Error se statusCode 401.
 */
const { verifyToken } = require('./auth');

function requireAuth(event) {
  const hlavicky = event.headers || {};
  const authHeader = hlavicky.authorization || hlavicky.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Chybí přihlašovací token.');
    err.statusCode = 401;
    throw err;
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    return verifyToken(token, process.env.SESSION_SECRET);
  } catch (e) {
    const err = new Error(e.message || 'Neplatný nebo vypršelý token.');
    err.statusCode = 401;
    throw err;
  }
}

module.exports = { requireAuth };
