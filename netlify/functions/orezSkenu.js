/**
 * netlify/functions/orezSkenu.js
 * POST { id, dataBase64, mimeType?, filename? }  (Bearer token)
 * -> nahraje ořezanou verzi skenu na Drive jako NOVÝ soubor a doklad
 *    přepne na něj (Zdrojovy_soubor_ID/URL). Původní fotku nechá ležet.
 *
 * Proč to vzniklo (v4.49): Jan (2026-08-02) - "a je možné nyný dodělat
 * ořezání a nebo jde jen u nových?". Automatický ořez fotky appka zavedla
 * ve v4.48 (viz najdiDokladNaFotce() v public/app.js) a ten běží v
 * prohlížeči PŘED nahráním - doklady nahrané dřív ho tedy nikdy neviděly.
 * Tahle funkce je dodělání zpětně: appka sken stáhne přes /api/soubor,
 * pustí na něj úplně stejný ořez jako u nového nahrání a výsledek pošle
 * sem.
 *
 * Ořez SAMOTNÝ appka nedělá tady, ale v prohlížeči. Je to schválně:
 * - kód ořezu je jeden jediný (public/app.js), takže se zpětný a nový
 *   ořez nemůžou rozejít. Druhá implementace na serveru by se dřív nebo
 *   později chovala jinak než ta, kterou Jan vidí při focení.
 * - Netlify Function nemá canvas ani žádnou obrázkovou knihovnu, musela
 *   by se dotáhnout (sharp ~30 MB) - viz stejná úvaha u OpenCV.js ve
 *   v4.48, kde appka 8 MB WASM taky zavrhla. Nezkoušet znovu.
 *
 * ORIGINÁL appka NEMAŽE (Janova výslovná volba z AskUserQuestion,
 * varianta "Uložit ořez, originál nechat na Disku"). Ořez je odhad -
 * když se algoritmus splete a ukousne půlku dokladu, musí být pořád kam
 * se vrátit. Na Disku tak po zpětném ořezu zůstanou dva soubory, ten
 * původní už ale nikdo v appce neuvidí (doklad ukazuje na nový).
 * Pozor, ať se historie neopakuje: nepřidávat "úklid starých souborů",
 * dokud si to Jan výslovně neřekne - smazaná fotka dokladu je nevratná.
 *
 * Appka nahrává NOVÝ soubor, nepřepisuje obsah toho původního (drive
 * files.update s novým médiem). Kdyby přepisovala, byl by ořez nevratný
 * i s originálem, což je přesně to, čemu se Jan chtěl vyhnout.
 *
 * Práva: kdo smí doklad upravovat, smí i přeříznout jeho sken - stejné
 * pravidlo jako maPristupKDokladu() v netlify/functions/doklady.js
 * (admin všechno, ostatní jen svoje firmy). Schválený doklad appka
 * nechává na pokoji pro běžnou roli: schválený doklad už je podklad pro
 * účetnictví a vyměnit pod ním sken smí jen admin/účetní.
 */
const { Readable } = require('stream');
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient, getDriveClient } = require('../../lib/google');
const { readSheetObjects, updateRow } = require('../../lib/sheetsHelpers');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { json } = require('../../lib/http');

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKDokladu(uzivatel, doklad) {
  if (uzivatel.role === 'admin') return true;
  const firma = doklad.Firma_potvrzena || doklad.Firma_AI_odhad;
  return (uzivatel.firmy || []).includes(firma);
}

// Nový název appka odvodí z toho původního a přilepí "-orez". Kdyby Jan
// někdy hledal v Disku ručně, uvidí u sebe originál i ořez a pozná, co je
// co - a hlavně mu je Disk zobrazí vedle sebe, ne každý jinde v abecedě.
function nazevOrezu(puvodni) {
  const zaklad = String(puvodni || 'sken').replace(/\.[^.]+$/, '');
  return zaklad + '-orez.jpg';
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

  try {
    const telo = JSON.parse(event.body || '{}');
    const id = String(telo.id || '').trim();
    const dataBase64 = telo.dataBase64;
    const mimeType = telo.mimeType || 'image/jpeg';
    if (!id || !dataBase64) return json(400, { error: 'Chybí doklad nebo ořezaný obrázek.' });

    // Stejný limit jako u nahrání nového dokladu (upload.js) - Netlify
    // pouští tělo požadavku do zhruba 6 MB a base64 je o třetinu delší
    // než skutečné bajty. Ořez je vždycky menší než originál, takže tohle
    // v praxi nikdy nespadne, ale ať se to nechová jinak než upload.
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 4.5 * 1024 * 1024) {
      return json(413, { error: 'Ořezaný sken je moc velký (limit cca 4,5 MB).' });
    }

    const sheets = await getSheetsClient();
    const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
    const doklad = rows.find((d) => d.ID === id);
    if (!doklad) return json(404, { error: 'Doklad nenalezen.' });
    if (!maPristupKDokladu(uzivatel, doklad)) {
      return json(403, { error: 'K tomuhle dokladu nemáte přístup.' });
    }
    if (doklad.Stav === 'Schváleno' && !jeUcetniNeboAdmin(uzivatel)) {
      return json(403, { error: 'Sken u schváleného dokladu smí vyměnit jen účetní nebo administrátor.' });
    }

    const drive = await getDriveClient();
    // Původní název si appka bere z Disku, ne z listu - v Dokladech název
    // souboru vůbec není (viz DOKLADY_HEADERS), je tam jen ID a odkaz.
    // Když se to nepovede (soubor smazaný z Disku ručně), appka kvůli
    // názvu nepadá a pojmenuje ořez podle dokladu.
    let puvodniNazev = 'doklad-' + id;
    try {
      const info = await drive.files.get({ fileId: doklad.Zdrojovy_soubor_ID, fields: 'name' });
      if (info.data && info.data.name) puvodniNazev = info.data.name;
    } catch (e) {
      /* název není kritický, jede se dál */
    }

    const novy = await drive.files.create({
      requestBody: { name: nazevOrezu(puvodniNazev), parents: [process.env.INBOX_FOLDER_ID] },
      media: { mimeType, body: bufferToStream(buffer) },
      fields: 'id, webViewLink',
    });

    // Do listu appka sahá až TEĎ, když je nový soubor bezpečně na Disku.
    // Opačné pořadí by při spadlém uploadu nechalo doklad ukazovat na
    // soubor, který neexistuje - takhle nejhorší možný konec je osiřelý
    // soubor na Disku navíc, což nikomu nevadí.
    const aktualizovany = Object.assign({}, doklad, {
      Zdrojovy_soubor_ID: novy.data.id,
      Zdrojovy_soubor_URL: novy.data.webViewLink || '',
    });
    await updateRow(sheets, process.env.SPREADSHEET_ID, 'Doklady', DOKLADY_HEADERS, doklad._row, aktualizovany);

    return json(200, {
      ok: true,
      id,
      Zdrojovy_soubor_ID: novy.data.id,
      Zdrojovy_soubor_URL: novy.data.webViewLink || '',
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
