/**
 * public/dokumenty.js  (v4.80)
 * Karta bytu a předávací protokol - dokumenty, které appka vytiskne z toho,
 * co o bytu už ví.
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21 poslal čtyři podepsané vzory (dva předávací protokoly na
 * hlavičkovém papíře Century 21, nájemní smlouvu na Schulte Group, starší
 * nájemní smlouvu na Schulte TZB) a napsal: *„tohle jsou vzory pro smlouvy
 * a PP, taky potřebuju kartu bytu, vypsat na PP, kde je vše důležité"*.
 *
 * Na první podobu pak reagoval *„ty karty se mi nelíbí, udělej to graficky
 * jako toto"* a přiložil svůj formulář pro SVJ Holečkova („Párování podle
 * čísel bytů"). Odtud je celá grafika: dvojjazyčné popisky (česky tučně,
 * anglicky kurzívou šedě), černá kolečka s čísly, levandulová pole
 * k vyplnění, vlasové linky místo orámovaných tabulek. Vyměřené barvy
 * a rozměry jsou v style.css v bloku „(v4.80) DOKUMENTY".
 *
 * DVA DOKUMENTY, DVĚ RŮZNÉ OTÁZKY
 *
 *   KARTA BYTU        - „co o tomhle bytu vím?" Jeden list pro Jana. Klíče,
 *                       kódy, WiFi, měřidla i s posledním odečtem, revize,
 *                       nájem. Nikdo ji nepodepisuje. **Jen česky** - Janova
 *                       volba; anglické řádky by ji natáhly na dvojnásobek
 *                       pro čtenáře, který je jeden a mluví česky.
 *   PŘEDÁVACÍ PROTOKOL- „co jsem komu dnes předal?" Dokument pro dva lidi
 *                       a dva podpisy. Struktura je z Janových vzorů:
 *                       1. smluvní strany, 2. specifikace nemovitosti,
 *                       3. předání (měřidla, klíče, vybavení, závady),
 *                       4. prohlášení a podpisy. **Dvojjazyčně** - podepisuje
 *                       ho nájemník, který často česky neumí, a Janův vzor
 *                       od Century 21 sám říká, že byl vyhotoven v české
 *                       a anglické verzi.
 *
 * PRAVIDLO, KTERÉ JE TU DŮLEŽITĚJŠÍ NEŽ KDEKOLI JINDE V APPCE
 *
 * **Co appka neví, nechá k vyplnění.** Nikde nevypíše nulu, pomlčku ani
 * „neuvedeno" tam, kde má být číslo. A rozlišuje dvě věci, které vypadají
 * podobně, ale nejsou totéž:
 *
 *   dokVyplnit()  levandulové pole - appka to NEVÍ, dopisuje se rukou
 *   dokPrazdne()  „(prázdné)" šedě kurzívou - appka VÍ, že tam nic není
 *
 * Ten rozdíl je i v Janově vzoru (schránky bez štítku mají „(prázdné)",
 * schránky nezjištěné mají modré pole) a nesmí se slít do jednoho.
 *
 * Zvlášť to platí u STAVŮ MĚŘIDEL. Appka zná poslední ZAPSANÝ odečet, ale
 * ten je z minula - stav ke dni předání nikdo nezná, dokud se nepodívá na
 * měřidlo. Sloupec „Stav při předání" je proto v protokolu vždycky pole
 * k vyplnění a poslední známý odečet stojí vedle, drobně, i s datem.
 * Předvyplnit ho by znamenalo nabídnout k podpisu číslo, které nikdo
 * neodečetl.
 *
 * PROČ TO NENÍ V app.js
 *
 * Jenom velikost: app.js má přes třináct tisíc řádků a tohle je uzavřený
 * kus, který s ničím jiným nesdílí stav. Používá z app.js `escapeHtml`,
 * `parsujCastkuZListu`, `formatCastkaSMenou`, `zavolejApi` a `APP_VERZE` -
 * je proto načtený AŽ ZA app.js (viz index.html).
 *
 * TISK
 *
 * Dokument se vykreslí do vrstvy přes celou obrazovku a tiskne se
 * `window.print()`. Žádné generování PDF na serveru: prohlížeč umí „Uložit
 * jako PDF" sám, na telefonu i na počítači, a appka tím nezískává
 * závislost, kterou by musela hlídat.
 */

/** Levandulové pole k vyplnění. „Tohle vyplň", ne „tady něco chybí". */
function dokVyplnit() {
  return '<span class="dok-vyplnit"></span>';
}

/** „(prázdné)" - appka VÍ, že tam nic není. Jiná informace než pole výš. */
function dokPrazdne(text) {
  return '<span class="dok-prazdne">(' + escapeHtml(text || 'prázdné') + ')</span>';
}

/**
 * Datum česky: „2026-08-21" -> „21. 8. 2026".
 *
 * Co nevypadá jako datum z tabulky, vrátí se, jak přišlo. Appka ukládá
 * data jako text (viz lib/sheetsHelpers.js) a když si tam někdo napsal
 * „jaro 2025", je to pořád lepší informace než prázdno.
 */
function dokDatum(hodnota) {
  const text = String(hodnota || '').trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return text;
  return Number(m[3]) + '. ' + Number(m[2]) + '. ' + m[1];
}

// Hodnota, nebo pole k vyplnění. Tohle je to pravidlo z hlavičky, zabalené
// do jedné funkce, aby se na něj nedalo zapomenout.
function dokHodnota(hodnota) {
  const text = String(hodnota === null || hodnota === undefined ? '' : hodnota).trim();
  return text ? escapeHtml(text) : dokVyplnit();
}

/**
 * Dvojjazyčný popisek: česky, pod tím anglicky kurzívou šedě.
 *
 * Bez `en` se vypíše jen česky - tak vzniká karta bytu, aniž by pro ni
 * musela existovat druhá sada funkcí.
 */
function dokDvoj(cz, en) {
  return escapeHtml(cz) + (en ? '<em>' + escapeHtml(en) + '</em>' : '');
}

/**
 * Skupinová hlavička nad sloupcem - „PŘEDÁVAJÍCÍ / TRANSFEROR".
 *
 * Na jednom řádku s lomítkem, ne pod sebou: ve vzoru jsou tyhle hlavičky
 * („ZVONEK / DOORBELL") taky jednořádkové a dvouřádková by tu jen tlačila
 * obsah dolů - je to jedno slovo, ne popisek pole.
 */
function dokRole(cz, en) {
  return escapeHtml(cz) + (en ? '<em> / ' + escapeHtml(en) + '</em>' : '');
}

/**
 * Řádek „popisek: hodnota".
 *
 * `vzdyUkazat` = false znamená, že se řádek při prázdné hodnotě vůbec
 * nevykreslí - to je režim karty bytu, kde prázdné řádky jen zabírají
 * místo. V protokolu se naopak ukazují všechny, protože je do nich potřeba
 * dopsat.
 */
function dokPole(popisek, hodnota, vzdyUkazat, popisekEn) {
  const text = String(hodnota === null || hodnota === undefined ? '' : hodnota).trim();
  if (!text && !vzdyUkazat) return '';
  return '<div class="dok-pole"><span class="dok-popisek">' + dokDvoj(popisek, popisekEn)
    + '</span><span class="dok-hodnota">' + dokHodnota(text) + '</span></div>';
}

/**
 * Oddíl s černým kolečkem.
 *
 * `cislo` je nepovinné - karta bytu čísla oddílů nemá (nikdo se na ně
 * neodkazuje), protokol ano (odkazuje se na ně jeho vlastní text).
 */
function dokSekce(cislo, nadpis, nadpisEn, obsah) {
  if (!obsah) return '';
  return '<section class="dok-sekce"><div class="dok-sekce-hlava">'
    + (cislo ? '<span class="dok-cislo">' + escapeHtml(String(cislo)) + '</span>' : '')
    + '<h2>' + escapeHtml(nadpis)
    + (nadpisEn ? ' <span class="dok-h2-en">' + escapeHtml(nadpisEn) + '</span>' : '')
    + '</h2></div>' + obsah + '</section>';
}

function dokPodnadpis(cz, en) {
  return '<h3>' + escapeHtml(cz)
    + (en ? ' <span class="dok-h3-en">' + escapeHtml(en) + '</span>' : '') + '</h3>';
}

/** Hlavička tabulky z dvojic [česky, anglicky]. */
function dokHlavicka(sloupce) {
  return '<thead><tr>' + sloupce.map((s) => '<th>' + dokDvoj(s[0], s[1]) + '</th>').join('')
    + '</tr></thead>';
}

/*
 * Poslední zapsaný odečet měřidla.
 *
 * Řadí se podle data jako text - všechna data v téhle appce jsou
 * RRRR-MM-DD, takže textové porovnání je zároveň chronologické (stejný
 * postup jako v lib/predpisPlateb.js). Odečet bez data se bere jako
 * nejstarší: kdyby vyhrál, appka by u měřidla tvrdila „poslední stav",
 * o kterém neví, kdy vznikl.
 */
function dokPosledniOdecet(odecty, meridloId) {
  const moje = (odecty || []).filter((o) => o.Meridlo_ID === meridloId);
  if (!moje.length) return null;
  return moje.reduce((nej, o) => (String(o.Datum || '') > String(nej.Datum || '') ? o : nej));
}

/*
 * HLAVIČKA SMLUVNÍ STRANY
 *
 * Firma a fyzická osoba mají jiné řádky - viz jeFirma() v
 * lib/pronajimateleSchema.js. Tady je ta úvaha znovu, protože prohlížeč
 * nemůže `require` (celá appka je bez sestavovacího kroku) a duplikát je
 * levnější než sestavovací krok. **Když se změní jeden, musí se změnit
 * druhý** - hlídá to test-v480.js.
 */
