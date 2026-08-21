/**
 * lib/pronajimateleSchema.js
 * Sloupce listu "Pronajimatele" (od v4.80) - hlavička smluv a předávacích
 * protokolů.
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21 poslal čtyři podepsané vzory (dva předávací protokoly na
 * hlavičkovém papíře CENTURY 21, nájemní smlouvu na Schulte Group a starší
 * nájemní smlouvu na Schulte TZB) a napsal: *"tohle jsou vzory pro smlouvy
 * a PP, taky potřebuju kartu bytu, vypsat na PP, kde je vše důležité"*.
 * O pár zpráv dřív: *"jedna bude za Nomis Homes a druhá na Jan Bula, takže
 * to bude více dokumentů"*.
 *
 * PROČ NOVÝ LIST A NE SLOUPCE DO "Firmy"
 *
 * Tři důvody, každý sám o sobě by stačil:
 *
 * 1) JEDEN Z PRONAJÍMATELŮ NENÍ FIRMA. Ve smlouvě na byt Holečkova 2236/9
 *    je pronajímatelem **Ing. Jan Bula jako fyzická osoba** - má datum
 *    narození a trvalé bydliště, ne IČO a spisovou značku. Kdyby seděl
 *    v listu Firmy, appka by o něm musela tvrdit, že je firma, a všude,
 *    kde se firma používá jako účetní klíč (Doklady.Firma, Smlouvy.Firma,
 *    scoping přístupu uživatelů - viz netlify/functions/firmy.js), by se
 *    objevil jako další "firma", ke které se dají účtovat doklady.
 *
 * 2) Firmy.Nazev JE KLÍČ, KTERÝ SE NEEDITUJE. Je v něm zamčený přístup
 *    uživatelů (Uzivatele.Firmy) i každý doklad. Hlavička dokumentu se
 *    naopak mění klidně (přestěhování sídla, nový jednatel, jiný účet) a
 *    musí jít přepsat, aniž by se čehokoli v účetnictví dotklo.
 *
 * 3) HLAVIČKA JE JINÁ MNOŽINA ÚDAJŮ. Smlouva potřebuje sídlo, spisovou
 *    značku, kdo za společnost jedná a případně zástupce (v Janových
 *    protokolech je to makléřka Century 21). Účetnictví z toho nepotřebuje
 *    ani jedno a nikdy o to nepožádalo.
 *
 * Vazba na firmu tu ale je: pole `Firma`. Když je vyplněné, appka umí
 * u střediska napovědět, který pronajímatel se k němu obvykle hodí. Je to
 * NÁPOVĚDA, ne pravidlo - pronajímatele si na dokumentu vždycky vybírá
 * člověk. Byt může vlastnit Jan a fakturovat za něj firma; appka o takovém
 * vztahu nic neví a nebude si ho domýšlet.
 *
 * POLE
 *
 * ID - crypto.randomUUID() při založení, stejná konvence jako Ucty/Smlouvy.
 * Nazev - jak se strana jmenuje v dokumentu ("NOMIS & Homes s.r.o.",
 *   "Ing. Jan Bula"). Tohle se tiskne.
 * Druh - 'Firma' nebo 'Osoba'. Rozhoduje o tom, KTERÉ ŘÁDKY HLAVIČKY SE
 *   VŮBEC VYPÍŠÍ: firma má IČO/DIČ/spisovou značku/jednatele, osoba datum
 *   narození. Prázdné pole appka bere jako 'Firma' jen tehdy, když je
 *   vyplněné IČO - jinak nevypíše ani jedno a nechá řádek prázdný. Nula ani
 *   prázdné IČO se v dokumentu nevydává za odpověď.
 * ICO, DIC, Spisova_znacka - firemní identifikace. Spisovou značku appka
 *   tiskne v podobě, jak ji Jan zapíše ("C 415688"); větu "zapsaná
 *   v obchodním rejstříku, který vede Městský soud v Praze pod sp. zn." si
 *   doplní sama, ale JEN kolem neprázdné hodnoty.
 * Sidlo / Adresa - sídlo firmy, resp. trvalé bydliště osoby. Jedno pole
 *   schválně: v dokumentu je to jeden řádek a rozlišovat "sídlo" od
 *   "bytem" umí Druh.
 * Zastoupena - "za společnost jedná: Ing. Jan Bula, jednatel". Volný text
 *   včetně funkce - u a.s. tam bývají dva členové představenstva a
 *   strukturovat to na jméno + funkci by znamenalo dva řádky navíc pro
 *   případ, který Jan zatím nemá.
 * Datum_narozeni - jen u osoby, text RRRR-MM-DD jako všude jinde v appce
 *   (viz lib/sheetsHelpers.js) - do dokumentu se tiskne česky "17. 5. 1978".
 * Bankovni_ucet - číslo účtu do hlavičky smlouvy. **Nesouvisí s listem
 *   Ucty**: tam jsou účty, proti kterým se páruje banka (viz
 *   lib/uctySchema.js), tohle je text, který se vytiskne. Bývá to stejné
 *   číslo, ale nemusí - u fyzické osoby účet v Uctech vůbec být nemusí.
 * Email, Telefon - kontakt do hlavičky.
 * Zastupce_* - nepovinný ZÁSTUPCE, který dokument podepisuje za
 *   pronajímatele (v Janových protokolech makléřka Century 21: jméno, bytem,
 *   datum narození, e-mail, telefon). Vypíše se jen, když je vyplněné jméno.
 * Vychozi - 'ANO' u toho, koho appka předvybere v roletce. Nanejvýš jeden;
 *   když ho Jan označí u druhého, appka první odznačí (viz
 *   netlify/functions/pronajimatele.js). Bez výchozího roletka prostě začne
 *   prázdná - vybrat pronajímatele za člověka je přesně to, co si appka
 *   dovolit nesmí.
 * Poznamka - volný text.
 */
const PRONAJIMATELE_HEADERS = [
  'ID', 'Nazev', 'Druh', 'Firma',
  'ICO', 'DIC', 'Spisova_znacka', 'Sidlo',
  'Zastoupena', 'Datum_narozeni', 'Bankovni_ucet', 'Email', 'Telefon',
  'Zastupce_jmeno', 'Zastupce_adresa', 'Zastupce_narozeni', 'Zastupce_email', 'Zastupce_telefon',
  'Vychozi', 'Poznamka',
];

const MOZNOSTI_DRUH_PRONAJIMATELE = ['Firma', 'Osoba'];

/**
 * Je tenhle pronajímatel firma?
 *
 * Prázdný Druh appka nedopočítává z ničeho jiného než z IČO, a to schválně:
 * řádek bez Druhu i bez IČO se vytiskne jen s tím, co v něm opravdu je.
 */
function jeFirma(pronajimatel) {
  if (!pronajimatel) return false;
  const druh = String(pronajimatel.Druh || '').trim();
  if (druh === 'Firma') return true;
  if (druh === 'Osoba') return false;
  return String(pronajimatel.ICO || '').trim() !== '';
}

module.exports = { PRONAJIMATELE_HEADERS, MOZNOSTI_DRUH_PRONAJIMATELE, jeFirma };
