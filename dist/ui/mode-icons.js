// Small icons for the firing mode tabs, redrawn after the in-game weapon wheel (the wiki's weapon wheel screenshots,
// e.g. File:AC-8_Autocannon_WW.png, File:AR-11_Arbitrator_WW.png; user request 2026-11-25). One colour
// (currentColor), so they follow the button's text in both themes and when picked. The Patriot and Lumberer
// exosuits follow their in-game HUD (user screenshots 2026-11-27). No icon where neither is at hand (Emancipator,
// Breakthrough, SEAF Artillery) or where the wheel shows none (Epoch). The Airburst Rocket Launcher's and the
// W.A.S.P.'s wheel modes (Cluster / Flak, Burst / Artillery) mark their firing mode block, not their stat tabs.
import { raw } from './dom.js';

// A round pointing right: body from x, w long, h tall, with a half-ellipse nose of length n.
const round = (x, y, w, h, n = h) => `M${x} ${y}h${w - n}a${n} ${h / 2} 0 0 1 0 ${h}H${x}z`;
// A star burst around (cx, cy) with k points.
const star = (cx, cy, outer, inner, k) => `M${Array.from({ length: k * 2 }, (_, i) => {
  const r = i % 2 ? inner : outer, a = (Math.PI * i) / k - Math.PI / 2;
  return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join('L')}z`;

const fill = d => `<path d="${d}"/>`;
const ICONS = {
  // 4MM, 8MM, 12MM, Semi, Safe: one round.
  round: fill(round(2, 9, 20, 6, 7)),
  // 10G: a shotgun shell, rim and body.
  shell: fill('M2 7h3v10H2zM6 8h16v8H6z'),
  // 40MM HE: a grenade round with its rim.
  grenade: fill('M3 6h2v12H3zM6 7h9a5 5 0 0 1 0 10H6z'),
  // FLAMETHROWER: a flame.
  flame: fill('M12 1.5c.6 3.6 6 6.2 6 12.2a6 6 0 0 1-12 0c0-3.2 1.8-5.3 3-6.4.1 2.4 1.2 3.6 2.4 3.6-.6-3.4-.5-6.4.6-9.4z'),
  // FLECHETTE: a dart pointing down.
  flechette: fill('M8 2l4 3 4-3v4l-4 3-4-3zM11 8h2v8h-2zM6.5 14h11L12 22.5z'),
  // STUN: a round standing up with a spark beside it.
  stun: fill('M7 22V11a3.5 3.5 0 0 1 7 0v11zM19 2l1.1 3 2.9 1.1-2.9 1.1L19 10.2l-1.1-3L15 6.1l2.9-1.1z'),
  // Auto: three rounds, close.
  auto: fill([round(2, 2.5, 20, 5.5, 6), round(2, 9.25, 20, 5.5, 6), round(2, 16, 20, 5.5, 6)].join('')),
  // Volley, All Barrels: three rounds, spaced.
  volley: fill([round(4, 3, 17, 4, 5), round(4, 10, 17, 4, 5), round(4, 17, 17, 4, 5)].join('')),
  // Total: two columns of rounds.
  total: fill([0, 1, 2, 3].flatMap(i => [round(1, 2 + i * 5.3, 10, 3.4, 3.5), round(13, 4.6 + i * 5.3, 10, 3.4, 3.5)]).slice(0, 7).join('')),
  // Non-Guided: a sight with a line down from its middle.
  sight: '<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M12 12v6"/></g>',
  // Guided: the sight with a target marker and the curve to it.
  guided: '<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M10.4 11.5c.4 2.6 1.1 4.6 1.6 6.5"/><path d="M10 6.6l2.2 3.8H7.8z"/></g>',
  // FLAK: a fighter jet.
  jet: fill('M12 1l1.4 4.6v4.2l8.1 5v2.1l-8.1-2.5v4.2l2.6 2v1.5L12 21.1 8 22.1v-1.5l2.6-2v-4.2L2.5 16.9v-2.1l8.1-5V5.6z'),
  // APHET: a shield on a line and a burst.
  aphet: fill(`M1 11.3h3.3v1.4H1zM4.8 8.2h5.4v3.9c0 2-1.6 3.5-2.7 4-1.1-.5-2.7-2-2.7-4zM10.7 11.3h2.5v1.4h-2.5z${star(18.6, 12, 5.2, 2.4, 10)}`),
  // HE: a burst.
  burst: fill(star(12, 12, 11, 5, 12)),
  // HEAT: a burst and a tank.
  heat: fill(`${star(9, 9, 8, 3.6, 11)}M11 18h12v3.2H11zM13.5 15.6h5.5v2.4h-5.5zM19 16.3h4.5v1H19z`),
  // Vehicle HUD (TD-220 Bastion Main WW, TD-110 Maelstrom Gunner WW): a standing shell for the main gun or missile,
  // three standing rounds for the machine guns, each over a base line.
  shellUp: fill('M9.5 7.5L12 3l2.5 4.5V19h-5zM8.5 20.5h7V22h-7z'),
  roundsUp: fill(['M4.5 9L6.5 5l2 4v10h-4z', 'M10 9l2-4 2 4v10h-4z', 'M15.5 9l2-4 2 4v10h-4z'].join('') + 'M4 20.5h16V22H4z'),
  // Exosuit HUD (EXO-45 Patriot, EXO-51 Lumberer): a standing rocket with fins and a split tail, and an angular
  // flame with a diamond on a stem cut out of its foot.
  rocketUp: fill('M9.5 5.5L12 2l2.5 3.5V21h-1.8v-6.5h-1.4V21H9.5zM8.7 14.5L5 21h3.7zM15.3 14.5L19 21h-3.7z'),
  flameHud: fill('M9.6 2.5l5.1 7 1.2-.7 2.6 4.7V17l-4.7 4.5H13v-3.3l2-1.9-2.8-2.9-2.8 2.9 2 1.9v3.3h-.8L5.4 16.5V13l4.2-4z'),
  // CLUSTER: a broken ring with a centre and two crossing lines.
  cluster: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="7" stroke-dasharray="6.5 4.5"/><path d="M5 3l13 17M19 3L7.5 18"/></g><circle cx="12" cy="12.5" r="2.6"/>',
  // Burst (W.A.S.P.): three rockets on a rail.
  rockets: fill(`M2.5 3h1.6v18H2.5z${[4, 10.25, 16.5].map(y => `M4.1 ${y + 0.6}h2.4v2.3H4.1z${round(6.5, y, 15.5, 3.5, 4)}`).join('')}`),
  // Artillery (W.A.S.P.): a shot coming down onto a burst on the ground.
  artillery: fill(`M11.2 1h1.6v10.5h-1.6z${star(12, 16, 6.5, 2.6, 10)}M2.5 21h19v1.6h-19z`),
  // Unsafe: a round with speed lines behind it.
  unsafe: fill(`M1.5 8.5h1.4v7H1.5zM4.2 8.5h1.4v7H4.2zM6.9 8.5h1.4v7H6.9z${round(9.5, 9, 13, 6, 6)}`),
};

