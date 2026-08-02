/**
 * netlify/functions/precislovani.js
 * GET  ?rok=2026[&typ=doklady|vydane]  (Bearer token) -> NÁHLED: co by se
 *      změnilo, kdyby se číslování za daný rok srovnalo. Nic nezapisuje.
 * POST { rok, typ }                    (Bearer token) -> provede zápis.
 *
 * Proč to vzniklo (v4.49): Jan (2026-08-02) - "a ted je možné ještě všechny
 * doklady roku 2026 upravit a doplnit číslování, než se to pošle účetní?"
 * Číslování (Evidencni_cislo, viz lib/evidencniCislo.js) appka od v4.34
 * přiděluje průběžně - u přijatých dokladů při schválení, u vydaných faktur
 * při potvrzení stavu. V řadě proto můžou být mezery a přeskoky: doklad
 * schválený později, ale s dřívějším datem, dostal vyšší číslo; doklad
 * přestěhovaný opravou do jiného roku po sobě mezeru nechal (schválně, viz
 * precislujPriPresunu()); a záznamy z doby před v4.34 nemají číslo vůbec.
 * Tahle funkce je JEDNORÁZOVÝ ÚKLID - srovná celý rok do souvislé řady.
 *
 * Pořadí čísel: podle účetního data (DUZP, jinak datum dokladu/vystavení),
 * tedy chronologicky - Janova výslovná volba přes AskUserQuestion. Běžný
 * chod se tím NEMĚNÍ: nové doklady se dál číslují při schválení podle
 * přidání. Kdyby se sem někdy sahalo, tohle je rozdíl, který stojí za
 * zapamatování - jsou to dvě různá pravidla schválně, ne nedopatřením.
 *
 * Vždycky dvoukrokově, náhled a teprve pak zápis. Číslo dokladu je něco,
 * co Jan nebo účetní můžou mít vytištěné nebo opsané v mailu - appka ho
 * proto nikdy nepřepíše "jen tak", ale až když Jan v náhledu vidí, kolika
 * záznamů se to týká a jak. Pozor, ať se historie neopakuje.
 *
 * Práva: JEN admin a účetní. Běžná role smí opravovat údaje na svých
 * dokladech, ale hromadné přepsání číslování celé firmy za celý rok je
 * zásah do podkladů pro účetnictví - to na běžnou roli nepatří. Admin
 * srovnává všechny firmy, účetní jen ty svoje (stejný scope, jaký má
 * všude jinde).
 *
 * Zápis appka dělá řádek po řádku (updateRow), ne hromadným přepisem listu.
 * Je to pomalejší, ale když volání spadne v půlce, zůstane list konzistentní
 * - část záznamů má nová čísla, část stará, a druhé spuštění to dorovná.
 * Hromadný přepis by při chybě uprostřed mohl list poškodit celý.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { VYDANE_FAKTURY_HEADERS } = require('../../lib/vydaneFakturySchema');
const { navrhSrovnaniCislovani } = require('../../lib/evidencniCislo');
const { json } = require('../../lib/http');

// Obě složky se liší jen v tom, kde mají firmu, datum a co považují za
// "hotový" záznam - zbytek je stejný, tak ať je to na jednom místě.
const DRUHY = {
  doklady: {
    list: 'Doklady',
    hlavicky: DOKLADY_HEADERS,
    kod: 'FP',
    popisDruhu: 'přijaté doklady',
    ziskejFirmu: (d) => d.Firma_potvrzena || d.Firma_AI_odhad || '',
    ziskejDatum: (d) => d.DUZP || d.Datum_dokladu || '',
    ziskejKlicRazeni: (d) => String(d.Datum_zpracovani || '') + '|' + String(d.ID || ''),
    // Číslo patří jen schválenému dokladu - stejné pravidlo, jaké platí při
    // průběžném přidělování (viz lib/evidencniCislo.js). Doklad čekající na
    // schválení by v řadě zabral místo, i kdyby nakonec skončil jako
    // zamítnutý nebo duplicitní; svoje číslo dostane při schválení.
    patriDoCislovani: (d) => d.Stav === 'Schváleno',
    popisZaznamu: (d) => [d.Dodavatel, d.Cislo_dokladu].filter(Boolean).join(' · ') || '(bez dodavatele)',
  },
  vydane: {
    list: 'Vydane_faktury',
    hlavicky: VYDANE_FAKTURY_HEADERS,
    kod: 'FV',
    popisDruhu: 'vydané faktury',
    ziskejFirmu: (f) => f.Firma || '',
    ziskejDatum: (f) => f.DUZP || f.Datum_vystaveni || '',
    ziskejKlicRazeni: (f) => String(f.Datum_vytvoreni || '') + '|' + String(f.ID || ''),
    // Placeholder ani nevyřešená možná duplicita reálnou fakturou ještě
    // nejsou - viz jeStavPotvrzeny() v netlify/functions/vydaneFaktury.js.
    patriDoCislovani: (f) => f.Stav && f.Stav !== 'Zpracovává se' && f.Stav !== 'Možná duplicita',
    popisZaznamu: (f) => [f.Zakaznik, f.Cislo_faktury].filter(Boolean).join(' · ') || '(bez zákazníka)',
  },
};

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function vidiFirmu(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

async function pripravNavrh(sheets, uzivatel, druh, rok) {
  const nastaveni = DRUHY[druh];
  const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, nastaveni.list);
  // Scope na firmy uživatele appka dělá JEŠTĚ PŘED výpočtem, ne až nad
  // výsledkem - jinak by účetní, která vidí jednu firmu, dostala čísla
  // spočítaná z řady, do které vidět nemá.
  const viditelne = rows.filter((z) => vidiFirmu(uzivatel, nastaveni.ziskejFirmu(z)));
  return navrhSrovnaniCislovani(viditelne, nastaveni.kod, rok, nastaveni);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (!jeUcetniNeboAdmin(uzivatel)) {
    return json(403, { error: 'Srovnání číslování smí spustit jen administrátor nebo účetní.' });
  }

  const parametry = event.queryStringParameters || {};
  const telo = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
  const rok = String(telo.rok || parametry.rok || '').trim();
  const druh = String(telo.typ || parametry.typ || 'doklady').trim();

  if (!/^\d{4}$/.test(rok)) return json(400, { error: 'Chybí nebo je špatně zadaný rok (čtyři číslice).' });
  if (!DRUHY[druh]) return json(400, { error: 'Neznámý typ záznamů.' });

  try {
    const sheets = await getSheetsClient();
    const navrh = await pripravNavrh(sheets, uzivatel, druh, rok);
    const nastaveni = DRUHY[druh];

    if (event.httpMethod === 'GET') {
      return json(200, {
        rok,
        typ: druh,
        popisDruhu: nastaveni.popisDruhu,
        celkem: navrh.length,
        zmen: navrh.filter((p) => p.zmena).length,
        // Do náhledu appka posílá JEN řádky, které se opravdu mění. Rok, kde
        // je všechno v pořádku, tak nezaplaví Jana stovkou řádků "beze změny",
        // ve kterých by tu jednu důležitou změnu přehlédl.
        polozky: navrh
          .filter((p) => p.zmena)
          .map((p) => ({
            id: p.zaznam.ID,
            firma: p.firma,
            datum: nastaveni.ziskejDatum(p.zaznam),
            popis: nastaveni.popisZaznamu(p.zaznam),
            stare: p.stare,
            nove: p.nove,
          })),
      });
    }

    if (event.httpMethod === 'POST') {
      const kZapisu = navrh.filter((p) => p.zmena);
      let zapsano = 0;
      for (const polozka of kZapisu) {
        // `_row` (pomocné pole z readSheetObjects) v objektu klidně zůstane -
        // updateRow zapisuje výhradně sloupce z hlaviček, takže se do listu
        // nedostane. Stejně to dělá i doklady.js, ať se to nechová jinde jinak.
        const aktualizovany = Object.assign({}, polozka.zaznam, { Evidencni_cislo: polozka.nove });
        await updateRow(
          sheets,
          process.env.SPREADSHEET_ID,
          nastaveni.list,
          nastaveni.hlavicky,
          polozka.zaznam._row,
          aktualizovany
        );
        zapsano += 1;
      }
      return json(200, { ok: true, rok, typ: druh, zapsano, celkem: navrh.length });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
