/**
 * lib/predkontaceSchema.js
 * Sloupce listu "Predkontace" na jednom místě (od v4.32), aby na ně
 * odkazovaly netlify/functions/predkontace.js i setup.js konzistentně -
 * stejný vzor jako lib/strediskaSchema.js.
 *
 * Účel (viz claude/nomis-faktury-backlog.md, položka 5 rozšíření Money S3
 * exportu): appka v Money S3 exportu posílala element <PredKontac> (kód
 * předkontace - jak se má náklad zaúčtovat) natvrdo prázdný, protože appka
 * žádné kódy neměla a nemohla si je vymyslet - jde o účetní klasifikaci,
 * kterou musí appce dodat Jan/účetní. Tenhle list appce dává MÍSTO, kam si
 * appka takové kódy uloží, per FIRMA (různé firmy skupiny mohou mít jiné
 * účetní osnovy/zvyklosti) a per KATEGORIE dokladu (Doklady.Kategorie,
 * stejný 16položkový výčet jako appka nabízí u dokladu, viz
 * MOZNOSTI_KATEGORIE v public/app.js).
 *
 * - Firma - přesně jeden z názvů ve Firmy.Nazev.
 * - Kategorie - přesně jedna z hodnot Doklady.Kategorie (číselník
 *   MOZNOSTI_KATEGORIE).
 * - Kod - kód předkontace (např. "PF006"), jak appka pošle do
 *   lib/moneyS3Export.js elementu <PredKontac> - appka list vytvoří s
 *   PRÁZDNÝMI kódy (appka je nemůže sama uhodnout), Jan/účetní je doplní
 *   ručně v appce (záložka Nastavení) až budou k dispozici - do té doby
 *   appka posílá PredKontac prázdný, přesně jako dřív.
 *
 * Na rozdíl od Strediska.Nazev appka tu dovoluje upravit i Firma/Kategorie
 * dodatečně (kombinace slouží jen appce samotné jako klíč pro vyhledání při
 * exportu, nikam jinam se text neukládá jako cizí klíč) - jde jen o to,
 * aby appka pro danou kombinaci Firma+Kategorie měla nejvýš jeden řádek
 * (viz kontrola duplicity v predkontace.js).
 */
const PREDKONTACE_HEADERS = ['Firma', 'Kategorie', 'Kod'];

module.exports = { PREDKONTACE_HEADERS };
