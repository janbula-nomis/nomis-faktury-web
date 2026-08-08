/**
 * lib/predpisPlateb.js
 * Generování předpisu plateb z nájemní smlouvy a návrh rozpadu přijaté
 * platby mezi předpisy (od v4.59).
 *
 * Jan 2026-08-08: *„zajisti aby se nájemní smlouva vytěžila AI a vznikl
 * předpis plateb, včetně kauce, zálohy a to je nutné párovat s bankovními
 * výpisy"*. Volby: předpis **na celou dobu platnosti smlouvy**, kauce jako
 * **vlastní řádek**, a u sloučené platby appka **navrhne rozpad, člověk
 * potvrdí**.
 *
 * Čistý výpočet - nic nezapisuje, nic nečte z Googlu.
 *
 * SMLOUVA NA DOBU NEURČITOU
 *
 * „Na celou dobu platnosti" u smlouvy bez `Platnost_do` nemá konec, takže
 * by generování nikdy neskončilo. Appka proto sáhne po stropu
 * (LET_U_NEURCITE) a řádky vygeneruje na tolik let dopředu. **Není to
 * skryté zkrácení**: funkce vrátí `doKdyVygenerovano` a `jeNeurcita`, aby
 * to appka mohla napsat na obrazovku a nabídnout prodloužení. Tichý strop
 * by byl horší než žádný - za pět let by předpisy prostě přestaly chodit
 * a nikdo by nevěděl proč.
 *
 * DEN SPLATNOSTI
 *
 * Nájem se běžně platí dopředu - typicky do 25. dne PŘEDCHOZÍHO měsíce
 * (Janův vlastní postřeh z rozboru správy nájmů). Proto `Den_splatnosti`
 * a `Splatnost_predem`: u předpisu za červen se splatnost spočítá jako
 * 25. květen. Když smlouva den nemá, appka bere poslední den měsíce, za
 * který se platí - to je nejpozdější možný výklad a nikoho neoznačí za
 * dlužníka dřív, než musí.
 *
 * ROZPAD SLOUČENÉ PLATBY
 *
 * `navrhniRozpadPlatby` řeší případ, který Jan sám popsal: první platba
 * bývá kauce + první nájem v jedné transakci. Návrh vznikne, jen když
 * částka sedí na součet konkrétní kombinace předpisů. Když sedí víc
 * kombinací, rozhoduje jejich SLOŽENÍ: liší-li se jen tím, za který měsíc
 * jsou, vybere se nejstarší nezaplacené; liší-li se částkami nebo typy,
 * **appka nenavrhne nic**. Podrobně u vyberJednoznacnou() níž - napoprvé
 * jsem to měl příliš přísné a pravidlo zabíjelo úplně běžný případ.
 */

const { parsujCastkuZListu } = require('./bankHelpers');

// Kolik let dopředu se generuje u smlouvy na dobu neurčitou.
const LET_U_NEURCITE = 5;

// Tolerance při hledání, na co platba sedí. Držená schválně těsněji než
// tolerance párování na smlouvu (max(100, 10 %)) - u předpisu známe
// PŘESNOU předepsanou částku, ne jen orientační „obvykle se platí".
function tolerancePredpisu(castka) {
  return Math.max(50, Math.abs(castka) * 0.02);
}

function dvojcislo(n) {
  return String(n).padStart(2, '0');
}

// Poslední den měsíce. Nový Date se tu nepoužívá kvůli časovým pásmům -
// počítá se z tabulky délek měsíců s výjimkou pro přestupný rok.
function posledniDenMesice(rok, mesic) {
  const dny = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mesic === 2 && ((rok % 4 === 0 && rok % 100 !== 0) || rok % 400 === 0)) return 29;
  return dny[mesic - 1];
}

/**
 * Splatnost předpisu za daný měsíc.
 *
 * @param {string} obdobi - 'RRRR-MM', za který měsíc se platí
 * @param {string|number} denSplatnosti - den v měsíci, prázdné = poslední den
 * @param {boolean} predem - true = splatnost padne do PŘEDCHOZÍHO měsíce
 */
