/**
 * netlify/functions/setup.js
 * Administrátorská funkce: vytvoří (pokud chybí) listy Firmy, Auta, Ucty,
 * Doklady, Bankovni_pohyby, Vydane_faktury, Log a Uzivatele s hlavičkami
 * a ukázkovými daty.
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
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { VYDANE_FAKTURY_HEADERS } = require('../../lib/vydaneFakturySchema');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { UCTY_HEADERS } = require('../../lib/uctySchema');
const { SMLOUVY_HEADERS, dalsiPoradiSmlouvy } = require('../../lib/smlouvySchema');
const { SMLOUVY_PRILOHY_HEADERS } = require('../../lib/smlouvyPrilohySchema');
const { KNIHA_JIZD_HEADERS } = require('../../lib/knihaJizdSchema');
const { vygenerujCisloSmlouvy } = require('../../lib/cisloSmlouvy');
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
    // Bankovní účty firem (od v3.6) - firma může mít víc účtů (typicky
    // CZK + EUR), viz lib/uctySchema.js a netlify/functions/ucty.js.
    nazev: 'Ucty',
    hlavicky: UCTY_HEADERS,
    ukazka: [],
  },
  {
    nazev: 'Doklady',
    // Přímo import z lib/dokladySchema.js (dřív tu byl ručně duplikovaný
    // seznam, který se při přidání sloupce Stredisko/Hrazeno_mimo_ucet
    // musel pokaždé ručně dohledat a opravit na dvou místech zvlášť -
    // teď je jeden zdroj pravdy).
    hlavicky: DOKLADY_HEADERS,
    ukazka: [],
  },
  { nazev: 'Bankovni_pohyby', hlavicky: BANKOVNI_HEADERS, ukazka: [] },
  { nazev: 'Vydane_faktury', hlavicky: VYDANE_FAKTURY_HEADERS, ukazka: [] },
  {
    // Trvalé příkazy (nájem/elektřina/leasing) - viz lib/smlouvySchema.js
    // a claude/nomis-faktury-backlog.md (od v3.19).
    nazev: 'Smlouvy',
    hlavicky: SMLOUVY_HEADERS,
    ukazka: [],
  },
  {
    // Registr souborů (scan/PDF smlouvy, roční vyúčtování) napojených na
    // smlouvu - vztah 1:N, víc souborů na jednu smlouvu (od v3.21, viz
    // lib/smlouvyPrilohySchema.js).
    nazev: 'Smlouvy_Prilohy',
    hlavicky: SMLOUVY_PRILOHY_HEADERS,
    ukazka: [],
  },
  {
    // Kniha jízd (od backlogu, položka 16) - jednotlivé jízdy (ruční zadání
    // nebo budoucí import CSV), viz lib/knihaJizdSchema.js.
    nazev: 'Kniha_jizd',
    hlavicky: KNIHA_JIZD_HEADERS,
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

    // Zpětné dočíslování Cislo_smlouvy u existujících smluv (od v4.2,
    // backlog položka 12) - smlouvy založené appkou PŘED zavedením čísla
    // smlouvy ho ještě nemají. Appka nemá u starších smluv uložené datum
    // založení, takže jako náhradu za chronologické pořadí použije pořadí
    // řádků v listu (nižší číslo řádku = dřív založená smlouva) a přidělí
    // jim AKTUÁLNÍ rok (rok spuštění tohohle /api/setup), i když smlouva
    // mohla vzniknout dřív - appka nemá jak zjistit skutečný rok založení
    // zpětně. Placeholder smlouvy (Stav "Zpracovává se", ještě bez Firmy)
    // appka přeskočí - ty dostanou číslo až po dokončení AI zpracování.
    try {
      const { rows: vsechnySmlouvy } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
      const rokBackfillu = new Date().getFullYear();
      const kDoplneni = vsechnySmlouvy
        .filter((s) => s.Firma && s.Stav !== 'Zpracovává se' && !s.Cislo_smlouvy)
        .sort((a, b) => a._row - b._row);

      if (kDoplneni.length > 0) {
        const aktualniStav = vsechnySmlouvy.slice();
        for (const smlouva of kDoplneni) {
          const cislo = vygenerujCisloSmlouvy(aktualniStav, rokBackfillu);
          const aktualizovana = Object.assign({}, smlouva, { Cislo_smlouvy: cislo });
          await updateRow(sheets, spreadsheetId, 'Smlouvy', SMLOUVY_HEADERS, smlouva._row, aktualizovana);
          const idx = aktualniStav.findIndex((s) => s._row === smlouva._row);
          if (idx !== -1) aktualniStav[idx] = aktualizovana;
        }
        vysledky.push(
          'Smlouvy: doplněno číslo smlouvy u ' + kDoplneni.length + ' existujících smluv ' +
          '(pořadí podle řádků, rok ' + rokBackfillu + ').'
        );
      }
    } catch (e) {
      vysledky.push('Smlouvy: doplnění čísla smlouvy se nezdařilo (' + e.message + ') - appka pokračuje dál.');
    }

    // Zpětné dopočítání Poradi u existujících smluv (od v4.14, Jan: "u
    // smluv by šlo aby se daly posouvat jejich pořadí?") - smlouvy založené
    // appkou PŘED zavedením vlastního pořadí ho ještě nemají. Appka jim
    // přidělí pořadí PODLE STEJNÉHO řazení, jaké appka do teď používala
    // (abecedně podle Názvu, stejný komparátor jako `public/app.js`), ať se
    // seznam po nasazení téhle verze appce vizuálně nepřerovná - teprve
    // odsud appka řadí podle Poradi, uživatel ho pak mění přetažením.
    // Na rozdíl od Cislo_smlouvy appka NEVYNECHÁVÁ placeholder smlouvy bez
    // Firmy ("Zpracovává se") - appka je totiž ukazuje v seznamu (v sekci
    // Aktivní) hned, potřebují tedy vlastní pořadí stejně jako ostatní.
    try {
      const { rows: vsechnySmlouvyPoradi } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
      const kDoplneniPoradi = vsechnySmlouvyPoradi
        .filter((s) => String(s.Poradi || '').trim() === '')
        .slice()
        .sort((a, b) => (a.Nazev || '').localeCompare(b.Nazev || '', 'cs'));

      if (kDoplneniPoradi.length > 0) {
        let dalsiPoradi = dalsiPoradiSmlouvy(vsechnySmlouvyPoradi);
        for (const smlouva of kDoplneniPoradi) {
          const aktualizovana = Object.assign({}, smlouva, { Poradi: String(dalsiPoradi) });
          await updateRow(sheets, spreadsheetId, 'Smlouvy', SMLOUVY_HEADERS, smlouva._row, aktualizovana);
          dalsiPoradi += 1;
        }
        vysledky.push(
          'Smlouvy: doplněno vlastní pořadí u ' + kDoplneniPoradi.length + ' existujících smluv ' +
          '(zachovává dosavadní abecední pořadí podle Názvu).'
        );
      }
    } catch (e) {
      vysledky.push('Smlouvy: doplnění pořadí se nezdařilo (' + e.message + ') - appka pokračuje dál.');
    }

    // Jednorázové vyčištění po zrušení samostatné entity Nemovitosti (v4.23,
    // Jan: "nemovitost je zase jen středisko" - appka nájemní příjem od teď
    // řeší čistě přes Středisko, viz netlify/functions/banka.js). List
    // "Nemovitosti" appka NEMAŽE (odstranění celého listu by mohlo rozbít
    // případné ruční odkazy/filtry přímo v tabulce), jen mu jednorázově
    // vyčistí datové řádky (hlavička v A1:Z1 zůstává). Appka to zkouší
    // spustit i na appce, která list Nemovitosti nikdy neměla založený
    // (starší appka, nebo appka bez spuštěného předchozího /api/setup) -
    // v tom případě `values.clear` prostě selže na neexistujícím listu a
    // appka to jen zaloguje do vysledky, nezastaví kvůli tomu zbytek setupu.
    try {
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Nemovitosti!A2:Z' });
      vysledky.push(
        'Nemovitosti: vyčištěna stará data listu (appka od v4.23 zrušila samostatnou entitu ' +
        'Nemovitosti, nájemní příjem řeší přes Středisko, viz Smlouvy.Stredisko).'
      );
    } catch (e) {
      vysledky.push('Nemovitosti: vyčištění listu se nezdařilo (' + e.message + ') - appka pokračuje dál.');
    }

    // Zároveň appka vynuluje staré Smlouvy.Nemovitost_ID (appka ho v4.23
    // odstranila z SMLOUVY_HEADERS, ale samotný sloupec v listu appka sama
    // nemaže - readSheetObjects čte podle SKUTEČNÉ hlavičky v listu, takže by
    // stará hodnota jinak v listu dál viset bez užitku, viz lib/smlouvySchema.js).
    try {
      const { rows: smlouvyKVycisteni } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
      const sNemovitostId = smlouvyKVycisteni.filter((s) => String(s.Nemovitost_ID || '').trim() !== '');
      for (const smlouva of sNemovitostId) {
        const vycistena = Object.assign({}, smlouva, { Nemovitost_ID: '' });
        await updateRow(sheets, spreadsheetId, 'Smlouvy', SMLOUVY_HEADERS, smlouva._row, vycistena);
      }
      if (sNemovitostId.length > 0) {
        vysledky.push(
          'Smlouvy: vynulováno staré propojení Nemovitost_ID u ' + sNemovitostId.length + ' smluv ' +
          '(appka od v4.23 tohle pole už nepoužívá).'
        );
      }
    } catch (e) {
      vysledky.push('Smlouvy: vynulování Nemovitost_ID se nezdařilo (' + e.message + ') - appka pokračuje dál.');
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
