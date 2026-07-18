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
 *   "Navrženo - vydaná faktura" (od v3.22) - appka automaticky navrhla
 *                    spárování příchozí platby s konkrétní Vydanou fakturou
 *                    (Vydana_faktura_ID vyplněné) podle částky + jména
 *                    zákazníka, čeká na potvrzení/zamítnutí účetní - appka
 *                    NIKDY nespáruje automaticky, jen navrhne (stejná
 *                    filozofie jako u ostatních návrhů shody v appce)
 *   "Spárováno - vydaná faktura" (od v3.22) - platba ručně nebo z návrhu
 *                    potvrzená jako úhrada konkrétní Vydané faktury
 *                    (Vydana_faktura_ID vyplněné); podle poměru částky
 *                    appka fakturu označí Uhrazeno nebo Částečně uhrazeno
 *   "Daňová platba" (od v4.6) - platba ručně přiřazená k dani (Typ_dane
 *                    vyplněné, viz níž) přes akci "Přiřadit k dani" v
 *                    detailu pohybu - appka ji nabízí u ODCHOZÍCH i
 *                    PŘÍCHOZÍCH plateb (od v4.6.1 - vrácení přeplatku
 *                    daně/DPH od finančního úřadu přijde na účet jako
 *                    KLADNÁ platba, appka to tedy nesmí omezovat jen na
 *                    výdajovou stranu). Appka NEROZPOZNÁVÁ tohle
 *                    přiřazení automaticky podle protistrany/textu (na
 *                    rozdíl od ostatních návrhů shody výš) - jen sčítá už
 *                    ručně přiřazené platby do Daňového přehledu, appka
 *                    NIKDY daň nedopočítává, jen eviduje skutečně
 *                    zaplacené/vrácené částky
 *
 * Typ_dane (od v4.6, rozšířeno v4.6.1) - u pohybů se Stav_parovani =
 * "Daňová platba" appka rozlišuje **"DPH"**, "Dan_z_prijmu" (daň z
 * příjmu) a "Dan_z_nemovitosti" (daň z nemovitostí) - silniční daň appka
 * zatím nepodporuje (viz backlog, odloženo na později). Appka tyhle typy
 * SČÍTÁ SE ZNAMÉNKEM podle firmy/období do Daňového přehledu (záporná
 * částka = appka/firma zaplatila, kladná = appce/firmě bylo vráceno -
 * typicky přeplatek DPH/daně) - appka daň samotnou nedopočítává (na
 * rozdíl od DPH BILANCE, kterou appka počítá z Dokladů/Vydaných faktur
 * jako orientační podklad pro přiznání - viz netlify/functions/danovy-
 * prehled.js). Sloupec "DPH" u Typ_dane appka drží ZÁMĚRNĚ odděleně od
 * vypočtené DPH bilance - jde o dvě různá čísla vedle sebe v Daňovém
 * přehledu (kolik appka spočítala z dokladů/faktur vs. kolik reálně
 * prošlo bankou).
 *
 * Vydana_faktura_ID (od v3.22) - odkazuje na list "Vydane_faktury" (opačný
 * směr než Doklad_ID výše - tam appka páruje VÝDAJ s dokladem, tady PŘÍJEM
 * s vydanou fakturou). Appka drží obě vazby na stejném listu Bankovni_pohyby,
 * ať nemusí zavádět druhý list jen kvůli směru platby.
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
  'Vydana_faktura_ID',
  'Typ_dane',
];

module.exports = { BANKOVNI_HEADERS };
