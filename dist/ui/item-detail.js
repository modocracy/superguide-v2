import { L } from '../core/i18n.js';
import { $, $$, html, icon, raw } from './dom.js';

export const FORCE_NOTE = L(
  '철거력은 시설을 파괴하는 데 필요한 힘이며, 저지력은 적의 동작을 끊는 힘(적마다 기준값이 다름), 넉백은 밀어내는 힘입니다.',
  'Demolition force is what it takes to destroy a structure, stagger force interrupts an enemy (each enemy has its own threshold), and push force knocks it back.',
);

export const detailStatCell = (stat, keepClass = false) => html`<div><dt>${stat.icon ? html`<span class="ico-${stat.icon}" aria-hidden="true"></span>` : ''}${stat.label}</dt><dd${stat.dim || keepClass ? raw(` class="${stat.dim ? 'dim' : ''}"`) : ''}>${stat.text}${stat.unit ? html`<small>${stat.unit}</small>` : ''}</dd>${stat.caption ? html`<div class="caption">${stat.caption}</div>` : ''}${stat.warn ? html`<div class="caption force-note">${stat.warn}</div>` : ''}</div>`;

export function bindItemSheetActions(viewName, state, ctx, { onCompare = null, onVariant = null } = {}) {
  const sheet = $('#sheet');
  sheet.addEventListener('click', event => {
    if (document.body.dataset.view !== viewName) return;
    if (onCompare) {
      const compareBtn = event.target.closest('[data-compare]');
      if (compareBtn) onCompare(compareBtn.dataset.compare);
    }
    const pick = event.target.closest('[data-variant]');
    if (pick) {
      selectItemVariant(state, pick.dataset.variant);
      onVariant?.();
    }
    if (event.target.closest('[data-item-detail-toggle]')) toggleItemDetail(ctx);
  });
}

export function itemDetailToggle(expanded) {
  return html`<button class="button ghost item-detail-toggle" type="button" data-item-detail-toggle aria-expanded="${String(expanded)}">
    <span class="item-detail-expand">${icon('expand', 16)} ${L('전체 화면', 'Full screen')}</span>
    <span class="item-detail-collapse">${icon('collapse', 16)} ${L('패널로 돌아가기', 'Back to panel')}</span>
  </button>`;
}

export function detailColumns(...sections) {
  const visible = sections.filter(Boolean);
  if (visible.length < 2) return visible[0] ?? '';
  return html`<div class="item-detail-columns">${visible.map(section => html`<div>${section}</div>`)}</div>`;
}

export function detailModeList(title, modes) {
  return html`<section class="block"><h3>${title}</h3>
    <div class="item-detail-columns">${modes.map(({ name, content }) => html`<section class="item-detail-mode"><h4>${name}</h4>${content}</section>`)}</div>
  </section>`;
}

export function detailDisclosure(title, content, { className, expanded, meta = '' }) {
  const heading = html`<h3>${title}</h3>${meta}`;
  return expanded
    ? html`<section class="block ${className}"><header class="item-detail-section-heading">${heading}</header>${content}</section>`
    : html`<details class="block ${className} disclosure"><summary>${heading}</summary>${content}</details>`;
}

// A mode tab's stats, titled like the key stats of a weapon without modes (user request 2026-11-25).
export function itemVariantPanel(id, selected, content) {
  return html`<div class="variant-panel" data-variant-panel="${id}" ${id === selected ? '' : raw('hidden')}><h3 class="variant-panel-title">${L('기본 수치', 'Key stats')}</h3>${content}</div>`;
}

export function openItemPanel(ctx, id) {
  const { query, view } = ctx.route;
  ctx.go({ view, id, query: { ...query, m: '', full: '' } }, { entryState: { itemDetail: 'panel' } });
}

export function toggleItemDetail(ctx) {
  const route = ctx.route;
  const expanded = route.query.full === '1';
  if (expanded && history.state?.itemDetail === 'expanded') {
    history.back();
    return;
  }
  const next = { ...route, query: { ...route.query, full: expanded ? '' : '1' } };
  ctx.go(next, expanded ? { replace: true } : { entryState: { itemDetail: 'expanded' } });
}

function panelSnapshot(body) {
  return {
    scrollTop: body.scrollTop,
    disclosures: $$('details', body).map(section => section.open),
    firingMode: $('[data-fire-mode][aria-pressed="true"]', body)?.dataset.fireMode,
  };
}

function restorePanel(body, snapshot) {
  const sections = $$('details', body);
  snapshot.disclosures.forEach((open, index) => { if (sections[index]) sections[index].open = open; });
  if (snapshot.firingMode) {
    const button = $$('[data-fire-mode]', body).find(item => item.dataset.fireMode === snapshot.firingMode);
    if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
  }
  body.scrollTop = snapshot.scrollTop;
}

