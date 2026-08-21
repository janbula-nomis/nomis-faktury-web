/**
 * lib/smluvniStrany.js
 * Společná obsluha číselníků smluvních stran (od v4.81).
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21: *„jak budeme řešit smlouvy a dodatky, potřebuji generovat
 * dokumentaci, po vyplnění karty udělat tiskový výstup k podpisu"*.
 * Ve volbě si vybral **číselník nájemců** místo polí přímo na smlouvě -
 * Schulte Group a.s. má u něj pronajaté byty na Holečkově i ve Velkých
 * Popovicích a jeho IČ, sídlo a členy představenstva by jinak opisoval
 * u každé smlouvy znovu.
 *
 * PROČ JEDEN SOUBOR PRO DVA LISTY
 *
 * `Pronajimatele` (v4.80) a `Najemci` (v4.81) mají stejné sloupce i stejnou
 * obsluhu - je to dvakrát totéž: „kdo je ta strana a co se o ní tiskne do
 * hlavičky". Dva samostatné soubory by se dřív nebo později rozešly; tahle
 * appka na to má vlastní jizvy (seznam listů se rozešel mezi setup.js
 * a servis.js, dokud se v v4.75 nevytáhl do lib/listySchema.js).
 *
 * PROČ TEDY DVA LISTY A NE JEDEN S PŘÍZNAKEM
 *
 * Protože je to opravdu jiná množina lidí a firem. V Janově případě se
 * nepřekrývají vůbec: pronajímatelé jsou tři NOMISy a on sám, nájemci jsou
 * Schulte a fyzické osoby. Jeden list s políčkem „role" by znamenal, že se
 * v roletce „za koho se dokument vystavuje" musí filtrovat - a jednou to
 * někdo zapomene a nabídne nájemníka jako pronajímatele.
 *
 * `Vychozi` má smysl jen u pronajímatelů (koho appka předvybere). U nájemců
 * sloupec zůstává kvůli společnému schématu, ale nic ho nečte - vybírá se
 * podle smlouvy.
 */
const { getSheetsClient } = require('./google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('./sheetsHelpers');
const { PRONAJIMATELE_HEADERS } = require('./pronajimateleSchema');
const { json } = require('./http');
const crypto = require('crypto');

// Textová pole se před uložením jen ořežou. Žádné dopočítávání: appka
// nedomýšlí Druh z IČO ani DIČ z IČO (viz jeFirma() ve schématu - to je
// otázka pro čtení, ne pro zápis).
const TEXTOVA_POLE = [
  'Nazev', 'Druh', 'Firma', 'ICO', 'DIC', 'Spisova_znacka', 'Sidlo',
  'Zastoupena', 'Datum_narozeni', 'Bankovni_ucet', 'Email', 'Telefon',
  'Zastupce_jmeno', 'Zastupce_adresa', 'Zastupce_narozeni', 'Zastupce_email',
  'Zastupce_telefon', 'Poznamka',
];

function jeChybejiciList(e) {
  const zprava = String((e && e.message) || '');
  return zprava.includes('Unable to parse range') || zprava.includes('not found');
}

/**
 * Výchozí strana je nanejvýš jedna.
 *
 * Kdyby jich appka nechala označit víc, roletka by musela vybrat jednu
 * z nich a tvářit se, že to byla Janova volba. Odznačení ostatních je tedy
 * součást uložení, ne úklid někdy potom.
 */
async function odznacOstatniVychozi(sheets, spreadsheetId, list, rows, ponechatRow) {
  const kOdznaceni = rows.filter((p) => p._row !== ponechatRow
    && String(p.Vychozi || '').trim().toUpperCase() === 'ANO');
  for (const p of kOdznaceni) {
    await updateRow(sheets, spreadsheetId, list, PRONAJIMATELE_HEADERS, p._row,
      Object.assign({}, p, { Vychozi: '' }));
  }
}

/**
 * Obsluha jednoho číselníku smluvních stran.
 *
 * `konfig.list`   - název listu v tabulce ('Pronajimatele' / 'Najemci')
 * `konfig.klic`   - pod jakým klíčem chodí seznam v odpovědi
 * `konfig.popis`  - jak se strana jmenuje v chybových hláškách (1. pád)
 */
async function obsluhaStran(event, uzivatel, konfig) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const LIST = konfig.list;

  try {
    if (event.httpMethod === 'GET') {
      let rows = [];
      let listChybi = false;
      try {
        ({ rows } = await readSheetObjects(sheets, spreadsheetId, LIST));
      } catch (e) {
        if (!jeChybejiciList(e)) throw e;
        listChybi = true;
      }
      const { rows: firmy } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const odpoved = { listChybi, firmyDostupne: firmy.map((f) => f.Nazev).filter(Boolean) };
      odpoved[konfig.klic] = rows;
      return json(200, odpoved);
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const nazev = String(telo.Nazev || '').trim();
      if (!nazev) return json(400, { error: 'Název (jméno nebo firma) je povinný.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, LIST);
      if (existujici.some((p) => String(p.Nazev || '').trim() === nazev)) {
        return json(409, { error: konfig.popis + ' s tímhle názvem už v seznamu je.' });
      }

      const radek = { ID: crypto.randomUUID() };
      TEXTOVA_POLE.forEach((k) => { radek[k] = String(telo[k] || '').trim(); });
      radek.Nazev = nazev;
      radek.Vychozi = String(telo.Vychozi || '').trim().toUpperCase() === 'ANO' ? 'ANO' : '';

      await appendRow(sheets, spreadsheetId, LIST, PRONAJIMATELE_HEADERS, radek);
      if (radek.Vychozi === 'ANO') {
        await odznacOstatniVychozi(sheets, spreadsheetId, LIST, existujici, null);
      }

      return json(200, { ok: true, strana: radek });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      TEXTOVA_POLE.forEach((k) => {
        if (zmeny[k] !== undefined) zmeny[k] = String(zmeny[k]).trim();
      });
      if (zmeny.Vychozi !== undefined) {
        zmeny.Vychozi = String(zmeny.Vychozi).trim().toUpperCase() === 'ANO' ? 'ANO' : '';
      }

      const { rows } = await readSheetObjects(sheets, spreadsheetId, LIST);
      const soucasny = rows.find((p) => p._row === row);
      if (!soucasny) return json(404, { error: konfig.popis + ' nenalezen.' });

      if (zmeny.Nazev !== undefined) {
        if (!zmeny.Nazev) return json(400, { error: 'Název (jméno nebo firma) je povinný.' });
        if (rows.some((p) => p._row !== row && String(p.Nazev || '').trim() === zmeny.Nazev)) {
          return json(409, { error: konfig.popis + ' s tímhle názvem už v seznamu je.' });
        }
      }

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, LIST, PRONAJIMATELE_HEADERS, row, aktualizovany);
      if (String(aktualizovany.Vychozi || '').trim().toUpperCase() === 'ANO') {
        await odznacOstatniVychozi(sheets, spreadsheetId, LIST, rows, row);
      }

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, LIST, row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    if (jeChybejiciList(e)) {
      return json(409, {
        error: 'List „' + LIST + '" v tabulce zatím není. Spusťte v Nastavení „Vytvořit/doplnit listy".',
      });
    }
    return json(500, { error: e.message });
  }
}

module.exports = { obsluhaStran, TEXTOVA_POLE };
