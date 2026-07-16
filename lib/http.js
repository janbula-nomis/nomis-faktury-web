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
      // a taky pro případ, že Jan volá appku admin nástrojem odjinud
      // (viz X-Setup-Secret níž).
      'Access-Control-Allow-Origin': '*',
      // Oprava v3.11.2: appka dřív v seznamu povolených hlaviček
      // nezmiňovala "X-Setup-Secret" (jen Content-Type/Authorization) -
      // volání /api/setup nebo diagnostika-doklady z prohlížečového
      // REST nástroje (např. Hoppscotch, ne appka samotná) tak vždycky
      // selhalo na CORS preflightu s nejasnou hláškou "Network Error"
      // (curl v terminálu tenhle problém nemá vůbec - CORS je jen
      // prohlížečové omezení). Appka teď X-Setup-Secret mezi povolené
      // hlavičky přidává, ať jde spustit i z prohlížečového nástroje.
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Setup-Secret',
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
