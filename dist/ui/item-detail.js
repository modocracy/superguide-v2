import { L } from '../core/i18n.js';
import { $, $$, html, icon, raw } from './dom.js';

export function itemDetailToggle(expanded) {
  return html`<button class="button ghost item-detail-toggle" type="button" data-item-detail-toggle aria-expanded="${String(expanded)}">
    <span class="item-detail-expand">${icon('expand', 16)} ${L('전체 화면', 'Full screen')}</span>
    <span class="item-detail-collapse">${icon('collapse', 16)} ${L('패널로 돌아가기', 'Back to panel')}</span>
  </button>`;
}

export function detailStatsLayout(base, blasts, extra, ballistics) {
  return html`<div class="item-detail-stats">
    <div class="item-detail-primary">${base}<div class="item-detail-extra">${extra}</div></div>
    <div class="item-detail-figures">
      <div class="item-detail-blasts">${blasts}</div>
      <div class="item-detail-ballistics">${ballistics}</div>
    </div>
  </div>`;
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

export function openItemSheet(ctx, state, content, { label, keepScroll = false }) {
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
      const { view, query } = ctx.route;
      ctx.replace({ view, query: { ...query, m: '', full: '' } });
    },
  });
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
    Object.assign(state, { detail: null, variant: '', expanded: false });
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
    Object.assign(state, { detail: id, variant });
    openDetail(id);
    return;
  }
  if (state.variant !== variant) selectItemVariant(state, variant);
  if (changedSize) ctx.setSheetExpanded(expanded);
}
