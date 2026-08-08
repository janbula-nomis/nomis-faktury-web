/**
 * public/app.js
 * Jednoduchá vanilla JS aplikace bez build kroku. Stav (token, jméno,
 * firmy, role) se drží v paměti a v localStorage (přežije obnovení
 * stránky) - běžný přístup pro reálně nasazenou webovou appku.
 */

// Zvyšte při každé odeslané aktualizaci appky, ať Jan v appce pozná, jestli
// se mu opravdu nasadila nová verze (zobrazuje se v patičce appky).
const APP_VERZE = 'v4.57 – 2026-08-07';

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
  // (v4.48) Počítadla na tlačítkách menu (viz vykresliPocitadla() níž) musí
  // po každé změně dat ukázat nové číslo. Appka to schválně řeší tady, na
  // jednom místě, a ne tak, že by si přepočet dopisovala do každé funkce,
  // která něco ukládá (schválení dokladu, spárování platby, označení faktury
  // za uhrazenou, smazání, nahrání dokladu, hromadný import výpisu…) - takový
  // seznam se vždycky rozejde s realitou, jakmile někdo přidá jedenáctou
  // akci a na přepočet zapomene. Odsud to platí i pro akce, které teprve
  // vzniknou. Pozor, ať se historie neopakuje.
  ohlasZmenuProPocitadla(cesta, (opts.method || 'GET').toUpperCase());
  return data;
}

// Endpointy, jejichž zápis může některým ze tří počítadel změnit číslo.
// Seznam je tu jen jako filtr proti zbytečnému dotazu navíc (přepočet čte
// šest listů ze Sheetů, takže ho appka nechce spouštět třeba po uložení
// nastavení skinu) - když se sem někdy zapomene doplnit nový endpoint,
// počítadlo se prostě přepíše až při dalším otevření Dashboardu nebo při
// dalším přihlášení, tedy nic se nerozbije.
const POCITADLA_ENDPOINTY = [
  '/doklady',                        // schválení, změna, smazání přijaté faktury
  '/upload-dokoncit',                // dokončené nahrání dokladu = nový doklad ke schválení
  '/banka',                          // import výpisu i spárování pohybu
  '/vydaneFaktury',                  // vystavení/uhrazení/smazání vydané faktury
  '/vydane-faktury-upload-dokoncit', // nahraná vydaná faktura
];
let pocitadlaCasovac = null;

function ohlasZmenuProPocitadla(cesta, metoda) {
  if (metoda === 'GET') return;
  if (!POCITADLA_ENDPOINTY.some((p) => cesta === p || cesta.indexOf(p + '?') === 0 || cesta.indexOf(p + '/') === 0)) return;
  // Jedna Janova akce občas znamená několik zápisů za sebou (typicky import
  // výpisu nebo hromadné spárování) - appka proto přepočet odloží a případné
  // další volání během té chvilky ho jen posune, takže se dotaz pošle jednou,
  // až se to uklidní.
  clearTimeout(pocitadlaCasovac);
  pocitadlaCasovac = setTimeout(() => obnovPocitadla(), 1200);
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
  nemovitostiJednotkySeznam = [];
  nemovitostiSmlouvySeznam = [];
  nemovitostiFirmySeznam = [];
}

/* ---------- ZÁSTUPCE „VYFOTIT DOKLAD“ NA PLOŠE TELEFONU (v4.55) ----------
 *
 * Janův dotaz 2026-08-06: *"zjednodušit nahrání dokladu - např z hlavní
 * obrazovky, bez přihlášení? jde to?"*, volba: *"Ikona na ploše → rovnou
 * focení"*.
 *
 * Jak to funguje: appka se otevře adresou `?akce=doklad` a rovnou naskočí
 * na záložku Nahrát doklad s nachystaným tlačítkem „Vyfotit“. Na Androidu
 * to obstará podržení ikony appky (`shortcuts` v manifest.webmanifest),
 * na iPhonu se ta adresa přidá na plochu jako druhá ikona - postup je
 * popsaný v README-DEPLOY.md.
 *
 * Co appka NEDĚLÁ a proč: sama neotevře fotoaparát. Telefon otevření
 * fotoaparátu povolí jen jako reakci na klepnutí člověka, ne při načtení
 * stránky - kdyby to appka zkusila, prohlížeč to potichu zahodí a vypadalo
 * by to jako porouchaná appka. Ušetří se tedy všechno ostatní (hledání
 * ikony, přepínání záložek) a zbude přesně jedno klepnutí.
 *
 * Přihlášení tím nijak neobchází: když přihlášení mezitím vypršelo, appka
 * ukáže normální PIN a na Nahrát doklad naskočí hned po něm (zobrazApp()
 * volá otevriZeZastupce() na konci, ať už se sem člověk dostal přes PIN
 * nebo s ještě platným přihlášením).
 */
function zastupceZadaOFoceni() {
  try {
    return new URLSearchParams(window.location.search).get('akce') === 'doklad';
  } catch (e) {
    // Starý prohlížeč bez URLSearchParams - zástupce prostě nebude fungovat,
    // ale appka se kvůli tomu nesmí rozbít.
    return false;
  }
}

let zastupceCeka = zastupceZadaOFoceni();

function otevriZeZastupce() {
  if (!zastupceCeka) return;
  // Jen jednou za spuštění. Bez tohohle by se člověk nedostal na jinou
  // záložku - stačilo by, aby appka z jakéhokoli důvodu zavolala zobrazApp()
  // podruhé, a přehodila by ho zpátky na focení.
  zastupceCeka = false;

  // Z adresy se `?akce=doklad` zahodí. Kdyby tam zůstalo, obnovení stránky
  // (nebo návrat do appky v seznamu otevřených oken) by focení spustilo
  // znovu, i když už člověk dělá něco jiného.
  try {
    window.history.replaceState({}, '', window.location.pathname);
  } catch (e) {
    // Když prohlížeč replaceState nedovolí (např. file://), nevadí - pojistka
    // `zastupceCeka` výš stejně druhé spuštění v rámci téhle stránky ohlídá.
  }

  prepniZalozku('nahrat');
  const tlacitko = document.getElementById('tlacitko-vyfotit');
  if (!tlacitko) return;
  // Zvýraznění je jediná věc, která tu člověku říká „klepni sem“. Sundá se
  // samo po prvním klepnutí, ať kolem tlačítka nesvítí kroužek celou dobu,
  // co se doklad nahrává.
  tlacitko.classList.add('vyfotit-ceka');
  tlacitko.addEventListener('click', () => tlacitko.classList.remove('vyfotit-ceka'), { once: true });
  try {
    tlacitko.focus({ preventScroll: true });
  } catch (e) {
    tlacitko.focus();
  }
}

// ---------- PŘEPÍNÁNÍ POHLEDŮ ----------

function zobrazLogin() {
  document.getElementById('view-login').classList.remove('skryto');
  document.getElementById('view-app').classList.add('skryto');
}

// (v4.41) Iniciály do kolečka vedle jména v hlavičce. Appka bere první písmena
// prvních dvou slov jména ("správa ES" -> "SE"); u jednoslovného jména vezme
// jeho první dvě písmena ("Jan" -> "JA"). Číslice a interpunkci appka
// přeskakuje, ať v kolečku nekončí "5." nebo "S.".
function inicialy(jmeno) {
  const slova = String(jmeno || '')
    .split(/[\s._-]+/)
    .map((s) => s.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);
  if (!slova.length) return '';
  if (slova.length === 1) return slova[0].slice(0, 2).toUpperCase();
  return (slova[0][0] + slova[1][0]).toUpperCase();
}

function zobrazApp() {
  document.getElementById('view-login').classList.add('skryto');
  document.getElementById('view-app').classList.remove('skryto');
  const oznaceniRole = stav.role === 'admin' ? ' (admin)' : stav.role === 'ucetni' ? ' (účetní)' : '';
  const popisUzivatele = stav.jmeno + oznaceniRole;
  const prvekJmeno = document.getElementById('jmeno-uzivatele');
  prvekJmeno.textContent = popisUzivatele;
  // (v4.41) Jméno appka v hlavičce drží na jednom řádku a dlouhé zkracuje na
  // "…" (viz #jmeno-uzivatele ve style.css), takže celé ho dává do `title` -
  // po najetí myší je pořád vidět.
  prvekJmeno.title = popisUzivatele;
  const prvekAvatar = document.getElementById('avatar-uzivatele');
  if (prvekAvatar) prvekAvatar.textContent = inicialy(stav.jmeno);

  const jeAdmin = stav.role === 'admin';
  const jeUcetniNeboAdmin = stav.role === 'admin' || stav.role === 'ucetni';

  // Jan (2026-07-25, v4.30): appka dřív nepovolené záložky pro danou roli
  // SCHOVÁVALA (třída .skryto) - to ale znamenalo, že počet viditelných
  // tlačítek v nav.zalozky se lišil podle role, takže se poslední (neúplný)
  // řádek mřížky nedal spolehlivě zarovnat pod řádek první (viz v4.29
  // rozbor). Jan navrhl: appka teď VŽDY vykresluje všech 10 tlačítek pro
  // každou roli - tlačítka mimo oprávnění dané role appka jen ZAMKNE
  // (atribut disabled + ikona zámku + tooltip), místo aby je schovávala.
  // Zamčené tlačítko appka dělá zcela neklikatelné (nativní chování
  // <button disabled> - žádný click event se nespustí, netřeba žádná
  // dodatečná pojistka v listeneru níže u `[data-zalozka]`). Díky pevnému
  // počtu tlačítek (10 = 5×2 na desktopu, 2×5 na mobilu) appka může použít
  // opravdovou CSS grid s pevným počtem sloupců (viz nav.zalozky ve
  // style.css) - sloupce tak zůstanou zarovnané napříč řádky za všech
  // okolností, nezávisle na roli přihlášeného uživatele.
  function nastavZamekZalozky(id, zamceno) {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = zamceno;
    el.classList.toggle('zamcena-zalozka', zamceno);
    el.title = zamceno ? 'Nemáte oprávnění k této sekci.' : '';
  }

  nastavZamekZalozky('nav-nastaveni', !jeAdmin);
  nastavZamekZalozky('nav-smlouvy', !jeUcetniNeboAdmin);
  nastavZamekZalozky('nav-export', !jeUcetniNeboAdmin);
  // Jan (2026-07-21, v4.12): Bankovní výpisy appka zobrazuje VŠEM
  // přihlášeným bez zámku (jen náhled, scopováno na přiřazené firmy stejně
  // jako jinde) - viz poznámka o v4.12 níže pro plný kontext.
  nastavZamekZalozky('nav-banka', false);

  // Jan (2026-07-19, v4.10 → v4.30 zámek místo schování): běžný uživatel
  // (role "" - ne admin, ne účetní) má v hlavní navigaci mít přístup JEN k
  // Nahrát doklady/Přijaté faktury/Vydané faktury/Bankovní výpisy -
  // Dashboard a Knihu jízd appka zamyká (dřív schovávala). Admin i účetní
  // mají obojí odemčené beze změny.
  nastavZamekZalozky('nav-dashboard', !jeUcetniNeboAdmin);
  nastavZamekZalozky('nav-kniha-jizd', !jeUcetniNeboAdmin);

  // Jan (2026-07-21, v4.12 → v4.30 zámek místo schování): Daňový přehled
  // appka běžné roli zamyká (byl součástí čtyř záložek z v4.10, Jan ho pro
  // běžnou roli nechce zpřístupněný). Admin a účetní mají odemčeno beze
  // změny.
  nastavZamekZalozky('nav-prehled', !jeUcetniNeboAdmin);

  // Jan (2026-07-25, v4.29 → v4.30 zámek místo schování): "uživatel vidí
  // přijaté, vydané a bank výpisy, víc nic" - appka zamyká i Nemovitosti
  // běžné roli.
  nastavZamekZalozky('nav-nemovitosti', !jeUcetniNeboAdmin);

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

  // Srovnání číslování za rok (v4.49) - hromadný úklid evidenčních čísel.
  // Stejný důvod schování jako u Excel exportu o řádek výš: záložka Přijaté
  // doklady je otevřená všem rolím, ale přepsat čísla celé firmy za celý rok
  // smí jen admin/účetní (backend to stejně odmítne, viz precislovani.js -
  // tohle je jen o tom, aby appka nenabízela tlačítko končící chybou 403).
  const dokladyCislovani = document.getElementById('doklady-cislovani');
  if (dokladyCislovani) dokladyCislovani.classList.toggle('skryto', !jeUcetniNeboAdmin);
  // Obsluhu appka navěsí až tady, ne při načtení skriptu - do zobrazApp()
  // se dá dostat i podruhé (znovupřihlášení bez reloadu, viz volání na
  // konci souboru), a bez téhle pojistky by se posluchače přidaly dvakrát
  // a tlačítko "Srovnat číslování…" by panel otevřelo a hned zase zavřelo.
  if (jeUcetniNeboAdmin && !cislovaniInicializovano) {
    inicializujCislovani();
    cislovaniInicializovano = true;
  }

  // Jan (2026-07-19, v4.11 → zrušeno v4.29): appka dřív běžné roli schovávala
  // přepínač Ke schválení/Schválené (backend jí schválené doklady stejně
  // vůbec nevracel). Jan teď chce, aby běžný uživatel viděl "proces až po
  // zápis do bankovních výpisů" - tedy celý životní cyklus - appka proto
  // přepínač ukazuje VŠEM rolím stejně (viz odpovídající zrušení v
  // netlify/functions/doklady.js, smiVidetDoklad).

  // Jan (2026-07-28, v4.36): výchozí obrazovka po přihlášení má být
  // Dashboard (dřív appka vždycky naskočila na "Nahrát doklady", který
  // appka od v4.36 schovávala za samotnou ikonu; od v4.45 je z něj zase
  // tlačítko s ikonou i textem, jen přes celý řádek - viz index.html).
  // Na výchozí záložku to ale žádný vliv nemá. Dashboard
  // je ale zamčený pro běžnou roli (nastavZamekZalozky('nav-dashboard', ...)
  // výš) - běžnému uživateli by appka defaultně ukázala zamčenou/prázdnou
  // záložku, proto mu appka místo toho naskočí na Přijaté faktury (jediná
  // hlavní pracovní záložka bez zámku pro tuhle roli).
  prepniZalozku(jeUcetniNeboAdmin ? 'dashboard' : 'doklady');
  // (v4.48) Počítadla na tlačítkách menu appka natáhne hned po přihlášení,
  // ale JEN běžné roli - adminovi/účetní o řádek výš naskočí Dashboard, a ten
  // si čísla vezme rovnou ze své vlastní odpovědi (viz nactiDashboard), takže
  // dotaz odsud by byl jen druhé volání téhož endpointu během jedné vteřiny.
  if (!jeUcetniNeboAdmin) obnovPocitadla();
  spustIdleSledovani();
  // (v4.55) Zástupce „Vyfotit doklad“ z plochy telefonu. Musí být AŽ TADY,
  // za výchozí záložkou o pár řádků výš - jinak by ji Dashboard/Přijaté
  // faktury zase přepnuly zpátky.
  otevriZeZastupce();
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
  if (nazev === 'nemovitosti') nactiNemovitosti();
  if (nazev === 'banka') inicializujZalozkuBanka();
  if (nazev === 'smlouvy') nactiSmlouvy();
  if (nazev === 'export') inicializujZalozkuExport();
  if (nazev === 'nastaveni') {
    nactiUzivatele();
    nactiFirmy();
    nactiAuta();
    nactiUcty();
    nactiStrediska();
    // Pořadí je schválně tohle: účtová osnova se načte před předkontacemi,
    // protože nabídka "Účet MD" u předkontace se plní právě z ní (od v4.52).
    nactiUctovouOsnovu().then(() => nactiPredkontace());
    nactiPlatebniKarty();
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

// (v4.49) Vykreslení výřezu na plátno, vytažené ze zmensiObrazek() ven, aby
// ho mohl použít i ZPĚTNÝ ořez už nahraného skenu (viz orezniSkenZnovu()
// níž, Jan: "a je možné nyný dodělat ořezání...?"). Je to schválně jedna
// jediná funkce: kdyby si zpětný ořez kreslil po svém, dopadl by starý
// doklad jinak než nově vyfocený, i když by oba prošly stejnou detekcí.
// `vyrez` může být null - pak appka jen zmenší celou fotku, jako to dělala
// do v4.47.
function vykresliOrezDoJpegu(img, vyrez, maxRozmer, kvalita) {
  const zdrojS = vyrez ? vyrez.sirka : img.width;
  const zdrojV = vyrez ? vyrez.vyska : img.height;
  let width = zdrojS;
  let height = zdrojV;
  if (width > maxRozmer || height > maxRozmer) {
    const pomer = Math.min(maxRozmer / width, maxRozmer / height);
    width = Math.round(width * pomer);
    height = Math.round(height * pomer);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (vyrez) {
    // Appka kreslí OTOČENĚ: posune počátek do středu výřezu, otočí
    // plátno o zjištěný úhel a nakreslí celou fotku tak, aby střed
    // výřezu padl doprostřed plátna. Tím se zároveň ořízne i srovná
    // natočení, v jednom kroku a bez mezikroků navíc.
    const meritko = width / zdrojS;
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-vyrez.uhel);
    ctx.scale(meritko, meritko);
    ctx.drawImage(img, -vyrez.stredX, -vyrez.stredY);
  } else {
    ctx.drawImage(img, 0, 0, width, height);
  }
  return canvas.toDataURL('image/jpeg', kvalita).split(',')[1];
}

function zmensiObrazek(soubor, maxRozmer, kvalita) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(soubor);
    img.onload = () => {
      // (v4.48) Než appka obrázek zmenší, zkusí z fotky vyříznout samotný
      // doklad - viz najdiDokladNaFotce() níž. Když si detekce není jistá,
      // vrátí null a appka zpracuje fotku celou jako dřív.
      const vyrez = najdiDokladNaFotce(img);
      const data = vykresliOrezDoJpegu(img, vyrez, maxRozmer, kvalita);
      URL.revokeObjectURL(url);
      resolve({ data, mimeType: 'image/jpeg', nazev: soubor.name.replace(/\.[^.]+$/, '') + '.jpg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Nepodařilo se načíst obrázek.'));
    };
    img.src = url;
  });
}

// ---------- AUTOMATICKÝ OŘEZ DOKLADU Z FOTKY (v4.48) ----------
//
// Jan (2026-08-02): "dokážeme udelat ořezání scanu z fotografie?" Ze tří
// nabídnutých cest si vybral "Jen automatický, bez ptaní" - appka tedy
// NIKDE neukazuje náhled s rohy k doladění, ořízne sama a rovnou nahraje.
// Důvody uvedl tři najednou: ať AI líp vytěží údaje, ať uložený sken vypadá
// jako sken (ne jako fotka na stole) a ať jsou soubory menší.
//
// Protože Jan ořez nekontroluje, je celá tahle část postavená obráceně, než
// je u detekce obvyklé: NEsnaží se uspět za každou cenu. Každý krok má
// pojistku a jakmile jedna neprojde, funkce vrátí null a appka nahraje fotku
// celou, jako to dělala do v4.47. Křivě oříznutý doklad by si totiž Jan
// všiml až v Drive, kdy je originál dávno pryč - kdežto neoříznutá fotka je
// přesně to, co měl předtím, tedy žádná ztráta.
//
// Nezkoušet znovu: OpenCV.js (obvyklá volba na tenhle úkol) má přes 8 MB.
// Appka nemá build krok, servíruje se jako PWA a Jan ji používá na mobilních
// datech - stahovat 8 MB knihovnu kvůli ořezu jedné účtenky nedává smysl.
// Všechno níž je proto obyčejný JavaScript nad <canvas>, bez závislostí.
//
// Postup: fotka se zmenší na ~480 px (detekce nepotřebuje detail a na plném
// rozlišení by na mobilu trvala vteřiny), převede na šedou a zkusí se
// DVĚ nezávislé metody, v tomhle pořadí:
//   1. SVĚTLÁ PLOCHA (Otsu práh + největší souvislá oblast). Funguje, když
//      je papír světlejší než podklad - stůl, koberec, palubní deska. Umí
//      i srovnat natočení, protože kolem oblasti hledá nejmenší opsaný
//      obdélník.
//   2. HUSTOTA HRAN (Sobel). Nastoupí, když první metoda neprojde - typicky
//      bílá účtenka na bílém stole, kde práh nemá co oddělit. Hledá jen
//      obdélník, ve kterém leží drtivá většina "kresby", takže nesrovnává
//      natočení, zato nezávisí na barvě podkladu.
// Když neprojde ani jedna, vrací null.
const OREZ_ANALYZA_PX = 480;      // delší strana pracovní kopie
const OREZ_MIN_PODIL = 0.10;      // doklad musí zabírat aspoň 10 % fotky
const OREZ_MAX_PODIL = 0.92;      // a nejvýš 92 % (jinak není co ořezávat)
// Výplň 0.86 není opatrnost navíc, ale konkrétní pojistka: kruhový odlesk
// stolu vyplní svůj opsaný obdélník přesně z pi/4, tedy 78,5 %, a při nižším
// prahu by appka ořízla fotku na odlesk (ověřeno případem "jen_odlesk" v
// testech). Papír focený mobilem vyplní opsaný obdélník přes 95 %, i když je
// mírně v perspektivě, takže tenhle práh nic reálného neodmítne.
const OREZ_MIN_VYPLN = 0.86;      // oblast musí vyplnit aspoň 86 % svého obdélníku
const OREZ_MAX_UHEL = 15;         // větší natočení = nejspíš špatná detekce
const OREZ_MRTVY_UHEL = 1.2;      // pod tímhle úhlem se neotáčí vůbec
const OREZ_MIN_ZISK = 0.04;       // ořez musí ubrat aspoň 4 % plochy, jinak nemá smysl
const OREZ_LEM = 0.015;           // lem kolem dokladu, ať se neuřízne okraj papíru

