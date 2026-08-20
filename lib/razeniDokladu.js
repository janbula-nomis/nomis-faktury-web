/**
 * lib/razeniDokladu.js
 * Řazení seznamu přijatých faktur podle vybraného sloupce (od v4.66).
 *
 * Jan 2026-08-20: *„potřebuju to umět seřadit podle kriterií které vyberu,
 * datum musí být vytěžené z dokladu jako datum vystavení"*.
 *
 * Do v4.65 se seznam řadil natvrdo podle `Datum_zpracovani` (kdy se doklad
 * nahrál) sestupně. Na Janově snímku to vypadalo jako by seřazený nebyl
 * vůbec: FP 045 z 7. 7. stálo nad FP 046 z 1. 7., protože se prostě nahrály
 * v tomhle pořadí. Účetní přitom potřebuje pořadí podle DOKLADU, ne podle
 * toho, kdy ho někdo vyfotil.
 *
 * ČTYŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) PRÁZDNÉ HODNOTY JSOU VŽDYCKY DOLE, v obou směrech. Kdyby se otáčely
 *    spolu se zbytkem, sestupné řazení podle částky by začínalo hromadou
 *    dokladů bez částky a to podstatné by bylo mimo obrazovku.
 * 2) EVIDENČNÍ ČÍSLO SE ŘADÍ JAKO (ROK, POŘADÍ), ne jako text. „FP 002-2026"
 *    je v řadě až za „FP 001-2026", ale text „FP 002-2026" < „FP 010-2026"
 *    platí jen díky nulám na začátku - u čtyřciferného pořadí (FP 1000) by
 *    to přestalo platit. Rok je v čísle až vzadu, takže čistě textové řazení
 *    by navíc míchalo roky dohromady.
 * 3) STAV BANKY SE ŘADÍ PODLE VÝZNAMU, ne podle abecedy. Účetní hledá to,
 *    co ještě není hotové - „Nespárováno" a „Návrh" mají skončit u sebe,
 *    ne rozházené mezi ✓ podle prvního písmene.
 * 4) ŘAZENÍ JE STABILNÍ. Při shodě rozhoduje evidenční číslo, ať se pořadí
 *    dvou dokladů se stejným datem nepřehazuje při každém překreslení.
 *
 * Čistý výpočet - nic nezapisuje, nic nečte z Googlu.
 *
 * POZOR: stejná logika je duplicitně v public/app.js (prohlížeč nemá build
 * krok a `require` neumí, viz stejná konvence u parsujCastkuZListu).
 * Test-v466.js hlídá, že se obě kopie nerozešly.
 */

const SLOUPCE_RAZENI = ['cislo', 'stav', 'banka', 'dodavatel', 'datum', 'castka', 'zauctovano'];

// Pravidlo 3. Nižší číslo = dřív při vzestupném řazení, tedy „nedodělané
// napřed" - to je to, co účetní hledá.
const PORADI_BANKY = {
  nesparovano: 0,
  navrh: 1,
  sparovano: 2,
};

function textCislo(hodnota) {
  return String(hodnota === null || hodnota === undefined ? '' : hodnota).trim();
}

function cisloZListu(hodnota) {
  if (typeof hodnota === 'number') return Number.isFinite(hodnota) ? hodnota : null;
  const text = textCislo(hodnota).replace(/\s/g, '').replace(',', '.');
  if (text === '') return null;
  const cislo = Number(text);
  return Number.isFinite(cislo) ? cislo : null;
}

/**
 * Evidenční číslo na dvojici (rok, pořadí). Pravidlo 2.
 * „FP 048-2026" -> { rok: 2026, poradi: 48 }
 */
function klicEvidencnihoCisla(hodnota) {
  const text = textCislo(hodnota);
  if (!text) return null;
  const m = text.match(/(\d+)\s*[-–]\s*(\d{4})/);
  if (!m) return { rok: 0, poradi: 0, text };
  return { rok: parseInt(m[2], 10), poradi: parseInt(m[1], 10), text };
}

