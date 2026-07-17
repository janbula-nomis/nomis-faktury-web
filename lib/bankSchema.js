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
 *   "Navrženo - trvalý příkaz" (od v3.19) - appka automaticky navrhla
 *                    přiřazení ke Smlouvě (Smlouva_ID vyplněné) podle
 *                    podobnosti s jiným pohybem, který už ke smlouvě
 *                    ručně přiřadila účetní - čeká na potvrzení/zamítnutí
 *   "Trvalý příkaz" (od v3.19) - pohyb ručně nebo z návrhu potvrzený jako
 *                    součást trvalého příkazu/opakované platby, přiřazený
 *                    k jedné souhrnné Smlouvě (viz lib/smlouvySchema.js)
 *                    místo vlastního Dokladu - appka ho NEPOVAŽUJE za
 *                    chybějící doklad
 *   "Příjem přiřazen" (od v3.19) - příchozí platba (kladná částka), které
 *                    appka/účetní přiřadila Středisko a/nebo firemní účet
 *                    (na rozdíl od "Bez dokladu", což u příjmů znamená, že
 *                    appka středisko/účet ani přiřazovat nebude - např. mzdy)
 *
 * Cislo_uctu_vlastni (od v3.6) - číslo VLASTNÍHO účtu firmy, ze kterého
 * pohyb je (na rozdíl od Cislo_uctu_protistrany, což je účet druhé strany
 * platby) - u firem s víc účty (viz lib/uctySchema.js) appka takhle umí
 * rozlišit, ze kterého konkrétního účtu platba přišla. U George JSON
 * exportu appka číslo zná (ownerAccountNumber), u CSV/XLS importu zatím
 * ne (žádný sloupec s vlastním číslem účtu appka zatím nehledá - viz
 * lib/bankImportTabular.js), takže tam zůstává prázdné - od v3.19 appka
 * navíc umožňuje tohle pole u příjmů doplnit/opravit ručně přímo v detailu
 * pohybu (dropdown z listu Ucty dané firmy), ne jen automaticky dopočítat.
 *
 * Smlouva_ID a Stredisko (od v3.19, viz claude/nomis-faktury-backlog.md) -
 * Smlouva_ID odkazuje na list "Smlouvy" (trvalé příkazy - nájem, elektřina,
 * leasing), Stredisko appka používá u PŘÍJMŮ (příchozí platby jako přijaté
 * nájemné) - stejný číselník středisek jako u Dokladů (MOZNOSTI_STREDISKA
 * v public/app.js), ale appka ho u pohybů drží jako samostatné pole, ne
 * převzaté od Smlouvy (příjem se smlouvou vůbec nesouvisí).
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
  'Smlouva_ID',
  'Stredisko',
];

module.exports = { BANKOVNI_HEADERS };
