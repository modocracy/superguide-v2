// Builds dist/data/weapon-recoil.js: each weapon's base recoil, keyed 'gear/<id>' for primaries and secondaries
// and 'arsenal/<id>' for support weapons.
//   drift / climb: the weapon record of the wiki datamine (db/source/weapons_data.json, Module:Decodedata-Attacks/
//     weapons_data.json; fields drift and climb, x = horizontal, y = vertical). It matched every row of the
//     helldiversotl.com recoil table on 2026-11-24, and the wiki data is used (user decision 2026-11-24).
//   limit: where vertical recoil starts easing off as you aim up, which the datamine lacks: the helldiversotl.com
//     table (db/source/otl_recoil.json, scripts/fetch-recoil.mjs), only where it is not 90 / 90.
//   screen: the recoil the game's armory screen shows, [horizontal, vertical] with the default attachments: the
//     game data sheet (db/source/game_sheets/weapons.json, `조작.화면`), which is (drift + climb) / 2 after the default
//     attachments (user decision 2026-11-25). Matched by designation (code), else English name; mounted, drone and
//     vehicle copies of a weapon are left out, and a weapon whose remaining copies disagree gets no screen value.
//   ergonomics: the ergonomics the same armory screen shows (`조작.화면.인체공학`, default attachments included);
//     the site shows it instead of the wiki value (user decision 2026-11-25).
//   sim: what the recoil simulation on the detail page uses (user request 2026-11-25), from the same sheet entry:
//     drift and climb [horizontal, vertical] after the default attachments (`조작.실효`), the horizontal bias and
//     random ratios [vertical, horizontal] of each (`수평_치우침`, `무작위_비율`), the first fire rate (`분당_발사`)
//     and the magazine (`탄창`; for a heat weapon the rounds before it overheats, `열.과열까지_발사`), the reload time shown after the magazine (`재장전_시간`, null when 0 = the animation's own); the spread [horizontal, vertical] in MRAD after the default attachments and the pellets
//     per shot (the sheet's projectile `탄_수`, else the site's `pellets`). Left out for spray weapons, which have no fire rate.
//     Choices on the page (user request 2026-11-25): modes = the fire modes ('auto', 'semi', 'burst' from `조작.발사_방식`)
//     with burst = rounds per burst (`조작.점사_발수`), rpms = the fire rates when there are several, and muzzles = the
//     muzzles that change recoil (a weapon's muzzle slot in weapon-attachments.js, plus its default and No Attachment),
//     each with its multipliers on drift, climb and spread from the sheet's attachment stats; muzzle = the default's index.
//     A recoil multiplier (`반동_*_곱`) scales drift and climb, a camera one (`카메라반동_*_곱`) only climb.
// A weapon matches its record by its English name (upper case). Melee weapons and throwables are left out: their
// recoil is a placeholder. Do not edit the output.
// Usage: node scripts/build-recoil.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { personalWeapons } from '../dist/data/personal-weapons.js';
import { stratagems } from '../dist/core/catalog.js';
import { weaponAttachments, attachmentParts } from '../dist/data/weapon-attachments.js';

const read = async name => JSON.parse(await readFile(new URL(`../db/source/${name}`, import.meta.url), 'utf8'));
const norm = text => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');

