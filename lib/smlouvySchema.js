/**
 * lib/smlouvySchema.js
 * Sloupce listu "Smlouvy" na jednom místě (od v3.19), aby na ně odkazovaly
 * netlify/functions/smlouvy.js, netlify/functions/banka.js i setup.js
 * konzistentně (stejný vzor jako lib/dokladySchema.js pro Doklady).
 *
 * Smlouvy appka zavedla pro trvalé příkazy (nájem, elektřina, leasing apod.),
 * kde Jan nemá měsíční doklad/účtenku za KAŽDOU platbu, jen smlouvu nebo
 * roční přehled od dodavatele - párovat každý jednotlivý bankovní pohyb
 * s vlastním dokladem by tak nedávalo smysl. Bankovní pohyb, který appka
 * přiřadí ke smlouvě (viz lib/bankSchema.js, pole Smlouva_ID), appka
 * NEPOVAŽUJE za chybějící doklad, i když nemá vlastní Doklad_ID.
 *
 * Typ smlouvy je záměrně VLASTNÍ menší číselník (ne stejný jako
 * MOZNOSTI_KATEGORIE u Dokladů, viz public/app.js) - smlouvy mají jiný
 * charakter (souhrnné/opakované platby), číselník je menší a přehlednější.
 *
 * Od v3.21 (registr smluv s AI vytěžením a přílohami, viz
 * netlify/functions/smlouvy-upload.js/-dokoncit.js a
 * lib/smlouvyPrilohySchema.js):
 * - `Stav` – prázdné (běžná, zpracovaná smlouva) nebo "Zpracovává se"
 *   (placeholder hned po nahrání souboru, než doběhne AI extrakce - stejný
 *   vzor jako `Doklady.Stav` u v3.9).
 * - `Nahral_uzivatel` – appka to potřebuje pro přístup k placeholder
 *   smlouvě, která ještě nemá potvrzenou Firmu (kdo ji nahrál, nebo admin,
 *   viz stejná logika u netlify/functions/upload-dokoncit.js).
 * - `Zdrojovy_soubor_URL`/`Zdrojovy_soubor_ID` zůstávají jen jako LEGACY pole
 *   pro ručně vloženou URL (appka je novým UI/uploadem už neplní) - od
 *   v3.21 appka soubory smlouvy eviduje v samostatném listu
 *   `Smlouvy_Prilohy` (víc souborů na smlouvu - např. smlouva + každoroční
 *   vyúčtování zvlášť).
 *
 * Od v3.22 (rozšíření registru smluv):
 * - `Druha_strana` – druhá smluvní strana (protistrana). `Firma` už
 *   sleduje NAŠI firmu, tohle je ten druhý účastník smlouvy (pronajímatel,
 *   dodavatel energie, leasingová společnost apod.).
 * - `Mena` – měna smlouvy, stejný číselník/vzor jako `Doklady.Mena` (v3.20).
 *   Smlouvy do v3.21 měnu vůbec nesledovaly (implicitně CZK).
 *
 * Od v4.2 (backlog položka 12 - Jan: "Registr smluv - číslo smlouvy
 * přidělit, v tabulce všechny důležité informace"):
 * - `Cislo_smlouvy` – appkou PŘIDĚLENÉ číslo ve formátu `SML-RRRR-pořadí`
 *   (např. "SML-2026-001", formát podle Janovy volby přes AskUserQuestion),
 *   pořadí sekvenční v rámci roku přidělení. Uživatel ho needituje - appka
 *   ho přiděluje sama (viz lib/cisloSmlouvy.js): hned při ručním založení
 *   (POST v netlify/functions/smlouvy.js), nebo až PO úspěšném dokončení AI
 *   vytěžení u nahraných smluv (netlify/functions/smlouvy-upload-dokoncit.js) -
 *   ne už při založení placeholderu, stejný princip jako `Firma`, která se
 *   u placeholderu taky doplní až po AI zpracování. Staré smlouvy založené
 *   appkou PŘED v4.2 appka jednorázově dočísluje při spuštění `/api/setup`
 *   (viz netlify/functions/setup.js) - protože appka u nich nemá uložené
 *   datum založení, dočíslování jde podle pořadí řádků v listu a appka jim
 *   přidělí AKTUÁLNÍ rok (rok spuštění setupu), i když vznikly dřív.
 *
 * Od v4.14 (Jan: "u smluv by šlo aby se daly posouvat jejich pořadí?"):
 * - `Poradi` – appkou vedené VLASTNÍ pořadí smlouvy (celé číslo, nižší =
 *   výš v seznamu), appka ho nasadila místo dřívějšího abecedního řazení
 *   podle Názvu. Uživatel (admin/účetní) ho mění přetažením řádku myší v
 *   Registru smluv (`public/app.js`, `vytvorRadekSmlouva`) - appka po
 *   puštění řádku přepočítá pořadí VŠECH smluv aktuálně zobrazené sekce
 *   (Aktivní/Neaktivní appka drží odděleně, přesun v jedné sekci se
 *   netýká pořadí ve druhé) a uloží nové hodnoty přes PATCH. Appka nové
 *   smlouvy (ruční založení i dokončení AI zpracování u nahrané smlouvy)
 *   přidává vždy AŽ ZA poslední existující - nikdy nezakládá řádek
 *   doprostřed existujícího pořadí. Appka existujícím smlouvám bez
 *   `Poradi` (založeným appkou před v4.14) jednorázově dopočítá pořadí
 *   při spuštění `/api/setup` (viz netlify/functions/setup.js) - v
 *   takovém pořadí, v jakém appka smlouvy do té doby zobrazovala
 *   (abecedně podle Názvu), ať se seznam appce po nasazení vizuálně
 *   nepřerovná.
 *
 * Od v4.19 appka krátce (do v4.22) měla i `Nemovitost_ID` - volitelné
 * propojení na samostatnou entitu Nemovitosti (vlastní list + CRUD +
 * měsíční přehled placeno/nezaplaceno). Jan (2026-07-23) tenhle přístup
 * zpětně vyhodnotil jako nesystémový ("nemovitost je zase jen středisko")
 * a appka se v4.23 vrátila k jednoduššímu modelu: nájemní příjem appka řeší
 * čistě přes spárování s nájemní Smlouvou (Bankovní výpisy) + automatické
 * převzetí Smlouvy.Stredisko na bankovní pohyb při potvrzení - `Stredisko`
 * výš (appka ho má odjakživa, od v3.19) je tak jediné pole pro kategorizaci,
 * `Nemovitost_ID` appka přestala v kódu i v `SMLOUVY_HEADERS` používat.
 * Appka při `/api/setup` sloupec `Nemovitost_ID` ve skutečném listu
 * jednorázově vynuluje (appka sloupce v Sheets sama nemaže, jen ho přestává
 * číst/zapisovat - viz jednorázová migrace v netlify/functions/setup.js).
 */
