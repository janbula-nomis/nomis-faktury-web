/**
 * lib/vydaneFakturySchema.js
 * Sloupce listu "Vydane_faktury" na jednom místě, aby na ně odkazovaly
 * netlify/functions/vydaneFaktury.js i setup.js konzistentně.
 *
 * Jde o evidenci faktur, které firmy skupiny Nomis Group VYSTAVUJÍ svým
 * odběratelům - opak Dokladů (to jsou přijaté faktury/účtenky, tedy výdaje).
 *
 * Jednotka (od v3.6) - ke které nemovitosti/autu se faktura vztahuje, např.
 * "V Parku 695 - byt 47" nebo "Holečkova 1a". Nezávislé na Středisku u
 * Dokladů (viz public/app.js, MOZNOSTI_STREDISKA/MOZNOSTI_JEDNOTKA) - u
 * některých nemovitostí je Jednotka stejně granulární jako Středisko
 * (např. byty V Parku, kde je jeden nájemník na byt), jinde jemnější
 * (Holečkova - náklady appka eviduje na celou jednotku 1/7/9/garáž,
 * protože náklady se nedělí, ale nájem platí nájemníci zvlášť za 1a/1b atd.).
 *
 * Stav nabývá hodnot "Neuhrazeno" (výchozí), "Uhrazeno", od v3.22 navíc
 * "Částečně uhrazeno" (částečná platba od zákazníka, viz párování s bankou
 * níže) a "Zpracovává se" (placeholder hned po nahrání souboru s AI
 * vytěžením, než doběhne extrakce - stejný vzor jako Doklady.Stav u v3.9 a
 * Smlouvy.Stav u v3.21).
 *
 * Od v3.22 (AI vytěžení ze souboru, viz netlify/functions/vydane-faktury-
 * upload.js/-dokoncit.js): appka nabízí AI vytěžení jako DALŠÍ možnost
 * vedle ručního zadání (ne náhrada) - stejný dvoufázový vzor jako u
 * Dokladů/Smlouvy.
 * - `Zdrojovy_soubor_URL`/`Zdrojovy_soubor_ID` - nahraný soubor faktury na
 *   Drive (appka ho ukládá do STEJNÉ Inbox složky jako doklady/smlouvy).
 * - `Nahral_uzivatel` - appka to potřebuje pro přístup k placeholder
 *   faktuře, která ještě nemá potvrzenou Firmu (kdo ji nahrál, nebo admin/
 *   účetní, viz stejná logika u upload-dokoncit.js Dokladů/Smluv).
 *
 * Bankovni_pohyby.Vydana_faktura_ID (od v3.22, viz lib/bankSchema.js) -
 * appka NAVRHUJE spárování příchozí platby s konkrétní vydanou fakturou
 * podle částky + jména zákazníka (záměrně NE podle variabilního symbolu -
 * Jan zkušenost, že zákazníci VS často nevyplní správně).
 */
const VYDANE_FAKTURY_HEADERS = [
  'ID',
  'Firma',
  'Cislo_faktury',
  'Jednotka',
  'Zakaznik',
  'ICO_zakaznika',
  'Datum_vystaveni',
  'Datum_splatnosti',
  'Castka',
  'Mena',
  'Stav',
  'Datum_uhrady',
  'Poznamka',
  'Vytvoril',
  'Datum_vytvoreni',
  'Zdrojovy_soubor_URL',
  'Zdrojovy_soubor_ID',
  'Nahral_uzivatel',
];

module.exports = { VYDANE_FAKTURY_HEADERS };
