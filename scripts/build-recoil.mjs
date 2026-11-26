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
//     and the magazine (`탄창`; for a heat weapon the rounds before it overheats, `열.과열까지_발사`; for a
//     backpack-fed weapon its backpack, `배낭.용량`: Maxigun 1000, Belt-Fed Grenade Launcher 120); the spread [horizontal, vertical] in MRAD after the default attachments and the pellets
//     per shot (the sheet's projectile `탄_수`, else the site's `pellets`). Left out for spray weapons, which have no fire rate.
//     Choices on the page (user request 2026-11-25): modes = the fire modes ('auto', 'semi', 'burst' from `조작.발사_방식`)
//     with burst = rounds per burst (`조작.점사_발수`), rpms = the fire rates when there are several, and slots = the
//     muzzle and underbarrel choices that change recoil or spread (the weapon's slots in weapon-attachments.js, plus
//     the fitted part and the empty choice), each with its multipliers on drift, climb and spread from the sheet's
//     attachment stats; fitted = the default's index. A muzzle that sets the fire rate or the spread outright (Sai
//     Focus Lens: 600 RPM, spread = 75) and the magazine slot (rounds fired: the magazine's capacity, or for a heat
//     weapon its overheat temperature over its heat per shot) take those from the weapon's own row of the wiki
//     attachment table, as rpm, a spread multiplier and magazine (user request 2026-11-26): the sheet's attachment
//     list is not per weapon (one 'Drum Magazine' holds 60 rounds on one gun and 75 on another).
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
  // The attachment slots whose parts change recoil or spread (user request 2026-11-25): the site's slot name, the
  // sheet's slot number and the names of its empty choice. Optics and magazines change neither.
  const SLOTS = { muzzle: { sheet: 4, none: ['no attachment', 'no choke'] }, underbarrel: { sheet: 1, none: ['no underbarrel', 'no attachment'] } };
  // Multipliers by slot and lower-case English name (the sheet and the wiki differ in case); copies must agree.
  const slotFactors = Object.fromEntries(Object.entries(SLOTS).map(([slot, { sheet: n }]) => {
    const map = new Map();
    for (const a of sheetFile.부착물.filter(a => a.부위_번호.includes(n))) {
      const f = { ko: a.ko, ...factors(a.바꾸는_값?.능력치) }, name = a.en.toLowerCase(), seen = map.get(name);
      if (seen && JSON.stringify({ ...seen, ko: '' }) !== JSON.stringify({ ...f, ko: '' })) throw new Error(`${slot} ${a.en}: copies disagree`);
      if (!seen) map.set(name, f);
    }
    return [slot, map];
  }));
  const changes = f => [...f.drift, ...f.climb, ...f.spread].some(v => v !== 1) || f.rpm != null;
  const MODES = { 자동: 'auto', 단발: 'semi', 점사: 'burst' };
  const COPY = /drone|frv|mount|vehicle|exosuit|emplacement/i;
  const simOf = g => {
    const o = g.조작, e = o.실효, rpm = g.분당_발사?.[0];
    return rpm ? { drift: [e.총반동_수평, e.총반동_수직], climb: [e.카메라반동_수평, e.카메라반동_수직], bias: [o.총반동.수평_치우침, o.카메라반동.수평_치우침],
      random: [o.총반동.무작위_비율, o.카메라반동.무작위_비율], rpm, magazine: g.탄창 ?? (g.열?.과열까지_발사 ? Math.floor(g.열.과열까지_발사) : g.배낭?.용량 ?? null),
      spread: [e.탄퍼짐_수평_MRAD, e.탄퍼짐_수직_MRAD], pellets: g.투사체?.탄_수 ?? null, ...firing(g), defaults: g.기본_부착물,
      heat: g.탄창 == null && g.열?.과열까지_발사 ? [g.열.과열_온도, g.열.발사당_열] : null } : null;
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
  // The attachment choices of a customizable weapon, per slot whose parts change recoil or spread: the fitted part,
  // the empty choice and every part that changes either, in the order of the weapon's attachment table.
  const slotsOf = (key, sim) => {
    const id = key.startsWith('gear/') ? key.slice(5) : null;
    const parts = (weaponAttachments[id] ?? []).map(it => attachmentParts[it.part]);
    const defaults = sim.defaults;
    const slots = [];
    // A wiki effect that sets a value outright ('= 75').
    const set = v => typeof v === 'string' && v.startsWith('=') ? Number(v.slice(1)) : null;
    for (const [slot, { none }] of Object.entries(SLOTS)) {
      const map = slotFactors[slot];
      const names = [...new Set(parts.filter(part => part.slot === slot).map(part => part.name))].filter(name => map.has(name.toLowerCase()));
      // The sheet's multipliers, plus the fire rate and an outright spread from this weapon's wiki row.
      const f = name => {
        const base = map.get(name.toLowerCase()), e = parts.find(part => part.slot === slot && part.name === name)?.effects ?? {};
        const sh = set(e.horizontalSpread), sv = set(e.verticalSpread);
        const spread = sh == null && sv == null ? base.spread : [sh == null ? base.spread[0] : Math.round(sh / sim.spread[0] * 1e4) / 1e4, sv == null ? base.spread[1] : Math.round(sv / sim.spread[1] * 1e4) / 1e4];
        return { ...base, spread, ...(e.fireRate != null && e.fireRate !== sim.rpm && { rpm: e.fireRate }) };
      };
      if (!names.some(name => changes(f(name)))) continue;
      const empty = names.find(name => none.includes(name.toLowerCase()));
      // The fitted part by its game name; else the empty choice; else a part that changes nothing, which acts the same
      // (the Liberator Legacy's table has no empty underbarrel).
      const fitted = names.find(name => (defaults ?? []).includes(f(name).ko) && name !== empty) ?? empty ?? names.find(name => !changes(f(name)));
      if (!fitted) throw new Error(`${key}: default ${slot} not found`);
      const options = names.filter(name => name === fitted || name === empty || changes(f(name)))
        .map(name => ({ en: name, ko: f(name).ko, drift: f(name).drift, climb: f(name).climb, spread: f(name).spread, ...(f(name).rpm != null && { rpm: f(name).rpm }) }));
      slots.push({ slot, options, fitted: options.findIndex(o => o.en === fitted) });
    }
    // The magazine slot: the rounds each magazine fires, where they differ. The fitted one (the sheet default, else the
    // free level 1 magazine) keeps the sheet's count.
    const mags = (weaponAttachments[id] ?? []).filter(it => attachmentParts[it.part].slot === 'magazine').map(it => ({ ...it, part: attachmentParts[it.part] }));
    const fittedMag = mags.find(it => (defaults ?? []).includes(it.part.ko)) ?? mags.find(it => it.level === 1 && it.cost === 0);
    if (fittedMag && sim.magazine != null) {
      const rounds = e => sim.heat ? Math.floor((e.overheat ?? sim.heat[0]) / (e.heatPerShot ?? sim.heat[1])) : e.magCapacity ?? null;
      const ref = rounds(fittedMag.part.effects ?? {}) ?? sim.magazine;
      // Counts relative to the fitted one, so the sheet's count stays the fitted magazine's.
      const options = mags.map(it => ({ en: it.part.name, ko: it.part.ko ?? it.part.name, drift: [1, 1], climb: [1, 1], spread: [1, 1],
        magazine: it === fittedMag ? sim.magazine : Math.floor(sim.magazine * (rounds(it.part.effects ?? {}) ?? ref) / ref) }))
        .filter((o, i, all) => o.en === fittedMag.part.name || (o.magazine !== sim.magazine && all.findIndex(x => x.en === o.en) === i));
      if (options.length > 1) slots.push({ slot: 'magazine', options, fitted: options.findIndex(o => o.en === fittedMag.part.name) });
    }
    return slots.length ? { slots } : {};
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
    if (game?.sim) Object.assign(game.sim, slotsOf(key, game.sim)), delete game.sim.defaults, delete game.sim.heat;
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
