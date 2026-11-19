// gta6-trophy-guide-01 — build entrypoint.
//
// This script is the only way the entry ships: it audits app/data/trophies.json
// and the screenshots/ set, then assembles a clean output directory
// (MAKEFUN_OUTPUT_DIR, default /output) holding app/, screenshots/ and a
// dossier.json built with the vendored make.fun library. The audit runs first
// and refuses to copy anything when it fails, so a broken dataset or a
// screenshot over the size cap can never reach the grader.
//
// The audit covers the dataset's shape (exactly 55 trophies, ids 1-55, each
// once), the per-trophy content (a name and description, a guide in the
// 15-400 word band, at least one source with a working-looking URL, distinct
// source URLs, a unique name, a missable note exactly when the trophy is
// missable, and a known grade, kind and roadmap stage), the advertised
// composition (per-kind, per-grade and per-stage counts, exactly one missable
// trophy), and the screenshot set (exactly four JPEGs, none empty, none over
// 256 KiB). vendor/ is never touched: the scorer only accepts a dossier.json
// byte-identical to what its own copy of that library produces.
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

// --- What the guide promises, so the audit can hold it to that. ---

const TOTAL_TROPHIES = 55;
const GUIDE_MIN_WORDS = 15;
const GUIDE_MAX_WORDS = 400;
const SCREENSHOT_COUNT = 4;
const SCREENSHOT_MAX_BYTES = 262144;

const KIND_TOTALS = { platinum: 1, story: 12, side: 6, activities: 12, collectibles: 6, crime: 9, misc: 8, completion: 1 };
const GRADE_TOTALS = { platinum: 1, gold: 2, silver: 6, bronze: 46 };
const STAGE_TOTALS = { 1: 12, 2: 8, 3: 17, 4: 9, 5: 8, 6: 1 };

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files and directories in app/
// or 48 MiB of app files: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
};

// --- Small helpers. ---

function abort(detail) {
  throw new Error('trophy guide audit failed: ' + detail);
}

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

function groupBy(items, pick) {
  const counts = {};
  for (const item of items) counts[pick(item)] = (counts[pick(item)] ?? 0) + 1;
  return counts;
}

function matchTallies(label, found, wanted) {
  for (const [key, expected] of Object.entries(wanted)) {
    const actual = found[key] ?? 0;
    if (actual !== expected) abort(`${label} "${key}" should be ${expected}, found ${actual}`);
  }
  for (const key of Object.keys(found)) {
    if (!(key in wanted)) abort(`${label} has an unexpected value "${key}"`);
  }
}

function hasNote(trophy) {
  return typeof trophy.missable_note === 'string' && trophy.missable_note.trim().length > 0;
}

// --- Dataset audit. ---

function checkTrophyShape(trophies) {
  if (!Array.isArray(trophies)) abort('trophies.json must hold a "trophies" array');
  if (trophies.length !== TOTAL_TROPHIES) {
    abort(`expected ${TOTAL_TROPHIES} trophies, found ${trophies.length}`);
  }

  // Ids must cover 1..55 exactly once: no gaps, no repeats.
  const ids = new Set();
  for (const t of trophies) {
    if (!Number.isInteger(t.id) || t.id < 1 || t.id > TOTAL_TROPHIES) {
      abort(`trophy has an out-of-range id: ${JSON.stringify(t.id)}`);
    }
    if (ids.has(t.id)) abort(`duplicate trophy id ${t.id}`);
    ids.add(t.id);
  }
  if (ids.size !== TOTAL_TROPHIES) abort(`trophy ids do not cover 1-${TOTAL_TROPHIES}`);

  // Two trophies must never share a name — the tracker keys cards by id, but
  // the reader navigates by name, and a repeated name would be a lie.
  const names = new Set();
  for (const t of trophies) {
    const key = typeof t.name === 'string' ? t.name.trim().toLowerCase() : '';
    if (key && names.has(key)) abort(`two trophies share the name "${t.name}"`);
    names.add(key);
  }
}

