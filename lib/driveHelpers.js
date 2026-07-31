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

/**
 * (v4.43) Vytáhne ID souboru z odkazu na Google Drive.
 *
 * Proč to appka potřebuje: u smlouvy jde `Zdrojovy_soubor_URL` vyplnit i
 * ručně (nakopírovaným odkazem). Takový řádek pak neměl vyplněné
 * `Zdrojovy_soubor_ID`, a bez ID appka sken neumí podat přes /api/soubor -
 * chip "Otevřít sken" tedy vedl rovnou na drive.google.com a kolega
 * (Janovi to funguje, je vlastník) skončil na "Potřebujete přístup".
 * Když je v odkazu ID, appka si ho vytáhne a sken jde přes appku jako
 * kterýkoli jiný.
 *
 * Pozor - ID samo o sobě nestačí: se scopem `drive.file` (viz komentář výš)
 * appka vidí jen soubory, které sama vytvořila. Odkaz na soubor nahraný na
 * Drive ručně tedy ID mít bude, ale Drive appce stejně odpoví 404 - na to
 * soubor.js reaguje srozumitelnou hláškou ("nahrajte ho do appky znovu")
 * místo obecné chyby.
 *
 * Podporované tvary odkazu:
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/uc?id=<ID>&export=download
 *   https://docs.google.com/document/d/<ID>/edit
 */
function idZeSdileneUrl(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  const vzory = [/\/d\/([a-zA-Z0-9_-]{10,})/, /[?&]id=([a-zA-Z0-9_-]{10,})/];
  for (const vzor of vzory) {
    const nalez = text.match(vzor);
    if (nalez) return nalez[1];
  }
  return '';
}

module.exports = { zajistiInboxSlozku, idZeSdileneUrl };
