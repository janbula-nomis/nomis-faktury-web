/*
 * public/qrKod.js
 * QR platba (SPAYD / Short Payment Descriptor) - od v4.85.
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21: *„příloha smlouvy bude platební výměr po jednotlivých
 * měsících (…) a QR kód pro platbu"*.
 *
 * PROČ JE KÓDOVÁNÍ QR PŘÍMO TADY, A NE Z KNIHOVNY
 *
 * Appka nemá build a service worker ji má fungovat i offline, takže si
 * skript z CDN natáhnout nemůže. Kód níž je proto úplný enkodér QR podle
 * ISO/IEC 18004 (bytový režim, verze 1-14) - ne obal cizí knihovny.
 *
 * FORMÁT ŘETĚZCE je SPD 1.0 podle specifikace ČBA (qr-platba.cz):
 *
 *   SPD*1.0*ACC:<IBAN>*AM:<částka>*CC:CZK*X-VS:<VS>*DT:<RRRRMMDD>*MSG:<text>
 *
 *   ACC   povinné, IBAN (max 46 znaků i s BIC)
 *   AM    max 10 znaků, tečka jako desetinná čárka, max 2 desetinná místa
 *   CC    3 znaky, ISO 4217
 *   X-VS  max 10 znaků, JEN ČÍSLICE
 *   DT    8 znaků, RRRRMMDD
 *   MSG   max 60 znaků, bez hvězdičky
 *
 * VARIABILNÍ SYMBOL: „45_695" ANI „01a_2236" DO BANKY NEJDOU
 *
 * Jan se 2026-08-21 ptal, jestli jeho značení může být pro banku. Nemůže:
 * variabilní symbol je podle bankovního standardu **celé číslo, nejvýš
 * deset číslic**. Podtržítko ani písmeno v něm být nesmí - banka platbu
 * buď odmítne, nebo symbol utne a platba se nespáruje.
 *
 * Proto appka rozlišuje dvě věci, které vypadají podobně:
 *
 *   Variabilni_symbol  … pro banku a do QR. Jen číslice.
 *   Oznaceni_platby    … Janův čitelný tvar „01a_2236". Jde do textu
 *                         platby (MSG) a tiskne se na výměr, aby nájemník
 *                         poznal, co platí. Pro párování NENÍ.
 *
 * Převod (potvrdil Jan 2026-08-21): jednotka na tři číslice, kde písmeno
 * je pořadí (a=1, b=2, c=3), dům na čtyři číslice.
 *
 *   01a_2236  →  011 2236  →  0112236
 *   45_695    →  450 0695  →  4500695
 *
 * IBAN SE DOPOČÍTÁVÁ Z ČÍSLA ÚČTU
 *
 * V listu Pronajimatele je účet v domácím tvaru („7631112/0800"), SPD chce
 * IBAN. Kontrolní číslice se počítají mod 97 podle ISO 13616. Funkce je
 * ověřená na třech IBANech, které Jan poslal sám (viz test-v485.js):
 *
 *   11002722/0800    → CZ2808000000000011002722
 *   2846678359/0800  → CZ0408000000002846678359
 *   8355682/0800     → CZ2308000000000008355682
 *
 * Když číslo účtu nejde přečíst, vrátí se prázdno a **QR se nevykreslí**.
 * Prázdné místo řekne „appka to neví"; QR s vymyšleným účtem by řeklo
 * „zaplať sem" a peníze by šly cizímu.
 */

/* ---------------------------------------------------------------- IBAN */

/**
 * Domácí číslo účtu → IBAN. '' když se to přečíst nedá.
 * Bere tvary '7631112/0800', '19-2000145399/0800' (předčíslí) i hotový IBAN.
 *
 * DRUHÁ KOPIE `ucetNaIban()` z lib/qrPlatba.js. Prohlížeč neumí `require`,
 * takže tenhle výpočet v appce nutně existuje dvakrát - stejně jako
 * `jeFirma` / `dokJeFirma`. **test-v485.js proto obě kopie porovnává na
 * seznamu účtů.** Kdyby se rozešly, QR ve výměru by poslalo peníze jinam
 * než QR u dokladu, a nikdo by si toho nevšiml.
 *
 * (Rozvrh plateb v public/platebniVymer.js se schválně nedělá takhle -
 * ten je v public/ jen jednou a testy si ho načítají přímo.)
 */
