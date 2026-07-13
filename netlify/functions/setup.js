/**
 * netlify/functions/setup.js
 * Administrátorská funkce: vytvoří (pokud chybí) listy Firmy, Auta,
 * Doklady, Bankovni_pohyby, Log a Uzivatele s hlavičkami a ukázkovými daty.
 * Bezpečně chráněná SETUP_SECRET, aby ji nemohl spustit kdokoliv, kdo
 * uhodne URL. Je bezpečné funkci spustit opakovaně i po aktualizaci appky -
 * u listů, které už existují a mají data, jen doplní případné chybějící
 * sloupce na konec (nikdy nic nemaže/nepřepisuje).
 *
 * Zároveň ověří/zajistí Inbox složku na Disku (viz lib/driveHelpers.js) -
 * appka používá scope drive.file, takže potřebuje složku, kterou vytvořila
 * sama appka, ne ručně založenou uživatelem (jinak by k ní neměla přístup).
 * Pokud INBOX_FOLDER_ID buď chybí, nebo appka k té složce nemá přístup,
 * tahle funkce novou Inbox složku sama založí a vrátí její ID v odpovědi -
 * tu hodnotu je pak potřeba nastavit jako INBOX_FOLDER_ID v Netlify env a
 * appku znovu nasadit.
 *
 * Použití: POST na /.netlify/functions/setup s hlavičkou
 *   X-Setup-Secret: <hodnota SETUP_SECRET z Netlify env>
 *
 * Po prvním úspěšném nastavení doporučujeme SETUP_SECRET v Netlify env
 * smazat/změnit, aby funkce nešla znovu spustit omylem.
 */
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { zajistiInboxSlozku } = require('../../lib/driveHelpers');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { json } = require('../../lib/http');

const LISTY = [
  {
    nazev: 'Firmy',
    hlavicky: ['Nazev', 'ICO', 'DIC', 'Platce_DPH', 'Bankovni_ucet'],
    ukazka: [
      ['NOMIS Investment', '', '', 'ANO', ''],
      ['NOMIS & Homes', '', '', 'NE', ''],
      ['NOMIS CZ', '', '', 'NE', ''],
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
  { nazev: 'Bankovni_pohyby', hlavicky: BANKOVNI_HEADERS, ukazka: [] },
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
      } else {
        // List už existuje a má data - appka jen doplní případné NOVÉ sloupce
        // na konec hlavičkového řádku (např. po aktualizaci appky přibude
        // sloupec), nikdy nic nemaže ani nepřejmenovává, ať se nerozbijí
        // existující data ani vazby na ně.
        const hlavickyRadek = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: list.nazev + '!1:1',
        });
        const stavajiciHlavicky = (hlavickyRadek.data.values && hlavickyRadek.data.values[0]) || [];
        const chybejiciHlavicky = list.hlavicky.filter((h) => !stavajiciHlavicky.includes(h));

        if (chybejiciHlavicky.length > 0) {
          const noveHlavicky = stavajiciHlavicky.concat(chybejiciHlavicky);
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: list.nazev + '!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [noveHlavicky] },
          });
          vysledky.push(list.nazev + ': doplněny chybějící sloupce (' + chybejiciHlavicky.join(', ') + ')');
        }
      }
    }

    const drive = await getDriveClient();
    const inbox = await zajistiInboxSlozku(drive, process.env.INBOX_FOLDER_ID);
    if (inbox.vytvorenaNove) {
      vysledky.push(
        'Inbox složka: appka založila novou složku "Nomis Group - Doklady/00_Inbox" ' +
        '(původní INBOX_FOLDER_ID appka buď nemá nastavené, nebo k němu s aktuálním ' +
        'OAuth přístupem (drive.file) nemá přístup - to je u ručně založených složek ' +
        'očekávané, viz poznámka v lib/driveHelpers.js). ' +
        'DŮLEŽITÉ: nastavte v Netlify proměnnou INBOX_FOLDER_ID na hodnotu "' + inbox.id + '" ' +
        'a appku znovu nasaďte (redeploy), jinak appka bude i nadál zapisovat do složky, ' +
        'ke které nemá přístup.'
      );
    } else {
      vysledky.push('Inbox složka: appka má přístup k existující složce "' + inbox.nazev + '" (ID ' + inbox.id + ').');
    }

    return json(200, { ok: true, vysledky, inboxFolderId: inbox.id, inboxVytvorenaNove: inbox.vytvorenaNove });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
