/**
 * lib/dokladyPolozkySchema.js
 * Sloupce listu "Doklady_Polozky" na jednom místě (od v4.27), aby na ně
 * odkazovaly netlify/functions/doklady-polozky.js, doklady-vytezit-
 * polozky.js, upload-dokoncit.js, export-money-s3.js i setup.js
 * konzistentně - stejná konvence jako lib/dokladySchema.js.
 *
 * Appka do téhle verze u Dokladu evidovala jen SOUHRNNÉ částky celé
 * faktury/účtenky (Castka/DPH/Sazba_DPH v listu Doklady) - žádné
 * jednotlivé řádky faktury. Export pro účetní program Money S3 (viz
 * netlify/functions/export-money-s3.js, Jan poslal vzorové XML) ale u
 * KAŽDÉ faktury čeká element SeznamPolozek s jednotlivými řádky (Popis/
 * Množství/Cena/SazbaDPH) - appka je proto teď eviduje zvlášť, v
 * samostatném listu (ne jako sloupec navíc v Doklady), ať se list Doklady
 * nemusí měnit pro doklady, které ještě žádné položky nemají.
 *
 * Doklad_ID - vazba na Doklady.ID (appka u jednoho dokladu může mít 0 až
 * N položek).
 * Nazev/Mnozstvi/Cena/SazbaDPH - odpovídají Money S3 Polozka/Popis,
 * PocetMJ, Cena (JEDNOTKOVÁ cena BEZ DPH) a SazbaDPH (appka drží jako
 * číslo v procentech, stejná konvence jako Doklady.Sazba_DPH).
 * Poradi - appka řádky zobrazuje/exportuje ve stejném pořadí, v jakém je
 * appka vytěžila/zadala (Money S3 XML má taky vlastní element Poradi u
 * Polozka).
 *
 * Appka položky získává dvěma způsoby: (a) automaticky při AI vytěžení
 * dokladu (lib/gemini.js, extrahujDataZDokladu, klíč "polozky") - appka
 * je uloží HNED při dokončení zpracování (upload-dokoncit.js), (b)
 * ZPĚTNĚ u už dřív zpracovaného dokladu appka umí znovu poslat jeho
 * zdrojový soubor (Doklady.Zdrojovy_soubor_ID, appka ho v Drive nikdy
 * nemaže) přes AI JEN kvůli doplnění položek (netlify/functions/doklady-
 * vytezit-polozky.js) - beze změny už schválených hlavičkových údajů
 * dokladu (Dodavatel/Castka/Kategorie/...). Appka umí položky u dokladu
 * i ručně přidat/upravit/smazat (netlify/functions/doklady-polozky.js).
 */
const DOKLADY_POLOZKY_HEADERS = ['ID', 'Doklad_ID', 'Nazev', 'Mnozstvi', 'Cena', 'SazbaDPH', 'Poradi'];

module.exports = { DOKLADY_POLOZKY_HEADERS };