function ucetNaIban(ucet) {
  const text = String(ucet || '').trim().replace(/\s+/g, '');
  if (/^[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}$/.test(text)) return text.toUpperCase();
  const shoda = text.match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
  if (!shoda) return '';
  const predcisli = (shoda[1] || '').padStart(6, '0');
  const cislo = shoda[2].padStart(10, '0');
  const banka = shoda[3].padStart(4, '0');
  const bban = banka + predcisli + cislo;
  // ISO 13616: BBAN + kód země + '00', písmena na čísla (C=12, Z=35)
  const kontrola = 98 - mod97(bban + '123500');
  return 'CZ' + String(kontrola).padStart(2, '0') + bban;
}

/** mod 97 nad dlouhým číslem po částech (nevejde se do Number). */
function mod97(cislice) {
  let zbytek = 0;
  for (let i = 0; i < cislice.length; i++) {
    zbytek = (zbytek * 10 + (cislice.charCodeAt(i) - 48)) % 97;
  }
  return zbytek;
}

/** Kontrola už hotového IBANu (přesun prvních 4 znaků dozadu, mod 97 = 1). */
function ibanSedi(iban) {
  const text = String(iban || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(text)) return false;
  const prehozeno = text.slice(4) + text.slice(0, 4);
  let cislice = '';
  for (const znak of prehozeno) {
    cislice += /\d/.test(znak) ? znak : String(znak.charCodeAt(0) - 55);
  }
  return mod97(cislice) === 1;
}

/* ----------------------------------------------------- variabilní symbol */

/**
 * Janovo označení → variabilní symbol pro banku.
 * '01a_2236' → '0112236',  '45_695' → '4500695'.
 * '' když z toho číslo udělat nejde - to je odpověď, ne chyba.
 */
function vsZOznaceni(oznaceni) {
  const shoda = String(oznaceni || '').trim().match(/^0*(\d{1,3})([a-zA-Z]?)[_\-\/](\d{1,4})$/);
  if (!shoda) return '';
  const poradi = shoda[2] ? String(shoda[2].toLowerCase().charCodeAt(0) - 96) : '0';
  if (poradi.length > 1) return '';
  const jednotka = (shoda[1] + poradi).padStart(3, '0');
  if (jednotka.length > 3) return '';
  return jednotka + shoda[3].padStart(4, '0');
}

/** Variabilní symbol je platný, jen když je to nejvýš deset číslic. */
function vsJePlatny(vs) {
  return /^\d{1,10}$/.test(String(vs || '').trim());
}

/* ------------------------------------------------------------ SPD řetězec */

const SPD_DIAKRITIKA = {
  á: 'A', č: 'C', ď: 'D', é: 'E', ě: 'E', í: 'I', ň: 'N', ó: 'O', ř: 'R',
  š: 'S', ť: 'T', ú: 'U', ů: 'U', ý: 'Y', ž: 'Z',
};

/**
 * Text do MSG: bez diakritiky, velkými, jen doporučené znaky, max 60.
 * Specifikace sice dovolí ISO-8859-1, ale doporučuje užší sadu - a čtečka
 * v bance je to poslední místo, kde chceme zkoušet, co ještě projde.
 */
