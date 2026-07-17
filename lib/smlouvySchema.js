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
 */
const SMLOUVY_HEADERS = [
  'ID',
  'Firma',
  'Nazev',
  'Stredisko',
  'Typ',
  'Perioda',
  'Ocekavana_castka',
  'Platnost_od',
  'Platnost_do',
  'Zdrojovy_soubor_URL',
  'Zdrojovy_soubor_ID',
  'Poznamka',
  'Aktivni',
];

const MOZNOSTI_TYP_SMLOUVY = ['Nájem', 'Energie', 'Leasing', 'Ostatní'];

const MOZNOSTI_PERIODA_SMLOUVY = ['Měsíčně', 'Čtvrtletně', 'Ročně', 'Jednorázově'];

module.exports = { SMLOUVY_HEADERS, MOZNOSTI_TYP_SMLOUVY, MOZNOSTI_PERIODA_SMLOUVY };
