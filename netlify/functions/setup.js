/**
 * netlify/functions/setup.js
 * Jednorázová administrátorská funkce: vytvoří (pokud chybí) listy Firmy,
 * Auta, Doklady, Log a Uzivatele s hlavičkami a ukázkovými daty. Bezpečně
 * chráněná SETUP_SECRET, aby ji nemohl spustit kdokoliv, kdo uhodne URL.
 *
 * Použití: POST na /.netlify/functions/setup s hlavičkou
 *   X-Setup-Secret: <hodnota SETUP_SECRET z Netlify env>
 *
 * Po prvním úspěšném nastavení doporučujeme SETUP_SECRET v Netlify env
 * smazat/změnit, aby funkce nešla znovu spustit omylem.
 */
const { getSheetsClient } = require('../../lib/google');
const { json } = require('../../lib/http');

const LISTY = [
  {
    nazev: 'Firmy',
    hlavicky: ['Nazev', 'ICO', 'DIC', 'Platce_DPH'],
    ukazka: [
      ['NOMIS Investment', '', '', 'ANO'],
      ['NOMIS & Homes', '', '', 'NE'],
      ['NOMIS CZ', '', '', 'NE'],
    ],
  },
  { nazev: 'Auta', hlavicky: ['SPZ', 'Model', 'Firma', 'Ridic'], ukazka: [] },
  {
    nazev: 'Doklady',
    hlavicky: [
      'ID', 'Datum_zpracovani', 'Typ', 'Zdrojovy_soubor_URL', 'Zdrojovy_soubor_ID',
      'Dodavatel', 'ICO_dodavatele', 'Odberatel_text', 'Datum_dokladu', 'Cislo_dokladu',
      'Castka', 'Mena', 'DPH', 'Variabilni_symbol', 'Firma_AI_odhad', 'Firma_potvrzena',
      'Kategorie', 'SPZ_auta', 'Stav', 'Poznamka', 'Nahral_uzivatel',
    ],
    ukazka: [],
  },
  { nazev: 'Log', hlavicky: ['Cas', 'Uzivatel', 'Akce', 'Doklad_ID', 'Detail'], ukazka: [] },
  {
    nazev: 'Uzivatele',
    hlavicky: ['Jmeno', 'PIN', 'Firmy', 'Role'],
    ukazka: [['Jan', '1234', 'NOMIS Investment, NOMIS & Homes, NOMIS CZ', 'admin']],
  },
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const hlavicky = event.headers || {};
  const secret = hlavicky['x-setup-secret'] || hlavicky['X-Setup-Secret'];
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return json(403, { error: 'Neplatný nebo chybějící X-Setup-Secret.' });
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existujiciNazvy = meta.data.sheets.map((s) => s.properties.title);

    const vysledky = [];
    for (const list of LISTY) {
      if (!existujiciNazvy.includes(list.nazev)) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: list.nazev } } }] },
        });
        vysledky.push(list.nazev + ': vytvořen list');
      } else {
        vysledky.push(list.nazev + ': list už existoval');
      }

      const stavajiciData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: list.nazev + '!A1:A1',
      });
      const jePrazdny = !stavajiciData.data.values || stavajiciData.data.values.length === 0;

      if (jePrazdny) {
        const hodnoty = [list.hlavicky].concat(list.ukazka);
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: list.nazev + '!A1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: hodnoty },
        });
        vysledky.push(list.nazev + ': doplněny hlavičky' + (list.ukazka.length ? ' a ukázková data' : ''));
      }
    }

    return json(200, { ok: true, vysledky });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
