/**
 * lib/archivScanu.js
 * Kam na Disku patří archivovaný scan dokladu (od v4.69).
 *
 * Jan 2026-08-20: *„pro mě je důležité teď vzít co máme i z minulosti a
 * sladit to se současným stavem, aby ty soubory seděly a šlo je uložit do
 * archivu"*.
 *
 * PROČ TO VZNIKLO
 *
 * Do v4.68 uměla appka scany jen PŘEJMENOVAT, a to na místě - v jediné
 * složce `00_Inbox`, kam od začátku padá úplně všechno: přijaté faktury
 * všech firem, nájemní smlouvy i vydané faktury. Stáhnout „složku za rok
 * 2026 pro NOMIS Investment" tím pádem nešlo; muselo se ručně vybírat
 * z hromady. Předpony v názvu s tím pomáhaly, ale nevyřešily to.
 *
 * Archiv je proto skutečná struktura složek:
 *
 *   Archiv dokladů / NOMIS Investment s.r.o. / 2026 / ZU FP 001-2026 - ČEZ.pdf
 *   ^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^   ^^^^
 *   kořen archivu    firma (Janova volba)     rok
 *
 * Stažení jedné složky = jeden rok jedné firmy, přesně v té podobě, v jaké
 * se posílá účetní závěrka.
 *
 * ROK SE BERE Z DUZP, A KDYŽ CHYBÍ, Z DATA DOKLADU
 *
 * Stejné pravidlo jako v Daňovém přehledu, v Exportu i ve filtru pro
 * účetní. Kdyby archiv řadil podle jiného data než zbytek appky, seděly by
 * počty všude jinde než ve složce.
 *
 * DOKLAD BEZ DATA NEKONČÍ V NÁHODNÉM ROCE
 *
 * Dostane vlastní složku „Bez data". Zařadit ho podle roku nahrání nebo
 * podle letoška by znamenalo tiše tvrdit něco, co appka neví - a v archivu
 * je to tvrzení, které pak někdo bere jako fakt.
 *
 * Čistý výpočet - nic nezapisuje, nic nečte z Googlu.
 */

const { vycistiCast } = require('./nazvyScanu');

const NAZEV_ARCHIVU = 'Archiv dokladů';
const SLOZKA_BEZ_DATA = 'Bez data';
const SLOZKA_BEZ_FIRMY = 'Bez firmy';

/**
 * Rok, pod který doklad v archivu patří.
 * @returns {string} 'RRRR' nebo 'Bez data'
 */
function rokDokladu(doklad) {
  const obdobi = String((doklad || {}).DUZP || (doklad || {}).Datum_dokladu || '');
  const rok = obdobi.slice(0, 4);
  return /^\d{4}$/.test(rok) ? rok : SLOZKA_BEZ_DATA;
}

/**
 * Cesta ve složkách, odshora dolů.
 *
 * @param {Object} doklad - řádek z listu Doklady
 * @param {string} firma - název firmy (Firma_potvrzena || Firma_AI_odhad)
 * @returns {string[]} např. ['Archiv dokladů', 'NOMIS Investment s.r.o.', '2026']
 */
function cestaArchivu(doklad, firma) {
  // Název firmy prochází stejným čištěním jako název souboru - lomítko
  // v názvu firmy by na Disku založilo dvě zanořené složky místo jedné.
  const nazevFirmy = vycistiCast(firma) || SLOZKA_BEZ_FIRMY;
  return [NAZEV_ARCHIVU, nazevFirmy, rokDokladu(doklad)];
}

// Klíč do keše složek v rámci jednoho běhu, ať se stejná složka nehledá
// na Disku pro každý doklad znovu.
function klicCesty(cesta) {
  return (cesta || []).join(' / ');
}

module.exports = {
  NAZEV_ARCHIVU,
  SLOZKA_BEZ_DATA,
  SLOZKA_BEZ_FIRMY,
  rokDokladu,
  cestaArchivu,
  klicCesty,
};
