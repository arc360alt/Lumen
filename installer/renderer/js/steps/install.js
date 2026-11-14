// Step 8 — Install: runs the back end and shows its progress; ends with Restart (or what went wrong).
import { h } from '../util.js';
import { sym, logoBadge } from '../icons.js';
import { state, api, installConfig, TEST } from '../state.js';
import { alertDialog } from '../ui.js';

const PHASES = [['disks', 'Preparing the disk'], ['copy', 'Copying Lumen'], ['system', 'Setting up the system'], ['account', 'Creating your account'], ['login', 'Setting up the login screen'], ['drivers', 'Installing drivers'], ['boot', 'Installing the boot loader']];
let started = false, view = null;
const run = { phase: null, value: 0, text: '', log: [], result: null, error: '' };

api.onInstall((ev) => {
  if (ev.type === 'progress') { run.value = ev.value; run.text = ev.text; }
  else if (ev.type === 'step') run.phase = ev.id;
  else if (ev.type === 'log') { run.log.push(ev.text); if (run.log.length > 4000) run.log.splice(0, 1000); }
  else if (ev.type === 'done') run.result = 'done';
  else if (ev.type === 'failed') { run.result = 'failed'; run.error = ev.error; }
  view?.update(ev);
});

export default {
  id: 'install', title: 'Install', color: '#1c1c1e', icon: sym.download,
  hideNext: true, hideBack: true,
  render(ctx) {
    const bar = h('i'), progress = h('div.progress', bar);
    const title = h('h2'), status = h('div.status');
    const logo = h('div.big-logo.pulse', { html: logoBadge() });
    const list = h('div.group.checklist');
    const log = h('pre.log', { hidden: true });
    const details = h('button.btn.plain.disclose', { onclick: () => { log.hidden = !log.hidden; details.textContent = log.hidden ? 'Show Details' : 'Hide Details'; if (!log.hidden) log.scrollTop = log.scrollHeight; } }, 'Show Details');
    const actions = h('div.done-actions');

    const drawList = () => {
      const at = PHASES.findIndex(([id]) => id === run.phase);
      list.innerHTML = '';
      PHASES.forEach(([id, label], i) => {
        const done = run.result === 'done' || i < at, current = i === at && !run.result;
        const failed = run.result === 'failed' && i === at;
        list.append(h('div.row' + (done ? '.done' : current ? '' : '.todo'),
          h('span.st', failed ? { html: sym.close, style: { color: '#ff453a' } } : done ? { html: sym.check } : current ? h('div.spin') : h('span', '•')), h('div.label', label)));
      });
    };
    const update = (ev) => {
      bar.style.width = run.value + '%';
      status.textContent = run.text;
      if (ev?.type === 'log' && !log.hidden) { log.textContent = run.log.join('\n'); log.scrollTop = log.scrollHeight; }
      else if (ev?.type === 'log') log.textContent = run.log.join('\n');
      if (ev?.type === 'step' || ev?.type === 'done' || ev?.type === 'failed' || !ev) drawList();
      if (run.result === 'done') {
        logo.classList.remove('pulse');
        title.textContent = TEST ? 'Simulation Complete' : 'Lumen Is Installed';
        status.textContent = TEST ? 'Nothing was changed. Expand the details to see every step the real installer would run.' : 'Restart the computer and remove the installation media. Welcome to Lumen!';
        actions.innerHTML = '';
        actions.append(
          h('button.btn.lg', { onclick: () => api.win.close() }, TEST ? 'Close' : 'Keep Exploring'),
          h('button.btn.primary.lg', { onclick: () => (TEST ? alertDialog({ title: 'Test mode', text: 'In the real installer this restarts the computer.' }) : api.reboot()) }, 'Restart Now'));
        ctx.lock(false);
      } else if (run.result === 'failed') {
        logo.classList.remove('pulse');
        progress.classList.add('failed');
        title.textContent = 'Installation Didn’t Finish';
        status.textContent = run.error || 'Something went wrong.';
        log.hidden = false; details.textContent = 'Hide Details'; log.textContent = run.log.join('\n'); log.scrollTop = log.scrollHeight;
        actions.innerHTML = '';
        actions.append(h('button.btn.primary', { onclick: () => { started = false; Object.assign(run, { phase: null, value: 0, text: '', log: [], result: null, error: '' }); ctx.lock(false); ctx.goto('review'); } }, 'Back to Review'));
        ctx.lock(false);
      }
    };
    view = { update };
    title.textContent = TEST ? 'Simulating the Installation' : 'Installing Lumen';

    if (!started) {
      started = true;
      ctx.lock(true);
      run.text = 'Starting…';
      api.install(installConfig()).catch((e) => { run.result = 'failed'; run.error = e.message; update({ type: 'failed' }); });
    }
    requestAnimationFrame(() => update());
    return h('div.inst-run', logo, title, status, progress, list, details, log, actions);
  },
};
