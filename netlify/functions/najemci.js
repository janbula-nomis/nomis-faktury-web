/**
 * netlify/functions/najemci.js
 * Číselník nájemců (od v4.81) - list "Najemci" v Sheets.
 *
 * Jan 2026-08-21 si ve volbě vybral číselník místo polí přímo na smlouvě:
 * Schulte Group a.s. má u něj víc bytů a jeho IČ, sídlo i členy
 * představenstva by jinak opisoval u každé smlouvy znovu.
 *
 * Sloupce i celá obsluha jsou stejné jako u Pronajímatelů - proč, a proč
 * jsou to přesto dva různé listy, vysvětluje hlavička lib/smluvniStrany.js.
 *
 * GET    -> { najemci: [...], listChybi, firmyDostupne } smí kterýkoli
 *           přihlášený uživatel: údaje nájemce potřebuje appka pokaždé, když
 *           se z karty bytu tiskne smlouva nebo protokol.
 * POST/PATCH/DELETE jen role "admin" - je to text, který jde do smlouvy.
 */
const { requireAuth } = require('../../lib/requireAuth');
const { obsluhaStran } = require('../../lib/smluvniStrany');
const { json } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  let uzivatel;
  try {
    uzivatel = requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }
  if (event.httpMethod !== 'GET' && uzivatel.role !== 'admin') {
    return json(403, { error: 'Tuto akci může provést jen administrátor.' });
  }

  return obsluhaStran(event, uzivatel, {
    list: 'Najemci',
    klic: 'najemci',
    popis: 'Nájemce',
  });
};
