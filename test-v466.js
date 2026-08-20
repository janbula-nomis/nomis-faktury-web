/**
 * test-v466.js
 * Logické testy k v4.66 - řazení seznamu přijatých faktur podle vybraného
 * sloupce a datum vystavení vytěžené z dokladu.
 *
 * Spouští se ručně: `node test-v466.js` (bez závislostí, bez Google).
 *
 * Jan 2026-08-20: *„potřebuju to umět seřadit podle kriterií které vyberu,
 * datum musí být vytěžené z dokladu jako datum vystavení"*.
 *
 * DVA PROBLÉMY, KTERÉ ZA TÍM BYLY
 *
 * 1) Seznam se řadil natvrdo podle `Datum_zpracovani`, tedy podle toho, KDY
 *    SE DOKLAD NAHRÁL. Na Janově snímku to vypadalo, jako by seřazený nebyl
 *    vůbec: FP 045 ze 7. 7. stálo nad FP 046 z 1. 7., protože se v tomhle
 *    pořadí vyfotily. Účetní potřebuje pořadí podle DOKLADU.
 * 2) V promptu pro AI stálo u `datum_dokladu` jen „string ve formátu
 *    YYYY-MM-DD" - BEZ JEDINÉHO SLOVA O TOM, KTERÉ DATUM TO MÁ BÝT. Na
 *    faktuře jsou běžně tři (vystavení, DUZP, splatnost) a model si mohl
 *    vzít kterékoli. Odtud data, která ve sloupci neseděla.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

const KOREN = __dirname;
const APP = fs.readFileSync(path.join(KOREN, 'public', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(KOREN, 'public', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(KOREN, 'public', 'style.css'), 'utf8');
const GEMINI = fs.readFileSync(path.join(KOREN, 'lib', 'gemini.js'), 'utf8');

const {
  SLOUPCE_RAZENI, serazDoklady, klicEvidencnihoCisla, klicBanky, klicSloupce,
} = require('./lib/razeniDokladu');

console.log('\nv4.66 - řazení přijatých faktur a datum vystavení\n');

// Janův vzorek ze snímku: pořadí nahrání ≠ pořadí dokladů.
const VZOREK = [
  { Evidencni_cislo: 'FP 051-2026', Datum_dokladu: '2026-08-20', Castka: '2570', Dodavatel: 'Státní fond dopravní infrastruktury', Stav_parovani_bankou: '' },
  { Evidencni_cislo: 'FP 048-2026', Datum_dokladu: '2026-06-01', Castka: '77288.75', Dodavatel: 'Advokátní kancelář Kutějová', Stav_parovani_bankou: 'Navrženo' },
  { Evidencni_cislo: 'FP 045-2026', Datum_dokladu: '2026-07-07', Castka: '1890', Dodavatel: 'JABLOTRON SECURITY a.s.', Stav_parovani_bankou: '' },
  { Evidencni_cislo: 'FP 046-2026', Datum_dokladu: '2026-07-01', Castka: '2287', Dodavatel: 'JABLOTRON SECURITY a.s.', Stav_parovani_bankou: 'Potvrzeno' },
  { Evidencni_cislo: 'FP 049-2026', Datum_dokladu: '', Castka: '', Dodavatel: '', Stav_parovani_bankou: '', Hrazeno_mimo_ucet: 'ANO' },
];
const cisla = (pole) => pole.map((d) => d.Evidencni_cislo.replace('FP ', '').replace('-2026', ''));

// ===========================================================================
// 1) ŘAZENÍ
// ===========================================================================
console.log('  -- řazení --');

test('podle data vystavení sestupně - nejnovější doklad nahoře', () => {
  assert.deepStrictEqual(cisla(serazDoklady(VZOREK, 'datum', 'desc')), ['051', '045', '046', '048', '049']);
});

test('…a vzestupně přesně obráceně, jen prázdné zůstane dole', () => {
  assert.deepStrictEqual(cisla(serazDoklady(VZOREK, 'datum', 'asc')), ['048', '046', '045', '051', '049']);
});

test('prázdná hodnota je dole v OBOU směrech', () => {
  // Kdyby se otáčela se zbytkem, sestupné řazení podle částky by začínalo
  // hromadou dokladů bez částky a to podstatné by bylo mimo obrazovku.
  assert.strictEqual(cisla(serazDoklady(VZOREK, 'castka', 'desc')).pop(), '049');
  assert.strictEqual(cisla(serazDoklady(VZOREK, 'castka', 'asc')).pop(), '049');
  assert.strictEqual(cisla(serazDoklady(VZOREK, 'dodavatel', 'asc')).pop(), '049');
});

test('částka se řadí jako číslo, ne jako text', () => {
  // Textově by „77288.75" bylo menší než „2570" (sedmička vs dvojka).
  assert.deepStrictEqual(cisla(serazDoklady(VZOREK, 'castka', 'desc')), ['048', '051', '046', '045', '049']);
});

test('evidenční číslo se řadí jako (rok, pořadí), ne jako text', () => {
  const napric = [
    { Evidencni_cislo: 'FP 010-2025' }, { Evidencni_cislo: 'FP 002-2026' },
    { Evidencni_cislo: 'FP 1000-2025' }, { Evidencni_cislo: 'FP 001-2026' },
  ];
  const poradi = serazDoklady(napric, 'cislo', 'asc').map((d) => d.Evidencni_cislo);
  assert.deepStrictEqual(poradi, ['FP 010-2025', 'FP 1000-2025', 'FP 001-2026', 'FP 002-2026'],
    'roky se promíchaly nebo čtyřciferné pořadí skončilo před dvouciferným');
});

test('evidenční číslo se rozebere na rok a pořadí', () => {
  assert.deepStrictEqual(klicEvidencnihoCisla('FP 048-2026'), { rok: 2026, poradi: 48, text: 'FP 048-2026' });
  assert.strictEqual(klicEvidencnihoCisla(''), null);
  assert.strictEqual(klicEvidencnihoCisla('bez cisla').rok, 0);
});

test('stav banky se řadí podle významu, ne podle abecedy', () => {
  // Účetní hledá to, co ještě není hotové - nedodělané napřed:
  // nespárované (051, 045), pak návrh (048), pak vyřízené (049 hotovost,
  // 046 potvrzeno). Uvnitř stejné skupiny rozhoduje evidenční číslo
  // sestupně, proto 049 před 046.
  assert.deepStrictEqual(cisla(serazDoklady(VZOREK, 'banka', 'asc')), ['051', '045', '048', '049', '046']);
  // A sestupně jsou vyřízené napřed.
  assert.deepStrictEqual(cisla(serazDoklady(VZOREK, 'banka', 'desc')).slice(0, 2), ['049', '046']);
});

test('hotovost se počítá jako vyřízená, stejně jako u odznaku', () => {
  assert.strictEqual(klicBanky({ Hrazeno_mimo_ucet: 'ANO' }), klicBanky({ Stav_parovani_bankou: 'Potvrzeno' }));
  assert.ok(klicBanky({ Stav_parovani_bankou: 'Navrženo' }) < klicBanky({ Stav_parovani_bankou: 'Potvrzeno' }));
});

test('dodavatel se řadí česky - háčky nekončí až za Z', () => {
  const firmy = [{ Dodavatel: 'Ženíšek' }, { Dodavatel: 'Čeps' }, { Dodavatel: 'Cetin' }, { Dodavatel: 'Alza' }];
  assert.deepStrictEqual(serazDoklady(firmy, 'dodavatel', 'asc').map((d) => d.Dodavatel),
    ['Alza', 'Cetin', 'Čeps', 'Ženíšek']);
});

test('shoda se rozhoduje evidenčním číslem, řazení je stabilní', () => {
  const stejnyDen = [
    { Evidencni_cislo: 'FP 003-2026', Datum_dokladu: '2026-05-05' },
    { Evidencni_cislo: 'FP 007-2026', Datum_dokladu: '2026-05-05' },
    { Evidencni_cislo: 'FP 005-2026', Datum_dokladu: '2026-05-05' },
  ];
  const a = cisla(serazDoklady(stejnyDen, 'datum', 'desc'));
  const b = cisla(serazDoklady(stejnyDen.slice().reverse(), 'datum', 'desc'));
  assert.deepStrictEqual(a, ['007', '005', '003']);
  assert.deepStrictEqual(a, b, 'pořadí se mění podle vstupu - při překreslení by řádky poskakovaly');
});

test('řazení nemění vstupní pole', () => {
  const puvodni = cisla(VZOREK);
  serazDoklady(VZOREK, 'castka', 'asc');
  assert.deepStrictEqual(cisla(VZOREK), puvodni, 'seřazení přeházelo i zdrojová data');
});

test('neznámý sloupec seznam nezničí', () => {
  assert.strictEqual(serazDoklady(VZOREK, 'nesmysl', 'asc').length, VZOREK.length);
});

test('řadí se podle data VYSTAVENÍ, ne podle data nahrání', () => {
  assert.strictEqual(klicSloupce({ Datum_dokladu: '2026-01-02', Datum_zpracovani: '2026-08-20' }, 'datum'),
    '2026-01-02');
});

// ===========================================================================
// 2) DATUM VYSTAVENÍ V PROMPTU
// ===========================================================================
console.log('  -- vytěžení data vystavení --');

test('prompt výslovně říká, že datum_dokladu je datum vystavení', () => {
  const usek = GEMINI.slice(GEMINI.indexOf('"datum_dokladu"'), GEMINI.indexOf('"cislo_dokladu"'));
  assert.ok(/DATUM VYSTAVENÍ/.test(usek), 'model pořád neví, které ze tří dat na faktuře má vzít');
});

test('prompt zakazuje záměnu se splatností a DUZP', () => {
  const usek = GEMINI.slice(GEMINI.indexOf('"datum_dokladu"'), GEMINI.indexOf('"cislo_dokladu"'));
  assert.ok(/NEPLEŤ SI HO/.test(usek));
  assert.ok(/splatnosti/.test(usek) && /DUZP/.test(usek));
});

test('u účtenky prompt říká, co je datum vystavení', () => {
  const usek = GEMINI.slice(GEMINI.indexOf('"datum_dokladu"'), GEMINI.indexOf('"cislo_dokladu"'));
  assert.ok(/účtenky je to datum nákupu/.test(usek), 'u účtenky by model tápal');
});

test('DUZP si dál dopočítává appka, ne model', () => {
  // Tohle pravidlo je z v4.32 a nesmělo se rozbít: model vrací DUZP jen
  // když se LIŠÍ, jinak prázdno a fallback dělá appka.
  assert.ok(/appka si sama \n?\s*'?\s*dopočítá fallback na datum_dokladu, nevymýšlej hodnotu/.test(GEMINI)
    || /dopočítá fallback na datum_dokladu, nevymýšlej hodnotu/.test(GEMINI));
});

// ===========================================================================
// 3) FRONTEND
// ===========================================================================
console.log('  -- frontend --');

test('prohlížečová kopie řazení se neodchýlila od lib/razeniDokladu.js', () => {
  // Appka nemá build krok, takže logika je duplicitně na obou stranách -
  // stejná konvence jako u parsujCastkuZListu. Test hlídá, že se kopie
  // nerozešly; porovnávají se těla funkcí bez komentářů a mezer.
  const LIB = fs.readFileSync(path.join(KOREN, 'lib', 'razeniDokladu.js'), 'utf8');
  const ocisti = (text) => text
    .split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n')
    .replace(/\s+/g, ' ').trim();
  ['function klicBanky', 'function klicEvidencnihoCisla', 'function remizou'].forEach((zacatek) => {
    const zLib = ocisti(LIB.slice(LIB.indexOf(zacatek), LIB.indexOf('}', LIB.indexOf(zacatek + '')) ));
    assert.ok(APP.indexOf(zacatek) > -1, 'v prohlížeči chybí ' + zacatek);
    const zApp = ocisti(APP.slice(APP.indexOf(zacatek), APP.indexOf('}', APP.indexOf(zacatek))));
    assert.strictEqual(zApp, zLib, 'kopie ' + zacatek + ' se rozešla se serverovou verzí');
  });
});

test('nadpisy sloupců jsou klikatelné a ovladatelné klávesnicí', () => {
  SLOUPCE_RAZENI.forEach((s) => {
    assert.ok(HTML.includes('data-sloupec="' + s + '"'), 'nadpis pro sloupec ' + s + ' neřadí');
  });
  assert.ok(/role="button" tabindex="0"/.test(HTML), 'nadpisy nejdou vybrat klávesnicí');
  assert.ok(/e\.key !== 'Enter' && e\.key !== ' '/.test(APP), 'Enter/mezera nic neudělá');
});

test('hlavička zůstala ze <span>, jinak by se rozbily mobilní sloupce', () => {
  // Mobilní pravidla schovávají sloupce přes
  // `.doklad-radek-hlavicka > span:nth-child(n)`. <button> by je minul.
  // Pozor na past, do které jsem tenhle týden spadl už potřetí: kotva
  // `doklad-radek-hlavicka` sedí i na komentář NAD hlavičkou, který slovo
  // <button> sám obsahuje. Anchor je proto celý otevírací tag a komentáře
  // se ze vzorku vyhazují.
  const zacatek = HTML.indexOf('<div class="doklad-radek-hlavicka');
  assert.ok(zacatek > -1, 'hlavička seznamu zmizela');
  const hlavicka = HTML.slice(zacatek, HTML.indexOf('id="doklady-seznam"'))
    .replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/<button/.test(hlavicka), 'v hlavičce je <button> - nth-child pravidla přestanou platit');
  assert.strictEqual((hlavicka.match(/<span/g) || []).length, 8);
});

test('sloupec se jmenuje Vystaveno, ne obecně Datum', () => {
  assert.ok(/>Vystaveno</.test(HTML), 'nadpis pořád neříká, které datum to je');
  assert.ok(/Datum vystavení z dokladu \(ne datum nahrání\)/.test(HTML));
});

test('výchozí pořadí je podle data vystavení, nejnovější nahoře', () => {
  assert.ok(/let dokladyRazeniSloupec = 'datum';/.test(APP));
  assert.ok(/let dokladyRazeniSmer = 'desc';/.test(APP));
});

test('podle data nahrání se už neřadí', () => {
  const telo = APP.slice(APP.indexOf('function vykresliDoklady'), APP.indexOf('function filtrSchvalenychDokladu'))
    .split('\n').filter((r) => !/^\s*(\/\/|\*)/.test(r)).join('\n');
  assert.ok(!/Datum_zpracovani/.test(telo), 'seznam se pořád řadí podle toho, kdy se doklad nahrál');
  assert.ok(/serazDoklady\(filtrovane, dokladyRazeniSloupec, dokladyRazeniSmer\)/.test(telo));
});

test('druhé klepnutí na tentýž sloupec otočí směr', () => {
  const usek = APP.slice(APP.indexOf('function prepniRazeniDokladu'), APP.indexOf('function oznacRazeniVHlavicce'));
  assert.ok(/dokladyRazeniSmer = dokladyRazeniSmer === 'asc' \? 'desc' : 'asc';/.test(usek));
});

test('nový sloupec začne tím směrem, který u něj dává smysl', () => {
  // U data, částky a zaúčtování sestupně (nejnovější/největší/hotové
  // napřed), u textu vzestupně od A.
  const usek = APP.slice(APP.indexOf('function prepniRazeniDokladu'), APP.indexOf('function oznacRazeniVHlavicce'));
  assert.ok(/\['datum', 'castka', 'zauctovano'\]\.indexOf\(sloupec\) !== -1 \? 'desc' : 'asc'/.test(usek));
});

test('je vidět, podle čeho je seřazeno', () => {
  // Neoznačené řazení je horší než žádné - člověk tomu pořadí věří.
  assert.ok(/razeni-aktivni/.test(APP) && /razeni-aktivni/.test(CSS));
  assert.ok(/razeni-sipka/.test(APP) && /razeni-sipka/.test(CSS));
  assert.ok(/'asc' \? ' ▲' : ' ▼'/.test(APP), 'chybí šipka směru');
});

test('aktivní sloupec se pozná i jinak než barvou', () => {
  assert.ok(/\.doklad-radek-hlavicka > span\.razeni-aktivni \{[^}]*font-weight: 700/.test(CSS),
    'rozdíl je jen v odstínu šedé');
});

test('bublina u data ukáže i DUZP a splatnost', () => {
  assert.ok(/function popisDatDokladu/.test(APP));
  assert.ok(/Vystaveno: /.test(APP));
  const usek = APP.slice(APP.indexOf('function popisDatDokladu'), APP.indexOf('function vytvorRadekDoklad'));
  assert.ok(/d\.DUZP && d\.DUZP !== d\.Datum_dokladu/.test(usek), 'DUZP se ukazuje, i když je stejné');
});

test('tmavý motiv má protějšek pro zvýrazněný sloupec', () => {
  assert.ok(/:root\[data-motiv="tmavy"\] \.doklad-radek-hlavicka > span\.razeni-aktivni/.test(CSS));
});

test('CSS komentáře i závorky jsou vyvážené', () => {
  assert.strictEqual((CSS.match(/\/\*/g) || []).length, (CSS.match(/\*\//g) || []).length);
  assert.strictEqual((CSS.match(/\{/g) || []).length, (CSS.match(/\}/g) || []).length);
});

test('verze je aspoň v4.66', () => {
  const m = APP.match(/APP_VERZE = 'v(\d+)\.(\d+)/);
  assert.ok(m && parseInt(m[1], 10) * 100 + parseInt(m[2], 10) >= 466, 'verze se neposunula');
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO NEPROŠLO)' : ' (vše prošlo)') + '\n');
