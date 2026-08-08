/**
 * netlify/functions/predpis-plateb.js
 * Předpis plateb u nájemní smlouvy (od v4.59).
 *
 * Jan 2026-08-08: *„zajisti aby se nájemní smlouva vytěžila AI a vznikl
 * předpis plateb, včetně kauce, zálohy a to je nutné párovat s bankovními
 * výpisy"*.
 *
 * GET    ?smlouva_id=X            -> { predpisy: [ … ], souhrn: { … } }
 * GET    ?stredisko=X[&rok=RRRR]  -> totéž napříč smlouvami jednoho bytu
 * POST   { smlouva_id }           -> vygeneruje chybějící předpisy
 * PATCH  { id, zmeny }            -> ruční úprava jednoho řádku
 * DELETE ?id=X                    -> smazání jednoho řádku
 *
 * DVĚ VĚCI, KTERÉ SE TU NESMÍ ZMĚNIT
 *
 * 1) POST je PŘÍRŮSTKOVÝ. Nikdy nepřepíše ani nesmaže řádek, který už
 *    existuje - jen doplní měsíce, které chybí. Kdyby přegeneroval
 *    všechno, přišlo by se o Uhrazeno, Pohyb_ID i ruční poznámky
 *    („za květen odpuštěno") a spárované platby by osiřely. Když se změní
 *    částka ve smlouvě, appka **nechá staré řádky být** a Jan si je opraví
 *    nebo smaže sám - jinak by přepsala i měsíce, které jsou dávno
 *    zaplacené jinou částkou.
 * 2) Stav se sám nepřepíná. Řádek se stane „Uhrazeno" až potvrzením
 *    spárování člověkem (přes /api/banka), ne tím, že si někdo otevře
 *    tuhle obrazovku.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { PREDPIS_HEADERS } = require('../../lib/predpisSchema');
const { vygenerujPredpisy } = require('../../lib/predpisPlateb');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

// Souhrn pro obrazovku. Stav „po splatnosti" se schválně jen POČÍTÁ, do
// tabulky se nezapisuje - viz komentář u MOZNOSTI_STAV_PREDPISU.
function spocitejSouhrn(predpisy, dnes) {
  let predepsano = 0;
  let uhrazeno = 0;
  let poSplatnosti = 0;
  predpisy.forEach((p) => {
    if (p.Stav === 'Odpuštěno') return;
    const celkem = parsujCastkuZListu(p.Castka_celkem);
    const zaplaceno = parsujCastkuZListu(p.Uhrazeno);
    predepsano += celkem;
    uhrazeno += zaplaceno;
    if (zaplaceno < celkem && String(p.Splatnost || '') && String(p.Splatnost) < dnes) poSplatnosti += 1;
  });
  return {
    pocet: predpisy.length,
    predepsano,
    uhrazeno,
    dluh: Math.round((predepsano - uhrazeno) * 100) / 100,
    poSplatnosti,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Nemovitosti jsou dostupné jen administrátorovi a účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const qs = event.queryStringParameters || {};
  const dnes = new Date().toISOString().slice(0, 10);

  try {
    const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
    const smlouvyById = new Map((smlouvyVsechny || []).map((s) => [s.ID, s]));
    // Předpis smí vidět jen ten, kdo vidí jeho smlouvu.
    const viditelne = new Set((smlouvyVsechny || [])
      .filter((s) => maPristupKFirme(uzivatel, s.Firma))
      .map((s) => s.ID));

    if (event.httpMethod === 'GET') {
      const smlouvaId = String(qs.smlouva_id || '').trim();
      const stredisko = String(qs.stredisko || '').trim();
      const rok = String(qs.rok || '').trim();
      if (!smlouvaId && !stredisko) return json(400, { error: 'Zadejte smlouva_id nebo stredisko.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Predpis_plateb');
      let predpisy = (rows || []).filter((p) => viditelne.has(p.Smlouva_ID));

      if (smlouvaId) {
        if (!viditelne.has(smlouvaId)) return json(403, { error: 'Nemáte přístup k této smlouvě.' });
        predpisy = predpisy.filter((p) => p.Smlouva_ID === smlouvaId);
      } else {
        const smlouvyStrediska = new Set((smlouvyVsechny || [])
          .filter((s) => s.Stredisko === stredisko && viditelne.has(s.ID))
          .map((s) => s.ID));
        predpisy = predpisy.filter((p) => smlouvyStrediska.has(p.Smlouva_ID));
      }
      // Kauce nemá Obdobi, takže by při řazení podle něj skončila mimo -
      // řadí se proto podle splatnosti, která je vyplněná vždycky.
      if (rok) predpisy = predpisy.filter((p) => String(p.Splatnost || '').slice(0, 4) === rok || String(p.Obdobi || '').slice(0, 4) === rok);
      predpisy.sort((a, b) => (String(a.Splatnost) < String(b.Splatnost) ? -1 : 1));

      return json(200, { predpisy, souhrn: spocitejSouhrn(predpisy, dnes) });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const smlouvaId = String(telo.smlouva_id || '').trim();
      if (!smlouvaId) return json(400, { error: 'Chybí smlouva_id.' });
      if (!viditelne.has(smlouvaId)) return json(403, { error: 'Nemáte přístup k této smlouvě.' });

      const smlouva = smlouvyById.get(smlouvaId);
      const vysledek = vygenerujPredpisy(smlouva, { dnes });
      if (vysledek.predpisy.length === 0) {
        return json(400, { error: vysledek.chyba || 'Z téhle smlouvy nejde předpis plateb sestavit.' });
      }

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Predpis_plateb');
      // Klíč existence: smlouva + typ + období. U kauce je období prázdné,
      // takže na jednu smlouvu vznikne právě jedna.
      const uzJsou = new Set((rows || [])
        .filter((p) => p.Smlouva_ID === smlouvaId)
        .map((p) => p.Typ + '|' + (p.Obdobi || '')));

      let pridano = 0;
      for (const p of vysledek.predpisy) {
        if (uzJsou.has(p.Typ + '|' + (p.Obdobi || ''))) continue;
        await appendRow(sheets, spreadsheetId, 'Predpis_plateb', PREDPIS_HEADERS,
          Object.assign({ ID: crypto.randomUUID() }, p));
        pridano += 1;
      }

      return json(200, {
        ok: true,
        pridano,
        preskoceno: vysledek.predpisy.length - pridano,
        jeNeurcita: vysledek.jeNeurcita,
        doKdyVygenerovano: vysledek.doKdyVygenerovano,
        // U doby neurčité je strop vidět, ne schovaný - Jan má vědět, že
        // za pět let bude potřeba předpis prodloužit.
        upozorneni: vysledek.jeNeurcita
          ? 'Smlouva je na dobu neurčitou, předpis je vygenerovaný do ' + vysledek.doKdyVygenerovano
            + '. Až se ta doba přiblíží, spusťte generování znovu.'
          : '',
      });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID předpisu.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Predpis_plateb');
      const predpis = (rows || []).find((p) => p.ID === id);
      if (!predpis) return json(404, { error: 'Předpis nenalezen.' });
      if (!viditelne.has(predpis.Smlouva_ID)) return json(403, { error: 'Nemáte přístup k této smlouvě.' });

      const upravene = Object.assign({}, zmeny || {});
      // Vazby se PATCHem nepřepisují - jinak by se řádek dal odpojit od
      // smlouvy a osiřel by i s navázanou platbou.
      delete upravene.ID;
      delete upravene.Smlouva_ID;

      await updateRow(sheets, spreadsheetId, 'Predpis_plateb', PREDPIS_HEADERS,
        predpis._row, Object.assign({}, predpis, upravene));
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = String(qs.id || '').trim();
      if (!id) return json(400, { error: 'Chybí ID předpisu.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Predpis_plateb');
      const predpis = (rows || []).find((p) => p.ID === id);
      if (!predpis) return json(404, { error: 'Předpis nenalezen.' });
      if (!viditelne.has(predpis.Smlouva_ID)) return json(403, { error: 'Nemáte přístup k této smlouvě.' });
      // Zaplacený předpis se nemaže - je to doklad o tom, co bylo
      // předepsáno a uhrazeno. Nejdřív se musí odpojit platba.
      if (parsujCastkuZListu(predpis.Uhrazeno) > 0) {
        return json(400, { error: 'Na tenhle předpis je navázaná platba – nejdřív ji odpojte v Bankovních výpisech.' });
      }

      await deleteRow(sheets, spreadsheetId, 'Predpis_plateb', predpis._row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
