// Service worker: aplikacja otwiera się bez sieci (powłoka z pamięci). Dane i kolejkę
// zmian offline trzyma sama strona (IndexedDB, src/offline); tu tylko pliki i zdjęcia maszyn.
const CACHE = "pixgym-shell-v4";
const PHOTOS = "pixgym-photos-v1";
const SHELL = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

/**
 * Zapisuje stronę i wszystkie pliki, których potrzebuje (JS, CSS, czcionki z CSS-a).
 * Bez tego pierwsze uruchomienie nowej wersji ładuje pliki przed przejęciem strony przez
 * service worker, więc nie trafiają do pamięci i bez sieci aplikacja się nie otwiera.
 * Pliki starych wersji (inne hashe) usuwamy, żeby pamięć nie rosła.
 */
async function cacheApp(html) {
  const c = await caches.open(CACHE);
  const assets = new Set([...html.matchAll(/\/assets\/[^"'\s)]+/g)].map((m) => m[0]));
  for (const css of [...assets].filter((a) => a.endsWith(".css"))) {
    const res = (await c.match(css)) || (await fetch(css));
    if (!res.ok) continue;
    await c.put(css, res.clone());
    for (const m of (await res.text()).matchAll(/\/assets\/[^"'\s)]+/g)) assets.add(m[0]);
  }
  for (const a of assets) if (!(await c.match(a))) await c.add(a);
  for (const req of await c.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") && !assets.has(path)) await c.delete(req);
  }
}

async function cachePage(res) {
  const html = await res.clone().text();
  await (await caches.open(CACHE)).put("/", res);
  await cacheApp(html);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => fetch("/", { cache: "no-store" }))
      .then((res) => res.ok && cachePage(res)),
  );
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
  // Nowa wersja od razu zapisuje swoje pliki, żeby działała też bez sieci.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) event.waitUntil(cachePage(res.clone()).catch(() => {}));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Manifest i ikony: sieć, bez sieci z pamięci.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname)));
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
