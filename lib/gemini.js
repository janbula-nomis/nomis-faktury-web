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
//
// DŮLEŽITÉ: totéž platí i pro záložní modely - datované verze jako
// "gemini-2.5-flash-lite" nebo "gemini-2.5-flash" Google časem přestane
// nabízet novým projektům/klíčům (přesně tahle appka na to narazila -
// nejdřív u hlavního modelu, pak i u záložního "gemini-2.5-flash-lite").
// Proto i záložní modely používají "-latest" aliasy - ty se samy
// přesměrují na aktuální verzi, appku tak dlouhodobě nerozbije vyřazení
// jedné konkrétní datované verze.
//
// Pozn. k záložním modelům obecně: pokud je primární model dlouhodobě
// přetížený (Google vrací 503 "high demand" opakovaně na víc dokladech po
// sobě, ne jen na jednom dokladu jednorázově), appka to nezkouší dokola na
// tom samém modelu, ale přepne na jiný ("záložní") model - ty mají typicky
// oddělenou kapacitu, takže bývají dostupné, i když je hlavní model
// zrovna přetížený.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const ZALOZNI_MODELY = ['gemini-flash-lite-latest', 'gemini-pro-latest'];
const MODELY_KE_ZKUSENI = [GEMINI_MODEL, ...ZALOZNI_MODELY.filter((m) => m !== GEMINI_MODEL)];

function apiUrlProModel(model) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
}

// Stavové kódy, u kterých má smysl zkusit jiný model - přechodné přetížení/
// nedostupnost na straně Google (např. "This model is currently
// experiencing high demand"), ne chyby v datech/požadavku appky (ty by se
// zkoušením jiného modelu nevyřešily).
//
// Pozn.: appka záměrně NEČEKÁ mezi pokusy (žádné umělé zpoždění) a každý
// model zkouší jen JEDNOU - synchronní Netlify Function má tvrdý časový
// limit a appka navíc může narazit na ještě kratší limit "brány" před
// funkcí (viz README-DEPLOY.md). Přidávat čekání mezi pokusy se ukázalo
// jako kontraproduktivní: prodloužilo to celkovou dobu natolik, že appka
// místo rychlé a srozumitelné chyby od Gemini (503) skončila neprůhledným
// timeoutem appky (504) - to je horší, protože appka pak neví, kolikátý
// pokus/model to vlastně zkusil.
const OPAKOVATELNE_KODY = [429, 500, 502, 503, 504];

// Zavolá jeden konkrétní model, jeden pokus. Vrátí response, nebo vyhodí
// Error se statusem, podle kterého appka pozná, jestli má smysl zkusit
// další model.
async function zavolejModel(model, payload, apiKlic) {
  const response = await fetch(apiUrlProModel(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKlic },
    body: JSON.stringify(payload),
  });

  if (response.ok) return response;

  const text = await response.text();
  throw Object.assign(
    new Error('Gemini API (' + model + ') vrátilo chybu ' + response.status + ': ' + text),
    { status: response.status }
  );
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
    '  "kategorie": string - POKUD MOŽNO přesně jeden z těchto názvů (appka je ' +
      'nabízí i uživateli jako číselník, viz MOZNOSTI_KATEGORIE v public/app.js, ' +
      'oba seznamy prosím udržujte stejné): "Palivo", "Servis a opravy vozidla", ' +
      '"Pojištění", "Energie (elektřina, plyn, voda)", "Nájem", "Opravy a údržba ' +
      'nemovitosti", "Telekomunikace a internet", "Kancelářské potřeby", ' +
      '"Software a IT služby", "Účetní a právní služby", "Bankovní poplatky", ' +
      '"Daně a poplatky", "Cestovné", "Marketing a reklama", "Služby", "Ostatní" ' +
      '- pokud se doklad nehodí přesně do žádné z nich, vrať tu nejbližší; ' +
      'úplně novou kategorii vymýšlej jen ve skutečně výjimečném případě,\n' +
    '  "stredisko_odhad": "Auta" nebo "Nemovitosti" nebo "" (podle toho, jestli se doklad ' +
      'týká vozidla/pohonných hmot/servisu auta (Auta), nebo nemovitosti/budovy/nájmu/oprav ' +
      'domu (Nemovitosti); pokud nejde poznat, vrať prázdný řetězec),\n' +
    '  "spz_auta": string nebo "" (pokud je z dokladu poznat SPZ vozidla),\n' +
    '  "poznamka_ai": string (krátká poznámka při nejistotě, jinak prázdný řetězec),\n' +
    '  "dalsi_doklady": pole objektů - POKUD je na jedné fotce/scanu víc ' +
      'SAMOSTATNÝCH dokladů/účtenek vedle sebe nebo pod sebou (běžné, když ' +
      'se vyfotí/naskenuje víc účtenek najednou na jeden list papíru), popiš ' +
      'ten nejvýraznější/první doklad v polích výše a KAŽDÝ DALŠÍ doklad ' +
      'zvlášť jako jeden objekt v tomhle poli, se STEJNÝMI klíči jako výše ' +
      '(typ, dodavatel, ico_dodavatele, odberatel_text, datum_dokladu, ' +
      'cislo_dokladu, castka, mena, dph, variabilni_symbol, firma_odhad, ' +
      'kategorie, stredisko_odhad, spz_auta, poznamka_ai - bez vnořeného ' +
      'klíče "dalsi_doklady" u nich). Pokud je na dokladu jen jedna faktura/ ' +
      'účtenka, vrať prázdné pole []. Nikdy nevymýšlej doklady, které tam ' +
      'doopravdy nejsou - v pochybnostech radši vrať míň dokladů.\n' +
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
  for (const model of MODELY_KE_ZKUSENI) {
    try {
      response = await zavolejModel(model, payload, apiKlic);
      break;
    } catch (e) {
      posledniChyba = e;
      // Na jiný model appka přepne jen u přechodných chyb (přetížení/
      // nedostupnost) - u ostatních (např. neplatný klíč, špatný požadavek)
      // by zkoušení dalšího modelu jen zbytečně prodlužovalo dobu čekání.
      if (!OPAKOVATELNE_KODY.includes(e.status)) throw e;
    }
  }
  if (!response) {
    throw new Error(
      'Gemini API je aktuálně nedostupné na všech zkoušených modelech (' +
      MODELY_KE_ZKUSENI.join(', ') + '). Poslední chyba: ' + posledniChyba.message
    );
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
