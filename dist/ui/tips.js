// Labels that explain themselves on hover or focus: one floating .tip-pop under the hovered or focused [data-tip]
// element, kept inside the window. Bound once on the document, so it also works in the detail sheet (a dialog
// outside the view).
import { html } from './dom.js';

// A label with its note (the col-tip look: dotted underline, focusable).
export const tipLabel = (label, tip) => html`<span class="col-tip" tabindex="0" data-tip="${tip}">${label}</span>`;

function showTip(event) {
  const head = event.target.closest?.('[data-tip]');
  if (!head) return;
  let pop = document.getElementById('tip-pop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'tip-pop'; pop.className = 'tip-pop'; pop.setAttribute('role', 'tooltip'); }
  // A modal dialog (the detail sheet) sits in the top layer: the box must live inside it to show above it.
  const host = head.closest('dialog') ?? document.body;
  if (pop.parentElement !== host) host.append(pop);
  pop.textContent = head.dataset.tip;
  pop.hidden = false;
  head.setAttribute('aria-describedby', 'tip-pop');
  const rect = head.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - pop.offsetWidth - 8);
  const below = rect.bottom + 6 + pop.offsetHeight <= window.innerHeight;
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? rect.bottom + 6 : rect.top - pop.offsetHeight - 6}px`;
}
function hideTip(event) {
  const head = event.target.closest?.('[data-tip]');
  if (!head || head.contains(event.relatedTarget) || (event.type === 'mouseout' && document.activeElement === head)) return;
  const pop = document.getElementById('tip-pop');
  if (pop) pop.hidden = true;
}

let bound = false;
export function bindTips() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  document.addEventListener('mouseover', showTip);
  document.addEventListener('focusin', showTip);
  document.addEventListener('mouseout', hideTip);
  document.addEventListener('focusout', hideTip);
}
