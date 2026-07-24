/**
 * lib/strediskaSchema.js
 * Sloupce listu "Strediska" na jednom místě (od v4.25), aby na ně odkazovaly
 * netlify/functions/strediska.js i setup.js konzistentně (stejný vzor jako
 * lib/uctySchema.js pro Ucty).
 *
 * Středisko bývalo jen natvrdo zadané pole MOZNOSTI_STREDISKA v public/app.js -
 * přidání nového střediska (nová nemovitost, nové auto) vyžadovalo zásah do
 * kódu appky a nové nasazení. Od v4.25 je Středisko samostatný list v Sheets,
 * spravovatelný přímo v appce (záložka Nastavení), stejně jako Firmy/Auta/Ucty.
 *
 * Nazev - text střediska, přesně tak, jak se ukládá do Doklady.Stredisko,
 *   Smlouvy.Stredisko a Bankovni_pohyby.Stredisko. Je to "klíč" použitý na
 *   těchto místech jako obyčejný text - proto se (stejně jako Firmy.Nazev)
 *   po vytvoření přes appku dál needituje, viz komentář v strediska.js.
 * Typ - 'Auto' nebo 'Nemovitost'. Kniha jízd dřív filtrovala střediska podle
 *   toho, jestli název začíná na "Auto - " (viz moznostiAuta v app.js) - teď
 *   se dá filtrovat přímo podle tohohle pole.
 * Aktivni - 'ANO'/'NE' (stejný princip jako Smlouvy.Aktivni) - deaktivované
 *   středisko zmizí z nabídky pro NOVÉ doklady/smlouvy/pohyby, ale historická
 *   data s ním zůstávají beze změny a appka ho tam dál normálně zobrazuje.
 */
const STREDISKA_HEADERS = ['Nazev', 'Typ', 'Aktivni'];

module.exports = { STREDISKA_HEADERS };
