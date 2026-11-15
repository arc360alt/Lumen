// Software Update — a LiquidDesktop-style window (traffic lights, glass sidebar, settings pane) with two panes:
// Software Update (check, what's new, what changes on this computer, update) and Update History.
import { h, $ } from './liquid/js/util.js';
import { sym, logoBadge } from './liquid/js/icons.js';
import { row, toggle, note, alertDialog } from './liquid/js/ui.js';

const api = window.lumen;
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const root = document.documentElement;
// LiquidDesktop's Appearance (light / dark / auto), read by the main process; auto = dark from 19:00 to 7:00, like LD
let ldTheme = params.get('theme');
const pickTheme = () => {
  const hr = new Date().getHours();
  root.dataset.theme = ldTheme === 'light' || ldTheme === 'dark' ? ldTheme : (hr >= 19 || hr < 7 ? 'dark' : 'light');
};
pickTheme(); setInterval(pickTheme, 60000);
api.onTheme?.((t) => { ldTheme = t; pickTheme(); });
if (params.get('opaque') === '1') root.dataset.opaque = 'true';

const S = { pane: 'update', check: null, checking: false, error: '', opts: { upgrade: true, flatpak: true }, run: null, details: false };

/* ------------------------------------------------------------------ window */
const tl = (cls, title, d, onclick) => h('button.' + cls, { title, onclick, html: `<svg viewBox="0 0 10 10"><path d="${d}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>` });
const titlebar = h('div.win-titlebar', h('div.drag', { ondblclick: () => api.win.toggleMaximize() }),
  h('div.traffic', tl('tl-close', 'Close', 'M2.5 2.5l5 5M7.5 2.5l-5 5', () => api.win.close()), tl('tl-min', 'Minimize', 'M2 5h6', () => api.win.minimize()), tl('tl-max', 'Zoom', 'M3 3h4v4H3z', () => api.win.toggleMaximize())));
const nav = h('div');
const sidebar = h('aside.sidebar',
  h('div.inst-brand', h('div.logo', { html: logoBadge() }), h('div', h('b', 'Software Update'), h('small', 'Lumen'))),
  nav, h('div.inst-side-foot', TEST ? h('div.test-badge', 'Test mode — installing is simulated') : null, h('div.ver')));
const inner = h('div.inner');
const pane = h('div.settings-pane', inner);
const win = h('div.win.inst.focused', h('div.win-clip', h('div.win-body', sidebar, h('div.main-pane', pane)), titlebar));
$('#app').append(win);
api.win.onState((s) => { if ('focused' in s) win.classList.toggle('focused', s.focused); if ('maximized' in s) win.classList.toggle('maximized', s.maximized); });

const PANES = [['update', 'Software Update', '#0a84ff', sym.download], ['history', 'Update History', '#8e8e93', sym.clock]];
function drawNav() {
  nav.innerHTML = '';
  for (const [id, title, color, icon] of PANES) {
    nav.append(h('div.sb-item.step' + (S.pane === id ? '.sel' : '') + (S.run && !S.run.result ? '.locked' : ''), { onclick: () => { S.pane = id; draw(); } },
      h('span.ic.sq', { style: { background: color }, html: icon }), h('span', title),
      id === 'update' && S.check && S.check.systemChanges && !S.run ? h('span.count', { style: { marginLeft: 'auto', fontSize: '11px', background: '#ff3b30', color: '#fff', borderRadius: '999px', padding: '0 6px' } }, '1') : null));
  }
}

/* ------------------------------------------------------------------ helpers */
const ago = (t) => {
  const s = Date.now() / 1000 - t;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t * 1000).toLocaleDateString();
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const big = (cls = '') => h('div.big-logo' + cls, { html: logoBadge() });

function askPassword(error = '') {
  return new Promise((resolve) => {
    const input = h('input.field.pw-field', { type: 'password', placeholder: 'Password', onkeydown: (e) => { if (e.key === 'Enter') done(input.value); if (e.key === 'Escape') done(null); } });
    const done = (v) => { layer.remove(); resolve(v); };
    const layer = h('div.global-alert-layer',
      h('div.alert.glass.panel',
        h('div.a-icon', { html: logoBadge() }),
        h('h3', 'Software Update wants to make changes.'),
        h('p', 'Enter your password to allow this.'),
        input, h('div.pw-err', error),
        h('div.a-btns', h('button.btn', { onclick: () => done(null) }, 'Cancel'), h('button.btn.primary', { onclick: () => done(input.value) }, 'Install Update'))));
    document.body.append(layer);
    requestAnimationFrame(() => input.focus());
  });
}

