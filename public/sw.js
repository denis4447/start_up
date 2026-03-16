// NoteAI Service Worker v2 — push notifications + lifecycle management

const SW_VERSION = '2.0.0';

// --- Lifecycle ---

self.addEventListener('install', (event) => {
  // Activate immediately, don't wait for old SW to die
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all open tabs so the new SW takes effect immediately
  event.waitUntil(self.clients.claim());
});

// --- Push Notifications ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'NoteAI', body: event.data.text() };
  }

  const title = data.title || 'NoteAI';
  const options = {
    body: data.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.eventId ? `event-${data.eventId}` : `noteai-${Date.now()}`,
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// --- Notification Click ---

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Deep-link to calendar if we have event context
  const targetUrl = event.notification.data?.eventId ? '/calendar' : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Try to focus an existing window
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // No existing window — open a new one
      return self.clients.openWindow(targetUrl);
    })
  );
});
