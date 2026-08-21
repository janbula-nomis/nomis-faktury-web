/**
 * lib/wifiJednotek.js
 * WiFi sítě k nájemním jednotkám (od v4.82).
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21 poslal tabulku a napsal *„doplň mi hesla wifi a přihlášení,
 * klíče i wifi musí být samostatně k nájemní jednotce, doplň také všechny
 * byty co mám"*:
 *
 *   Holečkova 1a   o2hol01a   Subaru.24a
 *   Holečkova 1b   o2hol01b   Porsche.24b
 *   Holečkova 7a   HOL_07a    Holada.22
 *   Holečkova 7b   HOL_07b    Holada.36
 *   Holečkova 9    HOL_09     Holada.54
 *
 * a potvrdil, že 1a/1b a 7a/7b jsou dvě nájemní jednotky jednoho bytu.
 *
 * PROČ SE TO NEZAPISUJE ROVNOU
 *
 * Appka nezná jména Janových jednotek v tabulce - ví jen, co jí napsal.
 * „Holečkova 1a" může být v listu Najemni_jednotky uložené jako `1a`,
 * `HOL01a`, `Holečkova 1a` nebo jakkoli jinak. Proto tahle tabulka jen
 * POPISUJE, co se má kam doplnit, a `navrhWifi()` k tomu dohledá jednotky
 * v tom, co v tabulce opravdu je. Co se nenajde, appka VYPÍŠE - nezaloží
 * to a nikam to nenacpe.
 *
 * A stejné pravidlo jako u rejstříku firem (lib/rejstrikFirem.js):
 * **hodnota, která už v tabulce je, se nikdy nepřepíše.** Rozdíl se jen
 * ukáže. Heslo k WiFi se mění a appka nemá jak vědět, které z těch dvou je
 * to novější.
 */

/*
 * `popis` je přesně to, co Jan napsal - podle toho se jednotka hledá.
 * `stredisko` je jeho byt (středisko) tak, jak ho appka vede podle
 * dosavadních dat; slouží jen k zúžení hledání, shoda se hledá i bez něj.
 */
const WIFI_JEDNOTEK = [
  { popis: 'Holečkova 1a', stredisko: 'Holečkova 1', sit: 'o2hol01a', heslo: 'Subaru.24a' },
  { popis: 'Holečkova 1b', stredisko: 'Holečkova 1', sit: 'o2hol01b', heslo: 'Porsche.24b' },
  { popis: 'Holečkova 7a', stredisko: 'Holečkova 7', sit: 'HOL_07a', heslo: 'Holada.22' },
  { popis: 'Holečkova 7b', stredisko: 'Holečkova 7', sit: 'HOL_07b', heslo: 'Holada.36' },
  { popis: 'Holečkova 9', stredisko: 'Holečkova 9', sit: 'HOL_09', heslo: 'Holada.54' },
];

/**
 * Porovnávací tvar textu: bez diakritiky, bez mezer, malými písmeny.
 *
 * „Holečkova 1a", „holeckova 1a" i „HOLEČKOVA1A" jsou totéž. Bez tohohle
 * by se hledání rozbilo na první mezeře navíc - a v ručně psané tabulce
 * jich je vždycky pár.
 */
function porovnavaciTvar(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-.]/g, '')
    .toLowerCase();
}

/**
 * Ke které nájemní jednotce řádek patří.
 *
 * Zkouší se čtyři podoby, od nejpřísnější:
 *   1. celý popis proti názvu/kódu jednotky („Holečkova 1a" = „Holečkova 1a")
 *   2. celý popis proti středisko+název („Holečkova 1" + „a")
 *   3. zbytek popisu po názvu střediska proti názvu/kódu jednotky („1a", „a")
 *   4. nic - řádek se vypíše jako nenalezený
 *
 * Kdyby se hledalo volněji (třeba „obsahuje"), „Holečkova 1" by sedělo i na
 * „Holečkova 1b" a heslo by skončilo u cizího nájemníka. **Nerozvolňovat.**
 */
