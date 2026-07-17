/**
 * netlify/functions/dashboard.js
 * GET (Bearer token) -> souhrny nákladů (podle firmy, kategorie, měsíce)
 * z dokladů viditelných pro přihlášeného uživatele.
 *
 * Od v3.19 (viz claude/nomis-faktury-backlog.md) appka navíc čte
 * Bankovni_pohyby napříč firmami (podle přístupu uživatele) a přidává:
 *   - do STÁVAJÍCÍCH výdajových souhrnů (souhrnPodleFirmy/Kategorie/Mesice)
 *     i pohyby přiřazené ke Smlouvě ("Trvalý příkaz") - trvalé příkazy
 *     (nájem, elektřina, leasing) dnes nemají vlastní Doklad, takže se do
 *     těchhle souhrnů dřív vůbec nepočítaly.
 *   - NOVÉ souhrny příjmů (souhrnPrijmyPodleStrediska/Mesice) z příchozích
 *     plateb, kterým appka/účetní přiřadila Středisko ("Příjem přiřazen").
 *   - OD v3.23 i platby potvrzeně spárované s konkrétní Vydanou fakturou
 *     ("Spárováno - vydaná faktura", v3.22) - appka je do v3.23 v Přehledu
 *     OMYLEM vůbec nepočítala (stejná chyba jako u nové záložky Dashboard,
 *     viz claude/nomis-faktury-backlog.md, položka 10). "Středisko" u
 *     těchhle appka bere z pole `Jednotka` napárované faktury.
 *   - prijmyCelkem/vydajeCelkem/rozdil - čistý tok za viditelná data.
 * List Bankovni_pohyby/Smlouvy nemusí existovat (appka bez zapnuté Banky) -
 * appka v tom případě jen nechá příjmové souhrny prázdné, Přehled dál
 * funguje jako dřív (jen s výdaji z Dokladů).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');

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
    const sheets = await getSheetsClient();
    const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');

    const viditelne = rows.filter((r) => {
      if (uzivatel.role === 'admin') return true;
      const firma = r.Firma_potvrzena || r.Firma_AI_odhad;
      return uzivatel.firmy.includes(firma);
    });

    const souhrnPodleFirmy = {};
    const souhrnPodleKategorie = {};
    const souhrnPodleMesice = {};

    // Doklady čekající na dokončení AI zpracování (viz upload.js/
    // upload-dokoncit.js od v3.9) ještě nemají žádné údaje k součtu -
    // appka je do souhrnů nezahrnuje, ať se v Přehledu neobjeví matoucí
    // řádek "(nepřiřazeno): 0 Kč".
    viditelne.forEach((r) => {
      if (r.Stav === 'Zpracovává se') return;
      const firma = r.Firma_potvrzena || r.Firma_AI_odhad || '(nepřiřazeno)';
      const kategorie = r.Kategorie || '(bez kategorie)';
      const mesic = String(r.Datum_dokladu || '').slice(0, 7) || '(bez data)';
      // r.Castka přichází z readSheetObjects (FORMATTED_VALUE) - u částky s
      // haléři se může vrátit v českém formátu s čárkou (např. "2029,91"),
      // na což by obyčejné parseFloat() tiše uřízlo desetiny (vrátilo by 2029)
      // - proto parsujCastkuZListu, ať součty v Přehledu nejsou nepřesné.
      const castka = parsujCastkuZListu(r.Castka);

      souhrnPodleFirmy[firma] = (souhrnPodleFirmy[firma] || 0) + castka;
      souhrnPodleKategorie[kategorie] = (souhrnPodleKategorie[kategorie] || 0) + castka;
      souhrnPodleMesice[mesic] = (souhrnPodleMesice[mesic] || 0) + castka;
    });

    const souhrnPrijmyPodleStrediska = {};
    const souhrnPrijmyPodleMesice = {};
    let prijmyCelkem = 0;

    try {
      const [{ rows: pohybyVsechny }, { rows: smlouvyVsechny }, { rows: fakturyVsechny }] = await Promise.all([
        readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Bankovni_pohyby'),
        readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Smlouvy').catch(() => ({ rows: [] })),
        readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Vydane_faktury').catch(() => ({ rows: [] })),
      ]);

      const typSmlouvyPodleId = {};
      smlouvyVsechny.forEach((s) => {
        if (s.ID) typSmlouvyPodleId[s.ID] = s.Typ || '(smlouva)';
      });

      // (v3.23) Jednotka napárované Vydané faktury appka používá jako
      // "středisko" pro rozpad příjmů z potvrzených plateb faktur.
      const jednotkaPodleFaktury = {};
      fakturyVsechny.forEach((f) => {
        if (f.ID) jednotkaPodleFaktury[f.ID] = f.Jednotka || '(bez střediska)';
      });

      const viditelnePohyby = pohybyVsechny.filter((p) => {
        if (uzivatel.role === 'admin') return true;
        return uzivatel.firmy.includes(p.Firma);
      });

      viditelnePohyby.forEach((p) => {
        const castka = parsujCastkuZListu(p.Castka);
        const mesic = String(p.Datum || '').slice(0, 7) || '(bez data)';

        if (castka < 0 && p.Stav_parovani === 'Trvalý příkaz') {
          // Trvalý příkaz (nájem/elektřina/leasing přiřazené ke Smlouvě
          // místo vlastnímu Dokladu) appka počítá do STEJNÝCH výdajových
          // souhrnů jako doklady - jinak by se v Přehledu vůbec neobjevily.
          const firma = p.Firma || '(nepřiřazeno)';
          const kategorie = typSmlouvyPodleId[p.Smlouva_ID] || '(smlouva)';
          const abs = Math.abs(castka);
          souhrnPodleFirmy[firma] = (souhrnPodleFirmy[firma] || 0) + abs;
          souhrnPodleKategorie[kategorie] = (souhrnPodleKategorie[kategorie] || 0) + abs;
          souhrnPodleMesice[mesic] = (souhrnPodleMesice[mesic] || 0) + abs;
        } else if (castka > 0 && p.Stav_parovani === 'Příjem přiřazen') {
          const stredisko = p.Stredisko || '(bez střediska)';
          souhrnPrijmyPodleStrediska[stredisko] = (souhrnPrijmyPodleStrediska[stredisko] || 0) + castka;
          souhrnPrijmyPodleMesice[mesic] = (souhrnPrijmyPodleMesice[mesic] || 0) + castka;
          prijmyCelkem += castka;
        } else if (castka > 0 && p.Stav_parovani === 'Spárováno - vydaná faktura') {
          const stredisko = jednotkaPodleFaktury[p.Vydana_faktura_ID] || '(bez střediska)';
          souhrnPrijmyPodleStrediska[stredisko] = (souhrnPrijmyPodleStrediska[stredisko] || 0) + castka;
          souhrnPrijmyPodleMesice[mesic] = (souhrnPrijmyPodleMesice[mesic] || 0) + castka;
          prijmyCelkem += castka;
        }
      });
    } catch (e) {
      // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
      // Přehled se kvůli tomu nemá přestat načítat, jen bez příjmové části.
    }

    const vydajeCelkem = Object.values(souhrnPodleFirmy).reduce((a, b) => a + b, 0);

    return json(200, {
      pocetDokladu: viditelne.length,
      souhrnPodleFirmy,
      souhrnPodleKategorie,
      souhrnPodleMesice,
      souhrnPrijmyPodleStrediska,
      souhrnPrijmyPodleMesice,
      prijmyCelkem,
      vydajeCelkem,
      rozdil: prijmyCelkem - vydajeCelkem,
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
