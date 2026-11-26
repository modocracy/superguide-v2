// Builds dist/data/ship-module-upgrades.js for the gear view's ship module tab: the six ship
// sections and their five upgrades each, with costs from the wiki Ship Modules table
// (db/source/wiki_stratagem_stats.json), the game's Korean names and effect text
// (db/source/game_names_ko.json) and the section icons (db/source/wiki_ship_module_icons.json).
// Do not edit the output.
// Usage: node scripts/build-ship-module-upgrades.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { parseShipModules, gameEffect } from './ship-module-parse.mjs';
import { gameText } from './booster-parse.mjs';
import { shipModules } from '../dist/data/ship-modules.js';
import { stratagems } from '../dist/core/catalog.js';
import { stratagemStats } from '../dist/data/stratagem-stats.js';

const read = async name => JSON.parse(await readFile(new URL(`../db/source/${name}`, import.meta.url), 'utf8'));
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function buildShipModuleUpgrades() {
  const page = (await read('wiki_stratagem_stats.json')).shipModules;
  const game = await read('game_names_ko.json');
  const icons = (await read('wiki_ship_module_icons.json')).icons;
  const strings = game.strings.shipModuleUpgrades;
  // Nothing here stops the build (user decision 2026-11-19: do not block deploys). A name or effect
  // without game Korean keeps the wiki's English, a section without an icon shows none, and a cost
  // sum that differs from the wiki's hand-kept Total row shows the sum; each is listed in `toCheck`.
  const toCheck = [];
  const ko = (key, fallback) => { if (strings[key]) return strings[key]; toCheck.push(`no game Korean for "${fallback}" (shown in English)`); return fallback; };
  const { sections, total } = parseShipModules(page.text);
  const stratagemModule = new Map(shipModules.map(module => [module.en, module.id]));
  // affected: the stratagems each upgrade changes, the 'Affected Stratagems' links of its own wiki page
  // (db/source/wiki_ship_module_pages.json, scripts/fetch-ship-module-pages.mjs; user request 2026-11-26), matched to
  // the catalogue by English name. An upgrade for every stratagem (Morale Augmentation) has no list there.
  const pages = (await read('wiki_ship_module_pages.json')).pages;
  const norm = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byName = new Map(stratagems.flatMap(item => [item.en, item.name, ...(item.aliases ?? [])].filter(Boolean).map(name => [norm(name), item.id])));
  const idOf = title => byName.get(norm(title)) ?? byName.get(norm(title.replace(/^\S+\s+/, '')));
  // The module pages were last edited long ago and miss newer stratagems, so an upgrade for a whole type of stratagem
  // also takes every stratagem of that type in the catalogue (the wiki infobox stratagem_type, stratagem-stats.js `type`;
  // user decision 2026-11-26), on top of its page list. `where` narrows a type to what the effect needs (sentry ammo,
  // support weapon magazines or reloads); `not` drops what the page itself says the game leaves out.
  const TYPE_WIDE = {
    'Streamlined Request Process': { types: ['Support Weapon'] },
    'Streamlined Launch Process': { types: ['Support Weapon'] },
    'Donation Access License': { types: ['Support Weapon'], where: item => item.spareMags != null || item.spareRounds != null },
    'Payroll Management System': { types: ['Support Weapon'], where: item => statsOf(item)?.reload?.time != null || statsOf(item)?.reload?.tactical != null },
    // Hand Carts page, Notes: the K-9 is not on the game's list of stratagems the upgrade affects.
    'Hand Carts': { types: ['Backpack'], not: ['k9'] },
    'Zero-G Breech Loading': { types: ['Orbital'] },
    'Targeting Software Upgrade': { types: ['Orbital'] },
    'Liquid-Ventilated Cockpit': { types: ['Eagle'] },
    'Expanded Weapons Bay': { types: ['Eagle'] },
    'Synthetic Supplementation': { types: ['Sentry', 'Emplacement'] },
    'Rapid Launch System': { types: ['Emplacement'] },
    'Advanced Construction': { types: ['Sentry'] },
    // The Tesla Tower is a Sentry by type but launches like an Emplacement (the module pages list it under Rapid Launch
    // System, not Dynamic Tracking or High-Quality Lubricant): left out of these two (user decision 2026-11-26).
    'Dynamic Tracking': { types: ['Sentry'], not: ['tesla-tower'] },
    'High-Quality Lubricant': { types: ['Sentry'], not: ['tesla-tower'] },
    'Blast Absorption': { types: ['Sentry'] },
    'Shock Absorption Gel': { types: ['Sentry'], where: item => statsOf(item)?.sentry?.ammo != null },
  };
  const statsOf = item => stratagemStats[item.id];
  const affectedOf = en => {
    const titles = pages[en]?.affected ?? [];
    if (!pages[en]) toCheck.push(`${en}: no module page (run scripts/fetch-ship-module-pages.mjs)`);
    const listed = titles.map(title => idOf(title) ?? (toCheck.push(`${en}: affected "${title}" is no stratagem in the catalogue`), null)).filter(Boolean);
    const wide = TYPE_WIDE[en];
    const typed = wide ? stratagems.filter(item => wide.types.includes(statsOf(item)?.type) && (!wide.where || wide.where(item))).map(item => item.id) : [];
    return [...new Set([...listed, ...typed])].filter(id => !wide?.not?.includes(id));
  };
  const out = sections.map(section => {
    const icon = icons[section.en];
    if (!icon) toCheck.push(`${section.en}: no icon (run scripts/fetch-ship-module-icons.mjs)`);
    return {
      id: slug(section.en), name: ko(section.en, section.en), en: section.en,
      icon: icon ? { src: `./assets/ship-modules/${icon.file}`, source: icon.source, sha256: icon.sha256 } : null,
      modules: section.modules.map(module => {
        const effect = gameEffect(module.effect, Object.keys(strings));
        if (!effect) toCheck.push(`${module.en}: no game text reads like the wiki effect "${module.effect}" (shown in English)`);
        return {
          id: slug(module.en), tier: module.tier, name: ko(module.en, module.en), en: module.en, cost: module.cost,
          effect: effect ? gameText(strings[effect.key], effect.value) : module.effect, effectEn: effect ? gameText(effect.key, effect.value) : module.effect,
          ...(stratagemModule.has(module.en) && { stratagemModule: stratagemModule.get(module.en) }),
          ...(ids => ids.length ? { affected: ids } : {})(affectedOf(module.en)),
        };
      }),
    };
  });
  const sum = Object.fromEntries(Object.keys(total).map(key => [key, out.flatMap(section => section.modules).reduce((acc, module) => acc + module.cost[key], 0)]));
  for (const key of Object.keys(total)) if (sum[key] !== total[key]) toCheck.push(`${key} costs add up to ${sum[key]}, the wiki Total row says ${total[key]} (the sum is shown)`);
  return { source: { page: 'https://helldivers.wiki.gg/wiki/Ship_Modules', revision: page.revision }, gameBuild: game.build, total: sum, wikiTotal: total, sections: out, toCheck };
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/').replace(/^\//, '')}`) {
  const data = await buildShipModuleUpgrades();
  await writeFile(new URL('../dist/data/ship-module-upgrades.js', import.meta.url), `// Generated by scripts/build-ship-module-upgrades.mjs. Do not edit.
// Costs: Helldivers Wiki "Ship Modules" (revision ${data.source.revision}). Names and effect text: the game's
// Korean (game build ${data.gameBuild}). Section icons: the wiki's originals (CC BY-NC-SA 4.0).
// \`stratagemModule\` names the dist/data/ship-modules.js entry the stratagem catalogue applies.
export const shipModuleUpgradesSource = ${JSON.stringify(data.source)};
export const shipModuleTotal = ${JSON.stringify(data.total)};
export const shipModuleSections = ${JSON.stringify(data.sections, null, 1)};
`);
  console.log(`${data.sections.length} sections, ${data.sections.reduce((n, s) => n + s.modules.length, 0)} modules; total ${JSON.stringify(data.total)}`);
  if (data.toCheck.length) console.log(`To check:\n  ${data.toCheck.join('\n  ')}`);
}
