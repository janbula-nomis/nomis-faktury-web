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
 * Limit velikosti: Netlify Functions umí vrátit tělo do cca 6 MB, a protože
 * binární obsah appka posílá jako base64 (+33 %), reálný strop je kolem
 * 4 MB původního souboru. Upload appka omezuje na 4,5 MB, takže drtivá
 * většina skenů projde - u většího souboru appka vrátí 413 s příznakem
 * `prilisVelky`, na což frontend zareaguje otevřením původního Drive odkazu
 * (Janovi funguje vždycky, kolegovi aspoň řekne Google srozumitelně, co se
 * děje - lepší než prázdná stránka).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { json } = require('../../lib/http');

// Cca 4 MB - viz poznámka o base64 a 6MB stropu Netlify výš.
const MAX_BAJTU = 4 * 1024 * 1024;

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

// Popis jednotlivých listů, ve kterých může nahraný soubor "bydlet".
// `firma` vrací firmu daného řádku, `smi` rozhoduje o přístupu - obojí
// schválně kopíruje pravidla z příslušné funkce (doklady.js,
// vydaneFaktury.js, smlouvy.js), ať se chování skenu neliší od chování dat.
const ZDROJE = {
  doklad: {
    list: 'Doklady',
    smi: (uzivatel, radek) =>
      maPristupKFirme(uzivatel, radek.Firma_potvrzena || radek.Firma_AI_odhad || ''),
  },
  faktura: {
    list: 'Vydane_faktury',
    smi: (uzivatel, radek) => maPristupKFirme(uzivatel, radek.Firma || ''),
  },
  priloha: {
    list: 'Smlouvy_Prilohy',
    // Přílohy smlouvy samy firmu nenesou - je na nadřazené smlouvě. Appka
    // proto rovnou dohledá smlouvu; osiřelou přílohu (smlouva už neexistuje)
    // appka pustí jen adminovi, ať se sken nedá vytáhnout obcházením.
    smi: (uzivatel, radek, kontext) => {
      if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') return false;
      const smlouva = (kontext.smlouvy || []).find((s) => s.ID === radek.Smlouva_ID);
      if (!smlouva) return uzivatel.role === 'admin';
      return maPristupKFirme(uzivatel, smlouva.Firma || '');
    },
    potrebujeSmlouvy: true,
  },
  smlouva: {
    list: 'Smlouvy',
    smi: (uzivatel, radek) =>
      (uzivatel.role === 'admin' || uzivatel.role === 'ucetni') &&
      maPristupKFirme(uzivatel, radek.Firma || ''),
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

    const meta = await drive.files.get({ fileId: souborId, fields: 'name, mimeType, size' });
    const velikost = Number(meta.data.size || 0);
    if (velikost > MAX_BAJTU) {
      return json(413, {
        error: 'Sken je moc velký na to, aby ho appka podala sama (' +
          Math.round(velikost / 1024 / 1024 * 10) / 10 + ' MB).',
        prilisVelky: true,
      });
    }

    const obsah = await drive.files.get(
      { fileId: souborId, alt: 'media' },
      { responseType: 'arraybuffer' }
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Setup-Secret',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
