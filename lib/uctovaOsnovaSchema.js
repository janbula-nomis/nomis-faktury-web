/**
 * lib/uctovaOsnovaSchema.js
 * Sloupce listu "Uctova_osnova" (od v4.52) - účty MD, které používá účetní
 * u jednotlivých firem skupiny.
 *
 * Odkud to je: Jan (2026-08-03) poslal soubor Kontace.xlsx se třemi listy,
 * jeden na firmu (NInvestment / NCZ / NHomes), a napsal *"tohle jsou
 * předkontace, je potřeba je zapracovat do systému"*. V každém listu je
 * krátký seznam účtů (501000, 502000, 511000, ...) s popisem a občas
 * poznámkou. Seznamy se mezi firmami LIŠÍ - NOMIS Investment má 513000
 * (nedaňové náklady) a 548000, NOMIS CZ má navíc 518003 (leasingy) a
 * 591000 (DPPO), NOMIS & Homes má 538000 (daň z nemovitosti) a naopak
 * nemá palivo. Proto je klíčem dvojice Firma + Ucet a NE jen účet.
 *
 * - Firma - přesně jeden z názvů ve Firmy.Nazev.
 * - Ucet - číslo účtu MD tak, jak ho účetní píše (např. "501000"). Appka
 *   ho bere jako text, ne jako číslo - vedoucí nuly a případné tvary typu
 *   "518002" se nesmí ztratit zaokrouhlením.
 * - Popis - co se na účet účtuje ("Spotřeba materiální včetně PHM").
 * - Poznamka - volitelné upřesnění od Jana ("Tesla dobíjení").
 *
 * Výchozí obsah (přesný přepis Kontace.xlsx) je v lib/kontaceVychozi.js a
 * appka ho do listu nasype JEN na výslovné klepnutí na tlačítko v
 * Nastavení - nikdy sama při setupu. Důvod: jde o účetní data, která si
 * Jan bude sám upravovat, a tichý zápis při každém /api/setup by mu je
 * mohl přepsat zpátky na výchozí stav.
 *
 * Vztah k listu Predkontace: Predkontace mapuje Firma+Kategorie -> Kod
 * (kód předkontace pro Money S3 <PredKontac>) a od v4.52 i -> Ucet_MD.
 * Tenhle list je ČÍSELNÍK, ze kterého se Ucet_MD vybírá. Appka si účet
 * nikdy nevymyslí - když pro kombinaci žádný není, nechá ho prázdný a
 * napíše to (viz komentář v lib/predkontaceSchema.js).
 */
const UCTOVA_OSNOVA_HEADERS = ['Firma', 'Ucet', 'Popis', 'Poznamka'];

module.exports = { UCTOVA_OSNOVA_HEADERS };
