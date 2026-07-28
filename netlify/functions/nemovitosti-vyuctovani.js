/**
 * netlify/functions/nemovitosti-vyuctovani.js
 * Dopočítané vyúčtování nájmu za období (od v4.36, modul Nemovitosti -
 * backlog položka 19, brainstorm + odpovědi na otevřené otázky 2026-07-27,
 * viz claude/nomis-faktury-backlog.md).
 *
 * Rozhodnuto (AskUserQuestion): appka ZATÍM počítá vyúčtování jen na
 * úrovni JEDNÉ jednotky (1 středisko = 1 vyúčtování) - poměrové
 * rozpočítávání nákladů mezi víc jednotek appka zatím NEIMPLEMENTUJE.
 *
 * Výpočet (appka nic neukládá, jen na požádání dopočítá a vrátí rozklad -
 * appka žádná data v Sheets tímhle voláním nemění):
 * 1) Skutečné náklady appka spočítá jako součet VŠECH Dokladů se stejným
 *    Stredisko jako smlouva a Datum_dokladu v zadaném období (appka
 *    záměrně NEFILTRUJE podle Kategorie - zjednodušení, na které se Jan
 *    přiklonil, viz "1 jednotka = 1 vyúčtování": všechny náklady na daném
 *    středisku appka považuje za náklady té jednotky).
 * 2) Přijaté zálohy appka odvodí z POČTU bankovních pohybů napojených na
 *    danou smlouvu (Smlouva_ID), se Stav_parovani === 'Trvalý příkaz' a
 *    Datum v období, vynásobeného Smlouvy.Zaloha_na_sluzby - appka
 *    vychází ze stejné filozofie jako párování podle přesné částky
 *    (lib/bankHelpers.js) - každý napárovaný pohyb appka počítá jako
 *    jednu celou měsíční zálohu, appka neřeší prorata/kombinované platby.
 * 3) Rozdíl = zálohy přijaté - skutečné náklady (kladné = přeplatek na
 *    appka vrátí nájemníkovi, záporné = nedoplatek appka doúčtuje).
 * 4) Appka navíc (na vyžádání, `pocitatKauci=1`) dopočítá vrácení kauce:
 *    Kauce_castka - (nedoplatek, pokud je) - škody (appka NEUKLÁDÁ škody
 *    nikam, appka je jen bere jako parametr pro tenhle jeden výpočet) =
 *    k vrácení. Appka vrátí celý rozklad, ne jen výsledné číslo.
 *
 * GET ?smlouva_id=X&od=RRRR-MM-DD&do=RRRR-MM-DD[&skody=CASTKA]
 *   -> { naklady, zalohyPrijate, pocetZaplacenychZaloh, rozdil,
 *        kauce: { castka, skody, kVraceni } | null }
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { json } = require('../../lib/http');

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
  if (uzivatel.role !== 'admin' && uzivatel.role !== 'ucetni') {
    return json(403, { error: 'Nemovitosti jsou dostupné jen administrátorovi a účetní.' });
  }
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const qs = event.queryStringParameters || {};
  const smlouvaId = String(qs.smlouva_id || '').trim();
  const od = String(qs.od || '').trim();
  const doDatum = String(qs.do || '').trim();
  if (!smlouvaId) return json(400, { error: 'Chybí smlouva_id.' });
  if (!od || !doDatum) return json(400, { error: 'Chybí období (od/do).' });

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
    const smlouva = smlouvyVsechny.find((s) => s.ID === smlouvaId);
    if (!smlouva) return json(404, { error: 'Smlouva nenalezena.' });
    if (!maPristupKFirme(uzivatel, smlouva.Firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });
    if (smlouva.Typ !== 'Nájem') return json(400, { error: 'Vyúčtování jde spočítat jen u smlouvy typu Nájem.' });

    // 1) Skutečné náklady - všechny Doklady se stejným Stredisko v období.
    const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
    let naklady = 0;
    dokladyVsechny
      .filter((d) => d.Stredisko === smlouva.Stredisko)
      .filter((d) => d.Stav !== 'Zpracovává se')
      .filter((d) => String(d.Datum_dokladu || '') >= od && String(d.Datum_dokladu || '') <= doDatum)
      .forEach((d) => {
        // Dobropis snižuje dřívější náklad, stejná konvence jako appka
        // používá jinde (viz netlify/functions/dashboard-firmy.js).
        const znamenko = d.Typ_dokladu === 'Dobropis' ? -1 : 1;
        naklady += parsujCastkuZListu(d.Castka) * znamenko;
      });

    // 2) Přijaté zálohy - počet napárovaných trvalých příkazů × Zaloha_na_sluzby.
    const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
    const pocetZaplacenychZaloh = pohybyVsechny.filter((p) =>
      p.Smlouva_ID === smlouvaId
      && p.Stav_parovani === 'Trvalý příkaz'
      && String(p.Datum || '') >= od
      && String(p.Datum || '') <= doDatum
    ).length;
    const zalohaNaSluzby = parsujCastkuZListu(smlouva.Zaloha_na_sluzby);
    const zalohyPrijate = pocetZaplacenychZaloh * zalohaNaSluzby;

    // 3) Rozdíl.
    const rozdil = zalohyPrijate - naklady;

    const vysledek = {
      stredisko: smlouva.Stredisko,
      obdobi: { od, do: doDatum },
      naklady,
      zalohaNaSluzby,
      pocetZaplacenychZaloh,
      zalohyPrijate,
      rozdil,
      kauce: null,
    };

    // 4) Kauce (na vyžádání) - appka škody bere jen jako vstupní parametr
    //    pro tenhle výpočet, appka je nikam neukládá.
    if (qs.pocitatKauci === '1') {
      const kauceCastka = parsujCastkuZListu(smlouva.Kauce_castka);
      const skody = parsujCastkuZListu(qs.skody);
      const nedoplatek = rozdil < 0 ? -rozdil : 0;
      const kVraceni = kauceCastka - nedoplatek - skody;
      vysledek.kauce = { castka: kauceCastka, nedoplatek, skody, kVraceni };
    }

    return json(200, vysledek);
  } catch (e) {
    return json(500, { error: e.message });
  }
};
