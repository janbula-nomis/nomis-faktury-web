/**
 * test-v471.js
 * Logické testy k v4.71 - minutový limit Google API při hromadném nahrávání.
 *
 * Spouští se ručně: `node test-v471.js` (bez závislostí, bez Google).
 *
 * CO SE STALO
 *
 * Jan 2026-08-20 nahrál přes novou frontu (v4.70) třicet dokladů najednou.
 * Dvacet prošlo, deset spadlo na:
 *
 *   Quota exceeded for quota metric 'Read requests' and limit
 *   'Read requests per minute per user' of service 'sheets.googleapis.com'
 *
 * Sheets API má strop **60 čtecích požadavků za minutu na uživatele** a
 * jeden nahraný doklad jich spotřebuje zhruba šest (hlavičky při zápisu,
 * Bankovni_pohyby, Doklady, Firmy, Predkontace). Třicet dokladů hned za
 * sebou tedy limit přeteče někde u desátého - přesně jak to Jan viděl.
 *
 * Nebyla to chyba dat ani fronty. Chyba byla, že appka na limit reagovala
 * jako na neopravitelnou chybu souboru.
 *
 * TŘI VĚCI, KTERÉ SE TU HLÍDAJÍ
 *
 * 1) LIMIT NENÍ CHYBA SOUBORU. Fronta u něj počká a zkusí to znovu.
 * 2) OPAKUJE SE JEN LIMIT. Chybějící list nebo špatná práva se opakováním
 *    nespraví - jen by se o chybě člověk dozvěděl později.
 * 3) OPAKOVÁNÍ NEVYROBÍ NA DISKU DRUHOU KOPII. Když spadne až zápis do
 *    Sheets, soubor na Disku už je; další pokus ho použije, ne nahraje znovu.
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
async function testAsync(nazev, fn) {
  bezi += 1;
  try {
    await fn();
    console.log('  ok  ' + nazev);
  } catch (e) {
    console.log('  CHYBA  ' + nazev + '\n         ' + e.message);
    process.exitCode = 1;
  }
}

const KOREN = __dirname;
const APP = fs.readFileSync(path.join(KOREN, 'public', 'app.js'), 'utf8');
const HELPERS = fs.readFileSync(path.join(KOREN, 'lib', 'sheetsHelpers.js'), 'utf8');
const UPLOAD_FN = fs.readFileSync(path.join(KOREN, 'netlify', 'functions', 'upload.js'), 'utf8');
const FRONTA = APP
  .slice(APP.indexOf('async function nahratDoklad()'), APP.indexOf('async function dokoncitZpracovaniDokladu'))
  .split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');

const { jeLimitGoogle, opakujPriLimitu, POKUSY, CEKANI_MS } = require('./lib/opakuj');

// Přesně ta hláška, kterou Jan viděl.
const JANOVA_CHYBA = new Error(
  "Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute "
  + "per user' of service 'sheets.googleapis.com' for consumer 'project_number:486927003184'.");

console.log('\nv4.71 - minutový limit Google API\n');

// --- rozpoznání limitu ------------------------------------------------------
console.log('  -- rozpoznání limitu --');

test('Janova hláška se pozná jako limit', () => {
  assert.ok(jeLimitGoogle(JANOVA_CHYBA));
});

test('pozná se i podle kódu 429 a podle důvodu', () => {
  assert.ok(jeLimitGoogle({ code: 429, message: 'Too Many Requests' }));
  assert.ok(jeLimitGoogle({ response: { status: 429 }, message: '' }));
  assert.ok(jeLimitGoogle(new Error('rateLimitExceeded')));
  assert.ok(jeLimitGoogle(new Error('userRateLimitExceeded')));
});

test('běžná chyba se za limit NEpovažuje', () => {
  // Pravidlo 2: opakovat chybějící list nebo špatná práva nemá smysl.
  assert.ok(!jeLimitGoogle(new Error('Requested entity was not found.')));
  assert.ok(!jeLimitGoogle(new Error('The caller does not have permission')));
  assert.ok(!jeLimitGoogle({ code: 404, message: 'Not found' }));
  assert.ok(!jeLimitGoogle(null));
});

// --- opakování na serveru ---------------------------------------------------
console.log('  -- opakování na serveru --');

(async () => {
  await testAsync('při limitu to zkusí znovu a povede se', async () => {
    let volani = 0;
    const vysledek = await opakujPriLimitu(async () => {
      volani += 1;
      if (volani < 2) throw JANOVA_CHYBA;
      return 'ok';
    });
    assert.strictEqual(vysledek, 'ok');
    assert.strictEqual(volani, 2);
  });

  await testAsync('běžná chyba letí ven hned, bez opakování', async () => {
    let volani = 0;
    await assert.rejects(async () => opakujPriLimitu(async () => {
      volani += 1;
      throw new Error('Requested entity was not found.');
    }));
    assert.strictEqual(volani, 1, 'appka zbytečně opakovala chybu, která se nespraví');
  });

  await testAsync('počet pokusů je omezený a nakonec chyba projde ven', async () => {
    let volani = 0;
    await assert.rejects(async () => opakujPriLimitu(async () => {
      volani += 1;
      throw JANOVA_CHYBA;
    }), /Quota exceeded/);
    assert.strictEqual(volani, POKUSY + 1);
  });

  test('čekání na serveru zůstává hluboko pod limitem Netlify funkce', () => {
    // Kdyby se čekalo dlouho, z jasné chyby o limitu by se stal neprůhledný
    // timeout - přesně ten problém, kvůli kterému se ve v3.9 nahrávání
    // rozdělilo na dvě fáze.
    const soucet = CEKANI_MS.reduce((a, b) => a + b, 0);
    assert.ok(soucet <= 3000, 'součet čekání je ' + soucet + ' ms, to už je riziko timeoutu');
  });

  test('všechna volání Sheets jdou přes opakování', () => {
    // Netýká se to jen nahrávání - stejný limit umí potkat import výpisu
    // i archivace scanů.
    assert.ok(/require\('\.\/opakuj'\)/.test(HELPERS));
    const volani = (HELPERS.match(/sheets\.spreadsheets\.values\.(get|append|update)/g) || []).length;
    const obalene = (HELPERS.match(/opakujPriLimitu\(\(\) => sheets\.spreadsheets\.values\./g) || []).length;
    assert.strictEqual(obalene, volani, 'nějaké volání Sheets zůstalo bez opakování');
  });

  // --- fronta v prohlížeči --------------------------------------------------
  console.log('  -- fronta v prohlížeči --');

  test('limit se pozná i v prohlížeči', () => {
    const usek = APP.slice(APP.indexOf('function jeLimitGoogleFront'), APP.indexOf('function pockejMs'));
    assert.ok(/Quota exceeded/.test(usek) && /rateLimitExceeded/.test(usek) && /429/.test(usek));
  });

  test('při limitu fronta čeká a zkusí TENTÝŽ soubor znovu', () => {
    // Pravidlo 1. Označit soubor za nenahraný by poslalo člověka hledat,
    // které z třiceti dokladů chybí, kvůli něčemu, co se spraví za minutu.
    assert.ok(/for \(let pokus = 0; pokus <= CEKANI_PRI_LIMITU_MS\.length; pokus \+= 1\)/.test(FRONTA));
    assert.ok(/if \(!jeLimitGoogleFront\(e\) \|\| pokus === CEKANI_PRI_LIMITU_MS\.length\) break;/.test(FRONTA),
      'opakuje se i chyba, která se opakováním nespraví');
  });

  test('čekání roste až k minutě - limit je minutový', () => {
    const usek = APP.slice(APP.indexOf('const CEKANI_PRI_LIMITU_MS'), APP.indexOf('async function nahratDoklad'));
    assert.ok(/\[20000, 40000, 60000\]/.test(usek), 'kratší čekání by jen znovu narazilo');
  });

  test('po nárazu se fronta natrvalo zpomalí', () => {
    // Jinak by se do limitu bouchalo znovu u každého dalšího souboru.
    assert.ok(/pauzaMs = PAUZA_PO_LIMITU_MS;/.test(FRONTA));
    assert.ok(/if \(pauzaMs\) await pockejMs\(pauzaMs\);/.test(FRONTA));
    const usek = APP.slice(APP.indexOf('const PAUZA_PO_LIMITU_MS'), APP.indexOf('async function nahratDoklad'));
    assert.ok(/= 7000;/.test(usek), 'pauza neodpovídá stropu 60 čtení za minutu při ~6 na doklad');
  });

  test('člověk se dozví, že se čeká, a proč', () => {
    assert.ok(/Čekám na Google…/.test(FRONTA));
    assert.ok(/omezil počet dotazů za minutu/.test(FRONTA));
    assert.ok(/nic nedělejte/.test(FRONTA), 'člověk neví, jestli má zasáhnout');
  });

  test('v souhrnu je vidět, že to Google brzdil', () => {
    assert.ok(/brzdeno/.test(FRONTA));
    assert.ok(/takže to trvalo déle/.test(FRONTA), 'delší běh by vypadal jako zaseknutá appka');
  });

  // --- žádné duplicity na Disku ---------------------------------------------
  console.log('  -- opakování bez druhé kopie na Disku --');

  test('server vrátí ID souboru, když spadne až zápis do Sheets', () => {
    assert.ok(/souborNaDisku: true/.test(UPLOAD_FN));
    assert.ok(/souborId: idSouboru/.test(UPLOAD_FN));
  });

  test('server umí soubor z minula použít místo nového nahrání', () => {
    assert.ok(/const \{ filename, mimeType, dataBase64, souborId \}/.test(UPLOAD_FN));
    assert.ok(/if \(opakovanaCast\) \{/.test(UPLOAD_FN));
    assert.ok(/drive\.files\.get\(\{ fileId: opakovanaCast/.test(UPLOAD_FN),
      'existence souboru se neověřuje - doklad by se dal navěsit na cizí soubor');
  });

  test('klient si ID zapamatuje a při dalším pokusu ho pošle', () => {
    assert.ok(/if \(e\.data && e\.data\.souborId\) souborId = e\.data\.souborId;/.test(FRONTA));
    assert.ok(/souborId\s*\?\s*\{ souborId \}/.test(FRONTA), 'druhý pokus nahraje soubor znovu');
  });

  test('když to nakonec nevyjde, appka řekne, že soubor na Disku je', () => {
    assert.ok(/Soubor je na Disku už uložený, takže o něj nepřijdete/.test(FRONTA));
  });

  test('verze je aspoň v4.71', () => {
    const m = APP.match(/APP_VERZE = 'v(\d+)\.(\d+)/);
    assert.ok(m && parseInt(m[1], 10) * 100 + parseInt(m[2], 10) >= 471);
  });

  console.log('\nHotovo - testů: ' + bezi + (process.exitCode ? ' (NĚCO NEPROŠLO)' : ' (vše prošlo)') + '\n');
})();
