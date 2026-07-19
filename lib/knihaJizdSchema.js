/**
 * lib/knihaJizdSchema.js
 * Sloupce listu "Kniha_jizd" (od backlogu, položka 16, zadáno 2026-07-19).
 *
 * Appka eviduje v tomhle listu JEDNOTLIVÉ JÍZDY (ne tankování - to zůstává
 * na Dokladech s Kategorie = "Palivo", rozšířené o Mnozstvi_litru/Druh_paliva,
 * viz lib/dokladySchema.js). Pole "Auto" schválně používá STEJNÝ řetězec
 * jako Doklady.Stredisko (např. "Auto - Tesla") - appka od v3.8 nemá u
 * Dokladů samostatné SPZ pole, takže párování tankování (Doklady) s jízdami
 * (Kniha_jizd) jde nejjednodušeji přes tenhle sdílený řetězec, bez potřeby
 * překladu mezi Auta.Model a Stredisko (viz netlify/functions/kniha-jizd-prehled.js).
 *
 * Zdroj: "Rucne" (appka - ruční zadání ve formuláři) nebo "Import CSV"
 * (appka - hromadný import z exportu uložených cest, od v4.8, viz
 * lib/knihaJizdImportCest.js a netlify/functions/kniha-jizd-import.js).
 *
 * Ujete_km appka buď přebírá přímo (ruční zadání/import), nebo si ho
 * dopočítá z rozdílu Konecny_tachometr - Pocatecni_tachometr, pokud appka
 * má oba stavy k dispozici a Ujete_km nebylo zadáno.
 *
 * Zdroj_hash (od v4.8) - appka ho vyplňuje JEN u řádků ze "Zdroj = Import
 * CSV" (u ručně zadaných jízd zůstává prázdné) - stejný dedup princip jako
 * Bankovni_pohyby.Zdroj_hash, aby opakovaný import téhož (nebo částečně
 * překrývajícího se) souboru uložených cest appka nezaložila jako
 * duplicitní jízdy.
 */
const KNIHA_JIZD_HEADERS = [
  'ID',
  'Firma',
  'Auto',
  'Ridic',
  'Datum',
  'Ucel_cesty',
  'Ujete_km',
  'Pocatecni_tachometr',
  'Konecny_tachometr',
  'Zdroj',
  'Poznamka',
  'Vytvoril',
  'Datum_vytvoreni',
  'Zdroj_hash',
];

const MOZNOSTI_ZDROJ_JIZDY = ['Rucne', 'Import CSV'];

module.exports = { KNIHA_JIZD_HEADERS, MOZNOSTI_ZDROJ_JIZDY };