function dokJeFirma(p) {
  if (!p) return false;
  const druh = String(p.Druh || '').trim();
  if (druh === 'Firma') return true;
  if (druh === 'Osoba') return false;
  return String(p.ICO || '').trim() !== '';
}

function dokStranaHtml(p, dvoj) {
  const en = (t) => (dvoj ? t : '');

  if (!p) {
    // Bez vybraného pronajímatele se nevymýšlí nic - jen prázdná pole,
    // do kterých se to dopíše.
    return dokPole('Jméno / firma', '', true, en('Name / company'))
      + dokPole('Sídlo / bytem', '', true, en('Registered office / address'))
      + dokPole('IČO', '', true, en('Company ID'))
      + dokPole('E-mail', '', true, en('E-mail'))
      + dokPole('Telefon', '', true, en('Phone'));
  }

  let html = '<div class="dok-strana-nazev">' + dokHodnota(p.Nazev) + '</div>';
  if (dokJeFirma(p)) {
    html += dokPole('Sídlo', p.Sidlo, true, en('Registered office'));
    html += dokPole('IČO', p.ICO, true, en('Company ID'));
    html += dokPole('DIČ', p.DIC, false, en('VAT ID'));
    // Větu kolem spisové značky appka doplní, ale jen když značku má -
    // „zapsaná v obchodním rejstříku pod sp. zn. ………" je věta, která
    // tvrdí zápis a nechává chybět jedinou podstatnou část.
    if (String(p.Spisova_znacka || '').trim()) {
      html += dokPole('Zapsaná v obchodním rejstříku', 'sp. zn. ' + String(p.Spisova_znacka).trim(),
        true, en('Registered in the Commercial Register'));
    }
    html += dokPole('Za společnost jedná', p.Zastoupena, true, en('Represented by'));
  } else {
    html += dokPole('Trvale bytem', p.Sidlo, true, en('Permanent address'));
    html += dokPole('Datum narození', dokDatum(p.Datum_narozeni), true, en('Date of birth'));
  }
  html += dokPole('Bankovní účet', p.Bankovni_ucet, false, en('Bank account'));
  html += dokPole('E-mail', p.Email, false, en('E-mail'));
  html += dokPole('Telefon', p.Telefon, false, en('Phone'));

  // Zástupce (v Janových protokolech makléřka) - jen když má jméno.
  if (String(p.Zastupce_jmeno || '').trim()) {
    html += '<div class="dok-zastupce">'
      + '<div class="dok-role">' + dokRole('v zastoupení', en('represented by')) + '</div>'
      + '<div class="dok-strana-nazev">' + dokHodnota(p.Zastupce_jmeno) + '</div>'
      + dokPole('Trvale bytem', p.Zastupce_adresa, false, en('Permanent address'))
      + dokPole('Datum narození', dokDatum(p.Zastupce_narozeni), false, en('Date of birth'))
      + dokPole('E-mail', p.Zastupce_email, false, en('E-mail'))
      + dokPole('Telefon', p.Zastupce_telefon, false, en('Phone'))
      + '</div>';
  }
  return html;
}

/*
 * SPECIFIKACE NEMOVITOSTI - druhý oddíl Janových protokolů, slovo od slova
 * stejné popisky. „typ budovy: bytový dům" je předtištěné, viz komentář
 * v lib/nemovitostiJednotkySchema.js.
 */
function dokSpecifikaceHtml(j, vzdyUkazat, dvoj) {
  const en = (t) => (dvoj ? t : '');
  return dokPole('Celá adresa', j.Adresa, vzdyUkazat, en('Full address'))
    + dokPole('Katastrální území', j.Katastralni_uzemi, vzdyUkazat, en('Cadastral area'))
    + dokPole('Číslo listu vlastnictví', j.Cislo_LV, vzdyUkazat, en('Title deed no.'))
    + dokPole('Číslo jednotky', j.Cislo_jednotky, vzdyUkazat, en('Unit no.'))
    + dokPole('Dispozice', j.Dispozice, vzdyUkazat, en('Layout'))
    + dokPole('Podlaží', j.Podlazi, vzdyUkazat, en('Floor'))
    + dokPole('V budově č. p.', j.Budova_cp, vzdyUkazat, en('Building no.'))
    + dokPole('Na pozemku p. č.', j.Pozemek_parc_c, vzdyUkazat, en('Land plot no.'))
    + dokPole('Užitná plocha', j.Plocha_m2 ? String(j.Plocha_m2).trim() + ' m²' : '',
      vzdyUkazat, en('Floor area'))
    + dokPole('Příslušenství', j.Prislusenstvi, vzdyUkazat, en('Accessories'));
}

/*
 * KOMU TA POLOŽKA PATŘÍ (v4.82)
 *
 * Klíče i měřidla můžou být buď společné pro celý byt (prázdné
 * `Najemni_jednotka_ID`), nebo patřit jedné nájemní jednotce. Do dokumentu
 * pro nájemníka jednotky 1a patří jeho vlastní věci PLUS ty společné -
 * klíč od vchodu do domu je opravdu obojí.
 *
 * Když se dokument tiskne bez vybrané jednotky (byt na jednotky rozdělený
 * není, nebo se tiskne karta bytu pro Jana), projde všechno. Filtrovat
 * podle jednotky, kterou nikdo nevybral, by znamenalo tiše zahodit řádky.
 */
function patriJednotce(polozka, jednotkaId) {
  if (!jednotkaId) return true;
  const vlastnik = String((polozka && polozka.Najemni_jednotka_ID) || '').trim();
  return !vlastnik || vlastnik === jednotkaId;
}

/*
 * WiFi do dokumentu.
 *
 * Nejdřív ze samotné nájemní jednotky, teprve pak z bytu. Jan 2026-08-21:
 * *„klíče i wifi musí být samostatně k nájemní jednotce"* - Holečkova 1a
 * a 1b mají každá vlastní síť. WiFi na bytu zůstává pro byty, které
 * rozdělené nejsou, a nikam se nemigruje: appka neví, které jednotce
 * jedna společná síť patřila.
 */
function wifiDokumentu(j, najemniJednotka) {
  const n = najemniJednotka || {};
  const sit = String(n.Wifi_sit || '').trim();
  const heslo = String(n.Wifi_heslo || '').trim();
  if (sit || heslo) return { sit, heslo };
  return {
    sit: String((j && j.Wifi_sit) || '').trim(),
    heslo: String((j && j.Wifi_heslo) || '').trim(),
  };
}

/*
 * MĚŘIDLA
 *
 * `proPredani` rozhoduje o tom, jestli je sloupec se stavem pole k vyplnění
 * (protokol), nebo se do něj vypíše poslední známý odečet (karta bytu).
 * Rozbor v hlavičce souboru.
 */
function dokMeridlaHtml(meridla, odecty, proPredani, jednotkaId) {
  const meridlaProDokument = (meridla || []).filter((m) => patriJednotce(m, jednotkaId));
  meridla = meridlaProDokument;
  if (!meridla || !meridla.length) {
    if (!proPredani) return '';
    // V protokolu prázdná tabulka smysl má: měřidla se dopíšou rukou.
    const prazdny = '<tr><td>' + dokVyplnit() + '</td><td>' + dokVyplnit() + '</td><td>'
      + dokVyplnit() + '</td><td>' + dokVyplnit() + '</td></tr>';
    return '<table class="dok-tabulka">'
      + dokHlavicka([['Druh měřidla', 'Meter type'], ['Výrobní číslo', 'Serial no.'],
        ['Stav při předání', 'Reading at handover'], ['Jednotka', 'Unit']])
      + '<tbody>' + prazdny + prazdny + prazdny + '</tbody></table>';
  }

  const radky = meridla.map((m) => {
    const posledni = dokPosledniOdecet(odecty, m.ID);
    const druh = [String(m.Typ || '').trim(), String(m.Popis || '').trim()].filter(Boolean).join(' – ');
    const ean = String(m.EAN_EIC || '').trim();
    const cislo = String(m.Vyrobni_cislo || '').trim()
      ? escapeHtml(String(m.Vyrobni_cislo).trim())
        + (ean ? '<div class="dok-drobne">EAN/EIC: ' + escapeHtml(ean) + '</div>' : '')
      : dokVyplnit();

    let stav;
    if (proPredani) {
      // Pole k vyplnění + poslední známý odečet vedle, drobně.
      stav = dokVyplnit();
      if (posledni) {
        stav += '<div class="dok-drobne">poslední zapsaný: '
          + escapeHtml(String(posledni.Stav || '').trim() || '?')
          + (posledni.Datum ? ' (' + escapeHtml(dokDatum(posledni.Datum)) + ')' : '') + '</div>';
      }
    } else {
      stav = posledni
        ? escapeHtml(String(posledni.Stav || '').trim())
          + (posledni.Datum ? '<div class="dok-drobne">k ' + escapeHtml(dokDatum(posledni.Datum)) + '</div>' : '')
        : dokPrazdne('zatím bez odečtu');
    }

    return '<tr><td>' + (druh ? escapeHtml(druh) : dokVyplnit()) + '</td>'
      + '<td>' + cislo + '</td>'
      + '<td>' + stav + '</td>'
      + '<td>' + dokHodnota(m.Jednotka) + '</td></tr>';
  }).join('');

  const hlavicka = proPredani
    ? dokHlavicka([['Druh měřidla', 'Meter type'], ['Výrobní číslo', 'Serial no.'],
      ['Stav při předání', 'Reading at handover'], ['Jednotka', 'Unit']])
    : dokHlavicka([['Druh měřidla'], ['Výrobní číslo'], ['Poslední odečet'], ['Jednotka']]);

  return '<table class="dok-tabulka">' + hlavicka + '<tbody>' + radky + '</tbody></table>';
}

