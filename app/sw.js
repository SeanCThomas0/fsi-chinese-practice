/* Service worker: offline support.
 * - App shell + data: stale-while-revalidate (same-origin).
 * - Tapes (yojik.eu mp3s): served from the audio cache when present; tapes get
 *   into that cache via the ⬇ buttons in the app (page-side Cache API).
 *   Cross-origin responses are opaque (yojik sends no CORS headers), which is
 *   fine for <audio> playback but means we can't slice Range requests — we
 *   return the full cached response and let the browser handle it.
 */

const SHELL_CACHE = "fsi-shell-v3";
const AUDIO_CACHE = "fsi-audio-v1";

const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "offline.js",
  "drills.js",
  "writing.js",
  "vendor/hanzi-writer.min.js",
  "data/catalog.json",
  "data/tone-pairs.json",
  "data/characters.json",
  "manifest.webmanifest",
  "icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== AUDIO_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Audio from yojik: cache-first (cache is populated by explicit downloads).
  if (url.hostname.endsWith("yojik.eu")) {
    event.respondWith(
      caches
        .open(AUDIO_CACHE)
        .then((c) => c.match(url.href))
        .then((hit) => hit || fetch(event.request)),
    );
    return;
  }

  // Same-origin shell/data/strokes: stale-while-revalidate.
  if (url.origin === self.location.origin && event.request.method === "GET") {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (c) => {
        const cached = await c.match(event.request);
        const refresh = fetch(event.request)
          .then((res) => {
            if (res.ok) c.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || refresh;
      }),
    );
  }
});