/**
 * Stav spárování s bankou jako pořadí. Bere stejné signály jako odznak
 * v seznamu (viz lib/nazvyScanu.js -> jeSparovano): hotovost se nepáruje
 * a počítá se jako vyřízená.
 */
function klicBanky(d) {
  if (textCislo(d.Hrazeno_mimo_ucet).toUpperCase() === 'ANO') return PORADI_BANKY.sparovano;
  const stav = textCislo(d.Stav_parovani_bankou);
  if (stav === 'Potvrzeno') return PORADI_BANKY.sparovano;
  if (stav === 'Navrženo') return PORADI_BANKY.navrh;
  return PORADI_BANKY.nesparovano;
}

/**
 * Hodnota, podle které se sloupec řadí. `null` znamená „prázdné" a takový
 * řádek skončí vždycky dole (pravidlo 1).
 */
function klicSloupce(d, sloupec) {
  if (sloupec === 'cislo') {
    const k = klicEvidencnihoCisla(d.Evidencni_cislo);
    return k ? k.rok * 100000 + k.poradi : null;
  }
  if (sloupec === 'stav') return textCislo(d.Stav) || null;
  if (sloupec === 'banka') return klicBanky(d);
  if (sloupec === 'dodavatel') return textCislo(d.Dodavatel) || null;
  // Datum VYSTAVENÍ z dokladu, ne datum nahrání. Jan: *„datum musí být
  // vytěžené z dokladu jako datum vystavení"*.
  if (sloupec === 'datum') return textCislo(d.Datum_dokladu) || null;
  if (sloupec === 'castka') return cisloZListu(d.Castka);
  if (sloupec === 'zauctovano') return textCislo(d.Zauctovano).toUpperCase() === 'ANO' ? 1 : 0;
  return null;
}

/**
 * Seřadí doklady. Vrací NOVÉ pole, vstup nemění.
 *
 * @param {Array} doklady
 * @param {string} sloupec - jeden z SLOUPCE_RAZENI
 * @param {string} smer - 'asc' nebo 'desc'
 */
function serazDoklady(doklady, sloupec, smer) {
  const dolu = smer === 'desc' ? -1 : 1;
  const radek = (doklady || []).slice();

  radek.sort((a, b) => {
    const ka = klicSloupce(a, sloupec);
    const kb = klicSloupce(b, sloupec);

    // Pravidlo 1: prázdné vždycky dolů, nezávisle na směru.
    const prazdneA = ka === null || ka === '';
    const prazdneB = kb === null || kb === '';
    if (prazdneA && prazdneB) return remizou(a, b);
    if (prazdneA) return 1;
    if (prazdneB) return -1;

    let rozdil;
    if (typeof ka === 'number' && typeof kb === 'number') {
      rozdil = ka - kb;
    } else {
      // Čeština kvůli háčkům a čárkám - „Čeps" patří za „Cetin", ne na konec.
      rozdil = String(ka).localeCompare(String(kb), 'cs');
    }
    if (rozdil !== 0) return rozdil * dolu;
    return remizou(a, b);                                   // pravidlo 4
  });

  return radek;
}

// Rozhodčí při shodě: evidenční číslo sestupně (novější napřed). Nesmí
// záviset na směru řazení, jinak by nebylo stabilní.
function remizou(a, b) {
  const ka = klicEvidencnihoCisla(a.Evidencni_cislo);
  const kb = klicEvidencnihoCisla(b.Evidencni_cislo);
  const ca = ka ? ka.rok * 100000 + ka.poradi : -1;
  const cb = kb ? kb.rok * 100000 + kb.poradi : -1;
  return cb - ca;
}

module.exports = {
  SLOUPCE_RAZENI,
  PORADI_BANKY,
  klicEvidencnihoCisla,
  klicBanky,
  klicSloupce,
  serazDoklady,
};
