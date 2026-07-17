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
  const vysledek = amount.value / deleno;
  // Obrana proti neúplné/neočekávané položce v George exportu (např. amount.value
  // rovnou NaN, nebo amount.precision natolik mimo očekávané rozmezí, že by dělení
  // vrátilo Infinity/NaN) - appka radši uloží 0 než NaN/Infinity, ať se v appce
  // nikdy nezobrazí "NaN Kč" a jde to snadno dohledat a opravit ručně v Sheets.
  return Number.isFinite(vysledek) ? vysledek : 0;
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

/**
 * Appka čte listy v Sheets přes `readSheetObjects` (viz lib/sheetsHelpers.js),
 * které interně používá Sheets API výchozí valueRenderOption "FORMATTED_VALUE" -
 * tedy appka dostává hodnoty naformátované přesně tak, jak se zobrazují v UI
 * Sheets, ne surové číslo. U celých čísel to náhodou vypadá jako platný JS
 * zápis (např. "-1717"), ale desetinné číslo se v české lokalizaci zobrazí
 * s ČÁRKOU jako oddělovačem desetin (např. "-2029,91") a mezerou jako
 * oddělovačem tisíců (např. "1 234,56") - obyčejné Number()/parseFloat() by na
 * tom buď selhalo (Number -> NaN), nebo tiše uřízlo desetinná místa (parseFloat
 * se zastaví na čárce a vrátí jen celou část, což je stejně špatně, akorát
 * potichu). Tahle funkce to normalizuje před parsováním, ať appka nikdy
 * nezobrazí "NaN Kč" ani neztratí haléře jen kvůli formátu, ve kterém Sheets
 * hodnotu vrátilo.
 */
function parsujCastkuZListu(hodnota) {
  if (typeof hodnota === 'number') return Number.isFinite(hodnota) ? hodnota : 0;
  if (hodnota === null || hodnota === undefined || hodnota === '') return 0;
  const normalizovano = String(hodnota).trim().replace(/\s/g, '').replace(',', '.');
  const cislo = Number(normalizovano);
  return Number.isFinite(cislo) ? cislo : 0;
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
    const castkaDokladu = Math.abs(parsujCastkuZListu(d.Castka));
    const menaDokladu = String(d.Mena || '').trim().toUpperCase();
    const jeCizaMena = menaDokladu !== '' && menaDokladu !== 'CZK';

    const nazevDodavatele = normalizujNazev(d.Dodavatel);
    const shodaNazvu =
      nazevDodavatele &&
      nazevProtistrany &&
      (nazevProtistrany.includes(nazevDodavatele) || nazevDodavatele.includes(nazevProtistrany));

    let shodaCastky;
    if (jeCizaMena) {
      // Doklad je vystavený v cizí měně (typicky zahraniční účtenka v EUR),
      // ale bankovní pohyb appka dostává už přepočtený bankou na Kč (George
      // export appce vždy vrací amount v měně účtu, ne v původní měně
      // platby na účtence) - přesná shoda čísel by tu nikdy neprošla.
      // Appka místo toho jen ověří, že přepočtená částka odpovídá hrubě
      // rozumnému kurzu (mezi 5 a 60 Kč za jednotku cizí měny - s rezervou
      // pokrývá běžné měny jako EUR/USD/GBP), a navíc (na rozdíl od Kč) tu
      // rovnou vyžaduje i shodu jména dodavatele/protistrany - samotná
      // přibližná částka by byla příliš slabý/nespolehlivý signál kvůli
      // širokému rozptylu možného kurzu.
      if (!shodaNazvu) return;
      const pomerKurzu = castkaDokladu > 0 ? castkaPohybu / castkaDokladu : 0;
      shodaCastky = pomerKurzu >= 5 && pomerKurzu <= 60;
    } else {
      shodaCastky = Math.abs(castkaDokladu - castkaPohybu) <= 1; // tolerance 1 Kč na zaokrouhlení
    }
    if (!shodaCastky) return;

    let skore = 1; // částka (příp. po přepočtu) sedí - základ

    const vsPohybu = String(pohyb.variabilni_symbol || '').trim();
    const vsDokladu = String(d.Variabilni_symbol || '').trim();
    const shodaVs = vsPohybu && vsDokladu && vsPohybu === vsDokladu;
    if (shodaVs) skore += 3;

    const dny = rozdilDniData(pohyb.datum, d.Datum_dokladu);
    if (dny <= 14) skore += 1;

    if (shodaNazvu) skore += 2;

    // Bez VS i bez shody jména appka nabízí shodu jen podle částky+data -
    // je to slabý signál, ale pořád lepší než nic; appka ho označí jako
    // "Navrženo" (ne rovnou potvrzené), takže si to účetní stejně ověří.
    // (U cizí měny je shoda jména podmínkou už výš, takže sem se dostane
    // jen kandidát, který jméno má - viz komentář u shodaCastky.)
    if (skore > nejlepsiSkore) {
      nejlepsiSkore = skore;
      nejlepsi = d;
    }
  });

  if (!nejlepsi) return null;
  return { dokladId: nejlepsi.ID, skore: nejlepsiSkore };
}

/**
 * Auto-návrh přiřazení dalšího pohybu ke stejné Smlouvě (trvalý příkaz,
 * od v3.19) - appka porovnává NOVÝ kandidátní pohyb proti VZOROVÉMU pohybu
 * (ten, který účetní právě ručně přiřadila ke smlouvě), ne proti samotné
 * smlouvě - smlouva sama o sobě protistranu ani přesnou částku nemusí znát
 * (appka u ní má jen orientační Ocekavana_castka). Appka vyžaduje shodu
 * protistrany (normalizovaný název) a podobnou částku - tolerance kvůli
 * kolísání u opakovaných plateb (typicky elektřina/plyn se měsíc od měsíce
 * liší, na rozdíl od nájmu/leasingu, který bývá pevný) - buď aspoň 100 Kč,
 * nebo 30 % z částky vzorového pohybu, podle toho, co je větší. Appka
 * párování touhle funkcí jen NAVRHUJE ("Navrženo - trvalý příkaz"), nikdy
 * rovnou nepotvrzuje - konečné slovo má vždycky účetní.
 */
function jePodobnaShodaSmlouvy(vzorPohyb, kandidatPohyb) {
  const castkaVzor = vzorPohyb.castka;
  const castkaKandidat = kandidatPohyb.castka;
  if ((castkaVzor < 0) !== (castkaKandidat < 0)) return false;

  const nazevVzor = normalizujNazev(vzorPohyb.protistrana);
  const nazevKandidat = normalizujNazev(kandidatPohyb.protistrana);
  if (!nazevVzor || !nazevKandidat || nazevVzor !== nazevKandidat) return false;

  const tolerance = Math.max(100, Math.abs(castkaVzor) * 0.3);
  return Math.abs(Math.abs(castkaVzor) - Math.abs(castkaKandidat)) <= tolerance;
}

module.exports = {
  parsujGeorgeExport,
  jeBezDokladu,
  navrhniShodu,
  jePodobnaShodaSmlouvy,
  castkaZHaleru,
  cisloUctuProtistrany,
  normalizujNazev,
  parsujCastkuZListu,
};
