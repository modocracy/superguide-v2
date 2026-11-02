// Google Analytics runs only on the published GitHub Pages sites, never on
// local previews. Each site reports to its own GA4 property. Page views come
// from GA itself; this adds a view event per tool.
const MEASUREMENT_IDS = {
  superguide: 'G-5XFT3VQ054',     // original site
  'superguide-v2': 'G-XKLV3JPDC0', // this rebuild
};

export function initAnalytics(win = window, doc = document) {
  const { protocol, hostname, pathname } = win.location;
  const site = Object.keys(MEASUREMENT_IDS).find(name => pathname === `/${name}` || pathname.startsWith(`/${name}/`));
  if (protocol !== 'https:' || hostname !== 'modocracy.github.io' || !site) return () => {};
  const id = MEASUREMENT_IDS[site];

  win.dataLayer = win.dataLayer || [];
  win.gtag = win.gtag || function gtag() { win.dataLayer.push(arguments); };
  win.gtag('js', new Date());
  win.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  doc.head.appendChild(script);

  // Keep the previous site's feature names so reports read the same across both.
  const feature = { warbonds: 'warbonds', arsenal: 'catalog', gear: 'gear', enemy: 'combat', demolition: 'demolition', factions: 'factions' };
  let last;
  return view => {
    if (!feature[view] || view === last) return;
    last = view;
    win.gtag('event', 'view_feature', { feature: feature[view], send_to: id });
  };
}
