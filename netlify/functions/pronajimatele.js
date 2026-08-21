/**
 * netlify/functions/pronajimatele.js
 * Správa hlaviček pro smlouvy a předávací protokoly (od v4.80) - list
 * "Pronajimatele" v Sheets. Proč to není součást listu Firmy, vysvětluje
 * hlavička lib/pronajimateleSchema.js.
 *
 * Od v4.81 je celá obsluha v lib/smluvniStrany.js, protože ji sdílí
 * s číselníkem nájemců (netlify/functions/najemci.js) - je to dvakrát
 * totéž a dvě kopie by se rozešly.
 *
 * GET    -> { pronajimatele: [...], listChybi, firmyDostupne } smí kterýkoli
 *           přihlášený uživatel: hlavičku potřebuje appka pokaždé, když se
 *           z karty bytu tiskne dokument, ne jen v Nastavení.
 * POST/PATCH/DELETE jen role "admin" - je to text, který jde do právního
 *           dokumentu (IČO, číslo účtu, kdo za společnost jedná).
 *
 * CHYBĚJÍCÍ LIST NENÍ CHYBA APPKY. Kdo appku aktualizoval a ještě nespustil
 * /api/setup, list "Pronajimatele" nemá. GET v tom případě vrací prázdný
 * seznam a příznak `listChybi: true` - appka podle něj v Nastavení napíše,
 * co má Jan udělat, místo aby spadla na 500.
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
    list: 'Pronajimatele',
    klic: 'pronajimatele',
    popis: 'Pronajímatel',
  });
};
