/**
 * lib/knihaJizdImportCest.js
 * Import CSV uložených cest pro Knihu jízd (backlog, položka 16, doplněno
 * v4.8 po obdržení reálného ukázkového souboru od Jana pro auto Defender,
 * "Trips.csv").
 *
 * Na rozdíl od bankovního CSV/XLS importu (lib/bankImportTabular.js), kde
 * appka sloupce hledá podle aliasů (protože bankovní CSV se banku od banky
 * liší), appka tenhle formát parsuje PODLE PEVNÉ POZICE sloupce - Janův
 * reálný soubor má konzistentní strukturu 12 sloupců, appka ho ověřila na
 * 300 řádcích reálných dat (žádný chybějící/prázdný sloupec, žádná jízda
 * přes půlnoc, čísla vždy s tečkou jako desetinným oddělovačem). Hlavičkové
 * názvy sloupců v souboru appka NEPOUŽÍVÁ jako spolehlivý zdroj (dvě z nich
 * jsou v exportu omylem duplicitní - "Počáteční souřadnice" se objevuje
 * dvakrát, druhý výskyt ve skutečnosti znamená koncové souřadnice) - appka
 * proto hlavičku jen ověří na počet sloupců a použije pozice popsané níže.
 *
 * Očekávané pořadí sloupců (0-indexováno), ověřeno na reálném souboru:
 *   0 počáteční datum (DD/MM/YYYY)      6 koncová adresa
 *   1 počáteční čas (HH:MM)             7 koncové souřadnice ("lat,lon")
 *   2 koncové datum (DD/MM/YYYY)        8 trvání (HH:MM)
 *   3 koncový čas (HH:MM)               9 vzdálenost (km)
 *   4 počáteční adresa                 10 spotřeba dle vozu (l/100 km)
 *   5 počáteční souřadnice ("lat,lon") 11 průměrná rychlost (km/h)
 *
 * Appka NEPÁRUJE jednotlivou jízdu s konkrétním tankováním (dle rozhodnutí
 * Jana 2026-07-19 - spárování jen agregovaně po měsíci/autě, viz
 * netlify/functions/kniha-jizd-prehled.js) - sloupec "spotřeba dle vozu"
 * appka jen archivuje do Poznámky pro informaci/kontrolu, nepoužívá ho v
 * žádném výpočtu.
 *
 * Pokud appce v budoucnu přijde soubor s jiným počtem sloupců (jiná verze
 * exportu/jiná appka), appka jasně selže s chybou místo tichého
 * naimportování nesmyslů - v tom případě je potřeba poslat aktuální ukázku
 * a parser podle ní doladit (stejná zásada jako u bankovního CSV/XLS,
 * viz lib/bankImportTabular.js).
 */
const crypto = require('crypto');
const { rozparsujCsvRadek } = require('./bankImportTabular');

const OCEKAVANY_POCET_SLOUPCU = 12;

/** "150 00 Praha" / "34-500 Zakopane" -> "Praha" / "Zakopane" (appka odstraní
 * vedoucí PSČ - číslice/pomlčky/mezery - ať zůstane jen název města/obce). */
function vytahniMesto(segmentSPsc) {
  const text = String(segmentSPsc || '').trim();
  const bezPsc = text.replace(/^[\d\s-]+/, '').trim();
  return bezPsc || text;
}

/** "Ke Kotlářce 275/2,150 00 Praha,Česko" -> "Ke Kotlářce 275/2, 150 00 Praha"
 * (appka pro čitelnost v Poznámce zahodí zemi, appka eviduje jen tuzemské
 * a sousední země, kde appka zemi u kilometrů/tankování nijak nerozlišuje). */
function zkratAdresu(adresa) {
  const segmenty = String(adresa || '').split(',');
  return segmenty.slice(0, 2).map((s) => s.trim()).filter(Boolean).join(', ');
}

/** "19/07/2026" -> "2026-07-19" (appka datum appky jinde vždy ukládá v ISO
 * tvaru, viz Doklady.Datum_dokladu apod.). Appka vrátí prázdný řetězec,
 * pokud vstup neodpovídá očekávanému DD/MM/YYYY tvaru. */
function datumNaIso(hodnota) {
  const m = String(hodnota || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, den, mesic, rok] = m;
  return rok + '-' + String(mesic).padStart(2, '0') + '-' + String(den).padStart(2, '0');
}

function jeCasHHMM(hodnota) {
  return /^\d{1,2}:\d{2}$/.test(String(hodnota || '').trim());
}

/**
 * Zpracuje syrový text CSV souboru uložených cest a appka vrátí pole jízd
 * v neutrálním tvaru (appka Auto/Firmu/Řidiče doplní až v
 * netlify/functions/kniha-jizd-import.js, protože appka je nezná ze
 * samotného souboru - jeden export appka vždy dostává za JEDNO auto, viz
 * Janovo "tohle je reál pro Defender").
 */
