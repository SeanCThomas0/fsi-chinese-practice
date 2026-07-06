#!/usr/bin/env node
// Crawls the FSI Standard Chinese directory listings on fsi-languages.yojik.eu
// and writes app/data/catalog.json describing every module, unit, tape, and PDF.
//
// Usage: node scripts/build-catalog.mjs

const BASE = "https://fsi-languages.yojik.eu/languages/FSI/Chinese/Standard%20Chinese/";

const MODULE_NAMES = {
  ORN: "Orientation",
  BIO: "Biographic Information",
  MON: "Money",
  DIR: "Directions",
  TRN: "Transportation",
  MTG: "Arranging a Meeting",
  SOC: "Society",
  TVL: "Travel",
  LIC: "Life in China",
  CAR: "Car",
  HTL: "Hotel",
  MBD: "Marriage, Birth & Death",
  WLF: "Personal Welfare",
  POT: "Post Office & Telephone",
  RST: "Restaurant",
};

const RESOURCE_SECTIONS = {
  "P&R": "Pronunciation & Romanization",
  NUM: "Numbers",
  CE: "Classroom Expressions",
  "T&D": "Time & Dates",
};

const TAPE_KINDS = {
  C: "Comprehension",
  P: "Production",
  D: "Drill",
};

async function listDir(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const html = await res.text();
  const hrefs = [...html.matchAll(/href="([^"?][^"]*)"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("/") && !h.startsWith("?"));
  return hrefs.map((h) => h.replace(/&amp;/g, "&"));
}

function decodeName(href) {
  return decodeURIComponent(href.replace(/\/$/, ""));
}

function labelForTape(t) {
  if (t.kind) return `Tape ${t.tapeNo}${t.kind}-${t.part} · ${TAPE_KINDS[t.kind]}`;
  return `Tape ${t.part}`;
}

function parseTapeFile(name) {
  // "... - Unit 01 - Tape 1C-1.mp3"  (modules 1-6: C/P/D typed tapes)
  // "... - Unit 01 - Tape 1.mp3"     (modules 7-9: plain numbered tapes)
  const unitMatch = name.match(/Unit (\d+)/);
  if (!unitMatch) return null;
  const typed = name.match(/Tape (\d+)([CPD])-(\d+)/);
  if (typed) {
    return {
      unit: parseInt(unitMatch[1], 10),
      tapeNo: parseInt(typed[1], 10),
      kind: typed[2],
      kindLabel: TAPE_KINDS[typed[2]],
      part: parseInt(typed[3], 10),
    };
  }
  const plain = name.match(/Tape (\d+)\.mp3$/);
  if (plain) {
    return {
      unit: parseInt(unitMatch[1], 10),
      tapeNo: parseInt(plain[1], 10),
      kind: null,
      kindLabel: null,
      part: parseInt(plain[1], 10),
    };
  }
  return null;
}

function parseReviewFile(name) {
  // "... - Review Units 1-4.mp3"  or  "... - Review Units 1-4 - Tape 2.mp3"
  const m = name.match(/Review Units (\d+)-(\d+)(?: - Tape (\d+))?\.mp3$/);
  if (!m) return null;
  return {
    from: parseInt(m[1], 10),
    to: parseInt(m[2], 10),
    part: m[3] ? parseInt(m[3], 10) : 1,
  };
}

const KIND_ORDER = { C: 0, P: 1, D: 2 };

async function crawlModule(dirHref, baseUrl) {
  const dirName = decodeName(dirHref);
  const url = baseUrl + dirHref;
  const files = await listDir(url);

  const code =
    dirName.match(/\b(ORN|BIO|MON|DIR|TRN|MTG|SOC|TVL|LIC|CAR|HTL|MBD|WLF|POT|RST)\b/)?.[1] ?? null;
  const numMatch = dirName.match(/Module (\d+)/);

  const mod = {
    id: dirName.replace(/\s+/g, "-").toLowerCase(),
    dir: dirName,
    code,
    number: numMatch ? parseInt(numMatch[1], 10) : null,
    name: code ? (MODULE_NAMES[code] ?? dirName) : dirName,
    baseUrl: url,
    pdfs: [],
    criterionTest: null,
    units: {},
    reviews: [],
  };

  for (const f of files) {
    const name = decodeName(f);
    if (name.endsWith(".pdf")) {
      const label = /Workbook/i.test(name)
        ? "Student Workbook"
        : /Text/i.test(name)
          ? "Student Text"
          : name;
      mod.pdfs.push({ label, file: f });
      continue;
    }
    if (!name.endsWith(".mp3")) continue;
    if (/Criterion Test/i.test(name)) {
      mod.criterionTest = f;
      continue;
    }
    const review = parseReviewFile(name);
    if (review) {
      mod.reviews.push({
        file: f,
        label:
          `Review Units ${review.from}–${review.to}` +
          (name.includes(" - Tape ") ? ` · Tape ${review.part}` : ""),
        from: review.from,
        part: review.part,
      });
      continue;
    }
    const tape = parseTapeFile(name);
    if (!tape) {
      console.warn(`  unparsed mp3 in ${dirName}: ${name}`);
      continue;
    }
    const key = String(tape.unit);
    mod.units[key] ??= [];
    mod.units[key].push({
      file: f,
      kind: tape.kind,
      kindLabel: tape.kindLabel,
      part: tape.part,
      label: labelForTape(tape),
    });
  }

  for (const key of Object.keys(mod.units)) {
    mod.units[key].sort(
      (a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.part - b.part,
    );
  }
  mod.reviews.sort((a, b) => a.from - b.from || a.part - b.part);
  return mod;
}

async function crawlOptionalModules(baseUrl) {
  // Flat directory: "FSI - Standard Chinese - Optional Module CAR - Unit 01.mp3"
  const url = baseUrl + "Optional%20Modules/";
  const files = await listDir(url);
  const byCode = {};

  for (const f of files) {
    const name = decodeName(f);
    const codeMatch = name.match(/Optional\s*Module\s*([A-Z]{3})/);
    if (!codeMatch) {
      console.warn(`  unparsed optional file: ${name}`);
      continue;
    }
    const code = codeMatch[1];
    byCode[code] ??= {
      id: `optional-${code.toLowerCase()}`,
      dir: "Optional Modules",
      code,
      number: null,
      name: MODULE_NAMES[code] ?? code,
      baseUrl: url,
      pdfs: [],
      criterionTest: null,
      units: {},
      reviews: [],
    };
    const mod = byCode[code];
    if (name.endsWith(".pdf")) {
      mod.pdfs.push({ label: "Student Text", file: f });
      continue;
    }
    const unitMatch = name.match(/Unit (\d+)\.mp3$/);
    if (!unitMatch) {
      console.warn(`  unparsed optional mp3: ${name}`);
      continue;
    }
    const unit = parseInt(unitMatch[1], 10);
    mod.units[String(unit)] = [
      { file: f, kind: null, kindLabel: null, part: 1, label: `Unit ${unit} tape` },
    ];
  }

  return Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code));
}