function splatnostPredpisu(obdobi, denSplatnosti, predem) {
  let rok = parseInt(String(obdobi).slice(0, 4), 10);
  let mesic = parseInt(String(obdobi).slice(5, 7), 10);
  if (!Number.isFinite(rok) || !Number.isFinite(mesic)) return '';

  if (predem) {
    mesic -= 1;
    if (mesic < 1) { mesic = 12; rok -= 1; }
  }

  const posledni = posledniDenMesice(rok, mesic);
  let den = parseInt(String(denSplatnosti || ''), 10);
  if (!Number.isFinite(den) || den < 1) den = posledni;
  // Den 31 v únoru se posune na poslední den, ne na 3. březen.
  if (den > posledni) den = posledni;

  return String(rok) + '-' + dvojcislo(mesic) + '-' + dvojcislo(den);
}

/**
 * Vygeneruje předpisy z nájemní smlouvy.
 *
 * @param {Object} smlouva
 * @param {Object} [moznosti]
 * @param {string} [moznosti.dnes] - RRRR-MM-DD, kvůli testům
 * @returns {{predpisy: Array, jeNeurcita: boolean, doKdyVygenerovano: string,
 *            chyba: string|null}}
 */
function vygenerujPredpisy(smlouva, moznosti) {
  const nast = moznosti || {};
  const dnes = nast.dnes || new Date().toISOString().slice(0, 10);

  if (!smlouva || smlouva.Typ !== 'Nájem') {
    return { predpisy: [], jeNeurcita: false, doKdyVygenerovano: '', chyba: 'Předpis plateb se zakládá jen u smlouvy typu Nájem.' };
  }

  // Bez začátku platnosti není od čeho odpíchnout. Appka si datum
  // nevymyslí - řekne, ať se doplní.
  const platnostOd = String(smlouva.Platnost_od || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(platnostOd)) {
    return { predpisy: [], jeNeurcita: false, doKdyVygenerovano: '', chyba: 'Smlouva nemá vyplněnou platnost od – bez ní nejde předpis plateb založit.' };
  }

  const cistyNajem = parsujCastkuZListu(smlouva.Cisty_najem);
  const zaloha = parsujCastkuZListu(smlouva.Zaloha_na_sluzby);
  const celkemZeSmlouvy = parsujCastkuZListu(smlouva.Ocekavana_castka);
  // Když rozpad chybí (starší smlouvy), spadne se na Ocekavana_castka a
  // celá částka se vede jako nájem. Vyúčtování pak nemá co rozdělovat -
  // je to poctivější než tipnout, kolik z toho byla záloha.
  const najemRadku = cistyNajem > 0 || zaloha > 0 ? cistyNajem : celkemZeSmlouvy;
  const zalohaRadku = cistyNajem > 0 || zaloha > 0 ? zaloha : 0;
  const celkemRadku = najemRadku + zalohaRadku;

  const mena = String(smlouva.Mena || 'CZK').trim() || 'CZK';
  const vs = String(smlouva.Variabilni_symbol || '').trim();
  const denSplatnosti = smlouva.Den_splatnosti;
  const predem = String(smlouva.Splatnost_predem || '').trim().toUpperCase() === 'ANO';

  const predpisy = [];

  // --- Kauce: jednorázový řádek se splatností při zahájení nájmu --------
  const kauce = parsujCastkuZListu(smlouva.Kauce_castka);
  if (kauce > 0) {
    predpisy.push({
      Smlouva_ID: smlouva.ID,
      Najemni_jednotka_ID: smlouva.Najemni_jednotka_ID || '',
      Typ: 'Kauce',
      Obdobi: '',
      Splatnost: String(smlouva.Kauce_splatnost || '').slice(0, 10) || platnostOd,
      Castka_najem: '0',
      Castka_zaloha: '0',
      Castka_celkem: String(kauce),
      Mena: mena,
      Variabilni_symbol: vs,
      Stav: 'Předepsáno',
      Uhrazeno: '',
      Pohyb_ID: '',
      Poznamka: '',
    });
  }

  // --- Nájem: měsíc po měsíci ------------------------------------------
  const platnostDo = String(smlouva.Platnost_do || '').slice(0, 10);
  const jeNeurcita = !/^\d{4}-\d{2}-\d{2}$/.test(platnostDo);

  const zacatek = platnostOd.slice(0, 7);
  let konec;
  if (jeNeurcita) {
    // Strop u doby neurčité. Počítá se od pozdějšího z (začátek smlouvy,
    // dnešek), ať u staré smlouvy nevznikne předpis končící v minulosti.
    const zaklad = platnostOd > dnes ? platnostOd : dnes;
    konec = String(parseInt(zaklad.slice(0, 4), 10) + LET_U_NEURCITE) + '-' + zaklad.slice(5, 7);
  } else {
    konec = platnostDo.slice(0, 7);
  }

  if (celkemRadku > 0 && zacatek <= konec) {
    let rok = parseInt(zacatek.slice(0, 4), 10);
    let mesic = parseInt(zacatek.slice(5, 7), 10);
    // Tvrdá pojistka proti nekonečnému cyklu při nesmyslných datech.
    for (let krok = 0; krok < 12 * (LET_U_NEURCITE + 30); krok += 1) {
      const obdobi = String(rok) + '-' + dvojcislo(mesic);
      if (obdobi > konec) break;
      predpisy.push({
        Smlouva_ID: smlouva.ID,
        Najemni_jednotka_ID: smlouva.Najemni_jednotka_ID || '',
        Typ: 'Nájem',
        Obdobi: obdobi,
        Splatnost: splatnostPredpisu(obdobi, denSplatnosti, predem),
        Castka_najem: String(najemRadku),
        Castka_zaloha: String(zalohaRadku),
        Castka_celkem: String(celkemRadku),
        Mena: mena,
        Variabilni_symbol: vs,
        Stav: 'Předepsáno',
        Uhrazeno: '',
        Pohyb_ID: '',
        Poznamka: '',
      });
      mesic += 1;
      if (mesic > 12) { mesic = 1; rok += 1; }
    }
  }

  return {
    predpisy,
    jeNeurcita,
    doKdyVygenerovano: konec,
    chyba: celkemRadku > 0 ? null : 'Smlouva nemá vyplněnou částku – předpis nájmu nejde spočítat (kauce se založila, pokud byla vyplněná).',
  };
}

