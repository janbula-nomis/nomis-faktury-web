/**
 * lib/kontrolaNajmu.js
 * Systémová kontrola přiřazení přijatých nájemních plateb ke smlouvám
 * (od v4.58).
 *
 * Jan 2026-08-08: *"můžeš systémově zkontrolovat přijaté platby za nájmy ke
 * smlouvám a upravit jejich přiřazení?"*. Volba: **appka navrhne, člověk
 * potvrdí** - stejné pravidlo, na kterém stojí celá appka. Tenhle soubor
 * proto NIC NEZAPISUJE. Je to čistý výpočet: dostane pohyby, smlouvy a
 * nájemní jednotky, vrátí seznam nálezů. Zápis dělá až člověk klepnutím
 * v appce. **Nepředělávat na automatiku.**
 *
 * PROČ TO VZNIKLO. Nájem se páruje přes navrhniShoduNajem()
 * (lib/bankHelpers.js): musí sedět částka v toleranci a k tomu jméno
 * protistrany NEBO variabilní symbol. Jenže část nájemníků platí přes
 * firmu, zprostředkovatele nebo z Wise - jméno tedy nesedí a zbývá jediný
 * signál. U bytu rozděleného mezi víc nájemníků (Holečkova 1a/1b) může
 * platba tiše přistát na smlouvě toho druhého a nikdo si toho nevšimne,
 * protože obě sedí na stejné středisko.
 *
 * ČTYŘI KONTROLY, které si Jan vybral:
 *
 *   bez-jednotky   Byt je rozdělený na víc nájemních jednotek, ale smlouva
 *                  nemá vybranou žádnou. Vyúčtování pak počítá náklady za
 *                  CELÝ byt (viz lib/vyuctovaniPodily.js) - nájemník tedy
 *                  dostane vyúčtování na spotřebu i té části, kterou
 *                  neužívá. Nová chyba od v4.57.
 *   castka-nesedi  Platba je přiřazená, ale liší se od předpisu smlouvy
 *                  (čistý nájem + záloha) o víc než toleranci.
 *   chybi-platba   Měsíc bez platby u smlouvy, která v něm platila.
 *   dvoji-platba   Dvě a víc plateb na jednu smlouvu v jednom měsíci.
 *   po-platnosti   Platba přiřazená ke smlouvě, která v době platby už
 *                  neplatila (nebo je neaktivní).
 *
 * DVĚ PRAVIDLA, KTERÁ SE TU NESMÍ POLEVIT
 *
 * 1) Návrh opravy appka dá jen tehdy, když je JEDNOZNAČNÝ. Když by na
 *    danou platbu seděly dvě smlouvy stejně dobře, appka nález nahlásí
 *    BEZ návrhu. Polovičatý návrh je horší než žádný: člověk ho odklepne,
 *    protože appce věří, a chyba se tím zabetonuje.
 * 2) Chybějící platbu appka nikdy „nedopočítá". Nález říká, že v tom
 *    měsíci nic nepřišlo - jestli nájemník nezaplatil, nebo se platba jen
 *    nespárovala, appka neví a nesmí předstírat, že ano.
 */

const { parsujCastkuZListu, normalizujNazev } = require('./bankHelpers');

// Kolik se smí platba lišit od předpisu, než to appka označí. Stejný tvar
// jako tolerance v navrhniShoduNajem() - u malých částek pevných 100 Kč,
// u velkých 10 %. Kdyby to bylo přísnější, hlásily by se haléřové rozdíly
// ze zaokrouhlení; kdyby volnější, propadl by rozdíl jednoho měsíce zálohy.
function tolerance(ocekavano) {
  return Math.max(100, Math.abs(ocekavano) * 0.1);
}

// Předpis smlouvy = čistý nájem + záloha na služby. Když je rozpad prázdný
// (starší smlouvy ho nemají), appka spadne zpátky na Ocekavana_castka.
function predpisSmlouvy(smlouva) {
  const rozpad = parsujCastkuZListu(smlouva.Cisty_najem) + parsujCastkuZListu(smlouva.Zaloha_na_sluzby);
  if (rozpad > 0) return rozpad;
  return Math.abs(parsujCastkuZListu(smlouva.Ocekavana_castka));
}

// Datumy jsou v Sheets řetězce RRRR-MM-DD, takže se porovnávají jako text.
function mesicZData(datum) {
  return String(datum || '').slice(0, 7);
}

function jeVRoce(datum, rok) {
  return String(datum || '').slice(0, 4) === String(rok);
}

