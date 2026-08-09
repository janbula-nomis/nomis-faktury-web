/**
 * lib/dovytezeniSmlouvy.js
 * Bezpečné DOVYTĚŽENÍ už hotové nájemní smlouvy (od v4.62).
 *
 * PROČ TO VZNIKLO
 *
 * Od v4.59 umí AI ze smlouvy vytáhnout rozpad nájmu (čistý nájem, záloha),
 * kauci, den splatnosti a variabilní symbol - jenže jen při PRVNÍM
 * zpracování. Smlouvy nahrané dřív ta pole nemají, a bez nich nejde
 * vygenerovat předpis plateb. Řetěz se tak trhal hned na začátku: žádný
 * předpis -> žádný rozpis nájmu -> žádné „po splatnosti".
 *
 * Znovu spustit `smlouvy-upload-dokoncit` šlo i předtím (soubor leží na
 * Drive), ale bylo to NEBEZPEČNÉ: přepsalo to celý řádek podle toho, co AI
 * zrovna přečetla - včetně `Stredisko`. A Stredisko je od v4.23 JEDINÝ
 * účetní klíč; jeho tichá změna by přeházela zaúčtování bankovních pohybů,
 * vyúčtování i dashboard. Tenhle modul je ta pojistka.
 *
 * TŘI PRAVIDLA, KTERÁ SE TU NESMÍ ZMĚKČIT
 *
 * 1) CHRÁNĚNÉ POLE SE NIKDY NEZAPÍŠE SAMO. Ani když je prázdné. Objeví se
 *    jen v porovnání a čeká na člověka. Patří sem účetní klíč (`Stredisko`,
 *    `Firma`), identita smlouvy (`Cislo_smlouvy`, `Nazev`, `Typ`) a
 *    `Poznamka`, do které si Jan píše svoje.
 * 2) DOPLŇUJE SE JEN DO PRÁZDNA. Vyplněná hodnota se nikdy nepřepíše -
 *    člověk ji tam mohl dát ručně proto, že ji AI přečetla špatně.
 * 3) ROZDÍL SE NEZAMLČÍ. Když appka něco nechala být, protože tam už
 *    hodnota byla, ale AI našla jinou, musí to být vidět v `rozdily` -
 *    jinak by „bezpečné" znamenalo „u špatně vyplněné smlouvy к ničemu".
 *
 * Čistý výpočet - nic nezapisuje, nic nečte z Googlu.
 */

/*
 * Mapa: sloupec smlouvy <- klíč z AI extrakce.
 *
 * `chranene: true` = pravidlo 1. `cislo: true` = hodnoty se porovnávají
 * jako čísla, ať '23000' a '23000.00' nejsou „rozdíl".
 */
const POLA_DOVYTEZENI = [
  { pole: 'Firma', zdroj: 'firma_odhad', popisek: 'Firma', chranene: true },
  { pole: 'Nazev', zdroj: 'nazev', popisek: 'Název smlouvy', chranene: true },
  { pole: 'Stredisko', zdroj: 'stredisko_odhad', popisek: 'Středisko (účetní klíč)', chranene: true },
  { pole: 'Typ', zdroj: 'typ', popisek: 'Typ smlouvy', chranene: true },
  { pole: 'Poznamka', zdroj: 'poznamka_ai', popisek: 'Poznámka', chranene: true },

  { pole: 'Druha_strana', zdroj: 'druha_strana', popisek: 'Druhá strana (nájemník)' },
  { pole: 'Perioda', zdroj: 'perioda', popisek: 'Perioda' },
  { pole: 'Mena', zdroj: 'mena', popisek: 'Měna' },
  { pole: 'Platnost_od', zdroj: 'platnost_od', popisek: 'Platnost od' },
  { pole: 'Platnost_do', zdroj: 'platnost_do', popisek: 'Platnost do' },
  { pole: 'Cisty_najem', zdroj: 'cisty_najem', popisek: 'Čistý nájem', cislo: true },
  { pole: 'Zaloha_na_sluzby', zdroj: 'zaloha_na_sluzby', popisek: 'Záloha na služby', cislo: true },
  { pole: 'Kauce_castka', zdroj: 'kauce_castka', popisek: 'Kauce', cislo: true },
  { pole: 'Kauce_splatnost', zdroj: 'kauce_splatnost', popisek: 'Splatnost kauce' },
  { pole: 'Den_splatnosti', zdroj: 'den_splatnosti', popisek: 'Den splatnosti', cislo: true },
  { pole: 'Splatnost_predem', zdroj: 'splatnost_predem', popisek: 'Splatnost dopředu' },
  { pole: 'Variabilni_symbol', zdroj: 'variabilni_symbol', popisek: 'Variabilní symbol' },
];

// Pole, která tenhle režim nesmí zapsat ani omylem. Drží se zvlášť od
// POLA_DOVYTEZENI, protože `_row`, `ID` a `Stav` v mapě vůbec nejsou a
// stejně by se do zápisu neměly dostat.
const NIKDY_NEZAPISOVAT = ['ID', '_row', 'Stav', 'Cislo_smlouvy', 'Najemni_jednotka_ID'];

