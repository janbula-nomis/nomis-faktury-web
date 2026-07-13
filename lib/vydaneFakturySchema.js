/**
 * lib/vydaneFakturySchema.js
 * Sloupce listu "Vydane_faktury" na jednom místě, aby na ně odkazovaly
 * netlify/functions/vydaneFaktury.js i setup.js konzistentně.
 *
 * Jde o evidenci faktur, které firmy skupiny Nomis Group VYSTAVUJÍ svým
 * odběratelům - opak Dokladů (to jsou přijaté faktury/účtenky, tedy výdaje).
 */
const VYDANE_FAKTURY_HEADERS = [
  'ID',
  'Firma',
  'Cislo_faktury',
  'Zakaznik',
  'ICO_zakaznika',
  'Datum_vystaveni',
  'Datum_splatnosti',
  'Castka',
  'Mena',
  'Stav',
  'Datum_uhrady',
  'Poznamka',
  'Vytvoril',
  'Datum_vytvoreni',
];

module.exports = { VYDANE_FAKTURY_HEADERS };
