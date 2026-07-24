/**
 * public/app.js
 * Jednoduchá vanilla JS aplikace bez build kroku. Stav (token, jméno,
 * firmy, role) se drží v paměti a v localStorage (přežije obnovení
 * stránky) - běžný přístup pro reálně nasazenou webovou appku.
 */

// Zvyšte při každé odeslané aktualizaci appky, ať Jan v appce pozná, jestli
// se mu opravdu nasadila nová verze (zobrazuje se v patičce appky).
const APP_VERZE = 'v4.28 – 2026-07-24';

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

// ---------- SKINY (volitelné vzhledy appky) ----------
// (v4.15) Jan chtěl "moderní, černá, zlatá a navy" redesign appky -
// appka nejdřív nabídla tři koncepty najednou s možností přepínání.
// (v4.16) Jan zúžil na přesně DVA skiny a určil "Gold" (dřív "Černá a
// zlatá") jako VÝCHOZÍ pro všechny uživatele, druhý je "Navy" (dřív
// "Navy hlavička") - appka třetí koncept ("Celá navy") i klasickou
// nebarevnou volbu úplně odstranila. Appka to řeší úplně stejným
// vzorem jako existující světlý/tmavý motiv výše (`data-motiv`) -
// `data-skin` atribut na <html>, hodnota se pamatuje v localStorage,
// appka ho hned aplikuje při načtení skriptu. Oba skiny appka nechává
// plně kombinovatelné s přepínačem den/noc (žádné omezení/schovávání).

const SKIN_KLIC = 'nomisFakturySkin';
const SKIN_VYCHOZI = 'gold';

function nactiSkin() {
  try {
    const ulozeny = localStorage.getItem(SKIN_KLIC);
    // Appka rozpozná jen "navy" jako výslovnou volbu - cokoli jiného
    // (žádná hodnota, dřívější "cerna-zlata"/""/"plna-navy" z v4.15,
    // před zúžením na dva skiny v4.16) appka bere jako Gold, ať appka
    // nikoho nenechá omylem na skinu, který už appka nenabízí.
    return ulozeny === 'navy' ? 'navy' : SKIN_VYCHOZI;
  } catch (e) {
    return SKIN_VYCHOZI;
  }
}

function aplikujSkin(skin) {
  document.documentElement.setAttribute('data-skin', skin);
  const vyber = document.getElementById('vyber-skinu');
  if (vyber) vyber.value = skin;
}

function zmenSkin(novy) {
  try {
    localStorage.setItem(SKIN_KLIC, novy);
  } catch (e) {
    // localStorage nedostupné (např. soukromý režim) - skin se prostě
    // příště po obnovení stránky nezapamatuje, appka jinak funguje dál.
  }
  aplikujSkin(novy);
}

aplikujSkin(nactiSkin());

// Stažení souboru z API (od v4.27, export do Money S3) - na rozdíl od
// zavolejApi() výš appka odpověď NEČTE jako JSON (backend vrací XML/binární
// obsah s Content-Disposition: attachment, viz lib/http.js, funkce `xml`),
// appka proto místo fetch+.json() stáhne odpověď jako Blob a nabídne ji
// prohlížeči ke stažení přes dočasný <a download> element (URL.createObjectURL).
// Chybovou odpověď backend pořád vrací jako JSON (viz json() v lib/http.js),
// appka ji proto při !ok zkusí přečíst jako JSON kvůli srozumitelné hlášce.
async function stahniSouborZApi(cesta) {
  const hlavicky = {};
  if (stav && stav.token) hlavicky['Authorization'] = 'Bearer ' + stav.token;

  const odpoved = await fetch('/api' + cesta, { cache: 'no-store', headers: hlavicky });
  if (!odpoved.ok) {
    const data = await odpoved.json().catch(() => ({}));
    throw new Error(data.error || 'Chyba serveru (' + odpoved.status + ')');
  }

  const blob = await odpoved.blob();
  let nazevSouboru = 'export.xml';
  const contentDisposition = odpoved.headers.get('Content-Disposition') || '';
  const shoda = contentDisposition.match(/filename="?([^"]+)"?/);
  if (shoda) nazevSouboru = shoda[1];

  const url = URL.createObjectURL(blob);
  const odkaz = document.createElement('a');
  odkaz.href = url;
  odkaz.download = nazevSouboru;
  document.body.appendChild(odkaz);
  odkaz.click();
  odkaz.remove();
  URL.revokeObjectURL(url);
}

async function zavolejApi(cesta, moznosti) {
  const opts = moznosti || {};
  const hlavicky = Object.assign({}, opts.headers || {});
  if (stav && stav.token) hlavicky['Authorization'] = 'Bearer ' + stav.token;
  if (opts.body && !hlavicky['Content-Type']) hlavicky['Content-Type'] = 'application/json';

  // cache: 'no-store' - appka na některých zařízeních/sítích (typicky
  // mobilní prohlížeč nebo síť s cachovací proxy) uměla i po F5 ukázat
  // starou odpověď z GETu (např. doklad schválený na jiném zařízení pořád
  // vypadal jako neschválený), protože fetch bez tohohle nastavení nechá
  // na prohlížeči, jestli si GET odpověď odněkud z cache vezme, místo aby
  // se pokaždé zeptal serveru. Data appky se mění kdykoli, takže appka
  // API nikdy nesmí brát z cache.
  const odpoved = await fetch('/api' + cesta, Object.assign({ cache: 'no-store' }, opts, { headers: hlavicky }));
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
    vynulujCacheAppky();
    zobrazApp();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

function odhlasit() {
  zastavIdleSledovani();
  ulozStav(null);
  vynulujCacheAppky();
  zobrazLogin();
  nactiJmenaProPrihlaseni();
}

// Oprava (v4.13): appka drží řadu seznamů (firmy pro výběr, načtené
// záznamy dané záložky) jako modulové proměnné, které appka mezi
// jednotlivými návštěvami STEJNÉ záložky znovu nenačítá (typicky
// `if (X.length === 0)` - appka to dělá schválně, ať nemusí volat API
// znovu při každém přepnutí na tu samou záložku). Tyhle proměnné se ale
// dřív NIKDY nemazaly - takže když se appka odhlásila a v TÉŽE kartě
// prohlížeče (bez tvrdého obnovení stránky) přihlásil JINÝ uživatel,
// appka mu klidně ukázala zbytky dat po tom prvním (typicky seznam
// firem v Bankovních výpisech/Vydaných fakturách) - viz nahlášený
// problém „účetní/admin vidí jen firmy zbylé po předchozím uživateli“.
// Appka teď při KAŽDÉM přihlášení i odhlášení všechny tyhle cache
// vynuluje, ať se druhému uživateli vždy načtou čerstvá data scoped na
// JEHO účet, ne zbytky po předchozím.
function vynulujCacheAppky() {
  strediskaSeznam = [];
  firmyProVyberDokladu = [];
  dokladySeznamAktualni = [];
  dokladySekce = 'keSchvaleni';
  danovyPrehledData = null;
  exportDataDoklady = [];
  vfFirmySeznam = [];
  vfFakturySeznam = [];
  bankaFirmySeznam = [];
  bankaAktivniFirma = '';
  bankaPohybySeznam = [];
  bankaDokladySeznam = [];
  bankaSmlouvySeznam = [];
  bankaUctySeznam = [];
  bankaFakturySeznam = [];
  smlouvySeznamAktualni = [];
  prilohySeznamAktualni = [];
  smlouvySekce = 'aktivni';
  firmyProVyberSmlouvy = [];
  firmyProVyberKnihaJizd = [];
  knihaJizdSekce = 'jizdy';
  knihaJizdSouhrnData = null;
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
  document.getElementById('nav-smlouvy').classList.toggle('skryto', !jeUcetniNeboAdmin);
  document.getElementById('nav-export').classList.toggle('skryto', !jeUcetniNeboAdmin);
  // Jan (2026-07-21, v4.12): Bankovní výpisy appka nově zobrazuje VŠEM
  // přihlášeným (dřív jen adminovi/účetní, viz odstraněný toggle níže v
  // historii) - viz poznámka o v4.12 níže pro plný kontext.
  document.getElementById('nav-banka').classList.remove('skryto');

  // Jan (2026-07-19, v4.10): běžný uživatel (role "" - ne admin, ne účetní)
  // má v hlavní navigaci vidět JEN Nahrát doklady/Přijaté faktury/Vydané
  // faktury/Daňový přehled - appka mu Dashboard a Knihu jízd schová (dřív
  // je viděl každý přihlášený bez ohledu na roli). Admin i účetní vidí
  // obojí beze změny.
  document.getElementById('nav-dashboard').classList.toggle('skryto', !jeUcetniNeboAdmin);
  document.getElementById('nav-kniha-jizd').classList.toggle('skryto', !jeUcetniNeboAdmin);

  // Jan (2026-07-21, v4.12): oprava v4.10 - Bankovní výpisy appka teď
  // NESCHOVÁVÁ ani běžnému uživateli (dřív byly jen pro admina/účetní) -
  // Jan chce, aby je viděl (jen náhled, jen k firmám, které má přiřazené -
  // appka scopuje přes stejnou maPristupKFirme jako jinde, viz
  // netlify/functions/banka.js). Naopak Daňový přehled appka běžnému
  // uživateli teď SCHOVÁVÁ (byl součástí čtyř záložek z v4.10, Jan ho
  // pro běžnou roli už nechce). Admin a účetní mají obojí beze změny.
  document.getElementById('nav-prehled').classList.toggle('skryto', !jeUcetniNeboAdmin);
  // Appka pro běžnou roli navíc schová akce se zápisem v Bankovních
  // výpisech (nahrání výpisu, přepočet shod) - detail pohybu appka
  // stejně odmítne PATCHnout (viz banka.js), appka jen zbytečně
  // nenabízí ovládací prvky, které by beztak skončily chybou 403.
  const bankaAkceZapis = document.getElementById('banka-akce-zapis');
  if (bankaAkceZapis) bankaAkceZapis.classList.toggle('skryto', !jeUcetniNeboAdmin);

  // Export do Excelu (v4.28) appka omezuje na admina/účetní, stejně jako
  // export do Money S3 - Bankovní výpisy jsou jediná záložka z těch čtyř
  // s Excel exportem, kterou appka ukazuje i běžné roli (viz výš), proto
  // potřebuje vlastní schování tlačítka tady (Export/Vydané faktury mají
  // svoje schování v inicializujZalozkuExport()/inicializujZalozkuVydane
  // Faktury() - a Daňový přehled appka běžné roli schová celý, viz výš).
  const bankaExcelExport = document.getElementById('banka-excel-export');
  if (bankaExcelExport) bankaExcelExport.classList.toggle('skryto', !jeUcetniNeboAdmin);

  // Jan (2026-07-19, v4.11): běžný uživatel vidí u Dokladů jen "Ke schválení"
  // (appka mu schválené doklady stejně vůbec nevrátí z backendu - viz
  // netlify/functions/doklady.js, smiVidetDoklad) - přepínač Ke schválení/
  // Schválené appka mu proto celý schová, ať nesvádí k přepnutí na sekci,
  // která bude vždy prázdná.
  const prepinacDokladySekce = document.querySelector('#zalozka-doklady .prepinac-sekce');
  if (prepinacDokladySekce) prepinacDokladySekce.classList.toggle('skryto', !jeUcetniNeboAdmin);
  if (!jeUcetniNeboAdmin) dokladySekce = 'keSchvaleni';

  prepniZalozku('nahrat');
  spustIdleSledovani();
}

// ---------- AUTOMATICKÉ ODHLÁŠENÍ PO NEAKTIVITĚ (v4.17) ----------
// Jan: "budeš umět udělat automatické odhlášení uživatele po 5 min?" -
// appka odhlašuje podle NEAKTIVITY (ne pevný časovač od přihlášení),
// 10 s před samotným odhlášením appka zobrazí varování s odpočtem a
// tlačítkem "Zůstat přihlášen" - týká se všech rolí stejně.
const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minut
const IDLE_VAROVANI_MS = 10 * 1000; // varování 10 s před odhlášením
const IDLE_UDALOSTI = ['click', 'keydown', 'scroll', 'touchstart'];

let idleSledovaniAktivni = false;
let idleTimerVarovani = null;
let idleTimerOdpocet = null;
let idleZbyvaSekund = 0;

function spustIdleSledovani() {
  if (idleSledovaniAktivni) return; // appka posluchače přidává jen jednou
  idleSledovaniAktivni = true;
  IDLE_UDALOSTI.forEach((udalost) => {
    document.addEventListener(udalost, idleResetovatPriAktivite, { passive: true });
  });
  idleResetovatCasovac();
}

function zastavIdleSledovani() {
  idleSledovaniAktivni = false;
  IDLE_UDALOSTI.forEach((udalost) => {
    document.removeEventListener(udalost, idleResetovatPriAktivite);
  });
  clearTimeout(idleTimerVarovani);
  clearInterval(idleTimerOdpocet);
  skrytVarovaniOdhlaseni();
}

function idleResetovatPriAktivite() {
  if (!idleSledovaniAktivni) return;
  idleResetovatCasovac();
}

function idleResetovatCasovac() {
  clearTimeout(idleTimerVarovani);
  clearInterval(idleTimerOdpocet);
  skrytVarovaniOdhlaseni();
  idleTimerVarovani = setTimeout(zobrazVarovaniOdhlaseni, IDLE_LIMIT_MS - IDLE_VAROVANI_MS);
}

function zobrazVarovaniOdhlaseni() {
  const overlay = document.getElementById('varovani-odhlaseni');
  if (!overlay) return;
  overlay.classList.remove('skryto');
  idleZbyvaSekund = Math.round(IDLE_VAROVANI_MS / 1000);
  document.getElementById('varovani-odhlaseni-cas').textContent = idleZbyvaSekund;
  idleTimerOdpocet = setInterval(() => {
    idleZbyvaSekund -= 1;
    if (idleZbyvaSekund <= 0) {
      clearInterval(idleTimerOdpocet);
      odhlasit();
      return;
    }
    document.getElementById('varovani-odhlaseni-cas').textContent = idleZbyvaSekund;
  }, 1000);
}

function skrytVarovaniOdhlaseni() {
  const overlay = document.getElementById('varovani-odhlaseni');
  if (overlay) overlay.classList.add('skryto');
}

function prepniZalozku(nazev) {
  ['nahrat', 'dashboard', 'doklady', 'vydane-faktury', 'prehled', 'kniha-jizd', 'nemovitosti', 'banka', 'smlouvy', 'export', 'nastaveni'].forEach((n) => {
    document.getElementById('zalozka-' + n).classList.toggle('skryto', n !== nazev);
  });
  // v4.15 - appka tlačítko "Nahrát doklady" přesunula MIMO nav.zalozky
  // (vlastní řádek nad navigací, viz public/index.html/style.css), proto
  // appka místo `nav.zalozky button` cílí na `[data-zalozka]` - appka
  // ho drží na VŠECH záložkových tlačítkách bez ohledu na to, kde v DOM
  // zrovna appka sedí, jediný sdílený identifikátor mezi nimi.
  document.querySelectorAll('[data-zalozka]').forEach((btn) => {
    btn.classList.toggle('aktivni', btn.dataset.zalozka === nazev);
  });
  if (nazev === 'dashboard') nactiDashboard();
  if (nazev === 'doklady') nactiDoklady();
  if (nazev === 'prehled') nactiPrehled();
  if (nazev === 'vydane-faktury') inicializujZalozkuVydaneFaktury();
  if (nazev === 'kniha-jizd') nactiKnihaJizd();
  if (nazev === 'banka') inicializujZalozkuBanka();
  if (nazev === 'smlouvy') nactiSmlouvy();
  if (nazev === 'export') inicializujZalozkuExport();
  if (nazev === 'nastaveni') {
    nactiUzivatele();
    nactiFirmy();
    nactiAuta();
    nactiUcty();
    nactiStrediska();
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

// Nahrání dokladu je od v3.9 rozdělené na dvě fáze (viz netlify/functions/
// upload.js a upload-dokoncit.js pro podrobné zdůvodnění): fáze 1 jen
// bezpečně uloží soubor na Drive (rychlé, riziko timeoutu minimální), fáze
// 2 dělá pomalejší AI extrakci. Když fáze 2 selže (typicky Gemini dočasně
// přetížené), soubor NENÍ ztracený - doklad zůstává v Doklady se stavem
// "Zpracovává se" a jde ho tam kdykoli dokončit tlačítkem "Dokončit
// zpracování" (viz dokoncitZpracovaniDokladu níž), bez nutnosti cokoliv
// nahrávat znovu.
// Sestaví hlášku po dokončení AI zpracování (viz upload-dokoncit.js, v3.14
// "dalsi_doklady") - appka umí z jedné fotky/scanu s víc účtenkami vedle
// sebe vytvořit víc samostatných dokladů, tahle funkce o tom uživatele
// srozumitelně informuje, ať ho nepřekvapí, že v Dokladech najednou přibylo
// víc položek, než sám nahrál souborů.
function zpravaPoZpracovaniDokladu(odpoved) {
  const dalsi = (odpoved && odpoved.dalsiDoklady) || [];
  if (dalsi.length === 0) {
    return 'Doklad byl nahrán a zpracován. Zkontrolujte ho v záložce Přijaté faktury.';
  }
  return (
    'Appka si všimla, že je na téhle fotce/scanu víc dokladů vedle sebe - ' +
    'našla jich celkem ' + (dalsi.length + 1) + ' a založila je jako ' + (dalsi.length + 1) +
    ' samostatné položky. Zkontrolujte je prosím všechny v záložce Přijaté faktury.'
  );
}

async function nahratDoklad() {
  const zprava = document.getElementById('nahrat-zprava');
  const tlacitko = document.getElementById('tlacitko-nahrat');
  if (!vybranySoubor) return;

  tlacitko.disabled = true;
  zprava.innerHTML = '<div class="zprava">Nahrávám soubor…</div>';

  let doklad;
  try {
    const odpoved = await zavolejApi('/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: vybranySoubor.nazev,
        mimeType: vybranySoubor.mimeType,
        dataBase64: vybranySoubor.data,
      }),
    });
    doklad = odpoved.doklad;
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">Soubor se nepodařilo nahrát: ' + escapeHtml(e.message) + '</div>';
    tlacitko.disabled = !vybranySoubor;
    return;
  }

  // Soubor je bezpečně uložený - vyčistíme výběr souboru hned, appka ho
  // dál nepotřebuje (fáze 2 si soubor stáhne z Drive sama).
  document.getElementById('pole-soubor').value = '';
  document.getElementById('pole-foto').value = '';
  document.getElementById('vybrany-soubor-info').textContent = '';
  vybranySoubor = null;
  tlacitko.disabled = true;

  zprava.innerHTML = '<div class="zprava">Soubor nahrán, appka na pozadí čte údaje pomocí AI (může trvat několik vteřin)…</div>';
  try {
    const odpovedDokonceni = await zavolejApi('/upload-dokoncit', { method: 'POST', body: JSON.stringify({ id: doklad.ID }) });
    zprava.innerHTML =
      '<div class="zprava uspech">' + zpravaPoZpracovaniDokladu(odpovedDokonceni) + '</div>';
  } catch (e) {
    zprava.innerHTML =
      '<div class="zprava info">Soubor byl bezpečně nahrán, ale zpracování údajů pomocí AI se teď nepovedlo ' +
      '(' + escapeHtml(e.message) + '). Nic jste neztratili - doklad najdete v záložce Přijaté faktury se stavem ' +
      '„Zpracovává se“ a zpracování jde odtud kdykoli zopakovat tlačítkem „Dokončit zpracování“, ' +
      'bez nutnosti cokoliv nahrávat znovu.</div>';
  } finally {
    tlacitko.disabled = !vybranySoubor;
  }
}

async function dokoncitZpracovaniDokladu(id, tlacitko) {
  tlacitko.disabled = true;
  const puvodniText = tlacitko.textContent;
  tlacitko.textContent = 'Zpracovávám…';
  try {
    const odpoved = await zavolejApi('/upload-dokoncit', { method: 'POST', body: JSON.stringify({ id }) });
    const idx = dokladySeznamAktualni.findIndex((d) => d.ID === id);
    if (idx !== -1) {
      Object.assign(dokladySeznamAktualni[idx], odpoved.doklad);
    }
    // v3.14 - appka mohla z jedné fotky/scanu založit i další samostatné
    // doklady (viz zpravaPoZpracovaniDokladu výš) - appka je připojí do
    // aktuálního seznamu, ať se rovnou zobrazí bez nutnosti ručně obnovit.
    ((odpoved && odpoved.dalsiDoklady) || []).forEach((d) => dokladySeznamAktualni.push(d));
    vykresliDoklady(dokladySeznamAktualni);
    zobrazZpravuDoklady(zpravaPoZpracovaniDokladu(odpoved));
  } catch (e) {
    alert(
      'Zpracování se zatím nepovedlo (' + e.message + '). Soubor zůstává bezpečně uložený, zkuste to prosím ' +
      'za chvíli znovu.'
    );
    tlacitko.disabled = false;
    tlacitko.textContent = puvodniText;
  }
}

// ---------- SEZNAM DOKLADŮ ----------

function stavTrida(stavText) {
  if (stavText === 'Schváleno') return 'stav-schvaleno';
  if (stavText === 'Možná duplicita') return 'stav-duplicita';
  if (stavText === 'Zpracovává se') return 'stav-zpracovava';
  return 'stav-ke-kontrole';
}

// Badge u SCHVÁLENÉHO dokladu, jestli k němu appka našla/potvrdila
// odpovídající bankovní pohyb (v3.16) - appka pole `Stav_parovani_bankou`
// dopočítá na backendu při GET /doklady (viz netlify/functions/doklady.js),
// porovnáním s listem Bankovni_pohyby. U dokladů hrazených mimo účet
// (hotově/soukromou kartou) appka záměrně neukazuje "Nespárováno" - takový
// doklad protějšek v bance nikdy mít nebude, takže by to jen zbytečně
// vypadalo jako problém. U nechválených dokladů appka badge vůbec
// nezobrazuje - párování dává smysl kontrolovat až u vyřízených dokladů.
// Znovupoužívá stejné CSS třídy jako badge u Bankovních výpisů
// (badge-potvrzeno/navrzeno/chybi/bezdokladu), ať appka vizuálně nezavádí
// další paletu barev jen pro tohle.
function bankSparovaniBadge(d) {
  if (d.Stav !== 'Schváleno') return '';
  if (String(d.Hrazeno_mimo_ucet || '').trim() === 'ANO') {
    return '<span class="badge-bezdokladu" title="Doklad je označený jako hrazený mimo účet - appka u něj protějšek v bance nehledá">Mimo účet</span>';
  }
  if (d.Stav_parovani_bankou === 'Potvrzeno') {
    return '<span class="badge-potvrzeno" title="Appka našla a účetní potvrdila odpovídající bankovní pohyb">Spárováno s bankou</span>';
  }
  if (d.Stav_parovani_bankou === 'Navrženo') {
    return '<span class="badge-navrzeno" title="Appka navrhla odpovídající bankovní pohyb, čeká na potvrzení v záložce Bankovní výpisy">Navrženo spárování</span>';
  }
  return '<span class="badge-chybi" title="K tomuhle dokladu appka zatím nenašla odpovídající bankovní pohyb v Bankovních výpisech">Nespárováno s bankou</span>';
}

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
    const [dataDoklady, dataFirmy, dataStrediska] = await Promise.all([
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
    ]);
    firmyProVyberDokladu = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    strediskaSeznam = dataStrediska.strediska || [];
    nacitani.classList.add('skryto');
    vykresliDoklady(dataDoklady.doklady || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst doklady: ' + e.message;
  }
}

function prepniDokladySekci(sekce) {
  dokladySekce = sekce;
  // Scoped jen na tuhle záložku (#zalozka-doklady) - od v3.21 mají stejnou
  // CSS třídu ".prepinac-sekce-tlacitko" i přepínače v záložce Registr smluv
  // (Aktivní/Neaktivní), obecný dotaz přes celou stránku by jim omylem
  // sebral zvýraznění výběru.
  document.querySelectorAll('#zalozka-doklady .prepinac-sekce-tlacitko').forEach((btn) => {
    btn.classList.toggle('aktivni', btn.dataset.sekce === sekce);
  });
  vykresliDoklady(dokladySeznamAktualni);
}

// Firma se vybírá z číselníku (list Firmy), ne ručním opisem - jinak by
// se sebemenší překlep (velká/malá písmena, mezera navíc, „&“ vs. „and“...)
// projevil jako appka nenajde odpovídající doklady při párování bankovního
// výpisu (banka.js hledá kandidáty přes přesnou shodu názvu firmy).
// Vytáhnuto (v3.21) do vlastní funkce se seznamem firem jako parametrem -
// stejnou logiku appka teď potřebuje i pro výběr Firmy u Smlouvy (viz
// vytvorDetailSmlouva níž), který má vlastní seznam firem
// (firmyProVyberSmlouvy), ne firmyProVyberDokladu.
function moznostiFirmySeznam(seznamFirem, vybranaFirma) {
  const zname = seznamFirem.includes(vybranaFirma);
  let html = '<option value="">— vyberte firmu —</option>';
  seznamFirem.forEach((nazev) => {
    const oznaceno = nazev === vybranaFirma ? ' selected' : '';
    html += '<option value="' + escapeAttr(nazev) + '"' + oznaceno + '>' + escapeHtml(nazev) + '</option>';
  });
  if (vybranaFirma && !zname) {
    html += '<option value="' + escapeAttr(vybranaFirma) + '" selected>' + escapeHtml(vybranaFirma) + ' (není v seznamu Firmy)</option>';
  }
  return html;
}

function moznostiFirmy(vybranaFirma) {
  return moznostiFirmySeznam(firmyProVyberDokladu, vybranaFirma);
}

// Číselník Středisko - konkrétní auta a nemovitosti skupiny Nomis Group
// (od v3.6, dřív jen obecné "Auta"/"Nemovitosti"). Používá se u Dokladů
// (náklady), proto jsou nemovitosti, kde appka náklady eviduje na celou
// jednotku (Holečkova se rozděluje na nájemníky, ale náklady na byt/garáž
// jako celek nikoli), uvedené v HRUBŠÍM členění než MOZNOSTI_JEDNOTKA níž
// (ta se používá u Vydaných faktur/nájmů, kde se platí zvlášť za 1a/1b apod.).
//
// Od v4.25 (Jan: "jak mám přidat nové středisko?" → "verze 2") appka Středisko
// nedrží natvrdo v kódu, ale jako spravovatelný list "Strediska" v Sheets
// (viz lib/strediskaSchema.js, netlify/functions/strediska.js) - admin ho
// spravuje přímo v appce (záložka Nastavení), stejně jako Firmy/Auta/Účty.
// `strediskaSeznam` drží poslední načtená data (pole objektů {Nazev, Typ,
// Aktivni, _row}) - jednotlivé záložky (Doklady/Export/Banka/Smlouvy/Kniha
// jízd) si ho načítají čerstvé při každém otevření (stejný vzor jako appka
// dělá u firem - viz firmyProVyberDokladu apod.), moznostiStrediska()/
// moznostiAuta() z něj pak sestaví <option>y.
let strediskaSeznam = [];

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

