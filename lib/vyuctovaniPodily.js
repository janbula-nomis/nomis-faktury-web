/**
 * lib/vyuctovaniPodily.js
 * Rozúčtování nákladů BYTU mezi jeho NÁJEMNÍ JEDNOTKY (od v4.57).
 *
 * Proč to vzniklo: Jan 2026-08-07 - *"rozdělit na byt a pak dále na
 * nájemní jednotka (jeden byt má více nájemníků)"*. Do v4.56 platilo
 * „jedna jednotka = jedno vyúčtování" (rozhodnuto 2026-07-27) a náklady se
 * nedělily vůbec. Jakmile má byt dva nájemníky, dělit se musí: náklad na
 * energie přijde za celý byt, ale zálohy platí každý zvlášť.
 *
 * Klíč dělení si Jan vybral 2026-08-07: **podle plochy**. U bytu 70 m²
 * rozděleného na 40 m² a 30 m² dostane první jednotka 4/7 nákladů a druhá
 * 3/7. Ostatní nabízené varianty (rovným dílem, ruční procento) si
 * nevybral - **nedodělávat je zpětně bez toho, že si o ně řekne.**
 *
 * TŘI PRAVIDLA, KTERÁ SE TU NESMÍ POLEVIT
 *
 * 1) Appka si plochu NIKDY nedomyslí. Když u některé nájemní jednotky
 *    plocha chybí nebo je nula, funkce vrátí `null` a volající to musí
 *    člověku napsat. Tichý odhad (třeba „rozděl rovným dílem, když plocha
 *    chybí") by udělal číslo, které vypadá jako spočítané, ale není -
 *    a tohle číslo jde nájemníkovi do vyúčtování podle zákona
 *    č. 67/2013 Sb. Radši ať appka řekne „doplňte plochu".
 *
 * 2) Podíly se počítají ze VŠECH nájemních jednotek bytu, ne jen
 *    z obsazených. Kdyby se prázdná jednotka vynechala, náklad na
 *    neobsazenou část bytu by zaplatili zbylí nájemníci - ten patří
 *    pronajímateli.
 *
 * 3) Součet rozúčtovaných částek musí sedět na původní náklad na haléř.
 *    Prosté vynásobení podílem to nezaručí (0,1 + 0,1 + 0,1 ≠ 0,3),
 *    poslední jednotka proto dostane zbytek, ne svůj vypočtený podíl.
 *    Bez toho by ve vyúčtování chyběly nebo přebývaly haléře a nikdo by
 *    nevěděl proč.
 */

// Plocha ze Sheets je text ("40", "40,5", "40 m²"). Vlastní převod, ať se
// tenhle soubor nemusí vázat na bankHelpers - pravidla jsou stejná:
// desetinná čárka i tečka, cokoli nečíselného pryč.
function plochaZListu(hodnota) {
  if (hodnota === null || hodnota === undefined) return 0;
  const puvodni = String(hodnota);
  // Záporná plocha je nesmysl a odmítá se CELÁ. Bez téhle kontroly by
  // z "-5" po očištění zbylo "5" a appka by počítala s pětkou - tedy tiše
  // s něčím jiným, než co je v tabulce napsané.
  if (puvodni.indexOf('-') !== -1) return 0;
  const text = puvodni.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const cislo = parseFloat(text);
  return Number.isFinite(cislo) && cislo > 0 ? cislo : 0;
}

/**
 * Spočítá podíly nájemních jednotek podle plochy.
 *
 * @param {Array} jednotky - nájemní jednotky JEDNOHO bytu
 * @returns {{podily: Array<{ID: string, plocha: number, podil: number}>,
 *            celkovaPlocha: number} | null}
 *          null = spočítat to nejde (žádné jednotky, nebo některé chybí plocha)
 */
