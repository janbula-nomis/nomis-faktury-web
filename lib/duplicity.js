/**
 * lib/duplicity.js
 * Stejná logika jako v Apps Script verzi (Fáze 1): možná duplicita, pokud
 * sedí dodavatel + částka, a navíc buď číslo dokladu, nebo datum dokladu.
 */
const { parsujCastkuZListu } = require('./bankHelpers');

function isMoznaDuplicita(existujiciDoklady, extrakce) {
  return existujiciDoklady.some((r) => {
    const shodaDodavatele = extrakce.dodavatel && r.Dodavatel === extrakce.dodavatel;
    // r.Castka přichází z readSheetObjects (FORMATTED_VALUE) - u částky s haléři
    // se může vrátit v českém formátu s čárkou (např. "2029,91"), na což by
    // obyčejné parseFloat() tiše uřízlo desetiny - proto parsujCastkuZListu.
    const shodaCastky =
      Math.abs(parsujCastkuZListu(r.Castka) - (parseFloat(extrakce.castka) || 0)) < 0.01;
    const shodaCisla = extrakce.cislo_dokladu && r.Cislo_dokladu === extrakce.cislo_dokladu;
    const shodaData = extrakce.datum_dokladu && r.Datum_dokladu === extrakce.datum_dokladu;
    return shodaDodavatele && shodaCastky && (shodaCisla || shodaData);
  });
}

module.exports = { isMoznaDuplicita };
