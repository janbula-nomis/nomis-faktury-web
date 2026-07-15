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
 *
 * Cislo_uctu_vlastni (od v3.6) - číslo VLASTNÍHO účtu firmy, ze kterého
 * pohyb je (na rozdíl od Cislo_uctu_protistrany, což je účet druhé strany
 * platby) - u firem s víc účty (viz lib/uctySchema.js) appka takhle umí
 * rozlišit, ze kterého konkrétního účtu platba přišla. U George JSON
 * exportu appka číslo zná (ownerAccountNumber), u CSV/XLS importu zatím
 * ne (žádný sloupec s vlastním číslem účtu appka zatím nehledá - viz
 * lib/bankImportTabular.js), takže tam zůstává prázdné.
 */
const BANKOVNI_HEADERS = [
  'ID',
  'Firma',
  'Cislo_uctu_vlastni',
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
