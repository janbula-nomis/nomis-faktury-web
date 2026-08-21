/**
 * netlify/functions/servis.js
 * Servisní nástroje pro Nastavení (od v4.75).
 *
 * GET  ?akce=kontrola-tabulky   -> co v Google tabulce chybí (JEN ČTE)
 * GET  ?akce=osirele-soubory    -> soubory v Inboxu bez záznamu v appce
 * POST { akce: 'doplnit-sloupce' } -> doplní chybějící listy a sloupce
 *
 * Jan 2026-08-21: *„tlačítko Srovnat číslování a další servisní tlačítka,
 * která jsme potřebovali jen pro změnu, přesun do Nastavení, aby je
 * uživatel neviděl… co tam ještě může být?"*
 *
 * PROČ TO VZNIKLO
 *
 * Dva problémy se během jednoho dne ukázaly jako neviditelné:
 *
 *   - Chybějící sloupec v tabulce. Zápis do listu pole, pro které sloupec
 *     není, přeskočí (viz lib/sheetsHelpers.js). Do v4.72 to bylo tiché a
 *     poznalo se to jen tím, že zaškrtnutí „Zaúčtováno" po načtení stránky
 *     zmizelo. `kontrola-tabulky` to řekne rovnou a bez zápisu.
 *   - Osiřelé soubory na Disku. Když se soubor nahraje na Drive, ale zápis
 *     řádku spadne (limit Googlu), zůstane v Inboxu soubor, o kterém appka
 *     neví. Jan jich takhle má deset.
 *
 * TŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) SERVIS JE JEN PRO ADMINA. Ne pro účetní - tyhle nástroje sahají na
 *    strukturu tabulky a na Disk, ne na data jedné firmy.
 * 2) KONTROLA NIC NEMĚNÍ. `kontrola-tabulky` i `osirele-soubory` pouze
 *    čtou. Diagnostika, která něco „při té příležitosti spraví", je
 *    diagnostika, které se nedá věřit.
 * 3) NIC SE NEMAŽE. Osiřelé soubory se jen VYPÍŠOU. Smazat je může Jan na
 *    Disku sám; appka soubory nemaže nikde a nezačne s tím tady.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { opakujPriLimitu } = require('../../lib/opakuj');
const { LISTY } = require('../../lib/listySchema');
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { navrhDoplneniFirem } = require('../../lib/rejstrikFirem');
const { json } = require('../../lib/http');

const FIRMY_HEADERS = ['Nazev', 'ICO', 'DIC', 'Platce_DPH', 'Bankovni_ucet'];

// Kolik souborů z Inboxu se prochází nejvýš. Drive vrací po stránkách;
// strop je tu proto, aby funkce nespadla na časový limit u velkého Inboxu.
// Kolik se jich nestihlo, funkce NAPÍŠE - viz `zbyvaProjit`.
const MAX_SOUBORU = 400;

/*
 * Projde všechny listy a vrátí, co chybí. Nic nezapisuje (pravidlo 2).
 *
 * Rozlišuje se „list vůbec není" a „list je, ale chybí v něm sloupce" -
 * je to jiná situace i jiný dopad: bez listu appka spadne s jasnou hláškou,
 * kdežto chybějící sloupec tiše polkne hodnotu.
 */
async function kontrolaTabulky(sheets, spreadsheetId) {
  const nalezy = [];
  for (let i = 0; i < LISTY.length; i += 1) {
    const list = LISTY[i];
    let hlavicky = null;
    try {
      const res = await opakujPriLimitu(() => sheets.spreadsheets.values.get({
        spreadsheetId, range: list.nazev + '!1:1',
      }));
      hlavicky = (res.data.values && res.data.values[0]) || [];
    } catch (e) {
      nalezy.push({ list: list.nazev, druh: 'chybi-list', chybi: [], zprava: 'List v tabulce vůbec není.' });
      continue;
    }
    if (!hlavicky.length) {
      nalezy.push({ list: list.nazev, druh: 'prazdny-list', chybi: list.hlavicky, zprava: 'List existuje, ale nemá hlavičku.' });
      continue;
    }
    const chybi = list.hlavicky.filter((h) => hlavicky.indexOf(h) === -1);
    if (chybi.length) {
      nalezy.push({
        list: list.nazev, druh: 'chybi-sloupce', chybi,
        zprava: 'Chybí ' + chybi.length + ' sloupec/sloupců – hodnoty do nich se neuloží.',
      });
    }
  }
  return nalezy;
}

