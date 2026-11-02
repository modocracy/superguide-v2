// Downloads every page in the wiki's Category:Warbonds (wikitext + revision) into
// db/source/wiki_warbonds.json. Parsing happens offline in scripts/warbond-parse.mjs
// (used by build-warbonds.mjs and the tests); this script only prints a summary.
// Usage: node scripts/fetch-warbonds.mjs
// wiki.gg rejects browser (Mozilla) User-Agents, so a plain tool UA is sent.
import { writeFile } from 'node:fs/promises';
import { parseWarbondPage } from './warbond-parse.mjs';

const API = 'https://helldivers.wiki.gg/api.php';
const UA = 'HD2FieldGuide/2.0 (fan site data check; contact via github modocracy)';
const CATEGORY = 'Category:Warbonds';
const wait = ms => new Promise(done => setTimeout(done, ms));

const get = async params => {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(params).slice(0, 120)}`);
  const body = await res.json();
  if (body.error) throw new Error(`${body.error.code}: ${body.error.info}`);
  return body;
};

const members = [];
let cont = {};
do {
  const r = await get({ action: 'query', list: 'categorymembers', cmtitle: CATEGORY, cmnamespace: '0', cmlimit: '500', ...cont });
  members.push(...r.query.categorymembers);
  cont = r.continue || null;
} while (cont);
const titles = members.map(page => page.title).sort();
console.log(`${CATEGORY}: ${titles.length} pages`);

const retrievedAt = new Date().toISOString().slice(0, 10);
const pages = {};
for (let start = 0; start < titles.length; start += 50) {
  await wait(250);
  const r = await get({ action: 'query', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main', titles: titles.slice(start, start + 50).join('|') });
  for (const page of r.query.pages) {
    const rev = page.revisions?.[0];
    if (!rev) throw new Error(`No revision for ${page.title}`);
    pages[page.title] = {
      source: `https://helldivers.wiki.gg/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_')).replace(/%2F/g, '/')}`,
      pageid: page.pageid,
      revision: rev.revid,
      revisionTimestamp: rev.timestamp,
      retrievedAt,
      wikitext: rev.slots.main.content,
    };
  }
}
const missing = titles.filter(title => !pages[title]);
if (missing.length) throw new Error(`Missing pages: ${missing.join(', ')}`);
// The category also holds the "Warbonds" overview page; only pages with the
// warbond infobox are individual warbonds.
const isWarbond = title => /\{\{\s*Infobox[ _]Warbond/i.test(pages[title].wikitext);
const kept = titles.filter(isWarbond);
const skipped = Object.fromEntries(titles.filter(title => !isWarbond(title)).map(title => [title, { revision: pages[title].revision, reason: 'no Infobox Warbond (overview page)' }]));

const body = {
  source: `https://helldivers.wiki.gg/wiki/${CATEGORY}`,
  license: 'CC BY-NC-SA 4.0',
  retrievedAt,
  categoryMembers: titles.length,
  skipped,
  pages: Object.fromEntries(kept.map(title => [title, pages[title]])),
};
await writeFile(new URL('../db/source/wiki_warbonds.json', import.meta.url), JSON.stringify(body, null, 1) + '\n');

for (const title of kept) {
  const parsed = parseWarbondPage(pages[title].wikitext, title);
  console.log(`${title} r${pages[title].revision}: ${parsed.pages.length} pages, ${parsed.pages.reduce((n, p) => n + p.items.length, 0)} items, ${parsed.discrepancies.length} discrepancies`);
}
console.log(`Wrote db/source/wiki_warbonds.json (${kept.length} warbonds; skipped ${Object.keys(skipped).join(', ') || 'none'}; retrieved ${retrievedAt}).`);
