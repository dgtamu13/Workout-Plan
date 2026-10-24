// Bump CACHE when shipping changes so clients drop old assets.
const CACHE = 'training-calendar-v24';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'vendor/chart.umd.js',
  'drive-sync.js',
  'program.js',
  'plan-proposal.js',
  'sheets-sync.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only this release's cache is ever read (caches.match alone would also search leftovers from older releases).
const fromCache = req => caches.open(CACHE).then(c => c.match(req));
const cacheCopy = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: network first (revalidated, never the browser's 10-minute HTTP cache) so updates show up; cached copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return res; })
        .catch(() => fromCache('index.html'))
    );
    return;
  }

  // The app's own scripts and data: network first too, so a page never runs against scripts from an older release.
  // Falls back to the cached copy when offline. Icons and the bundled chart library never change under the same name: cache first.
  if (url.origin === self.location.origin) {
    const stable = /\/(vendor|icons)\//.test(url.pathname);
    e.respondWith(stable
      ? fromCache(req).then(hit => hit || fetch(req).then(res => cacheCopy(req, res)))
      : fetch(req, { cache: 'no-cache' }).then(res => cacheCopy(req, res)).catch(() => fromCache(req)));
    return;
  }

  // Google Fonts: cache first, fill on miss.
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(fromCache(req).then(hit => hit || fetch(req).then(res => cacheCopy(req, res))));
  }
});
