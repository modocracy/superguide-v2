// "Detailed stats" block of the gear and stratagem detail sheets: the datamine flight values of a
// weapon's projectiles, how much damage is left with range and how far the shot drops
// (dist/core/ballistics.js). Charts follow the site's single-series style: one axis each, a
// crosshair readout on hover, and the same numbers in the table under them.
import { html } from './dom.js';
import { detailDisclosure } from './item-detail.js';
import { L } from '../core/i18n.js';
import { tipLabel } from './tips.js';
import { num } from '../core/explain.js';
import { projectileBallistics } from '../data/ballistics.js';
import { dragOf, falloffAt, speedAt, timeAt, trajectory } from '../core/ballistics.js';

const MAX = 200;
// A shot that drops a lot (the Ultimatum, grenade fragments) is drawn only out to the farthest of these ranges where
// its level-fire drop stays within DROP_LIMIT metres (user request 2026-11-26), with table rows to suit the range.
// A projectile the weapon fires keeps at least MIN_FIRED metres (the Ultimatum: 50 m); fragments and bomblets an
// explosion throws out (record.thrown) may go shorter.
const RANGES = [200, 150, 100, 50, 25, 10];
const DROP_LIMIT = 30, MIN_FIRED = 50;
const MARKS = { 200: [25, 50, 100, 150, 200], 150: [25, 50, 75, 100, 150], 100: [10, 25, 50, 75, 100], 50: [10, 20, 30, 40, 50], 25: [5, 10, 15, 20, 25], 10: [2, 4, 6, 8, 10] };
const W = 320, H = 150, PAD = { l: 52, r: 26, t: 14, b: 30 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;
const round = (value, step) => Math.round(value / step) * step;
// How the two charts are worked out, as tooltips on their titles (user request 2026-11-26: not a note under the block).
const DAMAGE_TIP = L('탄 피해는 맞을 때의 탄속으로 정해집니다: 0.25 + 0.75 × (맞을 때 탄속 ÷ 처음 탄속)². 그래서 아무리 멀어도 25% 밑으로는 줄지 않고, 관통력은 거리와 상관없이 그대로입니다. 그래프와 표의 탄 피해, 도달 시간, 탄속은 같은 높이의 표적을 맞힐 때처럼 항력만 넣어 계산한 값입니다. 위로 쏘면 더 줄고 아래로 쏘면 덜 줄며, 달리면서 쏘면 이동 속도가 더해져 100%를 넘을 수도 있습니다. 무언가를 뚫고 나간 탄은 느려져 다음 피해가 줄어듭니다.',
  'Shot damage is set by the speed at impact: 0.25 + 0.75 × (speed at impact ÷ muzzle velocity)². So it never falls below 25% however far, and armor penetration stays the same at any range. In the chart and the table, shot damage, flight time and speed are calculated with drag only, as for a target at the same height. Shooting upward loses more and downward less, and firing on the move adds your speed, which can take it past 100%. A round that passes through something slows down, so its next hit does less.');
const DROP_TIP = L('낙차는 중력 9.82m/s²에 중력 배율을 곱하고 항력을 함께 넣어 수평으로 쐈을 때를 계산한 값입니다. 낙차가 30m를 넘는 탄은 그보다 가까운 거리까지만 보여 주고(직접 쏘는 탄은 최소 50m), 탄 수명이 다해 사라지는 탄은 사라지는 거리까지만 보여 줍니다.',
  'Drop uses gravity of 9.82 m/s² times the gravity multiplier, with drag, for a level shot. A shot that drops more than 30 m is shown only out to a nearer range (at least 50 m for a fired round), and a shot whose lifetime runs out only as far as it flies.');

// Cache computed projectile curves so switching panel <-> fullscreen never re-integrates trajectories.
const FLIGHT_CACHE = new Map();
function computeFlight(recordId, propelled) {
  const key = propelled ? `${recordId}|p` : recordId;
  let cached = FLIGHT_CACHE.get(key);
  if (cached) return cached;
  const record = projectileBallistics[recordId];
  const b = propelled ? { ...record, drag: 0 } : record;
  const drag = dragOf(b);
  const { points, endX } = trajectory(b, MAX);
  const at = x => (points[x]?.x === x ? points[x] : points.find(p => p.x === x));
  // A distance the flight never reaches (a short lifetime) is judged by where it ends: the curve just stops there.
  const ranges = record.thrown ? RANGES : RANGES.filter(x => x >= MIN_FIRED);
  let max = ranges.find(x => (at(x) ?? points.at(-1)).drop <= DROP_LIMIT) ?? ranges.at(-1);
  // A shot whose lifetime ends it short of that range (the Epoch at 148 m) is drawn only as far as it flies, the axis
  // rounded up to 10 m (5 m under 10 m) (user request 2026-11-26).
  const ends = endX != null && endX < max;
  if (ends) max = endX < 10 ? Math.max(5, Math.ceil(endX / 5 - 0.01) * 5) : Math.ceil(endX / 10 - 0.01) * 10;
  const step = max >= 50 ? 2 : 1;
  const shown = points.filter(p => p.x <= max);
  const damage = [];
  const drop = [];
  let maxDrop = 0.1;
  for (let i = 0; i < shown.length; i++) {
    const p = shown[i];
    if (p.drop > maxDrop) maxDrop = p.drop;
    if (p.x % step === 0 || i === shown.length - 1) {
      damage.push({ x: p.x, y: falloffAt(b, p.x) * 100 });
      drop.push({ x: p.x, y: p.drop });
    }
  }
  const dropTop = maxDrop < 1 ? Math.ceil(maxDrop * 10) / 10 : maxDrop < 10 ? Math.ceil(maxDrop) : Math.ceil(maxDrop / 5) * 5;
  // Table rows: the standard ones of the range; for a flight that ends short, those of the next standard range up
  // before its end, then the last whole metre it reaches.
  const marks = ends ? [...MARKS[[...RANGES].reverse().find(r => r >= max)].filter(x => x < Math.floor(endX)), Math.floor(endX)] : MARKS[max];
  const markFalloff = marks.map(x => Math.round(falloffAt(b, x) * 100));
  cached = { record, b, drag, at, endX, damage, drop, dropTop, marks, markFalloff, max, step };
  FLIGHT_CACHE.set(key, cached);
  return cached;
}

// One line over 0-`max` m. `top`/`bottom` are the values at the top and bottom of the plot.
function chart(title, points, { top, bottom, ticks, label, max = MAX, step = 2, tip = '' }) {
  const px = x => PAD.l + (x / max) * PLOT_W;
  const py = y => PAD.t + ((top - y) / (top - bottom)) * PLOT_H;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join('');
  const data = points.map(p => `${p.x},${+p.y.toFixed(3)}`).join(';');
  return html`<figure class="ballistic-chart"><figcaption>${tip ? tipLabel(title, tip) : title}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}" data-points="${data}" data-label="${label}" data-top="${top}" data-bottom="${bottom}" data-max="${max}" data-step="${step}">
      ${ticks.map(t => html`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${py(t.value)}" y2="${py(t.value)}" class="grid"/><text x="${PAD.l - 7}" y="${py(t.value) + 5}" text-anchor="end">${t.text}</text>`)}
      ${[0, 0.25, 0.5, 0.75, 1].map(f => html`<text x="${px(f * max)}" y="${H - 5}" text-anchor="middle">${num(f * max)}m</text>`)}
      <path d="${path}" class="line"/>
      <g class="hover" visibility="hidden"><line class="cross" y1="${PAD.t}" y2="${H - PAD.b}"/><circle r="4"/><text class="readout"/></g>
    </svg></figure>`;
}

// A rocket-propelled shot keeps its speed: no drag in the damage and drop math (its datamine drag
// is still listed).
// extra: cells appended at the end of the record's grid (the weapon's recoil, with the other numbers).
// Self-propelled shots whose datamine speed is only the launch (the Missile Pistol: 1 m/s for 3 s, so the flight math
// would end it at 3 m): no charts or table, the wiki's flight facts instead (P-33 Missile Pistol page rev 140479:
// speeds up to about 50-70 m/s, maximum range about 197 m with no drop, lock-on out to 100 m; user decision 2026-11-26).
const MISSILE_PISTOL = { range: 197, lock: 100 };
const SELF_PROPELLED = { 'P-33_P': MISSILE_PISTOL, 'P-33_P1': MISSILE_PISTOL };
function selfPropelledBlock(label, recordId, extra) {
  const b = projectileBallistics[recordId], flight = SELF_PROPELLED[recordId];
  const cell = (name, value, unit, caption) => html`<div><dt>${name}</dt><dd>${value}${unit ? html`<small>${unit}</small>` : ''}</dd>${caption ? html`<div class="caption">${caption}</div>` : ''}</div>`;
  const ap = b.ap?.some(v => v != null) ? `AP ${b.ap.map(v => num(v)).join(' / ')}` : '—';
  return html`<div class="ballistic">
    ${label ? html`<h4>${label}</h4>` : ''}
    <dl class="detail-grid">
      ${cell(L('탄속', 'Speed'), L('1 → 약 50~70', '1 → about 50-70'), 'm/s', L('천천히 출발해 날아가며 빨라짐', 'Starts slow and speeds up in flight'))}
      ${cell(L('질량', 'Mass'), num(b.mass), 'g')}
      ${cell(L('구경', 'Caliber'), num(b.caliber), 'mm')}
      ${cell(L('최대 사거리', 'Maximum range'), L(`약 ${num(flight.range)}`, `About ${num(flight.range)}`), 'm', L('떨어지지 않고 곧게 날아감', 'Flies straight, no drop'))}
      ${cell(L('유도 고정 거리', 'Lock-on range'), num(flight.lock), 'm', L('유도 사격으로 적을 고정할 수 있는 최대 거리', 'The farthest a guided shot can lock on'))}
      ${cell(L('각도별 관통', 'Penetration by angle'), ap, '', L('25° 미만 · 26~60° · 61~80° · 81~90°', 'Under 25° · 26-60° · 61-80° · 81-90°'))}
      ${extra}
    </dl>
  </div>`;
}

// How far a shot flies before its lifetime runs out, past the charts' range (the Breacher's 1.7 s: about 250 m), along
// the straight path: ln(1 + D * v0 * T) / D, or v0 * T without drag; rounded to 10 m (user request 2026-11-26).
// Where play shows a round flying farther than its datamine lifetime allows (user's play experience 2026-11-26: the
// Breacher hits a Grounded Warp Ship from about 400 m), the caption says both.
const PLAYED_REACH = { 'P-34_P': 400 };
const lifeReach = b => { const d = dragOf(b), x = d ? Math.log(1 + d * b.velocity * b.lifetime) / d : b.velocity * b.lifetime; return Math.round(x / 10) * 10; };

function recordBlock(label, recordId, propelled, extra = '') {
  if (SELF_PROPELLED[recordId]) return selfPropelledBlock(label, recordId, extra);
  const { record, b, drag, at, endX, damage, drop, dropTop, marks, markFalloff, max, step } = computeFlight(recordId, propelled);
  const cell = (name, value, unit, caption) => html`<div><dt>${name}</dt><dd>${value}${unit ? html`<small>${unit}</small>` : ''}</dd>${caption ? html`<div class="caption">${caption}</div>` : ''}</div>`;
  const ap = b.ap?.some(v => v != null) ? `AP ${b.ap.map(v => num(v)).join(' / ')}` : '—';
  // A drop that rounds to zero shows as 0, not -0 (a shot that rises a hair at first).
  const dropText = y => (dropTop < 2 ? `${num(Math.round(y * 100) || 0)}cm` : `${num(round(y, 0.1) || 0)}m`);
  return html`<div class="ballistic">
    ${label ? html`<h4>${label}</h4>` : ''}
    <dl class="detail-grid">
      ${cell(L('탄속', 'Muzzle velocity'), num(b.velocity), 'm/s')}
      ${cell(L('질량', 'Mass'), num(b.mass), 'g')}
      ${cell(L('구경', 'Caliber'), num(b.caliber), 'mm')}
      ${cell(L('항력계수', 'Drag coefficient'), num(record.drag), '', propelled ? L('로켓 추진으로 속도가 유지되어 계산에서 뺌', 'Left out: rocket propulsion keeps its speed') : L('클수록 빨리 느려짐', 'Higher slows it sooner'))}
      ${cell(L('중력 배율', 'Gravity multiplier'), num(b.gravity), '×', b.gravity ? L('클수록 많이 떨어짐', 'Higher drops more') : L('떨어지지 않고 곧게 날아감', 'Flies straight, no drop'))}
      ${cell(L('탄 수명', 'Lifetime'), b.lifetime ? num(b.lifetime) : L('제한 없음', 'No limit'), b.lifetime ? L('초', 's') : '', endX != null ? L(`약 ${num(Math.round(endX))}m에서 사라짐`, `Gone at about ${num(Math.round(endX))} m`) : PLAYED_REACH[recordId] ? L(`자료상 약 ${num(lifeReach(b))}m · 실전에서는 약 ${num(PLAYED_REACH[recordId])}m까지 맞힘`, `About ${num(lifeReach(b))} m by the data · hits out to about ${num(PLAYED_REACH[recordId])} m in play`)
        : b.lifetime ? L(`약 ${num(lifeReach(b))}m까지 날아감`, `Flies about ${num(lifeReach(b))} m`) : '')}
      ${cell(L('각도별 관통', 'Penetration by angle'), ap, '', L('25° 미만 · 26~60° · 61~80° · 81~90°', 'Under 25° · 26-60° · 61-80° · 81-90°'))}
      ${extra}
    </dl>
    <div class="ballistic-charts">
      ${chart(L('거리별 탄 피해', 'Shot damage by distance'), damage, { top: 100, bottom: 25, label: '%', max, step, tip: DAMAGE_TIP, ticks: [100, 75, 50, 25].map(v => ({ value: v, text: `${v}%` })) })}
      ${chart(L('낙차', 'Drop'), drop, { top: 0, bottom: dropTop, label: dropTop < 2 ? 'cm' : 'm', max, step, tip: DROP_TIP, ticks: [0, dropTop / 2, dropTop].map(v => ({ value: v, text: dropText(v) })) })}
    </div>
    <div class="compare-scroll" role="region" aria-label="${L('거리별 값', 'Values by distance')}" tabindex="0"><table class="compare-table ballistic-table">
      <thead><tr><th scope="col">${L('거리', 'Distance')}</th><th scope="col">${L('탄 피해', 'Shot damage')}</th><th scope="col">${L('낙차', 'Drop')}</th><th scope="col">${L('도달 시간', 'Flight time')}</th><th scope="col">${L('탄속', 'Speed')}</th></tr></thead>
      <tbody>${marks.map((x, idx) => { const p = at(x); return html`<tr><th scope="row">${x}m</th>
        <td>${markFalloff[idx]}%</td>
        <td>${p ? dropText(p.drop) : '—'}</td>
        <td>${p ? `${num(round(timeAt(b, x), 0.01))}${L('초', 's')}` : '—'}</td>
        <td>${p ? `${num(Math.round(speedAt(b, x)))}m/s` : '—'}</td></tr>`; })}</tbody>
    </table></div>
  </div>`;
}

// entries: [{ label, record }] in display order; repeated records are shown once.
// recoil: the weapon's recoil cells [{ label, text, unit, caption }] (user request 2026-11-24: recoil sits here,
// not in the key stats). No sub-headings (user request 2026-11-24): with one projectile its recoil cells end the same
// grid; with several, each keeps its name and the recoil cells follow in a grid of their own; they alone are
// enough to show the block.
// recoil: the weapon's recoil cells. They are numbers, so they join the numbers of the first round (or stand alone
// when there is none); the recoil simulation is a disclosure of its own (recoil-sim.js, user request 2026-11-25).
export function ballisticsBlock(entries, expanded = false, recoil = []) {
  // A record whose flight numbers and penetration match one already listed adds nothing (the Missile Pistol's and the
  // Warrant's second projectile record), so it is shown once (user request 2026-11-26).
  const seen = new Set();
  const flightKey = e => `${JSON.stringify(projectileBallistics[e.record])}|${e.propelled ? 'p' : ''}`;
  const list = entries.filter(e => e.record && projectileBallistics[e.record]?.velocity > 0 && !seen.has(flightKey(e)) && seen.add(flightKey(e)));
  if (list.length) wireBallisticCharts();
  const recoilCell = c => html`<div><dt>${c.label}</dt><dd>${c.text}${c.unit ? html`<small>${c.unit}</small>` : ''}</dd>${c.caption ? html`<div class="caption">${c.caption}</div>` : ''}</div>`;
  if (!list.length && !recoil.length) return '';
  const content = html`${list.map((e, i) => recordBlock(list.length > 1 ? e.label : '', e.record, e.propelled, i === 0 ? recoil.map(recoilCell) : ''))}
    ${recoil.length && !list.length ? html`<div class="ballistic"><dl class="detail-grid">${recoil.map(recoilCell)}</dl></div>` : ''}
  `;
  return detailDisclosure(L('세부 수치', 'Detailed stats'), content, { className: 'ballistic-block', expanded });
}

// Crosshair readout: cache parsed coordinates + DOM nodes per SVG and avoid global querySelectorAll on pointermove.
let wired = false;
let activeSvg = null;
const SVG_META = new WeakMap();
function svgMeta(svg) {
  let meta = SVG_META.get(svg);
  if (meta) return meta;
  const g = svg.querySelector('.hover');
  const pairs = svg.dataset.points.split(';');
  const points = new Array(pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    const comma = pairs[i].indexOf(',');
    points[i] = [Number(pairs[i].slice(0, comma)), Number(pairs[i].slice(comma + 1))];
  }
  meta = {
    points,
    top: Number(svg.dataset.top),
    bottom: Number(svg.dataset.bottom),
    max: Number(svg.dataset.max) || MAX,
    step: Number(svg.dataset.step) || 2,
    unit: svg.dataset.label,
    g,
    cross: g.querySelector('.cross'),
    circle: g.querySelector('circle'),
    text: g.querySelector('.readout'),
  };
  SVG_META.set(svg, meta);
  return meta;
}

export function wireBallisticCharts() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  const hide = svg => SVG_META.get(svg)?.g?.setAttribute('visibility', 'hidden');
  document.addEventListener('pointermove', event => {
    const svg = event.target.closest?.('.ballistic-chart svg') ?? null;
    if (activeSvg && activeSvg !== svg) hide(activeSvg);
    activeSvg = svg;
    if (!svg) return;
    const { points, top, bottom, max, step, unit, g, cross, circle, text } = svgMeta(svg);
    if (!points.length) return;
    const box = svg.getBoundingClientRect();
    const vx = ((event.clientX - box.left) / box.width) * W;
    const x = Math.max(0, Math.min(max, ((vx - PAD.l) / PLOT_W) * max));
    const idx = Math.min(points.length - 1, Math.max(0, Math.round(x / step)));
    const pt = points[idx]?.[0] === Math.round(x / step) * step
      ? points[idx]
      : points.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best), points[0]);
    const [px, py] = pt;
    const sx = PAD.l + (px / max) * PLOT_W;
    const sy = PAD.t + ((top - py) / (top - bottom)) * PLOT_H;
    g.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', sx); cross.setAttribute('x2', sx);
    circle.setAttribute('cx', sx); circle.setAttribute('cy', sy);
    text.textContent = `${px}m · ${unit === '%' ? `${Math.round(py)}%` : unit === 'cm' ? `${Math.round(py * 100)}cm` : `${Math.round(py * 10) / 10}m`}`;
    const right = sx > W / 2;
    text.setAttribute('x', right ? sx - 6 : sx + 6);
    text.setAttribute('y', PAD.t + 15);
    text.setAttribute('text-anchor', right ? 'end' : 'start');
  });
}