function spdText(text, delka) {
  const bezDiakritiky = String(text || '')
    .split('')
    .map((z) => SPD_DIAKRITIKA[z.toLowerCase()] || z)
    .join('')
    .toUpperCase();
  return bezDiakritiky.replace(/[^0-9A-Z $%+\-./:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, delka || 60);
}

/** Částka do AM: tečka, dvě desetinná místa. '' když to není číslo. */
function spdCastka(castka) {
  const cislo = typeof castka === 'number' ? castka : parseFloat(String(castka).replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(cislo) || cislo <= 0) return '';
  return cislo.toFixed(2);
}

/** '2026-09-01' → '20260901'. '' když datum nedává smysl. */
function spdDatum(datum) {
  const shoda = String(datum || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return shoda ? shoda[1] + shoda[2] + shoda[3] : '';
}

/**
 * Sestaví SPD řetězec. Vrací '' (a NEVYKRESLÍ se QR), když chybí účet
 * nebo částka - to jsou jediné dva údaje, bez kterých je QR platba
 * nebezpečná, ne jen neúplná.
 */
function spdRetezec(platba) {
  const p = platba || {};
  const iban = p.iban || ucetNaIban(p.ucet);
  const castka = spdCastka(p.castka);
  if (!iban || !ibanSedi(iban) || !castka) return '';

  const casti = ['SPD', '1.0', 'ACC:' + iban, 'AM:' + castka, 'CC:' + (p.mena || 'CZK')];
  if (vsJePlatny(p.vs)) casti.push('X-VS:' + String(p.vs).trim());
  const dt = spdDatum(p.splatnost);
  if (dt) casti.push('DT:' + dt);
  const msg = spdText(p.zprava, 60);
  if (msg) casti.push('MSG:' + msg);
  const rn = spdText(p.prijemce, 35);
  if (rn) casti.push('RN:' + rn);
  return casti.join('*');
}

/* -------------------------------------------------------- QR: GF(256) */

const QR_EXP = new Array(512);
const QR_LOG = new Array(256);
(function pripravGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    QR_EXP[i] = x;
    QR_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // generující polynom x^8+x^4+x^3+x^2+1
  }
  for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255];
})();

function gfNasob(a, b) {
  if (a === 0 || b === 0) return 0;
  return QR_EXP[QR_LOG[a] + QR_LOG[b]];
}

/** Generující polynom Reed-Solomon stupně `stupen`. */
function rsGenerator(stupen) {
  let poly = [1];
  for (let i = 0; i < stupen; i++) {
    const dalsi = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      dalsi[j] ^= poly[j];
      dalsi[j + 1] ^= gfNasob(poly[j], QR_EXP[i]);
    }
    poly = dalsi;
  }
  return poly;
}

/** Opravné kódové znaky bloku (dělení polynomů v GF(256)). */
function rsZbytek(data, pocetEc) {
  const gen = rsGenerator(pocetEc);
  const zbytek = new Array(pocetEc).fill(0);
  for (let i = 0; i < data.length; i++) {
    const faktor = data[i] ^ zbytek[0];
    zbytek.shift();
    zbytek.push(0);
    if (faktor !== 0) {
      for (let j = 0; j < pocetEc; j++) {
        zbytek[j] ^= gfNasob(gen[j + 1], faktor);
      }
    }
  }
  return zbytek;
}

/* ------------------------------------------------------ QR: tabulky */

/*
 * [opravných znaků na blok, bloků skupiny 1, dat ve skupině 1,
 *  bloků skupiny 2, dat ve skupině 2] pro verze 1-14.
 *
 * Kontrola, která tabulku hlídá (viz test-v485.js): součet
 * data + opravné musí vyjít na celkový počet kódových znaků verze
 * (26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581).
 */
const QR_BLOKY = {
  L: [
    [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0], [18, 2, 68, 2, 69], [20, 4, 81, 0, 0], [24, 2, 92, 2, 93],
    [26, 4, 107, 0, 0], [30, 3, 115, 1, 116],
  ],
  M: [
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37], [26, 4, 43, 1, 44], [30, 1, 50, 4, 51], [22, 6, 36, 2, 37],
    [22, 8, 37, 1, 38], [24, 4, 40, 5, 41],
  ],
  Q: [
    [13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0],
    [18, 2, 15, 2, 16], [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19],
    [20, 4, 16, 4, 17], [24, 6, 19, 2, 20], [28, 4, 22, 4, 23], [26, 4, 20, 6, 21],
    [24, 8, 20, 4, 21], [20, 11, 16, 5, 17],
  ],
  H: [
    [17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0],
    [22, 2, 11, 2, 12], [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15],
    [24, 4, 12, 4, 13], [28, 6, 15, 2, 16], [24, 3, 12, 8, 13], [28, 7, 14, 4, 15],
    [22, 12, 11, 4, 12], [24, 11, 12, 5, 13],
  ],
};