// Appka do nabídky zařadí jen aktivní střediska (Aktivni !== 'NE') - už
// vybraná/uložená hodnota (i deaktivovaná, i úplně smazaná) se ale díky
// fallbacku níž pořád zobrazí, ať appka nikdy "nezakryje" existující údaj.
function moznostiStrediska(vybrane) {
  const nazvy = strediskaSeznam.filter((s) => s.Aktivni !== 'NE').map((s) => s.Nazev);
  let html = '<option value="">— bez střediska —</option>';
  nazvy.forEach((s) => {
    const oznaceno = s === vybrane ? ' selected' : '';
    html += '<option value="' + escapeAttr(s) + '"' + oznaceno + '>' + escapeHtml(s) + '</option>';
  });
  if (vybrane && !nazvy.includes(vybrane)) {
    html += '<option value="' + escapeAttr(vybrane) + '" selected>' + escapeHtml(vybrane) + '</option>';
  }
  return html;
}

// Kniha jízd (backlog, položka 16) - "Auto" appka schválně nabízí ze
// STEJNÉHO číselníku jako Středisko (položky s Typ === 'Auto'), ne ze
// samostatné entity Auta (SPZ/Model/Firma/Ridic, viz netlify/functions/
// auta.js) - appka totiž u Dokladů/tankování pozná auto přes Středisko
// (od v3.8 nemá vlastní SPZ pole), takže spárování jízd s tankováním jde
// nejjednodušeji přes stejný řetězec, bez překladu mezi dvěma číselníky.
function moznostiAuta(vybrane) {
  const auta = strediskaSeznam.filter((s) => s.Typ === 'Auto' && s.Aktivni !== 'NE').map((s) => s.Nazev);
  let html = '<option value="">— vyberte auto —</option>';
  auta.forEach((a) => {
    const oznaceno = a === vybrane ? ' selected' : '';
    html += '<option value="' + escapeAttr(a) + '"' + oznaceno + '>' + escapeHtml(a) + '</option>';
  });
  if (vybrane && !auta.includes(vybrane)) {
    html += '<option value="' + escapeAttr(vybrane) + '" selected>' + escapeHtml(vybrane) + '</option>';
  }
  return html;
}

// Číselník Kategorie (od v3.15) - Kategorie byla dřív obyčejné textové pole
// (ruční opis, nebo AI odhad), což u součtů v Přehledu snadno vedlo k tomu,
// že stejný typ nákladu skončil pod víc mírně odlišnými řetězci (např.
// "Palivo" vs. "palivo" vs. "Pohonné hmoty") a rozpadl se tak v souhrnu na
// víc řádků místo jednoho. Appka teď nabízí pevný seznam - stejný vzor jako
// MOZNOSTI_STREDISKA výš (viz moznostiKategorie níž): pokud už existující
// doklad má kategorii, která v číselníku není (starší/ruční zápis), appka ji
// pořád zobrazí jako dodatečnou možnost, ať se žádná stará data neztratí.
// Prompt pro Gemini (lib/gemini.js) dostává TENTÝŽ seznam, ať AI odhad
// rovnou padne do číselníku a nevzniká zbytečně "cizí" hodnota navíc.
const MOZNOSTI_KATEGORIE = [
  'Palivo',
  'Servis a opravy vozidla',
  'Pojištění',
  'Energie (elektřina, plyn, voda)',
  'Nájem',
  'Opravy a údržba nemovitosti',
  'Telekomunikace a internet',
  'Kancelářské potřeby',
  'Software a IT služby',
  'Účetní a právní služby',
  'Bankovní poplatky',
  'Daně a poplatky',
  'Cestovné',
  'Marketing a reklama',
  'Služby',
  'Ostatní',
];

function moznostiKategorie(vybrane) {
  let html = '<option value="">— vyberte kategorii —</option>';
  MOZNOSTI_KATEGORIE.forEach((k) => {
    const oznaceno = k === vybrane ? ' selected' : '';
    html += '<option value="' + escapeAttr(k) + '"' + oznaceno + '>' + escapeHtml(k) + '</option>';
  });
  if (vybrane && !MOZNOSTI_KATEGORIE.includes(vybrane)) {
    html += '<option value="' + escapeAttr(vybrane) + '" selected>' + escapeHtml(vybrane) + ' (není v seznamu)</option>';
  }
  return html;
}

// Číselník Typ/Perioda u Smluv (trvalé příkazy, od v3.19) - VLASTNÍ menší
// číselník, ne stejný jako MOZNOSTI_KATEGORIE výš - smlouvy mají jiný
// charakter (souhrnné/opakované platby), viz lib/smlouvySchema.js na
// backendu (appka appka tenhle seznam duplikuje na obou místech stejně
// jako u MOZNOSTI_STREDISKA/MOZNOSTI_KATEGORIE - žádný build krok/sdílený
// modul mezi frontendem a backendem).
const MOZNOSTI_TYP_SMLOUVY = ['Nájem', 'Energie', 'Leasing', 'Ostatní'];
const MOZNOSTI_PERIODA_SMLOUVY = ['Měsíčně', 'Čtvrtletně', 'Ročně', 'Jednorázově'];

function moznostiTypSmlouvy(vybrane) {
  let html = '<option value="">— vyberte typ —</option>';
  MOZNOSTI_TYP_SMLOUVY.forEach((t) => {
    const oznaceno = t === vybrane ? ' selected' : '';
    html += '<option value="' + escapeAttr(t) + '"' + oznaceno + '>' + escapeHtml(t) + '</option>';
  });
  if (vybrane && !MOZNOSTI_TYP_SMLOUVY.includes(vybrane)) {
    html += '<option value="' + escapeAttr(vybrane) + '" selected>' + escapeHtml(vybrane) + '</option>';
  }
  return html;
}