/* ------------------------------------------------------------------ Software Update */
async function check() {
  S.checking = true; S.error = ''; draw();
  try { S.check = await api.check(); S.checkedAt = new Date(); } catch (e) { S.error = e.message; S.check = null; }
  S.checking = false; draw();
}

function updatePane() {
  if (S.run) return runView();
  const c = S.check;
  if (S.checking || (!c && !S.error)) {
    return [h('div.upd-hero', big('.pulse'), h('div', h('h2', 'Checking for updates…'), h('p', 'Looking at the newest changes to Lumen.')))];
  }
  if (S.error) {
    return [h('div.upd-hero', big(), h('div', h('h2', 'Couldn’t check for updates'), h('p', S.error)), h('div.spacer'), h('button.btn', { onclick: check }, 'Try Again'))];
  }
  const changes = c.systemChanges;
  const out = [];
  if (!changes) {
    out.push(h('div.upd-hero', big(), h('div',
      h('h2', 'Lumen is up to date'),
      h('p', `${c.upToDate ? `Version ${c.current.slice(0, 7)}` : `${plural(c.commits.length, 'new change')} in Lumen, none for this computer`} · checked ${S.checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)),
    h('div.spacer'), c.upToDate ? h('button.btn', { onclick: check }, 'Check Again') : h('button.btn.primary', { onclick: start }, 'Mark as Updated')));
  } else {
    out.push(h('div.upd-hero', big(), h('div',
      h('h2', 'A Lumen update is available'),
      h('p', `${plural(c.commits.length, 'change')} · ${c.current ? c.current.slice(0, 7) + ' → ' : ''}${c.latest.slice(0, 7)}${c.restart ? ' · needs a restart' : ''}`)),
    h('div.spacer'), h('button.btn.primary', { onclick: start }, 'Update Now')));
  }
  if (c.commits.length) {
    out.push(h('div.group-title', c.baseKnown ? 'What’s New' : 'Recent Changes'),
      h('div.group', ...c.commits.slice(0, 30).map((m) => h('div.row.commit', h('div.label', m.subject, h('small', m.author, ' · ', h('code', m.short))), h('span.when', ago(m.time))))));
  }
  if (changes) {
    const f = c.files;
    const sum = (label, n, sub, warn) => (n ? h('div.row.sum', h('div.label', label, sub ? h('small', sub) : null), h('span.count' + (warn ? '.warn' : ''), String(n))) : null);
    const list = (title, items, suffix = '') => (items.length ? [h('b', title), ...items.map((p) => h('div', h('code', '/' + p + suffix)))] : []);
    out.push(h('div.group-title', 'Changes to This Computer'),
      h('div.group',
        sum('System files updated', f.updated.length),
        sum('System files added', f.added.length),
        sum('System files removed', f.removed.length),
        sum('Files you changed', f.conflicts.length, 'Your versions are kept; the new ones are saved next to them as .lumennew', true),
        sum('New packages', c.packages.add.length, c.packages.add.join(', ')),
        sum('One-time update steps', c.migrations.length, c.migrations.join(', ')),
        h('div.row', h('div.label', ''), h('button.btn.plain', { style: { color: 'var(--accent)', height: '22px' }, onclick: () => { S.details = !S.details; draw(); } }, S.details ? 'Hide Files' : 'Show Files')),
        S.details ? h('div.files', ...list('Updated', f.updated), ...list('Added', f.added), ...list('Removed', f.removed), ...list('Kept yours (new version saved as …)', f.conflicts, '.lumennew')) : null),
      h('div.group-title', 'Options'),
      h('div.group',
        row('Also update all apps and system packages', toggle(S.opts.upgrade, (v) => { S.opts.upgrade = v; }), 'Arch Linux updates, the kernel and drivers (pacman -Syu). Recommended.'),
        row('Update Flatpak apps', toggle(S.opts.flatpak, (v) => { S.opts.flatpak = v; }))),
      note('info', 'Your files in your home folder are never changed. System settings you edited yourself are kept, and replaced files are backed up in /var/lib/lumen-update/backups.'));
  }
  return out;
}

async function start(_e, error = '') {
  let password = '';
  if (!TEST) {
    password = await askPassword(error);
    if (password === null) return;
  }
  S.run = { value: 0, text: 'Starting…', log: [], result: null, error: '', restart: false, showLog: false };
  draw();
  try { await api.apply({ commit: S.check.latest, upgrade: S.opts.upgrade, flatpak: S.opts.flatpak }, password); } catch (e) { S.run.result = 'failed'; S.run.error = e.message; draw(); }
}

api.onEvent((ev) => {
  const r = S.run;
  if (!r) return;
  if (ev.type === 'progress') { r.value = ev.value; r.text = ev.text; }
  else if (ev.type === 'log') { r.log.push(ev.text); if (r.log.length > 3000) r.log.splice(0, 500); }
  else if (ev.type === 'restart') r.restart = true;
  else if (ev.type === 'done') r.result = 'done';
  else if (ev.type === 'failed') {
    if (ev.badPassword) { S.run = null; draw(); start(null, 'The password is incorrect. Try again.'); return; }
    r.result = 'failed'; r.error = ev.error;
  }
  if (ev.type === 'log' && runRefs.log && r.showLog) { runRefs.log.textContent = r.log.join('\n'); runRefs.log.scrollTop = runRefs.log.scrollHeight; }
  if (ev.type === 'log') return;
  draw();
});

const runRefs = {};
function runView() {
  const r = S.run;
  const bar = h('i', { style: { width: r.value + '%' } });
  const log = h('pre.log', { hidden: !r.showLog }, r.log.join('\n'));
  runRefs.log = log;
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  const title = r.result === 'done' ? (TEST ? 'Simulation Complete' : 'Lumen Is Up to Date') : r.result === 'failed' ? 'The Update Didn’t Finish' : TEST ? 'Simulating the Update' : 'Updating Lumen…';
  const status = r.result === 'done' ? (TEST ? 'Nothing was changed. Show Details lists everything a real update would do.' : r.restart ? 'Restart the computer to finish.' : 'Log out and back in to see every change.') : r.result === 'failed' ? r.error : r.text;
  const actions = h('div.done-actions');
  if (r.result === 'done') {
    actions.append(h('button.btn', { onclick: () => { S.run = null; check(); } }, 'Done'));
    if (r.restart) actions.append(h('button.btn.primary', { onclick: () => (TEST ? alertDialog({ title: 'Test mode', text: 'A real update restarts the computer here.' }) : api.reboot()) }, 'Restart Now'));
  } else if (r.result === 'failed') {
    actions.append(h('button.btn.primary', { onclick: () => { S.run = null; check(); } }, 'Back'));
  }
  return [h('div.upd-run',
    big(r.result ? '' : '.pulse'), h('h2', title), h('div.status', status),
    h('div.progress' + (r.result === 'failed' ? '.failed' : ''), bar),
    h('button.btn.plain.disclose', { onclick: () => { r.showLog = !r.showLog; draw(); } }, r.showLog ? 'Hide Details' : 'Show Details'),
    log, actions)];
}

/* ------------------------------------------------------------------ Update History */
async function historyPane() {
  let items = [];
  try { items = await api.history(); } catch { /* none yet */ }
  return [
    h('div.upd-hero', h('div.sq-icon', { style: { background: '#8e8e93', width: '56px', height: '56px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }, html: sym.clock }),
      h('div', h('h2', 'Update History'), h('p', 'Updates installed on this computer. Backups of replaced files are in /var/lib/lumen-update/backups.'))),
    items.length ? h('div.group', ...items.map((i) => h('div.row.commit', h('div.label', i.subject || 'Update', h('small', h('code', `${i.from || '—'} → ${i.to}`))), h('span.when', i.date))))
      : note('info', 'No updates installed yet. This computer is at the version it was installed with.'),
  ];
}

/* ------------------------------------------------------------------ draw */
let drawing = 0;
async function draw() {
  const n = ++drawing;
  drawNav();
  const content = S.pane === 'history' ? await historyPane() : updatePane();
  if (n !== drawing) return;
  inner.innerHTML = '';
  inner.append(...[content].flat().filter(Boolean));
}

(async () => {
  const info = await api.info().catch(() => ({}));
  $('.ver', sidebar).textContent = info.os || 'Lumen';
  check();
})();

