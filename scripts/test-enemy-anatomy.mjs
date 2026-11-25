// Part info table (dist/data/enemy-anatomy.js): it is what build-enemy-anatomy.mjs makes from the wiki
// Anatomy snapshot, it has every wiki row once in the wiki's order, and every row the calculator uses
// shows the same numbers the calculation runs on (main pool, part health, armor, durability, explosive
// resistance, % to main, cap, constitution and its decay). Each photo shown is one of the row's current
// wiki images, and downloaded row photos exist with the hashes in scripts/anatomy-webp.json.
// A fresh wiki snapshot does not stop deploys here on its own: the fetch scripts rebuild enemy-anatomy.js,
// and rows still waiting for their image (the page shows "no photo") or an unreadable constitution cell
// (shown as the wiki text) are only 'to check'. Value checks fail only when the table and the calculation
// disagree, which scripts/test-anatomy.mjs (pinned to the reviewed wiki revisions) reports at the same time.
// The rendered table (Korean page) has one row per wiki row, no 'undefined'/'NaN' text, a Korean name on
// every row, and particles that agree with the quoted part name (‘몸통’과, ‘머리’를).
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { enemyAnatomy } from '../dist/data/enemy-anatomy.js';
import { anatomyRowImages } from '../dist/data/anatomy-row-images.js';
import { enemies } from '../dist/data/combat-data.js';
import { rowPhoto } from '../dist/core/anatomy.js';
import { buildEnemyAnatomy } from './build-enemy-anatomy.mjs';
import { partInfo } from '../dist/ui/views/enemy.js';