const QR_ZAROVNANI = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
];

const QR_UROVEN_BITY = { L: 1, M: 0, Q: 3, H: 2 };

/** Kolik zbylých bitů se za data doplní (verze 2-6 sedm, 7-13 nula, 14 tři). */
function qrZbyleBity(verze) {
  if (verze === 1) return 0;
  if (verze <= 6) return 7;
  if (verze <= 13) return 0;
  return 3;
}

/* ------------------------------------------------- QR: sestavení dat */

function qrDatovychZnaku(verze, uroven) {
  const b = QR_BLOKY[uroven][verze - 1];
  return b[1] * b[2] + b[3] * b[4];
}

/** Nejmenší verze, do které se text vejde. 0 = nevejde se nikam. */
function qrVerzeProDelku(pocetBajtu, uroven) {
  for (let verze = 1; verze <= 14; verze++) {
    const hlavicka = 4 + (verze <= 9 ? 8 : 16);
    const bitu = hlavicka + pocetBajtu * 8;
    if (bitu <= qrDatovychZnaku(verze, uroven) * 8) return verze;
  }
  return 0;
}

/** Text → bajty v ISO-8859-1 (SPD jinou sadu nepoužívá). */
function qrBajty(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const kod = text.charCodeAt(i);
    out.push(kod > 255 ? 0x3f : kod); // '?' - do SPD se takový znak stejně nedostane
  }
  return out;
}

function qrKodoveZnaky(text, verze, uroven) {
  const bajty = qrBajty(text);
  const bity = [];
  const pridej = (hodnota, pocet) => {
    for (let i = pocet - 1; i >= 0; i--) bity.push((hodnota >> i) & 1);
  };
  pridej(0b0100, 4);                        // bytový režim
  pridej(bajty.length, verze <= 9 ? 8 : 16);
  bajty.forEach((b) => pridej(b, 8));

  const kapacitaBitu = qrDatovychZnaku(verze, uroven) * 8;
  for (let i = 0; i < 4 && bity.length < kapacitaBitu; i++) bity.push(0);
  while (bity.length % 8 !== 0) bity.push(0);

  const znaky = [];
  for (let i = 0; i < bity.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bity[i + j];
    znaky.push(b);
  }
  const vypln = [0xec, 0x11];
  let i = 0;
  while (znaky.length < qrDatovychZnaku(verze, uroven)) znaky.push(vypln[i++ % 2]);
  return znaky;
}

/** Rozdělení na bloky, RS a prokládání do výsledného proudu. */
function qrProud(znaky, verze, uroven) {
  const [pocetEc, bloku1, dat1, bloku2, dat2] = QR_BLOKY[uroven][verze - 1];
  const bloky = [];
  let pozice = 0;
  for (let i = 0; i < bloku1; i++) {
    bloky.push(znaky.slice(pozice, pozice + dat1));
    pozice += dat1;
  }
  for (let i = 0; i < bloku2; i++) {
    bloky.push(znaky.slice(pozice, pozice + dat2));
    pozice += dat2;
  }
  const ec = bloky.map((blok) => rsZbytek(blok, pocetEc));

  const proud = [];
  const nejdelsi = Math.max(dat1, dat2);
  for (let i = 0; i < nejdelsi; i++) {
    bloky.forEach((blok) => { if (i < blok.length) proud.push(blok[i]); });
  }
  for (let i = 0; i < pocetEc; i++) {
    ec.forEach((blok) => proud.push(blok[i]));
  }
  return proud;
}

/* --------------------------------------------------- QR: mřížka */

