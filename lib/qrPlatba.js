/**
 * lib/qrPlatba.js
 * QR Platba (v4.32, viz claude/nomis-faktury-backlog.md) - appka z Doklady
 * (přijaté faktury/účtenky) umí sestavit SPAYD řetězec a QR kód pro rychlou
 * úhradu SCHVÁLENÉHO dokladu v jakékoli české bankovní appce, která umí
 * naskenovat QR platbu (formát podle qr-platba.cz).
 *
 * DŮLEŽITÉ omezení (appka to jen PŘIPRAVÍ, nikdy sama neplatí): appka
 * vygeneruje QR kód/SPAYD text k naskenování v bankovní appce uživatele -
 * appka nemá (a nikdy nebude mít) přímé napojení na bankovní účet appky ani
 * na účet dodavatele, potvrzení/odeslání platby zůstává vždy na člověku v
 * jeho bankovní appce/Georgi. Appka VŽDY používá SVOJI VLASTNÍ firmu (viz
 * Firmy.Bankovni_ucet) jako plátce - QR kód appka generuje jen jako
 * "poukázku k zaplacení" dodavateli, ne jako appčin vlastní platební příkaz.
 *
 * Appka vyžaduje, aby doklad měl vyplněný Cislo_uctu_dodavatele (viz
 * lib/dokladySchema.js) - bez čísla účtu dodavatele appka nemá co do pole
 * ACC dát, a SPAYD/QR by byl nepoužitelný.
 *
 * Převod ČESKÉHO formátu čísla účtu na IBAN - appka implementuje standardní
 * algoritmus (ČNB/ISO 13616), protože SPAYD/pole ACC vyžaduje IBAN, ne
 * tuzemský tvar "předčíslí-číslo/kódBanky":
 *   BBAN (20 znaků) = kód banky (4 číslice) + předčíslí (6 číslic, doplněné
 *   zleva nulami) + číslo účtu (10 číslic, doplněné zleva nulami)
 *   IBAN = "CZ" + kontrolní dvojčíslí (mod 97, ISO 7064) + BBAN
 * Appka tenhle výpočet ověřila na reálném příkladu z ČNB dokumentace:
 *   "19-2000145399/0800" -> "CZ6508000000192000145399".
 */

// Mod-97 nad (potenciálně velmi dlouhým) řetězcem číslic appka počítá po
// jednotlivých znacích (ne převodem na JS Number, který by u 20+místného
// čísla ztratil přesnost) - klasický "running remainder" algoritmus.
function mod97(retezecCislic) {
  let zbytek = 0;
  for (const znak of retezecCislic) {
    zbytek = (zbytek * 10 + Number(znak)) % 97;
  }
  return zbytek;
}

// Appka rozpozná tuzemský tvar čísla účtu "[předčíslí-]číslo/kódBanky",
// kódBanky vždy 4 číslice, předčíslí nepovinné (max 6 číslic), číslo účtu
// max 10 číslic (appka nekontroluje kontrolní číslici čísla účtu samotného -
// appka spoléhá na to, co je na dokladu, appka žádnou vlastní validaci
// správnosti účtu dodavatele neprovádí, jen formát/převod).
const TUZEMSKY_TVAR = /^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/;

function jeUzIban(text) {
  return /^[A-Za-z]{2}\d{2}[A-Za-z0-9]+$/.test(String(text || '').replace(/\s+/g, ''));
}

// Převede tuzemský tvar čísla účtu (nebo appka rovnou vrátí normalizovaný
// vstup, pokud už IBAN je) na IBAN. Vrátí null, pokud vstup appka nedokázala
// rozpoznat ani jako tuzemský tvar, ani jako IBAN - appka pak QR Platbu
// nemůže sestavit (viz volající kód, který v tom případě vrátí srozumitelnou
// chybu uživateli, ne rozbitý QR kód).
function ucetNaIban(cisloUctu) {
  const vstup = String(cisloUctu || '').trim().replace(/\s+/g, '');
  if (!vstup) return null;

  if (jeUzIban(vstup)) return vstup.toUpperCase();

  const shoda = vstup.match(TUZEMSKY_TVAR);
  if (!shoda) return null;

  const [, predcisli, cislo, kodBanky] = shoda;
  const bban =
    kodBanky.padStart(4, '0') +
    (predcisli || '').padStart(6, '0') +
    cislo.padStart(10, '0');

  // ISO 13616 kontrolní dvojčíslí: BBAN + numericky přepsaný kód země "CZ"
  // (C=12, Z=35) + "00" na místo kontrolních číslic, mod 97, kontrolní
  // dvojčíslí = 98 - zbytek.
  const kZarazeni = bban + '123500'; // "C"=12,"Z"=35 -> "1235", + "00"
  const kontrolni = String(98 - mod97(kZarazeni)).padStart(2, '0');

  return 'CZ' + kontrolni + bban;
}

