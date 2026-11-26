// Faction loadout recommendations. The weapon order and aim points are
// editorial (easy aim first, not fewest hits); the numbers always come from
// the combat engine for the editor's chosen aim points.
import { enemies, weaponProfiles } from '../data/combat-data.js';
import { factionLoadouts } from '../data/faction-loadouts.js';
import { factionAimTargets, factionTactics, factionApproaches, factionGuideEnemies } from '../data/faction-data.js';
import { solveMatchup, isFatal, sortRoutes, spearCannotLock } from './combat.js';
import { enemyPages } from '../data/enemy-pages.js';
import { ignitionOf } from '../data/enemy-ignition.js';

export const findEnemy = id => enemies.find(item => item.id === id) || factionGuideEnemies[id];

/** Wiki-described tactical result for this exact weapon mode, if any. */
export function wikiReference(enemy, weaponId, mode) {
  if (!mode || mode.hitCondition && !mode.assumption || spearCannotLock(enemy, mode)) return null;
  return enemy.tacticalResults?.find(item => item.weapon === weaponId && item.mode === mode.id) || null;
}

// `enemy` defaults to the current data; the parity test passes the legacy values (and engine
// options that switch off rules the legacy engine did not have).
export function recommend(unit, choice, enemy = findEnemy(unit.enemy), engineOptions = {}) {
  const [weaponId, modeId] = choice.split(':');
  const pick = factionLoadouts[unit.enemy]?.find(item => item.weapon === choice);
  if (enemy && pick?.adviceOnly) {
    // An advice pick with a held flame stream also gets its quickest time as a reference (user request 2026-11-26):
    // the spore picks stay advice, since the enemy has to die burning.
    const streamMode = weaponProfiles[weaponId]?.modes.find(item => item.stream);
    const streamRoute = streamMode ? solveMatchup(enemy, streamMode, { shieldCleared: true, fireMult: enemyPages[enemy.id]?.fireMult, ignition: ignitionOf(enemy.id) }).best : null;
    return { enemy, weaponId, pick, adviceOnly: true, streamMode: streamRoute ? streamMode : null, streamRoute };
  }

  const profile = weaponProfiles[weaponId];
  const mode = modeId ? profile?.modes.find(item => item.id === modeId) : profile?.modes[0];
  if (!enemy || !mode) throw new Error(`Unknown faction recommendation: ${unit.enemy}/${choice}`);
  const approach = factionApproaches[`${enemy.id}:${choice}`];
  // Guides assume the shield is handled; approaches may exclude the direct hit.
  // Fire multiplier and ignition threshold for a held beam or flame stream, as on the enemy view (no effect on shots).
  const matchup = solveMatchup(enemy, mode, { shieldCleared: true, fireMult: enemyPages[enemy.id]?.fireMult, ignition: ignitionOf(enemy.id), ...engineOptions, ...(approach ? { directHit: approach.directHit } : {}) });
  const aims = approach ? [approach.target] : pick?.targets || factionAimTargets[`${enemy.id}:${choice}`] || unit.targets;
  // Only the editor's aim points count: never silently swap in an easier-to-count part.
  const options = sortRoutes(aims.map(id => matchup.rows.find(row => row.target.id === id)).filter(row => row && isFatal(row)));
  const route = options[0] || (pick ? null : matchup.best);
  return {
    enemy, weaponId, profile, mode, pick, approach, route,
    alternatives: options.slice(1),
    reference: wikiReference(enemy, weaponId, mode),
    tactic: factionTactics[`${enemy.id}:${choice}`] || null,
  };
}
