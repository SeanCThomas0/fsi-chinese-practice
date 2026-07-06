/* FSI Standard Chinese — Speaking Practice
 * Static app: streams the public-domain FSI tapes from fsi-languages.yojik.eu,
 * with an A-B loop player, mic recording for pronunciation compare,
 * and localStorage progress tracking.
 */

const $ = (sel) => document.querySelector(sel);

const state = {
  catalog: null,
  view: "home",           // "home" | "resource" | module id
  currentTape: null,      // { url, title, sub, rowEl }
  loopA: null,
  loopB: null,
  recorder: null,
  recChunks: [],
  recUrl: null,
  comparing: false,
};

/* ---------------- progress (localStorage) ---------------- */

const PROGRESS_KEY = "fsi-zh-progress";
let progress = {};
try { progress = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch { progress = {}; }

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}
function isDone(url) { return !!progress[url]; }
function setDone(url, done) {
  if (done) progress[url] = true;
  else delete progress[url];
  saveProgress();
  renderNav();
}

/* ---------------- catalog helpers ---------------- */

function moduleTapeUrls(mod) {
  const urls = [];
  for (const tapes of Object.values(mod.units)) {
    for (const t of tapes) urls.push(mod.baseUrl + t.file);
  }
  for (const r of mod.reviews) urls.push(mod.baseUrl + r.file);
  if (mod.criterionTest) urls.push(mod.baseUrl + mod.criterionTest);
  return urls;
}

function resourceTapeUrls(res) {
  return res.sections.flatMap((s) => s.tapes.map((t) => res.baseUrl + t.file));
}

function doneCount(urls) { return urls.filter(isDone).length; }

/* ---------------- navigation ---------------- */

function renderNav() {
  const nav = $("#nav");
  nav.innerHTML = "";

  const mkItem = (id, code, name, urls) => {
    const btn = document.createElement("button");
    btn.className = "nav-item" + (state.view === id ? " active" : "");
    const done = doneCount(urls);
    const total = urls.length;
    btn.innerHTML = `
      <span class="nav-code">${code}</span>
      <span class="nav-name">${name}</span>
      <span class="nav-progress${done === total && total > 0 ? " done" : ""}">${done}/${total}</span>`;
    btn.addEventListener("click", () => show(id));
    return btn;
  };

  const home = document.createElement("button");
  home.className = "nav-item" + (state.view === "home" ? " active" : "");
  home.innerHTML = `<span class="nav-code">🏠</span><span class="nav-name">Overview</span>`;
  home.addEventListener("click", () => show("home"));
  nav.appendChild(home);

  const label = (text) => {
    const el = document.createElement("div");
    el.className = "nav-section-label";
    el.textContent = text;
    nav.appendChild(el);
  };

  label("Foundation");
  nav.appendChild(mkItem("resource", "RES", "Resource Module", resourceTapeUrls(state.catalog.resource)));

  label("Core Modules");
  for (const mod of state.catalog.core) {
    nav.appendChild(mkItem(mod.id, String(mod.number).padStart(2, "0"), mod.name, moduleTapeUrls(mod)));
  }

  label("Optional Modules");
  for (const mod of state.catalog.optional) {
    nav.appendChild(mkItem(mod.id, mod.code, mod.name, moduleTapeUrls(mod)));
  }
}

