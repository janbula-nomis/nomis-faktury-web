/**
 * lib/bankImportTabular.js
 * Import bankovního výpisu z CSV nebo XLS/XLSX (na rozdíl od George Business
 * JSON exportu, viz lib/bankHelpers.js). Bankovní CSV/XLS exporty se liší
 * banku od banky (jiné názvy sloupců, pořadí, jazyk) - appka proto sloupce
 * hledá podle seznamu běžných aliasů (datum/date/booking, částka/amount...),
 * ne podle pevné pozice. Tenhle seznam byl sestaven BEZ reálné ukázky
 * Janova CSV/XLS exportu (na rozdíl od George JSON parseru, který byl
 * ověřený na reálném souboru) - pokud appka na Janův skutečný export
 * nesedí, je potřeba mu poslat ukázkový soubor a seznam aliasů doladit
 * (viz README-DEPLOY.md, sekce o importu výpisů).
 *
 * Výstup obou funkcí (parsujCsvVypis/parsujXlsxVypis) je stejný tvar
 * `{ polozky, ownerAccountNumber: '', ownerAccountTitle: '' }` jako
 * parsujGeorgeExport, aby zbytek importní logiky v netlify/functions/banka.js
 * (dedup, párování, "Bez dokladu") fungoval beze změny bez ohledu na to,
 * z jakého formátu appka výpis načetla. ownerAccountNumber/Title appka u
 * CSV/XLS nezná (na rozdíl od George JSON) - kontrola shody bankovního účtu
 * firmy (viz banka.js, "účet nesedí") se tak u CSV/XLS importu neprovádí.
 *
 * Oprava v3.11: appka dřív brala jako hlavičkový řádek vždycky první řádek
 * souboru - reálný export (viz Jan, NOMIS & Homes) ale měl na začátku pár
 * řádků s metadaty výpisu (název účtu/firmy), takže appka hledala sloupce
 * "Datum"/"Částka" na špatném místě a import selhal. Appka teď prohledá
 * prvních pár řádků a jako hlavičku vezme první, který má rozpoznatelný
 * sloupec s datem i s částkou zároveň (viz najdiHlavickovyRadek níž).
 * Zároveň appka na kartě Bankovní výpisy dostala ruční přepínač formátu
 * (JSON/CSV/XLS), aby se nemuselo spoléhat jen na příponu souboru.
 */
const crypto = require('crypto');
const { parsujCastkuZListu } = require('./bankHelpers');

// Aliasy sloupců - appka porovnává s normalizovaným textem hlavičky (malá
// písmena, bez diakritiky, mezery a podtržítka sjednocené). Pořadí uvnitř
// pole nehraje roli, appka bere první nalezenou shodu.
const ALIASY_SLOUPCU = {
  datum: ['datum', 'date', 'den zauctovani', 'datum zauctovani', 'datum splatnosti', 'booking'],
  castka: ['castka', 'amount', 'objem', 'value', 'castka v uctu firmy', 'castka transakce'],
  mena: ['mena', 'currency', 'mena uctu'],
  // 'item' přidáno 2026-07-23 (Jan poslal reálný export Banc Sabadell,
  // ES22 0081...) - tahle banka (na rozdíl od Janova George/českého
  // exportu) nemá zvlášť sloupec "protiúčet"/"popis", ale JEDEN sloupec
  // "Item" s celým textem pohybu (např. "TRANSFER TO CONTRAPLAGAS
  // AMBIENTAL S.L.") - appka ho mapuje na protistranu, ať shoda jména
  // dodavatele/zákazníka/nájemce (viz lib/bankHelpers.js) v tom textu
  // pořád najde podřetězec, i když appka nedostane čistě jen název firmy.
  protistrana: [
    'protiucet nazev', 'nazev protiuctu', 'protistrana', 'partner', 'partnername',
    'counterparty', 'nazev protistrany', 'obchodnik', 'popis protiuctu', 'item',
  ],
  cislo_uctu_protistrany: [
    'cislo uctu', 'cislo protiuctu', 'protiucet', 'account number', 'iban', 'ucet protistrany',
  ],
  variabilni_symbol: ['vs', 'variabilni symbol', 'variable symbol'],
  konstantni_symbol: ['ks', 'konstantni symbol', 'constant symbol'],
  specificky_symbol: ['ss', 'specificky symbol', 'specific symbol'],
  popis: [
    'popis', 'zprava pro prijemce', 'zprava', 'description', 'note', 'poznamka', 'reference',
    'text pro prijemce',
  ],
  typ_pohybu: ['typ', 'typ pohybu', 'typ transakce', 'transaction type', 'druh transakce', 'kategorie pohybu'],
};