function moznostiPeriodaSmlouvy(vybrane) {
  let html = '<option value="">— vyberte periodu —</option>';
  MOZNOSTI_PERIODA_SMLOUVY.forEach((p) => {
    const oznaceno = p === vybrane ? ' selected' : '';
    html += '<option value="' + escapeAttr(p) + '"' + oznaceno + '>' + escapeHtml(p) + '</option>';
  });
  if (vybrane && !MOZNOSTI_PERIODA_SMLOUVY.includes(vybrane)) {
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
// Sdílená sekce "Položky" (od v4.27, export do Money S3, viz lib/
// dokladyPolozkySchema.js) - appka ji vkládá do detailu Dokladu i Vydané
// faktury (jen jiné API cesty/parametry, viz volání níž). Tabulka
// zobrazuje/edituje jednotlivé řádky (Nazev/Mnozstvi/Cena/SazbaDPH), pod ní
// mini-formulář na přidání nové položky a (má-li doklad/faktura zdrojový
// soubor) tlačítko "Vytěžit položky ze souboru" - to znovu pošle uložený
// soubor přes AI JEN kvůli položkám, beze změny ostatních (už zkontrolovaných/
// schválených) polí dokladu/faktury (viz netlify/functions/doklady-vytezit-
// polozky.js).
//
// `opts.zamceno` (true u dokladu/faktury, které už appka nedovolí běžnému
// uživateli editovat - Schváleno/Uhrazeno) appka schová formulář na přidání
// i tlačítko vytěžení a zablokuje vstupy v tabulce - stejné omezení jako u
// hlavičkových polí (backend by stejně vrátil 403, tohle je jen rovnou
// srozumitelnější UI).
function vytvorSekciPolozek(opts) {
  const sekce = document.createElement('div');
  sekce.className = 'polozky-sekce';

  const nadpis = document.createElement('h4');
  nadpis.textContent = 'Položky (pro export do Money S3)';
  sekce.appendChild(nadpis);

  const tabulkaWrap = document.createElement('div');
  tabulkaWrap.innerHTML = '<div class="nacitani">Načítám položky…</div>';
  sekce.appendChild(tabulkaWrap);

  let aktualniPolozky = [];

  async function nacti() {
    try {
      aktualniPolozky = await opts.ziskejPolozky();
      prekresliTabulku();
    } catch (e) {
      tabulkaWrap.innerHTML = '<div class="zprava chyba">Nepodařilo se načíst položky: ' + escapeHtml(e.message) + '</div>';
    }
  }

  function prekresliTabulku() {
    if (aktualniPolozky.length === 0) {
      tabulkaWrap.innerHTML = '<div class="nacitani">Zatím žádné položky.</div>';
      return;
    }
    const tabulka = document.createElement('table');
    tabulka.className = 'polozky-tabulka';
    tabulka.innerHTML =
      '<thead><tr><th>Název</th><th>Množství</th><th>Cena/ks bez DPH</th><th>DPH %</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');

    aktualniPolozky.forEach((p) => {
      const tr = document.createElement('tr');

      const vstupNazev = document.createElement('input');
      vstupNazev.type = 'text';
      vstupNazev.value = p.Nazev || '';
      vstupNazev.disabled = !!opts.zamceno;

      const vstupMnozstvi = document.createElement('input');
      vstupMnozstvi.type = 'number';
      vstupMnozstvi.step = '0.01';
      vstupMnozstvi.value = p.Mnozstvi !== undefined && p.Mnozstvi !== '' ? p.Mnozstvi : 1;
      vstupMnozstvi.style.width = '70px';
      vstupMnozstvi.disabled = !!opts.zamceno;

      const vstupCena = document.createElement('input');
      vstupCena.type = 'number';
      vstupCena.step = '0.01';
      vstupCena.value = p.Cena !== undefined && p.Cena !== '' ? p.Cena : 0;
      vstupCena.style.width = '90px';
      vstupCena.disabled = !!opts.zamceno;

      const vstupSazba = document.createElement('input');
      vstupSazba.type = 'text';
      vstupSazba.value = p.SazbaDPH || '';
      vstupSazba.style.width = '50px';
      vstupSazba.disabled = !!opts.zamceno;

      [vstupNazev, vstupMnozstvi, vstupCena, vstupSazba].forEach((vstup) => {
        const td = document.createElement('td');
        td.appendChild(vstup);
        tr.appendChild(td);
      });

      const tdAkce = document.createElement('td');
      if (!opts.zamceno) {
        const tlacitkoUlozit = document.createElement('button');
        tlacitkoUlozit.className = 'maly sekundarni';
        tlacitkoUlozit.textContent = 'Uložit';
        tlacitkoUlozit.onclick = async () => {
          tlacitkoUlozit.disabled = true;
          try {
            await opts.upravitPolozku(p.ID, {
              Nazev: vstupNazev.value.trim(),
              Mnozstvi: vstupMnozstvi.value,
              Cena: vstupCena.value,
              SazbaDPH: vstupSazba.value.trim(),
            });
          } catch (e) {
            alert('Nepodařilo se uložit položku: ' + e.message);
          }
          tlacitkoUlozit.disabled = false;
        };
        tdAkce.appendChild(tlacitkoUlozit);

        const tlacitkoSmazat = document.createElement('button');
        tlacitkoSmazat.className = 'maly sekundarni';
        tlacitkoSmazat.textContent = 'Smazat';
        tlacitkoSmazat.onclick = async () => {
          if (!confirm('Smazat položku „' + (p.Nazev || '(bez názvu)') + '“?')) return;
          tlacitkoSmazat.disabled = true;
          try {
            await opts.smazatPolozku(p.ID);
            await nacti();
          } catch (e) {
            alert('Nepodařilo se smazat položku: ' + e.message);
            tlacitkoSmazat.disabled = false;
          }
        };
        tdAkce.appendChild(tlacitkoSmazat);
      }
      tr.appendChild(tdAkce);

      tbody.appendChild(tr);
    });

    tabulka.appendChild(tbody);
    tabulkaWrap.innerHTML = '';
    tabulkaWrap.appendChild(tabulka);
  }

  if (!opts.zamceno) {
    const pridatForm = document.createElement('div');
    pridatForm.className = 'polozky-pridat';

    const vstupNazev = document.createElement('input');
    vstupNazev.type = 'text';
    vstupNazev.placeholder = 'Název položky';

    const vstupMnozstvi = document.createElement('input');
    vstupMnozstvi.type = 'number';
    vstupMnozstvi.step = '0.01';
    vstupMnozstvi.placeholder = 'Množství';
    vstupMnozstvi.value = '1';
    vstupMnozstvi.style.maxWidth = '90px';

    const vstupCena = document.createElement('input');
    vstupCena.type = 'number';
    vstupCena.step = '0.01';
    vstupCena.placeholder = 'Cena/ks bez DPH';
    vstupCena.style.maxWidth = '130px';

    const vstupSazba = document.createElement('input');
    vstupSazba.type = 'text';
    vstupSazba.placeholder = 'DPH %';
    vstupSazba.style.maxWidth = '70px';

    const tlacitkoPridat = document.createElement('button');
    tlacitkoPridat.className = 'maly';
    tlacitkoPridat.textContent = 'Přidat položku';
    tlacitkoPridat.onclick = async () => {
      if (!vstupNazev.value.trim()) {
        alert('Vyplňte název položky.');
        return;
      }
      tlacitkoPridat.disabled = true;
      try {
        await opts.pridatPolozku({
          nazev: vstupNazev.value.trim(),
          mnozstvi: vstupMnozstvi.value,
          cena: vstupCena.value,
          sazba_dph: vstupSazba.value.trim(),
        });
        vstupNazev.value = '';
        vstupMnozstvi.value = '1';
        vstupCena.value = '';
        vstupSazba.value = '';
        await nacti();
      } catch (e) {
        alert('Nepodařilo se přidat položku: ' + e.message);
      }
      tlacitkoPridat.disabled = false;
    };

    pridatForm.appendChild(vstupNazev);
    pridatForm.appendChild(vstupMnozstvi);
    pridatForm.appendChild(vstupCena);
    pridatForm.appendChild(vstupSazba);
    pridatForm.appendChild(tlacitkoPridat);
    sekce.appendChild(pridatForm);
  }

  if (opts.maZdrojovySoubor && opts.vytezitZeSouboru && !opts.zamceno) {
    const akceVytezeni = document.createElement('div');
    akceVytezeni.className = 'radek-akci';
    const tlacitkoVytezit = document.createElement('button');
    tlacitkoVytezit.className = 'maly sekundarni';
    tlacitkoVytezit.textContent = 'Vytěžit položky ze souboru';
    tlacitkoVytezit.title =
      'Znovu pošle uložený zdrojový soubor přes AI jen kvůli doplnění/aktualizaci položek - ostatní ' +
      'údaje dokladu/faktury se NEZMĚNÍ.';
    tlacitkoVytezit.onclick = async () => {
      if (!confirm('Zpětně vytěžit položky ze zdrojového souboru? Stávající položky budou nahrazeny nově vytěženými.')) return;
      tlacitkoVytezit.disabled = true;
      const puvodniText = tlacitkoVytezit.textContent;
      tlacitkoVytezit.textContent = 'Vytěžuji…';
      try {
        await opts.vytezitZeSouboru();
        await nacti();
      } catch (e) {
        alert('Nepodařilo se vytěžit položky: ' + e.message);
      }
      tlacitkoVytezit.textContent = puvodniText;
      tlacitkoVytezit.disabled = false;
    };
    akceVytezeni.appendChild(tlacitkoVytezit);
    sekce.appendChild(akceVytezeni);
  }

  nacti();

  return sekce;
}

function vytvorRadekDoklad(d) {
  const radek = document.createElement('div');
  radek.className = 'doklad-radek radek-' + stavTrida(d.Stav);

  const hlava = document.createElement('div');
  hlava.className = 'doklad-radek-hlava';
  hlava.innerHTML =
    '<span class="doklad-sipka">▶</span>' +
    '<span class="stav-chip ' + stavTrida(d.Stav) + '">' + escapeHtml(d.Stav || '') + '</span>' +
    bankSparovaniBadge(d) +
    '<span class="dodavatel">' +
      escapeHtml(d.Stav === 'Zpracovává se' ? '(čeká na zpracování)' : (d.Dodavatel || '(bez dodavatele)')) +
    '</span>' +
    '<span>' + escapeHtml(d.Datum_dokladu || '') + '</span>' +
    '<span class="castka">' + (d.Stav === 'Zpracovává se' ? '' : formatCastkaSMenou(d.Castka, d.Mena)) + '</span>';

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

  // Doklad ve fázi 1 (soubor uložený, AI zpracování ještě neproběhlo/se
  // nepovedlo) - místo editace prázdných polí appka rovnou nabídne
  // dokončení zpracování (viz dokoncitZpracovaniDokladu výš).
  if (d.Stav === 'Zpracovává se') {
    const info = document.createElement('div');
    info.className = 'zprava info';
    info.textContent =
      'Soubor je bezpečně uložený, AI zpracování údajů ještě neproběhlo (nebo se dřív nepovedlo kvůli ' +
      'dočasnému přetížení). Dokončete ho tlačítkem níž - nic nemusíte nahrávat znovu.';
    wrap.appendChild(info);

    const akce = document.createElement('div');
    akce.className = 'radek-akci';
    const tlacitkoDokoncit = document.createElement('button');
    tlacitkoDokoncit.className = 'maly';
    tlacitkoDokoncit.textContent = 'Dokončit zpracování';
    tlacitkoDokoncit.onclick = () => dokoncitZpracovaniDokladu(d.ID, tlacitkoDokoncit);
    akce.appendChild(tlacitkoDokoncit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazDoklad(d.ID, d.Dodavatel, tlacitkoSmazat);
    akce.appendChild(tlacitkoSmazat);
    wrap.appendChild(akce);

    if (d.Zdrojovy_soubor_URL) {
      const souborDiv = document.createElement('div');
      souborDiv.style.marginTop = '12px';
      souborDiv.innerHTML = 'Soubor: <a href="' + escapeAttr(d.Zdrojovy_soubor_URL) + '" target="_blank" rel="noopener">otevřít</a>';
      wrap.appendChild(souborDiv);
    }

    return wrap;
  }

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

  // DPH/Sazba_DPH (od v4.6, viz claude/nomis-faktury-backlog.md, položka 9) -
  // appka pole nabízí jako AI odhad ze zpracování dokladu + ruční kontrolu,
  // stejná konvence jako ostatní vytěžovaná pole. Používá se jen u firem
  // plátců DPH (dnes NOMIS Investment) pro měsíční DPH bilanci v Daňovém
  // přehledu - u ostatních firem se pole dají klidně nechat prázdná.
  const labelDph = document.createElement('label');
  labelDph.textContent = 'DPH (částka) a sazba (%)';
  const vstupDph = document.createElement('input');
  vstupDph.type = 'number';
  vstupDph.step = '0.01';
  vstupDph.value = d.DPH !== undefined && d.DPH !== '' ? parsujCastkuZListu(d.DPH) : '';
  vstupDph.style.marginBottom = '6px';
  const vstupSazbaDph = document.createElement('input');
  vstupSazbaDph.type = 'text';
  vstupSazbaDph.value = d.Sazba_DPH || '';
  vstupSazbaDph.style.maxWidth = '90px';
  wrap.appendChild(labelDph);
  wrap.appendChild(vstupDph);
  wrap.appendChild(vstupSazbaDph);

  const labelFirma = document.createElement('label');
  labelFirma.textContent = 'Firma';
  const vstupFirma = document.createElement('select');
  vstupFirma.innerHTML = moznostiFirmy(d.Firma_potvrzena || d.Firma_AI_odhad || '');
  wrap.appendChild(labelFirma);
  wrap.appendChild(vstupFirma);

  const labelKategorie = document.createElement('label');
  labelKategorie.textContent = 'Kategorie';
  const vstupKategorie = document.createElement('select');
  vstupKategorie.innerHTML = moznostiKategorie(d.Kategorie || '');
  wrap.appendChild(labelKategorie);
  wrap.appendChild(vstupKategorie);

  const labelStredisko = document.createElement('label');
  labelStredisko.textContent = 'Středisko';
  const vstupStredisko = document.createElement('select');
  vstupStredisko.innerHTML = moznostiStrediska(d.Stredisko || '');
  wrap.appendChild(labelStredisko);
  wrap.appendChild(vstupStredisko);
  // Pozn.: samostatné pole SPZ bylo od v3.8 zrušené - konkrétní auto je
  // teď součástí Střediska (např. "Auto - Tesla"), takže by šlo o
  // duplicitní údaj. Sloupec SPZ_auta v Sheets zůstává beze změny kvůli
  // starším záznamům, appka do něj jen nově nezapisuje z týhle záložky.

  // Mnozstvi_litru/Druh_paliva (od backlogu, položka 16) - appka je vytěží
  // AI odhadem jen u Kategorie "Palivo" (viz lib/gemini.js), tady jde jen o
  // ruční kontrolu/opravu, stejná konvence jako u DPH výše. Slouží k Knize
  // jízd (záložka Kniha jízd) - appka podle Střediska (auta) a měsíce
  // spočítá průměrnou spotřebu.
  const labelPalivo = document.createElement('label');
  labelPalivo.textContent = 'Palivo - litry a druh';
  const vstupLitry = document.createElement('input');
  vstupLitry.type = 'number';
  vstupLitry.step = '0.01';
  vstupLitry.value = d.Mnozstvi_litru !== undefined && d.Mnozstvi_litru !== '' ? parsujCastkuZListu(d.Mnozstvi_litru) : '';
  vstupLitry.style.marginBottom = '6px';
  vstupLitry.placeholder = 'litry';
  const vstupDruhPaliva = document.createElement('input');
  vstupDruhPaliva.type = 'text';
  vstupDruhPaliva.value = d.Druh_paliva || '';
  vstupDruhPaliva.placeholder = 'druh paliva (Nafta/Benzín…)';
  wrap.appendChild(labelPalivo);
  wrap.appendChild(vstupLitry);
  wrap.appendChild(vstupDruhPaliva);

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

  // Položky (od v4.27, export do Money S3) - viz vytvorSekciPolozek výš.
  // Zamčeno (jen zobrazení, bez editace/přidání/vytěžení) běžnému uživateli
  // u už SCHVÁLENÉHO dokladu - stejné omezení jako u hlavičkových polí
  // (netlify/functions/doklady-polozky.js/doklady-vytezit-polozky.js by
  // stejně vrátily 403, tohle je jen rovnou srozumitelnější UI).
  const zamcenoPolozkyDokladu = !(stav.role === 'admin' || stav.role === 'ucetni') && d.Stav === 'Schváleno';
  wrap.appendChild(vytvorSekciPolozek({
    zamceno: zamcenoPolozkyDokladu,
    maZdrojovySoubor: !!d.Zdrojovy_soubor_ID,
    ziskejPolozky: async () => (await zavolejApi('/doklady-polozky?doklad_id=' + encodeURIComponent(d.ID))).polozky,
    pridatPolozku: async (data) =>
      zavolejApi('/doklady-polozky', { method: 'POST', body: JSON.stringify(Object.assign({ doklad_id: d.ID }, data)) }),
    upravitPolozku: async (id, zmeny) => zavolejApi('/doklady-polozky', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) }),
    smazatPolozku: async (id) => zavolejApi('/doklady-polozky?id=' + encodeURIComponent(id), { method: 'DELETE' }),
    vytezitZeSouboru: async () => zavolejApi('/doklady-vytezit-polozky', { method: 'POST', body: JSON.stringify({ id: d.ID }) }),
  }));

  function ziskejZmeny() {
    return {
      Dodavatel: vstupDodavatel.value.trim(),
      Datum_dokladu: vstupDatum.value,
      Castka: vstupCastka.value,
      Mena: vstupMena.value.trim(),
      DPH: vstupDph.value,
      Sazba_DPH: vstupSazbaDph.value.trim(),
      Firma_potvrzena: vstupFirma.value.trim(),
      Kategorie: vstupKategorie.value.trim(),
      Stredisko: vstupStredisko.value.trim(),
      Mnozstvi_litru: vstupLitry.value,
      Druh_paliva: vstupDruhPaliva.value.trim(),
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

  // Jan (2026-07-19, v4.11): tlačítko "Schválit" appka ukáže jen adminovi
  // a účetní - běžný uživatel doklad smí jen opravit ("Uložit"), samotné
  // schválení zůstává na adminovi/účetní (viz netlify/functions/doklady.js,
  // PATCH - appka by stejně vrátila 403, kdyby to zkusil obejít).
  const jeUcetniNeboAdminDoklad = stav.role === 'admin' || stav.role === 'ucetni';
  if (d.Stav !== 'Schváleno' && jeUcetniNeboAdminDoklad) {
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

  // Jan (2026-07-19, v4.11): "Smazat" appka běžnému uživateli ukáže jen u
  // dokladu, který sám nahrál (Nahral_uzivatel) - admin/účetní mažou beze
  // změny cokoli v rámci svých firem (viz netlify/functions/doklady.js,
  // DELETE, stejná podmínka).
  if (jeUcetniNeboAdminDoklad || d.Nahral_uzivatel === stav.jmeno) {
    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazDoklad(d.ID, d.Dodavatel, tlacitkoSmazat);
    akce.appendChild(tlacitkoSmazat);
  }

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

// ---------- DASHBOARD (od v3.22) ----------
// Na rozdíl od Přehledu plateb (jeden souhrn napříč všemi firmami dohromady,
// viz nactiPrehled níž) appka tady ukazuje VŠECHNY viditelné firmy VEDLE
// SEBE, každou jako samostatnou kartu - viz netlify/functions/dashboard-firmy.js.

// Od v4.26 (Jan: "v dashboard pracuje v Kč ale u některých firem jsou to
// EUR, musí rozlišit měnu") - backend (netlify/functions/dashboard-firmy.js)
// appce teď vrací příjmy/výdaje/rozdíl i rozpad podle střediska jako mapu
// MĚNA -> ČÁSTKA místo jednoho čísla - appka měny NIKDY nesčítá dohromady
// (nemá k dispozici kurzovní lístek), jen je zobrazí VEDLE SEBE. `soucetMen`
// níž appka používá VÝHRADNĚ pro seřazení položek podle řádové velikosti
// (typicky středisko/firma reálně používá jen jednu měnu) - jde čistě o
// pořadí zobrazení, ne o částku, kterou by appka někde ukázala.
function soucetMen(podleMeny) {
  return Object.values(podleMeny || {}).reduce((soucet, hodnota) => soucet + Math.abs(hodnota || 0), 0);
}

// Appka řadí měny uvnitř jedné položky CZK první, ostatní abecedně - ať
// appka nezobrazuje pořadí měn nahodile podle toho, v jakém pořadí appka
// položky v Sheets/JS objektu potkala.
function serazeneMeny(podleMeny) {
  return Object.keys(podleMeny || {}).sort((a, b) => {
    if (a === 'CZK') return -1;
    if (b === 'CZK') return 1;
    return a.localeCompare(b);
  });
}

function vykresliDashSouhrnStredisek(souhrn) {
  const zaznamy = Object.entries(souhrn || {}).sort((a, b) => soucetMen(b[1]) - soucetMen(a[1]));
  if (zaznamy.length === 0) return '<div class="popis" style="margin:0">Žádná data.</div>';
  return zaznamy
    .map(([klic, podleMeny]) => {
      const castkyText = serazeneMeny(podleMeny)
        .map((mena) => formatCastkaSMenou(podleMeny[mena], mena))
        .join(' + ');
      return '<div class="polozka-souhrn"><span>' + escapeHtml(klic) + '</span><strong>' + castkyText + '</strong></div>';
    })
    .join('');
}

// Appka vykreslí jeden řádek na měnu (u naprosté většiny firem jen jednu -
// CZK - appka řádek s měnou v závorce přidává jen když firma má víc než
// jednu měnu, ať appka běžný jednoduchý případ zbytečně nezahlcuje popiskem
// "(CZK)"). `tridaFn` appka používá jen u řádku Rozdíl (barevné rozlišení
// kladný/záporný), jinak appka žádnou třídu nepřidává.
function radkySouhrnPodleMeny(popis, podleMeny, tridaFn) {
  const meny = serazeneMeny(podleMeny).length > 0 ? serazeneMeny(podleMeny) : ['CZK'];
  return meny
    .map((mena) => {
      const hodnota = (podleMeny || {})[mena] || 0;
      const trida = tridaFn ? tridaFn(hodnota) : '';
      return (
        '<div class="polozka-souhrn"><span>' + escapeHtml(popis) + (meny.length > 1 ? ' (' + mena + ')' : '') + '</span>' +
        '<strong' + (trida ? ' class="' + trida + '"' : '') + '>' + formatCastkaSMenou(hodnota, mena) + '</strong></div>'
      );
    })
    .join('');
}

function vytvorDashFirmaKarta(f) {
  const karta = document.createElement('div');
  karta.className = 'dash-firma-karta';

  let html =
    '<h3>' + escapeHtml(f.firma) + '</h3>' +
    radkySouhrnPodleMeny('Příjmy (12 měsíců)', f.prijmyPodleMeny) +
    radkySouhrnPodleMeny('Výdaje (12 měsíců)', f.vydajePodleMeny) +
    radkySouhrnPodleMeny('Rozdíl', f.rozdilPodleMeny, (hodnota) => (hodnota >= 0 ? 'rozdil-kladny' : 'rozdil-zaporny')) +
    '<div class="dash-stredisko-nadpis">Výdaje podle střediska</div>' +
    vykresliDashSouhrnStredisek(f.strediskaVydaje) +
    '<div class="dash-stredisko-nadpis">Příjmy podle střediska</div>' +
    vykresliDashSouhrnStredisek(f.strediskaPrijmy);

  const upozorneni = [];
  if (f.dokladyKeSchvaleni > 0) {
    upozorneni.push(
      '<div class="polozka-upozorneni">⚠ ' + f.dokladyKeSchvaleni + '× doklad čeká na schválení</div>'
    );
  }
  if (f.pohybyNesparovane > 0) {
    upozorneni.push(
      '<div class="polozka-upozorneni">⚠ ' + f.pohybyNesparovane + '× nespárovaný bankovní pohyb</div>'
    );
  }
  if (upozorneni.length === 0) {
    upozorneni.push('<div class="polozka-upozorneni ok">✓ Nic nečeká na vyřízení</div>');
  }
  html += '<div class="dash-upozorneni">' + upozorneni.join('') + '</div>';

  karta.innerHTML = html;
  return karta;
}

async function nactiDashboard() {
  const nacitani = document.getElementById('dash-nacitani');
  const obsah = document.getElementById('dash-obsah');
  const varovani = document.getElementById('dash-google-varovani');
  nacitani.textContent = 'Načítám…';
  nacitani.classList.remove('skryto');
  obsah.classList.add('skryto');
  varovani.classList.add('skryto');

  try {
    const data = await zavolejApi('/dashboard-firmy', { method: 'GET' });
    nacitani.classList.add('skryto');

    if (data.googleAuthVarovani) {
      varovani.textContent =
        'Nepodařilo se připojit ke Google účtu appky (Sheets/Disk) - přihlašovací údaje appky možná vypršely ' +
        'nebo byly odvolány. Dashboard prosím zkuste znovu později, případně kontaktujte administrátora ' +
        '(viz README-DEPLOY.md, obnovení Google OAuth refresh tokenu).';
      varovani.classList.remove('skryto');
    }

    obsah.classList.remove('skryto');
    obsah.innerHTML = '';
    const firmy = data.firmy || [];
    if (firmy.length === 0 && !data.googleAuthVarovani) {
      obsah.innerHTML = '<div class="nacitani">Zatím žádná viditelná firma.</div>';
      return;
    }
    firmy.forEach((f) => obsah.appendChild(vytvorDashFirmaKarta(f)));
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst Dashboard: ' + e.message;
  }
}

// ---------- DAŇOVÝ PŘEHLED (od v4.6 - nahrazuje dřívější Přehled plateb) ----------

const NAZVY_TYPU_DANE = {
  DPH: 'DPH',
  Dan_z_prijmu: 'Daň z příjmu',
  Dan_z_nemovitosti: 'Daň z nemovitostí',
};

// Appka drží poslední načtená data v modulové proměnné, ať výběr jiného
// roku (vykresliDanovyPrehled) nemusí pokaždé volat znovu API - appka data
// znovu natáhne jen při skutečném přechodu na záložku (nactiPrehled).
let danovyPrehledData = null;

async function nactiPrehled() {
  const nacitani = document.getElementById('prehled-nacitani');
  const obsah = document.getElementById('prehled-obsah');
  nacitani.textContent = 'Načítám…';
  obsah.classList.add('skryto');

  try {
    danovyPrehledData = await zavolejApi('/danovy-prehled', { method: 'GET' });
    nacitani.classList.add('skryto');
    obsah.classList.remove('skryto');
    naplnRokyDoVyberu();
    vykresliDanovyPrehled();
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst daňový přehled: ' + e.message;
  }
}

// Appka nabízí jen výběr KALENDÁŘNÍHO roku (od v4.6.2, viz claude/nomis-
// faktury-backlog.md, položka 9) - výchozí je aktuální rok, pokud v datech
// existuje, jinak appka vybere nejnovější dostupný (obdobiRoky appka vrací
// seřazené od nejnovějšího). Volá se jen jednou po načtení dat, ne při
// každém překreslení tabulky.
function naplnRokyDoVyberu() {
  const vyberRok = document.getElementById('prehled-vyber-rok');
  const roky = (danovyPrehledData && danovyPrehledData.obdobiRoky) || [];
  if (roky.length === 0) {
    vyberRok.innerHTML = '<option value="">— žádná data —</option>';
    return;
  }
  vyberRok.innerHTML = roky.map((r) => '<option value="' + escapeAttr(r) + '">' + escapeHtml(r) + '</option>').join('');
  const aktualniRok = String(new Date().getFullYear());
  if (roky.includes(aktualniRok)) vyberRok.value = aktualniRok;
}
document.getElementById('prehled-vyber-rok').addEventListener('change', () => vykresliDanovyPrehled());

// Appka vykreslí jeden řádek na firmu s ROČNÍ bilancí (kalendářní rok
// zvolený v #prehled-vyber-rok) - kliknutím na řádek appka rozbalí/sbalí
// všech 12 měsíčních řádků té firmy (leden - prosinec, VŽDY všech 12, i
// prázdné - Jan si to výslovně vyžádal, ať je hned vidět, kde případně
// chybí zaúčtování). Appka zůstává u opravdové <table> (ne div-gridu jako
// Doklady/Smlouvy), měsíční řádky jsou normální <tr> ve stejném tbody -
// tím jsou automaticky zarovnané do stejných sloupců jako roční řádek.
function vykresliDanovyPrehled() {
  const data = danovyPrehledData;
  if (!data) return;

  const info = document.getElementById('prehled-dph-info');
  const platci = data.platciDph || [];
  info.textContent = platci.length > 0
    ? 'Plátce DPH ve skupině: ' + platci.join(', ') + '.'
    : 'Žádná firma ve skupině není aktuálně nastavena jako plátce DPH (viz Nastavení → Firmy) - sloupec DPH bilance proto appka nepočítá.';

  const rok = document.getElementById('prehled-vyber-rok').value;
  const telo = document.getElementById('prehled-tabulka-telo');
  telo.innerHTML = '';

  if (!rok) {
    telo.innerHTML = '<tr><td colspan="5" class="popis">Zatím žádná data k daňovému přehledu (ani DPH bilance z dokladů/faktur, ani platby přiřazené k dani).</td></tr>';
    return;
  }

  const dphBilanceRokFirmy = (data.dphBilanceRocni || {})[rok] || {};
  const danovePlatbyRokFirmy = (data.danovePlatbyRocni || {})[rok] || {};

  // Appka do tabulky zařadí každou firmu, která má v TOMHLE roce buď
  // vypočtenou DPH bilanci, nebo aspoň jednu daňovou platbu - ne VŠECHNY
  // firmy skupiny natvrdo, ať se v přehledu neobjevují prázdné řádky za
  // firmy, které v daném roce vůbec žádnou daňovou aktivitu nemají.
  const firmyKZobrazeni = Array.from(new Set([...Object.keys(dphBilanceRokFirmy), ...Object.keys(danovePlatbyRokFirmy)])).sort();

  if (firmyKZobrazeni.length === 0) {
    telo.innerHTML = '<tr><td colspan="5" class="popis">Za vybraný rok appka nemá žádná daňová data.</td></tr>';
    return;
  }

  function bunkyRadku(prvniSloupecHtml, bilance, dane) {
    let bilanceHtml = '<span class="popis">—</span>';
    if (bilance) {
      const saldoPopis = bilance.saldo > 0 ? 'k doplacení FÚ' : bilance.saldo < 0 ? 'nárok na vrácení' : 'vyrovnáno';
      bilanceHtml =
        '<strong>' + formatCastka(bilance.saldo) + '</strong>' +
        '<br><span class="popis">(' + saldoPopis + '; výstup ' + formatCastka(bilance.dphVydane) +
        ', vstup ' + formatCastka(bilance.dphPrijate) + ')</span>';
    }
    function bunkaDane(typ) {
      const castka = (dane || {})[typ];
      return castka === undefined ? '<span class="popis">—</span>' : formatCastka(castka);
    }
    return (
      '<td>' + prvniSloupecHtml + '</td>' +
      '<td class="cislo">' + bilanceHtml + '</td>' +
      '<td class="cislo">' + bunkaDane('DPH') + '</td>' +
      '<td class="cislo">' + bunkaDane('Dan_z_prijmu') + '</td>' +
      '<td class="cislo">' + bunkaDane('Dan_z_nemovitosti') + '</td>'
    );
  }

  firmyKZobrazeni.forEach((firma) => {
    const trRok = document.createElement('tr');
    trRok.className = 'prehled-radek-rok';
    trRok.innerHTML = bunkyRadku(
      '<span class="prehled-sipka">▶</span><strong>' + escapeHtml(firma) + '</strong>',
      dphBilanceRokFirmy[firma],
      danovePlatbyRokFirmy[firma]
    );
    telo.appendChild(trRok);

    const radkyMesicu = [];
    for (let mesic = 1; mesic <= 12; mesic++) {
      const klicMesice = rok + '-' + String(mesic).padStart(2, '0');
      const bilanceMesic = ((data.dphBilanceMesicni || {})[klicMesice] || {})[firma];
      const daneMesic = ((data.danovePlatbyMesicni || {})[klicMesice] || {})[firma];

      const trMesic = document.createElement('tr');
      trMesic.className = 'prehled-radek-mesic skryto';
      trMesic.innerHTML = bunkyRadku('<span class="prehled-mesic-label">' + escapeHtml(klicMesice) + '</span>', bilanceMesic, daneMesic);
      telo.appendChild(trMesic);
      radkyMesicu.push(trMesic);
    }

    trRok.addEventListener('click', () => {
      const zobrazit = !trRok.classList.contains('rozbaleno');
      trRok.classList.toggle('rozbaleno', zobrazit);
      radkyMesicu.forEach((trMesic) => trMesic.classList.toggle('skryto', !zobrazit));
    });
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

// Od v4.26 (Jan: "všechny čísla zarovnat doprava, vždy 2 desetinná místa")
// appka vynucuje `minimumFractionDigits: 2` vedle stávajícího
// `maximumFractionDigits: 2` - dřív appka u celého čísla (např. 1250) žádné
// desetinné místo neukázala ("1 250 Kč"), zatímco haléřová částka měla
// desetin dvě ("1 250,5 Kč") - appka teď VŽDY ukáže přesně dvě ("1 250,00
// Kč" / "1 250,50 Kč"), ať sloupce s částkami appky (Doklady, Bankovní
// výpisy, Export, Daňový přehled, Dashboard) mají jednotný, čitelně
// zarovnatelný tvar. Do v4.26 appka navíc měla v Dashboardu samostatné
// "celokorunové" varianty (formatCastkaCele/formatCastkaCeleSMenou, zavedené
// v4.0 na Janovo přání appku tam zaokrouhlovat) - appka je od v4.26 zrušila,
// Dashboard teď používá stejné funkce jako zbytek appky.
function formatCastka(hodnota) {
  return (
    new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parsujCastkuZListu(hodnota)
    ) + ' Kč'
  );
}

// Doklady i Vydané faktury mají vlastní pole Mena (appka u dokladu umí
// z účtenky vytáhnout i cizí měnu, např. EUR u zahraničních účtenek - viz
// gemini.js) - formatCastka() vždycky připojovala "Kč" bez ohledu na
// skutečnou měnu dokladu, takže cizoměnová účtenka (např. "9.43 EUR") se
// v seznamu chybně zobrazovala jako "9,43 Kč". Tahle funkce použije
// skutečnou měnu dokladu, a jen když je prázdná/CZK, chová se jako dřív.
function formatCastkaSMenou(hodnota, mena) {
  const cislo = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    parsujCastkuZListu(hodnota)
  );
  const menaText = String(mena || '').trim();
  if (!menaText || menaText.toUpperCase() === 'CZK') return cislo + ' Kč';
  return cislo + ' ' + menaText;
}

// ---------- EXPORT (přehledy pro účetní, od v3.8) ----------
// Zatím jen přehled na obrazovce (souhrn nákladů podle firmy, filtrovaný
// firmou/měsícem/rokem/střediskem) - stahovatelný export přímo ve formátu
// pro Money S3 (XML DE) appka doplní, až bude znát přesný formát/ukázkový
// soubor. Vidí jen role admin a účetní (stejně jako Bankovní výpisy).

let exportDataDoklady = [];

async function inicializujZalozkuExport() {
  const nacitani = document.getElementById('export-nacitani');
  const vysledek = document.getElementById('export-vysledek');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';
  vysledek.innerHTML = '';

  // Export do Money S3 appka (stejně jako backend, netlify/functions/
  // export-money-s3.js) omezuje na admina/účetní - jde o účetní operaci,
  // běžnému uživateli appka tlačítko rovnou schová (backend by stejně
  // vrátil 403, tohle je jen srozumitelnější UI).
  const jeUcetniNeboAdminExport = stav.role === 'admin' || stav.role === 'ucetni';
  document.getElementById('export-money-s3').classList.toggle('skryto', !jeUcetniNeboAdminExport);

  try {
    const [dataDoklady, dataFirmy, dataStrediska] = await Promise.all([
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
    ]);
    exportDataDoklady = dataDoklady.doklady || [];
    strediskaSeznam = dataStrediska.strediska || [];
    naplnFiltryExport((dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean));
    nacitani.classList.add('skryto');
    vykresliPrehledExport();
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst data pro export: ' + e.message;
  }
}

function naplnFiltryExport(firmy) {
  const selFirma = document.getElementById('export-firma');
  const selRok = document.getElementById('export-rok');
  const selStredisko = document.getElementById('export-stredisko');

  // Firma a Středisko naplníme jen jednou (dataset.naplneno) - opětovné
  // otevření záložky tak nesmaže výběr, který na ní uživatel měl nastavený.
  if (!selFirma.dataset.naplneno) {
    let html = '<option value="">Všechny firmy</option>';
    firmy.forEach((f) => { html += '<option value="' + escapeAttr(f) + '">' + escapeHtml(f) + '</option>'; });
    selFirma.innerHTML = html;
    selFirma.dataset.naplneno = '1';
  }
  if (!selStredisko.dataset.naplneno) {
    // Export je filtr nad UŽ existujícími doklady, proto appka nabízí i
    // deaktivovaná střediska (Aktivni = 'NE') - jinak by po deaktivaci
    // střediska zmizela možnost dohledat/vyexportovat starší doklady, které
    // na něj pořád odkazují.
    let html = '<option value="">Všechna střediska</option>';
    strediskaSeznam.forEach((s) => { html += '<option value="' + escapeAttr(s.Nazev) + '">' + escapeHtml(s.Nazev) + '</option>'; });
    selStredisko.innerHTML = html;
    selStredisko.dataset.naplneno = '1';
  }

  // Rok - dynamicky podle roků, které se v dokladech opravdu vyskytují,
  // plus aktuální rok (ať jde vybrat i rok, kde ještě žádný doklad není).
  const vybranyRok = selRok.value;
  const leta = new Set([String(new Date().getFullYear())]);
  exportDataDoklady.forEach((d) => {
    const rok = String(d.Datum_dokladu || '').slice(0, 4);
    if (/^\d{4}$/.test(rok)) leta.add(rok);
  });
  const seraznaLeta = Array.from(leta).sort((a, b) => b.localeCompare(a));
  let htmlRok = '<option value="">Všechny roky</option>';
  seraznaLeta.forEach((r) => {
    htmlRok += '<option value="' + r + '"' + (r === vybranyRok ? ' selected' : '') + '>' + r + '</option>';
  });
  selRok.innerHTML = htmlRok;
}

function vykresliPrehledExport() {
  const firma = document.getElementById('export-firma').value;
  const mesic = document.getElementById('export-mesic').value;
  const rok = document.getElementById('export-rok').value;
  const stredisko = document.getElementById('export-stredisko').value;

  const filtrovane = exportDataDoklady.filter((d) => {
    // Doklady čekající na dokončení AI zpracování (od v3.9) ještě nemají
    // žádné údaje - appka je z přehledu pro účetní vynechává, ať tam
    // nestraší řádek "(bez firmy)" s nulovou částkou.
    if (d.Stav === 'Zpracovává se') return false;
    const firmaDokladu = d.Firma_potvrzena || d.Firma_AI_odhad || '';
    if (firma && firmaDokladu !== firma) return false;
    if (stredisko && (d.Stredisko || '') !== stredisko) return false;
    const datum = String(d.Datum_dokladu || '');
    if (rok && datum.slice(0, 4) !== rok) return false;
    if (mesic && datum.slice(5, 7) !== mesic) return false;
    return true;
  });

  const vysledek = document.getElementById('export-vysledek');
  if (filtrovane.length === 0) {
    vysledek.innerHTML = '<div class="nacitani">Žádné doklady neodpovídají zvolenému filtru.</div>';
    return;
  }

  // Přehled podle firem - i když je vybraná konkrétní firma, appka pořád
  // ukáže rozpad po firmách (u jedné vybrané firmy pak jde jen o jeden
  // řádek), ať má tabulka vždy stejnou strukturu bez ohledu na filtr.
  const podleFirmy = {};
  filtrovane.forEach((d) => {
    const nazevFirmy = d.Firma_potvrzena || d.Firma_AI_odhad || '(bez firmy)';
    if (!podleFirmy[nazevFirmy]) podleFirmy[nazevFirmy] = { pocet: 0, castka: 0 };
    podleFirmy[nazevFirmy].pocet += 1;
    podleFirmy[nazevFirmy].castka += parsujCastkuZListu(d.Castka);
  });

  const nazvyFirem = Object.keys(podleFirmy).sort((a, b) => a.localeCompare(b, 'cs'));
  let celkemPocet = 0;
  let celkemCastka = 0;

  let html = '<table><thead><tr><th>Firma</th><th class="cislo">Počet dokladů</th><th class="cislo">Celkem</th></tr></thead><tbody>';
  nazvyFirem.forEach((nazev) => {
    const r = podleFirmy[nazev];
    celkemPocet += r.pocet;
    celkemCastka += r.castka;
    html += '<tr>' +
      '<td data-label="Firma">' + escapeHtml(nazev) + '</td>' +
      '<td class="cislo" data-label="Počet dokladů">' + r.pocet + '</td>' +
      '<td class="cislo" data-label="Celkem">' + formatCastka(r.castka) + '</td>' +
      '</tr>';
  });
  html += '<tr><td><strong>Celkem</strong></td><td class="cislo"><strong>' + celkemPocet + '</strong></td><td class="cislo"><strong>' + formatCastka(celkemCastka) + '</strong></td></tr>';
  html += '</tbody></table>';
  vysledek.innerHTML = html;
}

// ---------- VYDANÉ FAKTURY ----------
// Evidence faktur, které firmy skupiny Nomis Group vystavují odběratelům -
// samostatná záložka, oddělená od Dokladů (to jsou přijaté faktury/účtenky).

let vfFirmySeznam = [];
let vfFakturySeznam = [];

async function inicializujZalozkuVydaneFaktury() {
  // Export do Money S3 appka omezuje na admina/účetní - stejný důvod jako
  // u tlačítka v záložce Export (viz inicializujZalozkuExport výš).
  const jeUcetniNeboAdminVfExport = stav.role === 'admin' || stav.role === 'ucetni';
  document.getElementById('tlacitko-export-money-s3-vf').classList.toggle('skryto', !jeUcetniNeboAdminVfExport);
  document.getElementById('tlacitko-export-excel-vf').classList.toggle('skryto', !jeUcetniNeboAdminVfExport);

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

// (v4.2) Barva řádku (třída appka připojí za "radek-", viz .vf-radek.radek-vf-*
// v public/style.css) - stejné rozdělení jako dřív, appka jen odstranila
// starý prefix "stav-" navázaný na zrušenou <table>.
function vfStavRadekTrida(f) {
  if (f.Stav === 'Zpracovává se') return 'vf-zpracovava';
  if (f.Stav === 'Uhrazeno') return 'vf-uhrazeno';
  if (f.Stav === 'Částečně uhrazeno') return 'vf-castecne';
  // (v4.0) Kontrola duplicity při AI zpracování - viz isMoznaDuplicitaFaktura
  // v lib/duplicity.js. Stejné probarvení jako "Po splatnosti" (obojí je
  // upozornění vyžadující pozornost účetní).
  if (f.Stav === 'Možná duplicita') return 'vf-posplatnosti';
  if (vfJePoSplatnosti(f)) return 'vf-posplatnosti';
  return 'vf-neuhrazeno';
}

// Barva chipu ve sbaleném řádku - appka tu reuse-uje stejné generické
// tříčky jako Doklady/Smlouvy (stavTrida/stavTridaSmlouva výše), ať appka
// nemá 3 sady skoro identických barev navíc.
function vfStavChipTrida(f) {
  if (f.Stav === 'Zpracovává se') return 'stav-zpracovava';
  if (f.Stav === 'Uhrazeno') return 'stav-schvaleno';
  if (f.Stav === 'Částečně uhrazeno') return 'stav-zpracovava';
  if (f.Stav === 'Možná duplicita') return 'stav-duplicita';
  if (vfJePoSplatnosti(f)) return 'stav-duplicita';
  return 'stav-ke-kontrole';
}

function vfStavText(f) {
  if (f.Stav === 'Zpracovává se') return 'Zpracovává se';
  if (f.Stav === 'Uhrazeno') return 'Uhrazeno';
  // Od v3.22 - platba spárovaná s bankou jen ČÁSTEČNĚ pokryla fakturu (viz
  // Bankovní výpisy, návrh spárování s vydanou fakturou podle částky + jména
  // zákazníka) - appka to appka drží jako vlastní stav, ne jen odvozeně.
  if (f.Stav === 'Částečně uhrazeno') return 'Částečně uhrazeno';
  // (v4.0) Viz isMoznaDuplicitaFaktura v lib/duplicity.js - appka po AI
  // vytěžení našla jinou fakturu se stejným zákazníkem/částkou a stejným
  // číslem faktury nebo datem vystavení - zkontrolujte, jestli nejde o
  // omylem dvakrát zpracovaný stejný soubor.
  if (f.Stav === 'Možná duplicita') return 'Možná duplicita';
  if (vfJePoSplatnosti(f)) return 'Po splatnosti';
  return 'Neuhrazeno';
}

function vykresliVydaneFaktury() {
  const kontejner = document.getElementById('vf-seznam');
  const souhrn = document.getElementById('vf-souhrn');
  const filtrFirma = document.getElementById('vf-filtr-firma').value;
  kontejner.innerHTML = '';

  const filtrovane = vfFakturySeznam.filter((f) => !filtrFirma || f.Firma === filtrFirma);
  // Placeholder faktury (AI zpracování ještě neproběhlo) appka do souhrnu
  // uhrazeno/neuhrazeno nepočítá - ještě nemají žádnou částku.
  const zpracovane = filtrovane.filter((f) => f.Stav !== 'Zpracovává se');

  const uhrazeno = zpracovane.filter((f) => f.Stav === 'Uhrazeno').length;
  const castecne = zpracovane.filter((f) => f.Stav === 'Částečně uhrazeno').length;
  const poSplatnosti = zpracovane.filter((f) => vfJePoSplatnosti(f)).length;
  const neuhrazeno = zpracovane.length - uhrazeno - castecne - poSplatnosti;
  const soucetNeuhrazeno = zpracovane
    .filter((f) => f.Stav !== 'Uhrazeno')
    .reduce((soucet, f) => soucet + parsujCastkuZListu(f.Castka), 0);
  souhrn.textContent =
    uhrazeno + ' uhrazeno, ' + castecne + ' částečně uhrazeno, ' + neuhrazeno + ' neuhrazeno, ' +
    poSplatnosti + ' po splatnosti (nezaplaceno celkem ' + formatCastka(soucetNeuhrazeno) + ')';

  const serazene = filtrovane.slice().sort((a, b) => (b.Datum_vystaveni || '').localeCompare(a.Datum_vystaveni || ''));

  serazene.forEach((f) => kontejner.appendChild(vytvorRadekVydanaFaktura(f)));

  if (serazene.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">Zatím žádné vydané faktury.</div>';
  }
}

// (v4.2) Skládací řádek Vydané faktury - stejný vzor jako Doklady/Smlouvy
// (vytvorRadekDoklad/vytvorRadekSmlouva výše). Jan: "vydané faktury musí
// být řádek, který rozbalím, a obsahuje možnost ručně upravit, smazat" -
// appka do téhle verze měla jen statickou <table> bez editace/mazání.
function vytvorRadekVydanaFaktura(f) {
  const radek = document.createElement('div');
  radek.className = 'vf-radek radek-' + vfStavRadekTrida(f);

  const hlava = document.createElement('div');
  hlava.className = 'vf-radek-hlava';
  hlava.innerHTML =
    '<span class="vf-sipka">▶</span>' +
    '<span class="stav-chip ' + vfStavChipTrida(f) + '">' + escapeHtml(vfStavText(f)) + '</span>' +
    '<span class="nazev-vf">' +
      escapeHtml(f.Stav === 'Zpracovává se' ? '(čeká na zpracování)' : (f.Cislo_faktury || '(bez čísla)')) +
    '</span>' +
    '<span>' + escapeHtml(f.Zakaznik || '') + '</span>' +
    '<span>' + escapeHtml(f.Firma || '') + '</span>' +
    '<span class="castka">' + (f.Stav === 'Zpracovává se' ? '' : formatCastkaSMenou(f.Castka, f.Mena)) + '</span>';

  const detail = document.createElement('div');
  detail.className = 'vf-radek-detail';

  hlava.addEventListener('click', () => {
    radek.classList.toggle('rozbaleno');
    if (radek.classList.contains('rozbaleno') && !radek.dataset.naplneno) {
      radek.dataset.naplneno = '1';
      detail.appendChild(vytvorDetailVydanaFaktura(f));
    }
  });

  radek.appendChild(hlava);
  radek.appendChild(detail);
  return radek;
}

function vytvorDetailVydanaFaktura(f) {
  const wrap = document.createElement('div');

  // Placeholder faktura (Stav "Zpracovává se") - AI zpracování ještě
  // neproběhlo/se nepovedlo, stejný vzor jako u Dokladů/Smluv appka místo
  // editace prázdných polí rovnou nabídne dokončení zpracování.
  if (f.Stav === 'Zpracovává se') {
    const info = document.createElement('div');
    info.className = 'zprava info';
    info.textContent =
      'Soubor je bezpečně uložený, AI zpracování údajů ještě neproběhlo (nebo se dřív nepovedlo kvůli ' +
      'dočasnému přetížení). Dokončete ho tlačítkem níž - nic nemusíte nahrávat znovu.';
    wrap.appendChild(info);

    const akce = document.createElement('div');
    akce.className = 'radek-akci';
    const tlacitkoDokoncit = document.createElement('button');
    tlacitkoDokoncit.className = 'maly';
    tlacitkoDokoncit.textContent = 'Dokončit zpracování';
    tlacitkoDokoncit.onclick = () => dokoncitZpracovaniVydaneFaktury(f.ID, tlacitkoDokoncit);
    akce.appendChild(tlacitkoDokoncit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazVydanouFakturu(f.ID, f.Cislo_faktury, tlacitkoSmazat);
    akce.appendChild(tlacitkoSmazat);
    wrap.appendChild(akce);

    return wrap;
  }

  const labelFirma = document.createElement('label');
  labelFirma.textContent = 'Firma (vystavuje)';
  const vstupFirma = document.createElement('select');
  vstupFirma.innerHTML = moznostiFirmySeznam(vfFirmySeznam, f.Firma || '');
  wrap.appendChild(labelFirma);
  wrap.appendChild(vstupFirma);

  const labelCislo = document.createElement('label');
  labelCislo.textContent = 'Číslo faktury';
  const vstupCislo = document.createElement('input');
  vstupCislo.type = 'text';
  vstupCislo.value = f.Cislo_faktury || '';
  wrap.appendChild(labelCislo);
  wrap.appendChild(vstupCislo);

  const labelJednotka = document.createElement('label');
  labelJednotka.textContent = 'Jednotka';
  const vstupJednotka = document.createElement('input');
  vstupJednotka.type = 'text';
  vstupJednotka.setAttribute('list', 'seznam-jednotek');
  vstupJednotka.value = f.Jednotka || '';
  wrap.appendChild(labelJednotka);
  wrap.appendChild(vstupJednotka);

  const labelZakaznik = document.createElement('label');
  labelZakaznik.textContent = 'Zákazník';
  const vstupZakaznik = document.createElement('input');
  vstupZakaznik.type = 'text';
  vstupZakaznik.value = f.Zakaznik || '';
  wrap.appendChild(labelZakaznik);
  wrap.appendChild(vstupZakaznik);

  const labelIco = document.createElement('label');
  labelIco.textContent = 'IČO zákazníka';
  const vstupIco = document.createElement('input');
  vstupIco.type = 'text';
  vstupIco.value = f.ICO_zakaznika || '';
  wrap.appendChild(labelIco);
  wrap.appendChild(vstupIco);

  const labelVystaveni = document.createElement('label');
  labelVystaveni.textContent = 'Datum vystavení';
  const vstupVystaveni = document.createElement('input');
  vstupVystaveni.type = 'date';
  vstupVystaveni.value = f.Datum_vystaveni || '';
  wrap.appendChild(labelVystaveni);
  wrap.appendChild(vstupVystaveni);

  const labelSplatnost = document.createElement('label');
  labelSplatnost.textContent = 'Datum splatnosti';
  const vstupSplatnost = document.createElement('input');
  vstupSplatnost.type = 'date';
  vstupSplatnost.value = f.Datum_splatnosti || '';
  wrap.appendChild(labelSplatnost);
  wrap.appendChild(vstupSplatnost);

  const labelCastka = document.createElement('label');
  labelCastka.textContent = 'Částka a měna';
  const vstupCastka = document.createElement('input');
  vstupCastka.type = 'number';
  vstupCastka.step = '0.01';
  vstupCastka.value = f.Castka !== undefined && f.Castka !== '' ? parsujCastkuZListu(f.Castka) : '';
  vstupCastka.style.marginBottom = '6px';
  const vstupMena = document.createElement('input');
  vstupMena.type = 'text';
  vstupMena.value = f.Mena || 'CZK';
  vstupMena.style.maxWidth = '90px';
  wrap.appendChild(labelCastka);
  wrap.appendChild(vstupCastka);
  wrap.appendChild(vstupMena);

  // DPH/Sazba_DPH (od v4.6, viz claude/nomis-faktury-backlog.md, položka 9) -
  // appka pole nabízí jako AI odhad ze zpracování faktury + ruční kontrolu,
  // stejná konvence jako u Dokladů. Používá se jen u firem plátců DPH (dnes
  // NOMIS Investment) jako VÝSTUP DPH pro měsíční bilanci v Daňovém přehledu.
  const labelDph = document.createElement('label');
  labelDph.textContent = 'DPH (částka) a sazba (%)';
  const vstupDph = document.createElement('input');
  vstupDph.type = 'number';
  vstupDph.step = '0.01';
  vstupDph.value = f.DPH !== undefined && f.DPH !== '' ? parsujCastkuZListu(f.DPH) : '';
  vstupDph.style.marginBottom = '6px';
  const vstupSazbaDph = document.createElement('input');
  vstupSazbaDph.type = 'text';
  vstupSazbaDph.value = f.Sazba_DPH || '';
  vstupSazbaDph.style.maxWidth = '90px';
  wrap.appendChild(labelDph);
  wrap.appendChild(vstupDph);
  wrap.appendChild(vstupSazbaDph);

  const labelPoznamka = document.createElement('label');
  labelPoznamka.textContent = 'Poznámka';
  const vstupPoznamka = document.createElement('input');
  vstupPoznamka.type = 'text';
  vstupPoznamka.value = f.Poznamka || '';
  wrap.appendChild(labelPoznamka);
  wrap.appendChild(vstupPoznamka);

  if (f.Zdrojovy_soubor_URL) {
    const souborDiv = document.createElement('div');
    souborDiv.style.marginTop = '12px';
    souborDiv.innerHTML = 'Soubor: <a href="' + escapeAttr(f.Zdrojovy_soubor_URL) + '" target="_blank" rel="noopener">otevřít</a>';
    wrap.appendChild(souborDiv);
  }

  // Položky (od v4.27, export do Money S3) - viz vytvorSekciPolozek výš a
  // stejné zapojení u Dokladů (vytvorDetailDoklad). Zamčeno běžnému
  // uživateli u už UHRAZENÉ faktury.
  const zamcenoPolozkyFaktury = !(stav.role === 'admin' || stav.role === 'ucetni') && f.Stav === 'Uhrazeno';
  wrap.appendChild(vytvorSekciPolozek({
    zamceno: zamcenoPolozkyFaktury,
    maZdrojovySoubor: !!f.Zdrojovy_soubor_ID,
    ziskejPolozky: async () => (await zavolejApi('/vydane-faktury-polozky?faktura_id=' + encodeURIComponent(f.ID))).polozky,
    pridatPolozku: async (data) =>
      zavolejApi('/vydane-faktury-polozky', { method: 'POST', body: JSON.stringify(Object.assign({ faktura_id: f.ID }, data)) }),
    upravitPolozku: async (id, zmeny) =>
      zavolejApi('/vydane-faktury-polozky', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) }),
    smazatPolozku: async (id) => zavolejApi('/vydane-faktury-polozky?id=' + encodeURIComponent(id), { method: 'DELETE' }),
    vytezitZeSouboru: async () =>
      zavolejApi('/vydane-faktury-vytezit-polozky', { method: 'POST', body: JSON.stringify({ id: f.ID }) }),
  }));

  function ziskejZmeny() {
    return {
      Firma: vstupFirma.value.trim(),
      Cislo_faktury: vstupCislo.value.trim(),
      Jednotka: vstupJednotka.value.trim(),
      Zakaznik: vstupZakaznik.value.trim(),
      ICO_zakaznika: vstupIco.value.trim(),
      Datum_vystaveni: vstupVystaveni.value,
      Datum_splatnosti: vstupSplatnost.value,
      Castka: vstupCastka.value,
      Mena: vstupMena.value.trim() || 'CZK',
      DPH: vstupDph.value,
      Sazba_DPH: vstupSazbaDph.value.trim(),
      Poznamka: vstupPoznamka.value.trim(),
    };
  }

  const akce = document.createElement('div');
  akce.className = 'radek-akci';

  const tlacitkoUlozit = document.createElement('button');
  tlacitkoUlozit.className = 'maly sekundarni';
  tlacitkoUlozit.textContent = 'Uložit';
  tlacitkoUlozit.onclick = () => ulozZmenuVydaneFaktury(f.ID, ziskejZmeny(), tlacitkoUlozit);
  akce.appendChild(tlacitkoUlozit);

  // Jan (2026-07-19, v4.11): "Označit uhrazeno"/"Zrušit uhrazení" appka ukáže
  // jen adminovi a účetní - běžný uživatel fakturu smí jen opravit
  // ("Uložit"), samotné označení uhrazení zůstává na adminovi/účetní (viz
  // netlify/functions/vydaneFaktury.js, PATCH - appka by stejně vrátila 403,
  // kdyby to zkusil obejít). Stejný vzor jako u Dokladů/Schválit.
  const jeUcetniNeboAdminVf = stav.role === 'admin' || stav.role === 'ucetni';
  if (jeUcetniNeboAdminVf) {
    const tlacitkoStav = document.createElement('button');
    tlacitkoStav.className = 'maly';
    if (f.Stav === 'Uhrazeno') {
      tlacitkoStav.textContent = 'Zrušit uhrazení';
      tlacitkoStav.onclick = () => ulozZmenuVydaneFaktury(f.ID, { Stav: 'Neuhrazeno', Datum_uhrady: '' }, tlacitkoStav);
    } else {
      tlacitkoStav.textContent = 'Označit uhrazeno';
      tlacitkoStav.onclick = () => ulozZmenuVydaneFaktury(
        f.ID,
        { Stav: 'Uhrazeno', Datum_uhrady: new Date().toISOString().slice(0, 10) },
        tlacitkoStav
      );
    }
    akce.appendChild(tlacitkoStav);
  }

  // Jan (2026-07-19, v4.11): "Smazat" appka běžnému uživateli ukáže jen u
  // faktury, kterou sám vytvořil (Vytvoril) - admin/účetní mažou beze změny
  // cokoli v rámci svých firem (viz netlify/functions/vydaneFaktury.js,
  // DELETE, stejná podmínka).
  if (jeUcetniNeboAdminVf || f.Vytvoril === stav.jmeno) {
    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazVydanouFakturu(f.ID, f.Cislo_faktury, tlacitkoSmazat);
    akce.appendChild(tlacitkoSmazat);
  }

  wrap.appendChild(akce);

  return wrap;
}

let vfZpravaTimeout = null;

function zobrazZpravuVydaneFaktury(text) {
  const zprava = document.getElementById('vf-zprava-akce');
  if (!zprava) return;
  zprava.textContent = text;
  zprava.classList.toggle('skryto', !text);
  if (vfZpravaTimeout) clearTimeout(vfZpravaTimeout);
  if (text) {
    vfZpravaTimeout = setTimeout(() => {
      zprava.textContent = '';
      zprava.classList.add('skryto');
    }, 5000);
  }
}

async function ulozZmenuVydaneFaktury(id, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/vydaneFaktury', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    await nactiVydaneFaktury();
    zobrazZpravuVydaneFaktury(zmeny.Stav === 'Uhrazeno' ? 'Faktura označena jako uhrazená.' : 'Změna uložena.');
  } catch (e) {
    alert('Nepodařilo se uložit změnu: ' + e.message);
    tlacitko.disabled = false;
  }
}

// (v4.2) Nové - appka do téhle verze u Vydaných faktur mazání vůbec
// neměla (Jan: "vydané faktury musí být řádek, který rozbalím, a obsahuje
// možnost ručně upravit, smazat"), mirror smazDoklad/smazSmlouvu výše.
async function smazVydanouFakturu(id, cisloFaktury, tlacitko) {
  if (!confirm('Opravdu smazat vydanou fakturu „' + (cisloFaktury || '(bez čísla)') + '“? Tuhle akci nejde vrátit zpět.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/vydaneFaktury?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await nactiVydaneFaktury();
    zobrazZpravuVydaneFaktury('Vydaná faktura smazána.');
  } catch (e) {
    alert('Nepodařilo se smazat vydanou fakturu: ' + e.message);
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

// ---------- VYDANÉ FAKTURY: NAHRÁVÁNÍ S AI VYTĚŽENÍM (od v3.22, dvoufázově -
// stejný vzor jako Doklady/Smlouvy, viz pripravSouborKNahrani výš) ----------

let vybranySouborVydanaFaktura = null;

async function zpracujVybranySouborVydaneFaktury(soubor) {
  const zprava = document.getElementById('vf-nahrat-zprava');
  const info = document.getElementById('vf-vybrany-soubor-info');
  zprava.innerHTML = '';
  document.getElementById('vf-tlacitko-nahrat').disabled = true;

  if (!soubor) {
    vybranySouborVydanaFaktura = null;
    info.textContent = '';
    return;
  }

  try {
    vybranySouborVydanaFaktura = await pripravSouborKNahrani(soubor);
    info.textContent = 'Vybráno: ' + soubor.name;
    document.getElementById('vf-tlacitko-nahrat').disabled = false;
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">Soubor se nepodařilo zpracovat: ' + escapeHtml(e.message) + '</div>';
  }
}

async function nahratVydanouFakturu() {
  const zprava = document.getElementById('vf-nahrat-zprava');
  const tlacitko = document.getElementById('vf-tlacitko-nahrat');
  if (!vybranySouborVydanaFaktura) return;

  tlacitko.disabled = true;
  zprava.innerHTML = '<div class="zprava">Nahrávám soubor…</div>';

  let faktura;
  try {
    const odpoved = await zavolejApi('/vydane-faktury-upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: vybranySouborVydanaFaktura.nazev,
        mimeType: vybranySouborVydanaFaktura.mimeType,
        dataBase64: vybranySouborVydanaFaktura.data,
      }),
    });
    faktura = odpoved.faktura;
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">Soubor se nepodařilo nahrát: ' + escapeHtml(e.message) + '</div>';
    tlacitko.disabled = !vybranySouborVydanaFaktura;
    return;
  }

  document.getElementById('vf-pole-soubor').value = '';
  document.getElementById('vf-pole-foto').value = '';
  document.getElementById('vf-vybrany-soubor-info').textContent = '';
  vybranySouborVydanaFaktura = null;
  tlacitko.disabled = true;

  zprava.innerHTML = '<div class="zprava">Soubor nahrán, appka na pozadí čte údaje pomocí AI (může trvat několik vteřin)…</div>';
  try {
    await zavolejApi('/vydane-faktury-upload-dokoncit', { method: 'POST', body: JSON.stringify({ id: faktura.ID }) });
    zprava.innerHTML = '<div class="zprava uspech">Faktura byla nahrána a zpracována AI. Zkontrolujte vytažené údaje v seznamu níž a případně je opravte.</div>';
  } catch (e) {
    zprava.innerHTML =
      '<div class="zprava info">Soubor byl bezpečně nahrán, ale zpracování údajů pomocí AI se teď nepovedlo ' +
      '(' + escapeHtml(e.message) + '). Nic jste neztratili - fakturu najdete v seznamu níž se stavem ' +
      '„Zpracovává se“ a zpracování jde odtud kdykoli zopakovat tlačítkem „Dokončit zpracování“, ' +
      'bez nutnosti cokoliv nahrávat znovu.</div>';
  } finally {
    tlacitko.disabled = !vybranySouborVydanaFaktura;
    await nactiVydaneFaktury();
  }
}

async function dokoncitZpracovaniVydaneFaktury(id, tlacitko) {
  tlacitko.disabled = true;
  const puvodniText = tlacitko.textContent;
  tlacitko.textContent = 'Zpracovávám…';
  try {
    await zavolejApi('/vydane-faktury-upload-dokoncit', { method: 'POST', body: JSON.stringify({ id }) });
    await nactiVydaneFaktury();
  } catch (e) {
    alert(
      'Zpracování se zatím nepovedlo (' + e.message + '). Soubor zůstává bezpečně uložený, zkuste to prosím ' +
      'za chvíli znovu.'
    );
    tlacitko.disabled = false;
    tlacitko.textContent = puvodniText;
  }
}

// ---------- BANKOVNÍ VÝPISY ----------

let bankaFirmySeznam = [];
let bankaAktivniFirma = '';
let bankaPohybySeznam = [];
let bankaDokladySeznam = [];
let bankaSmlouvySeznam = []; // od v3.19 - trvalé příkazy dané firmy
let bankaUctySeznam = []; // od v3.19 - vlastní účty dané firmy (pro ruční doplnění u příjmů)
let bankaFakturySeznam = []; // od v3.22 - vydané faktury dané firmy (párování příjmů)

// Od v4.26.1 (Jan: "CZK nebo EUR se musí zobrazovat na základě měny
// bankovních účtů") - appka dřív u pohybu zobrazovala rovnou p.Mena
// (hodnota odvozená appkou při IMPORTU výpisu ze sloupce/metadat souboru,
// viz lib/bankImportTabular.js) - appka teď přednostně dohledá měnu podle
// VLASTNÍHO ÚČTU pohybu (Cislo_uctu_vlastni -> Ucty.Mena, appka má tenhle
// seznam už načtený v bankaUctySeznam) - účet logicky vždycky drží jen
// jednu měnu, je to tedy spolehlivější než to, co appka odvodila z
// jednotlivého řádku výpisu. Když appka účet nedohledá (starší data,
// smazaný účet), spadne zpátky na p.Mena beze změny oproti dřívějšku.
function menaPohybuBanka(p) {
  const ucet = bankaUctySeznam.find((u) => u.Cislo_uctu === p.Cislo_uctu_vlastni);
  if (ucet && ucet.Mena) return ucet.Mena;
  return p.Mena;
}

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
    const [dataPohyby, dataDoklady, dataSmlouvy, dataUcty, dataFaktury, dataStrediska] = await Promise.all([
      zavolejApi('/banka?firma=' + encodeURIComponent(bankaAktivniFirma), { method: 'GET' }),
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/smlouvy?firma=' + encodeURIComponent(bankaAktivniFirma), { method: 'GET' }).catch(() => ({ smlouvy: [] })),
      zavolejApi('/ucty', { method: 'GET' }).catch(() => ({ ucty: [] })),
      zavolejApi('/vydaneFaktury?firma=' + encodeURIComponent(bankaAktivniFirma), { method: 'GET' }).catch(() => ({ faktury: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
    ]);
    strediskaSeznam = dataStrediska.strediska || [];
    bankaPohybySeznam = dataPohyby.pohyby || [];
    bankaDokladySeznam = (dataDoklady.doklady || []).filter(
      (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === bankaAktivniFirma
    );
    bankaSmlouvySeznam = dataSmlouvy.smlouvy || [];
    bankaUctySeznam = (dataUcty.ucty || []).filter((u) => u.Firma === bankaAktivniFirma);
    bankaFakturySeznam = dataFaktury.faktury || [];
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
  // Od v3.19 - trvalé příkazy (Smlouvy) a příjmy se středisko/účtem mají
  // VLASTNÍ barvu/badge, odlišnou od výdajových stavů výš (viz backlog).
  if (stav === 'Trvalý příkaz') return '<span class="badge-trvalyprikaz">Trvalý příkaz</span>';
  if (stav === 'Navrženo - trvalý příkaz') return '<span class="badge-navrzeno">Navrženo (smlouva)</span>';
  if (stav === 'Příjem přiřazen') return '<span class="badge-prijemprirazen">Příjem přiřazen</span>';
  // Od v3.22 - párování příjmů s Vydanými fakturami (viz claude/nomis-
  // faktury-backlog.md, položka 5B).
  if (stav === 'Navrženo - vydaná faktura') return '<span class="badge-navrzeno">Navrženo (faktura)</span>';
  if (stav === 'Spárováno - vydaná faktura') return '<span class="badge-prijemprirazen">Spárováno s fakturou</span>';
  // Od v4.19 - párování PŘÍJMŮ přímo s nájemní Smlouvou (viz claude/nomis-
  // faktury-backlog.md, Jan: "příjmy z nájmu přiřadit k bankovním vypisům").
  if (stav === 'Navrženo - nájemní smlouva') return '<span class="badge-navrzeno">Navrženo (nájem)</span>';
  if (stav === 'Spárováno - nájemní smlouva') return '<span class="badge-prijemprirazen">Spárováno s nájmem</span>';
  // Od v4.6 - ruční přiřazení odchozí platby k dani (viz claude/nomis-
  // faktury-backlog.md, položka 9), stejná barva/logika jako Trvalý příkaz
  // (appka ho NEPOVAŽUJE za chybějící doklad).
  if (stav === 'Daňová platba') return '<span class="badge-trvalyprikaz">Daňová platba</span>';
  return '<span class="badge-chybi">Chybí doklad</span>';
}

// Pořadí důležitosti stavů při řazení výpisu (viz vykresliBankovniPohyby) -
// čím nižší číslo, tím výš v seznamu. "Nespárováno" appka řadí schválně AŽ
// PO "Navrženo" (i když u něj appka žádný tip nenabízí) - "Navrženo" totiž
// vyžaduje jen rychlé potvrzení/zamítnutí, zatímco "Nespárováno" obvykle
// vyžaduje víc práce (dohledat/nahrát doklad, nebo ho ručně přiřadit).
// "Navrženo - trvalý příkaz" (od v3.19) appka řadí do stejné naléhavostní
// skupiny jako "Navrženo" - obojí čeká jen na rychlé potvrzení/zamítnutí.
function bankaStavRazeniPriorita(stav) {
  if (
    stav === 'Navrženo' ||
    stav === 'Navrženo - trvalý příkaz' ||
    stav === 'Navrženo - vydaná faktura' ||
    stav === 'Navrženo - nájemní smlouva'
  ) {
    return 0;
  }
  if (stav === 'Nespárováno') return 1;
  return 2; // Potvrzeno, Bez dokladu, Trvalý příkaz, Příjem přiřazen, Spárováno - vydaná faktura/nájemní smlouva - vyřízeno
}

// Pořadí důležitosti stavů dokladu v nabídce "vyberte doklad" u ručního
// přiřazení k bankovnímu pohybu (v3.18) - schválené doklady appka dává
// první, protože to je nejčastější případ (doklad je hotový, jen čeká na
// spárování), "Ke kontrole" a "Možná duplicita" appka řadí až za ně.
function dokladVyberRazeniPriorita(stav) {
  if (stav === 'Schváleno') return 0;
  if (stav === 'Ke kontrole') return 1;
  return 2; // Možná duplicita apod.
}

// Třída pro probarvení celého řádku podle stavu spárování - stejné stavy
// jako bankaStavBadge, jen jako modifikátor na .banka-radek.
function bankaStavRadekTrida(stav) {
  if (stav === 'Potvrzeno') return 'stav-radek-potvrzeno';
  if (stav === 'Navrženo' || stav === 'Navrženo - trvalý příkaz') return 'stav-radek-navrzeno';
  if (stav === 'Bez dokladu') return 'stav-radek-bezdokladu';
  if (stav === 'Trvalý příkaz') return 'stav-radek-trvalyprikaz';
  if (stav === 'Příjem přiřazen') return 'stav-radek-prijemprirazen';
  if (stav === 'Navrženo - vydaná faktura') return 'stav-radek-navrzeno';
  if (stav === 'Spárováno - vydaná faktura') return 'stav-radek-prijemprirazen';
  if (stav === 'Navrženo - nájemní smlouva') return 'stav-radek-navrzeno';
  if (stav === 'Spárováno - nájemní smlouva') return 'stav-radek-prijemprirazen';
  if (stav === 'Daňová platba') return 'stav-radek-trvalyprikaz';
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
  const trvalePrikazy = bankaPohybySeznam.filter(
    (p) => p.Stav_parovani === 'Trvalý příkaz' || p.Stav_parovani === 'Navrženo - trvalý příkaz'
  ).length;
  const prijmyPrirazene = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Příjem přiřazen').length;
  const fakturyNavrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Navrženo - vydaná faktura').length;
  const fakturySparovano = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Spárováno - vydaná faktura').length;
  const danovePlatby = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Daňová platba').length;
  // Od v4.19 - párování PŘÍJMŮ přímo s nájemní Smlouvou.
  const najmyNavrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Navrženo - nájemní smlouva').length;
  const najmySparovano = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Spárováno - nájemní smlouva').length;
  souhrn.textContent =
    potvrzeno + ' potvrzeno, ' + navrzeno + ' navrženo, ' + chybi + ' chybí, ' + bezDokladu +
    ' bez dokladu, ' + trvalePrikazy + ' trvalých příkazů, ' + prijmyPrirazene + ' příjmů přiřazeno, ' +
    fakturyNavrzeno + ' navrženo k faktuře, ' + fakturySparovano + ' spárováno s fakturou, ' +
    najmyNavrzeno + ' navrženo k nájmu, ' + najmySparovano + ' spárováno s nájmem, ' +
    danovePlatby + ' daňových plateb (celkem ' + bankaPohybySeznam.length + ')';

  const jenChybejici = document.getElementById('banka-jen-chybejici').getAttribute('aria-pressed') === 'true';
  const serazene = bankaPohybySeznam
    .filter(
      (p) =>
        !jenChybejici ||
        p.Stav_parovani === 'Nespárováno' ||
        p.Stav_parovani === 'Navrženo' ||
        p.Stav_parovani === 'Navrženo - trvalý příkaz' ||
        p.Stav_parovani === 'Navrženo - vydaná faktura' ||
        p.Stav_parovani === 'Navrženo - nájemní smlouva'
    )
    .slice()
    .sort((a, b) => {
      // Řazení primárně podle toho, kolik pozornosti pohyb ještě potřebuje
      // (nejdřív "Navrženo" - appka má tip, stačí zkontrolovat a potvrdit/
      // zamítnout; pak "Nespárováno" - appka nic nenašla, čeká na doklad
      // nebo ruční přiřazení; nakonec "Potvrzeno"/"Bez dokladu" - vyřízeno,
      // nepotřebuje další akci), teprve v rámci stejné skupiny appka řadí
      // podle data (nejnovější nahoře), stejně jako dřív.
      const prioritaA = bankaStavRazeniPriorita(a.Stav_parovani);
      const prioritaB = bankaStavRazeniPriorita(b.Stav_parovani);
      if (prioritaA !== prioritaB) return prioritaA - prioritaB;
      return (b.Datum || '').localeCompare(a.Datum || '');
    });

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
    '<span class="castka ' + castkaTrida + '">' + formatCastkaSMenou(p.Castka, menaPohybuBanka(p)) + '</span>';

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

// Sdílený výběr „Přiřadit k dani“ (od v4.6, rozšířeno v4.6.1) - appka ho
// nabízí u odchozích I příchozích plateb (vrácení přeplatku DPH/daně od
// finančního úřadu přijde jako kladná platba), proto jedna sdílená funkce
// místo dvou skoro identických kopií kódu ve výdajové i příjmové větvi
// vytvorDetailBanka. Appka NEROZPOZNÁVÁ přiřazení automaticky podle
// protistrany/textu - jen eviduje ruční volbu účetní.
function vytvorVyberPriradKDani(p, ulozZmenuBanka, tlacitkoBanka) {
  const fragment = document.createDocumentFragment();
  const vyberTypDane = document.createElement('select');
  vyberTypDane.style.fontSize = '13px';
  vyberTypDane.innerHTML =
    '<option value="">— přiřadit k dani —</option>' +
    '<option value="DPH">DPH</option>' +
    '<option value="Dan_z_prijmu">Daň z příjmu</option>' +
    '<option value="Dan_z_nemovitosti">Daň z nemovitostí</option>';
  fragment.appendChild(vyberTypDane);
  fragment.appendChild(
    tlacitkoBanka('Přiřadit k dani', (e) => {
      if (!vyberTypDane.value) {
        alert('Nejdřív vyberte typ daně.');
        return;
      }
      ulozZmenuBanka({ Typ_dane: vyberTypDane.value, Stav_parovani: 'Daňová platba', Doklad_ID: '' }, e.target);
    })
  );
  return fragment;
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
  } else if (p.Stav_parovani === 'Navrženo - trvalý příkaz') {
    // Od v3.19 - appka auto-navrhla přiřazení ke stejné Smlouvě jako u
    // jiného už dřív ručně potvrzeného pohybu (podobná protistrana/podobná
    // částka), nebo appka (od v4.19, sjednoceno v4.24 - Jan: "příchozí
    // platby musí mít stejně jako odchozí možnost přiřadit smlouvu/trvalý
    // příkaz") rovnou u PŘÍCHOZÍ platby rozpoznala odpovídající aktivní
    // smlouvu podle jména protistrany a očekávané částky - appka v obou
    // případech jen NAVRHUJE, pořád čeká na potvrzení/zamítnutí účetní.
    const jePrijemNavrzeno = parsujCastkuZListu(p.Castka) > 0;
    const smlouvaNavrzena = bankaSmlouvySeznam.find((s) => s.ID === p.Smlouva_ID);
    const infoSmlouva = document.createElement('div');
    infoSmlouva.className = 'popis';
    infoSmlouva.style.marginBottom = '6px';
    infoSmlouva.textContent = smlouvaNavrzena
      ? 'Appka navrhuje přiřadit ke smlouvě „' + smlouvaNavrzena.Nazev + '“ (podobná protistrana/částka jako u jiného už přiřazeného pohybu).' +
        (jePrijemNavrzeno && smlouvaNavrzena.Stredisko
          ? ' Po potvrzení appka převezme středisko „' + smlouvaNavrzena.Stredisko + '“ ze smlouvy.'
          : '')
      : 'Appka navrhuje přiřadit ke smlouvě, kterou v seznamu nenašla (možná byla mezitím smazána).';
    akce.appendChild(infoSmlouva);
    akce.appendChild(
      tlacitkoBanka('Potvrdit trvalý příkaz', (e) => ulozZmenuBanka({ Stav_parovani: 'Trvalý příkaz' }, e.target))
    );
    akce.appendChild(
      tlacitkoBanka('Zamítnout návrh', (e) =>
        ulozZmenuBanka(
          // Od v4.24 - appka zamítnutý PŘÍJEM vrací do "Bez dokladu" (jeho
          // obvyklý výchozí nerozhodnutý stav), ne do "Nespárováno" (to appka
          // používá jen pro odchozí platby, viz netlify/functions/banka.js).
          jePrijemNavrzeno
            ? { Stav_parovani: 'Bez dokladu', Smlouva_ID: '', Stredisko: '' }
            : { Stav_parovani: 'Nespárováno', Smlouva_ID: '' },
          e.target
        )
      )
    );
  } else if (p.Stav_parovani === 'Trvalý příkaz') {
    // Pohyb ručně (nebo z návrhu) potvrzený jako součást trvalého příkazu -
    // appka ho NEPOVAŽUJE za chybějící doklad/nevyřízený příjem (viz
    // lib/bankSchema.js). Od v4.24 appka tenhle stav používá pro OBOJÍ směr -
    // výdajovou (beze změny od v3.19) i příjmovou stranu (dřív samostatné
    // "Spárováno - nájemní smlouva", appka teď sjednotila do jednoho
    // obecného mechanismu, viz dashboard-firmy.js pro dopad na Dashboard).
    const jePrijemPotvrzeno = parsujCastkuZListu(p.Castka) > 0;
    const smlouvaPotvrzena = bankaSmlouvySeznam.find((s) => s.ID === p.Smlouva_ID);
    const infoSmlouvaPotvrzena = document.createElement('div');
    infoSmlouvaPotvrzena.className = 'popis';
    infoSmlouvaPotvrzena.style.marginBottom = '6px';
    infoSmlouvaPotvrzena.textContent =
      (smlouvaPotvrzena
        ? 'Přiřazeno ke smlouvě „' + smlouvaPotvrzena.Nazev + '“' + (smlouvaPotvrzena.Typ ? ' (' + smlouvaPotvrzena.Typ + ')' : '') + '.'
        : 'Přiřazeno ke smlouvě, kterou appka v seznamu nenašla (možná byla mezitím smazána).') +
      (jePrijemPotvrzeno
        ? p.Stredisko
          ? ' Středisko: ' + p.Stredisko + '.'
          : ' Appka nemá u tohohle pohybu vyplněné středisko.'
        : '');
    akce.appendChild(infoSmlouvaPotvrzena);
    // Od v4.26 (Jan: "nenačte si správně středisko, přestože je u
    // smlouvě, co je za problém?") - appka Středisko na PŘÍJMOVÝ pohyb
    // dřív kopírovala jen JEDNOU, v okamžiku potvrzení trvalého příkazu
    // (viz netlify/functions/banka.js) - pokud v tu chvíli Smlouva.Stredisko
    // ještě nebylo vyplněné (nebo appka pohyb potvrdila auto-návrhem, viz
    // "Auto-návrh dalších pohybů" v banka.js, který Středisko vůbec
    // nekopíroval), zůstal pohyb natrvalo bez střediska - appka neměla
    // žádný způsob, jak ho dodatečně doplnit/opravit jinak než celé
    // přiřazení zrušit a ručně ho založit znovu. Appka teď nabízí rovnou
    // editovatelný výběr střediska i u už potvrzeného příjmu.
    if (jePrijemPotvrzeno) {
      const vyberStrediskoOprava = document.createElement('select');
      vyberStrediskoOprava.style.fontSize = '13px';
      vyberStrediskoOprava.innerHTML = moznostiStrediska(p.Stredisko);
      akce.appendChild(vyberStrediskoOprava);
      akce.appendChild(
        tlacitkoBanka('Uložit středisko', (e) => {
          ulozZmenuBanka({ Stredisko: vyberStrediskoOprava.value }, e.target);
        })
      );
    }
    akce.appendChild(
      tlacitkoBanka('Zrušit přiřazení ke smlouvě', (e) =>
        ulozZmenuBanka(
          jePrijemPotvrzeno
            ? { Stav_parovani: 'Bez dokladu', Smlouva_ID: '', Stredisko: '' }
            : { Stav_parovani: 'Nespárováno', Smlouva_ID: '' },
          e.target
        )
      )
    );
  } else if (p.Stav_parovani === 'Příjem přiřazen') {
    // Příchozí platba, které appka/účetní přiřadila Středisko a/nebo účet
    // (od v3.19) - appka nabídne rovnou i změnu přiřazení, ne jen zrušení.
    const infoPrijem = document.createElement('div');
    infoPrijem.className = 'popis';
    infoPrijem.style.marginBottom = '6px';
    infoPrijem.textContent =
      'Příjem přiřazen' + (p.Stredisko ? ' – středisko: ' + p.Stredisko : '') +
      (p.Cislo_uctu_vlastni ? ', účet: ' + p.Cislo_uctu_vlastni : '') + '.';
    akce.appendChild(infoPrijem);
    akce.appendChild(
      tlacitkoBanka('Zrušit přiřazení příjmu', (e) => ulozZmenuBanka({ Stav_parovani: 'Bez dokladu', Stredisko: '' }, e.target))
    );
  } else if (p.Stav_parovani === 'Navrženo - vydaná faktura') {
    // Od v3.22 - appka navrhla spárování příchozí platby s konkrétní
    // Vydanou fakturou podle částky + jména zákazníka (viz
    // lib/bankHelpers.js, navrhniShoduPrijem) - stejný princip jako
    // "Navrženo" u dokladů, pořád čeká na potvrzení/zamítnutí účetní.
    const fakturaNavrzena = bankaFakturySeznam.find((f) => f.ID === p.Vydana_faktura_ID);
    const infoFaktura = document.createElement('div');
    infoFaktura.className = 'popis';
    infoFaktura.style.marginBottom = '6px';
    infoFaktura.textContent = fakturaNavrzena
      ? 'Appka navrhuje spárovat s vydanou fakturou ' + (fakturaNavrzena.Cislo_faktury || '(bez čísla)') +
        ' – zákazník ' + (fakturaNavrzena.Zakaznik || '(bez zákazníka)') + ', ' +
        formatCastkaSMenou(fakturaNavrzena.Castka, fakturaNavrzena.Mena) +
        (parsujCastkuZListu(p.Castka) < Math.abs(parsujCastkuZListu(fakturaNavrzena.Castka)) - 1
          ? ' (platba je nižší - appka po potvrzení označí fakturu jako „Částečně uhrazeno“)'
          : '') + '.'
      : 'Appka navrhuje spárovat s vydanou fakturou, kterou v seznamu nenašla (možná byla mezitím smazána).';
    akce.appendChild(infoFaktura);
    akce.appendChild(
      tlacitkoBanka('Potvrdit spárování', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Spárováno - vydaná faktura' }, e.target)
      )
    );
    akce.appendChild(
      tlacitkoBanka('Zamítnout návrh', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Bez dokladu', Vydana_faktura_ID: '' }, e.target)
      )
    );
  } else if (p.Stav_parovani === 'Spárováno - vydaná faktura') {
    // Platba ručně (nebo z návrhu) potvrzená jako úhrada konkrétní Vydané
    // faktury - appka při potvrzení rovnou přepsala Vydane_faktury.Stav
    // (viz netlify/functions/banka.js).
    const fakturaSparovana = bankaFakturySeznam.find((f) => f.ID === p.Vydana_faktura_ID);
    const infoFakturaSparovana = document.createElement('div');
    infoFakturaSparovana.className = 'popis';
    infoFakturaSparovana.style.marginBottom = '6px';
    infoFakturaSparovana.textContent = fakturaSparovana
      ? 'Spárováno s vydanou fakturou ' + (fakturaSparovana.Cislo_faktury || '(bez čísla)') +
        ' – zákazník ' + (fakturaSparovana.Zakaznik || '(bez zákazníka)') + '.'
      : 'Spárováno s vydanou fakturou, kterou appka v seznamu nenašla (možná byla mezitím smazána).';
    akce.appendChild(infoFakturaSparovana);
    akce.appendChild(
      tlacitkoBanka('Zrušit spárování', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Bez dokladu', Vydana_faktura_ID: '' }, e.target)
      )
    );
    const upozorneniZruseni = document.createElement('div');
    upozorneniZruseni.className = 'popis';
    upozorneniZruseni.style.marginTop = '4px';
    upozorneniZruseni.textContent =
      'Pozn.: zrušení spárování appka NEVRACÍ automaticky stav faktury zpět - pokud je potřeba, opravte ho ' +
      'ručně v záložce Vydané faktury.';
    akce.appendChild(upozorneniZruseni);
  } else if (p.Stav_parovani === 'Navrženo - nájemní smlouva') {
    // Od v4.19 - appka navrhla spárování příchozí platby přímo s aktivní
    // nájemní Smlouvou podle jména nájemce + očekávané částky (viz
    // lib/bankHelpers.js, navrhniShoduNajem) - stejný princip jako "Navrženo
    // - vydaná faktura", pořád čeká na potvrzení/zamítnutí účetní.
    const smlouvaNajemNavrzena = bankaSmlouvySeznam.find((s) => s.ID === p.Smlouva_ID);
    const infoNajemNavrzeno = document.createElement('div');
    infoNajemNavrzeno.className = 'popis';
    infoNajemNavrzeno.style.marginBottom = '6px';
    infoNajemNavrzeno.textContent = smlouvaNajemNavrzena
      ? 'Appka navrhuje spárovat s nájemní smlouvou „' + smlouvaNajemNavrzena.Nazev + '“' +
        (smlouvaNajemNavrzena.Druha_strana ? ' – nájemce ' + smlouvaNajemNavrzena.Druha_strana : '') + '.'
      : 'Appka navrhuje spárovat s nájemní smlouvou, kterou v seznamu nenašla (možná byla mezitím smazána).';
    akce.appendChild(infoNajemNavrzeno);

    // Od v4.23 (Jan: "nemovitost je zase jen středisko", appka zrušila
    // samostatnou entitu Nemovitosti) - appka u potvrzení vyžaduje i
    // Středisko, ať se nájemní příjem stejně jako ostatní příjmy objeví
    // v Dashboardu podle střediska. Appka select předvyplní tím, co už na
    // pohybu má (appka ho tam zkopírovala ze smlouvy při návrhu), případně
    // přímo Střediskem smlouvy, pokud appka Střediska ještě nenastavila.
    const vyberStrediskoNajemNavrzeno = document.createElement('select');
    vyberStrediskoNajemNavrzeno.style.fontSize = '13px';
    vyberStrediskoNajemNavrzeno.innerHTML = moznostiStrediska(
      p.Stredisko || (smlouvaNajemNavrzena && smlouvaNajemNavrzena.Stredisko) || ''
    );
    akce.appendChild(vyberStrediskoNajemNavrzeno);
    akce.appendChild(
      tlacitkoBanka('Potvrdit spárování', (e) => {
        if (!vyberStrediskoNajemNavrzeno.value) {
          alert('Vyberte středisko.');
          return;
        }
        ulozZmenuBanka(
          { Stav_parovani: 'Spárováno - nájemní smlouva', Stredisko: vyberStrediskoNajemNavrzeno.value },
          e.target
        );
      })
    );
    akce.appendChild(
      tlacitkoBanka('Zamítnout návrh', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Bez dokladu', Smlouva_ID: '', Stredisko: '' }, e.target)
      )
    );
  } else if (p.Stav_parovani === 'Spárováno - nájemní smlouva') {
    // Platba ručně (nebo z návrhu) potvrzená jako nájemní příjem - na
    // rozdíl od Vydané faktury appka tu nic dalšího nepřepisuje (Smlouva
    // nemá vlastní "Stav uhrazeno", jde o průběžný/opakovaný příjem).
    const smlouvaNajemSparovana = bankaSmlouvySeznam.find((s) => s.ID === p.Smlouva_ID);
    const infoNajemSparovano = document.createElement('div');
    infoNajemSparovano.className = 'popis';
    infoNajemSparovano.style.marginBottom = '6px';
    infoNajemSparovano.textContent = (smlouvaNajemSparovana
      ? 'Spárováno s nájemní smlouvou „' + smlouvaNajemSparovana.Nazev + '“' +
        (smlouvaNajemSparovana.Druha_strana ? ' – nájemce ' + smlouvaNajemSparovana.Druha_strana : '') + '.'
      : 'Spárováno s nájemní smlouvou, kterou appka v seznamu nenašla (možná byla mezitím smazána).') +
      (p.Stredisko ? ' Středisko: ' + p.Stredisko + '.' : ' Appka nemá u tohohle pohybu vyplněné středisko.');
    akce.appendChild(infoNajemSparovano);
    akce.appendChild(
      tlacitkoBanka('Zrušit spárování', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Bez dokladu', Smlouva_ID: '', Stredisko: '' }, e.target)
      )
    );
  } else if (p.Stav_parovani === 'Daňová platba') {
    // Od v4.6 - odchozí platba ručně přiřazená k dani (viz claude/nomis-
    // faktury-backlog.md, položka 9) - appka částku jen SČÍTÁ do Daňového
    // přehledu, nedopočítává ji (na rozdíl od DPH bilance).
    const infoDan = document.createElement('div');
    infoDan.className = 'popis';
    infoDan.style.marginBottom = '6px';
    infoDan.textContent = 'Přiřazeno k dani: ' + (NAZVY_TYPU_DANE[p.Typ_dane] || p.Typ_dane || '(neznámý typ)') + '.';
    akce.appendChild(infoDan);
    akce.appendChild(
      tlacitkoBanka('Zrušit přiřazení k dani', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno', Typ_dane: '' }, e.target))
    );
  } else if (parsujCastkuZListu(p.Castka) > 0) {
    // PŘÍJEM (Nespárováno / Bez dokladu, kladná částka) - appka od v3.19
    // nabízí přiřazení na Středisko a firemní účet místo výběru dokladu
    // (u příjmů appka doklady vůbec nepáruje, viz lib/bankHelpers.js).
    const vyberStrediskoPrijem = document.createElement('select');
    vyberStrediskoPrijem.style.fontSize = '13px';
    vyberStrediskoPrijem.innerHTML = moznostiStrediska(p.Stredisko || '');

    const vyberUcetPrijem = document.createElement('select');
    vyberUcetPrijem.style.fontSize = '13px';
    let ucetHtml = '<option value="">— bez účtu —</option>';
    bankaUctySeznam.forEach((u) => {
      const oznaceno = u.Cislo_uctu === p.Cislo_uctu_vlastni ? ' selected' : '';
      ucetHtml += '<option value="' + escapeAttr(u.Cislo_uctu) + '"' + oznaceno + '>' + escapeHtml(u.Cislo_uctu) +
        (u.Popis ? ' (' + escapeHtml(u.Popis) + ')' : '') + '</option>';
    });
    if (p.Cislo_uctu_vlastni && !bankaUctySeznam.some((u) => u.Cislo_uctu === p.Cislo_uctu_vlastni)) {
      ucetHtml += '<option value="' + escapeAttr(p.Cislo_uctu_vlastni) + '" selected>' + escapeHtml(p.Cislo_uctu_vlastni) + '</option>';
    }
    vyberUcetPrijem.innerHTML = ucetHtml;

    const popisekStredisko = document.createElement('span');
    popisekStredisko.className = 'popis';
    popisekStredisko.style.marginRight = '4px';
    popisekStredisko.textContent = 'Středisko:';
    const popisekUcet = document.createElement('span');
    popisekUcet.className = 'popis';
    popisekUcet.style.margin = '0 4px 0 10px';
    popisekUcet.textContent = 'Účet:';

    akce.appendChild(popisekStredisko);
    akce.appendChild(vyberStrediskoPrijem);
    akce.appendChild(popisekUcet);
    akce.appendChild(vyberUcetPrijem);
    akce.appendChild(
      tlacitkoBanka('Přiřadit příjem', (e) => {
        if (!vyberStrediskoPrijem.value) {
          alert('Vyberte středisko.');
          return;
        }
        ulozZmenuBanka(
          { Stredisko: vyberStrediskoPrijem.value, Cislo_uctu_vlastni: vyberUcetPrijem.value, Stav_parovani: 'Příjem přiřazen' },
          e.target
        );
      })
    );

    // Od v3.22 - appka nabídne i ruční přiřazení ke konkrétní Vydané faktuře
    // (ne jen automatický návrh podle částky/jména, viz "Navrženo - vydaná
    // faktura" výš) - pro případ, že appka sama žádnou vhodnou fakturu
    // nenašla, ale účetní ví, ke které platba patří.
    const nesplacene = bankaFakturySeznam.filter((f) => f.Stav === 'Neuhrazeno' || f.Stav === 'Částečně uhrazeno');
    if (nesplacene.length > 0) {
      const vyberFaktury = document.createElement('select');
      vyberFaktury.style.fontSize = '13px';
      vyberFaktury.innerHTML =
        '<option value="">— přiřadit k vydané faktuře —</option>' +
        nesplacene
          .map(
            (f) =>
              '<option value="' + escapeAttr(f.ID) + '">' + escapeHtml(f.Cislo_faktury || '(bez čísla)') + ' – ' +
              escapeHtml(f.Zakaznik || '(bez zákazníka)') + ' – ' + escapeHtml(formatCastkaSMenou(f.Castka, f.Mena)) +
              '</option>'
          )
          .join('');
      akce.appendChild(vyberFaktury);
      akce.appendChild(
        tlacitkoBanka('Přiřadit k faktuře', (e) => {
          if (!vyberFaktury.value) {
            alert('Nejdřív vyberte vydanou fakturu.');
            return;
          }
          ulozZmenuBanka(
            { Vydana_faktura_ID: vyberFaktury.value, Stav_parovani: 'Spárováno - vydaná faktura' },
            e.target
          );
        })
      );
    }

    // Od v4.19 appka nabízela ruční přiřazení jen k nájemní Smlouvě - od
    // v4.24 appka tuhle volbu zobecnila na KTEROUKOLI aktivní smlouvu firmy
    // (Jan: "příchozí platby musí mít stejně jako odchozí možnost přiřadit
    // smlouvu/trvalý příkaz") a sjednotila ji se stejným obecným
    // mechanismem, jaký appka od v3.19 používá u odchozích plateb (viz
    // stejnojmenný blok "přiřadit ke smlouvě (trvalý příkaz)" ve výdajové
    // větvi níže) - pro případ, že appka sama žádnou vhodnou smlouvu
    // nenašla (např. jiné psaní jména protistrany), ale účetní ví, ke
    // které smlouvě platba patří.
    const aktivniSmlouvyPrijem = bankaSmlouvySeznam.filter((s) => String(s.Aktivni || 'ANO').trim() !== 'NE');
    if (aktivniSmlouvyPrijem.length > 0) {
      const vyberSmlouvyPrijem = document.createElement('select');
      vyberSmlouvyPrijem.style.fontSize = '13px';
      vyberSmlouvyPrijem.innerHTML =
        '<option value="">— přiřadit ke smlouvě (trvalý příkaz) —</option>' +
        aktivniSmlouvyPrijem
          .map(
            (s) =>
              '<option value="' + escapeAttr(s.ID) + '">' + escapeHtml(s.Nazev || '(bez názvu)') +
              (s.Typ ? ' (' + escapeHtml(s.Typ) + ')' : '') +
              (s.Druha_strana ? ' – ' + escapeHtml(s.Druha_strana) : '') +
              (s.Ocekavana_castka ? ' – ' + escapeHtml(formatCastkaSMenou(s.Ocekavana_castka, s.Mena)) : '') +
              '</option>'
          )
          .join('');
      akce.appendChild(vyberSmlouvyPrijem);

      // Od v4.23 - appka i u ručního přiřazení příjmu vyžaduje Středisko
      // (appka po zrušení samostatné entity Nemovitosti kategorizuje
      // příjem čistě přes Středisko, viz dashboard-firmy.js) - appka select
      // předvyplní Střediskem vybrané smlouvy, jakmile účetní smlouvu
      // zvolí (jde jen o předvyplnění, appka nechá hodnotu přepsat).
      const vyberStrediskoSmlouvaPrijem = document.createElement('select');
      vyberStrediskoSmlouvaPrijem.style.fontSize = '13px';
      vyberStrediskoSmlouvaPrijem.innerHTML = moznostiStrediska('');
      vyberSmlouvyPrijem.addEventListener('change', () => {
        const vybranaSmlouva = aktivniSmlouvyPrijem.find((s) => s.ID === vyberSmlouvyPrijem.value);
        vyberStrediskoSmlouvaPrijem.innerHTML = moznostiStrediska((vybranaSmlouva && vybranaSmlouva.Stredisko) || '');
      });
      akce.appendChild(vyberStrediskoSmlouvaPrijem);

      akce.appendChild(
        tlacitkoBanka('Přiřadit ke smlouvě', (e) => {
          if (!vyberSmlouvyPrijem.value) {
            alert('Nejdřív vyberte smlouvu.');
            return;
          }
          if (!vyberStrediskoSmlouvaPrijem.value) {
            alert('Vyberte středisko.');
            return;
          }
          ulozZmenuBanka(
            {
              Smlouva_ID: vyberSmlouvyPrijem.value,
              Stav_parovani: 'Trvalý příkaz',
              Stredisko: vyberStrediskoSmlouvaPrijem.value,
            },
            e.target
          );
        })
      );
    }

    // Od v4.6.1 - vrácení přeplatku daně/DPH od finančního úřadu přijde na
    // účet jako KLADNÁ platba, appka proto nabízí „Přiřadit k dani“ i tady
    // na příjmové straně, ne jen u odchozích plateb (viz stejná akce níže
    // ve výdajové větvi).
    akce.appendChild(vytvorVyberPriradKDani(p, ulozZmenuBanka, tlacitkoBanka));

    if (p.Stav_parovani !== 'Bez dokladu') {
      akce.appendChild(
        tlacitkoBanka('Označit „Bez dokladu“', (e) => ulozZmenuBanka({ Stav_parovani: 'Bez dokladu' }, e.target))
      );
    } else {
      akce.appendChild(tlacitkoBanka('Zrušit „Bez dokladu“', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno' }, e.target)));
    }
  } else {
    const vyberDokladu = document.createElement('select');
    vyberDokladu.style.fontSize = '13px';
    vyberDokladu.className = 'vyber-doklad-listbox';
    const jizPouzite = new Set(
      bankaPohybySeznam.filter((pp) => pp.Doklad_ID && pp.ID !== p.ID).map((pp) => pp.Doklad_ID)
    );
    // Oprava (Jan nahlásil, že se mu schválený doklad v nabídce ztrácel a
    // že appka nabízí i doklady, které se sem vůbec nehodí):
    // - doklady hrazené mimo účet appka nenabízí vůbec - u těch se
    //   protějšek v bance záměrně nehledá (viz badge "Mimo účet", v3.16),
    //   nabízet je jako kandidáty by appku jen zbytečně zaplevelovalo.
    // - placeholder doklady čekající na AI zpracování ("Zpracovává se")
    //   ještě nemají vytaženou částku/dodavatele - appka je jako
    //   kandidáty nenabízí, dokud nejsou dokončené.
    // - zbylé doklady appka řadí tak, aby schválené byly první a hned
    //   viditelné (nejčastější případ výběru), a u každého rovnou ukáže
    //   stav, ať je jasné, co je hotové a co ještě čeká na kontrolu.
    const volneDoklady = bankaDokladySeznam
      .filter((d) => !jizPouzite.has(d.ID))
      .filter((d) => String(d.Hrazeno_mimo_ucet || '').trim() !== 'ANO')
      .filter((d) => d.Stav !== 'Zpracovává se')
      .slice()
      .sort((a, b) => {
        const prioritaA = dokladVyberRazeniPriorita(a.Stav);
        const prioritaB = dokladVyberRazeniPriorita(b.Stav);
        if (prioritaA !== prioritaB) return prioritaA - prioritaB;
        return String(b.Datum_dokladu || '').localeCompare(String(a.Datum_dokladu || ''));
      });
    // Appka zobrazí rovnou víc řádků najednou (ne jen sbalenou nabídku),
    // ať jsou všechny dostupné doklady vidět bez nutnosti rozklikávat
    // a scrollovat v malém okně prohlížeče.
    vyberDokladu.size = Math.min(8, volneDoklady.length + 1);
    vyberDokladu.innerHTML =
      '<option value="">— vyberte doklad (' + volneDoklady.length + ') —</option>' +
      volneDoklady
        .map(
          (d) =>
            '<option value="' + escapeAttr(d.ID) + '">' +
            (d.Stav === 'Schváleno' ? '✅ ' : '') +
            escapeHtml(d.Dodavatel || '(bez dodavatele)') + ' – ' + escapeHtml(String(parsujCastkuZListu(d.Castka))) + ' ' +
            escapeHtml(d.Mena || '') + ' (' + escapeHtml(d.Datum_dokladu || '') + ')' +
            (d.Stav !== 'Schváleno' ? ' [' + escapeHtml(d.Stav || '') + ']' : '') +
            '</option>'
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

    // Od v3.19 - opakované platby (nájem, elektřina, leasing) appka umí
    // párovat s JEDNÍM souhrnným dokladem/smlouvou místo účtenky za KAŽDOU
    // jednotlivou platbu (viz claude/nomis-faktury-backlog.md) - appka
    // nabídne jen AKTIVNÍ smlouvy dané firmy; pokud žádná neexistuje,
    // appka odkáže na založení v Nastavení → Smlouvy.
    const aktivniSmlouvyFirmy = bankaSmlouvySeznam.filter((s) => String(s.Aktivni || 'ANO').trim() !== 'NE');
    if (aktivniSmlouvyFirmy.length > 0) {
      const vyberSmlouvy = document.createElement('select');
      vyberSmlouvy.style.fontSize = '13px';
      vyberSmlouvy.innerHTML =
        '<option value="">— přiřadit ke smlouvě (trvalý příkaz) —</option>' +
        aktivniSmlouvyFirmy
          .map((s) => '<option value="' + escapeAttr(s.ID) + '">' + escapeHtml(s.Nazev) +
            (s.Typ ? ' (' + escapeHtml(s.Typ) + ')' : '') + '</option>')
          .join('');
      akce.appendChild(vyberSmlouvy);
      akce.appendChild(
        tlacitkoBanka('Přiřadit ke smlouvě', (e) => {
          if (!vyberSmlouvy.value) {
            alert('Nejdřív vyberte smlouvu.');
            return;
          }
          ulozZmenuBanka({ Smlouva_ID: vyberSmlouvy.value, Stav_parovani: 'Trvalý příkaz', Doklad_ID: '' }, e.target);
        })
      );
    } else {
      const infoZadneSmlouvy = document.createElement('span');
      infoZadneSmlouvy.className = 'popis';
      infoZadneSmlouvy.textContent = 'Žádná smlouva zatím není založená - pro trvalý příkaz (nájem/elektřina/leasing) ji založte v Nastavení → Smlouvy.';
      akce.appendChild(infoZadneSmlouvy);
    }

    // Od v4.6 (rozšířeno v4.6.1 o DPH) - ruční přiřazení k dani - appka
    // NEROZPOZNÁVÁ automaticky podle protistrany/textu (na rozdíl od
    // dokladů/trvalých příkazů výš), jen eviduje skutečně zaplacenou/
    // vrácenou částku podle toho, co účetní ručně vybere.
    akce.appendChild(vytvorVyberPriradKDani(p, ulozZmenuBanka, tlacitkoBanka));

    if (p.Stav_parovani !== 'Bez dokladu') {
      akce.appendChild(
        tlacitkoBanka('Označit „Bez dokladu“', (e) => ulozZmenuBanka({ Stav_parovani: 'Bez dokladu', Doklad_ID: '' }, e.target))
      );
    } else {
      akce.appendChild(tlacitkoBanka('Zrušit „Bez dokladu“', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno' }, e.target)));
    }
  }

  // Jan (2026-07-21, v4.12): běžný uživatel (role "" - ne admin, ne účetní)
  // teď Bankovní výpisy vidí, ale jen jako NÁHLED - appka mu proto z
  // detailu odstraní všechny akční prvky (tlačítka/select/input), které
  // by beztak backend odmítl (viz netlify/functions/banka.js, PATCH je
  // vyhrazené adminovi/účetní) - appka nechává jen informační text
  // (přiřazený doklad, ke které smlouvě/faktuře je pohyb spárovaný apod.).
  const jeUcetniNeboAdminBanka = stav.role === 'admin' || stav.role === 'ucetni';
  if (!jeUcetniNeboAdminBanka) {
    akce.querySelectorAll('button, select, input, textarea').forEach((el) => el.remove());
  }
  wrap.appendChild(akce);

  const poznamkaDiv = document.createElement('div');
  poznamkaDiv.style.marginTop = '10px';
  if (jeUcetniNeboAdminBanka) {
    const poznamkaVstup = document.createElement('input');
    poznamkaVstup.type = 'text';
    poznamkaVstup.placeholder = 'Poznámka pro účetní…';
    poznamkaVstup.value = p.Poznamka || '';
    poznamkaVstup.style.fontSize = '13px';
    poznamkaDiv.appendChild(poznamkaVstup);
    poznamkaDiv.appendChild(tlacitkoBanka('Uložit poznámku', (e) => ulozZmenuBanka({ Poznamka: poznamkaVstup.value.trim() }, e.target)));
  } else if (p.Poznamka) {
    poznamkaDiv.className = 'popis';
    poznamkaDiv.textContent = 'Poznámka: ' + p.Poznamka;
  }
  wrap.appendChild(poznamkaDiv);

  // Od v4.21 (Jan: "ano" k nabídce appky přidat možnost bankovní pohyb
  // smazat z rozhraní) - appka smazání nabízí bez ohledu na Stav_parovani
  // (appka NEKASKÁDUJE žádnou změnu do navázaného Dokladu/Vydané faktury/
  // Smlouvy, viz netlify/functions/banka.js) - jen běžnému uživateli appka
  // tlačítko schová stejně jako ostatní akční prvky výš.
  if (jeUcetniNeboAdminBanka) {
    const smazatDiv = document.createElement('div');
    smazatDiv.style.marginTop = '14px';
    smazatDiv.appendChild(
      tlacitkoBanka('Smazat pohyb', (e) => smazBankovniPohyb(p, e.target))
    );

    if (p.Import_ID) {
      const pocetVImportu = bankaPohybySeznam.filter((pp) => pp.Import_ID === p.Import_ID).length;
      if (pocetVImportu > 1) {
        const tlSmazatImport = tlacitkoBanka(
          'Smazat celý import (' + pocetVImportu + ' pohybů)',
          (e) => smazImportBankovnichPohybu(p.Import_ID, pocetVImportu, e.target)
        );
        tlSmazatImport.style.marginLeft = '8px';
        smazatDiv.appendChild(tlSmazatImport);
      }
    }
    wrap.appendChild(smazatDiv);
  }

  return wrap;
}

async function smazBankovniPohyb(p, tlacitko) {
  if (
    !confirm(
      'Opravdu smazat tenhle bankovní pohyb (' + (p.Protistrana || p.Typ_pohybu || '(bez popisu)') + ', ' +
        formatCastkaSMenou(p.Castka, menaPohybuBanka(p)) + ')? Appka NEVRACÍ žádnou napojenou vazbu (doklad/fakturu/smlouvu) ' +
        'zpátky do stavu čekání - jen odstraní řádek pohybu. Tuhle akci nejde vrátit zpět.'
    )
  ) {
    return;
  }
  tlacitko.disabled = true;
  try {
    await zavolejApi('/banka?id=' + encodeURIComponent(p.ID), { method: 'DELETE' });
    await nactiBankovniPohyby();
  } catch (e) {
    alert('Nepodařilo se smazat pohyb: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazImportBankovnichPohybu(importId, pocet, tlacitko) {
  if (
    !confirm(
      'Opravdu smazat CELÝ tenhle import (' + pocet + ' pohybů najednou)? Typicky se hodí po opravě špatně ' +
        'rozpoznaného výpisu, kdy appka potřebuje smazat starý špatný import před novým nahráním. Appka ' +
        'NEVRACÍ žádné napojené vazby (doklad/fakturu/smlouvu) zpátky - jen odstraní řádky pohybů. Tuhle akci ' +
        'nejde vrátit zpět.'
    )
  ) {
    return;
  }
  tlacitko.disabled = true;
  try {
    await zavolejApi('/banka?importId=' + encodeURIComponent(importId), { method: 'DELETE' });
    await nactiBankovniPohyby();
  } catch (e) {
    alert('Nepodařilo se smazat import: ' + e.message);
    tlacitko.disabled = false;
  }
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
  // Appka primárně použije formát, který si uživatel ručně vybral v selectu
  // "Formát souboru" - přípona souboru se použije jen jako záloha, když
  // zůstane na "Poznat automaticky" (viz index.html, banka-vyber-formatu).
  // Důvod: appka pozná formát podle přípony nespolehlivě (bance stažený
  // soubor může mít nejednoznačnou/chybějící příponu), takže ruční volba
  // má vždycky přednost.
  const vybranyFormat = (document.getElementById('banka-vyber-formatu') || {}).value || 'auto';
  const format = vybranyFormat === 'auto' ? priponaSouboru(soubor.name) : vybranyFormat;
  const jeBinarniFormat = format === 'xlsx' || format === 'xls';
  const obsah = jeBinarniFormat ? await souborNaBase64(soubor) : await soubor.text();
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

// Ruční "Aktualizovat" - znovu načte pohyby i doklady pro aktuální firmu ze
// Sheets. Appka se jinak obnoví jen při přepnutí firmy nebo po vlastní akci
// (potvrzení/zamítnutí atd.) - tohle je pro případ, že se něco změnilo jinde
// (jiné zařízení, přímá úprava v Google Sheets) a appka to ještě neví.
async function aktualizovatBankovniPohyby(tlacitko) {
  if (tlacitko) tlacitko.disabled = true;
  try {
    await nactiBankovniPohyby();
  } finally {
    if (tlacitko) tlacitko.disabled = false;
  }
}

// "Spustit kontrolu dokladů" - appka normálně navrhuje shody jen v okamžiku
// importu výpisu (podle dokladů, které v tu chvíli existují). Pokud doklad
// k pohybu přibyde/vytěží se AŽ POZDĚJI (běžné - třeba účtenka za benzín se
// nahraje o pár dní později, než přijde bankovní odpis), pohyb zůstane
// "Nespárováno" navždycky, dokud appka znovu nezkusí porovnat. Tohle
// tlačítko appku donutí přepočítat návrhy pro všechny dosud "Nespárováno"
// pohyby aktuální firmy proti aktuálním dokladům, bez nutnosti cokoli znovu
// nahrávat (viz netlify/functions/banka.js, akce "prepocitatShody").
async function spustitKontroluDokladu(tlacitko) {
  const zprava = document.getElementById('banka-import-zprava');
  if (tlacitko) tlacitko.disabled = true;
  zprava.innerHTML = '<div class="zprava">Porovnávám nespárované pohyby s doklady…</div>';
  try {
    const vysledek = await zavolejApi('/banka', {
      method: 'POST',
      body: JSON.stringify({ firma: bankaAktivniFirma, akce: 'prepocitatShody' }),
    });
    zprava.innerHTML =
      '<div class="zprava uspech">Zkontrolováno ' + vysledek.zkontrolovano + ' nespárovaných pohybů - ' +
      vysledek.noveNavrzeno + ' appka nově navrhla ke kontrole, ' + vysledek.zustavaNesparovano +
      ' pořád čeká na doklad. U příjmů appka navíc zkontrolovala ' + (vysledek.zkontrolovanoPrijmu || 0) +
      ' plateb označených „Bez dokladu“ - ' + (vysledek.noveNavrzenoPrijmu || 0) +
      ' appka nově navrhla ke konkrétní vydané faktuře.</div>';
    await nactiBankovniPohyby();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  } finally {
    if (tlacitko) tlacitko.disabled = false;
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

// ---------- ADMIN: STŘEDISKA (od v4.25 - viz lib/strediskaSchema.js a
// netlify/functions/strediska.js, dřív natvrdo zadané pole MOZNOSTI_STREDISKA
// v kódu appky) ----------

async function nactiStrediska() {
  const nacitani = document.getElementById('strediska-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/strediska', { method: 'GET' });
    strediskaSeznam = data.strediska || [];
    nacitani.classList.add('skryto');
    vykresliStrediska(strediskaSeznam);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst střediska: ' + e.message;
  }
}

function vykresliStrediska(strediska) {
  const telo = document.getElementById('tabulka-strediska-telo');
  telo.innerHTML = '';

  strediska.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Název"></td>' +
      '<td data-label="Typ"></td>' +
      '<td data-label="Aktivní"></td>' +
      '<td data-label="Akce"></td>';

    tr.children[0].textContent = s.Nazev || '';

    const vyberTyp = document.createElement('select');
    vyberTyp.innerHTML = '<option value="Nemovitost">Nemovitost</option><option value="Auto">Auto</option>';
    vyberTyp.value = s.Typ === 'Auto' ? 'Auto' : 'Nemovitost';
    tr.children[1].appendChild(vyberTyp);

    const vyberAktivni = document.createElement('select');
    vyberAktivni.innerHTML = '<option value="ANO">Ano</option><option value="NE">Ne</option>';
    vyberAktivni.value = s.Aktivni === 'NE' ? 'NE' : 'ANO';
    tr.children[2].appendChild(vyberAktivni);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozStredisko(s._row, {
      Typ: vyberTyp.value,
      Aktivni: vyberAktivni.value,
    }, tlacitkoUlozit);
    tr.children[3].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazStredisko(s._row, s.Nazev, tlacitkoSmazat);
    tr.children[3].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  if (strediska.length === 0) {
    telo.innerHTML = '<tr><td colspan="4" class="nacitani">Zatím žádná střediska.</td></tr>';
  }
}

async function pridatStredisko() {
  const zprava = document.getElementById('strediska-zprava');
  zprava.innerHTML = '';

  const nazev = document.getElementById('nove-st-nazev').value.trim();
  if (!nazev) {
    zprava.innerHTML = '<div class="zprava chyba">Název střediska je povinný.</div>';
    return;
  }

  try {
    await zavolejApi('/strediska', {
      method: 'POST',
      body: JSON.stringify({
        Nazev: nazev,
        Typ: document.getElementById('nove-st-typ').value,
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Středisko přidáno.</div>';
    document.getElementById('nove-st-nazev').value = '';
    await nactiStrediska();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozStredisko(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/strediska', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiStrediska();
  } catch (e) {
    alert('Nepodařilo se uložit středisko: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazStredisko(row, nazev, tlacitko) {
  if (!confirm('Opravdu smazat středisko „' + nazev + '“? Pokud už ho appka používá u dokladů/smluv/bankovních pohybů, doporučujeme ho radši jen deaktivovat (Aktivní = Ne) - existující záznamy zůstanou beze změny, jen zmizí z nabídky pro nové.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/strediska?row=' + row, { method: 'DELETE' });
    await nactiStrediska();
  } catch (e) {
    alert('Nepodařilo se smazat středisko: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- SMLOUVY (trvalé příkazy, od v3.19) ----------
// Od v3.21 (Janovo zadání "není vidět všechny údaje ze smlouvy... doplnit
// vytěžení smlouvy AI + zavést registr smluv, tedy i s přílohou") appka
// Smlouvy povýšila z podpanelu v Nastavení na vlastní hlavní záložku
// (viditelnou pro admin i účetní, stejně jako Bankovní výpisy/Export) a
// přidala: (1) VŠECHNA pole smlouvy v detailu řádku (dřív šlo z appky
// upravit jen Firma/Název/Středisko/Typ/Perioda/Aktivní, ne Ocekavana_castka/
// Platnost_od/Platnost_do/Poznámka), (2) nahrání smlouvy se soborem + AI
// vytěžení údajů (stejný dvoufázový vzor jako u Dokladů, viz
// netlify/functions/smlouvy-upload.js/-dokoncit.js), (3) registr příloh -
// jedna smlouva může mít víc souborů (smlouva samotná + každoroční
// vyúčtování), viz lib/smlouvyPrilohySchema.js a netlify/functions/
// smlouvy-prilohy.js.

let smlouvySeznamAktualni = [];
let prilohySeznamAktualni = [];
let smlouvySekce = 'aktivni';
let firmyProVyberSmlouvy = [];

async function nactiSmlouvy() {
  const nacitani = document.getElementById('smlouvy-nacitani');
  const kontejner = document.getElementById('smlouvy-seznam');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';
  kontejner.innerHTML = '';

  try {
    const [dataSmlouvy, dataFirmy, dataStrediska] = await Promise.all([
      zavolejApi('/smlouvy', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
    ]);
    firmyProVyberSmlouvy = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    strediskaSeznam = dataStrediska.strediska || [];
    vyplnVyberFirem('nova-sm-firma', firmyProVyberSmlouvy);
    if (!document.getElementById('nova-sm-stredisko').dataset.naplneno) {
      document.getElementById('nova-sm-stredisko').innerHTML = moznostiStrediska('');
      document.getElementById('nova-sm-stredisko').dataset.naplneno = '1';
    }
    if (!document.getElementById('nova-sm-typ').dataset.naplneno) {
      document.getElementById('nova-sm-typ').innerHTML = moznostiTypSmlouvy('');
      document.getElementById('nova-sm-typ').dataset.naplneno = '1';
    }
    if (!document.getElementById('nova-sm-perioda').dataset.naplneno) {
      document.getElementById('nova-sm-perioda').innerHTML = moznostiPeriodaSmlouvy('');
      document.getElementById('nova-sm-perioda').dataset.naplneno = '1';
    }
    nacitani.classList.add('skryto');
    vykresliSmlouvy(dataSmlouvy.smlouvy || [], dataSmlouvy.prilohy || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst smlouvy: ' + e.message;
  }
}

function prepniSmlouvySekci(sekce) {
  smlouvySekce = sekce;
  document.getElementById('sm-sekce-aktivni').classList.toggle('aktivni', sekce === 'aktivni');
  document.getElementById('sm-sekce-neaktivni').classList.toggle('aktivni', sekce === 'neaktivni');
  vykresliSmlouvy(smlouvySeznamAktualni, prilohySeznamAktualni);
}

// Smlouva "Zpracovává se" (placeholder hned po nahrání souboru, AI vytěžení
// ještě neproběhlo) appka počítá jako "aktivní" (Aktivni u ní defaultuje na
// ANO, viz smlouvy-upload.js) - jinak čerstvě nahraná smlouva při běžném
// pohledu "Aktivní" zmizí, dokud appka nedokončí zpracování.
function jeSmlouvaNeaktivni(s) {
  return s.Stav !== 'Zpracovává se' && String(s.Aktivni || 'ANO').trim() === 'NE';
}

function stavTridaSmlouva(s) {
  if (s.Stav === 'Zpracovává se') return 'stav-zpracovava';
  if (jeSmlouvaNeaktivni(s)) return 'stav-neaktivni';
  return 'stav-schvaleno';
}

function stavTextSmlouva(s) {
  if (s.Stav === 'Zpracovává se') return 'Zpracovává se';
  if (jeSmlouvaNeaktivni(s)) return 'Neaktivní';
  return 'Aktivní';
}

// v4.14 (Jan: "u smluv by šlo aby se daly posouvat jejich pořadí?") -
// appka drží ID smlouvy zrovna tažené myší (drag & drop), appka ho čte v
// dragover na JINÝCH řádcích, ať pozná, kterou smlouvu má přesouvat.
let smlouvaTazenaId = null;

function vykresliSmlouvy(smlouvy, prilohy) {
  smlouvySeznamAktualni = smlouvy;
  prilohySeznamAktualni = prilohy;
  const kontejner = document.getElementById('smlouvy-seznam');

  const neaktivniPocet = smlouvy.filter(jeSmlouvaNeaktivni).length;
  document.getElementById('sm-sekce-aktivni').textContent = 'Aktivní (' + (smlouvy.length - neaktivniPocet) + ')';
  document.getElementById('sm-sekce-neaktivni').textContent = 'Neaktivní (' + neaktivniPocet + ')';

  const filtrovane = smlouvy.filter((s) => (smlouvySekce === 'neaktivni' ? jeSmlouvaNeaktivni(s) : !jeSmlouvaNeaktivni(s)));
  // v4.14: appka řadí podle vlastního (přetažením měnitelného) pořadí
  // Poradi místo dřívějšího abecedního řazení podle Názvu - smlouvy bez
  // Poradi (mělo by appku dohnat /api/setup, viz setup.js) appka defenzivně
  // zařadí až za všechny s vyplněným pořadím, ať appka nespadne na NaN.
  const serazene = filtrovane.slice().sort((a, b) => {
    const pa = Number(a.Poradi);
    const pb = Number(b.Poradi);
    const cislaA = Number.isFinite(pa) ? pa : Number.MAX_SAFE_INTEGER;
    const cislaB = Number.isFinite(pb) ? pb : Number.MAX_SAFE_INTEGER;
    if (cislaA !== cislaB) return cislaA - cislaB;
    return (a.Nazev || '').localeCompare(b.Nazev || '', 'cs');
  });

  kontejner.innerHTML = '';
  serazene.forEach((s) => {
    const prilohyTeto = prilohy.filter((p) => p.Smlouva_ID === s.ID);
    kontejner.appendChild(vytvorRadekSmlouva(s, prilohyTeto));
  });

  if (serazene.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">' +
      (smlouvySekce === 'neaktivni' ? 'Žádné neaktivní smlouvy.' : 'Zatím žádné aktivní smlouvy.') +
      '</div>';
  }
}

// Skládací řádek Smlouvy - stejný vzor jako vytvorRadekDoklad výš.
function vytvorRadekSmlouva(s, prilohyTeto) {
  const radek = document.createElement('div');
  radek.className = 'smlouva-radek radek-' + stavTridaSmlouva(s);
  radek.dataset.smlouvaId = s.ID;

  const hlava = document.createElement('div');
  hlava.className = 'smlouva-radek-hlava';
  // (v4.4) Jan: "ve viditelném řádku jen tolik informací co se vleze na
  // stránku, zbytek zabalit, STAV nebude sloupec ale podbarvený řádek" -
  // appka tak sbalený řádek zúžila na 6 gridových polí (šipka/Číslo/Název/
  // Smluvní strany/Částka/Platnost) - Středisko, Typ a Perioda appka
  // přesunula do rozbaleného detailu (vytvorDetailSmlouva), stav appka
  // vyjadřuje jen podbarvením celého `.smlouva-radek` (viz radek.className
  // výš + `.radek-stav-*` v style.css), ne samostatným chipem v řádku.
  // Appka i tady vykresluje VŠECHNY gridové sloupce vždy (i prázdné), ať se
  // se zarovnáním napříč řádky nic nerozbije (stejný důvod jako v4.3).
  // (v4.14): appka do prvního (šipkového) sloupce navíc přidala tahadlo
  // (⠿) pro přetažení - appka ho schválně nechala ve STEJNÉM gridovém
  // sloupci jako šipku rozbalení, ať appka nemusí přidávat další sloupec
  // do gridu (a tím i měnit `nth-child` pravidla pro schovávání sloupců
  // na mobilu, viz breakpoints níže).
  const smluvniStrany = [s.Firma, s.Druha_strana].filter(Boolean).join(' / ');
  const platnost = [s.Platnost_od, s.Platnost_do].filter(Boolean).join(' - ');
  hlava.innerHTML =
    '<span class="smlouva-poradi-sipka">' +
      '<span class="smlouva-tahadlo" draggable="true" title="Přetáhněte pro změnu pořadí">⠿</span>' +
      '<span class="smlouva-sipka">▶</span>' +
    '</span>' +
    '<span class="cislo-smlouvy">' + escapeHtml(s.Cislo_smlouvy || '') + '</span>' +
    '<span class="nazev-smlouvy">' +
      escapeHtml(s.Stav === 'Zpracovává se' ? '(čeká na zpracování)' : (s.Nazev || '(bez názvu)')) +
    '</span>' +
    '<span>' + escapeHtml(smluvniStrany) + '</span>' +
    '<span class="castka">' + (s.Ocekavana_castka !== undefined && s.Ocekavana_castka !== '' ? formatCastkaSMenou(s.Ocekavana_castka, s.Mena) : '') + '</span>' +
    '<span class="popis">' + escapeHtml(platnost) + '</span>';

  const detail = document.createElement('div');
  detail.className = 'smlouva-radek-detail';

  hlava.addEventListener('click', () => {
    radek.classList.toggle('rozbaleno');
    if (radek.classList.contains('rozbaleno') && !radek.dataset.naplneno) {
      radek.dataset.naplneno = '1';
      detail.appendChild(vytvorDetailSmlouva(s, prilohyTeto));
    }
  });

  // v4.14 - drag & drop přesun pořadí. Appka tažení váže jen na samotné
  // tahadlo (ne na celý řádek), ať se nebije s klikáním na řádek (rozbalení)
  // ani s tlačítky uvnitř rozbaleného detailu.
  const tahadlo = hlava.querySelector('.smlouva-tahadlo');
  tahadlo.addEventListener('click', (e) => e.stopPropagation());
  tahadlo.addEventListener('dragstart', (e) => {
    smlouvaTazenaId = s.ID;
    radek.classList.add('tazeny');
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', s.ID);
  });
  tahadlo.addEventListener('dragend', () => {
    radek.classList.remove('tazeny');
    smlouvaTazenaId = null;
  });
  // dragover/drop appka poslouchá na CELÉM řádku (ne jen na tahadle), ať
  // appka pozná přetažení nad libovolnou částí cílového řádku.
  radek.addEventListener('dragover', (e) => {
    if (!smlouvaTazenaId || smlouvaTazenaId === s.ID) return;
    e.preventDefault();
    const kontejner = radek.parentElement;
    const tazenyRadek = kontejner && kontejner.querySelector('.smlouva-radek[data-smlouva-id="' + smlouvaTazenaId + '"]');
    if (!kontejner || !tazenyRadek || tazenyRadek === radek) return;
    const obdelnik = radek.getBoundingClientRect();
    const zaPolovinou = e.clientY - obdelnik.top > obdelnik.height / 2;
    kontejner.insertBefore(tazenyRadek, zaPolovinou ? radek.nextSibling : radek);
  });
  radek.addEventListener('drop', (e) => {
    e.preventDefault();
    ulozNovePoradiSmluv();
  });

  radek.appendChild(hlava);
  radek.appendChild(detail);
  return radek;
}

// v4.14 - appka po puštění přetaženého řádku přečte AKTUÁLNÍ pořadí
// řádků přímo z DOM (appka ho během dragover živě přeuspořádávala) a
// uloží nová Poradi jen u těch smluv, kterým se skutečně změnilo - appka
// tím zároveň zajistí, že pořadí appka mění jen v RÁMCI zrovna zobrazené
// sekce (Aktivní/Neaktivní), protože v kontejneru appka v danou chvíli
// vykresluje vždy jen řádky jedné sekce.
async function ulozNovePoradiSmluv() {
  const kontejner = document.getElementById('smlouvy-seznam');
  const idPoPoradi = Array.from(kontejner.querySelectorAll('.smlouva-radek[data-smlouva-id]')).map(
    (el) => el.dataset.smlouvaId
  );

  const zmeny = [];
  idPoPoradi.forEach((id, index) => {
    const s = smlouvySeznamAktualni.find((x) => x.ID === id);
    if (s && Number(s.Poradi) !== index) {
      zmeny.push({ id, poradi: index });
    }
  });
  if (zmeny.length === 0) return;

  try {
    await Promise.all(
      zmeny.map((z) =>
        zavolejApi('/smlouvy', { method: 'PATCH', body: JSON.stringify({ id: z.id, zmeny: { Poradi: String(z.poradi) } }) })
      )
    );
    zmeny.forEach((z) => {
      const s = smlouvySeznamAktualni.find((x) => x.ID === z.id);
      if (s) s.Poradi = String(z.poradi);
    });
  } catch (e) {
    alert('Nepodařilo se uložit nové pořadí smluv (' + e.message + '). Appka teď seznam znovu načte.');
    await nactiSmlouvy();
  }
}

// Sekce příloh v detailu smlouvy (od v3.21) - seznam souborů (smlouva samotná
// + případné roční vyúčtování apod.) s možností přidat další/smazat
// jednotlivou přílohu, viz netlify/functions/smlouvy-upload.js (s
// smlouva_id) a smlouvy-prilohy.js.
function vytvorPrilohySekce(s, prilohyTeto) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '14px';

  const nadpis = document.createElement('div');
  nadpis.innerHTML = '<strong>Přílohy</strong>';
  wrap.appendChild(nadpis);

  const seznam = document.createElement('ul');
  seznam.className = 'priloha-smlouvy-seznam';
  prilohyTeto.forEach((p) => {
    const li = document.createElement('li');
    const odkaz = document.createElement('a');
    odkaz.href = p.Zdrojovy_soubor_URL || '#';
    odkaz.target = '_blank';
    odkaz.rel = 'noopener';
    odkaz.textContent = p.Nazev_souboru || '(soubor bez názvu)';
    li.appendChild(odkaz);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni smazat-prilohu';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazPrilohuSmlouvy(p.ID, p.Nazev_souboru, tlacitkoSmazat);
    li.appendChild(tlacitkoSmazat);

    seznam.appendChild(li);
  });
  wrap.appendChild(seznam);

  if (prilohyTeto.length === 0) {
    const prazdno = document.createElement('div');
    prazdno.className = 'popis';
    prazdno.textContent = 'Zatím žádné přílohy.';
    wrap.appendChild(prazdno);
  }

  // Starší (legacy) ručně vložená URL appka zobrazí, pokud existuje, i když
  // ji nové UI/upload už nevyplňuje (viz lib/smlouvySchema.js).
  if (s.Zdrojovy_soubor_URL) {
    const legacy = document.createElement('div');
    legacy.className = 'popis';
    legacy.innerHTML = 'Starší odkaz na soubor: <a href="' + escapeAttr(s.Zdrojovy_soubor_URL) + '" target="_blank" rel="noopener">otevřít</a>';
    wrap.appendChild(legacy);
  }

  const tlacitkoPridat = document.createElement('button');
  tlacitkoPridat.className = 'maly sekundarni';
  tlacitkoPridat.style.marginTop = '6px';
  tlacitkoPridat.textContent = '📁 Přidat přílohu';
  const poleSoubor = document.createElement('input');
  poleSoubor.type = 'file';
  poleSoubor.accept = 'image/*,application/pdf';
  poleSoubor.className = 'skryto';
  poleSoubor.addEventListener('change', (e) => {
    const soubor = e.target.files[0];
    poleSoubor.value = '';
    if (soubor) pridatPrilohuKSmlouve(s.ID, soubor, tlacitkoPridat);
  });
  tlacitkoPridat.addEventListener('click', () => poleSoubor.click());
  wrap.appendChild(tlacitkoPridat);
  wrap.appendChild(poleSoubor);

  return wrap;
}

function vytvorDetailSmlouva(s, prilohyTeto) {
  const wrap = document.createElement('div');

  // Smlouva ve fázi 1 (soubor uložený, AI zpracování ještě neproběhlo/se
  // nepovedlo) - appka místo editace prázdných polí rovnou nabídne
  // dokončení zpracování (stejný vzor jako u Dokladu, viz vytvorDetailDoklad).
  if (s.Stav === 'Zpracovává se') {
    const info = document.createElement('div');
    info.className = 'zprava info';
    info.textContent =
      'Soubor je bezpečně uložený, AI zpracování údajů ještě neproběhlo (nebo se dřív nepovedlo kvůli ' +
      'dočasnému přetížení). Dokončete ho tlačítkem níž - nic nemusíte nahrávat znovu.';
    wrap.appendChild(info);

    const akce = document.createElement('div');
    akce.className = 'radek-akci';
    const tlacitkoDokoncit = document.createElement('button');
    tlacitkoDokoncit.className = 'maly';
    tlacitkoDokoncit.textContent = 'Dokončit zpracování';
    tlacitkoDokoncit.onclick = () => dokoncitZpracovaniSmlouvy(s.ID, tlacitkoDokoncit);
    akce.appendChild(tlacitkoDokoncit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazSmlouvu(s.ID, s.Nazev || '(bez názvu)', tlacitkoSmazat);
    akce.appendChild(tlacitkoSmazat);
    wrap.appendChild(akce);

    wrap.appendChild(vytvorPrilohySekce(s, prilohyTeto));
    return wrap;
  }

  // Číslo smlouvy appka přiděluje sama (od v4.2) - jen zobrazí, needituje se.
  if (s.Cislo_smlouvy) {
    const labelCislo = document.createElement('label');
    labelCislo.textContent = 'Číslo smlouvy';
    const zobrazeniCislo = document.createElement('div');
    zobrazeniCislo.className = 'popis';
    zobrazeniCislo.style.marginBottom = '8px';
    zobrazeniCislo.textContent = s.Cislo_smlouvy;
    wrap.appendChild(labelCislo);
    wrap.appendChild(zobrazeniCislo);
  }

  // AI vytěžené (nebo ručně zadané) údaje appka ukazuje jako běžně
  // editovatelná pole - Jan si je zkontroluje/opraví a uloží, appka žádný
  // odhad AI nikdy sama nepotvrzuje/nepoužije jinde bez týhle kontroly.
  const labelNazev = document.createElement('label');
  labelNazev.textContent = 'Název';
  const vstupNazev = document.createElement('input');
  vstupNazev.type = 'text';
  vstupNazev.value = s.Nazev || '';
  wrap.appendChild(labelNazev);
  wrap.appendChild(vstupNazev);

  const labelDruhaStrana = document.createElement('label');
  labelDruhaStrana.textContent = 'Druhá smluvní strana';
  const vstupDruhaStrana = document.createElement('input');
  vstupDruhaStrana.type = 'text';
  vstupDruhaStrana.value = s.Druha_strana || '';
  wrap.appendChild(labelDruhaStrana);
  wrap.appendChild(vstupDruhaStrana);

  const labelFirma = document.createElement('label');
  labelFirma.textContent = 'Firma';
  const vstupFirma = document.createElement('select');
  vstupFirma.innerHTML = moznostiFirmySeznam(firmyProVyberSmlouvy, s.Firma || '');
  wrap.appendChild(labelFirma);
  wrap.appendChild(vstupFirma);

  const labelStredisko = document.createElement('label');
  labelStredisko.textContent = 'Středisko';
  const vstupStredisko = document.createElement('select');
  vstupStredisko.innerHTML = moznostiStrediska(s.Stredisko || '');
  wrap.appendChild(labelStredisko);
  wrap.appendChild(vstupStredisko);

  const labelTyp = document.createElement('label');
  labelTyp.textContent = 'Typ';
  const vstupTyp = document.createElement('select');
  vstupTyp.innerHTML = moznostiTypSmlouvy(s.Typ || '');
  wrap.appendChild(labelTyp);
  wrap.appendChild(vstupTyp);

  const labelPerioda = document.createElement('label');
  labelPerioda.textContent = 'Perioda';
  const vstupPerioda = document.createElement('select');
  vstupPerioda.innerHTML = moznostiPeriodaSmlouvy(s.Perioda || '');
  wrap.appendChild(labelPerioda);
  wrap.appendChild(vstupPerioda);

  const labelCastka = document.createElement('label');
  labelCastka.textContent = 'Očekávaná částka';
  const vstupCastka = document.createElement('input');
  vstupCastka.type = 'number';
  vstupCastka.step = '0.01';
  vstupCastka.value = s.Ocekavana_castka !== undefined && s.Ocekavana_castka !== '' ? parsujCastkuZListu(s.Ocekavana_castka) : '';
  wrap.appendChild(labelCastka);
  wrap.appendChild(vstupCastka);

  const labelMena = document.createElement('label');
  labelMena.textContent = 'Měna';
  const vstupMena = document.createElement('input');
  vstupMena.type = 'text';
  vstupMena.value = s.Mena || 'CZK';
  vstupMena.style.maxWidth = '90px';
  wrap.appendChild(labelMena);
  wrap.appendChild(vstupMena);

  const labelOd = document.createElement('label');
  labelOd.textContent = 'Platnost od';
  const vstupOd = document.createElement('input');
  vstupOd.type = 'date';
  vstupOd.value = s.Platnost_od || '';
  wrap.appendChild(labelOd);
  wrap.appendChild(vstupOd);

  const labelDo = document.createElement('label');
  labelDo.textContent = 'Platnost do';
  const vstupDo = document.createElement('input');
  vstupDo.type = 'date';
  vstupDo.value = s.Platnost_do || '';
  wrap.appendChild(labelDo);
  wrap.appendChild(vstupDo);

  const labelPoznamka = document.createElement('label');
  labelPoznamka.textContent = 'Poznámka';
  const vstupPoznamka = document.createElement('input');
  vstupPoznamka.type = 'text';
  vstupPoznamka.value = s.Poznamka || '';
  wrap.appendChild(labelPoznamka);
  wrap.appendChild(vstupPoznamka);

  const labelAktivni = document.createElement('label');
  labelAktivni.style.display = 'flex';
  labelAktivni.style.alignItems = 'center';
  labelAktivni.style.gap = '8px';
  const vstupAktivni = document.createElement('input');
  vstupAktivni.type = 'checkbox';
  vstupAktivni.checked = String(s.Aktivni || 'ANO').trim() !== 'NE';
  labelAktivni.appendChild(vstupAktivni);
  labelAktivni.appendChild(document.createTextNode('Aktivní'));
  wrap.appendChild(labelAktivni);

  function ziskejZmeny() {
    return {
      Nazev: vstupNazev.value.trim(),
      Druha_strana: vstupDruhaStrana.value.trim(),
      Firma: vstupFirma.value.trim(),
      Stredisko: vstupStredisko.value.trim(),
      Typ: vstupTyp.value.trim(),
      Perioda: vstupPerioda.value.trim(),
      Ocekavana_castka: vstupCastka.value,
      Mena: vstupMena.value.trim() || 'CZK',
      Platnost_od: vstupOd.value,
      Platnost_do: vstupDo.value,
      Poznamka: vstupPoznamka.value.trim(),
      Aktivni: vstupAktivni.checked ? 'ANO' : 'NE',
    };
  }

  const akce = document.createElement('div');
  akce.className = 'radek-akci';

  const tlacitkoUlozit = document.createElement('button');
  tlacitkoUlozit.className = 'maly sekundarni';
  tlacitkoUlozit.textContent = 'Uložit';
  tlacitkoUlozit.onclick = () => ulozSmlouvu(s.ID, ziskejZmeny(), tlacitkoUlozit);
  akce.appendChild(tlacitkoUlozit);

  const tlacitkoSmazat = document.createElement('button');
  tlacitkoSmazat.className = 'maly sekundarni';
  tlacitkoSmazat.textContent = 'Smazat';
  tlacitkoSmazat.onclick = () => smazSmlouvu(s.ID, s.Nazev || '(bez názvu)', tlacitkoSmazat);
  akce.appendChild(tlacitkoSmazat);

  wrap.appendChild(akce);
  wrap.appendChild(vytvorPrilohySekce(s, prilohyTeto));

  return wrap;
}

// ---------- NAHRÁVÁNÍ SMLOUVY (dvoufázově, stejný vzor jako Doklady - viz
// pripravSouborKNahrani/zmensiObrazek/souborNaBase64 výš, znovu použité) ----------

let vybranySouborSmlouva = null;

async function zpracujVybranySouborSmlouva(soubor) {
  const zprava = document.getElementById('sm-nahrat-zprava');
  const info = document.getElementById('sm-vybrany-soubor-info');
  zprava.innerHTML = '';
  document.getElementById('sm-tlacitko-nahrat').disabled = true;

  if (!soubor) {
    vybranySouborSmlouva = null;
    info.textContent = '';
    return;
  }

  try {
    vybranySouborSmlouva = await pripravSouborKNahrani(soubor);
    info.textContent = 'Vybráno: ' + soubor.name;
    document.getElementById('sm-tlacitko-nahrat').disabled = false;
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">Soubor se nepodařilo zpracovat: ' + escapeHtml(e.message) + '</div>';
  }
}

async function nahratSmlouvu() {
  const zprava = document.getElementById('sm-nahrat-zprava');
  const tlacitko = document.getElementById('sm-tlacitko-nahrat');
  if (!vybranySouborSmlouva) return;

  tlacitko.disabled = true;
  zprava.innerHTML = '<div class="zprava">Nahrávám soubor…</div>';

  let smlouva;
  try {
    const odpoved = await zavolejApi('/smlouvy-upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: vybranySouborSmlouva.nazev,
        mimeType: vybranySouborSmlouva.mimeType,
        dataBase64: vybranySouborSmlouva.data,
      }),
    });
    smlouva = odpoved.smlouva;
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">Soubor se nepodařilo nahrát: ' + escapeHtml(e.message) + '</div>';
    tlacitko.disabled = !vybranySouborSmlouva;
    return;
  }

  document.getElementById('sm-pole-soubor').value = '';
  document.getElementById('sm-pole-foto').value = '';
  document.getElementById('sm-vybrany-soubor-info').textContent = '';
  vybranySouborSmlouva = null;
  tlacitko.disabled = true;

  zprava.innerHTML = '<div class="zprava">Soubor nahrán, appka na pozadí čte údaje pomocí AI (může trvat několik vteřin)…</div>';
  try {
    await zavolejApi('/smlouvy-upload-dokoncit', { method: 'POST', body: JSON.stringify({ id: smlouva.ID }) });
    zprava.innerHTML = '<div class="zprava uspech">Smlouva byla nahrána a zpracována AI. Zkontrolujte vytažené údaje v seznamu níž a případně je opravte.</div>';
  } catch (e) {
    zprava.innerHTML =
      '<div class="zprava info">Soubor byl bezpečně nahrán, ale zpracování údajů pomocí AI se teď nepovedlo ' +
      '(' + escapeHtml(e.message) + '). Nic jste neztratili - smlouvu najdete v seznamu níž se stavem ' +
      '„Zpracovává se“ a zpracování jde odtud kdykoli zopakovat tlačítkem „Dokončit zpracování“, ' +
      'bez nutnosti cokoliv nahrávat znovu.</div>';
  } finally {
    tlacitko.disabled = !vybranySouborSmlouva;
    await nactiSmlouvy();
  }
}

async function dokoncitZpracovaniSmlouvy(id, tlacitko) {
  tlacitko.disabled = true;
  const puvodniText = tlacitko.textContent;
  tlacitko.textContent = 'Zpracovávám…';
  try {
    await zavolejApi('/smlouvy-upload-dokoncit', { method: 'POST', body: JSON.stringify({ id }) });
    await nactiSmlouvy();
  } catch (e) {
    alert(
      'Zpracování se zatím nepovedlo (' + e.message + '). Soubor zůstává bezpečně uložený, zkuste to prosím ' +
      'za chvíli znovu.'
    );
    tlacitko.disabled = false;
    tlacitko.textContent = puvodniText;
  }
}

// ---------- PŘÍLOHY SMLOUVY (registr, od v3.21) ----------

async function pridatPrilohuKSmlouve(smlouvaId, soubor, tlacitko) {
  if (tlacitko) tlacitko.disabled = true;
  try {
    const pripraveny = await pripravSouborKNahrani(soubor);
    await zavolejApi('/smlouvy-upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: pripraveny.nazev,
        mimeType: pripraveny.mimeType,
        dataBase64: pripraveny.data,
        smlouva_id: smlouvaId,
      }),
    });
    await nactiSmlouvy();
  } catch (e) {
    alert('Nepodařilo se přidat přílohu: ' + e.message);
    if (tlacitko) tlacitko.disabled = false;
  }
}

async function smazPrilohuSmlouvy(id, nazevSouboru, tlacitko) {
  if (!confirm('Opravdu smazat přílohu „' + (nazevSouboru || '(bez názvu)') + '“? Appka soubor smaže jen z evidence, na Disku zůstane.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/smlouvy-prilohy?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await nactiSmlouvy();
  } catch (e) {
    alert('Nepodařilo se smazat přílohu: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- SMLOUVY: RUČNÍ PŘIDÁNÍ / ÚPRAVA / SMAZÁNÍ ----------

async function pridatSmlouvu() {
  const zprava = document.getElementById('smlouvy-zprava');
  zprava.innerHTML = '';

  const firma = document.getElementById('nova-sm-firma').value;
  const nazev = document.getElementById('nova-sm-nazev').value.trim();
  if (!firma) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte firmu.</div>';
    return;
  }
  if (!nazev) {
    zprava.innerHTML = '<div class="zprava chyba">Název smlouvy je povinný.</div>';
    return;
  }

  try {
    await zavolejApi('/smlouvy', {
      method: 'POST',
      body: JSON.stringify({
        Firma: firma,
        Nazev: nazev,
        Druha_strana: document.getElementById('nova-sm-druha-strana').value.trim(),
        Stredisko: document.getElementById('nova-sm-stredisko').value,
        Typ: document.getElementById('nova-sm-typ').value,
        Perioda: document.getElementById('nova-sm-perioda').value,
        Ocekavana_castka: document.getElementById('nova-sm-castka').value,
        Mena: document.getElementById('nova-sm-mena').value.trim() || 'CZK',
        Platnost_od: document.getElementById('nova-sm-od').value,
        Platnost_do: document.getElementById('nova-sm-do').value,
        Zdrojovy_soubor_URL: document.getElementById('nova-sm-url').value.trim(),
        Poznamka: document.getElementById('nova-sm-poznamka').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Smlouva přidána.</div>';
    document.getElementById('nova-sm-nazev').value = '';
    document.getElementById('nova-sm-druha-strana').value = '';
    document.getElementById('nova-sm-castka').value = '';
    document.getElementById('nova-sm-mena').value = 'CZK';
    document.getElementById('nova-sm-od').value = '';
    document.getElementById('nova-sm-do').value = '';
    document.getElementById('nova-sm-url').value = '';
    document.getElementById('nova-sm-poznamka').value = '';
    await nactiSmlouvy();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozSmlouvu(id, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/smlouvy', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    await nactiSmlouvy();
  } catch (e) {
    alert('Nepodařilo se uložit smlouvu: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazSmlouvu(id, nazev, tlacitko) {
  if (!confirm('Opravdu smazat smlouvu „' + nazev + '“? Bankovní pohyby na ni napojené se vrátí do stavu "Nespárováno" a smažou se i všechny přílohy smlouvy.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/smlouvy?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await nactiSmlouvy();
  } catch (e) {
    alert('Nepodařilo se smazat smlouvu: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- NEMOVITOSTI ----------
// Appka měla ve v4.19-v4.22 tady vlastní samostatnou entitu (list
// "Nemovitosti", CRUD, přehled placeno/nezaplaceno podle napojené nájemní
// Smlouvy) - Jan (2026-07-23) tenhle přístup zpětně vyhodnotil jako
// nesystémový ("nemovitost je zase jen středisko") a appka se v4.23 vrátila
// k jednoduššímu modelu: Středisko zůstává JEDINÝM číselníkem pro
// kategorizaci (appka ho ostatně už dřív nabízela i jako hodnotu
// "Nemovitosti", viz MOZNOSTI_STREDISKA výš) a nájemní příjem appka řeší
// čistě přes spárování s nájemní Smlouvou (viz vytvorDetailBanka výš,
// "Navrženo/Spárováno - nájemní smlouva") + automatické převzetí
// Smlouva.Stredisko na bankovní pohyb při potvrzení. Appka tak už NEMÁ
// vlastní list/CRUD Nemovitostí ani měsíční přehled zaplaceno/nezaplaceno -
// záložka se vrátila do prázdného placeholderu (stejně jako ve v4.16, viz
// public/index.html).

// ---------- KNIHA JÍZD (backlog, položka 16) ----------

let firmyProVyberKnihaJizd = [];
let knihaJizdSekce = 'jizdy';
let knihaJizdSouhrnData = null;

async function nactiKnihaJizd() {
  const nacitani = document.getElementById('kniha-jizd-nacitani');
  const kontejner = document.getElementById('kniha-jizd-seznam');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';
  kontejner.innerHTML = '';

  try {
    const [dataJizdy, dataFirmy, dataStrediska] = await Promise.all([
      zavolejApi('/kniha-jizd', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
    ]);
    firmyProVyberKnihaJizd = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    strediskaSeznam = dataStrediska.strediska || [];
    vyplnVyberFirem('nova-kj-firma', firmyProVyberKnihaJizd);
    vyplnVyberFirem('kj-import-firma', firmyProVyberKnihaJizd);
    if (!document.getElementById('nova-kj-auto').dataset.naplneno) {
      document.getElementById('nova-kj-auto').innerHTML = moznostiAuta('');
      document.getElementById('nova-kj-auto').dataset.naplneno = '1';
    }
    if (!document.getElementById('kj-import-auto').dataset.naplneno) {
      document.getElementById('kj-import-auto').innerHTML = moznostiAuta('');
      document.getElementById('kj-import-auto').dataset.naplneno = '1';
    }
    nacitani.classList.add('skryto');
    vykresliKnihaJizd(dataJizdy.jizdy || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst Knihu jízd: ' + e.message;
  }

  if (knihaJizdSekce === 'souhrn') nactiKnihaJizdSouhrn();
}

function prepniKnihaJizdSekci(sekce) {
  knihaJizdSekce = sekce;
  document.getElementById('kj-sekce-jizdy').classList.toggle('aktivni', sekce === 'jizdy');
  document.getElementById('kj-sekce-souhrn').classList.toggle('aktivni', sekce === 'souhrn');
  document.getElementById('kj-obsah-jizdy').classList.toggle('skryto', sekce !== 'jizdy');
  document.getElementById('kj-obsah-souhrn').classList.toggle('skryto', sekce !== 'souhrn');
  if (sekce === 'souhrn' && !knihaJizdSouhrnData) nactiKnihaJizdSouhrn();
}

function vykresliKnihaJizd(jizdy) {
  const kontejner = document.getElementById('kniha-jizd-seznam');
  const serazene = jizdy.slice().sort((a, b) => (b.Datum || '').localeCompare(a.Datum || ''));

  kontejner.innerHTML = '';
  serazene.forEach((j) => kontejner.appendChild(vytvorRadekJizda(j)));

  if (serazene.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">Zatím žádné jízdy - přidejte první ručně, nebo naimportujte CSV výš.</div>';
  }
}

// Skládací řádek Kniha jízd - stejný vzor jako vytvorRadekSmlouva výš, appka
// vykresluje VŠECHNY gridové sloupce vždy (i prázdné), ať zůstane zarovnané.
function vytvorRadekJizda(j) {
  const radek = document.createElement('div');
  radek.className = 'kj-radek';

  const hlava = document.createElement('div');
  hlava.className = 'kj-radek-hlava';
  hlava.innerHTML =
    '<span class="kj-sipka">▶</span>' +
    '<span>' + escapeHtml(j.Datum || '') + '</span>' +
    '<span>' + escapeHtml(j.Auto || '') + '</span>' +
    '<span class="popis">' + escapeHtml(j.Ucel_cesty || '') + '</span>' +
    '<span class="castka">' + escapeHtml(j.Ujete_km !== undefined && j.Ujete_km !== '' ? String(j.Ujete_km) + ' km' : '') + '</span>' +
    '<span>' + escapeHtml(j.Ridic || '') + '</span>';

  const detail = document.createElement('div');
  detail.className = 'kj-radek-detail';

  hlava.addEventListener('click', () => {
    radek.classList.toggle('rozbaleno');
    if (radek.classList.contains('rozbaleno') && !radek.dataset.naplneno) {
      radek.dataset.naplneno = '1';
      detail.appendChild(vytvorDetailJizda(j));
    }
  });

  radek.appendChild(hlava);
  radek.appendChild(detail);
  return radek;
}

function vytvorDetailJizda(j) {
  const wrap = document.createElement('div');
  wrap.className = 'radek-detail-obsah';

  const labelFirma = document.createElement('label');
  labelFirma.textContent = 'Firma';
  const vstupFirma = document.createElement('select');
  vstupFirma.innerHTML = moznostiFirmySeznam(firmyProVyberKnihaJizd, j.Firma || '');
  wrap.appendChild(labelFirma);
  wrap.appendChild(vstupFirma);

  const labelAuto = document.createElement('label');
  labelAuto.textContent = 'Auto';
  const vstupAuto = document.createElement('select');
  vstupAuto.innerHTML = moznostiAuta(j.Auto || '');
  wrap.appendChild(labelAuto);
  wrap.appendChild(vstupAuto);

  const labelRidic = document.createElement('label');
  labelRidic.textContent = 'Řidič';
  const vstupRidic = document.createElement('input');
  vstupRidic.type = 'text';
  vstupRidic.value = j.Ridic || '';
  wrap.appendChild(labelRidic);
  wrap.appendChild(vstupRidic);

  const labelDatum = document.createElement('label');
  labelDatum.textContent = 'Datum';
  const vstupDatum = document.createElement('input');
  vstupDatum.type = 'date';
  vstupDatum.value = j.Datum || '';
  wrap.appendChild(labelDatum);
  wrap.appendChild(vstupDatum);

  const labelUcel = document.createElement('label');
  labelUcel.textContent = 'Odkud/kam nebo účel cesty';
  const vstupUcel = document.createElement('input');
  vstupUcel.type = 'text';
  vstupUcel.value = j.Ucel_cesty || '';
  wrap.appendChild(labelUcel);
  wrap.appendChild(vstupUcel);

  const labelKm = document.createElement('label');
  labelKm.textContent = 'Ujeté km';
  const vstupKm = document.createElement('input');
  vstupKm.type = 'number';
  vstupKm.step = '1';
  vstupKm.value = j.Ujete_km !== undefined && j.Ujete_km !== '' ? j.Ujete_km : '';
  wrap.appendChild(labelKm);
  wrap.appendChild(vstupKm);

  const labelTachOd = document.createElement('label');
  labelTachOd.textContent = 'Tachometr - počáteční stav';
  const vstupTachOd = document.createElement('input');
  vstupTachOd.type = 'number';
  vstupTachOd.step = '1';
  vstupTachOd.value = j.Pocatecni_tachometr !== undefined && j.Pocatecni_tachometr !== '' ? j.Pocatecni_tachometr : '';
  wrap.appendChild(labelTachOd);
  wrap.appendChild(vstupTachOd);

  const labelTachDo = document.createElement('label');
  labelTachDo.textContent = 'Tachometr - koncový stav';
  const vstupTachDo = document.createElement('input');
  vstupTachDo.type = 'number';
  vstupTachDo.step = '1';
  vstupTachDo.value = j.Konecny_tachometr !== undefined && j.Konecny_tachometr !== '' ? j.Konecny_tachometr : '';
  wrap.appendChild(labelTachDo);
  wrap.appendChild(vstupTachDo);

  const labelPoznamka = document.createElement('label');
  labelPoznamka.textContent = 'Poznámka';
  const vstupPoznamka = document.createElement('input');
  vstupPoznamka.type = 'text';
  vstupPoznamka.value = j.Poznamka || '';
  wrap.appendChild(labelPoznamka);
  wrap.appendChild(vstupPoznamka);

  if (j.Zdroj) {
    const zdrojDiv = document.createElement('div');
    zdrojDiv.className = 'popis';
    zdrojDiv.style.marginTop = '6px';
    zdrojDiv.textContent = 'Zdroj: ' + j.Zdroj;
    wrap.appendChild(zdrojDiv);
  }

  function ziskejZmeny() {
    return {
      Firma: vstupFirma.value.trim(),
      Auto: vstupAuto.value.trim(),
      Ridic: vstupRidic.value.trim(),
      Datum: vstupDatum.value,
      Ucel_cesty: vstupUcel.value.trim(),
      Ujete_km: vstupKm.value,
      Pocatecni_tachometr: vstupTachOd.value,
      Konecny_tachometr: vstupTachDo.value,
      Poznamka: vstupPoznamka.value.trim(),
    };
  }

  const akce = document.createElement('div');
  akce.className = 'radek-akci';

  const tlacitkoUlozit = document.createElement('button');
  tlacitkoUlozit.className = 'maly sekundarni';
  tlacitkoUlozit.textContent = 'Uložit';
  tlacitkoUlozit.onclick = () => ulozJizdu(j.ID, ziskejZmeny(), tlacitkoUlozit);
  akce.appendChild(tlacitkoUlozit);

  const tlacitkoSmazat = document.createElement('button');
  tlacitkoSmazat.className = 'maly sekundarni';
  tlacitkoSmazat.textContent = 'Smazat';
  tlacitkoSmazat.onclick = () => smazJizdu(j.ID, tlacitkoSmazat);
  akce.appendChild(tlacitkoSmazat);

  wrap.appendChild(akce);
  return wrap;
}

async function pridatJizdu() {
  const zprava = document.getElementById('kniha-jizd-zprava');
  zprava.innerHTML = '';

  const firma = document.getElementById('nova-kj-firma').value;
  const auto = document.getElementById('nova-kj-auto').value;
  const datum = document.getElementById('nova-kj-datum').value;
  if (!firma) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte firmu.</div>';
    return;
  }
  if (!auto) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte auto.</div>';
    return;
  }
  if (!datum) {
    zprava.innerHTML = '<div class="zprava chyba">Datum jízdy je povinné.</div>';
    return;
  }

  try {
    await zavolejApi('/kniha-jizd', {
      method: 'POST',
      body: JSON.stringify({
        Firma: firma,
        Auto: auto,
        Ridic: document.getElementById('nova-kj-ridic').value.trim(),
        Datum: datum,
        Ucel_cesty: document.getElementById('nova-kj-ucel').value.trim(),
        Ujete_km: document.getElementById('nova-kj-km').value,
        Pocatecni_tachometr: document.getElementById('nova-kj-tachometr-od').value,
        Konecny_tachometr: document.getElementById('nova-kj-tachometr-do').value,
        Poznamka: document.getElementById('nova-kj-poznamka').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Jízda přidána.</div>';
    document.getElementById('nova-kj-ridic').value = '';
    document.getElementById('nova-kj-datum').value = '';
    document.getElementById('nova-kj-ucel').value = '';
    document.getElementById('nova-kj-km').value = '';
    document.getElementById('nova-kj-tachometr-od').value = '';
    document.getElementById('nova-kj-tachometr-do').value = '';
    document.getElementById('nova-kj-poznamka').value = '';
    await nactiKnihaJizd();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

// Import CSV uložených cest (od v4.8) - appka soubor čte jako obyčejný text
// (ne base64 jako u binárního XLS/XLSX u bankovních výpisů), stejný vzor
// jako CSV import bankovního výpisu (viz nahratVypis výš).
async function importovatKnihaJizdCsv() {
  const zprava = document.getElementById('kj-import-zprava');
  zprava.innerHTML = '';

  const pole = document.getElementById('kj-import-soubor');
  const soubor = pole.files && pole.files[0];
  const firma = document.getElementById('kj-import-firma').value;
  const auto = document.getElementById('kj-import-auto').value;
  if (!soubor) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte soubor CSV.</div>';
    return;
  }
  if (!firma) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte firmu.</div>';
    return;
  }
  if (!auto) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte auto, ke kterému soubor patří.</div>';
    return;
  }

  zprava.innerHTML = '<div class="zprava">Nahrávám a zpracovávám soubor…</div>';
  try {
    const obsah = await soubor.text();
    const vysledek = await zavolejApi('/kniha-jizd-import', {
      method: 'POST',
      body: JSON.stringify({
        Firma: firma,
        Auto: auto,
        Ridic: document.getElementById('kj-import-ridic').value.trim(),
        obsahSouboru: obsah,
      }),
    });
    zprava.innerHTML =
      '<div class="zprava uspech">Naimportováno ' + vysledek.naimportovano + ' z ' +
      vysledek.celkemVSouboru + ' jízd v souboru (' + vysledek.duplicitni +
      ' appka už měla z dřívějška, přeskočeno).</div>';
    pole.value = '';
    await nactiKnihaJizd();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozJizdu(id, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/kniha-jizd', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    await nactiKnihaJizd();
  } catch (e) {
    alert('Nepodařilo se uložit jízdu: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazJizdu(id, tlacitko) {
  if (!confirm('Opravdu smazat tuhle jízdu?')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/kniha-jizd?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await nactiKnihaJizd();
  } catch (e) {
    alert('Nepodařilo se smazat jízdu: ' + e.message);
    tlacitko.disabled = false;
  }
}

// Souhrn podle auta (km/litry/spotřeba) - appka nabízí jen výběr
// KALENDÁŘNÍHO roku a po rozkliknutí auta rozbalí všech 12 měsíců, stejný
// vzor jako Daňový přehled (vykresliDanovyPrehled výš).
async function nactiKnihaJizdSouhrn() {
  try {
    knihaJizdSouhrnData = await zavolejApi('/kniha-jizd-prehled', { method: 'GET' });
    naplnRokyDoVyberuKnihaJizd();
    vykresliKnihaJizdSouhrn();
  } catch (e) {
    document.getElementById('kj-souhrn-tabulka-telo').innerHTML =
      '<tr><td colspan="4" class="popis">Nepodařilo se načíst souhrn: ' + escapeHtml(e.message) + '</td></tr>';
  }
}

function naplnRokyDoVyberuKnihaJizd() {
  const vyberRok = document.getElementById('kj-souhrn-vyber-rok');
  const roky = (knihaJizdSouhrnData && knihaJizdSouhrnData.obdobiRoky) || [];
  if (roky.length === 0) {
    vyberRok.innerHTML = '<option value="">— žádná data —</option>';
    return;
  }
  vyberRok.innerHTML = roky.map((r) => '<option value="' + escapeAttr(r) + '">' + escapeHtml(r) + '</option>').join('');
  const aktualniRok = String(new Date().getFullYear());
  if (roky.includes(aktualniRok)) vyberRok.value = aktualniRok;
}
document.getElementById('kj-souhrn-vyber-rok').addEventListener('change', () => vykresliKnihaJizdSouhrn());

function vykresliKnihaJizdSouhrn() {
  const data = knihaJizdSouhrnData;
  if (!data) return;

  const rok = document.getElementById('kj-souhrn-vyber-rok').value;
  const telo = document.getElementById('kj-souhrn-tabulka-telo');
  telo.innerHTML = '';

  if (!rok) {
    telo.innerHTML = '<tr><td colspan="4" class="popis">Zatím žádná data ke Knize jízd.</td></tr>';
    return;
  }

  const souhrnRokAuta = (data.souhrnRocni || {})[rok] || {};
  const autaKZobrazeni = Object.keys(souhrnRokAuta).sort();

  if (autaKZobrazeni.length === 0) {
    telo.innerHTML = '<tr><td colspan="4" class="popis">Za vybraný rok appka nemá žádná data (ani jízdy, ani tankování).</td></tr>';
    return;
  }

  function bunkyRadku(prvniSloupecHtml, souhrn) {
    const km = souhrn ? souhrn.km : 0;
    const litry = souhrn ? souhrn.litry : 0;
    const spotreba = souhrn && souhrn.prumSpotreba !== null && souhrn.prumSpotreba !== undefined
      ? souhrn.prumSpotreba + ' l/100 km'
      : '<span class="popis">—</span>';
    return (
      '<td>' + prvniSloupecHtml + '</td>' +
      '<td>' + km + ' km</td>' +
      '<td>' + litry + ' l</td>' +
      '<td>' + spotreba + '</td>'
    );
  }

  autaKZobrazeni.forEach((auto) => {
    const trRok = document.createElement('tr');
    trRok.className = 'prehled-radek-rok';
    trRok.innerHTML = bunkyRadku(
      '<span class="prehled-sipka">▶</span><strong>' + escapeHtml(auto) + '</strong>',
      souhrnRokAuta[auto]
    );
    telo.appendChild(trRok);

    const radkyMesicu = [];
    for (let mesic = 1; mesic <= 12; mesic++) {
      const klicMesice = rok + '-' + String(mesic).padStart(2, '0');
      const souhrnMesic = ((data.souhrnMesicni || {})[klicMesice] || {})[auto];

      const trMesic = document.createElement('tr');
      trMesic.className = 'prehled-radek-mesic skryto';
      trMesic.innerHTML = bunkyRadku('<span class="prehled-mesic-label">' + escapeHtml(klicMesice) + '</span>', souhrnMesic);
      telo.appendChild(trMesic);
      radkyMesicu.push(trMesic);
    }

    trRok.addEventListener('click', () => {
      const zobrazit = !trRok.classList.contains('rozbaleno');
      trRok.classList.toggle('rozbaleno', zobrazit);
      radkyMesicu.forEach((trMesic) => trMesic.classList.toggle('skryto', !zobrazit));
    });
  });
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
document.getElementById('tlacitko-zustat-prihlasen').addEventListener('click', idleResetovatCasovac);
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
document.getElementById('tlacitko-pridat-stredisko').addEventListener('click', pridatStredisko);
document.getElementById('tlacitko-pridat-smlouvu').addEventListener('click', pridatSmlouvu);
document.getElementById('sm-tlacitko-vyfotit').addEventListener('click', () => document.getElementById('sm-pole-foto').click());
document.getElementById('sm-tlacitko-vybrat-soubor').addEventListener('click', () => document.getElementById('sm-pole-soubor').click());
document.getElementById('sm-pole-foto').addEventListener('change', (e) => zpracujVybranySouborSmlouva(e.target.files[0]));
document.getElementById('sm-pole-soubor').addEventListener('change', (e) => zpracujVybranySouborSmlouva(e.target.files[0]));
document.getElementById('sm-tlacitko-nahrat').addEventListener('click', nahratSmlouvu);
document.getElementById('sm-sekce-aktivni').addEventListener('click', () => prepniSmlouvySekci('aktivni'));
document.getElementById('sm-sekce-neaktivni').addEventListener('click', () => prepniSmlouvySekci('neaktivni'));
document.getElementById('tlacitko-pridat-jizdu').addEventListener('click', pridatJizdu);
document.getElementById('tlacitko-import-jizd').addEventListener('click', importovatKnihaJizdCsv);
document.getElementById('kj-sekce-jizdy').addEventListener('click', () => prepniKnihaJizdSekci('jizdy'));
document.getElementById('kj-sekce-souhrn').addEventListener('click', () => prepniKnihaJizdSekci('souhrn'));
document.getElementById('tlacitko-pripojit-google').addEventListener('click', () => {
  if (!stav || !stav.token) return;
  window.open('/.netlify/functions/google-oauth-start?token=' + encodeURIComponent(stav.token), '_blank');
});
document.getElementById('banka-vyber-firmy').addEventListener('change', nactiBankovniPohyby);
document.getElementById('tlacitko-nahrat-vypis').addEventListener('click', () => document.getElementById('pole-vypis').click());
document.getElementById('pole-vypis').addEventListener('change', (e) => nahratVypis(e.target.files[0]));
document.getElementById('tlacitko-banka-aktualizovat').addEventListener('click', (e) => aktualizovatBankovniPohyby(e.target));
document.getElementById('tlacitko-banka-kontrola').addEventListener('click', (e) => spustitKontroluDokladu(e.target));
document.getElementById('banka-jen-chybejici').addEventListener('click', (e) => {
  const zapnuto = e.target.getAttribute('aria-pressed') === 'true';
  e.target.setAttribute('aria-pressed', String(!zapnuto));
  vykresliBankovniPohyby();
});
document.getElementById('tlacitko-pridat-fakturu').addEventListener('click', pridatVydanouFakturu);
document.getElementById('vf-filtr-firma').addEventListener('change', vykresliVydaneFaktury);
document.getElementById('vf-tlacitko-vyfotit').addEventListener('click', () => document.getElementById('vf-pole-foto').click());
document.getElementById('vf-tlacitko-vybrat-soubor').addEventListener('click', () => document.getElementById('vf-pole-soubor').click());
document.getElementById('vf-pole-foto').addEventListener('change', (e) => zpracujVybranySouborVydaneFaktury(e.target.files[0]));
document.getElementById('vf-pole-soubor').addEventListener('change', (e) => zpracujVybranySouborVydaneFaktury(e.target.files[0]));
document.getElementById('vf-tlacitko-nahrat').addEventListener('click', nahratVydanouFakturu);
document.getElementById('tlacitko-motiv').addEventListener('click', prepniMotiv);
document.getElementById('vyber-skinu').addEventListener('change', (e) => zmenSkin(e.target.value));
document.getElementById('tlacitko-export-zobrazit').addEventListener('click', vykresliPrehledExport);
['export-firma', 'export-mesic', 'export-rok', 'export-stredisko'].forEach((id) => {
  document.getElementById(id).addEventListener('change', vykresliPrehledExport);
});

// Export XML pro Money S3 (od v4.27) - používá STEJNÉ filtry jako přehled
// výš v záložce Export (firma/měsíc/rok/středisko), appka jen skládá query
// string a stáhne soubor přes stahniSouborZApi() (viz definice výš u
// zavolejApi - export vrací XML, ne JSON, takže nejde použít zavolejApi
// přímo). Firma je POVINNÁ (backend/netlify/functions/export-money-s3.js
// bez ní vrátí 400) - "Všechny firmy" appka pro tenhle export nepodporuje,
// Money S3 stejně vždycky importuje účetnictví jedné konkrétní firmy.
document.getElementById('tlacitko-export-money-s3').addEventListener('click', async (e) => {
  const tlacitko = e.target;
  const zprava = document.getElementById('export-money-s3-zprava');
  const firma = document.getElementById('export-firma').value;
  if (!firma) {
    zprava.textContent = 'Nejdřív vyberte konkrétní firmu (ne „Všechny firmy“).';
    zprava.className = 'zprava chyba';
    return;
  }
  const mesic = document.getElementById('export-mesic').value;
  const rok = document.getElementById('export-rok').value;
  const stredisko = document.getElementById('export-stredisko').value;

  tlacitko.disabled = true;
  zprava.className = 'zprava skryto';
  try {
    const params = new URLSearchParams({ smer: 'prijate', firma });
    if (mesic) params.set('mesic', mesic);
    if (rok) params.set('rok', rok);
    if (stredisko) params.set('stredisko', stredisko);
    await stahniSouborZApi('/export-money-s3?' + params.toString());
    zprava.textContent = 'Export stažen.';
    zprava.className = 'zprava uspech';
  } catch (err) {
    zprava.textContent = 'Nepodařilo se stáhnout export: ' + err.message;
    zprava.className = 'zprava chyba';
  }
  tlacitko.disabled = false;
});

document.getElementById('tlacitko-export-money-s3-vf').addEventListener('click', async (e) => {
  const tlacitko = e.target;
  const zprava = document.getElementById('vf-export-money-s3-zprava');
  const firma = document.getElementById('vf-filtr-firma').value;
  if (!firma) {
    zprava.textContent = 'Nejdřív vyberte konkrétní firmu výš (ne „Všechny firmy“).';
    zprava.className = 'zprava chyba';
    return;
  }

  tlacitko.disabled = true;
  zprava.className = 'zprava skryto';
  try {
    const params = new URLSearchParams({ smer: 'vydane', firma });
    await stahniSouborZApi('/export-money-s3?' + params.toString());
    zprava.textContent = 'Export stažen.';
    zprava.className = 'zprava uspech';
  } catch (err) {
    zprava.textContent = 'Nepodařilo se stáhnout export: ' + err.message;
    zprava.className = 'zprava chyba';
  }
  tlacitko.disabled = false;
});

// Export do Excelu (od v4.28, Jan: "můžeme přidat ještě export do Excel?")
// - paralelní, obecnější export vedle Money S3 XML výš - appka ho nabízí
// na čtyřech místech (Přijaté faktury, Vydané faktury, Bankovní výpisy,
// Daňový přehled), vždy přes stejný endpoint /export-excel (viz netlify/
// functions/export-excel.js) a stejný stahniSouborZApi() jako Money S3.
document.getElementById('tlacitko-export-excel').addEventListener('click', async (e) => {
  const tlacitko = e.target;
  const zprava = document.getElementById('export-excel-zprava');
  const firma = document.getElementById('export-firma').value;
  if (!firma) {
    zprava.textContent = 'Nejdřív vyberte konkrétní firmu (ne „Všechny firmy“).';
    zprava.className = 'zprava chyba';
    return;
  }
  const mesic = document.getElementById('export-mesic').value;
  const rok = document.getElementById('export-rok').value;
  const stredisko = document.getElementById('export-stredisko').value;

  tlacitko.disabled = true;
  zprava.className = 'zprava skryto';
  try {
    const params = new URLSearchParams({ typ: 'doklady', firma });
    if (mesic) params.set('mesic', mesic);
    if (rok) params.set('rok', rok);
    if (stredisko) params.set('stredisko', stredisko);
    await stahniSouborZApi('/export-excel?' + params.toString());
    zprava.textContent = 'Export stažen.';
    zprava.className = 'zprava uspech';
  } catch (err) {
    zprava.textContent = 'Nepodařilo se stáhnout export: ' + err.message;
    zprava.className = 'zprava chyba';
  }
  tlacitko.disabled = false;
});

document.getElementById('tlacitko-export-excel-vf').addEventListener('click', async (e) => {
  const tlacitko = e.target;
  const zprava = document.getElementById('vf-export-excel-zprava');
  const firma = document.getElementById('vf-filtr-firma').value;
  if (!firma) {
    zprava.textContent = 'Nejdřív vyberte konkrétní firmu výš (ne „Všechny firmy“).';
    zprava.className = 'zprava chyba';
    return;
  }

  tlacitko.disabled = true;
  zprava.className = 'zprava skryto';
  try {
    const params = new URLSearchParams({ typ: 'vydane', firma });
    await stahniSouborZApi('/export-excel?' + params.toString());
    zprava.textContent = 'Export stažen.';
    zprava.className = 'zprava uspech';
  } catch (err) {
    zprava.textContent = 'Nepodařilo se stáhnout export: ' + err.message;
    zprava.className = 'zprava chyba';
  }
  tlacitko.disabled = false;
});

document.getElementById('tlacitko-export-excel-banka').addEventListener('click', async (e) => {
  const tlacitko = e.target;
  const zprava = document.getElementById('banka-export-excel-zprava');
  const firma = document.getElementById('banka-vyber-firmy').value;
  if (!firma) {
    zprava.textContent = 'Nejdřív vyberte konkrétní firmu výš.';
    zprava.className = 'zprava chyba';
    return;
  }

  tlacitko.disabled = true;
  zprava.className = 'zprava skryto';
  try {
    const params = new URLSearchParams({ typ: 'banka', firma });
    await stahniSouborZApi('/export-excel?' + params.toString());
    zprava.textContent = 'Export stažen.';
    zprava.className = 'zprava uspech';
  } catch (err) {
    zprava.textContent = 'Nepodařilo se stáhnout export: ' + err.message;
    zprava.className = 'zprava chyba';
  }
  tlacitko.disabled = false;
});

document.getElementById('tlacitko-export-excel-prehled').addEventListener('click', async (e) => {
  const tlacitko = e.target;
  const zprava = document.getElementById('prehled-export-excel-zprava');
  const rok = document.getElementById('prehled-vyber-rok').value;

  tlacitko.disabled = true;
  zprava.className = 'zprava skryto';
  try {
    const params = new URLSearchParams({ typ: 'danovy' });
    if (rok) params.set('rok', rok);
    await stahniSouborZApi('/export-excel?' + params.toString());
    zprava.textContent = 'Export stažen.';
    zprava.className = 'zprava uspech';
  } catch (err) {
    zprava.textContent = 'Nepodařilo se stáhnout export: ' + err.message;
    zprava.className = 'zprava chyba';
  }
  tlacitko.disabled = false;
});

// v4.15 - viz poznámka u prepniZalozku() výše, stejný důvod pro
// `[data-zalozka]` místo `nav.zalozky button`.
document.querySelectorAll('[data-zalozka]').forEach((btn) => {
  btn.addEventListener('click', () => prepniZalozku(btn.dataset.zalozka));
});

document.getElementById('verze-cislo').textContent = APP_VERZE;

if (jePrihlasen()) {
  zobrazApp();
} else {
  zobrazLogin();
  nactiJmenaProPrihlaseni();
}
