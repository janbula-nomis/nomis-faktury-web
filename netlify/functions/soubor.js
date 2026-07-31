/**
 * netlify/functions/soubor.js
 * GET ?id=<Drive file ID>[&typ=doklad|faktura|smlouva] (Bearer token)
 *   -> vrátí BINÁRNÍ obsah naskenovaného souboru z Google Drive.
 *
 * Proč tahle funkce vůbec vznikla (v4.40): Jan nahlásil - "app u jiných
 * uživatelů odmítne otevřít scan, blokuje to google". Appka do v4.39 dávala
 * do chipu "Otevřít sken" přímo `webViewLink` na drive.google.com (viz
 * odkazOtevritSken() v public/app.js). Jenže soubory na Drive vznikají pod
 * JANOVÝM Google účtem (appka se ke Google hlásí jedním OAuth refresh
 * tokenem, viz lib/google.js) a s nikým sdílené nejsou. Když na takový
 * odkaz klikne kdokoli jiný, prohlížeč jde rovnou na Google - a ten
 * neposuzuje přihlášení do appky, ale VLASTNÍ Google účet toho člověka.
 * Ten k souboru pochopitelně přístup nemá, takže dostane "Potřebujete
 * přístup / Request access" a appka o tom vůbec neví.
 *
 * Zvažované varianty a proč appka vybrala právě tuhle (Jan schválil návrh
 * "proxy přes appku", viz PNG návrh v chatu):
 *   a) nastavit souborům na Drive sdílení "kdokoli s odkazem může číst" -
 *      nejmíň kódu, ale odkaz na fakturu by pak otevřel úplně kdokoli,
 *      komu se dostane do ruky, bez přihlášení a bez ohledu na firmu;
 *   b) nasdílet složku Inbox konkrétním Google účtům kolegů - vyžaduje,
 *      aby každý měl Google účet a byl v prohlížeči přihlášený PRÁVĚ tím
 *      účtem; appka ale přihlašuje PINem, takže hlavně na mobilu (kde je
 *      běžně přihlášený soukromý účet) by to selhávalo dál;
 *   c) TAHLE varianta - soubor si vyzvedne appka svým vlastním přihlášením
 *      a pošle ho uživateli sama. Prohlížeč uživatele s Googlem vůbec
 *      nemluví, takže Google nemá co blokovat. Navíc si appka může (a
 *      dělá to, viz níž) ověřit, že dotyčný na doklad vůbec má právo -
 *      což u varianty (a) nejde vůbec.
 *
 * Oprávnění: appka NEDÁVÁ soubor komukoli, kdo zná ID. Nejdřív najde řádek,
 * ke kterému soubor patří (Doklady / Vydane_faktury / Smlouvy_Prilohy /
 * Smlouvy), a teprve pak na něj pustí STEJNOU kontrolu firmy, jakou má
 * příslušný list i pro data samotná:
 *   - Doklady          -> admin vidí vše, ostatní jen svoje firmy
 *                         (Firma_potvrzena, jinak Firma_AI_odhad);
 *   - Vydane_faktury   -> admin vidí vše, ostatní jen svoje firmy;
 *   - Smlouvy(_Prilohy)-> jen admin/účetní, a k tomu kontrola firmy.
 * Soubor, který k žádnému viditelnému řádku nepatří, appka nevydá (404) -
 * ID souboru samo o sobě tedy není "heslo".
 *
 * `typ` je jen NEPOVINNÁ nápověda, aby appka nemusela číst všechny čtyři
 * listy - kontrolu práv appka dělá vždycky stejně, ať nápověda přijde nebo
 * ne. Bez nápovědy appka projde všechny čtyři listy (paralelně).
 *
 * Velikost skenu (v4.43): Netlify Functions umí vrátit tělo do cca 6 MB, a
 * protože binární obsah appka posílá jako base64 (+33 %), na jednu odpověď
 * se vejdou zhruba 4 MB původního souboru. Ve v4.40 proto appka u většího
 * skenu vracela 413 a frontend uživatele poslal na původní Drive odkaz -
 * jenže tam kolega narazí přesně na to "Request access", kvůli kterému celá
 * tahle funkce vznikla. A protože upload pouští soubory do 4,5 MB, vzniklo
 * hluché pásmo 4-4,5 MB: sken se nahrál, ale otevřít ho šlo jen Janovi.
 *
 * Od v4.43 proto appka velký sken NEODMÍTÁ, jen si ho vyzvedne po kusech:
 * frontend volá tuhle funkci opakovaně s `&od=<bajt>` a odpovědi si slepí do
 * jednoho blobu. Každý kus je nejvýš KUS_BAJTU (3,5 MB), z Drive ho appka
 * tahá hlavičkou `Range`, takže se nikdy nestahuje víc, než se do odpovědi
 * vejde. Kolik ještě zbývá, appka řekne hlavičkami `X-Sken-Celkem` /
 * `X-Sken-Od` / `X-Sken-Do`.
 *
 * Práva se kontrolují u KAŽDÉHO kusu znovu (funkce je bezstavová) - kus není
 * "propustka" k dalším kusům.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { json } = require('../../lib/http');

// Kolik bajtů původního souboru appka pošle v JEDNÉ odpovědi. 3,5 MB je po
// zakódování do base64 cca 4,7 MB, takže je pod 6MB stropem Netlify i s
// rezervou na hlavičky. Větší sken si frontend vyžádá po víc kusech.
const KUS_BAJTU = Math.round(3.5 * 1024 * 1024);

// Pojistka proti nesmyslu (poškozený řádek, obří soubor omylem nahraný jinudy
// do Inboxu). 60 MB = cca 18 kusů, což je ještě únosné; nad to appka raději
// řekne, že sken nepodá, než aby uživatel čekal minuty.
const STROP_BAJTU = 60 * 1024 * 1024;

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

// (v4.42) Řádky ve stavu "Zpracovává se" ještě firmu nemají - AI ji teprve
// vytěžuje, nebo ji někdo musí potvrdit. Seznamy (vydaneFaktury.js,
// smlouvy.js) na ně mají zvláštní pravidlo: dokud je firma prázdná,
// rozhoduje role, případně to, že řádek nahrál sám přihlášený uživatel.
// Ve v4.40 to appka u skenů nezkopírovala, takže správce ES viděl v seznamu
// fakturu i smlouvu "Zpracovává se", ale při otevření skenu dostal 403.
// Tyhle dvě pomocné funkce tu nesrovnalost odstraňují - drží pravidla
// skenu a seznamu doslova stejná.
function smiFakturuBezFirmy(uzivatel, radek) {
  return (
    uzivatel.role === 'admin' ||
    uzivatel.role === 'ucetni' ||
    radek.Nahral_uzivatel === uzivatel.jmeno
  );
}
function smiSmlouvuBezFirmy(uzivatel, radek) {
  return uzivatel.role === 'admin' || radek.Nahral_uzivatel === uzivatel.jmeno;
}

// Popis jednotlivých listů, ve kterých může nahraný soubor "bydlet".
// `firma` vrací firmu daného řádku, `smi` rozhoduje o přístupu - obojí
// schválně kopíruje pravidla z příslušné funkce (doklady.js,
// vydaneFaktury.js, smlouvy.js), ať se chování skenu neliší od chování dat.
const ZDROJE = {
  doklad: {
    list: 'Doklady',
    // Doklady zvláštní pravidlo pro "Zpracovává se" nemají - doklady.js
    // pouští jen podle firmy (potvrzené, jinak odhadnuté AI), takže tady
    // appka schválně nic navíc nepřidává.
    smi: (uzivatel, radek) =>
      maPristupKFirme(uzivatel, radek.Firma_potvrzena || radek.Firma_AI_odhad || ''),
  },
  faktura: {
    list: 'Vydane_faktury',
    smi: (uzivatel, radek) =>
      radek.Firma
        ? maPristupKFirme(uzivatel, radek.Firma)
        : smiFakturuBezFirmy(uzivatel, radek),
  },
  priloha: {
    list: 'Smlouvy_Prilohy',
    // Přílohy smlouvy samy firmu nenesou - je na nadřazené smlouvě. Appka
    // proto rovnou dohledá smlouvu; osiřelou přílohu (smlouva už neexistuje)
    // appka pustí jen adminovi, ať se sken nedá vytáhnout obcházením.
    // Smlouvy.js vrací přílohy podle viditelnosti nadřazené smlouvy, takže
    // i tady appka na smlouvu použije úplně stejné pravidlo včetně stavu
    // "Zpracovává se".
    smi: (uzivatel, radek, kontext) => {
      if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') return false;
      const smlouva = (kontext.smlouvy || []).find((s) => s.ID === radek.Smlouva_ID);
      if (!smlouva) return uzivatel.role === 'admin';
      return smlouva.Firma
        ? maPristupKFirme(uzivatel, smlouva.Firma)
        : smiSmlouvuBezFirmy(uzivatel, smlouva);
    },
    potrebujeSmlouvy: true,
  },
  smlouva: {
    list: 'Smlouvy',
    smi: (uzivatel, radek) =>
      (uzivatel.role === 'admin' || uzivatel.role === 'ucetni') &&
      (radek.Firma
        ? maPristupKFirme(uzivatel, radek.Firma)
        : smiSmlouvuBezFirmy(uzivatel, radek)),
  },
};

// Chybějící list (např. Smlouvy_Prilohy v tabulce, kde ještě neproběhl
// /api/setup) appka nebere jako chybu celého požadavku - jen ho přeskočí a
// hledá dál v ostatních listech.
function nactiListBezpecne(sheets, spreadsheetId, nazev) {
  return readSheetObjects(sheets, spreadsheetId, nazev).catch(() => ({ rows: [] }));
}

async function najdiRadekSeSouborem(sheets, spreadsheetId, klice, souborId) {
  const nactene = await Promise.all(
    klice.map((k) => nactiListBezpecne(sheets, spreadsheetId, ZDROJE[k].list))
  );

  const index = klice.findIndex(
    (k, i) => (nactene[i].rows || []).some((r) => r.Zdrojovy_soubor_ID === souborId)
  );
  if (index === -1) return null;

  const zdroj = ZDROJE[klice[index]];
  const radek = nactene[index].rows.find((r) => r.Zdrojovy_soubor_ID === souborId);

  // Smlouvy appka dotahuje jen tehdy, když je pro rozhodnutí o právech
  // opravdu potřebuje (příloha smlouvy) - u dokladu/faktury je to zbytečné
  // volání Sheets API navíc.
  let kontext = { smlouvy: [] };
  if (zdroj.potrebujeSmlouvy) {
    const jizNactene = klice.indexOf('smlouva');
    kontext = {
      smlouvy:
        jizNactene !== -1
          ? nactene[jizNactene].rows || []
          : (await nactiListBezpecne(sheets, spreadsheetId, 'Smlouvy')).rows || [],
    };
  }

  return { zdroj, radek, kontext };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  try {
    const parametry = event.queryStringParameters || {};
    const souborId = (parametry.id || '').trim();
    if (!souborId) return json(400, { error: 'Chybí ID souboru.' });

    const typ = (parametry.typ || '').trim();
    const klice = ZDROJE[typ] ? [typ] : Object.keys(ZDROJE);

    const sheets = await getSheetsClient();
    const nalez = await najdiRadekSeSouborem(sheets, process.env.SPREADSHEET_ID, klice, souborId);

    // Pokud nápověda `typ` byla vedle (např. sken přiřazený k dokladu, který
    // uživatel otevřel z detailu bankovního pohybu), appka to nevzdává a
    // zkusí ještě zbytek listů - nápověda má appce šetřit čtení, ne bránit
    // v nalezení souboru.
    const nalezFinal =
      nalez ||
      (klice.length === 1
        ? await najdiRadekSeSouborem(
            sheets,
            process.env.SPREADSHEET_ID,
            Object.keys(ZDROJE).filter((k) => k !== typ),
            souborId
          )
        : null);

    if (!nalezFinal) {
      return json(404, { error: 'Sken se nepodařilo najít (soubor už u žádného dokladu není).' });
    }
    if (!nalezFinal.zdroj.smi(uzivatel, nalezFinal.radek, nalezFinal.kontext)) {
      return json(403, { error: 'K tomuhle skenu nemáte přístup.' });
    }

    const drive = await getDriveClient();

    // (v4.43) Soubor, který na Drive nevznikl přes appku, appka VIDĚT NEMŮŽE -
    // OAuth scope je `drive.file`, tedy "jen vlastní soubory" (viz
    // lib/google.js). Typicky se to stane u smlouvy, ke které někdo vložil
    // odkaz na Drive ručně. Dřív to skončilo obecnou pětistovkou; teď appka
    // řekne rovnou, co s tím, ať se to nehledá v logu.
    let meta;
    try {
      meta = await drive.files.get({ fileId: souborId, fields: 'name, mimeType, size' });
    } catch (e) {
      const kod = (e && (e.code || (e.response && e.response.status))) || 0;
      if (kod === 404 || kod === 403) {
        return json(404, {
          error:
            'Tenhle soubor appka na Google Drive nevidí - nebyl do něj nahraný přes appku ' +
            '(nejspíš u něj je jen ručně vložený odkaz). Nahrajte ho prosím do appky znovu ' +
            'jako přílohu, pak půjde otevřít všem, kdo na něj mají právo.',
          mimoAppku: true,
        });
      }
      throw e;
    }

    const velikost = Number(meta.data.size || 0);
    if (velikost > STROP_BAJTU) {
      return json(413, {
        error: 'Sken je moc velký na to, aby ho appka podala (' +
          Math.round(velikost / 1024 / 1024 * 10) / 10 + ' MB).',
        prilisVelky: true,
      });
    }

    // Který kus souboru si frontend říká. `od` mimo rozsah appka utne na
    // konec, ať se nedá vynutit prázdná nekonečná smyčka.
    const od = Math.max(0, Math.min(parseInt(parametry.od, 10) || 0, Math.max(0, velikost - 1)));
    const do_ = velikost ? Math.min(od + KUS_BAJTU - 1, velikost - 1) : 0;
    const posledni = !velikost || do_ >= velikost - 1;

    // Range appka posílá vždycky, i u malých souborů - Drive na něj odpoví
    // 206 s přesně tímhle úsekem, takže se nikdy nestáhne víc, než se do
    // odpovědi Netlify vejde. (Bez Range by si funkce stáhla do paměti klidně
    // celých 50 MB jen proto, aby z nich poslala první 3,5.)
    const obsah = await drive.files.get(
      { fileId: souborId, alt: 'media' },
      { responseType: 'arraybuffer', headers: { Range: 'bytes=' + od + '-' + do_ } }
    );
    const buffer = Buffer.from(obsah.data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': meta.data.mimeType || 'application/octet-stream',
        // `inline` schválně, ne `attachment` - Jan chce sken VIDĚT, ne ho
        // stahovat (u exportu do Excelu/Money S3 je to naopak, viz
        // lib/http.js). Název souboru appka posílá kvůli tomu, ať má
        // případné ruční stažení z náhledu rozumné jméno.
        'Content-Disposition':
          'inline; filename="' + String(meta.data.name || 'sken').replace(/"/g, '') + '"',
        // Podle těchhle hlaviček frontend pozná, jestli si má říct o další
        // kus (viz otevriSken() v public/app.js). `Expose-Headers` je tu
        // kvůli tomu, aby je JS směl vůbec přečíst.
        'X-Sken-Celkem': String(velikost),
        'X-Sken-Od': String(od),
        'X-Sken-Do': String(do_),
        'X-Sken-Posledni': posledni ? '1' : '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Setup-Secret',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Expose-Headers': 'X-Sken-Celkem, X-Sken-Od, X-Sken-Do, X-Sken-Posledni',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
      isBase64Encoded: true,
      body: buffer.toString('base64'),
    };
  } catch (e) {
    return json(500, { error: e.message });
  }
};
