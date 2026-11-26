// Additive fallback only: never modifies the single-part combat engine.
import { FATAL, hitDamage, known, partPool, solveMatchup, spearCannotLock } from './combat.js';
import { L } from './i18n.js';

const MAX_HITS = 20000;
const floor = value => Math.floor(value + 1e-9);
const optionalKnown = (object, key) => !Object.hasOwn(object, key) || known(object[key]);
export const ACCUMULATION_SUMMARY = L('덩어리를 하나씩 터뜨리며 본체를 깎는 누적 경로입니다.', 'Cumulative route: pop the lumps one by one to wear down main health.');

/** Structural check, independent of weapon: excludes fatal parts/exposed layers
 * and main-only hitboxes. A break part may still transfer enough to kill.
 */
export function noFatalPart(enemy) {
  const fatal = part => FATAL.includes(part.effect) || part.mainOnly === true || Boolean(part.next && fatal(part.next));
  return Boolean(enemy?.parts?.length) && !enemy.parts.some(fatal);
}

// Precompute one fresh instance, respecting the same event order, rounding,
// overkill transfer and per-instance cap as solveImpacts. End the firing event
// immediately when this instance breaks: leftovers never hit another instance.
function instanceTrace(enemy, part, mode, options) {
  if (!Number.isSafeInteger(part.count) || part.count < 1 || part.count > MAX_HITS
    || part.effect !== 'break' || part.next || part.main || part.mainOnly || part.partOnly || part.isolated
    || part.prerequisite || part.unknownReason || part.capUnverified && part.overflowCap == null
    || typeof part.overflowCap !== 'boolean' || ![part.hp, part.toMain].every(known) || part.hp === 0
    || !['staticConstitution', 'constitution', 'transferExtraHealth', 'destroyMainDamage'].every(key => optionalKnown(part, key))
    || enemy.shield && !options.shieldCleared && (!enemy.shield.partial || part.requiresShieldClear)) return null;
  const events = mode.events || [{ attack: mode, times: 1, directHit: options.directHit }];
  if (!events.length || events.some(event => !Number.isSafeInteger(event.times) || event.times < 1 || event.times > MAX_HITS || !event.attack)) return null;
  const split = Boolean(mode.events || mode.explosions);
  const impacts = events.map(event => ({ ...event, damage: hitDamage(event.attack, part, enemy.main,
    { ...options, directHit: event.directHit ?? options.directHit }) }));
  if (impacts.some(({ damage }) => ![damage.direct, damage.explosion, damage.mainExplosion].every(known))) return null;
  if (!impacts.some(({ damage }) => damage.direct + damage.explosion > 0)) return null;
  let partLeft = partPool(part);
  let capLeft = partLeft + (part.constitution || 0) + (part.transferExtraHealth || 0);
  const shots = [];
  let total = 0;
  for (let shot = 0; shot < MAX_HITS; shot++) {
    const transfers = [];
    shots.push(transfers);
    for (const { damage, times } of impacts) for (let i = 0; i < times; i++) {
      const partDamage = damage.direct + damage.explosion;
      let transfer = split
        ? [damage.direct, ...damage.blasts.map(blast => blast.toPart)].reduce((sum, value) => sum + floor(value * part.toMain / 100), 0)
        : floor(partDamage * part.toMain / 100);
      if (part.overflowCap) { transfer = Math.min(transfer, capLeft); capLeft -= transfer; }
      partLeft -= partDamage;
      const mainDamage = transfer + damage.mainExplosion + (partLeft <= 0 ? part.destroyMainDamage || 0 : 0);
      transfers.push(mainDamage);
      total += mainDamage;
      if (partLeft <= 0) return total > 0 ? { part, shots, rate: total / shots.length } : null;
    }
  }
  return null;
}

/** Greedy sequential route, not a global minimum. options accepts the impact
 * options from combat.js; pass withHitAssumption(mode, ...) for multi-hit modes.
 * Explicit instance counts only. Unknown/layered/conditional parts are skipped.
 * Null means no supported accumulation route, not proof the enemy is unkillable.
 */
export function solveAccumulation(enemy, mode, options = {}) {
  options ||= {};
  if (!enemy?.parts?.length || !enemy.main || !known(enemy.main.hp) || enemy.main.hp === 0
    || !optionalKnown(enemy.main, 'constitution') || enemy.regeneration
    || !mode || mode.unsupported || mode.beam || mode.stream || mode.hitCondition && !mode.events
    || spearCannotLock(enemy, mode) || options.partId
    || !enemy.parts.some(part => Number.isSafeInteger(part.count) && part.count > 0)
    || solveMatchup(enemy, mode, options).best) return null;
  const candidates = enemy.parts.map((part, index) => {
    const trace = instanceTrace(enemy, part, mode, options);
    return trace ? { ...trace, index } : null;
  }).filter(Boolean).sort((a, b) => b.rate - a.rate || a.index - b.index);
  const steps = [];
  let hits = 0;
  let mainLeft = enemy.main.hp;
  for (const { part, shots } of candidates) for (let instance = 0; instance < part.count; instance++) {
    let instanceHits = 0;
    let mainDamage = 0;
    for (const transfers of shots) {
      if (++hits > MAX_HITS) return null;
      instanceHits++;
      for (const transfer of transfers) {
        mainDamage += transfer;
        mainLeft -= transfer;
        if (mainLeft <= 0) break;
      }
      if (mainLeft <= 0) break;
    }
    const previous = steps.at(-1);
    if (previous?.partId === part.id && previous.hitsPerInstance === instanceHits) {
      previous.instances++; previous.hits += instanceHits; previous.mainDamage += mainDamage;
    } else steps.push({ partId: part.id, partName: part.name, instances: 1,
      hitsPerInstance: instanceHits, hits: instanceHits, mainDamage });
    if (mainLeft <= 0) return {
      hits, outcome: enemy.main.constitution && mainLeft > -enemy.main.constitution ? 'bleed' : 'kill',
      steps, accumulated: true, summary: ACCUMULATION_SUMMARY,
      notes: [ACCUMULATION_SUMMARY,
        L('한 번에 부위 하나만 맞히고, 파괴되면 다음 부위로 옮겨 같은 무기로 공격합니다. 폭발이 여러 부위에 동시에 닿는 피해는 제외합니다.', 'Hit one part at a time and move to the next once it breaks, with the same weapon. Explosion damage to several parts at once is left out.'),
        L('각 부위를 부술 때 본체에 전달되는 발당 평균 피해가 큰 순서입니다. 실제 최저 탄수나 모든 부위를 조준할 수 있음을 보장하지 않습니다.', 'Parts are ordered by average damage per shot passed to main while breaking them. This does not guarantee the true minimum or that every part can be aimed at.'),
        L('개수와 피해가 확인된 부위만 사용하며, 거리 감쇠·지속 피해·재생은 합산하지 않습니다.', 'Only parts with verified counts and damage are used; falloff, damage over time and regeneration are not added.')],
    };
  }
  return null;
}
