/**
 * lib/platebniKartySchema.js
 * Sloupce listu "Platebni_karty" (od v4.52).
 *
 * Odkud to je: Jan (2026-08-03) - *"dále je důležité zavést při vytěžování
 * registraci platebních karet a ty vést v databázi administrace, používat
 * při návrhu přiřazení plateb"*. Na účtenkách bývá vytištěné "**** 1234"
 * nebo "VISA ...1234" a v popisu bankovního pohybu je často stejné číslo -
 * appce to dává silný signál, že pohyb a doklad k sobě patří, i když sedí
 * částka jen přibližně a jméno obchodníka je v bance napsané jinak.
 *
 * BEZPEČNOST - tohle je to nejdůležitější v celém souboru:
 * appka ukládá VÝHRADNĚ POSLEDNÍ 4 ČÍSLICE karty, nikdy celé číslo.
 * Celé číslo karty (PAN) je platební údaj; v Google Sheets, které si Jan
 * sdílí s účetní, nemá co dělat, a appka ho k ničemu nepotřebuje - na
 * párování stačí poslední čtyřčíslí. Ořezání dělá server
 * (netlify/functions/platebni-karty.js, funkce posledniCtyri) i tehdy,
 * když AI z účtenky přečte číslic víc. Tohle pravidlo NEMĚNIT a needitovat
 * schéma tak, aby šlo uložit víc číslic - ani "jen dočasně na testování".
 *
 * - ID - "KARTA-1", "KARTA-2", ... (appka generuje sama, používá se jako
 *   odkaz z Doklady.Platebni_karta).
 * - Cislo_karty - POSLEDNÍ 4 ČÍSLICE, jako text ("0417" nesmí zdegenerovat
 *   na číslo 417).
 * - Firma - přesně jeden z názvů ve Firmy.Nazev. Jan si u karty přál vést
 *   firmu a bankovní účet.
 * - Ucet - číslo bankovního účtu, ke kterému karta patří (volitelně,
 *   nabízí se z listu Ucty dané firmy) - podle toho appka pozná, na kterém
 *   výpisu se platba objeví.
 * - Drzitel - kdo kartu nosí; nabízí se ze seznamu uživatelů appky
 *   (Uzivatele.Jmeno), ale jde napsat i cokoli jiného.
 * - Popis - lidský název ("Tesla firemka", "revolut EUR").
 * - Stav - "Doplnit" nebo "Aktivní". Karta, kterou appka založila sama
 *   při vytěžování dokladu, dostane "Doplnit" - to je Janova volba
 *   ("Založit ji sama, ať ji jen doplním"). Znamená to jen "chybí u ní
 *   držitel/firma", na párování se používá stejně jako aktivní.
 * - Poznamka - volný text.
 * - Datum_zalozeni - ISO datum, kdy řádek vznikl.
 *
 * Co tu SCHVÁLNĚ NENÍ: sloupec pro SPZ auta a pro středisko. Appka se
 * Jana ptala, co u karty vést, a nabízela i "Auto (SPZ)" a "Středisko" -
 * Jan vybral jen firmu s bankovním účtem a držitele. Nedoplňovat je
 * zpětně bez toho, že si o ně řekne.
 */
const PLATEBNI_KARTY_HEADERS = [
  'ID', 'Cislo_karty', 'Firma', 'Ucet', 'Drzitel', 'Popis', 'Stav', 'Poznamka', 'Datum_zalozeni',
];

const STAV_DOPLNIT = 'Doplnit';
const STAV_AKTIVNI = 'Aktivní';

/**
 * Ořeže cokoli, co přišlo (od uživatele i od AI), na poslední 4 číslice.
 * Prázdný řetězec znamená "číslo karty appka nezná".
 *
 * Schválně tolerantní ke vstupu: "**** 1234", "VISA ....1234",
 * "4571 xxxx xxxx 1234" i "1234" dají všechny "1234". Když číslic vyjde
 * míň než 4, appka vrátí prázdno - dvě nebo tři číslice by na párování
 * byly k ničemu a naopak by tvořily falešné shody.
 */
function posledniCtyri(vstup) {
  const cislice = String(vstup == null ? '' : vstup).replace(/\D/g, '');
  if (cislice.length < 4) return '';
  return cislice.slice(-4);
}

/**
 * Další volné ID ve tvaru KARTA-N.
 */
function dalsiIdKarty(radky) {
  let max = 0;
  (radky || []).forEach((r) => {
    const m = String(r.ID || '').match(/^KARTA-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `KARTA-${max + 1}`;
}

/**
 * Vytáhne z textu (typicky popis bankovního pohybu) čtyřčíslí karet.
 *
 * Vrací Set řetězců po 4 číslicích. Klíčové je, že appka NEBERE každou
 * čtveřici číslic v textu - to by u popisu jako "Platba 1234 Kč, faktura
 * 2026" nasekalo falešné shody a párování by pak navrhovalo nesmysly s
 * vysokým skóre. Bere jen čísla, která jsou v textu označená jako karta:
 * za maskou (**** 1234, xxxx1234, ...1234), za zamaskovaným PANem
 * (457112******1234) nebo hned za slovem karta/kartou/card.
 *
 * Kdyby se sem někdy sahalo: rozšiřovat opatrně a vždy k tomu doplnit
 * kontrolu do test-v452.js - falešná shoda karty je horší než žádná,
 * protože karta je v párování silný signál (skóre +3, viz navrhniShodu
 * v lib/bankHelpers.js).
 *
 * Tahle funkce a shodaKarty jsou schválně TADY ve schématu, ne v
 * lib/platebniKartyHelpers.js - jsou čistě textové, bez sáhnutí na Sheets,
 * takže je může použít i lib/bankHelpers.js, aniž by si přitáhl závislost
 * na Google klientovi. Stejná logika je zduplikovaná i v public/app.js
 * (prohlížeč si `lib/` modul načíst neumí a appka nemá build krok) - při
 * změně jedné kopie je nutné upravit i druhou.
 */
function ctyrcisliZTextu(text) {
  const t = String(text == null ? '' : text);
  const nalezene = new Set();
  const vzory = [
    /[*]{2,}\s*-?\s*(\d{4})(?!\d)/g, // **** 1234
    /[xX]{2,}\s*-?\s*(\d{4})(?!\d)/g, // xxxx1234
    /\.{3,}\s*(\d{4})(?!\d)/g, // ...1234
    /\d{4,6}\s*[*xX.]{2,}\s*(\d{4})(?!\d)/g, // 457112******1234
    /(?:karta|kartou|kartu|karty|card)\D{0,12}?(\d{4})(?!\d)/gi,
  ];
  vzory.forEach((re) => {
    let m = re.exec(t);
    while (m) {
      nalezene.add(m[1]);
      m = re.exec(t);
    }
  });
  return nalezene;
}

/**
 * Sedí čtyřčíslí karty dokladu na popis bankovního pohybu?
 * Prázdné čtyřčíslí nesedí nikdy (jinak by "" sedělo na cokoli - stejná
 * past jako u prázdného variabilního symbolu, viz shodaSymbolu v
 * lib/bankHelpers.js).
 */
function shodaKarty(cisloKarty, textPohybu) {
  const ctyri = posledniCtyri(cisloKarty);
  if (!ctyri) return false;
  return ctyrcisliZTextu(textPohybu).has(ctyri);
}

module.exports = {
  PLATEBNI_KARTY_HEADERS,
  STAV_DOPLNIT,
  STAV_AKTIVNI,
  posledniCtyri,
  dalsiIdKarty,
  ctyrcisliZTextu,
  shodaKarty,
};
