/**
 * test-v452.js
 * Logické testy k v4.52 - předkontace/účty MD a platební karty.
 *
 * Spouští se ručně: `node test-v452.js` (bez závislostí, bez Google -
 * testují se čistě funkce z lib/, které na Sheets nesahají).
 *
 * Proč právě tyhle testy:
 * - falešná shoda karty je horší než žádná (karta má v párování skóre +3,
 *   viz navrhniShodu v lib/bankHelpers.js), takže se hlídá hlavně to, co
 *   ctyrcisliZTextu NESMÍ považovat za kartu;
 * - Janova volba *"Nechat prázdné a upozornit"* se dá snadno omylem
 *   "vylepšit" na nějaký fallback účet - proto je tu test, že prázdno
 *   opravdu zůstane prázdné;
 * - Janova volba *"Podle kategorie, jde přepsat"* stojí a padá s tím, že
 *   doplnUcetMD nepřepíše ručně vyplněný účet.
 */
const assert = require('assert');
const {
  posledniCtyri, dalsiIdKarty, ctyrcisliZTextu, shodaKarty,
  PLATEBNI_KARTY_HEADERS, STAV_DOPLNIT, STAV_AKTIVNI,
} = require('./lib/platebniKartySchema');
const {
  najdiPredkontaci, navrhniUcetMD, doplnUcetMD, chybejiciUcty,
} = require('./lib/predkontaceHelpers');
const { UCTOVA_OSNOVA_HEADERS } = require('./lib/uctovaOsnovaSchema');
const { PREDKONTACE_HEADERS } = require('./lib/predkontaceSchema');
const { DOKLADY_HEADERS } = require('./lib/dokladySchema');
const { vytvorExcelDoklady } = require('./lib/excelExport');

let bezi = 0;
function test(nazev, fn) {
  bezi += 1;
  try {
    fn();
    console.log('  ok  ' + nazev);
  } catch (e) {
    console.log('  CHYBA  ' + nazev + '\n         ' + e.message);
    process.exitCode = 1;
  }
}

console.log('\n--- posledniCtyri (bezpečnostní pravidlo: jen 4 číslice) ---');
test('celý PAN se ořeže na poslední čtyřčíslí', () => {
  assert.strictEqual(posledniCtyri('4571 1234 5678 9012'), '9012');
});
test('maskované tvary z účtenek dají stejný výsledek', () => {
  ['**** 1234', 'VISA ....1234', 'xxxx-1234', '1234'].forEach((v) => {
    assert.strictEqual(posledniCtyri(v), '1234', 'selhalo na: ' + v);
  });
});
test('míň než 4 číslice = prázdno (ne "123")', () => {
  assert.strictEqual(posledniCtyri('123'), '');
  assert.strictEqual(posledniCtyri('karta'), '');
  assert.strictEqual(posledniCtyri(null), '');
  assert.strictEqual(posledniCtyri(undefined), '');
});
test('vedoucí nula přežije (0417 není 417)', () => {
  assert.strictEqual(posledniCtyri('**** 0417'), '0417');
});

console.log('\n--- ctyrcisliZTextu (co JE a co NENÍ karta) ---');
test('poznává maskované zápisy bank', () => {
  const vzorky = {
    'NAKUP KARTOU ****1234': '1234',
    'PLATBA KARTOU xxxx5678 SHELL': '5678',
    'Nákup ...9012 Alza.cz': '9012',
    '457112******3456 LIDL PRAHA': '3456',
    'Platba kartou 7890 dne 1.8.': '7890',
    'CARD 4321 PAYMENT': '4321',
  };
  Object.keys(vzorky).forEach((text) => {
    assert.ok(
      ctyrcisliZTextu(text).has(vzorky[text]),
      'nenašlo ' + vzorky[text] + ' v: ' + text,
    );
  });
});
test('NEBERE náhodná čtyřmístná čísla (falešná shoda je horší než žádná)', () => {
  [
    'Platba 1234 Kc, faktura 2026',
    'Prevod na ucet 2345678901/0800',
    'VS 5678 SS 1234 KS 0308',
    'Najem byt 2026 kveten',
  ].forEach((text) => {
    assert.strictEqual(
      ctyrcisliZTextu(text).size, 0,
      'omylem našlo kartu v: ' + text + ' -> ' + Array.from(ctyrcisliZTextu(text)).join(','),
    );
  });
});
test('vrací Set, ne pole (na tom stojí .has() v shodaKarty)', () => {
  assert.ok(ctyrcisliZTextu('kartou 1234') instanceof Set);
});
test('dvě karty v jednom textu se najdou obě, duplicita jen jednou', () => {
  const v = ctyrcisliZTextu('KARTOU ****1234 a znovu ****1234, pak ****5678');
  assert.strictEqual(v.size, 2);
  assert.ok(v.has('1234') && v.has('5678'));
});

