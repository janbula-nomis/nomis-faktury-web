/**
 * lib/moneyS3Export.js
 * Sestavení XML ve formátu Money S3 (účetní program Seyfor) pro export
 * Přijatých dokladů (Doklady) i Vydaných faktur (Vydane_faktury) - od v4.27,
 * Jan poslal dvě REÁLNÉ vzorové exportní XML z Money S3 (demo firma
 * "SPORT a.s."): PF_skladova.xml (přijatá faktura, skladová varianta) a
 * VF_neskladova.xml (vydaná faktura, neskladová varianta) - appka strukturu
 * i pojmenování elementů odvozuje PŘESNĚ z těchhle dvou souborů, ne z
 * dokumentace (appka žádnou oficiální neměla k dispozici).
 *
 * Appka modeluje položky podle NESKLADOVÉHO vzoru (NesklPolozka), ne
 * skladového (SklPolozka, s UcetMD/UcetD/Sklad/KmKarta) - appka žádnou
 * skladovou evidenci nemá, takže by skladová pole musela být vymyšlená.
 *
 * ============================================================================
 * ZNÁMÉ MEZERY V MAPOVÁNÍ (appka je exportuje s rozumným výchozím/prázdným
 * obsahem, ale Jan by je měl PROJÍT PŘI PRVNÍM SKUTEČNÉM IMPORTU do Money S3 -
 * appka nemá žádný jiný způsob, jak ověřit, že Money S3 vygenerované XML
 * přijme/naimportuje správně, dokud to Jan sám nezkusí):
 *
 * (a) Firmy (list "Firmy") nemá adresu (ulice/město/PSC/stát) ani název
 *     banky - jen Nazev/ICO/DIC/Platce_DPH/Bankovni_ucet (číslo účtu jako
 *     text). <MojeFirma><Adresa>/<Banka> proto appka exportuje prázdné.
 * (b) Doklady/Vydane_faktury nemají DIČ ani adresu dodavatele/zákazníka -
 *     <DodOdb>/<KonecPrij> proto appka omezuje na Nazev/ICO (DIC a adresa
 *     zůstávají prázdné).
 * (c) KodDPH (řádek v přiznání DPH) appka natvrdo nastavuje na "19Ř40,41"
 *     (přijaté) / "19Ř01,02" (vydané) - přesně podle Jan poslaných vzorů,
 *     ale appka nerozlišuje jednotlivé případy (např. reverse charge,
 *     osvobozená plnění) - u NOMIS Investment (jediná firma skupiny, co je
 *     plátce DPH) se to má typicky shodovat, ale Jan/účetní by si to měl(a)
 *     před importem zkontrolovat.
 * (d) Rada/CisRada/PredKontac/KonstSym a další čistě Money S3 interní
 *     číslování appka nemá čím naplnit (appka žádné číselné řady ani
 *     předkontace nevede) - appka nastavuje jednoduché výchozí hodnoty
 *     ("PF"/"FV" + pořadové číslo v rámci exportu), Money S3 při importu
 *     pravděpodobně přečísluje/doplní podle vlastního nastavení firmy.
 * (e) SazbaDPH1/SazbaDPH2 (dvě sazby DPH použité v dokladu) appka natvrdo
 *     nastavuje na "21"/"12" (aktuální základní/snížená sazba) - appka
 *     nedokáže spolehlivě odvodit, jestli byla u KONKRÉTNÍHO dokladu použitá
 *     jiná kombinace (0 % apod.), SouhrnDPH/položky ale reálné částky/sazby
 *     odrážejí správně.
 * ============================================================================
 */
const crypto = require('crypto');

