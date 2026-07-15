/**
 * lib/uctySchema.js
 * Sloupce listu "Ucty" na jednom místě (od v3.6), aby na ně odkazovaly
 * netlify/functions/ucty.js, netlify/functions/banka.js i setup.js
 * konzistentně (stejný vzor jako lib/dokladySchema.js pro Doklady).
 *
 * Firma může mít víc bankovních účtů (typicky CZK + EUR) - dřív appka
 * u každé firmy počítala jen s jedním číslem účtu (pole Bankovni_ucet
 * v listu Firmy), teď je zdrojem pravdy pro kontrolu shody účtu při
 * importu výpisu (viz banka.js) tenhle samostatný list, kde má firma
 * libovolný počet řádků. Pole Bankovni_ucet v listu Firmy appka dál čte
 * jako "starší"/legacy jeden známý účet (zpětná kompatibilita, nic
 * nemigruje) - efektivně je to jen další položka do stejné množiny.
 */
const UCTY_HEADERS = ['ID', 'Firma', 'Cislo_uctu', 'Mena', 'Popis'];

module.exports = { UCTY_HEADERS };
