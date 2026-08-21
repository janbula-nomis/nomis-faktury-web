/**
 * netlify/functions/dodatky.js
 * Dodatky k nájemním smlouvám (od v4.83) - listy "Dodatky" a
 * "Dodatky_Zmeny". Schéma i rozbor, proč jsou to dva listy a ne volný
 * text, jsou v lib/dodatkySchema.js.
 *
 * GET    ?smlouva_id=X   -> { dodatky: [...], zmeny: [...] }
 * POST   ?entita=dodatky -> nový dodatek
 * POST   ?entita=zmeny   -> nový řádek změny
 * PATCH  ?entita=…       -> { id, zmeny }
 * DELETE ?entita=…&id=X  -> smazání (u dodatku i jeho řádků změn)
 * GET    ?akce=nahled&dodatek_id=X  -> co by promítnutí udělalo (JEN ČTE)
 * POST   { akce: 'promitnout', dodatek_id } -> zapíše to
 *
 * PROMÍTNUTÍ JE SAMOSTATNÁ AKCE, NE VEDLEJŠÍ EFEKT ULOŽENÍ.
 *
 * Jan si ve volbě vybral, že dodatek měnící nájemné nebo účet se má do
 * smlouvy promítnout **až po jeho potvrzení**. Uložení dodatku tedy se
 * smlouvou NEHÝBE - kdyby ano, překlep v rozepsaném dodatku by tiše
 * rozhodil předpis plateb a kontrolu úhrad. Stejné pravidlo jako
 * u rejstříkového doplnění firem (v4.80) a WiFi (v4.82): náhled → zápis.
 *
 * Přístup: admin a účetní, stejně jako celý modul Nemovitosti a Smlouvy.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const {
  DODATKY_HEADERS, DODATKY_ZMENY_HEADERS, popisPole, jePovolenePole, popisDopadu,
} = require('../../lib/dodatkySchema');
const { SMLOUVY_HEADERS } = require('../../lib/smlouvySchema');
const { PRONAJIMATELE_HEADERS } = require('../../lib/pronajimateleSchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

const ENTITY = {
  dodatky: { sheet: 'Dodatky', headers: DODATKY_HEADERS },
  zmeny: { sheet: 'Dodatky_Zmeny', headers: DODATKY_ZMENY_HEADERS },
};

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

/*
 * Dodatek je vidět jen tomu, kdo vidí jeho smlouvu. Odvozuje se to přes
 * Smlouvy.Firma - dodatek sám Firmu nenese, stejně jako ji nenesou klíče
 * ani měřidla (viz netlify/functions/nemovitosti-detaily.js).
 */
async function smlouvaDodatku(sheets, spreadsheetId, smlouvaId) {
  const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
  return rows.find((s) => s.ID === smlouvaId) || null;
}

/**
 * Co by promítnutí udělalo. ČISTÝ VÝPOČET nad načtenými daty.
 *
 * U každé změny vrací STAROU hodnotu čtenou právě teď - ne tu, která
 * platila, když Jan dodatek psal. Kdyby se mezitím nájem změnil jinudy,
 * musí to být v náhledu vidět.
 */
