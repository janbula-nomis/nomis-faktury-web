/**
 * lib/opakuj.js
 * Opakování volání Google API, když narazí na minutový limit (od v4.71).
 *
 * PROČ TO VZNIKLO
 *
 * Jan 2026-08-20 nahrál přes novou frontu (v4.70) třicet dokladů najednou.
 * Dvacet prošlo, deset spadlo na:
 *
 *   Quota exceeded for quota metric 'Read requests' and limit
 *   'Read requests per minute per user' of service 'sheets.googleapis.com'
 *
 * Sheets API má strop **60 čtecích požadavků za minutu na uživatele** a
 * jeden nahraný doklad jich spotřebuje zhruba šest (hlavičky při zápisu,
 * Bankovni_pohyby, Doklady, Firmy, Predkontace…). Třicet dokladů poslaných
 * hned za sebou tedy limit spolehlivě přeteče někde u desátého.
 *
 * Není to chyba v datech ani ve frontě - je to strop, do kterého se prostě
 * musí jet pomaleji. Tenhle modul řeší KRÁTKÉ špičky přímo na serveru;
 * dlouhé čekání (desítky vteřin) patří do fronty v prohlížeči, protože
 * Netlify funkce má vlastní časový limit a čekat v ní minutu nejde.
 *
 * DVĚ VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) OPAKUJE SE JEN LIMIT, NIC JINÉHO. Chybějící list, špatná práva nebo
 *    rozbitá data se opakováním nespraví - jen by se třikrát zpomalilo
 *    hlášení chyby, kterou má člověk vidět hned.
 * 2) ČEKÁ SE KRÁTCE A OMEZENĚ. Součet čekání musí zůstat hluboko pod
 *    časovým limitem Netlify funkce, jinak se z jasné chyby o limitu stane
 *    neprůhledný timeout - přesně ten problém, kvůli kterému se ve v3.9
 *    nahrávání rozdělilo na dvě fáze.
 */

// Kolikrát to zkusit znovu (kromě prvního pokusu) a jak dlouho čekat.
// Součet ~1,8 s: dost na krátký výkyv, pořád daleko od stropu funkce.
const POKUSY = 2;
const CEKANI_MS = [600, 1200];

/**
 * Je to náraz na limit Google API (a má tedy smysl to za chvíli zkusit
 * znovu), nebo skutečná chyba?
 *
 * Google to hlásí jako 429, ale historicky i jako 403 s důvodem
 * `rateLimitExceeded` / `userRateLimitExceeded` - proto se kouká i do textu.
 */
function jeLimitGoogle(e) {
  if (!e) return false;
  const kod = e.code || (e.response && e.response.status) || 0;
  if (kod === 429) return true;
  const text = String(e.message || '');
  if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(text)) return true;
  // Anglický text z Sheets API, viz hlavička souboru.
  return /Quota exceeded for quota metric/i.test(text);
}

function pockej(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spustí `fn` a při nárazu na limit to krátce zopakuje.
 *
 * @param {Function} fn - asynchronní funkce bez parametrů
 * @returns {Promise<*>} výsledek `fn`
 */
async function opakujPriLimitu(fn) {
  let posledni;
  for (let pokus = 0; pokus <= POKUSY; pokus += 1) {
    try {
      return await fn();
    } catch (e) {
      // Pravidlo 1: cokoli jiného než limit letí ven hned.
      if (!jeLimitGoogle(e)) throw e;
      posledni = e;
      if (pokus < POKUSY) await pockej(CEKANI_MS[pokus]);
    }
  }
  throw posledni;
}

module.exports = { POKUSY, CEKANI_MS, jeLimitGoogle, opakujPriLimitu };
