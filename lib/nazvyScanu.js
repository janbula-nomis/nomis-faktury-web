/**
 * lib/nazvyScanu.js
 * Jak se má jmenovat scan dokladu na Google Disku (od v4.63).
 *
 * Jan 2026-08-20: *„jestli je možné nějak exportovat hromadně doklady -
 * scany, které budou mít předem daný text souboru, který získají, např.
 * Z - zaúčtováno, S - spárováno a pak číslo dle systému"*.
 *
 * Volba: **přejmenovat soubory přímo na Disku** a stáhnout si pak celou
 * složku z Disku (Google si zip poskládá sám). Netlify funkce má na
 * odpověď tvrdý limit velikosti, takže zip skládaný v appce by u většího
 * výběru spadl - a spadl by až po minutě čekání, což je horší než ho
 * vůbec nenabídnout.
 *
 * TVAR NÁZVU
 *
 *   ZS FP 001-2026 - ČEZ Prodej.pdf
 *   ^^ ^^^^^^^^^^^   ^^^^^^^^^^^
 *   |  |             dodavatel (zkrácený)
 *   |  evidenční číslo = „číslo dle systému"
 *   předpony: Z = zaúčtováno, S = spárováno (obojí, jen jedna, nebo žádná)
 *
 * PROČ ZROVNA TAKHLE
 *
 * Předpona je na začátku schválně: složka na Disku se řadí podle názvu,
 * takže se doklady samy seskupí na „ZS…" (hotové), „Z…", „S…" a bez
 * předpony (nedodělané). Účetní tím dostane setříděnou složku, ne jen
 * přejmenované soubory.
 *
 * TŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) BEZ EVIDENČNÍHO ČÍSLA SE NEPŘEJMENOVÁVÁ. Appka ho přiděluje až při
 *    schválení; dokud ho doklad nemá, není podle čeho ho pojmenovat a
 *    název bez čísla by v účetnictví k ničemu nebyl. Vrací se `null`
 *    s důvodem, ne vymyšlený název.
 * 2) PŘÍPONA SE ZACHOVÁVÁ Z PŮVODNÍHO NÁZVU. Přejmenovat „faktura.pdf"
 *    na „…- ČEZ" bez přípony by soubor na Disku i v počítači znefunkčnilo.
 * 3) NÁZEV SE ČISTÍ. Lomítko v názvu dodavatele („NOMIS s.r.o. / pobočka")
 *    Disk sice unese, ale po stažení do počítače rozbije cestu.
 *
 * Čistý výpočet - nic nezapisuje, nic nečte z Googlu.
 */

// Delší název už se v seznamu na Disku stejně nezobrazí celý a u stažení
// na disk hrozí u některých systémů oříznutí. Zkracuje se dodavatel, ne
// číslo - to je ta část, kvůli které se to celé dělá.
const MAX_DELKA_NAZVU = 120;

/**
 * Je doklad z pohledu banky vyřízený?
 *
 * Hotovost (a cokoli jiného „mimo účet") se **nepáruje** - Janova volba:
 * takový doklad je vyřízený tím, že je zaplacený, a dostane rovnou ✓.
 * Do v4.62 u něj svítilo šedé „Mimo účet", což vypadalo jako nedodělek.
 */
function jeSparovano(doklad) {
  if (!doklad) return false;
  if (String(doklad.Hrazeno_mimo_ucet || '').trim().toUpperCase() === 'ANO') return true;
  return String(doklad.Stav_parovani_bankou || '').trim() === 'Potvrzeno';
}

function jeZauctovano(doklad) {
  return String((doklad || {}).Zauctovano || '').trim().toUpperCase() === 'ANO';
}

/**
 * Předpona podle stavu: 'ZS' / 'Z' / 'S' / ''.
 * Pořadí je pevné (Z před S), ať se stejné doklady řadí k sobě.
 */
function predponaStavu(doklad) {
  return (jeZauctovano(doklad) ? 'Z' : '') + (jeSparovano(doklad) ? 'S' : '');
}

// Přípona z původního názvu ('.pdf', '.jpg'…). Bere se jen krátká
// alfanumerická koncovka - „Faktura č. 2026" končí na „. 2026" a to není
// přípona, tu by appka jinak useknula.
function priponaZNazvu(nazev) {
  const text = String(nazev || '');
  const tecka = text.lastIndexOf('.');
  if (tecka <= 0 || tecka === text.length - 1) return '';
  const pripona = text.slice(tecka + 1);
  return /^[A-Za-z0-9]{1,5}$/.test(pripona) ? '.' + pripona.toLowerCase() : '';
}

// Znaky, které rozbijí cestu po stažení do počítače (Windows i macOS).
// Diakritika se schválně NEODSTRAŇUJE - „ČEZ" má zůstat „ČEZ".
function vycistiCast(text) {
  return String(text || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    // Ridici znaky (zalomeni radku z Sheets apod.). Pomlcka se tu NESMI
    // nahrazovat - evidencni cislo je "FP 001-2026" a bez pomlcky by
    // to bylo jine cislo.
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sestaví cílový název souboru pro jeden doklad.
 *
 * @param {Object} doklad - řádek z listu Doklady (+ dopočtené
 *   `Stav_parovani_bankou` z netlify/functions/doklady.js)
 * @param {string} puvodniNazev - jak se soubor jmenuje teď (kvůli příponě)
 * @returns {{nazev: string}|{nazev: null, duvod: string}}
 */
function nazevScanu(doklad, puvodniNazev) {
  const evid = vycistiCast((doklad || {}).Evidencni_cislo);
  if (!evid) {
    // Pravidlo 1. Appka evidenční číslo přiděluje až při schválení.
    return { nazev: null, duvod: 'Doklad nemá evidenční číslo – appka ho přiděluje až při schválení.' };
  }

  const pripona = priponaZNazvu(puvodniNazev);          // pravidlo 2
  const predpona = predponaStavu(doklad);
  const dodavatel = vycistiCast((doklad || {}).Dodavatel);

  const zaklad = (predpona ? predpona + ' ' : '') + evid;
  let cely = dodavatel ? zaklad + ' - ' + dodavatel : zaklad;

  if (cely.length + pripona.length > MAX_DELKA_NAZVU) {
    // Zkracuje se dodavatel, číslo zůstává celé.
    const zbyva = MAX_DELKA_NAZVU - pripona.length - zaklad.length - 3;
    cely = zbyva > 3 ? zaklad + ' - ' + dodavatel.slice(0, zbyva).trim() : zaklad;
  }

  return { nazev: cely + pripona };
}

module.exports = {
  MAX_DELKA_NAZVU,
  jeSparovano,
  jeZauctovano,
  predponaStavu,
  priponaZNazvu,
  vycistiCast,
  nazevScanu,
};
