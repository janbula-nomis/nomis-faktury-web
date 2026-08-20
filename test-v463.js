/**
 * test-v463.js
 * Logické testy k v4.63 - Přijaté faktury: firma u schválených, ✓ u
 * spárování, zaškrtávátko Zaúčtováno a hromadné pojmenování scanů.
 *
 * Spouští se ručně: `node test-v463.js` (bez závislostí, bez Google).
 *
 * Jan 2026-08-20: *„Přijaté faktury - po schválení nutno rozlišit podle
 * firem, aby se dalo kontrolovat podle účetnictví, rolovací menu jako je
 * v Bankovní výpisy, musí být znak zaškrtnuto u spárováni (platí i pro
 * hotovostní platbu) a pak nové zaškrtávátko Zaúčtováno, které účetní ručně
 * zaškrtne, pokud zaúčtuje, druhý dotaz je, jestli je možné nějak
 * exportovat hromadně doklady - scany, které budou mít předem daný text
 * souboru, který získají, např. Z - zaúčtováno, S - spárováno a pak číslo
 * dle systému"*.
 *
 * Volby: firma **povinná, jen ve schválených**; Zaúčtováno **přímo v
 * řádku**; hotovost dostane **rovnou ✓**; scany se **přejmenují na Disku**.
 *
 * CO SE TU HLÍDÁ PŘEDEVŠÍM
 *
 * 1) „ZAÚČTOVÁNO" SI APPKA NIKDY NENASTAVÍ SAMA. Je to jediný sloupec,
 *    který tvrdí „tenhle doklad je v účetnictví". Nesmí vzniknout ze
 *    schválení, z párování s bankou ani z hromadné akce.
 * 2) STOPU (kdo, kdy) PÍŠE SERVER. Kdyby ji bral z prohlížeče, dal by se
 *    podepsat kdokoli kdykoli - a je to jediná stopa, na kterou se dá
 *    spolehnout.
 * 3) PŘEJMENOVÁNÍ MÁ NÁHLED. Přejmenovat desítky souborů jedním klepnutím
 *    nejde vzít zpět jinak než ručně, soubor po souboru.
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
const DOKLADY_FN = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'doklady.js'), 'utf8');
const SCANY_FN = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'doklady-prejmenovat-scany.js'), 'utf8');

const { DOKLADY_HEADERS } = require('./lib/dokladySchema');
const {
  nazevScanu, predponaStavu, jeSparovano, jeZauctovano, priponaZNazvu, MAX_DELKA_NAZVU,
} = require('./lib/nazvyScanu');

console.log('\nv4.63 - Přijaté faktury: firma, ✓ u spárování, Zaúčtováno, pojmenování scanů\n');

// ===========================================================================
// 1) SCHÉMA
// ===========================================================================
console.log('  -- schéma --');

test('list Doklady má tři nové sloupce', () => {
  ['Zauctovano', 'Zauctovano_kdy', 'Zauctoval'].forEach((s) => {
    assert.ok(DOKLADY_HEADERS.includes(s), 'chybí sloupec ' + s);
  });
});

test('nové sloupce jsou na KONCI - /api/setup je doplňuje přidáním', () => {
  // setup.js dopisuje chybějící hlavičky na konec existující řady. Kdyby
  // se nový sloupec vložil doprostřed, hlavičky v Sheets by po doplnění
  // seděly na jiná data než v kódu.
  const konec = DOKLADY_HEADERS.slice(-3);
  assert.deepStrictEqual(konec, ['Zauctovano', 'Zauctovano_kdy', 'Zauctoval']);
});

test('žádný sloupec se nezdvojil', () => {
  assert.strictEqual(new Set(DOKLADY_HEADERS).size, DOKLADY_HEADERS.length);
});

// ===========================================================================
// 2) NÁZVY SCANŮ
// ===========================================================================
console.log('  -- názvy scanů --');

const HOTOVY = {
  Evidencni_cislo: 'FP 001-2026', Dodavatel: 'ČEZ Prodej, s.r.o.',
  Zauctovano: 'ANO', Stav_parovani_bankou: 'Potvrzeno',
};

test('hotový doklad dostane předponu ZS a číslo dle systému', () => {
  assert.strictEqual(nazevScanu(HOTOVY, 'faktura.pdf').nazev, 'ZS FP 001-2026 - ČEZ Prodej, s.r.o..pdf');
});

test('předpona odpovídá tomu, co doklad opravdu má', () => {
  assert.strictEqual(predponaStavu({ Zauctovano: 'ANO', Stav_parovani_bankou: 'Potvrzeno' }), 'ZS');
  assert.strictEqual(predponaStavu({ Zauctovano: 'ANO' }), 'Z');
  assert.strictEqual(predponaStavu({ Stav_parovani_bankou: 'Potvrzeno' }), 'S');
  assert.strictEqual(predponaStavu({}), '');
});

test('hotovost se počítá jako spárovaná - Janovo „platí i pro hotovostní platbu"', () => {
  assert.ok(jeSparovano({ Hrazeno_mimo_ucet: 'ANO' }));
  assert.strictEqual(predponaStavu({ Hrazeno_mimo_ucet: 'ANO' }), 'S');
});

test('pouhý NÁVRH spárování ✓ nedostane', () => {
  // „Navrženo" znamená, že to appka jen tipla a čeká na potvrzení.
  // Kdyby dostalo S, tvrdil by název souboru něco, co nikdo neodklepl.
  assert.ok(!jeSparovano({ Stav_parovani_bankou: 'Navrženo' }));
  assert.strictEqual(predponaStavu({ Stav_parovani_bankou: 'Navrženo' }), '');
});

test('bez evidenčního čísla se nepřejmenovává, vrací se důvod', () => {
  const v = nazevScanu({ Dodavatel: 'Alza', Zauctovano: 'ANO' }, 'a.pdf');
  assert.strictEqual(v.nazev, null);
  assert.ok(/evidenční číslo/.test(v.duvod), 'důvod neřekne, co chybí');
});

test('přípona se zachová a sjednotí na malá písmena', () => {
  assert.ok(nazevScanu(HOTOVY, 'SKEN.PDF').nazev.endsWith('.pdf'));
  assert.ok(nazevScanu(HOTOVY, 'foto.JPEG').nazev.endsWith('.jpeg'));
});

test('tečka uprostřed názvu se nespolete s příponou', () => {
  // „Faktura č. 2026" končí na „. 2026" - to není přípona.
  assert.strictEqual(priponaZNazvu('Faktura č. 2026'), '');
  assert.strictEqual(priponaZNazvu('bez tecky'), '');
  assert.strictEqual(priponaZNazvu('.gitignore'), '');
});

test('lomítko v názvu dodavatele nerozbije cestu po stažení', () => {
  const v = nazevScanu(
    { Evidencni_cislo: 'FP 003-2026', Dodavatel: 'NOMIS s.r.o. / pobočka Brno' }, 'x.pdf');
  assert.ok(!/[\\/:*?"<>|]/.test(v.nazev), 'v názvu zůstal znak, který rozbije cestu');
});

test('pomlčka v evidenčním čísle zůstane', () => {
  // Čištění názvu nesmí sáhnout na „FP 001-2026" - bez pomlčky je to jiné
  // číslo a účetní ho nedohledá.
  assert.ok(nazevScanu(HOTOVY, 'x.pdf').nazev.includes('FP 001-2026'));
});

test('dlouhý dodavatel se zkrátí, číslo zůstane celé', () => {
  const v = nazevScanu(
    { Evidencni_cislo: 'FP 004-2026', Dodavatel: 'D'.repeat(400) }, 'x.pdf');
  assert.ok(v.nazev.length <= MAX_DELKA_NAZVU, 'název je delší než strop: ' + v.nazev.length);
  assert.ok(v.nazev.includes('FP 004-2026'), 'zkrátilo se číslo místo dodavatele');
  assert.ok(v.nazev.endsWith('.pdf'), 'zkrácením se ztratila přípona');
});

test('zaúčtováno se čte odolně vůči zápisu v tabulce', () => {
  assert.ok(jeZauctovano({ Zauctovano: 'ano' }));
  assert.ok(jeZauctovano({ Zauctovano: ' ANO ' }));
  assert.ok(!jeZauctovano({ Zauctovano: '' }));
  assert.ok(!jeZauctovano({}));
});

// ===========================================================================
// 3) BACKEND: Zaúčtováno
// ===========================================================================
console.log('  -- backend, Zaúčtováno --');

test('zaškrtnout smí jen účetní nebo admin', () => {
  assert.ok(/Zaúčtování smí označit jen administrátor nebo účetní/.test(DOKLADY_FN));
});

test('zaúčtovat jde jen schválený doklad', () => {
  assert.ok(/Zaúčtovat jde jen schválený doklad/.test(DOKLADY_FN));
});

test('kdo a kdy zapisuje SERVER, ne prohlížeč', () => {
  const usek = DOKLADY_FN.slice(DOKLADY_FN.indexOf('if (meniZauctovano) {\n        aktualizovany.Zauctovano'));
  assert.ok(/aktualizovany\.Zauctoval = budeZauctovano \? \(uzivatel\.jmeno \|\| ''\)/.test(usek),
    'jméno se nebere z přihlášeného uživatele');
  assert.ok(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(usek), 'datum se nestampuje na serveru');
});

test('odškrtnutí smaže i stopu', () => {
  const usek = DOKLADY_FN.slice(DOKLADY_FN.indexOf("aktualizovany.Zauctovano = budeZauctovano"));
  assert.ok(/Zauctovano_kdy = budeZauctovano \? [^:]+: '';/.test(usek),
    'u nezaúčtovaného dokladu by zůstalo viset staré datum');
});

test('appka si Zaúčtováno nenastaví sama při schvalování', () => {
  // Komentáře se odmazávají - jinak by test našel vlastní vysvětlení
  // toho zákazu. (Stejná past jako ve v4.58, v4.60 i v4.62.)
  const bezKomentaru = DOKLADY_FN.split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
  const zapisy = (bezKomentaru.match(/\.Zauctovano\s*=/g) || []).length;
  // Právě jeden zápis - ten uvnitř `if (meniZauctovano)`, tedy jen když
  // o to člověk výslovně požádal.
  assert.strictEqual(zapisy, 1, 'Zauctovano se zapisuje na víc místech: ' + zapisy);
  assert.ok(/if \(meniZauctovano\) \{[\s\S]{0,120}aktualizovany\.Zauctovano =/.test(bezKomentaru),
    'zápis není podmíněný výslovnou změnou');
});

// ===========================================================================
// 4) BACKEND: pojmenování scanů
// ===========================================================================
console.log('  -- backend, pojmenování scanů --');

test('bez potvrzení se nic nemění (náhled)', () => {
  assert.ok(/const potvrdit = telo\.potvrdit === true;/.test(SCANY_FN), 'potvrzení není přísné');
  assert.ok(/if \(!potvrdit\) \{/.test(SCANY_FN), 'chybí větev náhledu');
  const nahled = SCANY_FN.slice(SCANY_FN.indexOf('if (!potvrdit) {'), SCANY_FN.indexOf("akce: 'prejmenovat'") + 40);
  assert.ok(!/files\.update/.test(nahled), 'náhled sahá na soubory');
});

test('mění se JEN název souboru', () => {
  const usek = SCANY_FN.slice(SCANY_FN.indexOf('drive.files.update'), SCANY_FN.indexOf('drive.files.update') + 200);
  assert.ok(/requestBody: \{ name: spocteny\.nazev \}/.test(usek), 'do update se posílá víc než název');
  assert.ok(!/parents|trashed|addParents/.test(SCANY_FN), 'appka by soubory přesouvala nebo mazala');
});

test('jen schválené doklady jedné firmy', () => {
  assert.ok(/d\.Stav !== 'Schváleno'\) return false/.test(SCANY_FN), 'přejmenovaly by se i neschválené');
  assert.ok(/if \(!firma\) return json\(400/.test(SCANY_FN), 'firma není povinná');
  assert.ok(/!\(uzivatel\.firmy \|\| \[\]\)\.includes\(firma\)/.test(SCANY_FN), 'chybí kontrola přístupu k firmě');
});

test('doklad bez uloženého souboru se přeskočí', () => {
  assert.ok(/if \(!d\.Zdrojovy_soubor_ID\) return false/.test(SCANY_FN));
});

test('strop na jeden běh je vidět, ne tichý', () => {
  assert.ok(/MAX_NA_BEH/.test(SCANY_FN));
  assert.ok(/zbyva/.test(SCANY_FN), 'appka neřekne, kolik zbývá');
  assert.ok(/Zbývá jich ještě/.test(APP), 'zbytek se neukazuje na obrazovce');
});

test('opakované spuštění nic nepřejmenovává znovu', () => {
  assert.ok(/spocteny\.nazev === stary/.test(SCANY_FN), 'chybí idempotence');
});

test('stav spárování se počítá stejně jako v doklady.js', () => {
  // Kdyby se to spočítalo jinak, měl by soubor jinou předponu, než jakou
  // appka ukazuje na obrazovce.
  assert.ok(/if \(stavParovani\[p\.Doklad_ID\] === 'Potvrzeno'\) return;/.test(SCANY_FN));
  assert.ok(/if \(dosavadni === 'Potvrzeno'\) return;/.test(DOKLADY_FN));
});

test('chybějící list Bankovni_pohyby appku neshodí', () => {
  const usek = SCANY_FN.slice(SCANY_FN.indexOf("'Bankovni_pohyby'"));
  assert.ok(/catch \(e\) \{/.test(usek.slice(0, 400)), 'bez banky by funkce spadla');
});

test('endpoint bere jen POST a jen účetní/admina', () => {
  assert.ok(/event\.httpMethod !== 'POST'\) return json\(405/.test(SCANY_FN));
  assert.ok(/smí spustit jen administrátor nebo účetní/.test(SCANY_FN));
});

// ===========================================================================
// 5) FRONTEND
// ===========================================================================
console.log('  -- frontend --');

test('spárováno i hotovost mají ✓', () => {
  assert.ok(/>✓ Spárováno</.test(APP), 'chybí znak zaškrtnuto u spárování');
  assert.ok(/>✓ Hotovost</.test(APP), 'hotovost ✓ nedostala');
});

test('„Mimo účet" už nevypadá jako nedodělek', () => {
  const usek = APP.slice(APP.indexOf('function bankSparovaniBadge'), APP.indexOf('let firmyProVyberDokladu'));
  assert.ok(!/badge-bezdokladu/.test(usek), 'hotovost má pořád šedý odznak „bez dokladu“');
});

test('návrh spárování ✓ nedostane ani na obrazovce', () => {
  const usek = APP.slice(APP.indexOf('function bankSparovaniBadge'), APP.indexOf('let firmyProVyberDokladu'));
  const navrh = usek.slice(usek.indexOf("=== 'Navrženo'"), usek.indexOf("=== 'Navrženo'") + 300);
  assert.ok(!/✓/.test(navrh), 'nepotvrzený návrh se tváří jako hotový');
});

test('výběr firmy je jen ve schválených a je povinný', () => {
  assert.ok(/doklady-filtr-firmy/.test(APP));
  assert.ok(/classList\.toggle\('skryto', sekce !== 'schvalene'\)/.test(APP), 'filtr se ukazuje i u čekajících');
  assert.ok(/Vyberte firmu…/.test(APP), 'bez firmy se prostě vypíše všechno');
});

test('bez vybrané firmy se schválené doklady nevypíšou', () => {
  const usek = APP.slice(APP.indexOf("if (dokladySekce === 'schvalene') {"), APP.indexOf('const serazene = filtrovane'));
  assert.ok(/if \(!vyber \|\| !vyber\.value\) \{[\s\S]{0,200}return;/.test(usek),
    'chybí zastavení, když firma není vybraná');
  assert.ok(/Vyberte firmu…/.test(usek));
});

test('přepnutí firmy nechodí znovu do Sheets', () => {
  // (v4.64) Posluchač se přesunul do společného cyklu přes všechny čtyři
  // výběry - podrobněji ho hlídá sada „filtr pro účetní" níž.
  const usek = APP.slice(APP.indexOf("['doklady-vyber-firmy', 'doklady-filtr-mesic'"));
  assert.ok(/vykresliDoklady\(dokladySeznamAktualni\)/.test(usek.slice(0, 400)));
  assert.ok(!/nactiDoklady\(/.test(usek.slice(0, 400)));
});

test('zaškrtávátko je přímo v řádku a nerozbaluje detail', () => {
  assert.ok(/function vytvorZauctovanoPrepinac/.test(APP));
  assert.ok(/box\.addEventListener\('click', \(e\) => e\.stopPropagation\(\)\)/.test(APP),
    'klepnutí na zaškrtávátko by zároveň rozbalilo doklad');
});

test('zaškrtávátko se nenabízí u neschváleného dokladu', () => {
  const usek = APP.slice(APP.indexOf('function vytvorZauctovanoPrepinac'), APP.indexOf('function aktualizujSouhrnFirmyDokladu'));
  assert.ok(/if \(d\.Stav !== 'Schváleno'\) \{[\s\S]{0,200}return obal;/.test(usek));
});

test('běžná role zaškrtávátko nerozklikne', () => {
  const usek = APP.slice(APP.indexOf('function vytvorZauctovanoPrepinac'), APP.indexOf('function aktualizujSouhrnFirmyDokladu'));
  assert.ok(/stav\.role === 'admin' \|\| stav\.role === 'ucetni'/.test(usek));
  assert.ok(/box\.disabled = !smi;/.test(usek));
});

test('neúspěšné uložení vrátí zaškrtnutí zpátky', () => {
  // Jinak by na obrazovce zůstalo zaškrtnuto něco, co se neuložilo - a to
  // je u „je v účetnictví" ta nejhorší možná lež.
  const usek = APP.slice(APP.indexOf('function vytvorZauctovanoPrepinac'), APP.indexOf('function aktualizujSouhrnFirmyDokladu'));
  assert.ok(/box\.checked = !box\.checked;/.test(usek));
});

test('souhrn u firmy se přepočítá bez překreslení celého seznamu', () => {
  // Překreslení by zavřelo rozbalený doklad, ve kterém účetní zrovna je.
  const usek = APP.slice(APP.indexOf('function aktualizujSouhrnFirmyDokladu'), APP.indexOf('// (v4.35) Viditelný text'));
  assert.ok(/souhrnTextDokladu\(/.test(usek), 'souhrn se přestal počítat');
  assert.ok(!/vykresliDoklady\(/.test(usek), 'souhrn překresluje celý seznam');
});

test('přejmenování scanů se v appce ptá před zápisem', () => {
  assert.ok(/doklady-prejmenovat-scany/.test(APP), 'appka endpoint nevolá');
  assert.ok(/scanyNahledNeboProvedeni\(false/.test(APP), 'tlačítko rovnou přejmenovává');
  assert.ok(/Zpátky to jde jen ručně, soubor po souboru/.test(APP), 'confirm neřekne, co to znamená');
});

// ===========================================================================
// 6) FILTR PRO ÚČETNÍ (v4.64)
// ===========================================================================
// Jan 2026-08-20: *„udelej ješte to filtrování pro účetní"*. Ve v4.63 šlo
// zaúčtování jen přečíst, ne si podle něj seznam zúžit.
console.log('  -- filtr pro účetní (v4.64) --');

test('filtr má měsíc, rok i zaúčtování a všechno má label', () => {
  ['doklady-filtr-mesic', 'doklady-filtr-rok', 'doklady-filtr-zauctovano'].forEach((id) => {
    assert.ok(HTML.includes('id="' + id + '"'), 'chybí prvek ' + id);
    assert.ok(HTML.includes('<label for="' + id + '">'), 'prvek ' + id + ' nemá label');
  });
});

test('nabídka zaúčtování má obě zúžení', () => {
  const usek = HTML.slice(HTML.indexOf('id="doklady-filtr-zauctovano"'));
  assert.ok(/value="ne">Jen nezaúčtované/.test(usek.slice(0, 400)));
  assert.ok(/value="ano">Jen zaúčtované/.test(usek.slice(0, 400)));
});

test('období se bere z DUZP s návratem na datum dokladu', () => {
  // Stejné pravidlo jako v Daňovém přehledu, Exportu i při pojmenování
  // scanů - jinak by „srpen 2026" znamenal na každé obrazovce něco jiného.
  const usek = APP.slice(APP.indexOf('function filtrSchvalenychDokladu'), APP.indexOf('function souhrnTextDokladu'));
  assert.ok(/String\(d\.DUZP \|\| d\.Datum_dokladu \|\| ''\)/.test(usek));
  assert.ok(/obdobi\.slice\(0, 4\) !== rok/.test(usek));
  assert.ok(/obdobi\.slice\(5, 7\) !== mesic/.test(usek));
});

test('souhrn se počítá PŘED zúžením na (ne)zaúčtované', () => {
  // Kdyby se počítal až z zobrazených řádků, hlásil by při filtru „jen
  // nezaúčtované" pokaždé „z toho 0× zaúčtováno" - technicky pravda, ale
  // účetní by z toho četla, že nemá hotové nic.
  const usek = APP.slice(APP.indexOf('function souhrnTextDokladu'), APP.indexOf('function souhrnTextDokladu') + 700);
  assert.ok(/vyber\.vBloku\.filter/.test(usek), 'souhrn se počítá ze zúženého seznamu');
  assert.ok(!/vyber\.kZobrazeni\.filter/.test(usek));
});

test('když filtr něco skrývá, appka to napíše', () => {
  // Jinak by šlo uzavřít měsíc s tím, že „už tam nic není", a ono tam bylo -
  // jen schované filtrem.
  const usek = APP.slice(APP.indexOf('function souhrnTextDokladu'), APP.indexOf('function souhrnTextDokladu') + 900);
  assert.ok(/Zobrazeno: /.test(usek), 'zúžení není nikde vidět');
  assert.ok(/if \(vyber\.zauctovani\)/.test(usek), 'věta se přidává i bez zapnutého filtru');
});

test('prázdný výsledek filtru se nevydává za prázdné období', () => {
  const usek = APP.slice(APP.indexOf('let prazdnyText'), APP.indexOf('const serazene = filtrovane'));
  assert.ok(/zkuste zrušit zúžení na/.test(usek), 'hláška neřekne, že za to může filtr');
});

test('zaškrtnutí nepřekresluje seznam - řádek nezmizí zpod kurzoru', () => {
  const usek = APP.slice(APP.indexOf('function vytvorZauctovanoPrepinac'), APP.indexOf('function aktualizujSouhrnFirmyDokladu'));
  assert.ok(/aktualizujSouhrnFirmyDokladu\(\)/.test(usek));
  assert.ok(!/vykresliDoklady\(/.test(usek), 'překreslení by posunulo řádky pod rukou');
});

test('souhrn po zaškrtnutí používá stejný filtr jako výpis', () => {
  // Dvě různá pravidla pro totéž se dřív nebo později rozejdou.
  const usek = APP.slice(APP.indexOf('function aktualizujSouhrnFirmyDokladu'), APP.indexOf('// (v4.35) Viditelný text'));
  assert.ok(/souhrnTextDokladu\(filtrSchvalenychDokladu\(schvalene\)\)/.test(usek));
});

test('všechny čtyři výběry překreslují seznam', () => {
  const usek = APP.slice(APP.indexOf("['doklady-vyber-firmy', 'doklady-filtr-mesic'"));
  assert.ok(/'doklady-filtr-zauctovano'\]/.test(usek.slice(0, 300)), 'na některý výběr se zapomnělo');
  assert.ok(/vykresliDoklady\(dokladySeznamAktualni\)/.test(usek.slice(0, 400)));
  assert.ok(!/nactiDoklady\(/.test(usek.slice(0, 400)), 'přepnutí filtru chodí zbytečně do Sheets');
});

test('roky se berou z dat, ne z napevno daného rozsahu', () => {
  const usek = APP.slice(APP.indexOf('function vyplnVyberFiremDokladu'), APP.indexOf('function prepniDokladySekci'));
  assert.ok(/const leta = new Set\(\[String\(new Date\(\)\.getFullYear\(\)\)\]\)/.test(usek),
    'letošek by v nabídce chyběl, dokud v něm není doklad');
  assert.ok(/d\.DUZP \|\| d\.Datum_dokladu/.test(usek), 'roky se berou z jiného data než filtr');
});

// --- HTML a CSS -------------------------------------------------------------
console.log('  -- HTML a CSS --');

test('sloupec Zaúčt. je v hlavičce až jako poslední', () => {
  const hlavicka = HTML.slice(HTML.indexOf('doklad-radek-hlavicka'), HTML.indexOf('id="doklady-seznam"'));
  assert.ok(/doklad-zauct-bunka/.test(hlavicka), 'hlavička nový sloupec nemá');
  assert.ok(hlavicka.indexOf('doklad-zauct-bunka') > hlavicka.indexOf('Částka'),
    'sloupec je před Částkou - posunul by mobilní pravidla nth-child');
});

test('mřížka má o sloupec víc ve všech třech šířkách', () => {
  assert.ok(/16px 92px 62px 92px minmax\(140px, 1fr\) 90px 110px 62px/.test(CSS), 'desktop');
  assert.ok(/14px 62px 48px 66px minmax\(90px, 1fr\) 80px 54px/.test(CSS), '640px');
  assert.ok(/14px 55px 48px minmax\(80px, 1fr\) 70px 48px/.test(CSS), '480px');
});

test('v kartovém rozvržení má zaškrtávátko své místo i popisek', () => {
  assert.ok(/\.doklad-radek-hlava \.doklad-zauct-bunka \{/.test(CSS), 'v kartě by se umístilo samo a rozbilo řádek');
  assert.ok(/\.doklad-radek-hlava \.zauct-popisek \{ display: inline; \}/.test(CSS),
    'v kartě chybí popisek - hlavička sloupců je tam schovaná');
  assert.ok(/\.doklad-radek-hlava \.castka \{ grid-column: 3; grid-row: 1/.test(CSS),
    'částka pořád zabírá i sloupec zaškrtávátka (3 / -1)');
});

test('panel pro pojmenování scanů je v Exportu a má tlačítko', () => {
  assert.ok(/id="panel-prejmenovat-scany"/.test(HTML));
  assert.ok(/id="tlacitko-scany-nahled"/.test(HTML));
  assert.ok(/id="scany-vysledek"/.test(HTML));
});

test('výběr firmy u dokladů má label', () => {
  assert.ok(/<label for="doklady-vyber-firmy">/.test(HTML));
});

test('počet sloupců v mřížce sedí s počtem buněk v hlavičce (v4.65)', () => {
  // Tohle je pojistka proti chybě, která Janovi rozbila obrazovku
  // 2026-08-20: nasadil nový index.html/app.js se STARÝM style.css, takže
  // řádek měl osm buněk, ale mřížka jen sedm sloupců - osmá se zalomila na
  // druhou řádku, hlavička se ořízla na „Z…" a řádky ztloustly.
  // Nasazení test uhlídat neumí, ale rozejití obou souborů ve stromu ano.
  const hlavicka = HTML.slice(HTML.indexOf('doklad-radek-hlavicka'), HTML.indexOf('id="doklady-seznam"'));
  const bunek = (hlavicka.match(/<span/g) || []).length;
  const radek = CSS.match(/grid-template-columns: 16px 92px[^;]*/);
  assert.ok(radek, 'desktopová mřížka dokladů zmizela');
  // minmax(a, b) je JEDEN sloupec - před počítáním se stáhne na jeden token.
  const sloupcu = radek[0].split(':')[1].replace(/minmax\([^)]*\)/g, 'X').trim().split(/\s+/).length;
  assert.strictEqual(sloupcu, bunek,
    'mřížka má ' + sloupcu + ' sloupců, ale hlavička ' + bunek + ' buněk – poslední se zalomí');
});