function normalizujText(hodnota) {
  return String(hodnota === null || hodnota === undefined ? '' : hodnota)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // odstraneni diakritiky (kombinujici znaky po NFD normalizaci)
    .replace(/[_/.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function najdiIndexSloupce(normalizovaneHlavicky, aliasy) {
  for (let i = 0; i < normalizovaneHlavicky.length; i += 1) {
    if (aliasy.includes(normalizovaneHlavicky[i])) return i;
  }
  // Fallback - i částečná shoda (např. hlavička "Datum zaúčtování transakce"
  // obsahuje alias "datum zauctovani" jako podřetězec).
  for (let i = 0; i < normalizovaneHlavicky.length; i += 1) {
    if (aliasy.some((a) => normalizovaneHlavicky[i].includes(a))) return i;
  }
  return -1;
}

// Oprava v3.11: reálné bankovní CSV/XLS exporty (viz Janův George Business
// export pro NOMIS & Homes) často mají PŘED skutečnou tabulkou pohybů pár
// úvodních řádků s metadaty výpisu (název účtu, název firmy, období apod.) -
// appka dřív slepě brala jako hlavičku VŽDY úplně první řádek souboru, což
// u takového souboru selhalo ("nenašla sloupec s datem a/nebo částkou",
// nalezené "hlavičky" byly ve skutečnosti jen "NOMIS & Homes CZK" / "NOMIS
// & Homes s.r.o."). Appka teď prohledá prvních pár řádků souboru a jako
// hlavičku použije první řádek, který má rozpoznatelný sloupec s datem
// I s částkou zároveň - teprve řádky ZA ním appka bere jako data. Pokud
// nenajde žádný takový řádek, spadne zpátky na staré chování (první řádek),
// ať appka pořád vyhodí to samé srozumitelné chybové hlášení jako dřív.
const MAX_RADKU_HLEDANI_HLAVICKY = 15;

function najdiHlavickovyRadek(vsechnyRadky) {
  const hranice = Math.min(vsechnyRadky.length, MAX_RADKU_HLEDANI_HLAVICKY);
  for (let i = 0; i < hranice; i += 1) {
    const normalizovane = vsechnyRadky[i].map(normalizujText);
    const maDatum = najdiIndexSloupce(normalizovane, ALIASY_SLOUPCU.datum) !== -1;
    const maCastku = najdiIndexSloupce(normalizovane, ALIASY_SLOUPCU.castka) !== -1;
    if (maDatum && maCastku) return i;
  }
  return 0;
}

// Oprava 2026-07-23 (Jan: "a ještě app nerozeznává EUR a Kč ve bankovních
// výpisech", reálný příklad: export Banc Sabadell) - appka dřív u CSV/XLS
// měnu hledala VÝHRADNĚ jako sloupec v hlavičkovém řádku (mena/currency/
// mena uctu) - pokud výpis měnu jednotlivých POHYBŮ vůbec nesleduje (běžné
// u zahraničních bank, které mají VŽDY jen jeden účet v jedné měně a měnu
// proto appce řeknou jen JEDNOU, v metadatech nad tabulkou pohybů, např.
// "Currency: EUR"), appka potichu defaultovala na CZK pro celý soubor, i
// když šlo o čistě EUR výpis. Appka teď PŘED detekcí hlavičky ještě
// prohledá metadatové řádky (ty PŘED hlavičkou pohybů) na dvojici
// "popisek | hodnota", kde popisek odpovídá měnovému aliasu (currency/
// mena/mena uctu) - nalezenou hodnotu appka použije jako VÝCHOZÍ měnu pro
// všechny řádky, které samy žádný vlastní sloupec s měnou nemají.
function zjistiVychoziMenuVMetadatech(vsechnyRadky, indexHlavickovehoRadku) {
  const hranice = Math.min(indexHlavickovehoRadku, MAX_RADKU_HLEDANI_HLAVICKY);
  for (let i = 0; i < hranice; i += 1) {
    const radek = vsechnyRadky[i] || [];
    for (let sloupec = 0; sloupec < radek.length - 1; sloupec += 1) {
      const popisek = normalizujText(radek[sloupec]);
      if (!popisek) continue;
      const jeMenovyPopisek = ALIASY_SLOUPCU.mena.some((a) => popisek === a || popisek.includes(a));
      if (!jeMenovyPopisek) continue;
      const hodnota = String(radek[sloupec + 1] || '').trim().toUpperCase();
      // Appka bere jen hodnoty, které vypadají jako skutečný kód měny (2-4
      // písmena) - ať appka omylem nevezme jinou náhodnou hodnotu vedle
      // podobně znějícího popisku.
      if (/^[A-Z]{2,4}$/.test(hodnota)) return hodnota;
    }
  }
  return '';
}

/**
 * Excel/serial datum appka zkusí rozpoznat i v běžných textových tvarech
 * (ISO, DD.MM.YYYY, DD/MM/YYYY) - vrací "YYYY-MM-DD", nebo prázdný řetězec,
 * pokud appka datu nerozumí.
 */
function normalizujDatum(hodnota) {
  if (hodnota instanceof Date && !Number.isNaN(hodnota.getTime())) {
    return hodnota.toISOString().slice(0, 10);
  }
  const text = String(hodnota || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const csFormat = text.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (csFormat) {
    const [, den, mesic, rok] = csFormat;
    return rok + '-' + String(mesic).padStart(2, '0') + '-' + String(den).padStart(2, '0');
  }
  return text;
}

/**
 * Sdílená logika pro CSV i XLSX - obojí appka nejdřív převede na pole
 * "hlavičkový řádek" + pole datových řádků (pole buněk), zbytek je stejné.
 */
function radkyNaPolozky(hlavickovyRadek, datoveRadky, vychoziMena) {
  const normalizovaneHlavicky = hlavickovyRadek.map(normalizujText);
  const indexy = {};
  Object.keys(ALIASY_SLOUPCU).forEach((klic) => {
    indexy[klic] = najdiIndexSloupce(normalizovaneHlavicky, ALIASY_SLOUPCU[klic]);
  });

  if (indexy.datum === -1 || indexy.castka === -1) {
    throw new Error(
      'Appka v souboru nenašla sloupec s datem a/nebo částkou (hledala mj. "Datum"/"Date", ' +
        '"Částka"/"Amount") - zkusila i přeskočit prvních pár řádků souboru pro případ, že na ' +
        'začátku jsou jen metadata výpisu (název účtu apod.), ale ani tak nic nenašla. ' +
        'Nalezené hlavičky (v řádku, který appka nakonec zkusila): ' +
        hlavickovyRadek.filter(Boolean).join(', ') + '. ' +
        'Pošlete prosím ukázkový soubor, ať appka pozná správné názvy sloupců.'
    );
  }

  const pocitadloHashu = new Map();

  const polozky = datoveRadky
    .filter((radek) => radek.some((bunka) => String(bunka || '').trim() !== ''))
    .map((radek) => {
      const ziskej = (klic) => (indexy[klic] === -1 ? '' : radek[indexy[klic]]);

      const datum = normalizujDatum(ziskej('datum'));
      const castka = parsujCastkuZListu(ziskej('castka'));
      // Pořadí appka zkouší: (1) vlastní sloupec s měnou u KAŽDÉHO řádku,
      // pokud ho appka v hlavičce našla, (2) měna zjištěná z metadat výpisu
      // (appka celý účet/výpis vede v jedné měně - viz
      // zjistiVychoziMenuVMetadatech výš), (3) CZK jako poslední záchrana.
      const mena = String(ziskej('mena') || vychoziMena || 'CZK').trim() || 'CZK';
      const protistrana = String(ziskej('protistrana') || '').trim();
      const popis = String(ziskej('popis') || '').trim();
      const variabilni_symbol = String(ziskej('variabilni_symbol') || '').trim();
      const konstantni_symbol = String(ziskej('konstantni_symbol') || '').trim();
      const specificky_symbol = String(ziskej('specificky_symbol') || '').trim();
      const typ_pohybu = String(ziskej('typ_pohybu') || '').trim();
      const cislo_uctu_protistrany = String(ziskej('cislo_uctu_protistrany') || '').trim();

      const zaklad = JSON.stringify([
        datum, castka, mena, variabilni_symbol, konstantni_symbol, specificky_symbol,
        protistrana, popis, cislo_uctu_protistrany,
      ]);
      const zakladHash = crypto.createHash('sha256').update(zaklad).digest('hex');
      const dosud = pocitadloHashu.get(zakladHash) || 0;
      pocitadloHashu.set(zakladHash, dosud + 1);
      const hash = dosud === 0 ? zakladHash : zakladHash + ':' + dosud;

      return {
        datum,
        castka,
        mena,
        typ_pohybu,
        protistrana,
        cislo_uctu_protistrany,
        variabilni_symbol,
        konstantni_symbol,
        specificky_symbol,
        popis,
        ownerAccountNumber: '',
        ownerAccountTitle: '',
        hash,
      };
    });

  return { polozky, ownerAccountNumber: '', ownerAccountTitle: '' };
}

/**
 * Jednoduchý CSV parser s podporou uvozovek a automatickou detekcí
 * oddělovače (středník je u českých bankovních CSV export běžnější než
 * čárka, protože čárka bývá desetinný oddělovač).
 */
function rozparsujCsvRadek(radek, oddelovac) {
  const bunky = [];
  let aktualni = '';
  let vUvozovkach = false;
  for (let i = 0; i < radek.length; i += 1) {
    const znak = radek[i];
    if (vUvozovkach) {
      if (znak === '"' && radek[i + 1] === '"') {
        aktualni += '"';
        i += 1;
      } else if (znak === '"') {
        vUvozovkach = false;
      } else {
        aktualni += znak;
      }
    } else if (znak === '"') {
      vUvozovkach = true;
    } else if (znak === oddelovac) {
      bunky.push(aktualni);
      aktualni = '';
    } else {
      aktualni += znak;
    }
  }
  bunky.push(aktualni);
  return bunky.map((b) => b.trim());
}

function parsujCsvVypis(surovyText) {
  const text = String(surovyText || '').replace(/^\uFEFF/, ''); // BOM
  const radkyText = text.split(/\r\n|\r|\n/).filter((r) => r.trim() !== '');
  if (radkyText.length < 2) {
    throw new Error('CSV soubor neobsahuje žádné datové řádky (jen hlavičku, nebo je prázdný).');
  }
  // Oddělovač appka pozná podle prvního řádku souboru - i kdyby to byl jen
  // úvodní řádek s metadaty (viz najdiHlavickovyRadek níž), oddělovač bývá
  // v celém souboru stejný, takže na tom nezáleží.
  const prvniRadekSurovy = radkyText[0];
  const pocetStredniku = (prvniRadekSurovy.match(/;/g) || []).length;
  const pocetCarek = (prvniRadekSurovy.match(/,/g) || []).length;
  const oddelovac = pocetStredniku >= pocetCarek ? ';' : ',';

  const vsechnyRadky = radkyText.map((r) => rozparsujCsvRadek(r, oddelovac));
  const indexHlavicky = najdiHlavickovyRadek(vsechnyRadky);
  const hlavickovyRadek = vsechnyRadky[indexHlavicky];
  const datoveRadky = vsechnyRadky.slice(indexHlavicky + 1);
  const vychoziMena = zjistiVychoziMenuVMetadatech(vsechnyRadky, indexHlavicky);

  return radkyNaPolozky(hlavickovyRadek, datoveRadky, vychoziMena);
}

/**
 * base64Obsah = obsah .xls/.xlsx souboru zakódovaný jako base64 (appka ho
 * takhle posílá z frontendu, protože jde o binární formát, ne text).
 */
function parsujXlsxVypis(base64Obsah) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (e) {
    throw new Error(
      'Appka nemá k dispozici knihovnu pro čtení XLS/XLSX souborů (balíček "xlsx" není ' +
        'nainstalovaný) - zkuste prosím nahrát výpis jako CSV nebo JSON.'
    );
  }

  let sesit;
  try {
    const buffer = Buffer.from(base64Obsah, 'base64');
    sesit = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (e) {
    throw new Error('Soubor se nepodařilo přečíst jako XLS/XLSX (' + e.message + ').');
  }

  const nazevListu = sesit.SheetNames[0];
  if (!nazevListu) throw new Error('XLS/XLSX soubor neobsahuje žádný list.');
  const list = sesit.Sheets[nazevListu];
  const vsechnyRadky = XLSX.utils.sheet_to_json(list, { header: 1, raw: true, defval: '' });

  const neprazdneRadky = vsechnyRadky.filter((r) => r.some((b) => String(b || '').trim() !== ''));
  if (neprazdneRadky.length < 2) {
    throw new Error('XLS/XLSX soubor neobsahuje žádné datové řádky (jen hlavičku, nebo je prázdný).');
  }

  const indexHlavicky = najdiHlavickovyRadek(neprazdneRadky);
  const hlavickovyRadek = neprazdneRadky[indexHlavicky];
  const datoveRadky = neprazdneRadky.slice(indexHlavicky + 1);
  const vychoziMena = zjistiVychoziMenuVMetadatech(neprazdneRadky, indexHlavicky);

  return radkyNaPolozky(hlavickovyRadek, datoveRadky, vychoziMena);
}

// rozparsujCsvRadek appka exportuje navíc i samostatně (mimo parsujCsvVypis)
// - stejný obecný CSV-buňkový parser (uvozovky, escapované uvozovky uvnitř
// pole) používá i lib/knihaJizdImportCest.js (import CSV uložených cest,
// v4.8) - jde o čistě syntaktickou věc nezávislou na bankovním schématu,
// appka ji tedy nemá důvod duplikovat na dvou místech.
module.exports = {
  parsujCsvVypis, parsujXlsxVypis, normalizujDatum, normalizujText, rozparsujCsvRadek,
};
