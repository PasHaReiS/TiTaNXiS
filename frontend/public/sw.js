/* TiTaNXiS Service Worker — offline shell cache + web-push receiver */
const CACHE = "titanxis-v1";
const APP_SHELL = [
  "/",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for GET requests; cache fallback for offline.
// POST/PUT/PATCH/DELETE always bypass the cache.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Skip other origins (e.g. Emergent CDN videos, analytics)
  if (url.origin !== self.location.origin) return;
  // Skip websocket / long-poll
  if (req.headers.get("upgrade")) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        // Cache successful GET responses for API + static assets
        if (fresh && fresh.ok && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/static/") || APP_SHELL.includes(url.pathname))) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => null);
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Offline HTML fallback: return cached / index
        if (req.destination === "document") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});

// Web Push handler — displays a notification when the server pushes.
self.addEventListener("push", (event) => {
  let data = { title: "TiTaNXiS", body: "Yeni bildirim", url: "/" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) {}
  event.waitUntil((async () => {
    try {
      if (data.hid) {
        await fetch(`/api/push/history/${data.hid}/opened`, { method: "POST", credentials: "omit" }).catch(() => null);
      }
    } catch (e) {}
    // Broadcast the sound key to any open clients so the main app can play the cue.
    if (data.sound) {
      try {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of clients) {
          c.postMessage({ type: "push-sound", sound: data.sound, tag: data.tag || "titanxis" });
        }
      } catch (e) {}
    }
    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/favicon.ico",
      badge: data.badge || "/favicon.ico",
      data: { url: data.url || "/", hid: data.hid || null, sound: data.sound || null },
      tag: data.tag || "titanxis",
      renotify: true,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  const hid = event.notification.data?.hid;
  event.waitUntil((async () => {
    if (hid) {
      try { await fetch(`/api/push/history/${hid}/clicked`, { method: "POST", credentials: "omit" }); } catch (e) {}
    }
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      if (c.url.includes(self.location.origin) && "focus" in c) {
        c.navigate(target);
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
