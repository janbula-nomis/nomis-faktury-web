/**
 * lib/kontaceVychozi.js
 * Výchozí účtová osnova skupiny NOMIS - PŘESNÝ přepis souboru Kontace.xlsx,
 * který Jan poslal 2026-08-03 se slovy *"tohle jsou předkontace, je potřeba
 * je zapracovat do systému"*.
 *
 * Soubor měl tři listy, jeden na firmu, a v každém sloupce Účet/MD, Popis a
 * (jen u NInvestment) Poznámka. Názvy listů appka namapovala na skutečné
 * názvy firem v listu Firmy:
 *   NInvestment -> NOMIS Investment
 *   NCZ         -> NOMIS CZ
 *   NHomes      -> NOMIS & Homes
 *
 * Co appka SCHVÁLNĚ nechala jak bylo:
 * - Formulace popisů jsou Janovy, ne přeformulované. "Daňové služby" u 518
 *   znamená *daňově uznatelné* služby (u NInvestment je k tomu poznámka
 *   "Právní/bezpečnostní/mytí vozu atd."), ne služby daňového poradce -
 *   nepřepisovat to na něco, co vypadá učeněji.
 * - Dvojité mezery v "Spotřeba materiální  včetně PHM" a "Nedaňové  náklady"
 *   appka srovnala na jednu, to je jen překlep v psaní.
 * - "Bankovní poplaky" u NHomes je překlep v původním souboru, appka ho
 *   opravila na "Bankovní poplatky" - u zbylých dvou firem je stejný účet
 *   568000 napsaný správně, takže o překlep nemůže být pochyb.
 *
 * Co appka NEDĚLÁ: tenhle seznam se do Sheets nezapisuje sám. Nasype se
 * jen na výslovné klepnutí na tlačítko "Načíst výchozí účty" v Nastavení
 * (netlify/functions/uctova-osnova.js, akce "vychozi"), a to tak, že
 * přidá jen účty, které firma ještě nemá - nic nepřepisuje ani nemaže.
 * Jan si osnovu bude upravovat sám a tichý zápis při každém /api/setup by
 * mu úpravy vracel zpátky.
 */
const KONTACE_VYCHOZI = [
  // --- NOMIS Investment (list "NInvestment") ---
  { Firma: 'NOMIS Investment', Ucet: '501000', Popis: 'Spotřeba materiální včetně PHM', Poznamka: 'Veškeré materiální náklady' },
  { Firma: 'NOMIS Investment', Ucet: '502000', Popis: 'Energie', Poznamka: 'Tesla dobíjení' },
  { Firma: 'NOMIS Investment', Ucet: '511000', Popis: 'Servisní služby', Poznamka: '' },
  { Firma: 'NOMIS Investment', Ucet: '513000', Popis: 'Nedaňové náklady', Poznamka: '' },
  { Firma: 'NOMIS Investment', Ucet: '518000', Popis: 'Daňové služby', Poznamka: 'Právní/bezpečnostní/mytí vozu atd.' },
  { Firma: 'NOMIS Investment', Ucet: '548000', Popis: 'Pojištění', Poznamka: '' },
  { Firma: 'NOMIS Investment', Ucet: '568000', Popis: 'Bankovní poplatky', Poznamka: '' },

  // --- NOMIS CZ (list "NCZ") ---
  { Firma: 'NOMIS CZ', Ucet: '501000', Popis: 'Spotřeba materiální včetně PHM', Poznamka: '' },
  { Firma: 'NOMIS CZ', Ucet: '502000', Popis: 'Energie', Poznamka: '' },
  { Firma: 'NOMIS CZ', Ucet: '511000', Popis: 'Servisní služby', Poznamka: '' },
  { Firma: 'NOMIS CZ', Ucet: '518002', Popis: 'Daňové služby', Poznamka: '' },
  { Firma: 'NOMIS CZ', Ucet: '518003', Popis: 'Leasingy', Poznamka: '' },
  { Firma: 'NOMIS CZ', Ucet: '548000', Popis: 'Pojištění', Poznamka: '' },
  { Firma: 'NOMIS CZ', Ucet: '568000', Popis: 'Bankovní poplatky', Poznamka: '' },
  { Firma: 'NOMIS CZ', Ucet: '591000', Popis: 'DPPO', Poznamka: '' },

  // --- NOMIS & Homes (list "NHomes") ---
  { Firma: 'NOMIS & Homes', Ucet: '502000', Popis: 'Energie', Poznamka: '' },
  { Firma: 'NOMIS & Homes', Ucet: '511000', Popis: 'Servisní služby', Poznamka: '' },
  { Firma: 'NOMIS & Homes', Ucet: '518002', Popis: 'Daňové služby', Poznamka: '' },
  { Firma: 'NOMIS & Homes', Ucet: '538000', Popis: 'Daň z nemovitosti', Poznamka: '' },
  { Firma: 'NOMIS & Homes', Ucet: '568000', Popis: 'Bankovní poplatky', Poznamka: '' },
];

/**
 * Výchozí účty pro jednu firmu. Když firma v Kontace.xlsx nebyla (Jan si
 * později založí další), appka vrátí prázdné pole - žádné účty si nevymýšlí.
 */
function vychoziUctyProFirmu(firma) {
  const hledana = String(firma || '').trim();
  return KONTACE_VYCHOZI.filter((u) => u.Firma === hledana);
}

module.exports = { KONTACE_VYCHOZI, vychoziUctyProFirmu };