/*
 * KLÍČE A ČIPY
 *
 * V protokolu je počet předtištěný z evidence, ale je to POČET, KTERÝ
 * APPKA VEDE - ne potvrzení, že se tolik kusů předalo. Proto je vedle
 * prázdný sloupec „předáno ks": co se skutečně přendalo přes stůl, ví
 * jenom ti dva lidé u něj.
 */
function dokKliceHtml(klice, proPredani, jednotkaId) {
  klice = (klice || []).filter((k) => patriJednotce(k, jednotkaId));
  const mam = klice.length > 0;
  if (!mam && !proPredani) return '';

  const hlavicka = proPredani
    ? dokHlavicka([['Druh klíče / čipu', 'Key / fob type'], ['Vedeno ks', 'On record'],
      ['Předáno ks', 'Handed over']])
    : dokHlavicka([['Druh klíče / čipu'], ['Počet ks'], ['Držitel']]);

  let radky;
  if (mam) {
    radky = klice.map((k) => '<tr><td>' + dokHodnota(k.Typ_klice) + '</td>'
      + '<td>' + dokHodnota(k.Pocet_celkem) + '</td>'
      + '<td>' + (proPredani ? dokVyplnit()
        : (String(k.Drzitel || '').trim() ? escapeHtml(String(k.Drzitel).trim()) : dokPrazdne('nikomu nevydáno')))
      + '</td></tr>').join('');
  } else {
    radky = ['', '', ''].map(() => '<tr><td>' + dokVyplnit() + '</td><td>' + dokVyplnit()
      + '</td><td>' + dokVyplnit() + '</td></tr>').join('');
  }

  return '<table class="dok-tabulka">' + hlavicka + '<tbody>' + radky + '</tbody></table>';
}

/*
 * PŘÍSTUPY - WiFi a kódy. Tohle je ta část, kvůli které Jan chtěl kartu
 * bytu „vypsat na PP": co se člověku při převzetí bytu předává kromě klíčů.
 *
 * Do protokolu jdou JEN PLATNÉ kódy. Neplatný kód v předávacím protokolu
 * není informace navíc, je to návod, který nefunguje. Na kartě bytu se
 * ukážou všechny i se stavem - tam je to naopak historie, kterou Jan chce.
 */
function dokPristupyHtml(j, kody, jenPlatne, najemniJednotka) {
  const radky = [];
  const wifi = wifiDokumentu(j, najemniJednotka);
  if (wifi.sit || wifi.heslo) {
    // Síť i heslo patří do JEDNÉ buňky. Kdyby heslo stálo ve třetím
    // sloupci, četlo by se pod hlavičkou „Předáno komu" jako jméno
    // člověka - v protokolu, který někdo podepisuje, je to o jeden
    // překlep od nesmyslu.
    radky.push('<tr><td>WiFi</td><td>síť ' + dokHodnota(wifi.sit)
      + '<br>heslo ' + dokHodnota(wifi.heslo) + '</td><td>'
      + (jenPlatne ? dokVyplnit() : '') + '</td></tr>');
  }
  (kody || []).forEach((k) => {
    const platny = String(k.Stav || '').trim() !== 'Neplatný';
    if (jenPlatne && !platny) return;
    const nazev = [String(k.Nazev || '').trim(), String(k.Umisteni || '').trim()].filter(Boolean).join(' – ');
    radky.push('<tr><td>' + (nazev ? escapeHtml(nazev) : dokVyplnit()) + '</td>'
      + '<td>' + dokHodnota(k.Kod) + '</td>'
      + '<td>' + (jenPlatne ? dokHodnota(k.Predano_komu) : dokHodnota(k.Stav)) + '</td></tr>');
  });

  if (!radky.length) return '';
  const hlavicka = jenPlatne
    ? dokHlavicka([['Co', 'What'], ['Kód / síť', 'Code / network'], ['Předáno komu', 'Handed to']])
    : dokHlavicka([['Co'], ['Kód / síť'], ['Stav']]);
  return '<table class="dok-tabulka">' + hlavicka + '<tbody>' + radky.join('') + '</tbody></table>';
}

/* Prázdné plochy na dopsání - závady, vybavení, poznámky. */
function dokPsaciPlocha(pocet) {
  let html = '<div class="dok-psaci">';
  for (let i = 0; i < pocet; i += 1) html += dokVyplnit();
  return html + '</div>';
}

/* ------------------------------------------------------------------ */
/* KARTA BYTU                                                          */
/* ------------------------------------------------------------------ */

/*
 * Jeden list, na kterém je o bytu všechno, co appka ví. Česky - Janova
 * volba, viz hlavička souboru.
 *
 * Prázdné sekce se NEVYKRESLÍ. Nadpis „Revize" nad prázdnem by tvrdil, že
 * žádné revize nejsou; ve skutečnosti to znamená, že je Jan nezapsal, a to
 * je jiná věc.
 */
function dokumentKartaBytu(ctx) {
  const j = ctx.jednotka;
  const nadpis = String(j.Nazev || '').trim() || String(j.Stredisko || '').trim();

  let html = '<header class="dok-hlavicka">'
    + '<h1>' + dokHodnota(nadpis) + '</h1>'
    + '<div class="dok-nadpis-en">Karta bytu</div>'
    + '<div class="dok-podnadpis">' + escapeHtml([String(j.Stredisko || '').trim(),
      String(j.Adresa || '').trim()].filter(Boolean).join(' · ')) + '</div>'
    + '</header>';

  html += dokSekce('', 'Nemovitost', '', dokSpecifikaceHtml(j, false, false)
    + dokPole('Druh', j.Druh, false)
    + dokPole('Typ vlastnictví', j.Typ_vlastnictvi, false)
    + dokPole('Spoluvlastnický podíl', j.Spoluvlastnicky_podil, false)
    + dokPole('Konstrukce', j.Typ_konstrukce, false)
    + dokPole('Vytápění', j.Vytapeni, false));

  // Nájem. Součet přes víc smluv jen ve shodné měně - stejné pravidlo jako
  // v pásu dlaždic na kartě (viz vykresliPasJednotky v app.js). Korunový
  // a eurový nájem se v téhle appce nesčítá nikde.
  const smlouvy = ctx.smlouvy || [];
  if (smlouvy.length) {
    const radky = smlouvy.map((s) => {
      const mena = s.Mena || 'CZK';
      const najem = parsujCastkuZListu(s.Cisty_najem || s.Ocekavana_castka);
      const zalohy = parsujCastkuZListu(s.Zaloha_na_sluzby);
      const kauce = parsujCastkuZListu(s.Kauce_castka);
      return '<tr><td>' + dokHodnota(s.Druha_strana) + '</td>'
        + '<td>' + (najem ? escapeHtml(formatCastkaSMenou(najem, mena)) : dokVyplnit()) + '</td>'
        + '<td>' + (zalohy ? escapeHtml(formatCastkaSMenou(zalohy, mena)) : dokVyplnit()) + '</td>'
        + '<td>' + (kauce ? escapeHtml(formatCastkaSMenou(kauce, mena)) : dokVyplnit()) + '</td>'
        + '<td>' + escapeHtml([dokDatum(s.Platnost_od), dokDatum(s.Platnost_do)].filter(Boolean).join(' – ')) + '</td></tr>';
    }).join('');
    html += dokSekce('', 'Nájem', '', '<table class="dok-tabulka">'
      + dokHlavicka([['Nájemník'], ['Nájem'], ['Zálohy'], ['Kauce'], ['Platnost']])
      + '<tbody>' + radky + '</tbody></table>');
  }

  /*
   * KAM SE ZA BYT PLATÍ (v4.80)
   *
   * Jen na kartě bytu, NE v předávacím protokolu. Nájemník na účet SVJ
   * neplatí - platí ho Jan. Vytisknout mu ho do protokolu, který
   * podepisuje, by znamenalo dát mu číslo účtu, ke kterému nemá vztah,
   * a vypadalo by to jako pokyn k platbě.
   */
  const platby = dokPole('SVJ', j.SVJ_nazev, false)
    + dokPole('Účet SVJ', j.SVJ_ucet, false)
    + dokPole('Variabilní symbol', j.SVJ_symbol, false);
  html += dokSekce('', 'Kam se za byt platí', '', platby);

  html += dokSekce('', 'Klíče', '', dokKliceHtml(ctx.klice, false));
  html += dokSekce('', 'Přístupy a WiFi', '', dokPristupyHtml(j, ctx.kody, false));

  /*
   * WiFi po nájemních jednotkách (v4.82). Na kartě bytu se vypíšou VŠECHNY -
   * je to interní přehled a Jan potřebuje vidět obě sítě naráz. Do
   * protokolu jde naopak jen ta jedna, která patří předávané jednotce.
   */
  const wifiJednotek = (ctx.najemniJednotky || [])
    .filter((n) => String(n.Wifi_sit || '').trim() || String(n.Wifi_heslo || '').trim());
  if (wifiJednotek.length) {
    const radky = wifiJednotek.map((n) => '<tr><td>' + dokHodnota(n.Nazev || n.Kod) + '</td>'
      + '<td>' + dokHodnota(n.Wifi_sit) + '</td>'
      + '<td>' + dokHodnota(n.Wifi_heslo) + '</td></tr>').join('');
    html += dokSekce('', 'WiFi po jednotkách', '', '<table class="dok-tabulka">'
      + dokHlavicka([['Jednotka'], ['Síť'], ['Heslo']])
      + '<tbody>' + radky + '</tbody></table>');
  }
  html += dokSekce('', 'Měřidla', '', dokMeridlaHtml(ctx.meridla, ctx.odecty, false));

  const revize = ctx.revize || [];
  if (revize.length) {
    const radky = revize.map((r) => '<tr><td>' + dokHodnota(r.Typ_revize) + '</td>'
      + '<td>' + dokHodnota(dokDatum(r.Datum_revize)) + '</td>'
      + '<td>' + dokHodnota(dokDatum(r.Platnost_do)) + '</td></tr>').join('');
    html += dokSekce('', 'Revize', '', '<table class="dok-tabulka">'
      + dokHlavicka([['Typ'], ['Provedena'], ['Platnost do']])
      + '<tbody>' + radky + '</tbody></table>');
  }

  const najemni = ctx.najemniJednotky || [];
  if (najemni.length > 1) {
    const radky = najemni.map((n) => '<tr><td>' + dokHodnota(n.Nazev || n.Kod) + '</td>'
      + '<td>' + dokHodnota(n.Dispozice) + '</td>'
      + '<td>' + dokHodnota(n.Plocha_m2 ? String(n.Plocha_m2).trim() + ' m²' : '') + '</td>'
      + '<td>' + dokHodnota(n.Stav) + '</td></tr>').join('');
    html += dokSekce('', 'Nájemní jednotky', '', '<table class="dok-tabulka">'
      + dokHlavicka([['Jednotka'], ['Dispozice'], ['Plocha'], ['Stav']])
      + '<tbody>' + radky + '</tbody></table>');
  }

  if (String(j.Poznamka || '').trim()) {
    html += dokSekce('', 'Poznámka', '', '<p class="dok-text">' + escapeHtml(String(j.Poznamka).trim()) + '</p>');
  }

  html += '<footer class="dok-paticka">Vytištěno z Nomis Faktury ' + escapeHtml(APP_VERZE)
    + '. Karta je interní přehled – nenahrazuje výpis z katastru ani smlouvu.</footer>';

  return html;
}

