// Warbond guide: wikitext parsing (infobox, acquisitions template, collapsed table),
// cross-checks that leave disagreeing values unconfirmed, the 26 Korean names,
// links into weapon/stratagem views, and that the generated data is current.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { parseWarbondPage, parseCurrency, parseDate, findTemplates, templateParams, parseTableRows, UNCONFIRMED } from './warbond-parse.mjs';
import { generate, buildWarbonds, warbondId, baseTitle, RENAMED } from './build-warbonds.mjs';
import { warbonds, warbondTiers, warbondDiscrepancies, warbondLinks } from '../dist/data/warbonds.js';
import { warbondImages } from '../dist/data/warbond-images.js';
import { personalWeapons } from '../dist/data/personal-weapons.js';
import { stratagemById } from '../dist/core/catalog.js';
import { parseRoute } from '../dist/core/route.js';

let checks = 0;
const ok = (value, message) => { assert(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const root = new URL('../', import.meta.url);

// --- Small parsers ------------------------------------------------------------------------
eq(parseCurrency('{{Currency|SC|1,000}}'), { amount: 1000, unit: 'SC', raw: '{{Currency|SC|1,000}}' }, 'SC with comma');
eq(parseCurrency('{{Currency|Medals|1,200}}').amount, 1200, 'medals with comma');
eq(parseCurrency('{{Currency|SC|1500}}').amount, 1500, 'SC without comma');
eq(parseCurrency(' 145').amount, 145, 'plain number');
ok(parseCurrency('Free').amount === 0 && parseCurrency('Free').free, 'Free is 0 SC');
ok(parseCurrency('None').amount === null && parseCurrency('None').none, 'None is explicit');
ok(parseCurrency('Unknown').amount === null && !parseCurrency('Unknown').none, 'unreadable stays null');
eq(['March 14th, 2024', 'August 08, 2024', 'October 31, 2024', 'September 22nd, 2026', 'May 1st, 2025', '2024-03-14'].map(parseDate),
  ['2024-03-14', '2024-08-08', '2024-10-31', '2026-09-22', '2025-05-01', '2024-03-14'], 'dates normalize to ISO');
ok(parseDate('Soon') === null && parseDate('') === null, 'unknown dates stay null');
const nested = templateParams(findTemplates('x {{Infobox Warbond\n|cost={{Currency|SC|1,000}}\n|title=[[A|B]] C\n}} y', /Infobox[ _]Warbond/)[0].body);
eq(nested.named, { cost: '{{Currency|SC|1,000}}', title: '[[A|B]] C' }, 'nested templates and links do not split params');

// --- A synthetic warbond page ---------------------------------------------------------------
const item = (n, name, cost, image = `${name} ${n}.png`, link = name) => ` |${n}_col = ${n}\n |${n}_row = 1\n |${n}_cost = ${cost}\n |${n}_image = ${image}\n |${n}_link = ${link}\n |${n}_name = ${name}\n`;
const row = (name, type, cost, image = 'x.png', link = name) => `|-\n|[[File:${image}|51px|link=${link}]]||[[${link}|${name}]]||[[${type}]]||{{Currency|${cost === 1 ? 'Medal' : 'Medals'}|${cost}|notext}}\n`;
const page = (n, unlock, items, rows) => `===Page ${n}===\n{{Acquisitions Page\n |mode = premium-warbond\n${unlock == null ? '' : ` |spent_to_unlock = ${unlock}\n`}${items}}}\n<div class="mw-collapsible mw-collapsed">\n{|class="wikitable sortable"\n!Icon!!Item!!Type!!Cost\n${rows}|}\n</div>\n\n`;
const sample = `{{Infobox Warbond
|title=Test Bond
|date=March 14th, 2024
|cost={{Currency|SC|1,000}}
|credit-claim={{Currency|SC|150}}
|all-pages={{Currency|Medals|40}}
|all-items={{Currency|Medals|48}}
}}
==Contents==
${page(1, null,
    item(1, 'AR-1 Gun', 10, 'Gun.png') + item(2, 'Plate', 5, 'Plate Helmet.png') + item(3, 'Plate', 7, 'Plate Armor.png') + item(4, 'Super Credits', 1),
    row('AR-1 Gun', 'Assault Rifle', 10, 'Gun.png') + row('Plate', 'Helmet', 6, 'Plate Helmet.png') + row('Plate', 'Medium Armor', 7, 'Plate Armor.png') + '|-\n|[[File:Super Credit.png|51px|link=Super Credits]]||100 [[Super Credits]]||[[Currency]]||{{Currency|Medal|1|notext}}\n')}${page(2, 'Unknown',
    item(1, 'Boost A', 11) + item(2, 'Banner', 3) + item(3, 'Super Credits', 2),
    row('Boost B', 'Booster', 11) + row('Banker', 'Cape', 3) + '|-\n|[[File:Super Credit.png|51px|link=Super Credits]]||50 [[Super Credits]]||[[Currency]]||{{Currency|Medals|2|notext}}\n')}${page(3, 40,
    item(1, 'Boost B', 9),
    row('Boost A', 'Booster', 9))}==Media==
`;
const parsed = parseWarbondPage(sample, 'Test Bond Premium Warbond');
eq([parsed.tier, parsed.date, parsed.price, parsed.creditClaim, parsed.allPages, parsed.totalCost], ['premium', '2024-03-14', 1000, 150, 40, 48], 'infobox fields');
eq(parsed.pages.map(p => [p.number, p.unlock, p.unlockStatus]), [[1, 0, 'confirmed'], [2, null, UNCONFIRMED], [3, 40, 'confirmed']], 'page unlock thresholds');
const p1 = parsed.pages[0].items;
eq(p1.map(i => [i.name, i.type, i.cost, i.costStatus]), [['AR-1 Gun', 'Assault Rifle', 10, 'confirmed'], ['Plate', 'Helmet', null, UNCONFIRMED], ['Plate', 'Medium Armor', 7, 'confirmed'], ['Super Credits', 'Currency', 1, 'confirmed']], 'template items pair with table rows by image; a cost mismatch is unconfirmed');
eq([p1[1].templateCost, p1[1].tableCost], [5, 6], 'both disputed costs are kept');
const p2 = parsed.pages[1].items;
ok(p2[0].pageStatus === UNCONFIRMED && p2[0].tablePage === 3 && p2[0].cost === null, 'an item the table puts on another page is unconfirmed');
ok(parsed.pages[2].items[0].pageStatus === UNCONFIRMED, 'and so is its counterpart');
ok(p2[1].nameStatus === UNCONFIRMED && p2[1].tableName === 'Banker' && p2[1].cost === 3, 'a spelling difference is reported but the agreed cost stays');
eq(p2[2].superCredits, 50, 'Super Credits amount comes from the table');
eq(parsed.discrepancies.map(d => [d.page, d.code]).sort(), [[1, 'cost-differs'], [2, 'name-differs'], [2, 'page-differs'], [2, 'unlock-missing'], [3, 'page-differs']].sort(), 'discrepancy list');
eq(parsed.totals, { infobox: 48, template: 48, table: 49 }, 'totals: template matches the infobox, table sum kept for reference');
// Totals that do not add up are unconfirmed rather than trusted.
const badTotal = parseWarbondPage(sample.replace('Medals|48', 'Medals|60').replace('SC|150', 'SC|300').replace('Medals|40}}', 'Medals|50}}'), 'Bad Premium Warbond');
ok(badTotal.totalCost === null && badTotal.totalStatus === UNCONFIRMED, 'all-items mismatch is unconfirmed');
ok(badTotal.creditClaim === null && badTotal.creditClaimStatus === UNCONFIRMED, 'credit-claim mismatch is unconfirmed');
ok(badTotal.allPages === null && badTotal.pages[2].unlock === null, 'all-pages vs last page unlock mismatch is unconfirmed');
eq(badTotal.discrepancies.filter(d => ['all-items-differs', 'credit-claim-differs', 'unlock-vs-all-pages'].includes(d.code)).length, 3, 'each total mismatch is reported');
ok(parseWarbondPage(sample.replace('|cost={{Currency|SC|1,000}}', '|type = Standard\n|cost=Free'), 'Helldivers Mobilize Warbond').tier === 'standard', 'type=Standard → standard tier, Free price');
eq(parseTableRows('{|class="wikitable"\n!h\n|-\n|[[File:a.png|link=]]||Still Standing||[[Title]]||{{Currency|Medals|20|notext}}\n|}').map(r => [r.name, r.type, r.cost, r.link]), [['Still Standing', 'Title', 20, null]], 'plain-text table rows');

// --- The real snapshot ------------------------------------------------------------------------
const snapshot = JSON.parse(await readFile(new URL('db/source/wiki_warbonds.json', root), 'utf8'));
const korean = JSON.parse(await readFile(new URL('db/source/warbond_korean_names.json', root), 'utf8'));
const koreanKeys = Object.keys(korean);
ok(Object.values(korean).every(name => typeof name === 'string' && name.trim()), 'the Korean name file holds only names (no notes or metadata)');
eq(Object.keys(snapshot.pages).length, 26, 'snapshot holds the 26 warbond pages');
eq(koreanKeys.length, 26, 'all 26 Korean warbond names are in the repo');
// User-specified: keeps the game's official mistranslation as-is, including the "(오역)" marker.
eq(korean['Exo Experts'], '외계 전문가(오역)', 'Exo Experts Korean name in db/source is exact');
eq(warbonds.find(w => w.id === 'exo-experts').name, '외계 전문가(오역)', 'Exo Experts Korean name in the generated data is exact');
const { english } = await import('../dist/i18n/en.js');
eq(english['외계 전문가(오역)'], 'Exo Experts', 'Exo Experts has English in the dictionary');
ok(!Object.hasOwn(english, '외계 전문가'), 'the old Exo Experts name is gone from the dictionary');
eq(warbonds.length, 26, '26 warbonds generated');
for (const warbond of warbonds) {
  const title = Object.keys(snapshot.pages).find(t => warbondId(t) === warbond.id);
  ok(title && korean[baseTitle(title)] === warbond.name, `${warbond.id}: Korean name from the provided list`);
  ok(Number.isInteger(snapshot.pages[title].revision) && /^\d{4}-\d\d-\d\dT/.test(snapshot.pages[title].revisionTimestamp) && warbond.revision === snapshot.pages[title].revision, `${warbond.id}: revision recorded`);
  ok(/^\d{4}-\d\d-\d\d$/.test(warbond.date), `${warbond.id}: ISO date`);
  ok(warbondTiers.some(tier => tier.id === warbond.tier), `${warbond.id}: tier`);
  ok(Number.isInteger(warbond.price) && warbond.price >= 0, `${warbond.id}: price`);
  // Totals cross-check: an infobox total is shown only when the template costs add up to it.
  const parsedPage = parseWarbondPage(snapshot.pages[title].wikitext, title);
  ok(warbond.totalStatus === UNCONFIRMED || parsedPage.totals.template === warbond.totalCost, `${warbond.id}: medal total matches the template sum`);
  for (const p of warbond.pages) {
    for (const i of p.items) {
      ok(i.costStatus === 'confirmed' ? Number.isInteger(i.cost) && i.cost > 0 : i.cost === null && i.costStatus === UNCONFIRMED, `${warbond.id} p${p.number} ${i.name}: cost is a number or 미확인`);
      if (i.ref) ok(i.ref.view === 'gear' ? personalWeapons.some(w => w.id === i.ref.id) : stratagemById.has(i.ref.id), `${warbond.id}: ${i.name} links to an existing entry`);
    }
    ok(p.costStatus === 'confirmed' ? p.cost === p.items.reduce((s, i) => s + i.cost, 0) : p.cost === null, `${warbond.id} p${p.number}: page total`);
    ok(p.unlockStatus === 'confirmed' ? Number.isInteger(p.unlock) : p.unlock === null, `${warbond.id} p${p.number}: unlock is a number or 미확인`);
  }
}
eq(['standard', 'premium', 'legendary'].map(tier => warbonds.filter(w => w.tier === tier).length), [1, 22, 3], 'tier counts');
// Every unconfirmed value in the data is explained by a discrepancy record, and vice versa.
const unconfirmedKeys = new Set(warbonds.flatMap(w => [
  ...w.pages.flatMap(p => p.items.filter(i => i.costStatus !== 'confirmed' || i.nameStatus).map(i => `${w.id}:${p.number}:item`)),
  ...w.pages.filter(p => p.unlockStatus !== 'confirmed').map(p => `${w.id}:${p.number}:unlock`),
  ...(w.totalStatus !== 'confirmed' ? [`${w.id}:-:all-items`] : []),
]));
const recordKeys = new Set(warbondDiscrepancies.map(d => `${d.warbondId}:${d.page ?? '-'}:${d.item ? 'item' : d.field}`));
eq([...unconfirmedKeys].filter(key => !recordKeys.has(key)), [], 'every 미확인 has a discrepancy record');
eq([...recordKeys].filter(key => !unconfirmedKeys.has(key) && !key.endsWith('credit-claim')), [], 'every discrepancy shows up as 미확인');
// Links into the existing weapon/stratagem views.
eq([warbondLinks.weapons, warbondLinks.stratagems, warbondLinks.unmatched.length], [92, 31, 0], 'weapon/stratagem link counts');
ok(warbondLinks.matchedWithoutCode.every(m => personalWeapons.some(w => w.id === m.id) || stratagemById.has(m.id)), 'fallback matches point at real entries');
// LAS-16 Trident (Siege Breakers p1) is the site's LAS-13 Trident: an explicit rename, backed by the weapon page.
const trident = warbonds.find(w => w.id === 'siege-breakers').pages[0].items.find(i => i.name === 'LAS-16 Trident');
eq([trident?.ref, trident?.cost], [{ view: 'gear', id: 'trident' }, 35], 'LAS-16 Trident links to the Trident at 35 medals');
eq(RENAMED['LAS-16 Trident'], 'LAS-13 Trident', 'Trident rename is explicit');
ok(!warbondLinks.matchedWithoutCode.some(m => m.name === 'LAS-16 Trident'), 'Trident does not rely on the loose fallback');
const tridentPage = JSON.parse(await readFile(new URL('db/source/wiki_pages.json', root), 'utf8')).pages['LAS-13 Trident'].wikitext;
ok(/\|\s*source\s*=\s*\[\[Siege Breakers Premium Warbond#Page 1/.test(tridentPage) && /Siege Breakers Premium Warbond\]\] for \{\{Currency\|Medals\|35\}\}/.test(tridentPage), 'LAS-13 Trident page: Siege Breakers page 1, 35 medals');
ok(tridentPage.includes('Changed name from "LAS-16 Trident"'), 'LAS-13 Trident page records the rename from LAS-16 Trident');
for (const ref of warbonds.flatMap(w => w.pages.flatMap(p => p.items.map(i => i.ref).filter(Boolean)))) ok(parseRoute(`#/${ref.view}/${ref.id}`).id === ref.id, `link route ${ref.view}/${ref.id}`);
// Cover images.
for (const warbond of warbonds) {
  const image = warbondImages[warbond.id];
  ok(image && image.width <= 240, `${warbond.id}: small cover`);
  await access(new URL(`dist/${image.src.slice(2)}`, root)); checks++;
}
// Generated output is current, deterministic, LF only, and independent of snapshot key order.
const first = await generate(), second = await generate();
const onDisk = await readFile(new URL('dist/data/warbonds.js', root), 'utf8');
ok(first.text === second.text, 'build is deterministic');
ok(first.text === onDisk, 'dist/data/warbonds.js is up to date (run node scripts/build-warbonds.mjs)');
ok(!onDisk.includes('\r'), 'LF line endings');
const reversed = { ...snapshot, pages: Object.fromEntries(Object.entries(snapshot.pages).reverse()) };
eq(buildWarbonds(reversed, korean).warbonds.map(w => w.id), warbonds.map(w => w.id), 'snapshot order does not matter');
assert.throws(() => buildWarbonds(snapshot, { ...korean, 'Cutting Edge': '' }), /No Korean name/); checks++;
assert.throws(() => buildWarbonds(snapshot, { ...korean, 'Made Up': '가짜' }), /without a warbond page/); checks++;
ok(parseRoute('').view === 'warbonds', 'warbonds is the main page');

console.log(`PASS warbonds: ${checks} checks (${warbonds.length} warbonds, ${warbondDiscrepancies.length} wiki discrepancies left 미확인, ${warbondLinks.weapons} weapon + ${warbondLinks.stratagems} stratagem links).`);
