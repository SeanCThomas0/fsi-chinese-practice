/* Tone-pair drills: listen-and-identify quiz + browse mode.
 * Audio comes from the browser's Mandarin TTS voice (speechSynthesis) so it
 * works offline with no external services.
 */

const TONE_LABELS = { 1: "1 ˉ", 2: "2 ˊ", 3: "3 ˇ", 4: "4 ˋ", 0: "0 ·" };
const TONE_NAMES = { 1: "high flat", 2: "rising", 3: "dipping", 4: "falling", 0: "neutral" };

const toneState = {
  data: null,
  mode: "quiz",
  current: null, // { word, tones }
  picked: [null, null],
  answered: false,
};

const STATS_KEY = "fsi-zh-tone-stats";
let toneStats = {};
try { toneStats = JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch { toneStats = {}; }

function statKey(t) { return `${t[0]}-${t[1]}`; }
function recordAnswer(tones, correct) {
  const k = statKey(tones);
  toneStats[k] ??= { n: 0, ok: 0 };
  toneStats[k].n++;
  if (correct) toneStats[k].ok++;
  localStorage.setItem(STATS_KEY, JSON.stringify(toneStats));
}

/* ---------- TTS ---------- */

let zhVoice = null;
function findZhVoice() {
  const voices = speechSynthesis.getVoices();
  zhVoice =
    voices.find((v) => /^zh([-_]CN)?$/i.test(v.lang)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("zh")) ||
    null;
}
if ("speechSynthesis" in window) {
  findZhVoice();
  speechSynthesis.onvoiceschanged = findZhVoice;
}

function speakZh(text, rate = 0.85) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  if (zhVoice) u.voice = zhVoice;
  u.rate = rate;
  speechSynthesis.speak(u);
}

/* ---------- views ---------- */

async function loadToneData() {
  if (toneState.data) return toneState.data;
  const res = await fetch("data/tone-pairs.json");
  toneState.data = await res.json();
  return toneState.data;
}

function renderTones() {
  const content = document.querySelector("#content");
  content.innerHTML = `<div class="module-header"><h2>Tone-Pair Drills</h2>
    <div class="module-meta">All 20 two-syllable tone combinations, HSK-1/2 vocabulary</div></div>
    <div id="tone-body">Loading…</div>`;

  loadToneData().then(() => {
    const body = document.querySelector("#tone-body");
    body.innerHTML = `
      <div class="tone-toolbar">
        <button id="tone-mode-quiz" class="mode-btn">Quiz</button>
        <button id="tone-mode-browse" class="mode-btn">Browse</button>
        <button id="tone-mode-stats" class="mode-btn">Stats</button>
      </div>
      ${!("speechSynthesis" in window) ? `<div class="section-note">⚠ Your browser has no speech synthesis — tone audio won't play.</div>` : ""}
      <div id="tone-panel"></div>`;
    document.querySelector("#tone-mode-quiz").addEventListener("click", () => setToneMode("quiz"));
    document.querySelector("#tone-mode-browse").addEventListener("click", () => setToneMode("browse"));
    document.querySelector("#tone-mode-stats").addEventListener("click", () => setToneMode("stats"));
    setToneMode(toneState.mode);
  });
}

function setToneMode(mode) {
  toneState.mode = mode;
  document.querySelectorAll(".tone-toolbar .mode-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`#tone-mode-${mode}`)?.classList.add("active");
  if (mode === "quiz") renderToneQuiz();
  else if (mode === "browse") renderToneBrowse();
  else renderToneStats();
}

/* ---------- quiz ---------- */

function pickQuizWord() {
  const pairs = toneState.data.pairs;
  // Weight toward combos with worse accuracy
  const weighted = pairs.map((p) => {
    const s = toneStats[statKey(p.tones)];
    const acc = s && s.n >= 3 ? s.ok / s.n : 0.5;
    return { p, w: 1.5 - acc };
  });
  const totalW = weighted.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * totalW;
  let chosen = weighted[0].p;
  for (const { p, w } of weighted) {
    r -= w;
    if (r <= 0) { chosen = p; break; }
  }
  const word = chosen.words[Math.floor(Math.random() * chosen.words.length)];
  return { word, tones: chosen.tones };
}

function renderToneQuiz() {
  toneState.current = pickQuizWord();
  toneState.picked = [null, null];
  toneState.answered = false;

  const panel = document.querySelector("#tone-panel");
  panel.innerHTML = `
    <div class="quiz-card">
      <p class="quiz-instructions">Listen, then identify the tone of each syllable.</p>
      <button id="quiz-play" class="big-play">🔊 Play</button>
      <div class="tone-pick">
        <div class="tone-pick-row" data-slot="0">
          <span class="tone-pick-label">1st syllable</span>
          ${[1, 2, 3, 4].map((t) => `<button class="tone-btn" data-slot="0" data-tone="${t}">${TONE_LABELS[t]}</button>`).join("")}
        </div>
        <div class="tone-pick-row" data-slot="1">
          <span class="tone-pick-label">2nd syllable</span>
          ${[1, 2, 3, 4, 0].map((t) => `<button class="tone-btn" data-slot="1" data-tone="${t}">${TONE_LABELS[t]}</button>`).join("")}
        </div>
      </div>
      <div id="quiz-result"></div>
    </div>`;

  const play = () => speakZh(toneState.current.word.hanzi);
  document.querySelector("#quiz-play").addEventListener("click", play);
  play();

  panel.querySelectorAll(".tone-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (toneState.answered) return;
      const slot = +btn.dataset.slot;
      toneState.picked[slot] = +btn.dataset.tone;
      panel
        .querySelectorAll(`.tone-btn[data-slot="${slot}"]`)
        .forEach((b) => b.classList.toggle("picked", b === btn));
      if (toneState.picked[0] != null && toneState.picked[1] != null) gradeQuiz();
    });
  });
}