/* ------------------------------------------------------------------ */
/* PŘEDÁVACÍ PROTOKOL                                                  */
/* ------------------------------------------------------------------ */

/*
 * Struktura je z Janových vzorů, ne vymyšlená: 1. smluvní strany,
 * 2. specifikace nemovitosti, 3. předání (měřidla, klíče, vybavení,
 * závady), 4. prohlášení a podpisy. Doplněná je jediná sekce - 3.4
 * „Předané přístupy" s WiFi a kódy. To je přesně to, co Jan chtěl:
 * *„vypsat na PP, kde je vše důležité"*. V papírových vzorech se WiFi
 * heslo diktovalo u dveří a nikde nezůstalo.
 *
 * Dvojjazyčně, protože ho podepisuje nájemník - viz hlavička souboru.
 *
 * PŘEBÍRAJÍCÍHO appka vyplní jen jménem ze smlouvy. Adresu, datum
 * narození ani číslo účtu nájemníka nevede - a vymýšlet si je do
 * dokumentu, který někdo podepisuje, nepřipadá v úvahu. Zůstanou pole.
 */
function dokumentPredavaciProtokol(ctx) {
  const j = ctx.jednotka;
  const smlouvy = ctx.smlouvy || [];
  // Protokol se od v4.82 tiskne ke KONKRÉTNÍ smlouvě, když je vybraná -
  // u bytu se dvěma nájemníky by jinak nájemník jednotky 1a dostal na
  // podpis klíče i WiFi heslo od 1b.
  const smlouva = ctx.smlouva || (smlouvy.length === 1 ? smlouvy[0] : null);
  const jednotkaId = ctx.najemniJednotkaId
    || String((smlouva && smlouva.Najemni_jednotka_ID) || '').trim();
  const najemniJednotka = (ctx.najemniJednotky || []).find((n) => n.ID === jednotkaId) || null;

  let html = '<header class="dok-hlavicka">'
    + '<h1>Předávací protokol – předání nemovitosti</h1>'
    + '<div class="dok-nadpis-en">Handover protocol – handover of the property</div>'
    + '<div class="dok-podnadpis">' + escapeHtml([String(j.Nazev || '').trim(),
      najemniJednotka ? 'jednotka ' + (najemniJednotka.Nazev || najemniJednotka.Kod || '') : '',
      String(j.Adresa || '').trim()].filter(Boolean).join(' · ')) + '</div>'
    + '<p class="dok-uvod">Údaje předvyplnila aplikace z evidence. Modrá pole se doplňují při předání.'
    + '<em>The application pre-filled the data from its records. The blue fields are filled in at handover.</em></p>'
    + '</header>';

  // 1. Smluvní strany
  html += dokSekce(1, 'Smluvní strany', 'Contracting parties',
    '<div class="dok-dve-strany">'
    + '<div class="dok-strana"><div class="dok-role">' + dokRole('Předávající', 'Transferor') + '</div>'
    + dokStranaHtml(ctx.pronajimatel, true) + '</div>'
    + '<div class="dok-strana"><div class="dok-role">' + dokRole('Přebírající', 'Transferee') + '</div>'
    + '<div class="dok-strana-nazev">' + dokHodnota(smlouva && smlouva.Druha_strana) + '</div>'
    + dokPole('Trvale bytem', '', true, 'Permanent address')
    + dokPole('Datum narození', '', true, 'Date of birth')
    + dokPole('E-mail', '', true, 'E-mail')
    + dokPole('Telefon', '', true, 'Phone')
    + dokPole('Číslo účtu', '', true, 'Bank account')
    + '</div></div>');

  // 2. Specifikace nemovitosti
  html += dokSekce(2, 'Specifikace nemovitosti', 'Property details',
    dokSpecifikaceHtml(j, true, true)
    + dokPole('Typ budovy', 'bytový dům', true, 'Building type')
    + '<p class="dok-text">Nemovitostí se rozumí výše uvedená nemovitost spolu se všemi '
    + 'součástmi a příslušenstvím (dále jen „Nemovitost").'
    + '<em>The Property means the property specified above together with all its components '
    + 'and accessories (the “Property”).</em></p>');

  // 3. Předání
  // Datum uzavření nájemní smlouvy umí appka od v4.81 vést zvlášť
  // (Smlouvy.Datum_uzavreni) - do té doby tu zůstávalo prázdné pole,
  // protože `Platnost_od` je ZAČÁTEK NÁJMU, ne datum podpisu, a v Janových
  // vzorech se podepisovalo i tři měsíce předem. Když datum uzavření na
  // smlouvě není, pole zůstane prázdné jako dřív - dosadit tam začátek
  // nájmu by znamenalo tvrdit den podpisu, který nikdo nezná.
  const uzavreno = smlouva && String(smlouva.Datum_uzavreni || '').trim();
  const zacatekNajmu = smlouva && String(smlouva.Platnost_od || '').trim();
  let predani = dokPodnadpis('3.1 Předmět předání', 'Subject of the handover')
    + '<p class="dok-text">Předání Nemovitosti dle tohoto protokolu je spojeno s nájmem '
    + 'Nemovitosti. Strany potvrzují, že spolu dne '
    + (uzavreno ? escapeHtml(dokDatum(uzavreno)) : dokVyplnit()) + ' uzavřely nájemní smlouvu '
    + 'k Nemovitosti. Přebírající tímto potvrzuje, že dnešního dne od Předávajícího převzal '
    + 'Nemovitost.'
    + (zacatekNajmu ? ' <span class="dok-drobne">(nájem podle evidence začíná '
      + escapeHtml(dokDatum(zacatekNajmu)) + ')</span>' : '')
    + '<em>The handover of the Property under this protocol relates to the lease of the Property. '
    + 'The parties confirm that they concluded a lease agreement for the Property. The Transferee '
    + 'hereby confirms having taken over the Property from the Transferor today.</em></p>'
    + dokPodnadpis('3.2 Stavy měřidel a energií', 'Meter readings')
    + dokMeridlaHtml(ctx.meridla, ctx.odecty, true, jednotkaId)
    + dokPodnadpis('3.3 Klíče a čipy', 'Keys and fobs')
    + dokKliceHtml(ctx.klice, true, jednotkaId);

  const pristupy = dokPristupyHtml(j, ctx.kody, true, najemniJednotka);
  if (pristupy) {
    predani += dokPodnadpis('3.4 Předané přístupy', 'Access details handed over') + pristupy;
  }

  // Vybavení - z nájemních jednotek, pokud ho tam Jan má popsané.
  const vybaveni = (najemniJednotka ? [najemniJednotka] : (ctx.najemniJednotky || []))
    .map((n) => String(n.Vybaveni || '').trim()).filter(Boolean);
  predani += dokPodnadpis((pristupy ? '3.5' : '3.4') + ' Soupis vybavení', 'Inventory of furnishings');
  predani += vybaveni.length
    ? '<p class="dok-text">' + vybaveni.map((v) => escapeHtml(v)).join('<br>') + '</p>' + dokPsaciPlocha(2)
    : dokPsaciPlocha(5);

  predani += dokPodnadpis((pristupy ? '3.6' : '3.5') + ' Zjištěné závady', 'Defects identified')
    + dokPsaciPlocha(4);

  html += dokSekce(3, 'Předání nemovitosti', 'Handover of the property', predani);

  // 4. Prohlášení a podpisy
  html += '<section class="dok-sekce dok-neroztrhnout"><div class="dok-sekce-hlava">'
    + '<span class="dok-cislo">4</span><h2>Prohlášení a podpisy '
    + '<span class="dok-h2-en">Declarations and signatures</span></h2></div>'
    + '<p class="dok-text">Přebírající prohlašuje, že si předávanou Nemovitost včetně jejího '
    + 'příslušenství a všech součástí před podpisem řádně prohlédl, její technický i právní stav '
    + 'je mu znám a v tomto stavu ji ke dnešnímu dni od Předávajícího přebírá. Předávající '
    + 'prohlašuje, že ke dni podpisu tohoto protokolu Nemovitost není užívána žádnou třetí '
    + 'osobou, byť i bez právního důvodu, a že na Nemovitosti nevaznou žádná práva třetích osob. '
    + 'Výjimkou jsou výše uvedené závady.'
    + '<em>The Transferee declares having duly inspected the Property including all its '
    + 'accessories and components before signing, being aware of its technical and legal '
    + 'condition, and taking it over in that condition today. The Transferor declares that as of '
    + 'the date of signature the Property is not used by any third party and that no third-party '
    + 'rights attach to it, save for the defects listed above.</em></p>'
    + '<p class="dok-text">Tento protokol byl vyhotoven v české a anglické jazykové verzi. '
    + 'V případě jakýchkoli rozporů mezi jazykovými verzemi je rozhodující česká verze.'
    + '<em>This protocol was drawn up in Czech and English. In the event of any discrepancy '
    + 'between the language versions, the Czech version prevails.</em></p>'
    + '<div class="dok-podpisy">'
    + '<div class="dok-podpis"><div class="dok-podpis-mesto">V ' + dokVyplnit() + ' dne ' + dokVyplnit() + '</div>'
    + '<div class="dok-podpis-linka"></div><div class="dok-podpis-popis">Předávající / <em>Transferor</em>'
    + (ctx.pronajimatel ? '<strong>' + escapeHtml(String(ctx.pronajimatel.Nazev || '')) + '</strong>' : '') + '</div></div>'
    + '<div class="dok-podpis"><div class="dok-podpis-mesto">V ' + dokVyplnit() + ' dne ' + dokVyplnit() + '</div>'
    + '<div class="dok-podpis-linka"></div><div class="dok-podpis-popis">Přebírající / <em>Transferee</em>'
    + (smlouva && smlouva.Druha_strana ? '<strong>' + escapeHtml(String(smlouva.Druha_strana)) + '</strong>' : '') + '</div></div>'
    + '</div></section>';

  html += '<footer class="dok-paticka">Vytištěno z Nomis Faktury ' + escapeHtml(APP_VERZE)
    + '. Údaje předvyplnila aplikace z evidence – před podpisem je zkontrolujte.</footer>';

  return html;
}

