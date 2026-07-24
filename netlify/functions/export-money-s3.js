/**
 * netlify/functions/export-money-s3.js
 * GET (Bearer token) ?smer=prijate|vydane&firma=Nazev&rok=RRRR&mesic=MM
 *   (přijaté navíc: &stredisko=X; vydané navíc: &jednotka=X)
 * -> stáhne XML soubor ve formátu Money S3 (viz lib/moneyS3Export.js pro
 *    plné zdůvodnění struktury a známé mezery v mapování) s Přijatými
 *    doklady (smer=prijate, list Doklady) nebo Vydanými fakturami
 *    (smer=vydane, list Vydane_faktury), odpovídajícími zvoleným filtrům -
 *    stejné filtry jako appka nabízí v záložce Export/Vydané faktury.
 *
 * Přístup: appka export omezuje na admina/účetní - jde o účetní operaci
 * (podklad pro import do Money S3), ne o běžnou práci s jednotlivým
 * dokladem/fakturou, stejné omezení jako appka má u "Schválit"/"Označit
 * uhrazeno" jinde v appce.
 *
 * Appka do exportu zahrne jen doklady/faktury, které už appka SCHVÁLILA/
 * ZPRACOVALA (ne placeholdery "Zpracovává se" a ne "Možná duplicita" -
 * appka by jinak do účetnictví mohla propašovat nedořešený/rozpracovaný
 * záznam).
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { vytvorXmlPrijateFaktury, vytvorXmlVydaneFaktury } = require('../../lib/moneyS3Export');
const { json, xml } = require('../../lib/http');

function jeUcetniNeboAdmin(uzivatel) {
  return uzivatel.role === 'admin' || uzivatel.role === 'ucetni';
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
    return json(403, { error: 'Export pro Money S3 smí spustit jen administrátor nebo účetní.' });
  }

  try {
    const params = event.queryStringParameters || {};
    const smer = String(params.smer || '').trim();
    const firmaFiltr = String(params.firma || '').trim();
    const rokFiltr = String(params.rok || '').trim();
    const mesicFiltr = String(params.mesic || '').trim();
    if (smer !== 'prijate' && smer !== 'vydane') {
      return json(400, { error: 'Chybí nebo neplatný parametr smer (prijate/vydane).' });
    }
    if (!firmaFiltr) return json(400, { error: 'Vyberte firmu, pro kterou se má export vytvořit.' });

    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const { rows: firmyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Firmy');
    const firma = firmyVsechny.find((f) => f.Nazev === firmaFiltr);
    if (!firma) return json(404, { error: 'Firma nenalezena.' });

    if (smer === 'prijate') {
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

      const telo = vytvorXmlPrijateFaktury(vybrane, polozkyPodleId, firma);
      const nazevSouboru = 'money_s3_prijate_' + bezpecnyNazevSouboru(firmaFiltr) + '_' + Date.now() + '.xml';
      return xml(200, telo, nazevSouboru);
    }

    // smer === 'vydane'
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

    const telo = vytvorXmlVydaneFaktury(vybrane, polozkyPodleId, firma);
    const nazevSouboru = 'money_s3_vydane_' + bezpecnyNazevSouboru(firmaFiltr) + '_' + Date.now() + '.xml';
    return xml(200, telo, nazevSouboru);
  } catch (e) {
    return json(500, { error: e.message });
  }
};
