import { L } from '../core/i18n.js';
import { $, $$, html, icon, raw } from './dom.js';

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

export function itemVariantPanel(id, selected, content) {
  return html`<div class="variant-panel" data-variant-panel="${id}" ${id === selected ? '' : raw('hidden')}>${content}</div>`;
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
    $$('[data-fire-mode]', body).find(button => button.dataset.fireMode === snapshot.firingMode)?.click();
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
      state.panelSnapshot = null;
      const { view, query } = ctx.route;
      ctx.replace({ view, query: { ...query, m: '', full: '' } });
    },
  });
  if (previousPanel) restorePanel(body, previousPanel);
  if (toggleFocused) $('[data-item-detail-toggle]', body)?.focus({ preventScroll: true });
}

export function selectItemVariant(state, variant) {
  state.variant = variant;
  const sheet = $('#sheet');
  const buttons = $$('[data-variant]', sheet);
  const selected = variant || buttons[0]?.dataset.variant;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.variant === selected));
  for (const panel of $$('[data-variant-panel]', sheet)) panel.hidden = panel.dataset.variantPanel !== selected;
}

export function updateItemDetail(ctx, state, route, id, variants, openDetail) {
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
  const requestedVariant = variants?.some(mode => mode.id === requested) ? requested : '';
  const variant = changedSize && !expanded ? state.variant : requestedVariant;
  state.expanded = expanded;
  if (changedSize && !expanded && variant !== requested) {
    // The previous history entry still has the mode selected before expansion.
    ctx.replace({ ...route, query: { ...route.query, m: variant } });
  }
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
  if (state.variant !== variant) selectItemVariant(state, variant);
}
