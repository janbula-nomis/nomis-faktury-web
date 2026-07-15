/**
 * public/app.js
 * Jednoduchá vanilla JS aplikace bez build kroku. Stav (token, jméno,
 * firmy, role) se drží v paměti a v localStorage (přežije obnovení
 * stránky) - běžný přístup pro reálně nasazenou webovou appku.
 */

// Zvyšte při každé odeslané aktualizaci appky, ať Jan v appce pozná, jestli
// se mu opravdu nasadila nová verze (zobrazuje se v patičce appky).
const APP_VERZE = 'v3.7.1 – 2026-07-15';

const STAV_KLIC = 'nomisFakturyStav';

let stav = nactiStav();

function nactiStav() {
  try {
    const surova = localStorage.getItem(STAV_KLIC);
    return surova ? JSON.parse(surova) : null;
  } catch (e) {
    return null;
  }
}

function ulozStav(novyStav) {
  stav = novyStav;
  if (novyStav) {
    localStorage.setItem(STAV_KLIC, JSON.stringify(novyStav));
  } else {
    localStorage.removeItem(STAV_KLIC);
  }
}

function jePrihlasen() {
  return !!(stav && stav.token);
}

// ---------- SVĚTLÝ/TMAVÝ REŽIM ----------

const MOTIV_KLIC = 'nomisFakturyMotiv';

function nactiMotiv() {
  try {
    return localStorage.getItem(MOTIV_KLIC) || 'svetly';
  } catch (e) {
    return 'svetly';
  }
}

function aplikujMotiv(motiv) {
  document.documentElement.setAttribute('data-motiv', motiv);
  const tlacitko = document.getElementById('tlacitko-motiv');
  if (tlacitko) {
    tlacitko.textContent = motiv === 'tmavy' ? '☀️' : '🌙';
    tlacitko.setAttribute('aria-pressed', motiv === 'tmavy' ? 'true' : 'false');
  }
}

function prepniMotiv() {
  const aktualni = document.documentElement.getAttribute('data-motiv') === 'tmavy' ? 'tmavy' : 'svetly';
  const novy = aktualni === 'tmavy' ? 'svetly' : 'tmavy';
  try {
    localStorage.setItem(MOTIV_KLIC, novy);
  } catch (e) {
    // localStorage nedostupné (např. soukromý režim) - motiv se prostě
    // příště po obnovení stránky nezapamatuje, appka jinak funguje dál.
  }
  aplikujMotiv(novy);
}

// Aplikováno hned při načtení skriptu (script tag je až na konci <body>,
// takže tlačítko #tlacitko-motiv už v DOM existuje) - ať appka co nejdřív
// vypadá podle uloženého motivu, ne jen na krátký okamžik ve světlém.
aplikujMotiv(nactiMotiv());

async function zavolejApi(cesta, moznosti) {
  const opts = moznosti || {};
  const hlavicky = Object.assign({}, opts.headers || {});
  if (stav && stav.token) hlavicky['Authorization'] = 'Bearer ' + stav.token;
  if (opts.body && !hlavicky['Content-Type']) hlavicky['Content-Type'] = 'application/json';

  const odpoved = await fetch('/api' + cesta, Object.assign({}, opts, { headers: hlavicky }));
  const data = await odpoved.json().catch(() => ({}));

  if (!odpoved.ok) {
    const chyba = new Error(data.error || 'Chyba serveru (' + odpoved.status + ')');
    chyba.data = data; // appka občas potřebuje i další pole z chybové odpovědi (viz např. import bankovního výpisu)
    throw chyba;
  }
  return data;
}

// ---------- PŘIHLÁŠENÍ ----------

async function nactiJmenaProPrihlaseni() {
  const vyber = document.getElementById('vyber-jmeno');
  try {
    const data = await zavolejApi('/login', { method: 'GET' });
    const jmena = (data && data.jmena) || [];
    vyber.innerHTML =
      '<option value="">Vyberte jméno…</option>' +
      jmena.map((j) => '<option value="' + escapeAttr(j) + '">' + escapeHtml(j) + '</option>').join('');
  } catch (e) {
    vyber.innerHTML = '<option value="">Nepodařilo se načíst seznam uživatelů</option>';
  }
}

async function prihlasit() {
  const jmeno = document.getElementById('vyber-jmeno').value;
  const pin = document.getElementById('pole-pin').value.trim();
  const zprava = document.getElementById('login-zprava');
  zprava.innerHTML = '';

  if (!jmeno) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte své jméno.</div>';
    return;
  }
  if (!pin) {
    zprava.innerHTML = '<div class="zprava chyba">Zadejte PIN.</div>';
    return;
  }

  try {
    const data = await zavolejApi('/login', { method: 'POST', body: JSON.stringify({ jmeno, pin }) });
    ulozStav({ token: data.token, jmeno: data.jmeno, firmy: data.firmy, role: data.role });
    document.getElementById('pole-pin').value = '';
    zobrazApp();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

function odhlasit() {
  ulozStav(null);
  zobrazLogin();
  nactiJmenaProPrihlaseni();
}

// ---------- PŘEPÍNÁNÍ POHLEDŮ ----------

function zobrazLogin() {
  document.getElementById('view-login').classList.remove('skryto');
  document.getElementById('view-app').classList.add('skryto');
}

function zobrazApp() {
  document.getElementById('view-login').classList.add('skryto');
  document.getElementById('view-app').classList.remove('skryto');
  const oznaceniRole = stav.role === 'admin' ? ' (admin)' : stav.role === 'ucetni' ? ' (účetní)' : '';
  document.getElementById('jmeno-uzivatele').textContent = stav.jmeno + oznaceniRole;

  const jeAdmin = stav.role === 'admin';
  const jeUcetniNeboAdmin = stav.role === 'admin' || stav.role === 'ucetni';
  document.getElementById('nav-nastaveni').classList.toggle('skryto', !jeAdmin);
  document.getElementById('nav-banka').classList.toggle('skryto', !jeUcetniNeboAdmin);

  prepniZalozku('nahrat');
}

function prepniZalozku(nazev) {
  ['nahrat', 'doklady', 'prehled', 'vydane-faktury', 'banka', 'nastaveni'].forEach((n) => {
    document.getElementById('zalozka-' + n).classList.toggle('skryto', n !== nazev);
  });
  document.querySelectorAll('nav.zalozky button').forEach((btn) => {
    btn.classList.toggle('aktivni', btn.dataset.zalozka === nazev);
  });
  if (nazev === 'doklady') nactiDoklady();
  if (nazev === 'prehled') nactiPrehled();
  if (nazev === 'vydane-faktury') inicializujZalozkuVydaneFaktury();
  if (nazev === 'banka') inicializujZalozkuBanka();
  if (nazev === 'nastaveni') {
    nactiUzivatele();
    nactiFirmy();
    nactiAuta();
    nactiUcty();
  }
}

// ---------- NAHRÁVÁNÍ DOKLADU ----------

let vybranySoubor = null;

// Komprese obrázku / převod na base64 - sdílené jak pro hlavní záložku
// Nahrát doklad, tak pro nahrání nového dokladu rovnou z řádku bankovního
// výpisu (viz ---------- BANKOVNÍ VÝPISY ---------- níže).
async function pripravSouborKNahrani(soubor) {
  if (soubor.type.startsWith('image/')) {
    return zmensiObrazek(soubor, 1600, 0.75);
  }
  return { data: await souborNaBase64(soubor), mimeType: soubor.type, nazev: soubor.name };
}

async function zpracujVybranySoubor(soubor) {
  const zprava = document.getElementById('nahrat-zprava');
  const info = document.getElementById('vybrany-soubor-info');
  zprava.innerHTML = '';
  document.getElementById('tlacitko-nahrat').disabled = true;

  if (!soubor) {
    vybranySoubor = null;
    info.textContent = '';
    return;
  }

  try {
    vybranySoubor = await pripravSouborKNahrani(soubor);
    info.textContent = 'Vybráno: ' + soubor.name;
    document.getElementById('tlacitko-nahrat').disabled = false;
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">Soubor se nepodařilo zpracovat: ' + escapeHtml(e.message) + '</div>';
  }
}

function souborNaBase64(soubor) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Nepodařilo se načíst soubor.'));
    reader.readAsDataURL(soubor);
  });
}

function zmensiObrazek(soubor, maxRozmer, kvalita) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(soubor);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxRozmer || height > maxRozmer) {
        const pomer = Math.min(maxRozmer / width, maxRozmer / height);
        width = Math.round(width * pomer);
        height = Math.round(height * pomer);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      const dataUrl = canvas.toDataURL('image/jpeg', kvalita);
      resolve({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg', nazev: soubor.name.replace(/\.[^.]+$/, '') + '.jpg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Nepodařilo se načíst obrázek.'));
    };
    img.src = url;
  });
}

