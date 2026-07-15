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
      // Appka bez tohohle občas na některých zařízeních/sítích (typicky
      // mobilní prohlížeč nebo síť s cachovací proxy) ukazovala i po
      // obyčejném F5 pořád starou odpověď z GETu (např. doklad po
      // schválení na jiném zařízení pořád vypadal jako neschválený) -
      // bez Cache-Control appka nechávala na prohlížeči/síti, jestli si
      // odpověď někde po cestě uloží. Data appky se navíc mění
      // kdykoli (schválení, import výpisu...), takže cachování odpovědi
      // API nikdy nedává smysl.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
    body: JSON.stringify(body),
  };
}

module.exports = { json };