function show(viewId) {
  state.view = viewId;
  if (location.hash.slice(1) !== viewId) {
    history.replaceState(null, "", viewId === "home" ? "#" : "#" + viewId);
  }
  renderNav();
  if (viewId === "home") renderHome();
  else if (viewId === "resource") renderResource();
  else {
    const mod =
      state.catalog.core.find((m) => m.id === viewId) ||
      state.catalog.optional.find((m) => m.id === viewId);
    if (mod) renderModule(mod);
    else {
      state.view = "home";
      renderNav();
      renderHome();
    }
  }
  $("#main").scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

/* ---------------- views ---------------- */

function renderHome() {
  const c = state.catalog;
  const content = $("#content");
  content.innerHTML = `
    <div class="home-hero">
      <h2>你好! Ready to practice?</h2>
      <p>This is the complete <strong>FSI Standard Chinese: A Modular Approach</strong> course —
      the U.S. Foreign Service Institute program used to train diplomats to speak Mandarin.
      Work through the Resource Module first (pronunciation, romanization, numbers), then the core
      modules in order. Each unit has <em>Comprehension</em> (C), <em>Production</em> (P), and
      <em>Drill</em> (D) tapes — the P and D tapes are where you speak out loud.</p>
      <p>Use the <strong>A-B loop</strong> to repeat a sentence until you can shadow it, slow the
      speed if needed, and hit <strong>Rec</strong> to record yourself and compare against the tape.</p>
    </div>
    <div class="home-grid" id="home-grid"></div>`;

  const grid = $("#home-grid");
  const card = (id, code, name, urls) => {
    const done = doneCount(urls);
    const pct = urls.length ? Math.round((done / urls.length) * 100) : 0;
    const el = document.createElement("button");
    el.className = "home-card";
    el.innerHTML = `
      <span class="code">${code}</span>
      <h3>${name}</h3>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="pct">${done}/${urls.length} tapes · ${pct}%</div>`;
    el.addEventListener("click", () => show(id));
    return el;
  };

  grid.appendChild(card("resource", "RES", "Resource Module", resourceTapeUrls(c.resource)));
  for (const mod of c.core) {
    grid.appendChild(card(mod.id, `MODULE ${String(mod.number).padStart(2, "0")}`, mod.name, moduleTapeUrls(mod)));
  }
  for (const mod of c.optional) {
    grid.appendChild(card(mod.id, `OPTIONAL · ${mod.code}`, mod.name, moduleTapeUrls(mod)));
  }
}

function tapeRow(url, title, sub, badge) {
  const row = document.createElement("div");
  row.className = "tape-row";
  row.dataset.url = url;

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "tape-check";
  check.checked = isDone(url);
  check.title = "Mark tape complete";
  check.addEventListener("change", () => {
    setDone(url, check.checked);
    const view = state.view;
    // re-render counts in the open view without losing scroll position
    document.querySelectorAll(".unit-done-count").forEach((el) => el.dispatchEvent(new Event("refresh")));
  });

  const play = document.createElement("button");
  play.className = "tape-play";
  play.textContent = "▶";
  play.addEventListener("click", () => loadTape(url, title, sub, row));

  const label = document.createElement("span");
  label.className = "tape-label";
  label.textContent = title;
  label.addEventListener("click", () => loadTape(url, title, sub, row));

  row.append(check, play, label);
  if (badge) {
    const b = document.createElement("span");
    b.className = "tape-kind " + (badge.kind ?? "");
    b.textContent = badge.text;
    row.appendChild(b);
  }
  if (state.currentTape?.url === url) row.classList.add("playing");
  return row;
}

function unitCard(titleText, rows) {
  const card = document.createElement("div");
  card.className = "unit-card";
  const title = document.createElement("div");
  title.className = "unit-title";

  const countEl = document.createElement("span");
  countEl.className = "unit-done-count";
  const refresh = () => {
    const urls = rows.map((r) => r.dataset.url);
    countEl.textContent = `${doneCount(urls)}/${urls.length} done`;
  };
  countEl.addEventListener("refresh", refresh);

  title.innerHTML = `<span>${titleText}</span>`;
  title.appendChild(countEl);
  card.appendChild(title);
  rows.forEach((r) => card.appendChild(r));
  refresh();
  return card;
}

function pdfLinks(baseUrl, pdfs) {
  if (!pdfs.length) return "";
  const wrap = document.createElement("div");
  wrap.className = "pdf-links";
  for (const p of pdfs) {
    const a = document.createElement("a");
    a.className = "pdf-link";
    a.href = baseUrl + p.file;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `📄 ${p.label}`;
    wrap.appendChild(a);
  }
  return wrap;
}

function renderResource() {
  const res = state.catalog.resource;
  const content = $("#content");
  content.innerHTML = `
    <div class="module-header">
      <h2>Resource Module</h2>
      <div class="module-meta">Foundation tapes — do these first, especially Pronunciation &amp; Romanization</div>
    </div>
    <div class="section-note">
      Start with <strong>P&amp;R</strong> to train your ear on tones, initials, and finals.
      NUM (numbers), CE (classroom expressions), and T&amp;D (time &amp; dates) support the core modules —
      you can interleave them as the modules call for them.
    </div>`;

  const links = pdfLinks(res.baseUrl, res.pdfs);
  if (links) content.appendChild(links);

  for (const section of res.sections) {
    const rows = section.tapes.map((t) =>
      tapeRow(res.baseUrl + t.file, `${section.name} — ${t.label}`, "Resource Module", {
        kind: null,
        text: section.code,
      }),
    );
    content.appendChild(unitCard(`${section.name} (${section.code})`, rows));
  }
}

function renderModule(mod) {
  const content = $("#content");
  const numLabel = mod.number ? `Module ${String(mod.number).padStart(2, "0")}` : `Optional Module`;
  content.innerHTML = `
    <div class="module-header">
      <h2>${numLabel} — ${mod.name} (${mod.code})</h2>
      <div class="module-meta">${Object.keys(mod.units).length} units</div>
    </div>`;

  if (mod.units["1"]?.[0]?.kind) {
    content.insertAdjacentHTML(
      "beforeend",
      `<div class="section-note">
        Suggested order per unit: <strong>C</strong> (comprehension — listen &amp; understand) →
        <strong>P</strong> (production — speak in the pauses) →
        <strong>D</strong> (drills — rapid-fire pattern practice).
        Speak out loud on P and D tapes; use the loop to redo any exchange you fumble.
      </div>`,
    );
  }

  const links = pdfLinks(mod.baseUrl, mod.pdfs);
  if (links) content.appendChild(links);

  const unitNums = Object.keys(mod.units).map(Number).sort((a, b) => a - b);
  for (const n of unitNums) {
    const rows = mod.units[String(n)].map((t) =>
      tapeRow(
        mod.baseUrl + t.file,
        `Unit ${n} — ${t.label}`,
        `${mod.code} · Unit ${n}`,
        t.kind ? { kind: t.kind, text: t.kindLabel } : null,
      ),
    );
    content.appendChild(unitCard(`Unit ${n}`, rows));
  }

  if (mod.reviews.length) {
    const rows = mod.reviews.map((r) =>
      tapeRow(mod.baseUrl + r.file, r.label, `${mod.code} · Review`, { kind: null, text: "Review" }),
    );
    content.appendChild(unitCard("Review Tapes", rows));
  }

  if (mod.criterionTest) {
    const rows = [
      tapeRow(mod.baseUrl + mod.criterionTest, "Criterion Test", `${mod.code} · Test`, {
        kind: null,
        text: "Test",
      }),
    ];
    content.appendChild(unitCard("Criterion Test — take when you finish the module", rows));
  }
}

/* ---------------- player ---------------- */

const audio = $("#audio");
const recAudio = $("#rec-audio");

function loadTape(url, title, sub, rowEl) {
  document.querySelectorAll(".tape-row.playing").forEach((el) => el.classList.remove("playing"));
  rowEl?.classList.add("playing");

  clearLoop();
  state.currentTape = { url, title, sub };
  audio.src = url;
  audio.playbackRate = parseFloat($("#speed").value);
  audio.play().catch(() => {});
  $("#player").classList.remove("hidden");
  $("#player-title").textContent = title;
  $("#player-sub").textContent = sub || "";
}

function fmtTime(s) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

audio.addEventListener("loadedmetadata", () => {
  $("#time-dur").textContent = fmtTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  if (!state.comparing && state.loopB != null && audio.currentTime >= state.loopB) {
    audio.currentTime = state.loopA ?? 0;
  }
  if (state.comparing && state.loopB != null && audio.currentTime >= state.loopB) {
    audio.pause();
    state.comparing = false;
    recAudio.currentTime = 0;
    recAudio.play().catch(() => {});
  }
  $("#time-cur").textContent = fmtTime(audio.currentTime);
  if (audio.duration) {
    $("#seek").value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
  updatePlayButton();
});

audio.addEventListener("play", updatePlayButton);
audio.addEventListener("pause", updatePlayButton);
audio.addEventListener("ended", () => {
  updatePlayButton();
});

function updatePlayButton() {
  $("#btn-play").textContent = audio.paused ? "▶" : "⏸";
}

$("#btn-play").addEventListener("click", togglePlay);
function togglePlay() {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

$("#btn-back").addEventListener("click", () => skip(-5));
$("#btn-fwd").addEventListener("click", () => skip(5));
function skip(ds) {
  if (!audio.src) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + ds));
}

$("#seek").addEventListener("input", () => {
  if (audio.duration) audio.currentTime = ($("#seek").value / 1000) * audio.duration;
});

$("#speed").addEventListener("change", () => {
  audio.playbackRate = parseFloat($("#speed").value);
});

/* -------- A-B loop -------- */

function setLoopA() {
  state.loopA = audio.currentTime;
  state.loopB = null;
  $("#btn-loop-a").classList.add("set");
  $("#btn-loop-b").disabled = false;
  $("#btn-loop-b").classList.remove("set");
  $("#btn-loop-clear").disabled = false;
  positionMarker("#loop-marker-a", state.loopA);
  $("#loop-marker-b").classList.add("hidden");
  updateCompareEnabled();
}

function setLoopB() {
  if (state.loopA == null || audio.currentTime <= state.loopA) return;
  state.loopB = audio.currentTime;
  $("#btn-loop-b").classList.add("set");
  positionMarker("#loop-marker-b", state.loopB);
  updateCompareEnabled();
}

function clearLoop() {
  state.loopA = null;
  state.loopB = null;
  $("#btn-loop-a").classList.remove("set");
  $("#btn-loop-b").classList.remove("set");
  $("#btn-loop-b").disabled = true;
  $("#btn-loop-clear").disabled = true;
  $("#loop-marker-a").classList.add("hidden");
  $("#loop-marker-b").classList.add("hidden");
  updateCompareEnabled();
}

function positionMarker(sel, time) {
  if (!audio.duration) return;
  const el = $(sel);
  el.classList.remove("hidden");
  el.style.left = `${(time / audio.duration) * 100}%`;
}

$("#btn-loop-a").addEventListener("click", setLoopA);
$("#btn-loop-b").addEventListener("click", setLoopB);
$("#btn-loop-clear").addEventListener("click", clearLoop);

// L key: progressive — no A → set A; A but no B → set B; both → clear
function loopKey() {
  if (state.loopA == null) setLoopA();
  else if (state.loopB == null) setLoopB();
  else clearLoop();
}

/* -------- recording -------- */

async function toggleRecord() {
  if (state.recorder && state.recorder.state === "recording") {
    state.recorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recChunks = [];
    const rec = new MediaRecorder(stream);
    state.recorder = rec;
    rec.ondataavailable = (e) => state.recChunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (state.recUrl) URL.revokeObjectURL(state.recUrl);
      const blob = new Blob(state.recChunks, { type: rec.mimeType || "audio/webm" });
      state.recUrl = URL.createObjectURL(blob);
      recAudio.src = state.recUrl;
      $("#btn-rec").classList.remove("recording");
      $("#btn-rec").textContent = "● Rec";
      $("#btn-rec-play").disabled = false;
      updateCompareEnabled();
    };
    rec.start();
    audio.pause();
    $("#btn-rec").classList.add("recording");
    $("#btn-rec").textContent = "■ Stop";
  } catch (err) {
    alertOnce("Microphone access is needed to record. " + err.message);
  }
}

