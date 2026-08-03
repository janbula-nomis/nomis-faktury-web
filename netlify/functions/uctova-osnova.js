/**
 * netlify/functions/uctova-osnova.js
 * Správa účtové osnovy (od v4.52) - list "Uctova_osnova" v Sheets, viz
 * lib/uctovaOsnovaSchema.js. Stejný CRUD vzor jako
 * netlify/functions/predkontace.js.
 *
 * GET    -> { ucty: [...] } smí kterýkoli přihlášený uživatel - appka
 *           potřebuje osnovu i u obyčejného zobrazení dokladu (ukazuje u
 *           účtu popis, aby Jan viděl, co "518002" znamená).
 *           POST/PATCH/DELETE jen role "admin"/"ucetni" - je to účetní
 *           nastavení, stejné omezení jako u předkontací.
 * POST   { Firma, Ucet, Popis, Poznamka } -> nový řádek. Appka odmítne
 *           duplicitní kombinaci Firma+Ucet (dva stejné účty u jedné firmy
 *           by v nabídce vypadaly jako chyba).
 * POST   { akce: 'vychozi', Firma } -> nasype do listu výchozí účty z
 *           lib/kontaceVychozi.js pro danou firmu. Přidá JEN ty, které
 *           firma ještě nemá - nic nepřepisuje ani nemaže, takže se dá
 *           pustit opakovaně a Janovy úpravy přežijí.
 * PATCH  { row, zmeny } -> úprava kteréhokoli pole
 * DELETE ?row=N -> smaže řádek. Předkontace, které ten účet používaly,
 *           zůstanou beze změny - appka u nich pak jen napíše, že účet
 *           v osnově není.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { UCTOVA_OSNOVA_HEADERS } = require('../../lib/uctovaOsnovaSchema');
const { vychoziUctyProFirmu } = require('../../lib/kontaceVychozi');
const { json } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

// Číslo účtu appka drží jako text a porovnává po odstranění mezer - Jan
// ho může někam napsat jako "518 002" a je to pořád tentýž účet.
function normalizujUcet(vstup) {
  return String(vstup == null ? '' : vstup).replace(/\s+/g, '').trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (event.httpMethod !== 'GET' && !jeUcetniNeboAdmin(uzivatel)) {
    return json(403, { error: 'Tuto akci může provést jen administrátor nebo účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Uctova_osnova');
      return json(200, { ucty: rows });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');

      // --- nasypání výchozích účtů z Kontace.xlsx ---
      if (telo.akce === 'vychozi') {
        const firma = String(telo.Firma || '').trim();
        if (!firma) return json(400, { error: 'Firma je povinná.' });

        const vychozi = vychoziUctyProFirmu(firma);
        if (!vychozi.length) {
          return json(400, { error: `Pro firmu "${firma}" appka žádné výchozí účty nemá - zadejte je ručně.` });
        }

        const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Uctova_osnova');
        const uzMa = new Set(
          existujici
            .filter((u) => u.Firma === firma)
            .map((u) => normalizujUcet(u.Ucet)),
        );

        let pridano = 0;
        for (const u of vychozi) {
          if (uzMa.has(normalizujUcet(u.Ucet))) continue;
          // Sekvenčně, ne přes Promise.all - appka na jeden list zapisuje
          // po jednom řádku, aby si dva souběžné appendy nepřepsaly pozici.
          // eslint-disable-next-line no-await-in-loop
          await appendRow(sheets, spreadsheetId, 'Uctova_osnova', UCTOVA_OSNOVA_HEADERS, {
            Firma: u.Firma,
            Ucet: u.Ucet,
            Popis: u.Popis,
            Poznamka: u.Poznamka || '',
          });
          pridano += 1;
        }

        return json(200, {
          ok: true,
          pridano,
          preskoceno: vychozi.length - pridano,
        });
      }

      // --- běžné založení jednoho účtu ---
      const firma = String(telo.Firma || '').trim();
      const ucet = normalizujUcet(telo.Ucet);
      if (!firma) return json(400, { error: 'Firma je povinná.' });
      if (!ucet) return json(400, { error: 'Číslo účtu je povinné.' });

      const { rows: existujici } = await readSheetObjects(sheets, spreadsheetId, 'Uctova_osnova');
      if (existujici.some((u) => u.Firma === firma && normalizujUcet(u.Ucet) === ucet)) {
        return json(409, { error: 'Tenhle účet už firma v osnově má - upravte ho místo založení nového.' });
      }

      await appendRow(sheets, spreadsheetId, 'Uctova_osnova', UCTOVA_OSNOVA_HEADERS, {
        Firma: firma,
        Ucet: ucet,
        Popis: String(telo.Popis || '').trim(),
        Poznamka: String(telo.Poznamka || '').trim(),
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const telo = JSON.parse(event.body || '{}');
      const row = Number(telo.row);
      if (!row) return json(400, { error: 'Chybí row.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Uctova_osnova');
      const soucasny = rows.find((u) => u._row === row);
      if (!soucasny) return json(404, { error: 'Účet nenalezen.' });

      const zmeny = Object.assign({}, telo.zmeny || {});
      if (zmeny.Ucet !== undefined) zmeny.Ucet = normalizujUcet(zmeny.Ucet);

      const novaFirma = zmeny.Firma !== undefined ? String(zmeny.Firma).trim() : soucasny.Firma;
      const novyUcet = zmeny.Ucet !== undefined ? zmeny.Ucet : normalizujUcet(soucasny.Ucet);
      if (zmeny.Firma !== undefined || zmeny.Ucet !== undefined) {
        if (!novyUcet) return json(400, { error: 'Číslo účtu je povinné.' });
        const koliduje = rows.some(
          (u) => u._row !== row && u.Firma === novaFirma && normalizujUcet(u.Ucet) === novyUcet,
        );
        if (koliduje) return json(409, { error: 'Tenhle účet už firma v osnově má.' });
      }

      const aktualizovany = Object.assign({}, soucasny, zmeny);
      await updateRow(sheets, spreadsheetId, 'Uctova_osnova', UCTOVA_OSNOVA_HEADERS, row, aktualizovany);

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const row = Number((event.queryStringParameters || {}).row);
      if (!row) return json(400, { error: 'Chybí row.' });

      await deleteRow(sheets, spreadsheetId, 'Uctova_osnova', row);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
