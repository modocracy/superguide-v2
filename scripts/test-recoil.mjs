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
// Every pellet's dot and the whole aim path fit in the box (240 px) with the crosshair fixed at the first aim.
const { simulate, frameFor, configure } = await import('../dist/ui/recoil-sim.js');
for (const [key, value] of Object.entries(weaponRecoil).filter(([, value]) => value.sim)) {
  for (const scale of [0.9, 0.4]) {
    const run = simulate(value.sim, scale);
    ok(run.hits.length === run.shots && run.hits.every(h => h.points.length === (value.sim.pellets ?? 1)) && run.frames.every(f => [...f.view, ...f.drift].every(Number.isFinite)), `${key}: simulation fires every round and pellet with finite positions`);
    const { px, ox, oy } = frameFor(run);
    const inBox = ([x, y]) => ox + x * px >= -0.01 && ox + x * px <= 240.01 && oy - y * px >= -0.01 && oy - y * px <= 240.01;
    ok(run.hits.every(h => h.points.every(inBox)) && run.frames.every(f => inBox([f.view[0] + f.drift[0], f.view[1] + f.drift[1]])) && inBox([0, 0]), `${key}: the burst fits in the box`);
  }
}
// Every fire mode, fire rate and attachment choice runs; the fitted parts leave the inputs as they are, and a part
// that cuts recoil lowers the climb.
for (const [key, value] of Object.entries(weaponRecoil).filter(([, value]) => value.sim)) {
  const sim = value.sim;
  ok(sim.modes?.every(m => ['auto', 'semi', 'burst'].includes(m)) !== false && (!sim.modes?.includes('burst') || sim.burst > 0), `${key}: fire modes are known`);
  ok(!sim.slots || (sim.slots.every(s => s.options[s.fitted]) && JSON.stringify(configure(sim, {})) === JSON.stringify(configure(sim, { slots: Object.fromEntries(sim.slots.map(s => [s.slot, s.fitted])) })) && JSON.stringify(configure(sim, {}).drift) === JSON.stringify(sim.drift)), `${key}: the fitted parts keep the sheet values`);
  const picks = (sim.slots ?? []).flatMap(s => s.options.map((_, i) => ({ [s.slot]: i })));
  for (const mode of sim.modes ?? ['auto']) for (const rpm of sim.rpms ?? [sim.rpm]) for (const slots of picks.length ? picks : [{}]) {
    const run = simulate(configure(sim, { mode, rpm, slots }), 0.9 * 0.7);
    ok(run.hits.length === run.shots && run.hits.every((h, i) => i === 0 || h.t > run.hits[i - 1].t), `${key} ${mode} ${rpm} ${JSON.stringify(slots)}: every round fires in order`);
  }
}
const lib = weaponRecoil['gear/liberator'].sim, slotOf = (sim, slot) => sim.slots.find(s => s.slot === slot);
const comp = slotOf(lib, 'muzzle').options.findIndex(o => o.en === 'Compensator'), grip = slotOf(lib, 'underbarrel').options.findIndex(o => o.en === 'Vertical Foregrip');
ok(configure(lib, { slots: { muzzle: comp } }).climb[1] < lib.climb[1], 'liberator: the compensator cuts vertical climb');
ok(configure(lib, { slots: { underbarrel: grip } }).climb[1] < lib.climb[1], 'liberator: the vertical foregrip cuts vertical climb');
const sweeper = weaponRecoil['gear/sweeper'].sim, full = slotOf(sweeper, 'muzzle').options.findIndex(o => o.en === 'Full Choke');
ok(configure(sweeper, { slots: { muzzle: full } }).spread[0] < sweeper.spread[0], 'sweeper: the full choke tightens the spread');
// The view climbs steadily (no recovery) by about 0.015 degrees a round for the Stalwart standing, as real firing
// in a mission did (2026-11-25), and firing faster or slower climbs the same per round.
const stalwart = { ...weaponRecoil['arsenal/stalwart'].sim, random: [[0, 1], [0, 1]], drift: [0, 0] };
const steady = simulate(stalwart, 0.9).hits.map(h => h.y);
ok(steady.every((y, i) => i === 0 || y > steady[i - 1]) && Math.abs(steady.at(-1) / (steady.length - 1) - 0.015) < 0.002, `stalwart: climbs steadily about 0.015 degrees a round (${(steady.at(-1) / (steady.length - 1)).toFixed(4)})`);
const perRound = rpm => { const ys = simulate({ ...stalwart, rpm }, 0.9).hits.map(h => h.y); return ys.at(-1) / (ys.length - 1); };
ok(Math.abs(perRound(700) / perRound(1150) - 1) < 0.05, 'stalwart: the same climb per round at 700 and 1150 RPM');

