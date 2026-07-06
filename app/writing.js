/* Writing mode: stroke-order study and draw-to-grade quizzes for ~130 beginner
 * characters, powered by a vendored copy of hanzi-writer (MIT). Stroke data is
 * served from data/strokes/ so everything works offline.
 */

const WRITING_KEY = "fsi-zh-writing";
let writingProgress = {};
try { writingProgress = JSON.parse(localStorage.getItem(WRITING_KEY)) || {}; } catch { writingProgress = {}; }

const writingState = {
  groups: null,
  flat: [],       // flattened char list for prev/next
  index: 0,
  writer: null,
  mode: null,     // "demo" | "quiz"
};

function saveWriting() {
  localStorage.setItem(WRITING_KEY, JSON.stringify(writingProgress));
}

async function loadCharacters() {
  if (writingState.groups) return writingState.groups;
  const res = await fetch("data/characters.json");
  writingState.groups = await res.json();
  writingState.flat = writingState.groups.flatMap((g) => g.chars);
  return writingState.groups;
}

function charDataLoader(char, onComplete) {
  fetch(`data/strokes/${encodeURIComponent(char)}.json`)
    .then((r) => r.json())
    .then(onComplete)
    .catch((e) => console.warn("stroke data missing for", char, e));
}

/* ---------- grid view ---------- */

function renderWriting() {
  const content = document.querySelector("#content");
  content.innerHTML = `<div class="module-header"><h2>Writing 写字</h2>
    <div class="module-meta">Stroke order & handwriting practice — beginner characters from the early FSI modules</div></div>
    <div id="writing-body">Loading…</div>`;

  loadCharacters().then(() => {
    const body = document.querySelector("#writing-body");
    body.innerHTML = `<p class="quiz-instructions">Pick a character. Watch the stroke order, then draw it yourself —
      3 clean quiz passes marks it learned <span class="learned-star">★</span>.</p>`;
    for (const group of writingState.groups) {
      const learned = group.chars.filter((c) => (writingProgress[c.char] || 0) >= 3).length;
      const section = document.createElement("div");
      section.className = "char-group";
      section.innerHTML = `<h3 class="char-group-title">${group.group}
        <span class="char-group-count">${learned}/${group.chars.length} ★</span></h3>`;
      const grid = document.createElement("div");
      grid.className = "char-grid";
      for (const c of group.chars) {
        const tile = document.createElement("button");
        tile.className = "char-tile" + ((writingProgress[c.char] || 0) >= 3 ? " learned" : "");
        tile.innerHTML = `<span class="ct-char">${c.char}</span><span class="ct-pinyin">${c.pinyin}</span>`;
        tile.title = `${c.pinyin} — ${c.gloss}`;
        tile.addEventListener("click", () => openCharacter(writingState.flat.indexOf(c)));
        grid.appendChild(tile);
      }
      section.appendChild(grid);
      body.appendChild(section);
    }
  });
}

/* ---------- practice view ---------- */

function openCharacterByChar(char) {
  loadCharacters().then(() => {
    const i = writingState.flat.findIndex((c) => c.char === char);
    if (i >= 0) openCharacter(i);
    else renderWriting();
  });
}

function openCharacter(index) {
  writingState.index = (index + writingState.flat.length) % writingState.flat.length;
  const c = writingState.flat[writingState.index];
  history.replaceState(null, "", "#writing/" + encodeURIComponent(c.char));
  const content = document.querySelector("#content");

  content.innerHTML = `
    <div class="writing-practice">
      <div class="wp-top">
        <button id="wp-back" class="mode-btn">← All characters</button>
        <div class="wp-nav">
          <button id="wp-prev" class="mode-btn">‹ prev</button>
          <button id="wp-next" class="mode-btn">next ›</button>
        </div>
      </div>
      <div class="wp-info">
        <span class="wp-char-big">${c.char}</span>
        <div>
          <div class="wp-pinyin">${c.pinyin} <button id="wp-speak" title="Hear it">🔊</button></div>
          <div class="wp-gloss">${c.gloss}</div>
          <div class="wp-progress">${starRow(writingProgress[c.char] || 0)}</div>
        </div>
      </div>
      <div id="writer-box"></div>
      <div class="wp-actions">
        <button id="wp-demo" class="mode-btn">▶ Watch strokes</button>
        <button id="wp-quiz" class="mode-btn primary">✏️ Draw it</button>
      </div>
      <div id="wp-status" class="wp-status"></div>
    </div>`;

  document.querySelector("#wp-back").addEventListener("click", () => {
    history.replaceState(null, "", "#writing");
    renderWriting();
  });
  document.querySelector("#wp-prev").addEventListener("click", () => openCharacter(writingState.index - 1));
  document.querySelector("#wp-next").addEventListener("click", () => openCharacter(writingState.index + 1));
  document.querySelector("#wp-speak").addEventListener("click", () => speakZh(c.char));
  document.querySelector("#wp-demo").addEventListener("click", () => startDemo(c));
  document.querySelector("#wp-quiz").addEventListener("click", () => startQuiz(c));

  createWriter(c);
  startDemo(c);
}

function starRow(n) {
  const full = Math.min(n, 3);
  return `${"★".repeat(full)}${"☆".repeat(3 - full)} ${n >= 3 ? "learned" : `${full}/3 quiz passes`}`;
}

function createWriter(c) {
  const box = document.querySelector("#writer-box");
  box.innerHTML = "";
  const size = Math.min(320, box.clientWidth || 320);
  writingState.writer = HanziWriter.create(box, c.char, {
    width: size,
    height: size,
    padding: 12,
    showCharacter: false,
    showOutline: true,
    strokeColor: "#e6e8ef",
    outlineColor: "rgba(57, 64, 82, 0.6)",
    highlightColor: "#d9a441",
    drawingColor: "#e05a4e",
    drawingWidth: 10,
    charDataLoader,
  });
}

function startDemo(c) {
  writingState.mode = "demo";
  setStatus("Watch the stroke order, then hit ✏️ Draw it.");
  writingState.writer.cancelQuiz?.();
  writingState.writer.showOutline();
  writingState.writer.loopCharacterAnimation();
}

function startQuiz(c) {
  writingState.mode = "quiz";
  const attempts = { mistakes: 0 };
  setStatus("Draw the strokes in order. Three wrong tries on a stroke shows a hint.");
  writingState.writer.pauseAnimation?.();
  writingState.writer.hideCharacter();
  writingState.writer.quiz({
    showHintAfterMisses: 3,
    onMistake: () => attempts.mistakes++,
    onComplete: () => {
      const clean = attempts.mistakes <= 2;
      if (clean) {
        writingProgress[c.char] = (writingProgress[c.char] || 0) + 1;
        saveWriting();
        const n = writingProgress[c.char];
        setStatus(
          n >= 3
            ? `✓ Perfect — ${c.char} is marked learned ★. On to the next one!`
            : `✓ Nice, clean pass ${n}/3. Draw it again to lock it in.`,
        );
        document.querySelector(".wp-progress").innerHTML = starRow(n);
      } else {
        setStatus(`Done, but with ${attempts.mistakes} mistakes — watch the demo and try again.`);
      }
    },
  });
}

function setStatus(msg) {
  const el = document.querySelector("#wp-status");
  if (el) el.textContent = msg;
}