/* ------------------------------------------------------------------ */
/* NÁJEMNÍ SMLOUVA                                                     */
/* ------------------------------------------------------------------ */

/*
 * ČÁSTKA SLOVY
 *
 * Janova smlouva píše u nájemného i jistoty částku slovy („slovy: dvacet
 * čtyři tisíc korun českých"). Bez toho by tam zůstalo prázdné pole
 * u údaje, který appka zná přesně - a v podepisované smlouvě je slovní
 * vyjádření to, co v případě sporu rozhoduje nad číslicí.
 *
 * Tvary jsou ověřené proti třem jeho smlouvám:
 *   24 000 → „dvacet čtyři tisíc"      (složená číslovka → 2. pád množ. č.)
 *    7 500 → „sedm tisíc pět set"
 *   31 000 → „třicet jedna tisíc"
 * a proto u 2-4 tisíc „dva tisíce", ale u 24 tisíc „dvacet čtyři tisíc".
 *
 * JEN CELÉ KORUNY. Haléře se v nájemních smlouvách nesjednávají a appka
 * je nevymýšlí - částku zaokrouhluje na celé koruny až po kontrole, že
 * žádné desetiny nemá; kdyby měla, vrátí prázdno a do smlouvy se doplní
 * ručně. Vymyslet „padesát haléřů" do podepisovaného dokumentu se nesmí.
 */
const SLOVY_JEDNOTKY = ['nula', 'jedna', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm',
  'osm', 'devět', 'deset', 'jedenáct', 'dvanáct', 'třináct', 'čtrnáct', 'patnáct',
  'šestnáct', 'sedmnáct', 'osmnáct', 'devatenáct'];
const SLOVY_DESITKY = ['', '', 'dvacet', 'třicet', 'čtyřicet', 'padesát', 'šedesát',
  'sedmdesát', 'osmdesát', 'devadesát'];
const SLOVY_STOVKY = ['', 'sto', 'dvě stě', 'tři sta', 'čtyři sta', 'pět set', 'šest set',
  'sedm set', 'osm set', 'devět set'];

function slovyDoTisice(n) {
  const casti = [];
  const stovky = Math.floor(n / 100);
  const zbytek = n % 100;
  if (stovky) casti.push(SLOVY_STOVKY[stovky]);
  if (zbytek < 20) {
    if (zbytek > 0) casti.push(SLOVY_JEDNOTKY[zbytek]);
  } else {
    casti.push(SLOVY_DESITKY[Math.floor(zbytek / 10)]);
    if (zbytek % 10) casti.push(SLOVY_JEDNOTKY[zbytek % 10]);
  }
  return casti.join(' ');
}

function castkaSlovy(castka) {
  const cislo = Number(castka);
  if (!Number.isFinite(cislo) || cislo < 0) return '';
  if (Math.round(cislo) !== cislo) return ''; // haléře - viz komentář výš
  if (cislo === 0) return 'nula korun českých';
  if (cislo >= 1000000000) return '';

  const casti = [];
  const miliony = Math.floor(cislo / 1000000);
  const tisice = Math.floor((cislo % 1000000) / 1000);
  const zbytek = cislo % 1000;

  if (miliony) {
    if (miliony === 1) casti.push('jeden milion');
    else if (miliony < 5) casti.push(slovyDoTisice(miliony) + ' miliony');
    else casti.push(slovyDoTisice(miliony) + ' milionů');
  }
  if (tisice) {
    if (tisice === 1) casti.push('jeden tisíc');
    else if (tisice < 5) casti.push(slovyDoTisice(tisice) + ' tisíce');
    else casti.push(slovyDoTisice(tisice) + ' tisíc');
  }
  if (zbytek) casti.push(slovyDoTisice(zbytek));

  return casti.join(' ') + ' korun českých';
}

/*
 * Částka do smlouvy: „24 000 Kč (slovy: dvacet čtyři tisíc korun českých)".
 *
 * Slovní vyjádření se připojí JEN u korun a jen tehdy, když ho appka umí
 * spolehlivě složit. U eur by „korun českých" byla lež a u částky
 * s haléři výmysl - v obou případech zůstane jen číslice.
 */
function dokCastkaSlovy(hodnota, mena) {
  const castka = parsujCastkuZListu(hodnota);
  if (!castka) return dokVyplnit();
  const cislo = escapeHtml(dokCastkaCislem(castka, mena));
  if ((mena || 'CZK') !== 'CZK') return cislo;
  const slovy = castkaSlovy(castka);
  return slovy ? cislo + ' (slovy: ' + escapeHtml(slovy) + ')' : cislo;
}

/*
 * Částka v podobě, v jaké se píše do smlouvy: „17 000 Kč", ne „17 000,00 Kč".
 *
 * Appka jinde všude tiskne dvě desetinná místa (formatCastkaSMenou) - to je
 * správně u dokladu, kde haléře existují. Nájemné se ale sjednává v celých
 * korunách a „17 000,00 Kč" ve smlouvě vypadá jako výpis z účetnictví.
 * Když částka desetiny opravdu má, appka je vypíše - zaokrouhlit číslo,
 * které někdo podepisuje, se nesmí.
 */
function dokCastkaCislem(castka, mena) {
  const cele = Math.round(castka) === castka;
  const cislo = new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: cele ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(castka);
  const menaText = String(mena || '').trim();
  if (!menaText || menaText.toUpperCase() === 'CZK') return cislo + ' Kč';
  return cislo + ' ' + menaText;
}

/* Očíslovaný odstavec smlouvy. */
function dokOdstavce(vety) {
  return '<ol class="dok-odstavce">' + vety.map((v) => '<li>' + v + '</li>').join('') + '</ol>';
}

/*
 * NÁJEMNÍ SMLOUVA (v4.81)
 *
 * Pevný text je v public/smlouvaText.js - je to doslovný přepis Janovy
 * vlastní smlouvy, ne můj návrh. Tahle funkce do něj jen doplňuje to, co
 * appka ví z evidence: byt, strany, dobu, částky.
 *
 * ČESKY, ne dvojjazyčně - jeho nájemní smlouva česká je (dvojjazyčný je
 * u něj předávací protokol). Rozbor v hlavičce smlouvaText.js.
 *
 * DVĚ VARIANTY, JEDNA ŠABLONA. Jan chtěl *„jedna bude za Nomis Homes
 * a druhá na Jan Bula"*. Neliší se text smlouvy, liší se HLAVIČKA
 * pronajímatele - firma má IČO a jednatele, fyzická osoba datum narození.
 * To už umí dokStranaHtml(), takže dvě varianty nejsou dva dokumenty, ale
 * dva řádky v roletce.
 */
