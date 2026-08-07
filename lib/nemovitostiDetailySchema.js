/**
 * lib/nemovitostiDetailySchema.js
 * Sloupce čtyř malých listů, které appka vždycky zobrazuje pohromadě u
 * jedné Jednotky (viz lib/nemovitostiJednotkySchema.js) - Klíče, Měřidla,
 * Měřidla_Odečty, Revize (od v4.36, backlog položka 19). Appka je záměrně
 * NEDĚLÁ jako čtyři samostatné netlify funkce (byly by skoro identické,
 * jen s jiným názvem listu) - obsluhuje je jedna společná funkce
 * netlify/functions/nemovitosti-detaily.js podle parametru `entita`.
 *
 * Klíče (key control, návrh bod 5, claude/evidence_nemovitosti_navrh.md):
 * appka eviduje typ klíče, celkový počet vydaných kusů a KDO ho má právě
 * u sebe (držitel) + kdy byl vydán/vrácen. Jedno "držení" = jeden řádek;
 * historii appka nemaže, jen appka novým řádkem zaznamená další
 * vydání/vrácení (jednodušší než upravovat existující řádek tam a zpět).
 * Meridla (elektroměr/vodoměr/plynoměr, návrh bod 4): appka drží samotné
 * měřidlo (výrobní číslo, typ) odděleně od jeho ODEČTŮ v čase (Meridla_
 * Odecty) - 1 měřidlo : N odečtů, obdoba Smlouvy:Smlouvy_Prilohy.
 * Revize (návrh bod 6): termínované revize (elektro/plyn/komín/hasicí
 * přístroje/výtah) s datem revize a platností do - appka z tohohle pole
 * v budoucnu může počítat blížící se expiraci (podobně jako appka už
 * upozorňuje na expiraci Google OAuth refresh tokenu).
 *
 * Přístup ke všem čtyřem appka odvozuje stejně: podle pole Stredisko
 * appka najde odpovídající Nemovitosti_Jednotky.Firma a použije stejné
 * maPristupKFirme jako u Smlouvy - Strediska sama Firmu nenesou (viz
 * lib/strediskaSchema.js), proto je Jednotka tady nutná mezikrok.
 *
 * Rozhodnuto (AskUserQuestion, 2026-07-27 - viz claude/nomis-faktury-
 * backlog.md): appka tyhle čtyři listy zpřístupní JEN roli admin/účetní,
 * běžná role k nim nemá přístup ani na náhled (stejně jako appka na
 * úrovni záložky - viz nastavZamekZalozky('nav-nemovitosti', ...)
 * v public/app.js).
 */
const KLICE_HEADERS = [
  'ID', 'Stredisko', 'Typ_klice', 'Pocet_celkem', 'Drzitel',
  'Datum_vydani', 'Datum_vraceni', 'Poznamka',
];

const MERIDLA_HEADERS = [
  'ID', 'Stredisko', 'Typ', 'Vyrobni_cislo', 'EAN_EIC', 'Poznamka',
];
const MOZNOSTI_TYP_MERIDLA = ['Elektřina', 'Voda', 'Plyn', 'Teplo'];

const MERIDLA_ODECTY_HEADERS = ['ID', 'Meridlo_ID', 'Datum', 'Stav', 'Poznamka'];

const REVIZE_HEADERS = [
  'ID', 'Stredisko', 'Typ_revize', 'Datum_revize', 'Platnost_do', 'Poznamka',
];
const MOZNOSTI_TYP_REVIZE = ['Elektro', 'Plyn', 'Komín', 'Hasicí přístroje', 'Výtah', 'Ostatní'];

/**
 * Přístupové kódy (od v4.53, zadání Jana 2026-08-05: "k nemovitosti
 * evidovat také přístupové kódy k závoře, může jich být více").
 *
 * Rozhodnuto (AskUserQuestion 2026-08-05): kódy jsou VLASTNÍ, PÁTÝ seznam,
 * ne další typ Klíčů. Klíč je kus železa - appka u něj vede počet vydaných
 * kusů a KDO ho má právě u sebe, protože ho nemůžou mít dva lidi zároveň.
 * Kód je informace: zná ho víc lidí najednou, nevrací se, a místo počtu
 * kusů má platnost od-do. Kdyby seděly v jednom listu, u každého řádku by
 * byla půlka sloupců prázdná. **Nespojovat je zpátky.**
 *
 * `Nazev` je co to je ("Závora", "Vrata garáž"), `Umisteni` kde to je
 * ("hlavní vjezd z ulice"). U jedné nemovitosti bývá závor víc a název sám
 * je nerozliší.
 *
 * `Stav` ('Platný'/'Neplatný') přepíná ČLOVĚK. Appka umí spočítat, že
 * Platnost_do je už v minulosti, a napíše to nad seznamem - ale stav sama
 * nepřepne. Je to stejné pravidlo jako všude jinde: appka navrhne, člověk
 * potvrdí. Kód po expiraci navíc často ještě chvíli funguje, než ho
 * správce závory opravdu zruší. **Nepředělávat na automatiku.**
 *
 * Neplatné kódy se NEMAŽOU (Janova volba "Nechat se stavem Neplatný") -
 * řádek zůstane, jen zeslábne a spadne na konec seznamu, ať je za rok
 * dohledatelné, kdo jaký kód znal.
 *
 * Kód se zobrazuje ČITELNĚ, nemaskuje se (Janova volba "Rovnou vidět").
 * Není to platební karta: do Nemovitostí se dostane jen admin a účetní a
 * kód k závoře se stejně musí přečíst a nadiktovat do telefonu, takže by
 * maskování přidalo jen klepání navíc. **Nezavádět sem posledniCtyri()
 * ani nic podobného** - to pravidlo patří platebním kartám (viz
 * lib/platebniKartySchema.js), ne tomuhle.
 */
const PRISTUPOVE_KODY_HEADERS = [
  'ID', 'Stredisko', 'Nazev', 'Umisteni', 'Kod',
  'Platnost_od', 'Platnost_do', 'Predano_komu', 'Stav', 'Poznamka',
];
const MOZNOSTI_STAV_KODU = ['Platný', 'Neplatný'];

module.exports = {
  KLICE_HEADERS,
  MERIDLA_HEADERS,
  MOZNOSTI_TYP_MERIDLA,
  MERIDLA_ODECTY_HEADERS,
  REVIZE_HEADERS,
  MOZNOSTI_TYP_REVIZE,
  PRISTUPOVE_KODY_HEADERS,
  MOZNOSTI_STAV_KODU,
};
