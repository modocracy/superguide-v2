// Range falloff and drop (dist/core/ballistics.js, dist/data/ballistics.js): the generated table
// matches the datamine, the wiki Damage formulas give their documented values, the engine applies
// falloff only to a projectile's own hit and only when a distance is given, and every record a
// combat mode names exists.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ballisticsOutput } from './build-ballistics.mjs';
import { projectileBallistics } from '../dist/data/ballistics.js';
import { dragOf, falloffAt, distanceAt, trajectory, ballisticsOf, speedAt, timeAt } from '../dist/core/ballistics.js';
import { num } from '../dist/core/explain.js';
import { hitDamage, solveMatchup } from '../dist/core/combat.js';
import { compareAttacks } from '../dist/core/compare.js';
import { personalProfiles } from '../dist/data/personal-profiles.js';
import { weaponProfiles, enemies } from '../dist/data/combat-data.js';
import { supportProjectileRecords } from '../dist/data/support-records.js';
import { ballisticsBlock } from '../dist/ui/ballistics-view.js';

let checks = 0;
const check = (value, message) => { checks++; assert.ok(value, message); };
const near = (a, b, tolerance, message) => check(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

// Generated file is the build output of the current datamine snapshot.
const file = await readFile(new URL('../dist/data/ballistics.js', import.meta.url), 'utf8');
check(file === ballisticsOutput, 'dist/data/ballistics.js is out of date: run node scripts/build-ballistics.mjs');

// Wiki Damage page: D = 0.0004712389 * size^2 * Cd / mass, L = 1 - 0.75 * (1 - e^(-2Dx)).
const sample = { velocity: 900, caliber: 5.5, mass: 4.5, drag: 0.3, gravity: 1, lifetime: 0 };
near(dragOf(sample), 0.0004712389 * 5.5 ** 2 * 0.3 / 4.5, 1e-12, 'drag deceleration');
check(falloffAt(sample, 0) === 1, 'no falloff at 0 m');
near(falloffAt(sample, 100), 1 - 0.75 * (1 - Math.exp(-2 * dragOf(sample) * 100)), 1e-12, 'falloff at 100 m');
near(falloffAt(sample, 1e7), 0.25, 1e-9, 'falloff floors at 25%');
near(falloffAt(sample, distanceAt(sample, 0.5)), 0.5, 1e-9, '50% distance');
check(dragOf({ ...sample, drag: 0 }) === 0 && falloffAt({ ...sample, drag: 0 }, 150) === 1 && distanceAt({ ...sample, drag: 0 }, 0.5) === null, 'no drag, no falloff');

// Drop: none without gravity, growing with distance otherwise; a short lifetime ends the flight.
const flat = trajectory({ ...sample, gravity: 0 }, 100);
check(flat.points.every(p => Math.abs(p.drop) < 1e-9) && flat.points.at(-1).x === 100, 'no drop without gravity');
const falling = trajectory(sample, 200).points;
check(falling.every((p, i) => !i || p.drop >= falling[i - 1].drop) && falling.at(-1).drop > 0, 'drop grows with distance');
const short = trajectory({ ...sample, lifetime: 0.1 }, 200);
check(short.endX > 80 && short.endX < 90 && short.points.at(-1).x < 90, 'lifetime ends the flight');

// The multiplier on the speed at impact (helldiversotl.com projectile falloff, game 7.1.0 code): 0.25 + 0.75 * (v / v0)^2,
// with the straight-path speed v0 * e^(-Dx) and time (e^(Dx) - 1) / (D * v0).
near(falloffAt(sample, 100), 0.25 + 0.75 * (speedAt(sample, 100) / sample.velocity) ** 2, 1e-12, 'falloff from the speed at impact');
near(speedAt(sample, 100), 900 * Math.exp(-dragOf(sample) * 100), 1e-9, 'straight-path speed');
near(timeAt(sample, 100), (Math.exp(dragOf(sample) * 100) - 1) / (dragOf(sample) * 900), 1e-12, 'straight-path flight time');
near(timeAt({ ...sample, drag: 0 }, 90), 0.1, 1e-12, 'no drag: distance over muzzle velocity');
// The page's AR-23 Liberator examples: 90 damage at 80% of the reference speed is 65.70, at 50% 39.38.
near(90 * (0.25 + 0.75 * 0.8 ** 2), 65.7, 1e-9, 'Liberator 80% speed');
near(90 * (0.25 + 0.75 * 0.5 ** 2), 39.375, 1e-9, 'Liberator 50% speed');

// The distance table shows the rounded straight-path speed at each distance the shot reaches.
const rifleRecord = 'AR-23_P';
const riflePoints = trajectory(projectileBallistics[rifleRecord]).points;
const expectedSpeedRows = [25, 50, 100, 150, 200].map(distance => {
  const point = riflePoints.find(p => p.x === distance);
  return [String(distance), point ? `${num(Math.round(speedAt(projectileBallistics[rifleRecord], distance)))}m/s` : '—'];
});
for (const expanded of [false, true]) {
  const html = String(ballisticsBlock([{ record: rifleRecord }], expanded));
  const speedRows = [...html.matchAll(/<tr><th scope="row">(\d+)m<\/th>[\s\S]*?<td>([^<]*)<\/td><\/tr>/g)]
    .map(([, distance, speed]) => [distance, speed]);
  assert.deepEqual(speedRows, expectedSpeedRows, `distance table speeds (${expanded ? 'fullscreen' : 'panel'})`);
  checks++;
}

// A shot that drops more than 30 m is drawn only out to a nearer range, with table rows to suit (user request 2026-11-26).
const rangeOf = record => Number(String(ballisticsBlock([{ record }], true)).match(/data-max="(\d+)"/)[1]);
assert.deepEqual(['AR-23_P', 'GP-20_P', 'GL-21_P', 'G-7_P', 'EAT-700_P1'].map(rangeOf), [200, 50, 100, 25, 10], 'chart ranges follow the drop; a fired round keeps 50 m, fragments and bomblets go shorter');
assert.deepEqual([...String(ballisticsBlock([{ record: 'GP-20_P' }], true)).matchAll(/<tr><th scope="row">(\d+)m<\/th>/g)].map(m => Number(m[1])), [10, 20, 30, 40, 50], 'Ultimatum table rows to 50 m');
checks += 2;

// Short-lived projectiles ending on an odd metre keep their final point on chart curves.
for (const oddRecord of ['P-33_P', 'RL-77_P1']) {
  const expectedLastX = trajectory(projectileBallistics[oddRecord]).points.at(-1).x;
  const chartHtml = String(ballisticsBlock([{ record: oddRecord }], true));
  const chartLastXs = [...chartHtml.matchAll(/data-points="([^"]+)"/g)]
    .map(([, points]) => Number(points.split(';').at(-1).split(',')[0]));
  assert.deepEqual(chartLastXs, [expectedLastX, expectedLastX], `${oddRecord}: chart reaches ${expectedLastX}m`);
  checks++;
}

// Engine: falloff on the projectile's own hit only, and only with a distance.
const part = { armor: 0, durability: 0, exdr: 0, hp: 1000, toMain: 0 };
const shot = { standard: 90, durable: 22, ap: 2, explosion: 100, explosionDurable: 100, explosionAp: 2, innerRadius: 1, radius: 2, record: 'AR-23_P' };
const close = hitDamage(shot, part, part);
check(close.direct === 90 && close.explosion === 100, 'distance 0 keeps full damage');
const far = hitDamage(shot, part, part, { distance: 100 });
check(far.direct === Math.floor(90 * falloffAt(projectileBallistics['AR-23_P'], 100) + 1e-9), 'direct hit falls off at 100 m');
check(far.explosion === 100, 'explosions do not fall off with range');
check(hitDamage({ ...shot, record: undefined }, part, part, { distance: 100 }).direct === 90, 'no record, no falloff');

// A rocket-propelled shot (the Leveller) keeps its damage over range although its record has drag.
const leveller = weaponProfiles.leveller.modes[0];
check(leveller.propelled && dragOf(ballisticsOf(leveller)) > 0, 'the Leveller record has drag but is marked propelled');
check(hitDamage(leveller, part, part, { distance: 150 }).direct === leveller.standard, 'the Leveller does not fall off with range');

// Every record a combat mode names is in the table; fragments never carry one.
const modes = [...Object.values(personalProfiles), ...Object.values(weaponProfiles)].flatMap(profile => profile.modes);
for (const mode of modes) {
  if (mode.record) check(ballisticsOf(mode), `${mode.id}: projectile record ${mode.record} exists`);
  check(!mode.bomblet?.record, `${mode.id}: fragments and bomblets have no range falloff`);
}
for (const [id, list] of Object.entries(supportProjectileRecords)) {
  for (const [modeId, record] of Object.entries(list)) {
    check(projectileBallistics[record], `${id}/${modeId}: record ${record} exists`);
    check(weaponProfiles[id]?.modes.some(mode => mode.id === modeId && mode.record === record), `${id}/${modeId}: engine mode carries ${record}`);
  }
}
// The comparison table counts at the same distance as the part-by-part matchup.
const hulk = enemies.find(enemy => enemy.id === 'hulk-bruiser');
const amr = weaponProfiles['anti-materiel'].modes[0];
const fewest = distance => solveMatchup(hulk, amr, { distance }).best?.hits;
check(fewest(100) > fewest(0), 'Anti-Materiel Rifle needs more shots on a Hulk at 100 m');
check(compareAttacks(hulk, [{ weaponId: 'anti-materiel' }], { distance: 100 }).entries[0].hits === fewest(100), 'comparison uses the shooting distance');
check(compareAttacks(hulk, [{ weaponId: 'anti-materiel' }]).entries[0].hits === fewest(0), 'comparison defaults to 0 m');

const linked = modes.filter(mode => mode.record).length;

console.log(`PASS ballistics: ${checks} checks (${Object.keys(projectileBallistics).length} projectile records, ${linked} combat modes with a projectile record).`);
