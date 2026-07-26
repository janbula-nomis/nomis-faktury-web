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

// v4.34 (Jan: "špatně vytěžuje ... ceny u položek") - appka zjistila, že AI
// extrakce jednotkové ceny položky (`cena`, appka ji vyžaduje BEZ DPH a
// JEDNOTKOVOU, viz lib/gemini.js) je nespolehlivá hlavně tam, kde doklad
// uvádí jen CELKOVOU cenu řádku s množstvím > 1 - appka prompt zpřesnila
// (viz gemini.js), ale appka navíc přidává TUHLE kontrolu jako druhou
// pojistku: porovná součet položek (cena × množství) se ZÁKLADEM DANĚ
// dokladu (částka MINUS DPH - appka srovnává se základem, ne s celkovou
// částkou, protože položky appka ukládá bez DPH). Appka doklad kvůli
// neshodě NEBLOKUJE (položky zůstávají jako AI odhad k ruční kontrole,
// stejná konvence jako zbytek appky) - jen appka vrátí srozumitelnou
// hlášku, kterou volající kód přidá do Poznamka dokladu/faktury, ať si
// toho uživatel při kontrole všimne.
function zkontrolujSoucetPolozek(polozky, castkaCelkem, dphCastka) {
  const seznam = Array.isArray(polozky) ? polozky : [];
  if (seznam.length === 0) return null;

  const soucet = seznam.reduce((acc, p) => {
    const cena = Number(String((p && (p.cena ?? p.Cena)) ?? 0).replace(',', '.')) || 0;
    const mnozstviRaw = p && (p.mnozstvi ?? p.Mnozstvi);
    const mnozstvi = mnozstviRaw === undefined || mnozstviRaw === null || mnozstviRaw === ''
      ? 1
      : Number(String(mnozstviRaw).replace(',', '.')) || 1;
    return acc + cena * mnozstvi;
  }, 0);

  const zaklad = Number(castkaCelkem || 0) - Number(dphCastka || 0);
  if (!zaklad) return null; // appka nemá spolehlivý základ daně k porovnání

  const rozdil = Math.abs(soucet - zaklad);
  // Appka toleruje zaokrouhlení (2 Kč/EUR nebo 2 % ze základu, podle toho,
  // co je větší) - appka nechce hlásit falešné poplachy z běžného
  // zaokrouhlení na haléře.
  const tolerance = Math.max(2, Math.abs(zaklad) * 0.02);
  if (rozdil <= tolerance) return null;

  return (
    'Součet položek (' + (Math.round(soucet * 100) / 100) + ') neodpovídá základu daně dokladu (' +
    (Math.round(zaklad * 100) / 100) + ') - zkontrolujte prosím ceny/množství položek.'
  );
}

module.exports = { nahradPolozky, zkontrolujSoucetPolozek };
