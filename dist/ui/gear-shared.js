// Shared lookups for the gear tab and its loadout check (kept apart so the two
// view modules never import each other).
import { personalWeapons } from '../data/personal-weapons.js';
import { weaponRecoil } from '../data/weapon-recoil.js';
import { L } from '../core/i18n.js';

export const GROUPS = [
  { id: 'primary', name: L('주무기', 'Primary'), color: 'var(--g-primary)' },
  { id: 'secondary', name: L('보조무기', 'Secondary'), color: 'var(--g-secondary)' },
  { id: 'throwable', name: L('투척', 'Throwable'), color: 'var(--g-throwable)' },
];
export const groupOf = id => GROUPS.find(group => group.id === id);
const TYPE_NAMES = L({
  'assault-rifles': '돌격소총', 'marksman-rifles': '지정사수소총', 'sniper-rifles': '저격소총', shotguns: '산탄총', 'submachine-guns': '기관단총',
  'energy-based': '에너지', explosives: '폭발형', special: '특수', pistols: '권총', melee: '근접', standard: '표준',
}, {
  'assault-rifles': 'Assault rifles', 'marksman-rifles': 'Marksman rifles', 'sniper-rifles': 'Sniper rifles', shotguns: 'Shotguns', 'submachine-guns': 'SMGs',
  'energy-based': 'Energy', explosives: 'Explosive', special: 'Special', pistols: 'Pistols', melee: 'Melee', standard: 'Standard',
});
// Subtypes in the order players think of them, used by chips and grouped lists.
const TYPE_ORDER = ['assault-rifles', 'marksman-rifles', 'sniper-rifles', 'submachine-guns', 'shotguns', 'explosives', 'energy-based', 'pistols', 'melee', 'standard', 'special'];
export const orderTypes = types => [...types].sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
export const typeName = type => TYPE_NAMES[type] || type || L('기타', 'Other');
export const weaponById = new Map(personalWeapons.map(weapon => [weapon.id, weapon]));
// Use the weapon's own English name: Korean names can also name an enemy
// (e.g. 스토커 is both the Stoker weapon and the Stalker enemy).
export const displayName = w => L(w.name || w.en, w.en || w.name);

// The recoil cell for a gear or support weapon detail (weapon-recoil.js, key 'gear/<id>' or 'arsenal/<id>'): the
// game armory screen's recoil, horizontal / vertical with the default attachments; the simulation is recoil-sim.js.
// Launchers whose round flies on its own motor show the same small kick (2.5 / 10) as melee weapons; the
// source does not say why, so the note says it is our reading (user request 2026-11-24).
const SELF_PROPELLED = new Set(['arsenal/commando', 'arsenal/expendable-at', 'arsenal/expendable-napalm', 'arsenal/leveller', 'arsenal/spear', 'arsenal/wasp']);

// Ergonomics as the game's armory screen shows it (default attachments included, game data sheet), else null
// and the view keeps the wiki value (user decision 2026-11-25).
export const gameErgonomics = key => weaponRecoil[key]?.ergonomics ?? null;

export function recoilStats(key) {
  const recoil = weaponRecoil[key];
  if (!recoil) return [];
  const rocket = SELF_PROPELLED.has(key) ? L(' · 로켓이 스스로 날아가 반동이 거의 없는 것으로 보임', ' · the rocket flies on its own motor, so there is little kick (our reading)') : '';
  const pair = ([h, v]) => `${h} / ${v}`;
  const screen = recoil.screen ?? [0, 1].map(a => (recoil.drift[a] + recoil.climb[a]) / 2);
  const limit = recoil.limit ? L(` · 위로 ${recoil.limit[0]}도부터 수직 반동 줄어듦`, ` · vertical kick eases off from ${recoil.limit[0]} degrees up`) : '';
  return [
    // (weapon kick + view climb) / 2 with the default attachments (game data sheet); only this one is shown
    // (user request 2026-11-25), and a weapon the sheet lacks shows no recoil cell.
    // A 0 / 0 recoil (beam weapons) is left out, and with it the detailed stats when they hold nothing else
    // (user request 2026-11-25).
    // The game data sheet first; without it the wiki datamine's kick and climb, averaged the way the armory screen
    // does, before attachments (user decision 2026-11-25: both usable, the sheet first).
    ...(screen.some(v => v) ? [{ label: L('반동', 'Recoil'), text: pair(screen), caption: (recoil.screen ? L('수평 / 수직 · 기본 부착물 기준', 'Horizontal / vertical · default attachments') : L('수평 / 수직 · 부착물 제외', 'Horizontal / vertical · no attachments')) + rocket + limit }] : []),
  ];
}
