/**
 * lib/evidencniCislo.js
 * Evidenční číslo dokladu/faktury (v4.34, Jan: "přidat sloupec pro
 * číslování řádku ... bude to kód např FP (faktura přijatá), pořadové
 * číslo dle přidání a rok dle DUZP např. FV 001-2026").
 *
 * Formát: "<KÓD> <pořadové číslo, zarovnané na 3 místa>-<rok>", např.
 * "FP 001-2026" (Doklady/přijaté faktury) nebo "FV 001-2026" (Vydané
 * faktury). Appka rok bere z DUZP dokladu/faktury (appka DUZP i jinde v
 * appce používá jako "účetní" datum, viz lib/dokladySchema.js).
 *
 * Appka na Janovo výslovné potvrzení (AskUserQuestion):
 * - číslování appka počítá ZVLÁŠŤ PRO KAŽDOU FIRMU A ROK (ne jednu
 *   společnou řadu napříč firmami) - každá firma skupiny má tak svou
 *   vlastní číselnou řadu, která se každý rok resetuje zpátky na 001.
 * - appka číslo přiřazuje AŽ VE CHVÍLI, kdy se záznam stane definitivním:
 *   u Dokladů (přijatých) = teprve při SCHVÁLENÍ (netlify/functions/
 *   doklady.js) - appka tak nezabere číslo v řadě dokladu, který nakonec
 *   skončí jako zamítnutý/smazaný/duplicitní. U Vydaných faktur appka
 *   žádné schvalování nemá (jde rovnou "Zpracovává se" -> "Neuhrazeno"/
 *   "Možná duplicita") - appka proto číslo přiřazuje ve chvíli, kdy se
 *   faktura stane "reálným" záznamem (ne placeholder, ne nevyřešená
 *   možná duplicita) - vydaná faktura totiž potřebuje číslo hned, aby ji
 *   šlo vůbec poslat zákazníkovi k úhradě, appka nemůže čekat až na
 *   "Uhrazeno" (to může trvat měsíce, nebo appka tenhle stav nikdy
 *   neuvidí).
 *
 * Appka POŘADOVÉ ČÍSLO odvozuje z NEJVYŠŠÍHO už přiřazeného čísla stejné
 * firmy/roku/kódu mezi VŠEMI záznamy (ne z počtu záznamů) - appka číslo
 * přiřazuje jen jednou (idempotentně, viz volající kód), takže mezery by
 * stejně neměly vznikat, appka ale radši počítá bezpečně i kdyby některý
 * starší záznam měl z nějakého důvodu ručně upravené/nesouvislé číslo.
 */

function vytezPoradiARok(evidencniCislo, kod) {
  const shoda = String(evidencniCislo || '').match(new RegExp('^' + kod + ' (\\d+)-(\\d{4})$'));
  if (!shoda) return null;
  return { poradi: Number(shoda[1]), rok: shoda[2] };
}

// `ziskejFirmu` - funkce (zaznam) -> string, appka ji potřebuje, protože
// Doklady mají firmu v Firma_potvrzena/Firma_AI_odhad, kdežto Vydane_faktury
// přímo v poli Firma - appka radši nechá volající kód rozhodnout, ne aby tu
// hádala napříč oběma tvary.
function dalsiEvidencniCislo(existujiciZaznamy, kod, firma, rok, ziskejFirmu) {
  let nejvyssi = 0;
  (existujiciZaznamy || []).forEach((z) => {
    if (ziskejFirmu(z) !== firma) return;
    const vytezeno = vytezPoradiARok(z.Evidencni_cislo, kod);
    if (vytezeno && vytezeno.rok === rok && vytezeno.poradi > nejvyssi) {
      nejvyssi = vytezeno.poradi;
    }
  });
  const dalsi = nejvyssi + 1;
  return kod + ' ' + String(dalsi).padStart(3, '0') + '-' + rok;
}

module.exports = { dalsiEvidencniCislo, vytezPoradiARok };
