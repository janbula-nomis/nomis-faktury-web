/**
 * test-v476.js
 * Logické testy k v4.76 - ikony místo holého textu a objem zaúčtování
 * v Dashboardu.
 *
 * Spouští se ručně: `node test-v476.js` (bez závislostí, bez Google).
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21: *„udělej hezké ikony místo jen textu, kolik je zaúčtováno
 * apod., navíc do Dashboardu přidej také informace, jaký objem je zaúčtován
 * a kolik zbývá"*.
 *
 * CO SE TU HLÍDÁ
 *
 * 1) MĚNY SE NIKDY NESČÍTAJÍ. Ani v dlaždici, ani v pruhu. CZK a EUR jsou
 *    dvě čísla; slepenec „1 000 Kč + 40 EUR" by vypadal jako součet.
 * 2) DO ZAÚČTOVÁNÍ PATŘÍ JEN SCHVÁLENÉ DOKLADY. Nezpracovaný doklad se
 *    zaúčtovat nedá, takže do jmenovatele nepatří.
 * 3) NULA Z NULY NENÍ STO PROCENT. Když za období není co účtovat, appka to
 *    napíše - nepředstírá hotovo.
 * 4) IKONA NIKDY NESTOJÍ SAMA. Ke každé patří číslo, popisek, title
 *    i aria-label.
 * 5) ČÁSTKY SE NESMÍ DOSTAT DO VĚTVE „JEN POČÍTADLA". Tu vidí i běžná role,
 *    která čísla vidět nemá - stejné pravidlo jako od v4.48.
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
const CSS = fs.readFileSync(path.join(KOREN, 'public', 'style.css'), 'utf8');
const HTML = fs.readFileSync(path.join(KOREN, 'public', 'index.html'), 'utf8');
const DASH = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'dashboard-firmy.js'), 'utf8');

console.log('\n--- v4.76: ikony stavů ---');

test('appka má ikonu pro doklad, zaúčtováno i zbývá', () => {
  ['doklad:', 'zauctovano:', 'zbyva:', 'keSchvaleni:', 'banka:', 'prijem:', 'hotovo:'].forEach((klic) => {
    assert.ok(APP.includes('  ' + klic), 'chybí ikona ' + klic);
  });
});

test('ikony jsou inline SVG, ne emoji', () => {
  const zacatek = APP.indexOf('const IKONY_STAVU');
  const telo = APP.slice(zacatek, APP.indexOf('function ikonaStavuHtml'));
  assert.ok(telo.includes('<path') || telo.includes('<circle'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(telo), 'v ikonách je emoji');
  assert.ok(!/<img/.test(telo));
});

test('ikona nikdy nestojí sama - title i aria-label', () => {
  const zacatek = APP.indexOf('function ikonaStavuHtml');
  const telo = APP.slice(zacatek, zacatek + 700);
  assert.ok(telo.includes('aria-label='));
  assert.ok(telo.includes('<title>'));
});

test('ikona respektuje motiv - kreslí se v currentColor', () => {
  const zacatek = CSS.indexOf('.ikona-stav {');
  assert.ok(zacatek !== -1, 'styl ikony chybí');
  assert.ok(CSS.slice(zacatek, zacatek + 250).includes('stroke: currentColor'));
});

test('v upozorněních Dashboardu je ikona místo znaku ⚠', () => {
  const zacatek = APP.indexOf('const upozorneni = [];');
  const telo = APP.slice(zacatek, zacatek + 1600);
  assert.ok(telo.includes("ikonaStavuHtml('keSchvaleni')"));
  assert.ok(telo.includes("ikonaStavuHtml('banka')"));
  assert.ok(telo.includes("ikonaStavuHtml('prijem')"));
  assert.ok(telo.includes("ikonaStavuHtml('hotovo')"));
  assert.ok(!/polozka-upozorneni">⚠/.test(telo), 'zůstal textový vykřičník');
});

console.log('\n--- v4.76: souhrn dokladů jako dlaždice ---');

test('souhrn nad seznamem jsou dlaždice, ne věta', () => {
  assert.ok(/function souhrnDokladuHtml\(vyber\)/.test(APP));
  const zacatek = APP.indexOf('function souhrnDokladuHtml');
  const telo = APP.slice(zacatek, zacatek + 1800);
  ['doklad', 'zauctovano', 'zbyva'].forEach((klic) => {
    assert.ok(telo.includes("statDlazdice('" + klic + "'"), 'chybí dlaždice ' + klic);
  });
  // Dlaždice se vkládají jako HTML, ne textContent - jinak by se v seznamu
  // objevil zdrojový kód.
  assert.ok(APP.includes('souhrnEl.innerHTML = souhrnDokladuHtml('));
  assert.ok(!APP.includes('souhrnEl.textContent = souhrnDokladuHtml('));
});

test('k počtu patří i objem', () => {
  const zacatek = APP.indexOf('function souhrnDokladuHtml');
  const telo = APP.slice(zacatek, zacatek + 1800);
  // Dvacet paragonů po stokoruně a jedna faktura za půl milionu je dvacet
  // jedna dokladů a úplně jiná práce.
  assert.ok((telo.match(/castkyJakoRadky\(castkyDokladuPodleMeny\(/g) || []).length >= 3,
    'objem se u dlaždic nepočítá');
});

test('částky se nikdy neslepují do jednoho čísla', () => {
  const zacatek = APP.indexOf('function statDlazdice');
  const telo = APP.slice(zacatek, zacatek + 700);
  // Každá měna má vlastní řádek. Slepenec by vypadal jako součet, kterým není.
  assert.ok(telo.includes('stat-detail'));
  assert.ok(!/\.join\(' \+ '\)/.test(telo), 'dlaždice slepuje měny do jednoho řetězce');
});

// Sčítání částek si test spustí - kontroluje se chování, ne zdroj.
function nactiCastky() {
  const zacatek = APP.indexOf('function castkyDokladuPodleMeny');
  const konec = APP.indexOf('\n}', zacatek) + 2;
  const sandbox = {
    parsujCastkuZListu: (h) => {
      const t = String(h === null || h === undefined ? '' : h).trim().replace(/\s/g, '').replace(',', '.');
      const c = parseFloat(t);
      return Number.isFinite(c) ? c : 0;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(APP.slice(zacatek, konec) + '\nthis.fn = castkyDokladuPodleMeny;', sandbox);
  return sandbox.fn;
}

test('CZK a EUR zůstanou dvě čísla, ne jedno', () => {
  const fn = nactiCastky();
  const vysledek = fn([
    { Castka: '1000', Mena: 'CZK' },
    { Castka: '40', Mena: 'EUR' },
  ]);
  assert.strictEqual(vysledek.CZK, 1000);
  assert.strictEqual(vysledek.EUR, 40);
});

test('dobropis objem snižuje, nepřičítá', () => {
  const fn = nactiCastky();
  // Opravný daňový doklad ruší dřívější náklad. Kdyby se přičítal, objem
  // k zaúčtování by vycházel vyšší, než kolik firma opravdu utratila.
  const vysledek = fn([
    { Castka: '1000', Mena: 'CZK' },
    { Castka: '250', Mena: 'CZK', Typ_dokladu: 'Dobropis' },
  ]);
  assert.strictEqual(vysledek.CZK, 750);
});

test('prázdná měna spadne na CZK, ne na prázdný klíč', () => {
  const fn = nactiCastky();
  assert.strictEqual(fn([{ Castka: '100' }]).CZK, 100);
});

console.log('\n--- v4.76: objem zaúčtování v Dashboardu ---');

test('backend počítá zaúčtováno i zbývá, po měnách', () => {
  const zacatek = DASH.indexOf('const zauctovanoCastky = {}');
  assert.ok(zacatek !== -1, 'výpočet v dashboard-firmy.js chybí');
  const telo = DASH.slice(zacatek, zacatek + 1200);
  assert.ok(telo.includes("d.Stav === 'Schváleno'"), 'počítají se i neschválené doklady');
  assert.ok(telo.includes('zacatekOkna'), 'nepoužívá se stejné okno jako zbytek Dashboardu');
  assert.ok(telo.includes("d.Typ_dokladu === 'Dobropis' ? -1 : 1"), 'dobropis se nepočítá záporně');
  assert.ok(telo.includes('pripoctiCelkem(zauctovanoCastky'), 'objem se nepočítá po měnách');
  assert.ok(telo.includes('pripoctiCelkem(zbyvaCastky'));
});

test('zaúčtování se posílá v odpovědi karty', () => {
  assert.ok(/zauctovani: \{/.test(DASH));
  ['zauctovanoPocet', 'zbyvaPocet', 'zauctovanoCastky', 'zbyvaCastky'].forEach((pole) => {
    assert.ok(DASH.includes(pole), 'chybí ' + pole);
  });
});

test('částky se nedostanou do větve „jen počítadla"', () => {
  // Tu vidí i běžná role, která čísla vidět nemá (pravidlo od v4.48).
  const zacatek = DASH.indexOf('if (jenPocitadla) {');
  const konec = DASH.indexOf('return json(200, {\n      firmy: vysledky');
  const telo = DASH.slice(zacatek, konec > zacatek ? konec : zacatek + 900);
  assert.ok(!telo.includes('zauctovani'), 'osekaná odpověď nese částky');
  assert.ok(!telo.includes('Castky'), 'osekaná odpověď nese částky');
});

// Vykreslení pruhu si test spustí se zjednodušenými pomocníky - jde o
// procenta a o to, co appka napíše, ne o přesné HTML dlaždic.
function nactiVykresleni() {
  const zacatek = APP.indexOf('function vykresliZauctovaniKarty');
  const konec = APP.indexOf('\n}', APP.indexOf('return html;', zacatek)) + 2;
  const sandbox = {
    statDlazdice: (klic, hodnota, popisek, detail) =>
      '[' + klic + '=' + hodnota + '|' + (detail || []).join('~') + ']',
    castkyJakoRadky: (podleMeny) => Object.keys(podleMeny || {})
      .map((m) => podleMeny[m] + ' ' + m),
  };
  vm.createContext(sandbox);
  vm.runInContext(APP.slice(zacatek, konec) + '\nthis.fn = vykresliZauctovaniKarty;', sandbox);
  return sandbox.fn;
}

test('pruh počítá podíl POČTU dokladů, ne částek', () => {
  const fn = nactiVykresleni();
  // Podíl částek by musel sečíst měny dohromady - to appka nedělá nikde.
  const html = fn({ zauctovanoPocet: 3, zbyvaPocet: 1, zauctovanoCastky: { CZK: 999999 }, zbyvaCastky: { CZK: 1 } });
  assert.ok(html.includes('75 %'), 'procento nesedí na počty: ' + html.slice(0, 200));
  assert.ok(html.includes('width:75%'));
});

test('pruh není jediný nositel informace', () => {
  const fn = nactiVykresleni();
  const html = fn({ zauctovanoPocet: 3, zbyvaPocet: 1 });
  assert.ok(html.includes('3 z 4'), 'chybí čísla vedle pruhu');
  assert.ok(html.includes('aria-label'), 'pruh nemá jméno pro odečítač');
});

test('nula z nuly není sto procent', () => {
  const fn = nactiVykresleni();
  const html = fn({ zauctovanoPocet: 0, zbyvaPocet: 0 });
  assert.ok(!html.includes('%'), 'appka předstírá hotovo: ' + html);
  assert.ok(html.includes('nejsou žádné schválené'), html);
});

test('chybějící data appku nepoloží', () => {
  // Starší nasazení backendu vrátí kartu bez pole `zauctovani`.
  const fn = nactiVykresleni();
  assert.ok(fn(undefined).includes('nejsou žádné schválené'));
});

test('karta firmy blok opravdu vykresluje', () => {
  const zacatek = APP.indexOf('function vytvorDashFirmaKarta');
  const telo = APP.slice(zacatek, zacatek + 3000);
  assert.ok(telo.includes('vykresliZauctovaniKarty(f.zauctovani)'));
});

console.log('\n--- v4.76: vzhled ---');

test('dlaždice se stavem se nepozná jen barvou', () => {
  const zacatek = CSS.indexOf('.stat-dlazdice.stat-hotovo {');
  assert.ok(zacatek !== -1);
  // Ikona a popisek nesou tutéž informaci co barva - barva sama by pro
  // barvoslepého uživatele neřekla nic.
  const telo = APP.slice(APP.indexOf('function statDlazdice'), APP.indexOf('function statDlazdice') + 700);
  assert.ok(telo.includes('ikonaStavuHtml(klic)'));
  assert.ok(telo.includes('stat-popisek'));
});

test('tmavý motiv má pro dlaždice vlastní pozadí', () => {
  // Světle zelená z denního motivu by pod světlým textem zmizela.
  assert.ok(/:root\[data-motiv="tmavy"\] \.stat-dlazdice\.stat-hotovo/.test(CSS));
  assert.ok(/:root\[data-motiv="tmavy"\] \.stat-dlazdice\.stat-ceka/.test(CSS));
});

test('souhrn v HTML má vlastní obal, ne třídu popis', () => {
  assert.ok(HTML.includes('id="doklady-souhrn-firmy" class="souhrn-dokladu"'));
  assert.ok(CSS.includes('.souhrn-dokladu {'));
});

test('APP_VERZE je aspoň v4.76', () => {
  const m = APP.match(/const APP_VERZE = 'v(\d+)\.(\d+)/);
  assert.ok(m, 'verze se nedá přečíst');
  assert.ok(Number(m[1]) * 100 + Number(m[2]) >= 476, 'verze je jen v' + m[1] + '.' + m[2]);
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO SELHALO)' : ' (vše prošlo)'));
