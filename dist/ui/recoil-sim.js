// Recoil simulation on a weapon's detail page (user request 2026-11-25), drawn like the game armory's recoil
// simulation: the crosshair stays fixed where you first aimed and the hits climb away from it. Press fire and the
// weapon shoots a magazine (up to 30 rounds) at its fire rate; a shotgun's pellets scatter over its spread.
// Inputs (weapon-recoil.js `sim`, game data sheet): drift (the weapon moves on screen) and climb (the view moves),
// [horizontal, vertical] after the default attachments, each with a horizontal bias and random ratios
// [vertical, horizontal], the fire rate, the magazine, the spread [horizontal, vertical] in MRAD and the pellets.
// Rules from helldiversotl.com/research/recoil: stance multipliers (aimed, standing still), drift keeps the larger
// of the current and the new kick on each axis, a new climb kick replaces the one still being applied, and once the
// view is more than about 0.57 degrees to one side a kick back towards the middle is cut to 1/16.
// The build PC's reference (db/source/game_sheets/recoil_reconstruction.md, 2026-11-25) found none of the site
// estimates below, nor the stance multipliers, in the game data: they stay estimates.
// Vertical climb follows a spring fitted to recordings of the game armory's recoil simulation (recoil_reconstruction.md
// section 8, approved 2026-11-25): each round adds SPRING_KICK x its climb kick to the view's vertical speed, and
// between rounds the view is pulled back, y'' = -w^2 y - 2 z w y' (w = 4.95 rad/s, z = 0.45). It climbs, overshoots
// and then holds (Coyote at 600 RPM peaks around the 8th round and holds at about 0.8 of the peak); one round alone
// peaks at its kick after 0.25 s, so one unit is still 0.01 degrees per round.
// Site estimates (the game data does not give them): one unit = 0.01 degrees per round, drift settles with a
// 0.12 s time constant, a horizontal climb kick plays out with a 0.01 s one and stays (the recordings did not settle
// the horizontal), each pellet lands evenly inside an ellipse whose half-widths are the spread, and semi and burst
// fire pull the trigger every 0.15 s at most. So the shape compares weapons; the angles are approximate.
// Choices (user request 2026-11-25): stance, fire mode and fire rate (game data), the muzzle and the underbarrel
// (their multipliers on drift, climb and spread from the game data, against the fitted parts already in the inputs;
// chokes and the duckbill change only the spread) and the armor passive
// that cuts recoil by 30% (Engineering Kit, Fortified: 0.7 in the game data; it works in every stance, armor.js).
import { weaponRecoil } from '../data/weapon-recoil.js';
import { L } from '../core/i18n.js';
import { html, raw } from './dom.js';
import { detailDisclosure } from './item-detail.js';

const UNIT = 0.01, DRIFT_TAU = 0.12, CLIMB_TAU = 0.01, TURN = 0.57, MAX_SHOTS = 30, STEP = 1 / 240;
const SPRING_W = 4.95, SPRING_Z = 0.45, SPRING_KICK = 8.64; // vertical climb spring (game recordings)
const MRAD = 180 / Math.PI / 1000; // degrees per milliradian
const PULL = 0.15, PASSIVE = 0.7; // seconds between trigger pulls (estimate); the recoil passive's multiplier
const STANCES = [['stand', 0.9, () => L('서서', 'Standing')], ['crouch', 0.6, () => L('앉아서', 'Crouched')], ['prone', 0.4, () => L('엎드려서', 'Prone')]];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// One shot's kick on [horizontal, vertical] for drift or climb (index i into bias and random); viewX = the view's
// horizontal angle now.
function kick(sim, i, scale, viewX) {
  const [rv, rh] = sim.random[i];
  const base = i ? sim.climb : sim.drift;
  let h = base[0] * UNIT * scale * clamp(sim.bias[i] + rh * (Math.random() * 2 - 1), -1, 1);
  const v = base[1] * UNIT * scale * (1 - rv * Math.random());
  if (Math.abs(viewX) > TURN && Math.sign(h) === -Math.sign(viewX)) h /= 16;
  return [h, v];
}

// Where each pellet of one shot lands around the aim point [x, y] (degrees).
function scatter(sim, x, y) {
  const [sh, sv] = (sim.spread ?? [0, 0]).map(v => v * MRAD);
  return Array.from({ length: sim.pellets ?? 1 }, () => {
    const r = Math.sqrt(Math.random()), a = Math.random() * 2 * Math.PI;
    return [x + sh * r * Math.cos(a), y + sv * r * Math.sin(a)];
  });
}

