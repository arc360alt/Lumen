// Small building blocks shared by the steps — the same ones LiquidDesktop's System Settings uses
// (row, toggle, segmented, hero, glass alerts), plus a searchable list.
import { h, $ } from './util.js';
import { sym } from './icons.js';

export const row = (label, control, sub) => h('div.row', h('div.label', label, sub ? h('small', sub) : null), control);

export const toggle = (checked, onChange) => h('label.toggle', h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onChange(e.target.checked) }), h('span'));

export function seg(value, opts, onChange) {
  const el = h('div.segmented');
  const draw = (v) => { el.innerHTML = ''; for (const [id, label] of opts) el.append(h('button' + (v === id ? '.on' : ''), { onclick: () => { draw(id); onChange(id); } }, label)); };
  draw(value);
  return el;
}

export function select(value, opts, onChange, style = {}) {
  return h('select.field.square', { style: { height: '28px', minWidth: '160px', ...style }, onchange: (e) => onChange(e.target.value) },
    ...opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
}

// the big icon + title + text at the top of a pane (Settings › any pane)
export function hero(color, icon, title, text) {
  return h('div.set-hero', h('div.sq-icon', { style: { background: color }, html: icon }), h('h2', title), h('p', text));
}

const WARN = '<svg class="sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18.5A2 2 0 0 0 3.5 21.5h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
export const warnIcon = WARN;
export const note = (kind, text) => h('div.note.' + kind, { html: kind === 'info' ? sym.info : WARN }, h('div', text));

/**
 * A searchable list in a group: items are { id, label, sub?, search? }.
 * onPick(id) is called on click; the selected item is scrolled into view.
 */
export function pickList({ items, value, onPick, placeholder = 'Search', height }) {
  const list = h('div.pick-list', height ? { style: { maxHeight: height + 'px' } } : null);
  const input = h('input.field', { placeholder, spellcheck: false, oninput: () => draw() });
  const wrap = h('div.group.pick', h('div.search-field', { html: sym.search }, input), list);
  let current = value;
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    list.innerHTML = '';
    const shown = q ? items.filter((i) => (i.search || (i.label + ' ' + (i.sub || '') + ' ' + i.id)).toLowerCase().includes(q)) : items;
    for (const it of shown.slice(0, 400)) {
      list.append(h('div.pick-item' + (it.id === current ? '.sel' : ''), { 'data-id': it.id, onclick: () => { current = it.id; draw(); onPick(it.id); } },
        h('span.ellipsis', it.label), it.sub ? h('span.sub', it.sub) : null));
    }
    if (!shown.length) list.append(h('div.pick-empty', 'No matches'));
  };
  draw();
  requestAnimationFrame(() => list.querySelector('.sel')?.scrollIntoView({ block: 'center' }));
  wrap.set = (id) => { current = id; draw(); requestAnimationFrame(() => list.querySelector('.sel')?.scrollIntoView({ block: 'center' })); };
  return wrap;
}

/** A LiquidDesktop glass alert. Resolves with the index of the button pressed (Escape = cancel button). */
export function alertDialog({ icon, title, text, buttons = [{ label: 'OK', primary: true }], cancel = -1 }) {
  return new Promise((resolve) => {
    const close = (i) => { layer.remove(); removeEventListener('keydown', key, true); resolve(i); };
    const key = (e) => { if (e.key === 'Escape' && cancel >= 0) { e.preventDefault(); close(cancel); } };
    const layer = h('div.global-alert-layer',
      h('div.alert.glass.panel',
        icon ? h('div.a-icon', { html: icon }) : null,
        h('h3', title), text ? h('p', text) : null,
        h('div.a-btns' + (buttons.length > 2 ? '.stack' : ''), ...buttons.map((b, i) => h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { onclick: () => close(i) }, b.label)))));
    document.body.append(layer);
    addEventListener('keydown', key, true);
    requestAnimationFrame(() => $('.btn.primary, .btn.danger', layer)?.focus());
  });
}

export const fmtBytes = (b) => {
  if (!b) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
