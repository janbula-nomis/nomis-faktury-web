/**
 * lib/duplicity.js
 * Stejná logika jako v Apps Script verzi (Fáze 1): možná duplicita, pokud
 * sedí dodavatel + částka, a navíc buď číslo dokladu, nebo datum dokladu.
 */
function isMoznaDuplicita(existujiciDoklady, extrakce) {
  return existujiciDoklady.some((r) => {
    const shodaDodavatele = extrakce.dodavatel && r.Dodavatel === extrakce.dodavatel;
    const shodaCastky = Math.abs((parseFloat(r.Castka) || 0) - (parseFloat(extrakce.castka) || 0)) < 0.01;
    const shodaCisla = extrakce.cislo_dokladu && r.Cislo_dokladu === extrakce.cislo_dokladu;
    const shodaData = extrakce.datum_dokladu && r.Datum_dokladu === extrakce.datum_dokladu;
    return shodaDodavatele && shodaCastky && (shodaCisla || shodaData);
  });
}

module.exports = { isMoznaDuplicita };