console.log('\n--- shodaKarty ---');
test('sedí, když čtyřčíslí dokladu je v popisu pohybu', () => {
  assert.strictEqual(shodaKarty('1234', 'NAKUP KARTOU ****1234 TESCO'), true);
});
test('prázdná karta nesedí NIKDY (past prázdného symbolu)', () => {
  assert.strictEqual(shodaKarty('', 'NAKUP KARTOU ****1234'), false);
  assert.strictEqual(shodaKarty(null, 'NAKUP KARTOU ****1234'), false);
  assert.strictEqual(shodaKarty('123', 'NAKUP KARTOU ****0123'), false);
});
test('jiná karta nesedí', () => {
  assert.strictEqual(shodaKarty('9999', 'NAKUP KARTOU ****1234'), false);
});
test('doklad má uložený celý PAN? stejně se porovná jen čtyřčíslí', () => {
  assert.strictEqual(shodaKarty('4571123456781234', 'KARTOU ****1234'), true);
});

console.log('\n--- dalsiIdKarty ---');
test('první karta je KARTA-1', () => {
  assert.strictEqual(dalsiIdKarty([]), 'KARTA-1');
});
test('pokračuje za nejvyšším číslem, ne za počtem řádků', () => {
  assert.strictEqual(
    dalsiIdKarty([{ ID: 'KARTA-1' }, { ID: 'KARTA-7' }, { ID: '' }]),
    'KARTA-8',
  );
});

console.log('\n--- předkontace: "Podle kategorie, jde přepsat" ---');
const predkontace = [
  { Firma: 'NOMIS Investment', Kategorie: 'Pohonné hmoty', Kod: 'PHM', Ucet_MD: '501100' },
  { Firma: 'NOMIS Investment', Kategorie: 'Nájemné', Kod: '', Ucet_MD: '' },
  { Firma: 'NOMIS CZ', Kategorie: 'Pohonné hmoty', Kod: 'PHM', Ucet_MD: '501000' },
];
test('najde účet podle firmy A kategorie (ne jen kategorie)', () => {
  assert.strictEqual(navrhniUcetMD(predkontace, 'NOMIS Investment', 'Pohonné hmoty'), '501100');
  assert.strictEqual(navrhniUcetMD(predkontace, 'NOMIS CZ', 'Pohonné hmoty'), '501000');
});
test('neznámá kombinace = prázdno, ŽÁDNÝ náhradní účet', () => {
  assert.strictEqual(navrhniUcetMD(predkontace, 'NOMIS & Homes', 'Pohonné hmoty'), '');
  assert.strictEqual(navrhniUcetMD(predkontace, 'NOMIS Investment', 'Kancelář'), '');
});
test('řádek předkontace bez účtu = prázdno (ne kód předkontace)', () => {
  assert.ok(najdiPredkontaci(predkontace, 'NOMIS Investment', 'Nájemné'));
  assert.strictEqual(navrhniUcetMD(predkontace, 'NOMIS Investment', 'Nájemné'), '');
});
test('doplnUcetMD NEPŘEPÍŠE ručně vyplněný účet', () => {
  const doklad = {
    Firma_potvrzena: 'NOMIS Investment', Kategorie: 'Pohonné hmoty', Ucet_MD: '518002',
  };
  assert.strictEqual(doplnUcetMD(doklad, predkontace), '518002');
});
test('doplnUcetMD doplní jen do prázdného pole', () => {
  const doklad = { Firma_potvrzena: 'NOMIS Investment', Kategorie: 'Pohonné hmoty', Ucet_MD: '' };
  assert.strictEqual(doplnUcetMD(doklad, predkontace), '501100');
});
test('doplnUcetMD bere i firmu odhadnutou AI, když potvrzená není', () => {
  const doklad = { Firma_AI_odhad: 'NOMIS CZ', Kategorie: 'Pohonné hmoty' };
  assert.strictEqual(doplnUcetMD(doklad, predkontace), '501000');
});

