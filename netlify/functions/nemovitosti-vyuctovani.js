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
 * Od v4.37 (Jan: "napárovat účetní data do vyúčtování, zaplacené zálohy
 * SVJ a úhrady od nájemníka... udělej to ať to dává smysl i splňuje
 * zákonné povinnosti") appka rozšířila výpočet o dvě věci, obě appka
 * dřív neřešila:
 *
 * a) ROZPAD NÁKLADŮ NA SLUŽBY A VLASTNÍ NÁKLAD PRONAJÍMATELE. Appka do
 *    v4.36 počítala všechny Doklady daného Střediska jako jeden souhrnný
 *    náklad proti záloze - to appce umožňovalo omylem přenést na
 *    nájemníka i náklad, který appka podle zákona č. 67/2013 Sb. (o
 *    službách spojených s užíváním bytu) přenášet nesmí (oprava/údržba,
 *    pojištění, daň z nemovitosti - to je náklad VLASTNÍKA, ne služba).
 *    Appka teď každý Doklad zařadí podle Kategorie do jedné ze dvou
 *    skupin (viz lib/vyuctovaniKategorie.js - appkou navržená výchozí
 *    mapa) - `nakladySluzby` appka počítá proti záloze, `nakladyVlastni`
 *    appka vrací jen informativně (přehled majitele, nesmí ovlivnit
 *    částku vyúčtovanou nájemníkovi).
 * b) NÁKLADY BEZ VLASTNÍHO DOKLADU (typicky SVJ předpis, pojistka) -
 *    appka je do v4.36 vůbec neviděla, protože appka počítala náklady
 *    jen z Dokladů. Appka teď navíc najde všechny OSTATNÍ Smlouvy (Typ
 *    != 'Nájem') se stejným Střediskem jako řešená nájemní smlouva - jde
 *    o stejný mechanismus "trvalý příkaz", jaký appka od v3.19 používá
 *    pro nájem, jen na výdajové straně (SVJ/pojistka nemá měsíční
 *    fakturu, appka o platbě ví jen jako o pravidelném bankovním pohybu
 *    přiřazeném ke smlouvě). Appka sečte matchnuté odchozí pohyby v
 *    období a za KAŽDÝ přičte Smlouvy.Sluzby_castka/Vlastni_naklad_castka
 *    (viz lib/smlouvySchema.js) do stejných dvou skupin jako u Dokladů.
 *
 * Výpočet (appka nic neukládá, jen na požádání dopočítá a vrátí rozklad -
 * appka žádná data v Sheets tímhle voláním nemění; appka výsledek na
 * přání appka umí ULOŽIT jako trvalý záznam, viz
 * netlify/functions/nemovitosti-vyuctovani-ulozene.js):
 * 1) Náklady appka spočítá ze DVOU zdrojů (Doklady + matchnuté náklady ze
 *    smluv, viz výš), rozdělené na `nakladySluzby`/`nakladyVlastni`.
 * 2) Přijaté zálohy appka odvodí z POČTU bankovních pohybů napojených na
 *    danou smlouvu (Smlouva_ID), se Stav_parovani === 'Trvalý příkaz' a
 *    Datum v období, vynásobeného Smlouvy.Zaloha_na_sluzby - appka
 *    vychází ze stejné filozofie jako párování podle přesné částky
 *    (lib/bankHelpers.js) - každý napárovaný pohyb appka počítá jako
 *    jednu celou měsíční zálohu, appka neřeší prorata/kombinované platby.
 * 3) Rozdíl = zálohy přijaté - `nakladySluzby` (appka DO rozdílu záměrně
 *    NEPOČÍTÁ `nakladyVlastni` - to je legislativní požadavek z bodu a)
 *    výš, ne zjednodušení). Kladné = přeplatek appka vrátí nájemníkovi,
 *    záporné = nedoplatek appka doúčtuje.
 * 4) Appka navíc (na vyžádání, `pocitatKauci=1`) dopočítá vrácení kauce:
 *    Kauce_castka - (nedoplatek ze SLUŽEB, pokud je) - škody (appka
 *    NEUKLÁDÁ škody nikam, appka je jen bere jako parametr pro tenhle
 *    jeden výpočet) = k vrácení. Appka vrátí celý rozklad, ne jen
 *    výsledné číslo.
 *
 * GET ?smlouva_id=X&od=RRRR-MM-DD&do=RRRR-MM-DD[&skody=CASTKA]
 *   -> { nakladySluzby, nakladyVlastni, zalohyPrijate,
 *        pocetZaplacenychZaloh, rozdil,
 *        kauce: { castka, skody, kVraceni } | null }
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { jeKategorieSluzba } = require('../../lib/vyuctovaniKategorie');
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

    // 1a) Náklady z Dokladů se stejným Stredisko v období, rozdělené podle
    //     Kategorie na služby/vlastní náklad (viz lib/vyuctovaniKategorie.js).
    const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
    let nakladySluzby = 0;
    let nakladyVlastni = 0;
    dokladyVsechny
      .filter((d) => d.Stredisko === smlouva.Stredisko)
      .filter((d) => d.Stav !== 'Zpracovává se')
      .filter((d) => String(d.Datum_dokladu || '') >= od && String(d.Datum_dokladu || '') <= doDatum)
      .forEach((d) => {
        // Dobropis snižuje dřívější náklad, stejná konvence jako appka
        // používá jinde (viz netlify/functions/dashboard-firmy.js).
        const znamenko = d.Typ_dokladu === 'Dobropis' ? -1 : 1;
        const castka = parsujCastkuZListu(d.Castka) * znamenko;
        if (jeKategorieSluzba(d.Kategorie)) nakladySluzby += castka;
        else nakladyVlastni += castka;
      });

    // 1b) Náklady bez vlastního Dokladu (SVJ předpis, pojistka apod.) -
    //     appka najde OSTATNÍ smlouvy (Typ != 'Nájem') stejného Střediska a
    //     sečte jejich matchnuté odchozí "trvalé příkazy" v období, každý
    //     rozdělený podle Smlouvy.Sluzby_castka/Vlastni_naklad_castka.
    const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
    const nakladoveSmlouvy = smlouvyVsechny.filter((s) =>
      s.Stredisko === smlouva.Stredisko && s.Typ !== 'Nájem'
    );
    const nakladoveSmlouvyById = new Map(nakladoveSmlouvy.map((s) => [s.ID, s]));
    pohybyVsechny
      .filter((p) =>
        nakladoveSmlouvyById.has(p.Smlouva_ID)
        && p.Stav_parovani === 'Trvalý příkaz'
        && String(p.Datum || '') >= od
        && String(p.Datum || '') <= doDatum
      )
      .forEach((p) => {
        const nakladovaSmlouva = nakladoveSmlouvyById.get(p.Smlouva_ID);
        nakladySluzby += parsujCastkuZListu(nakladovaSmlouva.Sluzby_castka);
        nakladyVlastni += parsujCastkuZListu(nakladovaSmlouva.Vlastni_naklad_castka);
      });

    // 2) Přijaté zálohy - počet napárovaných trvalých příkazů × Zaloha_na_sluzby.
    const pocetZaplacenychZaloh = pohybyVsechny.filter((p) =>
      p.Smlouva_ID === smlouvaId
      && p.Stav_parovani === 'Trvalý příkaz'
      && String(p.Datum || '') >= od
      && String(p.Datum || '') <= doDatum
    ).length;
    const zalohaNaSluzby = parsujCastkuZListu(smlouva.Zaloha_na_sluzby);
    const zalohyPrijate = pocetZaplacenychZaloh * zalohaNaSluzby;

    // 3) Rozdíl appka počítá JEN ze služeb (nakladyVlastni appka záměrně
    //    vynechává - viz komentář nahoře, zákon appce nedovoluje promítnout
    //    vlastní náklad pronajímatele do vyúčtování služeb nájemníkovi).
    const rozdil = zalohyPrijate - nakladySluzby;

    const vysledek = {
      stredisko: smlouva.Stredisko,
      obdobi: { od, do: doDatum },
      nakladySluzby,
      nakladyVlastni,
      zalohaNaSluzby,
      pocetZaplacenychZaloh,
      zalohyPrijate,
      rozdil,
      kauce: null,
    };

    // 4) Kauce (na vyžádání) - appka škody bere jen jako vstupní parametr
    //    pro tenhle výpočet, appka je nikam neukládá. Nedoplatek appka
    //    bere ze stejného "rozdil" (tedy jen ze služeb).
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