function xmlEscape(hodnota) {
  if (hodnota === undefined || hodnota === null) return '';
  return String(hodnota)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(nazev, obsah) {
  return '<' + nazev + '>' + xmlEscape(obsah) + '</' + nazev + '>';
}

function guid() {
  return '{' + crypto.randomUUID().toUpperCase() + '}';
}

function cislo(hodnota) {
  const n = Number(String(hodnota === undefined || hodnota === null ? '' : hodnota).replace(',', '.'));
  if (!n || Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

// Appka čísla do XML zapisuje bez zbytečných koncových nul (přesně jako
// vzorové XML - "436.5", ne "436.50") - parseFloat(toFixed(2)) je
// nejjednodušší způsob, jak zaokrouhlit na 2 desetiny a zase je oříznout.
function castkaText(hodnota) {
  return String(parseFloat(cislo(hodnota).toFixed(2)));
}

// Legacy Money S3 XML tagy pro souhrn DPH appka rozřazuje podle sazby -
// "Zaklad0"/"Zaklad5"/"Zaklad22" jsou historické NÁZVY tagů z dob, kdy ČR
// měla sazby 0 %/5 %/22 % - Money S3 je od té doby nepřejmenovalo, appka
// proto i dnešní sazby (0 %/12 %/21 %) mapuje do TĚCHHLE STEJNÝCH tagů,
// podle logiky nulová/snížená/základní sazba (viz vzorové XML, kde
// SazbaDPH=21 u položky skončí v <Zaklad22>/<DPH22>).
function sazbaSkupina(sazba) {
  const s = parseFloat(String(sazba === undefined || sazba === null ? '' : sazba).replace(',', '.'));
  if (!s || Number.isNaN(s) || s <= 0) return 'zaklad0';
  if (s >= 20) return 'zaklad22';
  return 'zaklad5';
}

function spocitejSouhrnDph(polozky) {
  const souhrn = { zaklad0: 0, zaklad5: 0, zaklad22: 0, dph5: 0, dph22: 0 };
  (polozky || []).forEach((p) => {
    const cena = cislo(p.Cena);
    const mnozstvi = cislo(p.Mnozstvi) || 1;
    const sazba = parseFloat(String(p.SazbaDPH === undefined || p.SazbaDPH === null ? '' : p.SazbaDPH).replace(',', '.')) || 0;
    const zaklad = cena * mnozstvi;
    const dph = (zaklad * sazba) / 100;
    const skupina = sazbaSkupina(p.SazbaDPH);
    if (skupina === 'zaklad0') souhrn.zaklad0 += zaklad;
    if (skupina === 'zaklad5') {
      souhrn.zaklad5 += zaklad;
      souhrn.dph5 += dph;
    }
    if (skupina === 'zaklad22') {
      souhrn.zaklad22 += zaklad;
      souhrn.dph22 += dph;
    }
  });
  return souhrn;
}

function xmlSouhrnDph(souhrn) {
  return (
    '<SouhrnDPH>' +
    el('Zaklad0', castkaText(souhrn.zaklad0)) +
    el('Zaklad5', castkaText(souhrn.zaklad5)) +
    el('Zaklad22', castkaText(souhrn.zaklad22)) +
    el('DPH5', castkaText(souhrn.dph5)) +
    el('DPH22', castkaText(souhrn.dph22)) +
    '</SouhrnDPH>'
  );
}

// Jediná položka, kterou appka vloží, pokud doklad/faktura žádné položky
// (list Doklady_Polozky/Vydane_Faktury_Polozky) nemá - stejný "aspoň jeden
// souhrnný řádek" princip, jaký appka požaduje po Gemini (viz lib/gemini.js,
// "Nikdy nevracej prázdné pole...") - appka ho tu drží jako pojistku i pro
// starší doklady zpracované PŘED v4.27 (žádné položky v Sheets), ať export
// nikdy neobsahuje fakturu bez SeznamPolozek.
function nahradniPolozka(nazev, castka, sazbaDph) {
  return { Nazev: nazev || '(bez názvu)', Mnozstvi: 1, Cena: cislo(castka), SazbaDPH: sazbaDph || '', Poradi: 1 };
}

function xmlPolozka(p) {
  const cena = cislo(p.Cena);
  const mnozstvi = cislo(p.Mnozstvi) || 1;
  const sazba = parseFloat(String(p.SazbaDPH === undefined || p.SazbaDPH === null ? '' : p.SazbaDPH).replace(',', '.')) || 0;
  const zaklad = cena * mnozstvi;
  const dph = (zaklad * sazba) / 100;
  const dphMj = (cena * sazba) / 100;

  return (
    '<Polozka>' +
    el('Popis', p.Nazev) +
    el('PocetMJ', castkaText(mnozstvi)) +
    el('SazbaDPH', p.SazbaDPH || '0') +
    el('Cena', castkaText(cena)) +
    '<SouhrnDPH>' +
    el('Zaklad_MJ', castkaText(cena)) +
    el('DPH_MJ', castkaText(dphMj)) +
    el('Zaklad', castkaText(zaklad)) +
    el('DPH', castkaText(dph)) +
    '</SouhrnDPH>' +
    el('CenaTyp', '0') +
    el('Sleva', '0') +
    el('Poradi', String(p.Poradi || 1)) +
    // Appka nemá sklad/inventuru - položky modeluje podle NESKLADOVÉHO
    // vzoru z Jan poslaného VF_neskladova.xml (NesklPolozka), ne podle
    // skladového SklPolozka (ten appka nemá čím naplnit).
    '<NesklPolozka>' +
    el('Zaloha', '0') +
    el('TypZarDoby', 'N') +
    el('ZarDoba', '0') +
    el('Protizapis', '0') +
    el('Hmotnost', '0') +
    '</NesklPolozka>' +
    el('CenaPoSleve', '1') +
    '</Polozka>'
  );
}

function xmlAdresaPrazdna(nazevElementu) {
  // Viz docblock výš (b) - appka u dodavatelů/zákazníků žádnou adresu
  // neeviduje, element ale appka do XML dává (jen prázdný, s výchozím
  // "Česká republika"/"CZ"), ať struktura odpovídá vzorovému XML.
  return (
    '<' + nazevElementu + '>' +
    el('Ulice', '') +
    el('Misto', '') +
    el('PSC', '') +
    el('Stat', 'Česká republika') +
    el('KodStatu', 'CZ') +
    '</' + nazevElementu + '>'
  );
}

// <DodOdb> appka používá pro OBCHODNÍHO PARTNERA (u přijatých = dodavatel, u
// vydaných = zákazník) - Money S3 tenhle element pojmenovává stejně bez
// ohledu na směr dokladu (viz vzorové VF_neskladova.xml, kde FaktVyd taky
// obsahuje <DodOdb> se zákazníkem).
function xmlDodOdb(nazev, ico) {
  return (
    '<DodOdb>' +
    el('ObchNazev', nazev) +
    xmlAdresaPrazdna('ObchAdresa') +
    el('FaktNazev', nazev) +
    (ico ? el('ICO', ico) : '') +
    xmlAdresaPrazdna('FaktAdresa') +
    el('PlatceDPH', '0') +
    el('FyzOsoba', '0') +
    '</DodOdb>'
  );
}

// <KonecPrij> (jen u vydaných faktur) - appka nerozlišuje "komu je faktura
// adresovaná" od "kam se doručuje" (jeden Zakaznik na fakturu), appka proto
// posílá STEJNÉ jméno/IČO jako u <DodOdb> výš - viz docblock (b).
function xmlKonecPrij(nazev, ico) {
  return (
    '<KonecPrij>' +
    el('Nazev', nazev) +
    xmlAdresaPrazdna('Adresa') +
    (ico ? el('ICO', ico) : '') +
    el('PlatceDPH', '0') +
    el('FyzOsoba', '0') +
    '</KonecPrij>'
  );
}

function xmlMojeFirma(firma, mena) {
  const menaKod = String((mena || 'CZK')).trim().toUpperCase() || 'CZK';
  const menaSymb = menaKod === 'EUR' ? '€' : menaKod === 'USD' ? '$' : 'Kč';
  const nazev = (firma && firma.Nazev) || '';
  return (
    '<MojeFirma>' +
    el('Nazev', nazev) +
    xmlAdresaPrazdna('Adresa') +
    el('ObchNazev', nazev) +
    xmlAdresaPrazdna('ObchAdresa') +
    el('FaktNazev', nazev) +
    xmlAdresaPrazdna('FaktAdresa') +
    el('ICO', (firma && firma.ICO) || '') +
    el('DIC', (firma && firma.DIC) || '') +
    // Appka nemá název banky (jen číslo účtu, viz Firmy.Bankovni_ucet) -
    // Banka/KodBanky proto zůstávají prázdné, viz docblock (a).
    el('Banka', '') +
    el('Ucet', (firma && firma.Bankovni_ucet) || '') +
    el('KodBanky', '') +
    el('FyzOsoba', '0') +
    el('MenaSymb', menaSymb) +
    el('MenaKod', menaKod) +
    '</MojeFirma>'
  );
}

function xmlFaktPrij(doklad, polozky, mojeFirma, cisRada) {
  const skutecnePolozky =
    polozky && polozky.length
      ? polozky
      : [nahradniPolozka(doklad.Dodavatel || doklad.Typ, doklad.Castka, doklad.Sazba_DPH)];
  const souhrn = spocitejSouhrnDph(skutecnePolozky);
  const datum = doklad.Datum_dokladu || '';

  return (
    '<FaktPrij>' +
    el('Doklad', doklad.Cislo_dokladu || doklad.ID) +
    el('GUID', guid()) +
    el('Rada', 'PF') +
    el('CisRada', String(cisRada)) +
    el('Popis', doklad.Dodavatel || '') +
    el('Vystaveno', datum) +
    el('DatUcPr', datum) +
    el('PlnenoDPH', datum) +
    el('Splatno', datum) +
    el('Doruceno', datum) +
    el('DatSkPoh', datum) +
    el('KonstSym', '') +
    el('KodDPH', '19Ř40,41') +
    el('VarSymbol', doklad.Variabilni_symbol || '') +
    el('SpecSymbol', '') +
    el('Ucet', 'BAN') +
    el('Druh', 'N') +
    el('Dobropis', '0') +
    el('PredKontac', '') +
    el('ZpVypDPH', '1') +
    el('SazbaDPH1', '21') +
    el('SazbaDPH2', '12') +
    xmlSouhrnDph(souhrn) +
    el('Celkem', castkaText(doklad.Castka)) +
    el('Typ', 'ZBOŽÍ') +
    el('Vystavil', 'Nomis Faktury') +
    xmlDodOdb(doklad.Dodavatel || '', doklad.ICO_dodavatele || '') +
    '<SeznamPolozek>' + skutecnePolozky.map(xmlPolozka).join('') + '</SeznamPolozek>' +
    xmlMojeFirma(mojeFirma, doklad.Mena) +
    '</FaktPrij>'
  );
}

function xmlFaktVyd(faktura, polozky, mojeFirma, cisRada) {
  const skutecnePolozky =
    polozky && polozky.length
      ? polozky
      : [nahradniPolozka(faktura.Zakaznik || 'Vydaná faktura', faktura.Castka, faktura.Sazba_DPH)];
  const souhrn = spocitejSouhrnDph(skutecnePolozky);
  const datum = faktura.Datum_vystaveni || '';

  return (
    '<FaktVyd>' +
    el('Doklad', faktura.Cislo_faktury || faktura.ID) +
    el('Storno', '0') +
    el('GUID', guid()) +
    el('Rada', 'FV') +
    el('CisRada', String(cisRada)) +
    el('Popis', faktura.Zakaznik || '') +
    el('Vystaveno', datum) +
    el('DatUcPr', datum) +
    el('PlnenoDPH', datum) +
    el('Splatno', faktura.Datum_splatnosti || datum) +
    el('DatSkPoh', datum) +
    el('KonstSym', '') +
    el('KodDPH', '19Ř01,02') +
    el('VarSymbol', faktura.Cislo_faktury || '') +
    el('SpecSymbol', '') +
    el('Ucet', 'BAN') +
    el('Druh', 'N') +
    el('Dobropis', '0') +
    el('Uhrada', 'převodem') +
    el('PredKontac', '') +
    el('ZpVypDPH', '1') +
    el('SazbaDPH1', '21') +
    el('SazbaDPH2', '12') +
    xmlSouhrnDph(souhrn) +
    el('Celkem', castkaText(faktura.Castka)) +
    el('Typ', 'ZBOŽÍ') +
    el('Vystavil', 'Nomis Faktury') +
    xmlDodOdb(faktura.Zakaznik || '', faktura.ICO_zakaznika || '') +
    xmlKonecPrij(faktura.Zakaznik || '', faktura.ICO_zakaznika || '') +
    '<SeznamPolozek>' + skutecnePolozky.map(xmlPolozka).join('') + '</SeznamPolozek>' +
    xmlMojeFirma(mojeFirma, faktura.Mena) +
    '</FaktVyd>'
  );
}

function ico8(firma) {
  const ico = String((firma && firma.ICO) || '').replace(/\D/g, '');
  return ico || '00000000';
}

function kodAgendy(firma) {
  const nazev = String((firma && firma.Nazev) || 'FIRMA')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return (nazev || 'FIRMA').slice(0, 10);
}

// Sestaví kompletní XML pro Přijaté faktury (Doklady) - `polozkyPodleId` je
// mapa Doklad_ID -> pole položek (appka je čte z Doklady_Polozky, viz
// netlify/functions/export-money-s3.js).
function vytvorXmlPrijateFaktury(doklady, polozkyPodleId, firma, ted) {
  const casovaZnacka = ted || new Date();
  const rok = casovaZnacka.getFullYear();
  const telaFaktur = doklady
    .map((d, idx) => xmlFaktPrij(d, (polozkyPodleId && polozkyPodleId[d.ID]) || [], firma, idx + 1))
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<MoneyData' +
    ' ICAgendy="' + xmlEscape(ico8(firma)) + '"' +
    ' KodAgendy="' + xmlEscape(kodAgendy(firma)) + '"' +
    ' HospRokOd="' + rok + '-01-01"' +
    ' HospRokDo="' + rok + '-12-31"' +
    ' description="Přijaté faktury - export z appky Nomis Faktury"' +
    ' ExpZkratka="_FP"' +
    ' ExpDate="' + casovaZnacka.toISOString().slice(0, 10) + '"' +
    ' ExpTime="' + casovaZnacka.toISOString().slice(11, 19) + '"' +
    ' VyberZaznamu="0"' +
    ' GUID="' + guid() + '"' +
    '>' +
    '<SeznamFaktPrij>' + telaFaktur + '</SeznamFaktPrij>' +
    '<SeznamFaktPrij_DPP/>' +
    '</MoneyData>'
  );
}

// Sestaví kompletní XML pro Vydané faktury (Vydane_faktury) - `polozkyPodleId`
// je mapa Faktura_ID -> pole položek (z Vydane_Faktury_Polozky).
function vytvorXmlVydaneFaktury(faktury, polozkyPodleId, firma, ted) {
  const casovaZnacka = ted || new Date();
  const rok = casovaZnacka.getFullYear();
  const telaFaktur = faktury
    .map((f, idx) => xmlFaktVyd(f, (polozkyPodleId && polozkyPodleId[f.ID]) || [], firma, idx + 1))
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<MoneyData' +
    ' ICAgendy="' + xmlEscape(ico8(firma)) + '"' +
    ' KodAgendy="' + xmlEscape(kodAgendy(firma)) + '"' +
    ' HospRokOd="' + rok + '-01-01"' +
    ' HospRokDo="' + rok + '-12-31"' +
    ' description="Vydané faktury - export z appky Nomis Faktury"' +
    ' ExpZkratka="_FV"' +
    ' ExpDate="' + casovaZnacka.toISOString().slice(0, 10) + '"' +
    ' ExpTime="' + casovaZnacka.toISOString().slice(11, 19) + '"' +
    ' VyberZaznamu="0"' +
    ' GUID="' + guid() + '"' +
    '>' +
    '<SeznamFaktVyd>' + telaFaktur + '</SeznamFaktVyd>' +
    '<SeznamFaktVyd_DPP/>' +
    '</MoneyData>'
  );
}

module.exports = { vytvorXmlPrijateFaktury, vytvorXmlVydaneFaktury };