function spocitejPromitnuti(dodatek, zmeny, smlouva, pronajimatel) {
  const kroky = [];
  zmeny.forEach((z) => {
    const cil = String(z.Cil || 'Smlouva').trim();
    const pole = String(z.Pole || '').trim();
    const nova = String(z.Nova_hodnota || '').trim();

    if (!pole) return;
    if (!jePovolenePole(cil, pole)) {
      kroky.push({
        cil, pole, popis: popisPole(cil, pole), nova,
        preskoceno: 'Tohle pole dodatek měnit nesmí.',
      });
      return;
    }
    const zaznam = cil === 'Pronajimatel' ? pronajimatel : smlouva;
    if (!zaznam) {
      kroky.push({
        cil, pole, popis: popisPole(cil, pole), nova,
        preskoceno: cil === 'Pronajimatel'
          ? 'Smlouva nemá vybraného pronajímatele, není co změnit.'
          : 'Smlouva se nenašla.',
      });
      return;
    }
    const stara = String(zaznam[pole] || '').trim();
    kroky.push({
      cil, pole, popis: popisPole(cil, pole), stara, nova,
      beze_zmeny: stara === nova,
      dopad: popisDopadu(cil),
    });
  });
  return { dodatek, kroky };
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
    return json(403, { error: 'Dodatky jsou dostupné jen administrátorovi a účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const qs = event.queryStringParameters || {};

  try {
    // ---- náhled promítnutí (jen čte) ----
    if (event.httpMethod === 'GET' && qs.akce === 'nahled') {
      const vysledek = await pripravPromitnuti(sheets, spreadsheetId, uzivatel, qs.dodatek_id);
      if (vysledek.chyba) return json(vysledek.stav, { error: vysledek.chyba });
      return json(200, Object.assign({ ok: true, zapsano: false }, vysledek.navrh));
    }

    if (event.httpMethod === 'GET') {
      const smlouvaId = String(qs.smlouva_id || '').trim();
      if (!smlouvaId) return json(400, { error: 'Chybí smlouva_id.' });

      const smlouva = await smlouvaDodatku(sheets, spreadsheetId, smlouvaId);
      if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });
      if (!maPristupKFirme(uzivatel, smlouva.Firma)) {
        return json(403, { error: 'Nemáte přístup k této firmě.' });
      }

      const { rows: dodatky } = await readSheetObjects(sheets, spreadsheetId, 'Dodatky');
      const moje = dodatky.filter((d) => d.Smlouva_ID === smlouvaId);
      const { rows: zmeny } = await readSheetObjects(sheets, spreadsheetId, 'Dodatky_Zmeny');
      const idcka = moje.map((d) => d.ID);
      return json(200, {
        dodatky: moje,
        zmeny: zmeny.filter((z) => idcka.includes(z.Dodatek_ID)),
      });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');

      // ---- promítnutí do smlouvy (zapisuje) ----
      if (String(telo.akce || '') === 'promitnout') {
        const vysledek = await pripravPromitnuti(sheets, spreadsheetId, uzivatel, telo.dodatek_id);
        if (vysledek.chyba) return json(vysledek.stav, { error: vysledek.chyba });

        const { navrh, smlouva, pronajimatel, dodatek } = vysledek;
        for (let i = 0; i < navrh.kroky.length; i += 1) {
          const krok = navrh.kroky[i];
          if (krok.preskoceno || krok.beze_zmeny) continue;
          if (krok.cil === 'Pronajimatel') {
            await updateRow(sheets, spreadsheetId, 'Pronajimatele', PRONAJIMATELE_HEADERS,
              pronajimatel._row, Object.assign({}, pronajimatel, { [krok.pole]: krok.nova }));
            pronajimatel[krok.pole] = krok.nova;
          } else {
            await updateRow(sheets, spreadsheetId, 'Smlouvy', SMLOUVY_HEADERS,
              smlouva._row, Object.assign({}, smlouva, { [krok.pole]: krok.nova }));
            smlouva[krok.pole] = krok.nova;
          }
        }

        // Stav se přepíná až TEĎ - je to záznam toho, co se stalo.
        await updateRow(sheets, spreadsheetId, 'Dodatky', DODATKY_HEADERS, dodatek._row,
          Object.assign({}, dodatek, { Stav: 'Promítnutý' }));

        return json(200, Object.assign({ ok: true, zapsano: true }, navrh));
      }

      const entita = ENTITY[String(qs.entita || '').trim()];
      if (!entita) return json(400, { error: 'Neznámá entita. Očekává se dodatky nebo zmeny.' });

      if (entita.sheet === 'Dodatky') {
        const smlouvaId = String(telo.Smlouva_ID || '').trim();
        if (!smlouvaId) return json(400, { error: 'Dodatek musí patřit ke smlouvě.' });
        const smlouva = await smlouvaDodatku(sheets, spreadsheetId, smlouvaId);
        if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });
        if (!maPristupKFirme(uzivatel, smlouva.Firma)) {
          return json(403, { error: 'Nemáte přístup k této firmě.' });
        }
      }

      const zaznam = { ID: crypto.randomUUID() };
      entita.headers.forEach((h) => {
        if (h === 'ID') return;
        zaznam[h] = telo[h] !== undefined ? String(telo[h]).trim() : '';
      });
      if (entita.sheet === 'Dodatky' && !zaznam.Stav) zaznam.Stav = 'Návrh';
      await appendRow(sheets, spreadsheetId, entita.sheet, entita.headers, zaznam);
      return json(200, { ok: true, polozka: zaznam });
    }

    if (event.httpMethod === 'PATCH') {
      const entita = ENTITY[String(qs.entita || '').trim()];
      if (!entita) return json(400, { error: 'Neznámá entita.' });
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, entita.sheet);
      const zaznam = rows.find((r) => r.ID === id);
      if (!zaznam) return json(404, { error: 'Záznam nenalezen.' });

      const upravene = Object.assign({}, zmeny || {});
      delete upravene.ID;
      // Vazba se needituje - přesunout dodatek pod jinou smlouvu znamená
      // založit nový, ne přepsat odkaz pod rukama.
      delete upravene.Smlouva_ID;
      delete upravene.Dodatek_ID;

      await updateRow(sheets, spreadsheetId, entita.sheet, entita.headers, zaznam._row,
        Object.assign({}, zaznam, upravene));
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const entita = ENTITY[String(qs.entita || '').trim()];
      if (!entita) return json(400, { error: 'Neznámá entita.' });
      const id = String(qs.id || '').trim();
      if (!id) return json(400, { error: 'Chybí ID.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, entita.sheet);
      const zaznam = rows.find((r) => r.ID === id);
      if (!zaznam) return json(404, { error: 'Záznam nenalezen.' });

      // Se smazaným dodatkem jdou i jeho řádky změn - jinak by v tabulce
      // zůstaly viset změny, ke kterým už není dokument. Maže se odzadu,
      // ať se řádky pod sebou neposouvají.
      if (entita.sheet === 'Dodatky') {
        const { rows: zmenyVse } = await readSheetObjects(sheets, spreadsheetId, 'Dodatky_Zmeny');
        const kSmazani = zmenyVse.filter((z) => z.Dodatek_ID === id)
          .sort((a, b) => b._row - a._row);
        for (let i = 0; i < kSmazani.length; i += 1) {
          await deleteRow(sheets, spreadsheetId, 'Dodatky_Zmeny', kSmazani[i]._row);
        }
      }

      await deleteRow(sheets, spreadsheetId, entita.sheet, zaznam._row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

/*
 * Společná příprava pro náhled i zápis - obojí musí počítat úplně stejně,
 * jinak by Jan potvrdil jeden výsledek a dostal jiný.
 */
async function pripravPromitnuti(sheets, spreadsheetId, uzivatel, dodatekId) {
  const id = String(dodatekId || '').trim();
  if (!id) return { chyba: 'Chybí dodatek_id.', stav: 400 };

  const { rows: dodatky } = await readSheetObjects(sheets, spreadsheetId, 'Dodatky');
  const dodatek = dodatky.find((d) => d.ID === id);
  if (!dodatek) return { chyba: 'Dodatek nenalezen.', stav: 404 };

  const smlouva = await smlouvaDodatku(sheets, spreadsheetId, dodatek.Smlouva_ID);
  if (!smlouva) return { chyba: 'Smlouva dodatku nenalezena.', stav: 404 };
  if (!maPristupKFirme(uzivatel, smlouva.Firma)) {
    return { chyba: 'Nemáte přístup k této firmě.', stav: 403 };
  }

  let pronajimatel = null;
  try {
    const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Pronajimatele');
    pronajimatel = rows.find((p) => p.ID === smlouva.Pronajimatel_ID)
      || rows.find((p) => String(p.Firma || '').trim() === String(smlouva.Firma || '').trim())
      || null;
  } catch (e) {
    // List Pronajimatele nemusí existovat (tabulka bez nového /api/setup).
    // Změny mířící na pronajímatele se pak v náhledu vypíšou jako
    // přeskočené, místo aby celá akce spadla.
    pronajimatel = null;
  }

  const { rows: zmenyVse } = await readSheetObjects(sheets, spreadsheetId, 'Dodatky_Zmeny');
  const zmeny = zmenyVse.filter((z) => z.Dodatek_ID === id);

  return {
    navrh: spocitejPromitnuti(dodatek, zmeny, smlouva, pronajimatel),
    dodatek,
    smlouva,
    pronajimatel,
  };
}