console.log('\n--- chybejiciUcty: "Nechat prázdné a upozornit" ---');
test('počítá jen kombinace z REÁLNÝCH dokladů, seřazené podle četnosti', () => {
  const doklady = [
    { Firma_potvrzena: 'NOMIS Investment', Kategorie: 'Kancelář' },
    { Firma_potvrzena: 'NOMIS Investment', Kategorie: 'Kancelář' },
    { Firma_potvrzena: 'NOMIS CZ', Kategorie: 'Marketing' },
    { Firma_potvrzena: 'NOMIS Investment', Kategorie: 'Pohonné hmoty' }, // účet má
  ];
  const chybi = chybejiciUcty(doklady, predkontace);
  assert.strictEqual(chybi.length, 2);
  assert.deepStrictEqual(
    { firma: chybi[0].firma, kategorie: chybi[0].kategorie, pocet: chybi[0].pocet },
    { firma: 'NOMIS Investment', kategorie: 'Kancelář', pocet: 2 },
  );
});
test('doklad bez firmy nebo bez kategorie se nepočítá', () => {
  assert.strictEqual(chybejiciUcty([{ Kategorie: 'Kancelář' }, { Firma_potvrzena: 'NOMIS CZ' }], predkontace).length, 0);
});
test('když jsou účty nastavené, seznam je prázdný', () => {
  const doklady = [{ Firma_potvrzena: 'NOMIS CZ', Kategorie: 'Pohonné hmoty' }];
  assert.strictEqual(chybejiciUcty(doklady, predkontace).length, 0);
});

console.log('\n--- schémata (aby setup.js a zápisy seděly) ---');
test('Uctova_osnova má sloupce Firma/Ucet/Popis/Poznamka', () => {
  assert.deepStrictEqual(UCTOVA_OSNOVA_HEADERS, ['Firma', 'Ucet', 'Popis', 'Poznamka']);
});
test('Predkontace má nový sloupec Ucet_MD a stará pole zůstala', () => {
  ['Firma', 'Kategorie', 'Kod', 'Ucet_MD'].forEach((s) => {
    assert.ok(PREDKONTACE_HEADERS.includes(s), 'chybí sloupec ' + s);
  });
});
test('Doklady mají Ucet_MD, Platebni_karta i Zpusob_platby', () => {
  ['Ucet_MD', 'Platebni_karta', 'Zpusob_platby'].forEach((s) => {
    assert.ok(DOKLADY_HEADERS.includes(s), 'chybí sloupec ' + s);
  });
});
test('Platebni_karty: schéma NEMÁ pole pro celé číslo karty', () => {
  assert.ok(PLATEBNI_KARTY_HEADERS.includes('Cislo_karty'));
  ['PAN', 'Cele_cislo', 'CVV', 'Platnost'].forEach((s) => {
    assert.ok(!PLATEBNI_KARTY_HEADERS.includes(s), 'schéma nesmí obsahovat ' + s);
  });
});
test('Platebni_karty: SPZ ani středisko tam nejsou (Jan je nevybral)', () => {
  ['SPZ', 'Auto', 'Stredisko'].forEach((s) => {
    assert.ok(!PLATEBNI_KARTY_HEADERS.includes(s), 'Jan si o " ' + s + '" neřekl');
  });
});
test('stavy karty jsou právě Doplnit/Aktivní', () => {
  assert.strictEqual(STAV_DOPLNIT, 'Doplnit');
  assert.strictEqual(STAV_AKTIVNI, 'Aktivní');
});

