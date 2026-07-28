/**
 * lib/nemovitostiJednotkySchema.js
 * Sloupce listu "Nemovitosti_Jednotky" (od v4.36) - appka na ně odkazuje z
 * netlify/functions/nemovitosti-jednotky.js i setup.js, stejný vzor jako
 * lib/uctySchema.js/lib/strediskaSchema.js.
 *
 * Kontext (backlog položka 19, brainstorm 2026-07-27 v claude/nomis-faktury-
 * backlog.md): appka dřív (v4.19-v4.22) zavedla Nemovitosti jako úplně
 * samostatnou entitu, Jan to v4.23 vrátil zpět na "nemovitost je zase jen
 * středisko" - viz historie v hlavičce lib/smlouvySchema.js. Pro tenhle,
 * mnohem širší modul (klíče, revize, měřidla, kauce, vyúčtování) zůstává
 * STŘEDISKO dál JEDINÝM klíčem pro účetní logiku (Doklady/Smlouvy/Bankovní
 * pohyby/Dashboard appka nechává beze změny) - "Jednotka" tady NENÍ nová
 * konkurenční entita nahrazující středisko, je to jen DOPLŇKOVÝ, bohatší
 * záznam navázaný na existující středisko podle jeho názvu (pole Stredisko
 * níž). Jedno středisko typu "Nemovitost" = maximálně jedna Jednotka.
 *
 * ID - appka generuje při vytvoření (crypto.randomUUID()), stejná
 *   konvence jako Ucty/Smlouvy.
 * Firma - appka podle tohohle pole scopuje přístup (maPristupKFirme, stejná
 *   konvence jako Smlouvy.Firma) - Strediska sama o sobě pole Firma nemá
 *   (viz lib/strediskaSchema.js), proto ho appka nese tady a všechny další
 *   nové listy (Klice/Meridla/Revize, viz lib/nemovitostiDetailySchema.js)
 *   svoji Firmu odvozují přes vyhledání Jednotky podle Stredisko.
 * Stredisko - text střediska přesně tak, jak je uložený v listu Strediska
 *   (a v Doklady.Stredisko/Smlouvy.Stredisko/Bankovni_pohyby.Stredisko) -
 *   "klíč", který appka propojuje na účetní data. Needituje se po založení
 *   (stejná konvence jako Firmy.Nazev/Strediska.Nazev - viz komentáře v
 *   netlify/functions/firmy.js a strediska.js).
 * Adresa, Katastralni_uzemi, Cislo_LV - základní identifikace nemovitosti/
 *   jednotky v katastru (návrh, bod 1 - viz claude/evidence_nemovitosti_
 *   navrh.md z 2026-07-27).
 * Plocha_m2, Dispozice, Podlazi - vlastnosti jednotky.
 * Poznamka - volný text.
 */
const NEMOVITOSTI_JEDNOTKY_HEADERS = [
  'ID', 'Firma', 'Stredisko', 'Adresa', 'Katastralni_uzemi', 'Cislo_LV',
  'Plocha_m2', 'Dispozice', 'Podlazi', 'Poznamka',
];

module.exports = { NEMOVITOSTI_JEDNOTKY_HEADERS };
