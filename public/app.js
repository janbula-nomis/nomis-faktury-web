/**
 * public/app.js
 * Jednoduchá vanilla JS aplikace bez build kroku. Stav (token, jméno,
 * firmy, role) se drží v paměti a v localStorage (přežije obnovení
 * stránky) - běžný přístup pro reálně nasazenou webovou appku.
 */

// Zvyšte při každé odeslané aktualizaci appky, ať Jan v appce pozná, jestli
// se mu opravdu nasadila nová verze (zobrazuje se v patičce appky).
const APP_VERZE = 'v1.6 – 2026-07-13';

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

async function zavolejApi(cesta, moznosti) {
  const opts = moznosti || {};
  const hlavicky = Object.assign({}, opts.headers || {});
  if (stav && stav.token) hlavicky['Authorization'] = 'Bearer ' + stav.token;
  if (opts.body && !hlavicky['Content-Type']) hlavicky['Content-Type'] = 'application/json';

  const odpoved = await fetch('/api' + cesta, Object.assign({}, opts, { headers: hlavicky }));
  const data = await odpoved.json().catch(() => ({}));

  if (!odpoved.ok) {
    throw new Error(data.error || 'Chyba serveru (' + odpoved.status + ')');
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
  document.getElementById('jmeno-uzivatele').textContent =
    stav.jmeno + (stav.role === 'admin' ? ' (admin)' : '');

  const jeAdmin = stav.role === 'admin';
  ['nav-uzivatele', 'nav-firmy', 'nav-auta'].forEach((id) => {
    document.getElementById(id).classList.toggle('skryto', !jeAdmin);
  });

  prepniZalozku('nahrat');
}

function prepniZalozku(nazev) {
  ['nahrat', 'doklady', 'prehled', 'uzivatele', 'firmy', 'auta'].forEach((n) => {
    document.getElementById('zalozka-' + n).classList.toggle('skryto', n !== nazev);
  });
  document.querySelectorAll('nav.zalozky button').forEach((btn) => {
    btn.classList.toggle('aktivni', btn.dataset.zalozka === nazev);
  });
  if (nazev === 'doklady') nactiDoklady();
  if (nazev === 'prehled') nactiPrehled();
  if (nazev === 'uzivatele') nactiUzivatele();
  if (nazev === 'firmy') nactiFirmy();
  if (nazev === 'auta') nactiAuta();
}

// ---------- NAHRÁVÁNÍ DOKLADU ----------

let vybranySoubor = null;

async function zpracujVybranySoubor(soubor) {
  const zprava = document.getElementById('nahrat-zprava');
  zprava.innerHTML = '';
  document.getElementById('tlacitko-nahrat').disabled = true;

  if (!soubor) {
    vybranySoubor = null;
    return;
  }

  try {
    if (soubor.type.startsWith('image/')) {
      vybranySoubor = await zmensiObrazek(soubor, 1600, 0.75);
    } else {
      vybranySoubor = { data: await souborNaBase64(soubor), mimeType: soubor.type, nazev: soubor.name };
    }
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

async function nactiDoklady() {
  const nacitani = document.getElementById('doklady-nacitani');
  const telo = document.getElementById('tabulka-doklady-telo');
  nacitani.textContent = 'Načítám…';
  telo.innerHTML = '';

  try {
    const [dataDoklady, dataAuta] = await Promise.all([
      zavolejApi('/doklady', { method: 'GET' }),
      zavolejApi('/auta', { method: 'GET' }).catch(() => ({ auta: [] })),
    ]);
    autaProVyberSpz = dataAuta.auta || [];
    nacitani.classList.add('skryto');
    vykresliDoklady(dataDoklady.doklady || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst doklady: ' + e.message;
  }
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

function vykresliDoklady(doklady) {
  const telo = document.getElementById('tabulka-doklady-telo');
  telo.innerHTML = '';

  const serazene = doklady.slice().sort((a, b) => (b.Datum_zpracovani || '').localeCompare(a.Datum_zpracovani || ''));

  serazene.forEach((d) => {
    const tr = document.createElement('tr');

    tr.innerHTML =
      '<td data-label="Stav"><span class="stav-chip ' + stavTrida(d.Stav) + '">' + escapeHtml(d.Stav || '') + '</span></td>' +
      '<td data-label="Dodavatel">' + escapeHtml(d.Dodavatel || '') + '</td>' +
      '<td data-label="Datum">' + escapeHtml(d.Datum_dokladu || '') + '</td>' +
      '<td data-label="Částka">' + escapeHtml(String(d.Castka || '')) + ' ' + escapeHtml(d.Mena || '') + '</td>' +
      '<td data-label="Firma"></td>' +
      '<td data-label="Kategorie"></td>' +
      '<td data-label="SPZ"></td>' +
      '<td data-label="Soubor">' + (d.Zdrojovy_soubor_URL ? '<a href="' + escapeAttr(d.Zdrojovy_soubor_URL) + '" target="_blank" rel="noopener">otevřít</a>' : '') + '</td>' +
      '<td data-label="Akce"></td>';

    const buneckaFirma = tr.children[4];
    const vstupFirma = document.createElement('input');
    vstupFirma.type = 'text';
    vstupFirma.value = d.Firma_potvrzena || d.Firma_AI_odhad || '';
    vstupFirma.style.fontSize = '13px';
    buneckaFirma.appendChild(vstupFirma);

    const buneckaKategorie = tr.children[5];
    const vstupKategorie = document.createElement('input');
    vstupKategorie.type = 'text';
    vstupKategorie.value = d.Kategorie || '';
    vstupKategorie.style.fontSize = '13px';
    buneckaKategorie.appendChild(vstupKategorie);

    const buneckaSpz = tr.children[6];
    const vstupSpz = document.createElement('select');
    vstupSpz.style.fontSize = '13px';
    vstupSpz.innerHTML = moznostiSpz(d.SPZ_auta || '');
    buneckaSpz.appendChild(vstupSpz);

    const buneckaAkce = tr.children[8];
    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozZmenu(d.ID, {
      Firma_potvrzena: vstupFirma.value.trim(),
      Kategorie: vstupKategorie.value.trim(),
      SPZ_auta: vstupSpz.value.trim(),
    }, tlacitkoUlozit);
    buneckaAkce.appendChild(tlacitkoUlozit);

    if (d.Stav !== 'Schváleno') {
      const tlacitkoSchvalit = document.createElement('button');
      tlacitkoSchvalit.className = 'maly';
      tlacitkoSchvalit.textContent = 'Schválit';
      tlacitkoSchvalit.style.marginLeft = '6px';
      tlacitkoSchvalit.onclick = () => ulozZmenu(d.ID, {
        Firma_potvrzena: vstupFirma.value.trim(),
        Kategorie: vstupKategorie.value.trim(),
        SPZ_auta: vstupSpz.value.trim(),
        Stav: 'Schváleno',
      }, tlacitkoSchvalit);
      buneckaAkce.appendChild(tlacitkoSchvalit);
    }

    telo.appendChild(tr);
  });

  if (serazene.length === 0) {
    telo.innerHTML = '<tr><td colspan="9" class="nacitani">Zatím žádné doklady.</td></tr>';
  }
}

async function ulozZmenu(id, zmeny, tlacitko) {
  tlacitko.disabled = true;
  try {
    await zavolejApi('/doklady', { method: 'PATCH', body: JSON.stringify({ id, zmeny }) });
    await nactiDoklady();
  } catch (e) {
    alert('Nepodařilo se uložit změnu: ' + e.message);
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

function formatCastka(cislo) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(cislo) + ' Kč';
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
    vyberRole.innerHTML = '<option value="">Uživatel</option><option value="admin">Admin</option>';
    vyberRole.value = u.Role === 'admin' ? 'admin' : '';
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

    const tlacitkoUlozit = document.createElement('button');
    tlacitkoUlozit.className = 'maly sekundarni';
    tlacitkoUlozit.textContent = 'Uložit';
    tlacitkoUlozit.onclick = () => ulozFirmu(f._row, {
      ICO: vstupIco.value.trim(),
      DIC: vstupDic.value.trim(),
      Platce_DPH: vyberPlatce.value,
    }, tlacitkoUlozit);
    tr.children[4].appendChild(tlacitkoUlozit);

    const tlacitkoSmazat = document.createElement('button');
    tlacitkoSmazat.className = 'maly sekundarni';
    tlacitkoSmazat.textContent = 'Smazat';
    tlacitkoSmazat.style.marginLeft = '6px';
    tlacitkoSmazat.onclick = () => smazFirmu(f._row, f.Nazev, tlacitkoSmazat);
    tr.children[4].appendChild(tlacitkoSmazat);

    telo.appendChild(tr);
  });

  if (firmy.length === 0) {
    telo.innerHTML = '<tr><td colspan="5" class="nacitani">Zatím žádné firmy.</td></tr>';
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
      }),
    });
    zprava.innerHTML = '<div class="zprava uspech">Firma přidána.</div>';
    document.getElementById('nova-f-nazev').value = '';
    document.getElementById('nova-f-ico').value = '';
    document.getElementById('nova-f-dic').value = '';
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
document.getElementById('pole-soubor').addEventListener('change', (e) => zpracujVybranySoubor(e.target.files[0]));
document.getElementById('tlacitko-nahrat').addEventListener('click', nahratDoklad);
document.getElementById('tlacitko-pridat-uzivatele').addEventListener('click', pridatUzivatele);
document.getElementById('tlacitko-pridat-firmu').addEventListener('click', pridatFirmu);
document.getElementById('tlacitko-pridat-auto').addEventListener('click', pridatAuto);
document.getElementById('tlacitko-pripojit-google').addEventListener('click', () => {
  if (!stav || !stav.token) return;
  window.open('/.netlify/functions/google-oauth-start?token=' + encodeURIComponent(stav.token), '_blank');
});

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
