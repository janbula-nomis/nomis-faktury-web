/**
 * netlify/functions/nemovitosti-vyuctovani-ulozene.js
 * CRUD nad ULOŽENÝMI výsledky vyúčtování (list "Nemovitosti_Vyuctovani",
 * od v4.37 - viz lib/nemovitostiVyuctovaniSchema.js). Doplňuje živý
 * přepočet netlify/functions/nemovitosti-vyuctovani.js o trvalý záznam -
 * appka uloží výsledek PŘESNĚ tak, jak appka vyúčtování v danou chvíli
 * spočítala, ať se pozdějším přibytím dalších Dokladů za stejné období
 * nezmění číslo, které už appka/Jan poslali nájemníkovi.
 *
 * Přístup jen pro role "admin" a "ucetni", stejně jako zbytek modulu
 * Nemovitosti.
 *
 * GET    ?smlouva_id=X            -> uložená vyúčtování dané smlouvy
 * GET    ?stredisko=X             -> uložená vyúčtování napříč všemi
 *                                    smlouvami daného střediska (historie
 *                                    jednotky i přes výměnu nájemníka)
 * POST   { Smlouva_ID, Obdobi_Od, Obdobi_Do, Naklady_Sluzby,
 *          Naklady_Vlastni, Zaloha_Na_Sluzby, Pocet_Zaplacenych_Zaloh,
 *          Zalohy_Prijate, Rozdil, Kauce_Castka?, Kauce_Skody?,
 *          Kauce_Nedoplatek?, Kauce_K_Vraceni?, Poznamka? }
 *          -> appka dohledá Smlouvu (kvůli Firma/Stredisko a kontrole
 *          přístupu), uloží záznam se Stav = "Spočítáno". Appka čísla
 *          NEPŘEPOČÍTÁVÁ znovu ze zdrojových dat - ukládá přesně to, co
 *          appka klientovi předtím vrátila přes GET
 *          nemovitosti-vyuctovani.js (appka tak nemůže omylem uložit
 *          jiné číslo, než jaké si Jan/účetní na obrazovce prohlédli).
 * PATCH  { id, zmeny: { Stav?, Poznamka? } }
 *          -> appka mění JEN Stav/Poznamka - ostatní pole (spočítané
 *          částky) appka považuje za neměnný historický záznam a appka
 *          jakoukoli jinou změnu tiše ignoruje.
 * DELETE ?id=X -> appka dovolí smazat jen záznam se Stav = "Spočítáno"
 *          (appka ho ještě nikomu neposlala) - jakmile appka/Jan
 *          vyúčtování označí "Odesláno nájemníkovi", appka smazání
 *          odmítne (409), ať zůstane auditní stopa.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const {
  NEMOVITOSTI_VYUCTOVANI_HEADERS,
  MOZNOSTI_STAV_VYUCTOVANI,
} = require('../../lib/nemovitostiVyuctovaniSchema');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

function cislo(hodnota) {
  const n = parseFloat(hodnota);
  return Number.isFinite(n) ? n : 0;
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

  try {
    if (event.httpMethod === 'GET') {
      const qs = event.queryStringParameters || {};
      const smlouvaId = String(qs.smlouva_id || '').trim();
      const stredisko = String(qs.stredisko || '').trim();
      if (!smlouvaId && !stredisko) {
        return json(400, { error: 'Chybí smlouva_id nebo stredisko.' });
      }

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Vyuctovani');
      let vysledky = rows.filter((r) => maPristupKFirme(uzivatel, r.Firma));
      if (smlouvaId) vysledky = vysledky.filter((r) => r.Smlouva_ID === smlouvaId);
      if (stredisko) vysledky = vysledky.filter((r) => r.Stredisko === stredisko);
      vysledky = vysledky.slice().sort((a, b) => String(b.Obdobi_Do || '').localeCompare(String(a.Obdobi_Do || '')));

      return json(200, { vyuctovani: vysledky });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const smlouvaId = String(telo.Smlouva_ID || '').trim();
      if (!smlouvaId) return json(400, { error: 'Chybí Smlouva_ID.' });
      if (!telo.Obdobi_Od || !telo.Obdobi_Do) return json(400, { error: 'Chybí období (Obdobi_Od/Obdobi_Do).' });

      const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
      const smlouva = smlouvyVsechny.find((s) => s.ID === smlouvaId);
      if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });
      if (!maPristupKFirme(uzivatel, smlouva.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
      if (smlouva.Typ !== 'Nájem') return json(400, { error: 'Vyúčtování jde uložit jen ke smlouvě typu Nájem.' });

      const zaznam = {
        ID: crypto.randomUUID(),
        Smlouva_ID: smlouvaId,
        Firma: smlouva.Firma,
        Stredisko: smlouva.Stredisko,
        Obdobi_Od: String(telo.Obdobi_Od).trim(),
        Obdobi_Do: String(telo.Obdobi_Do).trim(),
        Naklady_Sluzby: String(cislo(telo.Naklady_Sluzby)),
        Naklady_Vlastni: String(cislo(telo.Naklady_Vlastni)),
        Zaloha_Na_Sluzby: String(cislo(telo.Zaloha_Na_Sluzby)),
        Pocet_Zaplacenych_Zaloh: String(cislo(telo.Pocet_Zaplacenych_Zaloh)),
        Zalohy_Prijate: String(cislo(telo.Zalohy_Prijate)),
        Rozdil: String(cislo(telo.Rozdil)),
        Kauce_Castka: telo.Kauce_Castka !== undefined ? String(cislo(telo.Kauce_Castka)) : '',
        Kauce_Skody: telo.Kauce_Skody !== undefined ? String(cislo(telo.Kauce_Skody)) : '',
        Kauce_Nedoplatek: telo.Kauce_Nedoplatek !== undefined ? String(cislo(telo.Kauce_Nedoplatek)) : '',
        Kauce_K_Vraceni: telo.Kauce_K_Vraceni !== undefined ? String(cislo(telo.Kauce_K_Vraceni)) : '',
        Stav: 'Spočítáno',
        Vytvoreno_Datum: new Date().toISOString().slice(0, 10),
        Vytvoril_Uzivatel: uzivatel.jmeno || '',
        Poznamka: String(telo.Poznamka || '').trim(),
      };
      await appendRow(sheets, spreadsheetId, 'Nemovitosti_Vyuctovani', NEMOVITOSTI_VYUCTOVANI_HEADERS, zaznam);

      return json(200, { ok: true, vyuctovani: zaznam });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Vyuctovani');
      const zaznam = rows.find((r) => r.ID === id);
      if (!zaznam) return json(404, { error: 'Vyúčtování nenalezeno.' });
      if (!maPristupKFirme(uzivatel, zaznam.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      // Appka dovolí měnit JEN Stav/Poznamka - spočítané částky appka
      // považuje za neměnný historický záznam.
      const povolene = {};
      if (zmeny && zmeny.Stav !== undefined) {
        if (!MOZNOSTI_STAV_VYUCTOVANI.includes(zmeny.Stav)) {
          return json(400, { error: 'Neplatný stav vyúčtování.' });
        }
        povolene.Stav = zmeny.Stav;
      }
      if (zmeny && zmeny.Poznamka !== undefined) povolene.Poznamka = String(zmeny.Poznamka).trim();

      const aktualizovany = Object.assign({}, zaznam, povolene);
      await updateRow(
        sheets, spreadsheetId, 'Nemovitosti_Vyuctovani', NEMOVITOSTI_VYUCTOVANI_HEADERS, zaznam._row, aktualizovany
      );

      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Nemovitosti_Vyuctovani');
      const zaznam = rows.find((r) => r.ID === id);
      if (!zaznam) return json(404, { error: 'Vyúčtování nenalezeno.' });
      if (!maPristupKFirme(uzivatel, zaznam.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
      if (zaznam.Stav !== 'Spočítáno') {
        return json(409, { error: 'Odeslané/vypořádané vyúčtování appka nedovolí smazat (audit).' });
      }

      await deleteRow(sheets, spreadsheetId, 'Nemovitosti_Vyuctovani', zaznam._row);

      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
