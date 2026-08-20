/**
 * netlify/functions/doklady-prejmenovat-scany.js
 * Hromadné pojmenování scanů přijatých faktur na Google Disku (od v4.63).
 *
 * POST { firma, rok?, mesic?, potvrdit?, archivovat? }
 *   potvrdit != true  -> NÁHLED: co by se stalo, nic se nemění
 *   potvrdit === true -> provede
 *   archivovat === true -> soubor se navíc PŘESUNE do
 *     „Archiv dokladů / <firma> / <rok>" (viz lib/archivScanu.js)
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
 * 2) NIC SE NEMAŽE. Appka mění název a - v archivním režimu - složku,
 *    ve které soubor leží. Nikdy nic nemaže, nevyhazuje do koše ani
 *    nepřepisuje obsah. `Zdrojovy_soubor_ID` zůstává stejné, takže odkaz
 *    z appky funguje dál i po přesunu: Disk soubor zná podle ID, ne podle
 *    umístění.
 *
 *    (v4.69) Přesun je Janova volba - `00_Inbox` je jediná složka, kam od
 *    začátku padá úplně všechno (přijaté faktury všech firem, smlouvy,
 *    vydané faktury), takže z ní stáhnout „rok jedné firmy" nešlo.
 *    Přesunem se Inbox zároveň vyčistí a zbyde v něm nezpracované.
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
const { cestaArchivu, klicCesty, NAZEV_ARCHIVU } = require('../../lib/archivScanu');
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

/*
 * (v4.69) Najde nebo založí složku daného jména pod daným rodičem.
 *
 * Hledá se jen mezi NESMAZANÝMI složkami a jen přímo pod rodičem, ať se
 * nechytne stejnojmenná složka odjinud z Disku. Appka pracuje se scopem
 * `drive.file`, takže vidí jen to, co sama vytvořila - a archivní složky
 * vytváří sama, takže je i najde.
 *
 * Výsledky se v rámci jednoho běhu keší (`kes`), jinak by se pro každý
 * z šedesáti dokladů hledala ta samá složka znovu.
 */
async function zajistiSlozku(drive, nazev, rodicId, kes, klic) {
  if (kes.has(klic)) return kes.get(klic);

  const dotaz = [
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    "name = '" + String(nazev).replace(/'/g, "\\'") + "'",
    "'" + rodicId + "' in parents",
  ].join(' and ');

  const nalezene = await drive.files.list({
    q: dotaz, fields: 'files(id, name)', pageSize: 10,
  });
  let id = nalezene.data && nalezene.data.files && nalezene.data.files[0]
    ? nalezene.data.files[0].id : null;

  if (!id) {
    const vytvorena = await drive.files.create({
      requestBody: {
        name: nazev,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rodicId],
      },
      fields: 'id',
    });
    id = vytvorena.data.id;
  }
  kes.set(klic, id);
  return id;
}

/*
 * Kořen, pod který se archiv zakládá: nadřazená složka Inboxu, tedy
 * „Nomis Group - Doklady". Archiv tak sedí vedle `00_Inbox`, ne někde
 * v kořeni Disku, kde by ho nikdo nehledal.
 *
 * Když se rodič zjistit nedaří (starší Inbox, změněná práva), vrací se
 * `null` a archivace se kvůli tomu NEROZBĚHNE naslepo - endpoint to
 * ohlásí jako chybu. Založit archiv v kořeni Disku „aby to nějak prošlo"
 * by znamenalo rozsypat soubory na místo, kde je Jan nečeká.
 */
