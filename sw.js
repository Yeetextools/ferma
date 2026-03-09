// Весёлая Ферма — Service Worker
// Версия кеша: меняй при деплое новой версии игры
const CACHE_NAME = 'vesyolaya-ferma-v7';

// Файлы для кеширования при установке (App Shell)
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Google Fonts (кешируем при первом запросе, не при установке)
];

// Внешние origin-ы, которые кешируем по стратегии "stale-while-revalidate"
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// ── INSTALL ───────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──────────────────────────────────────
// Удаляем старые кеши при обновлении SW
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Для навигационных запросов (открытие страницы) — отдаём из кеша,
  // фолбэк — index.html (для работы офлайн)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(r => r || fetch(event.request))
    );
    return;
  }

  // Шрифты Google: stale-while-revalidate (кешируем навсегда, обновляем в фоне)
  if (FONT_ORIGINS.some(o => event.request.url.startsWith(o))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const network = fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached); // офлайн: вернуть кешированное
          return cached || network;
        })
      )
    );
    return;
  }

  // Всё остальное: Cache First → Network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Кешируем только успешные GET-ответы с одного origin
        if (
          event.request.method === 'GET' &&
          response.status === 200 &&
          url.origin === self.location.origin
        ) {
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, response.clone())
          );
        }
        return response;
      }).catch(() => {
        // Офлайн фолбэк для HTML-страниц
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