async function crawlResourceModule(baseUrl) {
  const url = baseUrl + "Resource%20Module/";
  const files = await listDir(url);
  const sections = {};
  const pdfs = [];
  for (const f of files) {
    const name = decodeName(f);
    if (name.endsWith(".pdf")) {
      pdfs.push({ label: "Student Text", file: f });
      continue;
    }
    const m = name.match(/Resource Module - (P&R|NUM|CE|T&D) - Tape (\d+)\.mp3/);
    if (!m) {
      console.warn(`  unparsed resource file: ${name}`);
      continue;
    }
    const code = m[1];
    sections[code] ??= { code, name: RESOURCE_SECTIONS[code], tapes: [] };
    sections[code].tapes.push({ file: f, part: parseInt(m[2], 10), label: `Tape ${m[2]}` });
  }
  for (const s of Object.values(sections)) s.tapes.sort((a, b) => a.part - b.part);
  // Present in pedagogical order
  const order = ["P&R", "NUM", "CE", "T&D"];
  const ordered = order.filter((c) => sections[c]).map((c) => sections[c]);
  return { baseUrl: url, pdfs, sections: ordered };
}

async function main() {
  const top = await listDir(BASE);
  const catalog = {
    generatedAt: new Date().toISOString(),
    source: BASE,
    coursePdfs: top
      .filter((f) => f.endsWith(".pdf"))
      .map((f) => ({
        label: decodeName(f).includes("Structure") ? "Structure Notes" : "Resource Module Text",
        file: f,
      })),
    resource: null,
    core: [],
    optional: [],
  };

  console.log("Crawling Resource Module...");
  catalog.resource = await crawlResourceModule(BASE);

  const moduleDirs = top.filter((f) => f.startsWith("Module%20"));
  for (const d of moduleDirs) {
    console.log(`Crawling ${decodeName(d)}...`);
    catalog.core.push(await crawlModule(d, BASE));
  }
  catalog.core.sort((a, b) => a.number - b.number);

  console.log("Crawling Optional Modules...");
  catalog.optional = await crawlOptionalModules(BASE);

  const { writeFile } = await import("node:fs/promises");
  const out = new URL("../app/data/catalog.json", import.meta.url);
  await writeFile(out, JSON.stringify(catalog, null, 2));

  const tapeCount =
    catalog.resource.sections.reduce((n, s) => n + s.tapes.length, 0) +
    [...catalog.core, ...catalog.optional].reduce(
      (n, m) =>
        n +
        Object.values(m.units).flat().length +
        m.reviews.length +
        (m.criterionTest ? 1 : 0),
      0,
    );
  console.log(
    `\nWrote catalog: ${catalog.core.length} core modules, ${catalog.optional.length} optional modules, ${tapeCount} tapes.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
