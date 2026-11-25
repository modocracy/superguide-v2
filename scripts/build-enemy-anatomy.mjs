// Builds dist/data/enemy-anatomy.js: each combat enemy's wiki Anatomy table, row for row and in the
// wiki's order, for the "Part info" table on the enemy page. Values are read straight from the wiki
// snapshot (db/source/wiki_anatomy.json, or the structure pages, see scripts/anatomy-source.mjs), using
// the highest-difficulty value where a cell lists several. Each row also names the site part it is
// (sourcePart / sourceMain / anatomyMerged / anatomyOmitted in the combat data), so the page can show
// the site's Korean name, tip and photo. The table rows are the same ones scripts/test-anatomy.mjs
// checks against the combat data. Do not edit the output.
// Usage: node scripts/build-enemy-anatomy.mjs
import { writeFile } from 'node:fs/promises';
import { enemies } from '../dist/data/combat-data.js';
import { anatomySnapshot } from './anatomy-source.mjs';

const IMAGE_FIELDS = ['front_image', 'side_image', 'rear_image', 'bottom_image', 'left_image', 'right_image'];
const clean = text => String(text ?? '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
const titleOf = enemy => decodeURIComponent(enemy.source.split('/wiki/')[1]).replaceAll('_', ' ');
const value = text => { const m = /^-?[\d,]+(?:\.\d+)?/.exec(clean(text)); return m ? Number(m[0].replace(/,/g, '')) : null; };

// "130 [Default]<br>160 at {{Difficulty|4|noText=1}}": the last value is the highest difficulty.
function health(text) {
  const levels = String(text).split(/<br\s*\/?>/i).map(clean).filter(Boolean);
  const last = levels.at(-1);
  if (/^Main\b/i.test(levels[0])) return { hp: null, hpText: levels.length > 1 ? `main-${levels[1].replace(/[()]/g, '').toLowerCase()}` : 'main' };
  if (/^Infinite/i.test(last)) return { hp: null, hpText: 'infinite' };
  if (value(last) == null) return { hp: null, hpText: clean(text) || '-' };
  const from = /Difficulty\|(\d+)/.exec(last)?.[1];
  return { hp: value(last), ...(levels.length > 1 && { hpDefault: value(levels[0]), hpFrom: Number(from) }) };
}

// Constitution: "200 [-70/s]" (decays 70 a second), "35,000 [0/s]" (never decays: extra health).
// Some pages write the rate without the minus sign; the template calls it the decay rate either way.
function bleed(row) {
  const m = /^([\d,]+) \[-?([\d,.]+)\/s\]$/.exec(clean(row.bleed));
  return m ? { hp: Number(m[1].replace(/,/g, '')), perSecond: Number(m[2].replace(/,/g, '')) } : null;
}

// "Yes", "No", "Yes (When both are destroyed)", and "(Downs)" (brought down). Some pages put the
// "(Downs)" flag in the bleed cell; that cell then decides, as in scripts/test-anatomy.mjs.
function fatal(row) {
  const downs = [row.fatal, row.bleed].map(clean).find(cell => /Downs/.test(cell));
  if (/When both are destroyed/i.test(clean(row.fatal))) return { fatal: 'both' };
  return { fatal: /^Yes/.test(downs ?? clean(row.fatal)) ? 'yes' : 'no', ...(downs && { downs: true }) };
}

const wikiKey = row => (row.count ? `${row.name} (${row.count})` : row.name).replace(/\s*\((\d+)\)$/, ' ($1)');

export async function buildEnemyAnatomy() {
  const snapshot = await anatomySnapshot();
  const out = {};
  for (const enemy of enemies) {
    const page = snapshot.pages[titleOf(enemy)];
    if (!page) continue;
    // The same rows as scripts/test-anatomy.mjs: an extra tab's rows are "<tab>: <part>", and an enemy
    // that is one tab of a shared page (the Voteless builds) keeps to its own table.
    const home = enemy.anatomyTable ?? 0;
    const tables = enemy.anatomyTables ?? [...new Set(page.rows.map(row => row.table ?? 0))];
    const parts = enemy.parts.flatMap(part => [{ part, layer: part, stage: 'initial' }, ...(part.next ? [{ part, layer: part.next, stage: 'exposed' }] : [])]);
    const seen = new Set();
    const rows = [];
    for (const row of page.rows.filter(item => tables.includes(item.table ?? 0))) {
      const full = (row.table ?? 0) === home ? clean(row.part_name) : `${row.tab}: ${clean(row.part_name)}`;
      if (seen.has(full)) continue;
      seen.add(full);
      const count = Number(/\((\d+)\)$/.exec(full)?.[1]) || 1;
      const name = full.replace(/\s*\(\d+\)$/, '');
      // A part counted once and twice ("one claw" / "both claws") is one wiki row: link the single one.
      const match = parts.filter(item => item.layer.sourcePart === full).sort((a, b) => (a.layer.copies ?? 1) - (b.layer.copies ?? 1))[0];
      const pool = parts.find(item => item.layer.sourceMain === full);
      const site = match && { part: match.part.id, ...(match.stage === 'exposed' && { stage: 'exposed' }) };
      // The main row can also be a part the calculator aims at (a Scavenger's body).
      const link = full === (enemy.anatomyMain ?? 'Main') ? { role: 'main', ...site }
        : pool ? { role: 'pool', part: pool.part.id }
        : match ? site
        : enemy.anatomyMerged?.[full] ? { merged: enemy.anatomyMerged[full] }
        : enemy.anatomyOmitted?.[full] ? { omitted: true } : {};
      const official = match && enemy.anatomyOfficial?.[`${match.layer.id}.hp`];
      const cap = clean(row.dmg_cap_main);
      rows.push({
        name, ...(count > 1 && { count }), ...link,
        ...health(row.health),
        ...(official && { official: { hp: match.layer.hp, source: official.source } }),
        armor: value(row.av), durability: value(row.durability), exdr: value(row.exdr),
        toMain: value(row.percent_to_main), cap: cap === 'Yes' ? true : cap === 'No' ? false : null,
        bleed: bleed(row), ...(!bleed(row) && !['None', 'No', '-', ''].includes(clean(row.bleed)) && !/Downs/.test(clean(row.bleed)) && { bleedText: clean(row.bleed) }), ...fatal(row),
        images: IMAGE_FIELDS.map(field => row[field]).filter(file => file && !/^Anatomy Placeholder/i.test(file)).map(file => file.replaceAll('_', ' ')),
      });
    }
    // anatomyGame (user decision 2026-11-25): the site follows the game data sheet for these values; the
    // row shows that value and keeps the wiki table's in `game` (scripts/test-anatomy.mjs checks it).
    for (const [key, { wiki }] of Object.entries(enemy.anatomyGame || {})) {
      const [layerId, field] = key.split('.');
      const layer = layerId === 'main' ? enemy.main : parts.find(item => item.layer.id === layerId)?.layer;
      const row = layerId === 'main' ? rows.find(item => item.role === 'main') : rows.find(item => wikiKey(item) === wikiKey({ name: layer?.sourcePart ?? '' }));
      if (!row || !layer) throw new Error(`${enemy.id}: anatomyGame ${key} has no row`);
      row[field] = layer[field];
      row.game = { ...row.game, [field]: wiki };
    }
    out[enemy.id] = { page: titleOf(enemy), revision: page.revision, rows };
  }
  return { enemies: out, checkedAt: snapshot.retrievedAt };
}

// Writes the output; also run at the end of the wiki fetch scripts (fetch-enemy-anatomy.mjs,
// fetch-structure-pages.mjs) so the table never lags behind a fresh snapshot.
export async function writeEnemyAnatomy() {
  const data = await buildEnemyAnatomy();
  await writeFile(new URL('../dist/data/enemy-anatomy.js', import.meta.url), `// Generated by scripts/build-enemy-anatomy.mjs from the Helldivers Wiki enemy Anatomy tables
// (CC BY-NC-SA 4.0), row for row. Do not edit.
// hp: health at the highest difficulty (hpDefault/hpFrom: the default and the difficulty it rises from);
// hpText: 'main' (shares the main pool), 'infinite', or the wiki text; toMain: % of part damage also dealt
// to main (null: '-'); cap: damage to main capped by the part's health and constitution; bleed: constitution
// and its decay a second (0: never decays), bleedText: a constitution cell in another format;
// fatal: 'yes', 'no', 'both' (when both are destroyed); part/stage/role/merged/omitted: the site part the row is.
export const enemyAnatomyCheckedAt = ${JSON.stringify(data.checkedAt)};
export const enemyAnatomy = ${JSON.stringify(data.enemies, null, 1)};
`);
  const { rowPhoto } = await import('../dist/core/anatomy.js');
  const rows = Object.entries(data.enemies).flatMap(([id, enemy]) => enemy.rows.map(row => [id, row]));
  const missing = rows.filter(([id, row]) => row.images.length && !rowPhoto(id, row)).length;
  console.log(`enemy-anatomy.js: ${Object.keys(data.enemies).length} enemies, ${rows.length} rows${missing ? `; ${missing} wiki images not downloaded yet (node scripts/fetch-anatomy-row-photos.mjs)` : ''}`);
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/').replace(/^\//, '')}`) await writeEnemyAnatomy();
