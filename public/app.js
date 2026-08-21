/**
 * public/app.js
 * Jednoduchá vanilla JS aplikace bez build kroku. Stav (token, jméno,
 * firmy, role) se drží v paměti a v localStorage (přežije obnovení
 * stránky) - běžný přístup pro reálně nasazenou webovou appku.
 */

// Zvyšte při každé odeslané aktualizaci appky, ať Jan v appce pozná, jestli
// se mu opravdu nasadila nová verze (zobrazuje se v patičce appky).
const APP_VERZE = 'v4.83 – 2026-08-21';

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

  // Servis a údržba (v4.75) - srovnání číslování, kontrola tabulky, doplnění
  // sloupců, osiřelé soubory, import CSV jízd. Jan 2026-08-21: *„tlačítko
  // Srovnat číslování a další servisní tlačítka, která jsme potřebovali jen
  // pro změnu, přesun do Nastavení, aby je uživatel neviděl"*.
  //
  // Bloky proto už nemají vlastní schovávání podle role - celá záložka
  // Nastavení je jen pro admina, takže je běžný uživatel ani účetní nevidí.
  // Obsluhu appka navěsí až tady, ne při načtení skriptu: do zobrazApp() se
  // dá dostat i podruhé (znovupřihlášení bez reloadu, viz volání na konci
  // souboru) a bez téhle pojistky by se posluchače přidaly dvakrát - panel
  // by se po kliknutí otevřel a hned zase zavřel.
  if (jeAdmin && !servisInicializovan) {
    inicializujCislovani();
    inicializujServis();
    servisInicializovan = true;
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
    nactiPronajimateleNastaveni();
    nactiNajemceNastaveni();
    nactiStrediska();
    // Pořadí je schválně tohle: účtová osnova se načte před předkontacemi,
    // protože nabídka "Účet MD" u předkontace se plní právě z ní (od v4.52).
    nactiUctovouOsnovu().then(() => nactiPredkontace());
    nactiPlatebniKarty();
  }
}

// ---------- NAHRÁVÁNÍ DOKLADU ----------

/*
 * (v4.70) Nahrávání VÍC souborů najednou.
 *
 * Jan 2026-08-20: *„můžu nahrát více souborů najednou do přijatých
 * faktur?"* - nemohl; pole bralo jeden soubor a `vybranySoubor` byl jeden
 * objekt. Při stovce dokladů za rok to znamenalo stokrát projít celý
 * postup vybrat-nahrat-počkat.
 *
 * ČTYŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) FRONTA JDE POSTUPNĚ, JEDEN SOUBOR PO DRUHÉM. Každý soubor projde přes
 *    AI vytěžení, které trvá vteřiny; poslat je naráz by narazilo na limity
 *    Gemini i na časový strop Netlify funkce. Souběh sem nedodělávat.
 * 2) CHYBA U JEDNOHO SOUBORU FRONTU NEZASTAVÍ. Zbytek se nahraje dál a
 *    u problémového souboru se napíše, co se stalo. Zastavit se na páté
 *    z dvanácti faktur by znamenalo, že člověk neví, které prošly.
 * 3) PŘÍLIŠ VELKÝ SOUBOR SE NAHLÁSÍ, NE TIŠE PŘESKOČÍ. Netlify má strop
 *    ~4,5 MB na požadavek. Když se z dvanácti souborů tři nevejdou a appka
 *    mlčí, člověk odchází s tím, že má hotovo.
 * 4) SOUBOR JE ULOŽENÝ DŘÍV, NEŽ HO ČTE AI. Když spadne vytěžení, doklad
 *    zůstane ve stavu „Zpracovává se" a dokončí se tlačítkem v seznamu -
 *    nic se nenahrává znovu. To platilo i pro jeden soubor a platí dál.
 */

// Strop Netlify na velikost požadavku. Musí sedět s kontrolou v
// netlify/functions/upload.js - tahle je tu jen proto, aby to appka řekla
// dřív a srozumitelněji než serverová 413.
const MAX_BAJTU_SOUBORU = 4.5 * 1024 * 1024;

// Fronta vybraných souborů. Každá položka: { nazev, mimeType, data } nebo
// { nazev, chyba } u souboru, který se ani nepodařilo připravit.
let vybraneSoubory = [];

// Kolik bajtů zabere base64 řetězec po dekódování (server kontroluje až
// dekódovanou velikost).
function velikostZBase64(data) {
  const text = String(data || '');
  const vycpavka = text.endsWith('==') ? 2 : (text.endsWith('=') ? 1 : 0);
  return Math.floor((text.length * 3) / 4) - vycpavka;
}

// Komprese obrázku / převod na base64 - sdílené jak pro hlavní záložku
// Nahrát doklad, tak pro nahrání nového dokladu rovnou z řádku bankovního
// výpisu (viz ---------- BANKOVNÍ VÝPISY ---------- níže).
async function pripravSouborKNahrani(soubor) {
  if (soubor.type.startsWith('image/')) {
    return zmensiObrazek(soubor, 1600, 0.75);
  }
  return { data: await souborNaBase64(soubor), mimeType: soubor.type, nazev: soubor.name };
}

async function zpracujVybraneSoubory(seznamSouboru) {
  const zprava = document.getElementById('nahrat-zprava');
  const info = document.getElementById('vybrany-soubor-info');
  const fronta = document.getElementById('nahrat-fronta');
  const tlacitko = document.getElementById('tlacitko-nahrat');
  zprava.innerHTML = '';
  fronta.innerHTML = '';
  tlacitko.disabled = true;

  const soubory = Array.from(seznamSouboru || []);
  if (!soubory.length) {
    vybraneSoubory = [];
    info.textContent = '';
    tlacitko.textContent = 'Nahrát a zpracovat';
    return;
  }

  info.textContent = 'Připravuji ' + soubory.length + '…';
  vybraneSoubory = [];

  for (let i = 0; i < soubory.length; i += 1) {
    const soubor = soubory[i];
    try {
      const pripraveny = await pripravSouborKNahrani(soubor);
      // Pravidlo 3: velký soubor se nezahodí potichu.
      if (velikostZBase64(pripraveny.data) > MAX_BAJTU_SOUBORU) {
        vybraneSoubory.push({
          nazev: soubor.name,
          chyba: 'Soubor je moc velký (limit je zhruba 4,5 MB). Zmenšete ho nebo rozdělte.',
        });
      } else {
        vybraneSoubory.push(pripraveny);
      }
    } catch (e) {
      vybraneSoubory.push({ nazev: soubor.name, chyba: 'Nepodařilo se připravit: ' + e.message });
    }
  }

  const kNahrani = vybraneSoubory.filter((f) => !f.chyba);
  const vadne = vybraneSoubory.filter((f) => f.chyba);

  info.textContent = kNahrani.length === 1 && !vadne.length
    ? 'Vybráno: ' + kNahrani[0].nazev
    : 'Vybráno souborů: ' + kNahrani.length
      + (vadne.length ? ' (' + vadne.length + ' nelze nahrát – viz níž)' : '');

  vykresliFrontuNahravani();
  tlacitko.textContent = kNahrani.length > 1
    ? 'Nahrát a zpracovat (' + kNahrani.length + ')'
    : 'Nahrát a zpracovat';
  tlacitko.disabled = kNahrani.length === 0;
}

// Řádek na soubor. `stav` se dopisuje průběžně, ať je vidět, kde fronta je.
function vykresliFrontuNahravani() {
  const fronta = document.getElementById('nahrat-fronta');
  fronta.innerHTML = '';
  if (vybraneSoubory.length <= 1 && !vybraneSoubory.some((f) => f.chyba)) return;

  vybraneSoubory.forEach((f, i) => {
    const radek = document.createElement('div');
    radek.className = 'nahrat-fronta-radek';
    radek.id = 'nahrat-fronta-' + i;

    const nazev = document.createElement('span');
    nazev.className = 'nahrat-fronta-nazev';
    nazev.textContent = f.nazev;
    radek.appendChild(nazev);

    const stav = document.createElement('span');
    stav.className = 'nahrat-fronta-stav';
    if (f.chyba) {
      stav.innerHTML = '<span class="badge-chybi">Nelze nahrát</span>';
      const duvod = document.createElement('div');
      duvod.className = 'popis';
      duvod.style.margin = '2px 0 0';
      duvod.textContent = f.chyba;
      stav.appendChild(duvod);
    } else {
      stav.textContent = 'čeká';
    }
    radek.appendChild(stav);
    fronta.appendChild(radek);
  });
}

