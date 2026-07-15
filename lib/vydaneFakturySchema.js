/**
 * lib/vydaneFakturySchema.js
 * Sloupce listu "Vydane_faktury" na jednom místě, aby na ně odkazovaly
 * netlify/functions/vydaneFaktury.js i setup.js konzistentně.
 *
 * Jde o evidenci faktur, které firmy skupiny Nomis Group VYSTAVUJÍ svým
 * odběratelům - opak Dokladů (to jsou přijaté faktury/účtenky, tedy výdaje).
 *
 * Jednotka (od v3.6) - ke které nemovitosti/autu se faktura vztahuje, např.
 * "V Parku 695 - byt 47" nebo "Holečkova 1a". Nezávislé na Středisku u
 * Dokladů (viz public/app.js, MOZNOSTI_STREDISKA/MOZNOSTI_JEDNOTKA) - u
 * některých nemovitostí je Jednotka stejně granulární jako Středisko
 * (např. byty V Parku, kde je jeden nájemník na byt), jinde jemnější
 * (Holečkova - náklady appka eviduje na celou jednotku 1/7/9/garáž,
 * protože náklady se nedělí, ale nájem platí nájemníci zvlášť za 1a/1b atd.).
 */
const VYDANE_FAKTURY_HEADERS = [
  'ID',
  'Firma',
  'Cislo_faktury',
  'Jednotka',
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