// SPAYD appka posílá bez diakritiky (doporučení specifikace qr-platba.cz -
// appka se tím vyhýbá rozdílné podpoře znakových sad mezi bankovními
// appkami) a appka escapuje znaky, které SPAYD používá jako oddělovače
// (*, +) zdvojením hvězdičky/plusu podle specifikace.
function spaydText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\*/g, '**')
    .slice(0, 60); // MSG appka omezuje na rozumnou délku, spec doporučuje max 60 znaků
}

function castkaSpayd(castka) {
  const n = Number(String(castka === undefined || castka === null ? '' : castka).replace(',', '.'));
  if (!n || Number.isNaN(n)) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
}

// Sestaví SPAYD text (bez QR obrázku) pro daný doklad. `doklad` očekává
// klíče Cislo_uctu_dodavatele, Castka, Mena, Variabilni_symbol,
// Konstantni_symbol, Specificky_symbol, Dodavatel, Cislo_dokladu - appka
// všechny kromě Cislo_uctu_dodavatele/Castka bere jako nepovinné (SPAYD pole
// appka prostě vynechá, když je nemá čím naplnit).
function vytvorSpaydRetezec(doklad) {
  const iban = ucetNaIban(doklad.Cislo_uctu_dodavatele);
  if (!iban) {
    throw new Error(
      'Nepodařilo se rozpoznat číslo účtu dodavatele ("' + (doklad.Cislo_uctu_dodavatele || '') +
      '") - očekávaný tvar je "předčíslí-číslo/kódBanky" (např. "19-2000145399/0800") nebo IBAN.'
    );
  }

  const mena = String(doklad.Mena || 'CZK').trim().toUpperCase() || 'CZK';
  const castka = castkaSpayd(doklad.Castka);

  const casti = ['SPD*1.0', 'ACC:' + iban, 'AM:' + castka, 'CC:' + mena];

  if (doklad.Variabilni_symbol) casti.push('X-VS:' + String(doklad.Variabilni_symbol).replace(/\D/g, '').slice(0, 10));
  if (doklad.Konstantni_symbol) casti.push('X-KS:' + String(doklad.Konstantni_symbol).replace(/\D/g, '').slice(0, 10));
  if (doklad.Specificky_symbol) casti.push('X-SS:' + String(doklad.Specificky_symbol).replace(/\D/g, '').slice(0, 10));

  const zprava = doklad.Dodavatel
    ? 'UHRADA ' + doklad.Dodavatel + (doklad.Cislo_dokladu ? ' ' + doklad.Cislo_dokladu : '')
    : 'UHRADA FAKTURY';
  casti.push('MSG:' + spaydText(zprava));

  return casti.join('*');
}

// Vygeneruje QR kód (data URL, PNG) z hotového SPAYD textu - appka knihovnu
// 'qrcode' načítá LENIVĚ (require až tady, ne na začátku souboru), ať appka
// (a testy, které si tenhle modul jen importují kvůli SPAYD/IBAN funkcím) nespadnou
// hned při načtení modulu na appce, kde `npm install` teprve poběží (Netlify
// balíček nainstaluje při buildu/deploy, appka ho v tomhle sandboxu při
// vývoji nemusí mít stažený).
async function vytvorQrKodDataUrl(spaydRetezec) {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(spaydRetezec, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
}

module.exports = { ucetNaIban, vytvorSpaydRetezec, vytvorQrKodDataUrl, castkaSpayd };