test('řádek je hutnější než do v4.64', () => {
  // Jan: „nekompaktní". Při 116 dokladech se každé ušetřené 4 px počítají.
  assert.ok(/\.doklad-radek-hlava \{ padding: 5px 10px;/.test(CSS), 'řádek se zase rozestoupil');
  assert.ok(/\.doklad-radek \{[^}]*margin-bottom: 4px;/.test(CSS), 'mezera mezi řádky se zvětšila');
});

test('sloupec Zaúčtováno je zarovnaný pod svou hlavičku', () => {
  assert.ok(/span\.doklad-zauct-bunka \{ overflow: visible; text-align: center; \}/.test(CSS),
    'zaškrtávátko a jeho nadpis se rozjedou vedle sebe');
});

test('CSS komentáře i závorky jsou vyvážené', () => {
  assert.strictEqual((CSS.match(/\/\*/g) || []).length, (CSS.match(/\*\//g) || []).length,
    'nevyvážený /* */ - tiše zabije následující pravidlo (v4.55)');
  assert.strictEqual((CSS.match(/\{/g) || []).length, (CSS.match(/\}/g) || []).length);
});

test('verze je aspoň v4.63', () => {
  // Ne přesná shoda - jinak by tahle sada shodila hned příští vydání a
  // přestala by fungovat jako regrese (viz stejná oprava v test-v462.js).
  const m = APP.match(/APP_VERZE = 'v(\d+)\.(\d+)/);
  assert.ok(m, 'verze appky nejde přečíst');
  assert.ok(parseInt(m[1], 10) * 100 + parseInt(m[2], 10) >= 463, 'verze klesla pod v4.63: ' + m[0]);
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO NEPROŠLO)' : ' (vše prošlo)') + '\n');
