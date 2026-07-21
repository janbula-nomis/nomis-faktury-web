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
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { json } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKDokladu(uzivatel, doklad) {
  if (uzivatel.role === 'admin') return true;
  const firma = doklad.Firma_potvrzena || doklad.Firma_AI_odhad;
  return (uzivatel.firmy || []).includes(firma);
}

// v4.11: běžný uživatel (role "", ne admin/účetní) smí vidět jen doklady
// čekající na schválení - jakmile appka doklad schválí, mizí mu z pohledu
// úplně (appka ho vůbec nevrátí v GET odpovědi, ne jen skryje na frontendu).
function smiVidetDoklad(uzivatel, doklad) {
  if (!maPristupKDokladu(uzivatel, doklad)) return false;
  if (jeUcetniNeboAdmin(uzivatel)) return true;
  return doklad.Stav !== 'Schváleno';
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

      const aktualizovany = Object.assign({}, doklad, zmeny || {});
      await updateRow(
        sheets,
        process.env.SPREADSHEET_ID,
        'Doklady',
        DOKLADY_HEADERS,
        doklad._row,
        aktualizovany
      );

      return json(200, { ok: true });
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
