/**
 * test-v470.js
 * Logické testy k v4.70 - nahrání víc souborů najednou do Přijatých faktur.
 *
 * Spouští se ručně: `node test-v470.js` (bez závislostí, bez Google).
 *
 * Jan 2026-08-20: *„můžu nahrát více souborů najednou do přijatých
 * faktur?"* - nemohl. Pole bralo jeden soubor a `vybranySoubor` byl jeden
 * objekt, takže se při stovce dokladů za rok procházel celý postup
 * vybrat-nahrát-počkat stokrát.
 *
 * ČTYŘI VĚCI, KTERÉ SE TU HLÍDAJÍ
 *
 * 1) FRONTA JDE POSTUPNĚ. Každý soubor projde AI vytěžením, které trvá
 *    vteřiny - souběžně by to narazilo na limity Gemini i na časový strop
 *    Netlify funkce.
 * 2) CHYBA U JEDNOHO SOUBORU FRONTU NEZASTAVÍ. Zastavit se na páté
 *    z dvanácti faktur znamená, že člověk neví, které prošly.
 * 3) VELKÝ SOUBOR SE NAHLÁSÍ, NE TIŠE PŘESKOČÍ.
 * 4) VÍC DOKLADŮ Z JEDNOHO SCANU SE ZAPOČÍTÁ. Jinak by souhrn říkal
 *    „zpracováno 3" a v seznamu by přibylo pět položek.
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
const UPLOAD_FN = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'upload.js'), 'utf8');

// Tělo fronty bez komentářů - jinak si test najde vlastní vysvětlení
// zákazu (past, do které jsem v téhle sérii spadl několikrát).
const FRONTA = APP
  .slice(APP.indexOf('async function nahratDoklad()'), APP.indexOf('async function dokoncitZpracovaniDokladu'))
  .split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');

console.log('\nv4.70 - nahrání víc souborů najednou\n');

// --- výběr ------------------------------------------------------------------
console.log('  -- výběr souborů --');

test('výběr souboru bere víc souborů, focení jen jeden', () => {
  const poleSoubor = HTML.slice(HTML.indexOf('id="pole-soubor"'), HTML.indexOf('id="pole-soubor"') + 200);
  assert.ok(/multiple/.test(poleSoubor), 'nejde označit víc souborů');
  // Slice se musí useknout na konci TAGU - komentář pod ním slovo
  // „multiple" sám obsahuje (pokolikáté už si test málem našel vlastní
  // vysvětlení).
  const odFota = HTML.indexOf('id="pole-foto"');
  const poleFoto = HTML.slice(odFota, HTML.indexOf('/>', odFota));
  assert.ok(!/multiple/.test(poleFoto), 'fotoaparát nemá dávkový režim');
});

test('oba vstupy jdou přes stejnou frontu', () => {
  // Míň větví = míň míst, kde se to může rozejít.
  assert.ok(/getElementById\('pole-foto'\)\.addEventListener\('change', \(e\) => zpracujVybraneSoubory\(e\.target\.files\)\)/.test(APP));
  assert.ok(/getElementById\('pole-soubor'\)\.addEventListener\('change', \(e\) => zpracujVybraneSoubory\(e\.target\.files\)\)/.test(APP));
  assert.ok(!/zpracujVybranySoubor\(/.test(APP), 'zůstala stará jednosouborová cesta');
});

test('appka v textu říká, že jich jde vybrat víc', () => {
  assert.ok(/víc najednou<\/strong>/.test(HTML), 'nikde není řečeno, že to jde');
});

// --- limit velikosti --------------------------------------------------------
console.log('  -- limit velikosti --');

test('klientský limit sedí se serverovým', () => {
  // Kdyby se rozešly, appka by soubor pustila a server vrátil holou 413.
  assert.ok(/const MAX_BAJTU_SOUBORU = 4\.5 \* 1024 \* 1024;/.test(APP));
  assert.ok(/4\.5 \* 1024 \* 1024/.test(UPLOAD_FN), 'serverový limit se změnil');
});

test('velikost se počítá z DEKÓDOVANÝCH bajtů, ne z délky base64', () => {
  // Base64 je o třetinu delší; porovnávat jeho délku s limitem by odmítlo
  // i soubory, které se v pohodě vejdou.
  const usek = APP.slice(APP.indexOf('function velikostZBase64'), APP.indexOf('async function zpracujVybraneSoubory'));
  assert.ok(/text\.length \* 3\) \/ 4/.test(usek), 'nepřepočítává se na dekódovanou velikost');
  assert.ok(/endsWith\('=='\)/.test(usek), 'nepočítá se s výplní na konci');
});

test('velký soubor se nahlásí, ne tiše přeskočí', () => {
  const usek = APP.slice(APP.indexOf('async function zpracujVybraneSoubory'), APP.indexOf('function vykresliFrontuNahravani'));
  assert.ok(/Soubor je moc velký/.test(usek));
  assert.ok(/velikostZBase64\(pripraveny\.data\) > MAX_BAJTU_SOUBORU/.test(usek));
});

test('nepovedená příprava souboru zbytek výběru nezahodí', () => {
  const usek = APP.slice(APP.indexOf('async function zpracujVybraneSoubory'), APP.indexOf('function vykresliFrontuNahravani'));
  assert.ok(/catch \(e\) \{\s*vybraneSoubory\.push\(\{ nazev: soubor\.name, chyba:/.test(usek),
    'chyba u jednoho souboru vyhodí celý výběr');
});

test('tlačítko zůstane vypnuté, když nejde nahrát nic', () => {
  const usek = APP.slice(APP.indexOf('async function zpracujVybraneSoubory'), APP.indexOf('function vykresliFrontuNahravani'));
  assert.ok(/tlacitko\.disabled = kNahrani\.length === 0;/.test(usek));
});

// --- fronta -----------------------------------------------------------------
console.log('  -- průběh fronty --');

test('soubory se zpracovávají POSTUPNĚ, ne souběžně', () => {
  // Pravidlo 1. Souběh by narazil na limity Gemini i na strop Netlify.
  assert.ok(/for \(let poradi = 0; poradi < kNahrani\.length; poradi \+= 1\)/.test(FRONTA),
    'fronta neběží v cyklu');
  assert.ok(!/Promise\.all|Promise\.allSettled/.test(FRONTA), 'soubory se posílají naráz');
});

test('chyba nahrání frontu nezastaví', () => {
  // Pravidlo 2: `continue`, ne `return`.
  const usek = FRONTA.slice(FRONTA.indexOf("await zavolejApi('/upload'"), FRONTA.indexOf("'/upload-dokoncit'"));
  assert.ok(/nepovedlo \+= 1;/.test(usek));
  assert.ok(/continue;/.test(usek), 'chyba jednoho souboru ukončí celou frontu');
  assert.ok(!/return;/.test(usek));
});

test('nepovedené vytěžení AI se nehlásí jako ztráta souboru', () => {
  // Pravidlo 4 z v4.63: soubor je uložený, doklad čeká ve stavu
  // „Zpracovává se" a dokončí se z seznamu bez nahrávání znovu.
  assert.ok(/Uloženo, čeká na AI/.test(FRONTA));
  assert.ok(/Soubor je bezpečně uložený/.test(FRONTA));
  assert.ok(/Dokončit zpracování/.test(FRONTA), 'člověk neví, jak to dodělat');
});

test('víc dokladů z jednoho scanu se započítá do souhrnu', () => {
  // Jinak by souhrn řekl „zpracováno 3" a v seznamu přibylo pět položek.
  assert.ok(/odpoved && odpoved\.dalsiDoklady/.test(FRONTA), 'dalsiDoklady se ignorují');
  assert.ok(/navic \+= dalsi\.length;/.test(FRONTA));
  assert.ok(/doklad navíc z jednoho scanu/.test(FRONTA), 'v souhrnu to není vidět');
});

test('průběh je vidět po jednotlivých souborech i celkově', () => {
  // Porovnává se přes includes na části BEZ diakritiky. Regex s „á" tu
  // jednou selhal, přestože text v souboru seděl - písmeno se dá zapsat
  // dvěma způsoby (složené vs. rozložené) a regex to nepozná.
  assert.ok(FRONTA.includes("+ (poradi + 1) + ' z ' + kNahrani.length"), 'chybí „3 z 12“');
  assert.ok(FRONTA.includes('stavSouboruVeFronte(index, \'<span class="badge-navrzeno">'));
  assert.ok(FRONTA.includes('Zpracov'), 'chybí stav hotového souboru');
});

test('souhrn rozlišuje všechny čtyři výsledky', () => {
  ['zpracováno: ', 'uloženo a čeká na dokončení: ', 'nenahráno: ', 'nešlo nahrát: ']
    .forEach((t) => assert.ok(FRONTA.includes(t), 'v souhrnu chybí „' + t + '“'));
});

test('výběr se čistí až po celé frontě', () => {
  // Vyčistit ho po prvním souboru by zbytek fronty připravilo o data.
  const poCyklu = FRONTA.slice(FRONTA.lastIndexOf('}\n\n  document.getElementById'));
  assert.ok(/pole-soubor'\)\.value = '';/.test(poCyklu) || /pole-soubor/.test(FRONTA.slice(FRONTA.indexOf('const casti') - 900)),
    'výběr se čistí uvnitř cyklu');
  const uvnitrCyklu = FRONTA.slice(FRONTA.indexOf('for (let poradi'), FRONTA.indexOf('  document.getElementById(\'pole-soubor\')'));
  assert.ok(!/vybraneSoubory = \[\]/.test(uvnitrCyklu), 'fronta si maže vlastní data pod rukama');
});

// --- vzhled -----------------------------------------------------------------
console.log('  -- vzhled --');

test('fronta má vlastní místo v HTML i styl', () => {
  assert.ok(/id="nahrat-fronta"/.test(HTML));
  assert.ok(/\.nahrat-fronta-radek \{/.test(CSS));
});

test('stav se nezmáčkne na nulu - nese i vysvětlení', () => {
  assert.ok(/\.nahrat-fronta-stav \{[^}]*max-width: 55%/.test(CSS));
  assert.ok(/\.nahrat-fronta-nazev \{[^}]*text-overflow: ellipsis/.test(CSS), 'dlouhý název rozhodí řádek');
});

test('tmavý motiv má protějšek', () => {
  assert.ok(/:root\[data-motiv="tmavy"\] \.nahrat-fronta-radek/.test(CSS));
});

test('CSS komentáře i závorky jsou vyvážené', () => {
  assert.strictEqual((CSS.match(/\/\*/g) || []).length, (CSS.match(/\*\//g) || []).length);
  assert.strictEqual((CSS.match(/\{/g) || []).length, (CSS.match(/\}/g) || []).length);
});

test('verze je aspoň v4.70', () => {
  const m = APP.match(/APP_VERZE = 'v(\d+)\.(\d+)/);
  assert.ok(m && parseInt(m[1], 10) * 100 + parseInt(m[2], 10) >= 470);
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO NEPROŠLO)' : ' (vše prošlo)') + '\n');