/**
 * Návrh, na které předpisy přijatá platba sedí.
 *
 * Zkouší v tomhle pořadí:
 *   1. jeden předpis se sedící částkou
 *   2. dvojice předpisů, jejichž součet sedí (typicky kauce + první nájem)
 *
 * @param {number} castka - přijatá částka
 * @param {Array} predpisy - NEUHRAZENÉ předpisy jedné smlouvy
 * @returns {{predpisy: Array, duvod: string} | null}
 */
function navrhniRozpadPlatby(castka, predpisy) {
  const otevrene = (predpisy || []).filter((p) => {
    const celkem = parsujCastkuZListu(p.Castka_celkem);
    const uhrazeno = parsujCastkuZListu(p.Uhrazeno);
    return celkem > 0 && uhrazeno < celkem && p.Stav !== 'Odpuštěno';
  });
  if (otevrene.length === 0 || !(castka > 0)) return null;

  const sedi = (a, b) => Math.abs(a - b) <= tolerancePredpisu(b);

  // 1) Jeden předpis.
  const jednotlive = otevrene
    .filter((p) => sedi(castka, parsujCastkuZListu(p.Castka_celkem)))
    .map((p) => [p]);
  const zJednoho = vyberJednoznacnou(jednotlive);
  if (zJednoho) return { predpisy: zJednoho, duvod: 'jeden-predpis' };
  // Sedící jednotlivé předpisy se lišily částkou -> je to opravdu
  // nejednoznačné a dvojice by to nezachránily.
  if (jednotlive.length > 0) return null;

  // 2) Dvojice. Kauce + první nájem je ten případ, kvůli kterému to tu je.
  const dvojice = [];
  for (let i = 0; i < otevrene.length; i += 1) {
    for (let j = i + 1; j < otevrene.length; j += 1) {
      const soucet = parsujCastkuZListu(otevrene[i].Castka_celkem) + parsujCastkuZListu(otevrene[j].Castka_celkem);
      if (sedi(castka, soucet)) dvojice.push([otevrene[i], otevrene[j]]);
    }
  }
  const zDvojice = vyberJednoznacnou(dvojice);
  if (zDvojice) return { predpisy: zDvojice, duvod: 'dva-predpisy' };

  return null;
}