console.log('\n--- Excel export pro účetní ---');
// Test si nesestavuje opravdový XLSX soubor - zajímá ho jen to, JAKÁ DATA
// tam excelExport.js posílá. Balíček "xlsx" se proto podstrčí atrapou, která
// si zapamatuje pole polí (AOA) předaná do aoa_to_sheet. Výhoda: test běží
// i bez nainstalovaných závislostí a netestuje cizí knihovnu.
const zachyceneListy = [];
const atrapaXlsx = {
  utils: {
    book_new: () => ({ listy: [] }),
    aoa_to_sheet: (data) => ({ data }),
    book_append_sheet: (sesit, list, nazev) => {
      zachyceneListy.push({ nazev, data: list.data });
    },
  },
  write: () => Buffer.from('atrapa'),
};
const Module = require('module');
const puvodniLoad = Module._load;
Module._load = function nacti(zadost, rodic, jeHlavni) {
  if (zadost === 'xlsx') return atrapaXlsx;
  return puvodniLoad.call(this, zadost, rodic, jeHlavni);
};

vytvorExcelDoklady(
  [
    {
      ID: 'DOK-1',
      Datum_dokladu: '2026-07-01', Dodavatel: 'Shell', Castka: '1234,50', Mena: 'CZK',
      Kategorie: 'Pohonné hmoty', Ucet_MD: '501100', Firma_potvrzena: 'NOMIS Investment',
      Zpusob_platby: 'Karta', Platebni_karta: '0417', Stav: 'Schváleno',
    },
  ],
  {}, // položky dokladů - druhý argument je povinný, bez něj funkce spadne
);
Module._load = puvodniLoad;

const listDoklady = zachyceneListy.find((l) => l.nazev === 'Prijate_faktury') || { data: [[], []] };
const hlavicky = listDoklady.data[0].map((h) => String(h));
const radek = listDoklady.data[1] || [];

test('hlavička obsahuje Účet MD, Způsob platby i Platební karta', () => {
  ['Účet MD', 'Způsob platby', 'Platební karta'].forEach((s) => {
    assert.ok(hlavicky.includes(s), 'chybí sloupec ' + s);
  });
});
test('nové sloupce nerozhodily počet buněk na řádku', () => {
  assert.strictEqual(radek.length, hlavicky.length);
});
test('účet zůstane TEXT (vedoucí nula nezmizí)', () => {
  assert.strictEqual(radek[hlavicky.indexOf('Účet MD')], '501100');
});
test('účet s vedoucí nulou projde beze změny', () => {
  zachyceneListy.length = 0;
  Module._load = function nacti(zadost, rodic, jeHlavni) {
    if (zadost === 'xlsx') return atrapaXlsx;
    return puvodniLoad.call(this, zadost, rodic, jeHlavni);
  };
  vytvorExcelDoklady([{ ID: 'D', Ucet_MD: '0417' }], {});
  Module._load = puvodniLoad;
  const l = zachyceneListy.find((x) => x.nazev === 'Prijate_faktury');
  assert.strictEqual(l.data[1][l.data[0].indexOf('Účet MD')], '0417');
});
test('karta se do exportu píše maskovaná, ne holé čtyřčíslí', () => {
  assert.strictEqual(radek[hlavicky.indexOf('Platební karta')], '**** 0417');
});
test('doklad bez karty má ve sloupci prázdno (ne "**** ")', () => {
  zachyceneListy.length = 0;
  Module._load = function nacti(zadost, rodic, jeHlavni) {
    if (zadost === 'xlsx') return atrapaXlsx;
    return puvodniLoad.call(this, zadost, rodic, jeHlavni);
  };
  vytvorExcelDoklady([{ ID: 'D', Dodavatel: 'Alza' }], {});
  Module._load = puvodniLoad;
  const l = zachyceneListy.find((x) => x.nazev === 'Prijate_faktury');
  assert.strictEqual(l.data[1][l.data[0].indexOf('Platební karta')], '');
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO SELHALO)' : ' (vše prošlo)') + '\n');