let checks = 0;
const ok = (value, message) => { assert(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const dist = new URL('../dist/', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(new URL('./anatomy-webp.json', import.meta.url), 'utf8'));

const built = await buildEnemyAnatomy();
eq(enemyAnatomy, built.enemies, 'enemy-anatomy.js is out of date: run node scripts/build-enemy-anatomy.mjs');

let linked = 0, withPhoto = 0, rowsTotal = 0;
const toCheck = [];
for (const enemy of enemies) {
  const table = enemyAnatomy[enemy.id];
  ok(table?.rows.length, `${enemy.id}: a part info table`);
  const rows = table.rows;
  rowsTotal += rows.length;
  eq(new Set(rows.map(row => row.name)).size, rows.length, `${enemy.id}: each wiki row once`);
  // The main pool row is the enemy's main health, armor, durability, resistance and constitution.
  const main = rows.filter(row => row.role === 'main');
  eq(main.length, 1, `${enemy.id}: one main row`);
  eq([main[0].hp, main[0].armor, main[0].durability, main[0].exdr], [enemy.main.hp, enemy.main.armor, enemy.main.durability, enemy.main.exdr], `${enemy.id}: main row matches the main pool`);
  eq(main[0].bleed?.hp ?? 0, enemy.main.constitution ?? 0, `${enemy.id}: main constitution`);
  if (enemy.main.bleedPerSecond != null) eq(main[0].bleed?.perSecond, enemy.main.bleedPerSecond, `${enemy.id}: main bleed rate`);
  // Every part the calculator uses (but the "both copies" duplicate) is one row with the same numbers.
  const layers = enemy.parts.flatMap(part => [[part, part, 'initial'], ...(part.next ? [[part, part.next, 'exposed']] : [])]);
  for (const [part, layer, stage] of layers.filter(([, layer]) => layer.sourcePart && !(layer.copies > 1))) {
    // Two layers can be one wiki row (a Charger's front and rear leg flesh): match by the wiki name.
    const row = rows.find(item => (item.count > 1 ? `${item.name} (${item.count})` : item.name) === layer.sourcePart.replace(/\s*\((\d+)\)$/, ' ($1)'));
    ok(row, `${enemy.id}/${layer.id}: has a row (${layer.sourcePart})`);
    const label = `${enemy.id}/${row.name}`;
    linked++;
    if (row.official) eq(row.official.hp, layer.hp, `${label}: official health is the calculated one`);
    else if (row.hpText === 'main' || row.hpText?.startsWith('main-')) ok(layer.mainOnly || layer.hp === (layer.main || part.main || enemy.main).hp, `${label}: shares the main pool`);
    else if (row.hp != null) eq(row.hp, layer.hp, `${label}: health`);
    else ok(layer.hp == null, `${label}: health left uncalculated`);
    for (const key of ['armor', 'durability', 'exdr']) if (row[key] != null) eq(row[key], layer[key], `${label}: ${key}`);
    if (row.toMain != null && !layer.partOnly) eq(row.toMain, layer.toMain, `${label}: % to main`);
    if (row.cap != null && row.toMain != null) eq(row.cap, layer.overflowCap, `${label}: cap`);
    if (row.bleedText) toCheck.push(`${label}: constitution "${row.bleedText}" shown as wiki text`);
    else if (row.bleed?.perSecond === 0) eq(row.bleed.hp, layer.staticConstitution, `${label}: extra health that never decays`);
    else eq(row.bleed?.hp ?? 0, layer.constitution ?? 0, `${label}: constitution`);
    const allowed = row.fatal === 'both' ? ['break'] : row.fatal === 'yes' ? ['kill', 'bleed', 'down'] : ['break', 'armor', ...(row.downs ? ['down'] : [])];
    ok(allowed.includes(layer.effect), `${label}: fatal ${row.fatal}${row.downs ? ' (downs)' : ''} vs ${layer.effect}`);
  }
  for (const row of rows) {
    if (row.role === 'pool') {
      const pool = enemy.parts.find(part => part.id === row.part)?.main;
      eq([row.hp, row.armor], [pool?.hp, pool?.armor], `${enemy.id}/${row.name}: own pool`);
    }
    if (row.merged) ok(enemy.parts.some(part => part.id === row.merged || part.next?.id === row.merged), `${enemy.id}/${row.name}: merged into a part`);
    const photo = rowPhoto(enemy.id, row);
    if (photo) { ok(row.images.includes(photo.title.replaceAll('_', ' ')), `${enemy.id}/${row.name}: photo is a wiki image of the row`); withPhoto++; }
    else if (row.images.length) toCheck.push(`${enemy.id}/${row.name}: wiki image not downloaded yet (node scripts/fetch-anatomy-row-photos.mjs)`);
  }
}
// Downloaded row photos: files exist and match the manifest; none left for a row that is gone.
for (const [enemyId, photos] of Object.entries(anatomyRowImages)) for (const [name, photo] of Object.entries(photos)) {
  if (!enemyAnatomy[enemyId]?.rows.some(row => row.name === name && row.images.includes(photo.title))) toCheck.push(`${enemyId}/${name}: row photo no longer used by the wiki table`);
  for (const src of [photo.src, photo.thumbnail]) {
    const path = new URL(src.replace(/^\.\//, ''), dist);
    ok(await access(path).then(() => true, () => false), `missing row photo ${src}`);
    eq(sha256(await readFile(path)), manifest[src]?.sha256, `${src}: WebP matches manifest`);
  }
}
// --- Rendered part info table --------------------------------------------------------------------
const hasFinal = word => { const code = word.trim().slice(-1).charCodeAt(0) - 0xac00; return code >= 0 && code < 11172 && code % 28 !== 0; };
const PAIRS = { 을: true, 를: false, 과: true, 와: false, 은: true, 는: false, 이: true, 가: false };
let rendered = 0;
for (const enemy of enemies) {
  const out = String(partInfo(enemy));
  const label = `${enemy.id}: part info`;
  eq((out.match(/<tr[ >]/g) || []).length, enemyAnatomy[enemy.id].rows.length + 1, `${label} has a row per wiki row`);
  const text = out.replace(/<[^>]+>/g, ' ');
  ok(!/\bundefined\b|\bNaN\b|\[object/.test(text), `${label} shows no undefined/NaN`);
  for (const [, name] of out.matchAll(/<th scope="row">([^<]*)/g)) ok(/[가-힣]/.test(name), `${label}: "${name.trim()}" has a Korean name`);
  for (const [, word, particle] of text.matchAll(/‘([^’]+)’(을|를|과|와|은|는)(?=\s)/g)) {
    ok(PAIRS[particle] === hasFinal(word), `${label}: ‘${word}’${particle} particle`);
  }
  rendered++;
}
console.log(`PASS enemy anatomy: ${checks} checks (${Object.keys(enemyAnatomy).length} enemies, ${rowsTotal} wiki rows, ${linked} matched to calculated parts, ${withPhoto} with a photo; ${rendered} tables rendered; wiki snapshot ${built.checkedAt})${toCheck.length ? `; to check (${toCheck.length}): ${toCheck.slice(0, 5).join('; ')}${toCheck.length > 5 ? '; ...' : ''}` : ''}.`);
