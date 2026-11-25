// Photos for the rows of a wiki Anatomy table (data/enemy-anatomy.js). A site part photo
// (data/combat-images.js) is used only when it is one of that row's current wiki images;
// otherwise the row's own downloaded wiki image (data/anatomy-row-images.js), if any.
import { combatImages } from '../data/combat-images.js';
import { anatomyRowImages } from '../data/anatomy-row-images.js';

const same = (a, b) => a.replaceAll('_', ' ') === b.replaceAll('_', ' ');
export function sitePhoto(enemyId, row) {
  if (!row.part || row.role === 'pool') return null;
  const photo = combatImages[enemyId]?.[row.part]?.find(item => item.stage === (row.stage || 'initial'));
  return photo && row.images.some(file => same(file, photo.title)) ? photo : null;
}
// A downloaded row image the wiki has since replaced is left out rather than shown for the wrong part.
export function rowPhoto(enemyId, row) {
  const own = anatomyRowImages[enemyId]?.[row.name];
  return sitePhoto(enemyId, row) || (own && row.images.some(file => same(file, own.title)) ? own : null);
}
