/**
 * lib/stranyZeSmluv.js
 * Nájemci vytažení z Janových podepsaných smluv a protokolů (od v4.83).
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21: *„vytáhni ze smluv nájemníky a pronajímatele a doplň je
 * do app"*. Pronajímatelé se doplnili už ve v4.80 (viz lib/rejstrikFirem.js
 * a ukázka listu Pronajimatele); tohle je druhá strana.
 *
 * ZDROJ U KAŽDÉHO ŘÁDKU - a to je tu to podstatné
 *
 * Dva z těch čtyř nájemců jsou z TEXTOVÝCH dokumentů, kde se dá číst
 * doslova. Druzí dva ze SKENŮ přes OCR, a ten se plete: u téhož protokolu
 * přečetl jméno jednou jako „Marlla Kreslak" a podruhé „Marila Kreslak",
 * u druhého „Mykhailo Hok:Mnko". **U takových řádků appka rovnou napíše do
 * poznámky, že jsou z OCR a mají se překontrolovat** - jméno nájemce jde do
 * podepisované smlouvy a překlep v něm je horší než prázdné pole.
 *
 * E-maily z OCR se sem SCHVÁLNĚ NEDÁVAJÍ. „muxaul.holhenkol@tpnall.com" je
 * zjevně přečtený špatně a e-mail se nedá odhadnout - buď sedí, nebo je to
 * adresa někoho cizího. Prázdné pole je jediná poctivá možnost.
 */

/*
 * `Druh`, `Nazev` a spol. jsou přímo sloupce listu Najemci (stejné schéma
 * jako Pronajimatele - viz lib/pronajimateleSchema.js).
 *
 * `zdroj` je dokument, ze kterého to je; `ocr` říká, že je to ze skenu.
 * Obojí končí v poznámce toho řádku, ne v samostatném sloupci - list
 * Najemci žádný nemá a přidávat sloupec kvůli pěti řádkům by bylo horší
 * než věta v poznámce.
 */
const NAJEMCI_ZE_SMLUV = [
  {
    Nazev: 'Schulte Group a.s.',
    Druh: 'Firma',
    ICO: '19866801',
    DIC: 'CZ19866801',
    Spisova_znacka: 'B 28456 vedená u Městského soudu v Praze',
    Sidlo: 'Na Šafránce 1802/22, Vinohrady, 101 00 Praha 10',
    Zastoupena: 'Ing. Marek Šulek a Marie Procházková, členové představenstva',
    zdroj: 'nájemní smlouva Holečkova 2236/9 a dodatek č. 2',
    ocr: false,
  },
  {
    Nazev: 'Schulte TZB, s.r.o.',
    Druh: 'Firma',
    ICO: '25622242',
    DIC: 'CZ25622242',
    Spisova_znacka: 'C 55599 vedená u Městského soudu v Praze',
    Sidlo: 'Pod altánem 89/93, Strašnice, 100 00 Praha 10',
    Zastoupena: 'Ing. Jan Bula, jednatel',
    Bankovni_ucet: '6390652/0800',
    zdroj: 'nájemní smlouva V parku 695 byt 45 (2023)',
    ocr: true,
  },
  {
    Nazev: 'Mykhailo Hokhonko',
    Druh: 'Osoba',
    Sidlo: 'Masarykova 93, 251 69 Velké Popovice',
    Datum_narozeni: '1996-03-18',
    Telefon: '+420 601 201 374',
    Bankovni_ucet: '4189084023/0100',
    zdroj: 'předávací protokol V parku 695 byt 45 (nájem od 1. 4. 2026)',
    ocr: true,
  },
  {
    Nazev: 'Marila Kresliak',
    Druh: 'Osoba',
    Sidlo: 'Topasova 2805, 251 68 Kamenice',
    Datum_narozeni: '1973-10-16',
    Telefon: '+420 608 669 877',
    zdroj: 'předávací protokol V parku 695 byt 54 (nájem od 16. 12. 2024)',
    ocr: true,
  },
];

const POLE_STRANY = [
  'Nazev', 'Druh', 'ICO', 'DIC', 'Spisova_znacka', 'Sidlo', 'Zastoupena',
  'Datum_narozeni', 'Bankovni_ucet', 'Email', 'Telefon',
];

/** Poznámka, která u řádku zůstane v tabulce. */
function poznamkaRadku(radek) {
  const casti = ['Vytaženo z: ' + radek.zdroj + '.'];
  if (radek.ocr) {
    casti.push('Přepsáno ze SKENU (OCR) – překontrolujte jméno, adresu i datum narození, '
      + 'než to půjde do podepisované smlouvy.');
  }
  return casti.join(' ');
}

/**
 * Co by se doplnilo do listu Najemci. ČISTÁ FUNKCE - nic nezapisuje.
 *
 * Řádek, který v seznamu už je (podle názvu), se **nedoplňuje ani
 * nepřepisuje**. Jméno je tu identita: kdyby se dohledávalo volněji,
 * „Schulte Group a.s." a „Schulte TZB, s.r.o." by splynuly a do smlouvy
 * by se vytisklo cizí IČO.
 */
function navrhNajemcu(najemciVTabulce) {
  const stavajici = (najemciVTabulce || []).map((n) => String(n.Nazev || '').trim());
  const pridat = [];
  const uzJsou = [];

  NAJEMCI_ZE_SMLUV.forEach((radek) => {
    if (stavajici.includes(radek.Nazev)) { uzJsou.push(radek.Nazev); return; }
    const novy = {};
    POLE_STRANY.forEach((pole) => { novy[pole] = radek[pole] || ''; });
    novy.Vychozi = '';
    novy.Firma = '';
    novy.Poznamka = poznamkaRadku(radek);
    pridat.push({ radek, zaznam: novy, ocr: !!radek.ocr });
  });

  return { pridat, uzJsou };
}

module.exports = { NAJEMCI_ZE_SMLUV, navrhNajemcu, poznamkaRadku, POLE_STRANY };
