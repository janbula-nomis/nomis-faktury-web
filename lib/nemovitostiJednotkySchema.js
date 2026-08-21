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
 * Nazev - (v4.57) LIDSKÝ název jednotky, volný text, kdykoli přepsatelný.
 *   Jan 2026-08-07: *"nejde upravit název nemovitosti"* - a nešlo to
 *   schválně: jednotka se do teď jmenovala podle svého Střediska a to je
 *   klíč do účetnictví (viz výš). Nazev je proti tomu jen popiska pro lidi
 *   („Byt 3, Vinohrady", „Garáž Hagibor"), nic na něm nevisí, takže se smí
 *   měnit, jak Jan potřebuje. Když je prázdný, appka kartu popíše
 *   Střediskem jako dřív - starým jednotkám se tím nic nerozbije.
 *   **Nepoužívat Nazev jako klíč** k ničemu, k tomu je tu Stredisko.
 * Adresa, Katastralni_uzemi, Cislo_LV - základní identifikace nemovitosti/
 *   jednotky v katastru (návrh, bod 1 - viz claude/evidence_nemovitosti_
 *   navrh.md z 2026-07-27).
 * Plocha_m2, Dispozice, Podlazi - vlastnosti jednotky.
 * Wifi_sit, Wifi_heslo - (v4.57, Jan: *"možnost uložit wifi a heslo"*,
 *   volba „Pole na kartě bytu"). Jeden byt = jedna WiFi, bez historie -
 *   kdyby Jan chtěl historii hesel, patřilo by to do listu Pristupove_kody
 *   (tam je platnost od-do i „komu předáno").
 *
 *   **Heslo se ukládá ČITELNĚ, nešifrovaně** - kdokoli s přístupem do
 *   tabulky ho uvidí. U WiFi do bytu je to v pořádku, protože celý smysl
 *   toho údaje je, aby se dal komukoli nadiktovat (stejná úvaha jako u
 *   přístupových kódů k závoře, viz lib/nemovitostiDetailySchema.js).
 *   **Neplatí to pro nic citlivějšího**: hesla do banky, do e-mailu ani do
 *   Georgu sem nepatří a appka na ně žádné pole mít nebude. Kdyby někdo
 *   chtěl tenhle vzor rozšířit na „hesla obecně", tohle je místo, kde se
 *   to má zastavit.
 * Poznamka - volný text.
 */
/*
 * (v4.57) Vlastnosti bytu jako věci - Jan si je vybral ze snímku appky
 * MojeNájmy, kterou poslal jako vzor:
 *
 * Druh - (v4.78) BYT / DŮM / POZEMEK / OSTATNÍ. Jan 2026-08-21 poslal
 *   snímek z appky Nemovitorium („Váš majetek v kostce: Byty 12, Domy 0,
 *   Pozemky 0, Ostatní 1") a zeptal se, jestli to appka umí taky.
 *
 *   Umí skoro všechno - hodnotu i plochu už vede - jen nevěděla, CO ta
 *   nemovitost je. `Typ_vlastnictvi` (osobní/družstevní) ani
 *   `Typ_konstrukce` (cihla/panel) tuhle otázku nezodpovídají: družstevní
 *   panelák může být byt i nebytový prostor.
 *
 *   **Prázdná hodnota znamená „nevyplněno", ne „ostatní".** Souhrn takové
 *   nemovitosti vypíše na vlastní řádek „Neuvedeno" a řekne, kolik jich je -
 *   sesypat je do „Ostatní" by znamenalo tvrdit něco, co appka neví, a
 *   součet za Byty by tiše chyběl.
 * Typ_vlastnictvi ('Osobní vlastnictví' / 'Družstevní' / …),
 * Spoluvlastnicky_podil - podíl na společných částech domu, text ve tvaru
 *   ze smlouvy (např. „702/24196"). Appka s ním zatím nepočítá, jen ho
 *   vede - rozúčtování nákladů mezi nájemní jednotky jede podle plochy
 *   (viz lib/vyuctovaniPodily.js), ne podle tohohle podílu. Ten by se
 *   hodil až na rozpočítání nákladů CELÉHO DOMU mezi byty, což appka
 *   zatím nedělá.
 * Typ_konstrukce ('Cihlová' / 'Panelová' / …), Vytapeni ('Ústřední' / …),
 * Porizovaci_cena, Aktualni_hodnota, Datum_porizeni - evidence majetku.
 *   Částky jsou text jako všude v téhle appce, převod dělá až
 *   parsujCastkuZListu(). **Nepřepínat na čísla** - Sheets by z „7 000 000"
 *   udělal něco jiného, než co tam Jan napsal.
 */
const NEMOVITOSTI_JEDNOTKY_HEADERS = [
  'ID', 'Firma', 'Stredisko', 'Nazev', 'Druh', 'Adresa', 'Katastralni_uzemi', 'Cislo_LV',
  'Plocha_m2', 'Dispozice', 'Podlazi', 'Wifi_sit', 'Wifi_heslo',
  'Typ_vlastnictvi', 'Spoluvlastnicky_podil', 'Typ_konstrukce', 'Vytapeni',
  'Porizovaci_cena', 'Aktualni_hodnota', 'Datum_porizeni', 'Poznamka',
];

// Pořadí je stejné jako v souhrnu portfolia (viz vykresliMajetekVKostce
// v public/app.js) - Byt první, protože jich Jan má dvanáct ze třinácti.
const MOZNOSTI_DRUH_NEMOVITOSTI = ['Byt', 'Dům', 'Pozemek', 'Ostatní'];

const MOZNOSTI_TYP_VLASTNICTVI = ['Osobní vlastnictví', 'Družstevní', 'Spoluvlastnický podíl', 'Jiné'];
const MOZNOSTI_TYP_KONSTRUKCE = ['Cihlová', 'Panelová', 'Smíšená', 'Dřevostavba', 'Jiná'];
const MOZNOSTI_VYTAPENI = ['Ústřední', 'Dálkové', 'Vlastní kotel', 'Elektrické', 'Tepelné čerpadlo', 'Jiné'];

module.exports = {
  NEMOVITOSTI_JEDNOTKY_HEADERS,
  MOZNOSTI_DRUH_NEMOVITOSTI,
  MOZNOSTI_TYP_VLASTNICTVI,
  MOZNOSTI_TYP_KONSTRUKCE,
  MOZNOSTI_VYTAPENI,
};
