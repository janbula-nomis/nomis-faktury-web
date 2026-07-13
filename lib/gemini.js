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
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKlic },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error('Gemini API vrátilo chybu ' + response.status + ': ' + text);
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
