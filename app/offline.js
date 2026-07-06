/* Offline tape downloads: page-side Cache API helpers + service worker registration.
 * yojik.eu sends no CORS headers, so tapes are fetched no-cors and stored as
 * opaque responses — playable via <audio>, size not readable.
 */

const AUDIO_CACHE = "fsi-audio-v1";
const offlineSupported = "caches" in window && "serviceWorker" in navigator;

if (offlineSupported) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed:", e));
}

async function isTapeCached(url) {
  if (!offlineSupported) return false;
  const c = await caches.open(AUDIO_CACHE);
  return (await c.match(url)) !== undefined;
}

async function cacheTape(url) {
  const c = await caches.open(AUDIO_CACHE);
  const res = await fetch(url, { mode: "no-cors" });
  await c.put(url, res);
}

async function uncacheTape(url) {
  const c = await caches.open(AUDIO_CACHE);
  await c.delete(url);
}

/* Builds the per-tape download toggle button used in tape rows. */
function offlineButton(url) {
  if (!offlineSupported) return null;
  const btn = document.createElement("button");
  btn.className = "tape-dl";
  btn.textContent = "⬇";
  btn.title = "Save for offline";

  const setState = (s) => {
    btn.dataset.state = s;
    btn.textContent = s === "cached" ? "✓" : s === "busy" ? "…" : "⬇";
    btn.title =
      s === "cached" ? "Saved offline — click to remove" : s === "busy" ? "Downloading…" : "Save for offline";
  };
  setState("none");
  isTapeCached(url).then((yes) => setState(yes ? "cached" : "none"));

  btn.addEventListener("click", async () => {
    const state = btn.dataset.state;
    if (state === "busy") return;
    setState("busy");
    try {
      if (state === "cached") {
        await uncacheTape(url);
        setState("none");
      } else {
        await cacheTape(url);
        setState("cached");
      }
    } catch (e) {
      console.warn("offline toggle failed:", e);
      setState(state);
    }
  });
  return btn;
}

/* "Save all" button for a unit card: downloads every tape URL sequentially. */
function offlineAllButton(urls) {
  if (!offlineSupported || !urls.length) return null;
  const btn = document.createElement("button");
  btn.className = "unit-dl";

  const refresh = async () => {
    const cached = await Promise.all(urls.map(isTapeCached));
    const n = cached.filter(Boolean).length;
    btn.textContent = n === urls.length ? "✓ offline" : `⬇ all (${n}/${urls.length})`;
    btn.dataset.done = n === urls.length ? "1" : "";
  };
  refresh();

  btn.addEventListener("click", async () => {
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    try {
      if (btn.dataset.done) {
        for (const u of urls) await uncacheTape(u);
      } else {
        let i = 0;
        for (const u of urls) {
          i++;
          btn.textContent = `⬇ ${i}/${urls.length}…`;
          if (!(await isTapeCached(u))) await cacheTape(u);
          // refresh sibling tape buttons as they land
          document
            .querySelectorAll(`.tape-row[data-url="${CSS.escape(u)}"] .tape-dl`)
            .forEach((b) => {
              b.dataset.state = "cached";
              b.textContent = "✓";
            });
        }
      }
    } catch (e) {
      console.warn("bulk download failed:", e);
    }
    delete btn.dataset.busy;
    refresh();
    if (btn.dataset.done !== "1" && !btn.textContent.startsWith("⬇ all")) refresh();
    // also refresh per-tape buttons after bulk remove
    document.querySelectorAll(".tape-dl").forEach(async (b) => {
      const row = b.closest(".tape-row");
      if (row && urls.includes(row.dataset.url)) {
        const yes = await isTapeCached(row.dataset.url);
        b.dataset.state = yes ? "cached" : "none";
        b.textContent = yes ? "✓" : "⬇";
      }
    });
  });
  return btn;
}
