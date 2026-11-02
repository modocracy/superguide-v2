// The English dictionary: Korean data text → English, loaded only by the
// English edition (ui/main.js). Official names come straight from the data's
// own English fields; everything else is in one file per data area under en/.
// A Korean string edited in dist/data needs its English updated here too —
// `npm run check` lists any string that has no English.
import { stratagems } from '../core/catalog.js';
import { personalWeapons } from '../data/personal-weapons.js';
import { factionGuides } from '../data/faction-data.js';
import { warbonds } from '../data/warbonds.js';
import stratagemText from './en/stratagems.js';
import enemyText from './en/enemies.js';
import gearText from './en/gear.js';
import demolitionText from './en/demolition.js';
import factionText from './en/factions.js';
import warbondText from './en/warbonds.js';

export const officialNames = [...stratagems, ...personalWeapons, ...factionGuides, ...warbonds].filter(item => item.name && item.en).map(item => [item.name, item.en]);
export const areas = { stratagems: stratagemText, enemies: enemyText, gear: gearText, demolition: demolitionText, factions: factionText, warbonds: warbondText };
export const english = Object.assign(Object.fromEntries(officialNames), ...Object.values(areas));
