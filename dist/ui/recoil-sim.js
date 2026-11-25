// Recoil simulation on a weapon's detail page (user request 2026-11-25): press fire and the weapon shoots a
// magazine (up to 30 rounds) at its fire rate while the view climbs and the weapon kicks.
// Inputs (weapon-recoil.js `sim`, game data sheet): drift (the weapon moves on screen) and climb (the view moves),
// [horizontal, vertical] after the default attachments, each with a horizontal bias and random ratios
// [vertical, horizontal], the fire rate and the magazine.
// Rules from helldiversotl.com/research/recoil: stance multipliers (aimed, standing still), drift keeps the larger
// of the current and the new kick on each axis, a new climb kick replaces the one still being applied, and past
// about 0.57 degrees of horizontal recoil a kick the other way is cut to 1/16.
// Site estimates (the game data does not give them): one unit = 0.01 degrees per shot, drift settles with a
// 0.12 s time constant, a climb kick plays out with a 0.06 s one, and the view stays where it climbed (the player
// pulls it down). So the shape compares weapons; the angles are approximate.
import { weaponRecoil } from '../data/weapon-recoil.js';
import { L } from '../core/i18n.js';

const UNIT = 0.01, DRIFT_TAU = 0.12, CLIMB_TAU = 0.06, TURN = 0.57, MAX_SHOTS = 30, STEP = 1 / 240;
const STANCES = [['stand', 0.9, () => L('서서', 'Standing')], ['crouch', 0.6, () => L('앉아서', 'Crouched')], ['prone', 0.4, () => L('엎드려서', 'Prone')]];
const HALF = 5; // the box shows 5 degrees each way from the view centre
const SIZE = 240, PX = SIZE / (HALF * 2);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// One shot's kick on [horizontal, vertical] for drift or climb (index i into bias and random).
function kick(sim, i, scale, horizontalNow) {
  const [rv, rh] = sim.random[i];
  const base = i ? sim.climb : sim.drift;
  let h = base[0] * UNIT * scale * clamp(sim.bias[i] + rh * (Math.random() * 2 - 1), -1, 1);
  const v = base[1] * UNIT * scale * (1 - rv * Math.random());
  if (Math.abs(horizontalNow) > TURN && Math.sign(h) === -Math.sign(horizontalNow)) h /= 16;
  return [h, v];
}

// The whole burst, sampled every STEP seconds: view (where the screen points), drift (the weapon's offset from it)
// and the hits (view + drift at each shot).
export function simulate(sim, scale) {
  const shots = clamp(sim.magazine ?? 1, 1, MAX_SHOTS), gap = 60 / sim.rpm;
  const end = (shots - 1) * gap + 0.5;
  const view = [0, 0], drift = [0, 0];
  let pending = [0, 0], next = 0, fired = 0;
  const frames = [], hits = [];
  const settle = Math.exp(-STEP / DRIFT_TAU), take = 1 - Math.exp(-STEP / CLIMB_TAU);
  const steps = Math.ceil(end / STEP);
  for (let i = 0; i <= steps; i++) {
    const t = i * STEP;
    if (fired < shots && t + STEP / 2 >= next) {
      hits.push({ t, x: view[0] + drift[0], y: view[1] + drift[1] });
      const now = view[0] + drift[0];
      const d = kick(sim, 0, scale, now), c = kick(sim, 1, scale, now);
      for (const a of [0, 1]) if (Math.abs(d[a]) > Math.abs(drift[a])) drift[a] = d[a];
      pending = c;
      fired++; next += gap;
    }
    for (const a of [0, 1]) {
      drift[a] *= settle;
      const move = pending[a] * take;
      view[a] += move; pending[a] -= move;
    }
    frames.push({ t, view: [...view], drift: [...drift] });
  }
  return { frames, hits, shots, gap, end };
}

const fmt = n => (Math.round(n * 10) / 10).toLocaleString();
const SVG = 'http://www.w3.org/2000/svg';
const C = SIZE / 2, PIN_MARGIN = 17; // room for the + and its arrow inside the box
// World point (degrees, up = positive) in the world group's own coordinates; the group moves with the view.
const wx = x => C + x * PX, wy = y => C - y * PX;

