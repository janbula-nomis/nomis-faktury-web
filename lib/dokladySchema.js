/**
 * lib/dokladySchema.js
 * Sloupce listu "Doklady" na jednom místě, aby na ně odkazovaly upload.js
 * i doklady.js konzistentně.
 */
const DOKLADY_HEADERS = [
  'ID',
  'Datum_zpracovani',
  'Typ',
  'Zdrojovy_soubor_URL',
  'Zdrojovy_soubor_ID',
  'Dodavatel',
  'ICO_dodavatele',
  'Odberatel_text',
  'Datum_dokladu',
  'Cislo_dokladu',
  'Castka',
  'Mena',
  'DPH',
  'Variabilni_symbol',
  'Firma_AI_odhad',
  'Firma_potvrzena',
  'Kategorie',
  'Stredisko',
  'SPZ_auta',
  'Stav',
  'Poznamka',
  'Nahral_uzivatel',
];

module.exports = { DOKLADY_HEADERS };
