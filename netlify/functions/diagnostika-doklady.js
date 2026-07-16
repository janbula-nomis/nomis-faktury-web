/**
 * netlify/functions/diagnostika-doklady.js
 *
 * ČISTĚ ČTECÍ (žádný zápis) diagnostická funkce k opravě chyby posunutých
 * sloupců u listu Doklady (viz README-DEPLOY.md, sekce o opravě v3.10 a
 * lib/sheetsHelpers.js) - appka dřív zapisovala Stav/Stredisko/SPZ_auta/
 * Hrazeno_mimo_ucet/Poznamka/Nahral_uzivatel na pozice podle AKTUÁLNÍHO
 * schématu v kódu (DOKLADY_HEADERS), ne podle skutečného hlavičkového
 * řádku v listu - pokud list nemá sloupce Stredisko/Hrazeno_mimo_ucet
 * (typicky proto, že `/api/setup` nebylo spuštěno po verzích v3.0/v3.6),
 * hodnoty se zapisovaly o 1-2 sloupce vedle skutečného významu podle
 * hlavičky. Tahle funkce NEOPRAVUJE data automaticky (u vícekrát
 * upravovaných řádků totiž může být PŮVODNÍ hodnota Poznamka/
 * Nahral_uzivatel už nenávratně přepsaná další chybnou úpravou - viz
 * poznámka níž), jen ukáže, co se skutečně nachází ve kterém sloupci u
 * KAŽDÉHO řádku, aby šlo Stav/Středisko (ty JSOU spolehlivě
 * rekonstruovatelné) ručně opravit přímo v Google Sheets.
 *
 * Použití: GET na /.netlify/functions/diagnostika-doklady s hlavičkou
 *   X-Setup-Secret: <stejná hodnota SETUP_SECRET jako u /api/setup>
 */
const { getSheetsClient } = require('../../lib/google');
const { json } = require('../../lib/http');

const ZNAMY_STAV = ['Ke kontrole', 'Schváleno', 'Možná duplicita', 'Zpracovává se', ''];

