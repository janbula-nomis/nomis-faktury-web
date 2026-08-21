/**
 * lib/rejstrikFirem.js
 * Rejstříkové údaje Janových firem (od v4.80).
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21: *„vyplň údaje všech mých firem do databáze, najdi si to
 * v OR, přesný název, IČ, adresa a bankovní spojení"*.
 *
 * Údaje se ověřovaly ve veřejném obchodním rejstříku 2026-08-21. Tabulka
 * níž je JEN OPIS toho, co v rejstříku stálo - ne odhad a ne to, co appka
 * vyčetla z naskenovaných smluv (tam je OCR a ten se plete: v naskenovaném
 * protokolu z 1. 4. 2026 přečetl název jako „NOMIS I. Homes s.r.o." a
 * spisovou značku jako „C 415611").
 *
 * ODKUD KTERÝ ÚDAJ POCHÁZÍ - tohle je to důležité
 *
 *   Název, IČO, sídlo, spisová značka, jednatel  … veřejný rejstřík
 *   DIČ                                          … rejstřík (jen tam, kde
 *                                                   ho uvádí; nedopočítává
 *                                                   se z IČO - „CZ+IČO" je
 *                                                   sice obvyklý tvar, ale
 *                                                   plátcovství DPH z toho
 *                                                   neplyne)
 *   Číslo účtu                                   … PODEPSANÉ SMLOUVY A
 *                                                   DODATKY, které Jan
 *                                                   poslal. V rejstříku
 *                                                   bankovní spojení NENÍ -
 *                                                   není to veřejný údaj.
 *
 * Ten poslední řádek je důvod, proč appka čísla účtů doplní, ale u každého
 * z nich řekne, ze kterého dokumentu je a k jakému datu. Účet se mění
 * (Janovi se změnil k 1. 1. 2025 kvůli odštěpení) a appka nemá jak vědět,
 * jestli od té doby nepřibyl další.
 *
 * Jan všechna čtyři čísla 2026-08-21 potvrdil a účet NOMIS Investment
 * dodal (v žádném z poslaných vzorů nevystupoval). Kdyby sem někdy přibyl
 * další záznam bez účtu, prázdno znamená „appka to neví", ne „firma účet
 * nemá".
 *
 * CO S TÍM APPKA DĚLÁ
 *
 * Servisní tlačítko „Doplnit údaje firem z rejstříku" (viz
 * netlify/functions/servis.js) jimi vyplní PRÁZDNÁ pole v listu Firmy.
 * **Nikdy nepřepíše hodnotu, kterou tam Jan už má** - i kdyby se od
 * rejstříku lišila. Rozdíl jen vypíše. Appka nemá jak vědět, jestli je
 * jiná hodnota překlep, nebo něco, co Jan ví a rejstřík ještě ne.
 */

/*
 * Klíč je Nazev z listu Firmy - tak, jak si je Jan pojmenoval (viz
 * ukázková data v lib/listySchema.js). Není to obchodní firma z rejstříku:
 * ta je v poli `obchodniFirma` a do listu Firmy se NEZAPISUJE, protože
 * Firmy.Nazev je klíč, na kterém visí každý doklad i přístup uživatelů
 * (viz netlify/functions/firmy.js).
 */
const FIRMY_REJSTRIK = [
  {
    nazev: 'NOMIS CZ',
    obchodniFirma: 'NOMIS CZ s.r.o.',
    ICO: '06716016',
    DIC: '', // v rejstříku neuvedeno
    sidlo: 'Holečkova 2236/54, Smíchov, 150 00 Praha 5',
    spisovaZnacka: 'C 287643 vedená u Městského soudu v Praze',
    jednatel: 'Ing. Jan Bula, jednatel',
    // Nájemní smlouva Schulte TZB na byt 45/695 (V parku 695, Velké
    // Popovice), nájem od 1. 2. 2023. Dodatek č. 2 z 15. 9. 2025 tenhle
    // účet k 1. 1. 2025 NAHRAZUJE účtem NOMIS & Homes - viz níž.
    ucet: '7631112/0800',
    ucetZdroj: 'nájemní smlouva Schulte TZB (2023), potvrdil Jan 2026-08-21',
    poznamka: 'Odštěpením k 19. 12. 2024 přešla část jmění na NOMIS & Homes s.r.o.',
  },
  {
    nazev: 'NOMIS & Homes',
    obchodniFirma: 'NOMIS & Homes s.r.o.',
    ICO: '22380621',
    DIC: '', // v rejstříku neuvedeno
    sidlo: 'Holečkova 2236/54, Smíchov, 150 00 Praha 5',
    // Spisová značka je z DODATKU Č. 2 - textového (nenaskenovaného) PDF,
    // které Jan podepsal 15. 9. 2025. Ve veřejném rejstříku se ji
    // 2026-08-21 nepodařilo načíst (stránka vracela chybu), takže je
    // z Janova vlastního dokumentu, ne z rejstříku.
    spisovaZnacka: 'C 415688 vedená u Městského soudu v Praze',
    jednatel: 'Ing. Jan Bula, jednatel',
    ucet: '60000002/0800',
    ucetZdroj: 'dodatek č. 2 k nájemní smlouvě, účinný od 1. 1. 2025 (Česká spořitelna), potvrdil Jan 2026-08-21',
    poznamka: 'Vznikla odštěpením z NOMIS CZ s.r.o. (projekt rozdělení ze 4. 11. 2024).',
  },
  {
    nazev: 'NOMIS Investment',
    obchodniFirma: 'NOMIS Investment s.r.o.',
    ICO: '19502800',
    DIC: 'CZ19502800',
    sidlo: 'Holečkova 2236/54, Smíchov, 150 00 Praha 5',
    spisovaZnacka: 'C 387609 vedená u Městského soudu v Praze',
    jednatel: 'Ing. Jan Bula, jednatel',
    // Jan 2026-08-21 dodal IBAN CZ2808000000000011002722. Tuzemsky je to
    // 11002722/0800 (Česká spořitelna) - appka ukládá tvar, který se tiskne
    // do smlouvy, a ten je u Janových vzorů tuzemský.
    ucet: '11002722/0800',
    ucetZdroj: 'doplnil Jan 2026-08-21 (IBAN CZ2808000000000011002722)',
    poznamka: '',
  },
];

