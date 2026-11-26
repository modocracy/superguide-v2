// Ship module tab: dist/data/ship-module-upgrades.js is what build-ship-module-upgrades.mjs makes from
// the wiki table and the game's text, every section has its upgrades in tier order, the icons are the
// checked files, and the game markup is gone. Names or effects still in English, a missing icon, a
// Total row that differs from the costs and a catalogue module (dist/data/ship-modules.js) no upgrade
// links are only reported as 'to check' (user decision 2026-11-19: do not block deploys).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { shipModuleSections, shipModuleTotal, shipModuleUpgradesSource } from '../dist/data/ship-module-upgrades.js';
import { shipModules } from '../dist/data/ship-modules.js';
import { buildShipModuleUpgrades } from './build-ship-module-upgrades.mjs';

let checks = 0;
const ok = (value, message) => { assert(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

const built = await buildShipModuleUpgrades();
eq(shipModuleSections, built.sections, 'ship-module-upgrades.js is out of date: run node scripts/build-ship-module-upgrades.mjs');
eq(shipModuleTotal, built.total, 'total is the sum of the costs');
eq(shipModuleUpgradesSource, built.source, 'source revision');
const modules = shipModuleSections.flatMap(section => section.modules);
for (const section of shipModuleSections) {
  eq(section.modules.map(module => module.tier), section.modules.map((_, i) => i + 1), `${section.en}: tiers in order`);
  if (!section.icon) continue;
  const bytes = await readFile(new URL(`../dist/${section.icon.src.slice(2)}`, import.meta.url));
  ok(createHash('sha256').update(bytes).digest('hex') === section.icon.sha256, `${section.en}: icon file matches its sha256`);
}
for (const module of modules) {
  ok(module.name && module.effect, `${module.en}: a name and an effect`);
  ok(!/#VALUE|<[ci]/.test(module.effect + module.effectEn), `${module.en}: no game markup left`);
}
// Affected stratagems (each upgrade's wiki page, user request 2026-11-26): catalogue ids, no repeats, none for an upgrade
// that changes every stratagem (Morale Augmentation) or none at all (Nuclear Radar, Power Steering).
{
  const { stratagemById } = await import('../dist/core/catalog.js');
  for (const module of modules) for (const id of module.affected ?? []) ok(stratagemById.has(id), `${module.en}: affected ${id} is no stratagem`);
  ok(modules.every(module => new Set(module.affected ?? []).size === (module.affected ?? []).length), 'affected lists have no repeats');
  const of = id => modules.find(module => module.id === id)?.affected ?? [];
  // What the module pages list can change with a wiki download: a CHECK line only (user decision 2026-11-26).
  if (!(!of('morale-augmentation').length && !of('nuclear-radar').length && of('circuit-expansion').join() === 'arc-thrower,tesla-tower' && of('atmospheric-monitoring').length === 2)) console.warn('CHECK ship modules: the affected lists of Morale Augmentation, Nuclear Radar, Circuit Expansion or Atmospheric Monitoring changed; review them on the module tab');
}
const unlinked = shipModules.filter(module => !modules.some(item => item.stratagemModule === module.id && item.en === module.en)).map(module => module.en);
const toCheck = [...built.toCheck, ...unlinked.map(en => `catalogue module ${en} is not on the ship module tab`)];
console.log(`PASS ship modules: ${checks} checks (${shipModuleSections.length} sections, ${modules.length} upgrades, Ship Modules revision ${shipModuleUpgradesSource.revision})${toCheck.length ? `; to check: ${toCheck.length} (${toCheck.join('; ')})` : ''}.`);
