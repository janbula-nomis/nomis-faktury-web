/**
 * netlify/functions/nemovitosti-platby-prehled.js
 * Měsíční kontrola úhrady nájmu (od v4.37, Jan: "lze kontrolovat uhrazení
 * nájmu"). GET-only, appka nic neukládá - jen na požádání porovná
 * očekávanou částku aktivní nájemní Smlouvy s tím, co appka za daný
 * měsíc skutečně napárovala z banky (stejný mechanismus "trvalý příkaz",
 * jaký appka od v3.19 používá pro párování nájmu).
 *
 * Známé zjednodušení (appka ho záměrně nezakrývá, stejná konvence jako
 * appka dokumentuje zjednodušení u Money S3 exportu): appka platbu
 * zařadí do měsíce podle DATA, kdy platba skutečně přišla na účet - appka
 * NEŘEŠÍ obvyklou praxi "nájem se platí dopředu, splatnost do 25. dne
 * PŘEDCHOZÍHO měsíce" (tj. platba došlá 20.5. by věcně patřila k červnu).
 * Pokud by tohle byl problém, appka to umí dopočítat přesněji později -
 * zatím appka nabízí jednodušší, okamžitě použitelný pohled.
 *
 * GET ?firma=X&mesic=RRRR-MM
 *   -> { mesic, radky: [{ smlouvaId, cisloSmlouvy, stredisko, nazev,
 *        druhaStrana, ocekavano, uhrazeno, stav }] }
 *      stav appka vrací jedno z: "Zaplaceno" | "Částečně" | "Nezaplaceno"
 */
const { requireAuth } = require('../../lib/requireAuth');
const { getSheetsClient } = require('../../lib/google');
const { readSheetObjects } = require('../../lib/sheetsHelpers');
const { parsujCastkuZListu } = require('../../lib/bankHelpers');
const { uhradyPoMesicich } = require('../../lib/uhradyNajmu');
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
  const firma = String(qs.firma || '').trim();
  const mesic = String(qs.mesic || '').trim(); // RRRR-MM
  if (!/^\d{4}-\d{2}$/.test(mesic)) return json(400, { error: 'Chybí nebo neplatný parametr mesic (RRRR-MM).' });
  if (firma && !maPristupKFirme(uzivatel, firma)) return json(403, { error: 'Nemáte přístup k této firmě.' });

  const od = mesic + '-01';
  // Poslední den měsíce appka spočítá bez závislosti na časovém pásmu -
  // den 0 následujícího měsíce je poslední den zvoleného měsíce.
  const [rok, mesicCislo] = mesic.split('-').map(Number);
  const posledniDen = new Date(Date.UTC(rok, mesicCislo, 0)).getUTCDate();
  const doDatum = mesic + '-' + String(posledniDen).padStart(2, '0');

  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  try {
    const { rows: smlouvyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Smlouvy');
    let najmy = smlouvyVsechny.filter((s) =>
      s.Typ === 'Nájem' && s.Aktivni !== 'NE' && maPristupKFirme(uzivatel, s.Firma)
    );
    if (firma) najmy = najmy.filter((s) => s.Firma === firma);

    const { rows: pohybyVsechny } = await readSheetObjects(sheets, spreadsheetId, 'Bankovni_pohyby');

    const radky = najmy.map((s) => {
      const cistyNajem = parsujCastkuZListu(s.Cisty_najem);
      const zalohaNaSluzby = parsujCastkuZListu(s.Zaloha_na_sluzby);
      const ocekavano = (cistyNajem || zalohaNaSluzby)
        ? cistyNajem + zalohaNaSluzby
        : parsujCastkuZListu(s.Ocekavana_castka);

      // (v4.60) Úhrada se počítá PŘIŘAZENÍM plateb k měsícům, ne součtem
      // plateb s datem v daném měsíci.
      //
      // Do v4.59 se sčítaly platby, jejichž datum padlo do vybraného
      // kalendářního měsíce. Nájem se ale platí dopředu - ten za červenec
      // dorazí koncem června - takže červenec vycházel jako nezaplacený,
      // i když zaplacený byl. Jan to nahlásil snímkem 2026-08-08.
      // Podrobně i s tím, proč nestačí posunout okno, viz hlavičku
      // lib/uhradyNajmu.js.
      const rozdeleni = uhradyPoMesicich(s, pohybyVsechny, mesic);
      const uhrazeno = rozdeleni.uhrazeno;

      let stav = 'Nezaplaceno';
      if (uhrazeno >= ocekavano && ocekavano > 0) stav = 'Zaplaceno';
      else if (uhrazeno > 0) stav = 'Částečně';

      return {
        smlouvaId: s.ID,
        cisloSmlouvy: s.Cislo_smlouvy || '',
        firma: s.Firma,
        stredisko: s.Stredisko || '',
        nazev: s.Nazev || '',
        druhaStrana: s.Druha_strana || '',
        mena: s.Mena || 'CZK',
        ocekavano,
        uhrazeno,
        stav,
        // Peníze, které dorazily, ale čekají na potvrzení. Do úhrady se
        // nepočítají (potvrdit je musí člověk), ale obrazovka o nich musí
        // říct - tichá nula u platby, která přišla, je horší než nic.
        navrzeno: rozdeleni.navrzeno,
        // Kolik z přijatých peněz zbylo po zaplnění měsíců do dotázaného -
        // typicky nájem zaplacený dopředu na další měsíc.
        prebytek: rozdeleni.prebytek,
      };
    });

    return json(200, { mesic, radky });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
