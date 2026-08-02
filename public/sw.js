/**
 * public/sw.js  (v4.46)
 *
 * Service worker appky - ZÁMĚRNĚ BEZ JAKÉHOKOLIV KEŠOVÁNÍ.
 *
 * Proč tady vůbec je: Android (Chrome) nainstaluje appku na plochu jako
 * opravdovou appku (tzv. WebAPK - vlastní ikona, spuštění bez adresního
 * řádku) jen tehdy, když stránka má manifest A registrovaný service worker,
 * který obsluhuje událost `fetch`. Bez něj by se ikona na ploše sice
 * vytvořila, ale jen jako zástupce v prohlížeči.
 *
 * Proč nic nekešuje: appka je stavěná tak, že data i podoba obrazovek
 * chodí ze serveru (Netlify funkce + Google Sheets) a v minulosti nás
 * opakovaně pálilo, když si prohlížeč držel starou verzi app.js a uživatel
 * pak koukal na appku, která "opravu nemá". Kešující service worker by
 * tenhle problém udělal ještě horším a hůř dohledatelným (šel by vypnout
 * jen odinstalací appky z plochy). Proto tenhle worker jen podá požadavek
 * dál do sítě - chová se úplně stejně, jako by tam nebyl.
 *
 * Důsledek, který je fér přiznat: appka NEFUNGUJE offline. To je záměr -
 * bez internetu by stejně nešlo nic načíst ani uložit, protože všechna data
 * jsou v Google Sheets.
 */
const VERZE = 'v4.46';

self.addEventListener('install', (event) => {
  // Nová verze workeru se má aktivovat hned, ne až se zavřou všechny karty.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Pojistka pro případ, že by nějaká starší verze appky přece jen něco
      // nakešovala - při aktivaci to celé zahodíme.
      try {
        const klice = await caches.keys();
        await Promise.all(klice.map((k) => caches.delete(k)));
      } catch (e) {
        // caches nemusí být k dispozici (např. přísné nastavení prohlížeče) -
        // to appce nevadí, worker stejně nic nekešuje.
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Síť a nic než síť. Handler tu musí být, jinak Android appku
  // nenainstaluje jako WebAPK (viz komentář nahoře).
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'verze') {
    event.source && event.source.postMessage({ verze: VERZE });
  }
});