// The whole burst, sampled every STEP seconds: view (where the screen points), drift (the weapon's offset from it)
// and the hits (view + drift at each shot, with the points its pellets land on). Angles in degrees, up = positive,
// 0 = where you first aimed. sim.mode ('auto', 'semi' or 'burst' of sim.burst rounds) sets when each round fires.
export function simulate(sim, scale) {
  const shots = clamp(sim.magazine ?? 1, 1, MAX_SHOTS), gap = 60 / sim.rpm;
  const mode = sim.mode ?? sim.modes?.[0] ?? 'auto';
  const n = mode === 'burst' ? sim.burst || 1 : mode === 'semi' ? 1 : Infinity;
  // Round k: a burst (or a single semi shot) at the fire rate, the next one a trigger pull later.
  const timeOf = k => (n === Infinity ? k * gap : Math.floor(k / n) * ((n - 1) * gap + Math.max(gap, PULL)) + (k % n) * gap);
  const end = timeOf(shots - 1) + 0.5;
  const view = [0, 0], drift = [0, 0];
  let pending = [0, 0], climbSpeed = 0, next = 0, fired = 0;
  const frames = [], hits = [];
  const settle = Math.exp(-STEP / DRIFT_TAU), take = 1 - Math.exp(-STEP / CLIMB_TAU);
  const steps = Math.ceil(end / STEP);
  for (let i = 0; i <= steps; i++) {
    const t = i * STEP;
    if (fired < shots && t + STEP / 2 >= next) {
      const x = view[0] + drift[0], y = view[1] + drift[1];
      hits.push({ t, x, y, points: scatter(sim, x, y) });
      const d = kick(sim, 0, scale, view[0]), c = kick(sim, 1, scale, view[0]);
      for (const a of [0, 1]) if (Math.abs(d[a]) > Math.abs(drift[a])) drift[a] = d[a];
      pending = [c[0], 0];
      climbSpeed += c[1] * SPRING_KICK;
      fired++; next = timeOf(fired);
    }
    for (const a of [0, 1]) {
      drift[a] *= settle;
      if (a === 1) {
        climbSpeed += (-SPRING_W * SPRING_W * view[1] - 2 * SPRING_Z * SPRING_W * climbSpeed) * STEP;
        view[1] += climbSpeed * STEP;
        continue;
      }
      const move = pending[a] * take;
      view[a] += move; pending[a] -= move;
    }
    frames.push({ t, view: [...view], drift: [...drift] });
  }
  return { frames, hits, shots, gap, end };
}

// The inputs for one set of choices: { mode, rpm, slots } (slots: slot name -> index into that slot's options).
export function configure(sim, { mode, rpm, slots = {} } = {}) {
  const out = { ...sim, mode: mode ?? sim.modes?.[0] ?? 'auto', rpm: rpm ?? sim.rpm };
  for (const { slot, options, fitted } of sim.slots ?? []) {
    const from = options[fitted], to = options[slots[slot] ?? fitted];
    for (const k of ['drift', 'climb', 'spread']) out[k] = out[k].map((v, a) => v * to[k][a] / from[k][a]);
  }
  return out;
}

// The box: SIZE px square, the crosshair low in it (like the game), and a scale that fits the whole burst. Like the
// game's armory view, a dot marks each round; a shotgun shot shows a smaller dot per pellet (user request 2026-11-25).
const SIZE = 240, BASE_PX = 24, AIM_Y = SIZE * 0.72; // 24 px per degree when it all fits
const PAD_X = 16, PAD_TOP = 18, PAD_BOTTOM = 30; // room for the frame and the cross's arms
const STEPS = [0.25, 0.5, 1, 2, 5, 10, 20]; // grid square sizes in degrees
export function frameFor(run) {
  const xs = [0], ys = [0];
  for (const h of run.hits) for (const [x, y] of h.points) { xs.push(x); ys.push(y); }
  for (const f of run.frames) { xs.push(f.view[0] + f.drift[0]); ys.push(f.view[1] + f.drift[1]); }
  const top = Math.max(...ys), bottom = Math.min(...ys), side = Math.max(...xs.map(Math.abs));
  const px = Math.min(BASE_PX, (SIZE - PAD_TOP - PAD_BOTTOM) / Math.max(top - bottom, 1e-6), (SIZE - 2 * PAD_X) / 2 / Math.max(side, 1e-6));
  // Keep the crosshair low unless the hits need the room above it or below it.
  const oy = clamp(AIM_Y, PAD_TOP + top * px, SIZE - PAD_BOTTOM + bottom * px);
  // A fine grid like the game's (a square of 11 px or more).
  const grid = STEPS.find(step => step * px >= 11) ?? STEPS.at(-1);
  return { px, ox: SIZE / 2, oy, grid };
}

