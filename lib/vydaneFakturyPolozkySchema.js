/**
 * lib/vydaneFakturyPolozkySchema.js
 * Sloupce listu "Vydane_Faktury_Polozky" na jednom místě (od v4.27) -
 * zrcadlový protějšek lib/dokladyPolozkySchema.js, jen pro VYDANÉ (appkou
 * vystavené) faktury místo přijatých dokladů. Viz ten soubor pro plné
 * zdůvodnění (proč appka položky drží jako samostatný list, export do
 * Money S3, zpětné vytěžení...).
 *
 * Faktura_ID - vazba na Vydane_faktury.ID.
 */
const VYDANE_FAKTURY_POLOZKY_HEADERS = ['ID', 'Faktura_ID', 'Nazev', 'Mnozstvi', 'Cena', 'SazbaDPH', 'Poradi'];

module.exports = { VYDANE_FAKTURY_POLOZKY_HEADERS };