function parsujCsvUlozenychCest(surovyText) {
  const text = String(surovyText || '').replace(/^﻿/, '');
  const radkyText = text.split(/\r\n|\r|\n/).filter((r) => r.trim() !== '');
  if (radkyText.length < 2) {
    throw new Error('Soubor neobsahuje žádné datové řádky (jen hlavičku, nebo je prázdný).');
  }

  const vsechnyRadky = radkyText.map((r) => rozparsujCsvRadek(r, ','));
  const hlavicka = vsechnyRadky[0];
  const datoveRadky = vsechnyRadky.slice(1);

  if (hlavicka.length !== OCEKAVANY_POCET_SLOUPCU) {
    throw new Error(
      'Appka očekávala ' + OCEKAVANY_POCET_SLOUPCU + ' sloupců (formát ověřený na Janově ' +
        'ukázkovém souboru pro Defender), ale hlavička souboru jich má ' + hlavicka.length +
        '. Nalezené hlavičky: ' + hlavicka.filter(Boolean).join(', ') + '. ' +
        'Pošlete prosím appce aktuální ukázkový soubor, ať appka parser podle něj doladí.'
    );
  }

  const prvniDatovy = datoveRadky.find((r) => r.some((b) => String(b || '').trim() !== ''));
  if (
    prvniDatovy &&
    (!datumNaIso(prvniDatovy[0]) || !jeCasHHMM(prvniDatovy[1]) ||
      !datumNaIso(prvniDatovy[2]) || !jeCasHHMM(prvniDatovy[3]))
  ) {
    throw new Error(
      'Appka nerozpoznala datum/čas v očekávaných sloupcích prvního datového řádku ' +
        '(očekává se DD/MM/RRRR a HH:MM) - soubor asi má jinou strukturu, než appka zná. ' +
        'Pošlete prosím appce aktuální ukázkový soubor, ať appka parser doladí.'
    );
  }

  const pocitadloHashu = new Map();

  const jizdy = datoveRadky
    .filter((r) => r.some((b) => String(b || '').trim() !== ''))
    .map((r) => {
      const datumOd = datumNaIso(r[0]);
      const casOd = String(r[1] || '').trim();
      const casDo = String(r[3] || '').trim();
      const adresaOd = String(r[4] || '').trim();
      const adresaKam = String(r[6] || '').trim();
      const trvani = String(r[8] || '').trim();
      const vzdalenost = parseFloat(String(r[9] || '').replace(',', '.'));
      const spotrebaDleVozu = String(r[10] || '').trim();
      const rychlost = String(r[11] || '').trim();

      const mestoOd = vytahniMesto(String(adresaOd).split(',')[1] || '');
      const mestoKam = vytahniMesto(String(adresaKam).split(',')[1] || '');
      const ucelCesty = [mestoOd, mestoKam].filter(Boolean).join(' - ');

      const poznamkaCasti = [];
      if (casOd || casDo) poznamkaCasti.push(casOd + '–' + casDo + (trvani ? ' (' + trvani + ' h)' : ''));
      const odKam = [zkratAdresu(adresaOd), zkratAdresu(adresaKam)].filter(Boolean).join(' → ');
      if (odKam) poznamkaCasti.push(odKam);
      if (spotrebaDleVozu) poznamkaCasti.push('spotřeba dle vozu: ' + spotrebaDleVozu + ' l/100 km');
      if (rychlost) poznamkaCasti.push('prům. rychlost: ' + rychlost + ' km/h');

      // Základ dedup hashe appka počítá jen z časových/vzdálenostních údajů
      // (datum+čas odjezdu/příjezdu+km) - appka Auto doplní až v handleru
      // (jeden import = jedno auto), plus pořadový čítač pro opravdu
      // identické řádky (stejná minuta i km) v rámci jednoho souboru.
      const zaklad = JSON.stringify([datumOd, casOd, datumOd === '' ? '' : String(r[2] || ''), casDo, vzdalenost]);
      const zakladHash = crypto.createHash('sha256').update(zaklad).digest('hex');
      const dosud = pocitadloHashu.get(zakladHash) || 0;
      pocitadloHashu.set(zakladHash, dosud + 1);
      const hashZaklad = dosud === 0 ? zakladHash : zakladHash + ':' + dosud;

      return {
        datum: datumOd,
        casOd,
        casDo,
        ucelCesty,
        vzdalenostKm: isNaN(vzdalenost) ? 0 : vzdalenost,
        poznamka: poznamkaCasti.join(', '),
        hashZaklad,
      };
    });

  return { jizdy };
}

module.exports = { parsujCsvUlozenychCest, vytahniMesto, zkratAdresu, datumNaIso };
