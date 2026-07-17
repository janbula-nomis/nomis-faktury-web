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
 */
const SMLOUVY_HEADERS = [
  'ID',
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
];

const MOZNOSTI_TYP_SMLOUVY = ['Nájem', 'Energie', 'Leasing', 'Ostatní'];

const MOZNOSTI_PERIODA_SMLOUVY = ['Měsíčně', 'Čtvrtletně', 'Ročně', 'Jednorázově'];

module.exports = { SMLOUVY_HEADERS, MOZNOSTI_TYP_SMLOUVY, MOZNOSTI_PERIODA_SMLOUVY };
