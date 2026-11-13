// Install Lumen — the window: LiquidDesktop window chrome (traffic lights, floating glass sidebar, settings pane)
// with one sidebar item per step, and a floating Back / Continue capsule.
import { h, $ } from './util.js';
import { sym, logoBadge } from './icons.js';
import { state, events, api, TEST, params } from './state.js';
import { alertDialog, warnIcon } from './ui.js';
import welcome from './steps/welcome.js';
import locationStep from './steps/location.js';
import keyboard from './steps/keyboard.js';
import storage from './steps/storage.js';
import account from './steps/account.js';
import review from './steps/review.js';
import install from './steps/install.js';

const STEPS = [welcome, locationStep, keyboard, storage, account, review, install];

// light / dark: forced with --theme=, otherwise like LiquidDesktop's "Auto" (dark from 7 pm to 7 am)
const root = document.documentElement;
const pickTheme = () => {
  const forced = params.get('theme');
  const hr = new Date().getHours();
  root.dataset.theme = forced === 'light' || forced === 'dark' ? forced : (hr >= 19 || hr < 7 ? 'dark' : 'light');
};
pickTheme();
setInterval(pickTheme, 60000);
// inside LiquidDesktop the compositor blurs behind us only when it knows the window (see the README)
if (params.get('blur') === '1') root.dataset.blur = 'true';

let index = 0, maxReached = 0, locked = false, lastIndex = 0;

/* ------------------------------------------------------------------ window chrome */
const tl = (cls, title, path, onclick) => h('button.' + cls, { title, onclick, html: `<svg viewBox="0 0 10 10"><path d="${path}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>` });
const traffic = h('div.traffic',
  tl('tl-close', 'Close', 'M2.5 2.5l5 5M7.5 2.5l-5 5', () => requestClose()),
  tl('tl-min', 'Minimize', 'M2 5h6', () => api.win.minimize()),
  tl('tl-max', 'Zoom', 'M3 3h4v4H3z', () => api.win.toggleMaximize()));
const titlebar = h('div.win-titlebar', h('div.drag', { ondblclick: () => api.win.toggleMaximize() }), traffic);

const stepNav = h('div');
const sidebar = h('aside.sidebar',
  h('div.inst-brand', h('div.logo', { html: logoBadge() }), h('div', h('b', 'Install Lumen'), h('small', 'with LiquidDesktop'))),
  stepNav,
  h('div.inst-side-foot', TEST ? h('div.test-badge', 'Test mode — nothing is changed') : null, h('div.ver')));

const inner = h('div.inner');
const pane = h('div.settings-pane', inner);
const hint = h('div.hint');
const backBtn = h('button.btn', { onclick: () => go(index - 1) }, 'Back');
const nextBtn = h('button.btn.primary', { onclick: () => next() }, 'Continue');
const foot = h('div.inst-foot', hint, h('div.spacer'), backBtn, nextBtn);
const main = h('div.main-pane', pane, foot);

const win = h('div.win.inst.focused', h('div.win-clip', h('div.win-body', sidebar, main), titlebar));
$('#app').append(win);
api.win.onState((s) => { if ('focused' in s) win.classList.toggle('focused', s.focused); if ('maximized' in s) win.classList.toggle('maximized', s.maximized); });

/* ------------------------------------------------------------------ steps */
function drawNav() {
  stepNav.innerHTML = '';
  STEPS.forEach((s, i) => {
    const done = i < maxReached && i !== index && !(s.id === 'install');
    const reachable = !locked && i <= maxReached && s.id !== 'install';
    stepNav.append(h('div.sb-item.step' + (i === index ? '.sel' : '') + (i > maxReached ? '.todo' : '') + (!reachable ? '.locked' : ''), { onclick: () => reachable && go(i) },
      h('span.ic.sq', { style: { background: s.color }, html: s.icon }), h('span', s.title),
      h('span.state', { html: done && !s.valid?.() ? sym.check : '' })));
  });
}

function drawFoot() {
  const s = STEPS[index];
  const problem = s.valid?.() || null;
  hint.textContent = problem || s.hint?.() || '';
  hint.classList.toggle('err', !!problem && !!s.showErrors);
  backBtn.hidden = index === 0 || locked || s.hideBack;
  nextBtn.hidden = !!s.hideNext;
  nextBtn.textContent = s.nextLabel?.() || 'Continue';
  nextBtn.className = 'btn ' + (s.nextDanger?.() ? 'danger' : 'primary');
  nextBtn.disabled = !!problem;
}

async function go(i) {
  if (i < 0 || i >= STEPS.length || locked) return;
  STEPS[index].leave?.();
  lastIndex = index;
  index = i;
  maxReached = Math.max(maxReached, i);
  inner.className = 'inner' + (i < lastIndex ? ' back' : '');
  inner.innerHTML = '';
  pane.scrollTop = 0;
  const content = await STEPS[i].render({ refresh: () => go(index), next, goto: (id) => go(STEPS.findIndex((s) => s.id === id)), lock: (v) => { locked = v; drawNav(); drawFoot(); } });
  inner.append(...[content].flat().filter(Boolean));
  drawNav();
  drawFoot();
}

async function next() {
  const s = STEPS[index];
  if (s.valid?.()) return;
  if (s.beforeNext && !(await s.beforeNext())) return;
  go(index + 1);
}

events.on('change', () => { drawFoot(); drawNav(); });

async function requestClose() {
  if (locked) {
    const r = await alertDialog({ icon: warnIcon.replace('class="sym"', 'style="width:58px;height:58px;color:#ff9f0a"'), title: 'Stop installing Lumen?',
      text: 'The disk is being written right now. Stopping leaves it unusable until you install again.', buttons: [{ label: 'Keep Installing', primary: true }, { label: 'Stop', danger: true }], cancel: 0 });
    if (r !== 1) return;
    await api.cancel();
  }
  api.win.close();
}
api.win.onCloseRequested(requestClose);

addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.target.closest('textarea, button, .global-alert-layer') && !nextBtn.disabled && !nextBtn.hidden && !document.querySelector('.global-alert-layer')) next();
});

(async () => {
  try { state.info = await api.info(); } catch (e) { state.info = { canInstall: false, error: e.message }; }
  $('.ver', sidebar).textContent = `${state.info.os || 'Lumen'}${state.info.version ? ' ' + state.info.version : ''} · ${state.info.uefi ? 'UEFI' : 'BIOS'}`;
  go(0);
})();
