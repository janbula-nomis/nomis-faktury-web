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
/*
 * (v4.80) Čtyři pole, která si vyžádal PŘEDÁVACÍ PROTOKOL.
 *
 * Jan 2026-08-21 poslal podepsané vzory protokolů a nájemních smluv. Jejich
 * druhý oddíl („Specifikace nemovitosti") chce přesně tohle:
 *
 *   „číslo jednotky: 54/695, dispozice: 2+KK, podlaží: 3, v budově: č.p. 695,
 *    typ budovy: bytový dům, na pozemku: p. č. st. 771,
 *    Příslušenství nemovitosti: sklep č. 36, parkovací stání č. 23 v 1.PP"
 *
 * Dispozici, podlaží, adresu, katastrální území i LV appka vedla už od
 * v4.36. Zbytek ne - a bez něj by protokol nechal prázdné řádky u údajů,
 * které Jan v katastru dohledávat nemusí, protože je zná.
 *
 * Cislo_jednotky - číslo jednotky podle katastru („54/695", „2236/9").
 *   NENÍ to klíč: klíčem zůstává Stredisko (viz výš). Je to text, který se
 *   tiskne do smlouvy a protokolu.
 * Budova_cp - číslo popisné domu, ve kterém jednotka je („695").
 * Pozemek_parc_c - parcelní číslo pozemku pod domem („st. 771", „3617").
 * Prislusenstvi - sklep, parkovací stání, terasa, předzahrádka; volný text
 *   v takové podobě, v jaké má stát ve smlouvě. Appka ho nerozpadá na
 *   položky - v protokolu je to jedna věta a jako věta se i zapisuje.
 *
 * Typ budovy („bytový dům") se sem SCHVÁLNĚ NEPŘIDÁVÁ. Ze všech vzorů je to
 * jediný údaj, který byl pokaždé stejný, a pole, do kterého se vždycky
 * vyplní totéž, je jen práce navíc. V protokolu je předtištěný.
 */
/*
 * (v4.80) KAM SE ZA BYT PLATÍ.
 *
 * Jan 2026-08-21 poslal účet SVJ: *„SVJ účet CZ0408000000002846678359"*,
 * tuzemsky 2846678359/0800 u České spořitelny. Je to účet společenství
 * vlastníků „Společenství 2236" (Holečkova 2236/54).
 *
 * Patří na kartu bytu, ne do listu Ucty. `lib/uctySchema.js` vede účty,
 * proti kterým se PÁRUJE BANKOVNÍ VÝPIS - to jsou Janovy vlastní účty,
 * kam peníze chodí. Tohle je opak: účet, KAM Jan za byt platí. Kdyby se
 * sem přimíchal, appka by ho začala nabízet při párování výpisu a hlásit
 * u něj, že k němu nemá pohyby.
 *
 * SVJ_* - společenství vlastníků: příspěvky do fondu oprav a zálohy na
 *   služby domu. Variabilní symbol bývá číslo jednotky, ale ne vždy -
 *   proto vlastní pole a ne dopočet.
 *
 * ENERGIE TU SCHVÁLNĚ NEJSOU. V první verzi v4.80 tady byla i pole
 * `Energie_dodavatel` / `Energie_ucet` / `Energie_symbol` - vznikla
 * z toho, že jsem si druhý účet, který Jan poslal, vyložil jako dodavatele
 * energií k bytu. Jan to opravil: *„Schulte Energy je firma, nemá nic
 * s byty"*. Pole tedy zase zmizela. **Nepřidávat je zpátky, dokud si
 * o ně Jan neřekne** - sloupec, který vznikl z nedorozumění, se v tabulce
 * pozná jen tím, že do něj nikdo nikdy nic nenapíše.
 *
 * TŘI POLE, NE SAMOSTATNÝ LIST. Je to jedno platební místo. Až přibude
 * druhé a třetí (energie, výtah, internet do domu), je to ta chvíle udělat
 * z toho seznam - ne dřív.
 *
 * ÚČET SE OPISUJE, NEPŘEPOČÍTÁVÁ. Appka uloží přesně to, co Jan napíše -
 * IBAN i tuzemský tvar. Převádět IBAN na „číslo/kód" by znamenalo tiše
 * měnit údaj, podle kterého někdo posílá peníze.
 */
const NEMOVITOSTI_JEDNOTKY_HEADERS = [
  'ID', 'Firma', 'Stredisko', 'Nazev', 'Druh', 'Adresa', 'Katastralni_uzemi', 'Cislo_LV',
  'Cislo_jednotky', 'Budova_cp', 'Pozemek_parc_c', 'Prislusenstvi',
  'SVJ_nazev', 'SVJ_ucet', 'SVJ_symbol',
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
