/**
 * netlify/functions/banka.js
 * Bankovní výpisy a jejich párování s doklady. List "Bankovni_pohyby"
 * v Sheets.
 *
 * Pozn. (v4.12): Jan zadal (mimo číslovaný backlog, jen v chatu) - "bankovní
 * výpisy (jen povolené) musí vidět také, ale daňový přehled není třeba" -
 * oprava v4.10, kde appka dala běžnému uživateli mezi 4 viditelné záložky
 * Daňový přehled místo Bankovních výpisů. Appka si nechala přes
 * AskUserQuestion potvrdit rozsah: běžný uživatel (role "", ne admin, ne
 * účetní) má u Bankovních výpisů jen NÁHLED, scoped na firmy, které má
 * přiřazené (stejný princip jako Doklady/Vydané faktury) - GET je proto
 * dostupný komukoli přihlášenému s přístupem k dané firmě, ale POST
 * (import výpisu, přepočet shod) a PATCH (potvrzení/zamítnutí/přiřazení,
 * poznámka) zůstávají vyhrazené adminovi a účetní, viz kontrola níže.
 *
 * GET    ?firma=Nazev             -> { pohyby: [...] }
 * POST   { firma, obsahSouboru, format?, ignorovatNesouladUctu? }
 *          -> naimportuje výpis. format je "json" (výchozí, George Business
 *             export), "csv" nebo "xlsx" (viz lib/bankImportTabular.js).
 *             U json/csv je obsahSouboru čitelný text, u xlsx base64 (appka
 *             posílá binární obsah souboru zakódovaný jako base64, protože
 *             xlsx není textový formát).
 * POST   { firma, akce: "prepocitatShody" }
 *          -> (od v3.12) appka normálně navrhuje shodu dokladu k pohybu jen
 *             v okamžiku importu výpisu, podle dokladů, které v tu chvíli
 *             existují - pokud doklad k pohybu přibyde (nahraje se) až
 *             POZDĚJI, pohyb zůstane "Nespárováno" navždy, dokud appka
 *             znovu nezkusí porovnat. Tahle akce přepočítá návrhy pro
 *             všechny dosud "Nespárováno" pohyby dané firmy proti aktuálním
 *             dokladům, beze změny už rozhodnutých pohybů (Navrženo/
 *             Potvrzeno/Bez dokladu appka nechává být).
 * PATCH  { id, zmeny: { Doklad_ID?, Stav_parovani?, Poznamka?, Smlouva_ID?,
 *          Stredisko?, Cislo_uctu_vlastni? } }
 *          -> potvrzení/zamítnutí návrhu, ruční přiřazení dokladu,
 *             označení "Bez dokladu", poznámka, přiřazení ke Smlouvě
 *             (trvalý příkaz), přiřazení Střediska/účtu u příjmů (od
 *             v3.19, viz claude/nomis-faktury-backlog.md)
 * DELETE ?id=X        -> (od v4.21) smaže JEDEN bankovní pohyb. Vyhrazeno
 *          adminovi/účetní (stejně jako import a PATCH výš) - kontrola je
 *          na začátku handleru společná pro celé POST/PATCH/DELETE.
 * DELETE ?importId=X  -> (od v4.21) smaže VŠECHNY pohyby, které appka
 *          vytvořila v jednom konkrétním importu (viz Import_ID v
 *          lib/bankSchema.js) - appka je maže od nejvyššího čísla řádku
 *          (_row) po nejnižší, ať mazání jednoho řádku neposune čísla
 *          řádků těch, co appka teprve má smazat (stejný vzor jako kaskádní
 *          mazání Smlouvy_Prilohy v netlify/functions/smlouvy.js). Pohyby
 *          appka smí smazat jen v rámci firem, ke kterým má přístup
 *          přihlášený uživatel (viz maPristupKFirme). Řádky naimportované
 *          PŘED v4.21 nemají Import_ID vyplněné - appka je proto tímhle
 *          způsobem smazat neumí, jen jednotlivě přes ?id=X.
 *          Appka záměrně NEKASKÁDUJE žádnou změnu do navázaného Dokladu/
 *          Vydané faktury/Smlouvy (na rozdíl od Doklady.js, kde smazání
 *          dokladu vrací navázaný pohyb do "Nespárováno") - smazání pohybu
 *          jen odstraní řádek samotný, stejně jako "zrušení spárování"
 *          appka taky nevrací stav navázaného dokladu/faktury zpátky
 *          automaticky.
 *
 * Firma může mít víc bankovních účtů (od v3.6, viz list "Ucty" a
 * lib/uctySchema.js) - kontrola shody účtu při importu ("ucet_nesedi")
 * hlídá shodu s KTERÝMKOLI známým účtem firmy (Ucty + starší legacy pole
 * Firmy.Bankovni_ucet), ne jen jedním.
 *
 * Od v3.19: PATCH s neprázdným Smlouva_ID (jiným, než pohyb dosud měl)
 * appka ověří, že smlouva existuje a patří stejné firmě jako pohyb. Pokud
 * appka zároveň dostane Stav_parovani = "Trvalý příkaz" (ruční POTVRZENÉ
 * přiřazení, ne jen návrhu), rovnou zkusí najít DALŠÍ dosud "Nespárováno"
 * pohyby stejné firmy se stejnou protistranou a podobnou částkou (tolerance
 * kvůli kolísání u opakovaných plateb, viz lib/bankHelpers.js,
 * jePodobnaShodaSmlouvy) a navrhne (nepotvrdí) jim stejnou smlouvu - ať
 * účetní nemusí u pravidelných plateb (nájem, elektřina, leasing)
 * přiřazovat každý měsíc znovu ručně.
 *
 * Od v3.22 (párování PŘÍJMŮ s Vydanými fakturami, viz claude/nomis-faktury-
 * backlog.md, položka 5B): příchozí platby appka při importu (a při
 * "prepocitatShody") zkusí navrhnout na konkrétní Vydanou fakturu podle
 * částky + jména zákazníka (lib/bankHelpers.js, navrhniShoduPrijem) -
 * Stav_parovani "Navrženo - vydaná faktura". Když appka dostane PATCH
 * s Vydana_faktura_ID a Stav_parovani = "Spárováno - vydaná faktura"
 * (ruční POTVRZENÍ návrhu, nebo rovnou ruční přiřazení), appka navíc
 * rovnou přepíše Vydane_faktury.Stav na "Uhrazeno" (částka platby pokryla
 * celou fakturu) nebo "Částečně uhrazeno" (nižší platba) - appka NIKDY
 * nic z tohohle nepotvrzuje sama, jde jen o důsledek RUČNÍHO potvrzení
 * účetní.
 *
 * Od v4.19 (párování PŘÍJMŮ přímo s nájemní Smlouvou, Jan: "příjmy z
 * nájmu přiřadit k bankovním vypisům, zdrojem jsou nájemní smlouvy"):
 * příchozí platby appka při importu (a při "prepocitatShody"), pokud
 * appka nenajde shodu s Vydanou fakturou, zkusí navrhnout na aktivní
 * Smlouvu typu "Nájem" podle jména nájemce (Smlouvy.Druha_strana) +
 * očekávané částky (lib/bankHelpers.js, navrhniShoduNajem) - Stav_parovani
 * "Navrženo - nájemní smlouva". Na rozdíl od staršího "trvalého příkazu"
 * (jePodobnaShodaSmlouvy výš) appka tu NEPOTŘEBUJE žádný dřív ručně
 * přiřazený "vzorový" pohyb - porovnává rovnou proti údajům samotné
 * smlouvy, takže appka umí navrhnout spárování hned u první platby od
 * nájemce.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects, appendRow, appendRows, updateRow, deleteRow } = require('../../lib/sheetsHelpers');
const { BANKOVNI_HEADERS } = require('../../lib/bankSchema');
const { DOKLADY_HEADERS } = require('../../lib/dokladySchema');
const { UCTY_HEADERS } = require('../../lib/uctySchema');
const { VYDANE_FAKTURY_HEADERS } = require('../../lib/vydaneFakturySchema');
const {
  parsujGeorgeExport,
  jeBezDokladu,
  navrhniShodu,
  navrhniShoduPrijem,
  navrhniShoduNajem,
  jePodobnaShodaSmlouvy,
  parsujCastkuZListu,
} = require('../../lib/bankHelpers');
const { parsujCsvVypis, parsujXlsxVypis } = require('../../lib/bankImportTabular');
const { json } = require('../../lib/http');
const crypto = require('crypto');

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  // v4.12: GET (náhled) appka povoluje komukoli přihlášenému - scoping na
  // konkrétní firmu řeší maPristupKFirme níž. Import výpisu, přepočet shod
  // (POST) a potvrzení/zamítnutí/přiřazení/poznámka (PATCH) appka nechává
  // vyhrazené adminovi a účetní - běžný uživatel má jen náhled.
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni' && event.httpMethod !== 'GET') {
    return json(403, { error: 'Import a úpravu bankovních pohybů smí provést jen administrátor nebo účetní.' });
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    if (event.httpMethod === 'GET') {
      const firma = (event.queryStringParameters || {}).firma;
      if (!firma) return json(400, { error: 'Chybí parametr firma.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      const proFirmu = rows.filter((r) => r.Firma === firma);
      return json(200, { pohyby: proFirmu });
    }

    if (event.httpMethod === 'POST') {
      const telo = JSON.parse(event.body || '{}');
      const firma = String(telo.firma || '').trim();
      if (!firma) return json(400, { error: 'Vyberte firmu.' });
      if (!maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      if (telo.akce === 'prepocitatShody') {
        const { rows: pohybyVsechnyFirmy } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
        const pohybyFirmy = pohybyVsechnyFirmy.filter((p) => p.Firma === firma);

        const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
        // Doklad appka nesmí navrhnout, pokud už je přiřazený k JAKÉMUKOLI
        // pohybu dané firmy (ne jen k těm právě přepočítávaným) - jinak by
        // mohla stejný doklad nabídnout dvakrát dvěma různým pohybům.
        const jizPouzitaDokladId = new Set(pohybyFirmy.filter((p) => p.Doklad_ID).map((p) => p.Doklad_ID));
        const kandidatiDoklady = dokladyVsechny.filter(
          (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma && !jizPouzitaDokladId.has(d.ID)
        );

        // Appka projde nespárované pohyby od nejstaršího - u víc shodných
        // kandidátů tak dostane přednost ten, který je datem blíž tomu
        // dřívějšímu pohybu.
        const nesparovane = pohybyFirmy
          .filter((p) => p.Stav_parovani === 'Nespárováno')
          .slice()
          .sort((a, b) => String(a.Datum || '').localeCompare(String(b.Datum || '')));

        let noveNavrzeno = 0;
        for (const pohyb of nesparovane) {
          const pProNavrh = {
            castka: parsujCastkuZListu(pohyb.Castka),
            mena: pohyb.Mena || '',
            protistrana: pohyb.Protistrana || '',
            popis: pohyb.Popis || '',
            variabilni_symbol: pohyb.Variabilni_symbol || '',
            datum: pohyb.Datum || '',
          };
          const navrh = navrhniShodu(pProNavrh, kandidatiDoklady);
          if (!navrh || navrh.skore < 2) continue;

          await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, {
            ...pohyb,
            Doklad_ID: navrh.dokladId,
            Stav_parovani: 'Navrženo',
          });
          noveNavrzeno += 1;
          // ať appka nenabídne stejný doklad dvakrát dvěma různým pohybům
          // v rámci tohohle jednoho přepočtu
          const idx = kandidatiDoklady.findIndex((d) => d.ID === navrh.dokladId);
          if (idx >= 0) kandidatiDoklady.splice(idx, 1);
        }

        // Od v3.22: appka stejnou akcí zkusí přepočítat i PŘÍJMOVOU stranu -
        // příchozí platby appka dřív rovnou označila "Bez dokladu" (žádné
        // vydané faktury tehdy neexistovaly/nebyly zpracované AI), appka
        // teď zkusí najít vydanou fakturu, i když už "Bez dokladu" pohyb
        // v mezičase je - appka NEmění pohyby, které účetní už ručně
        // vyřešila (Příjem přiřazen / Spárováno - vydaná faktura), jen ty,
        // co appka sama automaticky uzavřela jako "Bez dokladu" a dosud
        // nemají Vydana_faktura_ID.
        const { rows: fakturyVsechnyFirmy } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury').catch(
          () => ({ rows: [] })
        );
        const kandidatiFaktury = fakturyVsechnyFirmy.filter(
          (f) => f.Firma === firma && (f.Stav === 'Neuhrazeno' || f.Stav === 'Částečně uhrazeno')
        );

        // Od v4.19: kandidáti pro spárování PŘÍJMŮ přímo s nájemní Smlouvou
        // (viz lib/bankHelpers.js, navrhniShoduNajem) - appka zkouší tenhle
        // zdroj jako DRUHÝ, teprve když příjem neodpovídá žádné Vydané
        // faktuře (viz níž).
        const { rows: smlouvyVsechnyFirmy } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy').catch(
          () => ({ rows: [] })
        );
        const kandidatiSmlouvyNajem = smlouvyVsechnyFirmy.filter(
          (s) => s.Firma === firma && String(s.Typ || '').trim() === 'Nájem'
        );

        const prijmyKPreverovani = pohybyFirmy.filter(
          (p) => parsujCastkuZListu(p.Castka) > 0 && p.Stav_parovani === 'Bez dokladu' && !p.Vydana_faktura_ID
        );

        let noveNavrzenoPrijmu = 0;
        let noveNavrzenoNajmu = 0;
        for (const pohyb of prijmyKPreverovani) {
          const pProNavrh = {
            castka: parsujCastkuZListu(pohyb.Castka),
            mena: pohyb.Mena || '',
            protistrana: pohyb.Protistrana || pohyb.Popis || '',
            popis: pohyb.Popis || '',
            datum: pohyb.Datum || '',
          };
          const navrh = navrhniShoduPrijem(pProNavrh, kandidatiFaktury);
          if (navrh && navrh.skore >= 2) {
            await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, {
              ...pohyb,
              Vydana_faktura_ID: navrh.fakturaId,
              Stav_parovani: 'Navrženo - vydaná faktura',
            });
            noveNavrzenoPrijmu += 1;
            continue;
          }

          const navrhNajem = navrhniShoduNajem(pProNavrh, kandidatiSmlouvyNajem);
          if (navrhNajem && navrhNajem.skore >= 2) {
            await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, {
              ...pohyb,
              Smlouva_ID: navrhNajem.smlouvaId,
              Stav_parovani: 'Navrženo - nájemní smlouva',
            });
            noveNavrzenoNajmu += 1;
          }
        }

        return json(200, {
          ok: true,
          zkontrolovano: nesparovane.length,
          noveNavrzeno,
          zustavaNesparovano: nesparovane.length - noveNavrzeno,
          zkontrolovanoPrijmu: prijmyKPreverovani.length,
          noveNavrzenoPrijmu,
          noveNavrzenoNajmu,
        });
      }

      if (!telo.obsahSouboru) return json(400, { error: 'Chybí obsah souboru.' });

      const format = String(telo.format || 'json').trim().toLowerCase();
      let rozpar;
      try {
        if (format === 'csv') {
          rozpar = parsujCsvVypis(telo.obsahSouboru);
        } else if (format === 'xlsx' || format === 'xls') {
          rozpar = parsujXlsxVypis(telo.obsahSouboru);
        } else {
          rozpar = parsujGeorgeExport(telo.obsahSouboru);
        }
      } catch (e) {
        return json(400, { error: e.message });
      }

      const { rows: firmyRadky } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const firmaRadek = firmyRadky.find((f) => f.Nazev === firma);
      if (!firmaRadek) return json(404, { error: 'Firma "' + firma + '" nebyla nalezena.' });

      // Firma může mít víc účtů (typicky CZK + EUR) - appka kontrolu shody
      // dělá proti MNOŽINĚ všech známých účtů firmy, ne jen jednomu. Zdroj:
      // list Ucty (od v3.6) + starší jedno pole Bankovni_ucet v listu Firmy
      // (appka ho dál čte jako "legacy" jeden účet, nic se nemigruje).
      const { rows: uctyRadky } = await readSheetObjects(sheets, spreadsheetId, 'Ucty');
      const uctyFirmy = uctyRadky.filter((u) => u.Firma === firma);
      const znameUctyFirmy = new Set(
        uctyFirmy.map((u) => String(u.Cislo_uctu || '').trim()).filter(Boolean)
      );
      const legacyUcet = String(firmaRadek.Bankovni_ucet || '').trim();
      if (legacyUcet) znameUctyFirmy.add(legacyUcet);

      if (
        znameUctyFirmy.size > 0 && rozpar.ownerAccountNumber &&
        !znameUctyFirmy.has(rozpar.ownerAccountNumber) && !telo.ignorovatNesouladUctu
      ) {
        return json(409, {
          error: 'ucet_nesedi',
          varovani:
            'Vybrali jste firmu "' + firma + '" (známé účty: ' + Array.from(znameUctyFirmy).join(', ') +
            '), ale tenhle výpis patří k účtu ' + rozpar.ownerAccountNumber +
            (rozpar.ownerAccountTitle ? ' (' + rozpar.ownerAccountTitle + ')' : '') +
            '. Opravdu pokračovat?',
          detekovanyUcet: rozpar.ownerAccountNumber,
          detekovanyNazev: rozpar.ownerAccountTitle,
        });
      }

      const { rows: existujiciPohyby } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      const znameHashe = new Set(existujiciPohyby.map((p) => p.Zdroj_hash));

      const { rows: doklady } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
      const jizPouzitaDokladId = new Set(
        existujiciPohyby.filter((p) => p.Doklad_ID).map((p) => p.Doklad_ID)
      );
      const kandidatiDoklady = doklady.filter(
        (d) => (d.Firma_potvrzena || d.Firma_AI_odhad) === firma && !jizPouzitaDokladId.has(d.ID)
      );

      // Od v3.22: kandidáti pro spárování PŘÍJMŮ s Vydanými fakturami (viz
      // lib/bankHelpers.js, navrhniShoduPrijem) - jen dosud neuhrazené/
      // částečně uhrazené faktury dané firmy.
      const { rows: fakturyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury').catch(
        () => ({ rows: [] })
      );
      const kandidatiFaktury = fakturyVsechny.filter(
        (f) => f.Firma === firma && (f.Stav === 'Neuhrazeno' || f.Stav === 'Částečně uhrazeno')
      );

      // Od v4.19: kandidáti pro spárování PŘÍJMŮ přímo s nájemní Smlouvou
      // (viz lib/bankHelpers.js, navrhniShoduNajem) - appka tenhle zdroj
      // zkouší jako DRUHÝ, teprve když příjem neodpovídá žádné Vydané
      // faktuře (viz níž). Appka NEODEBÍRÁ smlouvu ze seznamu kandidátů po
      // shodě (na rozdíl od dokladů/faktur) - stejná nájemní smlouva se má
      // dál nabízet i u dalších měsíčních plateb v tomtéž výpisu.
      const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy').catch(() => ({
        rows: [],
      }));
      const kandidatiSmlouvyNajem = smlouvyVsechny.filter(
        (s) => s.Firma === firma && String(s.Typ || '').trim() === 'Nájem'
      );

      const datumImportu = new Date().toISOString().slice(0, 10);
      // Od v4.21: appka vygeneruje jedno ID na CELÝ tenhle import, ať appka
      // umí později smazat celý špatně naimportovaný výpis najednou (DELETE
      // ?importId=X), viz lib/bankSchema.js a DELETE handler níž.
      const importId = crypto.randomUUID();
      const novePohyby = [];
      let pocetDuplicit = 0;
      let pocetNavrzeno = 0;
      let pocetBezDokladu = 0;
      let pocetNesparovano = 0;
      let pocetNavrzenoPrijmu = 0;
      let pocetNavrzenoNajmu = 0;

      rozpar.polozky.forEach((p) => {
        if (znameHashe.has(p.hash)) {
          pocetDuplicit += 1;
          return;
        }

        let stav = 'Nespárováno';
        let dokladId = '';
        let vydanaFakturaId = '';
        let smlouvaId = '';

        if (p.castka > 0) {
          // Od v3.22: dřív appka příchozí platbu rovnou označila "Bez
          // dokladu" - teď nejdřív zkusí navrhnout konkrétní Vydanou
          // fakturu podle částky + jména zákazníka, appka jen NAVRHUJE
          // (Navrženo - vydaná faktura), nikdy sama nepotvrzuje.
          const navrh = navrhniShoduPrijem(p, kandidatiFaktury);
          if (navrh && navrh.skore >= 2) {
            stav = 'Navrženo - vydaná faktura';
            vydanaFakturaId = navrh.fakturaId;
            pocetNavrzenoPrijmu += 1;
            // ať appka v rámci jednoho importu nenabídne stejnou fakturu
            // dvakrát dvěma různým PLNĚ pokrývajícím platbám (částečné
            // shody appka nechává být - jedna faktura klidně může dostat
            // víc dílčích plateb).
            if (!navrh.castecne) {
              const idx = kandidatiFaktury.findIndex((f) => f.ID === vydanaFakturaId);
              if (idx >= 0) kandidatiFaktury.splice(idx, 1);
            }
          } else {
            // Od v4.19: žádná vydaná faktura neodpovídá - appka zkusí ještě
            // aktivní nájemní Smlouvu (jméno nájemce + očekávaná částka,
            // viz navrhniShoduNajem výš), teprve pak příjem označí "Bez
            // dokladu".
            const navrhNajem = navrhniShoduNajem(p, kandidatiSmlouvyNajem);
            if (navrhNajem && navrhNajem.skore >= 2) {
              stav = 'Navrženo - nájemní smlouva';
              smlouvaId = navrhNajem.smlouvaId;
              pocetNavrzenoNajmu += 1;
            } else {
              stav = 'Bez dokladu';
              pocetBezDokladu += 1;
            }
          }
        } else if (jeBezDokladu(p.typ_pohybu)) {
          stav = 'Bez dokladu';
          pocetBezDokladu += 1;
        } else {
          const navrh = navrhniShodu(p, kandidatiDoklady);
          if (navrh && navrh.skore >= 2) {
            stav = 'Navrženo';
            dokladId = navrh.dokladId;
            pocetNavrzeno += 1;
            // ať appka v rámci jednoho importu nenabídne stejný doklad
            // dvakrát dvěma různým platbám
            const idx = kandidatiDoklady.findIndex((d) => d.ID === dokladId);
            if (idx >= 0) kandidatiDoklady.splice(idx, 1);
          } else {
            pocetNesparovano += 1;
          }
        }

        novePohyby.push({
          ID: crypto.randomUUID(),
          Firma: firma,
          Cislo_uctu_vlastni: rozpar.ownerAccountNumber || '',
          Datum: p.datum,
          Castka: p.castka,
          Mena: p.mena,
          Typ_pohybu: p.typ_pohybu,
          Protistrana: p.protistrana,
          Cislo_uctu_protistrany: p.cislo_uctu_protistrany,
          Variabilni_symbol: p.variabilni_symbol,
          Konstantni_symbol: p.konstantni_symbol,
          Specificky_symbol: p.specificky_symbol,
          Popis: p.popis,
          Doklad_ID: dokladId,
          Stav_parovani: stav,
          Poznamka: '',
          Zdroj_hash: p.hash,
          Datum_importu: datumImportu,
          Vydana_faktura_ID: vydanaFakturaId,
          Smlouva_ID: smlouvaId,
          Import_ID: importId,
        });
      });

      if (novePohyby.length > 0) {
        await appendRows(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, novePohyby);
      }

      // Pohodlnostní doplnění: pokud appka o firmě zatím NEZNÁ žádný účet
      // (ani Ucty, ani legacy Firmy.Bankovni_ucet) a výpis nesl číslo účtu
      // (George JSON), appka ho rovnou založí jako první řádek v Ucty - ať
      // Jan nemusí po prvním importu nic ručně doplňovat. U dalších účtů
      // firmy (když už první existuje) appka nic sama nezakládá - jen
      // hlídá shodu s tím, co je v Ucty/Firmy, viz "ucet_nesedi" výš.
      let ucetUlozenNove = false;
      if (znameUctyFirmy.size === 0 && rozpar.ownerAccountNumber) {
        try {
          await appendRow(sheets, spreadsheetId, 'Ucty', UCTY_HEADERS, {
            ID: crypto.randomUUID(),
            Firma: firma,
            Cislo_uctu: rozpar.ownerAccountNumber,
            Mena: (rozpar.polozky[0] && rozpar.polozky[0].mena) || 'CZK',
            Popis: rozpar.ownerAccountTitle || '',
          });
          ucetUlozenNove = true;
        } catch (e) {
          // nekritické - jen pohodlnostní doplnění, import samotný už proběhl
        }
      }

      return json(200, {
        ok: true,
        pridano: novePohyby.length,
        duplicitni: pocetDuplicit,
        navrzeno: pocetNavrzeno,
        bezDokladu: pocetBezDokladu,
        nesparovano: pocetNesparovano,
        navrzenoPrijmu: pocetNavrzenoPrijmu,
        navrzenoNajmu: pocetNavrzenoNajmu,
        detekovanyUcet: rozpar.ownerAccountNumber,
        ucetUlozenNove,
        importId: novePohyby.length > 0 ? importId : '',
      });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, zmeny } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'Chybí ID pohybu.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      const pohyb = rows.find((r) => r.ID === id);
      if (!pohyb) return json(404, { error: 'Pohyb nenalezen.' });
      if (!maPristupKFirme(uzivatel, pohyb.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

      const zmenyBezpecne = Object.assign({}, zmeny || {});

      // Nové přiřazení ke Smlouvě (v3.19) - appka ověří, že smlouva
      // existuje a patří STEJNÉ firmě jako pohyb, ať omylem nevznikne
      // propojení napříč firmami.
      let noveSmlouvaId = null;
      if (
        zmenyBezpecne.Smlouva_ID !== undefined &&
        zmenyBezpecne.Smlouva_ID !== '' &&
        zmenyBezpecne.Smlouva_ID !== pohyb.Smlouva_ID
      ) {
        const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
        const smlouva = smlouvyVsechny.find((s) => s.ID === zmenyBezpecne.Smlouva_ID);
        if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });
        if (smlouva.Firma !== pohyb.Firma) return json(400, { error: 'Vybraná smlouva patří jiné firmě.' });
        noveSmlouvaId = smlouva.ID;
      }

      // Od v3.22: RUČNÍ potvrzení (nebo rovnou ruční přiřazení) spárování
      // příjmu s Vydanou fakturou appka pozná podle Stav_parovani
      // "Spárováno - vydaná faktura" - appka pak rovnou přepíše
      // Vydane_faktury.Stav na Uhrazeno/Částečně uhrazeno podle poměru
      // částky platby k částce faktury. Appka tohle NIKDY nedělá sama u
      // pouhého NÁVRHU ("Navrženo - vydaná faktura") - jen při ručním
      // potvrzení účetní.
      let fakturaKAktualizaci = null;
      if (zmenyBezpecne.Stav_parovani === 'Spárováno - vydaná faktura') {
        const vydanaFakturaId = zmenyBezpecne.Vydana_faktura_ID || pohyb.Vydana_faktura_ID;
        if (!vydanaFakturaId) return json(400, { error: 'Chybí Vydana_faktura_ID pro potvrzení spárování.' });

        const { rows: fakturyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
        const faktura = fakturyVsechny.find((f) => f.ID === vydanaFakturaId);
        if (!faktura) return json(404, { error: 'Vydaná faktura nenalezena.' });
        if (faktura.Firma !== pohyb.Firma) return json(400, { error: 'Vybraná vydaná faktura patří jiné firmě.' });

        zmenyBezpecne.Vydana_faktura_ID = vydanaFakturaId;
        fakturaKAktualizaci = faktura;
      }

      const aktualizovany = Object.assign({}, pohyb, zmenyBezpecne);
      await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, pohyb._row, aktualizovany);

      if (fakturaKAktualizaci) {
        const castkaPlatby = parsujCastkuZListu(aktualizovany.Castka);
        const castkaFaktury = Math.abs(parsujCastkuZListu(fakturaKAktualizaci.Castka));
        const plnaUhrada = castkaPlatby >= castkaFaktury - 1; // tolerance 1 Kč na zaokrouhlení
        await updateRow(sheets, spreadsheetId, 'Vydane_faktury', VYDANE_FAKTURY_HEADERS, fakturaKAktualizaci._row, {
          ...fakturaKAktualizaci,
          Stav: plnaUhrada ? 'Uhrazeno' : 'Částečně uhrazeno',
          Datum_uhrady: aktualizovany.Datum || new Date().toISOString().slice(0, 10),
        });
      }

      // Auto-návrh dalších pohybů ke stejné smlouvě (v3.19) - jen při
      // RUČNÍM potvrzení (Stav_parovani "Trvalý příkaz", ne jen návrhu),
      // ať appka nezačne řetězit návrhy z návrhů.
      let autoNavrzenoDalsich = 0;
      if (noveSmlouvaId && zmenyBezpecne.Stav_parovani === 'Trvalý příkaz') {
        const vzor = {
          castka: parsujCastkuZListu(pohyb.Castka),
          protistrana: pohyb.Protistrana || pohyb.Popis || '',
        };
        const ostatniNesparovane = rows.filter(
          (r) => r.Firma === pohyb.Firma && r.ID !== pohyb.ID && r.Stav_parovani === 'Nespárováno'
        );
        for (const kandidat of ostatniNesparovane) {
          const kProNavrh = {
            castka: parsujCastkuZListu(kandidat.Castka),
            protistrana: kandidat.Protistrana || kandidat.Popis || '',
          };
          if (!jePodobnaShodaSmlouvy(vzor, kProNavrh)) continue;
          await updateRow(sheets, spreadsheetId, 'Bankovni_pohyby', BANKOVNI_HEADERS, kandidat._row, {
            ...kandidat,
            Smlouva_ID: noveSmlouvaId,
            Stav_parovani: 'Navrženo - trvalý příkaz',
          });
          autoNavrzenoDalsich += 1;
        }
      }

      return json(200, { ok: true, autoNavrzenoDalsich, fakturaAktualizovana: !!fakturaKAktualizaci });
    }

    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      const id = params.id;
      const importId = params.importId;
      if (!id && !importId) return json(400, { error: 'Chybí ID pohybu nebo importId.' });

      const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');

      if (id) {
        const pohyb = rows.find((r) => r.ID === id);
        if (!pohyb) return json(404, { error: 'Pohyb nenalezen.' });
        if (!maPristupKFirme(uzivatel, pohyb.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

        await deleteRow(sheets, spreadsheetId, 'Bankovni_pohyby', pohyb._row);
        return json(200, { ok: true, smazano: 1 });
      }

      // Dávkové smazání celého importu (v4.21) - appka smaže jen pohyby z
      // firem, ke kterým má přihlášený uživatel přístup (u ostatních vrátí
      // chybu, ať omylem nesmaže cizí data, i kdyby stejné importId - v
      // praxi nemožné, protože ID je UUID, ale appka to radši ověří).
      const pohybyImportu = rows.filter((r) => r.Import_ID === importId);
      if (pohybyImportu.length === 0) return json(404, { error: 'Žádný pohyb s tímhle importId nenalezen.' });

      const nepristupne = pohybyImportu.filter((p) => !maPristupKFirme(uzivatel, p.Firma));
      if (nepristupne.length > 0) {
        return json(403, { error: 'Nemáte přístup ke všem pohybům tohoto importu.' });
      }

      const serazenoSestupne = pohybyImportu.slice().sort((a, b) => b._row - a._row);
      for (const pohyb of serazenoSestupne) {
        await deleteRow(sheets, spreadsheetId, 'Bankovni_pohyby', pohyb._row);
      }
      return json(200, { ok: true, smazano: serazenoSestupne.length });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
