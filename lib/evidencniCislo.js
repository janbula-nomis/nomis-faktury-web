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

/**
 * ---- Přečíslování po opravě dokladu (v4.49) ----
 *
 * Jan (2026-08-02): "po změně roku na dokladu při opravě přeindexuj
 * označení, aby to pasovalo např. na rok 2026".
 *
 * Co se dělo do téhle verze: appka evidenční číslo přiřazovala JEN JEDNOU
 * (viz komentář výš) a při každé další úpravě už ho nechávala být. To je
 * správně, dokud se opravuje dodavatel nebo částka - jenže když Jan opravil
 * ROK (DUZP), zůstalo dokladu viset číslo z původního roku, takže doklad s
 * DUZP v roce 2026 se ve složce tvářil jako "FP 007-2025".
 *
 * Appka proto číslo přiděluje znovu, když se doklad přestěhuje do JINÉ
 * ŘADY. Řada je daná dvojicí FIRMA + ROK (tak je popsané číslování výš),
 * takže se přečísluje nejen po změně roku, ale i po přehození dokladu na
 * jinou firmu - jinak by v řadě druhé firmy vzniklo číslo, které do ní
 * pořadím vůbec nepatří, a mohlo by se dokonce potkat se stejným číslem
 * přiděleným jinému dokladu.
 *
 * Co appka NEDĚLÁ (Janova výslovná volba z AskUserQuestion, varianta
 * "Dát nové číslo v novém roce"): NEsrovnává zpětně celou původní řadu.
 * Po přestěhování dokladu zůstane v původním roce v číslech mezera. Je to
 * schválně - přečíslování celé řady by pod rukama změnilo čísla dokladům,
 * které Jan nebo účetní už mohli vidět nebo vytisknout, a to kvůli jediné
 * opravě. Mezeru umí zavřít hromadné srovnání číslování (viz
 * netlify/functions/precislovani.js), které se ale spouští VĚDOMĚ a
 * s náhledem. Pozor, ať se historie neopakuje.
 */
function precislujPriPresunu(zaznam, existujiciZaznamy, kod, firma, rok, ziskejFirmu) {
  const soucasne = vytezPoradiARok(zaznam.Evidencni_cislo, kod);
  // Bez čísla není co přečíslovat - přidělení prvního čísla řeší volající
  // kód (u Dokladů při schválení, u Vydaných faktur při potvrzení stavu).
  if (!soucasne) return null;
  // Číslo samo o sobě nese jen rok, ne firmu - firma se pozná z toho, komu
  // doklad patřil PŘED úpravou, proto ji volající posílá zvlášť.
  if (soucasne.rok === rok && ziskejFirmu(zaznam) === firma) return null;
  return dalsiEvidencniCislo(existujiciZaznamy, kod, firma, rok, ziskejFirmu);
}

/**
 * ---- Hromadné srovnání číslování (v4.49) ----
 *
 * Jan (2026-08-02): "je možné ještě všechny doklady roku 2026 upravit a
 * doplnit číslování, než se to pošle účetní?"
 *
 * Appka vrátí NÁVRH, ne zápis - kdo ho provede a jestli vůbec, rozhoduje
 * volající (netlify/functions/precislovani.js nejdřív ukáže náhled a teprve
 * po Janově potvrzení zapisuje). Tahle funkce je schválně čistý výpočet bez
 * Sheetů, aby se dala ověřit harnessem bez Googlu.
 *
 * Pořadí čísel: podle ÚČETNÍHO data (DUZP, a když chybí, datum dokladu) -
 * Janova volba z AskUserQuestion. Odchyluje se to od původního pravidla
 * "pořadové číslo dle přidání" (v4.34), protože ve složce, kterou dostane
 * účetní, dává chronologie větší smysl než pořadí, ve kterém kdo co
 * vyfotil. Nové doklady se dál číslují při schválení podle přidání - tohle
 * je jednorázový úklid, ne změna běžného chodu.
 *
 * Shodná data appka řadí dál podle záložního klíče (typicky Datum_zpracovani
 * a nakonec ID), aby dvě spuštění nad stejnými daty dala VŽDY stejný
 * výsledek. Bez toho by druhé spuštění mohlo čísla zamíchat znovu, i kdyby
 * se mezitím nic nezměnilo.
 */
function navrhSrovnaniCislovani(zaznamy, kod, rok, pomocnici) {
  const { ziskejFirmu, ziskejDatum, ziskejKlicRazeni, patriDoCislovani } = pomocnici;

  const kCislovani = (zaznamy || []).filter(
    (z) => patriDoCislovani(z) && String(ziskejDatum(z) || '').slice(0, 4) === String(rok)
  );

  const podleFirem = {};
  kCislovani.forEach((z) => {
    const firma = ziskejFirmu(z) || '';
    (podleFirem[firma] = podleFirem[firma] || []).push(z);
  });

  const navrh = [];
  Object.keys(podleFirem).sort().forEach((firma) => {
    podleFirem[firma]
      .slice()
      .sort((a, b) => {
        const da = String(ziskejDatum(a) || '');
        const db = String(ziskejDatum(b) || '');
        if (da !== db) return da < db ? -1 : 1;
        const ka = String(ziskejKlicRazeni(a) || '');
        const kb = String(ziskejKlicRazeni(b) || '');
        return ka === kb ? 0 : ka < kb ? -1 : 1;
      })
      .forEach((zaznam, index) => {
        const nove = kod + ' ' + String(index + 1).padStart(3, '0') + '-' + String(rok);
        navrh.push({
          zaznam,
          firma,
          stare: zaznam.Evidencni_cislo || '',
          nove,
          zmena: (zaznam.Evidencni_cislo || '') !== nove,
        });
      });
  });
  return navrh;
}

module.exports = {
  dalsiEvidencniCislo,
  vytezPoradiARok,
  precislujPriPresunu,
  navrhSrovnaniCislovani,
};
