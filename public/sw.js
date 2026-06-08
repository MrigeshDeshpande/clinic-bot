const CACHE_BUST = '2026-06-08-v1';
const CACHE = `clinic-cache-${CACHE_BUST}`;
const STATIC_CACHE = `clinic-static-${CACHE_BUST}`;
const API_CACHE = `clinic-api-${CACHE_BUST}`;

const PRECACHE_URLS = [
  '/dashboard',
  '/dashboard/login',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

function shouldCache(url) {
  const u = new URL(url);
  if (u.pathname.startsWith('/api/dashboard/media/signed')) return false;
  if (u.pathname.startsWith('/api/dashboard/logout')) return false;
  if (u.pathname.startsWith('/api/')) return true;
  if (u.pathname.startsWith('/_next/static')) return true;
  if (u.pathname.startsWith('/fonts/')) return true;
  if (u.pathname === '/') return true;
  if (u.pathname.startsWith('/icon-')) return true;
  if (u.pathname === '/manifest.json') return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!shouldCache(url)) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      caches.open(API_CACHE).then((cache) => {
        cache.put(request, clone);
      });
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/dashboard');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}