function dokumentNajemniSmlouva(ctx) {
  const j = ctx.jednotka;
  const s = ctx.smlouva || {};
  const mena = s.Mena || 'CZK';
  const T = SMLOUVA_TEXT;

  const adresaBytu = String(j.Adresa || '').trim();

  let html = '<header class="dok-hlavicka">'
    + '<h1>Smlouva o nájmu bytu</h1>'
    + '<div class="dok-podnadpis">' + dokHodnota(adresaBytu) + '</div>'
    + '</header>';

  // 1. Smluvní strany
  html += dokSekce('', 'Smluvní strany', '',
    '<div class="dok-dve-strany">'
    + '<div class="dok-strana"><div class="dok-role">' + dokRole('Pronajímatel') + '</div>'
    + dokStranaHtml(ctx.pronajimatel, false) + '</div>'
    + '<div class="dok-strana"><div class="dok-role">' + dokRole('Nájemce') + '</div>'
    + (ctx.najemce
      ? dokStranaHtml(ctx.najemce, false)
      : '<div class="dok-strana-nazev">' + dokHodnota(s.Druha_strana) + '</div>'
        + dokPole('Sídlo / trvale bytem', '', true)
        + dokPole('IČO / datum narození', '', true)
        + dokPole('E-mail', '', true)
        + dokPole('Telefon', '', true))
    + '</div></div>'
    + '<p class="dok-text">' + escapeHtml(T.uvod) + '</p>'
    + '<p class="dok-text"><strong>Smlouvu o nájmu bytu:</strong></p>');

  // I. Předmět nájmu
  const popisJednotky = 'Bytová jednotka č. ' + dokHodnota(j.Cislo_jednotky)
    + ', nacházející se v podlaží ' + dokHodnota(j.Podlazi)
    + ' budovy č. p. ' + dokHodnota(j.Budova_cp) + ' (dále jen „dům“), postavené na pozemku '
    + 'parc. č. ' + dokHodnota(j.Pozemek_parc_c) + ', číslo LV ' + dokHodnota(j.Cislo_LV)
    + ', katastrální území ' + dokHodnota(j.Katastralni_uzemi)
    + ', na adrese ' + dokHodnota(adresaBytu)
    + (String(j.Prislusenstvi || '').trim()
      ? ', včetně příslušenství: ' + escapeHtml(String(j.Prislusenstvi).trim()) : '')
    + '.';
  html += dokSekce('I', 'Předmět nájmu', '', dokOdstavce([
    'Předmětem nájmu je následující bytová jednotka, jíž je Pronajímatel výlučným vlastníkem:'
      + '<div class="dok-vypis">' + popisJednotky + '</div>'
      + '<div class="dok-drobne">(dále jen „Předmět nájmu“ nebo „Jednotka“ nebo „Bytová '
      + 'jednotka“ nebo „Byt“)</div>'
      + '<div style="margin-top:6px">' + escapeHtml(T.predmetNajmuDodatek) + '</div>',
    'Užitná plocha Bytové jednotky je ' + dokHodnota(j.Plocha_m2 ? String(j.Plocha_m2).trim() + ' m²' : '')
      + '. Fotografie vybavení Bytu jsou součástí předávacího protokolu, který tvoří přílohu '
      + 'č. 1 této smlouvy a je její nedílnou součástí.',
  ]));

  // II. Předmět nájemní smlouvy
  html += dokSekce('II', 'Předmět nájemní smlouvy', '',
    '<p class="dok-text">' + escapeHtml(T.predmetSmlouvy) + '</p>');

  // III. Doba nájmu
  html += dokSekce('III', 'Doba nájmu', '', dokOdstavce([
    'Nájem se uzavírá na dobu určitou, a to od ' + dokHodnota(dokDatum(s.Platnost_od))
      + ' do ' + dokHodnota(dokDatum(s.Platnost_do)) + '.',
    escapeHtml(T.dobaNajmuObnova),
  ]));

  // IV. Nájemné a služby
  const den = String(s.Den_splatnosti || '').trim();
  const predem = String(s.Splatnost_predem || '').trim().toUpperCase() === 'ANO';
  const splatnost = den
    ? 'vždy nejpozději do ' + escapeHtml(den) + '. dne '
      + (predem ? 'předchozího' : 'daného') + ' kalendářního měsíce, k němuž se úhrada vztahuje'
    : 'vždy nejpozději do ' + dokVyplnit() + ' dne měsíce, k němuž se úhrada vztahuje';

  const najemVeta = 'Nájemce se zavazuje platit Pronajímateli nájemné ve výši '
    + dokCastkaSlovy(s.Cisty_najem || s.Ocekavana_castka, mena) + ' měsíčně.'
    + (String(s.Najem_rozpis || '').trim()
      ? ' Nájemné se skládá takto: ' + escapeHtml(String(s.Najem_rozpis).trim()) + '.' : '');

  const zalohyVeta = 'Spolu s nájemným je Nájemce povinen platit zálohy na služby ve výši '
    + dokCastkaSlovy(s.Zaloha_na_sluzby, mena) + ' měsíčně.'
    + (String(s.Zalohy_pausalni || '').trim().toUpperCase() === 'ANO'
      ? ' ' + escapeHtml(T.zalohyPausal) : '')
    + ' ' + escapeHtml(T.zalohyZmena);

  const inflaceOd = String(s.Inflace_od || '').trim();
  const inflaceVeta = 'S účinností k '
    + (inflaceOd ? escapeHtml(dokDatum(inflaceOd)) : dokVyplnit())
    + ' ' + escapeHtml(T.inflacniDolozka);

  html += dokSekce('IV', 'Nájemné a plnění spojená s užíváním Předmětu nájmu', '', dokOdstavce([
    najemVeta,
    escapeHtml(T.sluzbyVycet),
    zalohyVeta,
    'Nájemné a zálohy na služby se platí měsíčně, ' + splatnost + '. '
      + escapeHtml(T.platbaZpusob)
      + (String(s.Variabilni_symbol || '').trim()
        ? ' Variabilní symbol plateb: <strong>' + escapeHtml(String(s.Variabilni_symbol).trim())
          + '</strong>.' : ''),
    escapeHtml(T.poplatkyTV),
    inflaceVeta,
  ]));

  // V. Jistota
  const kauce = parsujCastkuZListu(s.Kauce_castka);
  html += dokSekce('V', 'Jistota', '', dokOdstavce([
    escapeHtml(T.jistotaHlavni) + ' Jistota se sjednává ve výši '
      + (String(s.Kauce_castka || '').trim()
        ? dokCastkaSlovy(kauce === 0 ? '0' : s.Kauce_castka, mena) : dokVyplnit()) + '.',
    escapeHtml(T.jistotaUlozeni),
  ]));

  // VI. Práva a povinnosti - k pevnému textu se přidá odstavec o osobách,
  // ale jen když ho Jan vyplnil.
  const prava = T.pravaPovinnosti.map((v) => escapeHtml(v));
  const osoby = String(s.Osoby || '').trim();
  const pocetOsob = String(s.Pocet_osob || '').trim();
  if (osoby || pocetOsob) {
    prava.splice(3, 0,
      (osoby ? 'Společně s Nájemcem mohou Byt užívat tyto osoby: ' + escapeHtml(osoby) + '. ' : '')
      + (pocetOsob ? 'Přiměřený počet osob pro Byt je ' + escapeHtml(pocetOsob) + '.' : ''));
  }
  html += dokSekce('VI', 'Práva a povinnosti smluvních stran', '', dokOdstavce(prava));

  // VII. Zánik nájmu
  html += dokSekce('VII', 'Zánik nájmu', '',
    dokOdstavce(T.zanikNajmu.map((v) => escapeHtml(v))));

  // VIII. Závěrečná ujednání + podpisy
  html += '<section class="dok-sekce dok-neroztrhnout"><div class="dok-sekce-hlava">'
    + '<span class="dok-cislo">VIII</span><h2>Závěrečná ujednání</h2></div>'
    + dokOdstavce(T.zaverecna.map((v) => escapeHtml(v)))
    + '<div class="dok-podpisy">'
    + '<div class="dok-podpis"><div class="dok-podpis-mesto">V ' + dokVyplnit() + ' dne '
    + (String(s.Datum_uzavreni || '').trim()
      ? escapeHtml(dokDatum(s.Datum_uzavreni)) : dokVyplnit()) + '</div>'
    + '<div class="dok-podpis-linka"></div><div class="dok-podpis-popis">Pronajímatel'
    + (ctx.pronajimatel ? '<strong>' + escapeHtml(String(ctx.pronajimatel.Nazev || '')) + '</strong>' : '')
    + '</div></div>'
    + '<div class="dok-podpis"><div class="dok-podpis-mesto">V ' + dokVyplnit() + ' dne '
    + (String(s.Datum_uzavreni || '').trim()
      ? escapeHtml(dokDatum(s.Datum_uzavreni)) : dokVyplnit()) + '</div>'
    + '<div class="dok-podpis-linka"></div><div class="dok-podpis-popis">Nájemce'
    + '<strong>' + escapeHtml(String((ctx.najemce && ctx.najemce.Nazev) || s.Druha_strana || '')) + '</strong>'
    + '</div></div>'
    + '</div>'
    + '<p class="dok-text" style="margin-top:16px">' + escapeHtml(T.prilohaProtokol) + '</p>'
    + '</section>';

  html += '<footer class="dok-paticka">Vytištěno z Nomis Faktury ' + escapeHtml(APP_VERZE)
    + '. Text smlouvy je přepis vaší vlastní vzorové smlouvy; údaje předvyplnila aplikace '
    + 'z evidence – před podpisem je zkontrolujte.</footer>';

  return html;
}

/* ------------------------------------------------------------------ */
/* DODATEK K NÁJEMNÍ SMLOUVĚ                                           */
/* ------------------------------------------------------------------ */

/*
 * Která pole dodatku jsou ČÁSTKY a která data.
 *
 * V tabulce jsou všechno texty, takže bez tohohle by se do podepisovaného
 * dodatku vytisklo holé „18500" - číslo bez měny, u kterého není poznat,
 * jestli jsou to koruny, nebo eura. A datum by zůstalo v tabulkovém tvaru
 * „2027-01-01" místo „1. 1. 2027".
 */
const POLE_CASTKY = ['Cisty_najem', 'Zaloha_na_sluzby', 'Kauce_castka'];
const POLE_DATA = ['Platnost_od', 'Platnost_do', 'Inflace_od'];

function hodnotaZmeny(pole, hodnota, mena) {
  const text = String(hodnota === null || hodnota === undefined ? '' : hodnota).trim();
  if (!text) return '';
  if (POLE_CASTKY.indexOf(pole) !== -1) {
    const castka = parsujCastkuZListu(text);
    // Nula je platná hodnota (jistota se sjednává i na nulu), ale text,
    // ze kterého nejde přečíst číslo, se radši vypíše, jak je.
    if (castka || text === '0') return dokCastkaCislem(castka, mena);
    return text;
  }
  if (POLE_DATA.indexOf(pole) !== -1) return dokDatum(text);
  return text;
}