function stavSouboruVeFronte(index, html, popis) {
  const radek = document.getElementById('nahrat-fronta-' + index);
  if (!radek) return;
  const stav = radek.querySelector('.nahrat-fronta-stav');
  if (!stav) return;
  stav.innerHTML = html;
  if (!popis) return;
  const p = document.createElement('div');
  p.className = 'popis';
  p.style.margin = '2px 0 0';
  p.textContent = popis;
  stav.appendChild(p);
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

/*
 * (v4.71) Poznávání minutového limitu Google API.
 *
 * Sheets má strop 60 čtecích požadavků za minutu na uživatele a jeden
 * nahraný doklad jich spotřebuje zhruba šest. Při třiceti souborech
 * poslaných hned za sebou limit spolehlivě přeteče - Janovi z třiceti
 * dokladů spadlo deset právě na tohle.
 *
 * Server si krátké výkyvy odchytí sám (lib/opakuj.js), tohle je pro ten
 * případ, kdy je potřeba počkat desítky vteřin - v Netlify funkci se tak
 * dlouho čekat nedá, ale v prohlížeči ano.
 */
function jeLimitGoogleFront(e) {
  const text = String((e && e.message) || '');
  return /Quota exceeded|rateLimitExceeded|userRateLimitExceeded|quotaExceeded|429/i.test(text);
}

function pockejMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Jak dlouho počkat před dalším pokusem o TENTÝŽ soubor a kolikrát to
// zkusit. Minutový limit se resetuje po minutě, takže čekání roste až
// k ní - kratší čekání by jen znovu narazilo.
const CEKANI_PRI_LIMITU_MS = [20000, 40000, 60000];
// Jakmile jednou narazíme, dál se mezi soubory dělá pauza. Šest čtení na
// doklad při stropu 60/min znamená zhruba jeden doklad za 7 vteřin.
const PAUZA_PO_LIMITU_MS = 7000;

/*
 * Projde frontu vybraných souborů. Pravidlo 1: postupně, ne souběžně.
 * Pravidlo 2: chyba u jednoho fronta nezastaví.
 *
 * (v4.71) Náraz na limit Google NENÍ chyba souboru - fronta u něj počká a
 * zkusí to znovu. Označit takový soubor za nenahraný by znamenalo poslat
 * člověka hledat, které z třiceti dokladů chybí, kvůli něčemu, co se samo
 * spraví za minutu.
 */
async function nahratDoklad() {
  const zprava = document.getElementById('nahrat-zprava');
  const tlacitko = document.getElementById('tlacitko-nahrat');
  const kNahrani = vybraneSoubory
    .map((f, i) => ({ soubor: f, index: i }))
    .filter((x) => !x.soubor.chyba);
  if (!kNahrani.length) return;

  tlacitko.disabled = true;
  let hotovo = 0;
  let cekaNaDokonceni = 0;
  let nepovedlo = 0;
  let navic = 0;          // doklady navíc z jednoho scanu
  let brzdeno = false;    // narazili jsme cestou na limit Googlu?
  let pauzaMs = 0;

  for (let poradi = 0; poradi < kNahrani.length; poradi += 1) {
    const { soubor, index } = kNahrani[poradi];
    if (pauzaMs) await pockejMs(pauzaMs);

    zprava.innerHTML = '<div class="zprava">Nahrávám ' + (poradi + 1) + ' z ' + kNahrani.length
      + ': ' + escapeHtml(soubor.nazev) + '…</div>';

    let doklad = null;
    let chybaNahrani = null;
    // `souborId` drží soubor, který se na Disk nahrál, ale nestihl se
    // zapsat do Dokladů - další pokus ho použije místo nahrání znovu.
    let souborId = '';

    for (let pokus = 0; pokus <= CEKANI_PRI_LIMITU_MS.length; pokus += 1) {
      stavSouboruVeFronte(index, '<span class="badge-navrzeno">Nahrávám…</span>');
      try {
        const telo = souborId
          ? { souborId }
          : { filename: soubor.nazev, mimeType: soubor.mimeType, dataBase64: soubor.data };
        const odpoved = await zavolejApi('/upload', { method: 'POST', body: JSON.stringify(telo) });
        doklad = odpoved.doklad;
        chybaNahrani = null;
        break;
      } catch (e) {
        chybaNahrani = e;
        if (e.data && e.data.souborId) souborId = e.data.souborId;
        if (!jeLimitGoogleFront(e) || pokus === CEKANI_PRI_LIMITU_MS.length) break;

        brzdeno = true;
        pauzaMs = PAUZA_PO_LIMITU_MS;
        const cekani = CEKANI_PRI_LIMITU_MS[pokus];
        stavSouboruVeFronte(index,
          '<span class="badge-navrzeno">Čekám na Google…</span>',
          'Google na chvíli omezil počet dotazů za minutu. Appka počká '
            + Math.round(cekani / 1000) + ' s a zkusí to znovu – nic nedělejte.');
        await pockejMs(cekani);
      }
    }

    if (!doklad) {
      // Pravidlo 2: fronta jede dál.
      nepovedlo += 1;
      const naDisku = souborId
        ? ' Soubor je na Disku už uložený, takže o něj nepřijdete – při dalším pokusu se použije znovu.'
        : '';
      stavSouboruVeFronte(index, '<span class="badge-chybi">Nenahráno</span>',
        (chybaNahrani ? chybaNahrani.message : 'Nepodařilo se nahrát.') + naDisku);
      continue;
    }

    stavSouboruVeFronte(index, '<span class="badge-navrzeno">Čtu údaje AI…</span>');
    try {
      const odpoved = await zavolejApi('/upload-dokoncit', { method: 'POST', body: JSON.stringify({ id: doklad.ID }) });
      hotovo += 1;
      // Z jednoho scanu může vzniknout VÍC dokladů (víc účtenek vedle sebe,
      // viz zpravaPoZpracovaniDokladu výš). Bez téhle poznámky by souhrn
      // říkal „zpracováno 3" a v seznamu by přibylo pět položek.
      const dalsi = (odpoved && odpoved.dalsiDoklady) || [];
      navic += dalsi.length;
      stavSouboruVeFronte(index, '<span class="badge-potvrzeno">✓ Zpracováno</span>',
        dalsi.length ? 'Na tomhle souboru bylo víc dokladů vedle sebe – appka jich založila '
          + (dalsi.length + 1) + '.' : '');
    } catch (e) {
      // Pravidlo 4: soubor je uložený, jen ho AI nepřečetla. Doklad čeká
      // v seznamu ve stavu „Zpracovává se" a dokončí se odtud jedním
      // tlačítkem - nahrávat znovu se nemusí nic.
      if (jeLimitGoogleFront(e)) { brzdeno = true; pauzaMs = PAUZA_PO_LIMITU_MS; }
      cekaNaDokonceni += 1;
      stavSouboruVeFronte(index, '<span class="badge-navrzeno">Uloženo, čeká na AI</span>',
        'Soubor je bezpečně uložený, jen se ho teď nepodařilo přečíst. Najdete ho v Přijatých '
        + 'fakturách se stavem „Zpracovává se" a dokončíte tlačítkem „Dokončit zpracování".');
    }
  }

  // Výběr se čistí až po celé frontě - fáze 2 si soubor stahuje z Drive,
  // takže data v prohlížeči už nikdo nepotřebuje.
  document.getElementById('pole-soubor').value = '';
  document.getElementById('pole-foto').value = '';
  document.getElementById('vybrany-soubor-info').textContent = '';
  const vadne = vybraneSoubory.filter((f) => f.chyba).length;
  vybraneSoubory = [];
  tlacitko.textContent = 'Nahrát a zpracovat';
  tlacitko.disabled = true;

  const casti = [];
  if (hotovo) casti.push('zpracováno: ' + hotovo + (navic ? ' (a ' + navic + '× doklad navíc z jednoho scanu)' : ''));
  if (cekaNaDokonceni) casti.push('uloženo a čeká na dokončení: ' + cekaNaDokonceni);
  if (nepovedlo) casti.push('nenahráno: ' + nepovedlo);
  if (vadne) casti.push('nešlo nahrát: ' + vadne);
  const trida = (nepovedlo || vadne) ? 'info' : 'uspech';
  zprava.innerHTML = '<div class="zprava ' + trida + '">Hotovo – ' + casti.join(', ') + '.'
    + (brzdeno ? ' Google cestou omezil počet dotazů za minutu, takže to trvalo déle – appka kvůli tomu zpomalila a čekala.' : '')
    + (kNahrani.length > 1 ? ' Podrobnosti u jednotlivých souborů níž.' : '') + '</div>';
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

// Badge u SCHVÁLENÉHO dokladu: JE TO UHRAZENÉ? (v3.16, přeformulováno
// v4.67) Vnitřně je to pořád stav párování s bankou - appka pole `Stav_parovani_bankou`
// dopočítá na backendu při GET /doklady (viz netlify/functions/doklady.js),
// porovnáním s listem Bankovni_pohyby. U dokladů hrazených mimo účet
// (hotově/soukromou kartou) appka záměrně neukazuje "Nespárováno" - takový
// doklad protějšek v bance nikdy mít nebude, takže by to jen zbytečně
// vypadalo jako problém. U nechválených dokladů appka badge vůbec
// nezobrazuje - párování dává smysl kontrolovat až u vyřízených dokladů.
// Znovupoužívá stejné CSS třídy jako badge u Bankovních výpisů
// (badge-potvrzeno/navrzeno/chybi/bezdokladu), ať appka vizuálně nezavádí
// další paletu barev jen pro tohle.
/*
 * (v4.63) Zaškrtávátko „Zaúčtováno" přímo v řádku seznamu.
 *
 * Jan 2026-08-20: *„nové zaškrtávátko Zaúčtováno, které účetní ručně
 * zaškrtne, pokud zaúčtuje"*, a k umístění vybral „přímo v řádku" - účetní
 * projede seznam shora dolů a odklikává, bez rozklikávání dvaceti dokladů.
 *
 * Appka tenhle příznak NIKDY nenastaví sama (viz lib/dokladySchema.js).
 * Nabízí se jen u schváleného dokladu a jen účetní/adminovi; backend to
 * kontroluje znovu (netlify/functions/doklady.js) - tohle je jen proto,
 * aby se běžná role neklepala do něčeho, co jí stejně nepůjde.
 *
 * Doklad se zaškrtnutím NEZAMYKÁ - odškrtnout jde zpátky. Appka si k tomu
 * ukládá, kdo a kdy, a napíše to do tooltipu.
 */
function vytvorZauctovanoPrepinac(d) {
  const obal = document.createElement('label');
  obal.className = 'zauct-prepinac';

  if (d.Stav !== 'Schváleno') {
    // Zaúčtovat nejde něco, co ještě nikdo neschválil - a hlavně to ještě
    // nemá evidenční číslo. Prázdno je srozumitelnější než zašedlé pole.
    return obal;
  }
  const smi = stav.role === 'admin' || stav.role === 'ucetni';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = String(d.Zauctovano || '').trim() === 'ANO';
  box.disabled = !smi;
  box.title = box.checked
    ? 'Zaúčtováno' + (d.Zauctoval ? ' – ' + d.Zauctoval : '') + (d.Zauctovano_kdy ? ', ' + d.Zauctovano_kdy : '')
    : (smi ? 'Označit jako zaúčtované' : 'Označit smí jen účetní nebo admin');

  box.addEventListener('click', (e) => e.stopPropagation());
  box.addEventListener('change', async (e) => {
    e.stopPropagation();
    const hodnota = box.checked ? 'ANO' : '';
    box.disabled = true;
    try {
      await zavolejApi('/doklady', {
        method: 'PATCH',
        body: JSON.stringify({ id: d.ID, zmeny: { Zauctovano: hodnota } }),
      });
      // Lokální kopie se srovná taky, ať přepnutí sekce neukáže starý stav
      // (seznam se překresluje z dokladySeznamAktualni, ne z API).
      d.Zauctovano = hodnota;
      box.disabled = false;
      // (v4.64) Seznam se schválně NEPŘEKRESLUJE. Při filtru „jen
      // nezaúčtované" by zaškrtnutý řádek zmizel zpod kurzoru a další by se
      // posunul nahoru - další klepnutí by pak trefilo jiný doklad, než na
      // který se účetní dívala. Řádek zůstane, přepočítá se jen souhrn; ze
      // seznamu zmizí až při dalším přepnutí filtru.
      aktualizujSouhrnFirmyDokladu();
    } catch (err) {
      box.checked = !box.checked;
      box.disabled = false;
      alert('Nepodařilo se uložit zaúčtování: ' + err.message);
    }
  });

  const popisek = document.createElement('span');
  popisek.className = 'zauct-popisek';
  popisek.textContent = 'Zaúčt.';

  obal.appendChild(box);
  obal.appendChild(popisek);
  return obal;
}

// Přepočet věty „…z toho N× zaúčtováno" po zaškrtnutí. Celý seznam se
// kvůli tomu překreslovat nesmí - rozbalený detail dokladu by se zavřel.
function aktualizujSouhrnFirmyDokladu() {
  const souhrnEl = document.getElementById('doklady-souhrn-firmy');
  const vyber = document.getElementById('doklady-vyber-firmy');
  if (!souhrnEl || !vyber || dokladySekce !== 'schvalene' || !vyber.value) return;
  const schvalene = dokladySeznamAktualni.filter((d) => d.Stav === 'Schváleno');
  souhrnEl.innerHTML = souhrnDokladuHtml(filtrSchvalenychDokladu(schvalene));
}

/*
 * Stav úhrady dokladu jako JEDNO rozhodnutí - text odznaku i ikona.
 *
 * (v4.75) Proč to je pohromadě: v první verzi se odznak počítal tady a
 * ikona zvlášť z `Zpusob_platby`, a Jan hned našel doklad, kde si to
 * odporovalo - odznak hlásil „Uhrazeno hotově" a vedle svítila ikona
 * karty (2026-08-21: *„uhrazeno hotově nemůže být ikona karty"*).
 *
 * Byl to doklad zaplacený SOUKROMOU kartou: `Zpusob_platby = "Karta"`
 * a zároveň `Hrazeno_mimo_ucet = "ANO"`. Obojí je pravda a appka měla
 * pravdu dvakrát, jen si ji řekla dvěma způsoby najednou. Dokud text
 * a ikona vznikají na jednom místě, tohle se stát nemůže.
 */
function stavUhradyDokladu(d) {
  // (v4.67) Sloupec mluví o ÚHRADĚ, ne o párování. Jan 2026-08-20:
  // *„spárováno znamená také uhrazeno (výpis na účtu nebo hotovost)"*.
  // „Spárováno" byl termín z vnitřku appky - pro účetní je to jen mezikrok
  // k jediné otázce, která ji zajímá: je to zaplacené?
  //
  // Obě cesty k úhradě vypadají stejně silně, protože stejně silné jsou:
  // potvrzený bankovní pohyb i hotovost jsou obojí doložená platba. Liší se
  // jen v popisku, ať je poznat ČÍM se platilo.
  const zpusob = String(d.Zpusob_platby || '').trim();
  if (jeHrazenoMimoUcet(d)) {
    // Mimo účet neznamená automaticky hotovost - stejně tak to může být
    // soukromá karta. Appka proto opíše, co u dokladu doopravdy stojí,
    // místo aby všechno mimo účet nazvala hotovostí.
    if (zpusob === 'Karta') {
      return {
        trida: 'badge-potvrzeno', text: '✓ Uhrazeno kartou', zpusob: 'Karta',
        popis: 'Uhrazeno soukromou kartou mimo firemní účet – protějšek v bankovním výpisu se u takového dokladu nehledá',
      };
    }
    if (zpusob === 'Převodem') {
      return {
        trida: 'badge-potvrzeno', text: '✓ Uhrazeno mimo účet', zpusob: 'Převodem',
        popis: 'Uhrazeno převodem mimo firemní účet – protějšek v bankovním výpisu se u takového dokladu nehledá',
      };
    }
    return {
      trida: 'badge-potvrzeno', text: '✓ Uhrazeno hotově', zpusob: 'Hotovost',
      popis: 'Uhrazeno hotově – protějšek v bankovním výpisu se u takového dokladu nehledá',
    };
  }
  if (d.Stav_parovani_bankou === 'Potvrzeno') {
    return {
      trida: 'badge-potvrzeno', text: '✓ Uhrazeno', zpusob: zpusob || 'Převodem',
      popis: 'Uhrazeno – appka našla odpovídající pohyb v bankovním výpisu a účetní ho potvrdila',
    };
  }
  if (d.Stav_parovani_bankou === 'Navrženo') {
    return {
      trida: 'badge-navrzeno', text: 'Návrh úhrady', zpusob,
      popis: 'Appka našla v bankovním výpisu pohyb, který na doklad sedí, ale nikdo ho zatím nepotvrdil – odklepněte v Bankovních výpisech',
    };
  }
  // Janova volba: appka řekne, co VÍ (platbu nenašla), ne co neví. Tvrdé
  // „Neuhrazeno" by u faktury, ke které se jen ještě nenačetl výpis, svádělo
  // k zaplacení podruhé.
  return {
    trida: 'badge-chybi', text: 'Nenalezena platba', zpusob,
    popis: 'Appka k tomuhle dokladu nenašla žádnou platbu. Nemusí to znamenat, že zaplacený není – může jen chybět načtený bankovní výpis, nebo se platba nespárovala.',
  };
}

// (v4.35) Viditelný text appka zkrátila kvůli přechodu na pevnou grid
// mřížku - plné znění appka nechává v `title` atributu (tooltip).
// (v4.75) Ikona způsobu platby je součástí odznaku, ne samostatná buňka -
// mřížka řádku má pevný počet sloupců a osmý by rozhodil zarovnání
// hlavičky (chyba z v4.64).
function bankSparovaniBadge(d) {
  if (d.Stav !== 'Schváleno') return '';
  const stavUhrady = stavUhradyDokladu(d);
  return ikonaZpusobuPlatbyHtml(stavUhrady.zpusob) +
    '<span class="' + stavUhrady.trida + '" title="' + escapeAttr(stavUhrady.popis) + '">' +
    escapeHtml(stavUhrady.text) + '</span>';
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
    const [dataDoklady, dataFirmy, dataStrediska, dataOsnova, dataPredkontace, dataKarty] = await Promise.all([
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
      zavolejApi('/uctova-osnova', { method: 'GET' }).catch(() => ({ ucty: [] })),
      zavolejApi('/predkontace', { method: 'GET' }).catch(() => ({ predkontace: [] })),
      // (v4.75) Platební karty kvůli jménu držitele u dokladu - stejná
      // tolerance jako výš, viz popisDrzitelKarty().
      zavolejApi('/platebni-karty', { method: 'GET' }).catch(() => ({ karty: [] })),
    ]);
    firmyProVyberDokladu = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    strediskaSeznam = dataStrediska.strediska || [];
    uctovaOsnovaSeznam = dataOsnova.ucty || [];
    predkontaceSeznam = dataPredkontace.predkontace || [];
    dokladyKartySeznam = dataKarty.karty || [];
    nacitani.classList.add('skryto');
    vyplnVyberFiremDokladu(dataDoklady.doklady || []);
    vykresliDoklady(dataDoklady.doklady || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst doklady: ' + e.message;
  }
}

// (v4.63) Firma u schválených dokladů. Stejný číselník jako všude jinde
// (list Firmy), ne ruční opis - viz moznostiFirmySeznam níž pro důvod.
// Výchozí hodnota je prázdná: appka nevybere firmu za člověka, protože
// „schválené doklady firmy X" je tvrzení, které má na obrazovce vzniknout
// až po vědomém výběru.
function vyplnVyberFiremDokladu(doklady) {
  const vyber = document.getElementById('doklady-vyber-firmy');
  if (!vyber) return;
  const puvodni = vyber.value;
  vyber.innerHTML = '<option value="">— vyberte firmu —</option>' +
    firmyProVyberDokladu.map((n) =>
      '<option value="' + escapeAttr(n) + '">' + escapeHtml(n) + '</option>').join('');
  if (puvodni && firmyProVyberDokladu.includes(puvodni)) vyber.value = puvodni;

  // (v4.64) Roky se berou z toho, co v dokladech opravdu je, plus letošek -
  // stejný postup jako u filtru v Exportu. Napevno daný rozsah by u starších
  // dokladů buď chyběl, nebo by nabízel roky, ve kterých nic není.
  const selRok = document.getElementById('doklady-filtr-rok');
  if (!selRok) return;
  const vybranyRok = selRok.value;
  const leta = new Set([String(new Date().getFullYear())]);
  (doklady || []).forEach((d) => {
    const rok = String(d.DUZP || d.Datum_dokladu || '').slice(0, 4);
    if (/^\d{4}$/.test(rok)) leta.add(rok);
  });
  selRok.innerHTML = '<option value="">Všechny roky</option>' +
    Array.from(leta).sort((a, b) => b.localeCompare(a))
      .map((r) => '<option value="' + r + '"' + (r === vybranyRok ? ' selected' : '') + '>' + r + '</option>')
      .join('');
}

function prepniDokladySekci(sekce) {
  dokladySekce = sekce;
  // Výběr firmy patří jen ke schváleným (Janova volba). „Ke schválení"
  // zůstává přes všechny firmy - tam jde o to nic nepřehlédnout.
  const filtr = document.getElementById('doklady-filtr-firmy');
  if (filtr) filtr.classList.toggle('skryto', sekce !== 'schvalene');
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

/* ---------------------------------------------------------------------------
 * (v4.66) ŘAZENÍ SEZNAMU PŘIJATÝCH FAKTUR
 *
 * Jan 2026-08-20: *„potřebuju to umět seřadit podle kriterií které vyberu,
 * datum musí být vytěžené z dokladu jako datum vystavení"*.
 *
 * Kopie lib/razeniDokladu.js - prohlížeč nemá build krok a `require` neumí
 * (stejná konvence jako u parsujCastkuZListu výš). **Musí zůstat přesně
 * synchronní s originálem**, test-v466.js to hlídá.
 *
 * Čtyři pravidla, která se nesmí změkčit, jsou popsaná v lib/razeniDokladu.js:
 * prázdné hodnoty vždycky dolů, evidenční číslo jako (rok, pořadí), stav
 * banky podle významu a stabilní řazení.
 * ------------------------------------------------------------------------- */
const SLOUPCE_RAZENI = ['cislo', 'stav', 'banka', 'dodavatel', 'datum', 'castka', 'zauctovano'];
const PORADI_BANKY = { nesparovano: 0, navrh: 1, sparovano: 2 };

// Výchozí pořadí: podle data vystavení, nejnovější nahoře. To je to, co
// účetní čeká, když seznam otevře.
let dokladyRazeniSloupec = 'datum';
let dokladyRazeniSmer = 'desc';

function textCislo(hodnota) {
  return String(hodnota === null || hodnota === undefined ? '' : hodnota).trim();
}

function klicEvidencnihoCisla(hodnota) {
  const text = textCislo(hodnota);
  if (!text) return null;
  const m = text.match(/(\d+)\s*[-–]\s*(\d{4})/);
  if (!m) return { rok: 0, poradi: 0, text };
  return { rok: parseInt(m[2], 10), poradi: parseInt(m[1], 10), text };
}

// (v4.75) Přesná kopie lib/nazvyScanu.js -> jeHrazenoMimoUcet. Jan
// 2026-08-21: *„když zakliknu hotově, znamená to že to je mimo účet, tak
// se to doubluje"* - hotovost se na výpisu z firemního účtu neobjeví nikdy,
// takže „Hotovost" a příznak „mimo účet" jsou jedno tvrzení, ne dva údaje.
// Prohlížeč si `lib/` načíst neumí (appka nemá build krok), takže je to tu
// zduplikované; test-v475.js hlídá, že se obě kopie nerozešly.
function jeHrazenoMimoUcet(d) {
  if (!d) return false;
  if (textCislo(d.Hrazeno_mimo_ucet).toUpperCase() === 'ANO') return true;
  return textCislo(d.Zpusob_platby) === 'Hotovost';
}

function klicBanky(d) {
  if (jeHrazenoMimoUcet(d)) return PORADI_BANKY.sparovano;
  const stav = textCislo(d.Stav_parovani_bankou);
  if (stav === 'Potvrzeno') return PORADI_BANKY.sparovano;
  if (stav === 'Navrženo') return PORADI_BANKY.navrh;
  return PORADI_BANKY.nesparovano;
}

function klicSloupce(d, sloupec) {
  if (sloupec === 'cislo') {
    const k = klicEvidencnihoCisla(d.Evidencni_cislo);
    return k ? k.rok * 100000 + k.poradi : null;
  }
  if (sloupec === 'stav') return textCislo(d.Stav) || null;
  if (sloupec === 'banka') return klicBanky(d);
  if (sloupec === 'dodavatel') return textCislo(d.Dodavatel) || null;
  if (sloupec === 'datum') return textCislo(d.Datum_dokladu) || null;
  if (sloupec === 'castka') {
    const c = parsujCastkuZListu(d.Castka);
    return textCislo(d.Castka) === '' ? null : c;
  }
  if (sloupec === 'zauctovano') return textCislo(d.Zauctovano).toUpperCase() === 'ANO' ? 1 : 0;
  return null;
}

function remizou(a, b) {
  const ka = klicEvidencnihoCisla(a.Evidencni_cislo);
  const kb = klicEvidencnihoCisla(b.Evidencni_cislo);
  const ca = ka ? ka.rok * 100000 + ka.poradi : -1;
  const cb = kb ? kb.rok * 100000 + kb.poradi : -1;
  return cb - ca;
}

function serazDoklady(doklady, sloupec, smer) {
  const dolu = smer === 'desc' ? -1 : 1;
  const radek = (doklady || []).slice();
  radek.sort((a, b) => {
    const ka = klicSloupce(a, sloupec);
    const kb = klicSloupce(b, sloupec);
    const prazdneA = ka === null || ka === '';
    const prazdneB = kb === null || kb === '';
    if (prazdneA && prazdneB) return remizou(a, b);
    if (prazdneA) return 1;
    if (prazdneB) return -1;
    let rozdil;
    if (typeof ka === 'number' && typeof kb === 'number') {
      rozdil = ka - kb;
    } else {
      rozdil = String(ka).localeCompare(String(kb), 'cs');
    }
    if (rozdil !== 0) return rozdil * dolu;
    return remizou(a, b);
  });
  return radek;
}

/*
 * Klepnutí na nadpis sloupce. První klepnutí na nový sloupec řadí tak, jak
 * to u něj dává smysl: u data, částky a zaúčtování sestupně (nejnovější,
 * největší a hotové napřed), u textu vzestupně od A. Další klepnutí na
 * tentýž sloupec směr otočí.
 */
function prepniRazeniDokladu(sloupec) {
  if (SLOUPCE_RAZENI.indexOf(sloupec) === -1) return;
  if (dokladyRazeniSloupec === sloupec) {
    dokladyRazeniSmer = dokladyRazeniSmer === 'asc' ? 'desc' : 'asc';
  } else {
    dokladyRazeniSloupec = sloupec;
    dokladyRazeniSmer = ['datum', 'castka', 'zauctovano'].indexOf(sloupec) !== -1 ? 'desc' : 'asc';
  }
  vykresliDoklady(dokladySeznamAktualni);
}

// Šipka u aktivního sloupce. Bez ní by nebylo poznat, podle čeho je seznam
// seřazený - a to je horší než neseřazený seznam, protože se tomu věří.
function oznacRazeniVHlavicce() {
  document.querySelectorAll('.doklad-radek-hlavicka > span[data-sloupec]').forEach((el) => {
    const aktivni = el.dataset.sloupec === dokladyRazeniSloupec;
    el.classList.toggle('razeni-aktivni', aktivni);
    const sipka = el.querySelector('.razeni-sipka');
    if (sipka) sipka.remove();
    if (!aktivni) return;
    const nova = document.createElement('span');
    nova.className = 'razeni-sipka';
    nova.textContent = dokladyRazeniSmer === 'asc' ? ' ▲' : ' ▼';
    el.appendChild(nova);
  });
}

function vykresliDoklady(doklady) {
  dokladySeznamAktualni = doklady;
  const kontejner = document.getElementById('doklady-seznam');

  const keSchvaleniPocet = doklady.filter((d) => d.Stav !== 'Schváleno').length;
  const schvalenePocet = doklady.filter((d) => d.Stav === 'Schváleno').length;
  document.getElementById('dokl-sekce-ke-schvaleni').textContent = 'Ke schválení (' + keSchvaleniPocet + ')';
  document.getElementById('dokl-sekce-schvalene').textContent = 'Schválené (' + schvalenePocet + ')';

  let filtrovane = doklady.filter((d) =>
    dokladySekce === 'schvalene' ? d.Stav === 'Schváleno' : d.Stav !== 'Schváleno'
  );

  // (v4.63) Ve schválených je výběr firmy POVINNÝ - stejně jako
  // v Bankovních výpisech. Dokud firma vybraná není, appka nic nevypíše;
  // schválené doklady se s účetní procházejí po jedné firmě.
  const souhrnEl = document.getElementById('doklady-souhrn-firmy');
  let prazdnyText = 'Nic ke schválení.';
  if (dokladySekce === 'schvalene') {
    const vyber = document.getElementById('doklady-vyber-firmy');
    if (!vyber || !vyber.value) {
      kontejner.innerHTML = '<div class="nacitani">Vyberte firmu…</div>';
      if (souhrnEl) souhrnEl.innerHTML = '';
      return;
    }
    const vyber2 = filtrSchvalenychDokladu(filtrovane);
    filtrovane = vyber2.kZobrazeni;
    prazdnyText = vyber2.zauctovani
      ? 'Tomuhle filtru neodpovídá žádný doklad – zkuste zrušit zúžení na '
        + (vyber2.zauctovani === 'ano' ? 'zaúčtované.' : 'nezaúčtované.')
      : 'U téhle firmy a období zatím žádné schválené doklady nejsou.';
    if (souhrnEl) souhrnEl.innerHTML = souhrnDokladuHtml(vyber2);
  } else if (souhrnEl) {
    souhrnEl.innerHTML = '';
  }

  // (v4.66) Řadí se podle sloupce, který si člověk vybral v hlavičce.
  // Do v4.65 to bylo natvrdo podle `Datum_zpracovani` (kdy se doklad nahrál)
  // - na Janově snímku to vypadalo jako by seznam seřazený nebyl vůbec,
  // protože pořadí nahrání neodpovídá pořadí dokladů.
  const serazene = serazDoklady(filtrovane, dokladyRazeniSloupec, dokladyRazeniSmer);
  oznacRazeniVHlavicce();

  kontejner.innerHTML = '';
  serazene.forEach((d) => kontejner.appendChild(vytvorRadekDoklad(d)));

  if (serazene.length === 0) {
    kontejner.innerHTML = '<div class="nacitani">' + escapeHtml(prazdnyText) + '</div>';
  }
}

/*
 * (v4.64) Filtr pro účetní: firma + období + zaúčtování.
 *
 * Jan 2026-08-20: *„udelej ješte to filtrování pro účetní"*. Ve v4.63 šlo
 * zaúčtování jen přečíst, ne si podle něj seznam zúžit - a přesně to účetní
 * dělá: „ukaž mi, co za srpen ještě není zaúčtované".
 *
 * Vrací dvě různě široké množiny a to rozlišení je důležité:
 *   vBloku     - firma + období (bez ohledu na zaúčtování). Z TOHO se počítá
 *                souhrn, aby věta „z toho 3× zaúčtováno" dávala smysl i
 *                tehdy, když je zapnuté „jen nezaúčtované" a v seznamu
 *                žádný zaúčtovaný vidět není.
 *   kZobrazeni - to samé zúžené filtrem zaúčtování. To se vypisuje.
 *
 * Kdyby se souhrn počítal z `kZobrazeni`, hlásil by při filtru „jen
 * nezaúčtované" vždycky „z toho 0× zaúčtováno" - technicky pravda, ale
 * účetní by z toho četla, že nemá hotové nic.
 */
function filtrSchvalenychDokladu(schvalene) {
  const hodnota = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const firma = hodnota('doklady-vyber-firmy');
  const mesic = hodnota('doklady-filtr-mesic');
  const rok = hodnota('doklady-filtr-rok');
  const zauctovani = hodnota('doklady-filtr-zauctovano');

  const vBloku = (schvalene || []).filter((d) => {
    if ((d.Firma_potvrzena || d.Firma_AI_odhad || '') !== firma) return false;
    // Období podle DUZP, a když chybí, podle data dokladu - stejné pravidlo
    // jako v Daňovém přehledu a v Exportu.
    const obdobi = String(d.DUZP || d.Datum_dokladu || '');
    if (rok && obdobi.slice(0, 4) !== rok) return false;
    if (mesic && obdobi.slice(5, 7) !== mesic) return false;
    return true;
  });

  const kZobrazeni = vBloku.filter((d) => {
    if (!zauctovani) return true;
    const je = String(d.Zauctovano || '').trim().toUpperCase() === 'ANO';
    return zauctovani === 'ano' ? je : !je;
  });

  return { firma, mesic, rok, zauctovani, vBloku, kZobrazeni };
}

/*
 * Souhrn nad seznamem schválených dokladů.
 *
 * (v4.76) Byla to jedna věta („12× schválený doklad, z toho 3× zaúčtováno.").
 * Jan 2026-08-21: *„udělej hezké ikony místo jen textu, kolik je zaúčtováno
 * apod."* - a hlavně: k počtu patří i OBJEM. Dvacet paragonů po stokoruně a
 * jedna faktura za půl milionu je dvacet jedna dokladů a úplně jiná práce.
 *
 * Souhrn se schválně počítá z `vBloku` (celý blok po filtru firmy/období),
 * ne z `kZobrazeni` - kdyby se počítal ze zobrazených řádků, hlásil by při
 * zúžení na „jen nezaúčtované" pokaždé „0 zaúčtováno". Technicky pravda,
 * ale účetní by z toho četla, že nemá hotové nic.
 */
function souhrnDokladuHtml(vyber) {
  const zauctovane = vyber.vBloku.filter((d) =>
    String(d.Zauctovano || '').trim().toUpperCase() === 'ANO');
  const nezauctovane = vyber.vBloku.filter((d) =>
    String(d.Zauctovano || '').trim().toUpperCase() !== 'ANO');

  let html = '<div class="stat-rada">'
    + statDlazdice('doklad', vyber.vBloku.length, 'Schválené doklady',
      castkyJakoRadky(castkyDokladuPodleMeny(vyber.vBloku)))
    + statDlazdice('zauctovano', zauctovane.length, 'Zaúčtováno',
      castkyJakoRadky(castkyDokladuPodleMeny(zauctovane)), zauctovane.length ? 'hotovo' : '')
    + statDlazdice('zbyva', nezauctovane.length, 'Zbývá zaúčtovat',
      castkyJakoRadky(castkyDokladuPodleMeny(nezauctovane)), nezauctovane.length ? 'ceka' : '')
    + '</div>';

  // Když filtr něco skrývá, appka to NAPÍŠE. Jinak by se dalo snadno
  // uzavřít měsíc s tím, že „už tam nic není", a ono tam bylo - jen
  // schované filtrem.
  if (vyber.zauctovani) {
    html += '<div class="stat-poznamka">Zobrazeno: ' + vyber.kZobrazeni.length + '× '
      + (vyber.zauctovani === 'ano' ? 'zaúčtovaný' : 'nezaúčtovaný')
      + ' – dlaždice nahoře počítají celý vybraný měsíc, ne jen zobrazené řádky.</div>';
  }
  return html;
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
// ---------------------------------------------------------------------------
// MŘÍŽKA POLÍ (v4.75)
//
// Jan 2026-08-21: *„upravíme grafiku, data mohou být vedle sebe, jsou to
// čísla"*. Detail dokladu měl každé pole na vlastním řádku, takže vytěžená
// faktura byla přes 1 400 px vysoká a částka s DPH, datum dokladu a datum
// splatnosti - údaje, které se čtou POHROMADĚ - byly od sebe na tři obrazovky
// scrollování daleko.
//
// Mřížka má 12 sloupců a pole si říká, kolik jich zabere (`pole-4` = třetina).
// Krátké hodnoty (částka, měna, sazba, datum, čtyřčíslí karty) tak sedí vedle
// sebe, dlouhé (dodavatel, číslo účtu) mají celý řádek.
//
// DVĚ VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
//
// 1) NA MOBILU SE MŘÍŽKA SKLÁDÁ ZPĚT POD SEBE. Dělá to CSS (viz media
//    dotaz u .pole-mrizka v public/style.css), ne JS. Kdyby se šířky
//    zadrátovaly do `style.width`, appka by na telefonu měla čtyři pole
//    o šířce 60 px vedle sebe.
// 2) POPISEK PATŘÍ KE KAŽDÉMU POLI ZVLÁŠŤ. Dřív jeden popisek mluvil za dvě
//    pole („Částka a měna"), což vedle sebe nedává smysl - a hlavně to
//    znamenalo, že druhé pole popisek nemělo vůbec.
function vytvorMrizkuPoli() {
  const mrizka = document.createElement('div');
  mrizka.className = 'pole-mrizka';
  return mrizka;
}

/**
 * Přidá do mřížky jedno pole (popisek + libovolné vstupy pod ním).
 *
 * @param {HTMLElement} mrizka - výsledek vytvorMrizkuPoli()
 * @param {number} sirka - kolik z 12 sloupců pole zabere (0 = celý řádek)
 * @param {string} popisek - text nad polem ('' = bez popisku)
 * @param {...HTMLElement} prvky - vstupy, které do pole patří
 * @returns {HTMLElement} buňka, kdyby do ní volající chtěl přidat něco dál
 */
function pridejPole(mrizka, sirka, popisek, ...prvky) {
  const bunka = document.createElement('div');
  if (sirka) bunka.className = 'pole-' + sirka;
  if (popisek) {
    const label = document.createElement('label');
    label.textContent = popisek;
    bunka.appendChild(label);
  }
  prvky.forEach((p) => { if (p) bunka.appendChild(p); });
  mrizka.appendChild(bunka);
  return bunka;
}

// Šedý nadpis skupiny přes celou šířku (ČÁSTKY / DATA / PLATBA / ZAÚČTOVÁNÍ).
// Bez něj by se z detailu stala mřížka dvaceti stejně vypadajících okének;
// takhle je poznat, kde jedna věc končí a druhá začíná.
function pridejSkupinuPoli(mrizka, nadpis) {
  const prvek = document.createElement('div');
  prvek.className = 'pole-skupina';
  prvek.textContent = nadpis;
  mrizka.appendChild(prvek);
  return prvek;
}

// ---------------------------------------------------------------------------
// IKONY ZPŮSOBU PLATBY (v4.75)
//
// Jan 2026-08-21: *„navrhni také ikony pro platbu kartou a hotovost"*.
//
// Proč vůbec: v seznamu dokladů se dá poznat, jestli je doklad uhrazený
// (badge ✓ Uhrazeno), ale ne ČÍM. Účetní přitom potřebuje vidět hlavně to,
// co se nebude párovat s výpisem - hotovost - a co má hledat pod čtyřčíslím
// karty. Ikona to řekne bez jediného slova navíc v už tak plné hlavičce.
//
// Ikony jsou inline SVG, ne emoji ani ikonový font: emoji vypadá na každém
// systému jinak (a na Windows je 💵 zelený obdélník bez čitelného tvaru) a
// font by byl další soubor ke stažení. `currentColor` znamená, že ikona
// zdědí barvu textu kolem - funguje tak i v tmavém motivu.
//
// Ikona NIKDY nestojí sama: má `title` i `aria-label`, aby se dala přečíst
// i myší a odečítačem. Tvar sám o sobě není informace, kterou by appka
// směla podávat jen barvou nebo jen obrázkem.
const IKONY_PLATBY = {
  Karta: {
    popis: 'Placeno kartou',
    svg: '<rect x="1.5" y="3.5" width="13" height="9" rx="1.8"/><path d="M1.5 6.5h13" stroke-width="2.2"/><path d="M3.8 10h3.2"/>',
  },
  // Mince, ne bankovka. Jan 2026-08-21 na první verzi: *„uhrazeno hotově
  // nemůže být ikona karty, ale třeba mince"*. Bankovka i karta jsou oboje
  // ležatý obdélník - v patnácti pixelech se od sebe nepoznaly. Sloupeček
  // mincí má úplně jinou siluetu, takže se s kartou splést nedá.
  Hotovost: {
    popis: 'Placeno hotově',
    svg: '<ellipse cx="8" cy="4.6" rx="5.2" ry="2.1"/>'
      + '<path d="M2.8 4.6v6.8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1V4.6"/>'
      + '<path d="M2.8 8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1"/>',
  },
  'Převodem': {
    popis: 'Placeno převodem',
    svg: '<path d="M2 6h9.5M9 3.5 12 6 9 8.5"/><path d="M14 10H4.5M7 12.5 4 10l3-2.5"/>',
  },
};

/**
 * Ikona způsobu platby jako HTML (pro řádky seznamu, které se skládají
 * z řetězců), nebo '' když způsob platby appka nezná.
 *
 * Prázdný způsob platby schválně nedostane žádnou ikonu ani zástupný
 * otazník: appka říká, co ví, ne co neví.
 */
function ikonaZpusobuPlatbyHtml(zpusobPlatby) {
  const klic = String(zpusobPlatby || '').trim();
  const ikona = IKONY_PLATBY[klic];
  if (!ikona) return '';
  return '<svg class="ikona-platby" viewBox="0 0 16 16" role="img" aria-label="' +
    escapeAttr(ikona.popis) + '"><title>' + escapeHtml(ikona.popis) + '</title>' +
    ikona.svg + '</svg>';
}

// ---------------------------------------------------------------------------
// PŘEPÍNAČ ZPŮSOBU PLATBY (v4.75)
//
// Jan 2026-08-21: *„v další části udělej dvě pole s ikonami karty a mincí
// (hotovost) graficky hezky"*.
//
// Dřív to bylo rolovací menu. Způsob platby má ale jen čtyři možnosti a dvě
// z nich (karta, hotovost) opravuje Jan při kontrole nejčastěji - v menu se
// za ně muselo dvakrát kliknout a nebylo vidět, co je vybrané, dokud ho
// člověk nerozbalil. Jako dlaždice jsou všechny naráz na očích.
//
// TŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
//
// 1) JSOU TO OPRAVDU RADIO TLAČÍTKA. Vypadají jako dlaždice, ale uvnitř je
//    <input type="radio">, takže to umí klávesnice i odečítač a formulář se
//    chová jako formulář. Naklikaná <div>ka by vypadala stejně a byla by
//    nepoužitelná pro každého, kdo nemyší.
// 2) IKONA NIKDY NESTOJÍ SAMA. U každé dlaždice je i slovo - „karta" a
//    „mince" jsou v patnácti pixelech dvě kolečka a obdélník, ne informace.
// 3) „NEUVEDENO" JE PLNOHODNOTNÁ VOLBA. Appka nesmí za člověka vybrat
//    způsob platby jen proto, že vypadá líp, když je něco zaškrtnuté -
//    u dokladu, ze kterého to AI nevyčetla, je pravda „nevíme".
let poradiPrepinacePlatby = 0;

function vytvorPrepinacZpusobuPlatby(vybrano) {
  poradiPrepinacePlatby += 1;
  const skupina = 'zpusob-platby-' + poradiPrepinacePlatby;
  const prepinac = document.createElement('div');
  prepinac.className = 'prepinac-platby';
  prepinac.setAttribute('role', 'radiogroup');
  prepinac.setAttribute('aria-label', 'Způsob platby');

  const MOZNOSTI = [
    { hodnota: 'Karta', popisek: 'Karta' },
    { hodnota: 'Hotovost', popisek: 'Hotovost' },
    { hodnota: 'Převodem', popisek: 'Převodem' },
    { hodnota: '', popisek: 'Neuvedeno' },
  ];

  MOZNOSTI.forEach((m) => {
    const dlazdice = document.createElement('label');
    dlazdice.className = 'prepinac-platby-volba';
    if (IKONY_PLATBY[m.hodnota]) dlazdice.title = IKONY_PLATBY[m.hodnota].popis;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = skupina;
    radio.value = m.hodnota;
    radio.checked = String(vybrano || '') === m.hodnota;
    dlazdice.appendChild(radio);

    const obrazek = document.createElement('span');
    obrazek.className = 'prepinac-platby-ikona';
    // Prázdná volba dostane pomlčku místo ikony - zástupný otazník by
    // vypadal jako chyba, a přitom „nevíme" je legitimní stav.
    obrazek.innerHTML = ikonaZpusobuPlatbyHtml(m.hodnota) || '<span aria-hidden="true">–</span>';
    dlazdice.appendChild(obrazek);

    const text = document.createElement('span');
    text.className = 'prepinac-platby-text';
    text.textContent = m.popisek;
    dlazdice.appendChild(text);

    prepinac.appendChild(dlazdice);
  });

  // Zvýraznění vybrané dlaždice navěšuje JS, ne CSS: `:has(input:checked)`
  // je novější vlastnost a prohlížeč, který ji neumí, ji tiše přeskočí -
  // přepínač by pak vypadal, že není vybráno nic.
  function oznacVybranou() {
    prepinac.querySelectorAll('.prepinac-platby-volba').forEach((dl) => {
      const radio = dl.querySelector('input[type="radio"]');
      dl.classList.toggle('vybrano', !!(radio && radio.checked));
    });
  }
  prepinac.addEventListener('change', oznacVybranou);
  oznacVybranou();

  // Volající pracuje s přepínačem jako s <select>em (`.value`), aby se
  // ukládání dokladu nemuselo dozvědět, že se změnilo UI.
  Object.defineProperty(prepinac, 'value', {
    get() {
      const vybrany = prepinac.querySelector('input[type="radio"]:checked');
      return vybrany ? vybrany.value : '';
    },
  });
  return prepinac;
}

// ---------------------------------------------------------------------------
// IKONY STAVŮ A STATISTICKÉ DLAŽDICE (v4.76)
//
// Jan 2026-08-21: *„udělej hezké ikony místo jen textu, kolik je zaúčtováno
// apod."*.
//
// Čísla, která se čtou jedním pohledem („kolik zbývá zaúčtovat"), byla
// schovaná v obyčejné větě mezi filtrem a seznamem. Věta se čte odshora
// dolů; dlaždice s ikonou se pozná periferním viděním - a v Dashboardu, kde
// je karet vedle sebe pět, je to rozdíl mezi „přečíst" a „všimnout si".
//
// Stejná pravidla jako u ikon způsobu platby (viz IKONY_PLATBY výš): inline
// SVG kreslené linkou v `currentColor`, žádné emoji ani ikonový font, a
// IKONA NIKDY NESTOJÍ SAMA - vždycky s číslem a popiskem. Tvar sám o sobě
// není informace, kterou by appka směla podávat jen obrázkem.
const IKONY_STAVU = {
  doklad: {
    popis: 'Doklad',
    svg: '<path d="M9.3 1.6H4.4a1.3 1.3 0 0 0-1.3 1.3v10.2a1.3 1.3 0 0 0 1.3 1.3h7.2a1.3 1.3 0 0 0 1.3-1.3V5.3z"/>'
      + '<path d="M9.3 1.6v3.7h3.6"/><path d="M5.6 8.4h4.8M5.6 11h3.2"/>',
  },
  // (v4.80) Tiskárna - záložka „Dokumenty" na kartě bytu. Ikona `doklad`
  // by se sem hodila tvarem, ale její popis („Doklad") by u záložky
  // o předávacím protokolu četla čtečka jako „Doklad Dokumenty" a doklad
  // je v téhle appce něco úplně jiného: přijatá faktura.
  dokument: {
    popis: 'Dokument k tisku',
    svg: '<path d="M4.6 6.2V2.4h6.8v3.8"/><path d="M4.6 12h-1a1.3 1.3 0 0 1-1.3-1.3V7.5a1.3 1.3 0 0 1 1.3-1.3h8.8a1.3 1.3 0 0 1 1.3 1.3v3.2a1.3 1.3 0 0 1-1.3 1.3h-1"/>'
      + '<path d="M4.6 9.8h6.8v3.8H4.6z"/>',
  },
  zauctovano: {
    popis: 'Zaúčtováno',
    svg: '<path d="M9.3 1.6H4.4a1.3 1.3 0 0 0-1.3 1.3v10.2a1.3 1.3 0 0 0 1.3 1.3h7.2a1.3 1.3 0 0 0 1.3-1.3V5.3z"/>'
      + '<path d="M9.3 1.6v3.7h3.6"/><path d="m5.5 9.9 1.7 1.7 3.4-3.6"/>',
  },
  zbyva: {
    popis: 'Zbývá zaúčtovat',
    svg: '<circle cx="8" cy="8" r="6"/><path d="M8 4.4V8l2.5 1.7"/>',
  },
  keSchvaleni: {
    popis: 'Čeká na schválení',
    svg: '<path d="M3.4 2.8h9.2l1.3 6.2v3.2a1.1 1.1 0 0 1-1.1 1.1H3.2a1.1 1.1 0 0 1-1.1-1.1V9z"/>'
      + '<path d="M2.1 9h3.3l1 1.9h3.2l1-1.9h3.3"/>',
  },
  banka: {
    popis: 'Bankovní pohyb',
    svg: '<path d="M6.4 9.6a2.7 2.7 0 0 0 4 .3l1.6-1.6a2.7 2.7 0 0 0-3.8-3.8l-.9.9"/>'
      + '<path d="M9.6 6.4a2.7 2.7 0 0 0-4-.3L4 7.7a2.7 2.7 0 0 0 3.8 3.8l.9-.9"/>',
  },
  prijem: {
    popis: 'Příjem na účtu',
    svg: '<path d="M8 2.4v6.5"/><path d="M5.5 6.4 8 8.9l2.5-2.5"/>'
      + '<path d="M2.6 10.6v1.6a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2v-1.6"/>',
  },
  hotovo: {
    popis: 'Hotovo',
    svg: '<circle cx="8" cy="8" r="6"/><path d="m5.3 8.2 1.9 1.9 3.6-3.9"/>',
  },
  // (v4.77) Ikony záložek karty bytu - viz ZALOZKY_JEDNOTKY níž.
  byt: {
    popis: 'Byt',
    svg: '<path d="M2 13.5h12"/><path d="M3.4 13.5V6.2L8 2.8l4.6 3.4v7.3"/><path d="M6.6 13.5V9.4h2.8v4.1"/>',
  },
  jednotky: {
    popis: 'Nájemní jednotky',
    svg: '<rect x="2" y="2.5" width="5" height="11" rx="1"/><rect x="9" y="6" width="5" height="7.5" rx="1"/>',
  },
  finance: {
    popis: 'Finance',
    svg: '<rect x="2.2" y="4.4" width="11.6" height="8" rx="1.4"/><circle cx="8" cy="8.4" r="1.9"/>'
      + '<path d="M4.4 6.6h.01M11.6 10.2h.01"/>',
  },
  hotovost: {
    popis: 'Hotovost',
    svg: '<ellipse cx="8" cy="4.6" rx="5.2" ry="2.1"/>'
      + '<path d="M2.8 4.6v6.8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1V4.6"/>'
      + '<path d="M2.8 8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1"/>',
  },
  klice: {
    popis: 'Klíče a přístupy',
    svg: '<circle cx="5.4" cy="8" r="2.9"/><path d="M8.3 8H14"/><path d="M12.4 8v2.3M10.4 8v1.6"/>',
  },
  meridlo: {
    popis: 'Měřidla a revize',
    svg: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.5"/>',
  },
  roi: {
    popis: 'Výnos',
    svg: '<path d="M2 12.5 6 8l3 2.6L14 4"/><path d="M10.4 4H14v3.4"/>',
  },
  revize: {
    popis: 'Revize',
    svg: '<path d="M8 1.9 3 3.7v4.1c0 3 2.1 5 5 6.3 2.9-1.3 5-3.3 5-6.3V3.7z"/>'
      + '<path d="m5.9 7.9 1.6 1.6 2.9-3.1"/>',
  },
};

/**
 * Ikona stavu jako HTML, nebo '' u neznámého klíče.
 *
 * `role="img"` + `aria-label` schválně: dlaždice sice popisek má, ale ikona
 * se čte i sama (třeba v řádku upozornění) a odečítač nemá co dělat
 * s obrázkem bez jména.
 */
function ikonaStavuHtml(klic, tridaNavic) {
  const ikona = IKONY_STAVU[klic];
  if (!ikona) return '';
  return '<svg class="ikona-stav' + (tridaNavic ? ' ' + tridaNavic : '') + '" viewBox="0 0 16 16" '
    + 'role="img" aria-label="' + escapeAttr(ikona.popis) + '"><title>' + escapeHtml(ikona.popis)
    + '</title>' + ikona.svg + '</svg>';
}

/**
 * Jedna dlaždice: ikona s popiskem, velké číslo a (nepovinně) částky pod ním.
 *
 * `detail` je pole už naformátovaných částek - JEDNA MĚNA NA ŘÁDEK. Appka
 * měny nikdy nesčítá dohromady (nemá kurzovní lístek), takže tady nesmí
 * vzniknout jeden slepenec „1 000 Kč + 40 EUR": vypadal by jako součet,
 * kterým není.
 */
function statDlazdice(klic, hodnota, popisek, detail, stav) {
  const castky = (detail || [])
    .map((t) => '<span class="stat-detail">' + escapeHtml(t) + '</span>')
    .join('');
  return '<div class="stat-dlazdice' + (stav ? ' stat-' + stav : '') + '">'
    + '<span class="stat-hlavicka">' + ikonaStavuHtml(klic) + '<span class="stat-popisek">'
    + escapeHtml(popisek) + '</span></span>'
    + '<span class="stat-hodnota">' + escapeHtml(String(hodnota)) + '</span>'
    + castky + '</div>';
}

/**
 * Sečte částky dokladů podle měny. Dobropis snižuje (stejné znaménko jako
 * v Dashboardu i v Daňovém přehledu - opravný doklad ruší dřívější náklad,
 * nepřidává nový).
 */
function castkyDokladuPodleMeny(doklady) {
  const podleMeny = {};
  (doklady || []).forEach((d) => {
    const mena = String(d.Mena || 'CZK').trim().toUpperCase() || 'CZK';
    const znamenko = d.Typ_dokladu === 'Dobropis' ? -1 : 1;
    podleMeny[mena] = (podleMeny[mena] || 0) + parsujCastkuZListu(d.Castka) * znamenko;
  });
  return podleMeny;
}

// Mapa MĚNA -> ČÁSTKA jako pole hotových textů, jeden na měnu.
function castkyJakoRadky(podleMeny) {
  return serazeneMeny(podleMeny).map((mena) => formatCastkaSMenou(podleMeny[mena], mena));
}

// ---------------------------------------------------------------------------
// DRŽITEL KARTY (v4.75)
//
// Jan 2026-08-21: *„zároveň přiřaď k číslu karty také držitele, co máš
// v seznamech, aby tam bylo jméno"*.
//
// Seznam karet (list Platebni_karty) si appka natáhne při načtení dokladů -
// GET /api/platebni-karty smí kterýkoli přihlášený uživatel. Když se ho
// natáhnout nepodaří (starší tabulka bez toho listu), zůstane prázdný a
// appka u karty prostě nenapíše nic; doklady se kvůli tomu nesmí přestat
// zobrazovat.
let dokladyKartySeznam = [];

/**
 * Věta pod polem s číslem karty: kdo kartu nosí, případně že ji appka nezná.
 *
 * Vrací TEXT, ne HTML - volající ho dává do textContent. Držitel je jméno
 * člověka a nemá se cestou přes innerHTML kde ztratit ani rozbít.
 *
 * Držitel se do dokladu NEUKLÁDÁ. Patří ke kartě, ne k dokladu - kdyby se
 * opsal do řádku dokladu, po výměně držitele by u starých dokladů zůstalo
 * viset jméno, které už neplatí.
 */
function popisDrzitelKarty(cisloKarty) {
  const ctyri = posledniCtyriZTextu(cisloKarty);
  if (!ctyri) return '';
  const karta = dokladyKartySeznam.find((k) => posledniCtyriZTextu(k.Cislo_karty) === ctyri);
  // Karta, kterou appka v seznamu nemá, není chyba - založí se sama při
  // příštím vytěžení dokladu. Appka to tedy jen konstatuje.
  if (!karta) return 'Kartu •••• ' + ctyri + ' appka zatím nezná – doplní se v Nastavení → Platební karty.';
  const casti = [];
  if (String(karta.Drzitel || '').trim()) casti.push(String(karta.Drzitel).trim());
  if (String(karta.Popis || '').trim()) casti.push(String(karta.Popis).trim());
  if (String(karta.Firma || '').trim()) casti.push(String(karta.Firma).trim());
  // Karta v seznamu je, ale nikdo u ní držitele nevyplnil - i to je odpověď.
  if (!casti.length) return 'Karta •••• ' + ctyri + ' – držitel zatím není vyplněný (Nastavení → Platební karty).';
  return 'Karta •••• ' + ctyri + ' – ' + casti.join(' · ');
}

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

// Bublina u data: co appka o dokladu z hlediska dat ví. Prázdné položky se
// vynechávají - „Splatnost: —" nikomu nepomůže.
function popisDatDokladu(d) {
  const casti = ['Vystaveno: ' + (d.Datum_dokladu || 'nevytěženo')];
  if (d.DUZP && d.DUZP !== d.Datum_dokladu) casti.push('DUZP: ' + d.DUZP);
  if (d.Datum_splatnosti) casti.push('Splatnost: ' + d.Datum_splatnosti);
  return casti.join(' · ');
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
    // (v4.75) Ikona způsobu platby je součástí odznaku úhrady a jde do TÉŽE
    // buňky, schválně ne do vlastního sloupce: mřížka řádku má pevný počet
    // sloupců (viz .doklad-radek v public/style.css) a přidání osmého by
    // rozhodilo zarovnání hlavičky - přesně ta chyba, která se stala ve
    // v4.64. Ikonu vybírá bankSparovaniBadge společně s textem, aby si
    // odznak a obrázek nemohly odporovat.
    '<span class="doklad-banka-bunka">' + bankSparovaniBadge(d) + '</span>' +
    '<span class="dodavatel">' +
      escapeHtml(d.Stav === 'Zpracovává se' ? '(čeká na zpracování)' : (d.Dodavatel || '(bez dodavatele)')) +
    '</span>' +
    // (v4.46) Datum má vlastní třídu `doklad-datum` - stejný důvod jako
    // u bankovního řádku výš (v mobilním režimu se přesouvá, ne schovává).
    // (v4.66) Ve sloupci je DATUM VYSTAVENÍ z dokladu. DUZP a splatnost má
    // účetní v bublině, ať se kvůli nim nemusí rozklikávat každý řádek.
    '<span class="doklad-datum" title="' + escapeAttr(popisDatDokladu(d)) + '">' +
      escapeHtml(d.Datum_dokladu || '') + '</span>' +
    '<span class="castka">' + (d.Stav === 'Zpracovává se' ? '' : formatCastkaSMenou(d.Castka, d.Mena)) + '</span>' +
    // (v4.63) Buňka „Zaúčtováno". Je tu VŽDY (i prázdná), ať mřížka drží
    // pevný počet sloupců - stejný důvod jako u buňky s odznakem banky.
    '<span class="doklad-zauct-bunka"></span>';

  // Zaškrtávátko se vkládá až tady, ne do innerHTML - potřebuje vlastní
  // posluchač a hlavně stopPropagation, jinak by klepnutí na něj zároveň
  // rozbalilo detail dokladu.
  const zauctBunka = hlava.querySelector('.doklad-zauct-bunka');
  if (zauctBunka) zauctBunka.appendChild(vytvorZauctovanoPrepinac(d));

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

  // (v4.75) Od tady dolů se pole skládají do mřížky - viz vytvorMrizkuPoli()
  // výš pro důvod i pravidla.
  const mrizka = vytvorMrizkuPoli();
  wrap.appendChild(mrizka);

  const vstupDodavatel = document.createElement('input');
  vstupDodavatel.type = 'text';
  vstupDodavatel.value = d.Dodavatel || '';
  pridejPole(mrizka, 9, 'Dodavatel', vstupDodavatel);

  // Typ dokladu je krátký výběr - patří vedle dodavatele, ne na vlastní řádek.
  const vstupTypDokladu = document.createElement('select');
  ['Faktura', 'Dobropis', 'Zálohová faktura'].forEach((moznost) => {
    const option = document.createElement('option');
    option.value = moznost;
    option.textContent = moznost;
    if ((d.Typ_dokladu || 'Faktura') === moznost) option.selected = true;
    vstupTypDokladu.appendChild(option);
  });
  pridejPole(mrizka, 3, 'Typ dokladu', vstupTypDokladu);

  if (d.Poznamka) {
    const poznamkaDiv = document.createElement('div');
    poznamkaDiv.className = 'poznamka-dokladu';
    poznamkaDiv.textContent = 'ⓘ ' + d.Poznamka;
    mrizka.appendChild(poznamkaDiv);
  }

  pridejSkupinuPoli(mrizka, 'Částky');

  const vstupCastka = document.createElement('input');
  vstupCastka.type = 'number';
  vstupCastka.step = '0.01';
  // <input type="number"> vyžaduje tečku jako oddělovač desetin - kdyby
  // Sheets vrátilo českou čárku (viz parsujCastkuZListu výše), input by
  // hodnotu tiše nepřijal a zobrazil by se prázdný. Proto normalizace přes
  // parsujCastkuZListu, ne přímo d.Castka.
  vstupCastka.value = d.Castka !== undefined && d.Castka !== '' ? parsujCastkuZListu(d.Castka) : '';
  pridejPole(mrizka, 4, 'Částka', vstupCastka);

  const vstupMena = document.createElement('input');
  vstupMena.type = 'text';
  vstupMena.value = d.Mena || '';
  pridejPole(mrizka, 2, 'Měna', vstupMena);

  // DPH/Sazba_DPH (od v4.6, viz claude/nomis-faktury-backlog.md, položka 9) -
  // appka pole nabízí jako AI odhad ze zpracování dokladu + ruční kontrolu,
  // stejná konvence jako ostatní vytěžovaná pole. Používá se jen u firem
  // plátců DPH (dnes NOMIS Investment) pro měsíční DPH bilanci v Daňovém
  // přehledu - u ostatních firem se pole dají klidně nechat prázdná.
  const vstupDph = document.createElement('input');
  vstupDph.type = 'number';
  vstupDph.step = '0.01';
  vstupDph.value = d.DPH !== undefined && d.DPH !== '' ? parsujCastkuZListu(d.DPH) : '';
  pridejPole(mrizka, 4, 'DPH (částka)', vstupDph);

  const vstupSazbaDph = document.createElement('input');
  vstupSazbaDph.type = 'text';
  vstupSazbaDph.value = d.Sazba_DPH || '';
  pridejPole(mrizka, 2, 'Sazba (%)', vstupSazbaDph);

  // Rozšíření pro Money S3 export a QR Platbu (v4.32, viz claude/nomis-
  // faktury-backlog.md a lib/dokladySchema.js pro plné zdůvodnění) - appka
  // pole nabízí jako AI odhad + ruční kontrolu, stejná konvence jako DPH/
  // Sazba_DPH výš. Datum splatnosti + Konst./spec. symbol appka posílá do
  // Money S3 exportu (viz lib/moneyS3Export.js), DUZP appka navíc používá i
  // pro řazení DPH bilance v Daňovém přehledu.
  pridejSkupinuPoli(mrizka, 'Data');

  const vstupDatum = document.createElement('input');
  vstupDatum.type = 'date';
  vstupDatum.value = d.Datum_dokladu || '';
  pridejPole(mrizka, 4, 'Datum dokladu', vstupDatum);

  const vstupSplatnost = document.createElement('input');
  vstupSplatnost.type = 'date';
  vstupSplatnost.value = d.Datum_splatnosti || '';
  pridejPole(mrizka, 4, 'Datum splatnosti', vstupSplatnost);

  const vstupDuzp = document.createElement('input');
  vstupDuzp.type = 'date';
  vstupDuzp.value = d.DUZP || '';
  vstupDuzp.title = 'Vyplňte, jen pokud se liší od data dokladu (appka jinak pro export/DPH bilanci použije datum dokladu).';
  // Popisek se zkrátil na „DUZP" - celé znění zůstává v tooltipu. Ve třetině
  // řádku by se plný text stejně nevešel a zalomil by mřížku.
  const bunkaDuzp = pridejPole(mrizka, 4, 'DUZP', vstupDuzp);
  bunkaDuzp.querySelector('label').title = 'DUZP – datum uskutečnění zdanitelného plnění';

  pridejSkupinuPoli(mrizka, 'Platba');

  const vstupKonstSym = document.createElement('input');
  vstupKonstSym.type = 'text';
  vstupKonstSym.value = d.Konstantni_symbol || '';
  vstupKonstSym.placeholder = 'např. 0308';
  const vstupSpecSym = document.createElement('input');
  vstupSpecSym.type = 'text';
  vstupSpecSym.value = d.Specificky_symbol || '';
  vstupSpecSym.placeholder = 'specifický symbol';

  const vstupUcetDodavatele = document.createElement('input');
  vstupUcetDodavatele.type = 'text';
  vstupUcetDodavatele.value = d.Cislo_uctu_dodavatele || '';
  vstupUcetDodavatele.placeholder = 'např. 19-2000145399/0800 nebo IBAN';
  // Doklad zaplacený hotově nebo soukromou kartou nikdy nebude mít
  // protějšek v Bankovních výpisech (tam appka páruje jen odchozí platby
  // z firemního účtu) - tenhle příznak to u dokladu rovnou zviditelní,
  // ať účetní ví, že na bankovní pohyb u něj nemá čekat.
  //
  // (v4.75) Jan hned po nasazení dlaždic: *„když zakliknu hotově, znamená
  // to že to je mimo účet, tak se to doubluje"*. Má pravdu - hotovost se
  // na firemním výpisu neobjeví NIKDY, tam se není o čem rozhodovat.
  // U karty ale ano (firemní karta na výpisu je, soukromá ne) a u převodu
  // taky, takže zaškrtávátko nemůže zmizet úplně.
  //
  // Appka ho proto ukazuje jen tam, kde je to opravdu otázka, a u hotovosti
  // místo něj napíše, co z toho plyne. Hodnotu si přitom drží dál - kdo si
  // omylem přepne na Hotovost a zpátky na Kartu, o své zaškrtnutí nepřijde.
  const labelMimoUcet = document.createElement('label');
  labelMimoUcet.className = 'pole-zaskrtavatko';
  const vstupMimoUcet = document.createElement('input');
  vstupMimoUcet.type = 'checkbox';
  vstupMimoUcet.checked = String(d.Hrazeno_mimo_ucet || '').trim() === 'ANO';
  const textMimoUcet = document.createTextNode('');
  labelMimoUcet.appendChild(vstupMimoUcet);
  labelMimoUcet.appendChild(textMimoUcet);

  const poznamkaHotovost = document.createElement('div');
  poznamkaHotovost.className = 'popis poznamka-hotovost';
  poznamkaHotovost.textContent = 'Hotovost se s bankovním výpisem nepáruje – appka takový doklad '
    + 'bere rovnou jako uhrazený a platbu k němu nehledá.';

  // Jediné místo, které rozhoduje, co se uloží do Hrazeno_mimo_ucet.
  // U hotovosti je to dané, jinde se ptáme zaškrtávátka.
  function jeMimoUcet() {
    return vstupZpusobPlatby.value === 'Hotovost' || vstupMimoUcet.checked;
  }

  function prekresliMimoUcet() {
    const hotove = vstupZpusobPlatby.value === 'Hotovost';
    labelMimoUcet.classList.toggle('skryto', hotove);
    poznamkaHotovost.classList.toggle('skryto', !hotove);
    // Popisek mluví o tom, co je u zvoleného způsobu platby ta otázka.
    // „Mimo účet (hotově/soukromou kartou)" u vybrané karty mátlo: hotovost
    // v tu chvíli není ve hře.
    textMimoUcet.textContent = vstupZpusobPlatby.value === 'Karta'
      ? 'Soukromá karta – nehledat platbu v bankovním výpisu'
      : 'Mimo firemní účet – nehledat platbu v bankovním výpisu';
    vstupMimoUcet.title = 'Doklad se nezaplatil z firemního účtu, takže na něj v bankovním '
      + 'výpisu nečekejte.';
  }

  // Způsob platby a platební karta (od v4.52) - obojí vytěží AI z dokladu
  // (viz lib/gemini.js), tady jde o kontrolu a opravu. Pozor, tohle je něco
  // jiného než "Mimo účet" o řádek výš: způsob platby říká, ČÍM se platilo,
  // zatímco "Mimo účet" je rozhodnutí, že se na bankovní pohyb vůbec nemá
  // čekat. Firemní kartou zaplacený doklad na výpisu je, takže má "Karta" a
  // zároveň NEMÁ "Mimo účet".
  //
  // (v4.75) Místo rolovacího menu jsou to dlaždice s ikonou. Jan
  // 2026-08-21: *„udělej dvě pole s ikonami karty a mincí (hotovost)
  // graficky hezky"*. Způsob platby má čtyři možnosti, z toho dvě, které
  // Jan při kontrole opravuje nejčastěji - a v rolovacím menu se za ně
  // muselo dvakrát kliknout. Jako dlaždice jsou vidět naráz a stejné
  // ikony pak Jan potká i v seznamu.
  const vstupZpusobPlatby = vytvorPrepinacZpusobuPlatby(d.Zpusob_platby || '');
  const vstupKarta = document.createElement('input');
  vstupKarta.type = 'text';
  vstupKarta.inputMode = 'numeric';
  vstupKarta.maxLength = 4;
  vstupKarta.value = d.Platebni_karta || '';
  // Schválně jen čtyři číslice, i v UI: appka celé číslo karty neukládá
  // nikde (viz lib/platebniKartySchema.js) a tenhle placeholder ani maxLength
  // neměnit tak, aby to vypadalo, že se sem píše celé číslo.
  vstupKarta.placeholder = '4 číslice';
  vstupKarta.title = 'Poslední čtyři číslice karty - appka je používá při hledání odpovídajícího bankovního pohybu.';

  // (v4.75) Držitel karty. Jan 2026-08-21: *„zároveň přiřaď k číslu karty
  // také držitele, co máš v seznamech, aby tam bylo jméno"*.
  //
  // Čtyřčíslí samo o sobě nikomu nic neřekne - „1234" je karta, ale čí?
  // Seznam Platebni_karty držitele zná (doplňuje se v Nastavení → Platební
  // karty), takže ho appka rovnou dopíše pod pole. Jméno appka jen UKAZUJE,
  // do dokladu se pořád ukládá jen čtyřčíslí: držitel patří ke kartě, ne
  // k dokladu, a kdyby se opsal do dokladu, po výměně držitele by u starých
  // dokladů zůstalo staré jméno.
  const popisKarty = document.createElement('div');
  popisKarty.className = 'popis popis-karty';
  function prekresliDrzitele() {
    const text = popisDrzitelKarty(vstupKarta.value);
    popisKarty.textContent = text;
    // Jméno se do třetiny řádku nemusí vejít - useknutí řeší CSS (ellipsis)
    // a celé znění zůstává v tooltipu. Zalomení na dva řádky by posunulo
    // pole vedle a rozhodilo mřížku.
    popisKarty.title = text;
  }
  vstupKarta.addEventListener('input', prekresliDrzitele);
  prekresliDrzitele();

  // Přepínač potřebuje dvě třetiny řádku, ať se čtyři dlaždice vejdou na
  // jeden řádek. Zaškrtávátko „Mimo účet" dostalo vlastní řádek celé -
  // v třetině se jeho popisek ořezával uprostřed slova, a zrovna u něj
  // na tom záleží: říká, že se na bankovní pohyb nemá čekat.
  vstupZpusobPlatby.addEventListener('change', prekresliMimoUcet);
  prekresliMimoUcet();

  pridejPole(mrizka, 8, 'Způsob platby', vstupZpusobPlatby);
  pridejPole(mrizka, 4, 'Karta (poslední 4 číslice)', vstupKarta, popisKarty);
  pridejPole(mrizka, 0, '', labelMimoUcet, poznamkaHotovost);

  pridejPole(mrizka, 6, 'Číslo účtu dodavatele (pro QR Platbu)', vstupUcetDodavatele);
  pridejPole(mrizka, 3, 'Konstantní symbol', vstupKonstSym);
  pridejPole(mrizka, 3, 'Specifický symbol', vstupSpecSym);

  pridejSkupinuPoli(mrizka, 'Zaúčtování');

  const vstupFirma = document.createElement('select');
  vstupFirma.innerHTML = moznostiFirmy(d.Firma_potvrzena || d.Firma_AI_odhad || '');
  pridejPole(mrizka, 4, 'Firma', vstupFirma);

  const vstupKategorie = document.createElement('select');
  vstupKategorie.innerHTML = moznostiKategorie(d.Kategorie || '');
  pridejPole(mrizka, 4, 'Kategorie', vstupKategorie);

  // Účet MD (od v4.52) - hned pod Kategorií, protože se z ní odvozuje.
  // Janova volba byla *"Podle kategorie, jde přepsat"*, takže tohle NENÍ jen
  // zobrazení navrženého účtu, ale plnohodnotné pole: co je tady vybrané, to
  // se uloží a to půjde účetní do exportu.
  const vstupUcetMD = document.createElement('select');
  vstupUcetMD.innerHTML = moznostiUctuMD(
    d.Firma_potvrzena || d.Firma_AI_odhad || '', d.Ucet_MD || '',
  );
  pridejPole(mrizka, 4, 'Účet MD (nákladový účet)', vstupUcetMD);

  // Upozornění k účtu má vlastní řádek přes celou šířku - text je dlouhý
  // („…nastavte v Nastavení → Předkontace…") a ve třetině řádku by se
  // zalomil na pět řádků a rozhodil mřížku.
  const upozorneniUcet = document.createElement('div');
  upozorneniUcet.className = 'popis upozorneni-ucet';
  mrizka.appendChild(upozorneniUcet);

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

  const vstupStredisko = document.createElement('select');
  vstupStredisko.innerHTML = moznostiStrediska(d.Stredisko || '');
  pridejPole(mrizka, 4, 'Středisko', vstupStredisko);
  // Pozn.: samostatné pole SPZ bylo od v3.8 zrušené - konkrétní auto je
  // teď součástí Střediska (např. "Auto - Tesla"), takže by šlo o
  // duplicitní údaj. Sloupec SPZ_auta v Sheets zůstává beze změny kvůli
  // starším záznamům, appka do něj jen nově nezapisuje z týhle záložky.

  // Mnozstvi_litru/Druh_paliva (od backlogu, položka 16) - appka je vytěží
  // AI odhadem jen u Kategorie "Palivo" (viz lib/gemini.js), tady jde jen o
  // ruční kontrolu/opravu, stejná konvence jako u DPH výše. Slouží k Knize
  // jízd (záložka Kniha jízd) - appka podle Střediska (auta) a měsíce
  // spočítá průměrnou spotřebu.
  const vstupLitry = document.createElement('input');
  vstupLitry.type = 'number';
  vstupLitry.step = '0.01';
  vstupLitry.value = d.Mnozstvi_litru !== undefined && d.Mnozstvi_litru !== '' ? parsujCastkuZListu(d.Mnozstvi_litru) : '';
  vstupLitry.placeholder = 'litry';
  pridejPole(mrizka, 2, 'Palivo (litry)', vstupLitry);

  const vstupDruhPaliva = document.createElement('input');
  vstupDruhPaliva.type = 'text';
  vstupDruhPaliva.value = d.Druh_paliva || '';
  vstupDruhPaliva.placeholder = 'Nafta/Benzín…';
  pridejPole(mrizka, 2, 'Druh paliva', vstupDruhPaliva);


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
      // (v4.75) Ne přímo ze zaškrtávátka - u hotovosti je odpověď daná,
      // viz jeMimoUcet() a Janovo *„když zakliknu hotově, znamená to že to
      // je mimo účet, tak se to doubluje"*.
      Hrazeno_mimo_ucet: jeMimoUcet() ? 'ANO' : '',
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
// Pojistka proti dvojímu navěšení obsluhy celé sekce Servis a údržba -
// viz zobrazApp() výš.
let servisInicializovan = false;

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

// ---------------------------------------------------------------------------
// SERVISNÍ NÁSTROJE (v4.75)
//
// Jan 2026-08-21: *„…co tam ještě může být?"* - do Nastavení přibyly tři
// věci, které se během posledních dvou dnů ukázaly jako potřebné, ale
// neviditelné:
//
//   Kontrola tabulky   - které listy/sloupce v Google tabulce chybí. Chybějící
//                        sloupec appka při zápisu tiše přeskočí (viz
//                        lib/sheetsHelpers.js), takže se to jinak pozná až
//                        tím, že hodnota po načtení stránky zmizí - přesně
//                        to potkalo zaškrtávátko „Zaúčtováno".
//   Doplnit sloupce    - totéž, co dělá /api/setup, ale jedním klepnutím.
//   Osiřelé soubory    - co leží v 00_Inbox bez záznamu v appce (soubor se
//                        nahrál, ale zápis řádku spadl na limit Googlu).
//
// Backend: netlify/functions/servis.js. Tam platí i pravidlo, že kontrola
// nikdy nic nezapisuje a že appka žádný soubor nemaže - tady se tedy nabízí
// jen výpis a odkaz na Disk, ne tlačítko „smazat".
function inicializujServis() {
  const kontrola = document.getElementById('tlacitko-servis-kontrola');
  const doplnit = document.getElementById('tlacitko-servis-doplnit');
  const osirele = document.getElementById('tlacitko-servis-osirele');
  if (kontrola) kontrola.addEventListener('click', () => spustKontroluTabulky(kontrola));
  if (doplnit) doplnit.addEventListener('click', () => spustDoplneniSloupcu(doplnit));
  if (osirele) osirele.addEventListener('click', () => spustHledaniOsirelych(osirele));
  const firmyNahled = document.getElementById('tlacitko-firmy-nahled');
  if (firmyNahled) firmyNahled.addEventListener('click', () => spustNahledUdajuFirem(firmyNahled));
  const wifiNahled = document.getElementById('tlacitko-wifi-nahled');
  if (wifiNahled) wifiNahled.addEventListener('click', () => spustNahledWifi(wifiNahled));
  const najemciNahled = document.getElementById('tlacitko-najemci-nahled');
  if (najemciNahled) najemciNahled.addEventListener('click', () => spustNahledNajemcu(najemciNahled));
}

/*
 * DOPLNĚNÍ NÁJEMCŮ ZE SMLUV (v4.83)
 *
 * Jan 2026-08-21: *„vytáhni ze smluv nájemníky a pronajímatele a doplň je
 * do app"*. Pronajímatelé se doplnili už ve v4.80; tohle je druhá strana.
 *
 * Řádky přepsané ze SKENU se označují nahlas. OCR se u jmen plete - u téhož
 * protokolu přečetl „Marlla Kreslak" i „Marila Kreslak" - a jméno nájemce
 * jde do podepisované smlouvy.
 */
function vypisNavrhNajemcu(data) {
  const pridat = data.pridat || [];
  const uzJsou = data.uzJsou || [];

  let html = '';
  if (data.zapsano) {
    html += '<p class="zprava uspech">Přidáno ' + pridat.length + ' nájemců.</p>';
  } else if (!pridat.length) {
    return '<p class="zprava uspech">Všichni nájemci ze smluv už v seznamu jsou'
      + (uzJsou.length ? ': ' + escapeHtml(uzJsou.join(', ')) : '') + '.</p>';
  }

  html += '<div class="servis-nalezy">';
  pridat.forEach((n) => {
    html += '<div class="servis-nalez"><strong>' + escapeHtml(n.nazev) + '</strong>'
      + ' <span class="popis">' + escapeHtml(n.druh === 'Osoba' ? 'fyzická osoba' : 'firma') + '</span>'
      + '<div class="servis-sloupce">'
      + escapeHtml([n.ico ? 'IČO ' + n.ico : '', n.sidlo].filter(Boolean).join(' · '))
      + '</div>'
      + '<div class="servis-sloupce">Z dokumentu: ' + escapeHtml(n.zdroj) + '</div>'
      + (n.ocr
        ? '<div class="servis-sloupce">⚠ Přepsáno ze skenu – překontrolujte jméno, adresu '
          + 'i datum narození.</div>'
        : '')
      + '</div>';
  });
  html += '</div>';

  if (uzJsou.length) {
    html += '<p class="popis">Už v seznamu byli a appka na ně nesáhla: '
      + escapeHtml(uzJsou.join(', ')) + '.</p>';
  }

  if (!data.zapsano && pridat.length) {
    html += '<button type="button" id="tlacitko-najemci-zapsat" style="margin-top:10px">Přidat je do seznamu</button>';
  }
  return html;
}

function spustNahledNajemcu(tlacitko) {
  return servisAkce(tlacitko, 'Počítám…', 'najemci-ze-smluv-vysledek', async () => {
    const data = await zavolejApi('/servis?akce=nahled-najemcu', { method: 'GET' });
    const html = vypisNavrhNajemcu(data);
    setTimeout(() => {
      const zapsat = document.getElementById('tlacitko-najemci-zapsat');
      if (zapsat) zapsat.addEventListener('click', () => spustZapisNajemcu(zapsat));
    }, 0);
    return html;
  });
}

function spustZapisNajemcu(tlacitko) {
  return servisAkce(tlacitko, 'Zapisuji…', 'najemci-ze-smluv-vysledek', async () => {
    const data = await zavolejApi('/servis', {
      method: 'POST', body: JSON.stringify({ akce: 'doplnit-najemce' }),
    });
    // Seznamy v paměti se rozešly s tabulkou - načíst znovu.
    if (typeof zapomenPronajimatele === 'function') zapomenPronajimatele();
    if (typeof nactiNajemceNastaveni === 'function') nactiNajemceNastaveni();
    return vypisNavrhNajemcu(data);
  });
}

/*
 * DOPLNĚNÍ WIFI K NÁJEMNÍM JEDNOTKÁM (v4.82)
 *
 * Jan 2026-08-21 poslal seznam sítí a hesel; tabulka je v
 * lib/wifiJednotek.js. Dvoukrokové ze stejného důvodu jako u firem:
 * nejdřív náhled (server jen počítá), teprve pak zápis.
 *
 * Nenalezené řádky se vypisují STEJNĚ VIDITELNĚ jako ty doplněné. Kdyby
 * se jen tiše přeskočily, Jan by se dozvěděl, že jednotka „Holečkova 7b"
 * v tabulce chybí, až u předávání bytu.
 */
function vypisNavrhWifi(data) {
  const doplni = data.doplni || [];
  const rozdily = data.rozdily || [];
  const nenalezene = data.nenalezene || [];

  let html = '';
  if (data.zapsano) {
    html += '<p class="zprava uspech">Doplněno u ' + doplni.length + ' jednotek.</p>';
  } else if (!doplni.length && !rozdily.length && !nenalezene.length) {
    return '<p class="zprava uspech">Všechny jednotky už WiFi vyplněnou mají.</p>';
  }

  if (doplni.length) {
    html += '<div class="servis-nalezy">';
    doplni.forEach((z) => {
      html += '<div class="servis-nalez"><strong>' + escapeHtml(z.popis) + '</strong>'
        + ' <span class="popis">→ ' + escapeHtml(z.cil) + '</span>'
        + '<div class="servis-sloupce">'
        + Object.keys(z.zmeny).map((k) => escapeHtml(popisPoleWifi(k)) + ': '
          + escapeHtml(z.zmeny[k])).join(' · ')
        + '</div></div>';
    });
    html += '</div>';
  }

  if (rozdily.length) {
    html += '<p class="zprava varovani">Tady se hodnota v tabulce liší. Appka ji '
      + '<strong>nepřepíše</strong> – opravte ji ručně na kartě bytu, pokud je to potřeba.</p>'
      + '<div class="servis-nalezy">';
    rozdily.forEach((z) => {
      html += '<div class="servis-nalez"><strong>' + escapeHtml(z.popis) + '</strong>'
        + '<div class="servis-sloupce">' + escapeHtml(popisPoleWifi(z.pole))
        + ': v tabulce „' + escapeHtml(z.vTabulce) + '“, nově „' + escapeHtml(z.nove) + '“</div></div>';
    });
    html += '</div>';
  }

  if (nenalezene.length) {
    html += '<p class="zprava varovani">Tyhle jednotky appka ve vaší tabulce nenašla: '
      + escapeHtml(nenalezene.join(', ')) + '. Založte je na kartě bytu (Nájemní jednotky) '
      + 'nebo mi napište, jak se u vás jmenují.</p>';
  }

  if (!data.zapsano && doplni.length) {
    html += '<button type="button" id="tlacitko-wifi-zapsat" style="margin-top:10px">Doplnit to do tabulky</button>';
  }
  return html;
}

const POPISKY_POLI_WIFI = { Wifi_sit: 'síť', Wifi_heslo: 'heslo' };
function popisPoleWifi(klic) { return POPISKY_POLI_WIFI[klic] || klic; }

function spustNahledWifi(tlacitko) {
  return servisAkce(tlacitko, 'Počítám…', 'wifi-vysledek', async () => {
    const data = await zavolejApi('/servis?akce=nahled-wifi', { method: 'GET' });
    const html = vypisNavrhWifi(data);
    setTimeout(() => {
      const zapsat = document.getElementById('tlacitko-wifi-zapsat');
      if (zapsat) zapsat.addEventListener('click', () => spustZapisWifi(zapsat));
    }, 0);
    return html;
  });
}

function spustZapisWifi(tlacitko) {
  return servisAkce(tlacitko, 'Zapisuji…', 'wifi-vysledek', async () => {
    const data = await zavolejApi('/servis', {
      method: 'POST', body: JSON.stringify({ akce: 'doplnit-wifi' }),
    });
    return vypisNavrhWifi(data);
  });
}

/*
 * DOPLNĚNÍ ÚDAJŮ FIREM Z REJSTŘÍKU (v4.80)
 *
 * Jan 2026-08-21: *„vyplň údaje všech mých firem do databáze, najdi si to
 * v OR, přesný název, IČ, adresa a bankovní spojení"*.
 *
 * Dvoukrokové schválně: nejdřív NÁHLED (server jen počítá), teprve po něm
 * se objeví tlačítko, které zapisuje. Zapisovat do listu Firmy na první
 * klepnutí by znamenalo měnit účetní identitu bez toho, že to člověk
 * viděl - a IČO na faktuře je věc, kterou nikdo nekontroluje podruhé.
 *
 * Rozdíly proti rejstříku se VYPÍŠOU, ale nepřepisují (viz
 * lib/rejstrikFirem.js). Tlačítko „přepsat" tu není a nemá být.
 */
// Sloupce se v hlášce ukazují lidsky. „Bankovni_ucet" je název v tabulce,
// ne v češtině - a tohle si čte člověk, ne vývojář.
const POPISKY_POLI_FIREM = { ICO: 'IČO', DIC: 'DIČ', Bankovni_ucet: 'Bankovní účet' };
function popisPoleFirmy(klic) { return POPISKY_POLI_FIREM[klic] || klic; }

function vypisNavrhUdajuFirem(data) {
  const zmeny = data.zmeny || [];
  const kDoplneni = zmeny.filter((z) => Object.keys(z.doplni || {}).length);
  const sRozdilem = zmeny.filter((z) => Object.keys(z.rozdily || {}).length);

  let html = '';
  if (data.zapsano) {
    html += '<p class="zprava uspech">Doplněno u ' + (data.pocetDoplnenych || 0)
      + ' firem. Rozdíly (pokud nějaké jsou) zůstaly beze změny.</p>';
  } else if (!kDoplneni.length && !sRozdilem.length) {
    return '<p class="zprava uspech">Firmy mají vyplněno všechno, co rejstřík zná.</p>';
  }

  if (kDoplneni.length) {
    html += '<div class="servis-nalezy">';
    kDoplneni.forEach((z) => {
      html += '<div class="servis-nalez"><strong>' + escapeHtml(z.nazev) + '</strong>'
        + ' <span class="popis">(' + escapeHtml(z.obchodniFirma || '') + ')</span>'
        + '<div class="servis-sloupce">'
        + Object.keys(z.doplni).map((k) => escapeHtml(popisPoleFirmy(k)) + ' → ' + escapeHtml(z.doplni[k])).join(' · ')
        + '</div></div>';
    });
    html += '</div>';
  }

  if (sRozdilem.length) {
    html += '<p class="zprava varovani">U těchhle firem se hodnota v tabulce liší od rejstříku. '
      + 'Appka je <strong>nepřepíše</strong> – opravte je ručně v sekci Firmy, pokud je to potřeba.</p>'
      + '<div class="servis-nalezy">';
    sRozdilem.forEach((z) => {
      html += '<div class="servis-nalez"><strong>' + escapeHtml(z.nazev) + '</strong>'
        + Object.keys(z.rozdily).map((k) => '<div class="servis-sloupce">' + escapeHtml(popisPoleFirmy(k))
          + ': v tabulce „' + escapeHtml(z.rozdily[k].vTabulce) + '“, v rejstříku „'
          + escapeHtml(z.rozdily[k].vRejstriku) + '“</div>').join('')
        + '</div>';
    });
    html += '</div>';
  }

  if ((data.nezname || []).length) {
    html += '<p class="popis">Ke těmhle firmám appka rejstříkový záznam nemá: '
      + escapeHtml(data.nezname.join(', ')) + '.</p>';
  }

  if (!data.zapsano && kDoplneni.length) {
    html += '<button type="button" id="tlacitko-firmy-zapsat" style="margin-top:10px">Doplnit to do tabulky</button>';
  }
  return html;
}

function spustNahledUdajuFirem(tlacitko) {
  return servisAkce(tlacitko, 'Počítám…', 'firmy-rejstrik-vysledek', async () => {
    const data = await zavolejApi('/servis?akce=nahled-udaju-firem', { method: 'GET' });
    const html = vypisNavrhUdajuFirem(data);
    // Tlačítko vzniká až teď, takže se posluchač věší po vykreslení.
    setTimeout(() => {
      const zapsat = document.getElementById('tlacitko-firmy-zapsat');
      if (zapsat) zapsat.addEventListener('click', () => spustZapisUdajuFirem(zapsat));
    }, 0);
    return html;
  });
}

function spustZapisUdajuFirem(tlacitko) {
  return servisAkce(tlacitko, 'Zapisuji…', 'firmy-rejstrik-vysledek', async () => {
    const data = await zavolejApi('/servis', {
      method: 'POST', body: JSON.stringify({ akce: 'doplnit-udaje-firem' }),
    });
    // Seznam firem se v paměti rozešel s tabulkou - načíst znovu.
    if (typeof nactiFirmy === 'function') nactiFirmy();
    return vypisNavrhUdajuFirem(data);
  });
}

// Servisní akce běží dlouho (projít 26 listů = 26 čtení) - tlačítko se proto
// po dobu běhu vypne, ať se stejná akce nespustí třikrát za sebou a nesežere
// minutový limit Googlu.
async function servisAkce(tlacitko, textBehem, cilId, prace) {
  const cil = document.getElementById(cilId);
  const puvodni = tlacitko.textContent;
  tlacitko.disabled = true;
  tlacitko.textContent = textBehem;
  if (cil) cil.innerHTML = '<p class="popis">Pracuji…</p>';
  try {
    const html = await prace();
    if (cil) cil.innerHTML = html;
  } catch (e) {
    if (cil) cil.innerHTML = '<p class="zprava chyba">' + escapeHtml(e.message) + '</p>';
  } finally {
    tlacitko.disabled = false;
    tlacitko.textContent = puvodni;
  }
}

function spustKontroluTabulky(tlacitko) {
  return servisAkce(tlacitko, 'Kontroluji…', 'servis-kontrola-vysledek', async () => {
    const data = await zavolejApi('/servis?akce=kontrola-tabulky', { method: 'GET' });
    const nalezy = data.nalezy || [];
    if (!nalezy.length) {
      return '<p class="zprava uspech">Tabulka je v pořádku – všech ' + (data.listuCelkem || 0) +
        ' listů má všechny sloupce, které appka používá.</p>';
    }
    let html = '<p class="zprava varovani">Appka našla ' + nalezy.length +
      ' listů, kde něco chybí. Dokud se to nedoplní, hodnoty do chybějících sloupců se ' +
      '<strong>neuloží</strong>.</p><div class="servis-nalezy">';
    nalezy.forEach((n) => {
      html += '<div class="servis-nalez"><strong>' + escapeHtml(n.list) + '</strong> – ' +
        escapeHtml(n.zprava);
      if ((n.chybi || []).length) {
        html += '<div class="servis-sloupce">' + escapeHtml(n.chybi.join(', ')) + '</div>';
      }
      html += '</div>';
    });
    html += '</div><p class="popis">Sloupce doplní tlačítko níž; chybějící celý list založí ' +
      '<code>/api/setup</code>.</p>';
    return html;
  });
}

function spustDoplneniSloupcu(tlacitko) {
  return servisAkce(tlacitko, 'Doplňuji…', 'servis-doplnit-vysledek', async () => {
    const data = await zavolejApi('/servis', {
      method: 'POST',
      body: JSON.stringify({ akce: 'doplnit-sloupce' }),
    });
    const zmeneno = (data.vysledky || []).filter((v) => v.akce === 'doplneno');
    const preskoceno = (data.vysledky || []).filter((v) => v.akce === 'preskoceno');
    if (!zmeneno.length && !preskoceno.length) {
      return '<p class="zprava uspech">Nebylo co doplňovat – tabulka už všechny sloupce má.</p>';
    }
    let html = '';
    if (zmeneno.length) {
      html += '<p class="zprava uspech">Doplněno ' + (data.celkemSloupcu || 0) + ' sloupců v ' +
        zmeneno.length + ' listech. Nic se nepřepsalo ani nesmazalo – sloupce přibyly na konec ' +
        'hlavičkového řádku.</p><div class="servis-nalezy">';
      zmeneno.forEach((v) => {
        html += '<div class="servis-nalez"><strong>' + escapeHtml(v.list) + '</strong>' +
          '<div class="servis-sloupce">' + escapeHtml((v.chybi || []).join(', ')) + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<p class="zprava uspech">Sloupce byly v pořádku, nic se nedoplňovalo.</p>';
    }
    if (preskoceno.length) {
      html += '<p class="zprava varovani">Tyhle listy v tabulce vůbec nejsou a tohle tlačítko je ' +
        'nezakládá – spusťte <code>/api/setup</code>: ' +
        escapeHtml(preskoceno.map((v) => v.list).join(', ')) + '</p>';
    }
    return html;
  });
}

function spustHledaniOsirelych(tlacitko) {
  return servisAkce(tlacitko, 'Hledám…', 'servis-osirele-vysledek', async () => {
    const data = await zavolejApi('/servis?akce=osirele-soubory', { method: 'GET' });
    if (data.chyba) return '<p class="zprava varovani">' + escapeHtml(data.chyba) + '</p>';
    const osirele = data.osirele || [];
    if (!osirele.length) {
      return '<p class="zprava uspech">Žádné osiřelé soubory – všech ' + (data.projito || 0) +
        ' souborů v Inboxu má v appce svůj záznam.</p>';
    }
    let html = '<p class="zprava varovani">Appka našla ' + osirele.length + ' souborů (z ' +
      (data.projito || 0) + ' prohlédnutých), ke kterým nemá žádný doklad, fakturu ani smlouvu. ' +
      'Nejspíš zbyly po nahrání, kterému spadl zápis do tabulky. <strong>Appka je nemaže</strong> – ' +
      'smazat je můžete na Disku sami.</p><div class="servis-nalezy">';
    osirele.forEach((s) => {
      html += '<div class="servis-nalez"><a href="https://drive.google.com/file/d/' +
        encodeURIComponent(s.id) + '/view" target="_blank" rel="noopener">' +
        escapeHtml(s.nazev) + '</a>' +
        '<div class="servis-sloupce">' + escapeHtml((s.vytvoreno || '').slice(0, 10)) + '</div></div>';
    });
    html += '</div>';
    if (data.zbyvaProjit) {
      html += '<p class="popis">Appka prošla prvních ' + (data.projito || 0) + ' souborů, ' +
        'dalších ' + data.zbyvaProjit + ' se do jednoho běhu nevešlo – po úklidu spusťte kontrolu ' +
        'znovu.</p>';
    }
    return html;
  });
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

/*
 * Blok „Zaúčtování" v kartě firmy (v4.76).
 *
 * Jan 2026-08-21: *„do Dashboardu přidej také informace, jaký objem je
 * zaúčtován a kolik zbývá"*.
 *
 * TŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) PRUH UKAZUJE PODÍL POČTU, NE ČÁSTEK. Podíl částek by musel sečíst měny
 *    dohromady - to appka nedělá nikde a nezačne s tím v ozdobném pruhu.
 *    Objem je pod pruhem, po měnách, v číslech.
 * 2) PRUH NENÍ JEDINÝ NOSITEL INFORMACE. Vedle něj stojí procento i obě
 *    čísla; samotná barevná výplň by barvoslepému uživateli (a na tisku)
 *    neřekla nic.
 * 3) BEZ SCHVÁLENÝCH DOKLADŮ SE NIC NEPŘEDSTÍRÁ. Nula z nuly není „100 %
 *    hotovo" - appka napíše, že za období není co účtovat.
 */
function vykresliZauctovaniKarty(zauctovani) {
  const z = zauctovani || {};
  const hotovo = z.zauctovanoPocet || 0;
  const zbyva = z.zbyvaPocet || 0;
  const celkem = hotovo + zbyva;

  let html = '<div class="dash-stredisko-nadpis">Zaúčtování (12 měsíců)</div>';
  if (!celkem) {
    return html + '<div class="popis" style="margin:0">Za tohle období nejsou žádné schválené '
      + 'doklady k zaúčtování.</div>';
  }

  const procenta = Math.round((hotovo / celkem) * 100);
  html += '<div class="mericka" role="img" aria-label="Zaúčtováno ' + procenta + ' % z '
    + celkem + ' schválených dokladů">'
    + '<div class="mericka-vypln" style="width:' + procenta + '%"></div></div>'
    + '<div class="mericka-popis">' + procenta + ' % dokladů zaúčtováno ('
    + hotovo + ' z ' + celkem + ')</div>'
    + '<div class="stat-rada stat-rada-uzka">'
    + statDlazdice('zauctovano', hotovo, 'Zaúčtováno',
      castkyJakoRadky(z.zauctovanoCastky), hotovo ? 'hotovo' : '')
    + statDlazdice('zbyva', zbyva, 'Zbývá zaúčtovat',
      castkyJakoRadky(z.zbyvaCastky), zbyva ? 'ceka' : '')
    + '</div>';
  return html;
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

  // (v4.76) ZAÚČTOVÁNÍ. Jan 2026-08-21: *„do Dashboardu přidej také
  // informace, jaký objem je zaúčtován a kolik zbývá"*. Do teď šlo
  // z Dashboardu vyčíst, kolik firma utratila, ale ne kolik z toho má
  // účetní hotové - a přitom to je otázka, se kterou se na začátku měsíce
  // volá: „kolik toho ještě zbývá?"
  html += vykresliZauctovaniKarty(f.zauctovani);

  const upozorneni = [];
  if (f.dokladyKeSchvaleni > 0) {
    upozorneni.push(
      '<div class="polozka-upozorneni">' + ikonaStavuHtml('keSchvaleni') + f.dokladyKeSchvaleni
      + '× doklad čeká na schválení</div>'
    );
  }
  if (f.pohybyNesparovane > 0) {
    upozorneni.push(
      '<div class="polozka-upozorneni">' + ikonaStavuHtml('banka') + f.pohybyNesparovane
      + '× nespárovaný bankovní pohyb</div>'
    );
  }
  // (v4.61) Příjmy, které dorazily na účet, ale nikdo je nezařadil. Do
  // příjmů výš se nepočítají (jsou nerozhodnuté) a do v4.60 o nich appka
  // vůbec neřekla - "Nespárováno" je od v4.51 stav jen pro ODCHOZÍ platby.
  // Firma tak mohla mít všechny nájmy na účtu a Dashboard tvrdil 0 Kč.
  // Částka je tu schválně: bez ní není poznat, jestli jde o drobnou platbu,
  // nebo o celý měsíční nájem.
  if (f.prijmyKeKontrole > 0) {
    const castky = f.prijmyKeKontroleCastky || {};
    const rozpis = Object.keys(castky)
      .map((m) => formatCastkaSMenou(castky[m], m))
      .join(' + ');
    upozorneni.push(
      '<div class="polozka-upozorneni">' + ikonaStavuHtml('prijem') + f.prijmyKeKontrole + '× příjem čeká na zařazení'
      + (rozpis ? ' (' + escapeHtml(rozpis) + ')' : '')
      + ' – do příjmů se započítá až po zařazení v Bankovních výpisech</div>'
    );
  }
  if (upozorneni.length === 0) {
    upozorneni.push('<div class="polozka-upozorneni ok">' + ikonaStavuHtml('hotovo')
      + 'Nic nečeká na vyřízení</div>');
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

  // (v4.75) Stejná mřížka jako u přijatých dokladů - Jan 2026-08-21 na
  // otázku, kde ji chce, odpověděl *„udělej to i u vydaných faktur"*.
  // Skupiny i šířky proto sedí na detail dokladu: kdo přeskakuje mezi
  // přijatými a vydanými, hledá částku pořád na stejném místě.
  const mrizka = vytvorMrizkuPoli();
  wrap.appendChild(mrizka);

  const vstupFirma = document.createElement('select');
  vstupFirma.innerHTML = moznostiFirmySeznam(vfFirmySeznam, f.Firma || '');
  pridejPole(mrizka, 5, 'Firma (vystavuje)', vstupFirma);

  const vstupCislo = document.createElement('input');
  vstupCislo.type = 'text';
  vstupCislo.value = f.Cislo_faktury || '';
  pridejPole(mrizka, 4, 'Číslo faktury', vstupCislo);

  const vstupTypDokladu = document.createElement('select');
  ['Faktura', 'Dobropis', 'Zálohová faktura'].forEach((moznost) => {
    const option = document.createElement('option');
    option.value = moznost;
    option.textContent = moznost;
    if ((f.Typ_dokladu || 'Faktura') === moznost) option.selected = true;
    vstupTypDokladu.appendChild(option);
  });
  pridejPole(mrizka, 3, 'Typ dokladu', vstupTypDokladu);

  const vstupZakaznik = document.createElement('input');
  vstupZakaznik.type = 'text';
  vstupZakaznik.value = f.Zakaznik || '';
  pridejPole(mrizka, 5, 'Zákazník', vstupZakaznik);

  const vstupIco = document.createElement('input');
  vstupIco.type = 'text';
  vstupIco.value = f.ICO_zakaznika || '';
  pridejPole(mrizka, 3, 'IČO zákazníka', vstupIco);

  const vstupJednotka = document.createElement('input');
  vstupJednotka.type = 'text';
  vstupJednotka.setAttribute('list', 'seznam-jednotek');
  vstupJednotka.value = f.Jednotka || '';
  pridejPole(mrizka, 4, 'Jednotka', vstupJednotka);

  pridejSkupinuPoli(mrizka, 'Částky');

  const vstupCastka = document.createElement('input');
  vstupCastka.type = 'number';
  vstupCastka.step = '0.01';
  vstupCastka.value = f.Castka !== undefined && f.Castka !== '' ? parsujCastkuZListu(f.Castka) : '';
  pridejPole(mrizka, 4, 'Částka', vstupCastka);

  const vstupMena = document.createElement('input');
  vstupMena.type = 'text';
  vstupMena.value = f.Mena || 'CZK';
  pridejPole(mrizka, 2, 'Měna', vstupMena);

  // DPH/Sazba_DPH (od v4.6, viz claude/nomis-faktury-backlog.md, položka 9) -
  // appka pole nabízí jako AI odhad ze zpracování faktury + ruční kontrolu,
  // stejná konvence jako u Dokladů. Používá se jen u firem plátců DPH (dnes
  // NOMIS Investment) jako VÝSTUP DPH pro měsíční bilanci v Daňovém přehledu.
  const vstupDph = document.createElement('input');
  vstupDph.type = 'number';
  vstupDph.step = '0.01';
  vstupDph.value = f.DPH !== undefined && f.DPH !== '' ? parsujCastkuZListu(f.DPH) : '';
  pridejPole(mrizka, 4, 'DPH (částka)', vstupDph);

  const vstupSazbaDph = document.createElement('input');
  vstupSazbaDph.type = 'text';
  vstupSazbaDph.value = f.Sazba_DPH || '';
  pridejPole(mrizka, 2, 'Sazba (%)', vstupSazbaDph);

  pridejSkupinuPoli(mrizka, 'Data');

  const vstupVystaveni = document.createElement('input');
  vstupVystaveni.type = 'date';
  vstupVystaveni.value = f.Datum_vystaveni || '';
  pridejPole(mrizka, 4, 'Datum vystavení', vstupVystaveni);

  const vstupSplatnost = document.createElement('input');
  vstupSplatnost.type = 'date';
  vstupSplatnost.value = f.Datum_splatnosti || '';
  pridejPole(mrizka, 4, 'Datum splatnosti', vstupSplatnost);

  // Rozšíření pro Money S3 export (v4.32, viz claude/nomis-faktury-
  // backlog.md a lib/vydaneFakturySchema.js pro plné zdůvodnění) - appka
  // pole nabízí jako AI odhad + ruční kontrolu, stejná konvence jako DPH/
  // Sazba_DPH výš. DUZP appka navíc používá pro řazení DPH bilance v
  // Daňovém přehledu. Popisek je zkrácený na „DUZP", plné znění zůstává
  // v tooltipu - stejně jako u přijatých dokladů.
  const vstupDuzp = document.createElement('input');
  vstupDuzp.type = 'date';
  vstupDuzp.value = f.DUZP || '';
  vstupDuzp.title = 'Vyplňte, jen pokud se liší od data vystavení (appka jinak pro export/DPH bilanci použije datum vystavení).';
  const bunkaDuzp = pridejPole(mrizka, 4, 'DUZP', vstupDuzp);
  bunkaDuzp.querySelector('label').title = 'DUZP – datum uskutečnění zdanitelného plnění';

  pridejSkupinuPoli(mrizka, 'Platba');

  const vstupKonstSym = document.createElement('input');
  vstupKonstSym.type = 'text';
  vstupKonstSym.value = f.Konstantni_symbol || '';
  vstupKonstSym.placeholder = 'např. 0308';
  pridejPole(mrizka, 3, 'Konstantní symbol', vstupKonstSym);

  const vstupSpecSym = document.createElement('input');
  vstupSpecSym.type = 'text';
  vstupSpecSym.value = f.Specificky_symbol || '';
  vstupSpecSym.placeholder = 'specifický symbol';
  pridejPole(mrizka, 3, 'Specifický symbol', vstupSpecSym);

  const vstupPoznamka = document.createElement('input');
  vstupPoznamka.type = 'text';
  vstupPoznamka.value = f.Poznamka || '';
  pridejPole(mrizka, 6, 'Poznámka', vstupPoznamka);

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
      // (v4.75) Přes stejné pravidlo jako odznak a řazení - doklad placený
      // hotově nemá v bankovním výpisu co pohledávat, i když u něj příznak
      // nikdo nezaškrtl.
      .filter((d) => !jeHrazenoMimoUcet(d))
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

// ---------- ADMIN: PRONAJÍMATELÉ (od v4.80 - hlavičky smluv a předávacích
// protokolů, viz lib/pronajimateleSchema.js) ----------
//
// Proč to není součást sekce Firmy: Firmy.Nazev je účetní klíč, na kterém
// visí každý doklad, a nedá se editovat. Hlavička dokumentu se naopak mění
// běžně (sídlo, jednatel, účet) a jeden z Janových pronajímatelů není firma,
// ale on sám jako fyzická osoba - v listu Firmy by neměl co dělat.

async function nactiPronajimateleNastaveni() {
  const nacitani = document.getElementById('pronajimatele-nacitani');
  if (!nacitani) return;
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/pronajimatele', { method: 'GET' });
    nacitani.classList.add('skryto');
    vyplnVyberFirem('novy-p-firma', data.firmyDostupne || []);
    vykresliPronajimatele(data.pronajimatele || [], !!data.listChybi);
    // Karta bytu si seznam drží zvlášť - po změně v Nastavení by jinak
    // nabízela roletku podle starého stavu až do obnovení stránky.
    if (typeof zapomenPronajimatele === 'function') zapomenPronajimatele();
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst pronajímatele: ' + e.message;
  }
}

function vykresliPronajimatele(seznam, listChybi) {
  const telo = document.getElementById('tabulka-pronajimatele-telo');
  if (!telo) return;
  telo.innerHTML = '';

  seznam.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Název"></td><td data-label="Druh"></td><td data-label="IČO"></td>'
      + '<td data-label="Sídlo / bytem"></td><td data-label="Účet"></td>'
      + '<td data-label="Výchozí"></td><td data-label="Akce"></td>';

    const vNazev = document.createElement('input');
    vNazev.type = 'text'; vNazev.value = p.Nazev || ''; vNazev.style.fontSize = '13px';
    tr.children[0].appendChild(vNazev);

    const vDruh = document.createElement('select');
    vDruh.innerHTML = ['Firma', 'Osoba'].map((d) => '<option value="' + escapeAttr(d) + '"'
      + (d === (p.Druh || 'Firma') ? ' selected' : '') + '>' + escapeHtml(d === 'Osoba' ? 'Fyzická osoba' : d)
      + '</option>').join('');
    tr.children[1].appendChild(vDruh);

    const vIco = document.createElement('input');
    vIco.type = 'text'; vIco.value = p.ICO || ''; vIco.style.fontSize = '13px'; vIco.style.width = '90px';
    tr.children[2].appendChild(vIco);

    const vSidlo = document.createElement('input');
    vSidlo.type = 'text'; vSidlo.value = p.Sidlo || ''; vSidlo.style.fontSize = '13px';
    tr.children[3].appendChild(vSidlo);

    const vUcet = document.createElement('input');
    vUcet.type = 'text'; vUcet.value = p.Bankovni_ucet || ''; vUcet.style.fontSize = '13px'; vUcet.style.width = '120px';
    tr.children[4].appendChild(vUcet);

    const vVychozi = document.createElement('input');
    vVychozi.type = 'checkbox';
    vVychozi.checked = String(p.Vychozi || '').trim().toUpperCase() === 'ANO';
    tr.children[5].appendChild(vVychozi);

    const btnUlozit = document.createElement('button');
    btnUlozit.className = 'maly sekundarni';
    btnUlozit.textContent = 'Uložit';
    btnUlozit.onclick = () => ulozPronajimatele(p._row, {
      Nazev: vNazev.value.trim(), Druh: vDruh.value, ICO: vIco.value.trim(),
      Sidlo: vSidlo.value.trim(), Bankovni_ucet: vUcet.value.trim(),
      Vychozi: vVychozi.checked ? 'ANO' : '',
    }, btnUlozit);
    tr.children[6].appendChild(btnUlozit);

    const btnSmazat = document.createElement('button');
    btnSmazat.className = 'maly sekundarni akce-smazat';
    btnSmazat.style.marginLeft = '6px';
    btnSmazat.textContent = 'Smazat';
    btnSmazat.onclick = () => smazPronajimatele(p._row, p.Nazev, btnSmazat);
    tr.children[6].appendChild(btnSmazat);

    telo.appendChild(tr);

    // Zbytek polí (spisová značka, jednatel, zástupce, kontakty) se v téhle
    // tabulce needituje - je jich osmnáct a řádek by nešel přečíst. Mění se
    // v Google tabulce; sem patří to, co člověk kontroluje před tiskem.
    if (String(p.Spisova_znacka || '').trim() || String(p.Zastoupena || '').trim()) {
      const trDetail = document.createElement('tr');
      trDetail.innerHTML = '<td colspan="7" class="popis">'
        + escapeHtml([String(p.Spisova_znacka || '').trim(), String(p.Zastoupena || '').trim()]
          .filter(Boolean).join(' · ')) + '</td>';
      telo.appendChild(trDetail);
    }
  });

  if (!seznam.length) {
    telo.innerHTML = '<tr><td colspan="7" class="nacitani">'
      + (listChybi
        ? 'List „Pronajimatele“ v tabulce zatím není – založí ho /api/setup (Nastavení → Vytvořit/doplnit listy). '
          + 'Vaše firmy se do něj rovnou předvyplní z rejstříku.'
        : 'Zatím žádný pronajímatel. Bez něj se protokol vytiskne s prázdnou hlavičkou.')
      + '</td></tr>';
  }
}

async function pridatPronajimatele() {
  const zprava = document.getElementById('pronajimatele-zprava');
  zprava.innerHTML = '';
  const hodnota = (id) => (document.getElementById(id) || { value: '' }).value.trim();

  const nazev = hodnota('novy-p-nazev');
  if (!nazev) {
    zprava.innerHTML = '<div class="zprava chyba">Jméno nebo firma je povinné.</div>';
    return;
  }

  try {
    await zavolejApi('/pronajimatele', {
      method: 'POST',
      body: JSON.stringify({
        Nazev: nazev,
        Druh: hodnota('novy-p-druh'),
        Firma: hodnota('novy-p-firma'),
        ICO: hodnota('novy-p-ico'),
        DIC: hodnota('novy-p-dic'),
        Sidlo: hodnota('novy-p-sidlo'),
        Spisova_znacka: hodnota('novy-p-znacka'),
        Datum_narozeni: hodnota('novy-p-narozeni'),
        Zastoupena: hodnota('novy-p-zastoupena'),
        Bankovni_ucet: hodnota('novy-p-ucet'),
        Email: hodnota('novy-p-email'),
        Telefon: hodnota('novy-p-telefon'),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Pronajímatel přidán.</div>';
    ['novy-p-nazev', 'novy-p-ico', 'novy-p-dic', 'novy-p-sidlo', 'novy-p-znacka',
      'novy-p-narozeni', 'novy-p-zastoupena', 'novy-p-ucet', 'novy-p-email', 'novy-p-telefon']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    await nactiPronajimateleNastaveni();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozPronajimatele(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/pronajimatele', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiPronajimateleNastaveni();
  } catch (e) {
    alert('Nepodařilo se uložit pronajímatele: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazPronajimatele(row, nazev, tlacitko) {
  if (!confirm('Opravdu smazat pronajímatele „' + nazev + '“? Na už vytištěné dokumenty to nemá vliv.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/pronajimatele?row=' + row, { method: 'DELETE' });
    await nactiPronajimateleNastaveni();
  } catch (e) {
    alert('Nepodařilo se smazat pronajímatele: ' + e.message);
    tlacitko.disabled = false;
  }
}

// ---------- ADMIN: NÁJEMCI (od v4.81 - druhá strana smlouvy) ----------
//
// Stejné sloupce i stejný endpoint jako Pronajímatelé (viz
// lib/smluvniStrany.js). Tady je jen tabulka - a je záměrně UŽŠÍ než
// u pronajímatelů: u nájemce Jan v seznamu kontroluje, jestli sedí jméno,
// IČ a sídlo, „výchozí" u něj nemá co dělat (nájemce určuje smlouva).

async function nactiNajemceNastaveni() {
  const nacitani = document.getElementById('najemci-nacitani');
  if (!nacitani) return;
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    const data = await zavolejApi('/najemci', { method: 'GET' });
    nacitani.classList.add('skryto');
    vykresliNajemce(data.najemci || [], !!data.listChybi);
    // Karta bytu si seznam drží zvlášť - po změně v Nastavení by jinak
    // tiskla smlouvu podle starého stavu až do obnovení stránky.
    if (typeof zapomenPronajimatele === 'function') zapomenPronajimatele();
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst nájemce: ' + e.message;
  }
}

function vykresliNajemce(seznam, listChybi) {
  const telo = document.getElementById('tabulka-najemci-telo');
  if (!telo) return;
  telo.innerHTML = '';

  seznam.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Název"></td><td data-label="Druh"></td><td data-label="IČO"></td>'
      + '<td data-label="Sídlo / bytem"></td><td data-label="Kontakt"></td><td data-label="Akce"></td>';

    const vNazev = document.createElement('input');
    vNazev.type = 'text'; vNazev.value = p.Nazev || ''; vNazev.style.fontSize = '13px';
    tr.children[0].appendChild(vNazev);

    const vDruh = document.createElement('select');
    vDruh.innerHTML = ['Firma', 'Osoba'].map((d) => '<option value="' + escapeAttr(d) + '"'
      + (d === (p.Druh || 'Firma') ? ' selected' : '') + '>' + escapeHtml(d === 'Osoba' ? 'Fyzická osoba' : d)
      + '</option>').join('');
    tr.children[1].appendChild(vDruh);

    const vIco = document.createElement('input');
    vIco.type = 'text'; vIco.value = p.ICO || ''; vIco.style.fontSize = '13px'; vIco.style.width = '90px';
    tr.children[2].appendChild(vIco);

    const vSidlo = document.createElement('input');
    vSidlo.type = 'text'; vSidlo.value = p.Sidlo || ''; vSidlo.style.fontSize = '13px';
    tr.children[3].appendChild(vSidlo);

    const vEmail = document.createElement('input');
    vEmail.type = 'text'; vEmail.value = p.Email || ''; vEmail.placeholder = 'e-mail';
    vEmail.style.fontSize = '13px'; vEmail.style.width = '150px';
    tr.children[4].appendChild(vEmail);

    const btnUlozit = document.createElement('button');
    btnUlozit.className = 'maly sekundarni';
    btnUlozit.textContent = 'Uložit';
    btnUlozit.onclick = () => ulozNajemce(p._row, {
      Nazev: vNazev.value.trim(), Druh: vDruh.value, ICO: vIco.value.trim(),
      Sidlo: vSidlo.value.trim(), Email: vEmail.value.trim(),
    }, btnUlozit);
    tr.children[5].appendChild(btnUlozit);

    const btnSmazat = document.createElement('button');
    btnSmazat.className = 'maly sekundarni akce-smazat';
    btnSmazat.style.marginLeft = '6px';
    btnSmazat.textContent = 'Smazat';
    btnSmazat.onclick = () => smazNajemce(p._row, p.Nazev, btnSmazat);
    tr.children[5].appendChild(btnSmazat);

    telo.appendChild(tr);

    if (String(p.Zastoupena || '').trim()) {
      const trDetail = document.createElement('tr');
      trDetail.innerHTML = '<td colspan="6" class="popis">'
        + escapeHtml(String(p.Zastoupena).trim()) + '</td>';
      telo.appendChild(trDetail);
    }
  });

  if (!seznam.length) {
    telo.innerHTML = '<tr><td colspan="6" class="nacitani">'
      + (listChybi
        ? 'List „Najemci“ v tabulce zatím není – založí ho /api/setup (Nastavení → Vytvořit/doplnit listy).'
        : 'Zatím žádný nájemce. Bez něj se do smlouvy vytiskne jen jméno ze smlouvy, bez IČ a sídla.')
      + '</td></tr>';
  }
}

async function pridatNajemce() {
  const zprava = document.getElementById('najemci-zprava');
  zprava.innerHTML = '';
  const hodnota = (id) => (document.getElementById(id) || { value: '' }).value.trim();

  const nazev = hodnota('novy-n-nazev');
  if (!nazev) {
    zprava.innerHTML = '<div class="zprava chyba">Jméno nebo firma je povinné.</div>';
    return;
  }

  try {
    await zavolejApi('/najemci', {
      method: 'POST',
      body: JSON.stringify({
        Nazev: nazev,
        Druh: hodnota('novy-n-druh'),
        ICO: hodnota('novy-n-ico'),
        DIC: hodnota('novy-n-dic'),
        Sidlo: hodnota('novy-n-sidlo'),
        Spisova_znacka: hodnota('novy-n-znacka'),
        Datum_narozeni: hodnota('novy-n-narozeni'),
        Zastoupena: hodnota('novy-n-zastoupena'),
        Bankovni_ucet: hodnota('novy-n-ucet'),
        Email: hodnota('novy-n-email'),
        Telefon: hodnota('novy-n-telefon'),
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Nájemce přidán.</div>';
    ['novy-n-nazev', 'novy-n-ico', 'novy-n-dic', 'novy-n-sidlo', 'novy-n-znacka',
      'novy-n-narozeni', 'novy-n-zastoupena', 'novy-n-ucet', 'novy-n-email', 'novy-n-telefon']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    await nactiNajemceNastaveni();
  } catch (e) {
    zprava.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function ulozNajemce(row, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/najemci', { method: 'PATCH', body: JSON.stringify({ row, zmeny }) });
    await nactiNajemceNastaveni();
  } catch (e) {
    alert('Nepodařilo se uložit nájemce: ' + e.message);
    tlacitko.disabled = false;
  }
}

async function smazNajemce(row, nazev, tlacitko) {
  if (!confirm('Opravdu smazat nájemce „' + nazev + '“? Smlouvy ani platby to nezmění – '
    + 'jen se do nových dokumentů přestanou vyplňovat jeho údaje.')) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/najemci?row=' + row, { method: 'DELETE' });
    await nactiNajemceNastaveni();
  } catch (e) {
    alert('Nepodařilo se smazat nájemce: ' + e.message);
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
// (v4.78) Nájemní jednotky a revize VŠECH středisek naráz - kvůli souhrnu
// portfolia nad seznamem. Endpoint umí vrátit všechno bez parametru
// `stredisko`, takže je to jedno volání na obojí, ne jedno na každý byt.
let nemovitostiNajemniJednotkyVse = [];
let nemovitostiRevizeVse = [];
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

// (v4.80) Kopie vychoziJednotkaMeridla() z lib/nemovitostiDetailySchema.js -
// stejná duplikace ze stejného důvodu jako číselníky výš. Teplo tu schválně
// chybí: kalorimetr měří v GJ i v kWh a navrhnout jedno z toho by znamenalo
// tisknout do protokolu špatnou jednotku v polovině případů.
function vychoziJednotkaMeridlaBrowser(typ) {
  const t = String(typ || '').trim();
  if (t === 'Elektřina') return 'kWh';
  if (t === 'Voda' || t === 'Plyn') return 'm³';
  return '';
}

async function nactiNemovitosti() {
  const nacitani = document.getElementById('nemovitosti-nacitani');
  nacitani.classList.remove('skryto');
  nacitani.textContent = 'Načítám…';

  try {
    // Měsíc pro odznak úhrady na sbaleném řádku - vždycky ten aktuální.
    // (Sekce „Kontrola úhrady nájmu" níž má vlastní přepínač měsíce, ten
    // tenhle odznak nemění - jsou to dvě různé otázky.)
    vyplnRokyKontrolyNajmu();
    vyplnRokyNajemne();
    nemovitostiPlatbyMesic = new Date().toISOString().slice(0, 7);

    const [dataJednotky, dataFirmy, dataStrediska, dataSmlouvy, dataPlatby,
      dataNajemniVse, dataRevizeVse] = await Promise.all([
      zavolejApi('/nemovitosti-jednotky', { method: 'GET' }),
      zavolejApi('/firmy', { method: 'GET' }).catch(() => ({ firmy: [] })),
      zavolejApi('/strediska', { method: 'GET' }).catch(() => ({ strediska: [] })),
      zavolejApi('/smlouvy', { method: 'GET' }).catch(() => ({ smlouvy: [] })),
      // Když tenhle přehled spadne, karty se musí vykreslit stejně - odznak
      // stavu platby prostě nebude. Ticho je lepší než vymyšlený stav.
      zavolejApi('/nemovitosti-platby-prehled?mesic=' + encodeURIComponent(nemovitostiPlatbyMesic), { method: 'GET' })
        .catch(() => ({ radky: [] })),
      // (v4.78) Pro souhrn portfolia. Obojí s .catch() na prázdno - listy
      // vznikají až po /api/setup a souhrn kvůli nim nesmí shodit celou
      // záložku; prostě ukáže míň.
      zavolejApi('/nemovitosti-detaily?entita=najemni_jednotky', { method: 'GET' })
        .catch(() => ({ polozky: [] })),
      zavolejApi('/nemovitosti-detaily?entita=revize', { method: 'GET' })
        .catch(() => ({ polozky: [] })),
    ]);

    nemovitostiPlatbyMapa = {};
    (dataPlatby.radky || []).forEach((r) => {
      if (r.stredisko) nemovitostiPlatbyMapa[r.stredisko] = r;
    });
    nemovitostiJednotkySeznam = dataJednotky.jednotky || [];
    nemovitostiFirmySeznam = (dataFirmy.firmy || []).map((f) => f.Nazev).filter(Boolean);
    strediskaSeznam = dataStrediska.strediska || [];
    nemovitostiSmlouvySeznam = dataSmlouvy.smlouvy || [];
    nemovitostiNajemniJednotkyVse = dataNajemniVse.polozky || [];
    nemovitostiRevizeVse = dataRevizeVse.polozky || [];
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

    // (v4.60) Peníze, které dorazily, ale čekají na potvrzení v Bankovních
    // výpisech. Bez téhle věty by řádek tvrdil „Nezaplaceno" u nájmu,
    // který na účtu leží - jen ho nikdo neodklepl.
    if (r.navrzeno > 0) {
      const pozn = document.createElement('div');
      pozn.className = 'popis';
      pozn.style.margin = '2px 0 0';
      pozn.textContent = 'Čeká na potvrzení: ' + formatCastkaSMenou(r.navrzeno, r.mena || 'CZK')
        + ' – odklepněte v Bankovních výpisech.';
      tr.children[4].appendChild(pozn);
    }
    telo.appendChild(tr);
  });
  tabulka.appendChild(telo);
  el.innerHTML = '';
  el.appendChild(tabulka);
}

// ---------- NÁJEMNÉ: rozpis a úhrady napříč všemi byty (v4.62) ----------
//
// Jan 2026-08-09: *„chci tam rozpis nájmu, vytěžení nájemních smluv a
// přehled - uhrazeno, po splatnosti"* a k rozvržení *„jeden seznam všech
// bytů"*.
//
// Tahle obrazovka je první místo, odkud se vůbec volá /predpis-plateb -
// backend ho uměl od v4.59, ale appka ho nevolala ani jednou, takže celý
// předpis byl nedosažitelný. Řetěz je: dovytěžit smlouvu -> vygenerovat
// předpis -> teprve pak má rozpis co ukazovat, a přesně v tomhle pořadí
// obrazovka nabízí tlačítka.
//
// DVĚ VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
//
// 1) „Po splatnosti" se POČÍTÁ z data (backend, `poSplatnosti` u řádku).
//    Do sloupce Stav se nezapisuje - stav by se jinak měnil jen tím, že
//    si někdo obrazovku otevřel.
// 2) Kč a EUR se nesčítají. Souhrn se bere z `souhrn.podleMeny`, nikdy
//    z plochého `souhrn.predepsano`.
let najemneData = null;

function vyplnRokyNajemne() {
  const vyber = document.getElementById('najemne-rok');
  if (!vyber || vyber.options.length > 0) return;
  const letos = new Date().getFullYear();
  // O rok dopředu schválně: předpis se generuje na celou dobu platnosti,
  // takže příští rok už řádky mít bude a má jít zkontrolovat.
  for (let r = letos + 1; r >= letos - 4; r -= 1) {
    const o = document.createElement('option');
    o.value = String(r);
    o.textContent = String(r);
    vyber.appendChild(o);
  }
  vyber.value = String(letos);
}

async function nactiNajemne() {
  const el = document.getElementById('najemne-vysledek');
  const rok = document.getElementById('najemne-rok').value;
  if (!el) return;
  el.innerHTML = '<div class="nacitani">Načítám…</div>';
  try {
    najemneData = await zavolejApi('/predpis-plateb?vse=1&rok=' + encodeURIComponent(rok), { method: 'GET' });
    vykresliNajemne(el, najemneData);
  } catch (e) {
    el.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

function vykresliNajemne(el, data) {
  const filtr = (document.getElementById('najemne-filtr') || {}).value || 'vse';
  const vsechny = data.predpisy || [];
  const radky = vsechny.filter((p) => {
    if (filtr === 'nezaplacene') {
      return p.Stav !== 'Odpuštěno'
        && parsujCastkuZListu(p.Uhrazeno) < parsujCastkuZListu(p.Castka_celkem);
    }
    if (filtr === 'posplatnosti') return !!p.poSplatnosti;
    return true;
  });

  el.innerHTML = '';

  // --- Souhrn, po měnách -------------------------------------------------
  const souhrn = (data.souhrn && data.souhrn.podleMeny) || [];
  if (souhrn.length) {
    const box = document.createElement('div');
    box.className = 'najemne-souhrn';
    souhrn.forEach((m) => {
      const karta = document.createElement('div');
      karta.className = 'najemne-souhrn-karta';
      const dluh = document.createElement('div');
      dluh.className = 'najemne-souhrn-cislo' + (m.dluh > 0 ? ' najemne-dluh' : '');
      dluh.textContent = formatCastkaSMenou(m.dluh, m.mena);
      const popis = document.createElement('div');
      popis.className = 'popis';
      popis.textContent = 'Dluh · předepsáno ' + formatCastkaSMenou(m.predepsano, m.mena)
        + ', uhrazeno ' + formatCastkaSMenou(m.uhrazeno, m.mena)
        + ' · po splatnosti ' + m.poSplatnosti + '×';
      karta.appendChild(dluh);
      karta.appendChild(popis);
      box.appendChild(karta);
    });
    el.appendChild(box);
  }

  // --- Smlouvy, ze kterých předpis ještě nevznikl -------------------------
  // Záměrně NAD tabulkou: prázdný rozpis neznamená „nikdo nedluží", ale
  // „ještě to nemáme založené". Ta věta musí být vidět dřív než ta nula.
  const bez = data.bezPredpisu || [];
  if (bez.length) {
    const blok = document.createElement('div');
    blok.className = 'zprava varovani';
    const nadpis = document.createElement('p');
    nadpis.innerHTML = '<strong>' + bez.length + '× nájemní smlouva zatím nemá předpis plateb.</strong> '
      + 'Dokud ho nemá, do rozpisu níž se nedostane a nejde u ní poznat, co je po splatnosti.';
    blok.appendChild(nadpis);

    bez.forEach((s) => {
      const radek = document.createElement('div');
      radek.className = 'najemne-bez-predpisu';
      const popis = document.createElement('span');
      popis.textContent = (s.Stredisko || '(bez střediska)') + ' – ' + (s.Druha_strana || s.Nazev || 'smlouva')
        + (s.chybi && s.chybi.length ? ' · chybí: ' + s.chybi.join(', ') : '');
      radek.appendChild(popis);

      const akce = document.createElement('span');
      akce.className = 'najemne-bez-predpisu-akce';
      if (s.chybi && s.chybi.length) {
        // Bez částky nebo bez data platnosti předpis vzniknout nemůže -
        // nabídne se tedy krok, který ta pole umí doplnit z přílohy.
        const dovyt = document.createElement('button');
        dovyt.className = 'sekundarni';
        dovyt.textContent = 'Dovytěžit z přílohy';
        dovyt.addEventListener('click', () => dovytezSmlouvu(s.ID, dovyt));
        akce.appendChild(dovyt);
      } else {
        const gen = document.createElement('button');
        gen.className = 'sekundarni';
        gen.textContent = 'Vygenerovat předpis';
        gen.addEventListener('click', () => vygenerujPredpisProSmlouvu(s.ID, gen));
        akce.appendChild(gen);
      }
      radek.appendChild(akce);
      blok.appendChild(radek);
    });
    el.appendChild(blok);
  }

  // --- Rozpis ------------------------------------------------------------
  if (!radky.length) {
    const p = document.createElement('p');
    p.className = 'popis';
    p.textContent = vsechny.length
      ? 'Za zvolený rok tomuhle filtru neodpovídá žádný řádek předpisu.'
      : 'Za zvolený rok zatím žádný předpis plateb není.';
    el.appendChild(p);
    return;
  }

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Splatnost</th><th>Byt</th><th>Nájemník</th><th>Období</th>'
    + '<th>Předepsáno</th><th>Uhrazeno</th><th>Stav</th></tr></thead>';
  const telo = document.createElement('tbody');

  radky.forEach((p) => {
    const celkem = parsujCastkuZListu(p.Castka_celkem);
    const uhrazeno = parsujCastkuZListu(p.Uhrazeno);
    const mena = p.Mena || 'CZK';
    const tr = document.createElement('tr');
    if (p.poSplatnosti) tr.className = 'radek-po-splatnosti';
    tr.innerHTML = '<td data-label="Splatnost"></td><td data-label="Byt"></td><td data-label="Nájemník"></td>'
      + '<td data-label="Období"></td><td data-label="Předepsáno"></td><td data-label="Uhrazeno"></td>'
      + '<td data-label="Stav"></td>';
    tr.children[0].textContent = p.Splatnost || '';
    tr.children[1].textContent = p.stredisko || '';
    tr.children[2].textContent = p.druhaStrana || '';

    // Kauce nemá období - místo prázdné buňky se napíše, co to je, ať se
    // nepoplete s nájmem.
    tr.children[3].textContent = p.Typ === 'Kauce' ? 'Kauce' : (p.Obdobi || '');

    tr.children[4].textContent = formatCastkaSMenou(celkem, mena);
    const najem = parsujCastkuZListu(p.Castka_najem);
    const zaloha = parsujCastkuZListu(p.Castka_zaloha);
    if (zaloha > 0) {
      const rozpad = document.createElement('div');
      rozpad.className = 'popis';
      rozpad.style.margin = '2px 0 0';
      rozpad.textContent = 'nájem ' + formatCastkaSMenou(najem, mena)
        + ' + zálohy ' + formatCastkaSMenou(zaloha, mena);
      tr.children[4].appendChild(rozpad);
    }
    tr.children[5].textContent = formatCastkaSMenou(uhrazeno, mena);

    let trida = 'badge-chybi';
    let text = 'Nezaplaceno';
    if (p.Stav === 'Odpuštěno') { trida = 'badge-navrzeno'; text = 'Odpuštěno'; }
    else if (uhrazeno >= celkem && celkem > 0) { trida = 'badge-potvrzeno'; text = 'Uhrazeno'; }
    else if (uhrazeno > 0) { trida = 'badge-navrzeno'; text = 'Částečně'; }
    tr.children[6].innerHTML = '<span class="' + trida + '">' + escapeHtml(text) + '</span>';

    if (p.poSplatnosti) {
      const pozn = document.createElement('div');
      pozn.className = 'popis najemne-po-splatnosti';
      pozn.style.margin = '2px 0 0';
      pozn.textContent = 'Po splatnosti – chybí ' + formatCastkaSMenou(celkem - uhrazeno, mena);
      tr.children[6].appendChild(pozn);
    }
    telo.appendChild(tr);
  });
  tabulka.appendChild(telo);
  el.appendChild(tabulka);
}

async function vygenerujPredpisProSmlouvu(smlouvaId, tlacitko) {
  tlacitko.disabled = true;
  const puvodni = tlacitko.textContent;
  tlacitko.textContent = 'Generuji…';
  try {
    const data = await zavolejApi('/predpis-plateb', {
      method: 'POST',
      body: JSON.stringify({ smlouva_id: smlouvaId }),
    });
    // Strop u doby neurčité se neschovává - jinak by za pět let předpisy
    // tiše došly a nikdo by nevěděl proč.
    alert('Vygenerováno řádků: ' + data.pridano
      + (data.preskoceno ? ' (už existovalo: ' + data.preskoceno + ')' : '')
      + (data.upozorneni ? '\n\n' + data.upozorneni : ''));
    await nactiNajemne();
  } catch (e) {
    alert('Předpis se nepodařilo vygenerovat: ' + e.message);
    tlacitko.disabled = false;
    tlacitko.textContent = puvodni;
  }
}

/*
 * Dovytěžení hotové smlouvy z přílohy na Drive (v4.62).
 *
 * Appka doplní jen PRÁZDNÁ pole. Všechno, co už vyplněné je a AI to čte
 * jinak, se ukáže vedle sebe („v appce" × „AI našla") a čeká na kliknutí -
 * appka to nepřepíše sama. U chráněných polí (Středisko, Firma, Typ,
 * Název, Poznámka) se nezapíše nic ani do prázdna: Středisko je účetní
 * klíč a jeho tichá změna by přeházela zaúčtování.
 */
async function dovytezSmlouvu(smlouvaId, tlacitko) {
  if (!confirm('Appka znovu přečte přílohu smlouvy pomocí AI.\n\n'
    + 'Doplní jen pole, která jsou prázdná. Nic vyplněného nepřepíše – rozdíly vám ukáže '
    + 'k odklepnutí. Pokračovat?')) return;
  tlacitko.disabled = true;
  const puvodni = tlacitko.textContent;
  tlacitko.textContent = 'Vytěžuji…';
  try {
    const data = await zavolejApi('/smlouvy-upload-dokoncit', {
      method: 'POST',
      body: JSON.stringify({ id: smlouvaId, rezim: 'dovytezeni' }),
    });
    tlacitko.textContent = puvodni;
    const rozdily = data.rozdily || [];
    if (!rozdily.length) {
      alert('Hotovo. Doplněných polí: ' + (data.pocetDoplnenych || 0)
        + '.\nŽádný rozdíl proti tomu, co už v appce bylo.');
      await nactiNajemne();
      return;
    }
    vykresliRozdilyDovytezeni(smlouvaId, data, tlacitko);
  } catch (e) {
    alert('Dovytěžení se nepovedlo: ' + e.message);
    tlacitko.disabled = false;
    tlacitko.textContent = puvodni;
  }
}

function vykresliRozdilyDovytezeni(smlouvaId, data, tlacitko) {
  const rodic = tlacitko.closest('.najemne-bez-predpisu') || tlacitko.parentElement;
  const stary = document.getElementById('rozdily-' + smlouvaId);
  if (stary) stary.remove();

  const blok = document.createElement('div');
  blok.id = 'rozdily-' + smlouvaId;
  blok.className = 'najemne-rozdily';

  const uvod = document.createElement('p');
  uvod.className = 'popis';
  uvod.innerHTML = 'Doplněno rovnou (bylo prázdné): <strong>' + (data.pocetDoplnenych || 0) + '</strong>. '
    + 'Níž je to, co appka <strong>nepřepsala</strong> – zaškrtněte, co se má převzít z AI.';
  blok.appendChild(uvod);

  (data.rozdily || []).forEach((r, i) => {
    const radek = document.createElement('label');
    radek.className = 'najemne-rozdil';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.pole = r.pole;
    box.dataset.hodnota = r.zAi;
    box.id = 'rozdil-' + smlouvaId + '-' + i;
    radek.appendChild(box);

    const text = document.createElement('span');
    const vApp = r.vApp ? r.vApp : '(prázdné)';
    text.innerHTML = '<strong>' + escapeHtml(r.popisek) + '</strong>: v appce '
      + '<em>' + escapeHtml(vApp) + '</em> → AI našla <em>' + escapeHtml(r.zAi) + '</em>'
      + (r.chranene ? ' <span class="badge-chybi">účetně citlivé</span>' : '');
    radek.appendChild(text);
    blok.appendChild(radek);
  });

  const ulozit = document.createElement('button');
  ulozit.textContent = 'Převzít zaškrtnuté';
  ulozit.addEventListener('click', () => ulozRozdilyDovytezeni(smlouvaId, blok, ulozit));
  blok.appendChild(ulozit);

  rodic.appendChild(blok);
}

async function ulozRozdilyDovytezeni(smlouvaId, blok, tlacitko) {
  const zmeny = {};
  let citlive = 0;
  blok.querySelectorAll('input[type="checkbox"]:checked').forEach((b) => {
    zmeny[b.dataset.pole] = b.dataset.hodnota;
    if (b.dataset.pole === 'Stredisko' || b.dataset.pole === 'Firma') citlive += 1;
  });
  if (Object.keys(zmeny).length === 0) { alert('Nic není zaškrtnuté.'); return; }
  // Středisko je JEDINÝ účetní klíč (od v4.23). Jeho změna se ptá zvlášť,
  // i když ji člověk právě zaškrtl - je to jediná změna na téhle
  // obrazovce, kterou by šlo poznat až na dashboardu.
  if (citlive && !confirm('Měníte středisko nebo firmu na smlouvě. Podle střediska se účtují '
    + 'bankovní pohyby i vyúčtování – už zaúčtované pohyby se tím zpětně nepřepíšou.\n\nOpravdu uložit?')) return;

  tlacitko.disabled = true;
  try {
    await zavolejApi('/smlouvy', { method: 'PATCH', body: JSON.stringify({ id: smlouvaId, zmeny }) });
    blok.remove();
    await nactiNajemne();
  } catch (e) {
    alert('Uložení se nepovedlo: ' + e.message);
    tlacitko.disabled = false;
  }
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
        Druh: document.getElementById('nova-nem-druh').value.trim(),
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


/* ---------- KONTROLA PŘIŘAZENÍ NÁJMŮ (v4.58) ----------
 *
 * Jan 2026-08-08: *"můžeš systémově zkontrolovat přijaté platby za nájmy ke
 * smlouvám a upravit jejich přiřazení?"*, volba **„Navrhnout, vy potvrdíte"**.
 *
 * Appka tedy vypíše nálezy a u těch, kde je oprava jednoznačná, nabídne
 * jedno tlačítko. **Nic nepřepisuje sama** a nemá hromadné „opravit vše" -
 * Jan si vybral potvrzování po jednom a přepsat desítky přiřazení plateb
 * jedním klepnutím je přesně ta operace, kterou nejde vzít zpět.
 *
 * Výpočet je celý na serveru (lib/kontrolaNajmu.js). Tady se jen vykresluje
 * a odesílají se běžné PATCHe, které appka měla už dřív:
 *   - přehození platby na jinou smlouvu -> PATCH /banka
 *   - doplnění nájemní jednotky u smlouvy -> PATCH /smlouvy
 */
const KONTROLA_NAJMU_POPISKY = {
  'bez-jednotky': 'Smlouva bez nájemní jednotky',
  'castka-nesedi': 'Částka nesedí na předpis',
  'chybi-platba': 'Chybějící platba',
  'dvoji-platba': 'Dvě platby v jednom měsíci',
  'po-platnosti': 'Platba na smlouvu po platnosti',
};

function vyplnRokyKontrolyNajmu() {
  const vyber = document.getElementById('kontrola-najmu-rok');
  if (!vyber || vyber.options.length > 0) return;
  const letos = new Date().getFullYear();
  // Pět let zpátky stačí - starší data se stejně už nepřepisují.
  for (let r = letos; r >= letos - 4; r -= 1) {
    const o = document.createElement('option');
    o.value = String(r);
    o.textContent = String(r);
    vyber.appendChild(o);
  }
  vyber.value = String(letos);
}

async function spustKontroluNajmu() {
  const tlacitko = document.getElementById('tlacitko-kontrola-najmu');
  const el = document.getElementById('kontrola-najmu-vysledek');
  const rok = document.getElementById('kontrola-najmu-rok').value;
  if (!rok) { alert('Vyberte rok.'); return; }

  tlacitko.disabled = true;
  el.innerHTML = '<div class="nacitani">Kontroluji…</div>';
  try {
    const data = await zavolejApi('/kontrola-najmu?rok=' + encodeURIComponent(rok), { method: 'GET' });
    vykresliVysledekKontrolyNajmu(el, data);
  } catch (e) {
    el.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  } finally {
    tlacitko.disabled = false;
  }
}

function vykresliVysledekKontrolyNajmu(el, data) {
  el.innerHTML = '';
  const nalezy = data.nalezy || [];
  const prehled = data.prehled || {};

  const souhrn = document.createElement('div');
  souhrn.className = nalezy.length === 0 ? 'zprava uspech' : 'popis';
  souhrn.style.marginTop = '10px';
  souhrn.textContent = 'Zkontrolováno ' + (prehled.zkontrolovanoPlateb || 0) + ' plateb u '
    + (prehled.zkontrolovanoSmluv || 0) + ' nájemních smluv za rok ' + data.rok + '. '
    + (nalezy.length === 0
      ? 'Nic nesedícího appka nenašla.'
      : 'Nalezeno ' + (prehled.chyb || 0) + ' chyb a ' + (prehled.varovani || 0)
        + ' varování, z toho ' + (prehled.sNavrhem || 0) + ' s návrhem opravy.');
  el.appendChild(souhrn);
  if (nalezy.length === 0) return;

  nalezy.forEach((n) => el.appendChild(vytvorNalezKontrolyNajmu(n)));
}

function vytvorNalezKontrolyNajmu(n) {
  const box = document.createElement('div');
  box.className = 'kontrola-nalez kontrola-nalez-' + (n.zavaznost === 'chyba' ? 'chyba' : 'varovani');

  const hlava = document.createElement('div');
  hlava.className = 'kontrola-nalez-hlava';
  const stitek = document.createElement('span');
  stitek.className = 'kontrola-nalez-stitek';
  stitek.textContent = KONTROLA_NAJMU_POPISKY[n.typ] || n.typ;
  hlava.appendChild(stitek);
  if (n.stredisko) {
    const stred = document.createElement('span');
    stred.className = 'jednotka-prehled-popisek';
    stred.textContent = n.stredisko;
    hlava.appendChild(stred);
  }
  box.appendChild(hlava);

  const popis = document.createElement('div');
  popis.className = 'kontrola-nalez-popis';
  popis.textContent = n.popis;
  box.appendChild(popis);

  // Návrh opravy. Když ho server nedal, je to schválně: buď na platbu
  // seděly dvě smlouvy stejně dobře, nebo se opravit nedá vůbec (chybějící
  // platbu appka nevymyslí). Místo tlačítka se proto napíše, co s tím.
  if (n.navrh) {
    const btn = document.createElement('button');
    btn.className = 'maly sekundarni akce-potvrdit';
    btn.textContent = n.navrh.popis;
    btn.onclick = () => provedOpravuKontrolyNajmu(n, btn, box);
    box.appendChild(btn);
  } else {
    const rada = document.createElement('div');
    rada.className = 'popis';
    rada.style.margin = '4px 0 0';
    rada.textContent = n.typ === 'chybi-platba'
      ? 'Appka nepozná, jestli nájemník nezaplatil, nebo se platba jen nespárovala – najděte ji v Bankovních výpisech.'
      : (n.typ === 'dvoji-platba'
        ? 'Která platba je navíc, appka nepozná – obě sedí na stejnou smlouvu. Vyřešte v Bankovních výpisech.'
        : 'Appka nenašla jednoznačnou opravu – opravte přiřazení ručně v Bankovních výpisech.');
    box.appendChild(rada);
  }

  return box;
}

async function provedOpravuKontrolyNajmu(nalez, tlacitko, box) {
  const navrh = nalez.navrh;
  if (!navrh) return;
  if (!confirm(navrh.popis + '?\n\n' + nalez.popis)) return;

  tlacitko.disabled = true;
  try {
    if (navrh.akce === 'prirad-pohyb') {
      // Stav_parovani se posílá schválně - PATCH /banka podle něj pozná, že
      // jde o POTVRZENÉ přiřazení, a převezme středisko ze smlouvy.
      await zavolejApi('/banka', {
        method: 'PATCH',
        body: JSON.stringify({
          id: navrh.pohybId,
          zmeny: { Smlouva_ID: navrh.smlouvaId, Stav_parovani: 'Trvalý příkaz' },
        }),
      });
    } else if (navrh.akce === 'nastav-jednotku') {
      await zavolejApi('/smlouvy', {
        method: 'PATCH',
        body: JSON.stringify({
          id: navrh.smlouvaId,
          zmeny: { Najemni_jednotka_ID: navrh.najemniJednotkaId },
        }),
      });
    } else {
      throw new Error('Neznámá akce opravy: ' + navrh.akce);
    }
    box.className = 'kontrola-nalez kontrola-nalez-hotovo';
    box.innerHTML = '';
    const hotovo = document.createElement('div');
    hotovo.textContent = 'Opraveno: ' + navrh.popis;
    box.appendChild(hotovo);
    const pozn = document.createElement('div');
    pozn.className = 'popis';
    pozn.style.margin = '4px 0 0';
    pozn.textContent = 'Spusťte kontrolu znovu, ať se přepočítají i ostatní nálezy.';
    box.appendChild(pozn);
  } catch (e) {
    alert('Opravu se nepodařilo uložit: ' + e.message);
    tlacitko.disabled = false;
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

  // (v4.79) Oba bloky jsou SBALENÉ. Jan 2026-08-21 poslal snímek z mobilu,
  // kde sedm smluv po platnosti zabralo celou obrazovku červeného textu -
  // dřív než se člověk dostal k tomu, co s tím má dělat. Vidět je počet,
  // seznam se rozbalí klepnutím.
  if (poPlatnosti.length > 0) {
    const box = document.createElement('details');
    box.className = 'zprava chyba zprava-skladaci';
    box.innerHTML = '<summary><strong>Po platnosti, ale pořád aktivní ('
      + poPlatnosti.length + ')</strong></summary>'
      + '<div class="zprava-seznam">'
      + poPlatnosti.map((s) => '<span>' + escapeHtml(popisSmlouvy(s)) + '</span>').join('')
      + '</div>'
      + '<span class="popis">Takové smlouvy se dál počítají do očekávaných plateb i do vyúčtování. '
      + 'Pokud nájem skončil, přepněte smlouvu na neaktivní v Registru smluv; pokud pokračuje, prodlužte platnost.</span>';
    el.appendChild(box);
  }

  if (konci.length > 0) {
    const box = document.createElement('details');
    box.className = 'zprava varovani zprava-skladaci';
    box.innerHTML = '<summary><strong>Končí do ' + NEM_KONCI_DNI + ' dnů ('
      + konci.length + ')</strong></summary>'
      + '<div class="zprava-seznam">'
      + konci.map((s) => '<span>' + escapeHtml(popisSmlouvy(s)) + '</span>').join('')
      + '</div>';
    el.appendChild(box);
  }
}

// ---------------------------------------------------------------------------
// PORTFOLIO NEMOVITOSTÍ (v4.78)
//
// Jan 2026-08-21 poslal snímek z appky Nemovitorium („Váš majetek v kostce",
// „Zadlužení portfolia", „Vybrané ukazatele") a zeptal se: *„Tohle umíš?"*
// Z nabídnutých bloků si vybral majetek v kostce, vybrané ukazatele a
// „vyžaduje pozornost"; zadlužení (LTV) ne, protože appka o úvěrech nevede
// nic a musela by si dluh vymyslet.
//
// ČTYŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
//
// 1) MĚNY SE NESČÍTAJÍ. Portfolio se počítá zvlášť pro každou měnu, ve
//    které jsou smlouvy - stejné pravidlo jako v Dashboardu.
// 2) PRŮMĚR ŘEKNE, Z KOLIKA. ROI ani nájemné/m² nejdou spočítat u
//    nemovitosti bez vyplněné hodnoty/plochy. Appka takové vynechá a
//    NAPÍŠE, kolik jich do čísla vstoupilo - jinak by průměr z poloviny
//    portfolia vypadal jako průměr celého.
// 3) PRÁZDNÝ DRUH NENÍ „OSTATNÍ". Nevyplněná nemovitost má vlastní řádek
//    „Neuvedeno"; sesypat ji do Ostatních by znamenalo tvrdit něco, co
//    appka neví.
// 4) NULA SE NEVYDÁVÁ ZA ODPOVĚĎ. Když nikde není vyplněná hodnota, appka
//    napíše, že hodnotu nezná - ne „0 Kč".
const DRUHY_NEMOVITOSTI = ['Byt', 'Dům', 'Pozemek', 'Ostatní'];

/**
 * České skloňování po číslovce: 1 nemovitost, 2-4 nemovitosti, 5+ nemovitostí.
 *
 * Bez tohohle by souhrn psal „4 nemovitostí" - drobnost, ale je to první
 * věta, kterou člověk na obrazovce přečte, a špatný tvar v ní vypadá, že
 * appku psal stroj.
 */
function pocetSlovem(pocet, tvary) {
  const n = Math.abs(Number(pocet) || 0);
  if (n === 1) return pocet + ' ' + tvary[0];
  if (n >= 2 && n <= 4) return pocet + ' ' + tvary[1];
  return pocet + ' ' + tvary[2];
}
const TVARY_NEMOVITOSTI = ['nemovitost', 'nemovitosti', 'nemovitostí'];
// Po předložce „u" je druhý pád: u 1 nemovitosti, u 2 nemovitostí.
const TVARY_NEMOVITOSTI_U = ['nemovitosti', 'nemovitostí', 'nemovitostí'];
// V souhrnu se píše množné číslo („Byty 12"), v roletce jednotné („Byt") -
// v tabulce je uložené jednotné, protože popisuje jednu nemovitost.
const DRUHY_MNOZNE = { Byt: 'Byty', 'Dům': 'Domy', Pozemek: 'Pozemky', 'Ostatní': 'Ostatní' };

// Roční hrubý nájem ze smlouvy. Bere čistý nájem, ne celkovou platbu -
// zálohy na služby nejsou výnos, ty se nájemníkovi vyúčtují zpátky.
function rocniNajemSmlouvy(s) {
  const mesicni = parsujCastkuZListu(s.Cisty_najem) || parsujCastkuZListu(s.Ocekavana_castka);
  return mesicni * 12;
}

function aktivniNajemniSmlouvy() {
  return nemovitostiSmlouvySeznam.filter((s) => s.Typ === 'Nájem' && s.Aktivni !== 'NE');
}

/*
 * „Váš majetek v kostce" - počty a hodnota podle druhu nemovitosti.
 */
function vykresliMajetekVKostce(el) {
  const jednotky = nemovitostiJednotkySeznam;
  const podleDruhu = {};
  DRUHY_NEMOVITOSTI.forEach((d) => { podleDruhu[d] = { pocet: 0, hodnota: 0 }; });
  const neuvedeno = { pocet: 0, hodnota: 0 };
  let sHodnotou = 0;

  jednotky.forEach((j) => {
    const druh = String(j.Druh || '').trim();
    const hodnota = parsujCastkuZListu(j.Aktualni_hodnota) || parsujCastkuZListu(j.Porizovaci_cena);
    if (hodnota > 0) sHodnotou += 1;
    const cil = podleDruhu[druh] || neuvedeno;
    cil.pocet += 1;
    cil.hodnota += hodnota;
  });

  const celkem = jednotky.reduce((c, j) =>
    c + (parsujCastkuZListu(j.Aktualni_hodnota) || parsujCastkuZListu(j.Porizovaci_cena)), 0);

  let html = '<h3>Váš majetek v kostce</h3>'
    + '<p class="popis portfolio-podnadpis">' + pocetSlovem(jednotky.length, TVARY_NEMOVITOSTI)
    + ' · aktuální hodnota'
    + (sHodnotou < jednotky.length ? ' · vyplněná u ' + sHodnotou + ' z ' + jednotky.length : '')
    + '</p>';

  const radek = (nazev, data, trida) =>
    '<div class="portfolio-radek"><span class="portfolio-tecka ' + trida + '"></span>'
    + '<span>' + escapeHtml(nazev) + '</span>'
    + '<span class="portfolio-pocet">' + data.pocet + '</span>'
    + '<span class="portfolio-hodnota' + (data.hodnota ? '' : ' prazdna') + '">'
    + (data.hodnota ? formatCastkaSMenou(data.hodnota, 'CZK') : '–') + '</span></div>';

  // (v4.79) Řádky s nulou se NEVYKRESLUJÍ. Jan 2026-08-21 poslal snímek
  // z mobilu, kde měl pět řádků „0 · –" a jeden skutečný - prázdné řádky
  // zabraly půl obrazovky a neřekly nic, co by nulou nebylo řečeno líp.
  // Když druh nemá ani jedna nemovitost, zbude jediný řádek „Neuvedeno".
  DRUHY_NEMOVITOSTI.forEach((d, i) => {
    if (podleDruhu[d].pocet) html += radek(DRUHY_MNOZNE[d] || d, podleDruhu[d], 'druh-' + i);
  });
  // Pravidlo 3: nevyplněný druh má vlastní řádek a vlastní větu.
  if (neuvedeno.pocet) html += radek('Neuvedeno', neuvedeno, 'druh-neuvedeno');

  // Součet dává smysl jen tam, kde je co sčítat. Dřív tu u prázdného
  // portfolia stálo „Celkem: appka hodnotu nezná" - dlouhá věta v místě,
  // kde se čeká číslo, a na mobilu přetekla z karty ven. Teď to řekne
  // věta pod souhrnem, kde je na text místo.
  if (celkem) {
    html += '<div class="portfolio-soucet"><span>Celkem</span><strong>'
      + formatCastkaSMenou(celkem, 'CZK') + '</strong></div>';
  }

  // Obě rady dohromady v jedné větě - dvě samostatné odrážky pod sebou
  // vypadaly na mobilu jako chybová hláška.
  const rady = [];
  if (neuvedeno.pocet) rady.push('druh');
  if (!celkem) rady.push('aktuální hodnotu');
  if (rady.length) {
    html += '<p class="popis portfolio-pozn">Doplňte ' + rady.join(' a ')
      + ' v kartě bytu (Upravit)'
      + (neuvedeno.pocet && celkem ? ' u ' + pocetSlovem(neuvedeno.pocet, TVARY_NEMOVITOSTI_U) : '')
      + ' – do té doby souhrn nic nepředstírá.</p>';
  }
  el.innerHTML = html;
}

/*
 * „Vybrané ukazatele" - obsazenost, ROI a nájemné za m².
 *
 * `najemniJednotky` chodí zvenčí (načtou se jedním voláním pro všechna
 * střediska, viz nactiNemovitosti) - obsazenost se počítá z NICH, ne
 * z počtu bytů: byt rozdělený mezi dva nájemníky je jedna nemovitost, ale
 * dvě pronajímané jednotky.
 */
function vykresliUkazatelePortfolia(el, najemniJednotky) {
  const smlouvy = aktivniNajemniSmlouvy();
  const meny = new Set(smlouvy.map((s) => s.Mena || 'CZK'));
  let html = '<h3>Vybrané ukazatele</h3>'
    + '<p class="popis portfolio-podnadpis">z aktivních smluv, nájemních jednotek a ploch</p>';

  const dlazdice = [];

  // Obsazenost. Když nájemní jednotky nejsou založené, appka spočítá
  // obsazenost z bytů se smlouvou - a řekne, že to počítá takhle.
  if (najemniJednotky.length) {
    const obsazene = najemniJednotky.filter((nj) => String(nj.Stav || '').trim() === 'Obsazená').length;
    const procenta = Math.round((obsazene / najemniJednotky.length) * 100);
    dlazdice.push(statDlazdice('jednotky', procenta + ' %', 'Obsazenost',
      [obsazene + ' z ' + najemniJednotky.length + ' pronajato'],
      procenta === 100 ? 'hotovo' : 'ceka'));
  } else {
    const sesmlouvou = new Set(smlouvy.map((s) => s.Stredisko)).size;
    const celkem = nemovitostiJednotkySeznam.length;
    if (celkem) {
      const procenta = Math.round((sesmlouvou / celkem) * 100);
      dlazdice.push(statDlazdice('jednotky', procenta + ' %', 'Obsazenost',
        [sesmlouvou + ' z ' + celkem + ' bytů má smlouvu'], procenta === 100 ? 'hotovo' : 'ceka'));
    }
  }

  // ROI: roční nájem ÷ hodnota. Jen z nemovitostí, které mají obojí -
  // a appka napíše, kolik jich to bylo (pravidlo 2).
  if (meny.size <= 1) {
    const mena = smlouvy.length ? (smlouvy[0].Mena || 'CZK') : 'CZK';
    const strediskaSHodnotou = {};
    nemovitostiJednotkySeznam.forEach((j) => {
      const hodnota = parsujCastkuZListu(j.Aktualni_hodnota) || parsujCastkuZListu(j.Porizovaci_cena);
      if (hodnota > 0) strediskaSHodnotou[j.Stredisko] = hodnota;
    });
    const hodnotaCelkem = Object.values(strediskaSHodnotou).reduce((c, h) => c + h, 0);
    const najemCelkem = smlouvy
      .filter((s) => strediskaSHodnotou[s.Stredisko])
      .reduce((c, s) => c + rocniNajemSmlouvy(s), 0);
    if (hodnotaCelkem > 0 && najemCelkem > 0) {
      const roi = (najemCelkem / hodnotaCelkem) * 100;
      const pocet = Object.keys(strediskaSHodnotou).length;
      dlazdice.push(statDlazdice('roi', roi.toFixed(1).replace('.', ',') + ' %', 'ROI',
        ['hrubý roční výnos',
          'z ' + pocet + ' z ' + nemovitostiJednotkySeznam.length + ' s vyplněnou hodnotou']));
    }
  }

  // Nájemné za m². Plocha se bere z nájemní jednotky, a když ji nemá, z bytu.
  const plochaPodleJednotky = {};
  najemniJednotky.forEach((nj) => {
    const plocha = parsujCastkuZListu(nj.Plocha_m2);
    if (plocha > 0) plochaPodleJednotky[nj.ID] = plocha;
  });
  const plochaPodleStrediska = {};
  nemovitostiJednotkySeznam.forEach((j) => {
    const plocha = parsujCastkuZListu(j.Plocha_m2);
    if (plocha > 0) plochaPodleStrediska[j.Stredisko] = plocha;
  });
  if (meny.size <= 1) {
    const mena = smlouvy.length ? (smlouvy[0].Mena || 'CZK') : 'CZK';
    let najem = 0;
    let plocha = 0;
    let zapocteno = 0;
    smlouvy.forEach((s) => {
      const p = plochaPodleJednotky[s.Najemni_jednotka_ID] || plochaPodleStrediska[s.Stredisko] || 0;
      const mesicni = parsujCastkuZListu(s.Cisty_najem) || parsujCastkuZListu(s.Ocekavana_castka);
      if (p > 0 && mesicni > 0) { najem += mesicni; plocha += p; zapocteno += 1; }
    });
    if (plocha > 0) {
      dlazdice.push(statDlazdice('finance', formatCastkaSMenou(najem / plocha, mena), 'Nájemné / m²',
        ['aktivní pronájmy',
          zapocteno < smlouvy.length ? 'z ' + zapocteno + ' z ' + smlouvy.length + ' smluv' : '']
          .filter(Boolean)));
    }
  }

  if (!dlazdice.length) {
    el.innerHTML = html + '<p class="popis">Appka zatím nemá z čeho počítat – chybí aktivní nájemní '
      + 'smlouvy nebo vyplněné plochy a hodnoty.</p>';
    return;
  }

  html += '<div class="stat-rada">' + dlazdice.join('') + '</div>';
  // Pravidlo 1: víc měn = appka radši neukáže nic, než aby je sečetla.
  if (meny.size > 1) {
    html += '<p class="popis portfolio-pozn">Smlouvy jsou ve více měnách (' + [...meny].join(', ')
      + '), takže ROI ani nájemné za m² appka nepočítá – sečíst korunu s eurem nesmí.</p>';
  }
  el.innerHTML = html;
}

/*
 * „Vyžaduje pozornost" - propadající revize, končící smlouvy a nezaplacené
 * nájmy na jednom místě.
 *
 * Nic z toho není nový výpočet: končící smlouvy umí appka od v4.57 a stav
 * úhrady od v4.37, jen každé na jiné obrazovce.
 */
const PORTFOLIO_REVIZE_DNI = 30;

function vykresliPozornostPortfolia(el, revize) {
  const dnes = new Date().toISOString().slice(0, 10);
  const hranice = new Date(Date.now() + PORTFOLIO_REVIZE_DNI * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const polozky = [];

  const propadle = revize.filter((r) => r.Platnost_do && r.Platnost_do < dnes);
  const konciRevize = revize.filter((r) => r.Platnost_do && r.Platnost_do >= dnes && r.Platnost_do <= hranice);
  const popisRevize = (r) => (r.Stredisko || '?') + ' – ' + (r.Typ_revize || 'revize') + ' do ' + r.Platnost_do;

  if (propadle.length) {
    polozky.push({ ikona: 'zbyva', nadpis: propadle.length + '× revize po platnosti',
      detaily: propadle.map(popisRevize) });
  }
  if (konciRevize.length) {
    polozky.push({ ikona: 'zbyva',
      nadpis: konciRevize.length + '× revize propadá do ' + PORTFOLIO_REVIZE_DNI + ' dnů',
      detaily: konciRevize.map(popisRevize) });
  }

  const smlouvy = aktivniNajemniSmlouvy().filter((s) => s.Platnost_do);
  const konciSmlouvy = smlouvy.filter((s) => s.Platnost_do >= dnes && s.Platnost_do <= hranice);
  if (konciSmlouvy.length) {
    polozky.push({ ikona: 'doklad',
      nadpis: konciSmlouvy.length + '× nájemní smlouva končí do ' + PORTFOLIO_REVIZE_DNI + ' dnů',
      detaily: konciSmlouvy.map((s) => (s.Stredisko || '?') + ' do ' + s.Platnost_do) });
  }

  const nezaplaceno = Object.values(nemovitostiPlatbyMapa)
    .filter((r) => r.stav && r.stav !== 'Zaplaceno');
  if (nezaplaceno.length) {
    polozky.push({ ikona: 'prijem',
      nadpis: nezaplaceno.length + '× nájem za ' + (nemovitostiPlatbyMesic || 'tenhle měsíc')
        + ' není zaplacený',
      detaily: nezaplaceno.map((r) => r.stredisko + ' (' + r.stav + ')') });
  }

  let html = '<h3>Vyžaduje pozornost</h3>';
  if (!polozky.length) {
    html += '<div class="polozka-upozorneni ok">' + ikonaStavuHtml('hotovo')
      + 'Nic nečeká na vyřízení – revize platí, smlouvy běží, nájmy dorazily.</div>';
    el.innerHTML = html;
    return;
  }
  html += polozky.map(radekPozornosti).join('');
  el.innerHTML = html;
}

/*
 * Jeden řádek upozornění (v4.79).
 *
 * Jan 2026-08-21 poslal snímek z mobilu: „11× nájem za 2026-08 není
 * zaplacený" a za tím jedenáct názvů bytů slepených čárkami do jednoho
 * odstavce přes půl obrazovky. Ikona přitom plavala uprostřed toho bloku.
 *
 * Řádek je proto SBALENÝ: vidět je jen věta s počtem, seznam se rozbalí
 * klepnutím. Počet je to podstatné („mám jedenáct nezaplacených nájmů"),
 * jména se hledají až ve chvíli, kdy s tím jde člověk něco dělat.
 *
 * Bez detailů (jeden nález bez jmen) zůstává obyčejný řádek - `<details>`
 * s prázdným obsahem by nabízel rozbalení, po kterém se nic nestane.
 */
function radekPozornosti(p) {
  const detaily = (p.detaily || []).filter(Boolean);
  if (!detaily.length) {
    return '<div class="polozka-upozorneni">' + ikonaStavuHtml(p.ikona)
      + '<span>' + escapeHtml(p.nadpis) + '</span></div>';
  }
  return '<details class="polozka-upozorneni pozornost-skladaci">'
    + '<summary>' + ikonaStavuHtml(p.ikona) + '<span>' + escapeHtml(p.nadpis) + '</span></summary>'
    + '<div class="pozornost-detaily">'
    + detaily.map((d) => '<span>' + escapeHtml(d) + '</span>').join('')
    + '</div></details>';
}

function vykresliPortfolio() {
  const el = document.getElementById('nemovitosti-portfolio');
  if (!el) return;
  el.innerHTML = '<div class="portfolio-mrizka">'
    + '<div class="karta portfolio-karta" id="portfolio-majetek"></div>'
    + '<div class="karta portfolio-karta" id="portfolio-ukazatele"></div>'
    + '<div class="karta portfolio-karta portfolio-siroka" id="portfolio-pozornost"></div>'
    + '</div>';
  vykresliMajetekVKostce(document.getElementById('portfolio-majetek'));
  vykresliUkazatelePortfolia(document.getElementById('portfolio-ukazatele'), nemovitostiNajemniJednotkyVse);
  vykresliPozornostPortfolia(document.getElementById('portfolio-pozornost'), nemovitostiRevizeVse);
}

function vykresliNemovitosti() {
  vykresliPortfolio();
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
/*
 * KARTA BYTU SE ZÁLOŽKAMI (v4.77)
 *
 * Jan 2026-08-21: *„podíváme se na modul nemovitosti, moc se mi nelíbí,
 * udělej návrh jak bude vypadat karta bytu - Byt, nájemní jednotka,
 * finance, hesla apod. v nějakých záložkách, graficky přehledné"*.
 *
 * Do v4.76 měla rozbalená karta šest sekcí pod sebou (základ, smlouva,
 * nájemní jednotky, klíče, kódy, měřidla, revize, vyúčtování) - u bytu se
 * dvěma nájemníky to bylo přes dva tisíce pixelů a člověk hledající číslo
 * klíče scrolloval přes celé vyúčtování.
 *
 * PĚT ZÁLOŽEK, KAŽDÁ JEDNA OTÁZKA
 *
 *   Byt              - „co to je za nemovitost" (katastr, plocha, hodnota)
 *   Nájemní jednotky - „jak je byt rozdělený a kdo v čem bydlí"
 *   Finance          - „kolik to nese a je zaplaceno" (smlouva, vyúčtování)
 *   Klíče a přístupy - „co se předává člověku" (klíče, kódy, WiFi)
 *   Měřidla a revize - „co se odečítá a co propadá"
 *
 * Dělení není podle toho, ze kterého listu data jsou, ale podle otázky, se
 * kterou k bytu člověk přichází. Proto je WiFi heslo u klíčů a kódů (všechno
 * tři se předává nájemníkovi při převzetí), ne u vlastností bytu, a proto
 * jsou měřidla a revize spolu - obojí je „technika s termínem".
 *
 * TŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) OBSAH SE JEN SCHOVÁVÁ, NEZAHAZUJE. Panely jsou v DOMu všechny; přepnutí
 *    záložky je `classList.toggle('skryto')`. Kdyby se překreslovaly, přišel
 *    by člověk při přepnutí o rozepsaný formulář.
 * 2) DATA SE NAČÍTAJÍ AŽ PO ROZBALENÍ KARTY, ne po kliknutí na záložku.
 *    Jeden byt = šest volání API; načítat je po jednom při přepínání by
 *    znamenalo čekat u každé záložky zvlášť.
 * 3) ZÁLOŽKY JSOU <button> S role="tab". Naklikaná <div>ka by vypadala
 *    stejně a nešla ovládat klávesnicí.
 */
const ZALOZKY_JEDNOTKY = [
  { klic: 'byt', popisek: 'Byt', ikona: 'byt' },
  { klic: 'jednotky', popisek: 'Nájemní jednotky', ikona: 'jednotky' },
  { klic: 'finance', popisek: 'Finance', ikona: 'finance' },
  { klic: 'pristupy', popisek: 'Klíče a přístupy', ikona: 'klice' },
  { klic: 'technika', popisek: 'Měřidla a revize', ikona: 'meridlo' },
  // (v4.80) Šestá záložka - „co z toho vytisknu". Jan 2026-08-21:
  // *„taky potřebuju kartu bytu, vypsat na PP, kde je vše důležité"*.
  // Sedí sem, protože dokument se skládá ze VŠECH ostatních záložek
  // dohromady; pod žádnou z nich by nepatřil.
  { klic: 'dokumenty', popisek: 'Dokumenty', ikona: 'dokument' },
];

function vytvorKartuJednotky(j) {
  const detail = document.createElement('details');
  detail.className = 'karta-jednotka';

  const summary = document.createElement('summary');
  detail.appendChild(summary);
  vykresliHlavickuJednotky(summary, j);

  // Pás dlaždic nad záložkami - odpovídá na to, kvůli čemu se karta otevírá
  // nejčastěji. Doplní se po načtení detailů (volné jednotky, revize).
  const pas = document.createElement('div');
  pas.className = 'jednotka-pas';
  detail.appendChild(pas);

  const listaZalozek = document.createElement('div');
  listaZalozek.className = 'zalozky-jednotky';
  listaZalozek.setAttribute('role', 'tablist');
  detail.appendChild(listaZalozek);

  const panely = {};
  const tlacitka = {};
  ZALOZKY_JEDNOTKY.forEach((z, poradi) => {
    const tlacitko = document.createElement('button');
    tlacitko.type = 'button';
    tlacitko.className = 'zalozka-jednotky' + (poradi === 0 ? ' aktivni' : '');
    tlacitko.setAttribute('role', 'tab');
    tlacitko.setAttribute('aria-selected', poradi === 0 ? 'true' : 'false');
    tlacitko.innerHTML = ikonaStavuHtml(z.ikona) + '<span>' + escapeHtml(z.popisek) + '</span>'
      + '<span class="zalozka-pocet skryto"></span>';
    listaZalozek.appendChild(tlacitko);
    tlacitka[z.klic] = tlacitko;

    const panel = document.createElement('div');
    panel.className = 'panel-jednotky' + (poradi === 0 ? '' : ' skryto');
    panel.setAttribute('role', 'tabpanel');
    detail.appendChild(panel);
    panely[z.klic] = panel;

    tlacitko.addEventListener('click', () => {
      ZALOZKY_JEDNOTKY.forEach((jina) => {
        const vybrana = jina.klic === z.klic;
        tlacitka[jina.klic].classList.toggle('aktivni', vybrana);
        tlacitka[jina.klic].setAttribute('aria-selected', vybrana ? 'true' : 'false');
        panely[jina.klic].classList.toggle('skryto', !vybrana);
      });
    });
  });

  // -- Byt: čtecí přehled + formulář na požádání --
  vykresliZakladJednotky(panely.byt, summary, j);

  // -- Finance: nájemní smlouva (rozpad nájmu + kauce) + vyúčtování --
  const sekceSmlouva = document.createElement('div');
  sekceSmlouva.className = 'sekce-jednotky';
  sekceSmlouva.id = 'nem-smlouva-' + j.ID;
  panely.finance.appendChild(sekceSmlouva);
  // Napoprvé bez nájemních jednotek - ty se načítají až s rozbalením karty
  // (nactiDetailyJednotky) a tahle sekce se pak překreslí i s roletkou.
  vykresliSekciSmlouva(sekceSmlouva, j, []);

  const sekceVyuctovani = document.createElement('div');
  sekceVyuctovani.className = 'sekce-jednotky';
  panely.finance.appendChild(sekceVyuctovani);
  vykresliSekciVyuctovani(sekceVyuctovani, j);

  // -- Jednotky / přístupy / technika se načítají až po rozbalení karty --
  ['jednotky', 'pristupy', 'technika'].forEach((klic) => {
    panely[klic].innerHTML = '<p class="popis">Rozbalte kartu – appka data načte…</p>';
  });
  // Dokumenty potřebují úplně stejná data, takže se staví ve stejnou
  // chvíli - tlačítko „Vytisknout protokol" nad nenačtenými měřidly by
  // vytisklo prázdnou tabulku a nikdo by nepoznal proč.
  panely.dokumenty.innerHTML = '<p class="popis">Rozbalte kartu – appka data načte…</p>';

  vykresliPasJednotky(pas, j, null);

  // Odkaz na panely si karta drží na sobě, aby se po uložení klíče/kódu/
  // měřidla dalo překreslit přesně tohle jedno místo (viz obnovDetailySekce).
  const cil = { panely, tlacitka, pas };
  detail._nemCil = cil;

  let detailyNacteny = false;
  detail.addEventListener('toggle', () => {
    if (detail.open && !detailyNacteny) {
      detailyNacteny = true;
      nactiDetailyJednotky(cil, j);
    }
  });

  return detail;
}

/*
 * Pás dlaždic nad záložkami.
 *
 * `nactene` je null, dokud se nenačetly detaily - nájem a kauce appka zná
 * hned ze smluv, volné jednotky a revize až potom. Dlaždice, na kterou
 * appka ještě nemá data, se schválně NEUKAZUJE prázdná ani s nulou: nula
 * u „volných jednotek" by znamenala „všechno je obsazené", což appka v tu
 * chvíli neví.
 */
function vykresliPasJednotky(pas, j, nactene) {
  const smlouvy = najdiNajemniSmlouvy(j);
  const dlazdice = [];

  // Nájem a zálohy - součet jen tehdy, když všechny smlouvy bytu jedou ve
  // stejné měně. Sečíst korunový a eurový nájem se v téhle appce nesmí.
  const meny = new Set(smlouvy.map((s) => s.Mena || 'CZK'));
  if (smlouvy.length && meny.size === 1) {
    const mena = smlouvy[0].Mena || 'CZK';
    const najem = smlouvy.reduce((c, s) => c + parsujCastkuZListu(s.Cisty_najem || s.Ocekavana_castka), 0);
    const zalohy = smlouvy.reduce((c, s) => c + parsujCastkuZListu(s.Zaloha_na_sluzby), 0);
    dlazdice.push(statDlazdice('finance', formatCastkaSMenou(najem, mena), 'Nájem měsíčně',
      zalohy > 0 ? ['+ ' + formatCastkaSMenou(zalohy, mena) + ' zálohy'] : []));

    const kauce = smlouvy.reduce((c, s) => c + parsujCastkuZListu(s.Kauce_castka), 0);
    if (kauce > 0) {
      dlazdice.push(statDlazdice('hotovost', formatCastkaSMenou(kauce, mena), 'Kauce drženy',
        [smlouvy.length + '× nájemník']));
    }
  }

  if (nactene) {
    const volne = (nactene.najemniJednotky || []).filter(
      (nj) => String(nj.Stav || '').trim() === 'Volná').length;
    dlazdice.push(statDlazdice('jednotky', volne, 'Volné jednotky',
      [(nactene.najemniJednotky || []).length + ' celkem'], volne ? 'ceka' : 'hotovo'));

    const revize = nactene.revize || [];
    const dnes = new Date().toISOString().slice(0, 10);
    const platne = revize.filter((r) => r.Platnost_do && r.Platnost_do >= dnes);
    const nejblizsi = platne.map((r) => r.Platnost_do).sort()[0];
    // Prošlá revize je jiná zpráva než „nemáme žádnou" - appka je nemíchá.
    const propadle = revize.filter((r) => r.Platnost_do && r.Platnost_do < dnes).length;
    dlazdice.push(statDlazdice('revize', platne.length + ' z ' + revize.length, 'Revize platné',
      nejblizsi ? ['nejbližší ' + nejblizsi] : [], propadle ? 'ceka' : ''));
  }

  pas.innerHTML = dlazdice.length ? '<div class="stat-rada">' + dlazdice.join('') + '</div>' : '';
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
    ['Druh', j.Druh],
    ['Dispozice', j.Dispozice],
    ['Plocha', j.Plocha_m2 ? j.Plocha_m2 + ' m²' : ''],
    ['Podlaží', j.Podlazi],
    ['Katastrální území', j.Katastralni_uzemi],
    ['Číslo LV', j.Cislo_LV],
    // (v4.80) Údaje, které chce předávací protokol - ať je vidět, že
    // chybí, dřív než se dokument vytiskne s prázdnými řádky.
    ['Číslo jednotky', j.Cislo_jednotky],
    ['V budově č. p.', j.Budova_cp],
    ['Na pozemku p. č.', j.Pozemek_parc_c],
    ['Příslušenství', j.Prislusenstvi],
    // (v4.80) Kam se za byt platí - viz komentář ve formuláři níž.
    ['SVJ', j.SVJ_nazev],
    ['Účet SVJ', j.SVJ_ucet],
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

  if (j.Poznamka) {
    const poznamka = document.createElement('p');
    poznamka.className = 'popis';
    poznamka.style.marginTop = '8px';
    poznamka.textContent = j.Poznamka;
    el.appendChild(poznamka);
  }
}


/*
 * WiFi bytu (v4.57, přesunuto do záložky „Klíče a přístupy" ve v4.77).
 *
 * Heslo se ukazuje čitelně - stejná úvaha jako u přístupových kódů: člověk
 * ho stejně musí přečíst a nadiktovat, takže maskování by přidalo jen
 * klepání navíc. **Nemaskovat.**
 *
 * Proč je WiFi u klíčů a ne u vlastností bytu: síť s heslem se předává
 * nájemníkovi ve stejnou chvíli jako klíče a kód od závory. Kdo připravuje
 * předání bytu, má tím celý seznam na jedné obrazovce.
 */
function vykresliSekciWifi(el, j) {
  if (!j.Wifi_sit && !j.Wifi_heslo) return;
  const sekce = document.createElement('div');
  sekce.className = 'sekce-jednotky';
  const nadpis = document.createElement('h4');
  nadpis.textContent = 'WiFi';
  sekce.appendChild(nadpis);

  const wifi = document.createElement('div');
  wifi.className = 'jednotka-wifi';
  {
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
    sekce.appendChild(wifi);
  }
  el.appendChild(sekce);
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
  // (v4.78) Druh nemovitosti - kvůli souhrnu „Váš majetek v kostce".
  // Roletka, ne volný text: kdyby si každý psal „byt"/„Byt "/„BJ", souhrn
  // by měl čtyři řádky pro totéž.
  {
    const wrapDruh = document.createElement('div');
    const labelDruh = document.createElement('label');
    labelDruh.textContent = 'Druh nemovitosti';
    labelDruh.style.fontSize = '11px';
    const vyberDruh = document.createElement('select');
    vyberDruh.style.fontSize = '13px';
    ['', ...DRUHY_NEMOVITOSTI].forEach((d) => {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = d || '— nevyplněno —';
      if (String(j.Druh || '') === d) o.selected = true;
      vyberDruh.appendChild(o);
    });
    vstupy.Druh = vyberDruh;
    wrapDruh.appendChild(labelDruh);
    wrapDruh.appendChild(vyberDruh);
    mriz.appendChild(wrapDruh);
  }
  pole(mriz, 'Katastralni_uzemi', 'Katastrální území');
  pole(mriz, 'Cislo_LV', 'Číslo LV');
  pole(mriz, 'Plocha_m2', 'Plocha (m²)');
  pole(mriz, 'Dispozice', 'Dispozice');
  pole(mriz, 'Podlazi', 'Podlaží');
  // (v4.80) Katastrální údaje pro předávací protokol a nájemní smlouvu -
  // viz komentář u NEMOVITOSTI_JEDNOTKY_HEADERS. Bez nich zůstávají
  // v protokolu vytečkované řádky.
  pole(mriz, 'Cislo_jednotky', 'Číslo jednotky', 'např. 54/695');
  pole(mriz, 'Budova_cp', 'V budově č. p.', 'např. 695');
  pole(mriz, 'Pozemek_parc_c', 'Na pozemku p. č.', 'např. st. 771');
  el.appendChild(mriz);

  const wrapPrislusenstvi = document.createElement('div');
  pole(wrapPrislusenstvi, 'Prislusenstvi', 'Příslušenství', 'sklep č. 36, parkovací stání č. 23 v 1. PP');
  el.appendChild(wrapPrislusenstvi);

  // (v4.80) Kam se za byt platí. Jan 2026-08-21 poslal účet SVJ. NENÍ to
  // účet do listu Ucty - tam jsou jeho vlastní účty, proti kterým se páruje
  // výpis; tohle je opak (kam on platí). Rozbor i důvod, proč tu nejsou
  // energie, je v lib/nemovitostiJednotkySchema.js.
  const nadpisPlatby = document.createElement('h5');
  nadpisPlatby.textContent = 'Kam se za byt platí';
  nadpisPlatby.style.margin = '14px 0 0';
  nadpisPlatby.style.fontSize = '12px';
  el.appendChild(nadpisPlatby);

  const mrizSVJ = document.createElement('div');
  mrizSVJ.className = 'mriz-2';
  pole(mrizSVJ, 'SVJ_nazev', 'SVJ – název', 'např. Společenství 2236');
  pole(mrizSVJ, 'SVJ_ucet', 'SVJ – účet', '2846678359/0800 nebo IBAN');
  pole(mrizSVJ, 'SVJ_symbol', 'SVJ – variabilní symbol');
  el.appendChild(mrizSVJ);

  const napovedaPlatby = document.createElement('p');
  napovedaPlatby.className = 'popis';
  napovedaPlatby.style.margin = '4px 0 0';
  napovedaPlatby.textContent = 'Účet se ukládá přesně tak, jak ho napíšete – IBAN i tuzemský tvar. '
    + 'Appka ho nepřepočítává, aby tiše nezměnila číslo, podle kterého se posílají peníze. '
    + 'S párováním bankovního výpisu tenhle účet nemá nic společného.';
  el.appendChild(napovedaPlatby);

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

  /*
   * (v4.81) Podklady pro TIŠTĚNOU SMLOUVU.
   *
   * Jan 2026-08-21: *„potřebuji generovat dokumentaci, po vyplnění karty
   * udělat tiskový výstup k podpisu"*. Tohle je to „vyplnění karty" -
   * pole, která zná jen smlouva a bez kterých by v dokumentu zůstala
   * modrá místa k dopsání.
   *
   * Nájemce je ROLETKA do číselníku (Jan si ji vybral proti polím na
   * smlouvě). Text `Druha_strana` se tím NEMĚNÍ - je to klíč, podle
   * kterého appka odjakživa páruje platby; roletka jen doplní, kdo to je,
   * aby se do smlouvy dalo vytisknout IČ a sídlo.
   */
  const mrizSml = document.createElement('div');
  mrizSml.className = 'mriz-2';

  const wrapNajemce = document.createElement('div');
  const labelNajemce = document.createElement('label');
  labelNajemce.textContent = 'Nájemce (číselník)';
  const selectNajemce = document.createElement('select');
  selectNajemce.style.fontSize = '13px';
  selectNajemce.innerHTML = '<option value="">— jen jméno ze smlouvy —</option>';
  wrapNajemce.appendChild(labelNajemce);
  wrapNajemce.appendChild(selectNajemce);
  mrizSml.appendChild(wrapNajemce);
  // Číselník se donačítá; do té doby roletka nabízí jen prázdno, ať se
  // formulář nezasekne na čekání.
  nactiNajemce().then((seznam) => {
    dokumentyNajemciSeznam = seznam;
    selectNajemce.innerHTML = '<option value="">— jen jméno ze smlouvy —</option>'
      + seznam.map((n) => '<option value="' + escapeAttr(n.ID) + '"'
        + (n.ID === smlouva.Najemce_ID ? ' selected' : '') + '>'
        + escapeHtml(n.Nazev || '(bez názvu)') + '</option>').join('');
  });

  // (v4.83) Pronajímatel na SMLOUVĚ. Do v4.82 se vybíral až při tisku
  // a nikde se neuložil - dodatek ale potřebuje vědět, čí účet mění.
  const wrapPronajimatel = document.createElement('div');
  const labelPronajimatel = document.createElement('label');
  labelPronajimatel.textContent = 'Pronajímatel (číselník)';
  const selectPronajimatel = document.createElement('select');
  selectPronajimatel.style.fontSize = '13px';
  selectPronajimatel.innerHTML = '<option value="">— neurčen —</option>';
  wrapPronajimatel.appendChild(labelPronajimatel);
  wrapPronajimatel.appendChild(selectPronajimatel);
  mrizSml.appendChild(wrapPronajimatel);
  nactiPronajimatele().then((seznam) => {
    dokumentyPronajimateleSeznam = seznam;
    selectPronajimatel.innerHTML = '<option value="">— neurčen —</option>'
      + seznam.map((pr) => '<option value="' + escapeAttr(pr.ID) + '"'
        + (pr.ID === smlouva.Pronajimatel_ID ? ' selected' : '') + '>'
        + escapeHtml(pr.Nazev || '(bez názvu)') + '</option>').join('');
  });

  const vstupDatumUzavreni = pole(mrizSml, 'Datum uzavření smlouvy', smlouva.Datum_uzavreni, 'date');
  const vstupInflaceOd = pole(mrizSml, 'Inflační doložka od', smlouva.Inflace_od, 'date');
  const vstupNajemRozpis = pole(mrizSml, 'Rozpis nájmu (volitelně)', smlouva.Najem_rozpis);

  const wrapPausal = document.createElement('div');
  wrapPausal.className = 'pole-zaskrtavatko';
  const vstupPausal = document.createElement('input');
  vstupPausal.type = 'checkbox';
  vstupPausal.checked = String(smlouva.Zalohy_pausalni || '').trim().toUpperCase() === 'ANO';
  const labelPausal = document.createElement('label');
  labelPausal.textContent = 'Zálohy jsou paušál (nevyúčtovává se)';
  wrapPausal.appendChild(vstupPausal);
  wrapPausal.appendChild(labelPausal);
  mrizSml.appendChild(wrapPausal);

  const vstupPocetOsob = pole(mrizSml, 'Přiměřený počet osob', smlouva.Pocet_osob);
  const vstupOsoby = pole(mrizSml, 'Osoby užívající byt', smlouva.Osoby);

  blok.appendChild(mrizSml);

  const napovedaSml = document.createElement('p');
  napovedaSml.className = 'popis';
  napovedaSml.style.margin = '4px 0 0';
  napovedaSml.textContent = 'Tahle pole potřebuje jen tištěná smlouva. Datum uzavření není totéž '
    + 'co začátek nájmu – ve vašich vzorech se podepisovalo i tři měsíce předem. Co zůstane '
    + 'prázdné, appka ve smlouvě nechá jako modré pole k dopsání.';
  blok.appendChild(napovedaSml);

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
      // (v4.81) Podklady pro tištěnou smlouvu.
      Najemce_ID: selectNajemce.value,
      Pronajimatel_ID: selectPronajimatel.value,
      Datum_uzavreni: vstupDatumUzavreni.value,
      Inflace_od: vstupInflaceOd.value,
      Najem_rozpis: vstupNajemRozpis.value.trim(),
      Zalohy_pausalni: vstupPausal.checked ? 'ANO' : '',
      Pocet_osob: vstupPocetOsob.value.trim(),
      Osoby: vstupOsoby.value.trim(),
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

  // (v4.83) Dodatky k téhle smlouvě.
  vykresliSekciDodatky(blok, j, smlouva);

  el.appendChild(blok);
}

/*
 * DODATKY K NÁJEMNÍ SMLOUVĚ (v4.83)
 *
 * Jan 2026-08-21: *„jak udělám dodatek nebo předávací protokol"*.
 *
 * Sedí pod smlouvou, ke které patří - ne ve vlastní záložce. Dodatek bez
 * smlouvy nedává smysl a hledat ho jinde, než kde je smlouva, by znamenalo
 * dvakrát klikat přes celou kartu.
 *
 * TŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) NAČÍTÁ SE AŽ PO ROZBALENÍ. Karta bytu už teď dělá šest volání API;
 *    dodatky ke každé smlouvě navíc by ji zpomalily kvůli věci, kterou Jan
 *    otevře jednou za rok.
 * 2) ULOŽENÍ DODATKU SE SMLOUVOU NEHÝBE. Promítnutí je samostatné tlačítko
 *    s náhledem - Janova volba. Rozepsaný dodatek nesmí tiše přepsat
 *    nájemné, na kterém stojí předpis plateb.
 * 3) NÁHLED UKAZUJE STAV Z TABULKY, ne z doby psaní dodatku. Kdyby se
 *    nájem mezitím změnil jinudy, musí to být vidět.
 */
function vykresliSekciDodatky(rodic, j, smlouva) {
  const box = document.createElement('details');
  box.className = 'panel-skladaci dodatky-box';
  const shrnuti = document.createElement('summary');
  shrnuti.textContent = 'Dodatky k této smlouvě';
  box.appendChild(shrnuti);

  const obsah = document.createElement('div');
  obsah.className = 'dodatky-obsah';
  obsah.innerHTML = '<p class="popis">Rozbalte – appka dodatky načte…</p>';
  box.appendChild(obsah);
  // Odkaz na smlouvu si blok drží na sobě, aby se po uložení dal
  // překreslit přesně tenhle jeden (viz obnovDodatky).
  box._smlouvaId = smlouva.ID;

  let nacteno = false;
  box.addEventListener('toggle', () => {
    if (box.open && !nacteno) {
      nacteno = true;
      nactiDodatky(obsah, j, smlouva);
    }
  });

  rodic.appendChild(box);
}

async function nactiDodatky(el, j, smlouva) {
  el.innerHTML = '<div class="nacitani">Načítám…</div>';
  try {
    const data = await zavolejApi('/dodatky?smlouva_id=' + encodeURIComponent(smlouva.ID), { method: 'GET' });
    vykresliDodatky(el, j, smlouva, data.dodatky || [], data.zmeny || []);
  } catch (e) {
    el.innerHTML = '<div class="zprava chyba">Nepodařilo se načíst dodatky: '
      + escapeHtml(e.message) + '</div>';
  }
}

function vykresliDodatky(el, j, smlouva, dodatky, vsechnyZmeny) {
  el.innerHTML = '';

  const napoveda = document.createElement('p');
  napoveda.className = 'popis';
  napoveda.textContent = 'Dodatek se uloží a vytiskne. Do smlouvy se promítne až tlačítkem '
    + '„Promítnout do smlouvy“ – appka nejdřív ukáže, co se změní.';
  el.appendChild(napoveda);

  dodatky.forEach((d) => {
    const zmenyDodatku = vsechnyZmeny.filter((z) => z.Dodatek_ID === d.ID);
    el.appendChild(vykresliJedenDodatek(j, smlouva, d, zmenyDodatku));
  });

  if (!dodatky.length) {
    const prazdno = document.createElement('p');
    prazdno.className = 'popis';
    prazdno.textContent = 'Zatím žádný dodatek.';
    el.appendChild(prazdno);
  }

  // -- přidání dodatku --
  const pridat = document.createElement('div');
  pridat.className = 'mriz-2';
  pridat.style.marginTop = '10px';
  const nCislo = document.createElement('input'); nCislo.type = 'text'; nCislo.placeholder = 'Číslo dodatku (např. 2)'; nCislo.style.fontSize = '13px';
  const nUcinnost = document.createElement('input'); nUcinnost.type = 'date'; nUcinnost.style.fontSize = '13px';
  const nPredmet = document.createElement('input'); nPredmet.type = 'text'; nPredmet.placeholder = 'Čeho se dodatek týká'; nPredmet.style.fontSize = '13px';
  [['Číslo dodatku', nCislo], ['Účinnost od', nUcinnost], ['Předmět', nPredmet]].forEach(([popisek, vstup]) => {
    const w = document.createElement('div');
    const l = document.createElement('label');
    l.textContent = popisek;
    w.appendChild(l); w.appendChild(vstup);
    pridat.appendChild(w);
  });
  el.appendChild(pridat);

  const btnPridat = document.createElement('button');
  btnPridat.className = 'maly sekundarni';
  btnPridat.style.marginTop = '8px';
  btnPridat.textContent = 'Přidat dodatek';
  btnPridat.onclick = async () => {
    if (!nCislo.value.trim()) { alert('Zadejte číslo dodatku.'); return; }
    btnPridat.disabled = true;
    try {
      await zavolejApi('/dodatky?entita=dodatky', {
        method: 'POST',
        body: JSON.stringify({
          Smlouva_ID: smlouva.ID, Cislo_dodatku: nCislo.value.trim(),
          Ucinnost_od: nUcinnost.value, Predmet: nPredmet.value.trim(), Stav: 'Návrh',
        }),
      });
      await nactiDodatky(el, j, smlouva);
    } catch (e) {
      alert('Nepodařilo se přidat dodatek: ' + e.message);
      btnPridat.disabled = false;
    }
  };
  el.appendChild(btnPridat);
}

function vykresliJedenDodatek(j, smlouva, d, zmeny) {
  const box = document.createElement('div');
  box.className = 'dodatek-radek';

  const hlava = document.createElement('div');
  hlava.className = 'dodatek-hlava';
  hlava.innerHTML = '<strong>Dodatek č. ' + escapeHtml(d.Cislo_dodatku || '?') + '</strong>'
    + '<span class="jednotka-prehled-popisek">'
    + escapeHtml([d.Ucinnost_od ? 'od ' + d.Ucinnost_od : '', d.Stav || 'Návrh']
      .filter(Boolean).join(' · ')) + '</span>';
  box.appendChild(hlava);

  if (d.Predmet) {
    const predmet = document.createElement('p');
    predmet.className = 'popis';
    predmet.style.margin = '2px 0 6px';
    predmet.textContent = d.Predmet;
    box.appendChild(predmet);
  }

  // Seznam změn.
  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Co se mění</th><th>Nově</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');
  zmeny.forEach((z) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Co se mění">' + escapeHtml(popisPoleDodatku(z.Cil, z.Pole))
      + (z.Cil === 'Pronajimatel' ? ' <span class="jednotka-prehled-popisek">(u pronajímatele)</span>' : '')
      + '</td><td data-label="Nově">' + escapeHtml(z.Nova_hodnota || '') + '</td>'
      + '<td data-label="Akce"></td>';
    const btnS = document.createElement('button');
    btnS.className = 'maly sekundarni akce-smazat';
    btnS.textContent = 'Smazat';
    btnS.onclick = () => smazPolozkuDodatku('zmeny', z.ID, j, smlouva, btnS);
    tr.children[2].appendChild(btnS);
    telo.appendChild(tr);
  });
  if (!zmeny.length) {
    telo.innerHTML = '<tr><td colspan="3" class="nacitani">Dodatek zatím nemění žádné pole.</td></tr>';
  }
  tabulka.appendChild(telo);
  box.appendChild(tabulka);

  // -- přidání změny --
  const pridatZmenu = document.createElement('div');
  pridatZmenu.style.marginTop = '6px';
  const vyberPole = document.createElement('select');
  vyberPole.style.fontSize = '13px';
  vyberPole.innerHTML = POLE_DODATKU_SMLOUVA.map((p) =>
    '<option value="Smlouva|' + escapeAttr(p.pole) + '">' + escapeHtml(p.popis) + '</option>').join('')
    + POLE_DODATKU_PRONAJIMATEL.map((p) =>
      '<option value="Pronajimatel|' + escapeAttr(p.pole) + '">' + escapeHtml(p.popis) + '</option>').join('');
  const vstupHodnota = document.createElement('input');
  vstupHodnota.type = 'text'; vstupHodnota.placeholder = 'Nová hodnota'; vstupHodnota.style.fontSize = '13px';
  const btnZmena = document.createElement('button');
  btnZmena.className = 'maly sekundarni';
  btnZmena.textContent = 'Přidat změnu';
  btnZmena.onclick = async () => {
    if (!vstupHodnota.value.trim()) { alert('Zadejte novou hodnotu.'); return; }
    const [cil, pole] = vyberPole.value.split('|');
    btnZmena.disabled = true;
    try {
      await zavolejApi('/dodatky?entita=zmeny', {
        method: 'POST',
        body: JSON.stringify({ Dodatek_ID: d.ID, Cil: cil, Pole: pole, Nova_hodnota: vstupHodnota.value.trim() }),
      });
      await obnovDodatky(j, smlouva);
    } catch (e) {
      alert('Nepodařilo se přidat změnu: ' + e.message);
      btnZmena.disabled = false;
    }
  };
  pridatZmenu.appendChild(vyberPole);
  pridatZmenu.appendChild(vstupHodnota);
  pridatZmenu.appendChild(btnZmena);
  box.appendChild(pridatZmenu);

  // -- akce --
  const akce = document.createElement('div');
  akce.style.marginTop = '8px';

  const btnTisk = document.createElement('button');
  btnTisk.className = 'maly sekundarni';
  btnTisk.textContent = 'Tisk dodatku';
  btnTisk.onclick = () => otevriDodatek(j, smlouva, d, zmeny);
  akce.appendChild(btnTisk);

  const btnPromitnout = document.createElement('button');
  btnPromitnout.className = 'maly sekundarni';
  btnPromitnout.style.marginLeft = '6px';
  btnPromitnout.textContent = 'Promítnout do smlouvy';
  btnPromitnout.disabled = !zmeny.length;
  btnPromitnout.onclick = () => nahledPromitnuti(d, vysledek, j, smlouva);
  akce.appendChild(btnPromitnout);

  const btnSmazat = document.createElement('button');
  btnSmazat.className = 'maly sekundarni akce-smazat';
  btnSmazat.style.marginLeft = '6px';
  btnSmazat.textContent = 'Smazat dodatek';
  btnSmazat.onclick = () => smazPolozkuDodatku('dodatky', d.ID, j, smlouva, btnSmazat);
  akce.appendChild(btnSmazat);

  box.appendChild(akce);

  const vysledek = document.createElement('div');
  vysledek.style.marginTop = '8px';
  box.appendChild(vysledek);

  return box;
}

/*
 * Kopie číselníků z lib/dodatkySchema.js - prohlížeč nemá `require`,
 * stejná konvence jako u MOZNOSTI_TYP_MERIDLA a spol. **Musí zůstat
 * synchronní se serverem**; endpoint navíc cokoli mimo tenhle seznam
 * odmítne, takže rozchod se projeví chybou, ne tichým zápisem.
 */
const POLE_DODATKU_SMLOUVA = [
  { pole: 'Cisty_najem', popis: 'Nájemné' },
  { pole: 'Zaloha_na_sluzby', popis: 'Zálohy na služby' },
  { pole: 'Kauce_castka', popis: 'Jistota (kauce)' },
  { pole: 'Platnost_do', popis: 'Konec nájmu' },
  { pole: 'Platnost_od', popis: 'Začátek nájmu' },
  { pole: 'Variabilni_symbol', popis: 'Variabilní symbol' },
  { pole: 'Den_splatnosti', popis: 'Den splatnosti' },
  { pole: 'Inflace_od', popis: 'Inflační doložka od' },
];
const POLE_DODATKU_PRONAJIMATEL = [
  { pole: 'Bankovni_ucet', popis: 'Bankovní účet pronajímatele' },
  { pole: 'Sidlo', popis: 'Sídlo pronajímatele' },
  { pole: 'Zastoupena', popis: 'Kdo za společnost jedná' },
];

function popisPoleDodatku(cil, pole) {
  const seznam = cil === 'Pronajimatel' ? POLE_DODATKU_PRONAJIMATEL : POLE_DODATKU_SMLOUVA;
  const nalezene = seznam.find((p) => p.pole === pole);
  return nalezene ? nalezene.popis : pole;
}

/*
 * Tisk dodatku. Strany se berou z číselníků podle toho, co je na smlouvě -
 * u dodatku se pronajímatel nevybírá roletkou jako u smlouvy: dodatek mění
 * konkrétní smluvní vztah, ne libovolný.
 */
function otevriDodatek(j, smlouva, dodatek, zmeny) {
  const pronajimatel = (dokumentyPronajimateleSeznam || [])
    .find((p) => p.ID === smlouva.Pronajimatel_ID)
    || vychoziPronajimatel(dokumentyPronajimateleSeznam, j);
  const ctx = {
    jednotka: j,
    smlouva,
    dodatek,
    // Do dokumentu jdou i STARÉ hodnoty - appka je zná ze smlouvy, tak je
    // vypíše vedle nových. Pro toho, kdo dodatek za rok čte, je to ten
    // podstatný rozdíl.
    zmenyDodatku: (zmeny || []).map((z) => Object.assign({}, z, {
      popis: popisPoleDodatku(z.Cil, z.Pole),
      stara: z.Cil === 'Pronajimatel'
        ? (pronajimatel ? pronajimatel[z.Pole] : '')
        : smlouva[z.Pole],
      nova: z.Nova_hodnota,
    })),
    pronajimatel,
    najemce: najemceSmlouvy(dokumentyNajemciSeznam, smlouva),
  };
  otevriDokument('Dodatek č. ' + (dodatek.Cislo_dodatku || '?') + ' – ' + (j.Nazev || j.Stredisko),
    dokumentDodatek(ctx), dokumentyDodatekChybejici(ctx));
}

/*
 * Náhled promítnutí. Nic nezapisuje - zápis je až druhé tlačítko, které
 * appka vykreslí teprve pod výsledkem náhledu.
 */
async function nahledPromitnuti(dodatek, cil, j, smlouva) {
  cil.innerHTML = '<div class="nacitani">Počítám…</div>';
  try {
    const data = await zavolejApi('/dodatky?akce=nahled&dodatek_id=' + encodeURIComponent(dodatek.ID),
      { method: 'GET' });
    cil.innerHTML = vypisPromitnuti(data);
    const btn = cil.querySelector('.dodatek-potvrdit');
    if (btn) btn.addEventListener('click', () => provedPromitnuti(dodatek, cil, j, smlouva));
  } catch (e) {
    cil.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

async function provedPromitnuti(dodatek, cil, j, smlouva) {
  cil.innerHTML = '<div class="nacitani">Zapisuji…</div>';
  try {
    const data = await zavolejApi('/dodatky', {
      method: 'POST', body: JSON.stringify({ akce: 'promitnout', dodatek_id: dodatek.ID }),
    });
    cil.innerHTML = vypisPromitnuti(data);
    // Smlouva v paměti se srovná s tabulkou - bez toho by karta ukazovala
    // staré nájemné, dokud se stránka nenačte znovu.
    (data.kroky || []).forEach((k) => {
      if (k.cil !== 'Pronajimatel' && !k.preskoceno) smlouva[k.pole] = k.nova;
    });
    if (typeof zapomenPronajimatele === 'function') zapomenPronajimatele();
    await obnovDodatky(j, smlouva);
  } catch (e) {
    cil.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
}

function vypisPromitnuti(data) {
  const kroky = data.kroky || [];
  if (!kroky.length) return '<p class="popis">Dodatek nemění žádné pole.</p>';

  let html = data.zapsano
    ? '<p class="zprava uspech">Promítnuto do smlouvy.</p>'
    : '<p class="popis">Tohle se stane, až to potvrdíte:</p>';

  html += '<div class="servis-nalezy">';
  kroky.forEach((k) => {
    html += '<div class="servis-nalez"><strong>' + escapeHtml(k.popis) + '</strong>';
    if (k.preskoceno) {
      html += '<div class="servis-sloupce">Přeskočeno – ' + escapeHtml(k.preskoceno) + '</div>';
    } else if (k.beze_zmeny) {
      html += '<div class="servis-sloupce">Beze změny – v tabulce už to tak je.</div>';
    } else {
      html += '<div class="servis-sloupce">'
        + (String(k.stara || '').trim() ? escapeHtml(k.stara) : '(prázdné)')
        + ' → <strong>' + escapeHtml(k.nova) + '</strong></div>';
      if (k.cil === 'Pronajimatel') {
        html += '<div class="servis-sloupce">⚠ ' + escapeHtml(k.dopad) + '</div>';
      }
    }
    html += '</div>';
  });
  html += '</div>';

  if (!data.zapsano && kroky.some((k) => !k.preskoceno && !k.beze_zmeny)) {
    html += '<button type="button" class="dodatek-potvrdit" style="margin-top:8px">Potvrdit a zapsat</button>';
  }
  return html;
}

async function smazPolozkuDodatku(entita, id, j, smlouva, tlacitko) {
  const otazka = entita === 'dodatky'
    ? 'Opravdu smazat celý dodatek i jeho změny? Co už se promítlo do smlouvy, tím zpátky nevrátíte.'
    : 'Opravdu smazat tuhle změnu?';
  if (!confirm(otazka)) return;
  tlacitko.disabled = true;
  try {
    await zavolejApi('/dodatky?entita=' + entita + '&id=' + encodeURIComponent(id), { method: 'DELETE' });
    await obnovDodatky(j, smlouva);
  } catch (e) {
    alert('Nepodařilo se smazat: ' + e.message);
    tlacitko.disabled = false;
  }
}

/*
 * Překreslí jen blok dodatků té jedné smlouvy - ne celou kartu. Stejný
 * důvod jako u obnovDetailySekce: překreslením karty by se sbalila
 * a člověk by ztratil místo, kde pracoval.
 */
function obnovDodatky(j, smlouva) {
  const boxy = document.querySelectorAll('.dodatky-box');
  for (let i = 0; i < boxy.length; i += 1) {
    if (boxy[i]._smlouvaId === smlouva.ID) {
      return nactiDodatky(boxy[i].querySelector('.dodatky-obsah'), j, smlouva);
    }
  }
  return Promise.resolve();
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
    + '<th>Dispozice</th><th>Podlaží</th><th>Plocha (m²)</th><th>Podíl</th><th>Vybavení</th>'
    + '<th>WiFi síť</th><th>WiFi heslo</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');

  // Podíly se počítají jednou pro celý byt, ať se u každého řádku neopakuje
  // stejný výpočet. `null` = některé jednotce chybí plocha.
  const podily = spocitejPodilyProZobrazeni(jednotky);

  jednotky.forEach((n) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Kód"></td><td data-label="Název"></td><td data-label="Stav"></td>'
      + '<td data-label="Nájemník"></td><td data-label="Dispozice"></td><td data-label="Podlaží"></td>'
      + '<td data-label="Plocha (m²)"></td><td data-label="Podíl"></td><td data-label="Vybavení"></td>'
      + '<td data-label="WiFi síť"></td><td data-label="WiFi heslo"></td><td data-label="Akce"></td>';

    const vKod = document.createElement('input'); vKod.type = 'text'; vKod.value = n.Kod || ''; vKod.style.fontSize = '13px'; vKod.style.width = '80px';
    const vNazev = document.createElement('input'); vNazev.type = 'text'; vNazev.value = n.Nazev || ''; vNazev.style.fontSize = '13px';
    const vStav = document.createElement('select'); vStav.style.fontSize = '13px';
    vStav.innerHTML = MOZNOSTI_STAV_JEDNOTKY.map((s) =>
      '<option value="' + escapeAttr(s) + '"' + (s === n.Stav ? ' selected' : '') + '>' + escapeHtml(s) + '</option>').join('');
    const vDispozice = document.createElement('input'); vDispozice.type = 'text'; vDispozice.value = n.Dispozice || ''; vDispozice.style.fontSize = '13px'; vDispozice.style.width = '80px';
    const vPodlazi = document.createElement('input'); vPodlazi.type = 'text'; vPodlazi.value = n.Podlazi || ''; vPodlazi.style.fontSize = '13px'; vPodlazi.style.width = '80px';
    const vPlocha = document.createElement('input'); vPlocha.type = 'text'; vPlocha.value = n.Plocha_m2 || ''; vPlocha.style.fontSize = '13px'; vPlocha.style.width = '70px';
    const vVybaveni = document.createElement('input'); vVybaveni.type = 'text'; vVybaveni.value = n.Vybaveni || ''; vVybaveni.style.fontSize = '13px';
    // (v4.82) WiFi na NÁJEMNÍ JEDNOTCE. Jan 2026-08-21 poslal svoje sítě -
    // Holečkova 1a a 1b mají každá vlastní. Do v4.81 vedla appka WiFi jen
    // na bytu a protokol pro 1a tiskl heslo od 1b. Rozbor je v hlavičce
    // lib/nemovitostiDetailySchema.js.
    const vWifiSit = document.createElement('input'); vWifiSit.type = 'text'; vWifiSit.value = n.Wifi_sit || ''; vWifiSit.style.fontSize = '13px'; vWifiSit.style.width = '110px';
    const vWifiHeslo = document.createElement('input'); vWifiHeslo.type = 'text'; vWifiHeslo.value = n.Wifi_heslo || ''; vWifiHeslo.style.fontSize = '13px'; vWifiHeslo.style.width = '110px';

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
    tr.children[9].appendChild(vWifiSit);
    tr.children[10].appendChild(vWifiHeslo);

    const btnUlozit = document.createElement('button');
    btnUlozit.className = 'maly sekundarni';
    btnUlozit.textContent = 'Uložit';
    btnUlozit.onclick = () => ulozDetailPolozku('najemni_jednotky', n.ID, {
      Kod: vKod.value.trim(), Nazev: vNazev.value.trim(), Stav: vStav.value,
      Dispozice: vDispozice.value.trim(), Podlazi: vPodlazi.value.trim(),
      Plocha_m2: vPlocha.value.trim(), Vybaveni: vVybaveni.value.trim(),
      Wifi_sit: vWifiSit.value.trim(), Wifi_heslo: vWifiHeslo.value.trim(),
    }, btnUlozit, j);
    tr.children[11].appendChild(btnUlozit);

    const btnSmazat = document.createElement('button');
    btnSmazat.className = 'maly sekundarni akce-smazat';
    btnSmazat.style.marginLeft = '6px';
    btnSmazat.textContent = 'Smazat';
    btnSmazat.onclick = () => smazDetailPolozku('najemni_jednotky', n.ID, j, btnSmazat);
    tr.children[11].appendChild(btnSmazat);

    telo.appendChild(tr);
  });

  if (jednotky.length === 0) {
    telo.innerHTML = '<tr><td colspan="12" class="nacitani">Byt zatím není rozdělený – '
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

/*
 * (v4.77) Načte detaily bytu a rozdělí je do panelů záložek.
 *
 * `cil` je objekt { panely, tlacitka, pas } z vytvorKartuJednotky - jedno
 * volání API naplní tři panely naráz. Kdyby se data načítala až při
 * kliknutí na záložku, čekalo by se u každé zvlášť; jeden byt je šest
 * volání a to je zbytečné dělit.
 */
async function nactiDetailyJednotky(cil, j) {
  const panely = cil.panely;
  const tlacitka = cil.tlacitka || {};
  ['jednotky', 'pristupy', 'technika', 'dokumenty'].forEach((klic) => {
    panely[klic].innerHTML = '<div class="nacitani">Načítám…</div>';
  });
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

    const najemniJednotky = dataNajemni.polozky || [];
    const klice = dataKlice.polozky || [];
    const kody = dataKody.polozky || [];
    const revize = dataRevize.polozky || [];

    panely.jednotky.innerHTML = '';
    vykresliSekciNajemniJednotky(panely.jednotky, j, najemniJednotky, najdiNajemniSmlouvy(j));

    // Sekce se smlouvami se překreslí až tady, protože teprve teď appka
    // zná nájemní jednotky pro roletku „Nájemní jednotka".
    const sekceSmlouva = document.getElementById('nem-smlouva-' + j.ID);
    if (sekceSmlouva) vykresliSekciSmlouva(sekceSmlouva, j, najemniJednotky);

    // Klíče, kódy a WiFi jsou v jednom panelu schválně: všechno tři se
    // předává nájemníkovi při převzetí bytu, takže se to čte pohromadě.
    panely.pristupy.innerHTML = '';
    vykresliSekciWifi(panely.pristupy, j);
    vykresliSekciKlice(panely.pristupy, j, klice, najemniJednotky);
    vykresliSekciKody(panely.pristupy, j, kody);

    panely.technika.innerHTML = '';
    vykresliSekciMeridla(panely.technika, j, meridla, odecty);
    vykresliSekciRevize(panely.technika, j, revize);

    // (v4.80) Dokumenty se skládají ze všeho, co se právě načetlo.
    panely.dokumenty.innerHTML = '';
    vykresliSekciDokumenty(panely.dokumenty, j, {
      klice, kody, meridla, odecty, revize, najemniJednotky,
      smlouvy: najdiNajemniSmlouvy(j),
    });

    // Počty na záložkách - kolik toho pod nimi je, bez rozkliknutí.
    nastavPocetZalozky(tlacitka.jednotky, najemniJednotky.length);
    nastavPocetZalozky(tlacitka.pristupy, klice.length + kody.length);
    nastavPocetZalozky(tlacitka.technika, meridla.length + revize.length);

    if (cil.pas) vykresliPasJednotky(cil.pas, j, { najemniJednotky, revize });
  } catch (e) {
    const hlaska = '<div class="zprava chyba">Nepodařilo se načíst detaily: '
      + escapeHtml(e.message) + '</div>';
    ['jednotky', 'pristupy', 'technika', 'dokumenty'].forEach((klic) => { panely[klic].innerHTML = hlaska; });
  }
}

// Číslo na záložce. Nula se NEUKAZUJE - prázdný odznak je čitelnější než
// „0" a nulu si člověk stejně přečte z prázdného panelu.
function nastavPocetZalozky(tlacitko, pocet) {
  if (!tlacitko) return;
  const odznak = tlacitko.querySelector('.zalozka-pocet');
  if (!odznak) return;
  odznak.textContent = pocet ? String(pocet) : '';
  odznak.classList.toggle('skryto', !pocet);
}

function obnovDetailySekce(j) {
  // Po uložení klíče/kódu/měřidla se překreslí jen panely téhle karty.
  // Karta si na sebe drží odkaz v `_nemCil` (viz vytvorKartuJednotky).
  const karta = document.getElementById('nem-smlouva-' + j.ID);
  const cil = karta && karta.closest('.karta-jednotka') && karta.closest('.karta-jednotka')._nemCil;
  if (cil) return nactiDetailyJednotky(cil, j);
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

/*
 * (v4.82) Klíče se přiřazují k NÁJEMNÍ JEDNOTCE.
 *
 * Jan 2026-08-21: *„klíče i wifi musí být samostatně k nájemní jednotce"*.
 * Roletka se ukáže jen u bytu, který na jednotky rozdělený je - u bytu bez
 * nich by to byla prázdná nabídka, přesně jako u smluv (viz
 * vykresliJednuSmlouvu).
 *
 * Volba „společný pro celý byt" NENÍ „nevyplněno". Klíč od vchodu do domu
 * je opravdu společný a v protokolu patří oběma nájemníkům.
 */
function vykresliSekciKlice(el, j, klice, najemniJednotky) {
  const jednotky = najemniJednotky || [];
  const wrap = document.createElement('div');
  wrap.innerHTML = '<h4>Klíče</h4>';

  const popisJednotky = (n) => (n.Nazev || n.Kod || '(bez názvu)');
  function roletkaJednotky(vybrane) {
    const sel = document.createElement('select');
    sel.style.fontSize = '13px';
    sel.innerHTML = '<option value="">— společný pro celý byt —</option>'
      + jednotky.map((n) => '<option value="' + escapeAttr(n.ID) + '"'
        + (n.ID === vybrane ? ' selected' : '') + '>' + escapeHtml(popisJednotky(n))
        + '</option>').join('');
    return sel;
  }

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Typ</th>'
    + (jednotky.length ? '<th>Jednotka</th>' : '')
    + '<th>Počet celkem</th><th>Držitel</th><th>Vydáno</th>'
    + '<th>Vráceno</th><th>Poznámka</th><th>Akce</th></tr></thead>';
  const telo = document.createElement('tbody');

  klice.forEach((k) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Typ"></td>'
      + (jednotky.length ? '<td data-label="Jednotka"></td>' : '')
      + '<td data-label="Počet celkem"></td><td data-label="Držitel"></td>'
      + '<td data-label="Vydáno"></td><td data-label="Vráceno"></td><td data-label="Poznámka"></td><td data-label="Akce"></td>';

    const vTyp = document.createElement('input'); vTyp.type = 'text'; vTyp.value = k.Typ_klice || ''; vTyp.style.fontSize = '13px';
    const vPocet = document.createElement('input'); vPocet.type = 'text'; vPocet.value = k.Pocet_celkem || ''; vPocet.style.fontSize = '13px'; vPocet.style.width = '60px';
    const vDrzitel = document.createElement('input'); vDrzitel.type = 'text'; vDrzitel.value = k.Drzitel || ''; vDrzitel.style.fontSize = '13px';
    const vVydano = document.createElement('input'); vVydano.type = 'date'; vVydano.value = k.Datum_vydani || ''; vVydano.style.fontSize = '13px';
    const vVraceno = document.createElement('input'); vVraceno.type = 'date'; vVraceno.value = k.Datum_vraceni || ''; vVraceno.style.fontSize = '13px';
    const vPoznamka = document.createElement('input'); vPoznamka.type = 'text'; vPoznamka.value = k.Poznamka || ''; vPoznamka.style.fontSize = '13px';
    let i = 0;
    tr.children[i++].appendChild(vTyp);
    let vJednotka = null;
    if (jednotky.length) {
      vJednotka = roletkaJednotky(k.Najemni_jednotka_ID);
      tr.children[i++].appendChild(vJednotka);
    }
    tr.children[i++].appendChild(vPocet); tr.children[i++].appendChild(vDrzitel);
    tr.children[i++].appendChild(vVydano); tr.children[i++].appendChild(vVraceno);
    tr.children[i++].appendChild(vPoznamka);
    const bunkaAkce = tr.children[i];

    const btnUlozit = document.createElement('button');
    btnUlozit.className = 'maly sekundarni';
    btnUlozit.textContent = 'Uložit';
    btnUlozit.onclick = () => {
      const zmeny = {
        Typ_klice: vTyp.value.trim(), Pocet_celkem: vPocet.value.trim(), Drzitel: vDrzitel.value.trim(),
        Datum_vydani: vVydano.value, Datum_vraceni: vVraceno.value, Poznamka: vPoznamka.value.trim(),
      };
      if (vJednotka) zmeny.Najemni_jednotka_ID = vJednotka.value;
      ulozDetailPolozku('klice', k.ID, zmeny, btnUlozit, j);
    };
    bunkaAkce.appendChild(btnUlozit);

    const btnSmazat = document.createElement('button');
    btnSmazat.className = 'maly sekundarni akce-smazat';
    btnSmazat.style.marginLeft = '6px';
    btnSmazat.textContent = 'Smazat';
    btnSmazat.onclick = () => smazDetailPolozku('klice', k.ID, j, btnSmazat);
    bunkaAkce.appendChild(btnSmazat);

    telo.appendChild(tr);
  });
  if (klice.length === 0) {
    telo.innerHTML = '<tr><td colspan="' + (jednotky.length ? 8 : 7)
      + '" class="nacitani">Zatím žádné klíče.</td></tr>';
  }
  tabulka.appendChild(telo);
  wrap.appendChild(tabulka);

  const pridatWrap = document.createElement('div');
  pridatWrap.style.marginTop = '8px';
  const nTyp = document.createElement('input'); nTyp.type = 'text'; nTyp.placeholder = 'Typ (Byt/Vchod/Sklep/…)'; nTyp.style.fontSize = '13px';
  const nPocet = document.createElement('input'); nPocet.type = 'text'; nPocet.placeholder = 'Počet celkem'; nPocet.style.fontSize = '13px'; nPocet.style.width = '90px';
  const nDrzitel = document.createElement('input'); nDrzitel.type = 'text'; nDrzitel.placeholder = 'Držitel'; nDrzitel.style.fontSize = '13px';
  const nJednotka = jednotky.length ? roletkaJednotky('') : null;
  const btnPridat = document.createElement('button');
  btnPridat.className = 'maly sekundarni';
  btnPridat.textContent = 'Přidat klíč';
  btnPridat.onclick = async () => {
    if (!nTyp.value.trim()) { alert('Zadejte typ klíče.'); return; }
    btnPridat.disabled = true;
    try {
      const telo = {
        Stredisko: j.Stredisko, Typ_klice: nTyp.value.trim(),
        Pocet_celkem: nPocet.value.trim(), Drzitel: nDrzitel.value.trim(),
      };
      if (nJednotka) telo.Najemni_jednotka_ID = nJednotka.value;
      await zavolejApi('/nemovitosti-detaily?entita=klice', {
        method: 'POST', body: JSON.stringify(telo),
      });
      await obnovDetailySekce(j);
    } catch (e) {
      alert('Nepodařilo se přidat klíč: ' + e.message);
      btnPridat.disabled = false;
    }
  };
  pridatWrap.appendChild(nTyp);
  if (nJednotka) pridatWrap.appendChild(nJednotka);
  pridatWrap.appendChild(nPocet); pridatWrap.appendChild(nDrzitel); pridatWrap.appendChild(btnPridat);
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
    // (v4.80) Popis a Jednotka - kvůli předávacímu protokolu. Dva vodoměry
    // se od sebe liší jen tím, co kterým teče („teplá"/„studená"), a bez
    // jednotky by se do protokolu tisklo holé číslo. Proč se jednotka
    // neodvozuje z typu, je v hlavičce lib/nemovitostiDetailySchema.js.
    const vPopis = document.createElement('input'); vPopis.type = 'text'; vPopis.value = m.Popis || ''; vPopis.placeholder = 'Popis (teplá/studená…)'; vPopis.style.fontSize = '13px';
    const vVyrobni = document.createElement('input'); vVyrobni.type = 'text'; vVyrobni.value = m.Vyrobni_cislo || ''; vVyrobni.placeholder = 'Výrobní číslo'; vVyrobni.style.fontSize = '13px';
    const vEan = document.createElement('input'); vEan.type = 'text'; vEan.value = m.EAN_EIC || ''; vEan.placeholder = 'EAN/EIC'; vEan.style.fontSize = '13px';
    const vJednotka = document.createElement('input'); vJednotka.type = 'text'; vJednotka.value = m.Jednotka || ''; vJednotka.placeholder = 'kWh / m³ / GJ'; vJednotka.style.fontSize = '13px'; vJednotka.style.width = '90px';
    const btnUlozitMeridlo = document.createElement('button');
    btnUlozitMeridlo.className = 'maly sekundarni';
    btnUlozitMeridlo.textContent = 'Uložit';
    btnUlozitMeridlo.onclick = () => ulozDetailPolozku('meridla', m.ID,
      { Typ: vTyp.value, Popis: vPopis.value.trim(), Vyrobni_cislo: vVyrobni.value.trim(),
        EAN_EIC: vEan.value.trim(), Jednotka: vJednotka.value.trim() }, btnUlozitMeridlo, j);
    const btnSmazatMeridlo = document.createElement('button');
    btnSmazatMeridlo.className = 'maly sekundarni akce-smazat';
    btnSmazatMeridlo.style.marginLeft = '6px';
    btnSmazatMeridlo.textContent = 'Smazat měřidlo';
    btnSmazatMeridlo.onclick = () => smazDetailPolozku('meridla', m.ID, j, btnSmazatMeridlo);
    radek.appendChild(vTyp); radek.appendChild(vPopis); radek.appendChild(vVyrobni);
    radek.appendChild(vEan); radek.appendChild(vJednotka);
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
  const nPopis = document.createElement('input'); nPopis.type = 'text'; nPopis.placeholder = 'Popis (teplá/studená…)'; nPopis.style.fontSize = '13px';
  const nVyrobni = document.createElement('input'); nVyrobni.type = 'text'; nVyrobni.placeholder = 'Výrobní číslo'; nVyrobni.style.fontSize = '13px';
  const nEan = document.createElement('input'); nEan.type = 'text'; nEan.placeholder = 'EAN/EIC'; nEan.style.fontSize = '13px';
  const nJednotka = document.createElement('input'); nJednotka.type = 'text'; nJednotka.placeholder = 'kWh / m³ / GJ'; nJednotka.style.fontSize = '13px'; nJednotka.style.width = '90px';
  // (v4.80) Jednotku appka NAVRHNE podle typu, ale jen dokud do ní člověk
  // sám nesáhl - u tepla nenavrhuje nic (kalorimetr měří v GJ i v kWh).
  // Přepsat rozepsanou hodnotu při přepnutí typu by bylo horší než
  // nenavrhnout nic.
  let jednotkaRucne = false;
  nJednotka.addEventListener('input', () => { jednotkaRucne = true; });
  const navrhniJednotku = () => {
    if (jednotkaRucne) return;
    nJednotka.value = vychoziJednotkaMeridlaBrowser(nTyp.value);
  };
  nTyp.addEventListener('change', navrhniJednotku);
  navrhniJednotku();
  const btnPridatMeridlo = document.createElement('button');
  btnPridatMeridlo.className = 'maly sekundarni';
  btnPridatMeridlo.textContent = 'Přidat měřidlo';
  btnPridatMeridlo.onclick = async () => {
    btnPridatMeridlo.disabled = true;
    try {
      await zavolejApi('/nemovitosti-detaily?entita=meridla', {
        method: 'POST',
        body: JSON.stringify({
          Stredisko: j.Stredisko, Typ: nTyp.value, Popis: nPopis.value.trim(),
          Vyrobni_cislo: nVyrobni.value.trim(), EAN_EIC: nEan.value.trim(),
          Jednotka: nJednotka.value.trim(),
        }),
      });
      await obnovDetailySekce(j);
    } catch (e) {
      alert('Nepodařilo se přidat měřidlo: ' + e.message);
      btnPridatMeridlo.disabled = false;
    }
  };
  pridatMeridloWrap.appendChild(nTyp); pridatMeridloWrap.appendChild(nPopis);
  pridatMeridloWrap.appendChild(nVyrobni); pridatMeridloWrap.appendChild(nEan);
  pridatMeridloWrap.appendChild(nJednotka); pridatMeridloWrap.appendChild(btnPridatMeridlo);
  wrap.appendChild(pridatMeridloWrap);

  el.appendChild(wrap);
}

/*
 * ZÁLOŽKA DOKUMENTY (v4.80)
 *
 * Roletka s pronajímatelem a dvě tlačítka. Samotné skládání dokumentu je
 * v public/dokumenty.js - tady je jen obsluha.
 *
 * TŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) ROLETKA ZAČÍNÁ PRÁZDNÁ, dokud appka nemá důvod někoho vybrat. Ten
 *    důvod je buď označený výchozí pronajímatel, nebo shoda firmy jednotky
 *    (viz vychoziPronajimatel v dokumenty.js). Vybrat za Jana, na koho se
 *    smlouva vytiskne, appce nepřísluší.
 * 2) DATA SE BEROU Z TOHO, CO JE UŽ NAČTENÉ. Žádné další volání API při
 *    kliknutí na tlačítko - dokument musí odpovídat tomu, co má člověk
 *    před sebou na kartě.
 * 3) CHYBĚJÍCÍ ÚDAJE SE ŘEKNOU PŘED TISKEM, ne až na papíře. Seznam skládá
 *    dokumentyChybejici().
 */
function vykresliSekciDokumenty(el, j, nactene) {
  const wrap = document.createElement('div');
  wrap.className = 'sekce-jednotky';
  wrap.innerHTML = '<h4>Dokumenty</h4>'
    + '<p class="popis">Appka je vyplní z evidence. Co nezná, nechá vytečkované – '
    + 'nic si nedomýšlí. Tiskne se přes prohlížeč (jde i „Uložit jako PDF“).</p>';

  const radekVyberu = document.createElement('div');
  radekVyberu.className = 'dokumenty-vyber';
  const label = document.createElement('label');
  label.textContent = 'Za koho se dokument vystavuje';
  const vyber = document.createElement('select');
  vyber.innerHTML = '<option value="">Načítám…</option>';
  vyber.disabled = true;
  radekVyberu.appendChild(label);
  radekVyberu.appendChild(vyber);
  wrap.appendChild(radekVyberu);

  const napoveda = document.createElement('p');
  napoveda.className = 'popis';
  napoveda.style.margin = '4px 0 0';
  wrap.appendChild(napoveda);

  const radekTlacitek = document.createElement('div');
  radekTlacitek.className = 'dokumenty-tlacitka';
  wrap.appendChild(radekTlacitek);

  function kontext() {
    const vybrany = (dokumentyPronajimateleSeznam || []).find((p) => p.ID === vyber.value) || null;
    return Object.assign({ jednotka: j, pronajimatel: vybrany }, nactene);
  }

  const btnKarta = document.createElement('button');
  btnKarta.className = 'maly sekundarni';
  btnKarta.textContent = 'Karta bytu';
  btnKarta.onclick = () => {
    const ctx = kontext();
    // Karta bytu je interní přehled - pronajímatel v ní není, takže se na
    // něj ani neupozorňuje. Filtruje se proto ta jedna věta.
    const chybi = dokumentyChybejici(ctx).filter((v) => v.indexOf('pronajímatel') === -1);
    otevriDokument('Karta bytu – ' + (j.Nazev || j.Stredisko), dokumentKartaBytu(ctx), chybi);
  };
  radekTlacitek.appendChild(btnKarta);

  /*
   * (v4.82) JEDNA ROLETKA PRO OBA PODEPISOVANÉ DOKUMENTY.
   *
   * Do v4.81 vybíral smlouvu jen tisk smlouvy; protokol se tiskl „k bytu".
   * U bytu rozděleného na dvě jednotky (Holečkova 1a a 1b) to znamenalo, že
   * nájemník jednotky 1a dostal na podpis klíče i WiFi heslo od 1b - viz
   * Jan 2026-08-21: *„klíče i wifi musí být samostatně k nájemní jednotce"*.
   *
   * Teď platí: **smlouva a protokol se tisknou pro TU SAMOU stranu.**
   * Karta bytu je proti tomu interní přehled a bere všechno.
   *
   * U jediné smlouvy se roletka neukazuje (nabídka o jedné položce nic
   * neříká) a u žádné se tlačítka vypnou. Vybrat za Jana, komu se
   * předává, nepřipadá v úvahu.
   */
  const smlouvy = nactene.smlouvy || [];
  const vyberSmlouvy = document.createElement('select');
  if (smlouvy.length > 1) {
    const wrapSml = document.createElement('div');
    wrapSml.className = 'dokumenty-vyber';
    const labelSml = document.createElement('label');
    labelSml.textContent = 'Komu se předává (smlouva)';
    vyberSmlouvy.innerHTML = smlouvy.map((sm, i) => '<option value="' + i + '">'
      + escapeHtml((sm.Druha_strana || 'bez nájemníka')
        + (sm.Platnost_od ? ' · od ' + sm.Platnost_od : '')) + '</option>').join('');
    wrapSml.appendChild(labelSml);
    wrapSml.appendChild(vyberSmlouvy);
    wrap.insertBefore(wrapSml, radekTlacitek);
  }

  function vybranaSmlouva() {
    if (!smlouvy.length) return null;
    return smlouvy[Number(vyberSmlouvy.value) || 0] || smlouvy[0];
  }

  function kontextStrany() {
    const smlouva = vybranaSmlouva();
    return Object.assign(kontext(), {
      smlouva,
      najemce: najemceSmlouvy(dokumentyNajemciSeznam, smlouva),
    });
  }

  const btnProtokol = document.createElement('button');
  btnProtokol.className = 'maly sekundarni';
  btnProtokol.textContent = 'Předávací protokol';
  btnProtokol.onclick = () => {
    const ctx = kontextStrany();
    otevriDokument('Předávací protokol – ' + (j.Nazev || j.Stredisko),
      dokumentPredavaciProtokol(ctx), dokumentyChybejici(ctx));
  };
  radekTlacitek.appendChild(btnProtokol);

  const btnSmlouva = document.createElement('button');
  btnSmlouva.className = 'maly sekundarni';
  btnSmlouva.textContent = 'Nájemní smlouva';
  if (!smlouvy.length) {
    btnSmlouva.disabled = true;
    btnSmlouva.title = 'Byt nemá aktivní nájemní smlouvu, ze které by se dala vytisknout.';
  }
  btnSmlouva.onclick = () => {
    const ctx = kontextStrany();
    otevriDokument('Nájemní smlouva – ' + (j.Nazev || j.Stredisko),
      dokumentNajemniSmlouva(ctx), dokumentySmlouvaChybejici(ctx));
  };
  radekTlacitek.appendChild(btnSmlouva);

  el.appendChild(wrap);

  // Seznam pronajímatelů se donačte; do té doby jsou tlačítka aktivní -
  // karta bytu na pronajímateli nezávisí a protokol se dá vytisknout
  // i prázdný, když ho někdo potřebuje vyplnit rukou.
  // Nájemci se načtou vedle pronajímatelů - smlouva potřebuje obojí.
  nactiNajemce().then((seznam) => { dokumentyNajemciSeznam = seznam; });

  nactiPronajimatele().then((seznam) => {
    dokumentyPronajimateleSeznam = seznam;
    if (!seznam.length) {
      vyber.innerHTML = '<option value="">Žádný pronajímatel není zadaný</option>';
      napoveda.textContent = 'Pronajímatele přidáte v Nastavení → Pronajímatelé. '
        + 'Bez něj se protokol vytiskne s prázdnou hlavičkou.';
      return;
    }
    const vychozi = vychoziPronajimatel(seznam, j);
    vyber.disabled = false;
    vyber.innerHTML = '<option value="">– vyberte –</option>'
      + seznam.map((p) => '<option value="' + escapeAttr(p.ID) + '"'
        + (vychozi && p.ID === vychozi.ID ? ' selected' : '') + '>'
        + escapeHtml(p.Nazev || '(bez názvu)') + '</option>').join('');
    napoveda.textContent = vychozi
      ? 'Předvybráno podle evidence – přepněte, když se dokument vystavuje za někoho jiného.'
      : 'Vyberte, za koho se dokument vystavuje.';
  });
}

// Seznamy stran, jak je vrátilo /api/pronajimatele a /api/najemci. Drží je
// dokumenty.js (nactiPronajimatele/nactiNajemce), tohle jsou jen odkazy
// pro roletku a pro sestavení smlouvy.
let dokumentyPronajimateleSeznam = [];
let dokumentyNajemciSeznam = [];

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
// (v4.70) Oba vstupy jdou přes stejnou frontu; focení jich prostě dodá
// jen jeden. Míň větví = míň míst, kde se to může rozejít.
document.getElementById('pole-foto').addEventListener('change', (e) => zpracujVybraneSoubory(e.target.files));
document.getElementById('pole-soubor').addEventListener('change', (e) => zpracujVybraneSoubory(e.target.files));
document.getElementById('tlacitko-nahrat').addEventListener('click', nahratDoklad);
document.getElementById('dokl-sekce-ke-schvaleni').addEventListener('click', () => prepniDokladySekci('keSchvaleni'));
document.getElementById('dokl-sekce-schvalene').addEventListener('click', () => prepniDokladySekci('schvalene'));
// (v4.63) Změna firmy jen překreslí už načtený seznam - do Sheets se kvůli
// přepnutí firmy nechodí znovu.
// (v4.66) Nadpisy sloupců řadí. Klávesnice se obsluhuje taky - buňky jsou
// <span role="button">, takže samotný Enter/mezera by je jinak minul.
document.querySelectorAll('.doklad-radek-hlavicka > span[data-sloupec]').forEach((el) => {
  el.addEventListener('click', () => prepniRazeniDokladu(el.dataset.sloupec));
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    prepniRazeniDokladu(el.dataset.sloupec);
  });
});

['doklady-vyber-firmy', 'doklady-filtr-mesic', 'doklady-filtr-rok', 'doklady-filtr-zauctovano']
  .forEach((id) => {
    document.getElementById(id).addEventListener('change', () => vykresliDoklady(dokladySeznamAktualni));
  });
document.getElementById('tlacitko-pridat-uzivatele').addEventListener('click', pridatUzivatele);
document.getElementById('tlacitko-pridat-firmu').addEventListener('click', pridatFirmu);
document.getElementById('tlacitko-pridat-auto').addEventListener('click', pridatAuto);
document.getElementById('tlacitko-pridat-ucet').addEventListener('click', pridatUcet);
// (v4.80) Pronajímatelé - sekce vzniká až v Nastavení, proto přes `if`:
// starší index.html (nebo kešovaná stránka) by jinak shodila celý skript.
{
  const tlacitkoPronajimatel = document.getElementById('tlacitko-pridat-pronajimatele');
  if (tlacitkoPronajimatel) tlacitkoPronajimatel.addEventListener('click', pridatPronajimatele);
  const tlacitkoNajemce = document.getElementById('tlacitko-pridat-najemce');
  if (tlacitkoNajemce) tlacitkoNajemce.addEventListener('click', pridatNajemce);
}
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
document.getElementById('tlacitko-kontrola-najmu').addEventListener('click', spustKontroluNajmu);
document.getElementById('tlacitko-nem-platby-nacist').addEventListener('click', nactiKontrolaUhradyNajmu);
document.getElementById('tlacitko-najemne-nacist').addEventListener('click', nactiNajemne);
// Filtr překresluje z už načtených dat - přepnout „jen po splatnosti" nemá
// znamenat další kolo dotazů do Sheets.
document.getElementById('najemne-filtr').addEventListener('change', () => {
  if (najemneData) vykresliNajemne(document.getElementById('najemne-vysledek'), najemneData);
});
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

/*
 * (v4.63) Hromadné pojmenování scanů na Disku.
 *
 * Jan 2026-08-20 se ptal, jestli jde scany hromadně vyexportovat pod
 * předem daným názvem („Z - zaúčtováno, S - spárováno a pak číslo dle
 * systému"), a vybral variantu **přejmenovat je na Disku** a složku si
 * pak stáhnout z Disku.
 *
 * Zip skládaný tady v appce by u většího výběru narazil na limit velikosti
 * odpovědi Netlify funkce - a spadl by až po minutě čekání.
 *
 * (v4.68) Z „S" je „U" jako uhrazeno - na Janovo „sjednotit", ať se stav
 * na obrazovce a písmeno v názvu souboru jmenují stejně. Už pojmenované
 * soubory se tím při příštím běhu přejmenují jednou znovu; v náhledu je to
 * vidět řádek po řádku.
 *
 * Dvě fáze: náhled (server nic nemění) a potvrzení. Bez toho by šlo
 * jedním klepnutím přejmenovat desítky souborů, což zpátky vzít nejde.
 */
async function scanyNahledNeboProvedeni(potvrdit, tlacitko) {
  const el = document.getElementById('scany-vysledek');
  const firma = document.getElementById('export-firma').value;
  if (!firma) {
    el.innerHTML = '<div class="zprava chyba">Nejdřív vyberte konkrétní firmu ve filtru nahoře '
      + '(ne „Všechny firmy“).</div>';
    return;
  }
  const mesic = document.getElementById('export-mesic').value;
  const rok = document.getElementById('export-rok').value;
  // (v4.69) Archivní režim se čte v okamžiku SPUŠTĚNÍ náhledu a stejná
  // hodnota pak jde i do potvrzení - jinak by šlo odklepnout něco jiného,
  // než co bylo v náhledu vidět.
  const archivovat = !!(document.getElementById('scany-archivovat') || {}).checked;

  if (tlacitko) tlacitko.disabled = true;
  el.innerHTML = '<div class="nacitani">' + (potvrdit ? 'Zpracovávám…' : 'Načítám náhled…') + '</div>';
  try {
    const data = await zavolejApi('/doklady-prejmenovat-scany', {
      method: 'POST',
      body: JSON.stringify({ firma, rok, mesic, potvrdit, archivovat }),
    });
    vykresliVysledekScanu(el, data);
  } catch (e) {
    el.innerHTML = '<div class="zprava chyba">' + escapeHtml(e.message) + '</div>';
  }
  if (tlacitko) tlacitko.disabled = false;
}

function vykresliVysledekScanu(el, data) {
  el.innerHTML = '';

  const doArchivu = !!data.archivovat;
  const shrnuti = document.createElement('div');
  shrnuti.className = 'zprava ' + (data.rezim === 'provedeno' ? 'uspech' : 'info');
  shrnuti.textContent = data.rezim === 'provedeno'
    ? (doArchivu ? 'Uloženo do archivu: ' : 'Přejmenováno souborů: ') + data.prejmenovano
      + (data.bezeZmeny ? ', beze změny: ' + data.bezeZmeny : '')
      + (data.preskoceno ? ', přeskočeno: ' + data.preskoceno : '') + '.'
    : (doArchivu ? 'K uložení do archivu: ' : 'K přejmenování: ') + data.kPrejmenovani
      + (data.bezeZmeny ? (doArchivu ? ', už v archivu a správně pojmenováno: ' : ', už správně pojmenováno: ') + data.bezeZmeny : '')
      + (data.preskoceno ? ', přeskočeno: ' + data.preskoceno : '') + '.';
  el.appendChild(shrnuti);

  // Strop na jeden běh se NESCHOVÁVÁ - tiché uříznutí by vypadalo jako
  // „hotovo", a přitom by půlka složky zůstala nepojmenovaná.
  if (data.zbyva > 0) {
    const zbytek = document.createElement('div');
    zbytek.className = 'zprava varovani';
    zbytek.textContent = 'Do jednoho běhu se vejde omezený počet dokladů. Zbývá jich ještě '
      + data.zbyva + ' – po dokončení spusťte tlačítko znovu.';
    el.appendChild(zbytek);
  }

  if (!data.polozky || !data.polozky.length) {
    const p = document.createElement('p');
    p.className = 'popis';
    p.textContent = 'Pro tenhle výběr appka nenašla žádný schválený doklad s uloženým souborem.';
    el.appendChild(p);
    return;
  }

  const tabulka = document.createElement('table');
  tabulka.innerHTML = '<thead><tr><th>Teď</th><th>Nově</th>'
    + (doArchivu ? '<th>Složka</th>' : '') + '<th>Stav</th></tr></thead>';
  const telo = document.createElement('tbody');
  data.polozky.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td data-label="Teď"></td><td data-label="Nově"></td>'
      + (doArchivu ? '<td data-label="Složka"></td>' : '') + '<td data-label="Stav"></td>';
    tr.children[0].textContent = p.stary || '(soubor nenalezen)';
    tr.children[1].textContent = p.novy || '—';
    // U přeskočeného dokladu se cílová složka NEUKAZUJE - nikam nepůjde
    // a vyplněný sloupec by tvrdil opak.
    if (doArchivu) tr.children[2].textContent = (p.akce === 'preskoceno' ? '' : p.slozka) || '—';
    const bunkaStavu = tr.children[doArchivu ? 3 : 2];
    let trida = 'badge-navrzeno';
    let text = doArchivu ? 'Do archivu' : 'Přejmenovat';
    if (p.akce === 'prejmenovano') { trida = 'badge-potvrzeno'; text = 'Přejmenováno'; }
    else if (p.akce === 'archivovano') { trida = 'badge-potvrzeno'; text = 'V archivu'; }
    else if (p.akce === 'beze-zmeny') { trida = 'badge-potvrzeno'; text = 'Beze změny'; }
    else if (p.akce === 'preskoceno') { trida = 'badge-chybi'; text = 'Přeskočeno'; }
    bunkaStavu.innerHTML = '<span class="' + trida + '">' + escapeHtml(text) + '</span>';
    if (p.duvod) {
      const pozn = document.createElement('div');
      pozn.className = 'popis';
      pozn.style.margin = '2px 0 0';
      pozn.textContent = p.duvod;
      bunkaStavu.appendChild(pozn);
    }
    telo.appendChild(tr);
  });
  tabulka.appendChild(telo);
  el.appendChild(tabulka);

  /*
   * (v4.73) Kam si pro to jít.
   *
   * Jan se po archivaci zeptal „kde je to stažení do archivu?" - a měl
   * pravdu, že to nikde nestálo. Stahuje se z Google Disku, ne z appky
   * (zip skládá Google), jenže dokud appka neřekne KTEROU složku otevřít,
   * je to k ničemu. Vypíšou se skutečné cesty z právě zpracovaných řádků,
   * ne obecný návod.
   */
  if (data.rezim === 'provedeno' && doArchivu && data.prejmenovano > 0) {
    const slozky = [];
    (data.polozky || []).forEach((p) => {
      if (p.akce !== 'archivovano' || !p.slozka) return;
      if (slozky.indexOf(p.slozka) === -1) slozky.push(p.slozka);
    });
    if (slozky.length) {
      const kam = document.createElement('div');
      kam.className = 'zprava info';
      const uvod = document.createElement('p');
      uvod.style.margin = '0 0 6px';
      uvod.innerHTML = '<strong>Kde si to stáhnete:</strong> otevřete Google Disk, najděte složku'
        + (slozky.length > 1 ? ' (jednu z těchto)' : '') + ' a klepněte na ni pravým tlačítkem → '
        + '<strong>Stáhnout</strong>. Zip poskládá Google, takže to zvládne i stovky souborů.';
      kam.appendChild(uvod);
      slozky.sort().forEach((cesta) => {
        const radek = document.createElement('div');
        radek.className = 'archiv-cesta';
        radek.textContent = cesta;
        kam.appendChild(radek);
      });
      el.appendChild(kam);
    }
  }

  if (data.rezim === 'nahled' && data.kPrejmenovani > 0) {
    const potvrd = document.createElement('button');
    potvrd.textContent = doArchivu
      ? 'Uložit ' + data.kPrejmenovani + ' souborů do archivu'
      : 'Přejmenovat ' + data.kPrejmenovani + ' souborů na Disku';
    potvrd.addEventListener('click', () => {
      const otazka = doArchivu
        ? 'Appka přejmenuje ' + data.kPrejmenovani + ' souborů a PŘESUNE je na Disku do složek '
          + '„Archiv dokladů / firma / rok“.\n\n'
          + 'Nic se nemaže ani nekopíruje – soubory se jen přestěhují z 00_Inbox a odkazy '
          + 'z appky fungují dál. Zpátky to jde jen ručně, soubor po souboru.\n\nPokračovat?'
        : 'Appka přejmenuje ' + data.kPrejmenovani + ' souborů na Google Disku.\n\n'
          + 'Mění se jen název – nic se nepřesouvá ani nemaže a doklady v appce zůstanou '
          + 'navázané na stejné soubory. Zpátky to jde jen ručně, soubor po souboru.\n\nPokračovat?';
      if (!confirm(otazka)) return;
      scanyNahledNeboProvedeni(true, potvrd);
    });
    el.appendChild(potvrd);
  }
}

document.getElementById('tlacitko-scany-nahled').addEventListener('click', (e) =>
  scanyNahledNeboProvedeni(false, e.target));

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
