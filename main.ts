// GTA 6 trophy guide — the hand-in program (Node 22+, standard library only).
//
// What this entry is: a plain static site in app/ (index.html, app.js,
// style.css, data/trophies.json) that a browser opens at app/index.html.
// No build step, no network: the page loads nothing from outside itself,
// and the trophy list is the JSON file beside it. The site is a checklist
// tracker for all 55 GTA 6 trophies — dusk-violet design, a six-stage
// roadmap to the platinum, kind and grade filters, search, a spoiler-safe
// mode that hides unearned story trophy names, a detail view with a guide
// and cited sources for every trophy, export/import of progress, a copy
// of what is left to earn, and a sort control. The one trophy that can be
// missed in Chapter 1 (Positive Mental Attitude) is flagged wherever it
// appears, and the six trophies whose methods are still unconfirmed at
// launch say so plainly instead of guessing.
//
// What this file does: it checks the trophy data before anything ships,
// then copies app/ and screenshots/ beside this file into the output
// directory and writes dossier.json there with the vendored make.fun
// library. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The checks are the whole point of this file. The list was re-derived
// from PowerPyx (primary), Push Square and SixShore at launch, and the
// program refuses to hand in a list that does not match what those
// sources agree on: 55 trophies, 1 platinum / 2 gold / 6 silver /
// 46 bronze, 28 hidden, no online trophies, exactly one missable
// (Positive Mental Attitude, id 28), and the six unconfirmed methods
// (ids 44, 45, 47, 49, 50, 51). Every trophy needs a non-blank guide in
// our own words and at least one cited source with a real URL, and the
// ids must run 1–55 in Push Square order with unique names. Two search
// promises the tracker makes to its own tests are guarded too: the word
// "meditat" may only match A Long Road and Positive Mental Attitude,
// and "paradise" may only match the two Paradise trophies.
//
// Leave vendor/makefun-frontend.ts as it is: the scorer requires
// dossier.json to be byte for byte what its own copy writes.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  throw new Error('trophies.json validation failed: ' + message);
}

function checkSearch(text, query, expectedIds, label) {
  const found = [];
  for (const t of text) {
    const hay = (t.name + ' ' + t.description + ' ' + t.guide).toLowerCase();
    if (hay.includes(query)) found.push(t.id);
  }
  const want = expectedIds.join(',');
  const got = found.join(',');
  if (got !== want) fail(label + ' search "' + query + '" matches ids [' + got + '], expected [' + want + ']');
}

// ---- Validate the trophy list before it ships. ----
const raw = readFileSync(join(here, 'app', 'data', 'trophies.json'), 'utf-8');
let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  fail('not valid JSON (' + err.message + ')');
}
const trophies = data.trophies;
if (!Array.isArray(trophies)) fail('top-level "trophies" is not an array');
if (trophies.length !== 55) fail('expected 55 trophies, found ' + trophies.length);

const GRADES = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
const KINDS = new Set(['platinum', 'story', 'side', 'activities', 'collectibles', 'crime', 'misc', 'completion']);
let hidden = 0;
const missable = [];
const unconfirmed = [];
const names = new Set();
for (let i = 0; i < trophies.length; i++) {
  const t = trophies[i];
  const where = 'trophy at index ' + i;
  if (t.id !== i + 1) fail(where + ' has id ' + t.id + ', expected ' + (i + 1) + ' (Push Square order)');
  if (typeof t.name !== 'string' || !t.name.trim()) fail(where + ' has no name');
  if (names.has(t.name)) fail('duplicate trophy name "' + t.name + '"');
  names.add(t.name);
  if (typeof t.description !== 'string' || !t.description.trim()) fail('"' + t.name + '" has no description');
  if (typeof t.guide !== 'string' || t.guide.trim().length < 20) fail('"' + t.name + '" has no usable guide');
  if (!Array.isArray(t.sources) || t.sources.length < 1) fail('"' + t.name + '" cites no source');
  for (const s of t.sources) {
    if (!s || typeof s.name !== 'string' || !s.name.trim()) fail('"' + t.name + '" has a source with no name');
    if (typeof s.url !== 'string' || !/^https:\/\//.test(s.url)) fail('"' + t.name + '" has a source with no https URL');
  }
  if (!(t.grade in GRADES)) fail('"' + t.name + '" has unknown grade "' + t.grade + '"');
  GRADES[t.grade]++;
  if (!KINDS.has(t.kind)) fail('"' + t.name + '" has unknown kind "' + t.kind + '"');
  if (typeof t.stage !== 'number' || t.stage < 1 || t.stage > 6) fail('"' + t.name + '" has stage ' + t.stage);
  if (t.hidden) hidden++;
  if (t.missable) missable.push(t.id);
  if (t.unconfirmed) unconfirmed.push(t.id);
}
if (GRADES.platinum !== 1 || GRADES.gold !== 2 || GRADES.silver !== 6 || GRADES.bronze !== 46) {
  fail('grade counts are ' + JSON.stringify(GRADES) + ', expected 1 platinum / 2 gold / 6 silver / 46 bronze');
}
if (hidden !== 28) fail('hidden count is ' + hidden + ', expected 28');
if (missable.length !== 1 || missable[0] !== 28) {
  fail('missable trophies are [' + missable.join(',') + '], expected only id 28 (Positive Mental Attitude)');
}
if (unconfirmed.join(',') !== '44,45,47,49,50,51') {
  fail('unconfirmed trophies are [' + unconfirmed.join(',') + '], expected [44,45,47,49,50,51]');
}
checkSearch(trophies, 'meditat', [14, 28], 'guide');
checkSearch(trophies, 'paradise', [2, 3], 'guide');
console.log(
  'trophies.json OK: 55 trophies, grades ' + JSON.stringify(GRADES) +
  ', hidden ' + hidden + ', missable [' + missable.join(',') + '], unconfirmed [' + unconfirmed.join(',') + ']',
);

// ---- Hand the entry in. ----
mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files and directories in app/ or
// 48 MiB of app files: app/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 50331648 }),
);
console.log('wrote ' + join(out, 'dossier.json'));