/*
 * Struktura je z Janova `dodatek2.pdf` (podepsaný 15. 9. 2025), oddíl po
 * oddílu: 1. smluvní strany, 2. specifikace nemovitosti, 3. prohlášení
 * smluvních stran (odkaz na původní smlouvu), 4. změny nájemní smlouvy,
 * 5. závěrečná ustanovení + podpisy.
 *
 * Česky jako smlouva - dodatek je její součást a jazyk se uprostřed
 * smluvního vztahu nemění.
 *
 * ZMĚNY SE VYPISUJÍ „ZE STAVU DO STAVU". Janův vzor píše jen novou
 * hodnotu („nahrazuje číslo bankovního účtu … nové číslo účtu
 * 60000002/0800"). Appka umí obojí, tak vypíše obojí: co je ve smlouvě
 * teď a co tam má být. Pro toho, kdo dodatek za rok čte, je to ten
 * podstatný rozdíl - a je to zadarmo, protože starou hodnotu appka zná.
 */
function dokumentDodatek(ctx) {
  const j = ctx.jednotka;
  const d = ctx.dodatek || {};
  const s = ctx.smlouva || {};
  const zmeny = ctx.zmenyDodatku || [];

  const cislo = String(d.Cislo_dodatku || '').trim();

  let html = '<header class="dok-hlavicka">'
    + '<h1>Dodatek' + (cislo ? ' č. ' + escapeHtml(cislo) : '') + ' k nájemní smlouvě</h1>'
    + '<div class="dok-podnadpis">' + escapeHtml([String(j.Nazev || '').trim(),
      String(j.Adresa || '').trim()].filter(Boolean).join(' · ')) + '</div>'
    + '</header>';

  // 1. Smluvní strany
  html += dokSekce(1, 'Smluvní strany', '',
    '<div class="dok-dve-strany">'
    + '<div class="dok-strana"><div class="dok-role">' + dokRole('Pronajímatel') + '</div>'
    + dokStranaHtml(ctx.pronajimatel, false) + '</div>'
    + '<div class="dok-strana"><div class="dok-role">' + dokRole('Nájemce') + '</div>'
    + (ctx.najemce
      ? dokStranaHtml(ctx.najemce, false)
      : '<div class="dok-strana-nazev">' + dokHodnota(s.Druha_strana) + '</div>'
        + dokPole('Sídlo / trvale bytem', '', true)
        + dokPole('IČO / datum narození', '', true))
    + '</div></div>');

  // 2. Specifikace nemovitosti
  html += dokSekce(2, 'Specifikace nemovitosti', '',
    dokSpecifikaceHtml(j, true, false)
    + dokPole('Typ budovy', 'bytový dům', true));

  // 3. Prohlášení smluvních stran
  // Datum uzavření původní smlouvy appka zná od v4.81 (Smlouvy.Datum_uzavreni).
  // Když ho nemá, zůstane pole k vyplnění - dosadit tam začátek nájmu by
  // znamenalo tvrdit den podpisu, který nikdo nezná.
  const uzavrena = String(s.Datum_uzavreni || '').trim();
  html += dokSekce(3, 'Prohlášení smluvních stran', '', dokOdstavce([
    'Strany konstatují, že mezi nimi byla dne '
      + (uzavrena ? escapeHtml(dokDatum(uzavrena)) : dokVyplnit())
      + ' uzavřena nájemní smlouva k výše uvedené Nemovitosti (dále jen „Nájemní smlouva“).',
    'Pojmy používané v tomto Dodatku s velkým počátečním písmenem, ale v něm nedefinované, '
      + 'mají význam určený jim v Nájemní smlouvě.',
  ]));

  // 4. Změny
  let obsahZmen;
  if (zmeny.length) {
    const radky = zmeny.map((z) => '<tr><td>' + dokHodnota(z.popis || z.Pole) + '</td>'
      + '<td>' + (String(z.stara || '').trim()
        ? escapeHtml(hodnotaZmeny(z.Pole, z.stara, s.Mena)) : dokPrazdne('dosud nevyplněno')) + '</td>'
      + '<td>' + dokHodnota(hodnotaZmeny(z.Pole, z.nova || z.Nova_hodnota, s.Mena)) + '</td></tr>').join('');
    obsahZmen = '<p class="dok-text">Strany se dohodly na následujících změnách Nájemní smlouvy '
      + 's účinností od '
      + (String(d.Ucinnost_od || '').trim()
        ? escapeHtml(dokDatum(d.Ucinnost_od)) : dokVyplnit()) + ':</p>'
      + '<table class="dok-tabulka">'
      + dokHlavicka([['Co se mění'], ['Dosud'], ['Nově']])
      + '<tbody>' + radky + '</tbody></table>'
      + (zmeny.some((z) => String(z.Popis || '').trim())
        ? '<p class="dok-text">' + zmeny.filter((z) => String(z.Popis || '').trim())
          .map((z) => escapeHtml(String(z.Popis).trim())).join('<br>') + '</p>'
        : '');
  } else {
    // Dodatek bez zapsaných změn se vytiskne s prázdnými řádky - dá se
    // dopsat rukou. Prázdná tabulka bez řádků by vypadala jako chyba.
    obsahZmen = '<p class="dok-text">Strany se dohodly na následujících změnách Nájemní smlouvy '
      + 's účinností od '
      + (String(d.Ucinnost_od || '').trim()
        ? escapeHtml(dokDatum(d.Ucinnost_od)) : dokVyplnit()) + ':</p>'
      + dokPsaciPlocha(4);
  }
  if (String(d.Predmet || '').trim()) {
    obsahZmen = '<p class="dok-text">' + escapeHtml(String(d.Predmet).trim()) + '</p>' + obsahZmen;
  }
  html += dokSekce(4, 'Změny nájemní smlouvy', '', obsahZmen);

  // 5. Závěrečná ustanovení + podpisy
  html += '<section class="dok-sekce dok-neroztrhnout"><div class="dok-sekce-hlava">'
    + '<span class="dok-cislo">5</span><h2>Závěrečná ustanovení</h2></div>'
    + dokOdstavce([
      'Ostatní ujednání Nájemní smlouvy zůstávají tímto Dodatkem nedotčena.',
      'Dodatek nabývá platnosti a účinnosti dne '
        + (String(d.Ucinnost_od || '').trim()
          ? escapeHtml(dokDatum(d.Ucinnost_od)) : dokVyplnit()) + '.',
      'Tento Dodatek je vyhotoven v počtu listinných stejnopisů odpovídajícím počtu smluvních '
        + 'stran. Každá smluvní strana obdrží jeden (1) stejnopis. Je-li Dodatek uzavírán '
        + 'v elektronické formě, každá smluvní strana ho obdrží v elektronické podobě.',
      'Strany prohlašují, že si Dodatek řádně přečetly, seznámily se s jeho obsahem a že '
        + 'vyjadřuje jejich pravou a svobodnou vůli, je uzavírán určitě a vážně a nikoliv za '
        + 'nápadně nevýhodných podmínek, na důkaz čehož připojují své podpisy.',
    ])
    + '<div class="dok-podpisy">'
    + '<div class="dok-podpis"><div class="dok-podpis-mesto">V ' + dokVyplnit() + ' dne '
    + (String(d.Datum_uzavreni || '').trim()
      ? escapeHtml(dokDatum(d.Datum_uzavreni)) : dokVyplnit()) + '</div>'
    + '<div class="dok-podpis-linka"></div><div class="dok-podpis-popis">Pronajímatel'
    + (ctx.pronajimatel ? '<strong>' + escapeHtml(String(ctx.pronajimatel.Nazev || '')) + '</strong>' : '')
    + '</div></div>'
    + '<div class="dok-podpis"><div class="dok-podpis-mesto">V ' + dokVyplnit() + ' dne '
    + (String(d.Datum_uzavreni || '').trim()
      ? escapeHtml(dokDatum(d.Datum_uzavreni)) : dokVyplnit()) + '</div>'
    + '<div class="dok-podpis-linka"></div><div class="dok-podpis-popis">Nájemce'
    + '<strong>' + escapeHtml(String((ctx.najemce && ctx.najemce.Nazev) || s.Druha_strana || '')) + '</strong>'
    + '</div></div>'
    + '</div></section>';

  html += '<footer class="dok-paticka">Vytištěno z Nomis Faktury ' + escapeHtml(APP_VERZE)
    + '. Údaje předvyplnila aplikace z evidence – před podpisem je zkontrolujte.</footer>';

  return html;
}

/*
 * Co v dodatku zůstane prázdné.
 */
function dokumentyDodatekChybejici(ctx) {
  const d = ctx.dodatek || {};
  const s = ctx.smlouva || {};
  const chybi = [];
  const zkontroluj = (podminka, veta) => { if (podminka) chybi.push(veta); };

  zkontroluj(!ctx.pronajimatel, 'Není vybraný pronajímatel – hlavička zůstane prázdná.');
  zkontroluj(!ctx.najemce, 'Nájemce není v číselníku – zůstane jen jméno bez IČ a sídla.');
  zkontroluj(!String(d.Cislo_dodatku || '').trim(), 'Číslo dodatku.');
  zkontroluj(!String(d.Ucinnost_od || '').trim(), 'Od kdy dodatek platí.');
  zkontroluj(!String(d.Datum_uzavreni || '').trim(), 'Datum podpisu dodatku.');
  zkontroluj(!String(s.Datum_uzavreni || '').trim(),
    'Datum uzavření původní smlouvy – doplňte ho na kartě bytu u smlouvy.');
  zkontroluj(!(ctx.zmenyDodatku || []).length, 'Dodatek nemá zapsanou žádnou změnu.');

  return chybi;
}

/* ------------------------------------------------------------------ */
/* CO APPKA NEVÍ                                                       */
/* ------------------------------------------------------------------ */

/*
 * Než se dokument vytiskne, appka řekne, co v něm zůstane prázdné.
 *
 * Bez tohohle by se chybějící údaje poznaly až na papíře - nebo hůř, až
 * když by je někdo podepsal nevyplněné. Vrací seznam vět, ne počet:
 * „chybí 4 údaje" nikomu nepomůže je doplnit.
 */