/*
 * Doplní chybějící listy a sloupce. Stejné pravidlo jako `setup.js`:
 * sloupce se PŘIDÁVAJÍ na konec hlavičkového řádku, nikdy se nic nemaže
 * ani nepřejmenovává, ať se nerozbijí existující data ani vazby na ně.
 *
 * Ukázková data se sem schválně NEKOPÍRUJÍ - `setup.js` je sype jen do
 * úplně prázdného listu při prvním nastavení. Servisní tlačítko má
 * opravovat strukturu, ne přisypávat řádky do ostrých dat.
 */
async function doplnSloupce(sheets, spreadsheetId) {
  const vysledky = [];
  for (let i = 0; i < LISTY.length; i += 1) {
    const list = LISTY[i];
    let hlavicky = null;
    try {
      const res = await opakujPriLimitu(() => sheets.spreadsheets.values.get({
        spreadsheetId, range: list.nazev + '!1:1',
      }));
      hlavicky = (res.data.values && res.data.values[0]) || [];
    } catch (e) {
      // List neexistuje - tady ho appka nezakládá. Založení listu umí
      // /api/setup, které k tomu má i práva na strukturu sešitu; tohle
      // tlačítko řeší běžnější případ „list je, chybí v něm sloupec".
      vysledky.push({ list: list.nazev, akce: 'preskoceno', zprava: 'List v tabulce není – založí ho /api/setup.' });
      continue;
    }
    const chybi = hlavicky.length
      ? list.hlavicky.filter((h) => hlavicky.indexOf(h) === -1)
      : list.hlavicky;
    if (!chybi.length) {
      vysledky.push({ list: list.nazev, akce: 'beze-zmeny', zprava: '' });
      continue;
    }
    const nove = hlavicky.length ? hlavicky.concat(chybi) : list.hlavicky;
    await opakujPriLimitu(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: list.nazev + '!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [nove] },
    }));
    vysledky.push({ list: list.nazev, akce: 'doplneno', chybi, zprava: 'Doplněno: ' + chybi.join(', ') });
  }
  return vysledky;
}

/*
 * Doplnění IČ, DIČ a čísla účtu do listu Firmy z rejstříkových údajů
 * (od v4.80). Tabulka údajů i jejich původ jsou v lib/rejstrikFirem.js.
 *
 * Drží se stejného pravidla jako zbytek servisu: `nahled = true` jen
 * SPOČÍTÁ, co by se stalo, a nic nezapíše. Zápis se dělá až druhým
 * voláním, po tom, co si to Jan přečetl.
 *
 * Přepis existující hodnoty se NEDĚJE nikdy - ani na požádání. Rozdíly se
 * vypíšou a opraví se ručně v Nastavení → Firmy. Servisní tlačítko, které
 * umí přepsat IČO, je tlačítko, kterým se dá jedním omylem rozhodit
 * fakturace.
 */
async function doplnUdajeFirem(sheets, spreadsheetId, nahled) {
  const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
  const { zmeny, nezname } = navrhDoplneniFirem(rows);

  if (!nahled) {
    for (let i = 0; i < zmeny.length; i += 1) {
      const zmena = zmeny[i];
      if (!Object.keys(zmena.doplni).length) continue;
      const soucasny = rows.find((f) => f._row === zmena.row);
      await updateRow(sheets, spreadsheetId, 'Firmy', FIRMY_HEADERS, zmena.row,
        Object.assign({}, soucasny, zmena.doplni));
    }
  }

  return {
    zmeny,
    nezname,
    pocetDoplnenych: zmeny.filter((z) => Object.keys(z.doplni).length).length,
    pocetRozdilu: zmeny.filter((z) => Object.keys(z.rozdily).length).length,
    zapsano: !nahled,
  };
}

/*
 * Soubory v Inboxu, na které v appce nic neodkazuje.
 *
 * Odkazy se sbírají ze VŠECH listů, které soubor na Disku drží - doklady,
 * vydané faktury, přílohy smluv. Kdyby se koukalo jen na Doklady, appka by
 * jako osiřelé označila každou nahranou smlouvu a Jan by je smazal.
 */
