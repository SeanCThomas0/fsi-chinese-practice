#!/usr/bin/env node
// Vendors hanzi-writer and downloads stroke data for every character in
// app/data/characters.json, so the writing mode works fully offline.
//
// Usage: node scripts/fetch-writing-assets.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";

const VENDOR_URL = "https://cdn.jsdelivr.net/npm/hanzi-writer@3.7/dist/hanzi-writer.min.js";
const DATA_URL = (ch) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(ch)}.json`;

const root = new URL("../app/", import.meta.url);

async function main() {
  await mkdir(new URL("vendor/", root), { recursive: true });
  await mkdir(new URL("data/strokes/", root), { recursive: true });

  console.log("Fetching hanzi-writer...");
  const lib = await fetch(VENDOR_URL);
  if (!lib.ok) throw new Error(`hanzi-writer fetch failed: ${lib.status}`);
  await writeFile(new URL("vendor/hanzi-writer.min.js", root), await lib.text());

  const groups = JSON.parse(await readFile(new URL("data/characters.json", root), "utf8"));
  const chars = [...new Set(groups.flatMap((g) => g.chars.map((c) => c.char)))];
  console.log(`Fetching stroke data for ${chars.length} characters...`);

  let ok = 0;
  const failed = [];
  // modest parallelism to be polite to the CDN
  const queue = [...chars];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const ch = queue.pop();
        try {
          const res = await fetch(DATA_URL(ch));
          if (!res.ok) throw new Error(String(res.status));
          await writeFile(new URL(`data/strokes/${ch}.json`, root), await res.text());
          ok++;
        } catch (e) {
          failed.push(`${ch} (${e.message})`);
        }
      }
    }),
  );

  console.log(`Done: ${ok} ok, ${failed.length} failed.`);
  if (failed.length) {
    console.error("Failed:", failed.join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
