/*
 * public/platebniVymer.js
 * Rozvrh plateb pro platební výměr - přílohu nájemní smlouvy (od v4.85).
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21: *„příloha smlouvy bude platební výměr po jednotlivých
 * měsících, případně denní nájem pokud to není celý měsíc, obsahuje kauci,
 * nájem, zálohy služby SVJ, energie, internet, ostatní, datum úhrady,
 * variabilní symbol (…) a QR kód pro platbu - řádky jsou dny a měsíce,
 * sloupce jsou položky platby"*.
 *
 * PROČ JE TENHLE SOUBOR V public/, A NE V lib/
 *
 * Prohlížeč neumí `require`, takže sdílená logika se v téhle appce jinde
 * píše dvakrát (jednou v lib/, jednou v public/) a testy hlídají, že se
 * obě kopie shodují. Tady se to nedělá: rozvrh je počítání s penězi
 * nájemníka a dvě kopie výpočtu jsou dvě místa, kde se můžou rozejít.
 * Soubor má na konci `module.exports`, takže si ho testy načtou přímo -
 * je jen jeden a testuje se ten, který doopravdy počítá.
 *
 * DENNÍ NÁJEM (Jan potvrdil 2026-08-21)
 *
 * Poměrná část = **měsíční částka ÷ počet dní v tom konkrétním měsíci
 * × počet dní**. Ne ÷ 30. Za sedm dní v únoru se tedy platí o kousek víc
 * než za sedm dní v lednu; zato za celý měsíc vyjde vždycky přesně
 * měsíční částka, což u dělení třiceti neplatí.
 *
 * Poměrně se krátí **všechny položky, ne jen nájem** - zálohy na služby,
 * energie i internet se za neúplný měsíc platí taky jen za část měsíce.
 *
 * Zaokrouhluje se **každá položka zvlášť** na celé koruny a teprve pak se
 * sčítá. Součet zaokrouhlených položek je to, co nájemník opravdu pošle,
 * a musí sedět na řádek ve výpisu z účtu - kdyby se zaokrouhloval až
 * součet, lišil by se o korunu od toho, co je nad ním v tabulce.
 *
 * SPLATNOST
 *
 * Vychází z `denSplatnosti` (den v měsíci). Když by u prvního, neúplného
 * období vyšla splatnost **před začátkem nájmu**, posune se na den
 * nástupu - platit dřív, než se člověk nastěhoval, nedává smysl a appka
 * si to nemá vymýšlet jinak.
 *
 * CO APPKA NEDĚLÁ
 *
 * Nedopočítává inflační doložku ani změny záloh dopředu. Výměr popisuje
 * stav ke dni vystavení; když se nájem změní dodatkem, vystaví se výměr
 * nový. Tisknout do podepisované přílohy odhad budoucího nájmu by
 * znamenalo vydávat dopočet za dohodu.
 */

/*
 * Katalog položek. Sloupce výměru se z něj neberou všechny - vypíšou se
 * JEN ty, které u téhle smlouvy mají nějakou částku (viz `polozky` ve
 * výsledku). Sloupec plný pomlček vypadá jako chyba evidence, a hlavně
 * ubírá šířku sloupcům, které něco nesou.
 *
 * `sluzby` je náhradník: dokud Jan zálohy nerozepíše, má smlouva jen
 * `Zaloha_na_sluzby` v jednom čísle. Tehdy se vytiskne jeden sloupec
 * „Zálohy na služby" - ne rozpis, který appka nezná.
 */
const VYMER_POLOZKY = [
  { klic: 'najem', popisek: 'Nájem' },
  { klic: 'sluzby', popisek: 'Zálohy na služby' },
  { klic: 'sluzbySvj', popisek: 'Služby SVJ' },
  { klic: 'energie', popisek: 'Energie' },
  { klic: 'internet', popisek: 'Internet' },
  { klic: 'ostatni', popisek: 'Ostatní' },
];

const VYMER_MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

/* ------------------------------------------------------------ datum */

/** '2026-03-16' → {rok, mesic, den} nebo null. */
function vymerRozlozDatum(datum) {
  const shoda = String(datum || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!shoda) return null;
  const rok = Number(shoda[1]);
  const mesic = Number(shoda[2]);
  const den = Number(shoda[3]);
  if (mesic < 1 || mesic > 12 || den < 1 || den > vymerDniVMesici(rok, mesic)) return null;
  return { rok: rok, mesic: mesic, den: den };
}

