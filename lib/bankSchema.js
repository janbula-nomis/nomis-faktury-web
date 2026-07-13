/**
 * lib/bankSchema.js
 * Sloupce listu "Bankovni_pohyby" na jednom místě, aby na ně odkazovaly
 * netlify/functions/banka.js i netlify/functions/setup.js konzistentně
 * (stejný vzor jako lib/dokladySchema.js pro Doklady).
 *
 * Stav_parovani nabývá hodnot:
 *   "Nespárováno" - appka nenašla ani nenavrhla žádný doklad
 *   "Navrženo"    - appka automaticky navrhla doklad (Doklad_ID vyplněné),
 *                    čeká na potvrzení/zamítnutí účetní
 *   "Potvrzeno"   - doklad ručně nebo z návrhu potvrzený
 *   "Bez dokladu" - účetní označila, že k pohybu doklad být nemá (mzdy,
 *                    nájem, přesuny mezi vlastními firmami apod.)
 */
const BANKOVNI_HEADERS = [
  'ID',
  'Firma',
  'Datum',
  'Castka',
  'Mena',
  'Typ_pohybu',
  'Protistrana',
  'Cislo_uctu_protistrany',
  'Variabilni_symbol',
  'Konstantni_symbol',
  'Specificky_symbol',
  'Popis',
  'Doklad_ID',
  'Stav_parovani',
  'Poznamka',
  'Zdroj_hash',
  'Datum_importu',
];

module.exports = { BANKOVNI_HEADERS };
