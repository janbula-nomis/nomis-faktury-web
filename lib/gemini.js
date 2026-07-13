/**
 * lib/gemini.js
 * Volání Gemini API pro extrakci strukturovaných dat z dokladu (obrázek
 * nebo PDF, poslaný jako base64) a odhad, které firmě ze skupiny Nomis
 * Group doklad patří. Vyžaduje globální `fetch` (dostupné v Netlify
 * Functions na Node 18+).
 */
// Pozn.: záměrně používáme alias "gemini-flash-latest" místo pevně
// zadané datované verze (např. "gemini-2.5-flash") - Google občas starší
// datované verze modelů pro nové projekty/API klíče vyřadí (chyba 404
// "model ... is no longer available to new users"), zatímco alias
// "-latest" si Google sám průběžně přesměrovává na aktuálně doporučenou
// verzi (s dvoutýdenním předstihem před změnou). Jde nastavit i ručně
// přes Netlify proměnnou GEMINI_MODEL, pokud by bylo někdy potřeba appku
// zafixovat na konkrétní verzi.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

// Stavové kódy, u kterých má smysl to zkusit znovu - přechodné přetížení
/// nedostupnost na straně Google (např. "This model is currently
// experiencing high demand"), ne chyby v datech/požadavku appky (ty by
// se opakováním nevyřešily). Držíme málo pokusů s krátkým čekáním, ať
// appka zbytečně nenaráží na časový limit Netlify Functions (viz
// README-DEPLOY.md - synchronní funkce mají tvrdý limit a appka navíc
// může narazit na kratší limit "brány" před samotnou funkcí).
const OPAKOVATELNE_KODY = [429, 500, 502, 503, 504];
const POCET_POKUSU = 3;
const CEKANI_MS = [1000, 2000];

function pockej(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extrahujDataZDokladu(buffer, mimeType, firmy) {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new Error('Chybí GEMINI_API_KEY (nastavte v Netlify env proměnných).');

  const base64 = buffer.toString('base64');
  const seznamFirem = firmy
    .map((f) => '- ' + f.Nazev + (f.ICO ? ' (IČO: ' + f.ICO + ')' : ''))
    .join('\n');

  const prompt =
    'Jsi asistent pro zpracování účetních dokladů (faktury a účtenky) pro skupinu firem Nomis Group.\n' +
    'Ve skupině existují tyto firmy, jedna z nich bude typicky odběratel na dokladu:\n' +
    seznamFirem +
    '\n\n' +
    'Z přiloženého dokladu vytáhni následující údaje a vrať POUZE validní JSON ' +
    '(bez markdown bloku, bez dalšího textu) s těmito klíči:\n' +
    '{\n' +
    '  "typ": "Faktura" nebo "Ucetenka",\n' +
    '  "dodavatel": string,\n' +
    '  "ico_dodavatele": string nebo "",\n' +
    '  "odberatel_text": string (jak je odběratel uveden na dokladu, pokud vůbec je),\n' +
    '  "datum_dokladu": string ve formátu YYYY-MM-DD nebo "",\n' +
    '  "cislo_dokladu": string nebo "",\n' +
    '  "castka": number (celková částka k úhradě, jen číslo bez měny),\n' +
    '  "mena": string (např. "CZK", "EUR"),\n' +
    '  "dph": number nebo 0,\n' +
    '  "variabilni_symbol": string nebo "",\n' +
    '  "firma_odhad": string (přesně jeden z názvů firem výše),\n' +
    '  "kategorie": string (např. "Palivo", "Kancelářské potřeby", "Služby", "Ostatní"),\n' +
    '  "spz_auta": string nebo "" (pokud je z dokladu poznat SPZ vozidla),\n' +
    '  "poznamka_ai": string (krátká poznámka při nejistotě, jinak prázdný řetězec)\n' +
    '}';

  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  // Klíč se posílá přes hlavičku x-goog-api-key (funguje pro starší i
  // novější "AQ." formát klíčů z Google AI Studio; starší ?key= query
  // parametr novým AQ klíčům podle hlášení jiných uživatelů dělal problémy).
  let response;
  let posledniChyba;
  for (let pokus = 1; pokus <= POCET_POKUSU; pokus += 1) {
    response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKlic },
      body: JSON.stringify(payload),
    });

    if (response.ok) break;

    const text = await response.text();
    posledniChyba = new Error('Gemini API vrátilo chybu ' + response.status + ': ' + text);

    const maSmyslOpakovat = OPAKOVATELNE_KODY.includes(response.status) && pokus < POCET_POKUSU;
    if (!maSmyslOpakovat) throw posledniChyba;

    await pockej(CEKANI_MS[pokus - 1] || 2000);
  }

  const vysledek = await response.json();
  const kandidat = vysledek && vysledek.candidates && vysledek.candidates[0];
  const text =
    kandidat && kandidat.content && kandidat.content.parts && kandidat.content.parts[0] &&
    kandidat.content.parts[0].text;

  if (!text) throw new Error('Gemini API nevrátilo očekávaný text s daty.');

  return JSON.parse(text);
}

module.exports = { extrahujDataZDokladu };