function gradeQuiz() {
  toneState.answered = true;
  const { word, tones } = toneState.current;
  const correct = toneState.picked[0] === tones[0] && toneState.picked[1] === tones[1];
  recordAnswer(tones, correct);

  // color the answer buttons
  document.querySelectorAll(".tone-btn").forEach((b) => {
    const slot = +b.dataset.slot;
    const t = +b.dataset.tone;
    if (t === tones[slot]) b.classList.add("correct");
    else if (toneState.picked[slot] === t) b.classList.add("wrong");
  });

  const sandhi =
    tones[0] === 3 && tones[1] === 3
      ? `<p class="sandhi-note">Tone sandhi: 3-3 is pronounced <strong>2-3</strong> — that's why it sounds like a rise first.</p>`
      : "";

  document.querySelector("#quiz-result").innerHTML = `
    <div class="quiz-reveal ${correct ? "yes" : "no"}">
      <div class="reveal-hanzi">${word.hanzi}</div>
      <div class="reveal-pinyin">${word.pinyin} — ${word.gloss}</div>
      <div class="reveal-verdict">${correct ? "✓ Correct!" : `✗ It was ${tones[0]}-${tones[1]} (${TONE_NAMES[tones[0]]} + ${TONE_NAMES[tones[1]]})`}</div>
      ${sandhi}
      <div class="reveal-actions">
        <button id="quiz-replay">🔊 Hear again</button>
        <button id="quiz-next" class="primary">Next →</button>
      </div>
    </div>`;
  document.querySelector("#quiz-replay").addEventListener("click", () => speakZh(word.hanzi, 0.7));
  document.querySelector("#quiz-next").addEventListener("click", renderToneQuiz);
}

/* ---------- browse ---------- */

function renderToneBrowse() {
  const panel = document.querySelector("#tone-panel");
  panel.innerHTML = `<p class="quiz-instructions">Tap any word to hear it. Repeat out loud, exaggerating the tones.</p>
    <div class="tone-browse"></div>`;
  const wrap = panel.querySelector(".tone-browse");
  for (const pair of toneState.data.pairs) {
    const card = document.createElement("div");
    card.className = "tone-combo-card";
    card.innerHTML = `<div class="combo-title">${pair.tones[0]}-${pair.tones[1]}
      <span class="combo-sub">${TONE_NAMES[pair.tones[0]]} + ${TONE_NAMES[pair.tones[1]]}</span></div>`;
    for (const w of pair.words) {
      const b = document.createElement("button");
      b.className = "tone-word";
      b.innerHTML = `<span class="tw-hanzi">${w.hanzi}</span><span class="tw-pinyin">${w.pinyin}</span><span class="tw-gloss">${w.gloss}</span>`;
      b.addEventListener("click", () => speakZh(w.hanzi));
      card.appendChild(b);
    }
    wrap.appendChild(card);
  }
}

/* ---------- stats ---------- */

function renderToneStats() {
  const panel = document.querySelector("#tone-panel");
  const rows = [1, 2, 3, 4];
  const cols = [1, 2, 3, 4, 0];
  let html = `<p class="quiz-instructions">Quiz accuracy by tone combination (first syllable × second syllable).</p>
    <table class="tone-stats-table"><tr><th></th>${cols.map((c) => `<th>${c === 0 ? "neutral" : "tone " + c}</th>`).join("")}</tr>`;
  for (const r of rows) {
    html += `<tr><th>tone ${r}</th>`;
    for (const c of cols) {
      const s = toneStats[`${r}-${c}`];
      if (!s || !s.n) html += `<td class="cell-empty">—</td>`;
      else {
        const pct = Math.round((s.ok / s.n) * 100);
        const cls = pct >= 80 ? "cell-good" : pct >= 50 ? "cell-mid" : "cell-bad";
        html += `<td class="${cls}">${pct}%<span class="cell-n">${s.n}×</span></td>`;
      }
    }
    html += `</tr>`;
  }
  html += `</table>
    <button id="tone-stats-reset" class="mode-btn">Reset stats</button>`;
  panel.innerHTML = html;
  document.querySelector("#tone-stats-reset").addEventListener("click", () => {
    toneStats = {};
    localStorage.removeItem(STATS_KEY);
    renderToneStats();
  });
}
