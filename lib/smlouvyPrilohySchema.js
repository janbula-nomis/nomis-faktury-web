/**
 * lib/smlouvyPrilohySchema.js
 * Sloupce listu "Smlouvy_Prilohy" (od v3.21) - registr souborů (scan/PDF
 * smlouvy, roční vyúčtování apod.) napojených na jednu Smlouvu. Appka u
 * jedné smlouvy umí evidovat VÍC souborů (např. původní smlouva + každoroční
 * vyúčtování zvlášť) - proto samostatný list ve vztahu 1:N k listu Smlouvy,
 * ne jen jedno pole URL na řádku Smlouvy (to zůstává jako legacy pole pro
 * ručně vloženou URL, viz lib/smlouvySchema.js).
 */
const SMLOUVY_PRILOHY_HEADERS = [
  'ID',
  'Smlouva_ID',
  'Nazev_souboru',
  'Zdrojovy_soubor_URL',
  'Zdrojovy_soubor_ID',
  'Datum_nahrani',
  'Nahral_uzivatel',
];

module.exports = { SMLOUVY_PRILOHY_HEADERS };
