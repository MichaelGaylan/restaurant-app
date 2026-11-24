// Shared service worker for every restaurant (RSW): works offline, updates on request.
// Each restaurant's sw.js is one line: importScripts('brand.js', '../../app/sw-core.js').
// Bump APP_BUILD with every release of the shared app (it follows js/config.js);
// phones notice the change and update. A restaurant's own brandVersion does the
// same when its name or pictures change.
const APP_BUILD = '0.8.1-2026.11.24-2';
const B = self.BRAND;
const CACHE = `${B.teamId}-${APP_BUILD}-${B.brandVersion || 1}`;
const APP = [
  'css/app.css', 'assets/whoosh.mp3', 'js/head.js', 'js/shell.js',
  'js/app.js', 'js/config.js', 'js/access.js', 'js/crypto.js', 'js/store.js', 'js/starter-stock.js', 'js/menu.js', 'js/pdf.js', 'js/lounge.js',
  'js/ui.js', 'js/data.js', 'js/perms.js', 'js/recipes.js', 'js/stock.js', 'js/board.js', 'js/prep.js',
  'js/schedule.js', 'js/events.js', 'js/costs.js', 'js/settings.js', 'js/sync.js', 'js/audience.js', 'js/dedupe.js', 'js/reports.js',
  'js/payroll.js', 'js/paycalc.js', 'js/provider.js', 'js/pos.js', 'js/giftcards.js', 'js/music.js', 'js/cleardata.js',
].map((f) => '../../app/' + f);
const SHELL = [
  './', 'index.html', 'brand.js', 'manifest.webmanifest',
  B.logo, B.icon180, B.icon192, B.icon512, B.favicon,
  ...APP,
  // The restaurant's dish pictures (brand.js menuPhotos), for the POS tiles and Recipes.
  ...new Set(Object.values(B.menuPhotos || {}).map((f) => (/[/:]/.test(f) ? f : (B.menuPhotoDir || '') + f))),
].filter(Boolean);

// A new version takes over as soon as it has downloaded; the page reloads
// itself when that happens. (Waiting for every window to close never
// happens reliably for home-screen apps on iPhone.)
self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's own short-term cache, which could
  // otherwise hand back the previous version's files (GitHub Pages lets
  // browsers keep files for 10 minutes).
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// A request waiting for approval (RRA-043): open the app on Team access.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const url = new URL('./#/team', self.registration.scope).href;
    for (const c of list) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.mp4')) return; // video needs range requests; let the network handle it
  if (url.pathname.includes('/data/') || url.pathname.endsWith('/js/config.js') || url.pathname.endsWith('/brand.js')) {
    // Notices and revocations: always try the network first.
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