function najdiJednotku(radek, jednotky) {
  const hledany = porovnavaciTvar(radek.popis);
  const kandidati = (jednotky || []).filter((n) => !radek.stredisko
    || porovnavaciTvar(n.Stredisko) === porovnavaciTvar(radek.stredisko));

  const shoda = (n) => porovnavaciTvar(n.Nazev) === hledany || porovnavaciTvar(n.Kod) === hledany;
  let nalezena = kandidati.find(shoda) || (jednotky || []).find(shoda);
  if (nalezena) return nalezena;

  const shodaSeStrediskem = (n) =>
    porovnavaciTvar(String(n.Stredisko || '') + String(n.Nazev || '')) === hledany
    || porovnavaciTvar(String(n.Stredisko || '') + String(n.Kod || '')) === hledany;
  nalezena = (jednotky || []).find(shodaSeStrediskem);
  if (nalezena) return nalezena;

  // Zbytek popisu po názvu střediska: „Holečkova 1a" bez „Holečkova 1"
  // dá „a"; hledá se jednotka pojmenovaná „a" nebo „1a".
  if (radek.stredisko) {
    const prefix = porovnavaciTvar(radek.stredisko);
    if (hledany.startsWith(prefix)) {
      const zbytek = hledany.slice(prefix.length);
      if (zbytek) {
        nalezena = kandidati.find((n) => {
          const nazev = porovnavaciTvar(n.Nazev);
          const kod = porovnavaciTvar(n.Kod);
          return nazev === zbytek || kod === zbytek
            || nazev.endsWith(zbytek) || kod.endsWith(zbytek);
        });
        if (nalezena) return nalezena;
      }
    }
  }
  return null;
}

/**
 * Co by se doplnilo, kdyby se tlačítko zmáčklo teď. ČISTÁ FUNKCE.
 *
 * `najemniJednotky` jsou řádky listu Najemni_jednotky, `byty` řádky listu
 * Nemovitosti_Jednotky. Řádek míří na jednotku, když se najde; jinak na
 * BYT - Holečkova 9 u Jana na jednotky rozdělená není a WiFi tam patří
 * rovnou bytu, přesně tak, jak to appka vedla do v4.81.
 *
 * Vrací:
 *   doplni  - [{ cil, zaznam, radek, zmeny }] tam, kde je pole prázdné
 *   rozdily - [{ cil, zaznam, radek, pole, vTabulce, nove }] u odlišných hodnot
 *   nenalezene - řádky, ke kterým se nenašel ani byt, ani jednotka
 *
 * `cil` je 'jednotka' nebo 'byt' - podle toho se pak zapisuje do jiného
 * listu jiným endpointem.
 */
function navrhWifi(najemniJednotky, byty) {
  const doplni = [];
  const rozdily = [];
  const nenalezene = [];

  WIFI_JEDNOTEK.forEach((radek) => {
    let cil = 'jednotka';
    let zaznam = najdiJednotku(radek, najemniJednotky);
    if (!zaznam) {
      // Byt bez nájemních jednotek - WiFi patří rovnou jemu.
      const hledany = porovnavaciTvar(radek.popis);
      zaznam = (byty || []).find((b) => porovnavaciTvar(b.Stredisko) === hledany
        || porovnavaciTvar(b.Nazev) === hledany
        || porovnavaciTvar(b.Stredisko) === porovnavaciTvar(radek.stredisko));
      cil = 'byt';
    }
    if (!zaznam) { nenalezene.push(radek); return; }

    const zmeny = {};
    [['Wifi_sit', radek.sit], ['Wifi_heslo', radek.heslo]].forEach(([pole, nove]) => {
      const soucasna = String(zaznam[pole] || '').trim();
      if (!soucasna) { zmeny[pole] = nove; return; }
      if (soucasna !== nove) rozdily.push({ cil, zaznam, radek, pole, vTabulce: soucasna, nove });
    });
    if (Object.keys(zmeny).length) doplni.push({ cil, zaznam, radek, zmeny });
  });

  return { doplni, rozdily, nenalezene };
}

module.exports = { WIFI_JEDNOTEK, navrhWifi, porovnavaciTvar, najdiJednotku };
