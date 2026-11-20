#!/usr/bin/env node
// Orphan-ID check (06 rule 7, STYLE_GUIDE naming). Node only. Fails when:
// - code under src/ cites an F-xx id that has no row in FEATURES.md, or
// - a FEATURES.md row marked `building` or `LIVE` is cited nowhere in src/.
// Planned, deferred and dropped rows may have no code yet.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ID = /\bF-\d{2,3}\b/g;
const rows = new Map();
for (const line of readFileSync('FEATURES.md', 'utf8').split('\n')) {
  const m = /^\|\s*(F-\d{2,3})\s*\|(?:[^|]*\|){2}\s*([^|]*?)\s*\|/.exec(line);
  if (m) rows.set(m[1], m[2]);
}

const cited = new Map();
const cite = (p) => { for (const id of readFileSync(p, 'utf8').match(ID) ?? []) if (!cited.has(id)) cited.set(id, p); };
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|css)$/.test(name)) cite(p);
  }
};
walk('src');

const problems = [];
for (const [id, file] of cited) if (!rows.has(id)) problems.push(`${file}: cites ${id}, which has no row in FEATURES.md`);
for (const [id, status] of rows) if (/^(building|LIVE)/.test(status) && !cited.has(id)) problems.push(`FEATURES.md: ${id} is "${status}" but no code under src/ cites it`);

for (const p of problems) console.error(`feature-ids: ${p}`);
console.log(`feature-ids: ${String(rows.size)} rows, ${String(cited.size)} ids cited in src/, ${String(problems.length)} problem(s)`);
process.exit(problems.length ? 1 : 0);
