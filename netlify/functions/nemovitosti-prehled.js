/**
 * netlify/functions/nemovitosti-prehled.js
 * GET (Bearer token) -> souhrnný přehled nájemního příjmu pro záložku
 * Nemovitosti (od v4.19, Jan: "příjmy z nájmu přiřadit k bankovním
 * vypisům... appka kromě párování zobrazí i souhrnný přehled příjmů z
 * nájmu"). Stejný obecný vzor jako netlify/functions/dashboard-firmy.js -
 * appka appce vrací data napříč VŠEMI viditelnými nemovitostmi/smlouvami
 * najednou, žádný filtr firmy/měsíce (appka počítá vždy za AKTUÁLNÍ
 * kalendářní měsíc).
 *
 * Pro každou viditelnou Nemovitost appka vrátí seznam napojených Smluv typu
 * "Nájem" (Smlouvy.Nemovitost_ID), a u KAŽDÉ takové smlouvy:
 *   - poslední přijatou platbu spárovanou na tuhle smlouvu (Bankovni_pohyby,
 *     Smlouva_ID == smlouva.ID, kladná částka) - datum a částka
 *   - součet plateb spárovaných na tuhle smlouvu v AKTUÁLNÍM kalendářním
 *     měsíci a příznak, jestli součet dosahuje aspoň Ocekavana_castka
 *     (appka teda ROZLIŠUJE zaplaceno/nezaplaceno tenhle měsíc, ne jen
 *     ukazuje čísla) - appka počítá se stejnou tolerancí jako u samotného
 *     párování (lib/bankHelpers.js, navrhniShoduNajem - 100 v měně smlouvy
 *     nebo 10 %, podle toho, co je větší), ať se drobný doplatek/nedoplatek
 *     nepočítá jako "nezaplaceno".
 *
 * Appka počítá jen s pohyby, které mají Smlouva_ID vyplněné (appka na ně
 * odkazuje bez ohledu na konkrétní Stav_parovani - "Navrženo - nájemní
 * smlouva" i "Spárováno - nájemní smlouva" appka bere stejně, protože i
 * NEPOTVRZENÝ návrh znamená, že platba nejspíš dorazila, jen to účetní
 * ještě nestihla potvrdit).
 *
 * Appka vrací i googleAuthVarovani (stejný vzor jako Dashboard) - selhání
 * základního čtení listů appka radši ukáže jako srozumitelné varování než
 * aby celá záložka spadla na chybu 500.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');

function jePravdepodobneChybaGoogleAuth(e) {
  const zprava = String((e && e.message) || '');
  return /GOOGLE_OAUTH|invalid_grant|invalid_client|unauthorized_client|invalid_token|token.*expired|401/i.test(
    zprava
  );
}

function zacatekAktualnihoMesice() {
  const ted = new Date();
  const rok = ted.getFullYear();
  const mesic = String(ted.getMonth() + 1).padStart(2, '0');
  return rok + '-' + mesic + '-01';
}

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
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
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Přehled nemovitostí je dostupný jen administrátorovi a účetní.' });
  }

  const zacatekMesice = zacatekAktualnihoMesice();

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const [{ rows: nemovitostiVsechny }, { rows: smlouvyVsechny }] = await Promise.all([
      readSheetObjects(sheets, spreadsheetId, 'Nemovitosti'),
      readSheetObjects(sheets, spreadsheetId, 'Smlouvy'),
    ]);

    let pohybyVsechny = [];
    try {
      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      pohybyVsechny = rows;
    } catch (e) {
      // Banka appka zatím nemá zapnutou - přehled appka vrátí bez plateb.
    }

    const viditelneNemovitosti = nemovitostiVsechny.filter((n) => maPristupKFirme(uzivatel, n.Firma));

    const vysledek = viditelneNemovitosti.map((nemovitost) => {
      const smlouvyNemovitosti = smlouvyVsechny.filter(
        (s) =>
          s.Nemovitost_ID === nemovitost.ID &&
          String(s.Typ || '').trim() === 'Nájem' &&
          String(s.Aktivni || 'ANO').trim() !== 'NE'
      );

      const smlouvy = smlouvyNemovitosti.map((smlouva) => {
        const platbySmlouvy = pohybyVsechny
          .filter((p) => p.Smlouva_ID === smlouva.ID && parsujCastkuZListu(p.Castka) > 0)
          .slice()
          .sort((a, b) => String(a.Datum || '').localeCompare(String(b.Datum || '')));

        const posledniPlatba = platbySmlouvy.length ? platbySmlouvy[platbySmlouvy.length - 1] : null;

        const castkaTentoMesic = platbySmlouvy
          .filter((p) => String(p.Datum || '') >= zacatekMesice)
          .reduce((soucet, p) => soucet + parsujCastkuZListu(p.Castka), 0);

        const ocekavanaCastka = Math.abs(parsujCastkuZListu(smlouva.Ocekavana_castka));
        const tolerance = Math.max(100, ocekavanaCastka * 0.1);
        const zaplacenoTentoMesic = ocekavanaCastka > 0 && castkaTentoMesic >= ocekavanaCastka - tolerance;

        return {
          smlouvaId: smlouva.ID,
          nazev: smlouva.Nazev || '',
          najemce: smlouva.Druha_strana || '',
          ocekavanaCastka: smlouva.Ocekavana_castka || '',
          mena: smlouva.Mena || 'CZK',
          posledniPlatba: posledniPlatba
            ? { datum: posledniPlatba.Datum || '', castka: parsujCastkuZListu(posledniPlatba.Castka) }
            : null,
          castkaTentoMesic,
          zaplacenoTentoMesic,
        };
      });

      return {
        nemovitostId: nemovitost.ID,
        firma: nemovitost.Firma,
        nazev: nemovitost.Nazev,
        adresa: nemovitost.Adresa || '',
        aktivni: String(nemovitost.Aktivni || 'ANO').trim() !== 'NE',
        smlouvy,
      };
    });

    return json(200, { nemovitosti: vysledek, mesicOd: zacatekMesice, googleAuthVarovani: false });
  } catch (e) {
    if (jePravdepodobneChybaGoogleAuth(e)) {
      return json(200, { nemovitosti: [], mesicOd: zacatekMesice, googleAuthVarovani: true, googleAuthChyba: e.message });
    }
    return json(500, { error: e.message });
  }
};
