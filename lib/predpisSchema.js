/**
 * lib/predpisSchema.js
 * Sloupce listu "Predpis_plateb" (od v4.59).
 *
 * Jan 2026-08-08: *„zajisti aby se nájemní smlouva vytěžila AI a vznikl
 * předpis plateb, včetně kauce, zálohy a to je nutné párovat s bankovními
 * výpisy"*.
 *
 * CO JE PŘEDPIS A PROČ VZNIKL
 *
 * Do v4.58 appka věděla jen to, kolik se u smlouvy „obvykle platí"
 * (Ocekavana_castka), a přijatou platbu párovala rovnou na smlouvu. Nikde
 * nebylo zapsané, CO se mělo zaplatit a KDY. Mělo to dva následky:
 *
 *   - Vyúčtování muselo zálohy odhadovat jako `počet plateb × záloha ze
 *     smlouvy`, protože nemělo proti čemu platbu porovnat. Nájemník, který
 *     poslal jinou částku, dostal stejně připsanou plnou smluvní zálohu.
 *   - Kauce se s bankou nepárovala vůbec - byla jen poznámka na smlouvě.
 *
 * Předpis je řádek „tohle se má zaplatit": za který měsíc, do kdy, kolik
 * z toho je nájem a kolik záloha. Platba z výpisu se pak páruje na NĚJ,
 * ne na smlouvu jako celek.
 *
 * SLOUPCE
 *
 * ID            - crypto.randomUUID() při vytvoření.
 * Smlouva_ID    - ke které nájemní smlouvě předpis patří.
 * Najemni_jednotka_ID - kopie ze smlouvy v době generování. Je tu schválně
 *                 duplicitně: vyúčtování a přehledy díky tomu nemusí kvůli
 *                 každému řádku dohledávat smlouvu. **Zdroj pravdy zůstává
 *                 smlouva** - když se jednotka na smlouvě změní, přegeneruj
 *                 předpisy, neopravuj to ručně po řádcích.
 * Typ           - 'Nájem' (opakovaný měsíční) nebo 'Kauce' (jednorázový).
 *                 Janova volba: kauce má vlastní řádek předpisu, ať je
 *                 vidět, jestli dorazila, a nepoplete se s nájmem.
 * Obdobi        - 'RRRR-MM' u nájmu, prázdné u kauce.
 * Splatnost     - 'RRRR-MM-DD'.
 * Castka_najem  - čistý nájem (u kauce 0).
 * Castka_zaloha - záloha na služby (u kauce 0).
 * Castka_celkem - součet; u kauce její výše. Drží se zvlášť, ať se nemusí
 *                 dopočítávat při každém čtení a ať jde ručně přepsat, když
 *                 se na měsíc domluví jiná částka.
 * Mena          - z e smlouvy. Kč a EUR se nikde nesčítají do jednoho čísla.
 * Variabilni_symbol - když je ve smlouvě sjednaný; při párování má
 *                 nejvyšší váhu ze všech signálů.
 * Stav          - viz MOZNOSTI_STAV_PREDPISU níž. **Appka ho nepřepíná
 *                 sama** - mění se až potvrzením spárování člověkem.
 * Uhrazeno      - kolik na tenhle předpis skutečně přišlo (součet
 *                 přiřazených plateb, případně jen část jedné platby, když
 *                 se dělila mezi víc předpisů).
 * Pohyb_ID      - poslední přiřazený bankovní pohyb. U rozdělené platby
 *                 nese stejné Pohyb_ID víc předpisů - proto je ta částka
 *                 v Uhrazeno a nedopočítává se z pohybu.
 * Poznamka      - volný text (např. „za květen odpuštěno").
 */
const PREDPIS_HEADERS = [
  'ID', 'Smlouva_ID', 'Najemni_jednotka_ID', 'Typ', 'Obdobi', 'Splatnost',
  'Castka_najem', 'Castka_zaloha', 'Castka_celkem', 'Mena',
  'Variabilni_symbol', 'Stav', 'Uhrazeno', 'Pohyb_ID', 'Poznamka',
];

const MOZNOSTI_TYP_PREDPISU = ['Nájem', 'Kauce'];

/*
 * Stavy. Appka je nepřepíná sama od sebe - to je stejné pravidlo jako
 * u stavu přístupových kódů nebo nájemních jednotek. „Po splatnosti" je
 * jediný, který se dá odvodit z data, a i ten appka jen NAPÍŠE u řádku;
 * do sloupce ho nezapisuje, aby se nestalo, že se stav změní jen tím, že
 * si někdo otevřel appku.
 */
const MOZNOSTI_STAV_PREDPISU = ['Předepsáno', 'Uhrazeno', 'Částečně', 'Odpuštěno'];

module.exports = {
  PREDPIS_HEADERS,
  MOZNOSTI_TYP_PREDPISU,
  MOZNOSTI_STAV_PREDPISU,
};
