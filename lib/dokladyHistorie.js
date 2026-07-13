/**
 * lib/dokladyHistorie.js
 * "Učení ze zkušenosti" - appka si u opakujících se dodavatelů (např.
 * čerpací stanice, hobbymarket) pamatuje, jak uživatel doklady od stejného
 * dodavatele v minulosti RUČNĚ potvrdil (Firma_potvrzena, Kategorie,
 * Stredisko), a při dalším nahrání dokladu od téhož dodavatele appka rovnou
 * navrhne stejnou kombinaci - místo aby pokaždé jen hádala nanovo přes AI.
 *
 * Záměrně jednoduché a vysvětlitelné (žádný trénovaný model) - appka bere
 * v potaz jen doklady, které uživatel skutečně potvrdil (Firma_potvrzena
 * není prázdné), ne holé nepotvrzené AI odhady - jinak by se appka jen učila
 * z vlastních chyb AI, ne ze skutečných rozhodnutí uživatele.
 */
const { normalizujNazev } = require('./bankHelpers');

// Najde doklady od "stejného" dodavatele - přednostně podle IČO (spolehlivý
// stálý identifikátor), jinak podle normalizovaného názvu dodavatele
// (tolerantní k velikosti písmen, s.r.o./a.s. příponám, dvojitým mezerám).
function jeStejnyDodavatel(doklad, dodavatel, icoDodavatele) {
  if (icoDodavatele && doklad.ICO_dodavatele) {
    return String(doklad.ICO_dodavatele).trim() === String(icoDodavatele).trim();
  }
  if (!dodavatel) return false;
  return normalizujNazev(doklad.Dodavatel) === normalizujNazev(dodavatel);
}

// Vrátí nejčastější neprázdnou hodnotu daného pole mezi doklady (mode) -
// při shodě počtu vyhrává hodnota z časově novějšího dokladu.
function nejcastejsiHodnota(doklady, pole) {
  const cetnost = new Map();
  doklady.forEach((d) => {
    const hodnota = String(d[pole] || '').trim();
    if (!hodnota) return;
    const zaznam = cetnost.get(hodnota) || { pocet: 0, posledniDatum: '' };
    zaznam.pocet += 1;
    if ((d.Datum_zpracovani || '') > zaznam.posledniDatum) zaznam.posledniDatum = d.Datum_zpracovani || '';
    cetnost.set(hodnota, zaznam);
  });

  let nejlepsi = null;
  cetnost.forEach((zaznam, hodnota) => {
    if (
      !nejlepsi ||
      zaznam.pocet > nejlepsi.zaznam.pocet ||
      (zaznam.pocet === nejlepsi.zaznam.pocet && zaznam.posledniDatum > nejlepsi.zaznam.posledniDatum)
    ) {
      nejlepsi = { hodnota, zaznam };
    }
  });
  return nejlepsi ? nejlepsi.hodnota : '';
}

/**
 * @param {Array} existujiciDoklady - všechny doklady (řádky z listu Doklady)
 * @param {string} dodavatel - dodavatel z aktuální AI extrakce
 * @param {string} icoDodavatele - IČO dodavatele z aktuální AI extrakce (může být "")
 * @returns {{firma: string, kategorie: string, stredisko: string, pocetShod: number} | null}
 */
function najdiHistorickouShodu(existujiciDoklady, dodavatel, icoDodavatele) {
  if (!dodavatel && !icoDodavatele) return null;

  const potvrzene = (existujiciDoklady || []).filter(
    (d) => String(d.Firma_potvrzena || '').trim() && jeStejnyDodavatel(d, dodavatel, icoDodavatele)
  );
  if (potvrzene.length === 0) return null;

  return {
    firma: nejcastejsiHodnota(potvrzene, 'Firma_potvrzena'),
    kategorie: nejcastejsiHodnota(potvrzene, 'Kategorie'),
    stredisko: nejcastejsiHodnota(potvrzene, 'Stredisko'),
    pocetShod: potvrzene.length,
  };
}

module.exports = { najdiHistorickouShodu };
