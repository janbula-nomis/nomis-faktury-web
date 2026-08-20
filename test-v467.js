/**
 * test-v467.js
 * Logické testy k v4.67 - sloupec „Úhrada" místo „Banka".
 *
 * Spouští se ručně: `node test-v467.js` (bez závislostí, bez Google).
 *
 * Jan 2026-08-20: *„spárováno znamená také uhrazeno (výpis na účtu nebo
 * hotovost)"*.
 *
 * „Spárováno" byl termín z vnitřku appky - popisoval, co appka udělala
 * (našla protějšek v bankovním výpisu), ne co to znamená. Pro účetní je
 * párování jen mezikrok k jediné otázce, která ji zajímá: JE TO ZAPLACENÉ?
 * Dvě různé cesty (bankovní výpis, hotovost) vedou ke stejné odpovědi.
 *
 * DVĚ VĚCI, KTERÉ SE TU NESMÍ ZTRATIT
 *
 * 1) NÁVRH NENÍ ÚHRADA. „Návrh úhrady" znamená, že appka našla sedící
 *    pohyb, ale nikdo ho neodklepl. Kdyby dostal ✓, tvrdila by appka něco,
 *    co nikdo nepotvrdil - a rovnou by to zdědil i název scanu na Disku.
 * 2) CHYBĚJÍCÍ PLATBA SE NEHLÁSÍ JAKO „NEUHRAZENO". Appka neví, jestli
 *    doklad zaplacený není, nebo se jen ještě nenačetl bankovní výpis.
 *    Janova volba: říct, co appka ví („nenalezena platba"), ne co neví.
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
const { jeSparovano } = require('./lib/nazvyScanu');

// Tělo odznaku bez komentářů - jinak si test najde vlastní vysvětlení
// (past, do které jsem tenhle týden spadl čtyřikrát).
const ODZNAK = APP
  .slice(APP.indexOf('function bankSparovaniBadge'), APP.indexOf('let firmyProVyberDokladu'))
  .split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');

console.log('\nv4.67 - sloupec Úhrada místo Banka\n');

test('sloupec se jmenuje Úhrada', () => {
  const hlavicka = HTML.slice(HTML.indexOf('<div class="doklad-radek-hlavicka'), HTML.indexOf('id="doklady-seznam"'))
    .replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(/>Úhrada</.test(hlavicka), 'nadpis pořád mluví o bance');
  assert.ok(!/>Banka</.test(hlavicka));
});

test('nadpis vysvětlí, co ten sloupec znamená', () => {
  assert.ok(/Je doklad uhrazený\? Z bankovního výpisu nebo hotově\./.test(HTML));
});

test('obě cesty k úhradě dostanou ✓ a řeknou, čím se platilo', () => {
  assert.ok(/>✓ Uhrazeno</.test(ODZNAK), 'chybí úhrada z bankovního výpisu');
  assert.ok(/>✓ Uhrazeno hotově</.test(ODZNAK), 'chybí úhrada hotovostí');
});

test('obě cesty vypadají stejně silně - stejná třída odznaku', () => {
  // Doložená platba je doložená platba. Kdyby hotovost dostala slabší
  // barvu, vypadala by jako něco méně jistého, a to není pravda.
  const radky = ODZNAK.split('\n').filter((r) => /✓ Uhrazeno/.test(r));
  assert.strictEqual(radky.length, 2);
  radky.forEach((r) => assert.ok(/badge-potvrzeno/.test(r), 'jedna z cest má jinou barvu'));
});

test('slovo „Spárováno" už se na účetní nevytahuje', () => {
  assert.ok(!/>✓ Spárováno</.test(ODZNAK));
  assert.ok(!/>Nespár\./.test(ODZNAK));
});

test('NÁVRH ✓ nedostane - nikdo ho neodklepl', () => {
  const radek = ODZNAK.split('\n').filter((r) => /Návrh úhrady/.test(r));
  assert.strictEqual(radek.length, 1, 'odznak návrhu zmizel');
  assert.ok(!/✓/.test(radek[0]), 'nepotvrzený návrh se tváří jako hotový');
  assert.ok(/badge-navrzeno/.test(radek[0]));
});

test('…a nedostane ani „S" do názvu scanu na Disku', () => {
  assert.ok(!jeSparovano({ Stav_parovani_bankou: 'Navrženo' }));
});

test('chybějící platba se nehlásí jako „Neuhrazeno"', () => {
  // Appka neví, jestli doklad zaplacený není, nebo jen chybí výpis.
  assert.ok(/Nenalezena platba/.test(ODZNAK));
  assert.ok(!/>Neuhrazeno</.test(ODZNAK), 'appka tvrdí něco, co nemůže vědět');
});

test('bublina u nenalezené platby řekne, že to nemusí být dluh', () => {
  const radek = ODZNAK.split('\n').filter((r) => /Nenalezena platba/.test(r))[0];
  assert.ok(/Nemusí to znamenat, že zaplacený není/.test(radek),
    'člověk by mohl zaplatit podruhé');
  assert.ok(/bankovní výpis/.test(radek), 'neřekne, kde může být příčina');
});

test('hotovost je pořád úhrada i pro řazení a názvy scanů', () => {
  assert.ok(jeSparovano({ Hrazeno_mimo_ucet: 'ANO' }));
  assert.ok(jeSparovano({ Stav_parovani_bankou: 'Potvrzeno' }));
});

test('odznak se u neschváleného dokladu nezobrazuje', () => {
  assert.ok(/if \(d\.Stav !== 'Schváleno'\) return '';/.test(ODZNAK));
});

test('vnitřní klíč řazení zůstal `banka`, obě kopie souhlasí', () => {
  // Přejmenovat ho by znamenalo sáhnout na lib/razeniDokladu.js i na
  // prohlížečovou kopii bez užitku pro uživatele - je to pořád stav
  // párování s bankovním výpisem.
  const LIB = fs.readFileSync(path.join(KOREN, 'lib', 'razeniDokladu.js'), 'utf8');
  assert.ok(/data-sloupec="banka"/.test(HTML));
  assert.ok(/sloupec === 'banka'/.test(LIB));
  assert.ok(/sloupec === 'banka'/.test(APP));
});

test('sloupec úhrady je v mřížce širší, ať se odznak nekrájí', () => {
  const CSS = fs.readFileSync(path.join(KOREN, 'public', 'style.css'), 'utf8');
  const i = CSS.indexOf('.doklad-radek-hlava, .doklad-radek-hlavicka');
  const pravidlo = CSS.slice(i, CSS.indexOf('}', i));
  const stopy = pravidlo.match(/grid-template-columns: ([^;]*)/)[1]
    .replace(/minmax\([^)]*\)/g, 'X').trim().split(/\s+/);
  const sirka = parseInt(stopy[3], 10);
  assert.ok(sirka >= 120, 'sloupec úhrady je jen ' + sirka + 'px – „Nenalezena platba" se ořízne');
});

// ===========================================================================
// v4.68 - sjednocení: písmeno v názvu scanu je „U" jako uhrazeno
// ===========================================================================
// Jan 2026-08-20: *„sjednotit"*. Do v4.67 se stav na obrazovce jmenoval
// „Uhrazeno", ale v názvu souboru na Disku bylo „S" jako spárováno. Mít
// pro jednu věc dvě slova je přesně to, kvůli čemu pak nikdo neví, jestli
// jsou to dvě věci, nebo jedna.
console.log('  -- v4.68: sjednocení názvu scanu --');

const { nazevScanu, predponaStavu, jeUhrazeno } = require('./lib/nazvyScanu');

test('předpona je ZU / Z / U, ne ZS / Z / S', () => {
  assert.strictEqual(predponaStavu({ Zauctovano: 'ANO', Stav_parovani_bankou: 'Potvrzeno' }), 'ZU');
  assert.strictEqual(predponaStavu({ Stav_parovani_bankou: 'Potvrzeno' }), 'U');
  assert.strictEqual(predponaStavu({ Hrazeno_mimo_ucet: 'ANO' }), 'U');
  assert.strictEqual(predponaStavu({ Zauctovano: 'ANO' }), 'Z');
  assert.strictEqual(predponaStavu({}), '');
});

test('funkce se jmenuje jeUhrazeno, starý název zůstal jako alias', () => {
  assert.strictEqual(typeof jeUhrazeno, 'function');
  assert.ok(jeUhrazeno({ Hrazeno_mimo_ucet: 'ANO' }));
  assert.strictEqual(jeSparovano, jeUhrazeno, 'alias ukazuje jinam než na novou funkci');
});

test('už pojmenovaný soubor se starým „S" se pozná jako změna', () => {
  // Tohle je celá migrace: endpoint porovnává spočítaný název se
  // současným, takže při prvním běhu po v4.68 „ZS …" -> „ZU …".
  const doklad = { Evidencni_cislo: 'FP 001-2026', Dodavatel: 'ČEZ Prodej', Zauctovano: 'ANO', Stav_parovani_bankou: 'Potvrzeno' };
  const stary = 'ZS FP 001-2026 - ČEZ Prodej.pdf';
  const novy = nazevScanu(doklad, stary).nazev;
  assert.strictEqual(novy, 'ZU FP 001-2026 - ČEZ Prodej.pdf');
  assert.notStrictEqual(novy, stary, 'migrace by se nespustila');
});

test('přípona se ze starého názvu přenese správně', () => {
  const doklad = { Evidencni_cislo: 'FP 002-2026', Dodavatel: 'Alza', Hrazeno_mimo_ucet: 'ANO' };
  assert.ok(nazevScanu(doklad, 'S FP 002-2026 - Alza.jpg').nazev.endsWith('.jpg'));
});

test('druhý běh po migraci už nic nemění', () => {
  // Jinak by se soubory přejmenovávaly při každém spuštění dokola.
  const doklad = { Evidencni_cislo: 'FP 001-2026', Dodavatel: 'ČEZ Prodej', Zauctovano: 'ANO', Stav_parovani_bankou: 'Potvrzeno' };
  const prvni = nazevScanu(doklad, 'ZS FP 001-2026 - ČEZ Prodej.pdf').nazev;
  assert.strictEqual(nazevScanu(doklad, prvni).nazev, prvni);
});

test('obrazovka v Exportu mluví o ZU a U, ne o ZS a S', () => {
  const panel = HTML.slice(HTML.indexOf('id="panel-prejmenovat-scany"'), HTML.indexOf('id="scany-vysledek"'));
  assert.ok(/ZU FP 001-2026/.test(panel), 'ukázka názvu je pořád stará');
  assert.ok(/= uhrazeno/.test(panel));
  assert.ok(!/ZS FP/.test(panel));
});

test('appka upozorní, že se už pojmenované soubory přejmenují jednou znovu', () => {
  // Účetní jinak uvidí v náhledu desítky řádků „Přejmenovat" a lekne se,
  // že se něco pokazilo.
  const panel = HTML.slice(HTML.indexOf('id="panel-prejmenovat-scany"'), HTML.indexOf('id="scany-vysledek"'));
  assert.ok(/příští běh je přejmenuje na nový tvar/.test(panel), 'nikde není řečeno, že jde o jednorázovou změnu');
});

test('verze je aspoň v4.67', () => {
  const m = APP.match(/APP_VERZE = 'v(\d+)\.(\d+)/);
  assert.ok(m && parseInt(m[1], 10) * 100 + parseInt(m[2], 10) >= 467);
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO NEPROŠLO)' : ' (vše prošlo)') + '\n');
