/**
 * lib/listySchema.js
 * Které listy a sloupce má Janova Google tabulka mít (od v4.75).
 *
 * Seznam byl do v4.73 uvnitř `netlify/functions/setup.js`. Vytáhl se sem,
 * protože ho potřebují DVĚ různé věci a mít ho dvakrát je jistá cesta
 * k tomu, že se rozejdou:
 *
 *   - `setup.js` podle něj listy a chybějící sloupce ZALOŽÍ,
 *   - `servis.js` podle něj jen ZKONTROLUJE, co v tabulce chybí, a vypíše
 *     to v Nastavení (Jan 2026-08-21 - po tom, co se ukázalo, že chybějící
 *     sloupec `Zauctovano` se dal poznat jen tím, že se zaškrtnutí tiše
 *     ztratilo).
 *
 * Samotné soubory se schématy (lib/*Schema.js) zůstávají jediným zdrojem
 * pravdy pro sloupce - tenhle soubor jen říká, který list které schéma má
 * a jaká ukázková data se do prázdného listu nasypou.
 */
const { BANKOVNI_HEADERS } = require('./bankSchema');
const { VYDANE_FAKTURY_HEADERS } = require('./vydaneFakturySchema');
const { DOKLADY_HEADERS } = require('./dokladySchema');
const { UCTY_HEADERS } = require('./uctySchema');
const { SMLOUVY_HEADERS, dalsiPoradiSmlouvy } = require('./smlouvySchema');
const { SMLOUVY_PRILOHY_HEADERS } = require('./smlouvyPrilohySchema');
const { KNIHA_JIZD_HEADERS } = require('./knihaJizdSchema');
const { STREDISKA_HEADERS } = require('./strediskaSchema');
const { PREDKONTACE_HEADERS } = require('./predkontaceSchema');
const { UCTOVA_OSNOVA_HEADERS } = require('./uctovaOsnovaSchema');
const { PLATEBNI_KARTY_HEADERS } = require('./platebniKartySchema');
const { DOKLADY_POLOZKY_HEADERS } = require('./dokladyPolozkySchema');
const { VYDANE_FAKTURY_POLOZKY_HEADERS } = require('./vydaneFakturyPolozkySchema');
const { NEMOVITOSTI_JEDNOTKY_HEADERS } = require('./nemovitostiJednotkySchema');
const {
  KLICE_HEADERS, MERIDLA_HEADERS, MERIDLA_ODECTY_HEADERS, REVIZE_HEADERS,
  PRISTUPOVE_KODY_HEADERS,
  NAJEMNI_JEDNOTKY_HEADERS,
} = require('./nemovitostiDetailySchema');
const { PREDPIS_HEADERS } = require('./predpisSchema');
const { NEMOVITOSTI_VYUCTOVANI_HEADERS } = require('./nemovitostiVyuctovaniSchema');

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
    // Střediska (od v4.25) - dřív natvrdo zadané pole MOZNOSTI_STREDISKA
    // v public/app.js, teď samostatný spravovatelný číselník, viz
    // lib/strediskaSchema.js a netlify/functions/strediska.js. Ukázková
    // data = přesný přepis dřívějšího natvrdo zadaného pole, aby appka po
    // přechodu nabízela úplně stejná střediska jako předtím.
    nazev: 'Strediska',
    hlavicky: STREDISKA_HEADERS,
    ukazka: [
      ['Auto - Defender', 'Auto', 'ANO'],
      ['Auto - Porsche 911', 'Auto', 'ANO'],
      ['Auto - Tesla', 'Auto', 'ANO'],
      ['Auto - VW Passat', 'Auto', 'ANO'],
      ['Auto - Audi A5', 'Auto', 'ANO'],
      ['Auto - Hyundai Kona', 'Auto', 'ANO'],
      ['V Parku 695 - byt 45', 'Nemovitost', 'ANO'],
      ['V Parku 695 - byt 47', 'Nemovitost', 'ANO'],
      ['V Parku 695 - byt 49', 'Nemovitost', 'ANO'],
      ['V Parku 695 - byt 51', 'Nemovitost', 'ANO'],
      ['V Parku 695 - byt 52', 'Nemovitost', 'ANO'],
      ['V Parku 695 - byt 53', 'Nemovitost', 'ANO'],
      ['V Parku 695 - byt 54', 'Nemovitost', 'ANO'],
      ['Ramonova 3466/4 (Hagibor)', 'Nemovitost', 'ANO'],
      ['Holečkova 1', 'Nemovitost', 'ANO'],
      ['Holečkova 7', 'Nemovitost', 'ANO'],
      ['Holečkova 9', 'Nemovitost', 'ANO'],
      ['Holečkova - garáž', 'Nemovitost', 'ANO'],
    ],
  },
  {
    // Předkontace (od v4.32) - kódy pro Money S3 export <PredKontac>, per
    // firma a kategorie dokladu, viz lib/predkontaceSchema.js a
    // netlify/functions/predkontace.js. Appka list zakládá s PRÁZDNÝMI
    // ukázkovými daty - žádné reálné kódy nemá, Jan/účetní je doplní ručně
    // v appce (Nastavení) až budou k dispozici.
    nazev: 'Predkontace',
    hlavicky: PREDKONTACE_HEADERS,
    ukazka: [],
  },
  {
    // Účtová osnova per firma (od v4.52) - účty MD z Janova Kontace.xlsx,
    // viz lib/uctovaOsnovaSchema.js. Appka list zakládá PRÁZDNÝ; výchozí
    // účty se nasypou až na klepnutí na "Načíst výchozí účty" v Nastavení
    // (netlify/functions/uctova-osnova.js). Kdyby se sypaly tady, každé
    // spuštění /api/setup by Janovi vracelo jeho úpravy zpátky.
    nazev: 'Uctova_osnova',
    hlavicky: UCTOVA_OSNOVA_HEADERS,
    ukazka: [],
  },
  {
    // Platební karty (od v4.52) - jen POSLEDNÍ 4 ČÍSLICE, nikdy celé číslo
    // karty, viz lib/platebniKartySchema.js. Appka je používá při návrhu
    // párování bankovního pohybu s dokladem.
    nazev: 'Platebni_karty',
    hlavicky: PLATEBNI_KARTY_HEADERS,
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
  // Položky faktury (od v4.27, viz lib/dokladyPolozkySchema.js) - appka
  // je eviduje odděleně od Doklady/Vydane_faktury (jeden doklad/faktura
  // může mít 0 až N položek), kvůli exportu do Money S3.
  { nazev: 'Doklady_Polozky', hlavicky: DOKLADY_POLOZKY_HEADERS, ukazka: [] },
  { nazev: 'Vydane_Faktury_Polozky', hlavicky: VYDANE_FAKTURY_POLOZKY_HEADERS, ukazka: [] },
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
  {
    // Modul Nemovitosti (od v4.36, backlog položka 19) - Jednotka je
    // DOPLŇKOVÝ záznam navázaný na existující středisko (viz komentář v
    // lib/nemovitostiJednotkySchema.js), účetní logika zůstává navázaná na
    // Stredisko beze změny.
    nazev: 'Nemovitosti_Jednotky',
    hlavicky: NEMOVITOSTI_JEDNOTKY_HEADERS,
    ukazka: [],
  },
  {
    // Předpis plateb (od v4.59) - co se má u nájemní smlouvy zaplatit a
    // kdy, včetně kauce jako vlastního řádku. Bankovní platba se páruje
    // na TENHLE řádek, ne na smlouvu jako celek. Viz lib/predpisPlateb.js.
    // Ukázková data žádná - řádky generuje appka ze smlouvy.
    nazev: 'Predpis_plateb',
    hlavicky: PREDPIS_HEADERS,
    ukazka: [],
  },
  {
    // Nájemní jednotky (od v4.57) - části bytu pronajímané zvlášť
    // (Holečkova 1a/1b). Byt nese náklady, nájemní jednotka výnos, viz
    // lib/nemovitostiDetailySchema.js. Ukázková data schválně žádná:
    // jednotky si Jan zakládá sám podle skutečného rozdělení bytů.
    nazev: 'Najemni_jednotky',
    hlavicky: NAJEMNI_JEDNOTKY_HEADERS,
    ukazka: [],
  },
  {
    // Klíče (key control) - viz lib/nemovitostiDetailySchema.js.
    nazev: 'Klice',
    hlavicky: KLICE_HEADERS,
    ukazka: [],
  },
  {
    // Přístupové kódy k závoře/vratům (od v4.53) - vlastní list vedle
    // Klíčů, ne další typ klíče: klíč je kus železa (počet kusů, jeden
    // držitel), kód je informace (zná ho víc lidí, platí od-do).
    // Viz lib/nemovitostiDetailySchema.js.
    nazev: 'Pristupove_kody',
    hlavicky: PRISTUPOVE_KODY_HEADERS,
    ukazka: [],
  },
  {
    // Měřidla (elektroměr/vodoměr/plynoměr) - odečty appka drží odděleně
    // (viz Meridla_Odecty níž), stejný princip jako Smlouvy/Smlouvy_Prilohy.
    nazev: 'Meridla',
    hlavicky: MERIDLA_HEADERS,
    ukazka: [],
  },
  {
    nazev: 'Meridla_Odecty',
    hlavicky: MERIDLA_ODECTY_HEADERS,
    ukazka: [],
  },
  {
    // Revize (elektro/plyn/komín/hasicí přístroje/výtah) s platností do.
    nazev: 'Revize',
    hlavicky: REVIZE_HEADERS,
    ukazka: [],
  },
  {
    // Uložená vyúčtování (od v4.37) - trvalý záznam výsledku, viz
    // lib/nemovitostiVyuctovaniSchema.js a
    // netlify/functions/nemovitosti-vyuctovani-ulozene.js.
    nazev: 'Nemovitosti_Vyuctovani',
    hlavicky: NEMOVITOSTI_VYUCTOVANI_HEADERS,
    ukazka: [],
  },
  { nazev: 'Log', hlavicky: ['Cas', 'Uzivatel', 'Akce', 'Doklad_ID', 'Detail'], ukazka: [] },
  {
    nazev: 'Uzivatele',
    hlavicky: ['Jmeno', 'PIN', 'Firmy', 'Role'],
    ukazka: [['Jan', '1234', 'NOMIS Investment, NOMIS & Homes, NOMIS CZ', 'admin']],
  },
];

module.exports = { LISTY };
