// Service worker voor de Casentis werfverslag-app -- offline-modus, deel 2 ("de app zelf kunnen
// LADEN zonder bereik"; deel 1 is de lokale opslag-wachtrij in index.html zelf, zie de
// toelichting daar bij "Offline-modus").
//
// LET OP -- dit bestand moet exact als "sw.js" naast index.html in de GitHub-repo (root van
// GitHub Pages) staan. Dat is geen keuze maar een technische vereiste van service workers: ze
// kunnen niet in het HTML-bestand zelf ingebed worden, en de "scope" (welke pagina's een
// service worker mag afvangen) hangt af van waar het bestand zelf staat -- vandaar naast
// index.html, niet in een submap.
//
// Werking: een simpele "stale-while-revalidate"-strategie voor de eigen pagina (en enkel de
// eigen pagina -- nooit voor Supabase-aanvragen of andere sites). Bij elk bezoek wordt eerst de
// laatst gecachte versie getoond (werkt dus ook zonder internet), en op de achtergrond meteen
// een nieuwe versie opgehaald voor de VOLGENDE keer (zodat een update van de app niet blijft
// "hangen" op een oude versie, maar er wel altijd een direct beschikbare offline-kopie is).
const CACHE_NAME = 'casentis-werfverslag-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  // Enkel de eigen pagina (same-origin) cachen -- nooit Supabase-API-aanvragen of andere externe
  // aanvragen afvangen. Die moeten altijd gewoon via het netwerk gaan (of falen als er geen
  // netwerk is, wat de app zelf al afhandelt via de lokale opslag-wachtrij in index.html).
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then((res) => {
        if(res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
