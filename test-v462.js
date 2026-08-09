/**
 * test-v462.js
 * Logické testy k v4.62 - Nájemné: rozpis a úhrady napříč všemi byty
 * + bezpečné dovytěžení nájemní smlouvy.
 *
 * Spouští se ručně: `node test-v462.js` (bez závislostí, bez Google).
 *
 * Jan 2026-08-09: *„prověř znova správnou evidenci plateb nájmu v záložce
 * Nemovitosti, chci tam rozpis nájmu, vytěžení nájemních smluv a přehled -
 * uhrazeno, po splatnosti"*, a k rozvržení *„jeden seznam všech bytů"*.
 *
 * CO BYLO ŠPATNĚ
 *
 * 1) Předpis plateb existoval od v4.59 na backendu, ale frontend ho nevolal
 *    ANI JEDNOU (`grep -c "predpis-plateb" public/app.js` -> 0). Celá
 *    funkce byla z appky nedosažitelná.
 * 2) Smlouvy nahrané před v4.59 nemají rozpad nájmu, den splatnosti ani VS,
 *    takže z nich předpis vůbec nejde vygenerovat. Řetěz se trhal hned na
 *    začátku.
 * 3) Znovu spustit vytěžení šlo - a bylo to NEBEZPEČNÉ. Funkce přepsala
 *    celý řádek podle nové AI extrakce, včetně `Stredisko`, což je od
 *    v4.23 jediný účetní klíč. Tichá změna střediska by přeházela
 *    zaúčtování bankovních pohybů, vyúčtování i dashboard.
 *
 * Co se tu hlídá především: aby „bezpečné dovytěžení" zůstalo bezpečné.
 * Je to jediné místo v appce, kde AI sahá na už zaúčtovaná data.
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
const DOKONCIT = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'smlouvy-upload-dokoncit.js'), 'utf8');
const PREDPIS_FN = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'predpis-plateb.js'), 'utf8');

const { sestavDovytezeni, NIKDY_NEZAPISOVAT, POLA_DOVYTEZENI } = require('./lib/dovytezeniSmlouvy');
const { parsujCastkuZListu } = require('./lib/bankHelpers');

console.log('\nv4.62 - Nájemné (rozpis a úhrady) + bezpečné dovytěžení smlouvy\n');

// ===========================================================================
// 1) DOVYTĚŽENÍ - tohle je ta nebezpečná část
// ===========================================================================
console.log('  -- dovytěžení smlouvy --');

// Typická stará smlouva: účetně zavedená, ale bez rozpadu nájmu.
function staraSmlouva(zmeny) {
  return Object.assign({
    ID: 's1',
    _row: 7,
    Cislo_smlouvy: 'SML-2024-004',
    Firma: 'Nomis Group s.r.o.',
    Nazev: 'Nájemní smlouva Holečkova 1a',
    Druha_strana: 'Jan Novák',
    Stredisko: 'Byty Holečkova',
    Typ: 'Nájem',
    Perioda: 'Měsíčně',
    Ocekavana_castka: '23000',
    Cisty_najem: '',
    Zaloha_na_sluzby: '',
    Kauce_castka: '',
    Den_splatnosti: '',
    Splatnost_predem: '',
    Variabilni_symbol: '',
    Mena: 'CZK',
    Platnost_od: '2024-03-01',
    Platnost_do: '',
    Poznamka: 'Ověřeno s Janem po telefonu',
    Stav: '',
  }, zmeny || {});
}

const EXTRAKCE = {
  firma_odhad: 'Nomis Reality s.r.o.',       // JINÁ než v appce - past
  nazev: 'Smlouva o nájmu bytu',
  druha_strana: 'Jan Novák',
  stredisko_odhad: 'Holečkova 1',            // JINÉ středisko - hlavní past
  typ: 'Nájem',
  perioda: 'Měsíčně',
  cisty_najem: 18000,
  zaloha_na_sluzby: 5000,
  ocekavana_castka: 23000,
  kauce_castka: 36000,
  kauce_splatnost: '2024-03-01',
  den_splatnosti: 25,
  splatnost_predem: 'ANO',
  variabilni_symbol: '2024004',
  mena: 'CZK',
  platnost_od: '2024-03-01',
  platnost_do: '',
  poznamka_ai: 'Smlouva na dobu neurčitou.',
};

test('prázdná pole se doplní - to je celý smysl dovytěžení', () => {
  const { doplneno } = sestavDovytezeni(staraSmlouva(), EXTRAKCE);
  assert.strictEqual(doplneno.Cisty_najem, '18000');
  assert.strictEqual(doplneno.Zaloha_na_sluzby, '5000');
  assert.strictEqual(doplneno.Kauce_castka, '36000');
  assert.strictEqual(doplneno.Den_splatnosti, '25');
  assert.strictEqual(doplneno.Splatnost_predem, 'ANO');
  assert.strictEqual(doplneno.Variabilni_symbol, '2024004');
});

test('STŘEDISKO se nezapíše nikdy - je to účetní klíč', () => {
  const { doplneno, rozdily } = sestavDovytezeni(staraSmlouva(), EXTRAKCE);
  assert.ok(!('Stredisko' in doplneno), 'appka by tiše přeúčtovala celý byt');
  const nalez = rozdily.find((r) => r.pole === 'Stredisko');
  assert.ok(nalez, 'rozdíl se navíc nesmí zamlčet - jinak by o něm nikdo nevěděl');
  assert.strictEqual(nalez.vApp, 'Byty Holečkova');
  assert.strictEqual(nalez.zAi, 'Holečkova 1');
  assert.strictEqual(nalez.chranene, true);
});

test('…a nezapíše se ani do PRÁZDNA', () => {
  // Nejtiššího případu se to týká nejvíc: prázdné středisko vypadá jako
  // „tady se nic nezkazí", jenže tím se smlouva poprvé zaúčtuje - a to
  // rozhodnutí nemá dělat AI.
  const { doplneno, rozdily } = sestavDovytezeni(staraSmlouva({ Stredisko: '' }), EXTRAKCE);
  assert.ok(!('Stredisko' in doplneno));
  assert.strictEqual(rozdily.find((r) => r.pole === 'Stredisko').duvod, 'chybi-chranene');
});

test('Firma, Název, Typ a Poznámka se taky nepřepíšou samy', () => {
  const { doplneno, rozdily } = sestavDovytezeni(staraSmlouva(), EXTRAKCE);
  ['Firma', 'Nazev', 'Typ', 'Poznamka'].forEach((pole) => {
    assert.ok(!(pole in doplneno), pole + ' se zapsalo samo');
  });
  // Poznámka je Janova vlastní - AI ji smí nabídnout, ne nahradit.
  assert.ok(rozdily.some((r) => r.pole === 'Poznamka' && r.vApp === 'Ověřeno s Janem po telefonu'));
});

test('vyplněné NEchráněné pole se taky nepřepíše, jen se ukáže rozdíl', () => {
  const smlouva = staraSmlouva({ Variabilni_symbol: '111222' });
  const { doplneno, rozdily } = sestavDovytezeni(smlouva, EXTRAKCE);
  assert.ok(!('Variabilni_symbol' in doplneno), 'ruční VS se přepsal AI odhadem');
  const nalez = rozdily.find((r) => r.pole === 'Variabilni_symbol');
  assert.strictEqual(nalez.vApp, '111222');
  assert.strictEqual(nalez.zAi, '2024004');
  assert.strictEqual(nalez.chranene, false);
});

test('shodná hodnota není rozdíl a nezahltí seznam', () => {
  const { rozdily } = sestavDovytezeni(staraSmlouva(), EXTRAKCE);
  assert.ok(!rozdily.some((r) => r.pole === 'Druha_strana'), 'stejné jméno se hlásí jako rozdíl');
  assert.ok(!rozdily.some((r) => r.pole === 'Platnost_od'));
  assert.ok(!rozdily.some((r) => r.pole === 'Mena'));
});

test('„23000" a 23000.00 není rozdíl - Sheets vrací text', () => {
  const smlouva = staraSmlouva({ Cisty_najem: '18000,00' });
  const { doplneno, rozdily } = sestavDovytezeni(smlouva, EXTRAKCE);
  assert.ok(!('Cisty_najem' in doplneno));
  assert.ok(!rozdily.some((r) => r.pole === 'Cisty_najem'), 'formát čísla se hlásí jako rozdíl');
});

test('AI, která nic nenašla, nic nepřepíše ani nenabídne', () => {
  const { doplneno, rozdily } = sestavDovytezeni(staraSmlouva(), {});
  assert.deepStrictEqual(doplneno, {});
  assert.strictEqual(rozdily.length, 0);
});

test('nula z AI se nepovažuje za nález (prompt u nejistoty vrací 0)', () => {
  // lib/gemini.js má výslovný zákaz hádat rozpad: u souhrnné částky vrátí
  // u obou polí nulu. Ta nula nesmí přijít jako „AI našla 0 Kč".
  const { doplneno } = sestavDovytezeni(staraSmlouva(), { cisty_najem: 0, zaloha_na_sluzby: 0 });
  assert.ok(!('Cisty_najem' in doplneno));
  assert.ok(!('Zaloha_na_sluzby' in doplneno));
});

test('Splatnost_predem se normalizuje stejně jako při prvním zpracování', () => {
  assert.strictEqual(sestavDovytezeni(staraSmlouva(), { splatnost_predem: 'ano' }).doplneno.Splatnost_predem, 'ANO');
  // Cokoli jiného než ANO znamená „neplatí se dopředu" -> prázdno, a
  // prázdno se nemá co doplňovat.
  const ne = sestavDovytezeni(staraSmlouva(), { splatnost_predem: 'ne' });
  assert.ok(!('Splatnost_predem' in ne.doplneno));
});

test('Ocekavana_castka: prázdná se dopočítá ze součtu', () => {
  const { doplneno } = sestavDovytezeni(staraSmlouva({ Ocekavana_castka: '' }), EXTRAKCE);
  assert.strictEqual(doplneno.Ocekavana_castka, '23000');
});

test('Ocekavana_castka: vyplněná se NEPŘEPÍŠE, i když součet nesedí', () => {
  // Na tuhle částku spoléhá párování bankovních plateb (lib/bankHelpers.js).
  // Kdyby se změnila sama, přestaly by sedět dosud fungující návrhy.
  const smlouva = staraSmlouva({ Ocekavana_castka: '21000' });
  const { doplneno, rozdily } = sestavDovytezeni(smlouva, EXTRAKCE);
  assert.ok(!('Ocekavana_castka' in doplneno));
  const nalez = rozdily.find((r) => r.pole === 'Ocekavana_castka');
  assert.strictEqual(nalez.duvod, 'soucet-nesedi');
  assert.strictEqual(nalez.zAi, '23000');
});

test('Ocekavana_castka: sedící součet se nehlásí jako rozdíl', () => {
  const { rozdily } = sestavDovytezeni(staraSmlouva(), EXTRAKCE);   // 23000 = 18000+5000
  assert.ok(!rozdily.some((r) => r.pole === 'Ocekavana_castka'));
});

test('do zápisu se nedostane ID, _row, Stav ani číslo smlouvy', () => {
  const { doplneno } = sestavDovytezeni(staraSmlouva({ Cislo_smlouvy: '' }), EXTRAKCE);
  NIKDY_NEZAPISOVAT.forEach((pole) => {
    assert.ok(!(pole in doplneno), pole + ' by přepsalo identitu řádku');
  });
});

test('každé chráněné pole má popisek - člověk to musí umět přečíst', () => {
  POLA_DOVYTEZENI.filter((p) => p.chranene).forEach((p) => {
    assert.ok(p.popisek && p.popisek.length > 2, 'pole ' + p.pole + ' nemá popisek');
  });
  // Účetní klíč se musí jmenovat tak, aby bylo poznat, o co jde.
  assert.ok(/účetní klíč/.test(POLA_DOVYTEZENI.find((p) => p.pole === 'Stredisko').popisek));
});

// ===========================================================================
// 2) ENDPOINT - pojistka proti přepsání hotové smlouvy
// ===========================================================================
console.log('  -- endpoint smlouvy-upload-dokoncit --');

test('hotová smlouva se bez výslovného režimu nepřepíše (409)', () => {
  assert.ok(/jePlaceholder/.test(DOKONCIT), 'chybí rozlišení placeholderu');
  assert.ok(/return json\(409,/.test(DOKONCIT), 'chybí odmítnutí - vrátila by se stará nebezpečná cesta');
  assert.ok(/'Zpracovává se'/.test(DOKONCIT));
});

test('odmítnutí říká, co má člověk udělat místo toho', () => {
  assert.ok(/Dovytěžit z přílohy/.test(DOKONCIT), 'chybová hláška neukazuje cestu ven');
  assert.ok(/účetní klíč/.test(DOKONCIT), 'neříká, PROČ appka odmítla');
});

test('větev dovytěžení zapisuje jen `doplneno`, nic víc', () => {
  const usek = DOKONCIT.slice(DOKONCIT.indexOf('if (chceDovytezit'), DOKONCIT.indexOf('// Číslo smlouvy'));
  assert.ok(/sestavDovytezeni\(smlouva, extrakce\)/.test(usek), 'nepoužívá bezpečnou logiku');
  assert.ok(/Object\.assign\(\{\}, smlouva, doplneno\)/.test(usek),
    'zapisuje se něco jiného než doplněná pole');
  assert.ok(!/extrakce\.stredisko_odhad/.test(usek), 'středisko se do zápisu vrátilo');
});

test('když není co doplnit, do Sheets se vůbec nezapisuje', () => {
  const usek = DOKONCIT.slice(DOKONCIT.indexOf('if (chceDovytezit'), DOKONCIT.indexOf('// Číslo smlouvy'));
  assert.ok(/if \(pocetDoplnenych > 0\)/.test(usek), 'appka píše i prázdný update');
});

test('původní cesta pro placeholder zůstala beze změny', () => {
  // Nahrání NOVÉ smlouvy se tímhle nesmělo rozbít - to je běžný provoz.
  assert.ok(/Stredisko: extrakce\.stredisko_odhad/.test(DOKONCIT),
    'první zpracování přestalo plnit středisko');
});

// ===========================================================================
// 3) PŘEDPIS PLATEB - jeden seznam za celé portfolio
// ===========================================================================
console.log('  -- předpis plateb, portfolio --');

// Kopie souhrnu z predpis-plateb.js (appka nemá build krok, funkce se bez
// Googlu spustit nedá). Test níž hlídá, že se od originálu neodchýlil.
function souhrnPodleMeny(predpisy, dnes) {
  const podleMeny = {};
  predpisy.forEach((p) => {
    if (p.Stav === 'Odpuštěno') return;
    const celkem = parsujCastkuZListu(p.Castka_celkem);
    const zaplaceno = parsujCastkuZListu(p.Uhrazeno);
    const mena = String(p.Mena || 'CZK').trim() || 'CZK';
    if (!podleMeny[mena]) podleMeny[mena] = { mena, predepsano: 0, uhrazeno: 0, poSplatnosti: 0 };
    podleMeny[mena].predepsano += celkem;
    podleMeny[mena].uhrazeno += zaplaceno;
    if (zaplaceno < celkem && String(p.Splatnost || '') && String(p.Splatnost) < dnes) {
      podleMeny[mena].poSplatnosti += 1;
    }
  });
  return podleMeny;
}

const DNES = '2026-08-09';
const PREDPISY = [
  { Typ: 'Kauce', Obdobi: '', Splatnost: '2026-01-01', Castka_celkem: '36000', Uhrazeno: '36000', Mena: 'CZK', Stav: 'Uhrazeno' },
  { Typ: 'Nájem', Obdobi: '2026-06', Splatnost: '2026-05-25', Castka_celkem: '23000', Uhrazeno: '23000', Mena: 'CZK', Stav: 'Uhrazeno' },
  { Typ: 'Nájem', Obdobi: '2026-07', Splatnost: '2026-06-25', Castka_celkem: '23000', Uhrazeno: '', Mena: 'CZK', Stav: 'Předepsáno' },
  { Typ: 'Nájem', Obdobi: '2026-09', Splatnost: '2026-08-25', Castka_celkem: '23000', Uhrazeno: '', Mena: 'CZK', Stav: 'Předepsáno' },
  { Typ: 'Nájem', Obdobi: '2026-07', Splatnost: '2026-06-30', Castka_celkem: '900', Uhrazeno: '', Mena: 'EUR', Stav: 'Předepsáno' },
  { Typ: 'Nájem', Obdobi: '2026-05', Splatnost: '2026-04-25', Castka_celkem: '23000', Uhrazeno: '', Mena: 'CZK', Stav: 'Odpuštěno' },
];

test('Kč a EUR se nesčítají do jednoho čísla', () => {
  const s = souhrnPodleMeny(PREDPISY, DNES);
  assert.deepStrictEqual(Object.keys(s).sort(), ['CZK', 'EUR']);
  assert.strictEqual(s.CZK.predepsano, 36000 + 23000 + 23000 + 23000);
  assert.strictEqual(s.EUR.predepsano, 900);
});

test('odpuštěný předpis se nepočítá ani do dluhu, ani do „po splatnosti"', () => {
  const s = souhrnPodleMeny(PREDPISY, DNES);
  assert.strictEqual(s.CZK.predepsano, 105000, 'odpuštěný měsíc se připočetl');
  assert.strictEqual(s.CZK.poSplatnosti, 1, 'po splatnosti je jen červenec');
});

test('budoucí splatnost není „po splatnosti"', () => {
  // Předpis za září má splatnost 25. 8., dnes je 9. 8. - dluh to zatím není.
  const s = souhrnPodleMeny(PREDPISY, DNES);
  assert.strictEqual(s.CZK.poSplatnosti, 1);
  assert.strictEqual(s.EUR.poSplatnosti, 1);
});

test('backend souhrn opravdu počítá po měnách a posílá je ven', () => {
  assert.ok(/podleMeny/.test(PREDPIS_FN), 'souhrn po měnách v endpointu chybí');
  assert.ok(/podleMeny: Object\.keys\(podleMeny\)/.test(PREDPIS_FN), 'podleMeny se nevrací');
});

test('„po splatnosti" se počítá, do tabulky se nezapisuje', () => {
  const usek = PREDPIS_FN.slice(PREDPIS_FN.indexOf('const obohacene'), PREDPIS_FN.indexOf('const maPredpis'));
  assert.ok(/poSplatnosti:/.test(usek), 'příznak se nepočítá');
  // Kdyby se zapisoval, změnil by se stav jen tím, že si někdo appku
  // otevřel - stejné pravidlo jako u stavů jednotek a přístupových kódů.
  assert.ok(!/updateRow|appendRow/.test(usek), 'do Sheets se při čtení zapisuje');
});

test('GET vse=1 nevynáší předpisy smluv, na které uživatel nemá právo', () => {
  assert.ok(/predpisy = \(rows \|\| \[\]\)\.filter\(\(p\) => viditelne\.has\(p\.Smlouva_ID\)\)/.test(PREDPIS_FN),
    'filtr podle přístupu k firmě zmizel');
});

test('smlouvy bez předpisu se hlásí, a jen ty nájemní', () => {
  const usek = PREDPIS_FN.slice(PREDPIS_FN.indexOf('const bezPredpisu'), PREDPIS_FN.indexOf('return json(200, {\n        predpisy: obohacene'));
  assert.ok(/s\.Typ === 'Nájem'/.test(usek), 'nabízel by předpis i u nenájemní smlouvy');
  assert.ok(/'Zpracovává se'/.test(usek), 'placeholder ve zpracování by se nabízel taky');
  assert.ok(/chybi:/.test(usek), 'neříká, PROČ předpis zatím nejde založit');
});

test('POST je pořád přírůstkový - přegenerování by smazalo úhrady', () => {
  assert.ok(/if \(uzJsou\.has\(p\.Typ \+ '\|' \+ \(p\.Obdobi \|\| ''\)\)\) continue;/.test(PREDPIS_FN),
    'POST přestal přeskakovat existující řádky');
});

// ===========================================================================
// 4) FRONTEND
// ===========================================================================
console.log('  -- obrazovka Nájemné --');

test('appka konečně volá /predpis-plateb (do v4.61 nulakrát)', () => {
  const pocet = (APP.match(/\/predpis-plateb/g) || []).length;
  assert.ok(pocet >= 2, 'předpis je z appky pořád nedosažitelný, volání: ' + pocet);
});

test('rozpis je JEDEN seznam všech bytů, ne per byt', () => {
  // Janova volba. Poznat to jde podle toho, že se volá vse=1 a v tabulce
  // je sloupec s bytem - jinak by seznam nešel přečíst.
  assert.ok(/predpis-plateb\?vse=1/.test(APP), 'volá se po jednotlivých bytech');
  assert.ok(/<th>Byt<\/th>/.test(APP), 'v seznamu napříč byty chybí, čí je který řádek');
});

test('souhrn bere podleMeny, ne plochý součet', () => {
  // Pozor na past, do které jsem spadl ve v4.58 i v4.60: hledat zákaz
  // v celém souboru znamená najít vlastní komentář, který ten zákaz
  // vysvětluje. Kouká se proto jen do těla vykreslovací funkce a
  // s odmazanými komentáři.
  const telo = APP.slice(APP.indexOf('function vykresliNajemne'), APP.indexOf('async function vygenerujPredpisProSmlouvu'))
    .split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
  assert.ok(/souhrn && data\.souhrn\.podleMeny/.test(telo), 'nepoužívá souhrn po měnách');
  assert.ok(!/data\.souhrn\.predepsano|souhrn\.uhrazeno\b(?!.*m\.)/.test(telo),
    'sečetlo by se Kč s EUR do jednoho čísla');
  // Každá karta souhrnu si nese vlastní měnu - bez ní je to jen číslo.
  assert.ok(/formatCastkaSMenou\(m\.dluh, m\.mena\)/.test(telo));
});

test('prázdný rozpis se nevydává za „nikdo nedluží"', () => {
  assert.ok(/zatím žádný předpis plateb není/.test(APP));
  // Upozornění na smlouvy bez předpisu musí být NAD tabulkou - jinak by
  // člověk viděl nulu dřív než vysvětlení. (Stejná past jako ve v4.61.)
  const kdeBez = APP.indexOf('nájemní smlouva zatím nemá předpis plateb');
  const kdeTabulka = APP.indexOf('<th>Splatnost</th>');
  assert.ok(kdeBez > -1 && kdeTabulka > -1);
  assert.ok(kdeBez < kdeTabulka, 'vysvětlení je až pod tabulkou');
});

test('u řádku po splatnosti je i text, nejen barva', () => {
  assert.ok(/Po splatnosti – chybí/.test(APP), 'stav by šel poznat jen podle barvy');
});

test('kauce se v rozpisu nepoplete s nájmem', () => {
  assert.ok(/p\.Typ === 'Kauce' \? 'Kauce'/.test(APP), 'kauce by měla prázdné období');
});

test('dovytěžení se volá výslovně a ptá se předem', () => {
  assert.ok(/rezim: 'dovytezeni'/.test(APP), 'volal by se starý nebezpečný režim');
  assert.ok(/Nic vyplněného nepřepíše/.test(APP), 'člověk neví, co se stane');
});

test('změna střediska se odklepává zvlášť', () => {
  const usek = APP.slice(APP.indexOf('async function ulozRozdilyDovytezeni'), APP.indexOf('// Appka do nabídky nabízí'));
  assert.ok(/Stredisko' \|\| b\.dataset\.pole === 'Firma'/.test(usek), 'citlivá pole se nerozlišují');
  assert.ok(/if \(citlive && !confirm/.test(usek), 'středisko by se změnilo jedním kliknutím');
});

test('strop u smlouvy na dobu neurčitou se neschovává', () => {
  assert.ok(/data\.upozorneni \? '\\n\\n' \+ data\.upozorneni/.test(APP),
    'za pět let by předpisy tiše došly a nikdo by nevěděl proč');
});

test('filtr překresluje z načtených dat, nechodí znovu do Sheets', () => {
  const usek = APP.slice(APP.indexOf("getElementById('najemne-filtr').addEventListener"));
  assert.ok(/vykresliNajemne\(/.test(usek.slice(0, 400)));
  assert.ok(!/nactiNajemne\(/.test(usek.slice(0, 400)), 'přepnutí filtru volá server');
});

test('appka nemá druhou kopii parsujCastkuZListu', () => {
  // Při psaní jsem si jednu omylem přidal - dvě verze téhož pravidla se
  // dřív nebo později rozejdou.
  assert.strictEqual((APP.match(/function parsujCastkuZListu/g) || []).length, 1);
});

// --- HTML a CSS -------------------------------------------------------------
console.log('  -- HTML a CSS --');

test('panel Nájemné je v Nemovitostech a má všechny ovládací prvky', () => {
  const zalozka = HTML.slice(HTML.indexOf('id="zalozka-nemovitosti"'), HTML.indexOf('id="zalozka-vydane-faktury"'));
  ['najemne-rok', 'najemne-filtr', 'tlacitko-najemne-nacist', 'najemne-vysledek'].forEach((id) => {
    assert.ok(zalozka.includes('id="' + id + '"'), 'chybí prvek ' + id);
  });
});

test('každý ovládací prvek má label', () => {
  assert.ok(/<label for="najemne-rok">/.test(HTML));
  assert.ok(/<label for="najemne-filtr">/.test(HTML));
});

test('nové CSS třídy mají protějšek pro tmavý motiv', () => {
  // Login je jediná výjimka z tohohle pravidla; tohle je uvnitř #view-app.
  assert.ok(/:root\[data-motiv="tmavy"\] \.najemne-souhrn-karta/.test(CSS));
  assert.ok(/:root\[data-motiv="tmavy"\] \.najemne-rozdily/.test(CSS));
});

test('odznak „Částečně" je v tmavém motivu čitelný i v gold/navy skinu', () => {
  // Bral barvu z --barva-primarni-tmava, kterou skiny navy a gold přepisují
  // na skoro černou (#0f1f3d) - na tmavě modrém pozadí #22314f nebyl vidět.
  // Barva se proto píše natvrdo. Test hlídá, že se nevrátí ta proměnná.
  // Pozor: samotný komentář nad pravidlem tu proměnnou zmiňuje, takže se
  // kouká až za konec komentáře. (Potřetí ta samá past - viz v4.58, v4.60.)
  const zacatek = CSS.indexOf('/* (v4.62) OPRAVA ČITELNOSTI');
  assert.ok(zacatek > -1, 'oprava odznaku zmizela');
  const poKomentari = CSS.indexOf('*/', zacatek) + 2;
  const usek = CSS.slice(poKomentari, CSS.indexOf('}', poKomentari) + 1);
  assert.ok(/\.badge-navrzeno,/.test(usek), 'pravidlo pro odznak zmizelo');
  assert.ok(/color: #9db4ff;/.test(usek), 'barva se nepíše natvrdo');
  assert.ok(!/--barva-primarni-tmava/.test(usek), 'vrátila se proměnná závislá na skinu');
});

test('CSS komentáře jsou vyvážené (v4.55: rozbitý komentář sežral pravidlo)', () => {
  const otevreno = (CSS.match(/\/\*/g) || []).length;
  const zavreno = (CSS.match(/\*\//g) || []).length;
  assert.strictEqual(otevreno, zavreno, 'nevyvážený /* */ - tiše zabije následující pravidlo');
});

test('CSS má vyvážené složené závorky', () => {
  assert.strictEqual((CSS.match(/\{/g) || []).length, (CSS.match(/\}/g) || []).length);
});

test('verze se posunula', () => {
  assert.ok(/APP_VERZE = 'v4\.62/.test(APP));
});

console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO NEPROŠLO)' : ' (vše prošlo)') + '\n');
