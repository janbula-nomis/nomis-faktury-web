/**
 * lib/dokladySchema.js
 * Sloupce listu "Doklady" na jednom místě, aby na ně odkazovaly upload.js
 * i doklady.js konzistentně.
 *
 * Sazba_DPH (od v4.6, viz claude/nomis-faktury-backlog.md, položka 9) -
 * sazba DPH (např. "21", "12", "0"), kterou appka nabízí spolu s částkou
 * DPH (sloupec DPH výše, existoval už dřív, jen se do teď nikde
 * nezobrazoval) - appka z těchhle dvou polí u NOMIS Investment (jediná
 * firma skupiny s Firmy.Platce_DPH = "ANO") počítá měsíční DPH bilanci
 * v záložce Daňový přehled (netlify/functions/danovy-prehled.js). Obě pole
 * appka nabízí jako AI odhad + ruční kontrolu, stejná konvence jako
 * ostatní vytěžovaná pole (viz lib/gemini.js).
 *
 * Mnozstvi_litru / Druh_paliva (od backlogu, položka 16, zadáno 2026-07-19) -
 * appka je vytěžuje AI odhadem POUZE u dokladů s Kategorie = "Palivo"
 * (viz lib/gemini.js), jinak zůstávají prázdné. Slouží k evidenci Kniha
 * jízd (lib/knihaJizdSchema.js) - appka spočítá průměrnou spotřebu podle
 * auta a měsíce spárováním téhle sumy litrů (podle Stredisko) s ujetými
 * km z Kniha_jizd (netlify/functions/kniha-jizd-prehled.js).
 */
const DOKLADY_HEADERS = [
  'ID',
  'Datum_zpracovani',
  'Typ',
  'Zdrojovy_soubor_URL',
  'Zdrojovy_soubor_ID',
  'Dodavatel',
  'ICO_dodavatele',
  'Odberatel_text',
  'Datum_dokladu',
  'Cislo_dokladu',
  'Castka',
  'Mena',
  'DPH',
  'Sazba_DPH',
  'Variabilni_symbol',
  'Firma_AI_odhad',
  'Firma_potvrzena',
  'Kategorie',
  'Stredisko',
  'SPZ_auta',
  'Hrazeno_mimo_ucet',
  'Stav',
  'Poznamka',
  'Nahral_uzivatel',
  'Mnozstvi_litru',
  'Druh_paliva',
];

module.exports = { DOKLADY_HEADERS };
