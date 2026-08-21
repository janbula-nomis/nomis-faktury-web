/**
 * lib/dodatkySchema.js
 * Dodatky k nájemním smlouvám (od v4.83) - listy "Dodatky" a "Dodatky_Zmeny".
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21: *„jak budeme řešit smlouvy a dodatky, potřebuji generovat
 * dokumentaci, po vyplnění karty udělat tiskový výstup k podpisu"*, a pak
 * *„jak udělám dodatek nebo předávací protokol"*.
 *
 * Vzorem je jeho vlastní `dodatek2.pdf` (podepsaný 15. 9. 2025): dodatek
 * č. 2 k nájemní smlouvě, kterým se od 1. 1. 2025 mění číslo účtu pro
 * platby nájemného po odštěpení NOMIS & Homes z NOMIS CZ.
 *
 * DVA LISTY, NE VOLNÝ TEXT
 *
 * Ve volbě si Jan vybral, že dodatek měnící nájemné nebo účet se má do
 * smlouvy promítnout **až po jeho potvrzení**. Aby appka uměla ukázat
 * „nájem 24 000 → 26 000 od 1. 1.", musí vědět, KTERÉ POLE se mění a NA CO.
 * Volný text („mění se čl. IV odst. 1") to neumí - dal by se vytisknout,
 * ale ne promítnout.
 *
 * Proto `Dodatky` (hlavička dokumentu) a `Dodatky_Zmeny` (řádky změn) -
 * stejný vzor jako Meridla : Meridla_Odecty nebo Doklady : Doklady_Polozky.
 *
 * DODATKY
 *
 * Smlouva_ID - ke které smlouvě dodatek patří. Dodatek bez smlouvy nedává
 *   smysl; middleware ho odmítne.
 * Cislo_dodatku - „2" nebo „č. 2", text tak, jak má stát v dokumentu.
 *   Appka ho NEDOPOČÍTÁVÁ z počtu existujících dodatků: Jan má dodatky
 *   podepsané i mimo appku a číslo je součást identity dokumentu.
 * Datum_uzavreni - kdy se podepsal. Jako u smlouvy to NENÍ totéž co
 *   účinnost: Janův dodatek č. 2 je podepsaný 15. 9. 2025 a účinný od
 *   1. 1. 2025, tedy zpětně.
 * Ucinnost_od - od kdy změny platí. Tohle datum se tiskne do dokumentu
 *   i ukazuje v náhledu promítnutí.
 * Predmet - jednou větou, čeho se dodatek týká. Volný text.
 * Stav - 'Návrh' / 'Podepsaný' / 'Promítnutý'. Přepíná ho ČLOVĚK, kromě
 *   'Promítnutý', který appka nastaví sama po úspěšném promítnutí - to je
 *   záznam toho, co se stalo, ne návrh.
 * Poznamka - volný text.
 *
 * DODATKY_ZMENY
 *
 * Cil - 'Smlouva' nebo 'Pronajimatel'. Janův dodatek č. 2 mění BANKOVNÍ
 *   ÚČET, a ten není na smlouvě - je na pronajímateli (viz
 *   lib/pronajimateleSchema.js). Bez tohohle rozlišení by se jeho vlastní
 *   dodatek do appky nevešel.
 *
 *   **Změna na pronajímateli se dotkne i ostatních smluv.** Je to sdílený
 *   záznam. Appka to musí v náhledu říct nahlas - viz `popisDopadu()` níž -
 *   a nikdy to nesmí provést bez potvrzení.
 * Pole - název sloupce ('Cisty_najem', 'Bankovni_ucet', …).
 * Nova_hodnota - text, který se má do pole zapsat. Stará hodnota se sem
 *   NEUKLÁDÁ: appka ji čte ze smlouvy v okamžiku náhledu, aby ukázala
 *   skutečný stav, ne ten, který platil při psaní dodatku.
 * Popis - nepovinný text do dokumentu, když samotné „pole → hodnota"
 *   nestačí („nové číslo účtu vedený u České spořitelny a.s.").
 */
const DODATKY_HEADERS = [
  'ID', 'Smlouva_ID', 'Cislo_dodatku', 'Datum_uzavreni', 'Ucinnost_od',
  'Predmet', 'Stav', 'Poznamka',
];

const DODATKY_ZMENY_HEADERS = [
  'ID', 'Dodatek_ID', 'Cil', 'Pole', 'Nova_hodnota', 'Popis',
];

const MOZNOSTI_STAV_DODATKU = ['Návrh', 'Podepsaný', 'Promítnutý'];

/*
 * Která pole smí dodatek měnit.
 *
 * Schválně KRÁTKÝ seznam. Dodatkem se u Jana mění nájemné, zálohy, kauce,
 * doba nájmu, symbol a číslo účtu - a nic z toho není klíč. **Sem nikdy
 * nepřidávat `Stredisko`, `Firma`, `ID` ani `Druha_strana`**: na těch visí
 * párování plateb a účetnictví a dodatek, který je umí přepsat, je dodatek,
 * kterým se dá jedním omylem rozhodit evidence.
 *
 * `popis` je to, co uvidí člověk; `pole` název sloupce v tabulce.
 */
const POLE_SMLOUVY = [
  { pole: 'Cisty_najem', popis: 'Nájemné' },
  { pole: 'Zaloha_na_sluzby', popis: 'Zálohy na služby' },
  { pole: 'Kauce_castka', popis: 'Jistota (kauce)' },
  { pole: 'Platnost_do', popis: 'Konec nájmu' },
  { pole: 'Platnost_od', popis: 'Začátek nájmu' },
  { pole: 'Variabilni_symbol', popis: 'Variabilní symbol' },
  { pole: 'Den_splatnosti', popis: 'Den splatnosti' },
  { pole: 'Inflace_od', popis: 'Inflační doložka od' },
];

const POLE_PRONAJIMATELE = [
  { pole: 'Bankovni_ucet', popis: 'Bankovní účet pronajímatele' },
  { pole: 'Sidlo', popis: 'Sídlo pronajímatele' },
  { pole: 'Zastoupena', popis: 'Kdo za společnost jedná' },
];

/** Lidský popis pole - do náhledu i do tištěného dodatku. */
function popisPole(cil, pole) {
  const seznam = cil === 'Pronajimatel' ? POLE_PRONAJIMATELE : POLE_SMLOUVY;
  const nalezene = seznam.find((p) => p.pole === pole);
  return nalezene ? nalezene.popis : pole;
}

/** Smí dodatek na tohle pole sáhnout? Vše mimo seznam se odmítá. */
function jePovolenePole(cil, pole) {
  const seznam = cil === 'Pronajimatel' ? POLE_PRONAJIMATELE : POLE_SMLOUVY;
  return seznam.some((p) => p.pole === pole);
}

/**
 * Věta, kterou appka musí u změny říct nahlas.
 *
 * U pronajímatele je to varování, ne popisek: účet je sdílený a změna se
 * projeví i u smluv, o kterých ten dodatek vůbec není.
 */
function popisDopadu(cil) {
  if (cil === 'Pronajimatel') {
    return 'Změní se údaj pronajímatele – tedy i u všech ostatních smluv, které na něj ukazují.';
  }
  return 'Změní se jen tahle smlouva.';
}

module.exports = {
  DODATKY_HEADERS,
  DODATKY_ZMENY_HEADERS,
  MOZNOSTI_STAV_DODATKU,
  POLE_SMLOUVY,
  POLE_PRONAJIMATELE,
  popisPole,
  jePovolenePole,
  popisDopadu,
};