// Platila smlouva v daném měsíci? Prázdná platnost = bez omezení.
function platilaVMesici(smlouva, mesic) {
  const od = mesicZData(smlouva.Platnost_od);
  const doM = mesicZData(smlouva.Platnost_do);
  if (od && mesic < od) return false;
  if (doM && mesic > doM) return false;
  return true;
}

/**
 * Hlavní kontrola.
 *
 * @param {Object} vstup
 * @param {Array} vstup.pohyby - Bankovni_pohyby
 * @param {Array} vstup.smlouvy - Smlouvy
 * @param {Array} vstup.najemniJednotky - Najemni_jednotky
 * @param {string|number} vstup.rok - kalendářní rok
 * @param {string} [vstup.dnes] - RRRR-MM-DD; předává se kvůli testům, ať
 *        výsledek nezávisí na tom, kdy se test pouští
 * @returns {{rok: string, nalezy: Array, prehled: Object}}
 */
function zkontrolujNajmy(vstup) {
  const rok = String(vstup.rok);
  const smlouvy = vstup.smlouvy || [];
  const pohyby = vstup.pohyby || [];
  const najemniJednotky = vstup.najemniJednotky || [];
  const dnes = vstup.dnes || new Date().toISOString().slice(0, 10);
  const mesicDnes = dnes.slice(0, 7);

  const najemniSmlouvy = smlouvy.filter((s) => s.Typ === 'Nájem');
  const smlouvyById = new Map(najemniSmlouvy.map((s) => [s.ID, s]));

  // Přijaté nájemní platby = kladná částka, potvrzený trvalý příkaz,
  // navěšený na nájemní smlouvu. Návrhy ("Navrženo - trvalý příkaz") se
  // schválně NEBEROU: nejsou potvrzené, takže je nemá smysl hlásit jako
  // špatně přiřazené - čekají na člověka tak jako tak.
  const platby = pohyby.filter((p) =>
    p.Stav_parovani === 'Trvalý příkaz'
    && parsujCastkuZListu(p.Castka) > 0
    && p.Smlouva_ID
    && smlouvyById.has(p.Smlouva_ID)
    && jeVRoce(p.Datum, rok));

  const nalezy = [];
  const popisSmlouvy = (s) => (s.Druha_strana || '(nájemník nevyplněn)')
    + (s.Cislo_smlouvy ? ' · ' + s.Cislo_smlouvy : '');

  function pridej(nalez) {
    nalezy.push(nalez);
  }

  // --- 1) Smlouva bez nájemní jednotky u rozděleného bytu ----------------
  const jednotkyPodleStrediska = {};
  najemniJednotky.forEach((n) => {
    if (!n.Stredisko) return;
    if (!jednotkyPodleStrediska[n.Stredisko]) jednotkyPodleStrediska[n.Stredisko] = [];
    jednotkyPodleStrediska[n.Stredisko].push(n);
  });

  najemniSmlouvy.forEach((s) => {
    if (String(s.Aktivni || 'ANO').trim() === 'NE') return;
    const jednotky = jednotkyPodleStrediska[s.Stredisko] || [];
    // Nerozdělený byt (0 nebo 1 jednotka) je v pořádku - vyúčtování mu dá
    // celý byt a je to správně.
    if (jednotky.length < 2) return;
    if (s.Najemni_jednotka_ID) return;

    // Návrh dá appka jen tehdy, když zbývá právě jedna jednotka, na kterou
    // žádná jiná smlouva neukazuje. Při dvou volných by to byla hádanka.
    const obsazene = new Set(najemniSmlouvy
      .filter((jina) => jina.Stredisko === s.Stredisko && jina.Najemni_jednotka_ID)
      .map((jina) => jina.Najemni_jednotka_ID));
    const volne = jednotky.filter((n) => !obsazene.has(n.ID));

    pridej({
      typ: 'bez-jednotky',
      zavaznost: 'chyba',
      smlouvaId: s.ID,
      cisloSmlouvy: s.Cislo_smlouvy || '',
      najemnik: s.Druha_strana || '',
      stredisko: s.Stredisko || '',
      popis: 'Byt „' + s.Stredisko + '“ je rozdělený na ' + jednotky.length
        + ' nájemní jednotky, ale smlouva ' + popisSmlouvy(s)
        + ' nemá vybranou žádnou. Vyúčtování jí proto počítá náklady za celý byt.',
      navrh: volne.length === 1
        ? {
          akce: 'nastav-jednotku',
          smlouvaId: s.ID,
          najemniJednotkaId: volne[0].ID,
          popis: 'Přiřadit jednotku ' + (volne[0].Nazev || volne[0].Kod || volne[0].ID),
        }
        : null,
    });
  });

  // --- 2) Částka nesedí na předpis --------------------------------------
  platby.forEach((p) => {
    const s = smlouvyById.get(p.Smlouva_ID);
    const ocekavano = predpisSmlouvy(s);
    if (ocekavano <= 0) return; // smlouva bez předpisu - není proti čemu měřit
    const castka = parsujCastkuZListu(p.Castka);
    if (Math.abs(castka - ocekavano) <= tolerance(ocekavano)) return;

    // Sedí ta částka lépe na jinou smlouvu stejného střediska? Pak je to
    // pravděpodobně přehozené přiřazení a appka umí navrhnout opravu.
    const sourozenci = najemniSmlouvy.filter((jina) =>
      jina.ID !== s.ID
      && jina.Stredisko === s.Stredisko
      && String(jina.Aktivni || 'ANO').trim() !== 'NE'
      && platilaVMesici(jina, mesicZData(p.Datum)));
    const sedici = sourozenci.filter((jina) => {
      const oc = predpisSmlouvy(jina);
      return oc > 0 && Math.abs(castka - oc) <= tolerance(oc);
    });

    pridej({
      typ: 'castka-nesedi',
      zavaznost: 'varovani',
      smlouvaId: s.ID,
      cisloSmlouvy: s.Cislo_smlouvy || '',
      najemnik: s.Druha_strana || '',
      stredisko: s.Stredisko || '',
      pohybId: p.ID,
      datum: p.Datum,
      castka,
      popis: 'Platba ' + p.Datum + ' na ' + Math.round(castka) + ' je přiřazená ke smlouvě '
        + popisSmlouvy(s) + ', jejíž předpis je ' + Math.round(ocekavano) + '.',
      // Pravidlo 1: návrh jen když sedí PRÁVĚ JEDNA jiná smlouva.
      navrh: sedici.length === 1
        ? {
          akce: 'prirad-pohyb',
          pohybId: p.ID,
          smlouvaId: sedici[0].ID,
          popis: 'Přiřadit ke smlouvě ' + popisSmlouvy(sedici[0]),
        }
        : null,
    });
  });

  // --- 3) Platba na smlouvu po platnosti / neaktivní --------------------
  platby.forEach((p) => {
    const s = smlouvyById.get(p.Smlouva_ID);
    const neaktivni = String(s.Aktivni || 'ANO').trim() === 'NE';
    const poPlatnosti = s.Platnost_do && String(p.Datum || '') > String(s.Platnost_do);
    if (!neaktivni && !poPlatnosti) return;

    // Existuje smlouva stejného střediska, která v době platby platila a
    // sedí na ni částka? Pak je to nejspíš platba nového nájemníka.
    const castka = parsujCastkuZListu(p.Castka);
    const nastupci = najemniSmlouvy.filter((jina) =>
      jina.ID !== s.ID
      && jina.Stredisko === s.Stredisko
      && String(jina.Aktivni || 'ANO').trim() !== 'NE'
      && platilaVMesici(jina, mesicZData(p.Datum))
      && predpisSmlouvy(jina) > 0
      && Math.abs(castka - predpisSmlouvy(jina)) <= tolerance(predpisSmlouvy(jina)));

    pridej({
      typ: 'po-platnosti',
      zavaznost: 'chyba',
      smlouvaId: s.ID,
      cisloSmlouvy: s.Cislo_smlouvy || '',
      najemnik: s.Druha_strana || '',
      stredisko: s.Stredisko || '',
      pohybId: p.ID,
      datum: p.Datum,
      castka,
      popis: 'Platba ' + p.Datum + ' je přiřazená ke smlouvě ' + popisSmlouvy(s)
        + (neaktivni ? ', která je označená jako neaktivní.' : ', jejíž platnost skončila ' + s.Platnost_do + '.'),
      navrh: nastupci.length === 1
        ? {
          akce: 'prirad-pohyb',
          pohybId: p.ID,
          smlouvaId: nastupci[0].ID,
          popis: 'Přiřadit ke smlouvě ' + popisSmlouvy(nastupci[0]),
        }
        : null,
    });
  });

  // --- 4) Chybějící a dvojí platba v měsíci -----------------------------
  const pocetVMesici = {};
  platby.forEach((p) => {
    const klic = p.Smlouva_ID + '|' + mesicZData(p.Datum);
    if (!pocetVMesici[klic]) pocetVMesici[klic] = [];
    pocetVMesici[klic].push(p);
  });

  Object.keys(pocetVMesici).forEach((klic) => {
    const skupina = pocetVMesici[klic];
    if (skupina.length < 2) return;
    const s = smlouvyById.get(skupina[0].Smlouva_ID);
    pridej({
      typ: 'dvoji-platba',
      zavaznost: 'varovani',
      smlouvaId: s.ID,
      cisloSmlouvy: s.Cislo_smlouvy || '',
      najemnik: s.Druha_strana || '',
      stredisko: s.Stredisko || '',
      mesic: mesicZData(skupina[0].Datum),
      pohyby: skupina.map((p) => ({ ID: p.ID, datum: p.Datum, castka: parsujCastkuZListu(p.Castka) })),
      popis: 'Smlouva ' + popisSmlouvy(s) + ' má v měsíci ' + mesicZData(skupina[0].Datum)
        + ' přiřazené ' + skupina.length + ' platby. Může jít o doplatek, nebo o omylem zdvojené přiřazení.',
      // Které z těch plateb je ta přebytečná, appka nepozná - obě sedí na
      // stejnou smlouvu. Rozhodnout to musí člověk.
      navrh: null,
    });
  });

  // Chybějící měsíce se hlásí JEDNÍM nálezem na smlouvu, ne jedním na
  // měsíc. Při zkoušce na třech smlouvách vzniklo 16 řádků „chybí platba"
  // a přebily to podstatné - špatně přiřazenou platbu. U deseti bytů za rok
  // by to bylo přes sto řádků. Seznam měsíců je uvnitř nálezu, takže se
  // nic neztratí, jen se to nerozteče.
  najemniSmlouvy.forEach((s) => {
    if (String(s.Aktivni || 'ANO').trim() === 'NE') return;
    if (predpisSmlouvy(s) <= 0) return;

    const chybejici = [];
    for (let m = 1; m <= 12; m += 1) {
      const mesic = rok + '-' + String(m).padStart(2, '0');
      // Budoucí měsíce se nehlásí - nájem za listopad v srpnu chybět má.
      if (mesic > mesicDnes) break;
      if (!platilaVMesici(s, mesic)) continue;
      if (pocetVMesici[s.ID + '|' + mesic]) continue;
      chybejici.push(mesic);
    }
    if (chybejici.length === 0) return;

    pridej({
      typ: 'chybi-platba',
      zavaznost: 'varovani',
      smlouvaId: s.ID,
      cisloSmlouvy: s.Cislo_smlouvy || '',
      najemnik: s.Druha_strana || '',
      stredisko: s.Stredisko || '',
      mesice: chybejici,
      popis: 'Smlouva ' + popisSmlouvy(s) + ' nemá přiřazenou platbu za '
        + chybejici.length + ' ' + (chybejici.length === 1 ? 'měsíc' : (chybejici.length < 5 ? 'měsíce' : 'měsíců'))
        + ': ' + chybejici.join(', ') + '.',
      // Pravidlo 2: chybějící platbu appka nedopočítá. Jestli nájemník
      // nezaplatil, nebo se platba jen nespárovala, appka neví.
      navrh: null,
    });
  });

  // Řazení: napřed chyby, pak varování; uvnitř podle střediska a data, ať
  // je seznam pokaždé stejný a dá se v něm hledat.
  const poradiZavaznosti = { chyba: 0, varovani: 1 };
  nalezy.sort((a, b) => {
    if (poradiZavaznosti[a.zavaznost] !== poradiZavaznosti[b.zavaznost]) {
      return poradiZavaznosti[a.zavaznost] - poradiZavaznosti[b.zavaznost];
    }
    const klicA = (a.stredisko || '') + (a.datum || a.mesic || '');
    const klicB = (b.stredisko || '') + (b.datum || b.mesic || '');
    return klicA < klicB ? -1 : (klicA > klicB ? 1 : 0);
  });

  return {
    rok,
    nalezy,
    prehled: {
      zkontrolovanoPlateb: platby.length,
      zkontrolovanoSmluv: najemniSmlouvy.length,
      chyb: nalezy.filter((n) => n.zavaznost === 'chyba').length,
      varovani: nalezy.filter((n) => n.zavaznost === 'varovani').length,
      sNavrhem: nalezy.filter((n) => n.navrh).length,
    },
  };
}

module.exports = {
  zkontrolujNajmy,
  predpisSmlouvy,
  tolerance,
  platilaVMesici,
};
