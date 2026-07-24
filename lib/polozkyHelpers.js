/**
 * lib/polozkyHelpers.js
 * Sdílená logika pro ukládání/nahrazování položek faktury (od v4.27) -
 * appka ji používá STEJNĚ pro Doklady_Polozky (přijaté) i Vydane_Faktury_
 * Polozky (vydané), jen s jiným názvem listu/vazebního pole (Doklad_ID vs
 * Faktura_ID), viz lib/dokladyPolozkySchema.js a lib/vydaneFakturyPolozkySchema.js.
 *
 * `nahradPolozky` appka volá ze DVOU míst: (1) při dokončení AI zpracování
 * (upload-dokoncit.js / vydane-faktury-upload-dokoncit.js), kde doklad/
 * faktura ještě žádné položky mít nemůže (nové), a (2) při ZPĚTNÉM vytěžení
 * u už dřív zpracovaného dokladu (doklady-vytezit-polozky.js apod.), kde
 * appka staré položky nejdřív smaže a nahradí novými - appka je NENÍ
 * schopná inteligentně sloučit/porovnat se starými (AI je při každém
 * zavolání může vytěžit v trochu jiném pořadí/formulaci), takže radši
 * kompletně nahradí, než aby riskovala duplicitní řádky při opakovaném
 * vytěžení stejného dokladu.
 *
 * Appka řádky maže odzadu (podle _row sestupně), stejná konvence jako
 * dávkové mazání importu v netlify/functions/banka.js - mazání řádku v
 * Sheets posouvá čísla řádků POD ním, takže mazání odzadu je jediný
 * bezpečný způsob, jak smazat víc řádků najednou beze změny čísel
 * zbývajících řádků, které appka ještě potřebuje smazat.
 */
const crypto = require('crypto');
const { readSheetObjects, appendRows, deleteRow } = require('./sheetsHelpers');

async function nahradPolozky(sheets, spreadsheetId, sheetName, headers, idPole, id, polozky) {
  const { rows } = await readSheetObjects(sheets, spreadsheetId, sheetName).catch(() => ({ rows: [] }));
  const stareRadky = rows.filter((r) => r[idPole] === id).sort((a, b) => b._row - a._row);
  for (const radek of stareRadky) {
    await deleteRow(sheets, spreadsheetId, sheetName, radek._row);
  }

  const cistePolozky = (Array.isArray(polozky) ? polozky : [])
    .filter((p) => p && typeof p === 'object')
    .map((p, idx) => ({
      ID: crypto.randomUUID(),
      [idPole]: id,
      Nazev: String(p.nazev || '').trim() || '(bez názvu)',
      Mnozstvi: p.mnozstvi !== undefined && p.mnozstvi !== null && p.mnozstvi !== '' ? p.mnozstvi : 1,
      Cena: p.cena !== undefined && p.cena !== null && p.cena !== '' ? p.cena : 0,
      SazbaDPH: p.sazba_dph !== undefined && p.sazba_dph !== null ? String(p.sazba_dph) : '',
      Poradi: idx + 1,
    }));

  if (cistePolozky.length > 0) {
    await appendRows(sheets, spreadsheetId, sheetName, headers, cistePolozky);
  }
  return cistePolozky;
}

module.exports = { nahradPolozky };
