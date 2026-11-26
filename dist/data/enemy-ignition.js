// Ignition thresholds: how much fire status a target takes before it catches fire (user request 2026-11-26).
// A weapon's hits build up its datamine Fire status value (Status_Value of the Fire status); once the build-up
// reaches the enemy's threshold, burning starts (core/combat.js solveStream).
// The wiki gives thresholds only in the enemy pages' change history for patch 1.004.100 ('Minimum ignition
// threshold increased from 7 to 8.5', 'Maximum ...'). A range uses its maximum, the latest an enemy catches fire;
// a page that names only the minimum uses that (user decision 2026-11-26).
// Enemies with no threshold on the wiki take IGNITION_DEFAULT, the strength 5 of the Fire status in the wiki status
// datamine (Module:Decodedata-Attacks/status data.json, revision 139342). Reading that strength as a threshold is
// an estimate, shown as one (user decision 2026-11-26).
export const ignitionCheckedAt = '2026-11-26';
export const IGNITION_DEFAULT = 5;
const wiki = page => `https://helldivers.wiki.gg/wiki/${page.replaceAll(' ', '_')}`;
const threshold = (page, revision, min, max = null) => ({ value: max ?? min, min, max, source: wiki(page), revision });
export const ignitionThresholds = {
  'warrior-hardened': threshold('Warrior', 141593, 2.1, 3.3),
  'alpha-warrior': threshold('Alpha Warrior', 141592, 2.1, 3.3),
  'bile-warrior': threshold('Caustic Warrior', 142384, 2.1, 3.3),
  'hive-guard': threshold('Hive Guard', 141215, 2.1, 3.3),
  'brood-commander': threshold('Brood Commander', 141213, 4.1, 5.5),
  'alpha-commander': threshold('Alpha Commander', 142329, 4.1, 5.5),
  'nursing-spewer': threshold('Nursing Spewer', 141638, 5, 6.5),
  'bile-spewer-armored': threshold('Caustic Spewer', 142736, 5, 6.5),
  'rupture-spewer': threshold('Rupture Spewer', 141639, 5, 6.5),
  'charger': threshold('Charger', 141505, 8.5),
  'behemoth': threshold('Charger Behemoth', 141504, 8.5),
  'spore-charger': threshold('Caustic Charger', 142179, 8.5),
  'rupture-charger': threshold('Rupture Charger', 141506, 8.5),
  'impaler': threshold('Impaler', 136861, 8.5),
  'devastator': threshold('Devastator', 138977, 6.2, 8),
  'rocket-devastator': threshold('Rocket Devastator', 138979, 6.2, 8),
  'heavy-devastator': threshold('Heavy Devastator', 142504, 6.2, 8),
  'conflagration-devastator': threshold('Conflagration Devastator', 140049, 6.2, 8),
  'incendiary-mg-devastator': threshold('Incendiary MG Devastator', 140048, 6.2, 8),
  'jet-brigade-devastator': threshold('Jet Brigade Devastator', 136520, 6.2, 8),
  'hulk': threshold('Hulk Scorcher', 141866, 9),
  'hulk-bruiser': threshold('Hulk Bruiser', 141870, 9),
  'hulk-obliterator': threshold('Hulk Obliterator', 141862, 9),
  'hulk-firebomber': threshold('Hulk Firebomber', 141867, 9),
  'jet-brigade-hulk-scorcher': threshold('Jet Brigade Hulk Scorcher', 141868, 9),
  'jet-brigade-hulk-bruiser': threshold('Jet Brigade Hulk Bruiser', 141869, 9),
  'fleshmob': threshold('Fleshmob', 140060, 4.5),
};
/** The threshold an enemy's count uses: { value, estimated }. */
export const ignitionOf = enemyId => Object.hasOwn(ignitionThresholds, enemyId)
  ? { value: ignitionThresholds[enemyId].value, estimated: false }
  : { value: IGNITION_DEFAULT, estimated: true };
