/**
 * netlify/functions/doklady.js
 * GET (Bearer token)   -> seznam dokladů viditelných pro přihlášeného uživatele
 * PATCH (Bearer token) { id, zmeny } -> úprava/schválení konkrétního dokladu
 *   (zmeny je objekt s podmnožinou sloupců k přepsání, typicky
 *    Firma_potvrzena, Kategorie, SPZ_auta, Stav, ...)
 * DELETE ?id=X (Bearer token) -> smazání dokladu; kdokoli s přístupem k dokladu
 *   (ne jen admin) - viz maPristupKDokladu. Zároveň appka "odpojí" případné
 *   navázané bankovní pohyby (Bankovni_pohyby.Doklad_ID == id), ať nezůstane
 *   pohyb odkazující na smazaný doklad - vrátí je do stavu "Nespárováno".
 *
 * Přístup: role "admin" vidí vše, ostatní jen doklady, kde Firma_potvrzena
 * (nebo pokud ještě není potvrzená, Firma_AI_odhad) je v jejich seznamu firem.
 *
 * Pozn. (v4.11): Jan zadal (mimo číslovaný backlog, jen v chatu) - "uděláme
 * to tak, aby uživatel viděl jen faktury ke schválení, schvaluje jen admin
 * a účetní, uživatel nahrává a scanuje faktury, ale nesmí vidět do
 * ostatních firem." Appce si nechala přes AskUserQuestion potvrdit tři
 * otevřené otázky, než začala implementovat: (a) běžný uživatel SMÍ opravit
 * údaje (Firma/Kategorie/Částka/Středisko...) u dokladu čekajícího na
 * schválení - jen tlačítko/akci "Schválit" appka pro něj zakázala; (b) běžný
 * uživatel smí smazat SVŮJ VLASTNÍ nahraný doklad, dokud ho nikdo neschválil
 * - po schválení mazání zůstává na adminovi/účetní; (c) totéž omezení appka
 * zavedla i pro Vydané faktury (viz netlify/functions/vydaneFaktury.js).
 * Role "ucetni" má u Dokladů beze změny stejná práva jako "admin" (obojí
 * schvaluje, obojí vidí i schválené, obojí může smazat cokoli v rámci svých
 * přiřazených firem).
 *
 * Pozn. (v4.29): Jan přenastavil viditelnost běžné role - "uživatel vidí
 * přijaté, vydané a bank výpisy, víc nic, ale jen pro určenou firmu, kterou
 * zvolí admin, uživatel nemůže schvalovat, ale vidí proces až po zápis do
 * bankovních výpisů." Appka proto RUŠÍ omezení z v4.11, které běžné roli
 * schované schválené doklady úplně (GET je nevracel) - běžný uživatel teď
 * vidí celý životní cyklus dokladu (i po schválení, i po spárování s
 * bankovním výpisem), stejně jako admin/účetní. PATCH/DELETE omezení (bod
 * a/b výš - žádné schvalování, mazání jen vlastního nepotvrzeného dokladu)
 * appka NECHÁVÁ beze změny - to je pořád v platnosti, mění se jen GET.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { dalsiEvidencniCislo, precislujPriPresunu } = require('../../lib/evidencniCislo');
// v4.52 - účet MD podle předkontace, viz lib/predkontaceHelpers.js.
const { navrhniUcetMD } = require('../../lib/predkontaceHelpers');
const { json } = require('../../lib/http');

function ziskejFirmuDokladu(d) {
  return d.Firma_potvrzena || d.Firma_AI_odhad || '';
}

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKDokladu(uzivatel, doklad) {
  if (uzivatel.role === 'admin') return true;
  const firma = doklad.Firma_potvrzena || doklad.Firma_AI_odhad;
  return (uzivatel.firmy || []).includes(firma);
}

// v4.29: appka rušila dřívější v4.11 omezení - běžný uživatel teď vidí
// doklad v libovolném stavu (pending i schválený), pokud má přístup k jeho
// firmě - stejně jako admin/účetní. Funkce zůstává jako pojmenovaný wrapper
// (dřív dělala víc), ať je v GET handleru pod ní vidět, PROČ appka doklady
// filtruje, i když teď dělá totéž co maPristupKDokladu.
function smiVidetDoklad(uzivatel, doklad) {
  return maPristupKDokladu(uzivatel, doklad);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  const sheets = await getSheetsClient();

  if (event.httpMethod === 'GET') {
    try {
      const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
      const viditelne = rows.filter((r) => smiVidetDoklad(uzivatel, r));

      // Doplněk v3.16: appka u KAŽDÉHO dokladu dopočítá, jestli k němu už
      // našla (nebo účetní potvrdila) odpovídající bankovní pohyb - Jan
      // chtěl tohle vidět přímo v záložce Doklady (hlavně u schválených),
      // ať nemusí kvůli kontrole přeskakovat do Bankovních výpisů a ručně
      // dohledávat. Pole `Stav_parovani_bankou` appka jen DOPOČÍTÁ pro
      // odpověď - nejde o skutečný sloupec v listu Doklady, nic se tím
      // neukládá. Pokud je k dokladu napojených víc pohybů (neobvyklé, ale
      // teoreticky možné), appka upřednostní "Potvrzeno" před "Navrženo".
      try {
        const { rows: pohyby } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Bankovni_pohyby');
        const stavParovaniPodleDokladu = {};
        pohyby.forEach((p) => {
          if (!p.Doklad_ID) return;
          const dosavadni = stavParovaniPodleDokladu[p.Doklad_ID];
          if (dosavadni === 'Potvrzeno') return; // už máme silnější signál, nepřepisovat
          stavParovaniPodleDokladu[p.Doklad_ID] = p.Stav_parovani || '';
        });
        viditelne.forEach((d) => {
          d.Stav_parovani_bankou = stavParovaniPodleDokladu[d.ID] || '';
        });
      } catch (e) {
        // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
        // appka jen nechá Stav_parovani_bankou nevyplněné, doklady samotné
        // se kvůli tomu nemají přestat načítat.
      }

      return json(200, { doklady: viditelne });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  if (event.httpMethod === 'PATCH') {
    try {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID dokladu.' });

      const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
      const doklad = rows.find((r) => r.ID === id);
      if (!doklad) return json(404, { error: 'Doklad nenalezen.' });
      if (!maPristupKDokladu(uzivatel, doklad)) {
        return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
      }
      if (!jeUcetniNeboAdmin(uzivatel)) {
        if (doklad.Stav === 'Schváleno') {
          return json(403, { error: 'Tento doklad už byl schválen - úpravy provádí administrátor nebo účetní.' });
        }
        if (zmeny && zmeny.Stav === 'Schváleno') {
          return json(403, { error: 'Schválení dokladu smí provést jen administrátor nebo účetní.' });
        }
      }

      // (v4.63) „Zaúčtováno" - Jan 2026-08-20: *„nové zaškrtávátko
      // Zaúčtováno, které účetní ručně zaškrtne, pokud zaúčtuje"*.
      //
      // Tři pojistky, které se tu nesmí změkčit:
      //  1. Zaškrtnout smí JEN admin/účetní. Je to tvrzení „tenhle doklad
      //     je v účetnictví" - běžná role ho udělat nemůže.
      //  2. Zaškrtnout jde jen SCHVÁLENÝ doklad. Zaúčtovat něco, co ještě
      //     nikdo neodklepl, nedává smysl a rozbilo by to i pojmenování
      //     scanů (evidenční číslo vzniká až při schválení).
      //  3. `Zauctovano_kdy` a `Zauctoval` appka zapisuje SAMA tady na
      //     serveru. Kdyby je brala z prohlížeče, dal by se podepsat kdokoli
      //     kdykoli - a je to jediná stopa, na kterou se dá spolehnout.
      const meniZauctovano = !!(zmeny && zmeny.Zauctovano !== undefined);
      const budeZauctovano = meniZauctovano
        && String(zmeny.Zauctovano || '').trim().toUpperCase() === 'ANO';
      if (meniZauctovano) {
        if (!jeUcetniNeboAdmin(uzivatel)) {
          return json(403, { error: 'Zaúčtování smí označit jen administrátor nebo účetní.' });
        }
        if (budeZauctovano && doklad.Stav !== 'Schváleno') {
          return json(400, { error: 'Zaúčtovat jde jen schválený doklad – nejdřív ho schvalte.' });
        }
      }

      const aktualizovany = Object.assign({}, doklad, zmeny || {});

      if (meniZauctovano) {
        aktualizovany.Zauctovano = budeZauctovano ? 'ANO' : '';
        // Odškrtnutí stopu MAŽE - nechat u nezaúčtovaného dokladu viset
        // staré „zaúčtoval Jan 5. 8." by bylo horší než prázdno.
        aktualizovany.Zauctovano_kdy = budeZauctovano ? new Date().toISOString().slice(0, 10) : '';
        aktualizovany.Zauctoval = budeZauctovano ? (uzivatel.jmeno || '') : '';
      }

      // v4.34 (Jan: "kód např FP..., pořadové číslo dle přidání a rok dle
      // DUZP") - appka evidenční číslo přiřazuje AŽ PŘI SCHVÁLENÍ (viz
      // lib/evidencniCislo.js pro plné zdůvodnění), a jen JEDNOU (appka
      // nepřepisuje existující číslo při dalších úpravách už schváleného
      // dokladu).
      const firmaPoUprave = ziskejFirmuDokladu(aktualizovany);
      const rokPoUprave = String(aktualizovany.DUZP || aktualizovany.Datum_dokladu || '').slice(0, 4) ||
        String(new Date().getFullYear());

      if (
        doklad.Stav !== 'Schváleno' &&
        aktualizovany.Stav === 'Schváleno' &&
        !aktualizovany.Evidencni_cislo
      ) {
        aktualizovany.Evidencni_cislo = dalsiEvidencniCislo(rows, 'FP', firmaPoUprave, rokPoUprave, ziskejFirmuDokladu);
      } else {
        // (v4.49) Jan: "po změně roku na dokladu při opravě přeindexuj
        // označení, aby to pasovalo např. na rok 2026." Doklad, který se
        // opravou přestěhoval do jiné řady (jiný rok DUZP, případně jiná
        // firma), dostane číslo z TÉ řady - viz precislujPriPresunu() v
        // lib/evidencniCislo.js pro plné zdůvodnění včetně toho, proč po
        // něm v původním roce zůstane mezera.
        //
        // Pozor na pořadí: tahle větev schválně běží až jako `else`, aby se
        // doklad při schvalování nečísloval dvakrát. Číslo se počítá z
        // `rows`, tedy z toho, co je v listu PŘED zápisem - doklad sám tam
        // ještě sedí se starou firmou/rokem, takže si vlastní číslo do nové
        // řady nezapočítá.
        const preindexovane = precislujPriPresunu(
          doklad, rows, 'FP', firmaPoUprave, rokPoUprave, ziskejFirmuDokladu
        );
        if (preindexovane) aktualizovany.Evidencni_cislo = preindexovane;
      }

      // (v4.52) Účet MD po změně firmy nebo kategorie. Jan si vybral
      // "Podle kategorie, jde přepsat" - appka tedy účet dopočítá znovu,
      // ale RUČNÍ hodnotu nesmí přepsat. Rozlišuje se to takhle:
      //  - když uživatel poslal Ucet_MD sám, appka na něj nesahá vůbec;
      //  - jinak přepíše jen tehdy, když je pole prázdné NEBO v něm sedí
      //    přesně ten účet, který appka sama navrhla pro PŮVODNÍ kombinaci
      //    (tedy to, co tam dala appka, ne člověk).
      // Kdyby se to zjednodušilo na "po změně kategorie vždy přepiš",
      // Jan by po opravě kategorie tiše přišel o účet, který si nastavil
      // ručně - to je přesně to, co si nepřál. Nezjednodušovat.
      const menilFirmuNeboKategorii = zmeny
        && (zmeny.Kategorie !== undefined || zmeny.Firma_potvrzena !== undefined);
      if (menilFirmuNeboKategorii && (!zmeny || zmeny.Ucet_MD === undefined)) {
        try {
          const { rows: predkontace } = await readSheetObjects(
            sheets, process.env.SPREADSHEET_ID, 'Predkontace'
          );
          const puvodniNavrh = navrhniUcetMD(
            predkontace,
            doklad.Firma_potvrzena || doklad.Firma_AI_odhad || '',
            doklad.Kategorie
          );
          const soucasny = String(aktualizovany.Ucet_MD || '').trim();
          if (!soucasny || soucasny === puvodniNavrh) {
            aktualizovany.Ucet_MD = navrhniUcetMD(
              predkontace,
              aktualizovany.Firma_potvrzena || aktualizovany.Firma_AI_odhad || '',
              aktualizovany.Kategorie
            );
          }
        } catch (e) {
          // List Predkontace nemusí existovat (Jan po aktualizaci ještě
          // nepustil /api/setup) - úprava dokladu se kvůli tomu neshodí.
        }
      }

      await updateRow(
        sheets,
        process.env.SPREADSHEET_ID,
        'Doklady',
        DOKLADY_HEADERS,
        doklad._row,
        aktualizovany
      );

      return json(200, { ok: true, doklad: aktualizovany });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  if (event.httpMethod === 'DELETE') {
    try {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { error: 'Chybí ID dokladu.' });

      const { rows } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Doklady');
      const doklad = rows.find((r) => r.ID === id);
      if (!doklad) return json(404, { error: 'Doklad nenalezen.' });
      if (!maPristupKDokladu(uzivatel, doklad)) {
        return json(403, { error: 'Nemáte přístup k tomuto dokladu.' });
      }
      if (!jeUcetniNeboAdmin(uzivatel)) {
        if (doklad.Stav === 'Schváleno') {
          return json(403, { error: 'Schválený doklad může smazat jen administrátor nebo účetní.' });
        }
        if (doklad.Nahral_uzivatel !== uzivatel.jmeno) {
          return json(403, { error: 'Smazat můžete jen doklad, který jste sami nahráli.' });
        }
      }

      await deleteRow(sheets, process.env.SPREADSHEET_ID, 'Doklady', doklad._row);

      // Cascade: bankovní pohyby napárované na smazaný doklad appka vrátí
      // do stavu "Nespárováno", ať v Bankovních výpisech nezůstane pohyb
      // odkazující na doklad, který už neexistuje.
      try {
        const { rows: pohyby } = await readSheetObjects(sheets, process.env.SPREADSHEET_ID, 'Bankovni_pohyby');
        const napojenePohyby = pohyby.filter((p) => p.Doklad_ID === id);
        for (const pohyb of napojenePohyby) {
          const aktualizovany = Object.assign({}, pohyb, { Doklad_ID: '', Stav_parovani: 'Nespárováno' });
          await updateRow(
            sheets,
            process.env.SPREADSHEET_ID,
            'Bankovni_pohyby',
            BANKOVNI_HEADERS,
            pohyb._row,
            aktualizovany
          );
        }
      } catch (e) {
        // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
        // smazání dokladu appka nemá kvůli tomu shodit.
      }

      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
