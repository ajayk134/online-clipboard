// public/sw.js — Online Clipboard service worker
const CACHE_NAME = 'oc-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/vendor/css/quill.snow.css',
  '/vendor/css/hljs-github.css',
  '/vendor/css/hljs-github-dark.css',
  '/vendor/js/quill.js',
  '/vendor/js/highlight.min.js',
  '/js/common.js',
  '/js/editor.js',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'no-cache' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls are never cached; always go to the network.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