function qrPrazdnaMrizka(velikost) {
  const m = [];
  for (let r = 0; r < velikost; r++) m.push(new Array(velikost).fill(null));
  return m;
}

function qrHledacek(m, radek, sloupec) {
  for (let r = -1; r <= 7; r++) {
    for (let s = -1; s <= 7; s++) {
      const rr = radek + r;
      const ss = sloupec + s;
      if (rr < 0 || ss < 0 || rr >= m.length || ss >= m.length) continue;
      const vnejsi = r >= 0 && r <= 6 && (s === 0 || s === 6);
      const vodorovny = s >= 0 && s <= 6 && (r === 0 || r === 6);
      const stred = r >= 2 && r <= 4 && s >= 2 && s <= 4;
      m[rr][ss] = (vnejsi || vodorovny || stred) ? 1 : 0;
    }
  }
}

function qrFunkcniVzory(m, verze) {
  const velikost = m.length;
  qrHledacek(m, 0, 0);
  qrHledacek(m, 0, velikost - 7);
  qrHledacek(m, velikost - 7, 0);

  for (let i = 8; i < velikost - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  /*
   * Zarovnávací čtverečky. Vynechávají se JEN ty tři, které by padly na
   * hledáčky v rozích - ne ty, které leží na časovací řadě. Kdyby se
   * vynechaly i ty (a stačí k tomu podmínka „tady už něco je"), čtečka
   * čte data o modul vedle a kód nenačte vůbec.
   */
  const stredy = QR_ZAROVNANI[verze - 1];
  const posledni = stredy.length - 1;
  stredy.forEach((r, i) => stredy.forEach((s, j) => {
    const roh = (i === 0 && j === 0) || (i === 0 && j === posledni) || (i === posledni && j === 0);
    if (roh) return;
    for (let dr = -2; dr <= 2; dr++) {
      for (let ds = -2; ds <= 2; ds++) {
        const kraj = Math.max(Math.abs(dr), Math.abs(ds));
        m[r + dr][s + ds] = (kraj === 1) ? 0 : 1;
      }
    }
  }));

  m[velikost - 8][8] = 1; // tmavý modul

  // místa pro formát
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][velikost - 1 - i] === null) m[8][velikost - 1 - i] = 0;
    if (m[velikost - 1 - i][8] === null) m[velikost - 1 - i][8] = 0;
  }

  if (verze >= 7) {
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3);
      const s = i % 3;
      m[r][velikost - 11 + s] = 0;
      m[velikost - 11 + s][r] = 0;
    }
  }
}

/** Které moduly jsou funkční (nesmí se do nich psát ani maskovat). */
function qrMaskaFunkci(verze) {
  const velikost = verze * 4 + 17;
  const m = qrPrazdnaMrizka(velikost);
  qrFunkcniVzory(m, verze);
  return m.map((radek) => radek.map((h) => h !== null));
}

function qrZapisData(m, funkce, proud) {
  const velikost = m.length;
  const bity = [];
  proud.forEach((znak) => {
    for (let i = 7; i >= 0; i--) bity.push((znak >> i) & 1);
  });
  let index = 0;
  let nahoru = true;
  for (let sloupec = velikost - 1; sloupec > 0; sloupec -= 2) {
    if (sloupec === 6) sloupec--; // sloupec časování se přeskakuje
    for (let k = 0; k < velikost; k++) {
      const radek = nahoru ? velikost - 1 - k : k;
      for (let d = 0; d < 2; d++) {
        const s = sloupec - d;
        if (funkce[radek][s]) continue;
        m[radek][s] = index < bity.length ? bity[index] : 0;
        index++;
      }
    }
    nahoru = !nahoru;
  }
}

