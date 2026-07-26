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
 *
 * Rozšíření pro Money S3 export a QR Platbu (v4.32, viz claude/nomis-
 * faktury-backlog.md pro plné zdůvodnění) - appka všechna pole nabízí jako
 * AI odhad ze zpracování dokladu (lib/gemini.js) + ruční kontrolu, stejná
 * konvence jako DPH/Sazba_DPH výš:
 * - Datum_splatnosti - appka do téhle verze v Money S3 exportu (`<Splatno>`)
 *   posílala natvrdo stejné datum jako Datum_dokladu (žádné jiné neměla) -
 *   od teď appka posílá skutečnou vytěženou/ručně opravenou hodnotu.
 * - Konstantni_symbol / Specificky_symbol - appka je do teď v Money S3
 *   exportu posílala natvrdo prázdné - stejný vzor jako Variabilni_symbol.
 * - DUZP (datum uskutečnění zdanitelného plnění) - appka ho do téhle verze
 *   vůbec nevytěžovala ani neposílala do Money S3 (`<DatUplDPH>` appka
 *   dřív vůbec neposílala). Může se lišit od Datum_dokladu (typicky u
 *   záloh/dlouhodobých plnění) - appka ho vytěží AI odhadem, s fallbackem
 *   na Datum_dokladu, když ho doklad neuvádí zvlášť. Od téhle verze appka
 *   PODLE DUZP (ne podle Datum_dokladu) počítá i DPH bilanci v Daňovém
 *   přehledu (viz netlify/functions/danovy-prehled.js) - na Jan výslovné
 *   přání ("Ano, přepnout na DUZP").
 * - Typ_dokladu ("Faktura"/"Dobropis"/"Zálohová faktura") - NEZAMĚŇOVAT s
 *   existujícím polem "Typ" výš (to rozlišuje Faktura/Ucetenka, tedy JAKÝ
 *   DRUH DOKUMENTU appka zpracovala, ne účetní povahu částky). Dobropis
 *   appka v Money S3 exportu posílá jako `<Dobropis>1</Dobropis>` (dřív
 *   appka posílala natvrdo 0 u všeho) a ZÁROVEŇ mění znaménko částky v DPH
 *   bilanci (Daňový přehled) a v Dashboardu (dashboard-firmy.js) - appka u
 *   dobropisu částku ODEČÍTÁ, ne přičítá, protože jde o opravný doklad
 *   snižující dřívější náklad, ne o nový náklad navíc.
 * - Cislo_uctu_dodavatele - bankovní účet dodavatele (číslo/kód banky nebo
 *   IBAN, přesně jak je uvedený na dokladu) - appka ho vytěžuje stejně
 *   jako Variabilni_symbol (dřív appka tohle pole vůbec neměla, viz Jan:
 *   "appka dnes u Přijatých faktur vůbec neukládá bankovní účet dodavatele").
 *   Slouží jako prerekvizita pro QR Platbu (lib/qrPlatba.js) - appka z něj
 *   sestaví SPAYD řetězec/QR kód pro rychlou úhradu schváleného dokladu.
 *
 * Evidencni_cislo (v4.34, viz lib/evidencniCislo.js pro plné zdůvodnění a
 * algoritmus) - appka ho PŘIŘAZUJE SAMA (kód "FP" + pořadové číslo podle
 * firmy a roku DUZP, např. "FP 001-2026"), teprve AŽ PŘI SCHVÁLENÍ dokladu
 * (netlify/functions/doklady.js) - appka ho appka NEVYTĚŽUJE ani nenabízí k
 * ruční editaci, jde o systémem přiřazené evidenční číslo.
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
  'Datum_splatnosti',
  'Konstantni_symbol',
  'Specificky_symbol',
  'DUZP',
  'Typ_dokladu',
  'Cislo_uctu_dodavatele',
  'Evidencni_cislo',
];

module.exports = { DOKLADY_HEADERS };
