/**
 * test-v453.js
 * Logické testy k v4.53 - přístupové kódy k závoře (modul Nemovitosti).
 *
 * Spouští se ručně: `node test-v453.js` (bez závislostí, bez Google -
 * testuje se schema a čistá logika řazení/expirace vytažená z UI).
 *
 * Proč právě tyhle testy: u téhle funkce jsou čtyři rozhodnutí, která se
 * dají snadno omylem "vylepšit" zpátky, a každé z nich má tady svůj test:
 * - kódy jsou VLASTNÍ list, ne další typ Klíčů (Janova volba) - test hlídá,
 *   že se schémata nezačala prolínat;
 * - kód se zobrazuje ČITELNĚ (Janova volba "Rovnou vidět") - test hlídá, že
 *   sem nikdo nezatáhl posledniCtyri() od platebních karet;
 * - neplatné kódy se NEMAŽOU (Janova volba "Nechat se stavem Neplatný") -
 *   test hlídá, že řazení je jen srovná dolů, nikoho nezahodí;
 * - stav appka NEPŘEPÍNÁ sama - test hlídá, že výpočet expirace jen počítá,
 *   ale hodnotu Stav nesahá.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  PRISTUPOVE_KODY_HEADERS, MOZNOSTI_STAV_KODU, KLICE_HEADERS,
} = require('./lib/nemovitostiDetailySchema');

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

// Stejná logika jako vykresliSekciKody v public/app.js - appka nemá build
// krok, takže se tady drží kopie (obojí musí zůstat synchronní).
function serad(kody) {
  return kody.slice().sort((a, b) => {
    const na = a.Stav === 'Neplatný' ? 1 : 0;
    const nb = b.Stav === 'Neplatný' ? 1 : 0;
    return na - nb;
  });
}
function prosleKody(kody, dnes) {
  return kody.filter((k) => k.Stav !== 'Neplatný' && k.Platnost_do && k.Platnost_do < dnes);
}

console.log('\n--- Schema přístupových kódů ---');
test('list má všech deset sloupců podle zadání', () => {
  assert.deepStrictEqual(PRISTUPOVE_KODY_HEADERS, [
    'ID', 'Stredisko', 'Nazev', 'Umisteni', 'Kod',
    'Platnost_od', 'Platnost_do', 'Predano_komu', 'Stav', 'Poznamka',
  ]);
});
test('všechny čtyři údaje, které si Jan vybral, mají svůj sloupec', () => {
  // AskUserQuestion 2026-08-05, multiSelect - vybral všechny čtyři.
  ['Platnost_od', 'Platnost_do', 'Predano_komu', 'Umisteni', 'Poznamka'].forEach((s) => {
    assert.ok(PRISTUPOVE_KODY_HEADERS.includes(s), 'chybí sloupec ' + s);
  });
});
test('u jedné nemovitosti může být kódů víc (klíč je Stredisko, ne ID jednotky)', () => {
  // Zadání: "může jich být více". Nic v schématu nesmí být unikátní na
  // středisko - klíčem řádku je vlastní ID.
  assert.strictEqual(PRISTUPOVE_KODY_HEADERS[0], 'ID');
  assert.ok(PRISTUPOVE_KODY_HEADERS.includes('Stredisko'));
});
test('stavy jsou přesně dva - Platný a Neplatný', () => {
  assert.deepStrictEqual(MOZNOSTI_STAV_KODU, ['Platný', 'Neplatný']);
});
test('kódy jsou vlastní list, nesplynuly s Klíči', () => {
  // Janova volba *"Nový seznam Přístupové kódy"*. Kdyby to někdo spojil
  // zpátky, sloupce Klíčů by se objevily tady (nebo naopak).
  ['Pocet_celkem', 'Drzitel', 'Typ_klice'].forEach((s) => {
    assert.ok(!PRISTUPOVE_KODY_HEADERS.includes(s), 'sloupec Klíčů prosákl do kódů: ' + s);
  });
  assert.ok(!KLICE_HEADERS.includes('Kod'), 'sloupec kódů prosákl do Klíčů');
});

console.log('\n--- Kód se nemaskuje (Janova volba "Rovnou vidět") ---');
test('schema nikde nevolá posledniCtyri() ani nic podobného', () => {
  const zdroj = fs.readFileSync(path.join(__dirname, 'lib/nemovitostiDetailySchema.js'), 'utf8');
  const kod = zdroj.replace(/\/\*[\s\S]*?\*\//g, ''); // komentáře o tom pravidlu psát smí
  assert.ok(!/posledniCtyri|maskuj|\*\*\*\*/.test(kod), 'do schématu kódů se dostalo maskování');
});
test('sekce v app.js nastavuje input type="text", ne password', () => {
  const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
  const sekce = app.slice(app.indexOf('function vykresliSekciKody'));
  const telo = sekce.slice(0, sekce.indexOf('\nfunction vykresliSekciMeridla'));
  assert.ok(telo.length > 500, 'nenašla se sekce vykresliSekciKody');
  assert.ok(!/type = 'password'/.test(telo), 'kód se schovává za password input');
  assert.ok(/vKod\.type = 'text'/.test(telo), 'políčko kódu není obyčejný text');
});

