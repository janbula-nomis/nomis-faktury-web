/**
 * public/app.js
 * Jednoduchá vanilla JS aplikace bez build kroku. Stav (token, jméno,
 * firmy, role) se drží v paměti a v localStorage (přežije obnovení
 * stránky) - běžný přístup pro reálně nasazenou webovou appku.
 */

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

async function prihlasit() {
  const pin = document.getElementById('pole-pin').value.trim();
  const zprava = document.getElementById('login-zprava');
  zprava.innerHTML = '';

  if (!pin) {
    zprava.innerHTML = '<div class="zprava chyba">Zadejte PIN.</div>';
    return;
  }

  try {
    const data = await zavolejApi('/login', { method: 'POST', body: JSON.stringify({ pin }) });
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
  prepniZalozku('nahrat');
}

function prepniZalozku(nazev) {
  ['nahrat', 'doklady', 'prehled'].forEach((n) => {
    document.getElementById('zalozka-' + n).classList.toggle('skryto', n !== nazev);
  });
  document.querySelectorAll('nav.zalozky button').forEach((btn) => {
    btn.classList.toggle('aktivni', btn.dataset.zalozka === nazev);
  });
  if (nazev === 'doklady') nactiDoklady();
  if (nazev === 'prehled') nactiPrehled();
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

async function nactiDoklady() {
  const nacitani = document.getElementById('doklady-nacitani');
  const telo = document.getElementById('tabulka-doklady-telo');
  nacitani.textContent = 'Načítám…';
  telo.innerHTML = '';

  try {
    const data = await zavolejApi('/doklady', { method: 'GET' });
    nacitani.classList.add('skryto');
    vykresliDoklady(data.doklady || []);
  } catch (e) {
    nacitani.textContent = 'Nepodařilo se načíst doklady: ' + e.message;
  }
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
    const vstupSpz = document.createElement('input');
    vstupSpz.type = 'text';
    vstupSpz.value = d.SPZ_auta || '';
    vstupSpz.style.fontSize = '13px';
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

document.querySelectorAll('nav.zalozky button').forEach((btn) => {
  btn.addEventListener('click', () => prepniZalozku(btn.dataset.zalozka));
});

if (jePrihlasen()) {
  zobrazApp();
} else {
  zobrazLogin();
}