function spocitejPodilyPodlePlochy(jednotky) {
  const seznam = Array.isArray(jednotky) ? jednotky : [];
  if (seznam.length === 0) return null;

  const sPlochou = seznam.map((j) => ({ ID: j.ID, plocha: plochaZListu(j.Plocha_m2) }));
  // Pravidlo 1: jediná chybějící plocha shodí celý výpočet. Ne proto, že by
  // to nešlo spočítat z ostatních, ale proto, že by výsledek byl tiše
  // špatný - chybějící jednotka by se do součtu nezapočítala a ostatní by
  // její díl zaplatily.
  if (sPlochou.some((j) => j.plocha <= 0)) return null;

  const celkovaPlocha = sPlochou.reduce((soucet, j) => soucet + j.plocha, 0);
  if (celkovaPlocha <= 0) return null;

  return {
    celkovaPlocha,
    podily: sPlochou.map((j) => ({ ID: j.ID, plocha: j.plocha, podil: j.plocha / celkovaPlocha })),
  };
}

/**
 * Podíl jedné konkrétní nájemní jednotky. Vrací 1 (celý náklad), když byt
 * žádné nájemní jednotky nemá - to je stav před v4.57 a musí dál fungovat
 * stejně jako dřív, jinak by se starým bytům rozbilo vyúčtování.
 *
 * @returns {{podil: number, duvod: string, celkovaPlocha: number|null,
 *            plocha: number|null}}
 */
function podilJednotky(jednotky, najemniJednotkaId) {
  const seznam = Array.isArray(jednotky) ? jednotky : [];

  if (seznam.length === 0 || !najemniJednotkaId) {
    return { podil: 1, duvod: 'cely-byt', celkovaPlocha: null, plocha: null };
  }
  // Jediná jednotka = celý byt. Počítat 40/40 by dalo totéž, ale takhle
  // projde i byt, u kterého Jan plochu jednotky nevyplnil - a nemusí ji
  // vyplňovat, dokud byt nerozdělí.
  if (seznam.length === 1) {
    return { podil: 1, duvod: 'jedina-jednotka', celkovaPlocha: null, plocha: null };
  }

  const vysledek = spocitejPodilyPodlePlochy(seznam);
  if (!vysledek) {
    return { podil: null, duvod: 'chybi-plocha', celkovaPlocha: null, plocha: null };
  }

  const muj = vysledek.podily.find((p) => p.ID === najemniJednotkaId);
  if (!muj) {
    return { podil: null, duvod: 'jednotka-nenalezena', celkovaPlocha: vysledek.celkovaPlocha, plocha: null };
  }

  return {
    podil: muj.podil,
    duvod: 'podle-plochy',
    celkovaPlocha: vysledek.celkovaPlocha,
    plocha: muj.plocha,
  };
}

// Zaokrouhlení na haléře. Násobení a dělení stem kvůli tomu, jak počítač
// zachází s desetinnými čísly - `Math.round(x * 100) / 100` je jediný
// spolehlivý způsob, jak z 1234.5649999 dostat 1234.56.
function naHalere(castka) {
  return Math.round(castka * 100) / 100;
}

/**
 * Rozdělí jednu částku mezi nájemní jednotky podle plochy tak, aby součet
 * seděl na haléř (pravidlo 3 v hlavičce).
 *
 * @returns {Array<{ID: string, castka: number, podil: number}> | null}
 */
function rozpocitejCastku(castka, jednotky) {
  const vysledek = spocitejPodilyPodlePlochy(jednotky);
  if (!vysledek) return null;

  const rozdeleno = vysledek.podily.map((p) => ({ ID: p.ID, podil: p.podil, castka: naHalere(castka * p.podil) }));
  // Poslední jednotka dostane zbytek do původní částky. Rozdíl je vždycky
  // nanejvýš pár haléřů, ale bez tohohle by se součet ve vyúčtování
  // nerovnal nákladu a nikdo by nevěděl proč.
  const soucetBezPosledni = rozdeleno.slice(0, -1).reduce((s, r) => s + r.castka, 0);
  rozdeleno[rozdeleno.length - 1].castka = naHalere(castka - soucetBezPosledni);
  return rozdeleno;
}

module.exports = {
  plochaZListu,
  spocitejPodilyPodlePlochy,
  podilJednotky,
  rozpocitejCastku,
  naHalere,
};
