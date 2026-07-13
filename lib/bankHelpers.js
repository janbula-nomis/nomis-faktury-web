/**
 * lib/bankHelpers.js
 * Parsování exportu bankovních pohybů z George Business (formát JSON,
 * viz reálná ukázka souboru poskytnutá Janem) a pomocná logika pro
 * automatické navržení shody s existujícím dokladem.
 *
 * George Business export je pole objektů, kde částka je v haléřích
 * (pole amount.value, dělit 10^amount.precision), datum je v poli
 * "booking" (ISO řetězec s časovou zónou), a appka appku identifikuje
 * podle "ownerAccountNumber"/"ownerAccountTitle" - to appce umožňuje
 * zkontrolovat, jestli nahraný výpis opravdu patří k vybrané firmě
 * (viz FIRMY_HEADERS.Bankovni_ucet a netlify/functions/banka.js).
 */
const crypto = require('crypto');

// Typy pohybů, u kterých appka rovnou předpokládá, že doklad (faktura/
// účtenka) neexistuje a nemá smysl je vyžadovat - bankovní poplatky a
// vedení účtu. Účetní může i tak stav ručně změnit, pokud by to bylo
// potřeba.
const TYPY_BEZ_DOKLADU = ['POPL', 'VEDENÍ ÚČTU', 'VEDENI UCTU'];

function castkaZHaleru(amount) {
  if (!amount || typeof amount.value !== 'number') return 0;
  const deleno = Math.pow(10, Number(amount.precision) || 0);
  return amount.value / deleno;
}

function datumZBooking(booking) {
  if (!booking) return '';
  // "2026-07-10T00:00:00.000+0200" -> "2026-07-10"
  return String(booking).slice(0, 10);
}

function cisloUctuProtistrany(partnerAccount) {
  if (!partnerAccount) return '';
  if (partnerAccount.iban) return partnerAccount.iban;
  if (partnerAccount.number) {
    const predcisli = partnerAccount.prefix && partnerAccount.prefix !== '000000' ? partnerAccount.prefix + '-' : '';
    const kod = partnerAccount.bankCode ? '/' + partnerAccount.bankCode : '';
    return predcisli + partnerAccount.number + kod;
  }
  return '';
}

function jeBezDokladu(typPohybu) {
  const t = String(typPohybu || '').toUpperCase();
  return TYPY_BEZ_DOKLADU.some((vzor) => t.includes(vzor));
}

/**
 * Rozparsuje surový text George JSON exportu na normalizované položky.
 * Vrací { polozky, ownerAccountNumber, ownerAccountTitle } nebo vyhodí
 * Error se srozumitelnou zprávou, pokud soubor nemá očekávaný tvar.
 */
function parsujGeorgeExport(surovyText) {
  let data;
  try {
    data = JSON.parse(surovyText);
  } catch (e) {
    throw new Error('Soubor není platný JSON (' + e.message + '). Ujistěte se, že jde o export z George Business.');
  }
  if (!Array.isArray(data)) {
    throw new Error('Neočekávaný formát souboru - George export by měl být seznam (JSON pole) pohybů.');
  }
  if (data.length === 0) {
    throw new Error('Soubor neobsahuje žádné pohyby.');
  }

  const sOwnerUdaji = data.find((d) => d && (d.ownerAccountNumber || d.ownerAccountTitle));
  const ownerAccountNumber = (sOwnerUdaji && sOwnerUdaji.ownerAccountNumber) || '';
  const ownerAccountTitle = (sOwnerUdaji && sOwnerUdaji.ownerAccountTitle) || '';

  const pocitadloHashu = new Map();

  const polozky = data.map((d) => {
    const castka = castkaZHaleru(d.amount);
    const zaklad = JSON.stringify([
      d.booking,
      d.amount && d.amount.value,
      d.amount && d.amount.currency,
      d.variableSymbol || '',
      d.constantSymbol || '',
      d.specificSymbol || '',
      d.referenceNumber || '',
      d.partnerName || '',
      (d.partnerAccount && d.partnerAccount.number) || '',
      (d.partnerAccount && d.partnerAccount.iban) || '',
      d.receiverReference || '',
      d.senderReference || '',
      d.reference || '',
      d.ownerAccountNumber || '',
      d.bookingTypeTranslation || '',
    ]);
    const zakladHash = crypto.createHash('sha256').update(zaklad).digest('hex');
    // Pojistka proti opravdu identickým pohybům (stejná částka/den/protistrana
    // vícekrát v jednom výpisu bez jiného rozlišujícího údaje) - připojí
    // pořadové číslo výskytu, ať appka i takové pohyby rozliší a při
    // opakovaném importu stejného souboru je správně pozná jako už známé.
    const dosud = pocitadloHashu.get(zakladHash) || 0;
    pocitadloHashu.set(zakladHash, dosud + 1);
    const hash = dosud === 0 ? zakladHash : zakladHash + ':' + dosud;

    const popis = d.receiverReference || d.senderReference || d.reference || '';
    const protistrana = d.partnerName || d.reference || '';

    return {
      datum: datumZBooking(d.booking),
      castka,
      mena: (d.amount && d.amount.currency) || 'CZK',
      typ_pohybu: d.bookingTypeTranslation || '',
      protistrana,
      cislo_uctu_protistrany: cisloUctuProtistrany(d.partnerAccount),
      variabilni_symbol: d.variableSymbol || '',
      konstantni_symbol: d.constantSymbol || '',
      specificky_symbol: d.specificSymbol || '',
      popis,
      ownerAccountNumber: d.ownerAccountNumber || '',
      ownerAccountTitle: d.ownerAccountTitle || '',
      hash,
    };
  });

  return { polozky, ownerAccountNumber, ownerAccountTitle };
}