function vymerSlozDatum(rok, mesic, den) {
  return String(rok) + '-' + String(mesic).padStart(2, '0') + '-' + String(den).padStart(2, '0');
}

/** Počet dní v měsíci včetně přestupných let (dělitelné 4, ne 100, ale 400 ano). */
function vymerDniVMesici(rok, mesic) {
  const dny = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mesic === 2 && ((rok % 4 === 0 && rok % 100 !== 0) || rok % 400 === 0)) return 29;
  return dny[mesic - 1];
}

/** Pořadové číslo měsíce od roku 0 - kvůli porovnávání a posouvání. */
function vymerPoradiMesice(rok, mesic) { return rok * 12 + (mesic - 1); }

function vymerZPoradi(poradi) {
  return { rok: Math.floor(poradi / 12), mesic: (poradi % 12) + 1 };
}

/** '2026-03-16' → '16. 3. 2026'. */
function vymerDatumCesky(datum) {
  const d = vymerRozlozDatum(datum);
  return d ? d.den + '. ' + d.mesic + '. ' + d.rok : '';
}

/* --------------------------------------------------------- rozvrh */

function vymerCastka(hodnota) {
  if (hodnota === '' || hodnota === null || hodnota === undefined) return 0;
  const cislo = typeof hodnota === 'number'
    ? hodnota
    : parseFloat(String(hodnota).replace(/\s| /g, '').replace(',', '.'));
  return isFinite(cislo) ? cislo : 0;
}

/** Prázdné částky pro všechny položky katalogu. */
function vymerNuly() {
  const out = {};
  VYMER_POLOZKY.forEach((p) => { out[p.klic] = 0; });
  return out;
}

/** Popis období: celý měsíc „březen 2026", část „16. – 31. 3. 2026". */
function vymerPopisObdobi(od, doData, celyMesic) {
  const a = vymerRozlozDatum(od);
  const b = vymerRozlozDatum(doData);
  if (!a || !b) return '';
  if (celyMesic) return VYMER_MESICE[a.mesic - 1] + ' ' + a.rok;
  return a.den + '. – ' + b.den + '. ' + b.mesic + '. ' + b.rok;
}

/**
 * Rozvrh plateb.
 *
 * zadani = {
 *   zacatek, konec,          'RRRR-MM-DD'; konec '' = doba neurčitá
 *   mesicuNeurcito,          kolik měsíců vypsat u doby neurčité (výchozí 12)
 *   polozky: { najem, sluzbySvj, energie, internet, ostatni },
 *   kauce, splatnostKauce,
 *   denSplatnosti,           den v měsíci (výchozí 15)
 *   mena
 * }
 *
 * Vrací { radky, soucty, mena, poznamky, chyby }. Když chybí začátek nebo
 * nájem, vrátí se prázdný rozvrh a důvod v `chyby` - výměr se pak
 * nevystaví. Prázdná tabulka by vypadala jako „nic se neplatí".
 */
