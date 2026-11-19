// Vice City Trophy Guide — gta6-trophy-guide-01 entry (Node 22, standard library only).
// The guide itself is this directory's app/ folder: plain static files a browser opens at
// app/index.html (ES module, CSS, no build step, offline — nothing loads over the network),
// with the trophy list and every guide in app/data/trophies.json. The program hands it in:
// it copies app/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads (your screenshots, the first load's
// files and bytes, and your source), with the vendored make.fun library. Leave
// vendor/makefun-frontend.ts as it is: the scorer requires dossier.json to be byte for byte
// what its own copy writes.
//
// Before copying, this entrypoint checks the guide data itself: trophies.json must parse,
// hold exactly the 55 official trophies, and every one must carry a non-blank guide of its
// own — a guide with a missing entry is a guide that should not be handed in. If the check
// fails the program exits non-zero and copies nothing.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Validate the guide data before anything is copied: exactly 55 trophies, every one
// with a non-blank guide and at least one cited source.
const trophiesPath = join(here, 'app', 'data', 'trophies.json');
const doc = JSON.parse(readFileSync(trophiesPath, 'utf8'));
if (!Array.isArray(doc.trophies) || doc.trophies.length !== 55) {
  throw new Error(`trophies.json must hold exactly 55 trophies, found ${doc.trophies?.length ?? 0}`);
}
for (const t of doc.trophies) {
  if (typeof t.guide !== 'string' || !t.guide.trim()) {
    throw new Error(`trophy ${t.id} (${t.name}) has no guide text`);
  }
  if (!Array.isArray(t.sources) || t.sources.length === 0) {
    throw new Error(`trophy ${t.id} (${t.name}) cites no source`);
  }
}

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
