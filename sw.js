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
// Werking (bijgewerkt 2026-08-24, zie hieronder): "network-first met korte timeout, terugval op
// cache". Bij elk bezoek wordt EERST het netwerk geprobeerd (dus altijd de nieuwste versie zodra
// er verbinding is) -- enkel als dat niet binnen 4 seconden lukt (geen bereik op de werf, of een
// trage verbinding) valt dit terug op de laatst gekende, gecachte versie, zodat de app ook dan
// meteen laadt i.p.v. te blijven hangen. Elke geslaagde netwerk-aanvraag werkt de cache meteen
// bij voor de volgende keer.
//
// Bugfix (2026-08-24, gemeld door Peter: "in mijn gewone browser zie ik nog een oude versie, in
// incognito wel de laatste"): de vorige strategie ("stale-while-revalidate") toonde bij ELK
// bezoek EERST de al gecachte versie (ook al was er gewoon internet), en haalde pas op de
// achtergrond een nieuwere versie op VOOR DE VOLGENDE KEER -- je liep dus permanent één bezoek
// achter op de werkelijke laatste versie, tenzij je toevallig twee keer kort na elkaar herlaadde.
// Incognito had nooit een bestaande cache, dus toonde daardoor toevallig altijd meteen de
// nieuwste versie. Nu je online bent (het gangbare geval bij het openen van de browser) krijg je
// dus voortaan meteen de nieuwste versie; enkel écht zonder bereik (of bij een zeer trage
// verbinding) valt dit terug op de laatst gekende cache -- exact het doel van de offline-modus.
const CACHE_NAME = 'casentis-werfverslag-v2';
const NETWORK_TIMEOUT_MS = 4000;

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

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const networkFetch = fetch(req).then((res) => {
      if(res && res.ok) cache.put(req, res.clone());
      return res;
    });
    // Voorkomt dat de service worker gestopt wordt vóór deze achtergrond-cache-update klaar is,
    // ook als hieronder al iets anders (de cache) teruggegeven werd omdat het netwerk traag was.
    event.waitUntil(networkFetch.catch(() => {}));

    const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
    try {
      const fast = await Promise.race([networkFetch, timeout]);
      if(fast) return fast; // netwerk was snel genoeg -> altijd de nieuwste versie
    } catch(err) {
      // netwerk faalde meteen (bv. echt geen bereik) -> hieronder meteen terugvallen op cache
    }
    if(cached) return cached;
    return networkFetch; // laatste redmiddel: geen cache en het netwerk was traag, dan toch wachten
  })());
});
