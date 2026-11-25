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
  for (let t = 0; t <= end + STEP / 2; t += STEP) {
    if (fired < shots && t + STEP / 2 >= next) {
      hits.push({ t, x: view[0] + drift[0], y: view[1] + drift[1] });
      const now = view[0] + drift[0];
      const d = kick(sim, 0, scale, now), c = kick(sim, 1, scale, now);
      for (const a of [0, 1]) if (Math.abs(d[a]) > Math.abs(drift[a])) drift[a] = d[a];
      pending = c;
      fired++; next += gap;
    }
    const settle = Math.exp(-STEP / DRIFT_TAU), take = 1 - Math.exp(-STEP / CLIMB_TAU);
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
        <g class="hits"></g>
        <path class="start" d=""/>
        <path class="centre" d="M${SIZE / 2 - 7} ${SIZE / 2}h14M${SIZE / 2} ${SIZE / 2 - 7}v14"/>
        <circle class="reticle" cx="${SIZE / 2}" cy="${SIZE / 2}" r="6"/>
      </svg>
      <p class="recoil-sim-readout" aria-live="polite"></p>
      <p class="caption">${L(`최대 연사 속도(분당 ${fmt(this.sim.rpm)}발)로 ${shots}발 · 조준하고 멈춰 선 기준 · 칸 하나는 약 1°`, `${shots} rounds at the top fire rate (${fmt(this.sim.rpm)} RPM) · aimed, standing still · one square is about 1°`)}</p>
      <p class="caption">${L('점 = 탄착, 원 = 총이 가리키는 곳, 십자 = 화면 가운데, 회색 + = 처음 조준한 곳. 반동 값과 자세 배율은 게임 자료이고, 한 발이 몇 도인지와 돌아오는 속도는 사이트 추정입니다. 화면을 직접 내리지 않는다고 보고 그렸습니다.',
        'Dot = hit, circle = where the weapon points, cross = screen centre, grey + = where you first aimed. The recoil values and stance multipliers are game data; the degrees per shot and the recovery speed are our estimate. Drawn as if you do not pull the view down.')}</p>`;
    this.querySelectorAll('[data-stance]').forEach(b => b.addEventListener('click', () => {
      this.stance = Number(b.dataset.stance);
      this.querySelectorAll('[data-stance]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      this.fire();
    }));
    this.querySelector('[data-fire]').addEventListener('click', () => this.fire());
    this.draw({ view: [0, 0], drift: [0, 0] }, []);
  }

  disconnectedCallback() { cancelAnimationFrame(this.raf); }

  // Screen position of a world point (degrees, up = positive) while the view points at `view`.
  at([vx, vy], x, y) { return [SIZE / 2 + (x - vx) * PX, SIZE / 2 - (y - vy) * PX]; }

  draw(frame, hits) {
    const [cx, cy] = this.at(frame.view, frame.view[0] + frame.drift[0], frame.view[1] + frame.drift[1]);
    const reticle = this.querySelector('.reticle');
    reticle.setAttribute('cx', cx.toFixed(1)); reticle.setAttribute('cy', cy.toFixed(1));
    const [sx, sy] = this.at(frame.view, 0, 0);
    this.querySelector('.start').setAttribute('d', `M${(sx - 6).toFixed(1)} ${sy.toFixed(1)}h12M${sx.toFixed(1)} ${(sy - 6).toFixed(1)}v12`);
    this.querySelector('.hits').innerHTML = hits.map(h => { const [x, y] = this.at(frame.view, h.x, h.y); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"/>`; }).join('');
  }

  readout(run, hits) {
    const last = run.frames.at(-1);
    const xs = hits.map(h => h.x);
    const spread = Math.max(...xs) - Math.min(...xs);
    this.querySelector('.recoil-sim-readout').textContent = L(`화면이 위로 약 ${fmt(last.view[1])}° 올라감 · 좌우로 약 ${fmt(spread)}° 퍼짐`, `View climbed about ${fmt(last.view[1])}° · hits spread about ${fmt(spread)}° side to side`);
  }

  fire() {
    cancelAnimationFrame(this.raf);
    const run = simulate(this.sim, STANCES[this.stance][1]);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.draw(run.frames.at(-1), run.hits); this.readout(run, run.hits); return;
    }
    const start = performance.now();
    const tick = now => {
      const t = (now - start) / 1000;
      const frame = run.frames[Math.min(run.frames.length - 1, Math.round(t / STEP))];
      const hits = run.hits.filter(h => h.t <= t);
      this.draw(frame, hits);
      if (t < run.end) this.raf = requestAnimationFrame(tick);
      else this.readout(run, run.hits);
    };
    this.querySelector('.recoil-sim-readout').textContent = '';
    this.raf = requestAnimationFrame(tick);
  }
}

if (globalThis.customElements && !customElements.get('recoil-sim')) customElements.define('recoil-sim', RecoilSim);

// The simulation block for a weapon key ('gear/<id>' or 'arsenal/<id>'), or '' when the weapon has no inputs.
export const recoilSimHtml = key => (weaponRecoil[key]?.sim ? `<recoil-sim class="ballistic recoil-sim" data-key="${key}"></recoil-sim>` : '');