function checkTrophyContent(trophies) {
  for (const t of trophies) {
    const label = `trophy ${t.id} (${t.name ?? 'unnamed'})`;

    if (typeof t.name !== 'string' || !t.name.trim()) abort(`${label} has no name`);
    if (typeof t.description !== 'string' || !t.description.trim()) {
      abort(`${label} has no official description`);
    }

    // Guides are written in the author's own words: long enough to be useful,
    // short enough to stay a guide rather than a walkthrough chapter.
    const words = typeof t.guide === 'string' ? wordCount(t.guide) : 0;
    if (words < GUIDE_MIN_WORDS || words > GUIDE_MAX_WORDS) {
      abort(`${label} guide is ${words} words, outside the ${GUIDE_MIN_WORDS}-${GUIDE_MAX_WORDS} word band`);
    }

    if (!Array.isArray(t.sources) || t.sources.length === 0) abort(`${label} cites no source`);
    const urls = new Set();
    for (const s of t.sources) {
      if (typeof s?.name !== 'string' || !s.name.trim()) abort(`${label} has a source with no name`);
      if (!isHttpUrl(s?.url)) abort(`${label} has a source with no usable URL`);
      const url = s.url.trim();
      if (urls.has(url)) abort(`${label} cites the same source URL twice: ${url}`);
      urls.add(url);
    }

    if (!(t.grade in GRADE_TOTALS)) abort(`${label} has unknown grade "${t.grade}"`);
    if (!(t.kind in KIND_TOTALS)) abort(`${label} has unknown kind "${t.kind}"`);
    if (!Number.isInteger(t.stage) || !(t.stage in STAGE_TOTALS)) {
      abort(`${label} has unknown roadmap stage "${t.stage}"`);
    }
    if (typeof t.missable !== 'boolean') abort(`${label} "missable" is not a boolean`);

    // A missable note exists exactly when the trophy is missable: a note on a
    // safe trophy would cry wolf, a missing note on the one missable trophy
    // would leave the reader unprotected.
    if (t.missable && !hasNote(t)) abort(`${label} is missable but carries no missable note`);
    if (!t.missable && hasNote(t)) abort(`${label} is not missable but carries a missable note`);
  }
}

function checkTrophyComposition(trophies) {
  matchTallies('kind', groupBy(trophies, (t) => t.kind), KIND_TOTALS);
  matchTallies('grade', groupBy(trophies, (t) => t.grade), GRADE_TOTALS);
  matchTallies('roadmap stage', groupBy(trophies, (t) => t.stage), STAGE_TOTALS);

  const missable = trophies.filter((t) => t.missable);
  if (missable.length !== 1) {
    abort(`expected exactly 1 missable trophy, found ${missable.length}`);
  }
}

function checkScreenshots(dir) {
  if (!existsSync(dir)) abort('screenshots/ directory is missing');
  const files = readdirSync(dir);
  if (files.length !== SCREENSHOT_COUNT) {
    abort(`expected exactly ${SCREENSHOT_COUNT} screenshots, found ${files.length}: ${files.join(', ')}`);
  }
  for (const name of files) {
    const path = join(dir, name);
    if (!name.toLowerCase().endsWith('.jpg')) abort(`screenshot "${name}" is not a JPEG`);
    const size = statSync(path).size;
    if (size === 0) abort(`screenshot "${name}" is empty`);
    if (size > SCREENSHOT_MAX_BYTES) {
      abort(`screenshot "${name}" is ${size} bytes, over the ${SCREENSHOT_MAX_BYTES} byte cap`);
    }
  }
}

// --- Audit first, copy nothing until it passes. ---

const doc = JSON.parse(readFileSync(join(repoRoot, 'app', 'data', 'trophies.json'), 'utf8'));
checkTrophyShape(doc.trophies);
checkTrophyContent(doc.trophies);
checkTrophyComposition(doc.trophies);
checkScreenshots(join(repoRoot, 'screenshots'));

// --- Assemble a clean output directory. ---

mkdirSync(outputDir, { recursive: true });
rmSync(join(outputDir, 'app'), { recursive: true, force: true });
rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_OPTIONS));

console.log(`built ${outputDir}: ${TOTAL_TROPHIES} trophies audited, ${SCREENSHOT_COUNT} screenshots, dossier.json written`);