export async function buildRecoil() {
  const datamine = await read('weapons_data.json');
  const otl = await read('otl_recoil.json');
  const records = new Map(Object.values(datamine.data.weapons).filter(record => record.drift && record.climb).map(record => [norm(record.name), record]));
  const limits = new Map(otl.rows.filter(row => row.limit.join() !== '90,90').map(row => [norm(row.name), row.limit]));
  const sheetFile = await read('game_sheets/weapons.json'), sheet = sheetFile.무기;
  // Multipliers of a list of attachment stats on [horizontal, vertical] drift, climb and spread.
  const factors = mods => {
    const p = type => Math.round((mods ?? []).filter(m => m.종류 === type).reduce((a, m) => a * m.값, 1) * 1e4) / 1e4;
    const r = v => Math.round(v * 1e4) / 1e4;
    return { drift: [p('반동_수평_곱'), p('반동_수직_곱')], climb: [r(p('반동_수평_곱') * p('카메라반동_수평_곱')), r(p('반동_수직_곱') * p('카메라반동_수직_곱'))],
      spread: [p('탄퍼짐_수평_곱'), p('탄퍼짐_수직_곱')] };
  };
  // Muzzle (slot 4) multipliers by English name; every copy of a name must agree.
  const muzzleFactors = new Map();
  for (const a of sheetFile.부착물.filter(a => a.부위_번호.includes(4))) {
    const f = { ko: a.ko, ...factors(a.바꾸는_값?.능력치) }, seen = muzzleFactors.get(a.en);
    if (seen && JSON.stringify(seen) !== JSON.stringify(f)) throw new Error(`Muzzle ${a.en}: copies disagree`);
    muzzleFactors.set(a.en, f);
  }
  const changesRecoil = f => [...f.drift, ...f.climb].some(v => v !== 1);
  const MODES = { 자동: 'auto', 단발: 'semi', 점사: 'burst' };
  const COPY = /drone|frv|mount|vehicle|exosuit|emplacement/i;
  const simOf = g => {
    const o = g.조작, e = o.실효, rpm = g.분당_발사?.[0];
    return rpm ? { drift: [e.총반동_수평, e.총반동_수직], climb: [e.카메라반동_수평, e.카메라반동_수직], bias: [o.총반동.수평_치우침, o.카메라반동.수평_치우침],
      random: [o.총반동.무작위_비율, o.카메라반동.무작위_비율], rpm, magazine: g.탄창 ?? (g.열?.과열까지_발사 ? Math.floor(g.열.과열까지_발사) : null),
      spread: [e.탄퍼짐_수평_MRAD, e.탄퍼짐_수직_MRAD], pellets: g.투사체?.탄_수 ?? null, reload: g.재장전_시간 || null, ...firing(g), defaults: g.기본_부착물 } : null;
  };
  const firing = g => {
    const modes = [...new Set((g.조작.발사_방식 ?? []).map(m => MODES[m]).filter(Boolean))];
    const rpms = [...new Set(g.분당_발사)];
    return { ...(modes.length && { modes }), ...(modes.includes('burst') && { burst: g.조작.점사_발수 }), ...(rpms.length > 1 && { rpms }) };
  };
  const screenOf = (code, en) => {
    const byCode = code ? sheet.filter(g => g.코드 === code) : [];
    const found = byCode.length ? byCode : sheet.filter(g => norm(g.en) === norm(en) || norm(g.en) === norm(String(en).replace(/^\S+\s+/, '')));
    const own = found.filter(g => g.조작?.화면 && !COPY.test(g.경로));
    const named = own.filter(g => g.경로.startsWith('content/'));
    const values = [...new Set((named.length ? named : own).map(g => JSON.stringify({ screen: [g.조작.화면.수평_반동, g.조작.화면.수직_반동], ergonomics: g.조작.화면.인체공학, ...(simOf(g) && { sim: simOf(g) }) })))];
    return values.length === 1 ? JSON.parse(values[0]) : null;
  };
  // The muzzle choices of a customizable weapon, when one of them changes recoil.
  const muzzlesOf = (key, defaults) => {
    const id = key.startsWith('gear/') ? key.slice(5) : null;
    const names = [...new Set((weaponAttachments[id] ?? []).map(it => attachmentParts[it.part]).filter(part => part.slot === 'muzzle').map(part => part.name))];
    const known = names.filter(name => muzzleFactors.has(name));
    if (!known.some(name => changesRecoil(muzzleFactors.get(name)))) return {};
    const fitted = known.find(name => (defaults ?? []).includes(muzzleFactors.get(name).ko) && name !== 'No Attachment') ?? (known.includes('No Attachment') ? 'No Attachment' : null);
    if (!fitted) throw new Error(`${key}: default muzzle not found`);
    const muzzles = known.filter(name => name === fitted || name === 'No Attachment' || changesRecoil(muzzleFactors.get(name)))
      .map(name => ({ en: name, ko: muzzleFactors.get(name).ko, drift: muzzleFactors.get(name).drift, climb: muzzleFactors.get(name).climb, spread: muzzleFactors.get(name).spread }));
    return { muzzles, muzzle: muzzles.findIndex(m => m.en === fitted) };
  };
  const weapons = [
    ...personalWeapons.filter(w => w.type !== 'melee' && w.category !== 'throwable').map(w => ({ key: `gear/${w.id}`, en: w.en, code: w.code, pellets: w.pellets })),
    ...stratagems.filter(s => s.category === 'support' && !/^CQC-/.test(s.code ?? s.en)).map(s => ({ key: `arsenal/${s.id}`, en: s.en, code: s.code })),
  ];
  const recoil = {};
  const noScreen = [];
  for (const { key, en, code, pellets } of weapons) {
    const record = records.get(norm(en));
    if (!record) continue;
    const limit = limits.get(norm(en));
    const game = screenOf(code, en);
    if (game?.sim && game.sim.pellets == null) game.sim.pellets = pellets > 1 ? pellets : 1;
    if (game?.sim) Object.assign(game.sim, muzzlesOf(key, game.sim.defaults)), delete game.sim.defaults;
    if (!game) noScreen.push(key);
    recoil[key] = { drift: [record.drift.x, record.drift.y], climb: [record.climb.x, record.climb.y], ...(limit && { limit }), ...game };
  }
  const usedLimits = [...limits.keys()].filter(name => !weapons.some(w => norm(w.en) === name && recoil[w.key]));
  const source = { datamine: datamine.source, revision: datamine.revision, limitPage: otl.source, limitRetrievedAt: otl.retrievedAt };
  return { source, recoil: Object.fromEntries(Object.entries(recoil).sort(([a], [b]) => a.localeCompare(b))), unusedLimits: usedLimits, noScreen };
}

export const recoilText = ({ source, recoil }) => `// Generated by scripts/build-recoil.mjs from the wiki datamine (db/source/weapons_data.json) and, for limit,
// db/source/otl_recoil.json (helldiversotl.com/research/recoil). Do not edit.
// Base recoil per weapon: drift = how far the weapon kicks, climb = how far the view climbs, each [horizontal, vertical];
// limit = [start, end] of the upward angle over which vertical recoil eases off (left out when 90 / 90);
// screen = [horizontal, vertical] recoil and ergonomics = ergonomics on the game's armory screen with the default attachments
// (db/source/game_sheets/weapons.json); sim = inputs of the recoil simulation from the same sheet entry.
export const recoilSource = ${JSON.stringify(source)};
export const weaponRecoil = {
${Object.entries(recoil).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n')}
};
`;

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/').replace(/^\//, '')}`) {
  const data = await buildRecoil();
  await writeFile(new URL('../dist/data/weapon-recoil.js', import.meta.url), recoilText(data));
  console.log(`dist/data/weapon-recoil.js: ${Object.keys(data.recoil).length} weapons (datamine revision ${data.source.revision}). Angle limits with no site weapon: ${data.unusedLimits.join(', ') || 'none'}. No game screen recoil: ${data.noScreen.join(', ') || 'none'}`);
}
