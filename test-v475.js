/**
 * test-v475.js
 * Logické testy k v4.75 - servisní nástroje v Nastavení, mřížka polí
 * v detailu, ikony způsobu platby a držitel karty.
 *
 * Spouští se ručně: `node test-v475.js` (bez závislostí, bez Google).
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21, tři zadání za sebou:
 *   1. *„tlačítko Srovnat číslování a další servisní tlačítka, která jsme
 *      potřebovali jen pro změnu, přesun do Nastavení, aby je uživatel
 *      neviděl - je to přehlednější, co tam ještě může být?"*
 *   2. *„upravíme grafiku, data mohou být vedle sebe, jsou to čísla"*
 *      (+ na dotaz vybral „udělej to i u vydaných faktur")
 *   3. *„navrhni také ikony pro platbu kartou a hotovost, zároveň přiřaď
 *      k číslu karty také držitele, co máš v seznamech, aby tam bylo jméno"*
 *
 * CO SE TU HLÍDÁ
 *
 * 1) SERVIS JE JEN PRO ADMINA A NIC NEMAŽE. Nástroje sahají na strukturu
 *    tabulky a na Disk; účetní je nesmí spustit a appka nesmí umět smazat
 *    soubor.
 * 2) KONTROLA NEZAPISUJE. Diagnostika, která „při té příležitosti" něco
 *    spraví, je diagnostika, které se nedá věřit.
 * 3) MŘÍŽKA SE NA MOBILU SKLÁDÁ ZPĚT POD SEBE. Kdyby to zůstalo jen na
 *    šířkách v JS, měl by Jan na telefonu čtyři pole po 60 px vedle sebe.
 * 4) IKONA NIKDY NESTOJÍ SAMA. Ke každé patří title i aria-label - tvar
 *    sám o sobě není informace, kterou by appka směla podávat jen obrázkem.
 * 5) DRŽITEL SE JEN UKAZUJE, NEUKLÁDÁ. Patří ke kartě, ne k dokladu.
 * 6) ŘÁDEK SEZNAMU MÁ POŘÁD STEJNĚ SLOUPCŮ. Ikona jde do buňky s odznakem
 *    úhrady - přidání osmého sloupce byla přesně chyba z v4.64.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
const SERVIS = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'servis.js'), 'utf8');
const SETUP = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'setup.js'), 'utf8');

console.log('\n--- v4.75: seznam listů jako jedno místo pravdy ---');

const { LISTY } = require('./lib/listySchema');

test('lib/listySchema.js vypisuje všechny listy appky', () => {
  assert.ok(Array.isArray(LISTY));
  assert.ok(LISTY.length >= 26, 'čekalo se aspoň 26 listů, je ' + LISTY.length);
  LISTY.forEach((l) => {
    assert.ok(l.nazev, 'list bez názvu');
    assert.ok(Array.isArray(l.hlavicky) && l.hlavicky.length, l.nazev + ' nemá hlavičky');
  });
});

test('setup.js i servis.js berou listy ze stejného schématu', () => {
  assert.ok(SETUP.includes("require('../../lib/listySchema')"));
  assert.ok(SERVIS.includes("require('../../lib/listySchema')"));
  // Kdyby si jeden z nich držel vlastní kopii seznamu, rozešly by se -
  // a servis by hlásil „chybí sloupec" u něčeho, co setup nikdy nezaloží.
  assert.ok(!/const LISTY = \[/.test(SETUP), 'setup.js si drží vlastní kopii LISTY');
});

test('Doklady mají v schématu sloupce, kvůli kterým servis vznikl', () => {
  const doklady = LISTY.find((l) => l.nazev === 'Doklady');
  assert.ok(doklady);
  ['Zauctovano', 'Zauctovano_kdy', 'Zauctoval'].forEach((s) => {
    assert.ok(doklady.hlavicky.indexOf(s) !== -1, 'chybí sloupec ' + s);
  });
});

console.log('\n--- v4.75: servis je jen pro admina, nic nemaže ---');

test('servis.js odmítne účetní i běžného uživatele', () => {
  assert.ok(/uzivatel\.role !== 'admin'/.test(SERVIS));
  assert.ok(/403/.test(SERVIS));
  // Účetní má práva na doklady, ne na strukturu tabulky a Disk.
  assert.ok(!/jeUcetniNeboAdmin/.test(SERVIS), 'servis pouští i účetní');
});

test('kontrola tabulky jen čte - v kontrolaTabulky není žádný zápis', () => {
  const zacatek = SERVIS.indexOf('async function kontrolaTabulky');
  const konec = SERVIS.indexOf('async function doplnSloupce');
  assert.ok(zacatek !== -1 && konec > zacatek);
  const telo = SERVIS.slice(zacatek, konec);
  assert.ok(!telo.includes('values.update'), 'kontrola zapisuje do tabulky');
  assert.ok(!telo.includes('values.append'), 'kontrola přidává řádky');
});

test('appka žádný soubor nemaže ani tady', () => {
  assert.ok(!/files\.delete/.test(SERVIS));
  assert.ok(!/files\.emptyTrash/.test(SERVIS));
  // Osiřelé soubory se jen VYPÍŠOU.
  assert.ok(/osirele\.push/.test(SERVIS));
});

test('doplnění sloupců jen přidává na konec, nepřepisuje', () => {
  const zacatek = SERVIS.indexOf('async function doplnSloupce');
  const konec = SERVIS.indexOf('async function osireleSoubory');
  const telo = SERVIS.slice(zacatek, konec);
  // Nové hlavičky vznikají jako STARÉ + CHYBĚJÍCÍ, nikdy jako čerstvý seznam
  // ze schématu - jinak by se přejmenovaly sloupce, na které visí data.
  assert.ok(telo.includes('hlavicky.concat(chybi)'));
});

test('osiřelé soubory se hledají ve všech listech, které drží soubor', () => {
  ['Doklady', 'Vydane_faktury', 'Smlouvy', 'Smlouvy_Prilohy'].forEach((list) => {
    assert.ok(SERVIS.includes("list: '" + list + "'"), 'nekouká se do ' + list);
  });
  // Kdyby appka koukala jen na Doklady, označila by za osiřelou každou
  // nahranou smlouvu - a Jan by je podle toho výpisu smazal.
});

test('velký Inbox appka nezamlčí - řekne, kolik nestihla', () => {
  assert.ok(/MAX_SOUBORU/.test(SERVIS));
  assert.ok(/zbyvaProjit/.test(SERVIS));
  assert.ok(/zbyvaProjit/.test(APP), 'appka to uživateli neukazuje');
});

console.log('\n--- v4.75: servisní bloky jsou v Nastavení, ne u dokladů ---');

test('Nastavení má sekci Servis a údržba se všemi nástroji', () => {
  const zacatek = HTML.indexOf('<summary>Servis a údržba</summary>');
  assert.ok(zacatek !== -1, 'sekce v Nastavení není');
  const usek = HTML.slice(zacatek, HTML.indexOf('<summary>Google účet appky</summary>'));
  ['tlacitko-servis-kontrola', 'tlacitko-servis-doplnit', 'tlacitko-servis-osirele',
    'cislovani-otevrit', 'cislovani-panel', 'kj-import-firma', 'tlacitko-import-jizd',
  ].forEach((id) => {
    assert.ok(usek.includes('id="' + id + '"'), 'v sekci chybí ' + id);
  });
});

test('u Přijatých faktur už srovnání číslování není', () => {
  // Blok se přestěhoval celý; zbylý obal `doklady-cislovani` by po přesunu
  // znamenal, že v appce visí prvek, který nikdo nevykresluje.
  assert.ok(!HTML.includes('doklady-cislovani'), 'obal doklady-cislovani zůstal v HTML');
  assert.ok(!APP.includes('doklady-cislovani'), 'obsluha doklady-cislovani zůstala v JS');
});

test('import CSV jízd zmizel z Knihy jízd', () => {
  const kniha = HTML.indexOf('id="zalozka-kniha-jizd"');
  if (kniha === -1) return; // jiná struktura záložek - kontrolu neprovádíme
  const konec = HTML.indexOf('id="zalozka-', kniha + 10);
  const usek = HTML.slice(kniha, konec === -1 ? HTML.length : konec);
  assert.ok(!usek.includes('kj-import-soubor'), 'import CSV v Knize jízd zůstal');
});

test('obsluha servisu se navěsí jen adminovi a jen jednou', () => {
  assert.ok(/if \(jeAdmin && !servisInicializovan\)/.test(APP));
  assert.ok(APP.includes('inicializujServis();'));
  assert.ok(APP.includes('servisInicializovan = true;'));
});

test('servisní tlačítka volají /api/servis se správnými akcemi', () => {
  assert.ok(APP.includes("'/servis?akce=kontrola-tabulky'"));
  assert.ok(APP.includes("'/servis?akce=osirele-soubory'"));
  assert.ok(APP.includes("akce: 'doplnit-sloupce'"));
});

test('dlouhá servisní akce si vypne tlačítko, ať se nespustí třikrát', () => {
  const zacatek = APP.indexOf('async function servisAkce');
  const telo = APP.slice(zacatek, zacatek + 900);
  assert.ok(telo.includes('tlacitko.disabled = true'));
  assert.ok(telo.includes('tlacitko.disabled = false'));
});

console.log('\n--- v4.75: mřížka polí v detailu ---');

test('appka má pomocníky na mřížku', () => {
  assert.ok(/function vytvorMrizkuPoli\(\)/.test(APP));
  assert.ok(/function pridejPole\(mrizka, sirka, popisek/.test(APP));
  assert.ok(/function pridejSkupinuPoli\(mrizka, nadpis\)/.test(APP));
});

test('detail dokladu i vydané faktury mřížku opravdu používá', () => {
  // Dvě mřížky = dva detaily (přijatý doklad + vydaná faktura). Jan si
  // vybral, že to má být na obou místech stejné.
  const pocet = (APP.match(/const mrizka = vytvorMrizkuPoli\(\);/g) || []).length;
  assert.ok(pocet >= 2, 'mřížku používá jen ' + pocet + ' detail(ů)');
});

test('každé pole má vlastní popisek (konec „Částka a měna")', () => {
  // Jeden popisek za dvě pole vedle sebe nedává smysl - a hlavně to
  // znamenalo, že druhé pole popisek nemělo vůbec.
  assert.ok(!APP.includes("'Částka a měna'"), 'zůstal sloučený popisek částky');
  assert.ok(!APP.includes("'DPH (částka) a sazba (%)'"), 'zůstal sloučený popisek DPH');
  assert.ok(!APP.includes("'Konstantní a specifický symbol'"), 'zůstal sloučený popisek symbolů');
  assert.ok(APP.includes("'Měna'") && APP.includes("'Sazba (%)'"));
});

test('detail je rozdělený na skupiny, ne na dvacet stejných okének', () => {
  ['Částky', 'Data', 'Platba', 'Zaúčtování'].forEach((skupina) => {
    assert.ok(APP.includes("pridejSkupinuPoli(mrizka, '" + skupina + "')"), 'chybí skupina ' + skupina);
  });
});

test('style.css má mřížku o dvanácti sloupcích', () => {
  const zacatek = CSS.indexOf('.pole-mrizka {');
  assert.ok(zacatek !== -1, 'mřížka ve stylu není');
  const telo = CSS.slice(zacatek, zacatek + 200);
  assert.ok(telo.includes('repeat(12, 1fr)'));
  // Šířky musí být třídami, ne inline stylem - jinak by je mobilní
  // breakpoint nepřebil.
  ['.pole-2', '.pole-3', '.pole-4', '.pole-6', '.pole-9'].forEach((t) => {
    assert.ok(CSS.includes('.pole-mrizka > ' + t + ' {'), 'chybí třída ' + t);
  });
});

test('na mobilu se mřížka složí zpět pod sebe', () => {
  const usek = CSS.slice(CSS.indexOf('@media (max-width: 700px)'));
  assert.ok(usek.indexOf('.pole-mrizka > .pole-4') !== -1, 'tablet mřížku neskládá');
  const uzky = CSS.slice(CSS.indexOf('@media (max-width: 480px)'));
  assert.ok(uzky.indexOf('grid-column: span 12') !== -1, 'telefon mřížku neskládá na jeden sloupec');
});

test('datumové pole v mřížce vyplní svůj sloupec', () => {
  assert.ok(CSS.includes('.pole-mrizka input[type="date"]'));
});

console.log('\n--- v4.75: ikony způsobu platby ---');

test('appka má ikonu pro kartu, hotovost i převod', () => {
  ['Karta', 'Hotovost', 'Převodem'].forEach((zpusob) => {
    assert.ok(APP.includes(zpusob + ':') || APP.includes("'" + zpusob + "':"), 'chybí ikona pro ' + zpusob);
  });
});

test('ikona je inline SVG, ne emoji ani externí soubor', () => {
  const zacatek = APP.indexOf('const IKONY_PLATBY');
  const telo = APP.slice(zacatek, APP.indexOf('function ikonaZpusobuPlatbyHtml'));
  assert.ok(telo.includes('<rect') || telo.includes('<path'));
  assert.ok(!/<img/.test(telo));
  // Emoji vypadá na každém systému jinak; ikonový font by byl další
  // soubor ke stažení.
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(telo), 'v ikonách je emoji');
});

test('ikona nikdy nestojí sama - má title i aria-label', () => {
  const zacatek = APP.indexOf('function ikonaZpusobuPlatbyHtml');
  const telo = APP.slice(zacatek, zacatek + 600);
  assert.ok(telo.includes('aria-label='));
  assert.ok(telo.includes('<title>'));
});

test('ikona respektuje motiv - kreslí se v currentColor', () => {
  const zacatek = CSS.indexOf('.ikona-platby {');
  const telo = CSS.slice(zacatek, zacatek + 300);
  assert.ok(telo.includes('stroke: currentColor'));
});

test('hotovost NENÍ ikona karty', () => {
  // Jan 2026-08-21 na první verzi: *„uhrazeno hotově nemůže být ikona
  // karty, ale třeba mince"*. Bankovka i karta jsou ležatý obdélník -
  // v patnácti pixelech se nepoznaly. Mince má kolečka.
  const zacatek = APP.indexOf('Hotovost: {');
  const telo = APP.slice(zacatek, APP.indexOf('}', APP.indexOf('svg:', zacatek)));
  assert.ok(!telo.includes('<rect'), 'hotovost je pořád obdélník jako karta');
  assert.ok(telo.includes('ellipse') || telo.includes('circle'), 'hotovost není kulatá');
});

// Rozhodnutí o stavu úhrady si test spustí, ať se kontroluje chování.
function nactiStavUhrady() {
  const zacatek = APP.indexOf('function stavUhradyDokladu');
  const konec = APP.indexOf('\n}', zacatek) + 2;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(APP.slice(zacatek, konec) + '\nthis.fn = stavUhradyDokladu;', sandbox);
  return sandbox.fn;
}

test('odznak a ikona vznikají z jednoho rozhodnutí', () => {
  // Kdyby si je počítala dvě různá místa, můžou si odporovat - a přesně
  // to Jan našel: „Uhrazeno hotově" s ikonou karty.
  const zacatek = APP.indexOf('function bankSparovaniBadge');
  const telo = APP.slice(zacatek, zacatek + 600);
  assert.ok(telo.includes('stavUhradyDokladu(d)'));
  assert.ok(telo.includes('ikonaZpusobuPlatbyHtml(stavUhrady.zpusob)'));
  // V řádku seznamu se ikona nesmí přidávat ještě jednou zvlášť.
  const radek = APP.indexOf("'<span class=\"doklad-banka-bunka\">'");
  assert.ok(!APP.slice(radek, radek + 200).includes('ikonaZpusobuPlatbyHtml(d.Zpusob_platby)'));
});

test('doklad placený soukromou kartou mimo účet není „hotově"', () => {
  const fn = nactiStavUhrady();
  const v = fn({ Stav: 'Schváleno', Hrazeno_mimo_ucet: 'ANO', Zpusob_platby: 'Karta' });
  assert.strictEqual(v.zpusob, 'Karta');
  assert.ok(v.text.includes('kartou'), v.text);
  assert.ok(!v.text.includes('hotově'), 'appka to pořád nazývá hotovostí');
});

test('hotovost i prázdný způsob platby mimo účet zůstávají „hotově"', () => {
  const fn = nactiStavUhrady();
  ['Hotovost', ''].forEach((zpusob) => {
    const v = fn({ Stav: 'Schváleno', Hrazeno_mimo_ucet: 'ANO', Zpusob_platby: zpusob });
    assert.strictEqual(v.zpusob, 'Hotovost');
    assert.ok(v.text.includes('hotově'), v.text);
  });
});

test('nenalezená platba zůstává nenalezenou platbou', () => {
  const fn = nactiStavUhrady();
  const v = fn({ Stav: 'Schváleno', Zpusob_platby: 'Karta' });
  // Tvrdé „Neuhrazeno" by u faktury, ke které se jen nenačetl výpis,
  // svádělo k zaplacení podruhé.
  assert.ok(v.text.includes('Nenalezena'), v.text);
  assert.ok(!v.text.includes('Neuhrazeno'));
});

console.log('\n--- v4.75: přepínač způsobu platby ---');

test('způsob platby je dlaždicový přepínač, ne rolovací menu', () => {
  assert.ok(/function vytvorPrepinacZpusobuPlatby\(vybrano\)/.test(APP));
  assert.ok(APP.includes('const vstupZpusobPlatby = vytvorPrepinacZpusobuPlatby('));
});

test('dlaždice jsou uvnitř opravdová radio tlačítka', () => {
  const zacatek = APP.indexOf('function vytvorPrepinacZpusobuPlatby');
  const telo = APP.slice(zacatek, APP.indexOf('// DRŽITEL KARTY', zacatek));
  assert.ok(telo.includes("radio.type = 'radio'"), 'nejsou to radio tlačítka');
  assert.ok(telo.includes("setAttribute('role', 'radiogroup')"));
  // Naklikaná <div>ka by vypadala stejně a byla by nepoužitelná pro
  // každého, kdo nemyší.
  assert.ok(telo.includes('aria-label'));
});

test('u ikony je vždycky i slovo', () => {
  const zacatek = APP.indexOf('function vytvorPrepinacZpusobuPlatby');
  const telo = APP.slice(zacatek, APP.indexOf('// DRŽITEL KARTY', zacatek));
  ['Karta', 'Hotovost', 'Převodem', 'Neuvedeno'].forEach((p) => {
    assert.ok(telo.includes("popisek: '" + p + "'"), 'chybí popisek ' + p);
  });
});

test('„neuvedeno" je plnohodnotná volba', () => {
  // Appka nesmí za člověka vybrat způsob platby jen proto, že vypadá líp,
  // když je něco zaškrtnuté.
  const zacatek = APP.indexOf('function vytvorPrepinacZpusobuPlatby');
  const telo = APP.slice(zacatek, APP.indexOf('// DRŽITEL KARTY', zacatek));
  assert.ok(telo.includes("hodnota: ''"));
});

test('přepínač se navenek chová jako <select> (.value)', () => {
  // Ukládání dokladu se nesmí dozvědět, že se změnilo UI.
  const zacatek = APP.indexOf('function vytvorPrepinacZpusobuPlatby');
  const telo = APP.slice(zacatek, APP.indexOf('// DRŽITEL KARTY', zacatek));
  assert.ok(telo.includes("Object.defineProperty(prepinac, 'value'"));
  assert.ok(APP.includes('Zpusob_platby: vstupZpusobPlatby.value'));
});

test('vybraná dlaždice se pozná i bez :has()', () => {
  // :has() je novinka; prohlížeč, který ji neumí, ji tiše přeskočí a
  // přepínač by vypadal, že není vybráno nic.
  assert.ok(CSS.includes('.prepinac-platby-volba.vybrano'));
  assert.ok(!/\.prepinac-platby-volba:has\(/.test(CSS), 'zvýraznění visí na :has()');
  assert.ok(APP.includes("dl.classList.toggle('vybrano'"));
});

test('vybraná dlaždice se nepozná jen barvou', () => {
  const zacatek = CSS.indexOf('.prepinac-platby-volba.vybrano {');
  const telo = CSS.slice(zacatek, zacatek + 240);
  assert.ok(telo.includes('box-shadow'), 'rozdíl je jen v barvě');
});

test('sloupec úhrady je širší, aby se odznak s ikonou nekrátil', () => {
  const zacatek = CSS.indexOf('grid-template-columns: 16px 92px 62px');
  assert.ok(zacatek !== -1, 'mřížka řádku se změnila');
  const radek = CSS.slice(zacatek, CSS.indexOf(';', zacatek));
  const sloupce = radek.replace('grid-template-columns:', '').trim().split(/\s+(?![^(]*\))/);
  assert.strictEqual(sloupce.length, 8, 'řádek má ' + sloupce.length + ' sloupců místo osmi');
  assert.ok(parseInt(sloupce[3], 10) >= 150, 'sloupec úhrady je jen ' + sloupce[3]);
});

test('řádek seznamu má pořád stejný počet sloupců (chyba z v4.64)', () => {
  // Ikona jde do TÉŽE buňky jako odznak úhrady. Nový samostatný <span>
  // v hlavičce řádku by rozhodil mřížku - přesně to se stalo ve v4.64.
  const zacatek = APP.indexOf("'<span class=\"doklad-banka-bunka\">'");
  assert.ok(zacatek !== -1);
  const telo = APP.slice(zacatek, zacatek + 120);
  assert.ok(telo.includes('bankSparovaniBadge(d)'), 'odznak v buňce chybí');
  // Ikona je součástí odznaku, ne dalšího <span>u - nový sloupec by mřížku
  // rozhodil.
  assert.ok(!telo.includes('<span class="doklad-zpusob'), 'přibyla samostatná buňka pro ikonu');
});

console.log('\n--- v4.75: držitel karty ---');

// Funkci si test vytáhne ze zdroje a spustí - kontroluje se chování, ne
// jen to, že v souboru stojí správná slova.
function nactiPopisDrzitele(karty) {
  const zacatek = APP.indexOf('function popisDrzitelKarty');
  const konec = APP.indexOf('\n}', zacatek) + 2;
  const zdroj = APP.slice(zacatek, konec);
  const sandbox = {
    dokladyKartySeznam: karty,
    posledniCtyriZTextu: (v) => {
      const cislice = String(v == null ? '' : v).replace(/\D/g, '');
      return cislice.length < 4 ? '' : cislice.slice(-4);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(zdroj + '\nthis.fn = popisDrzitelKarty;', sandbox);
  return sandbox.fn;
}

test('u známé karty appka napíše jméno držitele', () => {
  const fn = nactiPopisDrzitele([
    { Cislo_karty: '1234', Drzitel: 'Jan Bula', Firma: 'NOMIS Investment s.r.o.', Popis: 'Fio firemní' },
  ]);
  const text = fn('1234');
  assert.ok(text.includes('Jan Bula'), 'jméno držitele chybí: ' + text);
  assert.ok(text.includes('1234'));
});

test('appka pozná kartu i ze zamaskovaného zápisu', () => {
  const fn = nactiPopisDrzitele([{ Cislo_karty: '1234', Drzitel: 'Jan Bula' }]);
  assert.ok(fn('**** 1234').includes('Jan Bula'));
});

test('prázdné pole nedostane žádný text', () => {
  const fn = nactiPopisDrzitele([{ Cislo_karty: '1234', Drzitel: 'Jan Bula' }]);
  assert.strictEqual(fn(''), '');
  // Dvě číslice nejsou karta - na párování by byly k ničemu a tvořily by
  // falešné shody.
  assert.strictEqual(fn('12'), '');
});

test('neznámou kartu appka nevydává za chybu, ale ani si ji nevymyslí', () => {
  const fn = nactiPopisDrzitele([{ Cislo_karty: '1234', Drzitel: 'Jan Bula' }]);
  const text = fn('9999');
  assert.ok(text.includes('9999'));
  assert.ok(text.includes('nezná'), 'appka neřekla, že kartu nezná: ' + text);
  assert.ok(!text.includes('Jan Bula'), 'appka přiřadila cizího držitele');
});

test('karta bez vyplněného držitele to řekne narovinu', () => {
  const fn = nactiPopisDrzitele([{ Cislo_karty: '1234', Drzitel: '', Firma: '', Popis: '' }]);
  const text = fn('1234');
  assert.ok(text.includes('držitel'), text);
  assert.ok(!text.includes('nezná'), 'karta v seznamu je, tohle není „neznámá karta"');
});

test('držitel se do dokladu neukládá - patří ke kartě', () => {
  // Do řádku dokladu jde pořád jen čtyřčíslí (Platebni_karta). Kdyby se
  // opsalo jméno, po výměně držitele by u starých dokladů zůstalo staré.
  const zacatek = APP.indexOf('Platebni_karta: posledniCtyriZTextu(vstupKarta.value)');
  assert.ok(zacatek !== -1, 'ukládání čtyřčíslí se změnilo');
  assert.ok(!APP.includes('Drzitel: popisKarty'), 'appka ukládá držitele do dokladu');
});

test('appka si karty natáhne, ale bez nich se nezhroutí', () => {
  const zacatek = APP.indexOf("zavolejApi('/platebni-karty', { method: 'GET' }).catch");
  assert.ok(zacatek !== -1, 'karty se buď nenačítají, nebo bez .catch()');
  assert.ok(APP.includes('dokladyKartySeznam = dataKarty.karty || [];'));
});

console.log('\n--- v4.75: appka ví, jakou verzi Jan vidí ---');

test('APP_VERZE je aspoň v4.75', () => {
  const m = APP.match(/const APP_VERZE = 'v(\d+)\.(\d+)/);
  assert.ok(m, 'verze se nedá přečíst');
  const cislo = Number(m[1]) * 100 + Number(m[2]);
  assert.ok(cislo >= 475, 'verze je jen v' + m[1] + '.' + m[2]);
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO SELHALO)' : ' (vše prošlo)'));