async function najdiKorenArchivu(drive) {
  const inbox = process.env.INBOX_FOLDER_ID;
  if (!inbox) return null;
  try {
    const meta = await drive.files.get({ fileId: inbox, fields: 'parents' });
    const rodice = (meta.data && meta.data.parents) || [];
    return rodice[0] || null;
  } catch (e) {
    return null;
  }
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
    const archivovat = telo.archivovat === true;

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

    // (v4.69) Kořen archivu se zjišťuje JEN když se archivuje, a když se
    // nezjistí, funkce se rovnou zastaví. Archivovat „někam" je horší než
    // nearchivovat vůbec.
    let korenArchivu = null;
    if (archivovat) {
      korenArchivu = await najdiKorenArchivu(drive);
      if (!korenArchivu) {
        return json(500, {
          error: 'Nepodařilo se najít složku, do které archiv patří (nadřazená složka Inboxu na Disku). '
            + 'Zkontrolujte INBOX_FOLDER_ID v Netlify a přístup appky k Disku.',
        });
      }
    }
    // Keš složek v rámci jednoho běhu - viz zajistiSlozku().
    const kesSlozek = new Map();

    // Složky se zakládají POSTUPNĚ, ne uvnitř souběžných úloh: dva
    // paralelní běhy by pro tentýž rok založily dvě stejnojmenné složky
    // (Disk to dovolí) a soubory by se rozpadly do obou.
    const cileArchivu = new Map();
    if (archivovat && potvrdit) {
      for (let i = 0; i < davka.length; i += 1) {
        const cesta = cestaArchivu(davka[i], firma);
        const klic = klicCesty(cesta);
        if (cileArchivu.has(klic)) continue;
        let rodic = korenArchivu;
        for (let u = 0; u < cesta.length; u += 1) {
          rodic = await zajistiSlozku(
            drive, cesta[u], rodic, kesSlozek, klicCesty(cesta.slice(0, u + 1))
          );
        }
        cileArchivu.set(klic, rodic);
      }
    }

    const polozky = await poDavkach(davka, SOUBEZNE, async (d) => {
      const cesta = cestaArchivu(d, firma);
      const zaklad = {
        id: d.ID,
        evidencni: d.Evidencni_cislo || '',
        dodavatel: d.Dodavatel || '',
        slozka: archivovat ? klicCesty(cesta) : '',
      };
      let stary = '';
      let rodice = [];
      try {
        const meta = await drive.files.get({ fileId: d.Zdrojovy_soubor_ID, fields: 'name, parents' });
        stary = (meta.data && meta.data.name) || '';
        rodice = (meta.data && meta.data.parents) || [];
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

      // Idempotence: opakované spuštění nic nedělá. V archivním režimu
      // musí sedět OBOJÍ - název i to, že soubor už v cílové složce leží.
      const cilId = cileArchivu.get(klicCesty(cesta));
      const uzJeVCili = !archivovat || (!!cilId && rodice.indexOf(cilId) !== -1);
      if (spocteny.nazev === stary && uzJeVCili) {
        return Object.assign(zaklad, { stary, novy: spocteny.nazev, akce: 'beze-zmeny', duvod: '' });
      }

      if (!potvrdit) {                                                // pravidlo 1
        return Object.assign(zaklad, {
          stary, novy: spocteny.nazev,
          akce: archivovat ? 'archivovat' : 'prejmenovat', duvod: '',
        });
      }

      try {
        // Pravidlo 2: mění se název a (v archivním režimu) složka. Nic se
        // nemaže - `addParents`/`removeParents` soubor jen přestěhuje.
        const pozadavek = {
          fileId: d.Zdrojovy_soubor_ID,
          requestBody: { name: spocteny.nazev },
        };
        if (archivovat && cilId && rodice.indexOf(cilId) === -1) {
          pozadavek.addParents = cilId;
          if (rodice.length) pozadavek.removeParents = rodice.join(',');
        }
        await drive.files.update(pozadavek);
        return Object.assign(zaklad, {
          stary, novy: spocteny.nazev,
          akce: archivovat ? 'archivovano' : 'prejmenovano', duvod: '',
        });
      } catch (e) {
        return Object.assign(zaklad, {
          stary, novy: spocteny.nazev, akce: 'preskoceno',
          duvod: (archivovat ? 'Uložení do archivu' : 'Přejmenování') + ' se nepovedlo: ' + e.message,
        });
      }
    });

    const spocti = (akce) => polozky.filter((p) => p.akce === akce).length;

    return json(200, {
      ok: true,
      rezim: potvrdit ? 'provedeno' : 'nahled',
      archivovat,
      korenArchivu: archivovat ? NAZEV_ARCHIVU : '',
      firma,
      celkem: vybrane.length,
      zpracovano: davka.length,
      zbyva,
      kPrejmenovani: spocti('prejmenovat') + spocti('archivovat'),
      prejmenovano: spocti('prejmenovano') + spocti('archivovano'),
      bezeZmeny: spocti('beze-zmeny'),
      preskoceno: spocti('preskoceno'),
      polozky,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
