/**
 * lib/http.js
 * Drobná pomocná funkce pro jednotné JSON odpovědi z Netlify Functions.
 */
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // Jednoduché CORS - appka běží na stejné doméně (Netlify), ale
      // pro jistotu při lokálním vývoji (netlify dev na jiném portu apod.)
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

module.exports = { json };
