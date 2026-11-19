// gta6-trophy-guide-01 — build entrypoint.
//
// What this program ships: the static guide in app/ (the tracker page plus the
// 55-trophy dataset) and the four screenshots in screenshots/. It assembles them
// into the output directory the grader reads — /output by default, or whatever
// MAKEFUN_OUTPUT_DIR points at — and writes dossier.json there with the vendored
// make.fun library, which is the summary the scorer reads. vendor/ is left
// alone: the scorer only accepts a dossier.json byte-identical to what its own
// copy of that library produces.
//
// Before it copies anything it audits the dataset, because a guide that ships
// with a broken trophy list is worse than no guide at all. The audit checks
// the shape of trophies.json (55 trophies, ids 1-55 with no gaps or duplicates),
// the content of every trophy (a real name and description, a guide of at
// least 15 words, at least one cited source with a usable URL), the overall
// composition (the per-kind and per-grade counts the guide advertises, the
// per-stage counts the roadmap is built on, exactly one missable trophy), and
// the screenshot set (exactly four JPEGs, each under the 256 KiB cap). Any
// failure stops the build before a single file is copied.
//
// Run it locally with:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the result with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const EXPECTED_TOTAL = 55;
const MIN_GUIDE_WORDS = 15;
const EXPECTED_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 262144;

// The composition the guide advertises on its dashboard and roadmap. If the
// data ever drifts from these numbers the page would be lying, so the build
// refuses to ship it.
const EXPECTED_KINDS = { platinum: 1, story: 12, side: 6, activities: 12, collectibles: 6, crime: 9, misc: 8, completion: 1 };
const EXPECTED_GRADES = { platinum: 1, gold: 2, silver: 6, bronze: 46 };
const EXPECTED_STAGES = { 1: 12, 2: 8, 3: 17, 4: 9, 5: 8, 6: 1 };

function fail(message) {
  throw new Error('trophy guide audit failed: ' + message);
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function tally(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function expectCounts(label, actual, expected) {
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key] ?? 0;
    if (got !== want) fail(`${label} "${key}" should be ${want}, found ${got}`);
  }
  for (const key of Object.keys(actual)) {
    if (!(key in expected)) fail(`${label} has unexpected value "${key}"`);
  }
}

function auditTrophies(trophies) {
  if (!Array.isArray(trophies)) fail('trophies.json must hold a "trophies" array');
  if (trophies.length !== EXPECTED_TOTAL) {
    fail(`expected ${EXPECTED_TOTAL} trophies, found ${trophies.length}`);
  }

  // Ids must be exactly 1..55, each once — no gaps, no duplicates.
  const seenIds = new Set();
  for (const t of trophies) {
    if (!Number.isInteger(t.id) || t.id < 1 || t.id > EXPECTED_TOTAL) {
      fail(`trophy has an out-of-range id: ${JSON.stringify(t.id)}`);
    }
    if (seenIds.has(t.id)) fail(`duplicate trophy id ${t.id}`);
    seenIds.add(t.id);
  }
  if (seenIds.size !== EXPECTED_TOTAL) fail(`trophy ids do not cover 1-${EXPECTED_TOTAL}`);

  for (const t of trophies) {
    const label = `trophy ${t.id} (${t.name ?? 'unnamed'})`;
    if (typeof t.name !== 'string' || !t.name.trim()) fail(`${label} has no name`);
    if (typeof t.description !== 'string' || !t.description.trim()) {
      fail(`${label} has no official description`);
    }
    if (typeof t.guide !== 'string' || countWords(t.guide) < MIN_GUIDE_WORDS) {
      fail(`${label} guide is under ${MIN_GUIDE_WORDS} words (${countWords(t.guide ?? '')} found)`);
    }
    if (!Array.isArray(t.sources) || t.sources.length === 0) {
      fail(`${label} cites no source`);
    }
    for (const s of t.sources) {
      if (typeof s?.name !== 'string' || !s.name.trim()) fail(`${label} has a source with no name`);
      if (typeof s?.url !== 'string' || !/^https?:\/\//.test(s.url)) {
        fail(`${label} has a source with no usable URL`);
      }
    }
    if (!(t.grade in EXPECTED_GRADES)) fail(`${label} has unknown grade "${t.grade}"`);
    if (!(t.kind in EXPECTED_KINDS)) fail(`${label} has unknown kind "${t.kind}"`);
    if (!Number.isInteger(t.stage) || !(t.stage in EXPECTED_STAGES)) {
      fail(`${label} has unknown roadmap stage "${t.stage}"`);
    }
    if (typeof t.missable !== 'boolean') fail(`${label} "missable" is not a boolean`);
  }

  expectCounts('kind', tally(trophies, (t) => t.kind), EXPECTED_KINDS);
  expectCounts('grade', tally(trophies, (t) => t.grade), EXPECTED_GRADES);
  expectCounts('roadmap stage', tally(trophies, (t) => t.stage), EXPECTED_STAGES);

  const missable = trophies.filter((t) => t.missable);
  if (missable.length !== 1) {
    fail(`expected exactly 1 missable trophy, found ${missable.length}`);
  }
}

function auditScreenshots(dir) {
  if (!existsSync(dir)) fail('screenshots/ directory is missing');
  const files = readdirSync(dir);
  if (files.length !== EXPECTED_SCREENSHOTS) {
    fail(`expected exactly ${EXPECTED_SCREENSHOTS} screenshots, found ${files.length}: ${files.join(', ')}`);
  }
  for (const name of files) {
    const path = join(dir, name);
    if (!name.toLowerCase().endsWith('.jpg')) fail(`screenshot "${name}" is not a JPEG`);
    const size = statSync(path).size;
    if (size === 0) fail(`screenshot "${name}" is empty`);
    if (size > MAX_SCREENSHOT_BYTES) {
      fail(`screenshot "${name}" is ${size} bytes, over the ${MAX_SCREENSHOT_BYTES} byte cap`);
    }
  }
}

// --- Audit first, copy nothing until it passes. ---

const doc = JSON.parse(readFileSync(join(repoRoot, 'app', 'data', 'trophies.json'), 'utf8'));
auditTrophies(doc.trophies);
auditScreenshots(join(repoRoot, 'screenshots'));

// --- Assemble a clean output directory. ---

mkdirSync(outputDir, { recursive: true });
rmSync(join(outputDir, 'app'), { recursive: true, force: true });
rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files and directories in app/
// or 48 MiB of app files: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 50331648 }),
);

console.log(`built ${outputDir}: 55 trophies audited, 4 screenshots, dossier.json written`);