console.log('\n--- Řazení: neplatné dolů, ale nikam nemizí ---');
const vzorek = [
  { ID: '1', Nazev: 'Závora stará', Stav: 'Neplatný' },
  { ID: '2', Nazev: 'Závora hlavní', Stav: 'Platný' },
  { ID: '3', Nazev: 'Vrata garáž', Stav: 'Neplatný' },
  { ID: '4', Nazev: 'Branka', Stav: 'Platný' },
];
test('platné jsou nahoře, neplatné dole', () => {
  assert.deepStrictEqual(serad(vzorek).map((k) => k.ID), ['2', '4', '1', '3']);
});
test('řazení nic nezahodí - neplatný kód zůstává v seznamu', () => {
  // Janova volba *"Nechat se stavem Neplatný"*: řádek zůstane, ať je za rok
  // dohledatelné, kdo jaký kód znal. **Nepředělávat na mazání.**
  assert.strictEqual(serad(vzorek).length, vzorek.length);
  assert.ok(serad(vzorek).some((k) => k.ID === '1'));
});
test('řazení nemění původní pole ani stavy', () => {
  const kopie = JSON.parse(JSON.stringify(vzorek));
  serad(vzorek);
  assert.deepStrictEqual(vzorek, kopie);
});
test('kód bez vyplněného stavu se bere jako platný (nespadne dolů)', () => {
  const s = serad([{ ID: 'a', Stav: 'Neplatný' }, { ID: 'b' }]);
  assert.strictEqual(s[0].ID, 'b');
});

console.log('\n--- Expirace: appka počítá, ale stav nepřepíná ---');
const DNES = '2026-08-05';
const kodyExpirace = [
  { ID: 'a', Kod: '1234', Platnost_do: '2026-07-01', Stav: 'Platný' },   // prošlý
  { ID: 'b', Kod: '2345', Platnost_do: '2026-12-31', Stav: 'Platný' },   // běží
  { ID: 'c', Kod: '3456', Platnost_do: '', Stav: 'Platný' },             // bez data
  { ID: 'd', Kod: '4567', Platnost_do: '2026-01-01', Stav: 'Neplatný' }, // už vyřešený
];
test('prošlý je jen ten, co má datum v minulosti a pořád stav Platný', () => {
  assert.deepStrictEqual(prosleKody(kodyExpirace, DNES).map((k) => k.ID), ['a']);
});
test('kód bez data platnosti se nikdy nepovažuje za prošlý', () => {
  assert.ok(!prosleKody(kodyExpirace, DNES).some((k) => k.ID === 'c'));
});
test('kód platný přesně dnes ještě prošlý není', () => {
  assert.strictEqual(prosleKody([{ Platnost_do: DNES, Stav: 'Platný' }], DNES).length, 0);
});
test('už přepnutý Neplatný appka do upozornění nepočítá podruhé', () => {
  assert.ok(!prosleKody(kodyExpirace, DNES).some((k) => k.ID === 'd'));
});
test('výpočet expirace NEPŘEPÍNÁ Stav - appka navrhne, člověk potvrdí', () => {
  // **Nepředělávat na automatiku.** Kód po expiraci často ještě chvíli
  // funguje, než ho správce závory opravdu zruší.
  const pred = kodyExpirace.map((k) => k.Stav).join('|');
  prosleKody(kodyExpirace, DNES);
  assert.strictEqual(kodyExpirace.map((k) => k.Stav).join('|'), pred);
});

