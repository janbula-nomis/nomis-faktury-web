/**
 * lib/nemovitostiSchema.js
 * Sloupce listu "Nemovitosti" na jednom místě (od v4.19), stejný vzor jako
 * lib/smlouvySchema.js/lib/knihaJizdSchema.js - jeden zdroj pravdy pro
 * netlify/functions/nemovitosti.js, netlify/functions/nemovitosti-prehled.js
 * i setup.js.
 *
 * Jan (2026-07-23): "potřebuji také příjmy z nájmu přiřadit k bankovním
 * vypisům, zdrojem jsou nájemní smlouvy, které načtu do registru smluv" -
 * appka si přes AskUserQuestion nechala potvrdit tři otevřené otázky: (a)
 * appka zavádí NOVOU entitu "nemovitost" a propojuje ji s novou hlavní
 * záložkou Nemovitosti (dřív, od v4.16, jen prázdný placeholder), (b) appka
 * páruje příchozí platby s nájemní Smlouvou ROVNOU automaticky (jméno
 * nájemce + očekávaná částka ze smlouvy), BEZ nutnosti nejdřív ručně
 * přiřadit první platbu (na rozdíl od dosavadního "trvalého příkazu", viz
 * lib/bankHelpers.js, jePodobnaShodaSmlouvy), (c) appka navíc zobrazí
 * souhrnný přehled příjmů z nájmu (podle nemovitosti/nájemce/měsíce).
 *
 * POZN. K ROZSAHU: appka už dřív měla hrubší, RUČNĚ udržovaný číselník
 * konkrétních jednotek (public/app.js, MOZNOSTI_STREDISKA/MOZNOSTI_JEDNOTKA
 * - "V Parku 695 - byt 45", "Holečkova 1" apod.), používaný u Dokladů/
 * Vydaných faktur pro ROZPAD NÁKLADŮ/PŘÍJMŮ podle jednotky - ten appka
 * touhle změnou NEMĚNÍ ani nenahrazuje (šlo by o mnohem širší zásah do
 * Dokladů/Vydaných faktur/Dashboardu, což appka teď neřeší). Nová entita
 * "Nemovitosti" je samostatná, užší věc: appka ji potřebuje jen jako cíl
 * pro propojení nájemní Smlouvy a jako řádky v nové záložce Nemovitosti -
 * je to VLASTNÍ, appkou spravovaný seznam (na rozdíl od pevného číselníku
 * středisek), protože Jan bude nemovitosti/byty postupně přidávat sám.
 *
 * Přístup appka omezuje stejně jako u Smlouv/Bankovních výpisů (jen admin
 * a účetní) - Nemovitosti appka od v4.19 obsahují citlivá data o nájemním
 * příjmu, na rozdíl od dřívějšího prázdného placeholderu (v4.16), který
 * viděly všechny role.
 */
const NEMOVITOSTI_HEADERS = ['ID', 'Firma', 'Nazev', 'Adresa', 'Poznamka', 'Aktivni', 'Poradi'];

// Appka novou nemovitost vždy přidá AŽ ZA poslední existující - stejný
// princip jako u Smluv (v4.14, viz lib/smlouvySchema.js, dalsiPoradiSmlouvy).
function dalsiPoradiNemovitosti(existujiciNemovitosti) {
  let max = -1;
  for (const n of existujiciNemovitosti || []) {
    const cislo = Number(n.Poradi);
    if (Number.isFinite(cislo) && cislo > max) max = cislo;
  }
  return max + 1;
}

module.exports = { NEMOVITOSTI_HEADERS, dalsiPoradiNemovitosti };
