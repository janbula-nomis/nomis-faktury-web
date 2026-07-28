/**
 * lib/nemovitostiVyuctovaniSchema.js
 * Sloupce listu "Nemovitosti_Vyuctovani" (od v4.37) - appka sem na
 * požádání (POST z netlify/functions/nemovitosti-vyuctovani-ulozene.js)
 * ULOŽÍ výsledek jednou spočítaného vyúčtování jako trvalý záznam - na
 * rozdíl od netlify/functions/nemovitosti-vyuctovani.js (živý přepočet na
 * vyžádání, appka si nic nepamatuje), tenhle list appce dá historii, která
 * se nezmění, i když později přibude další Doklad za stejné období.
 * Důležité pro reálné doručení vyúčtování nájemníkovi (appka posílá
 * konkrétní, zafixované číslo, ne "aktuálně počítané", které by se mohlo
 * příště lišit).
 *
 * `Naklady_Sluzby`/`Naklady_Vlastni` appka ukládá odděleně (viz
 * lib/vyuctovaniKategorie.js a netlify/functions/nemovitosti-
 * vyuctovani.js) - `Rozdil`/kauce appka počítá JEN z `Naklady_Sluzby`,
 * `Naklady_Vlastni` appka drží jen informativně (přehled vlastníka o
 * celkových nákladech nemovitosti, nesmí ovlivnit částku vyúčtovanou
 * nájemníkovi).
 *
 * `Stav` appka vede jako jednoduchý životní cyklus (viz
 * `MOZNOSTI_STAV_VYUCTOVANI` níž):
 *   "Spočítáno"            - appka záznam uložila, ještě nikomu neodeslán
 *   "Odesláno nájemníkovi" - účetní/Jan vyúčtování nájemníkovi poslali
 *   "Vypořádáno"           - přeplatek/nedoplatek byl vyrovnán
 *
 * `Firma` appka ukládá přímo na záznam (i když by šla dohledat přes
 * Smlouva_ID) - zjednodušuje to kontrolu přístupu (maPristupKFirme) bez
 * nutnosti při KAŽDÉM GET/PATCH dotazu znovu číst celý list Smlouvy.
 */
const NEMOVITOSTI_VYUCTOVANI_HEADERS = [
  'ID',
  'Smlouva_ID',
  'Firma',
  'Stredisko',
  'Obdobi_Od',
  'Obdobi_Do',
  'Naklady_Sluzby',
  'Naklady_Vlastni',
  'Zaloha_Na_Sluzby',
  'Pocet_Zaplacenych_Zaloh',
  'Zalohy_Prijate',
  'Rozdil',
  'Kauce_Castka',
  'Kauce_Skody',
  'Kauce_Nedoplatek',
  'Kauce_K_Vraceni',
  'Stav',
  'Vytvoreno_Datum',
  'Vytvoril_Uzivatel',
  'Poznamka',
];

const MOZNOSTI_STAV_VYUCTOVANI = ['Spočítáno', 'Odesláno nájemníkovi', 'Vypořádáno'];

module.exports = { NEMOVITOSTI_VYUCTOVANI_HEADERS, MOZNOSTI_STAV_VYUCTOVANI };
