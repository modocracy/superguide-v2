// Downloads each ship module upgrade's own wiki page and keeps its "Affected Stratagems" list (the
// stratagems the upgrade changes, as page links) in db/source/wiki_ship_module_pages.json with the
// page revision (user request 2026-11-26). The module names come from the Ship Modules table in
// db/source/wiki_stratagem_stats.json. A page with no such section keeps an empty list.
// Usage: node scripts/fetch-ship-module-pages.mjs  ->  node scripts/build-ship-module-upgrades.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { parseShipModules } from './ship-module-parse.mjs';

const API = 'https://helldivers.wiki.gg/api.php';
const UA = 'HD2FieldGuide/2.0 (fan site data check; contact via github modocracy)';

// The first link of each bullet of the "Affected Stratagems" section, in page order: [[Target|Shown]] gives Target. Links
// later in a bullet are notes ('... but not the Mission Stratagem for [[Destroy Spore Lung]] missions').
export function affectedStratagems(text) {
  const section = /==\s*Affected Stratagems\s*==([\s\S]*?)(?:\n==[^=]|$)/i.exec(text)?.[1] ?? '';
  return section.split('\n').filter(line => /^\s*\*/.test(line)).map(line => /\[\[([^\]|#]+)/.exec(line)?.[1]?.trim()).filter(title => title && !/^(File|Category):/i.test(title));
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/').replace(/^\//, '')}`) {
  const table = JSON.parse(await readFile(new URL('../db/source/wiki_stratagem_stats.json', import.meta.url), 'utf8')).shipModules;
  const titles = parseShipModules(table.text).sections.flatMap(section => section.modules.map(module => module.en));
  const params = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', format: 'json', formatversion: '2', redirects: '1', titles: titles.join('|') });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  const redirect = new Map((json.query.redirects ?? []).map(r => [r.from, r.to]));
  const out = { source: API, retrievedAt: new Date().toISOString().slice(0, 10), pages: {} };
  for (const title of titles) {
    const page = json.query.pages.find(p => p.title === (redirect.get(title) ?? title));
    if (!page || page.missing) throw new Error(`${title}: no wiki page`);
    const revision = page.revisions[0];
    out.pages[title] = { title: page.title, revision: revision.revid, affected: affectedStratagems(revision.slots.main.content) };
  }
  await writeFile(new URL('../db/source/wiki_ship_module_pages.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  console.log(`${titles.length} module pages; ${Object.values(out.pages).filter(p => p.affected.length).length} with an Affected Stratagems list`);
}