function dokumentyChybejici(ctx) {
  const j = ctx.jednotka;
  const chybi = [];
  const zkontroluj = (podminka, veta) => { if (podminka) chybi.push(veta); };

  zkontroluj(!ctx.pronajimatel, 'Není vybraný pronajímatel – hlavička zůstane prázdná.');
  zkontroluj(!String(j.Adresa || '').trim(), 'Adresa jednotky.');
  zkontroluj(!String(j.Cislo_jednotky || '').trim(), 'Číslo jednotky podle katastru.');
  zkontroluj(!String(j.Cislo_LV || '').trim(), 'Číslo listu vlastnictví.');
  zkontroluj(!String(j.Katastralni_uzemi || '').trim(), 'Katastrální území.');
  zkontroluj(!(ctx.meridla || []).length, 'Žádná měřidla – tabulka se vytiskne prázdná.');
  zkontroluj(!(ctx.klice || []).length, 'Žádné klíče – tabulka se vytiskne prázdná.');
  zkontroluj(!(ctx.smlouvy || []).length, 'Žádná aktivní nájemní smlouva – přebírající zůstane prázdný.');

  const bezJednotky = (ctx.meridla || []).filter((m) => !String(m.Jednotka || '').trim());
  zkontroluj(bezJednotky.length > 0, bezJednotky.length + '× měřidlo bez jednotky (kWh / m³ / GJ).');

  return chybi;
}

/*
 * Co bude ve SMLOUVĚ prázdné. Jiný seznam než u protokolu - smlouva chce
 * jiné údaje (dobu nájmu, částky, druhou stranu) a protokol jiné (měřidla,
 * klíče).
 */
function dokumentySmlouvaChybejici(ctx) {
  const j = ctx.jednotka;
  const s = ctx.smlouva || {};
  const chybi = [];
  const zkontroluj = (podminka, veta) => { if (podminka) chybi.push(veta); };

  zkontroluj(!ctx.pronajimatel, 'Není vybraný pronajímatel – hlavička zůstane prázdná.');
  zkontroluj(!ctx.najemce, 'Nájemce není v číselníku – ve smlouvě zůstane jen jméno bez IČ a sídla.');
  zkontroluj(!String(s.Platnost_od || '').trim() || !String(s.Platnost_do || '').trim(),
    'Doba nájmu (od–do).');
  zkontroluj(!parsujCastkuZListu(s.Cisty_najem || s.Ocekavana_castka), 'Výše nájemného.');
  zkontroluj(!String(s.Kauce_castka || '').trim(), 'Výše jistoty (kauce).');
  zkontroluj(!String(s.Inflace_od || '').trim(), 'Datum, od kdy jde zvednout nájem o inflaci.');
  zkontroluj(!String(s.Den_splatnosti || '').trim(), 'Den splatnosti nájmu.');
  zkontroluj(!String(j.Cislo_jednotky || '').trim(), 'Číslo jednotky podle katastru.');
  zkontroluj(!String(j.Cislo_LV || '').trim(), 'Číslo listu vlastnictví.');
  zkontroluj(!String(j.Pozemek_parc_c || '').trim(), 'Parcelní číslo pozemku.');
  zkontroluj(!String(j.Plocha_m2 || '').trim(), 'Užitná plocha bytu.');

  return chybi;
}

/* ------------------------------------------------------------------ */
/* VRSTVA A TISK                                                       */
/* ------------------------------------------------------------------ */

/*
 * Vrstva se vytváří až při prvním otevření a pak se recykluje. Tisknout
 * se dá jenom to, co je v DOM - proto ne nové okno: `window.open` na
 * telefonu spadne do blokovaného vyskakovacího okna a Jan appku používá
 * hlavně z telefonu.
 */
function dokumentyVrstva() {
  let vrstva = document.getElementById('dokument-vrstva');
  if (vrstva) return vrstva;

  vrstva = document.createElement('div');
  vrstva.id = 'dokument-vrstva';
  vrstva.className = 'dokument-vrstva skryto';
  vrstva.innerHTML = '<div class="dokument-lista">'
    + '<button type="button" class="dokument-zavrit">Zavřít</button>'
    + '<span class="dokument-nazev"></span>'
    + '<button type="button" class="dokument-tisk">Tisk / PDF</button>'
    + '</div>'
    + '<div class="dokument-upozorneni skryto"></div>'
    + '<div class="dokument-list" id="dokument-list"></div>';
  document.body.appendChild(vrstva);

  vrstva.querySelector('.dokument-zavrit').addEventListener('click', zavriDokument);
  vrstva.querySelector('.dokument-tisk').addEventListener('click', () => window.print());
  // Escape zavírá - vrstva překrývá celou appku a myš na „Zavřít"
  // nemusí být po ruce.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !vrstva.classList.contains('skryto')) zavriDokument();
  });
  return vrstva;
}

function zavriDokument() {
  const vrstva = document.getElementById('dokument-vrstva');
  if (!vrstva) return;
  vrstva.classList.add('skryto');
  document.body.classList.remove('dokument-otevreny');
}

function otevriDokument(nazev, html, chybi) {
  const vrstva = dokumentyVrstva();
  vrstva.querySelector('.dokument-nazev').textContent = nazev;
  vrstva.querySelector('#dokument-list').innerHTML = html;

  const upozorneni = vrstva.querySelector('.dokument-upozorneni');
  if (chybi && chybi.length) {
    upozorneni.innerHTML = '<strong>Tohle appka neví a nechá k vyplnění:</strong>'
      + '<ul>' + chybi.map((v) => '<li>' + escapeHtml(v) + '</li>').join('') + '</ul>';
    upozorneni.classList.remove('skryto');
  } else {
    upozorneni.classList.add('skryto');
  }

  vrstva.classList.remove('skryto');
  // Tělo se zamkne, aby se pod vrstvou nescrollovalo pozadí.
  document.body.classList.add('dokument-otevreny');
  vrstva.scrollTop = 0;
}

/* ------------------------------------------------------------------ */
/* SEZNAM PRONAJÍMATELŮ                                                */
/* ------------------------------------------------------------------ */

let dokumentyPronajimatele = null;

/*
 * Seznam se načte jednou za návštěvu a drží se. Je to pár řádků, které se
 * mění jednou za rok, a karta bytu by jinak volala API pokaždé, když se na
 * ní otevře záložka Dokumenty.
 *
 * Chyba se polkne do prázdného seznamu: chybějící list „Pronajimatele"
 * (tabulka bez nového /api/setup) nesmí shodit kartu bytu. Dokument se
 * vytiskne bez hlavičky a upozornění „Není vybraný pronajímatel" to řekne.
 */
async function nactiPronajimatele() {
  if (dokumentyPronajimatele) return dokumentyPronajimatele;
  try {
    const data = await zavolejApi('/pronajimatele', { method: 'GET' });
    dokumentyPronajimatele = data.pronajimatele || [];
  } catch (e) {
    dokumentyPronajimatele = [];
  }
  return dokumentyPronajimatele;
}

function zapomenPronajimatele() {
  dokumentyPronajimatele = null;
  dokumentyNajemci = null;
}

let dokumentyNajemci = null;

/*
 * Číselník nájemců (v4.81). Stejná úvaha jako u pronajímatelů: načte se
 * jednou a chyba se polkne do prázdna - chybějící list „Najemci" nesmí
 * shodit kartu bytu. Smlouva se pak vytiskne jen se jménem ze smlouvy
 * a upozornění to řekne.
 */
async function nactiNajemce() {
  if (dokumentyNajemci) return dokumentyNajemci;
  try {
    const data = await zavolejApi('/najemci', { method: 'GET' });
    dokumentyNajemci = data.najemci || [];
  } catch (e) {
    dokumentyNajemci = [];
  }
  return dokumentyNajemci;
}

/*
 * Který nájemce patří ke smlouvě.
 *
 * Nejdřív podle `Najemce_ID` (to je odkaz, který Jan nastavil), teprve pak
 * podle SHODY JMÉNA s `Druha_strana`. Ta druhá větev je tu kvůli smlouvám
 * založeným před v4.81, které Najemce_ID nemají - ale shoda musí být
 * PŘESNÁ. „Schulte Group a.s." a „Schulte Group" jsou pro appku dva různí
 * lidé; domýšlet si, že jde o totéž, by znamenalo vytisknout do smlouvy
 * cizí IČO.
 */
function najemceSmlouvy(seznam, smlouva) {
  const vsichni = seznam || [];
  if (!smlouva) return null;
  const id = String(smlouva.Najemce_ID || '').trim();
  if (id) return vsichni.find((n) => n.ID === id) || null;
  const jmeno = String(smlouva.Druha_strana || '').trim();
  if (!jmeno) return null;
  return vsichni.find((n) => String(n.Nazev || '').trim() === jmeno) || null;
}

/*
 * Koho roletka předvybere.
 *
 * Pořadí je: označený výchozí → ten, jehož `Firma` sedí na firmu jednotky →
 * nikdo. Ta prostřední větev je nápověda, ne pravidlo (viz schéma): u bytu
 * evidovaného pod NOMIS & Homes je pronajímatelem obvykle ta firma, ale
 * Jan to musí vidět v roletce a mít možnost přepnout.
 */
function vychoziPronajimatel(seznam, jednotka) {
  const vsichni = seznam || [];
  const oznaceny = vsichni.find((p) => String(p.Vychozi || '').trim().toUpperCase() === 'ANO');
  if (oznaceny) return oznaceny;
  const firma = String((jednotka && jednotka.Firma) || '').trim();
  if (firma) {
    const podleFirmy = vsichni.find((p) => String(p.Firma || '').trim() === firma);
    if (podleFirmy) return podleFirmy;
  }
  return null;
}