function qrMaskaBit(maska, radek, sloupec) {
  switch (maska) {
    case 0: return (radek + sloupec) % 2 === 0;
    case 1: return radek % 2 === 0;
    case 2: return sloupec % 3 === 0;
    case 3: return (radek + sloupec) % 3 === 0;
    case 4: return (Math.floor(radek / 2) + Math.floor(sloupec / 3)) % 2 === 0;
    case 5: return ((radek * sloupec) % 2) + ((radek * sloupec) % 3) === 0;
    case 6: return (((radek * sloupec) % 2) + ((radek * sloupec) % 3)) % 2 === 0;
    default: return (((radek + sloupec) % 2) + ((radek * sloupec) % 3)) % 2 === 0;
  }
}

/** BCH(15,5) pro formát, BCH(18,6) pro verzi. */
function qrFormatBity(uroven, maska) {
  const data = (QR_UROVEN_BITY[uroven] << 3) | maska;
  let zbytek = data << 10;
  for (let i = 14; i >= 10; i--) {
    if (zbytek & (1 << i)) zbytek ^= 0x537 << (i - 10);
  }
  return ((data << 10) | zbytek) ^ 0x5412;
}

function qrVerzeBity(verze) {
  let zbytek = verze << 12;
  for (let i = 17; i >= 12; i--) {
    if (zbytek & (1 << i)) zbytek ^= 0x1f25 << (i - 12);
  }
  return (verze << 12) | zbytek;
}

function qrZapisFormat(m, uroven, maska) {
  const velikost = m.length;
  const bity = qrFormatBity(uroven, maska);
  for (let i = 0; i < 15; i++) {
    const bit = (bity >> i) & 1;
    // první kopie kolem levého horního hledáčku
    if (i < 6) m[8][i] = bit;
    else if (i === 6) m[8][7] = bit;
    else if (i === 7) m[8][8] = bit;
    else if (i === 8) m[7][8] = bit;
    else m[14 - i][8] = bit;
    /*
     * Druhá kopie: bity 0-6 do SLOUPCE 8 (řádky odspodu) a bity 7-14 do
     * ŘÁDKU 8 (sloupce zprava). Zlom je na sedmi, ne na osmi - modul
     * [velikost-8][8] je totiž TMAVÝ MODUL, ne formát. Když se sem psalo
     * osm bitů, osmý z nich se hned přepsal tmavým modulem a v řádku 8
     * naopak jedno místo zůstalo prázdné: druhá kopie formátu pak měla
     * dvě chyby. Čtečka to většinou opraví (BCH unese tři), takže se to
     * pozná až na kódu, který se z nějakého důvodu čte hůř.
     */
    if (i < 7) m[velikost - 1 - i][8] = bit;
    else m[8][velikost - 15 + i] = bit;
  }
  m[velikost - 8][8] = 1;
}

function qrZapisVerzi(m, verze) {
  if (verze < 7) return;
  const velikost = m.length;
  const bity = qrVerzeBity(verze);
  for (let i = 0; i < 18; i++) {
    const bit = (bity >> i) & 1;
    const r = Math.floor(i / 3);
    const s = i % 3;
    m[r][velikost - 11 + s] = bit;
    m[velikost - 11 + s][r] = bit;
  }
}

/* --------------------------------------------------- QR: penalizace */

function qrPenalizace(m) {
  const velikost = m.length;
  let trest = 0;

  const rada = (cti) => {
    for (let a = 0; a < velikost; a++) {
      let beh = 1;
      for (let b = 1; b < velikost; b++) {
        if (cti(a, b) === cti(a, b - 1)) {
          beh++;
        } else {
          if (beh >= 5) trest += 3 + (beh - 5);
          beh = 1;
        }
      }
      if (beh >= 5) trest += 3 + (beh - 5);
    }
  };
  rada((r, s) => m[r][s]);
  rada((s, r) => m[r][s]);

  for (let r = 0; r < velikost - 1; r++) {
    for (let s = 0; s < velikost - 1; s++) {
      const h = m[r][s];
      if (h === m[r][s + 1] && h === m[r + 1][s] && h === m[r + 1][s + 1]) trest += 3;
    }
  }

  const vzor1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const vzor2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const sedi = (cti, a, b, vzor) => {
    for (let i = 0; i < 11; i++) if (cti(a, b + i) !== vzor[i]) return false;
    return true;
  };
  for (let a = 0; a < velikost; a++) {
    for (let b = 0; b + 11 <= velikost; b++) {
      if (sedi((x, y) => m[x][y], a, b, vzor1)) trest += 40;
      if (sedi((x, y) => m[x][y], a, b, vzor2)) trest += 40;
      if (sedi((x, y) => m[y][x], a, b, vzor1)) trest += 40;
      if (sedi((x, y) => m[y][x], a, b, vzor2)) trest += 40;
    }
  }

  let tmavych = 0;
  m.forEach((radek) => radek.forEach((h) => { if (h) tmavych++; }));
  const procent = (tmavych * 100) / (velikost * velikost);
  trest += Math.floor(Math.abs(procent - 50) / 5) * 10;
  return trest;
}

