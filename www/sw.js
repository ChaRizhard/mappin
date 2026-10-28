/* Mappin service worker: makes the website version work offline once it has been opened.
   - The app itself (this folder) is cached and updated in the background.
   - Libraries from the online fallbacks (fonts, icons, map library) are cached the first time they load.
   - Place searches, routes and opening hours fall back to their last saved answer when offline.
   Map images are not stored by Mappin; whatever your browser has cached may still show. */
const VERSION = 'mappin-1.0.6';
const DATA_CACHE = 'mappin-data';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
const LIB_HOSTS = ['unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const DATA_HOSTS = ['nominatim.openstreetmap.org', 'photon.komoot.io', 'overpass-api.de', 'overpass.private.coffee',
  'routing.openstreetmap.de', 'wikipedia.org', 'wikidata.org', 'commons.wikimedia.org', 'upload.wikimedia.org'];
const MAX_DATA_ENTRIES = 400;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
    try {
      const r = await fetch('./vendor/files.json', { cache: 'no-store' });
      if (r.ok) {
        const files = await r.json();
        await Promise.all(files.map(f => cache.add('./vendor/' + f).catch(() => {})));
      }
    } catch (e) { /* no bundled libraries: the online copies get cached on first use */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('mappin-') && k !== VERSION && k !== DATA_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Opening the app: use the newest version when online (wait up to 3 s), otherwise the saved copy
  if (url.origin === self.location.origin && req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
        if (res && res.ok) { cache.put('./index.html', res.clone()); return res; }
        throw new Error('bad');
      } catch (e) {
        return (await cache.match('./index.html')) || fetch(req);
      }
    })());
    return;
  }

  // The app's other files: serve the saved copy instantly, refresh it in the background
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const key = req.mode === 'navigate' ? './index.html' : req;
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      return res || (await cache.match('./index.html')) || new Response('Offline', { status: 503 });
    })());
    return;
  }

  // Libraries loaded from the internet: keep a copy
  if (LIB_HOSTS.some(h => url.hostname === h)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Place searches, opening hours, routes: use the network, fall back to the last answer
  if (DATA_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) { cache.put(req, res.clone()); event.waitUntil(trimCache(DATA_CACHE, MAX_DATA_ENTRIES)); }
        return res;
      } catch (e) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw e;
      }
    })());
  }
  // Everything else (map images etc.) goes straight to the network
});
