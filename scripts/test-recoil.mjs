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
// Every round's dot (one per shot, like the game's view) and the whole aim path fit in the box (240 px) with the
// crosshair fixed at the first aim.
const { simulate, frameFor, configure } = await import('../dist/ui/recoil-sim.js');
for (const [key, value] of Object.entries(weaponRecoil).filter(([, value]) => value.sim)) {
  for (const scale of [0.9, 0.4]) {
    const run = simulate(value.sim, scale);
    ok(run.hits.length === run.shots && run.hits.every(h => h.points.length === (value.sim.pellets ?? 1)) && run.frames.every(f => [...f.view, ...f.drift].every(Number.isFinite)), `${key}: simulation fires every round and pellet with finite positions`);
    const { px, ox, oy } = frameFor(run);
    const inBox = ([x, y]) => ox + x * px >= -0.01 && ox + x * px <= 240.01 && oy - y * px >= -0.01 && oy - y * px <= 240.01;
    ok(run.hits.every(h => inBox(h.points[0])) && run.frames.every(f => inBox([f.view[0] + f.drift[0], f.view[1] + f.drift[1]])) && inBox([0, 0]), `${key}: the burst fits in the box`);
  }
}
// Every fire mode, fire rate and muzzle choice runs; the default muzzle leaves the inputs as they are, and a muzzle
// that cuts recoil lowers the climb.
for (const [key, value] of Object.entries(weaponRecoil).filter(([, value]) => value.sim)) {
  const sim = value.sim;
  ok(sim.modes?.every(m => ['auto', 'semi', 'burst'].includes(m)) !== false && (!sim.modes?.includes('burst') || sim.burst > 0), `${key}: fire modes are known`);
  ok(!sim.muzzles || (sim.muzzles[sim.muzzle] && JSON.stringify(configure(sim, {}).drift) === JSON.stringify(sim.drift)), `${key}: the default muzzle keeps the sheet values`);
  for (const mode of sim.modes ?? ['auto']) for (const rpm of sim.rpms ?? [sim.rpm]) for (const muzzle of (sim.muzzles ?? [null]).map((_, i) => i)) {
    const run = simulate(configure(sim, { mode, rpm, muzzle }), 0.9 * 0.7);
    ok(run.hits.length === run.shots && run.hits.every((h, i) => i === 0 || h.t > run.hits[i - 1].t), `${key} ${mode} ${rpm} ${muzzle}: every round fires in order`);
  }
}
const lib = weaponRecoil['gear/liberator'].sim, comp = lib.muzzles.findIndex(m => m.en === 'Compensator');
ok(configure(lib, { muzzle: comp }).climb[1] < lib.climb[1], 'liberator: the compensator cuts vertical climb');
// Firing faster must not make the view climb less (the climb estimate once dropped part of each kick at high rates):
// the average climb of 200 runs differs by under 5% between fire modes and fire rates.
const meanClimb = (sim, choice) => { let sum = 0; for (let i = 0; i < 200; i++) { const f = simulate(configure(sim, choice), 0.9).frames.at(-1); sum += f.view[1]; } return sum / 200; };
for (const [key, choices] of [['gear/liberator', [{ mode: 'auto' }, { mode: 'semi' }]], ['arsenal/stalwart', [{ rpm: 700 }, { rpm: 1150 }]], ['arsenal/maxigun', null]]) {
  const sim = weaponRecoil[key].sim, list = choices ?? (sim.rpms ?? [sim.rpm]).map(rpm => ({ rpm }));
  const climbs = list.map(choice => meanClimb(sim, choice));
  ok(Math.max(...climbs) / Math.min(...climbs) < 1.05, `${key}: climb barely depends on fire mode or rate (${climbs.map(c => c.toFixed(2)).join(' / ')})`);
}

const { weaponDetail } = await import('../dist/ui/views/gear.js');
const sample = personalWeapons.find(w => weaponRecoil[`gear/${w.id}`]?.sim);
const [h, v] = weaponRecoil[`gear/${sample.id}`].screen;
const detail = String(weaponDetail(sample));
ok(detail.includes(`<dt>반동</dt><dd>${h} / ${v}</dd>`), `${sample.id}: gear detail shows the armory screen recoil`);
ok(!detail.includes('무기 반동') && !detail.includes('화면 반동'), `${sample.id}: only the armory screen recoil is shown`);
ok(detail.indexOf('<dt>반동</dt>') > detail.indexOf('세부 수치'), `${sample.id}: recoil sits in the detailed stats, not the key stats`);
ok(detail.includes(`<recoil-sim class="recoil-sim" data-key="gear/${sample.id}">`), `${sample.id}: gear detail has the recoil simulation`);
// A weapon with several rounds keeps its recoil in one titled group with the simulation, not after the last round.
const { stratagemDetail } = await import('../dist/ui/views/arsenal.js');
const groupOk = html => { const at = html.indexOf('<div class="ballistic recoil-group"><h4>반동</h4>'); return at >= 0 && html.indexOf('<dt>반동</dt>', at) > at && html.indexOf('<recoil-sim', at) > at; };
ok(groupOk(detail), `${sample.id}: recoil and its simulation sit in one group`);
const autocannon = String(stratagemDetail(stratagems.find(s => s.id === 'autocannon')));
ok(groupOk(autocannon), 'autocannon (two rounds): recoil and its simulation sit in one group');
console.log(`PASS recoil: ${checks} checks (${Object.keys(weaponRecoil).length} weapons, wiki datamine revision ${recoilSource.revision}).`);