/* ------------------------------------------------------ QR: veřejné */

/**
 * Text → mřížka 0/1 (bez klidové zóny). null, když se text nevejde.
 */
function qrModuly(text, uroven) {
  const ecc = QR_BLOKY[uroven] ? uroven : 'M';
  const bajtu = qrBajty(String(text)).length;
  const verze = qrVerzeProDelku(bajtu, ecc);
  if (!verze) return null;

  const znaky = qrKodoveZnaky(String(text), verze, ecc);
  const proud = qrProud(znaky, verze, ecc);
  const funkce = qrMaskaFunkci(verze);

  let nejlepsi = null;
  let nejlepsiTrest = Infinity;
  for (let maska = 0; maska < 8; maska++) {
    const m = qrPrazdnaMrizka(verze * 4 + 17);
    qrFunkcniVzory(m, verze);
    qrZapisData(m, funkce, proud);
    for (let r = 0; r < m.length; r++) {
      for (let s = 0; s < m.length; s++) {
        if (!funkce[r][s] && qrMaskaBit(maska, r, s)) m[r][s] ^= 1;
      }
    }
    qrZapisFormat(m, ecc, maska);
    qrZapisVerzi(m, verze);
    const trest = qrPenalizace(m);
    if (trest < nejlepsiTrest) {
      nejlepsiTrest = trest;
      nejlepsi = m;
    }
  }
  return nejlepsi;
}

/**
 * Text → SVG. Kreslí se jako jedna cesta ze čtverců: v tisku se tak
 * nerozjedou mezery mezi moduly, což je u čtečky rozdíl mezi „načteno"
 * a „zkuste to znovu".
 */
function qrSvg(text, volby) {
  const v = volby || {};
  const moduly = qrModuly(text, v.uroven || 'M');
  if (!moduly) return '';
  const okraj = v.okraj === undefined ? 4 : v.okraj;
  const velikost = moduly.length + okraj * 2;
  let cesta = '';
  for (let r = 0; r < moduly.length; r++) {
    for (let s = 0; s < moduly.length; s++) {
      if (moduly[r][s]) cesta += 'M' + (s + okraj) + ' ' + (r + okraj) + 'h1v1h-1z';
    }
  }
  const px = v.px || 96;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px
    + '" viewBox="0 0 ' + velikost + ' ' + velikost + '" shape-rendering="crispEdges" role="img"'
    + ' aria-label="' + (v.popis || 'QR platba') + '">'
    + '<rect width="' + velikost + '" height="' + velikost + '" fill="#ffffff"/>'
    + '<path d="' + cesta + '" fill="#000000"/></svg>';
}

/** QR pro jednu platbu. '' když nejde sestavit SPD - viz spdRetezec(). */
function qrPlatbaSvg(platba, volby) {
  const spd = spdRetezec(platba);
  if (!spd) return '';
  return qrSvg(spd, volby);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ucetNaIban, ibanSedi, mod97, vsZOznaceni, vsJePlatny,
    spdRetezec, spdText, spdCastka, spdDatum,
    qrModuly, qrSvg, qrPlatbaSvg, qrVerzeProDelku, QR_BLOKY,
  };
}