// The icon of each mode tab, by item key ('gear/<id>' or 'arsenal/<id>') and mode id.
const MODES = {
  'gear/arbitrator': { standard: 'round', underbarrel: 'shell' },
  'gear/one-two': { standard: 'round', underbarrel: 'grenade' },
  'gear/stoker': { standard: 'round', underbarrel: 'flame' },
  'gear/halt': { flechette: 'flechette', stun: 'stun' },
  'gear/double-freedom': { standard: 'round', 'all-barrels': 'volley' },
  'gear/bushwhacker': { standard: 'round', 'all-barrels': 'volley' },
  'gear/variable': { standard: 'auto', volley: 'volley', total: 'total' },
  'gear/missile-pistol': { unguided: 'sight', guided: 'guided' },
  'gear/warrant': { unguided: 'sight', guided: 'guided' },
  'arsenal/autocannon': { aphet: 'aphet', flak: 'jet' },
  'arsenal/recoilless': { heat: 'heat', he: 'burst' },
  'arsenal/railgun': { safe: 'round', 'unsafe-max': 'unsafe' },
  'arsenal/bastion': { main: 'shellUp', coax: 'roundsUp' },
  'arsenal/patriot': { rocket: 'rocketUp', mg: 'roundsUp' },
  'arsenal/lumberer': { cannon: 'shellUp', flame: 'flameHud' },
  // Firing mode blocks (item.firingModes).
  'arsenal/airburst-launcher': { cluster: 'cluster', flak: 'jet' },
  'arsenal/wasp': { burst: 'rockets', artillery: 'artillery' },
  'arsenal/maelstrom': { missile: 'shellUp', gatling: 'roundsUp' },
};

export const modeIconKeys = MODES;
export const modeIconNames = Object.keys(ICONS);

// The icon for a mode tab, or '' when the weapon has none.
export function modeIcon(key, mode) {
  const name = MODES[key]?.[mode];
  return name ? raw(`<svg class="mode-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`) : '';
}
