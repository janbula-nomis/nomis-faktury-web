/**
 * lib/sheetsHelpers.js
 * Tenká vrstva nad Google Sheets API v4 pro čtení/zápis listů jako pole
 * objektů podle hlaviček v prvním řádku. `_row` v každém vráceném objektu
 * je skutečné číslo řádku v listu (1-indexováno, +1 za hlavičku) – použije
 * se pro pozdější update konkrétního řádku.
 *
 * DŮLEŽITÉ (oprava v3.10 - viz README-DEPLOY.md, sekce o opravě posunutých
 * sloupců u Dokladů): `appendRow`/`appendRows`/`updateRow` dřív zapisovaly
 * hodnoty na pozice podle POŘADÍ v poli `headers`, které jim volající kód
 * předal (typicky `DOKLADY_HEADERS` apod. z `lib/*Schema.js`) - ale tohle
 * pole odpovídá aktuální verzi KÓDU, ne nutně skutečnému hlavičkovému
 * řádku v listu. Když se do schématu v kódu přidalo nové pole doprostřed
 * seznamu (např. `Stredisko`/`Hrazeno_mimo_ucet` u Dokladů) a appka nebo
 * `setup.js` ho do SKUTEČNÉHO listu doplnily jinam (typicky až na konec,
 * `setup.js` chybějící sloupce vždy jen připojuje), zápis podle kódového
 * pole přestal sedět se skutečným pořadím sloupců v listu - hodnoty se
 * tak zapisovaly "vedle" (např. hodnota Střediska skončila ve sloupci,
 * který list nazýval "SPZ_auta"). Funkce si teď VŽDY samy načtou aktuální
 * hlavičkový řádek přímo z listu a zapisují podle NĚJ (parametr `headers`
 * beze změny zůstává, ale používá se jen jako záložní pořadí pro úplně
 * prázdný list, kde ještě žádná hlavička není) - appka tak zapisuje vždy
 * do sloupce podle jeho SKUTEČNÉHO názvu v listu, bez ohledu na to, kde
 * přesně sloupec v listu fyzicky je. Pole, které v listu ještě vůbec
 * neexistuje jako sloupec (typicky nově přidané pole, dokud se nespustí
 * `/api/setup`), appka bezpečně přeskočí (nezapíše ho nikam, radši než
 * aby ho zapsala na špatné místo) - projeví se to tak, že se hodnota
 * daného pole neuloží, dokud `/api/setup` sloupec do listu nedoplní.
 */

// Oprava v3.11.1: appka dřív u nově přidaných listů (typicky "Ucty",
// "Bankovni_pohyby", "Vydane_faktury" - viz setup.js), pokud ještě
// nebyly v Janově tabulce vůbec založené (protože `/api/setup` po jejich
// zavedení nebylo spuštěné), nechala nezachycenou surovou anglickou chybu
// Google Sheets API "Unable to parse range: <NázevListu>" probublat rovnou
// do appky (Jan takhle narazil při importu bankovního výpisu pro NOMIS &
// Homes - appka se snažila přečíst list "Ucty", který v jeho tabulce ještě
// neexistoval). Všechny funkce v týhle vrstvě teď takovou chybu poznají
// a nahradí ji jasnou českou hláškou s návodem, co udělat.
function jeChybaChybejicihoListu(e) {
  return !!(e && typeof e.message === 'string' && /unable to parse range/i.test(e.message));
}

function zabalChybuChybejicihoListu(e, sheetName) {
  if (jeChybaChybejicihoListu(e)) {
    return new Error(
      'List "' + sheetName + '" v Google Sheets zatím neexistuje. Spusťte prosím znovu ' +
        '/api/setup (viz README-DEPLOY.md, krok 6) - appka ho bezpečně vytvoří i s hlavičkou, ' +
        'nic jiného v tabulce se tím nesmaže ani nepřepíše.'
    );
  }
  return e;
}

async function nactiSkutecneHlavicky(sheets, spreadsheetId, sheetName, zalozniHlavicky) {
  let res;
  try {
    res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName + '!1:1' });
  } catch (e) {
    throw zabalChybuChybejicihoListu(e, sheetName);
  }
  const radek = (res.data.values && res.data.values[0]) || [];
  // Prázdný list (ještě žádná hlavička) - použij záložní pořadí, ať appka
  // umí zapsat i úplně první řádek dřív, než list vůbec má hlavičku
  // (běžný `setup.js` tenhle případ řeší sám, ale pro jistotu i tady).
  return radek.length > 0 ? radek : zalozniHlavicky;
}

async function readSheetObjects(sheets, spreadsheetId, sheetName) {
  let res;
  try {
    res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  } catch (e) {
    throw zabalChybuChybejicihoListu(e, sheetName);
  }
  const radky = res.data.values || [];
  if (radky.length === 0) return { headers: [], rows: [] };

  const headers = radky[0];
  const rows = radky.slice(1).map((radek, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, idx) => {
      obj[h] = radek[idx] !== undefined ? radek[idx] : '';
    });
    return obj;
  });

  return { headers, rows };
}

async function appendRow(sheets, spreadsheetId, sheetName, headers, rowObj) {
  const skutecneHlavicky = await nactiSkutecneHlavicky(sheets, spreadsheetId, sheetName, headers);
  const values = [skutecneHlavicky.map((h) => (rowObj[h] !== undefined ? rowObj[h] : ''))];
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  } catch (e) {
    throw zabalChybuChybejicihoListu(e, sheetName);
  }
}

// Jako appendRow, ale zapíše víc řádků jedním voláním Sheets API - důležité
// při importu desítek/stovek řádků najednou (např. bankovní výpis), ať to
// nestojí jedno API volání na řádek a neriskuje se tak timeout funkce.
async function appendRows(sheets, spreadsheetId, sheetName, headers, rowObjs) {
  if (!rowObjs.length) return;
  const skutecneHlavicky = await nactiSkutecneHlavicky(sheets, spreadsheetId, sheetName, headers);
  const values = rowObjs.map((rowObj) => skutecneHlavicky.map((h) => (rowObj[h] !== undefined ? rowObj[h] : '')));
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  } catch (e) {
    throw zabalChybuChybejicihoListu(e, sheetName);
  }
}

async function updateRow(sheets, spreadsheetId, sheetName, headers, rowNumber, rowObj) {
  const skutecneHlavicky = await nactiSkutecneHlavicky(sheets, spreadsheetId, sheetName, headers);
  const values = [skutecneHlavicky.map((h) => (rowObj[h] !== undefined ? rowObj[h] : ''))];
  const range = sheetName + '!A' + rowNumber + ':' + columnLetter(skutecneHlavicky.length) + rowNumber;
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  } catch (e) {
    throw zabalChybuChybejicihoListu(e, sheetName);
  }
}

function columnLetter(n) {
  let s = '';
  let zbytek = n;
  while (zbytek > 0) {
    const m = (zbytek - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    zbytek = Math.floor((zbytek - 1) / 26);
  }
  return s;
}

async function getSheetIdByName(sheets, spreadsheetId, sheetName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const nalezeny = meta.data.sheets.find((s) => s.properties.title === sheetName);
  if (!nalezeny) throw new Error('List "' + sheetName + '" nebyl v tabulce nalezen.');
  return nalezeny.properties.sheetId;
}

async function deleteRow(sheets, spreadsheetId, sheetName, rowNumber) {
  const sheetId = await getSheetIdByName(sheets, spreadsheetId, sheetName);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

module.exports = {
  readSheetObjects,
  appendRow,
  appendRows,
  updateRow,
  deleteRow,
  getSheetIdByName,
  columnLetter,
};
