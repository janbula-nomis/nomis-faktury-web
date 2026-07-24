/**
 * lib/excelExport.js
 * Sestavení stahovatelných XLSX sešitů pro záložku Export (Přijaté faktury),
 * Vydané faktury, Bankovní výpisy a Daňový přehled (od v4.28, Jan: „můžeme
 * přidat ještě export do Excel?“ - appka export do XML pro Money S3 už měla
 * od v4.27, tohle je paralelní, obecnější export čitelný přímo v Excelu/
 * Google Sheets, ne určený k importu do konkrétního účetního programu).
 *
 * Appka používá knihovnu "xlsx" (SheetJS), kterou appka v projektu už má
 * jako závislost (viz package.json) a používá ji od v3.6 pro ČTENÍ XLS/XLSX
 * bankovních výpisů (lib/bankImportTabular.js) - appka ji teď použije i pro
 * ZÁPIS. Stejný obranný vzor jako appka má u čtení: appka `require('xlsx')`
 * obalí try/catch a vyhodí srozumitelnou chybu, pokud by knihovna z nějakého
 * důvodu chyběla (nemělo by nastat v reálném nasazení - jde jen o pojistku).
 *
 * Appka NEPOUŽÍVÁ formátovací styly (barvy/ohraničení) - sešity jsou čisté
 * datové tabulky (jeden řádek = jeden záznam), appka to považuje za
 * dostatečné pro účetní/kontrolní použití v Excelu. Číselné sloupce appka
 * zapisuje jako SKUTEČNÁ ČÍSLA (ne text), ať jde v Excelu rovnou sčítat.
 */

function nactiXlsxKnihovnu() {
  let XLSX;
  try {
    // eslint-disable-next-line global-require
    XLSX = require('xlsx');
  } catch (e) {
    throw new Error(
      'Appka nemá k dispozici knihovnu pro sestavení XLSX souborů (balíček "xlsx" ' +
        'není nainstalovaný - v reálném nasazení na Netlify by tohle nemělo nastat, ' +
        'zkuste spustit "npm install" a nasadit znovu).'
    );
  }
  return XLSX;
}

function cisloNebo(hodnota, vychozi) {
  if (hodnota === '' || hodnota === null || hodnota === undefined) return vychozi === undefined ? '' : vychozi;
  const cislo = Number(String(hodnota).replace(',', '.'));
  return Number.isFinite(cislo) ? cislo : (vychozi === undefined ? '' : vychozi);
}

function sestavSesit(listy) {
  const XLSX = nactiXlsxKnihovnu();
  const sesit = XLSX.utils.book_new();
  listy.forEach(({ nazev, hlavicky, radky }) => {
    const data = [hlavicky, ...radky];
    const list = XLSX.utils.aoa_to_sheet(data);
    // Appka nechá sloupcům rozumnou minimální šířku, ať název ve sloupci
    // není hned useknutý po otevření v Excelu (appka nepočítá přesnou
    // šířku podle obsahu - jen bezpečný fixní odhad podle délky hlavičky).
    list['!cols'] = hlavicky.map((h) => ({ wch: Math.max(12, String(h).length + 2) }));
    // List Excelu smí mít max. 31 znaků v názvu a nesmí obsahovat některé
    // znaky (/, \, ?, *, [, ]) - appka název pro jistotu ořízne/očistí.
    const bezpecnyNazev = String(nazev).replace(/[\\/?*[\]]/g, '').slice(0, 31) || 'List';
    XLSX.utils.book_append_sheet(sesit, list, bezpecnyNazev);
  });
  return XLSX.write(sesit, { type: 'buffer', bookType: 'xlsx' });
}

/** Přijaté faktury (Doklady) + jejich položky, jako dva listy jednoho sešitu. */
function vytvorExcelDoklady(doklady, polozkyPodleId) {
  const hlavickyDoklady = [
    'Datum dokladu', 'Dodavatel', 'Číslo dokladu', 'Částka', 'Měna', 'DPH',
    'Sazba DPH (%)', 'Kategorie', 'Středisko', 'Firma', 'Variabilní symbol',
    'Stav', 'Poznámka',
  ];
  const radkyDoklady = doklady.map((d) => [
    d.Datum_dokladu || '',
    d.Dodavatel || '',
    d.Cislo_dokladu || '',
    cisloNebo(d.Castka, 0),
    d.Mena || 'CZK',
    cisloNebo(d.DPH, ''),
    cisloNebo(d.Sazba_DPH, ''),
    d.Kategorie || '',
    d.Stredisko || '',
    d.Firma_potvrzena || d.Firma_AI_odhad || '',
    d.Variabilni_symbol || '',
    d.Stav || '',
    d.Poznamka || '',
  ]);

  const hlavickyPolozky = ['ID dokladu', 'Dodavatel', 'Datum dokladu', 'Název položky', 'Množství', 'Cena', 'Sazba DPH (%)', 'Pořadí'];
  const radkyPolozky = [];
  doklady.forEach((d) => {
    (polozkyPodleId[d.ID] || []).forEach((p) => {
      radkyPolozky.push([
        d.ID,
        d.Dodavatel || '',
        d.Datum_dokladu || '',
        p.Nazev || '',
        cisloNebo(p.Mnozstvi, ''),
        cisloNebo(p.Cena, 0),
        cisloNebo(p.SazbaDPH, ''),
        cisloNebo(p.Poradi, ''),
      ]);
    });
  });

  return sestavSesit([
    { nazev: 'Prijate_faktury', hlavicky: hlavickyDoklady, radky: radkyDoklady },
    { nazev: 'Polozky', hlavicky: hlavickyPolozky, radky: radkyPolozky },
  ]);
}

