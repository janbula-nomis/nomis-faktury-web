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
  protistrana: [
    'protiucet nazev', 'nazev protiuctu', 'protistrana', 'partner', 'partnername',
    'counterparty', 'nazev protistrany', 'obchodnik', 'popis protiuctu',
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
function radkyNaPolozky(hlavickovyRadek, datoveRadky) {
  const normalizovaneHlavicky = hlavickovyRadek.map(normalizujText);
  const indexy = {};
  Object.keys(ALIASY_SLOUPCU).forEach((klic) => {
    indexy[klic] = najdiIndexSloupce(normalizovaneHlavicky, ALIASY_SLOUPCU[klic]);
  });

  if (indexy.datum === -1 || indexy.castka === -1) {
    throw new Error(
      'Appka v souboru nenašla sloupec s datem a/nebo částkou (hledala mj. "Datum"/"Date", ' +
        '"Částka"/"Amount"). Nalezené hlavičky: ' + hlavickovyRadek.filter(Boolean).join(', ') + '. ' +
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
      const mena = String(ziskej('mena') || 'CZK').trim() || 'CZK';
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
  const radky = text.split(/\r\n|\r|\n/).filter((r) => r.trim() !== '');
  if (radky.length < 2) {
    throw new Error('CSV soubor neobsahuje žádné datové řádky (jen hlavičku, nebo je prázdný).');
  }
  const hlavickovyRadekSurovy = radky[0];
  const pocetStredniku = (hlavickovyRadekSurovy.match(/;/g) || []).length;
  const pocetCarek = (hlavickovyRadekSurovy.match(/,/g) || []).length;
  const oddelovac = pocetStredniku >= pocetCarek ? ';' : ',';

  const hlavickovyRadek = rozparsujCsvRadek(hlavickovyRadekSurovy, oddelovac);
  const datoveRadky = radky.slice(1).map((r) => rozparsujCsvRadek(r, oddelovac));

  return radkyNaPolozky(hlavickovyRadek, datoveRadky);
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

  const hlavickovyRadek = neprazdneRadky[0];
  const datoveRadky = neprazdneRadky.slice(1);

  return radkyNaPolozky(hlavickovyRadek, datoveRadky);
}

module.exports = { parsujCsvVypis, parsujXlsxVypis, normalizujDatum, normalizujText };