async function nahratDoklad() {
  const zprava = document.getElementById('nahrat-zprava');
  const tlacitko = document.getElementById('tlacitko-nahrat');
  if (!vybranySoubor) return;

  tlacitko.disabled = true;
  zprava.innerHTML = '<div class="zprava">Nahrávám a zpracovávám (může trvat několik vteřin)…</div>';

  try {
    await zavolejApi('/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: vybranySoubor.nazev,
        mimeType: vybranySoubor.mimeType,
        dataBase64: vybranySoubor.data,
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Doklad byl nahrán a zpracován. Zkontrolujte ho v záložce Doklady.</div>';
    document.getElementById('pole-soubor').value = '';
    document.getElementById('pole-foto').value = '';
    document.getElementById('vybrany-soubor-info').textContent = '';
    vybranySoubor = null;
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  } finally {
    tlacitko.disabled = !vybranySoubor;
  }
}

// ---------- SEZNAM DOKLADŮ ----------

function stavTrida(stavText) {
  if (stavText === 'Schváleno') return 'stav-schvaleno';
  if (stavText === 'Možná duplicita') return 'stav-duplicita';
  return 'stav-ke-kontrole';
}

let autaProVyberSpz = [];
let firmyProVyberDokladu = [];

// Doklady jsou rozdělené na dvě sekce (od v3.7) - "Ke schválení" (Ke
// kontrole + Možná duplicita) a "Schválené" (historie) - ať schválené
// doklady nezůstávají promíchané mezi čekajícími. dokladySeznamAktualni
// drží poslední načtená data, ať přepínání sekcí nemusí pokaždé znovu
// volat API.
let dokladySeznamAktualni = [];
let dokladySekce = 'keSchvaleni';

async function nactiDoklady() {
  const nacitani = document.getElementById('doklady-nacitani');
  const kontejner = document.getElementById('doklady-seznam');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';
  kontejner.innerHTML = '';

  try {
    const [dataDoklady, dataAuta, dataFirmy] = await Promise.all([
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/auta', { method: 'GET' }).catch(() => ({ auta: [] })),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
    ]);
    autaProVyberSpz = dataAuta.auta || [];
    firmyProVyberDokladu = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    nacitani.classList.add('skryto');
    vykresliDoklady(dataDoklady.doklady || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst doklady: ' + e.message;
  }
}

function prepniDokladySekci(sekce) {
  dokladySekce = sekce;
  document.querySelectorAll('.prepinac-sekce-tlacitko').forEach((btn) => {
    btn.classList.toggle('aktivni', btn.dataset.sekce === sekce);
  });
  vykresliDoklady(dokladySeznamAktualni);
}

function moznostiSpz(vybranaSpz) {
  const zname = autaProVyberSpz.some((a) => a.SPZ === vybranaSpz);
  let html = '<option value="">— bez SPZ —</option>';
  autaProVyberSpz.forEach((a) => {
    const oznaceno = a.SPZ === vybranaSpz ? ' selected' : '';
    const popisek = a.SPZ + (a.Model ? ' – ' + a.Model : '');
    html += '<option value="' + escapeAttr(a.SPZ) + '"' + oznaceno + '>' + escapeHtml(popisek) + '</option>';
  });
  if (vybranaSpz && !zname) {
    html += '<option value="' + escapeAttr(vybranaSpz) + '" selected>' + escapeHtml(vybranaSpz) + ' (není v seznamu Auta)</option>';
  }
  return html;
}

// Firma se vybírá z číselníku (list Firmy), ne ručním opisem - jinak by
// se sebemenší překlep (velká/malá písmena, mezera navíc, „&“ vs. „and“...)
// projevil jako appka nenajde odpovídající doklady při párování bankovního
// výpisu (banka.js hledá kandidáty přes přesnou shodu názvu firmy).
function moznostiFirmy(vybranaFirma) {
  const zname = firmyProVyberDokladu.includes(vybranaFirma);
  let html = '<option value="">— vyberte firmu —</option>';
  firmyProVyberDokladu.forEach((nazev) => {
    const oznaceno = nazev === vybranaFirma ? ' selected' : '';
    html += '<option value="' + escapeAttr(nazev) + '"' + oznaceno + '>' + escapeHtml(nazev) + '</option>';
  });
  if (vybranaFirma && !zname) {
    html += '<option value="' + escapeAttr(vybranaFirma) + '" selected>' + escapeHtml(vybranaFirma) + ' (není v seznamu Firmy)</option>';
  }
  return html;
}

// Číselník Středisko - konkrétní auta a nemovitosti skupiny Nomis Group
// (od v3.6, dřív jen obecné "Auta"/"Nemovitosti"). Používá se u Dokladů
// (náklady), proto jsou nemovitosti, kde appka náklady eviduje na celou
// jednotku (Holečkova se rozděluje na nájemníky, ale náklady na byt/garáž
// jako celek nikoli), uvedené v HRUBŠÍM členění než MOZNOSTI_JEDNOTKA níž
// (ta se používá u Vydaných faktur/nájmů, kde se platí zvlášť za 1a/1b apod.).
// Kdyby bylo v budoucnu potřeba, aby si číselník spravoval admin sám, stačí
// tenhle seznam nahradit načtením z Sheets (stejně jako Firmy/Auta).
const MOZNOSTI_STREDISKA = [
  // Auta
  'Auto - Defender',
  'Auto - Porsche 911',
  'Auto - Tesla',
  'Auto - VW Passat',
  'Auto - Audi A5',
  'Auto - Hyundai Kona',
  // Nemovitosti - NOMIS Homes, V Parku 695, Velké Popovice
  'V Parku 695 - byt 45',
  'V Parku 695 - byt 47',
  'V Parku 695 - byt 49',
  'V Parku 695 - byt 51',
  'V Parku 695 - byt 52',
  'V Parku 695 - byt 53',
  'V Parku 695 - byt 54',
  // Nemovitosti - NOMIS CZ, Hagibor
  'Ramonova 3466/4 (Hagibor)',
  // Nemovitosti - FO, Holečkova (náklady appka eviduje na celou jednotku,
  // ne rozdělené na 1a/1b/7a/7b - viz komentář výš)
  'Holečkova 1',
  'Holečkova 7',
  'Holečkova 9',
  'Holečkova - garáž',
];

// Číselník Jednotka (od v3.6) - u Vydaných faktur/nájmů, kde se u Holečkova
// platí zvlášť za 1a/1b/7a/7b (na rozdíl od Středisko výš, kde jsou náklady
// na celou jednotku 1/7). U V Parku a Hagiboru je to stejná granularita
// jako Středisko (jeden nájemník na byt).
const MOZNOSTI_JEDNOTKA = [
  'V Parku 695 - byt 45',
  'V Parku 695 - byt 47',
  'V Parku 695 - byt 49',
  'V Parku 695 - byt 51',
  'V Parku 695 - byt 52',
  'V Parku 695 - byt 53',
  'V Parku 695 - byt 54',
  'Ramonova 3466/4 (Hagibor)',
  'Holečkova 1a',
  'Holečkova 1b',
  'Holečkova 7a',
  'Holečkova 7b',
  'Holečkova 9',
  'Holečkova - garáž',
];

function moznostiStrediska(vybrane) {
  let html = '<option value="">— bez střediska —</option>';
  MOZNOSTI_STREDISKA.forEach((s) => {
    const oznaceno = s === vybrane ? ' selected' : '';
    html += '<option value="' + escapeAttr(s) + '"' + oznaceno + '>' + escapeHtml(s) + '</option>';
  });
  if (vybrane && !MOZNOSTI_STREDISKA.includes(vybrane)) {
    html += '<option value="' + escapeAttr(vybrane) + '" selected>' + escapeHtml(vybrane) + '</option>';
  }
  return html;
}

function vykresliDoklady(doklady) {
  dokladySeznamAktualni = doklady;
  const kontejner = document.getElementById('doklady-seznam');

  const keSchvaleniPocet = doklady.filter((d) => d.Stav !== 'Schváleno').length;
  const schvalenePocet = doklady.filter((d) => d.Stav === 'Schváleno').length;
  document.getElementById('dokl-sekce-ke-schvaleni').textContent = 'Ke schválení (' + keSchvaleniPocet + ')';
  document.getElementById('dokl-sekce-schvalene').textContent = 'Schválené (' + schvalenePocet + ')';

  const filtrovane = doklady.filter((d) =>
    dokladySekce === 'schvalene' ? d.Stav === 'Schváleno' : d.Stav !== 'Schváleno'
  );
  const serazene = filtrovane.slice().sort((a, b) => (b.Datum_zpracovani || '').localeCompare(a.Datum_zpracovani || ''));

  kontejner.innerHTML = '';
  serazene.forEach((d) => kontejner.appendChild(vytvorRadekDoklad(d)));

  if (serazene.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">' +
      (dokladySekce === 'schvalene' ? 'Zatím žádné schválené doklady.' : 'Nic ke schválení.') +
      '</div>';
  }
}

// Skládací řádek Dokladu (od v3.7, stejný vzor jako vytvorRadekBanka níž) -
// sbaleně jen základní info, rozkliknutím se otevřou editovatelná pole
// (viz vytvorDetailDoklad).
function vytvorRadekDoklad(d) {
  const radek = document.createElement('div');
  radek.className = 'doklad-radek radek-' + stavTrida(d.Stav);

  const hlava = document.createElement('div');
  hlava.className = 'doklad-radek-hlava';
  hlava.innerHTML =
    '<span class="doklad-sipka">▶</span>' +
    '<span class="stav-chip ' + stavTrida(d.Stav) + '">' + escapeHtml(d.Stav || '') + '</span>' +
    '<span class="dodavatel">' + escapeHtml(d.Dodavatel || '(bez dodavatele)') + '</span>' +
    '<span>' + escapeHtml(d.Datum_dokladu || '') + '</span>' +
    '<span class="castka">' + formatCastka(d.Castka) + '</span>';

  const detail = document.createElement('div');
  detail.className = 'doklad-radek-detail';

  hlava.addEventListener('click', () => {
    radek.classList.toggle('rozbaleno');
    if (radek.classList.contains('rozbaleno') && !radek.dataset.naplneno) {
      radek.dataset.naplneno = '1';
      detail.appendChild(vytvorDetailDoklad(d));
    }
  });

  radek.appendChild(hlava);
  radek.appendChild(detail);
  return radek;
}

function vytvorDetailDoklad(d) {
  const wrap = document.createElement('div');

  const labelDodavatel = document.createElement('label');
  labelDodavatel.textContent = 'Dodavatel';
  const vstupDodavatel = document.createElement('input');
  vstupDodavatel.type = 'text';
  vstupDodavatel.value = d.Dodavatel || '';
  wrap.appendChild(labelDodavatel);
  wrap.appendChild(vstupDodavatel);
  if (d.Poznamka) {
    const poznamkaDiv = document.createElement('div');
    poznamkaDiv.className = 'poznamka-dokladu';
    poznamkaDiv.textContent = 'ⓘ ' + d.Poznamka;
    wrap.appendChild(poznamkaDiv);
  }

  const labelDatum = document.createElement('label');
  labelDatum.textContent = 'Datum dokladu';
  const vstupDatum = document.createElement('input');
  vstupDatum.type = 'date';
  vstupDatum.value = d.Datum_dokladu || '';
  wrap.appendChild(labelDatum);
  wrap.appendChild(vstupDatum);

  const labelCastka = document.createElement('label');
  labelCastka.textContent = 'Částka a měna';
  const vstupCastka = document.createElement('input');
  vstupCastka.type = 'number';
  vstupCastka.step = '0.01';
  // <input type="number"> vyžaduje tečku jako oddělovač desetin - kdyby
  // Sheets vrátilo českou čárku (viz parsujCastkuZListu výše), input by
  // hodnotu tiše nepřijal a zobrazil by se prázdný. Proto normalizace přes
  // parsujCastkuZListu, ne přímo d.Castka.
  vstupCastka.value = d.Castka !== undefined && d.Castka !== '' ? parsujCastkuZListu(d.Castka) : '';
  vstupCastka.style.marginBottom = '6px';
  const vstupMena = document.createElement('input');
  vstupMena.type = 'text';
  vstupMena.value = d.Mena || '';
  vstupMena.style.maxWidth = '90px';
  wrap.appendChild(labelCastka);
  wrap.appendChild(vstupCastka);
  wrap.appendChild(vstupMena);

  const labelFirma = document.createElement('label');
  labelFirma.textContent = 'Firma';
  const vstupFirma = document.createElement('select');
  vstupFirma.innerHTML = moznostiFirmy(d.Firma_potvrzena || d.Firma_AI_odhad || '');
  wrap.appendChild(labelFirma);
  wrap.appendChild(vstupFirma);

  const labelKategorie = document.createElement('label');
  labelKategorie.textContent = 'Kategorie';
  const vstupKategorie = document.createElement('input');
  vstupKategorie.type = 'text';
  vstupKategorie.value = d.Kategorie || '';
  wrap.appendChild(labelKategorie);
  wrap.appendChild(vstupKategorie);

  const labelStredisko = document.createElement('label');
  labelStredisko.textContent = 'Středisko';
  const vstupStredisko = document.createElement('select');
  vstupStredisko.innerHTML = moznostiStrediska(d.Stredisko || '');
  wrap.appendChild(labelStredisko);
  wrap.appendChild(vstupStredisko);

  const labelSpz = document.createElement('label');
  labelSpz.textContent = 'SPZ';
  const vstupSpz = document.createElement('select');
  vstupSpz.innerHTML = moznostiSpz(d.SPZ_auta || '');
  wrap.appendChild(labelSpz);
  wrap.appendChild(vstupSpz);

  // Doklad zaplacený hotově nebo soukromou kartou nikdy nebude mít
  // protějšek v Bankovních výpisech (tam appka páruje jen odchozí platby
  // z firemního účtu) - tenhle příznak to u dokladu rovnou zviditelní,
  // ať účetní ví, že na bankovní pohyb u něj nemá čekat.
  const labelMimoUcet = document.createElement('label');
  labelMimoUcet.style.display = 'flex';
  labelMimoUcet.style.alignItems = 'center';
  labelMimoUcet.style.gap = '8px';
  const vstupMimoUcet = document.createElement('input');
  vstupMimoUcet.type = 'checkbox';
  vstupMimoUcet.checked = String(d.Hrazeno_mimo_ucet || '').trim() === 'ANO';
  vstupMimoUcet.title = 'Hrazeno hotově nebo soukromou kartou (nečekat na spárování s bankovním výpisem)';
  labelMimoUcet.appendChild(vstupMimoUcet);
  labelMimoUcet.appendChild(document.createTextNode('Mimo účet (hotově/soukromou kartou)'));
  wrap.appendChild(labelMimoUcet);

  if (d.Zdrojovy_soubor_URL) {
    const souborDiv = document.createElement('div');
    souborDiv.style.marginTop = '12px';
    souborDiv.innerHTML = 'Soubor: <a href="' + escapeAttr(d.Zdrojovy_soubor_URL) + '" target="_blank" rel="noopener">otevřít</a>';
    wrap.appendChild(souborDiv);
  }

  function ziskejZmeny() {
    return {
      Dodavatel: vstupDodavatel.value.trim(),
      Datum_dokladu: vstupDatum.value,
      Castka: vstupCastka.value,
      Mena: vstupMena.value.trim(),
      Firma_potvrzena: vstupFirma.value.trim(),
      Kategorie: vstupKategorie.value.trim(),
      Stredisko: vstupStredisko.value.trim(),
      SPZ_auta: vstupSpz.value.trim(),
      Hrazeno_mimo_ucet: vstupMimoUcet.checked ? 'ANO' : '',
    };
  }

  const akce = document.createElement('div');
  akce.className = 'radek-akci';

  const tlacitkoUlozit = document.createElement('button');
  tlacitkoUlozit.className = 'maly sekundarni';
  tlacitkoUlozit.textContent = 'Uložit';
  tlacitkoUlozit.onclick = () => ulozZmenu(d.ID, ziskejZmeny(), tlacitkoUlozit);
  akce.appendChild(tlacitkoUlozit);

  if (d.Stav !== 'Schváleno') {
    const tlacitkoSchvalit = document.createElement('button');
    tlacitkoSchvalit.className = 'maly';
    tlacitkoSchvalit.textContent = 'Schválit';
    tlacitkoSchvalit.onclick = () => ulozZmenu(
      d.ID,
      Object.assign(ziskejZmeny(), { Stav: 'Schváleno' }),
      tlacitkoSchvalit
    );
    akce.appendChild(tlacitkoSchvalit);
  }

  const tlacitkoSmazat = document.createElement('button');
  tlacitkoSmazat.className = 'maly sekundarni';
  tlacitkoSmazat.textContent = 'Smazat';
  tlacitkoSmazat.onclick = () => smazDoklad(d.ID, d.Dodavatel, tlacitkoSmazat);
  akce.appendChild(tlacitkoSmazat);

  wrap.appendChild(akce);

  return wrap;
}

let dokladyZpravaTimeout = null;

function zobrazZpravuDoklady(text) {
  const zprava = document.getElementById('doklady-zprava');
  if (!zprava) return;
  zprava.textContent = text;
  zprava.classList.toggle('skryto', !text);
  if (dokladyZpravaTimeout) clearTimeout(dokladyZpravaTimeout);
  if (text) {
    dokladyZpravaTimeout = setTimeout(() => {
      zprava.textContent = '';
      zprava.classList.add('skryto');
    }, 5000);
  }
}

async function ulozZmenu(id, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/doklady', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    // Optimistická aktualizace: promítneme změnu rovnou do lokálního seznamu
    // a překreslíme z něj, místo abychom hned volali nactiDoklady() (nový GET).
    // Google Sheets API má po zápisu krátké okno eventual-consistency, kdy by
    // okamžitý GET mohl vrátit ještě starou hodnotu Stav - to způsobovalo, že
    // se schválený doklad po Schválit nepřesunul do sekce "Schválené".
    const idx = dokladySeznamAktualni.findIndex((d) => d.ID === id);
    if (idx !== -1) {
      Object.assign(dokladySeznamAktualni[idx], zmeny);
    }
    vykresliDoklady(dokladySeznamAktualni);
    zobrazZpravuDoklady(
      zmeny.Stav === 'Schváleno' ? 'Doklad schválen – najdete ho v sekci Schválené.' : 'Změna uložena.'
    );
  } catch (e) {
    alert('Nepodařilo se uložit změnu: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazDoklad(id, dodavatel, tlacitko) {
  if (!confirm('Opravdu smazat doklad „' + (dodavatel || '(bez dodavatele)') + '“? Tuhle akci nejde vrátit zpět.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/doklady?id=' + encodeURIComponent(id), { method: 'DELETE' });
    dokladySeznamAktualni = dokladySeznamAktualni.filter((d) => d.ID !== id);
    vykresliDoklady(dokladySeznamAktualni);
    zobrazZpravuDoklady('Doklad smazán.');
  } catch (e) {
    alert('Nepodařilo se smazat doklad: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- PŘEHLED ----------

async function nactiPrehled() {
  const nacitani = document.getElementById('prehled-nacitani');
  const obsah = document.getElementById('prehled-obsah');
  nacitani.textContent = 'Načítám…';
  obsah.classList.add('skryto');

  try {
    const data = await zavolejApi('/dashboard', { method: 'GET' });
    nacitani.classList.add('skryto');
    obsah.classList.remove('skryto');

    document.getElementById('prehled-pocet').textContent = 'Celkem dokladů: ' + data.pocetDokladu;
    vykresliSouhrn('souhrn-firmy', data.souhrnPodleFirmy);
    vykresliSouhrn('souhrn-kategorie', data.souhrnPodleKategorie);
    vykresliSouhrn('souhrn-mesic', data.souhrnPodleMesice);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst přehled: ' + e.message;
  }
}

function vykresliSouhrn(idKontejneru, souhrn) {
  const kontejner = document.getElementById(idKontejneru);
  kontejner.innerHTML = '';

  const zaznamy = Object.entries(souhrn || {}).sort((a, b) => b[1] - a[1]);
  if (zaznamy.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">Zatím žádná data.</div>';
    return;
  }

  zaznamy.forEach(([klic, hodnota]) => {
    const div = document.createElement('div');
    div.className = 'polozka-souhrn';
    div.innerHTML = '<span>' + escapeHtml(klic) + '</span><strong>' + formatCastka(hodnota) + '</strong>';
    kontejner.appendChild(div);
  });
}

// Appka čte listy v Sheets, kde se čísla vrací naformátovaná přesně tak, jak
// je appka vidí v UI Sheets (viz stejná poznámka v lib/bankHelpers.js na
// backendu - tahle funkce je záměrně její duplicitou, appka nemá build krok,
// takže frontend si lib/ soubory nemůže naimportovat). U celého čísla to
// náhodou vypadá jako platný JS zápis ("-1717"), ale desetinné číslo se
// v české lokalizaci zobrazí s ČÁRKOU misto tečky (např. "-2029,91") - obyčejné
// Number() by na tom selhalo a appka by ukázala "NaN Kč" místo částky.
function parsujCastkuZListu(hodnota) {
  if (typeof hodnota === 'number') return Number.isFinite(hodnota) ? hodnota : 0;
  if (hodnota === null || hodnota === undefined || hodnota === '') return 0;
  const normalizovano = String(hodnota).trim().replace(/\s/g, '').replace(',', '.');
  const cislo = Number(normalizovano);
  return Number.isFinite(cislo) ? cislo : 0;
}

function formatCastka(hodnota) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(parsujCastkuZListu(hodnota)) + ' Kč';
}

// ---------- VYDANÉ FAKTURY ----------
// Evidence faktur, které firmy skupiny Nomis Group vystavují odběratelům -
// samostatná záložka, oddělená od Dokladů (to jsou přijaté faktury/účtenky).

let vfFirmySeznam = [];
let vfFakturySeznam = [];

async function inicializujZalozkuVydaneFaktury() {
  const seznamJednotek = document.getElementById('seznam-jednotek');
  if (seznamJednotek && seznamJednotek.children.length === 0) {
    seznamJednotek.innerHTML = MOZNOSTI_JEDNOTKA
      .map((j) => '<option value="' + escapeAttr(j) + '"></option>')
      .join('');
  }

  if (vfFirmySeznam.length === 0) {
    try {
      const data = await zavolejApi('/firmy', { method: 'GET' });
      vfFirmySeznam = (data.firmy || []).map((f) => f.Nazev).filter(Boolean);
    } catch (e) {
      document.getElementById('vf-nacitani').textContent = 'Nepodařilo se načíst seznam firem: ' + e.message;
      return;
    }
    const moznosti = vfFirmySeznam.map((n) => '<option value="' + escapeAttr(n) + '">' + escapeHtml(n) + '</option>').join('');
    document.getElementById('vf-firma').innerHTML = moznosti;
    document.getElementById('vf-filtr-firma').innerHTML = '<option value="">Všechny firmy</option>' + moznosti;
  }

  await nactiVydaneFaktury();
}

async function nactiVydaneFaktury() {
  const nacitani = document.getElementById('vf-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/vydaneFaktury', { method: 'GET' });
    vfFakturySeznam = data.faktury || [];
    nacitani.classList.add('skryto');
    vykresliVydaneFaktury();
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst vydané faktury: ' + e.message;
  }
}

// Faktura je "po splatnosti" jen odvozeně (podle dnešního data), ne jako
// samostatně uložený stav - appka to nepřepočítává na pozadí, jen při
// vykreslení seznamu.
function vfJePoSplatnosti(f) {
  if (f.Stav !== 'Neuhrazeno' || !f.Datum_splatnosti) return false;
  return f.Datum_splatnosti < new Date().toISOString().slice(0, 10);
}

function vfStavRadekTrida(f) {
  if (f.Stav === 'Uhrazeno') return 'stav-radek-vf-uhrazeno';
  if (vfJePoSplatnosti(f)) return 'stav-radek-vf-posplatnosti';
  return 'stav-radek-vf-neuhrazeno';
}

function vfStavText(f) {
  if (f.Stav === 'Uhrazeno') return 'Uhrazeno';
  if (vfJePoSplatnosti(f)) return 'Po splatnosti';
  return 'Neuhrazeno';
}

function vykresliVydaneFaktury() {
  const telo = document.getElementById('tabulka-vf-telo');
  const souhrn = document.getElementById('vf-souhrn');
  const filtrFirma = document.getElementById('vf-filtr-firma').value;
  telo.innerHTML = '';

  const filtrovane = vfFakturySeznam.filter((f) => !filtrFirma || f.Firma === filtrFirma);

  const uhrazeno = filtrovane.filter((f) => f.Stav === 'Uhrazeno').length;
  const poSplatnosti = filtrovane.filter((f) => vfJePoSplatnosti(f)).length;
  const neuhrazeno = filtrovane.length - uhrazeno - poSplatnosti;
  const soucetNeuhrazeno = filtrovane
    .filter((f) => f.Stav !== 'Uhrazeno')
    .reduce((soucet, f) => soucet + parsujCastkuZListu(f.Castka), 0);
  souhrn.textContent =
    uhrazeno + ' uhrazeno, ' + neuhrazeno + ' neuhrazeno, ' + poSplatnosti + ' po splatnosti ' +
    '(nezaplaceno celkem ' + formatCastka(soucetNeuhrazeno) + ')';

  const serazene = filtrovane.slice().sort((a, b) => (b.Datum_vystaveni || '').localeCompare(a.Datum_vystaveni || ''));

  serazene.forEach((f) => {
    const tr = document.createElement('tr');
    tr.className = vfStavRadekTrida(f);
    tr.innerHTML =
      '<td data-label="Firma">' + escapeHtml(f.Firma || '') + '</td>' +
      '<td data-label="Číslo">' + escapeHtml(f.Cislo_faktury || '') + '</td>' +
      '<td data-label="Jednotka">' + escapeHtml(f.Jednotka || '') + '</td>' +
      '<td data-label="Zákazník">' + escapeHtml(f.Zakaznik || '') + '</td>' +
      '<td data-label="Vystaveno">' + escapeHtml(f.Datum_vystaveni || '') + '</td>' +
      '<td data-label="Splatnost">' + escapeHtml(f.Datum_splatnosti || '') + '</td>' +
      '<td data-label="Částka">' + formatCastka(f.Castka) + '</td>' +
      '<td data-label="Stav">' + escapeHtml(vfStavText(f)) + '</td>' +
      '<td data-label="Akce"></td>';

    const buneckaAkce = tr.children[8];
    const tlacitko = document.createElement('button');
    tlacitko.className = 'maly sekundarni';
    if (f.Stav === 'Uhrazeno') {
      tlacitko.textContent = 'Zrušit uhrazení';
      tlacitko.onclick = () => ulozZmenuVydaneFaktury(f.ID, { Stav: 'Neuhrazeno', Datum_uhrady: '' }, tlacitko);
    } else {
      tlacitko.textContent = 'Označit uhrazeno';
      tlacitko.onclick = () => ulozZmenuVydaneFaktury(
        f.ID,
        { Stav: 'Uhrazeno', Datum_uhrady: new Date().toISOString().slice(0, 10) },
        tlacitko
      );
    }
    buneckaAkce.appendChild(tlacitko);

    telo.appendChild(tr);
  });

  if (serazene.length === 0) {
    telo.innerHTML = '<tr><td colspan="9" class="nacitani">Zatím žádné vydané faktury.</td></tr>';
  }
}

async function ulozZmenuVydaneFaktury(id, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/vydaneFaktury', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    await nactiVydaneFaktury();
  } catch (e) {
    alert('Nepodařilo se uložit změnu: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function pridatVydanouFakturu() {
  const zprava = document.getElementById('vf-zprava');
  const tlacitko = document.getElementById('tlacitko-pridat-fakturu');
  zprava.innerHTML = '';
  tlacitko.disabled = true;

  try {
    await zavolejApi('/vydaneFaktury', {
      method: 'POST',
      body: JSON.stringify({
        Firma: document.getElementById('vf-firma').value,
        Cislo_faktury: document.getElementById('vf-cislo').value.trim(),
        Jednotka: document.getElementById('vf-jednotka').value.trim(),
        Zakaznik: document.getElementById('vf-zakaznik').value.trim(),
        ICO_zakaznika: document.getElementById('vf-ico').value.trim(),
        Datum_vystaveni: document.getElementById('vf-vystaveni').value,
        Datum_splatnosti: document.getElementById('vf-splatnost').value,
        Castka: document.getElementById('vf-castka').value,
        Mena: document.getElementById('vf-mena').value.trim() || 'CZK',
        Poznamka: document.getElementById('vf-poznamka').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Faktura přidána.</div>';
    ['vf-cislo', 'vf-jednotka', 'vf-zakaznik', 'vf-ico', 'vf-vystaveni', 'vf-splatnost', 'vf-castka', 'vf-poznamka'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    document.getElementById('vf-mena').value = 'CZK';
    await nactiVydaneFaktury();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  } finally {
    tlacitko.disabled = false;
  }
}

// ---------- BANKOVNÍ VÝPISY ----------

let bankaFirmySeznam = [];
let bankaAktivniFirma = '';
let bankaPohybySeznam = [];
let bankaDokladySeznam = [];

async function inicializujZalozkuBanka() {
  const vyber = document.getElementById('banka-vyber-firmy');

  if (bankaFirmySeznam.length === 0) {
    try {
      const data = await zavolejApi('/firmy', { method: 'GET' });
      bankaFirmySeznam = (data.firmy || []).map((f) => f.Nazev).filter(Boolean);
    } catch (e) {
      document.getElementById('banka-nacitani').textContent = 'Nepodařilo se načíst seznam firem: ' + e.message;
      return;
    }
    vyber.innerHTML = bankaFirmySeznam.map((n) => '<option value="' + escapeAttr(n) + '">' + escapeHtml(n) + '</option>').join('');
  }

  if (!bankaAktivniFirma && bankaFirmySeznam.length > 0) {
    bankaAktivniFirma = bankaFirmySeznam[0];
  }
  vyber.value = bankaAktivniFirma;

  await nactiBankovniPohyby();
}

async function nactiBankovniPohyby() {
  bankaAktivniFirma = document.getElementById('banka-vyber-firmy').value;
  const nacitani = document.getElementById('banka-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';
  document.getElementById('banka-tabulka').innerHTML = '';
  document.getElementById('banka-souhrn').textContent = '';

  if (!bankaAktivniFirma) {
    nacitani.textContent = 'Nejdřív přidejte alespoň jednu firmu v záložce Firmy.';
    return;
  }

  try {
    const [dataPohyby, dataDoklady] = await Promise.all([
      zavolejApi('/banka?firma=' + encodeURIComponent(bankaAktivniFirma), { method: 'GET' }),
      zavolejApi('/doklady', { method: 'GET' }),
    ]);
    bankaPohybySeznam = dataPohyby.pohyby || [];
    bankaDokladySeznam = (dataDoklady.doklady || []).filter(
      (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === bankaAktivniFirma
    );
    nacitani.classList.add('skryto');
    vykresliBankovniPohyby();
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst bankovní pohyby: ' + e.message;
  }
}

function bankaDokladPodleId(id) {
  return bankaDokladySeznam.find((d) => d.ID === id);
}

function bankaStavBadge(stav) {
  if (stav === 'Potvrzeno') return '<span class="badge-potvrzeno">Potvrzeno</span>';
  if (stav === 'Navrženo') return '<span class="badge-navrzeno">Navrženo</span>';
  if (stav === 'Bez dokladu') return '<span class="badge-bezdokladu">Bez dokladu</span>';
  return '<span class="badge-chybi">Chybí doklad</span>';
}

// Třída pro probarvení celého řádku podle stavu spárování - stejné čtyři
// stavy jako bankaStavBadge, jen jako modifikátor na .banka-radek.
function bankaStavRadekTrida(stav) {
  if (stav === 'Potvrzeno') return 'stav-radek-potvrzeno';
  if (stav === 'Navrženo') return 'stav-radek-navrzeno';
  if (stav === 'Bez dokladu') return 'stav-radek-bezdokladu';
  return 'stav-radek-chybi';
}

function vykresliBankovniPohyby() {
  const kontejner = document.getElementById('banka-tabulka');
  const souhrn = document.getElementById('banka-souhrn');
  kontejner.innerHTML = '';

  const potvrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Potvrzeno').length;
  const navrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Navrženo').length;
  const chybi = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Nespárováno').length;
  const bezDokladu = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Bez dokladu').length;
  souhrn.textContent =
    potvrzeno + ' potvrzeno, ' + navrzeno + ' navrženo, ' + chybi + ' chybí, ' + bezDokladu +
    ' bez dokladu (celkem ' + bankaPohybySeznam.length + ')';

  const jenChybejici = document.getElementById('banka-jen-chybejici').getAttribute('aria-pressed') === 'true';
  const serazene = bankaPohybySeznam
    .filter((p) => !jenChybejici || p.Stav_parovani === 'Nespárováno' || p.Stav_parovani === 'Navrženo')
    .slice()
    .sort((a, b) => (b.Datum || '').localeCompare(a.Datum || ''));

  if (serazene.length === 0) {
    kontejner.innerHTML =
      '<div class="nacitani">' +
      (jenChybejici ? 'Nic k doplnění.' : 'Zatím žádné pohyby - nahrajte výpis výše.') +
      '</div>';
    return;
  }

  serazene.forEach((p) => kontejner.appendChild(vytvorRadekBanka(p)));
}

function vytvorRadekBanka(p) {
  const radek = document.createElement('div');
  radek.className = 'banka-radek ' + bankaStavRadekTrida(p.Stav_parovani);

  const hlava = document.createElement('div');
  hlava.className = 'banka-radek-hlava';
  const castkaTrida = parsujCastkuZListu(p.Castka) > 0 ? 'prijem' : 'vydaj';
  hlava.innerHTML =
    '<span class="banka-sipka">▶</span>' +
    '<span>' + escapeHtml(p.Datum || '') + '</span>' +
    '<span>' + escapeHtml(p.Protistrana || p.Typ_pohybu || '') + '</span>' +
    bankaStavBadge(p.Stav_parovani) +
    '<span class="castka ' + castkaTrida + '">' + formatCastka(p.Castka) + '</span>';

  const detail = document.createElement('div');
  detail.className = 'banka-radek-detail';

  hlava.addEventListener('click', () => {
    radek.classList.toggle('rozbaleno');
    if (radek.classList.contains('rozbaleno') && !radek.dataset.naplneno) {
      radek.dataset.naplneno = '1';
      detail.appendChild(vytvorDetailBanka(p));
    }
  });

  radek.appendChild(hlava);
  radek.appendChild(detail);
  return radek;
}

function vytvorDetailBanka(p) {
  const wrap = document.createElement('div');

  const dl = document.createElement('dl');
  dl.innerHTML =
    '<dt>Typ pohybu</dt><dd>' + escapeHtml(p.Typ_pohybu || '—') + '</dd>' +
    '<dt>Variabilní symbol</dt><dd>' + escapeHtml(p.Variabilni_symbol || '—') + '</dd>' +
    '<dt>Konstantní symbol</dt><dd>' + escapeHtml(p.Konstantni_symbol || '—') + '</dd>' +
    '<dt>Specifický symbol</dt><dd>' + escapeHtml(p.Specificky_symbol || '—') + '</dd>' +
    '<dt>Účet protistrany</dt><dd>' + escapeHtml(p.Cislo_uctu_protistrany || '—') + '</dd>' +
    '<dt>Popis</dt><dd>' + escapeHtml(p.Popis || '—') + '</dd>';
  wrap.appendChild(dl);

  const dokladBox = document.createElement('div');
  dokladBox.style.marginTop = '10px';
  const propojenyDoklad = p.Doklad_ID ? bankaDokladPodleId(p.Doklad_ID) : null;
  if (propojenyDoklad) {
    dokladBox.innerHTML =
      '<strong>Přiřazený doklad:</strong> ' + escapeHtml(propojenyDoklad.Dodavatel || '(bez dodavatele)') +
      ', ' + escapeHtml(String(parsujCastkuZListu(propojenyDoklad.Castka))) + ' ' + escapeHtml(propojenyDoklad.Mena || '') +
      (propojenyDoklad.Zdrojovy_soubor_URL
        ? ' – <a href="' + escapeAttr(propojenyDoklad.Zdrojovy_soubor_URL) + '" target="_blank" rel="noopener">otevřít scan</a>'
        : '') +
      (propojenyDoklad.Poznamka
        ? '<div class="popis">Poznámka z vytěžení: ' + escapeHtml(propojenyDoklad.Poznamka) + '</div>'
        : '');
  } else if (p.Doklad_ID) {
    dokladBox.innerHTML =
      '<span class="popis">Přiřazený doklad (ID ' + escapeHtml(p.Doklad_ID) + ') appka v seznamu dokladů nenašla.</span>';
  }
  wrap.appendChild(dokladBox);

  function tlacitkoBanka(text, onclick) {
    const b = document.createElement('button');
    b.className = 'maly sekundarni';
    b.textContent = text;
    b.onclick = onclick;
    return b;
  }

  async function ulozZmenuBanka(zmeny, tlac) {
    if (tlac) tlac.disabled = true;
    try {
      await zavolejApi('/banka', { method: 'PATCH', body: JSON.stringify({ id: p.ID, zmeny }) });
      await nactiBankovniPohyby();
    } catch (e) {
      alert('Nepodařilo se uložit změnu: ' + e.message);
      if (tlac) tlac.disabled = false;
    }
  }

  const akce = document.createElement('div');
  akce.className = 'radek-akci';

  if (p.Stav_parovani === 'Navrženo') {
    akce.appendChild(tlacitkoBanka('Potvrdit shodu', (e) => ulozZmenuBanka({ Stav_parovani: 'Potvrzeno' }, e.target)));
    akce.appendChild(
      tlacitkoBanka('Zamítnout návrh', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno', Doklad_ID: '' }, e.target))
    );
  } else if (p.Stav_parovani === 'Potvrzeno') {
    akce.appendChild(
      tlacitkoBanka('Zrušit potvrzení', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno', Doklad_ID: '' }, e.target))
    );
  } else {
    const vyberDokladu = document.createElement('select');
    vyberDokladu.style.fontSize = '13px';
    const jizPouzite = new Set(
      bankaPohybySeznam.filter((pp) => pp.Doklad_ID && pp.ID !== p.ID).map((pp) => pp.Doklad_ID)
    );
    const volneDoklady = bankaDokladySeznam.filter((d) => !jizPouzite.has(d.ID));
    vyberDokladu.innerHTML =
      '<option value="">— vyberte doklad —</option>' +
      volneDoklady
        .map(
          (d) =>
            '<option value="' + escapeAttr(d.ID) + '">' +
            escapeHtml(d.Dodavatel || '(bez dodavatele)') + ' – ' + escapeHtml(String(parsujCastkuZListu(d.Castka))) + ' ' +
            escapeHtml(d.Mena || '') + ' (' + escapeHtml(d.Datum_dokladu || '') + ')</option>'
        )
        .join('');
    akce.appendChild(vyberDokladu);
    akce.appendChild(
      tlacitkoBanka('Přiřadit', (e) => {
        if (!vyberDokladu.value) {
          alert('Nejdřív vyberte doklad.');
          return;
        }
        ulozZmenuBanka({ Doklad_ID: vyberDokladu.value, Stav_parovani: 'Potvrzeno' }, e.target);
      })
    );

    const poleNovySoubor = document.createElement('input');
    poleNovySoubor.type = 'file';
    poleNovySoubor.accept = 'image/*,application/pdf';
    poleNovySoubor.className = 'skryto';
    const tlNahratNovy = tlacitkoBanka('Nahrát nový doklad', () => poleNovySoubor.click());
    poleNovySoubor.addEventListener('change', async (e) => {
      const soubor = e.target.files[0];
      if (!soubor) return;
      tlNahratNovy.disabled = true;
      const puvodniText = tlNahratNovy.textContent;
      tlNahratNovy.textContent = 'Nahrávám…';
      try {
        const pripraveny = await pripravSouborKNahrani(soubor);
        const vysledek = await zavolejApi('/upload', {
          method: 'POST',
          body: JSON.stringify({ filename: pripraveny.nazev, mimeType: pripraveny.mimeType, dataBase64: pripraveny.data }),
        });
        await zavolejApi('/doklady', {
          method: 'PATCH',
          body: JSON.stringify({ id: vysledek.doklad.ID, zmeny: { Firma_potvrzena: bankaAktivniFirma } }),
        });
        await ulozZmenuBanka({ Doklad_ID: vysledek.doklad.ID, Stav_parovani: 'Potvrzeno' });
      } catch (err) {
        alert('Nepodařilo se nahrát doklad: ' + err.message);
        tlNahratNovy.disabled = false;
        tlNahratNovy.textContent = puvodniText;
      }
    });
    akce.appendChild(tlNahratNovy);
    akce.appendChild(poleNovySoubor);

    if (p.Stav_parovani !== 'Bez dokladu') {
      akce.appendChild(
        tlacitkoBanka('Označit „Bez dokladu“', (e) => ulozZmenuBanka({ Stav_parovani: 'Bez dokladu', Doklad_ID: '' }, e.target))
      );
    } else {
      akce.appendChild(tlacitkoBanka('Zrušit „Bez dokladu“', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno' }, e.target)));
    }
  }

  wrap.appendChild(akce);

  const poznamkaDiv = document.createElement('div');
  poznamkaDiv.style.marginTop = '10px';
  const poznamkaVstup = document.createElement('input');
  poznamkaVstup.type = 'text';
  poznamkaVstup.placeholder = 'Poznámka pro účetní…';
  poznamkaVstup.value = p.Poznamka || '';
  poznamkaVstup.style.fontSize = '13px';
  poznamkaDiv.appendChild(poznamkaVstup);
  poznamkaDiv.appendChild(tlacitkoBanka('Uložit poznámku', (e) => ulozZmenuBanka({ Poznamka: poznamkaVstup.value.trim() }, e.target)));
  wrap.appendChild(poznamkaDiv);

  return wrap;
}

// Appka pozná formát podle přípony souboru - JSON/CSV posílá jako čitelný
// text, XLS/XLSX (binární formát) jako base64 (viz souborNaBase64 níž).
// Poznámka: appka neumí kontrolovat mimetype u téhle appky bez skutečné
// ukázky Janova výpisu, takže se spoléhá na příponu, ne na soubor.type
// (ten se u exportů z různých bank/prohlížečů často liší nebo chybí).
function priponaSouboru(nazevSouboru) {
  const nazev = String(nazevSouboru || '').toLowerCase();
  if (nazev.endsWith('.csv')) return 'csv';
  if (nazev.endsWith('.xlsx') || nazev.endsWith('.xls')) return 'xlsx';
  return 'json';
}

function souborNaBase64(soubor) {
  return new Promise((resolve, reject) => {
    const cteni = new FileReader();
    cteni.onload = () => {
      // readAsDataURL vrací "data:<mime>;base64,AAAA…" - appka posílá jen
      // část obsahu za čárkou (samotný base64 řetězec).
      const vysledek = String(cteni.result || '');
      const carka = vysledek.indexOf(',');
      resolve(carka >= 0 ? vysledek.slice(carka + 1) : vysledek);
    };
    cteni.onerror = () => reject(cteni.error || new Error('Soubor se nepodařilo přečíst.'));
    cteni.readAsDataURL(soubor);
  });
}

async function nahratVypis(soubor) {
  if (!soubor) return;
  document.getElementById('pole-vypis').value = '';
  const format = priponaSouboru(soubor.name);
  const obsah = format === 'xlsx' ? await souborNaBase64(soubor) : await soubor.text();
  await odeslatImportVypisu(obsah, format, false);
}

async function odeslatImportVypisu(obsah, format, ignorovatNesoulad) {
  const zprava = document.getElementById('banka-import-zprava');
  zprava.innerHTML = '<div class="zprava">Nahrávám a zpracovávám výpis…</div>';
  try {
    const vysledek = await zavolejApi('/banka', {
      method: 'POST',
      body: JSON.stringify({
        firma: bankaAktivniFirma,
        obsahSouboru: obsah,
        format: format,
        ignorovatNesouladUctu: !!ignorovatNesoulad,
      }),
    });
    zprava.innerHTML =
      '<div class="zprava uspech">Naimportováno ' + vysledek.pridano + ' nových pohybů (' +
      vysledek.duplicitni + ' appka už měla, ' + vysledek.navrzeno + ' navrženo ke kontrole, ' +
      vysledek.bezDokladu + ' bez dokladu, ' + vysledek.nesparovano + ' čeká na doplnění dokladu).</div>';
    await nactiBankovniPohyby();
  } catch (e) {
    if (e.data && e.data.error === 'ucet_nesedi') {
      if (confirm(e.data.varovani + '\n\nPokračovat i přesto?')) {
        await odeslatImportVypisu(obsah, format, true);
        return;
      }
      zprava.innerHTML = '<div class="zprava">Import zrušen.</div>';
      return;
    }
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

// ---------- ADMIN: UŽIVATELÉ ----------

async function nactiUzivatele() {
  const nacitani = document.getElementById('uzivatele-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/uzivatele', { method: 'GET' });
    nacitani.classList.add('skryto');
    vykresliFirmyCheckboxy('novy-u-firmy', data.firmyDostupne || [], []);
    vykresliUzivatele(data.uzivatele || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst uživatele: ' + e.message;
  }
}

function vykresliFirmyCheckboxy(idKontejneru, firmyDostupne, zaskrtnuteFirmy) {
  const kontejner = document.getElementById(idKontejneru);
  kontejner.innerHTML = '';

  firmyDostupne.forEach((nazev) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = nazev;
    checkbox.checked = zaskrtnuteFirmy.includes(nazev);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + nazev));
    kontejner.appendChild(label);
  });

  if (firmyDostupne.length === 0) {
    kontejner.innerHTML = '<span class="nacitani">Nejdřív přidejte alespoň jednu firmu v záložce Firmy.</span>';
  }
}

function precistZaskrtnuteFirmy(idKontejneru) {
  return Array.from(document.querySelectorAll('#' + idKontejneru + ' input[type=checkbox]:checked')).map((c) => c.value);
}

function vykresliUzivatele(uzivatele) {
  const telo = document.getElementById('tabulka-uzivatele-telo');
  telo.innerHTML = '';

  uzivatele.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Jméno"></td>' +
      '<td data-label="PIN"></td>' +
      '<td data-label="Firmy"></td>' +
      '<td data-label="Role"></td>' +
      '<td data-label="Akce"></td>';

    const vstupJmeno = document.createElement('input');
    vstupJmeno.type = 'text';
    vstupJmeno.value = u.Jmeno || '';
    vstupJmeno.style.fontSize = '13px';
    tr.children[0].appendChild(vstupJmeno);

    const vstupPin = document.createElement('input');
    vstupPin.type = 'text';
    vstupPin.value = u.PIN || '';
    vstupPin.style.fontSize = '13px';
    vstupPin.style.maxWidth = '90px';
    tr.children[1].appendChild(vstupPin);

    const existujiciFirmy = String(u.Firmy || '').split(',').map((s) => s.trim()).filter(Boolean);
    const idFiremKontejneru = 'u-firmy-' + u._row;
    const divFirmy = document.createElement('div');
    divFirmy.id = idFiremKontejneru;
    divFirmy.className = 'firmy-checkboxy';
    tr.children[2].appendChild(divFirmy);

    const vyberRole = document.createElement('select');
    vyberRole.innerHTML =
      '<option value="">Uživatel</option>' +
      '<option value="ucetni">Účetní</option>' +
      '<option value="admin">Admin</option>';
    vyberRole.value = ['admin', 'ucetni'].includes(u.Role) ? u.Role : '';
    tr.children[3].appendChild(vyberRole);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozUzivatele(u._row, {
      Jmeno: vstupJmeno.value.trim(),
      PIN: vstupPin.value.trim(),
      Firmy: precistZaskrtnuteFirmy(idFiremKontejneru),
      Role: vyberRole.value,
    }, tlacitkoUlozit);
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazUzivatele(u._row, u.Jmeno, tlacitkoSmazat);
    tr.children[4].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);

    // Checkboxy pro firmy dokreslíme až po vložení řádku do DOM, ať víme, co zaškrtnout.
    zavolejApi('/uzivatele', { method: 'GET' }).then((data) => {
      vykresliFirmyCheckboxy(idFiremKontejneru, data.firmyDostupne || [], existujiciFirmy);
    }).catch(() => {
      divFirmy.textContent = String(u.Firmy || '');
    });
  });

  if (uzivatele.length === 0) {
    telo.innerHTML = '<tr><td colspan="5" class="nacitani">Zatím žádní uživatelé.</td></tr>';
  }
}

async function pridatUzivatele() {
  const zprava = document.getElementById('uzivatele-zprava');
  zprava.innerHTML = '';

  const jmeno = document.getElementById('novy-u-jmeno').value.trim();
  const pin = document.getElementById('novy-u-pin').value.trim();
  const firmy = precistZaskrtnuteFirmy('novy-u-firmy');
  const role = document.getElementById('novy-u-role').value;

  if (!jmeno || !pin) {
    zprava.innerHTML = '<div class="zprava chyba">Jméno a PIN jsou povinné.</div>';
    return;
  }

  try {
    await zavolejApi('/uzivatele', {
      method: 'POST',
      body: JSON.stringify({ Jmeno: jmeno, PIN: pin, Firmy: firmy, Role: role }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Uživatel přidán.</div>';
    document.getElementById('novy-u-jmeno').value = '';
    document.getElementById('novy-u-pin').value = '';
    document.getElementById('novy-u-role').value = '';
    await nactiUzivatele();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozUzivatele(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/uzivatele', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiUzivatele();
  } catch (e) {
    alert('Nepodařilo se uložit uživatele: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazUzivatele(row, jmeno, tlacitko) {
  if (!confirm('Opravdu smazat uživatele „' + jmeno + '“?')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/uzivatele?row=' + row, { method: 'DELETE' });
    await nactiUzivatele();
  } catch (e) {
    alert('Nepodařilo se smazat uživatele: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- ADMIN: FIRMY ----------

async function nactiFirmy() {
  const nacitani = document.getElementById('firmy-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/firmy', { method: 'GET' });
    nacitani.classList.add('skryto');
    vykresliFirmy(data.firmy || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst firmy: ' + e.message;
  }
}

function vykresliFirmy(firmy) {
  const telo = document.getElementById('tabulka-firmy-telo');
  telo.innerHTML = '';

  firmy.forEach((f) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Název"></td>' +
      '<td data-label="IČO"></td>' +
      '<td data-label="DIČ"></td>' +
      '<td data-label="Plátce DPH"></td>' +
      '<td data-label="Bankovní účet"></td>' +
      '<td data-label="Akce"></td>';

    tr.children[0].textContent = f.Nazev || '';

    const vstupIco = document.createElement('input');
    vstupIco.type = 'text';
    vstupIco.value = f.ICO || '';
    vstupIco.style.fontSize = '13px';
    tr.children[1].appendChild(vstupIco);

    const vstupDic = document.createElement('input');
    vstupDic.type = 'text';
    vstupDic.value = f.DIC || '';
    vstupDic.style.fontSize = '13px';
    tr.children[2].appendChild(vstupDic);

    const vyberPlatce = document.createElement('select');
    vyberPlatce.innerHTML = '<option value="NE">Ne</option><option value="ANO">Ano</option>';
    vyberPlatce.value = f.Platce_DPH === 'ANO' ? 'ANO' : 'NE';
    tr.children[3].appendChild(vyberPlatce);

    const vstupUcet = document.createElement('input');
    vstupUcet.type = 'text';
    vstupUcet.value = f.Bankovni_ucet || '';
    vstupUcet.style.fontSize = '13px';
    tr.children[4].appendChild(vstupUcet);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozFirmu(f._row, {
      ICO: vstupIco.value.trim(),
      DIC: vstupDic.value.trim(),
      Platce_DPH: vyberPlatce.value,
      Bankovni_ucet: vstupUcet.value.trim(),
    }, tlacitkoUlozit);
    tr.children[5].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazFirmu(f._row, f.Nazev, tlacitkoSmazat);
    tr.children[5].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  if (firmy.length === 0) {
    telo.innerHTML = '<tr><td colspan="6" class="nacitani">Zatím žádné firmy.</td></tr>';
  }
}

async function pridatFirmu() {
  const zprava = document.getElementById('firmy-zprava');
  zprava.innerHTML = '';

  const nazev = document.getElementById('nova-f-nazev').value.trim();
  if (!nazev) {
    zprava.innerHTML = '<div class="zprava chyba">Název firmy je povinný.</div>';
    return;
  }

  try {
    await zavolejApi('/firmy', {
      method: 'POST',
      body: JSON.stringify({
        Nazev: nazev,
        ICO: document.getElementById('nova-f-ico').value.trim(),
        DIC: document.getElementById('nova-f-dic').value.trim(),
        Platce_DPH: document.getElementById('nova-f-platce').value,
        Bankovni_ucet: document.getElementById('nova-f-ucet').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Firma přidána.</div>';
    document.getElementById('nova-f-nazev').value = '';
    document.getElementById('nova-f-ico').value = '';
    document.getElementById('nova-f-dic').value = '';
    document.getElementById('nova-f-ucet').value = '';
    await nactiFirmy();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozFirmu(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/firmy', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiFirmy();
  } catch (e) {
    alert('Nepodařilo se uložit firmu: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazFirmu(row, nazev, tlacitko) {
  if (!confirm('Opravdu smazat firmu „' + nazev + '“? Existující doklady/uživatelé s touto firmou zůstanou beze změny, jen ji už nepůjde nově přiřazovat.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/firmy?row=' + row, { method: 'DELETE' });
    await nactiFirmy();
  } catch (e) {
    alert('Nepodařilo se smazat firmu: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- ADMIN: AUTA ----------

async function nactiAuta() {
  const nacitani = document.getElementById('auta-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/auta', { method: 'GET' });
    nacitani.classList.add('skryto');
    vyplnVyberFirem('nove-a-firma', data.firmyDostupne || []);
    vykresliAuta(data.auta || [], data.firmyDostupne || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst auta: ' + e.message;
  }
}

function vyplnVyberFirem(idSelectu, firmyDostupne) {
  const select = document.getElementById(idSelectu);
  const puvodniHodnota = select.value;
  select.innerHTML = '<option value=""></option>' +
    firmyDostupne.map((n) => '<option value="' + escapeAttr(n) + '">' + escapeHtml(n) + '</option>').join('');
  select.value = puvodniHodnota;
}

function vykresliAuta(auta, firmyDostupne) {
  const telo = document.getElementById('tabulka-auta-telo');
  telo.innerHTML = '';

  auta.forEach((a) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="SPZ"></td>' +
      '<td data-label="Model"></td>' +
      '<td data-label="Firma"></td>' +
      '<td data-label="Řidič"></td>' +
      '<td data-label="Akce"></td>';

    tr.children[0].textContent = a.SPZ || '';

    const vstupModel = document.createElement('input');
    vstupModel.type = 'text';
    vstupModel.value = a.Model || '';
    vstupModel.style.fontSize = '13px';
    tr.children[1].appendChild(vstupModel);

    const vyberFirma = document.createElement('select');
    vyberFirma.innerHTML = '<option value=""></option>' +
      firmyDostupne.map((n) => '<option value="' + escapeAttr(n) + '">' + escapeHtml(n) + '</option>').join('');
    vyberFirma.value = a.Firma || '';
    tr.children[2].appendChild(vyberFirma);

    const vstupRidic = document.createElement('input');
    vstupRidic.type = 'text';
    vstupRidic.value = a.Ridic || '';
    vstupRidic.style.fontSize = '13px';
    tr.children[3].appendChild(vstupRidic);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozAuto(a._row, {
      Model: vstupModel.value.trim(),
      Firma: vyberFirma.value,
      Ridic: vstupRidic.value.trim(),
    }, tlacitkoUlozit);
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazAuto(a._row, a.SPZ, tlacitkoSmazat);
    tr.children[4].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  if (auta.length === 0) {
    telo.innerHTML = '<tr><td colspan="5" class="nacitani">Zatím žádná auta.</td></tr>';
  }
}

async function pridatAuto() {
  const zprava = document.getElementById('auta-zprava');
  zprava.innerHTML = '';

  const spz = document.getElementById('nove-a-spz').value.trim();
  if (!spz) {
    zprava.innerHTML = '<div class="zprava chyba">SPZ je povinná.</div>';
    return;
  }

  try {
    await zavolejApi('/auta', {
      method: 'POST',
      body: JSON.stringify({
        SPZ: spz,
        Model: document.getElementById('nove-a-model').value.trim(),
        Firma: document.getElementById('nove-a-firma').value,
        Ridic: document.getElementById('nove-a-ridic').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Auto přidáno.</div>';
    document.getElementById('nove-a-spz').value = '';
    document.getElementById('nove-a-model').value = '';
    document.getElementById('nove-a-ridic').value = '';
    await nactiAuta();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozAuto(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/auta', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiAuta();
  } catch (e) {
    alert('Nepodařilo se uložit auto: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazAuto(row, spz, tlacitko) {
  if (!confirm('Opravdu smazat auto „' + spz + '“?')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/auta?row=' + row, { method: 'DELETE' });
    await nactiAuta();
  } catch (e) {
    alert('Nepodařilo se smazat auto: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- ADMIN: ÚČTY (firma může mít víc bankovních účtů, od v3.6) ----------

async function nactiUcty() {
  const nacitani = document.getElementById('ucty-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/ucty', { method: 'GET' });
    nacitani.classList.add('skryto');
    vyplnVyberFirem('novy-uc-firma', data.firmyDostupne || []);
    vykresliUcty(data.ucty || [], data.firmyDostupne || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst účty: ' + e.message;
  }
}

function vykresliUcty(ucty, firmyDostupne) {
  const telo = document.getElementById('tabulka-ucty-telo');
  telo.innerHTML = '';

  ucty.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Firma"></td>' +
      '<td data-label="Číslo účtu"></td>' +
      '<td data-label="Měna"></td>' +
      '<td data-label="Popis"></td>' +
      '<td data-label="Akce"></td>';

    const vyberFirma = document.createElement('select');
    vyberFirma.innerHTML = '<option value=""></option>' +
      firmyDostupne.map((n) => '<option value="' + escapeAttr(n) + '">' + escapeHtml(n) + '</option>').join('');
    vyberFirma.value = u.Firma || '';
    tr.children[0].appendChild(vyberFirma);

    tr.children[1].textContent = u.Cislo_uctu || '';

    const vstupMena = document.createElement('input');
    vstupMena.type = 'text';
    vstupMena.value = u.Mena || '';
    vstupMena.style.fontSize = '13px';
    vstupMena.style.width = '70px';
    tr.children[2].appendChild(vstupMena);

    const vstupPopis = document.createElement('input');
    vstupPopis.type = 'text';
    vstupPopis.value = u.Popis || '';
    vstupPopis.style.fontSize = '13px';
    tr.children[3].appendChild(vstupPopis);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozUcet(u._row, {
      Firma: vyberFirma.value,
      Mena: vstupMena.value.trim(),
      Popis: vstupPopis.value.trim(),
    }, tlacitkoUlozit);
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazUcet(u._row, u.Cislo_uctu, tlacitkoSmazat);
    tr.children[4].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  if (ucty.length === 0) {
    telo.innerHTML = '<tr><td colspan="5" class="nacitani">Zatím žádné účty. Appka první účet firmy sama '
      + 'doplní i po prvním importu výpisu (George JSON), pokud ho zatím nezná.</td></tr>';
  }
}

async function pridatUcet() {
  const zprava = document.getElementById('ucty-zprava');
  zprava.innerHTML = '';

  const firma = document.getElementById('novy-uc-firma').value;
  const cislo = document.getElementById('novy-uc-cislo').value.trim();
  if (!firma) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte firmu.</div>';
    return;
  }
  if (!cislo) {
    zprava.innerHTML = '<div class="zprava chyba">Číslo účtu je povinné.</div>';
    return;
  }

  try {
    await zavolejApi('/ucty', {
      method: 'POST',
      body: JSON.stringify({
        Firma: firma,
        Cislo_uctu: cislo,
        Mena: document.getElementById('novy-uc-mena').value.trim() || 'CZK',
        Popis: document.getElementById('novy-uc-popis').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Účet přidán.</div>';
    document.getElementById('novy-uc-cislo').value = '';
    document.getElementById('novy-uc-popis').value = '';
    await nactiUcty();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozUcet(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/ucty', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiUcty();
  } catch (e) {
    alert('Nepodařilo se uložit účet: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazUcet(row, cisloUctu, tlacitko) {
  if (!confirm('Opravdu smazat účet „' + cisloUctu + '“?')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/ucty?row=' + row, { method: 'DELETE' });
    await nactiUcty();
  } catch (e) {
    alert('Nepodařilo se smazat účet: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- POMOCNÉ ----------

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(text) {
  return escapeHtml(text);
}

// ---------- INICIALIZACE ----------

document.getElementById('tlacitko-prihlasit').addEventListener('click', prihlasit);
document.getElementById('pole-pin').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') prihlasit();
});
document.getElementById('tlacitko-odhlasit').addEventListener('click', odhlasit);
document.getElementById('tlacitko-vyfotit').addEventListener('click', () => document.getElementById('pole-foto').click());
document.getElementById('tlacitko-vybrat-soubor').addEventListener('click', () => document.getElementById('pole-soubor').click());
document.getElementById('pole-foto').addEventListener('change', (e) => zpracujVybranySoubor(e.target.files[0]));
document.getElementById('pole-soubor').addEventListener('change', (e) => zpracujVybranySoubor(e.target.files[0]));
document.getElementById('tlacitko-nahrat').addEventListener('click', nahratDoklad);
document.getElementById('dokl-sekce-ke-schvaleni').addEventListener('click', () => prepniDokladySekci('keSchvaleni'));
document.getElementById('dokl-sekce-schvalene').addEventListener('click', () => prepniDokladySekci('schvalene'));
document.getElementById('tlacitko-pridat-uzivatele').addEventListener('click', pridatUzivatele);
document.getElementById('tlacitko-pridat-firmu').addEventListener('click', pridatFirmu);
document.getElementById('tlacitko-pridat-auto').addEventListener('click', pridatAuto);
document.getElementById('tlacitko-pridat-ucet').addEventListener('click', pridatUcet);
document.getElementById('tlacitko-pripojit-google').addEventListener('click', () => {
  if (!stav || !stav.token) return;
  window.open('/.netlify/functions/google-oauth-start?token=' + encodeURIComponent(stav.token), '_blank');
});
document.getElementById('banka-vyber-firmy').addEventListener('change', nactiBankovniPohyby);
document.getElementById('tlacitko-nahrat-vypis').addEventListener('click', () => document.getElementById('pole-vypis').click());
document.getElementById('pole-vypis').addEventListener('change', (e) => nahratVypis(e.target.files[0]));
document.getElementById('banka-jen-chybejici').addEventListener('click', (e) => {
  const zapnuto = e.target.getAttribute('aria-pressed') === 'true';
  e.target.setAttribute('aria-pressed', String(!zapnuto));
  vykresliBankovniPohyby();
});
document.getElementById('tlacitko-pridat-fakturu').addEventListener('click', pridatVydanouFakturu);
document.getElementById('vf-filtr-firma').addEventListener('change', vykresliVydaneFaktury);
document.getElementById('tlacitko-motiv').addEventListener('click', prepniMotiv);

document.querySelectorAll('nav.zalozky button').forEach((btn) => {
  btn.addEventListener('click', () => prepniZalozku(btn.dataset.zalozka));
});

document.getElementById('verze-cislo').textContent = APP_VERZE;

if (jePrihlasen()) {
  zobrazApp();
} else {
  zobrazLogin();
  nactiJmenaProPrihlaseni();
}
