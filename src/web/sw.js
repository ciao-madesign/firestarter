/* Service worker: shell dell'app in cache e consultazione offline dei contenuti già caricati. */
const SHELL = 'lab-shell-v1';
const DATA = 'lab-data-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/styles.css', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const readOnlyApi = /^\/api\/(session|lessons|course|env|catalog|fs|file)/.test(url.pathname);
  if (url.pathname.startsWith('/api/') && !readOnlyApi) return;
  if (readOnlyApi) {
    // rete prima; se assente, ultimo contenuto noto
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ error: 'offline', message: 'Connessione assente' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => hit || caches.match('/index.html'));
      return hit || net;
    }),
  );
});
