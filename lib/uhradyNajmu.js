/**
 * lib/uhradyNajmu.js
 * Přiřazení přijatých nájemních plateb k měsícům (od v4.60).
 *
 * Jan 2026-08-08 poslal snímek „Kontroly úhrady nájmu" za červenec 2026,
 * kde bylo u všech českých nájmů `0,00 Kč / Nezaplaceno`, se slovy
 * *„nájmy jsou uhrazené, jak to funguje tady"* a *„udělej opravu, tohle
 * nefunguje"*.
 *
 * CO BYLO ŠPATNĚ
 *
 * Přehled do v4.59 sečetl platby, jejichž DATUM padlo do vybraného
 * kalendářního měsíce. Jenže nájem se platí dopředu - typicky do 25. dne
 * PŘEDCHOZÍHO měsíce. Nájem za červenec tedy dorazil koncem června, spadl
 * do června a červenec zůstal na nule. Bylo to v kódu vedené jako známé
 * zjednodušení od v4.37, ale v provozu to znamená, že obrazovka ukazuje
 * nezaplaceno u něčeho, co zaplacené je - a to je horší než chybějící
 * funkce, protože se tomu věří.
 *
 * PROČ NESTAČÍ POSUNOUT OKNO
 *
 * První nápad byl brát u smluv se splatností předem okno o měsíc zpátky.
 * Nefunguje to ze dvou důvodů. Za prvé `Splatnost_predem` je pole od
 * v4.59 a u smluv, které už v appce jsou, není vyplněné - oprava by tedy
 * na Janova data vůbec nedosáhla. Za druhé překrývající se okna by jednu
 * platbu započítala do dvou měsíců naráz a obojí by vyšlo jako zaplacené.
 *
 * JAK TO FUNGUJE TEĎ
 *
 * Platby se **přiřazují k měsícům**, každá právě jednou: seřadí se podle
 * data a postupně se jimi zaplňují měsíce od nejstaršího nezaplaceného.
 * To je stejné pravidlo, jaké appka používá u předpisu plateb
 * (lib/predpisPlateb.js) i jaké odpovídá tomu, jak se plnění běžně
 * započítává - nejdřív nejstarší dluh.
 *
 * Nepotřebuje to znát den splatnosti ani to, jestli se platí dopředu,
 * takže to funguje i na smlouvách, které v appce byly před v4.59.
 *
 * CO SE NESMÍ ZTRATIT
 *
 * Funkce vrací i `navrzeno` - kolik peněz leží na NEPOTVRZENÝCH návrzích
 * („Navrženo - trvalý příkaz"). Ty se do úhrady nepočítají, protože
 * potvrdit je musí člověk, ale obrazovka o nich musí říct. Tichá nula
 * u platby, která ve skutečnosti dorazila a jen čeká na odklepnutí, je
 * přesně ta chyba, kvůli které tenhle soubor vznikl.
 */

const { parsujCastkuZListu } = require('./bankHelpers');

// Kolik měsíců zpátky se platby sbírají. Musí to sahat dál než jeden
// měsíc: nájemník, který zaplatil tři měsíce dopředu, by jinak vypadal
// jako dlužník. Rok je kompromis mezi úplností a množstvím čtených dat.
const MESICU_ZPET = 12;

function dvojcislo(n) {
  return String(n).padStart(2, '0');
}

function posunMesic(mesic, o) {
  let rok = parseInt(String(mesic).slice(0, 4), 10);
  let m = parseInt(String(mesic).slice(5, 7), 10) + o;
  while (m > 12) { m -= 12; rok += 1; }
  while (m < 1) { m += 12; rok -= 1; }
  return String(rok) + '-' + dvojcislo(m);
}

// Předpis jednoho měsíce. Stejné pravidlo jako všude jinde: rozpad, když
// je vyplněný, jinak souhrnná očekávaná částka.
function mesicniPredpis(smlouva) {
  const rozpad = parsujCastkuZListu(smlouva.Cisty_najem) + parsujCastkuZListu(smlouva.Zaloha_na_sluzby);
  if (rozpad > 0) return rozpad;
  return Math.abs(parsujCastkuZListu(smlouva.Ocekavana_castka));
}

function platilaVMesici(smlouva, mesic) {
  const od = String(smlouva.Platnost_od || '').slice(0, 7);
  const doM = String(smlouva.Platnost_do || '').slice(0, 7);
  if (od && mesic < od) return false;
  if (doM && mesic > doM) return false;
  return true;
}