async function osireleSoubory(sheets, spreadsheetId, drive) {
  const pouzita = new Set();
  const zdroje = [
    { list: 'Doklady', sloupce: ['Zdrojovy_soubor_ID'] },
    { list: 'Vydane_faktury', sloupce: ['Zdrojovy_soubor_ID'] },
    { list: 'Smlouvy', sloupce: ['Zdrojovy_soubor_ID'] },
    { list: 'Smlouvy_Prilohy', sloupce: ['Soubor_ID', 'Zdrojovy_soubor_ID'] },
  ];
  for (let i = 0; i < zdroje.length; i += 1) {
    try {
      const res = await opakujPriLimitu(() => sheets.spreadsheets.values.get({
        spreadsheetId, range: zdroje[i].list,
      }));
      const radky = res.data.values || [];
      if (!radky.length) continue;
      const hlavicky = radky[0];
      zdroje[i].sloupce.forEach((nazevSloupce) => {
        const idx = hlavicky.indexOf(nazevSloupce);
        if (idx === -1) return;
        radky.slice(1).forEach((r) => {
          const hodnota = String(r[idx] || '').trim();
          if (hodnota) pouzita.add(hodnota);
        });
      });
    } catch (e) {
      // List nemusí existovat - to samo o sobě není důvod celou kontrolu
      // shodit. Chybějící listy hlásí `kontrola-tabulky`.
    }
  }

  const inbox = process.env.INBOX_FOLDER_ID;
  if (!inbox) return { osirele: [], projito: 0, zbyvaProjit: 0, chyba: 'Není nastavené INBOX_FOLDER_ID.' };

  const osirele = [];
  let projito = 0;
  let stranka = null;
  let zbyva = 0;
  for (;;) {
    const res = await drive.files.list({
      q: "'" + inbox + "' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'",
      fields: 'nextPageToken, files(id, name, size, createdTime)',
      pageSize: 100,
      pageToken: stranka || undefined,
    });
    const soubory = (res.data && res.data.files) || [];
    soubory.forEach((f) => {
      projito += 1;
      if (projito > MAX_SOUBORU) { zbyva += 1; return; }
      if (pouzita.has(f.id)) return;
      osirele.push({ id: f.id, nazev: f.name, velikost: f.size || '', vytvoreno: f.createdTime || '' });
    });
    stranka = res.data && res.data.nextPageToken;
    if (!stranka || projito > MAX_SOUBORU) break;
  }

  return { osirele, projito: Math.min(projito, MAX_SOUBORU), zbyvaProjit: zbyva };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  // Pravidlo 1: servis je jen pro admina.
  if (uzivatel.role !== 'admin') {
    return json(403, { error: 'Servisní nástroje smí spustit jen administrátor.' });
  }

  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    const sheets = await getSheetsClient();

    if (event.httpMethod === 'GET') {
      const akce = String((event.queryStringParameters || {}).akce || '').trim();

      if (akce === 'kontrola-tabulky') {
        const nalezy = await kontrolaTabulky(sheets, spreadsheetId);
        return json(200, { ok: true, nalezy, listuCelkem: LISTY.length });
      }

      if (akce === 'osirele-soubory') {
        const drive = await getDriveClient();
        const vysledek = await osireleSoubory(sheets, spreadsheetId, drive);
        return json(200, Object.assign({ ok: true }, vysledek));
      }

      if (akce === 'nahled-udaju-firem') {
        const vysledek = await doplnUdajeFirem(sheets, spreadsheetId, true);
        return json(200, Object.assign({ ok: true }, vysledek));
      }

      return json(400, { error: 'Neznámá akce. Očekává se kontrola-tabulky, osirele-soubory nebo nahled-udaju-firem.' });
    }

    if (event.httpMethod === 'POST') {
      const { akce } = JSON.parse(event.body || '{}');

      if (String(akce || '') === 'doplnit-udaje-firem') {
        const vysledek = await doplnUdajeFirem(sheets, spreadsheetId, false);
        return json(200, Object.assign({ ok: true }, vysledek));
      }

      if (String(akce || '') !== 'doplnit-sloupce') {
        return json(400, { error: 'Neznámá akce. Očekává se doplnit-sloupce nebo doplnit-udaje-firem.' });
      }
      const vysledky = await doplnSloupce(sheets, spreadsheetId);
      const doplneno = vysledky.filter((v) => v.akce === 'doplneno');
      return json(200, {
        ok: true,
        vysledky,
        pocetDoplnenych: doplneno.length,
        celkemSloupcu: doplneno.reduce((s, v) => s + (v.chybi || []).length, 0),
      });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