function najdiDokladNaFotce(img) {
  try {
    const plne = { s: img.width, v: img.height };
    if (!plne.s || !plne.v || plne.s * plne.v < 200 * 200) return null;

    const pomer = Math.min(1, OREZ_ANALYZA_PX / Math.max(plne.s, plne.v));
    const s = Math.max(1, Math.round(plne.s * pomer));
    const v = Math.max(1, Math.round(plne.v * pomer));

    const plat = document.createElement('canvas');
    plat.width = s;
    plat.height = v;
    plat.getContext('2d').drawImage(img, 0, 0, s, v);
    const px = plat.getContext('2d').getImageData(0, 0, s, v).data;

    const sed = new Uint8ClampedArray(s * v);
    for (let i = 0, j = 0; j < sed.length; i += 4, j += 1) {
      sed[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    }

    const obdelnik = orezPodleSvetlePlochy(sed, s, v) || orezPodleHran(sed, s, v);
    if (!obdelnik) return null;

    // Přepočet z pracovní kopie zpět na plné rozlišení + lem.
    const meritko = 1 / pomer;
    const lem = 1 + OREZ_LEM * 2;
    const sirka = Math.round(obdelnik.sirka * meritko * lem);
    const vyska = Math.round(obdelnik.vyska * meritko * lem);
    if (sirka < 80 || vyska < 80) return null;

    // Poslední pojistka: ořez musí opravdu něco ubrat.
    if ((sirka * vyska) / (plne.s * plne.v) > 1 - OREZ_MIN_ZISK) return null;

    return {
      sirka,
      vyska,
      stredX: obdelnik.stredX * meritko,
      stredY: obdelnik.stredY * meritko,
      uhel: obdelnik.uhel,
    };
  } catch (e) {
    // Detekce nesmí nikdy shodit nahrávání - když cokoli selže (starý
    // prohlížeč, tainted canvas, málo paměti), appka prostě neořízne.
    return null;
  }
}

// --- Metoda 1: největší souvislá světlá plocha -------------------------

function orezPodleSvetlePlochy(sed, s, v) {
  const prah = otsuPrah(sed);
  const maska = new Uint8Array(s * v);
  for (let i = 0; i < sed.length; i += 1) maska[i] = sed[i] > prah ? 1 : 0;

  const oblast = najvetsiOblast(maska, s, v);
  if (!oblast) return null;

  const podil = oblast.body.length / (s * v);
  if (podil < OREZ_MIN_PODIL || podil > OREZ_MAX_PODIL) return null;

  // Doklad focený mobilem je vždycky zhruba uprostřed záběru. Když největší
  // světlá plocha střed fotky neobsahuje, je to skoro jistě odlesk stolu
  // nebo okno v pozadí, ne doklad.
  const stred = Math.floor(v / 2) * s + Math.floor(s / 2);
  if (!oblast.maska[stred]) return null;

  const obal = konvexniObal(oblast.obrys);
  if (obal.length < 3) return null;

  const obdelnik = nejmensiObdelnik(obal);
  if (!obdelnik) return null;

  // Oblast musí být opravdu zhruba obdélníková. Kdyby detekce chytila
  // třeba ruku držící účtenku, výplň spadne a appka radši neořízne.
  if (oblast.body.length / (obdelnik.sirka * obdelnik.vyska) < OREZ_MIN_VYPLN) return null;

  const uhelStupne = Math.abs((obdelnik.uhel * 180) / Math.PI);
  if (uhelStupne > OREZ_MAX_UHEL) return null;
  if (uhelStupne < OREZ_MRTVY_UHEL) obdelnik.uhel = 0;

  if (obdelnik.sirka < s * 0.15 || obdelnik.vyska < v * 0.15) return null;
  return obdelnik;
}

function otsuPrah(sed) {
  const hist = new Float64Array(256);
  for (let i = 0; i < sed.length; i += 1) hist[sed[i]] += 1;
  const celkem = sed.length;
  let soucet = 0;
  for (let t = 0; t < 256; t += 1) soucet += t * hist[t];

  let soucetB = 0;
  let vahaB = 0;
  let nejlepsi = 0;
  let prah = 128;
  for (let t = 0; t < 256; t += 1) {
    vahaB += hist[t];
    if (vahaB === 0) continue;
    const vahaF = celkem - vahaB;
    if (vahaF === 0) break;
    soucetB += t * hist[t];
    const prumerB = soucetB / vahaB;
    const prumerF = (soucet - soucetB) / vahaF;
    const rozptyl = vahaB * vahaF * (prumerB - prumerF) * (prumerB - prumerF);
    if (rozptyl > nejlepsi) {
      nejlepsi = rozptyl;
      prah = t;
    }
  }
  return prah;
}

// Souvislé oblasti appka hledá iterativně přes vlastní zásobník, ne
// rekurzí - u fotky 480x640 je oblast klidně 200 000 pixelů a rekurze by
// v prohlížeči přetekla zásobník.
function najvetsiOblast(maska, s, v) {
  const znacky = new Int32Array(s * v).fill(-1);
  const zasobnik = new Int32Array(s * v);
  let nejlepsi = null;

  for (let start = 0; start < maska.length; start += 1) {
    if (!maska[start] || znacky[start] !== -1) continue;
    let vrch = 0;
    zasobnik[vrch++] = start;
    znacky[start] = start;
    const body = [];
    while (vrch > 0) {
      const i = zasobnik[--vrch];
      body.push(i);
      const x = i % s;
      const y = (i / s) | 0;
      if (x > 0 && maska[i - 1] && znacky[i - 1] === -1) { znacky[i - 1] = start; zasobnik[vrch++] = i - 1; }
      if (x < s - 1 && maska[i + 1] && znacky[i + 1] === -1) { znacky[i + 1] = start; zasobnik[vrch++] = i + 1; }
      if (y > 0 && maska[i - s] && znacky[i - s] === -1) { znacky[i - s] = start; zasobnik[vrch++] = i - s; }
      if (y < v - 1 && maska[i + s] && znacky[i + s] === -1) { znacky[i + s] = start; zasobnik[vrch++] = i + s; }
    }
    if (!nejlepsi || body.length > nejlepsi.body.length) nejlepsi = { znacka: start, body };
  }
  if (!nejlepsi) return null;

  // Z nalezené oblasti si appka nechá jen krajní body každého řádku - na
  // konvexní obal víc nepotřebuje a je jich řádově míň.
  const vlastni = new Uint8Array(s * v);
  const minX = new Int32Array(v).fill(-1);
  const maxX = new Int32Array(v).fill(-1);
  nejlepsi.body.forEach((i) => {
    vlastni[i] = 1;
    const x = i % s;
    const y = (i / s) | 0;
    if (minX[y] === -1 || x < minX[y]) minX[y] = x;
    if (maxX[y] === -1 || x > maxX[y]) maxX[y] = x;
  });
  const obrys = [];
  for (let y = 0; y < v; y += 1) {
    if (minX[y] === -1) continue;
    obrys.push([minX[y], y]);
    if (maxX[y] !== minX[y]) obrys.push([maxX[y], y]);
  }
  return { body: nejlepsi.body, maska: vlastni, obrys };
}

// Andrewův monotónní řetězec.
function konvexniObal(body) {
  if (body.length < 3) return body.slice();
  const b = body.slice().sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  const kriz = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const dolni = [];
  b.forEach((p) => {
    while (dolni.length >= 2 && kriz(dolni[dolni.length - 2], dolni[dolni.length - 1], p) <= 0) dolni.pop();
    dolni.push(p);
  });
  const horni = [];
  for (let i = b.length - 1; i >= 0; i -= 1) {
    const p = b[i];
    while (horni.length >= 2 && kriz(horni[horni.length - 2], horni[horni.length - 1], p) <= 0) horni.pop();
    horni.push(p);
  }
  dolni.pop();
  horni.pop();
  return dolni.concat(horni);
}

// Rotující posuvné měřítko: nejmenší opsaný obdélník má vždycky jednu stranu
// položenou na některé hraně konvexního obalu, takže stačí projít hrany.
function nejmensiObdelnik(obal) {
  let nej = null;
  for (let i = 0; i < obal.length; i += 1) {
    const a = obal[i];
    const c = obal[(i + 1) % obal.length];
    const uhel = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const cos = Math.cos(-uhel);
    const sin = Math.sin(-uhel);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    obal.forEach((p) => {
      const x = p[0] * cos - p[1] * sin;
      const y = p[0] * sin + p[1] * cos;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    const sirka = maxX - minX;
    const vyska = maxY - minY;
    const plocha = sirka * vyska;
    if (plocha <= 0) continue;
    if (!nej || plocha < nej.plocha) {
      const sx = (minX + maxX) / 2;
      const sy = (minY + maxY) / 2;
      nej = {
        plocha,
        sirka,
        vyska,
        uhel,
        // střed zpátky do souřadnic fotky (opačná rotace)
        stredX: sx * cos + sy * sin,
        stredY: -sx * sin + sy * cos,
      };
    }
  }
  if (!nej) return null;

  // Doklad focený nastojato je vysoký, ne ležatý. Když nejmenší obdélník
  // vyjde otočený o skoro 90 stupňů, je to tentýž obdélník popsaný jinak -
  // appka úhel srovná do intervalu (-45, 45>, ať pojistka na maximální
  // natočení měří to, co má.
  let u = nej.uhel;
  while (u <= -Math.PI / 4) u += Math.PI / 2;
  while (u > Math.PI / 4) u -= Math.PI / 2;
  if (Math.abs(u - nej.uhel) > 1e-9) {
    const prohozeno = Math.abs(Math.round((nej.uhel - u) / (Math.PI / 2))) % 2 === 1;
    if (prohozeno) {
      const p = nej.sirka;
      nej.sirka = nej.vyska;
      nej.vyska = p;
    }
    nej.uhel = u;
  }
  return nej;
}

// --- Metoda 2: hustota hran (záloha pro bílý doklad na bílém stole) -----

function orezPodleHran(sed, s, v) {
  const hrany = new Float64Array(s * v);
  let celkem = 0;
  for (let y = 1; y < v - 1; y += 1) {
    for (let x = 1; x < s - 1; x += 1) {
      const i = y * s + x;
      const gx = sed[i - s + 1] + 2 * sed[i + 1] + sed[i + s + 1]
               - sed[i - s - 1] - 2 * sed[i - 1] - sed[i + s - 1];
      const gy = sed[i + s - 1] + 2 * sed[i + s] + sed[i + s + 1]
               - sed[i - s - 1] - 2 * sed[i - s] - sed[i - s + 1];
      const g = Math.abs(gx) + Math.abs(gy);
      // Slabé přechody (stín, textura stolu, šum) appka zahazuje - jinak
      // by "kresba" byla rozprostřená po celé fotce a ořez by nic neubral.
      const val = g > 90 ? g : 0;
      hrany[i] = val;
      celkem += val;
    }
  }
  if (celkem <= 0) return null;

  const poSloupcich = new Float64Array(s);
  const poRadcich = new Float64Array(v);
  for (let y = 0; y < v; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const val = hrany[y * s + x];
      poSloupcich[x] += val;
      poRadcich[y] += val;
    }
  }

  // Z každé strany appka odkrajuje, dokud neukousne 0,6 % celkové "kresby".
  // Původně 1,5 %, ale u bílé účtenky na bílém stole (kde okraj papíru není
  // vidět a odkrajuje se fakticky k textu) to ubíralo i kus potištěné plochy.
  const orez = (proj, delka) => {
    const limit = celkem * 0.006;
    let od = 0;
    let sum = 0;
    while (od < delka - 1 && sum + proj[od] < limit) { sum += proj[od]; od += 1; }
    let doIndex = delka - 1;
    sum = 0;
    while (doIndex > od && sum + proj[doIndex] < limit) { sum += proj[doIndex]; doIndex -= 1; }
    return [od, doIndex];
  };
  const [x1, x2] = orez(poSloupcich, s);
  const [y1, y2] = orez(poRadcich, v);

  const sirka = x2 - x1 + 1;
  const vyska = y2 - y1 + 1;
  if (sirka < s * 0.25 || vyska < v * 0.25) return null;
  if ((sirka * vyska) / (s * v) > OREZ_MAX_PODIL) return null;

  return {
    sirka,
    vyska,
    stredX: x1 + sirka / 2,
    stredY: y1 + vyska / 2,
    uhel: 0,
  };
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

// v4.35 (Jan: "zarovnej data do sloupců... schváleno nahraď zkratkou") -
// appka přešla u sbalených řádků Dokladů/Vydaných faktur/Bankovních výpisů
// z flexboxu na pevnou CSS grid mřížku (viz .doklad-radek-hlava níže), ať
// se sloupce nerozjíždí podle délky textu. To ale vyžaduje krátké, pevně
// dlouhé štítky - appka proto ve SBALENÉM řádku ukazuje zkrácený text
// (plné znění appka nechává jako `title` atribut/tooltip při najetí
// myší), zatímco rozkliknutý detail dál zobrazuje/edituje plné znění Stavu
// beze změny.
function dokladStavZkratka(stavText) {
  if (stavText === 'Schváleno') return 'Schv.';
  if (stavText === 'Možná duplicita') return 'Dupl.?';
  if (stavText === 'Zpracovává se') return 'Zprac.';
  return 'Kontrola';
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
// (v4.35) Viditelný text appka zkrátila kvůli přechodu na pevnou grid
// mřížku - plné znění appka nechává v `title` atributu (tooltip).
function bankSparovaniBadge(d) {
  if (d.Stav !== 'Schváleno') return '';
  if (String(d.Hrazeno_mimo_ucet || '').trim() === 'ANO') {
    return '<span class="badge-bezdokladu" title="Doklad je označený jako hrazený mimo účet - appka u něj protějšek v bance nehledá (Mimo účet)">Mimo účet</span>';
  }
  if (d.Stav_parovani_bankou === 'Potvrzeno') {
    return '<span class="badge-potvrzeno" title="Appka našla a účetní potvrdila odpovídající bankovní pohyb (Spárováno s bankou)">Spárováno</span>';
  }
  if (d.Stav_parovani_bankou === 'Navrženo') {
    return '<span class="badge-navrzeno" title="Appka navrhla odpovídající bankovní pohyb, čeká na potvrzení v záložce Bankovní výpisy (Navrženo spárování)">Návrh</span>';
  }
  return '<span class="badge-chybi" title="K tomuhle dokladu appka zatím nenašla odpovídající bankovní pohyb v Bankovních výpisech (Nespárováno s bankou)">Nespár.</span>';
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
    // Účtová osnova a předkontace (od v4.52) se načítají se stejnou
    // tolerancí jako firmy/střediska - .catch() na prázdno. Než Jan po
    // nasazení pustí /api/setup, ty dva listy v Sheets ještě neexistují a
    // doklady se kvůli tomu nesmí přestat zobrazovat; jen se u nich zatím
    // nenabídne účet.
    const [dataDoklady, dataFirmy, dataStrediska, dataOsnova, dataPredkontace] = await Promise.all([
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
      zavolejApi('/uctova-osnova', { method: 'GET' }).catch(() => ({ ucty: [] })),
      zavolejApi('/predkontace', { method: 'GET' }).catch(() => ({ predkontace: [] })),
    ]);
    firmyProVyberDokladu = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    strediskaSeznam = dataStrediska.strediska || [];
    uctovaOsnovaSeznam = dataOsnova.ucty || [];
    predkontaceSeznam = dataPredkontace.predkontace || [];
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

// ---------- ÚČTOVÁ OSNOVA A ÚČET MD (od v4.52) ----------
// Jan (2026-08-03) poslal soubor Kontace.xlsx se svými účty po firmách:
// *"tohle jsou předkontace, je potřeba je zapracovat do systému"*. Na otázku,
// odkud má appka u dokladu brát účet, vybral *"Podle kategorie, jde přepsat"* -
// appka tedy účet PŘEDVYPLNÍ podle kombinace firma+kategorie (list
// Predkontace, sloupec Ucet_MD), ale v detailu dokladu jde přepsat na cokoli
// z účtové osnovy dané firmy.
//
// Na otázku, co má appka dělat s kombinací, pro kterou účet nastavený není,
// vybral *"Nechat prázdné a upozornit"* - proto navrhUctuMD() vrací prázdno a
// NEMÁ žádný náhradní účet. Kdyby sem někdo dopsal fallback typu "když nic
// nesedí, dej 518000", účetní by v exportu dostala tiše špatně zaúčtované
// doklady a nepoznala by to. Nedoplňovat.
//
// Obě pole appka plní při otevření záložky Doklady (viz nactiDoklady) -
// stejný vzor jako firmyProVyberDokladu/strediskaSeznam.
let uctovaOsnovaSeznam = [];
let predkontaceSeznam = [];

// Účty dané firmy jako <option>y. Účet, který doklad má, ale v osnově firmy
// není (jiná firma, ručně zapsaný, mezitím smazaný), appka ukáže taky - jinak
// by ho tiché překlopení selectu na první možnost při uložení přepsalo.
function moznostiUctuMD(firma, vybrany) {
  const naFirmu = uctovaOsnovaSeznam.filter(
    (u) => String(u.Firma || '').trim() === String(firma || '').trim(),
  );
  let html = '<option value="">— účet nenastaven —</option>';
  const cisla = [];
  naFirmu.forEach((u) => {
    const ucet = String(u.Ucet || '').trim();
    if (!ucet || cisla.includes(ucet)) return;
    cisla.push(ucet);
    const popis = String(u.Popis || '').trim();
    const oznaceno = ucet === String(vybrany || '').trim() ? ' selected' : '';
    html += '<option value="' + escapeAttr(ucet) + '"' + oznaceno + '>'
      + escapeHtml(ucet + (popis ? ' - ' + popis : '')) + '</option>';
  });
  const vybranyText = String(vybrany || '').trim();
  if (vybranyText && !cisla.includes(vybranyText)) {
    html += '<option value="' + escapeAttr(vybranyText) + '" selected>'
      + escapeHtml(vybranyText) + ' (není v osnově firmy)</option>';
  }
  return html;
}

// Stejná logika jako navrhniUcetMD() v lib/predkontaceHelpers.js. Duplikát tu
// je schválně: prohlížeč si `lib/` modul načíst neumí (appka nemá build krok),
// a předvyplnění účtu po změně kategorie musí být vidět HNED, ne až po uložení
// a znovunačtení. Při změně jedné kopie je nutné upravit i tu druhou.
function navrhUctuMD(firma, kategorie) {
  const f = String(firma || '').trim();
  const k = String(kategorie || '').trim();
  if (!f || !k) return '';
  const radek = predkontaceSeznam.find(
    (p) => String(p.Firma || '').trim() === f && String(p.Kategorie || '').trim() === k,
  );
  return radek ? String(radek.Ucet_MD || '').trim() : '';
}

// ---------- PLATEBNÍ KARTY (od v4.52) ----------
// Jan (2026-08-03): *"je důležité zavést při vytěžování registraci platebních
// karet a ty vést v databázi administrace, používat při návrhu přiřazení
// plateb"*. Appka o kartě drží VÝHRADNĚ POSLEDNÍ 4 ČÍSLICE - nikdy celé číslo
// (PAN). Tohle pravidlo platí i tady v prohlížeči: žádné pole v appce celé
// číslo karty nepřijímá a nikam ho neposílá. Neměkčit.
//
// Tyhle tři funkce jsou přesná kopie lib/platebniKartySchema.js
// (posledniCtyri / ctyrcisliZTextu / shodaKarty). Duplikát je nutný, protože
// prohlížeč si `lib/` modul načíst neumí (appka nemá build krok) a appka
// potřebuje v detailu bankovního pohybu ukázat, že čtyřčíslí karty sedí, aniž
// by se kvůli tomu ptala serveru. Při změně jedné kopie MUSÍ se upravit i ta
// druhá, jinak bude appka na obrazovce tvrdit něco jiného než při párování.
function posledniCtyriZTextu(vstup) {
  const cislice = String(vstup == null ? '' : vstup).replace(/\D/g, '');
  if (cislice.length < 4) return '';
  return cislice.slice(-4);
}

function ctyrcisliZTextu(text) {
  const t = String(text == null ? '' : text);
  const nalezene = new Set();
  const vzory = [
    /[*]{2,}\s*-?\s*(\d{4})(?!\d)/g, // **** 1234
    /[xX]{2,}\s*-?\s*(\d{4})(?!\d)/g, // xxxx1234
    /\.{3,}\s*(\d{4})(?!\d)/g, // ...1234
    /\d{4,6}\s*[*xX.]{2,}\s*(\d{4})(?!\d)/g, // 457112******1234
    /(?:karta|kartou|kartu|karty|card)\D{0,12}?(\d{4})(?!\d)/gi,
  ];
  vzory.forEach((re) => {
    let m = re.exec(t);
    while (m) {
      nalezene.add(m[1]);
      m = re.exec(t);
    }
  });
  return nalezene;
}

function shodaKarty(cisloKarty, textPohybu) {
  const ctyri = posledniCtyriZTextu(cisloKarty);
  if (!ctyri) return false;
  return ctyrcisliZTextu(textPohybu).has(ctyri);
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
        tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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
    // Evidencni_cislo (v4.34) - appka ho přiřazuje sama až při schválení
    // (viz netlify/functions/doklady.js), takže tu chvíli být nemusí -
    // appka ukazuje pomlčku, dokud číslo není přiřazené. (v4.35) Appka
    // sloupec vykresluje VŽDY (ne jen když je Evidencni_cislo vyplněné),
    // ať zůstane pevný počet sloupců pro zarovnání do mřížky - a appka ho
    // dala jako úplně první viditelný sloupec (Jan: "na začátek dej
    // přidělené číslo").
    '<span class="cislo-evid' + (d.Evidencni_cislo ? '' : ' cislo-evid-prazdne') + '">' +
      escapeHtml(d.Evidencni_cislo || '–') + '</span>' +
    '<span class="stav-chip ' + stavTrida(d.Stav) + '" title="' + escapeHtml(d.Stav || '') + '">' +
      escapeHtml(dokladStavZkratka(d.Stav)) + '</span>' +
    // (v4.46) Odznak spárování s bankou appka nově obaluje vlastní buňkou
    // `doklad-banka-bunka` (dřív šel do mřížky odznak samotný, a když
    // odznak nebyl, prázdný `<span>`). Buňka tu je VŽDY - jednak kvůli
    // pevnému počtu sloupců mřížky, jednak proto, že se na ni v mobilním
    // režimu odkazuje CSS (v úzkém breakpointu byla tahle buňka schovaná
    // přes `nth-child(4)`, teď se místo toho přesouvá na druhý řádek karty).
    '<span class="doklad-banka-bunka">' + bankSparovaniBadge(d) + '</span>' +
    '<span class="dodavatel">' +
      escapeHtml(d.Stav === 'Zpracovává se' ? '(čeká na zpracování)' : (d.Dodavatel || '(bez dodavatele)')) +
    '</span>' +
    // (v4.46) Datum má vlastní třídu `doklad-datum` - stejný důvod jako
    // u bankovního řádku výš (v mobilním režimu se přesouvá, ne schovává).
    '<span class="doklad-datum">' + escapeHtml(d.Datum_dokladu || '') + '</span>' +
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazDoklad(d.ID, d.Dodavatel, tlacitkoSmazat);
    akce.appendChild(tlacitkoSmazat);
    wrap.appendChild(akce);

    if (d.Zdrojovy_soubor_URL) {
      const souborDiv = document.createElement('div');
      souborDiv.style.marginTop = '12px';
      souborDiv.innerHTML = odkazOtevritSken(d.Zdrojovy_soubor_URL, d.Zdrojovy_soubor_ID, 'doklad');
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

  // Rozšíření pro Money S3 export a QR Platbu (v4.32, viz claude/nomis-
  // faktury-backlog.md a lib/dokladySchema.js pro plné zdůvodnění) - appka
  // pole nabízí jako AI odhad + ruční kontrolu, stejná konvence jako DPH/
  // Sazba_DPH výš. Datum splatnosti + Konst./spec. symbol appka posílá do
  // Money S3 exportu (viz lib/moneyS3Export.js), DUZP appka navíc používá i
  // pro řazení DPH bilance v Daňovém přehledu.
  const labelSplatnost = document.createElement('label');
  labelSplatnost.textContent = 'Datum splatnosti';
  const vstupSplatnost = document.createElement('input');
  vstupSplatnost.type = 'date';
  vstupSplatnost.value = d.Datum_splatnosti || '';
  wrap.appendChild(labelSplatnost);
  wrap.appendChild(vstupSplatnost);

  const labelSymboly = document.createElement('label');
  labelSymboly.textContent = 'Konstantní a specifický symbol';
  const vstupKonstSym = document.createElement('input');
  vstupKonstSym.type = 'text';
  vstupKonstSym.value = d.Konstantni_symbol || '';
  vstupKonstSym.placeholder = 'konstantní symbol';
  vstupKonstSym.style.marginBottom = '6px';
  const vstupSpecSym = document.createElement('input');
  vstupSpecSym.type = 'text';
  vstupSpecSym.value = d.Specificky_symbol || '';
  vstupSpecSym.placeholder = 'specifický symbol';
  wrap.appendChild(labelSymboly);
  wrap.appendChild(vstupKonstSym);
  wrap.appendChild(vstupSpecSym);

  const labelDuzp = document.createElement('label');
  labelDuzp.textContent = 'DUZP (datum uskutečnění zdanitelného plnění)';
  const vstupDuzp = document.createElement('input');
  vstupDuzp.type = 'date';
  vstupDuzp.value = d.DUZP || '';
  vstupDuzp.title = 'Vyplňte, jen pokud se liší od data dokladu (appka jinak pro export/DPH bilanci použije datum dokladu).';
  wrap.appendChild(labelDuzp);
  wrap.appendChild(vstupDuzp);

  const labelTypDokladu = document.createElement('label');
  labelTypDokladu.textContent = 'Typ dokladu';
  const vstupTypDokladu = document.createElement('select');
  ['Faktura', 'Dobropis', 'Zálohová faktura'].forEach((moznost) => {
    const option = document.createElement('option');
    option.value = moznost;
    option.textContent = moznost;
    if ((d.Typ_dokladu || 'Faktura') === moznost) option.selected = true;
    vstupTypDokladu.appendChild(option);
  });
  wrap.appendChild(labelTypDokladu);
  wrap.appendChild(vstupTypDokladu);

  const labelUcetDodavatele = document.createElement('label');
  labelUcetDodavatele.textContent = 'Číslo účtu dodavatele (pro QR Platbu)';
  const vstupUcetDodavatele = document.createElement('input');
  vstupUcetDodavatele.type = 'text';
  vstupUcetDodavatele.value = d.Cislo_uctu_dodavatele || '';
  vstupUcetDodavatele.placeholder = 'např. 19-2000145399/0800 nebo IBAN';
  wrap.appendChild(labelUcetDodavatele);
  wrap.appendChild(vstupUcetDodavatele);

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

  // Účet MD (od v4.52) - hned pod Kategorií, protože se z ní odvozuje.
  // Janova volba byla *"Podle kategorie, jde přepsat"*, takže tohle NENÍ jen
  // zobrazení navrženého účtu, ale plnohodnotné pole: co je tady vybrané, to
  // se uloží a to půjde účetní do exportu.
  const labelUcetMD = document.createElement('label');
  labelUcetMD.textContent = 'Účet MD (nákladový účet)';
  const vstupUcetMD = document.createElement('select');
  vstupUcetMD.innerHTML = moznostiUctuMD(
    d.Firma_potvrzena || d.Firma_AI_odhad || '', d.Ucet_MD || '',
  );
  const upozorneniUcet = document.createElement('div');
  upozorneniUcet.className = 'popis upozorneni-ucet';
  wrap.appendChild(labelUcetMD);
  wrap.appendChild(vstupUcetMD);
  wrap.appendChild(upozorneniUcet);

  // Druhá polovina Janovy volby *"Nechat prázdné a upozornit"*: appka nikdy
  // nedosadí náhradní účet, ale prázdno u dokladu nenechá tiše - napíše, PROČ
  // je prázdné (osnova firmy je prázdná / kombinace firma+kategorie nemá
  // nastavený účet) a kam se to doplňuje.
  function prekresliUpozorneniUctu() {
    const firmaTed = vstupFirma.value.trim();
    const kategorieTed = vstupKategorie.value.trim();
    if (vstupUcetMD.value.trim()) {
      upozorneniUcet.textContent = '';
      upozorneniUcet.classList.remove('viditelne');
      return;
    }
    upozorneniUcet.classList.add('viditelne');
    if (!firmaTed || !kategorieTed) {
      upozorneniUcet.textContent = 'Účet není nastavený - nejdřív vyberte firmu a kategorii.';
    } else if (!uctovaOsnovaSeznam.some((u) => String(u.Firma || '').trim() === firmaTed)) {
      upozorneniUcet.textContent = 'Účet není nastavený - firma ' + firmaTed
        + ' zatím nemá účtovou osnovu. Doplňte ji v Nastavení → Účtová osnova.';
    } else {
      upozorneniUcet.textContent = 'Účet není nastavený pro kombinaci ' + firmaTed
        + ' / ' + kategorieTed + '. Nastavte ho v Nastavení → Předkontace, nebo vyberte ručně.';
    }
  }

  // Přepočet po změně firmy/kategorie. Stejné třístranné pravidlo jako na
  // serveru (netlify/functions/doklady.js, větev PATCH): appka přepíše jen
  // účet, který je prázdný nebo který sama navrhla. Ručně vybraný účet
  // zůstane. Kdyby se to zjednodušilo na "po změně kategorie vždycky přepiš",
  // uživatel by opravou kategorie tiše přišel o účet, který si nastavil sám.
  function prepocitejUcetMD() {
    const firmaTed = vstupFirma.value.trim();
    const soucasny = vstupUcetMD.value.trim();
    const puvodniNavrh = navrhUctuMD(
      d.Firma_potvrzena || d.Firma_AI_odhad || '', d.Kategorie || '',
    );
    const novy = (!soucasny || soucasny === puvodniNavrh)
      ? navrhUctuMD(firmaTed, vstupKategorie.value.trim())
      : soucasny;
    vstupUcetMD.innerHTML = moznostiUctuMD(firmaTed, novy);
    prekresliUpozorneniUctu();
  }
  vstupFirma.addEventListener('change', prepocitejUcetMD);
  vstupKategorie.addEventListener('change', prepocitejUcetMD);
  vstupUcetMD.addEventListener('change', prekresliUpozorneniUctu);
  prekresliUpozorneniUctu();

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

  // Způsob platby a platební karta (od v4.52) - obojí vytěží AI z dokladu
  // (viz lib/gemini.js), tady jde o kontrolu a opravu. Pozor, tohle je něco
  // jiného než "Mimo účet" o řádek výš: způsob platby říká, ČÍM se platilo,
  // zatímco "Mimo účet" je rozhodnutí, že se na bankovní pohyb vůbec nemá
  // čekat. Firemní kartou zaplacený doklad na výpisu je, takže má "Karta" a
  // zároveň NEMÁ "Mimo účet".
  const labelZpusobPlatby = document.createElement('label');
  labelZpusobPlatby.textContent = 'Způsob platby a karta';
  const vstupZpusobPlatby = document.createElement('select');
  ['', 'Karta', 'Hotovost', 'Převodem'].forEach((moznost) => {
    const option = document.createElement('option');
    option.value = moznost;
    option.textContent = moznost || '— neuvedeno —';
    if ((d.Zpusob_platby || '') === moznost) option.selected = true;
    vstupZpusobPlatby.appendChild(option);
  });
  vstupZpusobPlatby.style.marginBottom = '6px';
  const vstupKarta = document.createElement('input');
  vstupKarta.type = 'text';
  vstupKarta.inputMode = 'numeric';
  vstupKarta.maxLength = 4;
  vstupKarta.value = d.Platebni_karta || '';
  // Schválně jen čtyři číslice, i v UI: appka celé číslo karty neukládá
  // nikde (viz lib/platebniKartySchema.js) a tenhle placeholder ani maxLength
  // neměnit tak, aby to vypadalo, že se sem píše celé číslo.
  vstupKarta.placeholder = 'poslední 4 číslice karty';
  vstupKarta.title = 'Poslední čtyři číslice karty - appka je používá při hledání odpovídajícího bankovního pohybu.';
  wrap.appendChild(labelZpusobPlatby);
  wrap.appendChild(vstupZpusobPlatby);
  wrap.appendChild(vstupKarta);

  if (d.Zdrojovy_soubor_URL) {
    const souborDiv = document.createElement('div');
    souborDiv.style.marginTop = '12px';
    souborDiv.innerHTML = odkazOtevritSken(d.Zdrojovy_soubor_URL, d.Zdrojovy_soubor_ID, 'doklad');
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
      // Ucet_MD posílá appka vždycky (i prázdný) - server pak pozná, že si
      // uživatel účet nastavil ručně, a nepřepíše ho vlastním návrhem
      // (viz větev PATCH v netlify/functions/doklady.js).
      Ucet_MD: vstupUcetMD.value.trim(),
      Zpusob_platby: vstupZpusobPlatby.value,
      Platebni_karta: posledniCtyriZTextu(vstupKarta.value),
      Stredisko: vstupStredisko.value.trim(),
      Mnozstvi_litru: vstupLitry.value,
      Druh_paliva: vstupDruhPaliva.value.trim(),
      Hrazeno_mimo_ucet: vstupMimoUcet.checked ? 'ANO' : '',
      Datum_splatnosti: vstupSplatnost.value,
      Konstantni_symbol: vstupKonstSym.value.trim(),
      Specificky_symbol: vstupSpecSym.value.trim(),
      DUZP: vstupDuzp.value,
      Typ_dokladu: vstupTypDokladu.value,
      Cislo_uctu_dodavatele: vstupUcetDodavatele.value.trim(),
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
    tlacitkoSchvalit.className = 'maly akce-potvrdit';
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.onclick = () => smazDoklad(d.ID, d.Dodavatel, tlacitkoSmazat);
    akce.appendChild(tlacitkoSmazat);
  }

  // Zpětný ořez skenu (v4.49) - Jan (2026-08-02): "a je možné nyný dodělat
  // ořezání a nebo jde jen u nových?". Automatický ořez z v4.48 běží při
  // focení, takže dřív nahrané doklady ho neviděly - tímhle tlačítkem se
  // dá pustit dodatečně (viz orezniSkenZnovu() níž).
  // Appka ho ukazuje jen tam, kde má co ořezávat: doklad musí mít sken na
  // Disku. Že je sken fotka a ne PDF, appka pozná až po stažení (v listu
  // typ souboru nemá) - řekne to pak hláškou, sken se nezmění.
  // Práva kopírují netlify/functions/orezSkenu.js: schválený doklad je už
  // podklad pro účetnictví, tam sken vymění jen admin/účetní.
  if (d.Zdrojovy_soubor_ID && (jeUcetniNeboAdminDoklad || d.Stav !== 'Schváleno')) {
    const tlacitkoOrez = document.createElement('button');
    tlacitkoOrez.className = 'maly sekundarni';
    tlacitkoOrez.textContent = 'Oříznout sken';
    tlacitkoOrez.onclick = () => orezniSkenZnovu(d.ID, d.Zdrojovy_soubor_ID, tlacitkoOrez);
    akce.appendChild(tlacitkoOrez);
  }

  wrap.appendChild(akce);

  // QR Platba (v4.32, viz lib/qrPlatba.js) - appka QR ukáže jen u
  // SCHVÁLENÉHO dokladu (appka nechce nabízet platbu k dokladu, který ještě
  // čeká na kontrolu) a jen adminovi/účetní (příprava platby, stejné
  // omezení jako export-money-s3.js/netlify/functions/qr-platba.js).
  // Jan (2026-07-30, v4.38): dřív appka QR schovávala za tlačítko "QR
  // Platba" + modální okno přes celou appku (klik → fetch → overlay) -
  // appka teď QR připraví a zobrazí ROVNOU v detailu, bez klikání
  // (viz nactiQrPlatbuInline() níž), ve zmenšené velikosti (~2/3 dřívějších
  // 260px, viz šířka obrázku tam).
  if (d.Stav === 'Schváleno' && jeUcetniNeboAdminDoklad) {
    const qrKontejner = document.createElement('div');
    qrKontejner.className = 'qr-inline';
    wrap.appendChild(qrKontejner);
    nactiQrPlatbuInline(d.ID, qrKontejner);
  }

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
    // v4.34: appka při schválení sama dopočítá Evidencni_cislo (viz
    // netlify/functions/doklady.js) - appka proto do lokálního seznamu
    // promítne i `data.doklad` (celý přepočtený řádek ze serveru), ne jen
    // `zmeny`, ať se nové evidenční číslo ukáže hned, ne až po dalším GETu.
    const data = await zavolejApi('/doklady', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    // Optimistická aktualizace: promítneme změnu rovnou do lokálního seznamu
    // a překreslíme z něj, místo abychom hned volali nactiDoklady() (nový GET).
    // Google Sheets API má po zápisu krátké okno eventual-consistency, kdy by
    // okamžitý GET mohl vrátit ještě starou hodnotu Stav - to způsobovalo, že
    // se schválený doklad po Schválit nepřesunul do sekce "Schválené".
    const idx = dokladySeznamAktualni.findIndex((d) => d.ID === id);
    if (idx !== -1) {
      Object.assign(dokladySeznamAktualni[idx], zmeny, data.doklad || {});
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

// ---------- SROVNÁNÍ ČÍSLOVÁNÍ ZA ROK (v4.49) ----------
//
// Jan (2026-08-02): "a ted je možné ještě všechny doklady roku 2026 upravit a
// doplnit číslování, než se to pošle účetní?" Ano - tohle je ten úklid.
//
// Appka to schválně dělá na DVĚ kliknutí (náhled → potvrzení) a ne jedním
// tlačítkem "srovnat". Evidenční číslo je něco, co může být opsané v mailu
// nebo vytištěné ve složce - Jan má před zápisem vidět, kolika dokladů se to
// týká a jak se čísla posunou. Když se nemění nic, appka to rovnou napíše a
// tlačítko k zápisu vůbec nenabídne.
//
// Samotné pravidlo (pořadí podle DUZP, zvlášť po firmách, jen schválené
// doklady) sedí na jednom místě v lib/evidencniCislo.js a počítá ho backend
// (netlify/functions/precislovani.js) - frontend jen ukazuje, co mu přišlo.
// Kdyby si počítal vlastní návrh, byla by to druhá verze téhož pravidla a
// dřív nebo později by ukazoval něco jiného, než co se pak zapíše.
let cislovaniNavrhAktualni = null;
// Pojistka proti dvojímu navěšení obsluhy - viz zobrazApp() výš.
let cislovaniInicializovano = false;

function inicializujCislovani() {
  const otevrit = document.getElementById('cislovani-otevrit');
  const panel = document.getElementById('cislovani-panel');
  const nahled = document.getElementById('cislovani-nahled');
  const vyberRoku = document.getElementById('cislovani-rok');
  if (!otevrit || !panel || !nahled || !vyberRoku) return;

  // Nabídka roků: letošek a čtyři roky zpátky. Appka je nebere ze Sheetů -
  // seznam roků by kvůli tomu musel projít celý list dřív, než Jan vůbec
  // klikne, a účetní úklid se stejně dělá za rok, který má člověk v hlavě.
  const letos = new Date().getFullYear();
  vyberRoku.innerHTML = '';
  for (let rok = letos; rok > letos - 5; rok -= 1) {
    const volba = document.createElement('option');
    volba.value = String(rok);
    volba.textContent = String(rok);
    vyberRoku.appendChild(volba);
  }

  otevrit.addEventListener('click', () => {
    const skryto = panel.classList.toggle('skryto');
    otevrit.textContent = skryto ? 'Srovnat číslování…' : 'Skrýt srovnání číslování';
    if (skryto) document.getElementById('cislovani-vysledek').innerHTML = '';
  });
  nahled.addEventListener('click', nactiNahledCislovani);
}

async function nactiNahledCislovani() {
  const vysledek = document.getElementById('cislovani-vysledek');
  const rok = document.getElementById('cislovani-rok').value;
  const typ = document.getElementById('cislovani-typ').value;
  vysledek.innerHTML = '<p class="popis">Počítám náhled…</p>';
  cislovaniNavrhAktualni = null;

  try {
    const data = await zavolejApi(
      '/precislovani?rok=' + encodeURIComponent(rok) + '&typ=' + encodeURIComponent(typ),
      { method: 'GET' }
    );
    cislovaniNavrhAktualni = { rok, typ };

    if (!data.celkem) {
      vysledek.innerHTML = '<p class="popis">Za rok ' + escapeHtml(rok) + ' appka nenašla žádné ' +
        escapeHtml(data.popisDruhu || 'záznamy') + ', které by se číslovaly.</p>';
      return;
    }
    if (!data.zmen) {
      vysledek.innerHTML = '<p class="popis">Číslování za rok ' + escapeHtml(rok) + ' je v pořádku – ' +
        'všech ' + data.celkem + ' záznamů (' + escapeHtml(data.popisDruhu) + ') má číslo, které sedí. ' +
        'Není co měnit.</p>';
      return;
    }

    let html = '<p class="popis"><strong>Změní se ' + data.zmen + ' z ' + data.celkem + '</strong> ' +
      'záznamů (' + escapeHtml(data.popisDruhu) + ') za rok ' + escapeHtml(rok) +
      '. Řádky, které zůstávají beze změny, appka neukazuje.</p>';
    html += '<div class="cislovani-nahled-seznam">';
    (data.polozky || []).forEach((p) => {
      html += '<div class="cislovani-nahled-radek">' +
        '<span class="cislovani-nahled-cislo">' + escapeHtml(p.stare || '(bez čísla)') + '</span>' +
        '<span class="cislovani-nahled-sipka" aria-hidden="true">→</span>' +
        '<span class="cislovani-nahled-cislo nove">' + escapeHtml(p.nove) + '</span>' +
        '<span class="cislovani-nahled-popis">' + escapeHtml(p.datum || '') + ' · ' +
        escapeHtml(p.firma || '') + ' · ' + escapeHtml(p.popis || '') + '</span>' +
        '</div>';
    });
    html += '</div>';
    html += '<div class="tlacitka-nahrani" style="margin-top:12px">' +
      '<button type="button" id="cislovani-potvrdit">Zapsat nová čísla</button></div>';
    vysledek.innerHTML = html;
    document.getElementById('cislovani-potvrdit').addEventListener('click', zapisCislovani);
  } catch (e) {
    vysledek.innerHTML = '<p class="popis">Náhled se nepodařilo spočítat: ' + escapeHtml(e.message) + '</p>';
  }
}

async function zapisCislovani() {
  if (!cislovaniNavrhAktualni) return;
  const tlacitko = document.getElementById('cislovani-potvrdit');
  const vysledek = document.getElementById('cislovani-vysledek');
  tlacitko.disabled = true;
  tlacitko.textContent = 'Zapisuji…';
  try {
    const data = await zavolejApi('/precislovani', {
      method: 'POST',
      body: JSON.stringify(cislovaniNavrhAktualni),
    });
    vysledek.innerHTML = '<p class="popis">Hotovo – appka přepsala ' + data.zapsano + ' čísel za rok ' +
      escapeHtml(String(data.rok)) + '.</p>';
    cislovaniNavrhAktualni = null;
    // Seznam dokladů teď ukazuje stará čísla - appka ho natáhne znovu.
    // Vydané faktury si nová čísla vezmou při dalším otevření té záložky;
    // sahat odsud do cizího seznamu by znamenalo držet tady pravidlo o tom,
    // co všechno je zrovna načtené, a to se rozejde s realitou.
    if (data.typ === 'doklady') nactiDoklady();
  } catch (e) {
    vysledek.innerHTML = '<p class="popis">Zápis se nepodařil: ' + escapeHtml(e.message) + '</p>';
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

// QR Platba (v4.32, viz lib/qrPlatba.js/netlify/functions/qr-platba.js) -
// appka zavolá backend, který sestaví SPAYD text a QR kód (appka žádnou
// generaci QR appka needělá ve frontendu, appka posílá hotový PNG data URL).
// Jan (2026-07-30, v4.38): appka do v4.37 QR schovávala za tlačítko "QR
// Platba" + modální okno přes celou appku (klik → fetch → overlay) - appka
// teď QR načte a zobrazí ROVNOU v detailu schváleného dokladu, hned při
// rozbalení (appka funkci volá z vytvorDetailDoklad() výš, žádné tlačítko/
// modál appka už nemá), ve zmenšené velikosti (173px, cca 2/3 dřívějších
// 260px). Appka tu nic sama neposílá/neplatí - jde jen o zobrazení k
// naskenování v bankovní appce uživatele.
async function nactiQrPlatbuInline(id, kontejner) {
  kontejner.classList.add('qr-inline-nacita');
  kontejner.textContent = 'Připravuji QR Platbu…';
  try {
    const data = await zavolejApi('/qr-platba?id=' + encodeURIComponent(id));
    kontejner.classList.remove('qr-inline-nacita');
    kontejner.innerHTML = '';

    const obrazek = document.createElement('img');
    obrazek.className = 'qr-inline-obrazek';
    obrazek.src = data.qrObrazek;
    obrazek.alt = 'QR Platba';
    obrazek.width = 173;
    obrazek.height = 173;
    kontejner.appendChild(obrazek);

    const popis = document.createElement('div');
    const popisek = document.createElement('p');
    popisek.className = 'qr-inline-popisek';
    popisek.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/>' +
        '<rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' +
      'QR Platba';
    const napoveda = document.createElement('p');
    napoveda.className = 'qr-inline-napoveda';
    napoveda.textContent = 'Naskenujte v bankovní appce - QR se připravil automaticky ke schválenému dokladu.';
    popis.appendChild(popisek);
    popis.appendChild(napoveda);
    kontejner.appendChild(popis);
  } catch (e) {
    kontejner.classList.remove('qr-inline-nacita');
    kontejner.classList.add('qr-inline-chyba');
    kontejner.textContent = 'Nepodařilo se připravit QR Platbu: ' + e.message;
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
      // Od v4.47 appka měny NESLEPUJE do jednoho řádku spojkou " + " (dřív
      // "233 140,50 Kč + 148 500,00 HUF"). Ten slepenec se nesměl zalomit
      // (`.polozka-souhrn strong` má `white-space: nowrap`, aby se částka
      // netrhala uprostřed čísla), takže na mobilu roztlačil celou kartu o
      // deset pixelů za okraj stránky - přesně to, co Jan viděl. Každá měna
      // má teď vlastní řádek uvnitř buňky s částkou; po opravě měn v
      // netlify/functions/dashboard-firmy.js je to stejně skoro vždycky jen
      // jeden řádek, ale appka na to už nespoléhá.
      const castkyText = serazeneMeny(podleMeny)
        .map((mena) => '<span class="castka-radek">' + formatCastkaSMenou(podleMeny[mena], mena) + '</span>')
        .join('');
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

  // Od v4.47 hlavička karty nese odznak s měnou/měnami bankovních účtů firmy
  // (`menyUctu` z dashboard-firmy.js). Není to jen ozdoba: od téhle verze
  // appka ve zbytku karty počítá VÝHRADNĚ v těchhle měnách, takže odznak
  // rovnou říká, proč jsou částky takové, jaké jsou - a kdyby se u firmy
  // objevila měna, kterou Jan nečeká, je vidět, že je špatně nastavený účet
  // v Nastavení, ne výpočet.
  const menyUctu = f.menyUctu || [];
  const odznakMeny = menyUctu.length > 0
    ? '<span class="dash-mena-uctu">' + escapeHtml(menyUctu.join(' · ')) + '</span>'
    : '';

  let html =
    '<h3>' + escapeHtml(f.firma) + odznakMeny + '</h3>' +
    radkySouhrnPodleMeny('Příjmy (12 měsíců)', f.prijmyPodleMeny) +
    radkySouhrnPodleMeny('Výdaje (12 měsíců)', f.vydajePodleMeny) +
    radkySouhrnPodleMeny('Rozdíl', f.rozdilPodleMeny, (hodnota) => (hodnota >= 0 ? 'rozdil-kladny' : 'rozdil-zaporny')) +
    '<div class="dash-stredisko-nadpis">Výdaje podle střediska</div>' +
    vykresliDashSouhrnStredisek(f.strediskaVydaje) +
    '<div class="dash-stredisko-nadpis">Příjmy podle střediska</div>' +
    vykresliDashSouhrnStredisek(f.strediskaPrijmy);

  // Od v4.47: doklady v měně, ve které firma nemá bankovní účet, appka do
  // součtů výš NEZAPOČÍTALA (nemá kurzovní lístek a nebude si ho vymýšlet -
  // viz netlify/functions/dashboard-firmy.js). Zamlčet je by ale znamenalo,
  // že karta tiše ukazuje neúplný obrázek, takže je appka vypíše pod součty.
  // Jan si tuhle podobu vybral výslovně (AskUserQuestion, v4.47:
  // "Nezapočítat a napsat to pod kartu").
  const cizeMeny = f.cizeMeny || {};
  if (cizeMeny.pocet > 0) {
    const rozpis = serazeneMeny(cizeMeny.castky)
      .map((mena) => formatCastkaSMenou(cizeMeny.castky[mena], mena))
      .join(', ');
    html +=
      '<div class="dash-cizi-mena">' +
      cizeMeny.pocet + '× doklad v cizí měně (' + escapeHtml(rozpis) + ') appka do součtů ' +
      'nezapočítala - nemá je zatím spárované s platbou z účtu.' +
      '</div>';
  }

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
    // Odpověď Dashboardu nese i čísla pro počítadla na tlačítkách menu -
    // appka je z ní rovnou přepíše, ať kvůli nim nevolá stejný endpoint
    // podruhé (viz obnovPocitadla() níž).
    vykresliPocitadla(firmy);
    if (firmy.length === 0 && !data.googleAuthVarovani) {
      obsah.innerHTML = '<div class="nacitani">Zatím žádná viditelná firma.</div>';
      return;
    }
    firmy.forEach((f) => obsah.appendChild(vytvorDashFirmaKarta(f)));
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst Dashboard: ' + e.message;
  }
}

// ---------- POČÍTADLA NA TLAČÍTKÁCH MENU (v4.48) ----------
//
// Jan (2026-08-02): "a na dashboard zobrazit v tlačítku kolik čeká na
// vyřízení?" - a v navazujícím dotazu si vybral, že čísla mají být "na
// tlačítkách hlavního menu" (ne jako dlaždice na Dashboardu) a že se mají
// počítat tři věci: doklady ke schválení, nespárované bankovní pohyby a
// vydané faktury po splatnosti.
//
// Odkud čísla appka bere: ze STEJNÉ odpovědi, ze které se skládá Dashboard
// (/dashboard-firmy). Appka si kvůli počítadlům schválně nezakládá vlastní
// endpoint ani si nic nepočítá z lokálních seznamů - Dashboard už všechny tři
// hodnoty umí spočítat po firmách a se správným scopem na role (uživatel
// vidí jen své firmy), takže vlastní cesta by znamenala druhé místo, kde se
// stejné pravidlo počítá jinak. Čísla appka sečte přes všechny firmy, které
// uživatel vidí - odznak odpovídá tomu, co uvidí po kliknutí v seznamu.
//
// Proč se to nepočítá z lokálních seznamů: odznak musí být správně i ve
// chvíli, kdy Jan po přihlášení příslušnou záložku vůbec neotevřel, takže
// appka nemá co sčítat - žádný seznam ještě není načtený.
const POCITADLA_TLACITKA = [
  { zalozka: 'doklady', pole: 'dokladyKeSchvaleni', popis: 'ke schválení' },
  { zalozka: 'vydane-faktury', pole: 'fakturyPoSplatnosti', popis: 'po splatnosti' },
  { zalozka: 'banka', pole: 'pohybyNesparovane', popis: 'nespárováno' },
];

function vykresliPocitadla(firmy) {
  POCITADLA_TLACITKA.forEach((def) => {
    const tlacitko = document.querySelector('nav.zalozky [data-zalozka="' + def.zalozka + '"]');
    if (!tlacitko) return;
    const pocet = (firmy || []).reduce((soucet, f) => soucet + (Number(f[def.pole]) || 0), 0);
    let odznak = tlacitko.querySelector('.pocitadlo');

    if (pocet <= 0) {
      // Nula se nezobrazuje vůbec - tlačítko se vrátí do původní podoby
      // (včetně sundání .ma-pocitadlo, tedy i flexu), aby vypadalo přesně
      // jako ostatních sedm.
      if (odznak) odznak.remove();
      tlacitko.classList.remove('ma-pocitadlo');
      return;
    }

    if (!odznak) {
      odznak = document.createElement('span');
      odznak.className = 'pocitadlo';
      // Popisek tlačítka appka schválně nechává jako holý textový uzel a
      // odznak přidává za něj - kdyby ho appka obalovala do <span>, musela
      // by kvůli tomu sahat na innerHTML tlačítka, a tím by si při každém
      // přepsání shodila i případný `disabled`/třídy nastavené jinde
      // (nastavZamekZalozky). Holý text se ve flexu chová jako anonymní
      // položka a zalomí se stejně, jako se zalomil na maketě.
      tlacitko.appendChild(odznak);
    }
    // Nad 99 by se odznak na mobilu roztáhl a rozhodil mřížku záložek -
    // přesné číslo si Jan stejně přečte v seznamu.
    odznak.textContent = pocet > 99 ? '99+' : String(pocet);
    // Odečítačkám obrazovky by samotná číslice nic neřekla. `title` appka
    // schválně nepoužívá - ten na tlačítkách záložek patří hlášce o zámku
    // (nastavZamekZalozky) a přepisovaly by si ho navzájem.
    odznak.setAttribute('aria-label', pocet + ' ' + def.popis);
    tlacitko.classList.add('ma-pocitadlo');
  });
}

// Přepočet počítadel bez ohledu na to, jestli je zrovna vidět Dashboard.
// Chyba se schválně polyká: počítadlo je doplňková informace a rozbitá
// hláška kvůli němu (typicky při výpadku sítě) by Jana jen vyděsila
// uprostřed jiné práce.
let pocitadlaBezi = false;
async function obnovPocitadla() {
  if (!stav || !stav.token || pocitadlaBezi) return;
  pocitadlaBezi = true;
  try {
    // `jen_pocitadla=1` - odpověď bez jediné částky. Běžná role má Dashboard
    // zamčený a příjmy/výdaje vidět nemá, odznak "kolik čeká" ale ano; viz
    // netlify/functions/dashboard-firmy.js.
    const data = await zavolejApi('/dashboard-firmy?jen_pocitadla=1', { method: 'GET' });
    vykresliPocitadla(data.firmy || []);
  } catch (e) {
    /* ticho - viz komentář výš */
  } finally {
    pocitadlaBezi = false;
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
// (v4.50) Český tvar slova podle počtu. Souhrny nad seznamy skládají věty
// z čísel ("1 daňových plateb" vypadalo blbě), proto tenhle malý pomocník.
// `tvary` je trojice [1, 2-4, 5 a víc]; když se předá jen řetězec, appka
// ho vrátí beze změny (slova jako "potvrzeno" nebo "bez dokladu" se
// neskloňují).
function tvarPodlePoctu(pocet, tvary) {
  if (!Array.isArray(tvary)) return tvary;
  if (pocet === 1) return tvary[0];
  if (pocet >= 2 && pocet <= 4) return tvary[1];
  return tvary[2];
}

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
// (v4.50) Filtr seznamu vydaných faktur - dlaždice souhrnu, stejný vzor
// jako `bankaFiltr` u bankovních pohybů (proměnná, ne atribut v DOM:
// souhrn se překresluje přes innerHTML).
let vfFiltr = { poSplatnosti: false, ceka: false };

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

// v4.35 (Jan: "zarovnej data do sloupců... schváleno nahraď zkratkou -
// platí pro vydané i přijaté faktury") - viz dokladStavZkratka výše, stejný
// princip: appka zkrácený text ukazuje jen ve sbaleném řádku (kvůli
// zarovnání do pevné grid mřížky), plné znění appka nechává v `title`
// atributu a beze změny i v rozklikntém detailu.
function vfStavZkratka(f) {
  if (f.Stav === 'Zpracovává se') return 'Zprac.';
  if (f.Stav === 'Uhrazeno') return 'Uhraz.';
  if (f.Stav === 'Částečně uhrazeno') return 'Částeč.';
  if (f.Stav === 'Možná duplicita') return 'Dupl.?';
  if (vfJePoSplatnosti(f)) return 'Po splat.';
  return 'Neuhr.';
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
  const zpracovavaSe = filtrovane.length - zpracovane.length;
  const soucetNeuhrazeno = zpracovane
    .filter((f) => f.Stav !== 'Uhrazeno')
    .reduce((soucet, f) => soucet + parsujCastkuZListu(f.Castka), 0);

  // (v4.50) Stejný souhrn "nejdřív co čeká" jako nad bankovními pohyby -
  // dřív to byla jedna věta se čtyřmi čísly za sebou, ve které se na
  // telefonu nedalo nic najít (Jan 2026-08-02). Dlaždice jsou zároveň
  // filtr seznamu; sdílené CSS je `.souhrn-akce` v public/style.css.
  // "Po splatnosti" je vlastní stav odvozený z data, ne ze sloupce Stav
  // (viz vfJePoSplatnosti), a faktura po splatnosti se do "čeká na
  // platbu" schválně NEpočítá - jinak by jedna faktura byla ve dvou
  // dlaždicích naráz a čísla by nedávala součet.
  const cekaNaPlatbu = neuhrazeno + castecne;
  if (poSplatnosti === 0) vfFiltr.poSplatnosti = false;
  if (cekaNaPlatbu === 0) vfFiltr.ceka = false;

  const dlazdiceAkce = [
    ['poSplatnosti', poSplatnosti, 'po splatnosti'],
    ['ceka', cekaNaPlatbu, 'čeká na platbu'],
  ].filter(([, pocet]) => pocet > 0);

  const hotoveData = [
    ['uhrazeno', uhrazeno],
    [['se zpracovává', 'se zpracovávají', 'se zpracovává'], zpracovavaSe],
  ].filter(([, pocet]) => pocet > 0);

  if (filtrovane.length === 0) {
    souhrn.innerHTML = '';
  } else {
    souhrn.innerHTML =
      (dlazdiceAkce.length
        ? '<span class="souhrn-akce">' +
            dlazdiceAkce
              .map(
                ([klic, pocet, popis]) =>
                  '<button type="button" class="souhrn-akce-tlacitko" data-filtr="' + klic + '"' +
                  ' aria-pressed="' + (vfFiltr[klic] ? 'true' : 'false') + '">' +
                  '<span class="cislo">' + pocet + '</span>' +
                  '<span class="stav">' + escapeHtml(popis) + '</span>' +
                  '</button>'
              )
              .join('') +
          '</span>'
        : '') +
      '<p class="souhrn-zbytek">' +
        (dlazdiceAkce.length
          ? (hotoveData.length ? 'Vyřízeno: ' : '')
          : '<span class="souhrn-vse-hotovo">Všechno uhrazeno.</span> ') +
        hotoveData
          .map(([popis, pocet]) => '<b>' + pocet + '</b>&nbsp;' + escapeHtml(tvarPodlePoctu(pocet, popis)))
          .join(' · ') +
        (hotoveData.length ? '. ' : '') +
        'Celkem <b>' + filtrovane.length + '</b>&nbsp;' +
        tvarPodlePoctu(filtrovane.length, ['faktura', 'faktury', 'faktur']) +
        (soucetNeuhrazeno ? ', nezaplaceno <b>' + escapeHtml(formatCastka(soucetNeuhrazeno)) + '</b>' : '') +
        '.' +
      '</p>';
  }

  const vfFiltrujeSe = vfFiltr.poSplatnosti || vfFiltr.ceka;
  const serazene = filtrovane
    .filter((f) => {
      if (!vfFiltrujeSe) return true;
      if (f.Stav === 'Zpracovává se' || f.Stav === 'Uhrazeno') return false;
      if (vfFiltr.poSplatnosti && vfJePoSplatnosti(f)) return true;
      if (vfFiltr.ceka && !vfJePoSplatnosti(f)) return true;
      return false;
    })
    .slice()
    .sort((a, b) => (b.Datum_vystaveni || '').localeCompare(a.Datum_vystaveni || ''));

  serazene.forEach((f) => kontejner.appendChild(vytvorRadekVydanaFaktura(f)));

  if (serazene.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">' +
      (vfFiltrujeSe ? 'Nic k vyřízení.' : 'Zatím žádné vydané faktury.') +
      '</div>';
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
    // Evidencni_cislo (v4.34) - appka ho přiřazuje sama hned, jak faktura
    // přestane být placeholder/Možná duplicita (viz vydaneFaktury.js), takže
    // tu chvíli být nemusí - appka ukazuje pomlčku, dokud číslo není
    // přiřazené. (v4.35, Jan: "na začátek dej přidělené číslo") - appka
    // sloupec dala jako úplně první viditelný (hned za šipkou) a appka ho
    // vykresluje VŽDY, ať zůstane pevný počet sloupců pro zarovnání.
    '<span class="cislo-evid' + (f.Evidencni_cislo ? '' : ' cislo-evid-prazdne') + '">' +
      escapeHtml(f.Evidencni_cislo || '–') + '</span>' +
    '<span class="stav-chip ' + vfStavChipTrida(f) + '" title="' + escapeHtml(vfStavText(f)) + '">' +
      escapeHtml(vfStavZkratka(f)) + '</span>' +
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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

  // Rozšíření pro Money S3 export (v4.32, viz claude/nomis-faktury-
  // backlog.md a lib/vydaneFakturySchema.js pro plné zdůvodnění) - appka
  // pole nabízí jako AI odhad + ruční kontrolu, stejná konvence jako DPH/
  // Sazba_DPH výš. DUZP appka navíc používá pro řazení DPH bilance v
  // Daňovém přehledu.
  const labelSymboly = document.createElement('label');
  labelSymboly.textContent = 'Konstantní a specifický symbol';
  const vstupKonstSym = document.createElement('input');
  vstupKonstSym.type = 'text';
  vstupKonstSym.value = f.Konstantni_symbol || '';
  vstupKonstSym.placeholder = 'konstantní symbol';
  vstupKonstSym.style.marginBottom = '6px';
  const vstupSpecSym = document.createElement('input');
  vstupSpecSym.type = 'text';
  vstupSpecSym.value = f.Specificky_symbol || '';
  vstupSpecSym.placeholder = 'specifický symbol';
  wrap.appendChild(labelSymboly);
  wrap.appendChild(vstupKonstSym);
  wrap.appendChild(vstupSpecSym);

  const labelDuzp = document.createElement('label');
  labelDuzp.textContent = 'DUZP (datum uskutečnění zdanitelného plnění)';
  const vstupDuzp = document.createElement('input');
  vstupDuzp.type = 'date';
  vstupDuzp.value = f.DUZP || '';
  vstupDuzp.title = 'Vyplňte, jen pokud se liší od data vystavení (appka jinak pro export/DPH bilanci použije datum vystavení).';
  wrap.appendChild(labelDuzp);
  wrap.appendChild(vstupDuzp);

  const labelTypDokladu = document.createElement('label');
  labelTypDokladu.textContent = 'Typ dokladu';
  const vstupTypDokladu = document.createElement('select');
  ['Faktura', 'Dobropis', 'Zálohová faktura'].forEach((moznost) => {
    const option = document.createElement('option');
    option.value = moznost;
    option.textContent = moznost;
    if ((f.Typ_dokladu || 'Faktura') === moznost) option.selected = true;
    vstupTypDokladu.appendChild(option);
  });
  wrap.appendChild(labelTypDokladu);
  wrap.appendChild(vstupTypDokladu);

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
    souborDiv.innerHTML = odkazOtevritSken(f.Zdrojovy_soubor_URL, f.Zdrojovy_soubor_ID, 'faktura');
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
      Konstantni_symbol: vstupKonstSym.value.trim(),
      Specificky_symbol: vstupSpecSym.value.trim(),
      DUZP: vstupDuzp.value,
      Typ_dokladu: vstupTypDokladu.value,
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
    if (f.Stav === 'Uhrazeno') {
      tlacitkoStav.className = 'maly';
      tlacitkoStav.textContent = 'Zrušit uhrazení';
      tlacitkoStav.onclick = () => ulozZmenuVydaneFaktury(f.ID, { Stav: 'Neuhrazeno', Datum_uhrady: '' }, tlacitkoStav);
    } else {
      tlacitkoStav.className = 'maly akce-potvrdit';
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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
let bankaKartySeznam = []; // od v4.52 - platební karty firmy (nápověda u pohybu)

// (v4.50) Filtr seznamu pohybů. Dřív to bylo jedno tlačítko s lupou, které
// pouštělo dál "chybějící NEBO navržené" naráz; teď jsou to dvě dlaždice
// v souhrnu, každá zvlášť zapínatelná. Obě zapnuté = to, co uměla lupa.
// Žádná zapnutá = celý seznam. Stav je schválně tady v proměnné, ne čtený
// z atributu v DOM: souhrn se překresluje přes innerHTML, takže by se
// aria-pressed při každém překreslení ztratilo.
// (v4.51) Přibyla třetí dlaždice `kontrola` = stav "Příjem ke kontrole".
let bankaFiltr = { ceka: false, chybi: false, kontrola: false };

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
    const [dataPohyby, dataDoklady, dataSmlouvy, dataUcty, dataFaktury, dataStrediska, dataKarty] = await Promise.all([
      zavolejApi('/banka?firma=' + encodeURIComponent(bankaAktivniFirma), { method: 'GET' }),
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/smlouvy?firma=' + encodeURIComponent(bankaAktivniFirma), { method: 'GET' }).catch(() => ({ smlouvy: [] })),
      zavolejApi('/ucty', { method: 'GET' }).catch(() => ({ ucty: [] })),
      zavolejApi('/vydaneFaktury?firma=' + encodeURIComponent(bankaAktivniFirma), { method: 'GET' }).catch(() => ({ faktury: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
      // (v4.52) Karty jsou jen NÁPOVĚDA v detailu pohybu - proto .catch() na
      // prázdno. Vlastní párování podle karty dělá server (navrhniShodu v
      // lib/bankHelpers.js) a funguje i tehdy, když se tenhle seznam nenačte.
      zavolejApi('/platebni-karty', { method: 'GET' }).catch(() => ({ karty: [] })),
    ]);
    strediskaSeznam = dataStrediska.strediska || [];
    bankaPohybySeznam = dataPohyby.pohyby || [];
    bankaDokladySeznam = (dataDoklady.doklady || []).filter(
      (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === bankaAktivniFirma
    );
    bankaSmlouvySeznam = dataSmlouvy.smlouvy || [];
    bankaUctySeznam = (dataUcty.ucty || []).filter((u) => u.Firma === bankaAktivniFirma);
    bankaFakturySeznam = dataFaktury.faktury || [];
    // (v4.52) Karty appka NEFILTRUJE podle firmy schválně: pohyb sice patří
    // jedné firmě, ale kartou firmy A se běžně zaplatí doklad firmy B a Jan
    // to pak přeúčtovává. Kdyby appka karty filtrovala, nápověda by u těchhle
    // pohybů zmizela právě tam, kde je nejvíc potřeba. Firmu karty appka
    // místo toho u nápovědy vypíše, ať je vidět, že je cizí.
    bankaKartySeznam = dataKarty.karty || [];
    nacitani.classList.add('skryto');
    vykresliBankovniPohyby();
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst bankovní pohyby: ' + e.message;
  }
}

function bankaDokladPodleId(id) {
  return bankaDokladySeznam.find((d) => d.ID === id);
}

// (v4.35) Viditelný text appka zkrátila kvůli přechodu na pevnou grid
// mřížku (viz .banka-radek-hlava níže) - plné znění appka nechává v
// `title` atributu (tooltip při najetí myší). Appka schválně u
// "Navrženo/Spárováno (smlouva/faktura/nájem)" vynechává upřesnění v
// závorce ze zkráceného textu - to zůstává vidět v `title` a v rozkliknutém
// detailu pohybu.
function bankaStavBadge(stav) {
  if (stav === 'Potvrzeno') return '<span class="badge-potvrzeno" title="Potvrzeno">Potvrz.</span>';
  if (stav === 'Navrženo') return '<span class="badge-navrzeno" title="Navrženo">Návrh</span>';
  if (stav === 'Bez dokladu') return '<span class="badge-bezdokladu" title="Bez dokladu">Bez dokl.</span>';
  // Od v4.51 - výchozí NEROZHODNUTÝ stav příjmu (appka nenašla vydanou
  // fakturu ani smlouvu). Schválně má stejnou barvu jako "Chybí" u výdajů
  // (badge-chybi), protože je to totéž: appka nic nenašla a čeká na Jana.
  // Nedávat mu barvu "Bez dokladu" - to je vyřízená věc a splynulo by to.
  if (stav === 'Příjem ke kontrole') return '<span class="badge-chybi" title="Příjem ke kontrole – zkontrolovat vydané faktury a smlouvy">Ke kontr.</span>';
  // Od v3.19 - trvalé příkazy (Smlouvy) a příjmy se středisko/účtem mají
  // VLASTNÍ barvu/badge, odlišnou od výdajových stavů výš (viz backlog).
  if (stav === 'Trvalý příkaz') return '<span class="badge-trvalyprikaz" title="Trvalý příkaz">Trvalý</span>';
  if (stav === 'Navrženo - trvalý příkaz') return '<span class="badge-navrzeno" title="Navrženo (trvalý příkaz)">Návrh</span>';
  if (stav === 'Příjem přiřazen') return '<span class="badge-prijemprirazen" title="Příjem přiřazen">Příjem</span>';
  // Od v3.22 - párování příjmů s Vydanými fakturami (viz claude/nomis-
  // faktury-backlog.md, položka 5B).
  if (stav === 'Navrženo - vydaná faktura') return '<span class="badge-navrzeno" title="Navrženo (vydaná faktura)">Návrh</span>';
  if (stav === 'Spárováno - vydaná faktura') return '<span class="badge-prijemprirazen" title="Spárováno s vydanou fakturou">Spárováno</span>';
  // Od v4.19 - párování PŘÍJMŮ přímo s nájemní Smlouvou (viz claude/nomis-
  // faktury-backlog.md, Jan: "příjmy z nájmu přiřadit k bankovním vypisům").
  if (stav === 'Navrženo - nájemní smlouva') return '<span class="badge-navrzeno" title="Navrženo (nájemní smlouva)">Návrh</span>';
  if (stav === 'Spárováno - nájemní smlouva') return '<span class="badge-prijemprirazen" title="Spárováno s nájemní smlouvou">Spárováno</span>';
  // Od v4.6 - ruční přiřazení odchozí platby k dani (viz claude/nomis-
  // faktury-backlog.md, položka 9), stejná barva/logika jako Trvalý příkaz
  // (appka ho NEPOVAŽUJE za chybějící doklad).
  if (stav === 'Daňová platba') return '<span class="badge-trvalyprikaz" title="Daňová platba">Daňová</span>';
  return '<span class="badge-chybi" title="Chybí doklad">Chybí</span>';
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
  // "Příjem ke kontrole" (v4.51) patří do stejné skupiny jako "Nespárováno" -
  // je to jeho dvojče na příjmové straně (appka nic nenašla, čeká se na
  // člověka). Nepatří do skupiny 2 mezi vyřízené, kvůli tomu celá v4.51
  // vznikla.
  if (stav === 'Nespárováno' || stav === 'Příjem ke kontrole') return 1;
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
  // (v4.51) Stejná barva řádku jako "Nespárováno" (výchozí stav-radek-chybi
  // na konci) - viz komentář u bankaStavBadge. Řádek je tu schválně
  // vyjmenovaný, i když by spadl do return na konci: aby bylo při čtení
  // vidět, že to je záměr, ne opomenutí.
  if (stav === 'Příjem ke kontrole') return 'stav-radek-chybi';
  if (stav === 'Trvalý příkaz') return 'stav-radek-trvalyprikaz';
  if (stav === 'Příjem přiřazen') return 'stav-radek-prijemprirazen';
  if (stav === 'Navrženo - vydaná faktura') return 'stav-radek-navrzeno';
  if (stav === 'Spárováno - vydaná faktura') return 'stav-radek-prijemprirazen';
  if (stav === 'Navrženo - nájemní smlouva') return 'stav-radek-navrzeno';
  if (stav === 'Spárováno - nájemní smlouva') return 'stav-radek-prijemprirazen';
  if (stav === 'Daňová platba') return 'stav-radek-trvalyprikaz';
  return 'stav-radek-chybi';
}

// ---------- (v4.51) KANDIDÁTI K PŘÍJMU: TIPY V ROZBALENÉM DETAILU ----------
// Jan (2026-08-03): *"u příjmu v bankovních výpisech se platby příjmy samy
// označí Bez dokladu, ale to je potřeba zkontrolovat Vystavené faktury nebo
// SMlouvy."* Backend (netlify/functions/banka.js + lib/bankHelpers.js) sice
// návrh zkusí, ale je schválně přísný - navrhne až od skóre 2, jinak by
// appka rozhazovala nesmysly. Když nic nenajde, zůstane příjem ve stavu
// "Příjem ke kontrole" a Jan musí ručně projít seznam faktur. Tyhle tipy
// jsou ten mezikrok: appka ukáže i SLABŠÍ shody jako nápovědu ("nejspíš to
// bude tahle"), ale nic nepřiřadí - Jan si vybral "Ne, vždycky jen
// navrhnout", takže appka NIKDY nepotvrzuje sama. Nedělat z toho
// automatiku, ani "když je jen jeden kandidát".
//
// POZOR - proč je porovnávání napsané ZNOVU tady a ne převzaté z
// lib/bankHelpers.js: `public/` je čistě statický adresář bez build kroku
// (žádný bundler, žádné `require` v prohlížeči), takže se sdílený modul do
// prohlížeče nedostane. Když se změní pravidla v lib/bankHelpers.js
// (normalizujNazev / normalizujSymbol / navrhniShoduPrijem), je potřeba
// srovnat i tyhle tři funkce - jinak bude appka na serveru a v prohlížeči
// tipovat jinak. Není to hezké, ale je to levnější než zavádět build.
function bankaNormalizujNazev(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Holé číslice bez úvodních nul - banka posílá VS jako "0002026001",
// zatímco Cislo_faktury bývá "2026001". Prázdný výsledek NIKDY neznamená
// shodu (jinak by se "spárovaly" všechny platby s prázdným VS mezi sebou).
function bankaNormalizujSymbol(hodnota) {
  return String(hodnota || '').replace(/\D/g, '').replace(/^0+/, '');
}

function bankaShodaSymbolu(vsPohybu, ...cisla) {
  const vs = bankaNormalizujSymbol(vsPohybu);
  if (!vs) return false;
  return cisla.some((c) => {
    const n = bankaNormalizujSymbol(c);
    return n && n === vs;
  });
}

// Vrátí { tipy, varovani } pro jeden příchozí pohyb.
//   tipy     - neuhrazené faktury a platné smlouvy, které by to mohly být,
//              seřazené od nejpravděpodobnější
//   varovani - UŽ UHRAZENÉ faktury, na které platba sedí; to je typicky
//              dvojí platba nebo přeplatek (Jan si vyžádal "Varovat před
//              dvojí platbou"). Uhrazená faktura se schválně NEDÁ z tipů
//              přiřadit - appka by tím sama přepsala její stav; ukáže se
//              jen jako červená poznámka, ať se Jan podívá.
function bankaKandidatiProPrijem(p) {
  const castka = Math.abs(parsujCastkuZListu(p.Castka));
  const nazev = bankaNormalizujNazev(p.Protistrana || p.Popis || '');
  const vs = p.Variabilni_symbol || '';
  const tipy = [];
  const varovani = [];
  if (castka <= 0) return { tipy, varovani };

  // Tolerance na částku: 1 Kč kvůli zaokrouhlení, u velkých částek 0,5 %
  // (bankovní poplatek u zahraniční platby ukousne pár korun).
  const tolerance = Math.max(1, castka * 0.005);

  (bankaFakturySeznam || []).forEach((f) => {
    const castkaF = Math.abs(parsujCastkuZListu(f.Castka));
    if (castkaF <= 0) return;
    const shodaVs = bankaShodaSymbolu(vs, f.Cislo_faktury, f.Evidencni_cislo);
    const nazevZakaznika = bankaNormalizujNazev(f.Zakaznik);
    const shodaNazvu = !!(nazevZakaznika && nazev && (nazev.includes(nazevZakaznika) || nazevZakaznika.includes(nazev)));
    const shodaCastky = Math.abs(castkaF - castka) <= tolerance;
    const castecna = !shodaCastky && castka < castkaF;
    if (!shodaVs && !shodaNazvu) return;
    if (!shodaCastky && !castecna && !shodaVs) return;

    const uhrazena = String(f.Stav || '').trim() === 'Uhrazeno';
    let skore = 0;
    if (shodaVs) skore += 3;
    if (shodaNazvu) skore += 2;
    if (shodaCastky) skore += 2;
    else if (castecna) skore += 1;

    const duvody = [];
    if (shodaVs) duvody.push('sedí variabilní symbol');
    if (shodaNazvu) duvody.push('sedí jméno');
    if (shodaCastky) duvody.push('sedí částka');
    else if (castecna) duvody.push('částečná úhrada');

    const zaznam = {
      druh: 'faktura',
      id: f.ID,
      popis:
        (f.Cislo_faktury || '(bez čísla)') +
        ' – ' + (f.Zakaznik || '(bez zákazníka)') +
        ' – ' + formatCastkaSMenou(f.Castka, f.Mena),
      duvody,
      skore,
    };
    if (uhrazena) varovani.push(zaznam);
    else tipy.push(zaznam);
  });

  (bankaSmlouvySeznam || []).forEach((s) => {
    if (String(s.Aktivni || 'ANO').trim() === 'NE') return;
    const ocekavana = Math.abs(parsujCastkuZListu(s.Ocekavana_castka));
    if (ocekavana <= 0) return;
    const shodaVs = bankaShodaSymbolu(vs, s.Cislo_smlouvy);
    const nazevStrany = bankaNormalizujNazev(s.Druha_strana);
    const shodaNazvu = !!(nazevStrany && nazev && (nazev.includes(nazevStrany) || nazevStrany.includes(nazev)));
    // U smluv je tolerance větší - nájem se v jednotlivých měsících liší
    // o zálohy na služby, doplatky apod.
    const shodaCastky = Math.abs(ocekavana - castka) <= Math.max(100, ocekavana * 0.1);
    if (!shodaVs && !shodaNazvu) return;
    if (!shodaCastky && !shodaVs) return;

    const duvody = [];
    if (shodaVs) duvody.push('sedí číslo smlouvy');
    if (shodaNazvu) duvody.push('sedí jméno');
    if (shodaCastky) duvody.push('sedí očekávaná částka');

    tipy.push({
      druh: 'smlouva',
      id: s.ID,
      stredisko: s.Stredisko || '',
      popis:
        (s.Nazev || '(bez názvu)') +
        (s.Typ ? ' (' + s.Typ + ')' : '') +
        (s.Druha_strana ? ' – ' + s.Druha_strana : '') +
        (s.Ocekavana_castka ? ' – ' + formatCastkaSMenou(s.Ocekavana_castka, s.Mena) : ''),
      duvody,
      skore: (shodaVs ? 3 : 0) + (shodaNazvu ? 2 : 0) + (shodaCastky ? 2 : 0),
    });
  });

  tipy.sort((a, b) => b.skore - a.skore);
  varovani.sort((a, b) => b.skore - a.skore);
  // Víc než tři tipy už není nápověda, ale druhý seznam faktur - od toho
  // jsou rozbalovací nabídky pod tím.
  return { tipy: tipy.slice(0, 3), varovani: varovani.slice(0, 3) };
}

function vykresliBankovniPohyby() {
  const kontejner = document.getElementById('banka-tabulka');
  const souhrn = document.getElementById('banka-souhrn');
  kontejner.innerHTML = '';

  const potvrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Potvrzeno').length;
  const navrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Navrženo').length;
  const chybi = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Nespárováno').length;
  const bezDokladu = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Bez dokladu').length;
  // Trvalé příkazy appka dřív počítala dohromady (potvrzené i navržené) -
  // od v4.50 je musí umět rozdělit: navržený trvalý příkaz je stav, který
  // ještě čeká na potvrzení, potvrzený je hotová věc.
  const trvalePrikazyPotvrzene = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Trvalý příkaz').length;
  const trvalePrikazyNavrzene = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Navrženo - trvalý příkaz').length;
  const prijmyPrirazene = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Příjem přiřazen').length;
  const fakturyNavrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Navrženo - vydaná faktura').length;
  const fakturySparovano = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Spárováno - vydaná faktura').length;
  const danovePlatby = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Daňová platba').length;
  // Od v4.19 - párování PŘÍJMŮ přímo s nájemní Smlouvou.
  const najmyNavrzeno = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Navrženo - nájemní smlouva').length;
  const najmySparovano = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Spárováno - nájemní smlouva').length;
  // (v4.50) Souhrn "nejdřív co čeká". Nahoře dvě velké dlaždice se stavy,
  // které po Janovi něco chtějí - a klepnutí na ně rovnou profiltruje
  // seznam pod nimi. Všechno ostatní je pod tím jedna tlumená věta.
  //
  // Historie, ať se neopakuje: v4.46 vykreslovala souhrn DVAKRÁT do
  // stejného místa (věta pro desktop + kulaté dlaždice pro mobil) a
  // přepínala je čistě CSS podle šířky okna. Jedenáct dlaždic různé šířky
  // se na Janových 320 px zalomilo do schodů s dírami a nešlo na ně
  // klepnout, filtr byl zvlášť jako holá lupa bez popisku (Jan 2026-08-02:
  // "tohle nevypadá dobře a k čemu je ta lupa ?"). Teď je rozložení jedno
  // pro všechny šířky - dvě dlaždice vedle sebe se vejdou i na 320 px a
  // odpadá dvojí podoba v DOM i přepínání přes @media.
  //
  // "Čeká na kontrolu" jsou všechny stavy "Navrženo …" (appka má tip,
  // stačí ho potvrdit nebo zamítnout), "Chybí doklad" je "Nespárováno"
  // (appka nenašla nic). Pozor: "Bez dokladu" mezi ně NEPATŘÍ - to je
  // stav, kterým Jan sám řekl, že pohyb doklad mít nemá, tedy hotová věc.
  const ceka = navrzeno + trvalePrikazyNavrzene + fakturyNavrzeno + najmyNavrzeno;
  // (v4.51) Třetí dlaždice: příjmy, u kterých appka nenašla vydanou fakturu
  // ani smlouvu. Do v4.50 tyhle pohyby nesly stav "Bez dokladu" a padaly
  // proto do tlumené věty mezi vyřízené - Jan (2026-08-03): "u příjmu v
  // bankovních výpisech se platby příjmy samy označí Bez dokladu, ale to je
  // potřeba zkontrolovat Vystavené faktury nebo SMlouvy." Nevracet zpátky
  // do věty; tohle je práce, ne hotová věc.
  const prijmyKeKontrole = bankaPohybySeznam.filter((p) => p.Stav_parovani === 'Příjem ke kontrole').length;
  // Dlaždici, na kterou nic nezbylo, appka neukazuje - a rovnou zhasne
  // i její filtr, jinak by po vyřízení posledního pohybu zůstal zapnutý
  // filtr bez tlačítka, kterým by se dal vypnout.
  if (ceka === 0) bankaFiltr.ceka = false;
  if (chybi === 0) bankaFiltr.chybi = false;
  if (prijmyKeKontrole === 0) bankaFiltr.kontrola = false;

  const dlazdiceAkce = [
    ['ceka', ceka, 'čeká na kontrolu'],
    ['chybi', chybi, 'chybí doklad'],
    // Popisek se skloňuje - "1 příjmů ke kontrole" vypadalo blbě, stejný
    // důvod jako u věty pod dlaždicemi (viz tvarPodlePoctu).
    [
      'kontrola',
      prijmyKeKontrole,
      tvarPodlePoctu(prijmyKeKontrole, ['příjem ke kontrole', 'příjmy ke kontrole', 'příjmů ke kontrole']),
    ],
  ].filter(([, pocet]) => pocet > 0);

  // Nulové stavy appka do věty nepíše - "0 navrženo k nájmu" nenese žádnou
  // informaci a jen prodlužuje řádek, kterého je na telefonu škoda.
  const hotoveData = [
    ['potvrzeno', potvrzeno],
    ['bez dokladu', bezDokladu],
    [['trvalý příkaz', 'trvalé příkazy', 'trvalých příkazů'], trvalePrikazyPotvrzene],
    [['příjem přiřazen', 'příjmy přiřazeny', 'příjmů přiřazeno'], prijmyPrirazene],
    ['s fakturou', fakturySparovano],
    ['s nájmem', najmySparovano],
    [['daňová platba', 'daňové platby', 'daňových plateb'], danovePlatby],
  ].filter(([, pocet]) => pocet > 0);

  if (bankaPohybySeznam.length === 0) {
    souhrn.innerHTML = '';
  } else {
    souhrn.innerHTML =
      (dlazdiceAkce.length
        ? '<span class="souhrn-akce">' +
            dlazdiceAkce
              .map(
                ([klic, pocet, popis]) =>
                  '<button type="button" class="souhrn-akce-tlacitko" data-filtr="' + klic + '"' +
                  ' aria-pressed="' + (bankaFiltr[klic] ? 'true' : 'false') + '">' +
                  '<span class="cislo">' + pocet + '</span>' +
                  '<span class="stav">' + escapeHtml(popis) + '</span>' +
                  '</button>'
              )
              .join('') +
          '</span>'
        : '') +
      '<p class="souhrn-zbytek">' +
        (dlazdiceAkce.length
          ? (hotoveData.length ? 'Vyřízeno: ' : '')
          : '<span class="souhrn-vse-hotovo">Všechno vyřízeno.</span> ') +
        hotoveData
          .map(([popis, pocet]) => '<b>' + pocet + '</b>&nbsp;' + escapeHtml(tvarPodlePoctu(pocet, popis)))
          .join(' · ') +
        (hotoveData.length ? '. ' : '') +
        'Celkem <b>' + bankaPohybySeznam.length + '</b>&nbsp;' +
        tvarPodlePoctu(bankaPohybySeznam.length, ['pohyb', 'pohyby', 'pohybů']) + '.' +
      '</p>';
  }

  // Filtr: žádná zapnutá dlaždice = celý seznam, jinak sjednocení zapnutých.
  const filtrujeSe = bankaFiltr.ceka || bankaFiltr.chybi || bankaFiltr.kontrola;
  const serazene = bankaPohybySeznam
    .filter((p) => {
      if (!filtrujeSe) return true;
      if (bankaFiltr.chybi && p.Stav_parovani === 'Nespárováno') return true;
      if (bankaFiltr.ceka && String(p.Stav_parovani || '').startsWith('Navrženo')) return true;
      if (bankaFiltr.kontrola && p.Stav_parovani === 'Příjem ke kontrole') return true;
      return false;
    })
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
      (filtrujeSe ? 'Nic k doplnění.' : 'Zatím žádné pohyby - nahrajte výpis výše.') +
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
  // v4.34 (Jan: "aby bylo vidět kde chybí vyplnění") - appka u spárovaného
  // pohybu (Doklad_ID vyplněné) ukáže odznak "chybí středisko/předkontace"
  // rovnou ve sbaleném řádku (appka je dopočítá na backendu, viz
  // netlify/functions/banka.js), ať to jde poznat bez rozkliknutí každého
  // pohybu zvlášť - podrobnosti appka pořád zobrazí až po rozkliknutí (viz
  // vytvorDetailBanka).
  const chybiZarazeni = p.Doklad_ID && (!p.Doklad_Stredisko || !p.Doklad_Predkontace);
  hlava.innerHTML =
    '<span class="banka-sipka">▶</span>' +
    // v4.35 (Jan: "na začátek dej přidělené číslo... podobně udělat také
    // bankovní vypisy") - appka bankovnímu pohybu samotnému žádné vlastní
    // evidenční číslo nepřiřazuje (to má jen spárovaný doklad/vydaná
    // faktura, viz lib/evidencniCislo.js) - appka proto ukáže evidenční
    // číslo SPÁROVANÉHO záznamu (appka ho dopočítá na backendu jako
    // `Sparovany_evidencni_cislo`, viz netlify/functions/banka.js).
    // Nespárovaný pohyb (nebo spárovaný doklad, který ještě není schválený
    // a číslo tedy ještě nemá) appka ukáže s pomlčkou.
    '<span class="cislo-evid' + (p.Sparovany_evidencni_cislo ? '' : ' cislo-evid-prazdne') + '">' +
      escapeHtml(p.Sparovany_evidencni_cislo || '–') + '</span>' +
    // (v4.46) Datum má vlastní třídu `banka-datum` - v mobilním režimu ho
    // appka NESCHOVÁVÁ jako dřív, ale přesouvá na druhý řádek karty, a bez
    // třídy by na něj nešlo v CSS sáhnout jinak než přes `nth-child`, což
    // je přesně to, co v úzkých breakpointech tohle datum schovávalo.
    '<span class="banka-datum">' + escapeHtml(p.Datum || '') + '</span>' +
    '<span class="dodavatel">' + escapeHtml(p.Protistrana || p.Typ_pohybu || '') + '</span>' +
    // Stav appka drží v jedné buňce mřížky (appka schválně nepřidává další
    // sloupec jen kvůli odznaku "chybí zařazení") - když se obě appka
    // nevejdou vedle sebe, zalomí se uvnitř téhle buňky na 2 řádky, ne
    // napříč celou mřížkou.
    '<span class="banka-stav-bunka">' +
      bankaStavBadge(p.Stav_parovani) +
      (chybiZarazeni ? '<span class="chip-chybi-zarazeni">chybí zařazení</span>' : '') +
    '</span>' +
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
    // v4.34 (Jan: "pokud bylo přidáno středisko nebo předkontace, tak ji
    // tam uvést, aby bylo vidět kde chybí vyplnění") - appka tu ukáže
    // Středisko a Předkontace kód přiřazeného dokladu (appka je dopočítá na
    // backendu, viz netlify/functions/banka.js) - appka chybějící hodnotu
    // zvýrazní (třída "chybi"), ať je na první pohled vidět, kde ještě
    // zbývá zařazení doplnit, bez nutnosti otvírat doklad zvlášť v záložce
    // Přijaté faktury.
    dokladBox.innerHTML =
      '<strong>Přiřazený doklad:</strong> ' + escapeHtml(propojenyDoklad.Dodavatel || '(bez dodavatele)') +
      ', ' + escapeHtml(String(parsujCastkuZListu(propojenyDoklad.Castka))) + ' ' + escapeHtml(propojenyDoklad.Mena || '') +
      (propojenyDoklad.Zdrojovy_soubor_URL
        ? ' – ' + odkazOtevritSken(propojenyDoklad.Zdrojovy_soubor_URL, propojenyDoklad.Zdrojovy_soubor_ID, 'doklad')
        : '') +
      '<div class="popis">Středisko: ' +
        (p.Doklad_Stredisko
          ? escapeHtml(p.Doklad_Stredisko)
          : '<span class="chybi-vyplneni">chybí vyplnění</span>') +
        ' · Předkontace: ' +
        (p.Doklad_Predkontace
          ? escapeHtml(p.Doklad_Predkontace)
          : '<span class="chybi-vyplneni">chybí vyplnění</span>') +
      '</div>' +
      (propojenyDoklad.Poznamka
        ? '<div class="popis">Poznámka z vytěžení: ' + escapeHtml(propojenyDoklad.Poznamka) + '</div>'
        : '');
  } else if (p.Doklad_ID) {
    dokladBox.innerHTML =
      '<span class="popis">Přiřazený doklad (ID ' + escapeHtml(p.Doklad_ID) + ') appka v seznamu dokladů nenašla.</span>';
  }
  wrap.appendChild(dokladBox);

  // `trida` (volitelný 3. parametr, v4.39) appka přidává jednu ze 4
  // sémantických tříd `akce-potvrdit`/`akce-zamitnout`/`akce-poznamka`/
  // `akce-smazat` (viz public/style.css) - appka tak barevně odlišuje
  // potvrzení/zamítnutí/poznámku/smazání i uvnitř jednoho detailu
  // bankovního pohybu, kde dřív byla všechna tlačítka stejně modrá.
  function tlacitkoBanka(text, onclick, trida) {
    const b = document.createElement('button');
    b.className = 'maly sekundarni' + (trida ? ' ' + trida : '');
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
    akce.appendChild(tlacitkoBanka('Potvrdit shodu', (e) => ulozZmenuBanka({ Stav_parovani: 'Potvrzeno' }, e.target), 'akce-potvrdit'));
    akce.appendChild(
      tlacitkoBanka('Zamítnout návrh', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno', Doklad_ID: '' }, e.target), 'akce-zamitnout')
    );
  } else if (p.Stav_parovani === 'Potvrzeno') {
    akce.appendChild(
      tlacitkoBanka('Zrušit potvrzení', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno', Doklad_ID: '' }, e.target), 'akce-zamitnout')
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
      tlacitkoBanka('Potvrdit trvalý příkaz', (e) => ulozZmenuBanka({ Stav_parovani: 'Trvalý příkaz' }, e.target), 'akce-potvrdit')
    );
    akce.appendChild(
      tlacitkoBanka('Zamítnout návrh', (e) =>
        ulozZmenuBanka(
          // Od v4.24 - appka zamítnutý PŘÍJEM vrací do jeho výchozího
          // NEROZHODNUTÉHO stavu, ne do "Nespárováno" (to appka používá jen
          // pro odchozí platby, viz netlify/functions/banka.js). Od v4.51 je
          // tím stavem "Příjem ke kontrole", ne "Bez dokladu" - zamítnutý
          // návrh znamená "tohle to není", ne "žádný doklad k tomu není", a
          // s "Bez dokladu" by pohyb rovnou zmizel mezi vyřízené.
          jePrijemNavrzeno
            ? { Stav_parovani: 'Příjem ke kontrole', Smlouva_ID: '', Stredisko: '' }
            : { Stav_parovani: 'Nespárováno', Smlouva_ID: '' },
          e.target
        ), 'akce-zamitnout'
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
          // (v4.51) U příjmu zpátky do "Příjem ke kontrole" - viz stejná
          // úvaha u "Zamítnout návrh" výš.
          jePrijemPotvrzeno
            ? { Stav_parovani: 'Příjem ke kontrole', Smlouva_ID: '', Stredisko: '' }
            : { Stav_parovani: 'Nespárováno', Smlouva_ID: '' },
          e.target
        ), 'akce-zamitnout'
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
      // (v4.51) Zpátky do "Příjem ke kontrole", ne do "Bez dokladu".
      tlacitkoBanka('Zrušit přiřazení příjmu', (e) => ulozZmenuBanka({ Stav_parovani: 'Příjem ke kontrole', Stredisko: '' }, e.target), 'akce-zamitnout')
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
        ulozZmenuBanka({ Stav_parovani: 'Spárováno - vydaná faktura' }, e.target), 'akce-potvrdit'
      )
    );
    akce.appendChild(
      // (v4.51) Zamítnutý návrh faktury = "tahle faktura to není", ne "žádná
      // faktura k tomu není" - proto zpátky do "Příjem ke kontrole".
      tlacitkoBanka('Zamítnout návrh', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Příjem ke kontrole', Vydana_faktura_ID: '' }, e.target), 'akce-zamitnout'
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
      // (v4.51) Zpátky do "Příjem ke kontrole" - viz stejná úvaha výš.
      tlacitkoBanka('Zrušit spárování', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Příjem ke kontrole', Vydana_faktura_ID: '' }, e.target), 'akce-zamitnout'
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
      }, 'akce-potvrdit')
    );
    akce.appendChild(
      // (v4.51) Zpátky do "Příjem ke kontrole" - viz stejná úvaha výš.
      tlacitkoBanka('Zamítnout návrh', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Příjem ke kontrole', Smlouva_ID: '', Stredisko: '' }, e.target), 'akce-zamitnout'
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
      // (v4.51) Zpátky do "Příjem ke kontrole" - viz stejná úvaha výš.
      tlacitkoBanka('Zrušit spárování', (e) =>
        ulozZmenuBanka({ Stav_parovani: 'Příjem ke kontrole', Smlouva_ID: '', Stredisko: '' }, e.target), 'akce-zamitnout'
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
      // (v4.51) Daňová platba může být i PŘÍCHOZÍ (vrácený přeplatek DPH od
      // finančního úřadu, viz v4.6.1) - u kladné částky proto zpátky do
      // "Příjem ke kontrole", ne do "Nespárováno". "Nespárováno" je stav
      // výdajové strany, appka na něj pouští párování s Doklady a příchozí
      // platba by se v něm zasekla natrvalo.
      tlacitkoBanka('Zrušit přiřazení k dani', (e) =>
        ulozZmenuBanka(
          {
            Stav_parovani: parsujCastkuZListu(p.Castka) > 0 ? 'Příjem ke kontrole' : 'Nespárováno',
            Typ_dane: '',
          },
          e.target
        ), 'akce-zamitnout'
      )
    );
  } else if (parsujCastkuZListu(p.Castka) > 0) {
    // PŘÍJEM (Příjem ke kontrole / Bez dokladu, kladná částka) - appka od
    // v3.19 nabízí přiřazení na Středisko a firemní účet místo výběru
    // dokladu (u příjmů appka doklady vůbec nepáruje, viz
    // lib/bankHelpers.js).
    //
    // (v4.51) Nejdřív ale nápověda: co by to mohlo být. Viz
    // bankaKandidatiProPrijem - appka ukáže i slabší shody, které backend
    // schválně nenavrhl, a u každé napíše PROČ si to myslí. Přiřazení je
    // pořád na jedno klepnutí Jana, appka nikdy nepotvrzuje sama.
    const kandidati = bankaKandidatiProPrijem(p);
    if (kandidati.tipy.length > 0) {
      const napoveda = document.createElement('div');
      napoveda.className = 'prijem-tipy';
      const nadpis = document.createElement('div');
      nadpis.className = 'prijem-tipy-nadpis';
      nadpis.textContent = kandidati.tipy.length === 1 ? 'Mohlo by to být:' : 'Mohlo by to být některé z:';
      napoveda.appendChild(nadpis);

      kandidati.tipy.forEach((t) => {
        const radek = document.createElement('div');
        radek.className = 'prijem-tip';
        const text = document.createElement('span');
        text.className = 'prijem-tip-text';
        text.textContent = t.popis + (t.duvody.length ? ' — ' + t.duvody.join(', ') : '');
        radek.appendChild(text);
        radek.appendChild(
          tlacitkoBanka(t.druh === 'faktura' ? 'Přiřadit fakturu' : 'Přiřadit smlouvu', (e) => {
            if (t.druh === 'faktura') {
              ulozZmenuBanka({ Vydana_faktura_ID: t.id, Stav_parovani: 'Spárováno - vydaná faktura' }, e.target);
              return;
            }
            // U smlouvy appka od v4.23 vyžaduje Středisko - když ho smlouva
            // má, appka ho převezme; když nemá, tip přiřadit nejde a Jan to
            // musí udělat rozbalovací nabídkou níž, kde si středisko vybere.
            if (!t.stredisko) {
              alert('Tahle smlouva nemá vyplněné středisko - přiřaďte ji prosím nabídkou níž a středisko vyberte ručně.');
              return;
            }
            ulozZmenuBanka({ Smlouva_ID: t.id, Stav_parovani: 'Trvalý příkaz', Stredisko: t.stredisko }, e.target);
          })
        );
        napoveda.appendChild(radek);
      });
      akce.appendChild(napoveda);
    }

    // (v4.51, Jan: "Varovat před dvojí platbou") Platba sedí na fakturu,
    // která je ale už označená jako uhrazená - typicky dvojí platba nebo
    // přeplatek. Appka to jen NAPÍŠE. Tlačítko "přiřadit" tu schválně není:
    // přiřazením by appka sáhla na stav už uzavřené faktury a Jan by se o
    // tom dozvěděl až z účetnictví. Nepřidávat sem akci, ať se z varování
    // nestane další cesta, jak omylem přepsat uhrazenou fakturu.
    if (kandidati.varovani.length > 0) {
      const varovani = document.createElement('div');
      varovani.className = 'prijem-varovani';
      varovani.textContent =
        'Pozor: tahle platba sedí na už uhrazenou fakturu (' +
        kandidati.varovani.map((v) => v.popis).join('; ') +
        '). Může jít o dvojí platbu nebo přeplatek - zkontrolujte to prosím ručně.';
      akce.appendChild(varovani);
    }

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

    // (v4.51) Poslední východisko: Jan prošel faktury i smlouvy a k téhle
    // platbě opravdu nic není (vratka, vklad, přeposlané peníze mezi
    // vlastními účty). Popisek je schválně věta a ne "Označit Bez dokladu" -
    // je to Janovo ROZHODNUTÍ a má být vidět, že ho dělá on, ne appka.
    // Appka sama tenhle stav u příjmů nikdy nenastaví, viz banka.js.
    if (p.Stav_parovani !== 'Bez dokladu') {
      akce.appendChild(
        tlacitkoBanka('Není k tomu faktura ani smlouva', (e) => ulozZmenuBanka({ Stav_parovani: 'Bez dokladu' }, e.target))
      );
    } else {
      // Zpátky do NEROZHODNUTÉHO stavu příjmu - do v4.50 tady bylo
      // "Nespárováno", což je stav výdajové strany (appka na něj pouští
      // párování s Doklady). Nevracet zpátky.
      akce.appendChild(
        tlacitkoBanka(
          'Zrušit „Bez dokladu“',
          (e) => ulozZmenuBanka({ Stav_parovani: 'Příjem ke kontrole' }, e.target),
          'akce-zamitnout'
        )
      );
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
    //
    // (v4.52) - a jako úplně první řadí appka doklady, jejichž platební karta
    // sedí s kartou z popisu pohybu (viz nápověda níž). Čtyřčíslí karty je
    // přesnější vodítko než stav dokladu: "schválených" dokladů je v seznamu
    // většina, kdežto kartou 1234 se platil jen zlomek z nich. Uvnitř každé
    // z obou skupin zůstává původní řazení (schválené první, pak podle data).
    const textPohybuProKartu = String(p.Popis || '') + ' ' + String(p.Protistrana || '');
    // Array.from je tu nutné: ctyrcisliZTextu vrací Set (kvůli deduplikaci),
    // ten nemá ani .length, ani .map - `kartyVPohybu.length` by na Setu tiše
    // vyšlo undefined a nápověda by se nikdy nezobrazila.
    const kartyVPohybu = Array.from(ctyrcisliZTextu(textPohybuProKartu));
    const sediKarta = (d) => (kartyVPohybu.length ? shodaKarty(d.Platebni_karta, textPohybuProKartu) : false);
    const volneDoklady = bankaDokladySeznam
      .filter((d) => !jizPouzite.has(d.ID))
      .filter((d) => String(d.Hrazeno_mimo_ucet || '').trim() !== 'ANO')
      .filter((d) => d.Stav !== 'Zpracovává se')
      .slice()
      .sort((a, b) => {
        const kartaA = sediKarta(a) ? 0 : 1;
        const kartaB = sediKarta(b) ? 0 : 1;
        if (kartaA !== kartaB) return kartaA - kartaB;
        const prioritaA = dokladVyberRazeniPriorita(a.Stav);
        const prioritaB = dokladVyberRazeniPriorita(b.Stav);
        if (prioritaA !== prioritaB) return prioritaA - prioritaB;
        return String(b.Datum_dokladu || '').localeCompare(String(a.Datum_dokladu || ''));
      });
    const dokladyNaKartu = volneDoklady.filter(sediKarta);

    // (v4.52) NÁPOVĚDA PODLE PLATEBNÍ KARTY - Jan: *"používat při návrhu
    // přiřazení plateb"*. Vlastní návrh dělá server (navrhniShodu v
    // lib/bankHelpers.js, karta má váhu +3), tohle je jeho ruční protějšek:
    // když server žádný návrh nedal (třeba nesedla částka kvůli spropitnému
    // nebo kurzu), příslušnost ke kartě zůstává jediné vodítko a appka ho
    // ukáže tady u výběru dokladu, kde se rozhoduje.
    //
    // Appka schválně jen UKAZUJE - nic sama nepřiřadí. Kartou se platí
    // desítky drobných nákupů měsíčně, takže "kartou 1234" vybere klidně
    // deset dokladů; vybrat z nich ten pravý umí jen člověk.
    if (kartyVPohybu.length) {
      const napovedaKarta = document.createElement('div');
      napovedaKarta.className = 'zprava napoveda-karta';
      // Karta se pojmenuje z administrace (Nastavení > Platební karty). Když
      // ji tam Jan ještě nemá, appka nemlčí - napíše aspoň čtyřčíslí a pošle
      // ho kartu založit; jinak by vypadalo, že appka nic nenašla.
      const popisky = kartyVPohybu.map((ctyrcisli) => {
        const karta = bankaKartySeznam.find((k) => String(k.Cislo_karty || '').trim() === ctyrcisli);
        if (!karta) return '**** ' + ctyrcisli + ' (karta není v Nastavení)';
        const detaily = [karta.Popis, karta.Drzitel, karta.Firma !== bankaAktivniFirma ? karta.Firma : '']
          .filter((x) => String(x || '').trim())
          .join(', ');
        return '**** ' + ctyrcisli + (detaily ? ' – ' + detaily : '');
      });
      napovedaKarta.innerHTML =
        '<strong>Placeno kartou:</strong> ' + escapeHtml(popisky.join('; ')) + '. ' +
        (dokladyNaKartu.length
          ? 'Doklady s touhle kartou jsou v nabídce označené 💳 (' + dokladyNaKartu.length + ').'
          : 'Žádný z nabízených dokladů tuhle kartu nemá vyplněnou – doplňte ji v detailu dokladu, ať ji appka příště najde sama.');
      akce.appendChild(napovedaKarta);
    }

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
            (dokladyNaKartu.indexOf(d) !== -1 ? '💳 ' : '') +
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
      akce.appendChild(tlacitkoBanka('Zrušit „Bez dokladu“', (e) => ulozZmenuBanka({ Stav_parovani: 'Nespárováno' }, e.target), 'akce-zamitnout'));
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
    poznamkaDiv.appendChild(tlacitkoBanka('Uložit poznámku', (e) => ulozZmenuBanka({ Poznamka: poznamkaVstup.value.trim() }, e.target), 'akce-poznamka'));
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
      tlacitkoBanka('Smazat pohyb', (e) => smazBankovniPohyb(p, e.target), 'akce-smazat')
    );

    if (p.Import_ID) {
      const pocetVImportu = bankaPohybySeznam.filter((pp) => pp.Import_ID === p.Import_ID).length;
      if (pocetVImportu > 1) {
        const tlSmazatImport = tlacitkoBanka(
          'Smazat celý import (' + pocetVImportu + ' pohybů)',
          (e) => smazImportBankovnichPohybu(p.Import_ID, pocetVImportu, e.target),
          'akce-smazat'
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
      ' příchozích plateb, které čekaly na kontrolu - ' + (vysledek.noveNavrzenoPrijmu || 0) +
      ' appka nově navrhla ke konkrétní vydané faktuře nebo smlouvě.</div>';
    await nactiBankovniPohyby();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  } finally {
    if (tlacitko) tlacitko.disabled = false;
  }
}

// (v4.51) JEDNORÁZOVÝ ÚKLID starých příjmů - Jan (2026-08-03): *"u příjmu v
// bankovních výpisech se platby příjmy samy označí Bez dokladu, ale to je
// potřeba zkontrolovat Vystavené faktury nebo SMlouvy."* Do v4.50 appka po
// neúspěšném hledání sáhla u příjmů rovnou po "Bez dokladu", což jinde v
// appce znamená VYŘÍZENO - a po v4.50 se takové platby schovaly do tlumené
// věty "Vyřízeno: …", takže se na ně nikdo nepodíval. Od v4.51 už appka
// tenhle stav sama nikdy nenastaví (nový stav je "Příjem ke kontrole"), ale
// staré řádky v tabulce zůstávají špatně - tohle tlačítko je přepne.
//
// Jan si vybral konzervativní variantu "Přepnout všechny bez vazby na
// fakturu/smlouvu": backend sáhne jen na příjmy BEZ Vydané faktury, BEZ
// smlouvy a BEZ střediska, tedy na ty, u kterých je jisté, že je nikdo
// nezařadil. Proto se tu nic neptá na rozsah - rozsah je daný.
//
// Tlačítko je schválně jednorázové a s potvrzením: je to hromadný
// jednosměrný zápis do ostrých dat. Nedělat z toho automatiku při načtení
// záložky.
async function prevestPrijmyKeKontrole(tlacitko) {
  const zprava = document.getElementById('banka-import-zprava');
  if (
    !confirm(
      'Appka projde příchozí platby této firmy označené „Bez dokladu“ a ty, které nemají vydanou fakturu, smlouvu ani středisko, přepne na „Příjem ke kontrole“, aby se objevily mezi věcmi, které čekají na vyřízení.\n\nPlateb s vazbou nebo se střediskem se to nedotkne. Odchozích plateb také ne.\n\nSpustit?'
    )
  ) {
    return;
  }
  if (tlacitko) tlacitko.disabled = true;
  zprava.innerHTML = '<div class="zprava">Procházím staré příjmy…</div>';
  try {
    const vysledek = await zavolejApi('/banka', {
      method: 'POST',
      body: JSON.stringify({ firma: bankaAktivniFirma, akce: 'prevestPrijmyKeKontrole' }),
    });
    zprava.innerHTML =
      vysledek.prevedeno > 0
        ? '<div class="zprava uspech">Přepnuto ' +
          vysledek.prevedeno +
          ' příchozích plateb na „Příjem ke kontrole“. Najdete je nahoře v dlaždici „příjmy ke kontrole“.</div>'
        : '<div class="zprava">Není co přepínat - žádná příchozí platba bez vazby na fakturu, smlouvu ani středisko tu není.</div>';
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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
      '<td data-label="RZ"></td>' +
      '<td data-label="Model"></td>' +
      '<td data-label="Firma"></td>' +
      '<td data-label="Řidič"></td>' +
      '<td data-label="Akce"></td>';

    // Od v4.36 jde RZ (dřív "SPZ") editovat i u existujícího auta - appka
    // tenhle údaj (na rozdíl od Firmy.Nazev/Strediska.Nazev) nikde jinde
    // aktivně nepoužívá jako klíč pro spárování (Doklady.SPZ_auta appka
    // nezapisuje od v3.8, viz komentář u moznostiAuta výš), takže tu není
    // riziko "rozjetí vazeb" - jen appka na backendu (auta.js) hlídá, aby
    // nevznikly dvě auta se stejnou RZ.
    const vstupSpz = document.createElement('input');
    vstupSpz.type = 'text';
    vstupSpz.value = a.SPZ || '';
    vstupSpz.style.fontSize = '13px';
    tr.children[0].appendChild(vstupSpz);

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
      SPZ: vstupSpz.value.trim(),
      Model: vstupModel.value.trim(),
      Firma: vyberFirma.value,
      Ridic: vstupRidic.value.trim(),
    }, tlacitkoUlozit);
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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
    zprava.innerHTML = '<div class="zprava chyba">RZ je povinná.</div>';
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

    // Od v4.36 jde Číslo účtu editovat i u existujícího účtu (backend
    // netlify/functions/ucty.js to už PATCH umožňoval, appka jen chyběla
    // ve formuláři) - appka na backendu hlídá duplicitu stejně jako při
    // založení nového účtu.
    const vstupCisloUctu = document.createElement('input');
    vstupCisloUctu.type = 'text';
    vstupCisloUctu.value = u.Cislo_uctu || '';
    vstupCisloUctu.style.fontSize = '13px';
    tr.children[1].appendChild(vstupCisloUctu);

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
      Cislo_uctu: vstupCisloUctu.value.trim(),
      Mena: vstupMena.value.trim(),
      Popis: vstupPopis.value.trim(),
    }, tlacitkoUlozit);
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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

// ---------- ADMIN: ÚČTOVÁ OSNOVA (od v4.52 - viz lib/uctovaOsnovaSchema.js,
// lib/kontaceVychozi.js a netlify/functions/uctova-osnova.js) ----------
// Nákladové účty po firmách, ze kterých se pak vybírá Účet MD u předkontace
// a u dokladu. Zdroj je Janův soubor Kontace.xlsx (2026-08-03).
//
// Výchozí účty appka NENAČÍTÁ sama při /api/setup, ale až na tlačítko - kdyby
// je dosazovala při každém setupu, přepsala by Janovi ruční úpravy a on by
// se to dozvěděl až od účetní. Endpoint proto doplňuje jen chybějící účty a
// vrací, kolik jich přidal a kolik přeskočil.

async function nactiUctovouOsnovu() {
  const nacitani = document.getElementById('uctova-osnova-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const [dataFirmy, data] = await Promise.all([
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/uctova-osnova', { method: 'GET' }),
    ]);
    const nazvyFirem = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    document.getElementById('novy-uo-firma').innerHTML = moznostiFirmySeznam(nazvyFirem, '');
    // Sdílená cache (stejná, ze které čerpá detail dokladu) - ať nabídka
    // účtů u předkontace nemusí volat API podruhé.
    uctovaOsnovaSeznam = data.ucty || [];
    vykresliUctovouOsnovu(uctovaOsnovaSeznam);
    nacitani.classList.add('skryto');
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst účtovou osnovu: ' + e.message;
  }
}

function vykresliUctovouOsnovu(ucty) {
  const telo = document.getElementById('tabulka-uctova-osnova-telo');
  telo.innerHTML = '';

  ucty.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Firma"></td>' +
      '<td data-label="Účet"></td>' +
      '<td data-label="Popis"></td>' +
      '<td data-label="Akce"></td>';

    tr.children[0].textContent = u.Firma || '';
    tr.children[1].textContent = u.Ucet || '';

    const vstupPopis = document.createElement('input');
    vstupPopis.type = 'text';
    vstupPopis.value = u.Popis || '';
    vstupPopis.placeholder = 'popis účtu';
    tr.children[2].appendChild(vstupPopis);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozUcetOsnovy(u._row, { Popis: vstupPopis.value.trim() }, tlacitkoUlozit);
    tr.children[3].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazUcetOsnovy(u._row, (u.Firma || '') + ' / ' + (u.Ucet || ''), tlacitkoSmazat);
    tr.children[3].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  if (ucty.length === 0) {
    telo.innerHTML = '<tr><td colspan="4" class="nacitani">Osnova je zatím prázdná - vyberte firmu a klikněte na „Načíst výchozí účty firmy“.</td></tr>';
  }
}

async function pridatUcetOsnovy() {
  const zprava = document.getElementById('uctova-osnova-zprava');
  zprava.innerHTML = '';

  const firma = document.getElementById('novy-uo-firma').value.trim();
  const ucet = document.getElementById('novy-uo-ucet').value.trim();
  if (!firma || !ucet) {
    zprava.innerHTML = '<div class="zprava chyba">Firma i účet jsou povinné.</div>';
    return;
  }

  try {
    await zavolejApi('/uctova-osnova', {
      method: 'POST',
      body: JSON.stringify({
        Firma: firma,
        Ucet: ucet,
        Popis: document.getElementById('novy-uo-popis').value.trim(),
        Poznamka: document.getElementById('novy-uo-poznamka').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Účet přidán.</div>';
    document.getElementById('novy-uo-ucet').value = '';
    document.getElementById('novy-uo-popis').value = '';
    document.getElementById('novy-uo-poznamka').value = '';
    await nactiUctovouOsnovu();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function nactiVychoziUcty() {
  const zprava = document.getElementById('uctova-osnova-zprava');
  const firma = document.getElementById('novy-uo-firma').value.trim();
  zprava.innerHTML = '';
  if (!firma) {
    zprava.innerHTML = '<div class="zprava chyba">Nejdřív vyberte firmu.</div>';
    return;
  }

  const tlacitko = document.getElementById('tlacitko-vychozi-ucty');
  tlacitko.disabled = true;
  try {
    const vysledek = await zavolejApi('/uctova-osnova', {
      method: 'POST',
      body: JSON.stringify({ akce: 'vychozi', Firma: firma }),
    });
    const pridano = vysledek.pridano || 0;
    const preskoceno = vysledek.preskoceno || 0;
    zprava.innerHTML = '<div class="zprava uspech">Přidáno účtů: ' + pridano
      + (preskoceno ? ', už jste jich měli: ' + preskoceno : '') + '.</div>';
    await nactiUctovouOsnovu();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
  tlacitko.disabled = false;
}

async function ulozUcetOsnovy(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/uctova-osnova', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiUctovouOsnovu();
  } catch (e) {
    alert('Nepodařilo se uložit účet: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazUcetOsnovy(row, popis, tlacitko) {
  // Účet z osnovy zmizí jen jako NABÍDKA - doklady, které ho už mají
  // uložený, si ho nechají (v detailu se ukáže jako "není v osnově firmy").
  if (!confirm('Opravdu smazat účet „' + popis + '“ z osnovy?\n\nDoklady, které ho už mají zapsaný, si ho nechají.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/uctova-osnova?row=' + row, { method: 'DELETE' });
    await nactiUctovouOsnovu();
  } catch (e) {
    alert('Nepodařilo se smazat účet: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- ADMIN: PŘEDKONTACE (od v4.32 - viz lib/predkontaceSchema.js a
// netlify/functions/predkontace.js) - kódy pro Money S3 export <PredKontac>,
// per firma a kategorie dokladu. Appka list zakládá s prázdnými kódy - Jan/
// účetní je doplní tady, jakmile bude vědět, jaké kódy chce použít.
//
// Od v4.52 tu je navíc sloupec Účet MD - nákladový účet, který appka
// předvyplní u dokladu té firmy a kategorie (Janova volba "Podle kategorie,
// jde přepsat"). Kód předkontace a účet MD jsou dvě různé věci a schválně
// zůstávají vedle sebe: kód je řetězec pro Money S3, účet je skutečný účet z
// osnovy. Neslučovat do jednoho pole. ----------

async function nactiPredkontace() {
  const nacitani = document.getElementById('predkontace-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  document.getElementById('nova-pk-kategorie').innerHTML = moznostiKategorie('');

  // Nabídka účtů se řídí vybranou firmou - u NOMIS & Homes nemá smysl
  // nabízet účet, který má v osnově jen NOMIS CZ.
  const vyberFirmyPk = document.getElementById('nova-pk-firma');
  const vyberUctuPk = document.getElementById('nova-pk-ucet');
  vyberUctuPk.innerHTML = moznostiUctuMD(vyberFirmyPk.value.trim(), '');
  vyberFirmyPk.onchange = () => {
    vyberUctuPk.innerHTML = moznostiUctuMD(vyberFirmyPk.value.trim(), '');
  };

  try {
    // Appka si tu firmy načítá ČERSTVĚ vlastním voláním (ne přes sdílené
    // firmyProVyberDokladu, které appka plní jen při otevření záložky
    // Doklady) - kdyby uživatel otevřel Nastavení jako úplně první záložku,
    // sdílené pole by ještě bylo prázdné a výběr firmy by zůstal nabídkou bez možností.
    const [dataFirmy, data] = await Promise.all([
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/predkontace', { method: 'GET' }),
    ]);
    document.getElementById('nova-pk-firma').innerHTML =
      moznostiFirmySeznam((dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean), '');
    // Nabídka firem se právě přepsala, takže i nabídka účtů musí odpovídat
    // tomu, co je teď vybrané (jinak by v ní zůstaly účty předchozí firmy).
    vyberUctuPk.innerHTML = moznostiUctuMD(vyberFirmyPk.value.trim(), '');
    predkontaceSeznam = data.predkontace || [];
    vykresliPredkontace(predkontaceSeznam);
    nacitani.classList.add('skryto');
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst předkontace: ' + e.message;
  }
}

function vykresliPredkontace(predkontace) {
  const telo = document.getElementById('tabulka-predkontace-telo');
  telo.innerHTML = '';

  let bezUctu = 0;

  predkontace.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Firma"></td>' +
      '<td data-label="Kategorie"></td>' +
      '<td data-label="Účet MD"></td>' +
      '<td data-label="Kód"></td>' +
      '<td data-label="Akce"></td>';

    tr.children[0].textContent = p.Firma || '';
    tr.children[1].textContent = p.Kategorie || '';

    const vyberUctu = document.createElement('select');
    vyberUctu.innerHTML = moznostiUctuMD(p.Firma || '', p.Ucet_MD || '');
    tr.children[2].appendChild(vyberUctu);
    if (!String(p.Ucet_MD || '').trim()) {
      bezUctu += 1;
      tr.classList.add('radek-bez-uctu');
    }

    const vstupKod = document.createElement('input');
    vstupKod.type = 'text';
    vstupKod.value = p.Kod || '';
    vstupKod.placeholder = 'kód předkontace';
    tr.children[3].appendChild(vstupKod);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozPredkontaci(
      p._row, { Kod: vstupKod.value.trim(), Ucet_MD: vyberUctu.value.trim() }, tlacitkoUlozit,
    );
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazPredkontaci(p._row, (p.Firma || '') + ' / ' + (p.Kategorie || ''), tlacitkoSmazat);
    tr.children[4].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  // Janova volba byla *"Nechat prázdné a upozornit"* - upozornění je tohle.
  // Appka počítá jen kombinace, které Jan opravdu má založené; nevypisuje
  // kartézský součin všech firem × 16 kategorií, protože většinu z nich
  // nikdy nepoužije a seznam by byl k nepřečtení.
  const shrnuti = document.getElementById('predkontace-chybejici');
  if (shrnuti) {
    shrnuti.innerHTML = bezUctu
      ? '<div class="zprava varovani">Bez nastaveného účtu MD: ' + bezUctu
        + ' z ' + predkontace.length + '. Doklady těchhle kombinací zůstanou bez účtu.</div>'
      : '';
  }

  if (predkontace.length === 0) {
    telo.innerHTML = '<tr><td colspan="5" class="nacitani">Zatím žádné předkontace - appka u dokladů nepředvyplní účet a do Money S3 exportu posílá prázdný &lt;PredKontac&gt;.</td></tr>';
  }
}

async function pridatPredkontaci() {
  const zprava = document.getElementById('predkontace-zprava');
  zprava.innerHTML = '';

  const firma = document.getElementById('nova-pk-firma').value.trim();
  const kategorie = document.getElementById('nova-pk-kategorie').value.trim();
  const kod = document.getElementById('nova-pk-kod').value.trim();
  if (!firma || !kategorie) {
    zprava.innerHTML = '<div class="zprava chyba">Firma i kategorie jsou povinné.</div>';
    return;
  }

  try {
    await zavolejApi('/predkontace', {
      method: 'POST',
      body: JSON.stringify({
        Firma: firma,
        Kategorie: kategorie,
        Kod: kod,
        Ucet_MD: document.getElementById('nova-pk-ucet').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Předkontace přidána.</div>';
    document.getElementById('nova-pk-kod').value = '';
    await nactiPredkontace();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozPredkontaci(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/predkontace', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiPredkontace();
  } catch (e) {
    alert('Nepodařilo se uložit předkontaci: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazPredkontaci(row, popis, tlacitko) {
  if (!confirm('Opravdu smazat předkontaci „' + popis + '“?')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/predkontace?row=' + row, { method: 'DELETE' });
    await nactiPredkontace();
  } catch (e) {
    alert('Nepodařilo se smazat předkontaci: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- ADMIN: PLATEBNÍ KARTY (od v4.52 - viz lib/platebniKartySchema.js
// a netlify/functions/platebni-karty.js) ----------
// Jan (2026-08-03): *"je důležité zavést při vytěžování registraci platebních
// karet a ty vést v databázi administrace, používat při návrhu přiřazení
// plateb"*. Appka kartu, kterou potká na dokladu poprvé, založí sama se
// stavem "Doplnit" (Janova volba *"Založit ji sama, ať ji jen doplním"*) -
// tenhle panel je to místo, kde se u ní doplní držitel a účet.
//
// Jan si u karty přál vést firmu s bankovním účtem a držitele. SPZ auta ani
// středisko schválně NE - appka mu je nabízela a nevybral je. Nedoplňovat
// zpětně bez toho, že si o ně řekne.
//
// A ještě jednou, protože je to důležité: appka o kartě drží JEN POSLEDNÍ
// ČTYŘI ČÍSLICE. Žádné pole tady celé číslo karty nepřijímá.

async function nactiPlatebniKarty() {
  const nacitani = document.getElementById('karty-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const [dataFirmy, dataUcty, dataUzivatele, data] = await Promise.all([
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/ucty', { method: 'GET' }).catch(() => ({ ucty: [] })),
      zavolejApi('/uzivatele', { method: 'GET' }).catch(() => ({ uzivatele: [] })),
      zavolejApi('/platebni-karty', { method: 'GET' }),
    ]);

    const nazvyFirem = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    const vyberFirmy = document.getElementById('nova-karta-firma');
    const vyberUctu = document.getElementById('nova-karta-ucet');
    vyberFirmy.innerHTML = moznostiFirmySeznam(nazvyFirem, '');

    // Bankovní účty se filtrují podle vybrané firmy - karta patří k účtu té
    // firmy, na jejímž výpisu se platba objeví.
    const vsechnyUcty = dataUcty.ucty || [];
    function prekresliUctyKarty() {
      const firma = vyberFirmy.value.trim();
      const naFirmu = vsechnyUcty.filter((u) => String(u.Firma || '').trim() === firma);
      let html = '<option value="">— nevybráno —</option>';
      naFirmu.forEach((u) => {
        const cislo = String(u.Cislo_uctu || '').trim();
        if (!cislo) return;
        const popis = String(u.Popis || '').trim();
        html += '<option value="' + escapeAttr(cislo) + '">'
          + escapeHtml(cislo + (popis ? ' - ' + popis : '')) + '</option>';
      });
      vyberUctu.innerHTML = html;
    }
    vyberFirmy.onchange = prekresliUctyKarty;
    prekresliUctyKarty();

    // Držitel se nabízí ze seznamu uživatelů appky, ale jde napsat i cokoli
    // jiného - proto <datalist> a ne <select> (kartu může nosit i někdo, kdo
    // v appce účet nemá). /uzivatele smí načíst jen admin, účetní dostane
    // 403 - proto je to v .catch() a nabídka jí zůstane prázdná, pole ale
    // funguje dál jako obyčejný text.
    const seznamDrzitelu = document.getElementById('seznam-drzitelu');
    seznamDrzitelu.innerHTML = (dataUzivatele.uzivatele || [])
      .map((u) => u.Jmeno)
      .filter(Boolean)
      .map((j) => '<option value="' + escapeAttr(j) + '"></option>')
      .join('');

    vykresliPlatebniKarty(data.karty || [], nazvyFirem, vsechnyUcty);
    nacitani.classList.add('skryto');
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst platební karty: ' + e.message;
  }
}

function vykresliPlatebniKarty(karty, nazvyFirem, vsechnyUcty) {
  const telo = document.getElementById('tabulka-karty-telo');
  telo.innerHTML = '';

  karty.forEach((k) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Karta"></td>' +
      '<td data-label="Firma"></td>' +
      '<td data-label="Držitel"></td>' +
      '<td data-label="Stav"></td>' +
      '<td data-label="Akce"></td>';

    // Maska **** je jen zobrazení - uloženy jsou opravdu jen ty čtyři
    // číslice, appka žádné další nezná.
    const popisek = document.createElement('div');
    popisek.textContent = '**** ' + (k.Cislo_karty || '????');
    popisek.style.fontWeight = '600';
    tr.children[0].appendChild(popisek);
    if (k.Popis) {
      const podpopis = document.createElement('div');
      podpopis.className = 'popis';
      podpopis.textContent = k.Popis;
      tr.children[0].appendChild(podpopis);
    }

    tr.children[1].textContent = k.Firma || '';
    if (k.Ucet) {
      const ucetDiv = document.createElement('div');
      ucetDiv.className = 'popis';
      ucetDiv.textContent = k.Ucet;
      tr.children[1].appendChild(ucetDiv);
    }

    const vstupDrzitel = document.createElement('input');
    vstupDrzitel.type = 'text';
    vstupDrzitel.value = k.Drzitel || '';
    vstupDrzitel.setAttribute('list', 'seznam-drzitelu');
    vstupDrzitel.placeholder = 'kdo kartu nosí';
    tr.children[2].appendChild(vstupDrzitel);

    const vyberUctuRadku = document.createElement('select');
    const naFirmu = (vsechnyUcty || []).filter(
      (u) => String(u.Firma || '').trim() === String(k.Firma || '').trim(),
    );
    let htmlUctu = '<option value="">— účet nevybrán —</option>';
    naFirmu.forEach((u) => {
      const cislo = String(u.Cislo_uctu || '').trim();
      if (!cislo) return;
      const oznaceno = cislo === String(k.Ucet || '').trim() ? ' selected' : '';
      htmlUctu += '<option value="' + escapeAttr(cislo) + '"' + oznaceno + '>' + escapeHtml(cislo) + '</option>';
    });
    if (k.Ucet && !naFirmu.some((u) => String(u.Cislo_uctu || '').trim() === String(k.Ucet).trim())) {
      htmlUctu += '<option value="' + escapeAttr(k.Ucet) + '" selected>' + escapeHtml(k.Ucet) + ' (není v Účtech)</option>';
    }
    vyberUctuRadku.innerHTML = htmlUctu;
    vyberUctuRadku.style.marginTop = '4px';
    tr.children[2].appendChild(vyberUctuRadku);

    // Stav "Doplnit" znamená jen "chybí u ní držitel/účet" - na párování se
    // taková karta používá úplně stejně jako aktivní.
    const stavKarty = String(k.Stav || '').trim();
    const badge = document.createElement('span');
    badge.className = stavKarty === 'Doplnit' ? 'badge-chybi' : 'badge-ok';
    badge.textContent = stavKarty || 'Aktivní';
    if (stavKarty === 'Doplnit') {
      badge.title = 'Kartu si appka založila sama při vytěžování dokladu - doplňte držitele a účet.';
    }
    tr.children[3].appendChild(badge);

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => {
      const zmeny = {
        Drzitel: vstupDrzitel.value.trim(),
        Ucet: vyberUctuRadku.value.trim(),
      };
      // Doplněním držitele karta automaticky přestává být "Doplnit" - jinak
      // by u ní stav "Doplnit" zůstal viset navždycky a přestal by cokoli
      // znamenat.
      if (stavKarty === 'Doplnit' && zmeny.Drzitel) zmeny.Stav = 'Aktivní';
      ulozPlatebniKartu(k._row, zmeny, tlacitkoUlozit);
    };
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazPlatebniKartu(
      k._row, '**** ' + (k.Cislo_karty || '') + ' (' + (k.Firma || '') + ')', tlacitkoSmazat,
    );
    tr.children[4].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  if (karty.length === 0) {
    telo.innerHTML = '<tr><td colspan="5" class="nacitani">Zatím žádné karty - appka si je založí sama, jakmile nějakou najde na dokladu.</td></tr>';
  }
}

async function pridatPlatebniKartu() {
  const zprava = document.getElementById('karty-zprava');
  zprava.innerHTML = '';

  const cislo = posledniCtyriZTextu(document.getElementById('nova-karta-cislo').value);
  const firma = document.getElementById('nova-karta-firma').value.trim();
  if (!cislo) {
    zprava.innerHTML = '<div class="zprava chyba">Zadejte poslední čtyři číslice karty.</div>';
    return;
  }
  if (!firma) {
    zprava.innerHTML = '<div class="zprava chyba">Vyberte firmu.</div>';
    return;
  }

  try {
    await zavolejApi('/platebni-karty', {
      method: 'POST',
      body: JSON.stringify({
        Cislo_karty: cislo,
        Firma: firma,
        Ucet: document.getElementById('nova-karta-ucet').value.trim(),
        Drzitel: document.getElementById('nova-karta-drzitel').value.trim(),
        Popis: document.getElementById('nova-karta-popis').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Karta přidána.</div>';
    document.getElementById('nova-karta-cislo').value = '';
    document.getElementById('nova-karta-drzitel').value = '';
    document.getElementById('nova-karta-popis').value = '';
    await nactiPlatebniKarty();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozPlatebniKartu(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/platebni-karty', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiPlatebniKarty();
  } catch (e) {
    alert('Nepodařilo se uložit kartu: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazPlatebniKartu(row, popis, tlacitko) {
  // Doklady si čtyřčíslí drží u sebe, takže smazání karty jim nic nesebere -
  // jen se přestane nabízet v administraci a appka ji při dalším vytěžení
  // dokladu se stejnou kartou založí znovu.
  if (!confirm('Opravdu smazat kartu ' + popis + '?')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/platebni-karty?row=' + row, { method: 'DELETE' });
    await nactiPlatebniKarty();
  } catch (e) {
    alert('Nepodařilo se smazat kartu: ' + e.message);
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

// (v4.54) Jan: "není nikde filtr, podle kterého bych řadil data, podle
// částky, datumu, čísla, středisek apod." Filtr appka drží v PROMĚNNÉ, ne
// v atributech v DOM - stejný vzor jako `bankaFiltr`/`vfFiltr` (v4.50).
// Filtr se schválně NEUKLÁDÁ na server ani do prohlížeče: je to pohled na
// seznam, ne vlastnost dat. Po přenačtení stránky je seznam zase celý, aby
// se nikdo nedíval na profiltrovaný registr a nemyslel si, že mu chybí
// smlouvy.
let smlouvyFiltr = { hledat: '', firma: '', stredisko: '', typ: '' };

// Řazení je taky jen POHLED (Janova volba 2026-08-06: *"Řazení jen dočasně,
// pořadí se nepřepíše"*). Prázdný řetězec = vlastní ruční pořadí `Poradi`,
// které si Jan skládá přetahováním. Cokoli jiného seznam jen jinak vykreslí
// a **do listu Smlouvy se nezapíše nic** - viz `smlouvyLzePretahovat()`.
// **Nepředělávat na "seřaď a ulož"** - ruční pořadí je Janova práce, kterou
// by jedno kliknutí na roletku nenávratně smazalo.
let smlouvyRazeni = '';

// Sbalené skupiny (klíč = název střediska). Appka je drží mezi překreslením
// seznamu, ať se po uložení jedné smlouvy zase nerozbalí všechno.
const smlouvySkupinySbalene = new Set();

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

// (v4.54) Hledání ignoruje diakritiku i velikost písmen - "cez" najde
// "ČEZ". Stejný princip jako bankaNormalizujNazev, jen tady appka NEcpe
// všechno na mezery: v čísle smlouvy ("SML-2026-001") jsou pomlčky nosné.
function smlouvyNormalizuj(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Appka hledá jen ve třech polích - Název, Druhá strana a Číslo smlouvy.
// Schválně NE v poznámce: ta bývá dlouhá a hledání by pak vracelo smlouvy,
// u kterých není vidět proč se našly.
function smlouvaOdpovidaHledani(s, hledane) {
  if (!hledane) return true;
  const kde = smlouvyNormalizuj([s.Nazev, s.Druha_strana, s.Cislo_smlouvy].filter(Boolean).join(' '));
  return kde.includes(hledane);
}

function smlouvyFiltrJeAktivni() {
  return Boolean(smlouvyFiltr.hledat || smlouvyFiltr.firma || smlouvyFiltr.stredisko || smlouvyFiltr.typ);
}

// Přetahování appka pustí JEN u nefiltrovaného seznamu ve vlastním pořadí a
// jen když jsou všechny skupiny rozbalené.
// Důvod není kosmetický: ulozNovePoradiSmluv() čte pořadí řádků z DOM a
// přiděluje indexy 0..n - kdyby část smluv byla odfiltrovaná (nebo seřazená
// podle částky, nebo schovaná ve sbalené skupině), appka by tímhle přepsala
// Poradi celého registru podle něčeho, co Jan nikdy neskládal.
// **Tuhle podmínku neoslabovat.**
function smlouvyLzePretahovat() {
  return smlouvyRazeni === '' && !smlouvyFiltrJeAktivni() && smlouvySkupinySbalene.size === 0;
}

// Proč zrovna teď přetahování nejde. Appka to musí umět říct větou, jinak
// vypnuté táhlo vypadá jako rozbitá appka.
function smlouvyProcNelzePretahovat() {
  if (smlouvyRazeni) return 'Řazení je jen dočasný pohled – vaše pořadí zůstává uložené, přetahování je zatím vypnuté.';
  if (smlouvyFiltrJeAktivni()) return 'Při zapnutém filtru appka přetahování vypíná, aby nepřepsala vaše pořadí.';
  if (smlouvySkupinySbalene.size > 0) return 'Rozbalte všechny skupiny, ať jde zase přetahovat – ze sbalené skupiny appka nevidí, kam smlouvy patří.';
  return '';
}

function smlouvyPorovnejVlastniPoradi(a, b) {
  // v4.14: appka řadí podle vlastního (přetažením měnitelného) pořadí
  // Poradi místo dřívějšího abecedního řazení podle Názvu - smlouvy bez
  // Poradi (mělo by appku dohnat /api/setup, viz setup.js) appka defenzivně
  // zařadí až za všechny s vyplněným pořadím, ať appka nespadne na NaN.
  //
  // (v4.54, oprava) Prázdné pole se muselo odchytit ZVLÁŠŤ: `Number('')` je
  // nula, ne NaN, takže smlouva bez vyplněného Poradi se dřív protlačila na
  // úplný začátek seznamu - přesně naopak, než tenhle komentář sliboval.
  // Projevilo se to až u smluv založených mimo appku (import, ruční řádek
  // v listu), kde Poradi zůstalo prázdné.
  const pa = smlouvyCisloNeboNaN(a.Poradi);
  const pb = smlouvyCisloNeboNaN(b.Poradi);
  const cislaA = Number.isFinite(pa) ? pa : Number.MAX_SAFE_INTEGER;
  const cislaB = Number.isFinite(pb) ? pb : Number.MAX_SAFE_INTEGER;
  if (cislaA !== cislaB) return cislaA - cislaB;
  return (a.Nazev || '').localeCompare(b.Nazev || '', 'cs');
}

// Řazení podle částky je záměrně JEN v rámci jedné měny. `Ocekavana_castka`
// má vedle sebe `Mena` a appka smlouvy v CZK a v EUR nikdy neporovnává
// jedním číslem - "12000 Kč měsíčně" a "400 € ročně" nejsou srovnatelné
// údaje a appka si je nedopočítává (stejné pravidlo jako na Dashboardu,
// kde se na CZK účtu nesmí objevit EUR). Smlouvy s jinou měnou než ta
// nejčastější proto appka nechá seřazené mezi sebou, až za nimi.
function smlouvyPorovnejCastku(a, b) {
  // Stejná past jako u Poradi: `Number('')` je nula, ne NaN. Prázdnou částku
  // proto appka odchytí zvlášť - jinak by se smlouva bez částky tvářila jako
  // "0" a při sestupném řazení by předběhla případný záporný údaj.
  const ca = smlouvyCisloNeboNaN(a.Ocekavana_castka);
  const cb = smlouvyCisloNeboNaN(b.Ocekavana_castka);
  const ma = String(a.Mena || 'CZK');
  const mb = String(b.Mena || 'CZK');
  if (ma !== mb) return ma.localeCompare(mb);
  if (!Number.isFinite(ca) && !Number.isFinite(cb)) return 0;
  if (!Number.isFinite(ca)) return 1;   // bez částky vždycky dolů
  if (!Number.isFinite(cb)) return -1;
  return cb - ca;
}

// Prázdný řetězec NENÍ nula. Appka to potřebuje na dvou místech (Poradi,
// Ocekavana_castka), tak si to drží na jednom.
function smlouvyCisloNeboNaN(hodnota) {
  const text = String(hodnota === undefined || hodnota === null ? '' : hodnota).trim().replace(',', '.');
  if (text === '') return NaN;
  return Number(text);
}

// Prázdné datum patří vždycky na konec, ať se řadí vzestupně nebo ne -
// smlouva bez konce platnosti není "nejstarší", je to smlouva bez údaje.
function smlouvyPorovnejDatum(a, b, pole) {
  const da = String(a[pole] || '');
  const db = String(b[pole] || '');
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.localeCompare(db);
}

// Text (číslo smlouvy, název). Dvě věci, které holé `localeCompare` neumí:
// 1) Prázdná hodnota patří DOLŮ. Prázdný řetězec se jinak řadí jako první
//    znak abecedy, takže smlouvy bez vyplněného čísla by při "Podle čísla
//    smlouvy" obsadily celý začátek seznamu.
// 2) `numeric: true`. Bez toho je "SML-2026-10" PŘED "SML-2026-2", protože
//    znak "1" je menší než "2". U dvouciferných čísel smluv je to hned vidět.
function smlouvyPorovnejText(a, b, pole) {
  const ta = String(a[pole] || '').trim();
  const tb = String(b[pole] || '').trim();
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta.localeCompare(tb, 'cs', { numeric: true, sensitivity: 'base' });
}

function smlouvyPorovnej(a, b) {
  if (smlouvyRazeni === 'castka') return smlouvyPorovnejCastku(a, b);
  if (smlouvyRazeni === 'platnost_do') return smlouvyPorovnejDatum(a, b, 'Platnost_do');
  if (smlouvyRazeni === 'platnost_od') return smlouvyPorovnejDatum(a, b, 'Platnost_od');
  if (smlouvyRazeni === 'cislo') return smlouvyPorovnejText(a, b, 'Cislo_smlouvy');
  if (smlouvyRazeni === 'nazev') return smlouvyPorovnejText(a, b, 'Nazev');
  return smlouvyPorovnejVlastniPoradi(a, b);
}

const SMLOUVY_BEZ_STREDISKA = '(bez střediska)';

// Janova volba 2026-08-06: *"Podle střediska"*. U jedné nemovitosti chce
// vidět nájem, elektřinu i leasing pohromadě - středisko je od v4.23
// jediné pole pro kategorizaci (viz lib/smlouvySchema.js, zrušené
// Nemovitost_ID). Skupiny appka řadí abecedně, "(bez střediska)" vždy
// naposled - je to hromádka k dodělání, ne plnohodnotná skupina.
function seskupSmlouvyPodleStrediska(smlouvy) {
  const mapa = new Map();
  smlouvy.forEach((s) => {
    const klic = String(s.Stredisko || '').trim() || SMLOUVY_BEZ_STREDISKA;
    if (!mapa.has(klic)) mapa.set(klic, []);
    mapa.get(klic).push(s);
  });
  return Array.from(mapa.entries())
    .map(([nazev, polozky]) => ({ nazev, polozky: polozky.slice().sort(smlouvyPorovnej) }))
    .sort((a, b) => {
      if (a.nazev === SMLOUVY_BEZ_STREDISKA) return 1;
      if (b.nazev === SMLOUVY_BEZ_STREDISKA) return -1;
      return a.nazev.localeCompare(b.nazev, 'cs');
    });
}

function filtrujSmlouvy(smlouvy) {
  const hledane = smlouvyNormalizuj(smlouvyFiltr.hledat);
  return smlouvy.filter((s) => {
    if (smlouvySekce === 'neaktivni' ? !jeSmlouvaNeaktivni(s) : jeSmlouvaNeaktivni(s)) return false;
    if (smlouvyFiltr.firma && s.Firma !== smlouvyFiltr.firma) return false;
    if (smlouvyFiltr.stredisko && (String(s.Stredisko || '').trim() || SMLOUVY_BEZ_STREDISKA) !== smlouvyFiltr.stredisko) return false;
    if (smlouvyFiltr.typ && s.Typ !== smlouvyFiltr.typ) return false;
    return smlouvaOdpovidaHledani(s, hledane);
  });
}

// Překreslení po sáhnutí na filtr. Appka schválně NEJDE na server: v
// `smlouvySeznamAktualni` má všechny smlouvy, filtr je jen pohled na ně.
// Kdyby to volalo `nactiSmlouvy()`, každé písmeno v hledacím poli by
// znamenalo dotaz do Google Sheets.
function prekresliSmlouvyPoFiltru() {
  vykresliSmlouvy(smlouvySeznamAktualni, prilohySeznamAktualni);
}

function vykresliSmlouvy(smlouvy, prilohy) {
  smlouvySeznamAktualni = smlouvy;
  prilohySeznamAktualni = prilohy;
  const kontejner = document.getElementById('smlouvy-seznam');

  const neaktivniPocet = smlouvy.filter(jeSmlouvaNeaktivni).length;
  document.getElementById('sm-sekce-aktivni').textContent = 'Aktivní (' + (smlouvy.length - neaktivniPocet) + ')';
  document.getElementById('sm-sekce-neaktivni').textContent = 'Neaktivní (' + neaktivniPocet + ')';

  naplnFiltrySmluv(smlouvy);
  const vSekci = smlouvy.filter((s) => (smlouvySekce === 'neaktivni' ? jeSmlouvaNeaktivni(s) : !jeSmlouvaNeaktivni(s)));
  const filtrovane = filtrujSmlouvy(smlouvy);
  vykresliStitkyFiltruSmluv(filtrovane.length, vSekci.length);

  kontejner.innerHTML = '';
  if (filtrovane.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">' +
      (smlouvyFiltrJeAktivni()
        ? 'Žádná smlouva neodpovídá filtru. Zrušte ho odznakem výš.'
        : (smlouvySekce === 'neaktivni' ? 'Žádné neaktivní smlouvy.' : 'Zatím žádné aktivní smlouvy.')) +
      '</div>';
    return;
  }

  // Skupiny appka vykresluje i když je jediná - jinak by seznam po zapnutí
  // filtru na jedno středisko ztratil hlavičku a nebylo by poznat, čí
  // smlouvy to jsou.
  seskupSmlouvyPodleStrediska(filtrovane).forEach((skupina) => {
    const sbalena = smlouvySkupinySbalene.has(skupina.nazev);

    const hlavicka = document.createElement('div');
    hlavicka.className = 'smlouvy-skupina' + (sbalena ? ' sbalena' : '');
    hlavicka.innerHTML = '<span class="smlouvy-skupina-sipka">▶</span>' +
      '<span class="smlouvy-skupina-nazev">' + escapeHtml(skupina.nazev) + '</span>' +
      '<span class="smlouvy-skupina-pocet">' + skupina.polozky.length + '&nbsp;' +
      tvarPodlePoctu(skupina.polozky.length, ['smlouva', 'smlouvy', 'smluv']) + '</span>';
    hlavicka.onclick = () => {
      if (smlouvySkupinySbalene.has(skupina.nazev)) smlouvySkupinySbalene.delete(skupina.nazev);
      else smlouvySkupinySbalene.add(skupina.nazev);
      vykresliSmlouvy(smlouvySeznamAktualni, prilohySeznamAktualni);
    };
    kontejner.appendChild(hlavicka);

    if (sbalena) return;
    skupina.polozky.forEach((s) => {
      const prilohyTeto = prilohy.filter((p) => p.Smlouva_ID === s.ID);
      kontejner.appendChild(vytvorRadekSmlouva(s, prilohyTeto));
    });
  });
}

// Roletky appka plní z toho, co je ve smlouvách SKUTEČNĚ obsazené (ne z
// celého číselníku středisek) - nabízet filtr na středisko, ve kterém není
// ani jedna smlouva, znamená jen prázdný seznam a zmatek. Vybranou hodnotu
// appka nechá v nabídce i kdyby zmizela, ať filtr nespadne sám od sebe.
function naplnFiltrySmluv(smlouvy) {
  const firmy = Array.from(new Set(smlouvy.map((s) => s.Firma).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'cs'));
  const strediska = Array.from(new Set(smlouvy.map((s) => String(s.Stredisko || '').trim() || SMLOUVY_BEZ_STREDISKA)))
    .sort((a, b) => {
      if (a === SMLOUVY_BEZ_STREDISKA) return 1;
      if (b === SMLOUVY_BEZ_STREDISKA) return -1;
      return a.localeCompare(b, 'cs');
    });
  const typy = Array.from(new Set(smlouvy.map((s) => s.Typ).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'cs'));

  naplnJednuRoletkuFiltru('sm-filtr-firma', 'Všechny firmy', firmy, smlouvyFiltr.firma);
  naplnJednuRoletkuFiltru('sm-filtr-stredisko', 'Všechna střediska', strediska, smlouvyFiltr.stredisko);
  naplnJednuRoletkuFiltru('sm-filtr-typ', 'Všechny typy', typy, smlouvyFiltr.typ);
}

function naplnJednuRoletkuFiltru(id, popisVse, hodnoty, vybrano) {
  const prvek = document.getElementById(id);
  if (!prvek) return;
  const seznam = vybrano && !hodnoty.includes(vybrano) ? hodnoty.concat([vybrano]) : hodnoty;
  const novy = '<option value="">' + escapeHtml(popisVse) + '</option>' +
    seznam.map((h) => '<option value="' + escapeAttr(h) + '"' + (h === vybrano ? ' selected' : '') + '>' + escapeHtml(h) + '</option>').join('');
  if (prvek.innerHTML !== novy) prvek.innerHTML = novy;
}

// Zapnutý filtr musí být VIDĚT. Bez toho se člověk za měsíc dívá na
// zkrácený registr a myslí si, že mu appka smlouvy ztratila.
function vykresliStitkyFiltruSmluv(zobrazeno, celkem) {
  const kam = document.getElementById('sm-filtr-stitky');
  if (!kam) return;
  kam.innerHTML = '';

  const stitky = [];
  if (smlouvyFiltr.hledat) stitky.push({ klic: 'hledat', text: '„' + smlouvyFiltr.hledat + '“' });
  if (smlouvyFiltr.firma) stitky.push({ klic: 'firma', text: smlouvyFiltr.firma });
  if (smlouvyFiltr.stredisko) stitky.push({ klic: 'stredisko', text: smlouvyFiltr.stredisko });
  if (smlouvyFiltr.typ) stitky.push({ klic: 'typ', text: smlouvyFiltr.typ });

  stitky.forEach((s) => {
    const stitek = document.createElement('button');
    stitek.type = 'button';
    stitek.className = 'filtr-stitek';
    stitek.innerHTML = escapeHtml(s.text) + '<span aria-hidden="true">×</span>';
    stitek.title = 'Zrušit tuhle část filtru';
    stitek.onclick = () => {
      smlouvyFiltr[s.klic] = '';
      if (s.klic === 'hledat') document.getElementById('sm-filtr-hledat').value = '';
      vykresliSmlouvy(smlouvySeznamAktualni, prilohySeznamAktualni);
    };
    kam.appendChild(stitek);
  });

  if (stitky.length > 0) {
    const pocet = document.createElement('span');
    pocet.className = 'filtr-pocet popis';
    pocet.textContent = 'Zobrazeno ' + zobrazeno + ' z ' + celkem + '.';
    kam.appendChild(pocet);
  }

  // Když appka přetahování vypne, musí říct proč - jinak to vypadá jako
  // rozbité táhlo.
  if (!smlouvyLzePretahovat()) {
    const napoveda = document.createElement('span');
    napoveda.className = 'filtr-pocet popis';
    napoveda.textContent = smlouvyProcNelzePretahovat();
    kam.appendChild(napoveda);
  }
}

// Skládací řádek Smlouvy - stejný vzor jako vytvorRadekDoklad výš.
function vytvorRadekSmlouva(s, prilohyTeto) {
  const radek = document.createElement('div');
  radek.className = 'smlouva-radek radek-' + stavTridaSmlouva(s);
  radek.dataset.smlouvaId = s.ID;
  // (v4.54) Do jaké skupiny (střediska) řádek patří. Appka to potřebuje při
  // přetahování: přes hranici skupiny se táhnout nedá, protože přesun mezi
  // středisky by znamenal ZMĚNU pole Stredisko, a to appka sama neudělá -
  // řádek by se při dalším překreslení stejně vrátil zpátky do své skupiny.
  radek.dataset.skupina = String(s.Stredisko || '').trim() || SMLOUVY_BEZ_STREDISKA;

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
  // (v4.54) Když je zapnutý filtr nebo řazení, appka tahadlo VYKRESLÍ, ale
  // nepřetahovatelné a s vysvětlením v title - schované tahadlo by vypadalo,
  // že appka o funkci přišla, a řádky by navíc poskočily o pár pixelů.
  const lzePretahovat = smlouvyLzePretahovat();
  hlava.innerHTML =
    '<span class="smlouva-poradi-sipka">' +
      '<span class="smlouva-tahadlo' + (lzePretahovat ? '' : ' vypnute') + '"' +
        (lzePretahovat ? ' draggable="true"' : '') +
        ' title="' + escapeAttr(lzePretahovat ? 'Přetáhněte pro změnu pořadí' : smlouvyProcNelzePretahovat()) + '">⠿</span>' +
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

  radek.appendChild(hlava);
  radek.appendChild(detail);

  // v4.14 - drag & drop přesun pořadí. Appka tažení váže jen na samotné
  // tahadlo (ne na celý řádek), ať se nebije s klikáním na řádek (rozbalení)
  // ani s tlačítky uvnitř rozbaleného detailu.
  const tahadlo = hlava.querySelector('.smlouva-tahadlo');
  tahadlo.addEventListener('click', (e) => e.stopPropagation());
  // (v4.54) Vypnuté tahadlo appka dál nedrátuje. Bez tohohle `return` by
  // ulozNovePoradiSmluv() přečetlo profiltrovaný (nebo podle částky seřazený)
  // DOM a zapsalo ho jako Janovo ruční pořadí.
  if (!lzePretahovat) return radek;
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
    // (v4.54) Přes hranici skupiny ne - viz radek.dataset.skupina výš.
    if (tazenyRadek.dataset.skupina !== radek.dataset.skupina) return;
    const obdelnik = radek.getBoundingClientRect();
    const zaPolovinou = e.clientY - obdelnik.top > obdelnik.height / 2;
    kontejner.insertBefore(tazenyRadek, zaPolovinou ? radek.nextSibling : radek);
  });
  radek.addEventListener('drop', (e) => {
    e.preventDefault();
    ulozNovePoradiSmluv();
  });

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
    // v4.40: i příloha smlouvy jde přes proxy appky, ne přímo na Drive -
    // jinak by ji otevřel jen Jan, viz otevriSken()/soubor.js. Tenhle odkaz
    // není chip (je to prostý název souboru v seznamu), takže handler appka
    // věší přímo na element místo přes odkazOtevritSken().
    if (p.Zdrojovy_soubor_ID) {
      odkaz.onclick = (e) => {
        e.preventDefault();
        otevriSken(odkaz, p.Zdrojovy_soubor_ID, 'priloha');
      };
    } else if (!stav || stav.role !== 'admin') {
      // (v4.43) Bez ID souboru by odkaz vedl rovnou na Google a kolega by
      // skončil na "Potřebujete přístup" - viz odkazOtevritSken().
      odkaz.removeAttribute('href');
      odkaz.className = 'odkaz-sken-nedostupny';
      odkaz.title = 'U téhle přílohy je jen ručně vložený odkaz na Google Disk, ne soubor nahraný přes appku. Požádejte prosím Jana, ať ji nahraje do appky znovu.';
    }
    li.appendChild(odkaz);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni smazat-prilohu akce-smazat';
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
    legacy.innerHTML = odkazOtevritSken(s.Zdrojovy_soubor_URL, s.Zdrojovy_soubor_ID, 'smlouva', 'Starší odkaz na soubor:');
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
    tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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

  // Rozpad na Sluzby_castka/Vlastni_naklad_castka (od v4.37) - appka ho
  // nabízí u smluv JINÝCH než "Nájem", typicky SVJ předpis/pojistka
  // navázaná na konkrétní nemovitost (Stredisko). Appka Vlastni_naklad_castka
  // NIKDY nepromítá do vyúčtování služeb nájemníkovi (viz nemovitosti-
  // vyuctovani.js) - do vyúčtování appka počítá jen Sluzby_castka.
  // Zobrazuje/skrývá se podle zvoleného Typu, appka pole do zmeny pošle jen
  // tehdy, když appka split režim opravdu používá (viz ziskejZmeny níž) -
  // ať appka nesahá na Ocekavana_castka u smluv, které split vůbec nepoužívají.
  const wrapSplit = document.createElement('div');
  wrapSplit.style.border = '1px dashed var(--barva-hranice, #ccc)';
  wrapSplit.style.borderRadius = '6px';
  wrapSplit.style.padding = '8px';
  wrapSplit.style.margin = '4px 0 8px';
  const popisSplit = document.createElement('p');
  popisSplit.className = 'popis';
  popisSplit.style.margin = '0 0 6px';
  popisSplit.textContent = 'Appka umí pravidelnou platbu (SVJ předpis, pojistka apod.) rozdělit na část '
    + 'zúčtovatelnou nájemníkovi (služby) a vlastní náklad pronajímatele (fond oprav apod.), který appka do '
    + 'vyúčtování nájemníkovi nikdy nepromítá. Necháte-li obě pole prázdná, appka Očekávanou částku výš '
    + 'ponechá jako ručně zadanou.';
  wrapSplit.appendChild(popisSplit);
  const labelSluzby = document.createElement('label');
  labelSluzby.textContent = 'Z toho služby (zúčtovatelné nájemníkovi)';
  const vstupSluzbyCastka = document.createElement('input');
  vstupSluzbyCastka.type = 'number';
  vstupSluzbyCastka.step = '0.01';
  vstupSluzbyCastka.value = s.Sluzby_castka !== undefined && s.Sluzby_castka !== '' ? parsujCastkuZListu(s.Sluzby_castka) : '';
  wrapSplit.appendChild(labelSluzby);
  wrapSplit.appendChild(vstupSluzbyCastka);
  const labelVlastniNaklad = document.createElement('label');
  labelVlastniNaklad.textContent = 'Z toho vlastní náklad (appka NEpromítá do vyúčtování)';
  const vstupVlastniNaklad = document.createElement('input');
  vstupVlastniNaklad.type = 'number';
  vstupVlastniNaklad.step = '0.01';
  vstupVlastniNaklad.value = s.Vlastni_naklad_castka !== undefined && s.Vlastni_naklad_castka !== '' ? parsujCastkuZListu(s.Vlastni_naklad_castka) : '';
  wrapSplit.appendChild(labelVlastniNaklad);
  wrapSplit.appendChild(vstupVlastniNaklad);
  wrap.appendChild(wrapSplit);
  const aktualizujViditelnostSplit = () => {
    wrapSplit.style.display = vstupTyp.value.trim() === 'Nájem' ? 'none' : '';
  };
  aktualizujViditelnostSplit();
  vstupTyp.addEventListener('change', aktualizujViditelnostSplit);

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
    const zmeny = {
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
    // Appka pošle Sluzby_castka/Vlastni_naklad_castka jen tehdy, když split
    // režim opravdu používá (aspoň jedno z polí appka má vyplněné, ať už
    // původně, nebo je uživatel právě teď vyplnil) - appka tak nesahá na
    // Ocekavana_castka u smluv (např. leasing auta), které split vůbec
    // nepoužívají a mají ho jen ručně zadaný.
    const noveSluzby = vstupSluzbyCastka.value.trim();
    const noveVlastni = vstupVlastniNaklad.value.trim();
    const puvodneMeloSplit = String(s.Sluzby_castka || '').trim() !== '' || String(s.Vlastni_naklad_castka || '').trim() !== '';
    if (noveSluzby !== '' || noveVlastni !== '' || puvodneMeloSplit) {
      zmeny.Sluzby_castka = noveSluzby;
      zmeny.Vlastni_naklad_castka = noveVlastni;
    }
    return zmeny;
  }

  const akce = document.createElement('div');
  akce.className = 'radek-akci';

  const tlacitkoUlozit = document.createElement('button');
  tlacitkoUlozit.className = 'maly sekundarni';
  tlacitkoUlozit.textContent = 'Uložit';
  tlacitkoUlozit.onclick = () => ulozSmlouvu(s.ID, ziskejZmeny(), tlacitkoUlozit);
  akce.appendChild(tlacitkoUlozit);

  const tlacitkoSmazat = document.createElement('button');
  tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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
  // (v4.51) Text hlásí obojí: od v4.51 je kaskáda v
  // netlify/functions/smlouvy.js podle SMĚRU pohybu - odchozí platby padnou
  // do "Nespárováno", příchozí do "Příjem ke kontrole". Nepsat sem jen
  // "Nespárováno", Jan by pak příjmy hledal ve špatné dlaždici.
  if (
    !confirm(
      'Opravdu smazat smlouvu „' +
        nazev +
        '“? Bankovní pohyby na ni napojené se vrátí mezi nevyřízené (odchozí platby do „Nespárováno“, příchozí do „Příjem ke kontrole“) a smažou se i všechny přílohy smlouvy.'
    )
  )
    return;
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
// k jednoduššímu modelu: Středisko zůstává JEDINÝM číselníkem pro účetní
// kategorizaci (appka ho ostatně už dřív nabízela i jako hodnotu
// "Nemovitosti", viz MOZNOSTI_STREDISKA výš) a nájemní příjem appka řeší
// čistě přes spárování s nájemní Smlouvou (viz vytvorDetailBanka výš,
// "Navrženo/Spárováno - nájemní smlouva") + automatické převzetí
// Smlouva.Stredisko na bankovní pohyb při potvrzení - to appka NEMĚNÍ.
//
// Od v4.36 (backlog položka 19, brainstorm + odpovědi na otevřené otázky
// 2026-07-27, viz claude/nomis-faktury-backlog.md) appka do týhle záložky
// přidává "Jednotku" - DOPLŇKOVÝ, bohatší záznam navázaný na existující
// středisko (typu "Nemovitost") podle jeho názvu, viz
// netlify/functions/nemovitosti-jednotky.js. U každé jednotky appka
// zobrazí základní údaje, napojenou nájemní smlouvu (rozpad na čistý
// nájem/zálohu na služby + kauci, viz lib/smlouvySchema.js), klíče,
// měřidla s odečty, revize, a umí na požádání spočítat vyúčtování za
// zvolené období (netlify/functions/nemovitosti-vyuctovani.js).
//
// Rozhodnuto (AskUserQuestion 2026-07-27): záložka zůstává zamčená pro
// běžnou roli (viz nastavZamekZalozky('nav-nemovitosti', ...) výš) - jen
// admin/účetní.

let nemovitostiJednotkySeznam = [];
let nemovitostiSmlouvySeznam = [];
let nemovitostiFirmySeznam = [];
// (v4.57) Stav úhrady nájmu za aktuální měsíc, aby se dal ukázat rovnou na
// sbaleném řádku bytu. Klíčem je Stredisko. Appka si ho bere ze STEJNÉHO
// endpointu jako sekce „Kontrola úhrady nájmu" nad seznamem - žádný druhý
// výpočet, jen se to samé číslo zobrazí i u konkrétního bytu.
let nemovitostiPlatbyMapa = {};
let nemovitostiPlatbyMesic = '';

// Duplikace stejných menších číselníků jako na backendu (appka nemá build
// krok, viz stejná konvence u MOZNOSTI_TYP_SMLOUVY/MOZNOSTI_PERIODA_SMLOUVY
// výš) - musí zůstat přesně synchronní s lib/smlouvySchema.js a
// lib/nemovitostiDetailySchema.js.
const MOZNOSTI_KAUCE_STAV = ['Nesjednána', 'Uhrazena - drží se', 'Vráceno celá', 'Vráceno částečně'];
const MOZNOSTI_TYP_MERIDLA = ['Elektřina', 'Voda', 'Plyn', 'Teplo'];
const MOZNOSTI_TYP_REVIZE = ['Elektro', 'Plyn', 'Komín', 'Hasicí přístroje', 'Výtah', 'Ostatní'];
const MOZNOSTI_STAV_KODU = ['Platný', 'Neplatný'];
const MOZNOSTI_STAV_JEDNOTKY = ['Volná', 'Obsazená', 'Rekonstrukce', 'Rezervovaná', 'Nedostupná'];

async function nactiNemovitosti() {
  const nacitani = document.getElementById('nemovitosti-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    // Měsíc pro odznak úhrady na sbaleném řádku - vždycky ten aktuální.
    // (Sekce „Kontrola úhrady nájmu" níž má vlastní přepínač měsíce, ten
    // tenhle odznak nemění - jsou to dvě různé otázky.)
    nemovitostiPlatbyMesic = new Date().toISOString().slice(0, 7);

    const [dataJednotky, dataFirmy, dataStrediska, dataSmlouvy, dataPlatby] = await Promise.all([
      zavolejApi('/nemovitosti-jednotky', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
      zavolejApi('/smlouvy', { method: 'GET' }).catch(() => ({ smlouvy: [] })),
      // Když tenhle přehled spadne, karty se musí vykreslit stejně - odznak
      // stavu platby prostě nebude. Ticho je lepší než vymyšlený stav.
      zavolejApi('/nemovitosti-platby-prehled?mesic=' + encodeURIComponent(nemovitostiPlatbyMesic), { method: 'GET' })
        .catch(() => ({ radky: [] })),
    ]);

    nemovitostiPlatbyMapa = {};
    (dataPlatby.radky || []).forEach((r) => {
      if (r.stredisko) nemovitostiPlatbyMapa[r.stredisko] = r;
    });
    nemovitostiJednotkySeznam = dataJednotky.jednotky || [];
    nemovitostiFirmySeznam = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    strediskaSeznam = dataStrediska.strediska || [];
    nemovitostiSmlouvySeznam = dataSmlouvy.smlouvy || [];
    nacitani.classList.add('skryto');
    vyplnVyberFirem('nova-nem-firma', nemovitostiFirmySeznam);
    vykresliVyberStrediskaProJednotku();
    vykresliNemovitosti();

    const vstupMesic = document.getElementById('nem-platby-mesic');
    if (vstupMesic && !vstupMesic.value) vstupMesic.value = new Date().toISOString().slice(0, 7);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst nemovitosti: ' + e.message;
  }
}

// Appka platby-přehled počítá NAPŘÍČ jednotkami (na rozdíl od vyúčtování,
// které appka počítá vždy jen za jednu konkrétní jednotku) - proto je to
// samostatná sekce nad seznamem jednotek, ne součást karty jedné jednotky.
async function nactiKontrolaUhradyNajmu() {
  const mesic = document.getElementById('nem-platby-mesic').value;
  const vysledekEl = document.getElementById('nem-platby-vysledek');
  if (!mesic) { vysledekEl.innerHTML = '<div class="zprava chyba">Vyberte měsíc.</div>'; return; }

  vysledekEl.innerHTML = '<div class="nacitani">Načítám…</div>';
  try {
    const data = await zavolejApi('/nemovitosti-platby-prehled?mesic=' + encodeURIComponent(mesic), { method: 'GET' });
    vykresliKontrolaUhradyNajmu(vysledekEl, data.radky || []);
  } catch (e) {
    vysledekEl.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

function vykresliKontrolaUhradyNajmu(el, radky) {
  if (!radky.length) {
    el.innerHTML = '<p class="popis">Appka nenašla žádnou aktivní nájemní smlouvu, ke které máte přístup.</p>';
    return;
  }

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Středisko</th><th>Nájemník</th><th>Očekáváno</th><th>Uhrazeno</th><th>Stav</th></tr></thead>';
  const telo = document.createElement('tbody');

  radky.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Středisko"></td><td data-label="Nájemník"></td><td data-label="Očekáváno"></td>'
      + '<td data-label="Uhrazeno"></td><td data-label="Stav"></td>';
    tr.children[0].textContent = r.stredisko || '';
    tr.children[1].textContent = r.druhaStrana || '';
    tr.children[2].textContent = formatCastkaSMenou(r.ocekavano, r.mena || 'CZK');
    tr.children[3].textContent = formatCastkaSMenou(r.uhrazeno, r.mena || 'CZK');
    let trida = 'badge-chybi';
    if (r.stav === 'Zaplaceno') trida = 'badge-potvrzeno';
    else if (r.stav === 'Částečně') trida = 'badge-navrzeno';
    tr.children[4].innerHTML = '<span class="' + trida + '">' + escapeHtml(r.stav) + '</span>';
    telo.appendChild(tr);
  });
  tabulka.appendChild(telo);
  el.innerHTML = '';
  el.appendChild(tabulka);
}

// Appka do nabídky nabízí jen střediska typu "Nemovitost", která ještě
// nemají založenou jednotku (appka nedovolí dvě jednotky na stejné
// středisko, viz netlify/functions/nemovitosti-jednotky.js).
function vykresliVyberStrediskaProJednotku() {
  const select = document.getElementById('nova-nem-stredisko');
  const obsazena = new Set(nemovitostiJednotkySeznam.map((j) => j.Stredisko));
  const volna = strediskaSeznam.filter((s) => s.Typ === 'Nemovitost' && s.Aktivni !== 'NE' && !obsazena.has(s.Nazev));
  select.innerHTML = '<option value="">— vyberte středisko —</option>' +
    volna.map((s) => '<option value="' + escapeAttr(s.Nazev) + '">' + escapeHtml(s.Nazev) + '</option>').join('');
}

async function pridatJednotku() {
  const zprava = document.getElementById('nemovitosti-nova-zprava');
  zprava.innerHTML = '';

  const firma = document.getElementById('nova-nem-firma').value;
  const stredisko = document.getElementById('nova-nem-stredisko').value;
  if (!firma) { zprava.innerHTML = '<div class="zprava chyba">Vyberte firmu.</div>'; return; }
  if (!stredisko) { zprava.innerHTML = '<div class="zprava chyba">Vyberte středisko.</div>'; return; }

  try {
    await zavolejApi('/nemovitosti-jednotky', {
      method: 'POST',
      body: JSON.stringify({
        Firma: firma,
        Stredisko: stredisko,
        Adresa: document.getElementById('nova-nem-adresa').value.trim(),
        Katastralni_uzemi: document.getElementById('nova-nem-katastr').value.trim(),
        Cislo_LV: document.getElementById('nova-nem-lv').value.trim(),
        Plocha_m2: document.getElementById('nova-nem-plocha').value.trim(),
        Dispozice: document.getElementById('nova-nem-dispozice').value.trim(),
        Podlazi: document.getElementById('nova-nem-podlazi').value.trim(),
        Nazev: document.getElementById('nova-nem-nazev').value.trim(),
        Wifi_sit: document.getElementById('nova-nem-wifi-sit').value.trim(),
        Wifi_heslo: document.getElementById('nova-nem-wifi-heslo').value.trim(),
        Poznamka: document.getElementById('nova-nem-poznamka').value.trim(),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Jednotka přidána.</div>';
    ['nazev', 'adresa', 'katastr', 'lv', 'plocha', 'dispozice', 'podlazi', 'wifi-sit', 'wifi-heslo', 'poznamka'].forEach((s) => {
      document.getElementById('nova-nem-' + s).value = '';
    });
    await nactiNemovitosti();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

// Končící nájemní smlouvy (v4.57). Appka nic neposílá ani nepřipomíná -
// jen napíše, co skončí do 90 dnů, a co už skončilo a pořád je aktivní.
//
// Ten druhý případ je ve skutečnosti důležitější: smlouva po platnosti,
// která má pořád Aktivni = ANO, se dál počítá do očekávaných plateb i do
// vyúčtování, takže se tichá chyba táhne dál. Appka ji ale sama
// nedeaktivuje - nájem po skončení doby často pokračuje dál a je to
// rozhodnutí člověka, ne appky.
const NEM_KONCI_DNI = 90;

function vykresliKoncsiSmlouvy() {
  const el = document.getElementById('nemovitosti-konci');
  if (!el) return;
  el.innerHTML = '';

  const dnes = new Date().toISOString().slice(0, 10);
  const hranice = new Date(Date.now() + NEM_KONCI_DNI * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Datumy jsou v Sheets řetězce RRRR-MM-DD, takže se porovnávají jako text
  // a vychází to správně - stejná konvence jako všude jinde v appce.
  const najemni = nemovitostiSmlouvySeznam.filter((s) => s.Typ === 'Nájem' && s.Aktivni !== 'NE' && s.Platnost_do);
  const poPlatnosti = najemni.filter((s) => s.Platnost_do < dnes);
  const konci = najemni.filter((s) => s.Platnost_do >= dnes && s.Platnost_do <= hranice)
    .sort((a, b) => (a.Platnost_do < b.Platnost_do ? -1 : 1));

  if (poPlatnosti.length === 0 && konci.length === 0) return;

  const popisSmlouvy = (s) => (s.Druha_strana || '(nájemník nevyplněn)')
    + ' · ' + (s.Stredisko || '(bez střediska)')
    + ' · do ' + s.Platnost_do;

  if (poPlatnosti.length > 0) {
    const box = document.createElement('div');
    box.className = 'zprava chyba';
    box.innerHTML = '<strong>Po platnosti, ale pořád aktivní ('
      + poPlatnosti.length + ')</strong><br>'
      + poPlatnosti.map((s) => escapeHtml(popisSmlouvy(s))).join('<br>')
      + '<br><span class="popis">Takové smlouvy se dál počítají do očekávaných plateb i do vyúčtování. '
      + 'Pokud nájem skončil, přepněte smlouvu na neaktivní v Registru smluv; pokud pokračuje, prodlužte platnost.</span>';
    el.appendChild(box);
  }

  if (konci.length > 0) {
    const box = document.createElement('div');
    box.className = 'zprava varovani';
    box.innerHTML = '<strong>Končí do ' + NEM_KONCI_DNI + ' dnů ('
      + konci.length + ')</strong><br>'
      + konci.map((s) => escapeHtml(popisSmlouvy(s))).join('<br>');
    el.appendChild(box);
  }
}

function vykresliNemovitosti() {
  vykresliKoncsiSmlouvy();
  const kontejner = document.getElementById('nemovitosti-seznam');
  kontejner.innerHTML = '';

  if (nemovitostiJednotkySeznam.length === 0) {
    kontejner.innerHTML = '<p class="popis">Zatím žádné jednotky. Přidejte první výš ("Přidat jednotku").</p>';
    return;
  }

  nemovitostiJednotkySeznam.forEach((j) => {
    kontejner.appendChild(vytvorKartuJednotky(j));
  });
}

// Karta bytu (přestavěná ve v4.57).
//
// Jan 2026-08-07: *"nemovitosti - potřeba editovat záznam, návrh sestavení
// karty bytu, možnost uložit wifi a heslo, přidat název jednotky"*. Z návrhu
// si vybral: karta se po rozbalení otevře jako **čtecí přehled s tlačítkem
// Upravit**, na sbaleném řádku má být **nájemník s výší nájmu** a **stav
// platby za tenhle měsíc** (upozornění na propadlé revize/kódy si zatím
// nevybral - nedodělávat je zpětně bez toho, že si o ně řekne).
//
// Tři věci, které se tím proti v4.36 mění:
//
// 1) SBALENÝ ŘÁDEK NĚCO ŘÍKÁ. Do teď na něm bylo jen „Stredisko - Adresa".
//    Teď je nahoře Nazev (nový, viz schéma), pod ním drobněji středisko a
//    adresa, a vpravo odznaky s nájemníkem, nájmem a stavem platby - dá se
//    tedy projet seznam bytů shora dolů a vidět, kde je problém, bez
//    jediného rozkliknutí.
//
// 2) NEJDŘÍV ČTENÍ, FORMULÁŘ AŽ NA POŽÁDÁNÍ. Na kartu se člověk většinou
//    jde podívat, ne ji přepisovat. Políčka se proto vykreslí až po
//    klepnutí na „Upravit". Appka je staví teprve v tu chvíli, ne dopředu
//    schovaná - u dvaceti bytů by to jinak bylo dvacet formulářů v DOM,
//    které nikdo nevidí.
//
// 3) ULOŽENÍ UŽ KARTU NEZAVÍRÁ. Do v4.56 volalo ulozJednotku() celé
//    nactiNemovitosti(), což vyprázdnilo kontejner a postavilo všechny
//    karty znovu - rozbalená karta se sbalila, člověk ztratil místo, kde
//    byl, a klíče/kódy/měřidla/revize se musely donačíst. Teď se přepíše
//    jen ta jedna karta (překreslí se hlavička a čtecí přehled), zbytek
//    karty zůstane, jak byl. Tenhle vzor **nevracet zpátky na globální
//    překreslení** - stejný důvod, proč ho už dřív nepoužívají klíče a
//    kódy (viz obnovDetailySekce výš).
function vytvorKartuJednotky(j) {
  const detail = document.createElement('details');
  detail.className = 'karta-jednotka';

  const summary = document.createElement('summary');
  detail.appendChild(summary);

  // -- Základní údaje: čtecí přehled + formulář na požádání --
  const sekceZaklad = document.createElement('div');
  sekceZaklad.className = 'sekce-jednotky';
  detail.appendChild(sekceZaklad);

  vykresliHlavickuJednotky(summary, j);
  vykresliZakladJednotky(sekceZaklad, summary, j);

  // -- Nájemní smlouva (rozpad nájmu + kauce) --
  const sekceSmlouva = document.createElement('div');
  sekceSmlouva.className = 'sekce-jednotky';
  sekceSmlouva.id = 'nem-smlouva-' + j.ID;
  detail.appendChild(sekceSmlouva);
  // Napoprvé bez nájemních jednotek - ty se načítají až s rozbalením karty
  // (nactiDetailyJednotky) a tahle sekce se pak překreslí i s roletkou.
  vykresliSekciSmlouva(sekceSmlouva, j, []);

  // -- Klíče / Přístupové kódy / Měřidla / Revize (lazy loaded) --
  const sekceDetaily = document.createElement('div');
  sekceDetaily.className = 'sekce-jednotky';
  sekceDetaily.id = 'nem-detaily-' + j.ID;
  sekceDetaily.innerHTML = '<p class="popis">Rozbalte kartu pro načtení klíčů, kódů, měřidel a revizí…</p>';
  detail.appendChild(sekceDetaily);

  let detailyNacteny = false;
  detail.addEventListener('toggle', () => {
    if (detail.open && !detailyNacteny) {
      detailyNacteny = true;
      nactiDetailyJednotky(sekceDetaily, j);
    }
  });

  // -- Vyúčtování --
  const sekceVyuctovani = document.createElement('div');
  sekceVyuctovani.className = 'sekce-jednotky';
  detail.appendChild(sekceVyuctovani);
  vykresliSekciVyuctovani(sekceVyuctovani, j);

  return detail;
}

// Nájemní smlouvy jednotky. Vrací POLE, ne jednu smlouvu - do v4.56 tu
// bylo `.find()`, které u bytu rozděleného mezi víc nájemníků (Holečkova
// 1a/1b, 7a/7b - viz MOZNOSTI_JEDNOTKA výš) potichu ukázalo jen tu první a
// o ostatních člověk z karty vůbec nevěděl. **Nevracet zpátky na `.find()`.**
function najdiNajemniSmlouvy(j) {
  return nemovitostiSmlouvySeznam.filter((s) => s.Stredisko === j.Stredisko && s.Typ === 'Nájem' && s.Aktivni !== 'NE');
}

// Sbalený řádek. Volá se i po uložení, proto element vždycky vyprázdní -
// jinak by se po druhém uložení odznaky zdvojily.
function vykresliHlavickuJednotky(summary, j) {
  summary.innerHTML = '';

  const text = document.createElement('span');
  text.className = 'jednotka-hlava-text';

  const nadpis = document.createElement('strong');
  // Bez názvu appka jednotku popíše střediskem jako před v4.57 - starým
  // jednotkám, které Nazev nemají vyplněný, se tím nic nezmění.
  nadpis.textContent = j.Nazev || j.Stredisko;
  text.appendChild(nadpis);

  // Středisko se opakuje jen tehdy, když je název něco jiného - jinak by
  // na řádku stálo dvakrát po sobě totéž.
  const podnadpisCasti = [];
  if (j.Nazev) podnadpisCasti.push(j.Stredisko);
  if (j.Adresa) podnadpisCasti.push(j.Adresa);
  if (podnadpisCasti.length > 0) {
    const podnadpis = document.createElement('span');
    podnadpis.className = 'jednotka-hlava-podnadpis';
    podnadpis.textContent = podnadpisCasti.join(' · ');
    text.appendChild(podnadpis);
  }
  summary.appendChild(text);

  const odznaky = document.createElement('span');
  odznaky.className = 'jednotka-hlava-odznaky';

  const smlouvy = najdiNajemniSmlouvy(j);
  if (smlouvy.length === 1) {
    const smlouva = smlouvy[0];
    if (smlouva.Druha_strana) {
      const najemnik = document.createElement('span');
      najemnik.className = 'jednotka-odznak';
      najemnik.textContent = smlouva.Druha_strana;
      odznaky.appendChild(najemnik);
    }
    const castka = parsujCastkuZListu(smlouva.Ocekavana_castka);
    if (castka > 0) {
      const najem = document.createElement('span');
      najem.className = 'jednotka-odznak';
      // Měna smlouvy, ne natvrdo Kč - appka vede i smlouvy v EUR a míchat
      // měny do jednoho čísla se v téhle appce nesmí nikde.
      najem.textContent = formatCastkaSMenou(castka, smlouva.Mena);
      odznaky.appendChild(najem);
    }
  } else if (smlouvy.length > 1) {
    // Byt rozdělený mezi víc nájemníků. Jména se na sbalený řádek nevejdou,
    // proto jen počet - konkrétní nájemníci jsou v sekci Nájemní smlouvy.
    const pocet = document.createElement('span');
    pocet.className = 'jednotka-odznak';
    pocet.textContent = smlouvy.length + ' nájemníci';
    pocet.title = smlouvy.map((s) => s.Druha_strana).filter(Boolean).join(', ');
    odznaky.appendChild(pocet);

    // Součet se ukáže JEN když všechny smlouvy mají stejnou měnu. Sečíst
    // korunový a eurový nájem do jednoho čísla se v téhle appce nesmí.
    const meny = new Set(smlouvy.map((s) => s.Mena || 'CZK'));
    if (meny.size === 1) {
      const soucet = smlouvy.reduce((c, s) => c + parsujCastkuZListu(s.Ocekavana_castka), 0);
      if (soucet > 0) {
        const najem = document.createElement('span');
        najem.className = 'jednotka-odznak';
        najem.textContent = formatCastkaSMenou(soucet, smlouvy[0].Mena);
        najem.title = 'Součet nájmů všech nájemníků bytu';
        odznaky.appendChild(najem);
      }
    }
  }

  // Stav platby za zvolený měsíc. Appka ho počítá už od v4.37 v sekci
  // „Kontrola úhrady nájmu" nad seznamem - tady se jen zobrazí to samé
  // číslo u konkrétního bytu, žádný druhý výpočet. Když se přehled
  // nepodařilo načíst, odznak prostě není (ticho je lepší než vymyšlený
  // stav).
  const platba = nemovitostiPlatbyMapa[j.Stredisko];
  if (platba && platba.stav) {
    const stav = document.createElement('span');
    stav.className = 'jednotka-odznak jednotka-odznak-' + platbaStavTrida(platba.stav);
    stav.textContent = platba.stav;
    stav.title = 'Stav úhrady nájmu za ' + (nemovitostiPlatbyMesic || '');
    odznaky.appendChild(stav);
  }

  if (odznaky.children.length > 0) summary.appendChild(odznaky);
}

function platbaStavTrida(stav) {
  if (stav === 'Zaplaceno') return 'ok';
  if (stav === 'Částečně') return 'castecne';
  return 'chybi';
}

// Čtecí přehled + přepnutí do formuláře. `summary` sem chodí proto, aby se
// po uložení přepsala i hlavička (mění se Nazev i Adresa).
function vykresliZakladJednotky(el, summary, j) {
  el.innerHTML = '';

  const hlavicka = document.createElement('div');
  hlavicka.className = 'jednotka-sekce-hlavicka';
  const nadpis = document.createElement('h4');
  nadpis.textContent = 'Základní údaje';
  hlavicka.appendChild(nadpis);

  const tlacitkoUpravit = document.createElement('button');
  tlacitkoUpravit.className = 'maly sekundarni';
  tlacitkoUpravit.textContent = 'Upravit';
  tlacitkoUpravit.onclick = () => vykresliFormularJednotky(el, summary, j);
  hlavicka.appendChild(tlacitkoUpravit);
  el.appendChild(hlavicka);

  const mriz = document.createElement('div');
  mriz.className = 'jednotka-prehled';
  [
    ['Adresa', j.Adresa],
    ['Dispozice', j.Dispozice],
    ['Plocha', j.Plocha_m2 ? j.Plocha_m2 + ' m²' : ''],
    ['Podlaží', j.Podlazi],
    ['Katastrální území', j.Katastralni_uzemi],
    ['Číslo LV', j.Cislo_LV],
  ].forEach(([popisek, hodnota]) => {
    const polozka = document.createElement('div');
    polozka.className = 'jednotka-prehled-polozka';
    const l = document.createElement('span');
    l.className = 'jednotka-prehled-popisek';
    l.textContent = popisek;
    const h = document.createElement('span');
    h.className = 'jednotka-prehled-hodnota';
    // Prázdná hodnota se ukáže jako pomlčka, ne jako díra - stejné pravidlo
    // „každý sloupec appka vždy vykreslí" jako u Dokladů/Smluv od v4.35.
    h.textContent = hodnota || '–';
    if (!hodnota) h.classList.add('jednotka-prehled-prazdno');
    polozka.appendChild(l);
    polozka.appendChild(h);
    mriz.appendChild(polozka);
  });
  el.appendChild(mriz);

  // WiFi (v4.57). Heslo se ukazuje čitelně - stejná úvaha jako u
  // přístupových kódů: člověk ho stejně musí přečíst a nadiktovat, takže
  // maskování by přidalo jen klepání navíc. **Nemaskovat.**
  if (j.Wifi_sit || j.Wifi_heslo) {
    const wifi = document.createElement('div');
    wifi.className = 'jednotka-wifi';
    const popis = document.createElement('span');
    popis.className = 'jednotka-prehled-popisek';
    popis.textContent = 'WiFi';
    wifi.appendChild(popis);

    const hodnoty = document.createElement('div');
    hodnoty.className = 'jednotka-wifi-hodnoty';
    if (j.Wifi_sit) {
      const sit = document.createElement('code');
      sit.className = 'jednotka-wifi-kod';
      sit.textContent = j.Wifi_sit;
      hodnoty.appendChild(sit);
    }
    if (j.Wifi_heslo) {
      const heslo = document.createElement('code');
      heslo.className = 'jednotka-wifi-kod';
      heslo.textContent = j.Wifi_heslo;
      hodnoty.appendChild(heslo);

      const kopir = document.createElement('button');
      kopir.className = 'maly sekundarni';
      kopir.textContent = 'Kopírovat heslo';
      kopir.onclick = () => zkopirujDoSchranky(j.Wifi_heslo, kopir);
      hodnoty.appendChild(kopir);
    }
    wifi.appendChild(hodnoty);
    el.appendChild(wifi);
  }

  if (j.Poznamka) {
    const poznamka = document.createElement('p');
    poznamka.className = 'popis';
    poznamka.style.marginTop = '8px';
    poznamka.textContent = j.Poznamka;
    el.appendChild(poznamka);
  }
}

// Kopírování hesla. `navigator.clipboard` nemusí být k dispozici (starší
// prohlížeč, stránka bez https) - proto záložní cesta přes dočasné pole.
// Když selže obojí, appka to napíše místo aby tvrdila, že zkopírovala.
function zkopirujDoSchranky(text, tlacitko) {
  const hotovo = () => {
    const puvodni = tlacitko.textContent;
    tlacitko.textContent = 'Zkopírováno';
    setTimeout(() => { tlacitko.textContent = puvodni; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(hotovo).catch(() => zkopirujZalozne(text, tlacitko, hotovo));
    return;
  }
  zkopirujZalozne(text, tlacitko, hotovo);
}

function zkopirujZalozne(text, tlacitko, hotovo) {
  try {
    const pole = document.createElement('textarea');
    pole.value = text;
    pole.setAttribute('readonly', '');
    pole.style.position = 'fixed';
    pole.style.left = '-9999px';
    document.body.appendChild(pole);
    pole.select();
    document.execCommand('copy');
    document.body.removeChild(pole);
    hotovo();
  } catch (e) {
    tlacitko.textContent = 'Nejde zkopírovat';
  }
}

function vykresliFormularJednotky(el, summary, j) {
  el.innerHTML = '';

  const hlavicka = document.createElement('div');
  hlavicka.className = 'jednotka-sekce-hlavicka';
  const nadpis = document.createElement('h4');
  nadpis.textContent = 'Základní údaje';
  hlavicka.appendChild(nadpis);

  const tlacitkoZpet = document.createElement('button');
  tlacitkoZpet.className = 'maly sekundarni akce-poznamka';
  tlacitkoZpet.textContent = 'Zrušit';
  tlacitkoZpet.onclick = () => vykresliZakladJednotky(el, summary, j);
  hlavicka.appendChild(tlacitkoZpet);
  el.appendChild(hlavicka);

  const vstupy = {};
  function pole(rodic, klic, popisek, napoveda) {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = popisek;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = j[klic] || '';
    input.style.fontSize = '13px';
    if (napoveda) input.placeholder = napoveda;
    vstupy[klic] = input;
    wrap.appendChild(label);
    wrap.appendChild(input);
    rodic.appendChild(wrap);
    return input;
  }

  // Název je první a přes celou šířku - je to ta věc, kvůli které Jan
  // napsal „nejde upravit název nemovitosti".
  const wrapNazev = document.createElement('div');
  pole(wrapNazev, 'Nazev', 'Název jednotky', 'např. Byt 3, Vinohrady');
  el.appendChild(wrapNazev);

  const napovedaNazev = document.createElement('p');
  napovedaNazev.className = 'popis';
  napovedaNazev.style.margin = '4px 0 0';
  napovedaNazev.textContent = 'Volný popisek pro lidi. Středisko „' + j.Stredisko + '“ zůstává beze změny – '
    + 'je to klíč, přes který se k jednotce dopočítávají doklady, smlouvy i vyúčtování.';
  el.appendChild(napovedaNazev);

  const wrapAdresa = document.createElement('div');
  pole(wrapAdresa, 'Adresa', 'Adresa');
  el.appendChild(wrapAdresa);

  const mriz = document.createElement('div');
  mriz.className = 'mriz-2';
  pole(mriz, 'Katastralni_uzemi', 'Katastrální území');
  pole(mriz, 'Cislo_LV', 'Číslo LV');
  pole(mriz, 'Plocha_m2', 'Plocha (m²)');
  pole(mriz, 'Dispozice', 'Dispozice');
  pole(mriz, 'Podlazi', 'Podlaží');
  el.appendChild(mriz);

  const mrizWifi = document.createElement('div');
  mrizWifi.className = 'mriz-2';
  pole(mrizWifi, 'Wifi_sit', 'WiFi – název sítě');
  pole(mrizWifi, 'Wifi_heslo', 'WiFi – heslo');
  el.appendChild(mrizWifi);

  const napovedaWifi = document.createElement('p');
  napovedaWifi.className = 'popis';
  napovedaWifi.style.margin = '4px 0 0';
  napovedaWifi.textContent = 'Heslo se ukládá čitelně a uvidí ho každý, kdo má přístup do tabulky – '
    + 'stejně jako přístupové kódy. Hesla do banky nebo e-mailu sem nepatří.';
  el.appendChild(napovedaWifi);

  const wrapPoznamka = document.createElement('div');
  pole(wrapPoznamka, 'Poznamka', 'Poznámka');
  el.appendChild(wrapPoznamka);

  const radekTlacitek = document.createElement('div');
  radekTlacitek.style.marginTop = '10px';

  const tlacitkoUlozit = document.createElement('button');
  tlacitkoUlozit.className = 'maly sekundarni akce-potvrdit';
  tlacitkoUlozit.textContent = 'Uložit údaje';
  tlacitkoUlozit.onclick = () => {
    const zmeny = {};
    Object.keys(vstupy).forEach((klic) => { zmeny[klic] = vstupy[klic].value.trim(); });
    ulozJednotku(j, zmeny, tlacitkoUlozit, el, summary);
  };
  radekTlacitek.appendChild(tlacitkoUlozit);

  const tlacitkoSmazat = document.createElement('button');
  tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
  tlacitkoSmazat.style.marginLeft = '6px';
  tlacitkoSmazat.textContent = 'Smazat jednotku';
  tlacitkoSmazat.onclick = () => smazJednotku(j.ID, j.Stredisko, tlacitkoSmazat);
  radekTlacitek.appendChild(tlacitkoSmazat);

  el.appendChild(radekTlacitek);

  const zprava = document.createElement('div');
  zprava.id = 'nem-zaklad-zprava-' + j.ID;
  radekTlacitek.appendChild(zprava);
}

// Uložení základních údajů jednotky.
//
// Kartu ZÁMĚRNĚ nepřekresluje celou přes nactiNemovitosti() (to dělala do
// v4.56 a sbalilo to kartu, ve které člověk zrovna pracoval) - místo toho
// přepíše hodnoty v paměti a překreslí jen hlavičku a čtecí přehled.
async function ulozJednotku(j, zmeny, tlacitko, el, summary) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/nemovitosti-jednotky', { method: 'PATCH', body: JSON.stringify({ id: j.ID, zmeny }) });
    // Stredisko ani ID se přepsat nesmí - backend je z PATCHe stejně
    // vyhazuje, tohle je jen pojistka, aby se paměť nerozešla s tabulkou.
    Object.keys(zmeny).forEach((klic) => {
      if (klic === 'Stredisko' || klic === 'ID') return;
      j[klic] = zmeny[klic];
    });
    vykresliHlavickuJednotky(summary, j);
    vykresliZakladJednotky(el, summary, j);
    const potvrzeni = document.createElement('div');
    potvrzeni.className = 'zprava uspech';
    potvrzeni.textContent = 'Uloženo.';
    el.appendChild(potvrzeni);
    setTimeout(() => { if (potvrzeni.parentNode) potvrzeni.parentNode.removeChild(potvrzeni); }, 2500);
  } catch (e) {
    const zprava = document.getElementById('nem-zaklad-zprava-' + j.ID);
    if (zprava) zprava.innerHTML = '<div class="zprava chyba">Nepodařilo se uložit: ' + escapeHtml(e.message) + '</div>';
    else alert('Nepodařilo se uložit jednotku: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazJednotku(id, stredisko, tlacitko) {
  if (!confirm('Opravdu smazat jednotku „' + stredisko + '“? Klíče/měřidla/revize appka NEMAŽE, jen zůstanou u '
    + 'střediska bez jednotky (dokud se nezaloží nová jednotka pro tohle středisko).')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/nemovitosti-jednotky?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await nactiNemovitosti();
  } catch (e) {
    alert('Nepodařilo se smazat jednotku: ' + e.message);
    tlacitko.disabled = false;
  }
}

// Appka Firmu/kauci/rozpad nájmu edituje přes STÁVAJÍCÍ endpoint /smlouvy
// (PATCH), ne přes nemovitosti-jednotky - smlouva je pořád vedená v
// Registru smluv, appka tu jen appce dá pohodlnou zkratku k jejím
// nejdůležitějším polím z kontextu konkrétní jednotky.
// Nájemní smlouvy bytu (přestavěno ve v4.57).
//
// Do v4.56 tu bylo `.find()` - u bytu rozděleného mezi víc nájemníků
// (Holečkova 1a/1b) se tedy ukázala jen první smlouva a o ostatních člověk
// z karty vůbec nevěděl. Teď se vykreslí VŠECHNY a u každé jde vybrat, na
// kterou nájemní jednotku míří. **Nevracet zpátky na `.find()`.**
//
// `najemniJednotky` chodí zvenčí (načítá je nactiDetailyJednotky společně
// s klíči a měřidly), ať se kvůli roletce nevolá API podruhé.
function vykresliSekciSmlouva(el, j, najemniJednotky) {
  el.innerHTML = '';
  const jednotky = najemniJednotky || [];

  const nadpis = document.createElement('h4');
  nadpis.textContent = 'Nájemní smlouvy a kauce';
  el.appendChild(nadpis);

  const smlouvy = najdiNajemniSmlouvy(j);
  if (smlouvy.length === 0) {
    const info = document.createElement('p');
    info.className = 'popis';
    info.textContent = 'Žádná aktivní nájemní smlouva pro tohle středisko – založte ji v záložce Registr smluv '
      + '(Typ „Nájem“, Středisko „' + j.Stredisko + '“).';
    el.appendChild(info);
    return;
  }

  smlouvy.forEach((smlouva) => vykresliJednuSmlouvu(el, j, smlouva, jednotky, smlouvy.length > 1));
}

function vykresliJednuSmlouvu(el, j, smlouva, najemniJednotky, jeVic) {
  const blok = document.createElement('div');
  // Oddělovač mezi smlouvami dává smysl jen tehdy, když je jich víc -
  // u jediné smlouvy by to byla čára bez důvodu.
  if (jeVic) blok.className = 'smlouva-v-jednotce';

  if (jeVic) {
    const kdo = document.createElement('div');
    kdo.className = 'smlouva-v-jednotce-hlava';
    kdo.textContent = smlouva.Druha_strana || '(nájemník nevyplněn)';
    const cislo = document.createElement('span');
    cislo.className = 'jednotka-prehled-popisek';
    cislo.textContent = smlouva.Cislo_smlouvy || '';
    kdo.appendChild(cislo);
    blok.appendChild(kdo);
  }

  function pole(mriz, popisek, hodnota, typ) {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = popisek;
    const input = document.createElement('input');
    input.type = typ || 'text';
    input.value = hodnota || '';
    input.style.fontSize = '13px';
    wrap.appendChild(label);
    wrap.appendChild(input);
    mriz.appendChild(wrap);
    return input;
  }

  const mriz = document.createElement('div');
  mriz.className = 'mriz-2';

  // Na kterou nájemní jednotku smlouva míří. Roletka se ukáže jen tehdy,
  // když byt vůbec nějaké nájemní jednotky má - u nerozděleného bytu by to
  // byla prázdná nabídka a jen by mátla.
  let selectJednotka = null;
  if (najemniJednotky.length > 0) {
    const wrapJednotka = document.createElement('div');
    const labelJednotka = document.createElement('label');
    labelJednotka.textContent = 'Nájemní jednotka';
    selectJednotka = document.createElement('select');
    selectJednotka.style.fontSize = '13px';
    selectJednotka.innerHTML = '<option value="">— celý byt —</option>' + najemniJednotky.map((n) => {
      const popis = (n.Nazev || n.Kod || '(bez názvu)') + (n.Plocha_m2 ? ' · ' + n.Plocha_m2 + ' m²' : '');
      return '<option value="' + escapeAttr(n.ID) + '"'
        + (n.ID === smlouva.Najemni_jednotka_ID ? ' selected' : '') + '>' + escapeHtml(popis) + '</option>';
    }).join('');
    wrapJednotka.appendChild(labelJednotka);
    wrapJednotka.appendChild(selectJednotka);
    mriz.appendChild(wrapJednotka);

    // Prázdné místo, ať čísla níž zůstanou zarovnaná ve dvou sloupcích.
    mriz.appendChild(document.createElement('div'));
  }

  const vstupCistyNajem = pole(mriz, 'Čistý nájem', smlouva.Cisty_najem);
  const vstupZaloha = pole(mriz, 'Záloha na služby', smlouva.Zaloha_na_sluzby);
  const vstupKauceCastka = pole(mriz, 'Kauce – částka', smlouva.Kauce_castka);
  const vstupKauceDatum = pole(mriz, 'Kauce – datum přijetí', smlouva.Kauce_datum_prijeti, 'date');

  const wrapStav = document.createElement('div');
  const labelStav = document.createElement('label');
  labelStav.textContent = 'Kauce – stav';
  const selectStav = document.createElement('select');
  selectStav.style.fontSize = '13px';
  selectStav.innerHTML = MOZNOSTI_KAUCE_STAV.map((s) =>
    '<option value="' + escapeAttr(s) + '"' + (s === smlouva.Kauce_stav ? ' selected' : '') + '>' + escapeHtml(s) + '</option>'
  ).join('');
  wrapStav.appendChild(labelStav);
  wrapStav.appendChild(selectStav);
  mriz.appendChild(wrapStav);

  const vstupKaucePoznamka = pole(mriz, 'Kauce – poznámka', smlouva.Kauce_poznamka);

  // (v4.57) Kdy a kolik se z kauce skutečně vrátilo. Appka to nevyplňuje
  // sama z výpočtu ve Vyúčtování - vrácení peněz je skutek, ne návrh.
  const vstupVracenoDatum = pole(mriz, 'Kauce – vráceno dne', smlouva.Kauce_vraceno_datum, 'date');
  const vstupVracenoCastka = pole(mriz, 'Kauce – vrácená částka', smlouva.Kauce_vraceno_castka);

  blok.appendChild(mriz);

  const info = document.createElement('p');
  info.className = 'popis';
  const aktualizujInfo = () => {
    info.textContent = 'Appka celkovou očekávanou platbu počítá jako součet čistého nájmu a zálohy: ' +
      formatCastkaSMenou(parsujCastkuZListu(vstupCistyNajem.value) + parsujCastkuZListu(vstupZaloha.value), smlouva.Mena);
  };
  aktualizujInfo();
  vstupCistyNajem.addEventListener('input', aktualizujInfo);
  vstupZaloha.addEventListener('input', aktualizujInfo);
  blok.appendChild(info);

  const tlacitko = document.createElement('button');
  tlacitko.className = 'maly sekundarni akce-potvrdit';
  tlacitko.textContent = 'Uložit smlouvu';
  tlacitko.onclick = async () => {
    tlacitko.disabled = true;
    const zmeny = {
      Cisty_najem: vstupCistyNajem.value.trim(),
      Zaloha_na_sluzby: vstupZaloha.value.trim(),
      Kauce_castka: vstupKauceCastka.value.trim(),
      Kauce_datum_prijeti: vstupKauceDatum.value,
      Kauce_stav: selectStav.value,
      Kauce_poznamka: vstupKaucePoznamka.value.trim(),
      Kauce_vraceno_datum: vstupVracenoDatum.value,
      Kauce_vraceno_castka: vstupVracenoCastka.value.trim(),
    };
    if (selectJednotka) zmeny.Najemni_jednotka_ID = selectJednotka.value;
    try {
      await zavolejApi('/smlouvy', { method: 'PATCH', body: JSON.stringify({ id: smlouva.ID, zmeny }) });
      // Paměť se srovná bez znovunačtení celé záložky - kdyby se volalo
      // nactiNemovitosti(), sbalila by se karta, ve které člověk pracuje
      // (stejný důvod jako u ulozJednotku výš).
      Object.keys(zmeny).forEach((klic) => { smlouva[klic] = zmeny[klic]; });
      tlacitko.textContent = 'Uloženo';
      setTimeout(() => { tlacitko.textContent = 'Uložit smlouvu'; tlacitko.disabled = false; }, 1500);
    } catch (e) {
      alert('Nepodařilo se uložit smlouvu: ' + e.message);
      tlacitko.disabled = false;
    }
  };
  blok.appendChild(tlacitko);
  el.appendChild(blok);
}

// Nájemní jednotky bytu (v4.57).
//
// Tabulka podle snímku z MojeNájmy, který Jan poslal jako vzor: kód a
// název, stav, nájemník, dispozice, podlaží, plocha, měsíčně celkem.
// Nájemník a částka se NEZADÁVAJÍ tady - berou se z nájemní smlouvy, která
// na jednotku ukazuje. Kdyby se psaly na dvě místa, za měsíc se rozejdou.
function vykresliSekciNajemniJednotky(el, j, jednotky, smlouvy) {
  const wrap = document.createElement('div');

  const nadpis = document.createElement('h4');
  nadpis.textContent = 'Nájemní jednotky (' + jednotky.length + ')';
  wrap.appendChild(nadpis);

  const napoveda = document.createElement('p');
  napoveda.className = 'popis';
  napoveda.style.marginTop = '0';
  napoveda.textContent = 'Části bytu pronajímané zvlášť. Náklady bytu se mezi ně dělí podle plochy, '
    + 'takže plocha není jen informace – bez ní vyúčtování spočítat nejde.';
  wrap.appendChild(napoveda);

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Kód</th><th>Název</th><th>Stav</th><th>Nájemník</th>'
    + '<th>Dispozice</th><th>Podlaží</th><th>Plocha (m²)</th><th>Podíl</th><th>Vybavení</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');

  // Podíly se počítají jednou pro celý byt, ať se u každého řádku neopakuje
  // stejný výpočet. `null` = některé jednotce chybí plocha.
  const podily = spocitejPodilyProZobrazeni(jednotky);

  jednotky.forEach((n) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Kód"></td><td data-label="Název"></td><td data-label="Stav"></td>'
      + '<td data-label="Nájemník"></td><td data-label="Dispozice"></td><td data-label="Podlaží"></td>'
      + '<td data-label="Plocha (m²)"></td><td data-label="Podíl"></td><td data-label="Vybavení"></td>'
      + '<td data-label="Akce"></td>';

    const vKod = document.createElement('input'); vKod.type = 'text'; vKod.value = n.Kod || ''; vKod.style.fontSize = '13px'; vKod.style.width = '80px';
    const vNazev = document.createElement('input'); vNazev.type = 'text'; vNazev.value = n.Nazev || ''; vNazev.style.fontSize = '13px';
    const vStav = document.createElement('select'); vStav.style.fontSize = '13px';
    vStav.innerHTML = MOZNOSTI_STAV_JEDNOTKY.map((s) =>
      '<option value="' + escapeAttr(s) + '"' + (s === n.Stav ? ' selected' : '') + '>' + escapeHtml(s) + '</option>').join('');
    const vDispozice = document.createElement('input'); vDispozice.type = 'text'; vDispozice.value = n.Dispozice || ''; vDispozice.style.fontSize = '13px'; vDispozice.style.width = '80px';
    const vPodlazi = document.createElement('input'); vPodlazi.type = 'text'; vPodlazi.value = n.Podlazi || ''; vPodlazi.style.fontSize = '13px'; vPodlazi.style.width = '80px';
    const vPlocha = document.createElement('input'); vPlocha.type = 'text'; vPlocha.value = n.Plocha_m2 || ''; vPlocha.style.fontSize = '13px'; vPlocha.style.width = '70px';
    const vVybaveni = document.createElement('input'); vVybaveni.type = 'text'; vVybaveni.value = n.Vybaveni || ''; vVybaveni.style.fontSize = '13px';

    // Nájemník se bere ze smlouvy, která na tuhle jednotku ukazuje - proto
    // je to text, ne políčko. Měnit se má v sekci Nájemní smlouvy.
    const smlouvaJednotky = (smlouvy || []).find((s) => s.Najemni_jednotka_ID === n.ID);
    const najemnik = document.createElement('span');
    if (smlouvaJednotky) {
      najemnik.textContent = smlouvaJednotky.Druha_strana || '(nevyplněn)';
      najemnik.title = 'Ze smlouvy ' + (smlouvaJednotky.Cislo_smlouvy || '');
    } else {
      najemnik.textContent = '–';
      najemnik.className = 'jednotka-prehled-prazdno';
      najemnik.title = 'Žádná nájemní smlouva neukazuje na tuhle jednotku.';
    }

    const podil = document.createElement('span');
    if (podily && podily[n.ID] !== undefined) {
      podil.textContent = Math.round(podily[n.ID] * 100) + ' %';
      podil.title = 'Podíl na nákladech bytu, spočítaný z plochy.';
    } else {
      podil.textContent = '–';
      podil.className = 'jednotka-prehled-prazdno';
      podil.title = 'Podíl nejde spočítat, dokud nemají plochu všechny nájemní jednotky bytu.';
    }

    tr.children[0].appendChild(vKod);
    tr.children[1].appendChild(vNazev);
    tr.children[2].appendChild(vStav);
    tr.children[3].appendChild(najemnik);
    tr.children[4].appendChild(vDispozice);
    tr.children[5].appendChild(vPodlazi);
    tr.children[6].appendChild(vPlocha);
    tr.children[7].appendChild(podil);
    tr.children[8].appendChild(vVybaveni);

    const btnUlozit = document.createElement('button');
    btnUlozit.className = 'maly sekundarni';
    btnUlozit.textContent = 'Uložit';
    btnUlozit.onclick = () => ulozDetailPolozku('najemni_jednotky', n.ID, {
      Kod: vKod.value.trim(), Nazev: vNazev.value.trim(), Stav: vStav.value,
      Dispozice: vDispozice.value.trim(), Podlazi: vPodlazi.value.trim(),
      Plocha_m2: vPlocha.value.trim(), Vybaveni: vVybaveni.value.trim(),
    }, btnUlozit, j);
    tr.children[9].appendChild(btnUlozit);

    const btnSmazat = document.createElement('button');
    btnSmazat.className = 'maly sekundarni akce-smazat';
    btnSmazat.style.marginLeft = '6px';
    btnSmazat.textContent = 'Smazat';
    btnSmazat.onclick = () => smazDetailPolozku('najemni_jednotky', n.ID, j, btnSmazat);
    tr.children[9].appendChild(btnSmazat);

    telo.appendChild(tr);
  });

  if (jednotky.length === 0) {
    telo.innerHTML = '<tr><td colspan="10" class="nacitani">Byt zatím není rozdělený – '
      + 'počítá se jako jedna celá jednotka.</td></tr>';
  }
  tabulka.appendChild(telo);
  wrap.appendChild(tabulka);

  // Varování, když plocha někde chybí. Appka to napíše dřív, než se o to
  // člověk pokusí ve Vyúčtování a dostane chybu.
  if (jednotky.length > 1 && !podily) {
    const varovani = document.createElement('div');
    varovani.className = 'zprava varovani';
    varovani.textContent = 'U některé nájemní jednotky chybí plocha. Dokud ji nedoplníte, '
      + 'appka nespočítá vyúčtování – náklady bytu se dělí právě podle plochy.';
    wrap.appendChild(varovani);
  }

  const pridatWrap = document.createElement('div');
  pridatWrap.style.marginTop = '8px';
  const nKod = document.createElement('input'); nKod.type = 'text'; nKod.placeholder = 'Kód (HOL01a)'; nKod.style.fontSize = '13px'; nKod.style.width = '110px';
  const nNazev = document.createElement('input'); nNazev.type = 'text'; nNazev.placeholder = 'Název (01a)'; nNazev.style.fontSize = '13px'; nNazev.style.width = '110px';
  const nDispozice = document.createElement('input'); nDispozice.type = 'text'; nDispozice.placeholder = 'Dispozice'; nDispozice.style.fontSize = '13px'; nDispozice.style.width = '90px';
  const nPlocha = document.createElement('input'); nPlocha.type = 'text'; nPlocha.placeholder = 'Plocha m²'; nPlocha.style.fontSize = '13px'; nPlocha.style.width = '90px';
  const btnPridat = document.createElement('button');
  btnPridat.className = 'maly sekundarni';
  btnPridat.textContent = 'Přidat nájemní jednotku';
  btnPridat.onclick = async () => {
    if (!nKod.value.trim() && !nNazev.value.trim()) { alert('Zadejte aspoň kód nebo název.'); return; }
    btnPridat.disabled = true;
    try {
      await zavolejApi('/nemovitosti-detaily?entita=najemni_jednotky', {
        method: 'POST',
        body: JSON.stringify({
          Stredisko: j.Stredisko, Kod: nKod.value.trim(), Nazev: nNazev.value.trim(),
          Dispozice: nDispozice.value.trim(), Plocha_m2: nPlocha.value.trim(),
          Stav: MOZNOSTI_STAV_JEDNOTKY[0],
        }),
      });
      await obnovDetailySekce(j);
    } catch (e) {
      alert('Nepodařilo se přidat nájemní jednotku: ' + e.message);
      btnPridat.disabled = false;
    }
  };
  pridatWrap.appendChild(nKod); pridatWrap.appendChild(nNazev);
  pridatWrap.appendChild(nDispozice); pridatWrap.appendChild(nPlocha); pridatWrap.appendChild(btnPridat);
  wrap.appendChild(pridatWrap);

  el.appendChild(wrap);
}

// Kopie výpočtu podílů z lib/vyuctovaniPodily.js. Appka nemá build krok,
// prohlížeč si `require` nedá - musí zůstat přesně synchronní s tou
// knihovnou (testy to hlídají). Vrací mapu ID → podíl, nebo null, když
// některé jednotce chybí plocha.
function spocitejPodilyProZobrazeni(jednotky) {
  if (!jednotky || jednotky.length === 0) return null;
  const plochy = jednotky.map((n) => {
    const puvodni = String(n.Plocha_m2 === null || n.Plocha_m2 === undefined ? '' : n.Plocha_m2);
    // Záporná plocha se odmítá celá - jinak by z "-5" zbylo "5". Stejné
    // pravidlo jako v lib/vyuctovaniPodily.js.
    if (puvodni.indexOf('-') !== -1) return { ID: n.ID, plocha: 0 };
    const text = puvodni.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    const cislo = parseFloat(text);
    return { ID: n.ID, plocha: Number.isFinite(cislo) && cislo > 0 ? cislo : 0 };
  });
  if (plochy.some((p) => p.plocha <= 0)) return null;
  const celkem = plochy.reduce((s, p) => s + p.plocha, 0);
  if (celkem <= 0) return null;
  const mapa = {};
  plochy.forEach((p) => { mapa[p.ID] = p.plocha / celkem; });
  return mapa;
}

async function nactiDetailyJednotky(el, j) {
  el.innerHTML = '<div class="nacitani">Načítám…</div>';
  try {
    // Kódy appka načítá s .catch() na prázdno: list Pristupove_kody vzniká
    // až po novém /api/setup (v4.53) a appka nesmí kvůli němu shodit celý
    // detail jednotky - do té doby se sekce prostě ukáže prázdná.
    const [dataKlice, dataKody, dataNajemni, dataMeridla, dataRevize] = await Promise.all([
      zavolejApi('/nemovitosti-detaily?entita=klice&stredisko=' + encodeURIComponent(j.Stredisko), { method: 'GET' }),
      zavolejApi('/nemovitosti-detaily?entita=kody&stredisko=' + encodeURIComponent(j.Stredisko), { method: 'GET' })
        .catch(() => ({ polozky: [] })),
      // Stejné ošetření jako u kódů: list Najemni_jednotky vzniká až po
      // novém /api/setup (v4.57) a nesmí kvůli němu spadnout celý detail.
      zavolejApi('/nemovitosti-detaily?entita=najemni_jednotky&stredisko=' + encodeURIComponent(j.Stredisko), { method: 'GET' })
        .catch(() => ({ polozky: [] })),
      zavolejApi('/nemovitosti-detaily?entita=meridla&stredisko=' + encodeURIComponent(j.Stredisko), { method: 'GET' }),
      zavolejApi('/nemovitosti-detaily?entita=revize&stredisko=' + encodeURIComponent(j.Stredisko), { method: 'GET' }),
    ]);
    const meridla = dataMeridla.polozky || [];
    let odecty = [];
    if (meridla.length > 0) {
      const vysledkyOdecty = await Promise.all(meridla.map((m) =>
        zavolejApi('/nemovitosti-detaily?entita=meridla_odecty&meridlo_id=' + encodeURIComponent(m.ID), { method: 'GET' })
          .catch(() => ({ polozky: [] }))
      ));
      odecty = vysledkyOdecty.reduce((vse, v) => vse.concat(v.polozky || []), []);
    }

    el.innerHTML = '';
    const najemniJednotky = dataNajemni.polozky || [];
    // Nájemní jednotky jsou nad klíči schválně: je to členění bytu, tedy
    // věc, kterou člověk potřebuje vidět dřív než seznam klíčů.
    vykresliSekciNajemniJednotky(el, j, najemniJednotky, najdiNajemniSmlouvy(j));
    // Sekce se smlouvami se překreslí až tady, protože teprve teď appka
    // zná nájemní jednotky pro roletku „Nájemní jednotka".
    const sekceSmlouva = document.getElementById('nem-smlouva-' + j.ID);
    if (sekceSmlouva) vykresliSekciSmlouva(sekceSmlouva, j, najemniJednotky);
    vykresliSekciKlice(el, j, dataKlice.polozky || []);
    vykresliSekciKody(el, j, dataKody.polozky || []);
    vykresliSekciMeridla(el, j, meridla, odecty);
    vykresliSekciRevize(el, j, dataRevize.polozky || []);
  } catch (e) {
    el.innerHTML = '<div class="zprava chyba">Nepodařilo se načíst detaily: ' + escapeHtml(e.message) + '</div>';
  }
}

function obnovDetailySekce(j) {
  const el = document.getElementById('nem-detaily-' + j.ID);
  if (el) return nactiDetailyJednotky(el, j);
  return Promise.resolve();
}

async function ulozDetailPolozku(entita, id, zmeny, tlacitko, j) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/nemovitosti-detaily?entita=' + entita, { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    await obnovDetailySekce(j);
  } catch (e) {
    alert('Nepodařilo se uložit: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazDetailPolozku(entita, id, j, tlacitko) {
  if (!confirm('Opravdu smazat tenhle záznam?')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/nemovitosti-detaily?entita=' + entita + '&id=' + encodeURIComponent(id), { method: 'DELETE' });
    await obnovDetailySekce(j);
  } catch (e) {
    alert('Nepodařilo se smazat: ' + e.message);
    tlacitko.disabled = false;
  }
}

function vykresliSekciKlice(el, j, klice) {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<h4>Klíče</h4>';

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Typ</th><th>Počet celkem</th><th>Držitel</th><th>Vydáno</th>'
    + '<th>Vráceno</th><th>Poznámka</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');

  klice.forEach((k) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Typ"></td><td data-label="Počet celkem"></td><td data-label="Držitel"></td>'
      + '<td data-label="Vydáno"></td><td data-label="Vráceno"></td><td data-label="Poznámka"></td><td data-label="Akce"></td>';

    const vTyp = document.createElement('input'); vTyp.type = 'text'; vTyp.value = k.Typ_klice || ''; vTyp.style.fontSize = '13px';
    const vPocet = document.createElement('input'); vPocet.type = 'text'; vPocet.value = k.Pocet_celkem || ''; vPocet.style.fontSize = '13px'; vPocet.style.width = '60px';
    const vDrzitel = document.createElement('input'); vDrzitel.type = 'text'; vDrzitel.value = k.Drzitel || ''; vDrzitel.style.fontSize = '13px';
    const vVydano = document.createElement('input'); vVydano.type = 'date'; vVydano.value = k.Datum_vydani || ''; vVydano.style.fontSize = '13px';
    const vVraceno = document.createElement('input'); vVraceno.type = 'date'; vVraceno.value = k.Datum_vraceni || ''; vVraceno.style.fontSize = '13px';
    const vPoznamka = document.createElement('input'); vPoznamka.type = 'text'; vPoznamka.value = k.Poznamka || ''; vPoznamka.style.fontSize = '13px';
    tr.children[0].appendChild(vTyp); tr.children[1].appendChild(vPocet); tr.children[2].appendChild(vDrzitel);
    tr.children[3].appendChild(vVydano); tr.children[4].appendChild(vVraceno); tr.children[5].appendChild(vPoznamka);

    const btnUlozit = document.createElement('button');
    btnUlozit.className = 'maly sekundarni';
    btnUlozit.textContent = 'Uložit';
    btnUlozit.onclick = () => ulozDetailPolozku('klice', k.ID, {
      Typ_klice: vTyp.value.trim(), Pocet_celkem: vPocet.value.trim(), Drzitel: vDrzitel.value.trim(),
      Datum_vydani: vVydano.value, Datum_vraceni: vVraceno.value, Poznamka: vPoznamka.value.trim(),
    }, btnUlozit, j);
    tr.children[6].appendChild(btnUlozit);

    const btnSmazat = document.createElement('button');
    btnSmazat.className = 'maly sekundarni akce-smazat';
    btnSmazat.style.marginLeft = '6px';
    btnSmazat.textContent = 'Smazat';
    btnSmazat.onclick = () => smazDetailPolozku('klice', k.ID, j, btnSmazat);
    tr.children[6].appendChild(btnSmazat);

    telo.appendChild(tr);
  });
  if (klice.length === 0) telo.innerHTML = '<tr><td colspan="7" class="nacitani">Zatím žádné klíče.</td></tr>';
  tabulka.appendChild(telo);
  wrap.appendChild(tabulka);

  const pridatWrap = document.createElement('div');
  pridatWrap.style.marginTop = '8px';
  const nTyp = document.createElement('input'); nTyp.type = 'text'; nTyp.placeholder = 'Typ (Byt/Vchod/Sklep/…)'; nTyp.style.fontSize = '13px';
  const nPocet = document.createElement('input'); nPocet.type = 'text'; nPocet.placeholder = 'Počet celkem'; nPocet.style.fontSize = '13px'; nPocet.style.width = '90px';
  const nDrzitel = document.createElement('input'); nDrzitel.type = 'text'; nDrzitel.placeholder = 'Držitel'; nDrzitel.style.fontSize = '13px';
  const btnPridat = document.createElement('button');
  btnPridat.className = 'maly sekundarni';
  btnPridat.textContent = 'Přidat klíč';
  btnPridat.onclick = async () => {
    if (!nTyp.value.trim()) { alert('Zadejte typ klíče.'); return; }
    btnPridat.disabled = true;
    try {
      await zavolejApi('/nemovitosti-detaily?entita=klice', {
        method: 'POST',
        body: JSON.stringify({ Stredisko: j.Stredisko, Typ_klice: nTyp.value.trim(), Pocet_celkem: nPocet.value.trim(), Drzitel: nDrzitel.value.trim() }),
      });
      await obnovDetailySekce(j);
    } catch (e) {
      alert('Nepodařilo se přidat klíč: ' + e.message);
      btnPridat.disabled = false;
    }
  };
  pridatWrap.appendChild(nTyp); pridatWrap.appendChild(nPocet); pridatWrap.appendChild(nDrzitel); pridatWrap.appendChild(btnPridat);
  wrap.appendChild(pridatWrap);

  el.appendChild(wrap);
}

// Přístupové kódy k závoře/vratům (od v4.53, zadání Jana 2026-08-05:
// "k nemovitosti evidovat také přístupové kódy k závoře, může jich být
// více"). Vlastní sekce hned pod Klíči - proč ne uvnitř Klíčů viz komentář
// v lib/nemovitostiDetailySchema.js.
//
// Kód se zobrazuje ČITELNĚ (Janova volba "Rovnou vidět"), monospace ať se
// dá spolehlivě přečíst do telefonu. **Nemaskovat.**
//
// Neplatné kódy appka nemaže, jen je zeslabí (tr.radek-kod-neplatny) a
// srovná na konec seznamu (Janova volba "Nechat se stavem Neplatný") - ať
// je za rok dohledatelné, kdo jaký kód znal. Stav appka NIKDY nepřepíná
// sama: spočítá, kolik kódů má Platnost_do v minulosti a napíše to, ale
// přepnutí nechá na člověku (appka navrhne, člověk potvrdí).
function vykresliSekciKody(el, j, kody) {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<h4>Přístupové kódy</h4>';

  const dnes = new Date().toISOString().slice(0, 10);

  // Platné nahoru, neplatné dolů; uvnitř skupiny appka drží pořadí z listu.
  const serazene = kody.slice().sort((a, b) => {
    const na = a.Stav === 'Neplatný' ? 1 : 0;
    const nb = b.Stav === 'Neplatný' ? 1 : 0;
    return na - nb;
  });

  const tabulka = document.createElement('table');
  tabulka.className = 'tabulka-kodu';
  tabulka.innerHTML = '<thead><tr><th></th><th>Název</th><th>Umístění</th><th>Kód</th><th>Platnost od</th>'
    + '<th>Platnost do</th><th>Předáno komu</th><th>Stav</th><th>Poznámka</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');

  serazene.forEach((k) => {
    const tr = document.createElement('tr');
    if (k.Stav === 'Neplatný') tr.className = 'radek-kod-neplatny';
    tr.innerHTML = '<td class="kod-hlava"></td>'
      + '<td data-label="Název"></td><td data-label="Umístění"></td><td data-label="Kód"></td>'
      + '<td data-label="Platnost od"></td><td data-label="Platnost do"></td><td data-label="Předáno komu"></td>'
      + '<td data-label="Stav"></td><td data-label="Poznámka"></td><td data-label="Akce"></td>';

    const vNazev = document.createElement('input'); vNazev.type = 'text'; vNazev.value = k.Nazev || ''; vNazev.style.fontSize = '13px';
    const vUmisteni = document.createElement('input'); vUmisteni.type = 'text'; vUmisteni.value = k.Umisteni || ''; vUmisteni.style.fontSize = '13px';
    const vKod = document.createElement('input'); vKod.type = 'text'; vKod.value = k.Kod || '';
    vKod.style.fontSize = '13px'; vKod.className = 'kod-hodnota';
    const vOd = document.createElement('input'); vOd.type = 'date'; vOd.value = k.Platnost_od || ''; vOd.style.fontSize = '13px';
    const vDo = document.createElement('input'); vDo.type = 'date'; vDo.value = k.Platnost_do || ''; vDo.style.fontSize = '13px';
    const vPredano = document.createElement('input'); vPredano.type = 'text'; vPredano.value = k.Predano_komu || ''; vPredano.style.fontSize = '13px';
    const vStav = document.createElement('select'); vStav.style.fontSize = '13px';
    vStav.innerHTML = MOZNOSTI_STAV_KODU.map((s) =>
      '<option value="' + escapeAttr(s) + '"' + (s === (k.Stav || 'Platný') ? ' selected' : '') + '>' + escapeHtml(s) + '</option>'
    ).join('');
    const vPozn = document.createElement('input'); vPozn.type = 'text'; vPozn.value = k.Poznamka || ''; vPozn.style.fontSize = '13px';

    tr.children[1].appendChild(vNazev); tr.children[2].appendChild(vUmisteni); tr.children[3].appendChild(vKod);
    tr.children[4].appendChild(vOd); tr.children[5].appendChild(vDo); tr.children[6].appendChild(vPredano);
    tr.children[7].appendChild(vStav); tr.children[8].appendChild(vPozn);

    const poPlatnosti = k.Stav !== 'Neplatný' && k.Platnost_do && k.Platnost_do < dnes;

    // Appka u platného kódu s prošlou platností napíše rovnou k řádku, že
    // je po datu - ale stav nepřepne, to je na člověku.
    if (poPlatnosti) {
      const znacka = document.createElement('div');
      znacka.className = 'kod-po-platnosti';
      znacka.textContent = 'po platnosti';
      tr.children[5].appendChild(znacka);
    }

    // Sbalená hlavička řádku - appka ji ukazuje JEN na mobilu (Janova volba
    // 2026-08-05 *"Na mobilu zabalit do řádku"*). Osm políček pod sebou je
    // na 320 px dlouhé rolování a hlavní důvod, proč se sem Jan dívá, je
    // přečíst kód do telefonu - proto je v hlavičce Název a Kód, zbytek se
    // rozklikne. Na desktopu je hlavička skrytá a tabulka zůstává tabulkou
    // (viz .tabulka-kodu v style.css). **Neukazovat hlavičku na desktopu** -
    // duplikovala by první sloupec.
    const hlava = tr.children[0];
    hlava.innerHTML = '<span class="kod-sipka">›</span>';
    const popisek = document.createElement('span');
    popisek.className = 'kod-hlava-text';
    // Umístění musí být v hlavičce taky: u jedné nemovitosti bývá závor víc
    // a "Závora" vs. "Závora" sám o sobě je nerozliší (proto ten sloupec
    // vůbec existuje, viz lib/nemovitostiDetailySchema.js).
    popisek.innerHTML = '<strong>' + escapeHtml(k.Nazev || '(bez názvu)') + '</strong>'
      + (k.Umisteni ? '<span class="kod-hlava-umisteni">' + escapeHtml(k.Umisteni) + '</span>' : '')
      + '<span class="kod-hlava-kod">' + escapeHtml(k.Kod || '') + '</span>';
    hlava.appendChild(popisek);
    if (k.Stav === 'Neplatný') {
      const chip = document.createElement('span');
      chip.className = 'stav-chip stav-neaktivni';
      chip.textContent = 'Neplatný';
      hlava.appendChild(chip);
    } else if (poPlatnosti) {
      const chip = document.createElement('span');
      chip.className = 'stav-chip stav-ke-kontrole';
      chip.textContent = 'po platnosti';
      hlava.appendChild(chip);
    }
    hlava.onclick = () => tr.classList.toggle('rozbaleno');

    const btnU = document.createElement('button'); btnU.className = 'maly sekundarni'; btnU.textContent = 'Uložit';
    btnU.onclick = () => ulozDetailPolozku('kody', k.ID, {
      Nazev: vNazev.value.trim(), Umisteni: vUmisteni.value.trim(), Kod: vKod.value.trim(),
      Platnost_od: vOd.value, Platnost_do: vDo.value, Predano_komu: vPredano.value.trim(),
      Stav: vStav.value, Poznamka: vPozn.value.trim(),
    }, btnU, j);
    const btnS = document.createElement('button'); btnS.className = 'maly sekundarni akce-smazat'; btnS.style.marginLeft = '6px'; btnS.textContent = 'Smazat';
    btnS.onclick = () => smazDetailPolozku('kody', k.ID, j, btnS);
    tr.children[9].appendChild(btnU); tr.children[9].appendChild(btnS);

    telo.appendChild(tr);
  });
  if (serazene.length === 0) telo.innerHTML = '<tr><td colspan="10" class="nacitani">Zatím žádné přístupové kódy.</td></tr>';
  tabulka.appendChild(telo);
  wrap.appendChild(tabulka);

  const prosle = serazene.filter((k) => k.Stav !== 'Neplatný' && k.Platnost_do && k.Platnost_do < dnes);
  if (prosle.length > 0) {
    const varovani = document.createElement('div');
    varovani.className = 'zprava varovani';
    varovani.style.marginTop = '6px';
    varovani.textContent = 'Appka eviduje ' + prosle.length + ' kód/kódy s prošlou platností, ale pořád ve stavu „Platný“. '
      + 'Stav appka sama nepřepne – přepněte ho na „Neplatný“, až kód opravdu přestane fungovat.';
    wrap.appendChild(varovani);
  }

  const pridatWrap = document.createElement('div');
  pridatWrap.style.marginTop = '8px';
  const nNazev = document.createElement('input'); nNazev.type = 'text'; nNazev.placeholder = 'Název (Závora, Vrata garáž…)'; nNazev.style.fontSize = '13px';
  const nUmisteni = document.createElement('input'); nUmisteni.type = 'text'; nUmisteni.placeholder = 'Umístění (hlavní vjezd…)'; nUmisteni.style.fontSize = '13px';
  const nKod = document.createElement('input'); nKod.type = 'text'; nKod.placeholder = 'Kód'; nKod.style.fontSize = '13px'; nKod.className = 'kod-hodnota';
  const nDo = document.createElement('input'); nDo.type = 'date'; nDo.style.fontSize = '13px';
  const btnPridat = document.createElement('button');
  btnPridat.className = 'maly sekundarni';
  btnPridat.textContent = 'Přidat kód';
  btnPridat.onclick = async () => {
    if (!nNazev.value.trim()) { alert('Zadejte název – co ten kód otevírá.'); return; }
    if (!nKod.value.trim()) { alert('Zadejte kód.'); return; }
    btnPridat.disabled = true;
    try {
      await zavolejApi('/nemovitosti-detaily?entita=kody', {
        method: 'POST',
        body: JSON.stringify({
          Stredisko: j.Stredisko, Nazev: nNazev.value.trim(), Umisteni: nUmisteni.value.trim(),
          Kod: nKod.value.trim(), Platnost_od: dnes, Platnost_do: nDo.value, Stav: 'Platný',
        }),
      });
      await obnovDetailySekce(j);
    } catch (e) {
      alert('Nepodařilo se přidat kód: ' + e.message);
      btnPridat.disabled = false;
    }
  };
  pridatWrap.appendChild(nNazev); pridatWrap.appendChild(nUmisteni); pridatWrap.appendChild(nKod);
  pridatWrap.appendChild(nDo); pridatWrap.appendChild(btnPridat);
  wrap.appendChild(pridatWrap);

  el.appendChild(wrap);
}

function vykresliSekciMeridla(el, j, meridla, odecty) {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<h4>Měřidla</h4>';

  meridla.forEach((m) => {
    const box = document.createElement('div');
    box.style.marginBottom = '10px';
    box.style.paddingBottom = '10px';
    box.style.borderBottom = '1px dashed var(--barva-hranice)';

    const radek = document.createElement('div');
    const vTyp = document.createElement('select');
    vTyp.innerHTML = MOZNOSTI_TYP_MERIDLA.map((t) =>
      '<option value="' + escapeAttr(t) + '"' + (t === m.Typ ? ' selected' : '') + '>' + escapeHtml(t) + '</option>'
    ).join('');
    const vVyrobni = document.createElement('input'); vVyrobni.type = 'text'; vVyrobni.value = m.Vyrobni_cislo || ''; vVyrobni.placeholder = 'Výrobní číslo'; vVyrobni.style.fontSize = '13px';
    const vEan = document.createElement('input'); vEan.type = 'text'; vEan.value = m.EAN_EIC || ''; vEan.placeholder = 'EAN/EIC'; vEan.style.fontSize = '13px';
    const btnUlozitMeridlo = document.createElement('button');
    btnUlozitMeridlo.className = 'maly sekundarni';
    btnUlozitMeridlo.textContent = 'Uložit';
    btnUlozitMeridlo.onclick = () => ulozDetailPolozku('meridla', m.ID,
      { Typ: vTyp.value, Vyrobni_cislo: vVyrobni.value.trim(), EAN_EIC: vEan.value.trim() }, btnUlozitMeridlo, j);
    const btnSmazatMeridlo = document.createElement('button');
    btnSmazatMeridlo.className = 'maly sekundarni akce-smazat';
    btnSmazatMeridlo.style.marginLeft = '6px';
    btnSmazatMeridlo.textContent = 'Smazat měřidlo';
    btnSmazatMeridlo.onclick = () => smazDetailPolozku('meridla', m.ID, j, btnSmazatMeridlo);
    radek.appendChild(vTyp); radek.appendChild(vVyrobni); radek.appendChild(vEan);
    radek.appendChild(btnUlozitMeridlo); radek.appendChild(btnSmazatMeridlo);
    box.appendChild(radek);

    const odectyTohoto = odecty.filter((o) => o.Meridlo_ID === m.ID).sort((a, b) => (a.Datum || '').localeCompare(b.Datum || ''));
    const tabOdecty = document.createElement('table');
    tabOdecty.style.marginTop = '6px';
    tabOdecty.innerHTML = '<thead><tr><th>Datum odečtu</th><th>Stav</th><th>Poznámka</th><th>Akce</th></tr></thead>';
    const teloOdecty = document.createElement('tbody');
    odectyTohoto.forEach((o) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td data-label="Datum"></td><td data-label="Stav"></td><td data-label="Poznámka"></td><td data-label="Akce"></td>';
      const vDatum = document.createElement('input'); vDatum.type = 'date'; vDatum.value = o.Datum || ''; vDatum.style.fontSize = '13px';
      const vStav = document.createElement('input'); vStav.type = 'text'; vStav.value = o.Stav || ''; vStav.style.fontSize = '13px'; vStav.style.width = '90px';
      const vPozn = document.createElement('input'); vPozn.type = 'text'; vPozn.value = o.Poznamka || ''; vPozn.style.fontSize = '13px';
      tr.children[0].appendChild(vDatum); tr.children[1].appendChild(vStav); tr.children[2].appendChild(vPozn);
      const btnU = document.createElement('button'); btnU.className = 'maly sekundarni'; btnU.textContent = 'Uložit';
      btnU.onclick = () => ulozDetailPolozku('meridla_odecty', o.ID,
        { Datum: vDatum.value, Stav: vStav.value.trim(), Poznamka: vPozn.value.trim() }, btnU, j);
      const btnS = document.createElement('button'); btnS.className = 'maly sekundarni akce-smazat'; btnS.style.marginLeft = '6px'; btnS.textContent = 'Smazat';
      btnS.onclick = () => smazDetailPolozku('meridla_odecty', o.ID, j, btnS);
      tr.children[3].appendChild(btnU); tr.children[3].appendChild(btnS);
      teloOdecty.appendChild(tr);
    });
    if (odectyTohoto.length === 0) teloOdecty.innerHTML = '<tr><td colspan="4" class="nacitani">Zatím žádné odečty.</td></tr>';
    tabOdecty.appendChild(teloOdecty);
    box.appendChild(tabOdecty);

    const pridatOdecetWrap = document.createElement('div');
    pridatOdecetWrap.style.marginTop = '4px';
    const nDatum = document.createElement('input'); nDatum.type = 'date'; nDatum.style.fontSize = '13px';
    const nStav = document.createElement('input'); nStav.type = 'text'; nStav.placeholder = 'Stav'; nStav.style.fontSize = '13px'; nStav.style.width = '90px';
    const btnPridatOdecet = document.createElement('button');
    btnPridatOdecet.className = 'maly sekundarni';
    btnPridatOdecet.textContent = 'Přidat odečet';
    btnPridatOdecet.onclick = async () => {
      if (!nDatum.value || !nStav.value.trim()) { alert('Zadejte datum a stav odečtu.'); return; }
      btnPridatOdecet.disabled = true;
      try {
        await zavolejApi('/nemovitosti-detaily?entita=meridla_odecty', {
          method: 'POST',
          body: JSON.stringify({ Meridlo_ID: m.ID, Datum: nDatum.value, Stav: nStav.value.trim() }),
        });
        await obnovDetailySekce(j);
      } catch (e) {
        alert('Nepodařilo se přidat odečet: ' + e.message);
        btnPridatOdecet.disabled = false;
      }
    };
    pridatOdecetWrap.appendChild(nDatum); pridatOdecetWrap.appendChild(nStav); pridatOdecetWrap.appendChild(btnPridatOdecet);
    box.appendChild(pridatOdecetWrap);

    wrap.appendChild(box);
  });

  if (meridla.length === 0) {
    const prazdne = document.createElement('p');
    prazdne.className = 'popis';
    prazdne.textContent = 'Zatím žádná měřidla.';
    wrap.appendChild(prazdne);
  }

  const pridatMeridloWrap = document.createElement('div');
  pridatMeridloWrap.style.marginTop = '8px';
  const nTyp = document.createElement('select');
  nTyp.innerHTML = MOZNOSTI_TYP_MERIDLA.map((t) => '<option value="' + escapeAttr(t) + '">' + escapeHtml(t) + '</option>').join('');
  const nVyrobni = document.createElement('input'); nVyrobni.type = 'text'; nVyrobni.placeholder = 'Výrobní číslo'; nVyrobni.style.fontSize = '13px';
  const nEan = document.createElement('input'); nEan.type = 'text'; nEan.placeholder = 'EAN/EIC'; nEan.style.fontSize = '13px';
  const btnPridatMeridlo = document.createElement('button');
  btnPridatMeridlo.className = 'maly sekundarni';
  btnPridatMeridlo.textContent = 'Přidat měřidlo';
  btnPridatMeridlo.onclick = async () => {
    btnPridatMeridlo.disabled = true;
    try {
      await zavolejApi('/nemovitosti-detaily?entita=meridla', {
        method: 'POST',
        body: JSON.stringify({ Stredisko: j.Stredisko, Typ: nTyp.value, Vyrobni_cislo: nVyrobni.value.trim(), EAN_EIC: nEan.value.trim() }),
      });
      await obnovDetailySekce(j);
    } catch (e) {
      alert('Nepodařilo se přidat měřidlo: ' + e.message);
      btnPridatMeridlo.disabled = false;
    }
  };
  pridatMeridloWrap.appendChild(nTyp); pridatMeridloWrap.appendChild(nVyrobni); pridatMeridloWrap.appendChild(nEan); pridatMeridloWrap.appendChild(btnPridatMeridlo);
  wrap.appendChild(pridatMeridloWrap);

  el.appendChild(wrap);
}

function vykresliSekciRevize(el, j, revize) {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<h4>Revize</h4>';

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Typ revize</th><th>Datum revize</th><th>Platnost do</th><th>Poznámka</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');

  revize.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Typ"></td><td data-label="Datum revize"></td><td data-label="Platnost do"></td>'
      + '<td data-label="Poznámka"></td><td data-label="Akce"></td>';
    const vTyp = document.createElement('select');
    vTyp.innerHTML = MOZNOSTI_TYP_REVIZE.map((t) =>
      '<option value="' + escapeAttr(t) + '"' + (t === r.Typ_revize ? ' selected' : '') + '>' + escapeHtml(t) + '</option>'
    ).join('');
    const vDatum = document.createElement('input'); vDatum.type = 'date'; vDatum.value = r.Datum_revize || ''; vDatum.style.fontSize = '13px';
    const vPlatnost = document.createElement('input'); vPlatnost.type = 'date'; vPlatnost.value = r.Platnost_do || ''; vPlatnost.style.fontSize = '13px';
    const vPozn = document.createElement('input'); vPozn.type = 'text'; vPozn.value = r.Poznamka || ''; vPozn.style.fontSize = '13px';
    tr.children[0].appendChild(vTyp); tr.children[1].appendChild(vDatum); tr.children[2].appendChild(vPlatnost); tr.children[3].appendChild(vPozn);

    const btnU = document.createElement('button'); btnU.className = 'maly sekundarni'; btnU.textContent = 'Uložit';
    btnU.onclick = () => ulozDetailPolozku('revize', r.ID,
      { Typ_revize: vTyp.value, Datum_revize: vDatum.value, Platnost_do: vPlatnost.value, Poznamka: vPozn.value.trim() }, btnU, j);
    const btnS = document.createElement('button'); btnS.className = 'maly sekundarni akce-smazat'; btnS.style.marginLeft = '6px'; btnS.textContent = 'Smazat';
    btnS.onclick = () => smazDetailPolozku('revize', r.ID, j, btnS);
    tr.children[4].appendChild(btnU); tr.children[4].appendChild(btnS);

    telo.appendChild(tr);
  });
  if (revize.length === 0) telo.innerHTML = '<tr><td colspan="5" class="nacitani">Zatím žádné revize.</td></tr>';
  tabulka.appendChild(telo);
  wrap.appendChild(tabulka);

  // Appka jednoduše upozorní na prošlou platnost (appka zatím NEPLÁNUJE
  // proaktivní notifikace, viz nápad se scheduled tasky v backlogu - zatím
  // jen pasivní upozornění v UI).
  const dnes = new Date().toISOString().slice(0, 10);
  const prosleRevize = revize.filter((r) => r.Platnost_do && r.Platnost_do < dnes);
  if (prosleRevize.length > 0) {
    const varovani = document.createElement('div');
    varovani.className = 'zprava chyba';
    varovani.style.marginTop = '6px';
    varovani.textContent = 'Appka eviduje ' + prosleRevize.length + ' revizi/revize s prošlou platností.';
    wrap.appendChild(varovani);
  }

  const pridatWrap = document.createElement('div');
  pridatWrap.style.marginTop = '8px';
  const nTyp = document.createElement('select');
  nTyp.innerHTML = MOZNOSTI_TYP_REVIZE.map((t) => '<option value="' + escapeAttr(t) + '">' + escapeHtml(t) + '</option>').join('');
  const nDatum = document.createElement('input'); nDatum.type = 'date'; nDatum.style.fontSize = '13px';
  const nPlatnost = document.createElement('input'); nPlatnost.type = 'date'; nPlatnost.style.fontSize = '13px';
  const btnPridat = document.createElement('button');
  btnPridat.className = 'maly sekundarni';
  btnPridat.textContent = 'Přidat revizi';
  btnPridat.onclick = async () => {
    btnPridat.disabled = true;
    try {
      await zavolejApi('/nemovitosti-detaily?entita=revize', {
        method: 'POST',
        body: JSON.stringify({ Stredisko: j.Stredisko, Typ_revize: nTyp.value, Datum_revize: nDatum.value, Platnost_do: nPlatnost.value }),
      });
      await obnovDetailySekce(j);
    } catch (e) {
      alert('Nepodařilo se přidat revizi: ' + e.message);
      btnPridat.disabled = false;
    }
  };
  pridatWrap.appendChild(nTyp); pridatWrap.appendChild(nDatum); pridatWrap.appendChild(nPlatnost); pridatWrap.appendChild(btnPridat);
  wrap.appendChild(pridatWrap);

  el.appendChild(wrap);
}

// Vyúčtování za JEDNU nájemní smlouvu.
//
// (v4.57) Do v4.56 tu bylo `.find()`, takže u bytu se dvěma nájemníky šlo
// spočítat vyúčtování jen tomu prvnímu a druhý se z appky nedal vyřídit
// vůbec. Teď se smlouva vybírá v roletce. **Nevracet zpátky na `.find()`.**
//
// Rozúčtování nákladů bytu mezi nájemníky dělá server podle plochy
// nájemních jednotek (Janova volba 2026-08-07) - viz lib/vyuctovaniPodily.js
// a netlify/functions/nemovitosti-vyuctovani.js. Tím padá dřívější omezení
// „1 jednotka = 1 vyúčtování" z 2026-07-27.
function vykresliSekciVyuctovani(el, j) {
  el.innerHTML = '<h4>Vyúčtování</h4>';
  const smlouvy = najdiNajemniSmlouvy(j);
  if (smlouvy.length === 0) {
    const info = document.createElement('p');
    info.className = 'popis';
    info.textContent = 'Vyúčtování appka spočítá, až bude mít aktivní nájemní smlouvu pro tohle středisko.';
    el.appendChild(info);
    return;
  }

  // Vybraná smlouva. U jediné smlouvy se roletka nekreslí - byla by to
  // nabídka s jednou položkou.
  let smlouva = smlouvy[0];
  if (smlouvy.length > 1) {
    const wrapVyber = document.createElement('div');
    const labelVyber = document.createElement('label');
    labelVyber.textContent = 'Komu vyúčtování počítáme';
    const selectSmlouva = document.createElement('select');
    selectSmlouva.style.fontSize = '13px';
    selectSmlouva.innerHTML = smlouvy.map((sm, i) =>
      '<option value="' + i + '">' + escapeHtml((sm.Druha_strana || '(nájemník nevyplněn)')
        + (sm.Cislo_smlouvy ? ' · ' + sm.Cislo_smlouvy : '')) + '</option>').join('');
    selectSmlouva.onchange = () => { smlouva = smlouvy[Number(selectSmlouva.value)] || smlouvy[0]; };
    wrapVyber.appendChild(labelVyber);
    wrapVyber.appendChild(selectSmlouva);
    el.appendChild(wrapVyber);
  }

  const mriz = document.createElement('div');
  mriz.className = 'mriz-2';
  const wrapOd = document.createElement('div');
  wrapOd.innerHTML = '<label>Od</label>';
  const vstupOd = document.createElement('input');
  vstupOd.type = 'date';
  wrapOd.appendChild(vstupOd);
  const wrapDo = document.createElement('div');
  wrapDo.innerHTML = '<label>Do</label>';
  const vstupDo = document.createElement('input');
  vstupDo.type = 'date';
  wrapDo.appendChild(vstupDo);
  mriz.appendChild(wrapOd);
  mriz.appendChild(wrapDo);
  el.appendChild(mriz);

  const wrapKauce = document.createElement('div');
  wrapKauce.style.marginTop = '6px';
  const idCheckKauce = 'nem-vyuct-kauce-' + j.ID;
  const checkKauce = document.createElement('input');
  checkKauce.type = 'checkbox';
  checkKauce.id = idCheckKauce;
  const labelKauce = document.createElement('label');
  labelKauce.htmlFor = idCheckKauce;
  labelKauce.textContent = ' Počítat i vrácení kauce (škody appka bere jen jako vstup pro tenhle výpočet, nikam je neukládá)';
  const vstupSkody = document.createElement('input');
  vstupSkody.type = 'text';
  vstupSkody.placeholder = 'Škody (Kč)';
  vstupSkody.style.fontSize = '13px';
  vstupSkody.style.width = '90px';
  vstupSkody.style.marginLeft = '8px';
  wrapKauce.appendChild(checkKauce);
  wrapKauce.appendChild(labelKauce);
  wrapKauce.appendChild(vstupSkody);
  el.appendChild(wrapKauce);

  const vysledekEl = document.createElement('div');
  el.appendChild(vysledekEl);

  // Appka si pamatuje poslední spočítaný výsledek + zvolené období, ať ho
  // tlačítko "Uložit vyúčtování" uloží PŘESNĚ tak, jak appka na obrazovce
  // právě ukázala (appka ho znovu NEPŘEPOČÍTÁVÁ - viz netlify/functions/
  // nemovitosti-vyuctovani-ulozene.js).
  let posledniVysledek = null;

  const btnSpocitat = document.createElement('button');
  btnSpocitat.textContent = 'Spočítat vyúčtování';
  btnSpocitat.style.marginTop = '8px';
  btnSpocitat.onclick = async () => {
    if (!vstupOd.value || !vstupDo.value) { alert('Zadejte období (od/do).'); return; }
    btnSpocitat.disabled = true;
    btnUlozit.disabled = true;
    posledniVysledek = null;
    vysledekEl.innerHTML = '<div class="nacitani">Počítám…</div>';
    try {
      let cesta = '/nemovitosti-vyuctovani?smlouva_id=' + encodeURIComponent(smlouva.ID)
        + '&od=' + encodeURIComponent(vstupOd.value) + '&do=' + encodeURIComponent(vstupDo.value);
      if (checkKauce.checked) cesta += '&pocitatKauci=1&skody=' + encodeURIComponent(vstupSkody.value.trim() || '0');
      const vysledek = await zavolejApi(cesta, { method: 'GET' });
      vysledekEl.innerHTML = vykresliVysledekVyuctovani(vysledek, smlouva.Mena);
      posledniVysledek = { vysledek, obdobiOd: vstupOd.value, obdobiDo: vstupDo.value };
      btnUlozit.disabled = false;
    } catch (e) {
      vysledekEl.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
    } finally {
      btnSpocitat.disabled = false;
    }
  };
  el.appendChild(btnSpocitat);

  const btnUlozit = document.createElement('button');
  btnUlozit.className = 'sekundarni';
  btnUlozit.style.marginTop = '8px';
  btnUlozit.style.marginLeft = '8px';
  btnUlozit.textContent = 'Uložit vyúčtování';
  btnUlozit.disabled = true;
  btnUlozit.title = 'Appka nejdřív musí vyúčtování spočítat - uloží se přesně ta spočítaná částka, kterou appka právě ukázala';
  btnUlozit.onclick = async () => {
    if (!posledniVysledek) return;
    btnUlozit.disabled = true;
    try {
      const v = posledniVysledek.vysledek;
      const telo = {
        Smlouva_ID: smlouva.ID,
        Obdobi_Od: posledniVysledek.obdobiOd,
        Obdobi_Do: posledniVysledek.obdobiDo,
        Naklady_Sluzby: v.nakladySluzby,
        Naklady_Vlastni: v.nakladyVlastni,
        Zaloha_Na_Sluzby: v.zalohaNaSluzby,
        Pocet_Zaplacenych_Zaloh: v.pocetZaplacenychZaloh,
        Zalohy_Prijate: v.zalohyPrijate,
        Rozdil: v.rozdil,
      };
      if (v.kauce) {
        telo.Kauce_Castka = v.kauce.castka;
        telo.Kauce_Skody = v.kauce.skody;
        telo.Kauce_Nedoplatek = v.kauce.nedoplatek;
        telo.Kauce_K_Vraceni = v.kauce.kVraceni;
      }
      await zavolejApi('/nemovitosti-vyuctovani-ulozene', { method: 'POST', body: JSON.stringify(telo) });
      await nactiHistoriiVyuctovani();
    } catch (e) {
      alert('Nepodařilo se uložit vyúčtování: ' + e.message);
    } finally {
      btnUlozit.disabled = false;
    }
  };
  el.appendChild(btnUlozit);

  const historieEl = document.createElement('div');
  historieEl.style.marginTop = '14px';
  el.appendChild(historieEl);

  async function nactiHistoriiVyuctovani() {
    historieEl.innerHTML = '<div class="nacitani">Načítám historii…</div>';
    try {
      const data = await zavolejApi('/nemovitosti-vyuctovani-ulozene?smlouva_id=' + encodeURIComponent(smlouva.ID), { method: 'GET' });
      vykresliHistoriiVyuctovani(historieEl, data.vyuctovani || [], smlouva.Mena, nactiHistoriiVyuctovani);
    } catch (e) {
      historieEl.innerHTML = '<div class="zprava chyba">Historii uložených vyúčtování se nepodařilo načíst: ' + escapeHtml(e.message) + '</div>';
    }
  }
  nactiHistoriiVyuctovani();
}

const MOZNOSTI_STAV_VYUCTOVANI_DALSI = {
  'Spočítáno': 'Odesláno nájemníkovi',
  'Odesláno nájemníkovi': 'Vypořádáno',
};

function vykresliHistoriiVyuctovani(el, seznam, mena, obnov) {
  el.innerHTML = '<h5>Uložená vyúčtování</h5>';
  if (!seznam.length) {
    const info = document.createElement('p');
    info.className = 'popis';
    info.textContent = 'Appka zatím nemá uložené žádné vyúčtování téhle smlouvy.';
    el.appendChild(info);
    return;
  }

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Období</th><th>Rozdíl</th><th>Stav</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');

  seznam.forEach((z) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Období"></td><td data-label="Rozdíl"></td><td data-label="Stav"></td><td data-label="Akce"></td>';
    const rozdilCislo = parseFloat(z.Rozdil) || 0;
    tr.children[0].textContent = (z.Obdobi_Od || '') + ' – ' + (z.Obdobi_Do || '');
    tr.children[1].textContent = formatCastkaSMenou(Math.abs(rozdilCislo), mena) + (rozdilCislo >= 0 ? ' (přeplatek)' : ' (nedoplatek)');
    tr.children[2].textContent = z.Stav;

    const dalsiStav = MOZNOSTI_STAV_VYUCTOVANI_DALSI[z.Stav];
    if (dalsiStav) {
      const btnDalsi = document.createElement('button');
      btnDalsi.className = 'maly sekundarni';
      btnDalsi.textContent = '→ ' + dalsiStav;
      btnDalsi.onclick = async () => {
        btnDalsi.disabled = true;
        try {
          await zavolejApi('/nemovitosti-vyuctovani-ulozene', {
            method: 'PATCH',
            body: JSON.stringify({ id: z.ID, zmeny: { Stav: dalsiStav } }),
          });
          await obnov();
        } catch (e) {
          alert('Nepodařilo se změnit stav vyúčtování: ' + e.message);
          btnDalsi.disabled = false;
        }
      };
      tr.children[3].appendChild(btnDalsi);
    }
    if (z.Stav === 'Spočítáno') {
      const btnSmazat = document.createElement('button');
      btnSmazat.className = 'maly sekundarni akce-smazat';
      btnSmazat.style.marginLeft = '6px';
      btnSmazat.textContent = 'Smazat';
      btnSmazat.onclick = async () => {
        if (!confirm('Smazat tenhle spočítaný záznam vyúčtování? Jakmile je odeslané nájemníkovi, appka smazání dál nedovolí.')) return;
        btnSmazat.disabled = true;
        try {
          await zavolejApi('/nemovitosti-vyuctovani-ulozene?id=' + encodeURIComponent(z.ID), { method: 'DELETE' });
          await obnov();
        } catch (e) {
          alert('Nepodařilo se smazat vyúčtování: ' + e.message);
          btnSmazat.disabled = false;
        }
      };
      tr.children[3].appendChild(btnSmazat);
    }

    telo.appendChild(tr);
  });
  tabulka.appendChild(telo);
  el.appendChild(tabulka);
}

function vykresliVysledekVyuctovani(v, mena) {
  const rozdilPopisek = v.rozdil >= 0 ? 'Přeplatek (appka vrátí nájemníkovi)' : 'Nedoplatek (appka doúčtuje)';
  let html = '<div class="vyuctovani-vysledek"><dl>'
    + '<dt>Náklady - služby (zúčtovatelné proti záloze)</dt><dd>' + escapeHtml(formatCastkaSMenou(v.nakladySluzby, mena)) + '</dd>'
    + '<dt>Náklady - vlastní (appka NEpromítá do vyúčtování nájemníkovi)</dt><dd>' + escapeHtml(formatCastkaSMenou(v.nakladyVlastni, mena)) + '</dd>'
    + '<dt>Zaplacené zálohy</dt><dd>' + escapeHtml(formatCastkaSMenou(v.zalohyPrijate, mena)) + ' (' + v.pocetZaplacenychZaloh + '×)</dd>'
    + '<dt>' + rozdilPopisek + '</dt><dd>' + escapeHtml(formatCastkaSMenou(Math.abs(v.rozdil), mena)) + '</dd>';
  if (v.kauce) {
    html += '<dt>Kauce</dt><dd>' + escapeHtml(formatCastkaSMenou(v.kauce.castka, mena)) + '</dd>'
      + '<dt>– z toho na nedoplatek</dt><dd>' + escapeHtml(formatCastkaSMenou(v.kauce.nedoplatek, mena)) + '</dd>'
      + '<dt>– škody</dt><dd>' + escapeHtml(formatCastkaSMenou(v.kauce.skody, mena)) + '</dd>'
      + '<dt>Appka vrátí kauci</dt><dd>' + escapeHtml(formatCastkaSMenou(v.kauce.kVraceni, mena)) + '</dd>';
  }
  html += '</dl></div>';
  return html;
}

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
  tlacitkoSmazat.className = 'maly sekundarni akce-smazat';
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

// Odkaz na sken dokladu (v4.38) - Jan: "aby nebyl jen text" - appka do v4.37
// ukazovala prostý podtržený text "otevřít", appka teď kreslí plný "chip" s
// ikonou lupy (stejný princip vlastní inline SVG appka už používá u loga na
// přihlašovací obrazovce - appka žádnou ikonovou knihovnu nemá připojenou).
// `popisek` je volitelný text PŘED odkazem (appka ho u některých míst
// používala, např. "Starší odkaz na soubor:") - u nového vzhledu appka ho
// nechává prázdný, chip sám o sobě dost jasně říká, co udělá.
//
// v4.40: `souborId` + `typ` jsou nové - viz otevriSken() níž a
// netlify/functions/soubor.js. Chip appka kreslí pořád stejně, jen kliknutí
// od teď obslouží appka sama místo toho, aby prohlížeč poslala na Google.
// `url` (původní Drive odkaz) appka nechává v `href` schválně: jednak jako
// záloha, když by proxy selhala (např. moc velký sken), jednak aby
// prostřední tlačítko myši / "Otevřít v novém panelu" pořád něco dělalo.
function odkazOtevritSken(url, souborId, typ, popisek) {
  const obsah =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' +
    '</svg>' +
    'Otevřít sken';

  // Starší záznamy nemusí ID souboru na Drive vůbec mít (od v4.43 si ho
  // appka u smluv zkusí vytáhnout z odkazu, viz idZeSdileneUrl() v
  // lib/driveHelpers.js, ale ne vždycky se to povede). Bez ID appka sken
  // podat neumí - a odkaz na drive.google.com má smysl nabídnout UŽ JEN
  // ADMINOVI, protože ten je na Drive vlastník. Komukoli jinému by Google
  // ukázal "Potřebujete přístup" a Janovi poslal e-mail se žádostí o
  // sdílení; česká hláška je pro kolegu užitečnější.
  if (!souborId) {
    const jeAdmin = stav && stav.role === 'admin';
    if (!jeAdmin) {
      return (popisek ? escapeHtml(popisek) + ' ' : '') +
        '<span class="odkaz-sken odkaz-sken-nedostupny" title="U tohohle záznamu je jen ručně vložený odkaz na Google Disk, ne soubor nahraný přes appku. Požádejte prosím Jana, ať sken nahraje do appky jako přílohu.">' +
          obsah +
        '</span>';
    }
    return (popisek ? escapeHtml(popisek) + ' ' : '') +
      '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener" class="odkaz-sken">' +
        obsah +
      '</a>';
  }

  const onclick =
    ' onclick="otevriSken(this, \'' + escapeAttr(souborId) + '\', \'' + escapeAttr(typ || '') + '\'); return false;"';

  return (popisek ? escapeHtml(popisek) + ' ' : '') +
    '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener" class="odkaz-sken"' + onclick + '>' +
      obsah +
    '</a>';
}

// Otevření skenu přes appku (v4.40) - Jan: "app u jiných uživatelů odmítne
// otevřít scan, blokuje to google". Podrobné vysvětlení PROČ je v hlavičce
// netlify/functions/soubor.js; ve zkratce: soubory na Drive patří Janovu
// Google účtu, takže přímý odkaz na drive.google.com Google komukoli jinému
// zablokuje. Appka si proto soubor vyzvedne sama (svým přihlášením) a
// uživateli ho podá jako blob - prohlížeč uživatele s Googlem vůbec nemluví.
//
// Pozn. k pořadí kroků: prázdný panel appka otevírá HNED, ještě před
// `await` - blokátor vyskakovacích oken totiž povolí window.open jen
// bezprostředně při kliknutí; kdyby appka čekala až na stažený soubor,
// prohlížeč by okno tiše zahodil a uživateli by se nestalo vůbec nic.
//
// Pozn. proč onclick volající appku vypadá "otevriSken(...); return false;"
// a ne "return otevriSken(...)": funkce je `async`, takže vždycky vrací
// Promise - a ten je pravdivostně `true`. Prohlížeč by tedy odchod na
// `href` (původní Drive odkaz) NEZRUŠIL a panel by se otevřel dvakrát,
// jednou správně přes appku a jednou rovnou na Google se zamčenou hláškou.
// (v4.44) Běží appka spuštěná z plochy telefonu (bez adresního řádku)?
//
// Proč to appka potřebuje vědět: od v4.44 se dá appka přidat na plochu a
// spustit "na celý displej" (viz manifest.webmanifest a meta značky v
// index.html). V tomhle režimu ale window.open NEotevře další panel v téže
// appce - iOS ho předá Safari jako úplně jiné appce a `blob:` odkaz
// vyrobený uvnitř appky tam neplatí, takže by se uživateli otevřelo prázdné
// okno nebo hláška o neplatné adrese. Tím by se vrátila přesně ta chyba,
// kterou appka řešila ve v4.40 a v4.43 ("nejde otevřít sken").
// Řešení: když appka běží z plochy, sken ukáže ve vlastním okně UVNITŘ
// appky (funkce zobrazSkenVAppce níže). V prohlížeči se nemění nic.
function jeStandalone() {
  try {
    if (window.navigator.standalone === true) return true; // iOS Safari
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
  } catch (e) {
    return false;
  }
}

// (v4.44) Prohlížečka skenu uvnitř appky - používá se jen v režimu "appka na
// ploše" (viz jeStandalone výš).
//   - obrázek (foto dokladu) appka ukáže jako <img>,
//   - PDF zkusí ukázat v <iframe>; iOS v PDF v rámu neumí listovat, proto je
//     tam vždycky i tlačítko "Stáhnout" - to funguje spolehlivě všude a
//     uživatel si sken otevře v prohlížeči PDF svého telefonu.
// Blob se uvolňuje až při zavření okna, ne časovačem - dokud okno svítí,
// odkaz musí platit.
// (v4.44) Rozumný název pro stažený sken. Skutečné jméno souboru na Disku
// appka v tuhle chvíli nemá (proxy /api/soubor vrací jen obsah), takže si ho
// složí z data - hlavní je, ať soubor ve stažených nekončí jako "stazeny".
function nazevSkenu(typObsahu) {
  const t = String(typObsahu || '');
  const pripona = t.includes('pdf') ? 'pdf'
    : t.includes('png') ? 'png'
    : t.includes('jpeg') || t.includes('jpg') ? 'jpg'
    : t.includes('heic') ? 'heic'
    : 'soubor';
  const d = new Date();
  const dvojcifr = (n) => String(n).padStart(2, '0');
  return 'sken-' + d.getFullYear() + dvojcifr(d.getMonth() + 1) + dvojcifr(d.getDate()) +
    '-' + dvojcifr(d.getHours()) + dvojcifr(d.getMinutes()) + '.' + pripona;
}

function zobrazSkenVAppce(blobUrl, typObsahu, nazevSouboru) {
  const stary = document.getElementById('sken-okno');
  if (stary) stary.remove();

  const jeObrazek = String(typObsahu || '').startsWith('image/');
  const jePdf = String(typObsahu || '').includes('pdf');

  const okno = document.createElement('div');
  okno.id = 'sken-okno';
  okno.className = 'sken-okno';
  okno.innerHTML =
    '<div class="sken-okno-lista">' +
      '<span class="sken-okno-nazev">' + escapeHtml(nazevSouboru || 'Sken') + '</span>' +
      '<a class="sken-okno-stahnout" download="' + escapeAttr(nazevSouboru || 'sken') + '" href="' + escapeAttr(blobUrl) + '">Stáhnout</a>' +
      '<button type="button" class="sken-okno-zavrit" aria-label="Zavřít sken">✕</button>' +
    '</div>' +
    '<div class="sken-okno-telo">' +
      (jeObrazek
        ? '<img class="sken-okno-obrazek" alt="Sken dokladu" src="' + escapeAttr(blobUrl) + '">'
        : jePdf
          ? '<iframe class="sken-okno-ram" title="Sken dokladu" src="' + escapeAttr(blobUrl) + '"></iframe>'
          : '<p class="sken-okno-hlaska">Tenhle typ souboru appka neumí ukázat přímo. Použijte tlačítko <strong>Stáhnout</strong> nahoře.</p>') +
    '</div>';

  function zavri() {
    okno.remove();
    document.body.classList.remove('sken-okno-otevreno');
    document.removeEventListener('keydown', naEsc);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
  function naEsc(e) {
    if (e.key === 'Escape') zavri();
  }

  okno.querySelector('.sken-okno-zavrit').addEventListener('click', zavri);
  document.addEventListener('keydown', naEsc);

  document.body.appendChild(okno);
  document.body.classList.add('sken-okno-otevreno');
}

// (v4.49) Stažení skenu po kusech, vytažené z otevriSken() ven, aby ho mohl
// použít i zpětný ořez (viz orezniSkenZnovu() níž). Dřív tenhle cyklus seděl
// natvrdo uvnitř otevriSken() a šel použít jen k zobrazení; kdyby si ho ořez
// opsal k sobě, byly by dvě kopie stejné logiky slepování a jedna z nich by
// se dřív nebo později rozešla s netlify/functions/soubor.js.
// `naPokrok` je nepovinná funkce (staženo, celkem) - appka jí hlásí postup,
// ať si ho každé volání zobrazí po svém.
// Odpověď "sken je moc velký" appka nepřevádí na obyčejnou chybu, ale připne
// k ní `prilisVelky`, protože v prohlížeči na ni navazuje záložní otevření
// přes Drive (a to je věc volajícího, ne stahování).
async function stahniSkenPoCastech(souborId, typ, naPokrok) {
  const hlavicky = {};
  if (stav && stav.token) hlavicky['Authorization'] = 'Bearer ' + stav.token;

  const casti = [];
  let stazeno = 0;
  let celkem = 0;
  let typObsahu = 'application/octet-stream';

  // Pojistka proti nekonečné smyčce, kdyby server vracel prázdné kusy.
  for (let kolo = 0; kolo < 24; kolo++) {
    const odpoved = await fetch(
      '/api/soubor?id=' + encodeURIComponent(souborId) +
        (typ ? '&typ=' + encodeURIComponent(typ) : '') +
        '&od=' + stazeno,
      { cache: 'no-store', headers: hlavicky }
    );

    if (!odpoved.ok) {
      const data = await odpoved.json().catch(() => ({}));
      const chyba = new Error(data.error || 'Chyba serveru (' + odpoved.status + ')');
      if (data.prilisVelky) chyba.prilisVelky = true;
      throw chyba;
    }

    typObsahu = odpoved.headers.get('Content-Type') || typObsahu;
    celkem = Number(odpoved.headers.get('X-Sken-Celkem') || 0) || celkem;

    const cast = await odpoved.arrayBuffer();
    if (!cast.byteLength) break;
    casti.push(cast);
    stazeno += cast.byteLength;

    if (odpoved.headers.get('X-Sken-Posledni') === '1') break;
    if (celkem && stazeno >= celkem) break;

    if (naPokrok && celkem) naPokrok(stazeno, celkem);
  }

  if (!casti.length) throw new Error('Sken se stáhl prázdný.');
  return { blob: new Blob(casti, { type: typObsahu }), typObsahu };
}

// ---------- ZPĚTNÝ OŘEZ UŽ NAHRANÉHO SKENU (v4.49) ----------
//
// Jan (2026-08-02): "a je možné nyný dodělat ořezání a nebo jde jen u
// nových?" Jde to i zpětně - tohle je ono.
//
// Celý ořez běží V PROHLÍŽEČI, ne na serveru: appka si sken stáhne přes
// vlastní proxy (/api/soubor, stejnou cestou jako když ho jde ukázat),
// pustí na něj úplně stejný najdiDokladNaFotce() + vykresliOrezDoJpegu()
// jako u nově vyfoceného dokladu a hotový JPEG pošle do
// netlify/functions/orezSkenu.js. Server tak nepotřebuje žádnou obrázkovou
// knihovnu a hlavně existuje jen JEDNA implementace ořezu - kdyby byla
// druhá na serveru, starý doklad by dopadl jinak než nově vyfocený.
//
// Když detekce nic nenajde (vrátí null), appka NIC NENAHRÁVÁ a jen to
// napíše. Nahrát v takové chvíli jen překomprimovanou kopii by znamenalo
// vyměnit sken za horší bez jakéhokoli užitku.
//
// Originál zůstává ležet na Disku (Janova volba "Uložit ořez, originál
// nechat na Disku") - podrobněji viz komentář v orezSkenu.js.
async function orezniSkenZnovu(idDokladu, souborId, tlacitko) {
  const puvodniText = tlacitko.textContent;
  tlacitko.disabled = true;
  tlacitko.textContent = 'Stahuji sken…';
  try {
    const { blob, typObsahu } = await stahniSkenPoCastech(souborId, 'doklad', (stazeno, celkem) => {
      tlacitko.textContent = 'Stahuji sken… ' + Math.min(99, Math.round((stazeno / celkem) * 100)) + ' %';
    });

    // PDF a jiné neobrázky appka neřeže - ořez umí jen fotku. Naskenované
    // PDF z multifunkce je navíc už oříznuté skenerem, tam není co dělat.
    if (!String(typObsahu || '').startsWith('image/')) {
      alert('Tenhle sken není fotka (je to ' + (typObsahu || 'neznámý typ') + '), ořezat ho nejde.');
      return;
    }

    tlacitko.textContent = 'Ořezávám…';
    const orezany = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const vyrez = najdiDokladNaFotce(img);
        const data = vyrez ? vykresliOrezDoJpegu(img, vyrez, 1600, 0.75) : null;
        URL.revokeObjectURL(url);
        resolve(data);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Sken se nepodařilo načíst jako obrázek.'));
      };
      img.src = url;
    });

    if (!orezany) {
      alert('Appka na téhle fotce doklad spolehlivě nenašla – sken nechala beze změny.\n\n' +
        'Stává se to u fotek focených hodně nakřivo, na světlém stole nebo na tmavém dokladu. ' +
        'Sken se nijak nepoškodil, jen se neořízl.');
      return;
    }

    tlacitko.textContent = 'Ukládám…';
    const data = await zavolejApi('/orezSkenu', {
      method: 'POST',
      body: JSON.stringify({ id: idDokladu, dataBase64: orezany, mimeType: 'image/jpeg' }),
    });

    // Doklad v načteném seznamu appka přepíše rovnou, ať odkaz na sken
    // hned ukazuje na ořezanou verzi a Jan si ji může zkontrolovat bez
    // dalšího načítání celé záložky.
    const doklad = dokladySeznamAktualni.find((x) => x.ID === idDokladu);
    if (doklad) {
      doklad.Zdrojovy_soubor_ID = data.Zdrojovy_soubor_ID;
      doklad.Zdrojovy_soubor_URL = data.Zdrojovy_soubor_URL;
    }
    vykresliDoklady(dokladySeznamAktualni);
    zobrazZpravuDoklady('Sken oříznut. Původní fotka zůstala na Google Disku.');
  } catch (e) {
    alert('Ořez se nepodařil: ' + e.message);
  } finally {
    tlacitko.disabled = false;
    tlacitko.textContent = puvodniText;
  }
}

async function otevriSken(prvek, souborId, typ) {
  if (prvek.dataset.nacita === '1') return false;

  const zalozniUrl = prvek.getAttribute('href') || '';
  const puvodniObsah = prvek.innerHTML;
  prvek.dataset.nacita = '1';
  prvek.classList.add('nacita');
  prvek.innerHTML = '<span class="odkaz-sken-kolecko"></span>Otevírám sken…';

  // (v4.44) Prázdný panel dopředu otevírá appka jen v prohlížeči - v režimu
  // "appka na ploše" by ho převzal systémový prohlížeč a blob by v něm
  // neplatil (viz jeStandalone výš), tam se sken ukazuje uvnitř appky.
  const vAppce = jeStandalone();
  const panel = vAppce ? null : window.open('', '_blank');

  try {
    // (v4.43) Sken si appka bere po kusech - viz netlify/functions/soubor.js.
    // Do jedné odpovědi Netlify funkce se vejde jen cca 4 MB, takže velký
    // sken (běžný scan smlouvy má klidně 8 MB) by dřív skončil chybou a
    // odkazem na Google, kde kolega narazil na "Request access". Teď si
    // appka řekne o `od=0`, pak o `od=<kolik už má>` a kusy slepí do jednoho
    // blobu; uživatel o tom neví, jen vidí procenta.
    // (v4.49) Samotné stahování sedí v stahniSkenPoCastech() výš - sdílí ho
    // s zpětným ořezem.
    let blob;
    let typObsahu;
    try {
      const stazene = await stahniSkenPoCastech(souborId, typ, (stazeno, celkem) => {
        prvek.innerHTML = '<span class="odkaz-sken-kolecko"></span>Otevírám sken… ' +
          Math.min(99, Math.round((stazeno / celkem) * 100)) + ' %';
      });
      blob = stazene.blob;
      typObsahu = stazene.typObsahu;
    } catch (e) {
      // Původní Drive odkaz appka nabízí UŽ JEN ADMINOVI. Komukoli jinému
      // by Google stejně ukázal "Potřebujete přístup" a poslal Janovi
      // e-mail se žádostí o sdílení - což je přesně ta situace, kvůli
      // které proxy vznikla. Kolegovi je srozumitelná česká hláška
      // mnohem užitečnější než cizí přihlašovací obrazovka Googlu.
      if (e.prilisVelky && zalozniUrl && stav && stav.role === 'admin') {
        if (panel) {
          panel.location.href = zalozniUrl;
        } else {
          // Režim "appka na ploše": panel appka dopředu neotvírala.
          // Odkaz na Drive appka pošle systému - tohle je běžná http
          // adresa, s tou si prohlížeč telefonu poradí (na rozdíl od blob).
          window.open(zalozniUrl, '_blank');
        }
        return false;
      }
      throw e;
    }

    const blobUrl = URL.createObjectURL(blob);
    if (panel) {
      panel.location.href = blobUrl;
      // Uvolnění až po chvíli - kdyby appka blob zrušila hned, panel by se
      // nestihl načíst a zůstal by prázdný.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      // Appka běží z plochy telefonu - sken ukážeme uvnitř appky. Blob se
      // uvolní až při zavření okna (řeší si zobrazSkenVAppce samo).
      zobrazSkenVAppce(blobUrl, typObsahu, nazevSkenu(typObsahu));
    }
  } catch (e) {
    if (panel) panel.close();
    alert('Sken se nepodařilo otevřít: ' + e.message);
  } finally {
    prvek.dataset.nacita = '';
    prvek.classList.remove('nacita');
    prvek.innerHTML = puvodniObsah;
  }

  return false;
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

/* ---------- ROZBALOVACÍ „NAHRÁT DOKLADY“ (v4.56) ----------
 *
 * Jan (2026-08-07): *"v tlačítku Nahrát doklady bude zarolována možnost
 * Vyfotit / Nahrát soubor"*. Z náhledů si vybral variantu „B - vedle sebe“
 * a chování „Jen rozbalit“.
 *
 * Tlačítko proto v index.html už NEMÁ `data-zalozka` - obsluha dole u
 * `[data-zalozka]` se ho tedy netýká a klepnutí jen vyroluje panel.
 *
 * Proč se fotoaparát smí otevřít až odsud: prohlížeč ho pustí jen jako
 * reakci na klepnutí člověka. Tady klepnutí JE (člověk klepl na „Vyfotit“),
 * takže `pole-foto.click()` projde. Zástupce z plochy (v4.55) to udělat
 * nemůže, protože tam appka žádné gesto k dispozici nemá - proto tam jen
 * zvýrazňuje tlačítko.
 */
function nastavRozbaleniNahrat(otevrit) {
  const radek = document.getElementById('radek-nahrat-cta');
  const tlacitko = document.getElementById('tlacitko-nahrat-cta');
  if (!radek || !tlacitko) return;
  radek.classList.toggle('rozbaleno', otevrit);
  tlacitko.setAttribute('aria-expanded', otevrit ? 'true' : 'false');
}

function prepniRozbaleniNahrat() {
  const radek = document.getElementById('radek-nahrat-cta');
  if (!radek) return;
  nastavRozbaleniNahrat(!radek.classList.contains('rozbaleno'));
}

// Společné pro obě volby: panel se zaroluje, appka přeskočí na záložku
// Nahrát doklad a otevře fotoaparát / výběr souboru. Pořadí je důležité -
// `prepniZalozku` musí být PŘED `.click()`, jinak by se soubor vybíral do
// záložky, kterou člověk nevidí, a vypadalo by to, že se nic nestalo.
function spustNahraniZRozbaleni(idPole) {
  nastavRozbaleniNahrat(false);
  prepniZalozku('nahrat');
  const pole = document.getElementById(idPole);
  if (pole) pole.click();
}

document.getElementById('tlacitko-nahrat-cta').addEventListener('click', prepniRozbaleniNahrat);
document.getElementById('volba-vyfotit').addEventListener('click', () => spustNahraniZRozbaleni('pole-foto'));
document.getElementById('volba-soubor').addEventListener('click', () => spustNahraniZRozbaleni('pole-soubor'));

// Klepnutí mimo panel ho zaroluje. Bez tohohle by rozbalený panel zůstal
// viset přes celou práci s Dashboardem, dokud by si člověk nevzpomněl
// klepnout zpátky na „Nahrát doklady“.
document.addEventListener('click', (e) => {
  const radek = document.getElementById('radek-nahrat-cta');
  if (!radek || !radek.classList.contains('rozbaleno')) return;
  if (radek.contains(e.target)) return;
  nastavRozbaleniNahrat(false);
});

// Escape zavírá panel a vrací pozornost na tlačítko, ať se klávesnicí dá
// z rozbalené nabídky dostat ven bez myši.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const radek = document.getElementById('radek-nahrat-cta');
  if (!radek || !radek.classList.contains('rozbaleno')) return;
  nastavRozbaleniNahrat(false);
  const tlacitko = document.getElementById('tlacitko-nahrat-cta');
  if (tlacitko) tlacitko.focus();
});
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
document.getElementById('tlacitko-pridat-predkontaci').addEventListener('click', pridatPredkontaci);
// v4.52 - účtová osnova a platební karty
document.getElementById('tlacitko-pridat-ucet-osnovy').addEventListener('click', pridatUcetOsnovy);
document.getElementById('tlacitko-vychozi-ucty').addEventListener('click', nactiVychoziUcty);
document.getElementById('tlacitko-pridat-kartu').addEventListener('click', pridatPlatebniKartu);
document.getElementById('tlacitko-pridat-smlouvu').addEventListener('click', pridatSmlouvu);
document.getElementById('sm-tlacitko-vyfotit').addEventListener('click', () => document.getElementById('sm-pole-foto').click());
document.getElementById('sm-tlacitko-vybrat-soubor').addEventListener('click', () => document.getElementById('sm-pole-soubor').click());
document.getElementById('sm-pole-foto').addEventListener('change', (e) => zpracujVybranySouborSmlouva(e.target.files[0]));
document.getElementById('sm-pole-soubor').addEventListener('change', (e) => zpracujVybranySouborSmlouva(e.target.files[0]));
document.getElementById('sm-tlacitko-nahrat').addEventListener('click', nahratSmlouvu);
document.getElementById('sm-sekce-aktivni').addEventListener('click', () => prepniSmlouvySekci('aktivni'));
document.getElementById('sm-sekce-neaktivni').addEventListener('click', () => prepniSmlouvySekci('neaktivni'));
// (v4.54) Filtr a řazení Registru smluv. Všech pět ovladačů jen zapíše do
// proměnné a nechá seznam překreslit - žádný požadavek na server, protože
// appka má v `smlouvySeznamAktualni` už všechny smlouvy pohromadě.
// Hledání jede na `input` (výsledek se mění pod rukama, ať Jan nemusí mačkat
// Enter), roletky na `change`.
document.getElementById('sm-filtr-hledat').addEventListener('input', (e) => {
  smlouvyFiltr.hledat = e.target.value;
  prekresliSmlouvyPoFiltru();
});
document.getElementById('sm-filtr-firma').addEventListener('change', (e) => {
  smlouvyFiltr.firma = e.target.value;
  prekresliSmlouvyPoFiltru();
});
document.getElementById('sm-filtr-stredisko').addEventListener('change', (e) => {
  smlouvyFiltr.stredisko = e.target.value;
  prekresliSmlouvyPoFiltru();
});
document.getElementById('sm-filtr-typ').addEventListener('change', (e) => {
  smlouvyFiltr.typ = e.target.value;
  prekresliSmlouvyPoFiltru();
});
document.getElementById('sm-filtr-razeni').addEventListener('change', (e) => {
  smlouvyRazeni = e.target.value;
  prekresliSmlouvyPoFiltru();
});
document.getElementById('tlacitko-pridat-jizdu').addEventListener('click', pridatJizdu);
document.getElementById('tlacitko-pridat-jednotku').addEventListener('click', pridatJednotku);
document.getElementById('tlacitko-nem-platby-nacist').addEventListener('click', nactiKontrolaUhradyNajmu);
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
document
  .getElementById('tlacitko-banka-prijmy-kontrola')
  .addEventListener('click', (e) => prevestPrijmyKeKontrole(e.target));
// (v4.50) Dlaždice souhrnu jsou zároveň filtr seznamu. Posluchač visí na
// obalu, ne na tlačítkách: souhrn se překresluje přes innerHTML, takže
// tlačítka po každém překreslení zaniknou a posluchač přímo na nich by
// se ztratil s nimi. Kliknutí appka hledá přes `closest` - cíl bývá
// vnitřní <span> s číslem, ne samo tlačítko.
document.getElementById('banka-souhrn').addEventListener('click', (e) => {
  const tlacitko = e.target.closest('.souhrn-akce-tlacitko');
  if (!tlacitko) return;
  const klic = tlacitko.getAttribute('data-filtr');
  if (!(klic in bankaFiltr)) return;
  bankaFiltr[klic] = !bankaFiltr[klic];
  vykresliBankovniPohyby();
});
document.getElementById('tlacitko-pridat-fakturu').addEventListener('click', pridatVydanouFakturu);
document.getElementById('vf-filtr-firma').addEventListener('change', vykresliVydaneFaktury);
// Dlaždice souhrnu vydaných faktur jako filtr - stejná delegace i stejný
// důvod jako u `banka-souhrn` níž (souhrn se překresluje přes innerHTML).
document.getElementById('vf-souhrn').addEventListener('click', (e) => {
  const tlacitko = e.target.closest('.souhrn-akce-tlacitko');
  if (!tlacitko) return;
  const klic = tlacitko.getAttribute('data-filtr');
  if (!(klic in vfFiltr)) return;
  vfFiltr[klic] = !vfFiltr[klic];
  vykresliVydaneFaktury();
});
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

// (v4.44) Registrace service workeru - jediný důvod, proč tu je: bez něj
// Android/Chrome nenainstaluje appku na plochu jako opravdovou appku
// (vlastní ikona, spuštění bez adresního řádku). Worker sám ZÁMĚRNĚ nic
// nekešuje, viz komentář v public/sw.js. Když registrace selže (starší
// prohlížeč, http místo https), appka funguje dál úplně stejně, jen ikona na
// ploše bude obyčejný zástupce.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('Service worker se nepodařilo zaregistrovat:', e && e.message);
    });
  });
}

if (jePrihlasen()) {
  zobrazApp();
} else {
  zobrazLogin();
  nactiJmenaProPrihlaseni();
}