export function openItemSheet(ctx, state, content, { label, keepScroll = false }) {
  const body = $('#sheet-body');
  const toggleFocused = document.activeElement?.matches('[data-item-detail-toggle]');
  const previousPanel = keepScroll && !state.expanded && !$('#sheet').classList.contains('expanded') ? panelSnapshot(body) : null;
  ctx.openSheet(content, {
    expanded: state.expanded,
    keepScroll,
    label,
    onCollapse: () => toggleItemDetail(ctx),
    onClose: () => {
      if (!state.detail) return;
      if (history.state?.itemDetail === 'panel') {
        history.back();
        return;
      }
      state.detail = null;
      state.variant = '';
      state.expanded = false;
      state.panelSnapshot = null;
      const { view, query } = ctx.route;
      ctx.replace({ view, query: { ...query, m: '', full: '' } });
    },
  });
  if (previousPanel) restorePanel(body, previousPanel);
  if (toggleFocused) $('[data-item-detail-toggle]', body)?.focus({ preventScroll: true });
  stickyModes(body);
}

// Once the mode tabs (Main barrel / Underbarrel ...) scroll out of sight, a copy of them shows in the sheet's top bar,
// left of the close button (user request 2026-11-25). The copy's buttons carry the same data-variant, so a click on
// either picks the mode and selectItemVariant keeps both pressed alike.
let unwireModes = null;
function stickyModes(body) {
  unwireModes?.();
  unwireModes = null;
  const tabs = $('.variant-tabs .segmented', body), top = $('.sheet-top', body);
  if (!tabs || !top) return;
  const copy = tabs.cloneNode(true);
  copy.classList.add('sheet-top-modes');
  copy.hidden = true;
  (top.querySelector('[data-close]') ?? top.lastElementChild).before(copy);
  // Shown once the tabs have gone up under the top bar, checked on scroll (one check per frame).
  let frame = 0;
  const check = () => {
    frame = 0;
    const hide = tabs.getBoundingClientRect().bottom > top.getBoundingClientRect().bottom;
    if (hide !== copy.hidden) { copy.hidden = hide; top.classList.toggle('has-modes', !hide); }
  };
  const onScroll = () => { frame ||= requestAnimationFrame(check); };
  body.addEventListener('scroll', onScroll, { passive: true });
  unwireModes = () => { body.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  check();
}

export function selectItemVariant(state, variant) {
  state.variant = variant;
  const sheet = $('#sheet');
  const buttons = $$('[data-variant]', sheet);
  const selected = variant || buttons[0]?.dataset.variant;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.variant === selected));
  for (const panel of $$('[data-variant-panel]', sheet)) panel.hidden = panel.dataset.variantPanel !== selected;
  // Parts that do not apply to some modes (data-variant-hide lists them), e.g. the recoil simulation.
  for (const part of $$('[data-variant-hide]', sheet)) part.hidden = part.dataset.variantHide.split(' ').includes(selected);
}

export function updateItemDetail(ctx, state, route, id, variants, openDetail, { refresh = false } = {}) {
  if (!id) {
    if (!state.detail) return;
    Object.assign(state, { detail: null, variant: '', expanded: false, panelSnapshot: null });
    ctx.closeSheet();
    return;
  }
  const sameItem = id === state.detail;
  const expanded = route.query.full === '1';
  const changedSize = sameItem && state.expanded !== expanded;
  const requested = route.query.m || '';
  const variant = variants?.some(mode => mode.id === requested) ? requested : '';
  state.expanded = expanded;
  if (!sameItem || !$('#sheet').open) {
    Object.assign(state, { detail: id, variant, panelSnapshot: null });
    openDetail(id);
    return;
  }
  if (changedSize) {
    const body = $('#sheet-body');
    if (expanded) state.panelSnapshot = panelSnapshot(body);
    state.variant = variant;
    openDetail(id, true);
    if (!expanded && state.panelSnapshot) restorePanel(body, state.panelSnapshot);
    else body.scrollTop = 0;
    return;
  }
  if (refresh) {
    state.variant = variant;
    openDetail(id, true);
    return;
  }
  if (state.variant !== variant) selectItemVariant(state, variant);
}

// Two renderings of the same stat grid made into one: a value or caption that differs shows as 'low~high', number by
// number when the rest of the text is the same ('AP 4~5'), else whole ('중장갑~대전차').
export function rangeGrid(low, high) {
  const CELL = /<div><dt>([\s\S]*?)<\/dt><dd([^>]*)>([\s\S]*?)<\/dd>(?:<div class="caption">([\s\S]*?)<\/div>)?<\/div>/g;
  const merge = (a = '', b = '') => {
    if (a === b) return a;
    const pa = a.split(/(\d[\d,.]*)/), pb = b.split(/(\d[\d,.]*)/);
    if (pa.length === pb.length && pa.every((part, i) => i % 2 || part === pb[i])) return pa.map((part, i) => (i % 2 && part !== pb[i] ? `${part}~${pb[i]}` : part)).join('');
    return `${a}~${b}`;
  };
  const highCells = [...high.matchAll(CELL)];
  let index = 0;
  return low.replace(CELL, (whole, dt, attrs, dd, caption) => {
    const other = highCells[index++];
    if (!other || other[1] !== dt) return whole;
    const text = merge(caption, other[4]);
    return `<div><dt>${dt}</dt><dd${attrs}>${merge(dd, other[3])}</dd>${text ? `<div class="caption">${text}</div>` : ''}</div>`;
  });
}
