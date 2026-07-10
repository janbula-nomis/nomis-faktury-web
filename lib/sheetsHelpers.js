/**
 * lib/sheetsHelpers.js
 * Tenká vrstva nad Google Sheets API v4 pro čtení/zápis listů jako pole
 * objektů podle hlaviček v prvním řádku. `_row` v každém vráceném objektu
 * je skutečné číslo řádku v listu (1-indexováno, +1 za hlavičku) – použije
 * se pro pozdější update konkrétního řádku.
 */

async function readSheetObjects(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
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
  const values = [headers.map((h) => (rowObj[h] !== undefined ? rowObj[h] : ''))];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetName,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

async function updateRow(sheets, spreadsheetId, sheetName, headers, rowNumber, rowObj) {
  const values = [headers.map((h) => (rowObj[h] !== undefined ? rowObj[h] : ''))];
  const range = sheetName + '!A' + rowNumber + ':' + columnLetter(headers.length) + rowNumber;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
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

module.exports = { readSheetObjects, appendRow, updateRow, columnLetter };
