// Every JavaScript file of the site (dist/), the database (db/), the scripts and the preview server parses
// (node --check, user request 2026-11-26). The other checks only load the modules they import, so a page module
// none of them imports (dist/ui/views/demolition.js on 2026-11-26) could break the live site and still pass.
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') out.push(...await walk(path)); }
    else if (/\.(?:js|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}
const files = [...(await Promise.all(['dist', 'db', 'scripts'].map(dir => walk(join(root, dir))))).flat(), join(root, 'server.mjs')];

const check = file => new Promise(resolve => execFile(process.execPath, ['--check', file], (error, _stdout, stderr) =>
  resolve(error ? `${relative(root, file)}\n${stderr.trim()}` : null)));
// A few at a time: one node process per file.
const failures = [];
for (let i = 0; i < files.length; i += 16) failures.push(...(await Promise.all(files.slice(i, i + 16).map(check))).filter(Boolean));
if (failures.length) throw new Error(`${failures.length} file(s) do not parse:\n\n${failures.join('\n\n')}`);
console.log(`PASS syntax: ${files.length} files parse (dist, db, scripts, server.mjs).`);