const fmt = n => (Math.round(n * 10) / 10).toLocaleString();
const SVG = 'http://www.w3.org/2000/svg';
const FRESH = 0.6; // seconds a round's dot stays yellow, as the newest hits do in the game
let uid = 0; // gradient ids per element

// Node (the checks) has no HTMLElement: the element is defined only in a browser.
const Base = globalThis.HTMLElement ?? class {};
class RecoilSim extends Base {
  connectedCallback() {
    this.sim = weaponRecoil[this.dataset.key]?.sim;
    if (!this.sim || this.built) return;
    this.built = true;
    const sim = this.sim;
    this.stance = 0;
    this.choice = { mode: sim.modes?.[0] ?? 'auto', rpm: sim.rpm, slots: Object.fromEntries((sim.slots ?? []).map(s => [s.slot, s.fitted])), passive: false };
    const SLOT_NAMES = { muzzle: L('총구', 'Muzzle'), underbarrel: L('총열 하부', 'Underbarrel') };
    const MODE_NAMES = { auto: L('자동', 'Auto'), semi: L('단발', 'Semi'), burst: L(`점사(${sim.burst}발)`, `Burst (${sim.burst})`) };
    this.modeName = mode => MODE_NAMES[mode];
    // A row of choices: data-choice names the field, data-value its value (JSON). A slot's pick lives under
    // choice.slots, so the fitted part shows as picked from the start.
    const picked = field => field.startsWith('slot:') ? this.choice.slots[field.slice(5)] : this.choice[field];
    const row = (label, field, items) => `<div class="recoil-sim-option"><span>${label}</span><div class="segmented" role="group" aria-label="${label}">${items.map(([value, name]) => `<button type="button" data-choice="${field}" data-value='${JSON.stringify(value)}' aria-pressed="${value === picked(field)}">${name}</button>`).join('')}</div></div>`;
    const options = [
      sim.modes?.length > 1 ? row(L('사격 방식', 'Fire mode'), 'mode', sim.modes.map(m => [m, MODE_NAMES[m]])) : '',
      sim.rpms ? row(L('연사 속도', 'Fire rate'), 'rpm', sim.rpms.map(r => [r, L(`분당 ${fmt(r)}`, `${fmt(r)} RPM`)])) : '',
      ...(sim.slots ?? []).map(({ slot, options, fitted }) => row(SLOT_NAMES[slot], `slot:${slot}`, options.map((o, i) => [i, `${L(o.ko, o.en)}${i === fitted ? `<small class="opt-default">${L('기본', 'default')}</small>` : ''}`]))),
      row(L('패시브', 'Passive'), 'passive', [[true, L('반동 30% 감소', 'Recoil -30%')]]),
    ].join('');
    const id = `rs${++uid}`, arm = 22;
    // Three parts: the choices, the view and the notes; side by side on a wide full-screen card (app.css). The view
    // copies the game armory's: a dark board with a fine grid, a thin frame, a glowing cross, and yellow dots for the
    // newest rounds and grey for older ones (the card's heading names it; no title or reload text in the view).
    this.innerHTML = `<div class="recoil-sim-side">
      <div class="recoil-sim-option"><span>${L('사격 자세', 'Stance')}</span>
        <div class="segmented" role="group" aria-label="${L('사격 자세', 'Stance')}">${STANCES.map(([, , name], i) => `<button type="button" data-stance="${i}" aria-pressed="${i === 0}">${name()}</button>`).join('')}</div>
        <button class="button small primary" type="button" data-fire>${L('발사', 'Fire')}</button>
      </div>
      ${options}</div>
      <svg class="recoil-sim-view" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${L('반동 시뮬레이션', 'Recoil simulation')}">
        <defs>
          <linearGradient id="${id}h"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
          <linearGradient id="${id}v" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
          <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
        </defs>
        <rect class="board" width="${SIZE}" height="${SIZE}"/>
        <g class="grid"></g>
        <path class="trail" d=""/>
        <g class="hits"></g>
        <g class="cross">
          <g filter="url(#${id}g)" opacity=".8"><rect x="${-arm}" y="-1.2" width="${arm * 2}" height="2.4" fill="url(#${id}h)"/><rect x="-1.2" y="${-arm}" width="2.4" height="${arm * 2}" fill="url(#${id}v)"/></g>
          <rect x="${-arm}" y="-.6" width="${arm * 2}" height="1.2" fill="url(#${id}h)"/><rect x="-.6" y="${-arm}" width="1.2" height="${arm * 2}" fill="url(#${id}v)"/>
        </g>
        <circle class="reticle" r="5"/>
        <rect class="frame" x="6" y="6" width="${SIZE - 12}" height="${SIZE - 12}"/>
      </svg>
      <div class="recoil-sim-notes"><p class="recoil-sim-readout" aria-live="polite"></p>
      <p class="caption"><span class="recoil-sim-setup"></span> · <span class="recoil-sim-scale"></span></p>
      <p class="caption">${L('십자 = 조준점(고정)<br>점 = 탄착군(노란색 = 방금 쏜 탄, 산탄총은 펠릿마다 작은 점)<br>선 = 총구 궤적<br>원 = 총구 방향<br>표는 연사 전체가 들어오게 배율이 바뀝니다.',
        'Cross = aim point (fixed)<br>Dots = hit group (yellow = just fired; a shotgun shows a small dot per pellet)<br>Line = muzzle path<br>Circle = muzzle direction<br>The scale changes so the whole burst fits.')}</p>
      <p class="caption">${L('반동·탄퍼짐·부착물·패시브 배율은 게임 자료이고, 수직 회복은 게임 화면 녹화에 맞췄으며, 각도는 추정입니다.', 'Recoil, spread, attachment and passive multipliers are game data, the vertical recovery is fitted to recordings of the game screen, and the angles are estimates.')}
        <span class="col-tip" tabindex="0" data-tip="${L('반동 값과 탄퍼짐은 게임 자료, 자세 배율은 자체 연구 값이고, 수직으로 오르고 돌아오는 움직임은 게임 무기고의 반동 시뮬레이션 녹화에 맞춘 값입니다. 한 발이 몇 도인지, 수평으로 움직이고 돌아오는 속도, 탄퍼짐 안에서 퍼지는 모양은 사이트 추정입니다(게임 데이터에서 찾지 못함). 총구·총열 하부 부착물의 반동·탄퍼짐 배율과 반동 30% 감소 패시브(공병 키트·강화, 0.7배)는 게임 자료이며, 이 패시브는 게임 설명과 달리 자세와 상관없이 적용됩니다. 단발·점사는 방아쇠를 0.15초마다 당긴다고 보았습니다(사이트 추정).',
        'The recoil values and spread are game data, the stance multipliers come from our own research, the vertical climb and recovery are fitted to recordings of the recoil simulation in the game armory, and the degrees per shot, the horizontal movement and recovery, and how hits fall inside the spread are our estimate (not found in the game data). The muzzle and underbarrel recoil and spread multipliers and the 30% recoil passive (Engineering Kit, Fortified, 0.7) are game data; the passive works in every stance, unlike its in-game text. Semi and burst fire pull the trigger every 0.15 s (our estimate).')}">${L('자세히', 'Details')}</span></p></div>`;
    this.grid = this.querySelector('.grid');
    this.trail = this.querySelector('.trail');
    this.hitLayer = this.querySelector('.hits');
    this.cross = this.querySelector('.cross');
    this.reticle = this.querySelector('.reticle');
    this.out = this.querySelector('.recoil-sim-readout');
    this.scaleText = this.querySelector('.recoil-sim-scale');
    this.setupText = this.querySelector('.recoil-sim-setup');
    this.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => {
      const field = b.dataset.choice, value = JSON.parse(b.dataset.value);
      // The passive is a single on/off button; the others pick one of their row.
      // A slot's pick goes under choice.slots; the passive is a single on/off button; the others pick one of their row.
      const slot = field.startsWith('slot:') ? field.slice(5) : null;
      if (slot) this.choice.slots[slot] = value;
      else this.choice[field] = field === 'passive' ? !this.choice.passive : value;
      const now = slot ? this.choice.slots[slot] : this.choice[field];
      this.querySelectorAll(`[data-choice="${field}"]`).forEach(o => o.setAttribute('aria-pressed', String(JSON.parse(o.dataset.value) === now)));
      this.fire();
    }));
    this.querySelectorAll('[data-stance]').forEach(b => b.addEventListener('click', () => {
      this.stance = Number(b.dataset.stance);
      this.querySelectorAll('[data-stance]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      this.fire();
    }));
    this.querySelector('[data-fire]').addEventListener('click', () => this.fire());
    this.setFrame({ px: BASE_PX, ox: SIZE / 2, oy: AIM_Y, grid: 1 });
    this.aimAt(0, 0);
    this.describe(configure(sim, this.choice));
    // Re-fit the choice rows whenever the element's width changes (it is 0 while the disclosure is closed).
    this.resizer = new ResizeObserver(() => this.fitRows());
    this.resizer.observe(this);
  }

  // What the next burst fires: mode, rate, rounds, pellets.
  describe(sim) {
    const shots = clamp(sim.magazine ?? 1, 1, MAX_SHOTS);
    const pellets = sim.pellets > 1 ? L(` · 한 발에 펠릿 ${sim.pellets}개`, ` · ${sim.pellets} pellets a shot`) : '';
    this.setupText.textContent = L(`${this.modeName(sim.mode)} · 분당 ${fmt(sim.rpm)}발로 ${shots}발${pellets} · 조준하고 멈춘 기준`, `${this.modeName(sim.mode)} · ${shots} rounds at ${fmt(sim.rpm)} RPM${pellets} · aimed, still`);
  }

  disconnectedCallback() { cancelAnimationFrame(this.raf); this.resizer?.disconnect(); }

  // A row whose buttons wrap keeps its box as wide as the space left, so it ends past the buttons; CSS cannot shrink
  // a wrapped row to its lines, so the box is set to end where its widest line ends (user request 2026-11-25).
  fitRows() {
    for (const seg of this.querySelectorAll('.recoil-sim-option .segmented')) {
      seg.style.width = '';
      const buttons = [...seg.children], box = seg.getBoundingClientRect();
      if (!box.width || new Set(buttons.map(b => Math.round(b.getBoundingClientRect().top))).size < 2) continue;
      const css = getComputedStyle(seg), end = Math.max(...buttons.map(b => b.getBoundingClientRect().right));
      seg.style.width = `${Math.ceil(end - box.left + parseFloat(css.paddingRight) + parseFloat(css.borderRightWidth))}px`;
    }
  }

  sx(x) { return this.frame.ox + x * this.frame.px; }
  sy(y) { return this.frame.oy - y * this.frame.px; }

  // Scale, grid and crosshair for one run; they stay put while it plays.
  setFrame(frame) {
    this.frame = frame;
    const { ox, oy, px, grid } = frame, gap = grid * px, lines = [];
    for (let x = ox % gap; x < SIZE; x += gap) lines.push(`M${x.toFixed(1)} 0V${SIZE}`);
    for (let y = oy % gap; y < SIZE; y += gap) lines.push(`M0 ${y.toFixed(1)}H${SIZE}`);
    this.grid.innerHTML = `<path d="${lines.join('')}"/>`;
    this.cross.setAttribute('transform', `translate(${ox} ${oy.toFixed(1)})`);
    this.scaleText.textContent = L(`칸 하나는 약 ${fmt(grid)}°`, `one square is about ${fmt(grid)}°`);
  }

  aimAt(x, y) {
    this.reticle.setAttribute('cx', this.sx(x).toFixed(2));
    this.reticle.setAttribute('cy', this.sy(y).toFixed(2));
  }

  // One round: a group with a dot per pellet (smaller when there are several), yellow while fresh.
  addHit(h, fresh = true) {
    const shot = document.createElementNS(SVG, 'g'), r = h.points.length > 1 ? '1.4' : '2';
    for (const [x, y] of h.points) {
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('cx', this.sx(x).toFixed(2)); dot.setAttribute('cy', this.sy(y).toFixed(2)); dot.setAttribute('r', r);
      shot.append(dot);
    }
    if (fresh) shot.classList.add('fresh');
    this.hitLayer.append(shot);
    return shot;
  }

  // The view recovers once firing stops, so the readout gives the highest hit rather than where the aim ends.
  readout(run) {
    const dots = run.hits.flatMap(h => h.points), xs = dots.map(d => d[0]);
    const climb = Math.max(...dots.map(d => d[1])), spread = Math.max(...xs) - Math.min(...xs);
    this.out.textContent = L(`탄착이 처음 조준보다 최대 약 ${fmt(climb)}° 위 · 좌우 폭 약 ${fmt(spread)}°`, `Hits up to about ${fmt(climb)}° above the first aim · about ${fmt(spread)}° wide`);
  }

  fire() {
    cancelAnimationFrame(this.raf);
    const sim = configure(this.sim, this.choice);
    this.describe(sim);
    const run = simulate(sim, STANCES[this.stance][1] * (this.choice.passive ? PASSIVE : 1));
    this.setFrame(frameFor(run));
    // Flat [aim x, aim y] per step, so a frame reads without allocating.
    const n = run.frames.length, aim = new Float64Array(n * 2);
    run.frames.forEach((f, i) => { aim[i * 2] = f.view[0] + f.drift[0]; aim[i * 2 + 1] = f.view[1] + f.drift[1]; });
    this.hitLayer.replaceChildren();
    this.trail.setAttribute('d', '');
    this.out.textContent = '';
    const lastShot = run.hits.at(-1).t;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      run.hits.forEach(h => this.addHit(h, lastShot - h.t < FRESH));
      let d = '';
      for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${this.sx(aim[i * 2]).toFixed(1)} ${this.sy(aim[i * 2 + 1]).toFixed(1)}`;
      this.trail.setAttribute('d', d);
      this.aimAt(aim[(n - 1) * 2], aim[(n - 1) * 2 + 1]);
      this.readout(run);
      return;
    }
    let shown = 0, path = '', last = null;
    const fresh = []; // [time fired, dot] still yellow
    const start = performance.now();
    const tick = now => {
      const t = Math.min((now - start) / 1000, run.end);
      // Blend the two simulation steps around t so the motion does not step at the display's frame rate.
      const pos = t / STEP, i = Math.min(n - 1, Math.floor(pos)), j = Math.min(n - 1, i + 1), f = pos - i;
      const x = aim[i * 2] + (aim[j * 2] - aim[i * 2]) * f, y = aim[i * 2 + 1] + (aim[j * 2 + 1] - aim[i * 2 + 1]) * f;
      while (shown < run.hits.length && run.hits[shown].t <= t) { const h = run.hits[shown++]; fresh.push([h.t, this.addHit(h)]); }
      // The newest rounds stay yellow; older ones turn grey, but the last ones stay yellow when the burst ends.
      while (fresh.length && t - fresh[0][0] > FRESH && fresh[0][0] < lastShot - FRESH) fresh.shift()[1].classList.remove('fresh');
      // The trail gains a point only once the aim has moved half a pixel.
      const ax = this.sx(x), ay = this.sy(y);
      if (!last || Math.hypot(ax - last[0], ay - last[1]) > 0.5) {
        path += `${last ? 'L' : 'M'}${ax.toFixed(1)} ${ay.toFixed(1)}`;
        this.trail.setAttribute('d', path);
        last = [ax, ay];
      }
      this.aimAt(x, y);
      if (t < run.end) this.raf = requestAnimationFrame(tick);
      else this.readout(run);
    };
    this.raf = requestAnimationFrame(tick);
  }
}

if (globalThis.customElements && !customElements.get('recoil-sim')) customElements.define('recoil-sim', RecoilSim);

// The simulation for a weapon key ('gear/<id>' or 'arsenal/<id>') as a disclosure of its own after the detailed stats,
// closed at first on the panel (user request 2026-11-25); on full screen it is an open section like the others, as
// full screen shows everything without folds. '' when the weapon has no inputs.
// hideFor: the panel's mode tabs the simulation does not cover (it hides while one of them is picked; current = the
// picked one now).
// No simulation where a burst says nothing (user request 2026-11-25): a weapon that fires one round before it
// reloads (the expendable and one-shot launchers, Quasar, Railgun, Nova, Speargun, Missile Pistol ...) and the
// launchers whose rockets or bolts fly on their own.
const NO_SIM = new Set(['arsenal/commando', 'arsenal/wasp', 'gear/exploding-crossbow']);
export const hasRecoilSim = key => { const sim = weaponRecoil[key]?.sim; return !!sim && (sim.magazine ?? 1) > 1 && !NO_SIM.has(key); };

export function recoilSimBlock(key, expanded = false, { hideFor = [], current = null } = {}) {
  if (!hasRecoilSim(key)) return '';
  const block = detailDisclosure(L('반동 시뮬레이션', 'Recoil simulation'), raw(`<recoil-sim class="recoil-sim" data-key="${key}"></recoil-sim>`), { className: 'recoil-sim-block', expanded });
  return hideFor.length ? html`<div data-variant-hide="${hideFor.join(' ')}" ${hideFor.includes(current) ? raw('hidden') : ''}>${block}</div>` : block;
}