console.log('\n--- Napojení na endpoint /api/nemovitosti-detaily ---');
const fnZdroj = fs.readFileSync(path.join(__dirname, 'netlify/functions/nemovitosti-detaily.js'), 'utf8');
test('entita "kody" je v ENTITY_CONFIG a míří na list Pristupove_kody', () => {
  assert.ok(/kody:\s*\{[^}]*sheet:\s*'Pristupove_kody'/.test(fnZdroj));
});
test('kódy se scopují přes Stredisko (stejná kontrola firmy jako Klíče)', () => {
  assert.ok(/kody:\s*\{[^}]*klicPole:\s*'Stredisko'/.test(fnZdroj));
});
test('hláška o neznámé entitě zmiňuje i kody', () => {
  // Volnější než přesná věta: seznam entit se od v4.53 legitimně rozrostl
  // (v4.57 přibyly najemni_jednotky). Hlídá se to podstatné - že „kody"
  // v nabídce zůstalo a věta pořád vypisuje, co appka čeká.
  assert.ok(/Očekává se [^']*\bkody\b[^']*revize/.test(fnZdroj));
});
test('appka zakládá list Pristupove_kody', () => {
  // (v4.75) Seznam listů se přestěhoval ze setup.js do lib/listySchema.js,
  // aby ho mohl číst i servisní nástroj v Nastavení. Test proto kouká tam -
  // kontroluje ale pořád totéž: že list v seznamu je, že hlavičky bere ze
  // schématu (ne z ručně opsaného pole) a že si ho setup.js opravdu načítá.
  const schema = fs.readFileSync(path.join(__dirname, 'lib/listySchema.js'), 'utf8');
  assert.ok(/nazev:\s*'Pristupove_kody'/.test(schema));
  assert.ok(/PRISTUPOVE_KODY_HEADERS/.test(schema));
  const setup = fs.readFileSync(path.join(__dirname, 'netlify/functions/setup.js'), 'utf8');
  assert.ok(/require\('\.\.\/\.\.\/lib\/listySchema'\)/.test(setup));
});
test('appka přežije, než se /api/setup pustí znovu (kódy mají .catch)', () => {
  const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
  const usek = app.slice(app.indexOf('entita=kody&stredisko='));
  assert.ok(/\.catch\(\(\) => \(\{ polozky: \[\] \}\)\)/.test(usek.slice(0, 300)));
});
test('číselník stavů je v app.js stejný jako v lib/', () => {
  const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
  const shoda = app.match(/const MOZNOSTI_STAV_KODU = (\[[^\]]*\]);/);
  assert.ok(shoda, 'MOZNOSTI_STAV_KODU v app.js chybí');
  assert.deepStrictEqual(eval(shoda[1]), MOZNOSTI_STAV_KODU); // eslint-disable-line no-eval
});
test('tmavý motiv má protějšek pro neplatný řádek', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public/style.css'), 'utf8');
  assert.ok(/tr\.radek-kod-neplatny\s*\{/.test(css), 'chybí světlý styl');
  assert.ok(/data-motiv="tmavy"\]\s*tr\.radek-kod-neplatny/.test(css), 'chybí tmavý protějšek');
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO SELHALO)' : ' (vše prošlo)') + '\n');