// Node (the checks) has no HTMLElement: the element is defined only in a browser.
const Base = globalThis.HTMLElement ?? class {};
class RecoilSim extends Base {
  connectedCallback() {
    this.sim = weaponRecoil[this.dataset.key]?.sim;
    if (!this.sim || this.built) return;
    this.built = true;
    this.stance = 0;
    const shots = clamp(this.sim.magazine ?? 1, 1, MAX_SHOTS);
    this.innerHTML = `<h4>${L('반동 시뮬레이션', 'Recoil simulation')}</h4>
      <div class="recoil-sim-controls">
        <div class="segmented" role="group" aria-label="${L('자세', 'Stance')}">${STANCES.map(([id, , name], i) => `<button type="button" data-stance="${i}" aria-pressed="${i === 0}">${name()}</button>`).join('')}</div>
        <button class="button small primary" type="button" data-fire>${L('발사', 'Fire')}</button>
      </div>
      <svg class="recoil-sim-view" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${L('반동 시뮬레이션 화면', 'Recoil simulation view')}">
        <g class="grid">${Array.from({ length: HALF * 2 - 1 }, (_, i) => (i + 1) * PX).map(p => `<line x1="${p}" y1="0" x2="${p}" y2="${SIZE}"/><line x1="0" y1="${p}" x2="${SIZE}" y2="${p}"/>`).join('')}</g>
        <g class="world">
          <path class="trail" d=""/>
          <g class="hits"></g>
        </g>
        <g class="start-pin" transform="translate(${C} ${C})"><path class="start" d="M-6 0h12M0 -6v12"/><path class="start-arrow" d="M15 0L9 -4L9 4Z" hidden/></g>
        <text class="start-label" hidden></text>
        <path class="centre" d="M${C - 7} ${C}h14M${C} ${C - 7}v14"/>
        <circle class="reticle" cx="${C}" cy="${C}" r="6"/>
      </svg>
      <p class="recoil-sim-readout" aria-live="polite"></p>
      <p class="caption">${L(`최대 연사 속도(분당 ${fmt(this.sim.rpm)}발)로 ${shots}발 · 조준하고 멈춰 선 기준 · 칸 하나는 약 1°`, `${shots} rounds at the top fire rate (${fmt(this.sim.rpm)} RPM) · aimed, standing still · one square is about 1°`)}</p>
      <p class="caption">${L('점 = 탄착, 선 = 총이 지나간 길, 원 = 총이 가리키는 곳, 십자 = 화면 가운데, 회색 + = 처음 조준한 곳(화면 밖으로 나가면 가장자리에 붙고 화살표가 실제 방향을 가리킴). 반동 값과 자세 배율은 게임 자료이고, 한 발이 몇 도인지와 돌아오는 속도는 사이트 추정입니다. 화면을 직접 내리지 않는다고 보고 그렸습니다.',
        'Dot = hit, line = the path the weapon took, circle = where the weapon points, cross = screen centre, grey + = where you first aimed (once off screen it stays on the edge, its arrow pointing the real way). The recoil values and stance multipliers are game data; the degrees per shot and the recovery speed are our estimate. Drawn as if you do not pull the view down.')}</p>`;
    this.world = this.querySelector('.world');
    this.trail = this.querySelector('.trail');
    this.hitLayer = this.querySelector('.hits');
    this.reticle = this.querySelector('.reticle');
    this.pin = this.querySelector('.start-pin');
    this.arrow = this.querySelector('.start-arrow');
    this.label = this.querySelector('.start-label');
    this.out = this.querySelector('.recoil-sim-readout');
    this.querySelectorAll('[data-stance]').forEach(b => b.addEventListener('click', () => {
      this.stance = Number(b.dataset.stance);
      this.querySelectorAll('[data-stance]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      this.fire();
    }));
    this.querySelector('[data-fire]').addEventListener('click', () => this.fire());
  }

  disconnectedCallback() { cancelAnimationFrame(this.raf); }

  // Moves the view (one transform on the world group) and the reticle; nothing else is rebuilt per frame.
  place(vx, vy, dx, dy) {
    this.world.setAttribute('transform', `translate(${(-vx * PX).toFixed(2)} ${(vy * PX).toFixed(2)})`);
    this.reticle.setAttribute('cx', (C + dx * PX).toFixed(2));
    this.reticle.setAttribute('cy', (C - dy * PX).toFixed(2));
    this.placeStart(C - vx * PX, C + vy * PX, Math.hypot(vx, vy));
  }

  // The grey + (where you first aimed) stays in the box: once the view has moved it out, it sits on the edge with an
  // arrow towards where it really is and how far that is from the screen centre (user request 2026-11-25).
  placeStart(sx, sy, away) {
    const x = clamp(sx, PIN_MARGIN, SIZE - PIN_MARGIN), y = clamp(sy, PIN_MARGIN, SIZE - PIN_MARGIN);
    const off = x !== sx || y !== sy;
    this.pin.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    if (off !== this.off) { this.off = off; this.arrow.toggleAttribute('hidden', !off); this.label.toggleAttribute('hidden', !off); }
    if (!off) return;
    this.arrow.setAttribute('transform', `rotate(${(Math.atan2(sy - y, sx - x) * 180 / Math.PI).toFixed(1)})`);
    // The label sits beside the pin, towards the middle, so it stays off the trail climbing above it.
    const left = x > C;
    this.label.setAttribute('text-anchor', left ? 'end' : 'start');
    this.label.setAttribute('x', (left ? x - 12 : x + 12).toFixed(1));
    this.label.setAttribute('y', (y + 4).toFixed(1));
    const text = L(`처음 조준 ${fmt(away)}°`, `First aim ${fmt(away)}°`);
    if (text !== this.label.textContent) this.label.textContent = text;
  }

  addHit(h) {
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('cx', wx(h.x).toFixed(2)); dot.setAttribute('cy', wy(h.y).toFixed(2)); dot.setAttribute('r', '2.6');
    this.hitLayer.append(dot);
  }

  readout(run) {
    const xs = run.hits.map(h => h.x);
    const climb = run.frames.at(-1).view[1], spread = Math.max(...xs) - Math.min(...xs);
    this.out.textContent = L(`화면이 위로 약 ${fmt(climb)}° 올라감 · 좌우로 약 ${fmt(spread)}° 퍼짐`, `View climbed about ${fmt(climb)}° · hits spread about ${fmt(spread)}° side to side`);
  }

  fire() {
    cancelAnimationFrame(this.raf);
    const run = simulate(this.sim, STANCES[this.stance][1]);
    // Flat [view x, view y, drift x, drift y] per step, so a frame reads without allocating.
    const n = run.frames.length, buf = new Float64Array(n * 4);
    run.frames.forEach((f, i) => buf.set([f.view[0], f.view[1], f.drift[0], f.drift[1]], i * 4));
    const aim = i => [wx(buf[i * 4] + buf[i * 4 + 2]), wy(buf[i * 4 + 1] + buf[i * 4 + 3])];
    this.hitLayer.replaceChildren();
    this.trail.setAttribute('d', '');
    this.out.textContent = '';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      run.hits.forEach(h => this.addHit(h));
      this.trail.setAttribute('d', run.frames.map((_, i) => `${i ? 'L' : 'M'}${aim(i).map(v => v.toFixed(1)).join(' ')}`).join(''));
      const k = (n - 1) * 4;
      this.place(buf[k], buf[k + 1], buf[k + 2], buf[k + 3]);
      this.readout(run);
      return;
    }
    let shown = 0, path = '', last = null;
    const start = performance.now();
    const tick = now => {
      const t = Math.min((now - start) / 1000, run.end);
      // Blend the two simulation steps around t so the motion does not step at the display's frame rate.
      const pos = t / STEP, i = Math.min(n - 1, Math.floor(pos)), j = Math.min(n - 1, i + 1), f = pos - i;
      const v = k => buf[i * 4 + k] + (buf[j * 4 + k] - buf[i * 4 + k]) * f;
      while (shown < run.hits.length && run.hits[shown].t <= t) this.addHit(run.hits[shown++]);
      // The trail gains a point only once the aim has moved half a pixel.
      const ax = wx(v(0) + v(2)), ay = wy(v(1) + v(3));
      if (!last || Math.hypot(ax - last[0], ay - last[1]) > 0.5) {
        path += `${last ? 'L' : 'M'}${ax.toFixed(1)} ${ay.toFixed(1)}`;
        this.trail.setAttribute('d', path);
        last = [ax, ay];
      }
      this.place(v(0), v(1), v(2), v(3));
      if (t < run.end) this.raf = requestAnimationFrame(tick);
      else this.readout(run);
    };
    this.raf = requestAnimationFrame(tick);
  }
}

if (globalThis.customElements && !customElements.get('recoil-sim')) customElements.define('recoil-sim', RecoilSim);

// The simulation block for a weapon key ('gear/<id>' or 'arsenal/<id>'), or '' when the weapon has no inputs.
export const recoilSimHtml = key => (weaponRecoil[key]?.sim ? `<recoil-sim class="ballistic recoil-sim" data-key="${key}"></recoil-sim>` : '');
