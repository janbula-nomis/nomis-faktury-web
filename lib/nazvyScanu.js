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
 *   ZU FP 001-2026 - ČEZ Prodej.pdf
 *   ^^ ^^^^^^^^^^^   ^^^^^^^^^^^
 *   |  |             dodavatel (zkrácený)
 *   |  evidenční číslo = „číslo dle systému"
 *   předpony: Z = zaúčtováno, U = uhrazeno (obojí, jen jedna, nebo žádná)
 *
 * (v4.68) Písmeno je `U` jako UHRAZENO. Do v4.67 to bylo `S` jako
 * spárováno - Jan si ten tvar původně vybral sám, ale pak upřesnil, že
 * *„spárováno znamená také uhrazeno (výpis na účtu nebo hotovost)"*, a na
 * obrazovce se ten stav od v4.67 jmenuje „Uhrazeno". Mít v appce jedno
 * slovo a v názvu souboru jiné je přesně ten druh drobnosti, kvůli které
 * pak nikdo neví, jestli jsou to dvě věci, nebo jedna.
 *
 * PŘI PRVNÍM SPUŠTĚNÍ PO v4.68 SE UŽ POJMENOVANÉ SOUBORY PŘEJMENUJÍ ZNOVU
 * (`ZS …` -> `ZU …`). Je to jednorázové a v náhledu to je vidět řádek po
 * řádku - appka nic nepřejmenuje bez potvrzení.
 *
 * PROČ ZROVNA TAKHLE
 *
 * Předpona je na začátku schválně: složka na Disku se řadí podle názvu,
 * takže se doklady samy seskupí do čtyř bloků - nejdřív bez předpony
 * (nedodělané, začínají na „FP"), pak „U…" (uhrazené), „Z…" (zaúčtované)
 * a nakonec „ZU…" (hotové). Účetní tím dostane setříděnou složku, ne jen
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
 * Zaplatil se doklad mimo firemní účet?
 *
 * (v4.75) Jan 2026-08-21: *„když zakliknu hotově, znamená to že to je mimo
 * účet, tak se to doubluje"*. Má pravdu - hotovost se na výpisu z firemního
 * účtu neobjeví NIKDY, takže „Hotovost" a „mimo účet" nejsou dvě nezávislá
 * políčka, ale jedno tvrzení.
 *
 * Appka to proto bere jako pravidlo, ne jako dva údaje: zaškrtnutý příznak
 * NEBO způsob platby „Hotovost". Srovná se tím i starší doklad, u kterého
 * AI vyplnila „Hotovost", ale příznak nikdo nezaškrtl.
 *
 * TOHLE JE JEDINÉ MÍSTO, KDE SE TO ROZHODUJE. Odznak v seznamu, řazení,
 * názvy scanů i výběr dokladů k párování se ptají sem - kdyby si to každý
 * počítal po svém, začaly by si odporovat. A přesně to se ve v4.75 jednou
 * už stalo: odznak hlásil „hotově" a ikona vedle ukazovala kartu.
 */
function jeHrazenoMimoUcet(doklad) {
  if (!doklad) return false;
  if (String(doklad.Hrazeno_mimo_ucet || '').trim().toUpperCase() === 'ANO') return true;
  return String(doklad.Zpusob_platby || '').trim() === 'Hotovost';
}

/**
 * Je doklad UHRAZENÝ?
 *
 * Dvě doložené cesty, obě platí stejně: potvrzený pohyb v bankovním výpisu,
 * nebo platba mimo firemní účet (hotovost, soukromá karta). Ta se nepáruje -
 * takový doklad protějšek v bance nikdy mít nebude a je vyřízený tím, že je
 * zaplacený.
 *
 * NÁVRH spárování sem NEPATŘÍ: to je jen tip appky, který nikdo neodklepl.
 */
function jeUhrazeno(doklad) {
  if (!doklad) return false;
  if (jeHrazenoMimoUcet(doklad)) return true;
  return String(doklad.Stav_parovani_bankou || '').trim() === 'Potvrzeno';
}

function jeZauctovano(doklad) {
  return String((doklad || {}).Zauctovano || '').trim().toUpperCase() === 'ANO';
}

/**
 * Předpona podle stavu: 'ZU' / 'Z' / 'U' / ''.
 * Pořadí je pevné (Z před U), ať se stejné doklady řadí k sobě.
 */
function predponaStavu(doklad) {
  return (jeZauctovano(doklad) ? 'Z' : '') + (jeUhrazeno(doklad) ? 'U' : '');
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
  jeHrazenoMimoUcet,
  jeUhrazeno,
  // Starý název ponechaný jako alias - volá ho ještě test-v463.js a
  // přejmenovat všechno najednou nemá cenu riskovat.
  jeSparovano: jeUhrazeno,
  jeZauctovano,
  predponaStavu,
  priponaZNazvu,
  vycistiCast,
  nazevScanu,
};