function vypadaJakoStredisko(hodnota) {
  const h = String(hodnota || '');
  if (!h) return false;
  return /^Auto\s*-/.test(h) || /byt|garáž|Holečkova|V Parku|Ramonova/i.test(h);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const hlavicky = event.headers || {};
  const secret = hlavicky['x-setup-secret'] || hlavicky['X-Setup-Secret'];
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return json(403, { error: 'Neplatný nebo chybějící X-Setup-Secret.' });
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    // Záměrně SUROVÉ čtení (ne přes readSheetObjects), ať appka vidí i
    // hodnoty v případných "neoznačených" sloupcích za koncem skutečné
    // hlavičky - tam podle diagnózy skončily hodnoty Poznamka/
    // Nahral_uzivatel u nejvíc posunutých řádků.
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Doklady' });
    const vsechnyRadky = res.data.values || [];
    if (vsechnyRadky.length === 0) {
      return json(200, { ok: true, zprava: 'List Doklady je prázdný.', radky: [] });
    }

    const hlavickaSkutecna = vsechnyRadky[0];
    const idxID = hlavickaSkutecna.indexOf('ID');
    const idxDodavatel = hlavickaSkutecna.indexOf('Dodavatel');
    const idxKategorie = hlavickaSkutecna.indexOf('Kategorie');
    const idxSpz = hlavickaSkutecna.indexOf('SPZ_auta');
    const idxStav = hlavickaSkutecna.indexOf('Stav');
    const idxPoznamka = hlavickaSkutecna.indexOf('Poznamka');
    const idxNahral = hlavickaSkutecna.indexOf('Nahral_uzivatel');
    const maStredisko = hlavickaSkutecna.includes('Stredisko');
    const maHrazenoMimoUcet = hlavickaSkutecna.includes('Hrazeno_mimo_ucet');

    const radky = [];
    for (let i = 1; i < vsechnyRadky.length; i++) {
      const r = vsechnyRadky[i];
      const skutecnaHodnotaSpz = idxSpz !== -1 ? (r[idxSpz] || '') : '';
      const skutecnaHodnotaStav = idxStav !== -1 ? (r[idxStav] || '') : '';
      const extraSloupce = r.slice(hlavickaSkutecna.length).filter((v) => v !== undefined && v !== '');

      const maSkryteSloupce = extraSloupce.length > 0;
      const spzVypadaJakoStredisko = vypadaJakoStredisko(skutecnaHodnotaSpz);
      const stavNevypadaZnamy = skutecnaHodnotaStav !== '' && !ZNAMY_STAV.includes(skutecnaHodnotaStav);
      const vypadaPosunuto = maSkryteSloupce || spzVypadaJakoStredisko || stavNevypadaZnamy;

      const zaznam = {
        ID: idxID !== -1 ? r[idxID] : '(neznámé)',
        Dodavatel: idxDodavatel !== -1 ? r[idxDodavatel] : '',
        vypadaPosunuto,
        aktualneCteAppka: {
          SPZ_auta: skutecnaHodnotaSpz,
          Stav: skutecnaHodnotaStav,
          Poznamka: idxPoznamka !== -1 ? (r[idxPoznamka] || '') : '',
          Nahral_uzivatel: idxNahral !== -1 ? (r[idxNahral] || '') : '',
        },
      };

      if (vypadaPosunuto && idxSpz !== -1 && idxStav !== -1 && idxNahral !== -1) {
        // Nejpravděpodobnější rekonstrukce (appka od v3.6 zapisovala pořadí
        // ...Kategorie, Stredisko, SPZ_auta, Hrazeno_mimo_ucet, Stav,
        // Poznamka, Nahral_uzivatel - tenhle posun o 2 sloupce je teď
        // nejčastější, appka je na v3.6+ už dlouho). Stav a Stredisko jsou
        // spolehlivě rekonstruovatelné (jasně rozpoznatelné hodnoty -
        // Stav je z uzavřeného výčtu, Stredisko odpovídá vzoru "Auto - ..."
        // nebo názvu nemovitosti). Poznamka/Nahral_uzivatel u řádků
        // upravovaných VÍCKRÁT po sobě od doby, kdy vznikl tenhle bug,
        // mohou být PŘEPSANÉ už napořád (každá další úprava posunuté
        // řádky jen znovu přepsala podle stejného vzorce) - appka je uvádí
        // jen jako nejlepší odhad, ne jistotu.
        zaznam.nejpravdepodobnejsiSkutecnaData = {
          Stredisko: skutecnaHodnotaSpz,
          SPZ_auta_puvodni: skutecnaHodnotaStav,
          Stav_skutecny: idxNahral !== -1 ? (r[idxNahral] || '') : '',
          Poznamka_odhad: r[idxNahral + 1] || '',
          Nahral_uzivatel_odhad: r[idxNahral + 2] || '',
          duveryhodnostStavStredisko: 'vysoká (jasně rozpoznatelný vzor hodnoty)',
          duveryhodnostPoznamkaNahral: 'nízká - pokud byl doklad upravován vícekrát od vzniku chyby, může být původní hodnota už přepsaná',
        };
      }

      radky.push(zaznam);
    }

    const pocetPosunutych = radky.filter((r) => r.vypadaPosunuto).length;

    return json(200, {
      ok: true,
      listMaSloupecStredisko: maStredisko,
      listMaSloupecHrazenoMimoUcet: maHrazenoMimoUcet,
      zprava:
        (!maStredisko || !maHrazenoMimoUcet
          ? 'List Doklady zatím nemá sloupec ' +
            [!maStredisko ? 'Stredisko' : null, !maHrazenoMimoUcet ? 'Hrazeno_mimo_ucet' : null].filter(Boolean).join(' ani ') +
            ' - spusťte prosím /api/setup, appka ho bezpečně doplní na konec (nic nemaže/nepřepisuje). '
          : '') +
        pocetPosunutych + ' z ' + radky.length + ' dokladů vypadá, že má posunuté sloupce (Stav/Středisko/SPZ/Poznámka/' +
        'Nahral_uzivatel). U pole "nejpravdepodobnejsiSkutecnaData" je Stav_skutecny a Stredisko spolehlivý odhad, ' +
        'Poznamka_odhad/Nahral_uzivatel_odhad jen orientační - doporučujeme opravit Stav/Stredisko ručně přímo ' +
        'v Google Sheets podle téhle diagnózy (u pár dokladů je to otázka pár minut), appka od aktuální verze ' +
        'už dál sloupce neposouvá.',
      pocetRadku: radky.length,
      pocetVypadajicichPosunute: pocetPosunutych,
      radky,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