/** Vydané faktury + jejich položky, jako dva listy jednoho sešitu. */
function vytvorExcelVydaneFaktury(faktury, polozkyPodleId) {
  const hlavickyFaktury = [
    'Datum vystavení', 'Zákazník', 'Číslo faktury', 'Částka', 'Měna', 'DPH',
    'Sazba DPH (%)', 'Jednotka', 'Firma', 'Stav', 'Datum úhrady', 'Poznámka',
  ];
  const radkyFaktury = faktury.map((f) => [
    f.Datum_vystaveni || '',
    f.Zakaznik || '',
    f.Cislo_faktury || '',
    cisloNebo(f.Castka, 0),
    f.Mena || 'CZK',
    cisloNebo(f.DPH, ''),
    cisloNebo(f.Sazba_DPH, ''),
    f.Jednotka || '',
    f.Firma || '',
    f.Stav || '',
    f.Datum_uhrady || '',
    f.Poznamka || '',
  ]);

  const hlavickyPolozky = ['ID faktury', 'Zákazník', 'Datum vystavení', 'Název položky', 'Množství', 'Cena', 'Sazba DPH (%)', 'Pořadí'];
  const radkyPolozky = [];
  faktury.forEach((f) => {
    (polozkyPodleId[f.ID] || []).forEach((p) => {
      radkyPolozky.push([
        f.ID,
        f.Zakaznik || '',
        f.Datum_vystaveni || '',
        p.Nazev || '',
        cisloNebo(p.Mnozstvi, ''),
        cisloNebo(p.Cena, 0),
        cisloNebo(p.SazbaDPH, ''),
        cisloNebo(p.Poradi, ''),
      ]);
    });
  });

  return sestavSesit([
    { nazev: 'Vydane_faktury', hlavicky: hlavickyFaktury, radky: radkyFaktury },
    { nazev: 'Polozky', hlavicky: hlavickyPolozky, radky: radkyPolozky },
  ]);
}

/** Bankovní pohyby jedné firmy (a volitelně období), jeden list. */
function vytvorExcelBanka(pohyby) {
  const hlavicky = [
    'Datum', 'Částka', 'Měna', 'Typ pohybu', 'Protistrana', 'Popis',
    'Variabilní symbol', 'Stav párování', 'Středisko', 'Typ daně', 'Poznámka',
  ];
  const radky = pohyby.map((p) => [
    p.Datum || '',
    cisloNebo(p.Castka, 0),
    p.Mena || 'CZK',
    p.Typ_pohybu || '',
    p.Protistrana || '',
    p.Popis || '',
    p.Variabilni_symbol || '',
    p.Stav_parovani || '',
    p.Stredisko || '',
    p.Typ_dane || '',
    p.Poznamka || '',
  ]);
  return sestavSesit([{ nazev: 'Bankovni_pohyby', hlavicky, radky }]);
}

/**
 * Daňový přehled - appka exportuje stejná dvě čísla, která appka počítá i
 * pro obrazovku (netlify/functions/danovy-prehled.js): DPH bilance (podle
 * měsíce) a skutečně zaplacené/vrácené daně (podle měsíce), jako dva listy.
 * `dphBilanceMesicni`/`danovePlatbyMesicni` appka očekává ve stejném tvaru,
 * v jakém je vrací danovy-prehled.js (obdobi -> firma -> ...).
 */
function vytvorExcelDanovyPrehled(dphBilanceMesicni, danovePlatbyMesicni) {
  const hlavickyDph = ['Měsíc', 'Firma', 'DPH na vydaných fakturách', 'DPH na přijatých dokladech', 'Saldo'];
  const radkyDph = [];
  Object.keys(dphBilanceMesicni).sort().forEach((mesic) => {
    Object.keys(dphBilanceMesicni[mesic]).sort().forEach((firma) => {
      const p = dphBilanceMesicni[mesic][firma];
      radkyDph.push([mesic, firma, cisloNebo(p.dphVydane, 0), cisloNebo(p.dphPrijate, 0), cisloNebo(p.saldo, 0)]);
    });
  });

  const hlavickyDane = ['Měsíc', 'Firma', 'Typ daně', 'Částka (- zaplaceno / + vráceno)'];
  const radkyDane = [];
  Object.keys(danovePlatbyMesicni).sort().forEach((mesic) => {
    Object.keys(danovePlatbyMesicni[mesic]).sort().forEach((firma) => {
      Object.keys(danovePlatbyMesicni[mesic][firma]).sort().forEach((typ) => {
        radkyDane.push([mesic, firma, typ, cisloNebo(danovePlatbyMesicni[mesic][firma][typ], 0)]);
      });
    });
  });

  return sestavSesit([
    { nazev: 'DPH_bilance', hlavicky: hlavickyDph, radky: radkyDph },
    { nazev: 'Danove_platby', hlavicky: hlavickyDane, radky: radkyDane },
  ]);
}

module.exports = {
  vytvorExcelDoklady,
  vytvorExcelVydaneFaktury,
  vytvorExcelBanka,
  vytvorExcelDanovyPrehled,
};