function jePrazdne(hodnota) {
  return hodnota === null || hodnota === undefined || String(hodnota).trim() === '';
}

function naCislo(hodnota) {
  const text = String(hodnota === null || hodnota === undefined ? '' : hodnota)
    .replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const cislo = parseFloat(text);
  return Number.isFinite(cislo) ? cislo : null;
}

// „ANO"/true/1 -> 'ANO', cokoli jiného -> ''. Stejné pravidlo jako při
// prvním zpracování, ať se dvě cesty k jednomu sloupci neliší.
function normalizujPredem(hodnota) {
  const text = String(hodnota === null || hodnota === undefined ? '' : hodnota).trim().toUpperCase();
  return (text === 'ANO' || text === 'TRUE' || text === '1') ? 'ANO' : '';
}

function hodnotaZExtrakce(popis, extrakce) {
  const surova = (extrakce || {})[popis.zdroj];
  if (popis.pole === 'Splatnost_predem') return normalizujPredem(surova);
  if (popis.cislo) {
    const cislo = naCislo(surova);
    return cislo !== null && cislo > 0 ? String(cislo) : '';
  }
  return jePrazdne(surova) ? '' : String(surova).trim();
}

function jeStejne(popis, a, b) {
  if (popis.cislo) {
    const ca = naCislo(a);
    const cb = naCislo(b);
    if (ca === null || cb === null) return String(a || '').trim() === String(b || '').trim();
    return Math.abs(ca - cb) < 0.005;
  }
  return String(a === null || a === undefined ? '' : a).trim()
    === String(b === null || b === undefined ? '' : b).trim();
}

/**
 * Porovná hotovou smlouvu s novou AI extrakcí.
 *
 * @param {Object} smlouva - řádek ze Smluv, jak je teď
 * @param {Object} extrakce - výstup lib/gemini.js -> extrahujDataZeSmlouvy
 * @returns {{doplneno: Object, rozdily: Array, chranenePrazdne: Array}}
 *   doplneno  - sloupce, které se smí rovnou zapsat (byly prázdné)
 *   rozdily   - {pole, popisek, vApp, zAi, chranene, duvod} k odklepnutí
 *   Nic jiného se zapisovat nesmí.
 */
function sestavDovytezeni(smlouva, extrakce) {
  const doplneno = {};
  const rozdily = [];

  POLA_DOVYTEZENI.forEach((popis) => {
    const zAi = hodnotaZExtrakce(popis, extrakce);
    if (zAi === '') return;                        // AI nic nenašla - nemáme co nabídnout
    const vApp = smlouva ? smlouva[popis.pole] : '';
    const prazdne = jePrazdne(vApp);

    if (!prazdne && jeStejne(popis, vApp, zAi)) return;   // sedí, není o čem

    if (popis.chranene) {
      // Pravidlo 1: ani do prázdna. Účetní klíč nesmí přijít od AI bez
      // toho, aby to někdo viděl.
      rozdily.push({
        pole: popis.pole,
        popisek: popis.popisek,
        vApp: prazdne ? '' : String(vApp),
        zAi,
        chranene: true,
        duvod: prazdne ? 'chybi-chranene' : 'lisi-se-chranene',
      });
      return;
    }

    if (prazdne) {
      doplneno[popis.pole] = zAi;                  // pravidlo 2: doplnit smí
      return;
    }

    rozdily.push({                                 // pravidlo 3: nezamlčet
      pole: popis.pole,
      popisek: popis.popisek,
      vApp: String(vApp),
      zAi,
      chranene: false,
      duvod: 'lisi-se',
    });
  });

  // Ocekavana_castka je dopočet, ne vytěžené pole: párování bankovních
  // plateb podle částky na ni spoléhá, takže se sama nepřepisuje. Když se
  // doplněním rozpadu změní součet, jde to do porovnání jako všechno
  // ostatní.
  const najem = naCislo(doplneno.Cisty_najem !== undefined ? doplneno.Cisty_najem : (smlouva || {}).Cisty_najem) || 0;
  const zaloha = naCislo(doplneno.Zaloha_na_sluzby !== undefined ? doplneno.Zaloha_na_sluzby : (smlouva || {}).Zaloha_na_sluzby) || 0;
  const soucet = najem + zaloha;
  const stavajici = naCislo((smlouva || {}).Ocekavana_castka);
  if (soucet > 0) {
    if (stavajici === null || stavajici === 0) {
      doplneno.Ocekavana_castka = String(soucet);
    } else if (Math.abs(stavajici - soucet) >= 0.005) {
      rozdily.push({
        pole: 'Ocekavana_castka',
        popisek: 'Očekávaná částka (nájem + záloha)',
        vApp: String((smlouva || {}).Ocekavana_castka),
        zAi: String(soucet),
        chranene: false,
        duvod: 'soucet-nesedi',
      });
    }
  }

  NIKDY_NEZAPISOVAT.forEach((pole) => { delete doplneno[pole]; });

  return { doplneno, rozdily };
}

module.exports = {
  POLA_DOVYTEZENI,
  NIKDY_NEZAPISOVAT,
  sestavDovytezeni,
};
