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

module.exports = {
  KLICE_HEADERS,
  MERIDLA_HEADERS,
  MOZNOSTI_TYP_MERIDLA,
  MERIDLA_ODECTY_HEADERS,
  REVIZE_HEADERS,
  MOZNOSTI_TYP_REVIZE,
};