const SMLOUVY_HEADERS = [
  'ID',
  'Cislo_smlouvy',
  'Firma',
  'Nazev',
  'Druha_strana',
  'Stredisko',
  'Typ',
  'Perioda',
  'Ocekavana_castka',
  'Mena',
  'Platnost_od',
  'Platnost_do',
  'Zdrojovy_soubor_URL',
  'Zdrojovy_soubor_ID',
  'Poznamka',
  'Aktivni',
  'Stav',
  'Nahral_uzivatel',
  'Poradi',
];

const MOZNOSTI_TYP_SMLOUVY = ['Nájem', 'Energie', 'Leasing', 'Ostatní'];

const MOZNOSTI_PERIODA_SMLOUVY = ['Měsíčně', 'Čtvrtletně', 'Ročně', 'Jednorázově'];

// v4.14 - appka novou smlouvu (ruční založení i placeholder před AI
// zpracováním) vždy přidá AŽ ZA poslední existující - nikdy doprostřed
// vlastního pořadí uživatele. Appka bere nejvyšší dosavadní Poradi napříč
// VŠEMI smlouvami (bez ohledu na Aktivní/Neaktivní - viz poznámka výš),
// prázdné/nečíselné hodnoty appka ignoruje.
function dalsiPoradiSmlouvy(existujiciSmlouvy) {
  let max = -1;
  for (const s of existujiciSmlouvy || []) {
    const cislo = Number(s.Poradi);
    if (Number.isFinite(cislo) && cislo > max) max = cislo;
  }
  return max + 1;
}

module.exports = { SMLOUVY_HEADERS, MOZNOSTI_TYP_SMLOUVY, MOZNOSTI_PERIODA_SMLOUVY, dalsiPoradiSmlouvy };
