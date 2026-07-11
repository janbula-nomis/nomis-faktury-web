/**
 * lib/driveHelpers.js
 *
 * Appka pro přístup k Disku používá OAuth scope
 *   https://www.googleapis.com/auth/drive.file
 * místo širokého https://www.googleapis.com/auth/drive.
 *
 * Proč: plný scope "drive" patří mezi Google "restricted scopes" - i po
 * publikaci OAuth appky do stavu "In production" appce bez formálního
 * (placeného, týdny trvajícího) bezpečnostního posouzení CASA zůstává
 * refresh token omezený na 7 dní, což pro appku běžící bez obsluhy
 * nefunguje. Scope "drive.file" mezi restricted scopes nepatří - appka tak
 * může zůstat neverifikovaná (malý interní tým, žádná zvláštní kontrola
 * není potřeba) a refresh token přesto vydrží napořád.
 *
 * Cena za to: s "drive.file" appka vidí a může zapisovat jen do souborů a
 * složek, které SAMA vytvořila (nebo které by uživatel výslovně vybral přes
 * Google Picker - to appka nepoužívá). Do složky založené ručně mimo appku
 * (přetažením myší na Google Disku) appka přístup nemá a nezíská ho, i
 * kdyby jí ji "nasdílel" majitel účtu - to funguje jen u service accountů,
 * ne u OAuth drive.file scope.
 *
 * Řešení: appka si svou Inbox složku vytváří sama (funkce níže) a její ID
 * appka sama zjistí/nastaví - viz netlify/functions/setup.js.
 */

async function zajistiInboxSlozku(drive, existujiciId) {
  if (existujiciId) {
    try {
      const { data } = await drive.files.get({
        fileId: existujiciId,
        fields: 'id, name, trashed',
      });
      if (data && !data.trashed) {
        return { id: data.id, nazev: data.name, vytvorenaNove: false };
      }
    } catch (e) {
      // Appka k té složce nemá přístup (typicky proto, že nebyla vytvořená
      // appkou samotnou pod drive.file scope, nebo byla smazána) -
      // vytvoříme appce složku novou, viz níže.
    }
  }

  const korenova = await drive.files.create({
    requestBody: {
      name: 'Nomis Group - Doklady',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  const inbox = await drive.files.create({
    requestBody: {
      name: '00_Inbox',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [korenova.data.id],
    },
    fields: 'id',
  });

  return { id: inbox.data.id, nazev: '00_Inbox', vytvorenaNove: true };
}

module.exports = { zajistiInboxSlozku };