/*
 * Ing. Jan Bula jako FYZICKÁ OSOBA - pronajímatel bytu Holečkova 2236/9
 * i 2236/1. Do listu Firmy nepatří (není to firma a nemá IČO), do
 * hlaviček smluv ano - viz lib/pronajimateleSchema.js.
 *
 * Adresa je z NEJNOVĚJŠÍ smlouvy (Schulte Group, nájem od 1. 3. 2026):
 * Ramonova 3466/4. Starší naskenovaná smlouva z roku 2023 uvádí Moravský
 * Kočov 199 - to je zastaralé a appka to schválně nenabízí.
 */
const OSOBA_JAN_BULA = {
  nazev: 'Ing. Jan Bula',
  datumNarozeni: '1978-05-17',
  adresa: 'Ramonova 3466/4, 100 00 Praha 10 - Strašnice',
  ucet: '1461395011/3030',
  ucetZdroj: 'nájemní smlouva Schulte Group, byt Holečkova 2236/9, potvrdil Jan 2026-08-21',
  email: 'jan.bula@email.cz',
  telefon: '+420 606 707 120',
};

/**
 * Co by se v listu Firmy doplnilo, kdyby se tlačítko zmáčklo teď.
 *
 * ČISTÁ FUNKCE - nic nezapisuje, jen popíše. Díky tomu se dá otestovat bez
 * Googlu a hlavně se dá stejný výpočet ukázat člověku PŘED zápisem.
 *
 * Vrací pro každý řádek listu Firmy:
 *   doplni  - { pole: hodnota } u polí, která jsou prázdná a rejstřík je zná
 *   rozdily - { pole: { vTabulce, vRejstriku } } u polí, kde se hodnoty liší
 *   nezname - názvy firem, ke kterým appka rejstříkový záznam nemá
 *
 * Pole, které už hodnotu má, se do `doplni` NIKDY nedostane - i když se
 * liší. Přepsat něco, co tam člověk napsal, je horší chyba než nechat
 * rozdíl viditelný.
 */
function navrhDoplneniFirem(radkyFirem) {
  const zmeny = [];
  const nezname = [];

  (radkyFirem || []).forEach((firma) => {
    const nazev = String(firma.Nazev || '').trim();
    const zaznam = FIRMY_REJSTRIK.find((f) => f.nazev === nazev);
    if (!zaznam) {
      if (nazev) nezname.push(nazev);
      return;
    }

    const doplni = {};
    const rozdily = {};
    const pary = [
      ['ICO', zaznam.ICO],
      ['DIC', zaznam.DIC],
      ['Bankovni_ucet', zaznam.ucet],
    ];
    pary.forEach(([pole, hodnota]) => {
      if (!hodnota) return; // rejstřík to neví - appka nevymýšlí
      const soucasna = String(firma[pole] || '').trim();
      if (!soucasna) { doplni[pole] = hodnota; return; }
      if (soucasna !== hodnota) rozdily[pole] = { vTabulce: soucasna, vRejstriku: hodnota };
    });

    if (Object.keys(doplni).length || Object.keys(rozdily).length) {
      zmeny.push({ nazev, row: firma._row, doplni, rozdily, obchodniFirma: zaznam.obchodniFirma });
    }
  });

  return { zmeny, nezname };
}

module.exports = { FIRMY_REJSTRIK, OSOBA_JAN_BULA, navrhDoplneniFirem };
