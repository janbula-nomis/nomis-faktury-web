/**
 * lib/platebniKartyHelpers.js
 * Pomocné funkce k platebním kartám (od v4.52) - zakládání karty při
 * vytěžování dokladu a hledání čtyřčíslí karty v popisu bankovního pohybu.
 *
 * Jan (2026-08-03): *"je důležité zavést při vytěžování registraci
 * platebních karet a ty vést v databázi administrace, používat při návrhu
 * přiřazení plateb"*. Na přímou otázku, co má appka dělat s kartou, kterou
 * ještě nezná, vybral *"Založit ji sama, ať ji jen doplním"* - proto
 * zajistiKartu() zapisuje do listu bez ptaní, ale vždy se stavem "Doplnit",
 * aby bylo v Nastavení vidět, u kterých karet chybí držitel a účet.
 *
 * Schéma a bezpečnostní pravidlo (jen poslední 4 číslice, nikdy celý PAN)
 * jsou v lib/platebniKartySchema.js.
 */
const {
  PLATEBNI_KARTY_HEADERS, STAV_DOPLNIT, posledniCtyri, dalsiIdKarty,
  ctyrcisliZTextu, shodaKarty,
} = require('./platebniKartySchema');
const { readSheetObjects, appendRow } = require('./sheetsHelpers');

/**
 * Najde kartu firmy podle čtyřčíslí, nebo ji založí se stavem "Doplnit".
 * Vrací uložené čtyřčíslí ('' když se nedalo nic poznat) - do dokladu se
 * ukládá právě ono, ne ID, aby doklad zůstal čitelný i kdyby kartu někdo
 * z listu smazal.
 *
 * Nekritické: když cokoli selže (list ještě neexistuje, protože Jan
 * nepustil /api/setup po aktualizaci), appka vrátí samotné čtyřčíslí a
 * jede dál - zpracování dokladu se kvůli evidenci karet nemá shodit.
 */
async function zajistiKartu(sheets, spreadsheetId, cisloKarty, firma) {
  const ctyri = posledniCtyri(cisloKarty);
  if (!ctyri) return '';
  const nazevFirmy = String(firma || '').trim();

  try {
    const { rows } = await readSheetObjects(sheets, spreadsheetId, 'Platebni_karty');
    const uzJe = rows.some(
      (k) => posledniCtyri(k.Cislo_karty) === ctyri
        && (!nazevFirmy || !k.Firma || k.Firma === nazevFirmy),
    );
    if (uzJe) return ctyri;

    await appendRow(sheets, spreadsheetId, 'Platebni_karty', PLATEBNI_KARTY_HEADERS, {
      ID: dalsiIdKarty(rows),
      Cislo_karty: ctyri,
      Firma: nazevFirmy,
      Ucet: '',
      Drzitel: '',
      Popis: '',
      Stav: STAV_DOPLNIT,
      Poznamka: 'Kartu založila appka sama při vytěžování dokladu - doplňte prosím držitele a účet.',
      Datum_zalozeni: new Date().toISOString().slice(0, 10),
    });
  } catch (e) {
    // Karta je doplněk k párování, ne podmínka zpracování dokladu.
  }

  return ctyri;
}

module.exports = { ctyrcisliZTextu, shodaKarty, zajistiKartu };