function normalizujNazev(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\bs\.?\s?r\.?\s?o\.?\b/g, '')
    .replace(/\ba\.?\s?s\.?\b/g, '')
    .replace(/[^a-z0-9á-žÁ-Ž ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rozdilDniData(a, b) {
  if (!a || !b) return Infinity;
  const msA = new Date(a + 'T00:00:00Z').getTime();
  const msB = new Date(b + 'T00:00:00Z').getTime();
  if (Number.isNaN(msA) || Number.isNaN(msB)) return Infinity;
  return Math.abs(msA - msB) / (1000 * 60 * 60 * 24);
}

/**
 * Zkusí k bankovnímu pohybu najít nejlepší odpovídající doklad ze
 * seznamu kandidátů (jen doklady stejné firmy, které ještě nejsou
 * přiřazené k jinému pohybu). Appka porovnává jen odchozí platby
 * (záporná částka) - příjmy appka doklady nepáruje (viz banka.js).
 * Vrací { dokladId, skore } nebo null, pokud nic rozumného nenašla.
 */
function navrhniShodu(pohyb, kandidatiDoklady) {
  if (pohyb.castka >= 0) return null;

  const castkaPohybu = Math.abs(pohyb.castka);
  const nazevProtistrany = normalizujNazev(pohyb.protistrana || pohyb.popis);

  let nejlepsi = null;
  let nejlepsiSkore = 0;

  kandidatiDoklady.forEach((d) => {
    const castkaDokladu = Math.abs(Number(d.Castka) || 0);
    const shodaCastky = Math.abs(castkaDokladu - castkaPohybu) <= 1; // tolerance 1 Kč na zaokrouhlení
    if (!shodaCastky) return;

    let skore = 1; // částka sedí - základ

    const vsPohybu = String(pohyb.variabilni_symbol || '').trim();
    const vsDokladu = String(d.Variabilni_symbol || '').trim();
    const shodaVs = vsPohybu && vsDokladu && vsPohybu === vsDokladu;
    if (shodaVs) skore += 3;

    const dny = rozdilDniData(pohyb.datum, d.Datum_dokladu);
    if (dny <= 14) skore += 1;

    const nazevDodavatele = normalizujNazev(d.Dodavatel);
    const shodaNazvu =
      nazevDodavatele &&
      nazevProtistrany &&
      (nazevProtistrany.includes(nazevDodavatele) || nazevDodavatele.includes(nazevProtistrany));
    if (shodaNazvu) skore += 2;

    // Bez VS i bez shody jména appka nabízí shodu jen podle částky+data -
    // je to slabý signál, ale pořád lepší než nic; appka ho označí jako
    // "Navrženo" (ne rovnou potvrzené), takže si to účetní stejně ověří.
    if (skore > nejlepsiSkore) {
      nejlepsiSkore = skore;
      nejlepsi = d;
    }
  });

  if (!nejlepsi) return null;
  return { dokladId: nejlepsi.ID, skore: nejlepsiSkore };
}

module.exports = {
  parsujGeorgeExport,
  jeBezDokladu,
  navrhniShodu,
  castkaZHaleru,
  cisloUctuProtistrany,
};
