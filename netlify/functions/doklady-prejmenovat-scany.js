/**
 * netlify/functions/doklady-prejmenovat-scany.js
 * Hromadné pojmenování scanů přijatých faktur na Google Disku (od v4.63).
 *
 * POST { firma, rok?, mesic?, potvrdit? }
 *   potvrdit != true  -> NÁHLED: co by se přejmenovalo, nic se nemění
 *   potvrdit === true -> přejmenuje soubory na Disku
 *
 * Jan 2026-08-20: *„jestli je možné nějak exportovat hromadně doklady -
 * scany, které budou mít předem daný text souboru, který získají, např.
 * Z - zaúčtováno, S - spárováno a pak číslo dle systému"*. Vybral variantu
 * **přejmenovat na Disku a stáhnout si složku z Disku** - Google zip
 * poskládá sám a zvládne i stovky souborů, kdežto zip skládaný v Netlify
 * funkci by u většího výběru narazil na limit velikosti odpovědi.
 *
 * Tvar názvu řeší lib/nazvyScanu.js.
 *
 * ČTYŘI VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) NEJDŘÍV NÁHLED. Přejmenování desítek souborů jedním klepnutím je
 *    operace, kterou nejde vzít zpět jinak než ručně soubor po souboru.
 *    Appka proto bez `potvrdit: true` NEZAPISUJE - stejný vzor jako
 *    srovnání číslování (precislovani.js) a kontrola nájmů.
 * 2) MĚNÍ SE JEN NÁZEV. Žádný přesun mezi složkami, žádné mazání, žádná
 *    změna obsahu. `Zdrojovy_soubor_ID` v listu Doklady zůstává stejné,
 *    takže se appce nic nerozváže.
 * 3) JEN SCHVÁLENÉ DOKLADY JEDNÉ FIRMY. Účetnictví se vede po firmách a
 *    evidenční číslo (bez kterého název nedává smysl) vzniká až při
 *    schválení.
 * 4) STROP NA JEDEN BĚH JE VIDĚT. Netlify funkce má omezený čas; appka
 *    proto zpracuje nejvýš MAX_NA_BEH dokladů a kolik jich zbývá, NAPÍŠE.
 *    Tiché uříznutí by vypadalo jako „hotovo", a přitom by půlka složky
 *    zůstala nepojmenovaná.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { nazevScanu } = require('../../lib/nazvyScanu');
const { json } = require('../../lib/http');

// Kolik dokladů zvládne jeden běh. Každý znamená jedno čtení z Disku a
// (když se název mění) jeden zápis. Číslo je držené nízko schválně - radši
// dvakrát spustit než jednou spadnout na timeout uprostřed přejmenovávání.
const MAX_NA_BEH = 60;
// Kolik dotazů na Disk poběží najednou. Víc by riskovalo rate limit.
const SOUBEZNE = 6;

function ziskejFirmuDokladu(d) {
  return d.Firma_potvrzena || d.Firma_AI_odhad || '';
}

// Období dokladu se bere z DUZP, a když chybí, z data dokladu - stejné
// pravidlo jako v Daňovém přehledu a v Exportu, ať výběr „srpen 2026"
// znamená všude totéž.
function obdobiDokladu(d) {
  return String(d.DUZP || d.Datum_dokladu || '');
}

// Spouští `prace` nad položkami s omezeným souběhem. Výsledky drží
// v původním pořadí, ať se seznam v náhledu nepřehází mezi dvěma spuštěními.
async function poDavkach(polozky, limit, prace) {
  const vysledky = new Array(polozky.length);
  let dalsi = 0;
  const beznici = new Array(Math.min(limit, polozky.length)).fill(0).map(async () => {
    while (dalsi < polozky.length) {
      const i = dalsi;
      dalsi += 1;
      vysledky[i] = await prace(polozky[i], i);
    }
  });
  await Promise.all(beznici);
  return vysledky;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Hromadné pojmenování scanů smí spustit jen administrátor nebo účetní.' });
  }

  try {
    const telo = JSON.parse(event.body || '{}');
    const firma = String(telo.firma || '').trim();
    const rok = String(telo.rok || '').trim();
    const mesic = String(telo.mesic || '').trim();
    const potvrdit = telo.potvrdit === true;

    // Bez firmy ne. Účetní kontroluje jednu firmu a přejmenovat omylem
    // scany celé skupiny je přesně ten druh chyby, po které se to musí
    // opravovat ručně.
    if (!firma) return json(400, { error: 'Vyberte firmu.' });
    if (uzivatel.role !== 'admin' && !(uzivatel.firmy || []).includes(firma)) {
      return json(403, { error: 'Nemáte přístup k této firmě.' });
    }

    const sheets = await getSheetsClient();
    const { rows: doklady } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');

    // Stav spárování s bankou se tu dopočítává stejně jako v doklady.js -
    // do listu Doklady se nikde neukládá. Kdyby se to tady spočítalo jinak,
    // měl by soubor jinou předponu, než jakou appka ukazuje na obrazovce.
    const stavParovani = {};
    try {
      const { rows: pohyby } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Bankovni_pohyby');
      (pohyby || []).forEach((p) => {
        if (!p.Doklad_ID) return;
        if (stavParovani[p.Doklad_ID] === 'Potvrzeno') return;
        stavParovani[p.Doklad_ID] = p.Stav_parovani || '';
      });
    } catch (e) {
      // List nemusí existovat (appka bez zapnuté Banky) - předpona „S" se
      // pak objeví jen u dokladů hrazených mimo účet. Padat kvůli tomu ne.
    }

    const vybrane = (doklady || []).filter((d) => {
      if (d.Stav !== 'Schváleno') return false;                      // pravidlo 3
      if (ziskejFirmuDokladu(d) !== firma) return false;
      if (!d.Zdrojovy_soubor_ID) return false;                       // není co přejmenovat
      const obdobi = obdobiDokladu(d);
      if (rok && obdobi.slice(0, 4) !== rok) return false;
      if (mesic && obdobi.slice(5, 7) !== mesic) return false;
      return true;
    });

    const davka = vybrane.slice(0, MAX_NA_BEH);
    const zbyva = vybrane.length - davka.length;                     // pravidlo 4

    const drive = await getDriveClient();

    const polozky = await poDavkach(davka, SOUBEZNE, async (d) => {
      const zaklad = {
        id: d.ID,
        evidencni: d.Evidencni_cislo || '',
        dodavatel: d.Dodavatel || '',
      };
      let stary = '';
      try {
        const meta = await drive.files.get({ fileId: d.Zdrojovy_soubor_ID, fields: 'name' });
        stary = (meta.data && meta.data.name) || '';
      } catch (e) {
        return Object.assign(zaklad, {
          stary: '', novy: '', akce: 'preskoceno',
          duvod: 'Soubor se na Disku nepodařilo najít: ' + e.message,
        });
      }

      const spocteny = nazevScanu(
        Object.assign({}, d, { Stav_parovani_bankou: stavParovani[d.ID] || '' }),
        stary
      );
      if (!spocteny.nazev) {
        return Object.assign(zaklad, { stary, novy: '', akce: 'preskoceno', duvod: spocteny.duvod });
      }
      if (spocteny.nazev === stary) {
        // Idempotence: opakované spuštění nic nedělá a nic nehlásí jako
        // změnu. Účetní může tlačítko zmáčknout každý měsíc znovu.
        return Object.assign(zaklad, { stary, novy: spocteny.nazev, akce: 'beze-zmeny', duvod: '' });
      }

      if (!potvrdit) {                                                // pravidlo 1
        return Object.assign(zaklad, { stary, novy: spocteny.nazev, akce: 'prejmenovat', duvod: '' });
      }

      try {
        // Pravidlo 2: mění se JEN název.
        await drive.files.update({
          fileId: d.Zdrojovy_soubor_ID,
          requestBody: { name: spocteny.nazev },
        });
        return Object.assign(zaklad, { stary, novy: spocteny.nazev, akce: 'prejmenovano', duvod: '' });
      } catch (e) {
        return Object.assign(zaklad, {
          stary, novy: spocteny.nazev, akce: 'preskoceno',
          duvod: 'Přejmenování se nepovedlo: ' + e.message,
        });
      }
    });

    const spocti = (akce) => polozky.filter((p) => p.akce === akce).length;

    return json(200, {
      ok: true,
      rezim: potvrdit ? 'provedeno' : 'nahled',
      firma,
      celkem: vybrane.length,
      zpracovano: davka.length,
      zbyva,
      kPrejmenovani: spocti('prejmenovat'),
      prejmenovano: spocti('prejmenovano'),
      bezeZmeny: spocti('beze-zmeny'),
      preskoceno: spocti('preskoceno'),
      polozky,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
