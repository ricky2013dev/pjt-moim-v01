/* Imported into the Workbox service worker. Handles FCM web-push data messages. */

// Updates the number on the home-screen icon (iOS 16.4+ installed app, Android
// Chrome) even while the app is closed. The session cookie goes along, so the
// server returns this person's own unread counts.
async function updateAppBadge() {
  if (!('setAppBadge' in self.navigator)) return;
  try {
    const res = await fetch('/api/badges', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return;
    const b = await res.json();
    const total = (b.messages || 0) + (b.announcements || 0);
    await (total ? self.navigator.setAppBadge(total) : self.navigator.clearAppBadge());
  } catch { /* offline or signed out: leave the badge as it is */ }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const data = payload.data || payload.notification || payload;
  const title = data.title || 'Moim';
  const url = data.url || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((c) => c.postMessage({ type: 'moim-push', url }));
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: url,
      renotify: true,
      data: { url },
    });
    await updateAppBadge();
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) {
        c.postMessage({ type: 'moim-navigate', url });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