const { weaponDetail } = await import('../dist/ui/views/gear.js');
const sample = personalWeapons.find(w => weaponRecoil[`gear/${w.id}`]?.sim);
const [h, v] = weaponRecoil[`gear/${sample.id}`].screen;
const detail = String(weaponDetail(sample));
ok(detail.includes(`<dt>반동</dt><dd>${h} / ${v}</dd>`), `${sample.id}: gear detail shows the armory screen recoil`);
ok(!detail.includes('무기 반동') && !detail.includes('화면 반동'), `${sample.id}: only the armory screen recoil is shown`);
ok(detail.indexOf('<dt>반동</dt>') > detail.indexOf('세부 수치'), `${sample.id}: recoil sits in the detailed stats, not the key stats`);
ok(detail.includes(`<recoil-sim class="recoil-sim" data-key="gear/${sample.id}">`), `${sample.id}: gear detail has the recoil simulation`);
ok(/<details class="block recoil-sim-block disclosure"><summary><h3>반동 시뮬레이션<\/h3><\/summary><recoil-sim/.test(detail), `${sample.id}: the simulation is a closed disclosure of its own`);
// The recoil cell sits with the numbers of the first round; the simulation is its own disclosure after the detailed
// stats, outside them, also for a weapon with several rounds.
const { stratagemDetail } = await import('../dist/ui/views/arsenal.js');
const groupOk = html => {
  const cell = html.indexOf('<dt>반동</dt>'), stats = html.indexOf('ballistic-block'), card = html.indexOf('<details class="block recoil-sim-block');
  const statsEnd = html.lastIndexOf('</details>', card);
  return cell > stats && card > cell && statsEnd > cell && html.indexOf('<dt>반동</dt>', card) < 0 && html.lastIndexOf('<dt>각도별 관통</dt>', cell) >= 0;
};
ok(groupOk(detail), `${sample.id}: the recoil cell is with the numbers and the simulation is its own card`);
// The simulation hides while the panel shows a mode it does not cover (the Arbitrator's underbarrel shotgun).
const arbitrator = personalWeapons.find(w => w.id === 'arbitrator');
ok(/<div data-variant-hide="underbarrel" ><details class="block recoil-sim-block/.test(String(weaponDetail(arbitrator))), 'arbitrator: the simulation shows for the main barrel');
ok(/<div data-variant-hide="underbarrel" hidden><details class="block recoil-sim-block/.test(String(weaponDetail(arbitrator, { variant: 'underbarrel' }))), 'arbitrator: the simulation hides for the underbarrel');
// No simulation for one-round weapons and self-flying rockets, and no recoil cell (nor detailed stats) for a 0 / 0 beam.
const { hasRecoilSim } = await import('../dist/ui/recoil-sim.js');
for (const key of ['arsenal/expendable-at', 'arsenal/quasar', 'arsenal/railgun', 'arsenal/commando', 'arsenal/wasp', 'arsenal/speargun', 'gear/exploding-crossbow']) ok(!hasRecoilSim(key), `${key}: no recoil simulation`);
for (const key of ['arsenal/stalwart', 'arsenal/autocannon', 'gear/liberator', 'gear/breaker', 'arsenal/maxigun', 'arsenal/belt-fed-gl']) ok(hasRecoilSim(key), `${key}: has the recoil simulation`);
// The whole magazine fires (user request 2026-11-25); a backpack-fed weapon fires its backpack.
for (const [key, rounds] of [['arsenal/stalwart', 250], ['arsenal/maxigun', 1000], ['arsenal/belt-fed-gl', 120]]) ok(simulate(weaponRecoil[key].sim, 0.9).hits.length === rounds, `${key}: fires all ${rounds} rounds`);
const laserCannon = String(stratagemDetail(stratagems.find(s => s.id === 'laser-cannon')));
ok(!laserCannon.includes('<dt>반동</dt>') && !laserCannon.includes('ballistic-block'), 'laser cannon: no 0 / 0 recoil cell and no detailed stats');
const autocannon = String(stratagemDetail(stratagems.find(s => s.id === 'autocannon')));
ok(groupOk(autocannon), 'autocannon (two rounds): the recoil cell is with the numbers and the simulation is its own card');
console.log(`PASS recoil: ${checks} checks (${Object.keys(weaponRecoil).length} weapons, wiki datamine revision ${recoilSource.revision}).`);
