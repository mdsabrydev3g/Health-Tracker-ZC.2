/* Service Worker — PWA: كاش الثوابت + استقبال Web Push + النقر يفتح التطبيق.
   استراتيجية الشبكة: network-first للتنقل و API، cache-first للأصول الثابتة. */

const CACHE = 'ht-v2';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // الـ API دائماً شبكة
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => undefined);
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match('/index.html'))),
  );
});

// Web Push: تصل هنا إشعارات «أُخذت الجرعة / فاتت جرعة / نفاد دواء هام»
self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'إشعار', body: e.data ? e.data.text() : '' };
  }
  const payload = data.data ?? {};
  const urgent = payload.kind === 'stock_urgent';
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'رفيق الصحة', {
      body: data.body ?? '',
      tag: payload.kind ?? 'general',
      // الصوت فقط للعاجل (نفاد دواء هام) — سياسة الوضع
      silent: !urgent,
      requireInteraction: urgent,
      icon: '/icon.svg',
      badge: '/icon.svg',
      lang: 'ar',
      dir: 'rtl',
      data: payload,
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('/');
    }),
  );
});
