/* ============================================================
   Parkla — service worker
   NÄTET FÖRST, cache bara som reserv. Då kan man aldrig fastna
   på en gammal version, men appen funkar ändå utan täckning.
   ============================================================ */
const CACHE = "parkla-v51";
const SHELL = [
  "./", "./index.html", "./app.css", "./map.css", "./tour.css", "./book.css", "./flows.css",
  "./icons.js", "./data.js", "./map.js", "./tour.js", "./api.js", "./app.js", "./flows.js", "./live.js",
  "./version.json", "./icon.svg", "./icon-180.png", "./icon-512.png", "./manifest.webmanifest"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* Kartrutor och typsnitt: cache först, de ändras aldrig */
  if (/arcgisonline|cartocdn|fonts\.gstatic|fonts\.googleapis|unpkg/.test(url.hostname + url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit))
    );
    return;
  }

  /* Adressökning ska aldrig cachas */
  if (/nominatim/.test(url.hostname)) return;

  /* versionskollen måste alltid gå mot nätet */
  if (/version\.json/.test(url.pathname)) return;

  /* Allt eget: nätet först, cache som reserv */
  if (sameOrigin) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
  }
});