function rozvrhPlateb(zadani) {
  const z = zadani || {};
  const chyby = [];
  const poznamky = [];
  const zacatek = vymerRozlozDatum(z.zacatek);
  if (!zacatek) chyby.push('Chybí začátek nájmu.');

  const polozky = {};
  VYMER_POLOZKY.forEach((p) => { polozky[p.klic] = vymerCastka((z.polozky || {})[p.klic]); });
  if (!polozky.najem) chyby.push('Chybí měsíční nájemné.');
  if (chyby.length) {
    return { radky: [], polozky: [], soucty: null, mena: z.mena || 'CZK', poznamky: poznamky, chyby: chyby };
  }

  let konec = vymerRozlozDatum(z.konec);
  if (!konec) {
    const mesicu = Number(z.mesicuNeurcito) || 12;
    const posledni = vymerZPoradi(vymerPoradiMesice(zacatek.rok, zacatek.mesic) + mesicu - 1);
    konec = {
      rok: posledni.rok,
      mesic: posledni.mesic,
      den: vymerDniVMesici(posledni.rok, posledni.mesic),
    };
    poznamky.push('Nájem je na dobu neurčitou – výměr je vypsaný na ' + mesicu
      + ' měsíců dopředu a po jejich uplynutí se vystaví nový.');
  }
  if (vymerPoradiMesice(konec.rok, konec.mesic) < vymerPoradiMesice(zacatek.rok, zacatek.mesic)
    || (vymerPoradiMesice(konec.rok, konec.mesic) === vymerPoradiMesice(zacatek.rok, zacatek.mesic)
      && konec.den < zacatek.den)) {
    return {
      radky: [], polozky: [], soucty: null, mena: z.mena || 'CZK', poznamky: poznamky,
      chyby: ['Konec nájmu je dřív než začátek.'],
    };
  }

  const denSplatnosti = Number(z.denSplatnosti) || 15;
  const radky = [];

  const kauce = vymerCastka(z.kauce);
  if (kauce > 0) {
    const splatnost = vymerRozlozDatum(z.splatnostKauce)
      ? z.splatnostKauce
      : vymerSlozDatum(zacatek.rok, zacatek.mesic, zacatek.den);
    radky.push({
      druh: 'kauce',
      popis: 'Jistota (kauce)',
      obdobiOd: '', obdobiDo: '',
      dnu: 0, dnuVMesici: 0, celyMesic: false,
      // Nuly se vyrábějí Z KATALOGU, ne ručním výčtem: ručně psaný seznam
      // se při přidání položky rozejde a součet vyjde NaN - tiše, protože
      // NaN se v tabulce vytiskne jako prázdno.
      castky: vymerNuly(),
      kauce: kauce,
      celkem: kauce,
      splatnost: splatnost,
    });
  }

  const prvni = vymerPoradiMesice(zacatek.rok, zacatek.mesic);
  const posledni = vymerPoradiMesice(konec.rok, konec.mesic);
  let bylaPomernaCast = false;

  for (let poradi = prvni; poradi <= posledni; poradi++) {
    const m = vymerZPoradi(poradi);
    const dnuVMesici = vymerDniVMesici(m.rok, m.mesic);
    const odDne = poradi === prvni ? zacatek.den : 1;
    const doDne = poradi === posledni ? konec.den : dnuVMesici;
    const dnu = doDne - odDne + 1;
    const celyMesic = dnu === dnuVMesici;
    if (!celyMesic) bylaPomernaCast = true;

    const castky = {};
    let celkem = 0;
    VYMER_POLOZKY.forEach((p) => {
      const mesicni = polozky[p.klic];
      const castka = celyMesic ? mesicni : Math.round((mesicni / dnuVMesici) * dnu);
      castky[p.klic] = castka;
      celkem += castka;
    });

    const od = vymerSlozDatum(m.rok, m.mesic, odDne);
    const doData = vymerSlozDatum(m.rok, m.mesic, doDne);
    let splatnost = vymerSlozDatum(m.rok, m.mesic, Math.min(denSplatnosti, dnuVMesici));
    if (splatnost < od) splatnost = od;

    radky.push({
      druh: celyMesic ? 'mesic' : 'pomerne',
      popis: vymerPopisObdobi(od, doData, celyMesic),
      obdobiOd: od, obdobiDo: doData,
      dnu: dnu, dnuVMesici: dnuVMesici, celyMesic: celyMesic,
      castky: castky,
      kauce: 0,
      celkem: celkem,
      splatnost: splatnost,
    });
  }

  const soucty = { kauce: 0, celkem: 0 };
  VYMER_POLOZKY.forEach((p) => { soucty[p.klic] = 0; });
  radky.forEach((r) => {
    soucty.kauce += r.kauce;
    soucty.celkem += r.celkem;
    VYMER_POLOZKY.forEach((p) => { soucty[p.klic] += r.castky[p.klic]; });
  });

  // Sloupce, které se opravdu vytisknou: jen položky s nějakou částkou.
  const vypsanePolozky = VYMER_POLOZKY.filter((p) => soucty[p.klic] > 0);

  if (bylaPomernaCast) {
    poznamky.push('Neúplný měsíc je spočítaný poměrně: měsíční částka ÷ počet dní '
      + 'v tom měsíci × počet dní nájmu. Každá položka se zaokrouhluje zvlášť '
      + 'na celé koruny.');
  }

  return {
    radky: radky,
    polozky: vypsanePolozky,
    soucty: soucty,
    mena: z.mena || 'CZK',
    poznamky: poznamky,
    chyby: [],
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VYMER_POLOZKY, VYMER_MESICE, rozvrhPlateb, vymerNuly,
    vymerDniVMesici, vymerRozlozDatum, vymerSlozDatum, vymerDatumCesky,
    vymerPopisObdobi, vymerCastka, vymerPoradiMesice, vymerZPoradi,
  };
}