/*
 * Ze sedících kombinací vybere tu pravou - nebo nic.
 *
 * Tohle je jemnější, než se na první pohled zdá, a při psaní jsem to měl
 * napoprvé špatně. Původní pravidlo znělo „když sedí víc kombinací,
 * nenavrhuj nic". Jenže u nájmu sedí měsíční platba na KAŽDÝ neuhrazený
 * měsíc - všechny jsou stejné - a pravidlo tím zabilo úplně běžný případ.
 * Stejně tak kauce + první nájem: sedí kauce s lednem, kauce s únorem…
 *
 * Rozlišuje se proto, JAKÁ nejednoznačnost to je:
 *
 *   - Kombinace mají stejné SLOŽENÍ (stejné typy a částky) a liší se jen
 *     tím, za který měsíc jsou. To není nejednoznačnost o tom, co člověk
 *     zaplatil - vybere se nejstarší nezaplacené, což odpovídá i tomu, jak
 *     se plnění běžně započítává (nejdřív nejstarší dluh).
 *   - Kombinace se liší složením (jiné částky/typy). Tady appka opravdu
 *     neví, co člověk platil, a **nenavrhne nic**.
 */
function vyberJednoznacnou(kombinace) {
  if (!kombinace || kombinace.length === 0) return null;

  const tvar = (k) => k
    .map((p) => String(p.Typ) + '|' + parsujCastkuZListu(p.Castka_celkem))
    .sort()
    .join('+');
  const tvary = new Set(kombinace.map(tvar));
  if (tvary.size > 1) return null;

  // Nejstarší nezaplacené: řadí se podle nejpozdější splatnosti v rámci
  // kombinace, ať dvojice s lednem předběhne dvojici s únorem.
  const klic = (k) => k.map((p) => String(p.Splatnost || '')).sort().join('|');
  return kombinace.slice().sort((a, b) => (klic(a) < klic(b) ? -1 : (klic(a) > klic(b) ? 1 : 0)))[0];
}

/**
 * Rozdělí částku mezi vybrané předpisy. Každý dostane nejvýš to, co mu
 * zbývá doplatit; případný přeplatek zůstane nerozdělený, ať se nepřipíše
 * někam, kam nepatří.
 */
function rozdelCastkuNaPredpisy(castka, predpisy) {
  let zbyva = castka;
  const rozdeleno = (predpisy || []).map((p) => {
    const celkem = parsujCastkuZListu(p.Castka_celkem);
    const uhrazeno = parsujCastkuZListu(p.Uhrazeno);
    const chybi = Math.max(0, celkem - uhrazeno);
    const dat = Math.min(chybi, Math.max(0, zbyva));
    zbyva -= dat;
    return { ID: p.ID, castka: Math.round(dat * 100) / 100 };
  });
  return { rozdeleno, nerozdeleno: Math.round(Math.max(0, zbyva) * 100) / 100 };
}

module.exports = {
  LET_U_NEURCITE,
  tolerancePredpisu,
  posledniDenMesice,
  splatnostPredpisu,
  vygenerujPredpisy,
  navrhniRozpadPlatby,
  rozdelCastkuNaPredpisy,
};