/**
 * Rozdělí platby jedné smlouvy mezi měsíce až po `doMesice`.
 *
 * @param {Object} smlouva
 * @param {Array} pohyby - VŠECHNY bankovní pohyby (funkce si je vyfiltruje)
 * @param {string} doMesice - 'RRRR-MM', měsíc, na který se ptáme
 * @returns {{uhrazeno: number, navrzeno: number, predpis: number,
 *            podleMesice: Object, prebytek: number, pouzitoPlateb: number}}
 */
function uhradyPoMesicich(smlouva, pohyby, doMesice) {
  const predpis = mesicniPredpis(smlouva);
  const prazdny = {
    uhrazeno: 0, navrzeno: 0, predpis, podleMesice: {}, prebytek: 0, pouzitoPlateb: 0,
  };
  if (!(predpis > 0)) return prazdny;

  // Měsíce, které se mají zaplatit: od nejstaršího v okně po ten dotázaný.
  const odMesice = posunMesic(doMesice, -(MESICU_ZPET - 1));
  const mesice = [];
  let m = odMesice;
  for (let i = 0; i < MESICU_ZPET; i += 1) {
    if (platilaVMesici(smlouva, m)) mesice.push(m);
    m = posunMesic(m, 1);
  }
  if (mesice.length === 0) return prazdny;

  // Platby se sbírají od měsíce PŘED prvním počítaným - nájem za leden
  // mohl dorazit koncem prosince. Bez toho by první měsíc okna vypadal
  // jako nezaplacený vždycky.
  const odData = posunMesic(mesice[0], -1) + '-01';
  const doData = doMesice + '-31';

  const mojePohyby = (pohyby || []).filter((p) =>
    p.Smlouva_ID === smlouva.ID
    && String(p.Datum || '') >= odData
    && String(p.Datum || '') <= doData
    && parsujCastkuZListu(p.Castka) > 0);

  // Nepotvrzené návrhy se do úhrady NEPOČÍTAJÍ - potvrdit je musí člověk.
  // Vrací se zvlášť, aby o nich obrazovka mohla říct.
  const navrzeno = mojePohyby
    .filter((p) => p.Stav_parovani === 'Navrženo - trvalý příkaz')
    .reduce((s, p) => s + parsujCastkuZListu(p.Castka), 0);

  const potvrzene = mojePohyby
    .filter((p) => p.Stav_parovani === 'Trvalý příkaz')
    .sort((a, b) => (String(a.Datum) < String(b.Datum) ? -1 : 1));

  // Vlastní přiřazení: nejstarší platba zaplní nejstarší nezaplacený
  // měsíc. Částečná platba měsíc nezaplní celý a další platba ho dorovná.
  const podleMesice = {};
  mesice.forEach((x) => { podleMesice[x] = 0; });

  let index = 0;
  potvrzene.forEach((p) => {
    let zbyva = parsujCastkuZListu(p.Castka);
    while (zbyva > 0 && index < mesice.length) {
      const klic = mesice[index];
      const chybi = predpis - podleMesice[klic];
      const dat = Math.min(chybi, zbyva);
      podleMesice[klic] = Math.round((podleMesice[klic] + dat) * 100) / 100;
      zbyva = Math.round((zbyva - dat) * 100) / 100;
      if (podleMesice[klic] >= predpis) index += 1;
      // Pojistka: kdyby předpis vyšel na nulu, cyklus by se zasekl.
      if (dat <= 0) break;
    }
  });

  // Co zbylo po zaplnění všech měsíců okna - typicky nájem zaplacený
  // dopředu na měsíc, na který se ještě neptáme.
  const rozdeleno = Object.keys(podleMesice).reduce((s, k) => s + podleMesice[k], 0);
  const prijato = potvrzene.reduce((s, p) => s + parsujCastkuZListu(p.Castka), 0);

  return {
    uhrazeno: podleMesice[doMesice] || 0,
    navrzeno,
    predpis,
    podleMesice,
    prebytek: Math.round((prijato - rozdeleno) * 100) / 100,
    pouzitoPlateb: potvrzene.length,
  };
}

module.exports = { uhradyPoMesicich, mesicniPredpis, posunMesic, MESICU_ZPET };
