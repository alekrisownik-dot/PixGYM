// Service worker: aplikacja otwiera się bez sieci (powłoka z pamięci). Dane i kolejkę
// zmian offline trzyma sama strona (IndexedDB, src/offline); tu tylko pliki i zdjęcia maszyn.
const CACHE = "pixgym-shell-v2";
const PHOTOS = "pixgym-photos-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PHOTOS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  // Zdjęcie pod danym ID się nie zmienia: z pamięci, żeby było widać je na siłowni bez zasięgu.
  if (url.pathname.startsWith("/api/v1/exercise-photos/")) {
    event.respondWith(
      caches.open(PHOTOS).then((c) =>
        c.match(event.request).then(
          (hit) =>
            hit ||
            fetch(event.request).then((res) => {
              if (res.ok) c.put(event.request, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // Pliki z hashem w nazwie się nie zmieniają: najpierw pamięć.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Strona: najpierw sieć (żeby szybko dostać nową wersję), bez sieci z pamięci.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
  }
});

// Koniec przerwy: powiadomienie wysyła strona przez service worker, bo tak działa
// także przy zablokowanym ekranie (Android).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      const win = list[0];
      return win ? win.focus() : self.clients.openWindow("/");
    }),
  );
});