let alerted = false;
function alertOnce(msg) {
  if (alerted) return;
  alerted = true;
  console.warn(msg);
  $("#player-sub").textContent = "⚠ " + msg;
}

function playRecording() {
  if (!state.recUrl) return;
  audio.pause();
  recAudio.currentTime = 0;
  recAudio.play().catch(() => {});
}

function updateCompareEnabled() {
  $("#btn-compare").disabled = !(state.recUrl && state.loopA != null && state.loopB != null);
}

// Play the looped tape section once, then your recording right after.
function compare() {
  if (state.loopA == null || state.loopB == null || !state.recUrl) return;
  state.comparing = true;
  recAudio.pause();
  audio.currentTime = state.loopA;
  audio.play().catch(() => {});
}

$("#btn-rec").addEventListener("click", toggleRecord);
$("#btn-rec-play").addEventListener("click", playRecording);
$("#btn-compare").addEventListener("click", compare);

/* -------- keyboard shortcuts -------- */

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea")) return;
  switch (e.key) {
    case " ":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowLeft":
      e.preventDefault();
      skip(-5);
      break;
    case "ArrowRight":
      e.preventDefault();
      skip(5);
      break;
    case "l":
    case "L":
      loopKey();
      break;
    case "k":
    case "K":
      clearLoop();
      break;
    case "r":
    case "R":
      toggleRecord();
      break;
    case "e":
    case "E":
      playRecording();
      break;
  }
});

/* ---------------- boot ---------------- */

async function boot() {
  const res = await fetch("data/catalog.json");
  state.catalog = await res.json();
  const hash = location.hash.slice(1);
  show(hash || "home");
  window.addEventListener("hashchange", () => show(location.hash.slice(1) || "home"));
}

boot().catch((e) => {
  $("#content").innerHTML = `<div class="section-note">Failed to load catalog: ${e.message}.
    Serve this directory over HTTP (e.g. <code>python3 -m http.server</code>) — opening index.html
    directly from the filesystem won't work.</div>`;
});
