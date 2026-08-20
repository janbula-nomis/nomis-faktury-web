/**
 * test-v469.js
 * Logické testy k v4.69 - archiv scanů na Disku.
 *
 * Spouští se ručně: `node test-v469.js` (bez závislostí, bez Google).
 *
 * Jan 2026-08-20: *„pro mě je důležité teď vzít co máme i z minulosti a
 * sladit to se současným stavem, aby ty soubory seděly a šlo je uložit do
 * archivu"*.
 *
 * PROČ TO VZNIKLO
 *
 * Do v4.68 uměla appka scany jen přejmenovat na místě, a to v jediné
 * složce `00_Inbox`, kam od začátku padá úplně všechno - přijaté faktury
 * všech firem, nájemní smlouvy i vydané faktury. Stáhnout „rok jedné
 * firmy" tím pádem nešlo. Volby: struktura **Archiv / Firma / Rok** a
 * soubory se **přesunou**, ne kopírují.
 *
 * ČTYŘI VĚCI, KTERÉ SE TU HLÍDAJÍ
 *
 * 1) NIC SE NEMAŽE. Přesun je addParents/removeParents, ne smazání a nové
 *    nahrání. `Zdrojovy_soubor_ID` zůstává, takže odkaz z appky funguje.
 * 2) BEZ POTVRZENÍ SE NIC NESTANE - ani se nezakládají složky.
 * 3) DOKLAD BEZ DATA NEKONČÍ V NÁHODNÉM ROCE.
 * 4) SLOŽKY SE ZAKLÁDAJÍ POSTUPNĚ. Souběžně by pro tentýž rok vznikly dvě
 *    stejnojmenné složky a soubory by se rozpadly do obou.
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
const FN = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'doklady-prejmenovat-scany.js'), 'utf8');
// Komentáře pryč - jinak si test najde vlastní vysvětlení zákazu.
const FN_KOD = FN.split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');

const { cestaArchivu, rokDokladu, klicCesty, NAZEV_ARCHIVU, SLOZKA_BEZ_DATA } = require('./lib/archivScanu');

console.log('\nv4.69 - archiv scanů na Disku\n');

// --- cesta ------------------------------------------------------------------
console.log('  -- kam soubor patří --');

test('cesta je Archiv / Firma / Rok', () => {
  assert.deepStrictEqual(
    cestaArchivu({ DUZP: '2026-08-01' }, 'NOMIS Investment s.r.o.'),
    [NAZEV_ARCHIVU, 'NOMIS Investment s.r.o.', '2026']);
});

test('rok se bere z DUZP, a když chybí, z data dokladu', () => {
  // Stejné pravidlo jako v Daňovém přehledu, Exportu i ve filtru pro
  // účetní - jinak by počty ve složce neseděly se zbytkem appky.
  assert.strictEqual(rokDokladu({ DUZP: '2025-12-31', Datum_dokladu: '2026-01-02' }), '2025');
  assert.strictEqual(rokDokladu({ Datum_dokladu: '2026-01-02' }), '2026');
});

test('doklad bez data nekončí v náhodném roce', () => {
  // Zařadit ho podle roku nahrání by znamenalo tiše tvrdit něco, co appka
  // neví - a v archivu to pak někdo bere jako fakt.
  assert.strictEqual(rokDokladu({}), SLOZKA_BEZ_DATA);
  assert.strictEqual(rokDokladu({ Datum_dokladu: 'nesmysl' }), SLOZKA_BEZ_DATA);
  assert.strictEqual(cestaArchivu({}, 'NOMIS CZ s.r.o.')[2], SLOZKA_BEZ_DATA);
});

test('lomítko v názvu firmy nezaloží dvě zanořené složky', () => {
  const cesta = cestaArchivu({ DUZP: '2026-01-01' }, 'NOMIS s.r.o. / pobočka Brno');
  assert.ok(!cesta[1].includes('/'), 'z firmy by na Disku vznikly dvě úrovně');
});

test('prázdná firma má vlastní složku, ne prázdný název', () => {
  assert.strictEqual(cestaArchivu({ DUZP: '2026-01-01' }, '')[1], 'Bez firmy');
});

test('klíč cesty je čitelný a jednoznačný', () => {
  assert.strictEqual(klicCesty(['Archiv dokladů', 'NOMIS CZ s.r.o.', '2026']),
    'Archiv dokladů / NOMIS CZ s.r.o. / 2026');
});

// --- endpoint ---------------------------------------------------------------
console.log('  -- endpoint --');

test('archivace je vypnutá, dokud si o ni klient neřekne', () => {
  assert.ok(/const archivovat = telo\.archivovat === true;/.test(FN_KOD), 'příznak není přísný');
});

test('nic se nemaže ani nekopíruje - jen přestěhuje', () => {
  assert.ok(/addParents/.test(FN_KOD) && /removeParents/.test(FN_KOD), 'přesun chybí');
  assert.ok(!/files\.delete|trashed: true|files\.copy/.test(FN_KOD),
    'do funkce se dostalo mazání nebo kopírování');
});

test('bez potvrzení se nezakládají ani složky', () => {
  // Náhled nesmí po Disku zanechat prázdné složky.
  assert.ok(/if \(archivovat && potvrdit\) \{/.test(FN_KOD), 'složky se zakládají i v náhledu');
});

test('složky se zakládají postupně, ne souběžně', () => {
  // Dva paralelní běhy by pro tentýž rok založily dvě stejnojmenné složky
  // (Disk to dovolí) a soubory by se rozpadly do obou.
  const usek = FN_KOD.slice(FN_KOD.indexOf('const cileArchivu'), FN_KOD.indexOf('const polozky ='));
  assert.ok(/for \(let i = 0; i < davka\.length; i \+= 1\)/.test(usek), 'zakládání není v cyklu');
  assert.ok(!/poDavkach|Promise\.all/.test(usek), 'složky se zakládají souběžně');
});

test('bez kořene archivu se nearchivuje naslepo', () => {
  assert.ok(/najdiKorenArchivu/.test(FN_KOD));
  assert.ok(/Nepodařilo se najít složku, do které archiv patří/.test(FN),
    'appka by archiv založila někde v kořeni Disku');
});

test('hledání složky je omezené na nesmazané a na daného rodiče', () => {
  const usek = FN_KOD.slice(FN_KOD.indexOf('async function zajistiSlozku'), FN_KOD.indexOf('async function najdiKorenArchivu'));
  assert.ok(/trashed = false/.test(usek), 'našla by se složka z koše');
  assert.ok(/in parents/.test(usek), 'našla by se stejnojmenná složka odjinud');
  assert.ok(/mimeType = 'application\/vnd\.google-apps\.folder'/.test(usek));
});

test('apostrof v názvu firmy nerozbije dotaz na Disk', () => {
  const usek = FN_KOD.slice(FN_KOD.indexOf('async function zajistiSlozku'), FN_KOD.indexOf('async function najdiKorenArchivu'));
  assert.ok(/replace\(\/'\/g/.test(usek), 'apostrof se neescapuje – dotaz by se rozpadl');
});

test('složky se v rámci běhu hledají jen jednou', () => {
  const usek = FN_KOD.slice(FN_KOD.indexOf('async function zajistiSlozku'), FN_KOD.indexOf('async function najdiKorenArchivu'));
  assert.ok(/if \(kes\.has\(klic\)\) return kes\.get\(klic\);/.test(usek),
    'pro každý ze šedesáti dokladů by se hledala ta samá složka znovu');
});

test('idempotence: v archivu musí sedět název I složka', () => {
  // Soubor se správným názvem, ale ještě v Inboxu, se musí přestěhovat.
  assert.ok(/const uzJeVCili = !archivovat \|\| \(!!cilId && rodice\.indexOf\(cilId\) !== -1\);/.test(FN_KOD));
  assert.ok(/if \(spocteny\.nazev === stary && uzJeVCili\)/.test(FN_KOD));
});

test('soubor už ležící v cíli se nestěhuje podruhé', () => {
  assert.ok(/if \(archivovat && cilId && rodice\.indexOf\(cilId\) === -1\)/.test(FN_KOD));
});

test('strop na jeden běh platí i pro archivaci', () => {
  assert.ok(/MAX_NA_BEH/.test(FN_KOD) && /zbyva/.test(FN_KOD));
});

// --- frontend ---------------------------------------------------------------
console.log('  -- frontend --');

test('archivace se zapíná zaškrtávátkem a je výchozí', () => {
  assert.ok(/id="scany-archivovat"/.test(HTML));
  assert.ok(/id="scany-archivovat" checked/.test(HTML), 'archivace není výchozí');
});

test('appka dopředu řekne, že se soubory PŘESUNOU', () => {
  assert.ok(/<strong>přesune<\/strong>/.test(HTML), 'nikde není řečeno, že jde o přesun');
  assert.ok(/Originály se nemažou ani\s*\n?\s*nekopírují/.test(HTML));
});

test('návod říká, jak vzít i starší doklady', () => {
  assert.ok(/Všechny měsíce<\/strong>/.test(HTML) && /Všechny roky<\/strong>/.test(HTML));
});

test('režim se čte při náhledu a stejný jde do potvrzení', () => {
  // Jinak by šlo odklepnout něco jiného, než co bylo v náhledu vidět.
  const usek = APP.slice(APP.indexOf('async function scanyNahledNeboProvedeni'), APP.indexOf('function vykresliVysledekScanu'));
  assert.ok(/const archivovat = !!\(document\.getElementById\('scany-archivovat'\) \|\| \{\}\)\.checked;/.test(usek));
  assert.ok(/JSON\.stringify\(\{ firma, rok, mesic, potvrdit, archivovat \}\)/.test(usek));
});

test('náhled ukáže i cílovou složku', () => {
  const usek = APP.slice(APP.indexOf('function vykresliVysledekScanu'));
  assert.ok(/<th>Složka<\/th>/.test(usek.slice(0, 4000)), 'není vidět, kam to půjde');
});

test('potvrzovací otázka mluví o přesunu, ne o přejmenování', () => {
  const usek = APP.slice(APP.indexOf('function vykresliVysledekScanu'));
  assert.ok(/PŘESUNE je na Disku do složek/.test(usek), 'člověk by odklepl přesun s tím, že jde o přejmenování');
  assert.ok(/Nic se nemaže ani nekopíruje/.test(usek));
});

test('verze je aspoň v4.69', () => {
  const m = APP.match(/APP_VERZE = 'v(\d+)\.(\d+)/);
  assert.ok(m && parseInt(m[1], 10) * 100 + parseInt(m[2], 10) >= 469);
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO NEPROŠLO)' : ' (vše prošlo)') + '\n');
