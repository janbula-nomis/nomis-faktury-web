/**
 * netlify/functions/export-excel.js
 * GET (Bearer token) ?typ=doklady|vydane|banka|danovy&firma=X&rok=RRRR&mesic=MM
 *   (doklady navíc: &stredisko=X; vydane navíc: &jednotka=X)
 * -> stáhne XLSX sešit (lib/excelExport.js) s daty appky, čitelný přímo v
 *    Excelu/Google Sheets - NENÍ určený k importu do konkrétního účetního
 *    programu (na to appka od v4.27 má samostatný export do Money S3 XML DE,
 *    viz export-money-s3.js) - jde o obecný, čitelný podklad/kopii dat pro
 *    Jana a účetní. Přidáno v4.28 na Janovu žádost („můžeme přidat ještě
 *    export do Excel?“).
 *
 * Přístup appka omezuje na admina/účetní - stejné zdůvodnění jako u exportu
 * do Money S3 (jde o účetní/kontrolní operaci nad víc záznamy najednou, ne
 * o běžnou práci s jedním dokladem/pohybem).
 *
 * typ=doklady - Přijaté faktury (list Doklady), jen Stav="Schváleno" (appka
 *   držela stejné omezení jako u Money S3 exportu, ať appka needituje
 *   rozpracované/nedořešené doklady) + jejich Položky, dva listy sešitu.
 * typ=vydane  - Vydané faktury (list Vydane_faktury), appka vynechává
 *   placeholder stavy "Zpracovává se"/"Možná duplicita", + jejich Položky.
 * typ=banka   - Bankovní pohyby jedné firmy (appka NEOMEZUJE na konkrétní
 *   Stav_parovani - jde o obecnou kopii výpisu, ne o podklad k importu).
 * typ=danovy  - Daňový přehled (DPH bilance + skutečně zaplacené/vrácené
 *   daně), rozpad podle měsíce - appka tu logiku počítá stejně jako
 *   netlify/functions/danovy-prehled.js (viz tam pro plné zdůvodnění), jen
 *   zjednodušeně na měsíční rozpad a s volitelným filtrem firma/rok - appka
 *   výpočet záměrně nesdílí importem (stejná konvence jako appka má u
 *   duplikovaných přístupových helperů v jiných souborech), appka je
 *   případně udržuje ručně synchronně s danovy-prehled.js.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const {
  vytvorExcelDoklady,
  vytvorExcelVydaneFaktury,
  vytvorExcelBanka,
  vytvorExcelDanovyPrehled,
} = require('../../lib/excelExport');
const { json, xlsx } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
}

function maPristupKFirme(uzivatel, firma) {
  return uzivatel.role === 'admin' || (uzivatel.firmy || []).includes(firma);
}

function seskupPolozkyPodleId(polozkyVsechny, idPole) {
  const mapa = {};
  polozkyVsechny.forEach((p) => {
    const id = p[idPole];
    if (!id) return;
    if (!mapa[id]) mapa[id] = [];
    mapa[id].push(p);
  });
  Object.keys(mapa).forEach((id) => {
    mapa[id].sort((a, b) => (Number(a.Poradi) || 0) - (Number(b.Poradi) || 0));
  });
  return mapa;
}

function bezpecnyNazevSouboru(text) {
  return String(text || 'export')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'export';
}

function zaokrouhli(cislo) {
  return Math.round(cislo * 100) / 100;
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

  if (!jeUcetniNeboAdmin(uzivatel)) {
    return json(403, { error: 'Export do Excelu smí spustit jen administrátor nebo účetní.' });
  }

  try {
    const params = event.queryStringParameters || {};
    const typ = String(params.typ || '').trim();
    const firmaFiltr = String(params.firma || '').trim();
    const rokFiltr = String(params.rok || '').trim();
    const mesicFiltr = String(params.mesic || '').trim();

    if (!['doklady', 'vydane', 'banka', 'danovy'].includes(typ)) {
      return json(400, { error: 'Chybí nebo neplatný parametr typ (doklady/vydane/banka/danovy).' });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (typ === 'doklady' || typ === 'vydane') {
      if (!firmaFiltr) return json(400, { error: 'Vyberte firmu, pro kterou se má export vytvořit.' });
      const { rows: firmyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
      const firma = firmyVsechny.find((f) => f.Nazev === firmaFiltr);
      if (!firma) return json(404, { error: 'Firma nenalezena.' });
    }

    if (typ === 'doklady') {
      const strediskoFiltr = String(params.stredisko || '').trim();
      const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
      const vybrane = dokladyVsechny.filter((d) => {
        if (d.Stav !== 'Schváleno') return false;
        const firmaDokladu = d.Firma_potvrzena || d.Firma_AI_odhad || '';
        if (firmaDokladu !== firmaFiltr) return false;
        if (strediskoFiltr && (d.Stredisko || '') !== strediskoFiltr) return false;
        const datum = String(d.Datum_dokladu || '');
        if (rokFiltr && datum.slice(0, 4) !== rokFiltr) return false;
        if (mesicFiltr && datum.slice(5, 7) !== mesicFiltr) return false;
        return true;
      });
      if (vybrane.length === 0) {
        return json(404, { error: 'Žádné schválené doklady neodpovídají zvolenému filtru.' });
      }
      const { rows: polozkyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady_Polozky').catch(() => ({ rows: [] }));
      const polozkyPodleId = seskupPolozkyPodleId(polozkyVsechny, 'Doklad_ID');
      const telo = vytvorExcelDoklady(vybrane, polozkyPodleId);
      const nazevSouboru = 'prijate_faktury_' + bezpecnyNazevSouboru(firmaFiltr) + '_' + Date.now() + '.xlsx';
      return xlsx(200, telo, nazevSouboru);
    }

    if (typ === 'vydane') {
      const jednotkaFiltr = String(params.jednotka || '').trim();
      const { rows: fakturyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
      const vybrane = fakturyVsechny.filter((f) => {
        if (f.Stav === 'Zpracovává se' || f.Stav === 'Možná duplicita') return false;
        if (f.Firma !== firmaFiltr) return false;
        if (jednotkaFiltr && (f.Jednotka || '') !== jednotkaFiltr) return false;
        const datum = String(f.Datum_vystaveni || '');
        if (rokFiltr && datum.slice(0, 4) !== rokFiltr) return false;
        if (mesicFiltr && datum.slice(5, 7) !== mesicFiltr) return false;
        return true;
      });
      if (vybrane.length === 0) {
        return json(404, { error: 'Žádné vydané faktury neodpovídají zvolenému filtru.' });
      }
      const { rows: polozkyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_Faktury_Polozky').catch(() => ({ rows: [] }));
      const polozkyPodleId = seskupPolozkyPodleId(polozkyVsechny, 'Faktura_ID');
      const telo = vytvorExcelVydaneFaktury(vybrane, polozkyPodleId);
      const nazevSouboru = 'vydane_faktury_' + bezpecnyNazevSouboru(firmaFiltr) + '_' + Date.now() + '.xlsx';
      return xlsx(200, telo, nazevSouboru);
    }

    if (typ === 'banka') {
      if (!firmaFiltr) return json(400, { error: 'Vyberte firmu, pro kterou se má export vytvořit.' });
      if (!maPristupKFirme(uzivatel, firmaFiltr)) {
        return json(403, { error: 'Nemáte přístup k bankovním výpisům této firmy.' });
      }
      const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby').catch(() => ({ rows: [] }));
      const vybrane = pohybyVsechny.filter((p) => {
        if ((p.Firma || '').trim() !== firmaFiltr) return false;
        const datum = String(p.Datum || '');
        if (rokFiltr && datum.slice(0, 4) !== rokFiltr) return false;
        if (mesicFiltr && datum.slice(5, 7) !== mesicFiltr) return false;
        return true;
      });
      if (vybrane.length === 0) {
        return json(404, { error: 'Žádné bankovní pohyby neodpovídají zvolenému filtru.' });
      }
      const telo = vytvorExcelBanka(vybrane);
      const nazevSouboru = 'bankovni_vypis_' + bezpecnyNazevSouboru(firmaFiltr) + '_' + Date.now() + '.xlsx';
      return xlsx(200, telo, nazevSouboru);
    }

    // typ === 'danovy'
    if (firmaFiltr && !maPristupKFirme(uzivatel, firmaFiltr)) {
      return json(403, { error: 'Nemáte přístup k daňovému přehledu této firmy.' });
    }
    const { rows: firmyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
    const viditelneFirmy = firmyVsechny
      .filter((f) => maPristupKFirme(uzivatel, f.Nazev))
      .filter((f) => !firmaFiltr || f.Nazev === firmaFiltr)
      .map((f) => f.Nazev);
    const platciDph = firmyVsechny
      .filter((f) => String(f.Platce_DPH || '').trim() === 'ANO')
      .filter((f) => viditelneFirmy.includes(f.Nazev))
      .map((f) => f.Nazev);

    const dphBilanceMesicni = {};
    function pripoctiDph(datum, firma, pole, castka) {
      const mesic = String(datum || '').slice(0, 7);
      if (!mesic) return;
      if (rokFiltr && mesic.slice(0, 4) !== rokFiltr) return;
      if (!dphBilanceMesicni[mesic]) dphBilanceMesicni[mesic] = {};
      if (!dphBilanceMesicni[mesic][firma]) dphBilanceMesicni[mesic][firma] = { dphVydane: 0, dphPrijate: 0 };
      dphBilanceMesicni[mesic][firma][pole] += castka;
    }
    if (platciDph.length > 0) {
      try {
        const { rows: fakturyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Vydane_faktury');
        fakturyVsechny.forEach((f) => {
          if (!platciDph.includes(f.Firma)) return;
          const dph = parsujCastkuZListu(f.DPH);
          if (!dph) return;
          pripoctiDph(f.Datum_vystaveni, f.Firma, 'dphVydane', dph);
        });
      } catch (e) {
        // List Vydane_faktury nemusí existovat - appka nechá tuhle část prázdnou.
      }
      try {
        const { rows: dokladyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Doklady');
        dokladyVsechny.forEach((d) => {
          if (d.Stav === 'Zpracovává se') return;
          const firma = d.Firma_potvrzena || d.Firma_AI_odhad;
          if (!platciDph.includes(firma)) return;
          const dph = parsujCastkuZListu(d.DPH);
          if (!dph) return;
          pripoctiDph(d.Datum_dokladu, firma, 'dphPrijate', dph);
        });
      } catch (e) {
        // Nemělo by nastat (Doklady appka má vždy), ale appka se přesto nemá zastavit.
      }
    }
    Object.keys(dphBilanceMesicni).forEach((mesic) => {
      Object.keys(dphBilanceMesicni[mesic]).forEach((firma) => {
        const p = dphBilanceMesicni[mesic][firma];
        dphBilanceMesicni[mesic][firma] = {
          dphVydane: zaokrouhli(p.dphVydane),
          dphPrijate: zaokrouhli(p.dphPrijate),
          saldo: zaokrouhli(p.dphVydane - p.dphPrijate),
        };
      });
    });

    const danovePlatbyMesicni = {};
    try {
      const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');
      pohybyVsechny
        .filter((p) => p.Stav_parovani === 'Daňová platba' && p.Typ_dane)
        .filter((p) => viditelneFirmy.includes(p.Firma))
        .forEach((p) => {
          const mesic = String(p.Datum || '').slice(0, 7) || '(bez data)';
          if (rokFiltr && mesic.slice(0, 4) !== rokFiltr) return;
          const firma = p.Firma || '(nepřiřazeno)';
          const typDane = p.Typ_dane;
          const castka = parsujCastkuZListu(p.Castka);
          if (!danovePlatbyMesicni[mesic]) danovePlatbyMesicni[mesic] = {};
          if (!danovePlatbyMesicni[mesic][firma]) danovePlatbyMesicni[mesic][firma] = {};
          danovePlatbyMesicni[mesic][firma][typDane] = zaokrouhli(
            (danovePlatbyMesicni[mesic][firma][typDane] || 0) + castka
          );
        });
    } catch (e) {
      // List Bankovni_pohyby nemusí existovat (appka bez zapnuté Banky) -
      // Daňový přehled se kvůli tomu nemá přestat exportovat, jen bez téhle části.
    }

    if (Object.keys(dphBilanceMesicni).length === 0 && Object.keys(danovePlatbyMesicni).length === 0) {
      return json(404, { error: 'Žádná data daňového přehledu neodpovídají zvolenému filtru.' });
    }

    const telo = vytvorExcelDanovyPrehled(dphBilanceMesicni, danovePlatbyMesicni);
    const nazevSouboru = 'danovy_prehled_' + bezpecnyNazevSouboru(firmaFiltr || 'vsechny_firmy') + '_' + Date.now() + '.xlsx';
    return xlsx(200, telo, nazevSouboru);
  } catch (e) {
    return json(500, { error: e.message });
  }
};
