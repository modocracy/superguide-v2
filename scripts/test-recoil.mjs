// Weapon recoil: dist/data/weapon-recoil.js is what build-recoil.mjs makes from the wiki datamine (and the angle
// limits of db/source/otl_recoil.json) and the game data sheet (armory screen recoil, ergonomics, simulation inputs),
// every key is a real gear or support weapon, and the gear detail shows the recoil cell and the recoil simulation
// in its detailed stats.
import assert from 'node:assert/strict';
import { weaponRecoil, recoilSource } from '../dist/data/weapon-recoil.js';
import { personalWeapons } from '../dist/data/personal-weapons.js';
import { stratagems } from '../dist/core/catalog.js';
import { buildRecoil, recoilText } from './build-recoil.mjs';
import { readFile } from 'node:fs/promises';

let checks = 0;
const ok = (value, message) => { assert(value, message); checks++; };

const built = await buildRecoil();
ok(await readFile(new URL('../dist/data/weapon-recoil.js', import.meta.url), 'utf8') === recoilText(built), 'weapon-recoil.js is out of date: run node scripts/build-recoil.mjs');
const known = new Set([...personalWeapons.map(w => `gear/${w.id}`), ...stratagems.filter(s => s.category === 'support').map(s => `arsenal/${s.id}`)]);
// Values are not pinned (a balance patch must not stop deploys): only their shape.
for (const [key, value] of Object.entries(weaponRecoil)) {
  ok(known.has(key), `${key} is a gear or support weapon`);
  ok([value.drift, value.climb, ...(value.limit ? [value.limit] : []), ...(value.screen ? [value.screen] : [])].every(pair => pair.length === 2 && pair.every(Number.isFinite)), `${key}: recoil pairs are numbers`);
  if (value.sim) ok(value.sim.rpm > 0 && [value.sim.drift, value.sim.climb, value.sim.bias].every(pair => pair.length === 2 && pair.every(Number.isFinite)), `${key}: simulation inputs are numbers`);
}
// The simulation runs a burst that climbs and stops.
// Every pellet and the whole aim path fit in the box (240 px) with the crosshair fixed at the first aim.
const { simulate, frameFor } = await import('../dist/ui/recoil-sim.js');
for (const [key, value] of Object.entries(weaponRecoil).filter(([, value]) => value.sim)) {
  for (const scale of [0.9, 0.4]) {
    const run = simulate(value.sim, scale);
    ok(run.hits.length === run.shots && run.hits.every(h => h.points.length === (value.sim.pellets ?? 1)) && run.frames.every(f => [...f.view, ...f.drift].every(Number.isFinite)), `${key}: simulation fires every round and pellet with finite positions`);
    const { px, ox, oy } = frameFor(run);
    const inBox = ([x, y]) => ox + x * px >= -0.01 && ox + x * px <= 240.01 && oy - y * px >= -0.01 && oy - y * px <= 240.01;
    ok(run.hits.every(h => h.points.every(inBox)) && run.frames.every(f => inBox([f.view[0] + f.drift[0], f.view[1] + f.drift[1]])) && inBox([0, 0]), `${key}: the burst fits in the box`);
  }
}

const { weaponDetail } = await import('../dist/ui/views/gear.js');
const sample = personalWeapons.find(w => weaponRecoil[`gear/${w.id}`]?.sim);
const [h, v] = weaponRecoil[`gear/${sample.id}`].screen;
const detail = String(weaponDetail(sample));
ok(detail.includes(`<dt>반동</dt><dd>${h} / ${v}</dd>`), `${sample.id}: gear detail shows the armory screen recoil`);
ok(!detail.includes('무기 반동') && !detail.includes('화면 반동'), `${sample.id}: only the armory screen recoil is shown`);
ok(detail.indexOf('<dt>반동</dt>') > detail.indexOf('세부 수치'), `${sample.id}: recoil sits in the detailed stats, not the key stats`);
ok(detail.includes(`<recoil-sim class="ballistic recoil-sim" data-key="gear/${sample.id}">`), `${sample.id}: gear detail has the recoil simulation`);
console.log(`PASS recoil: ${checks} checks (${Object.keys(weaponRecoil).length} weapons, wiki datamine revision ${recoilSource.revision}).`);
