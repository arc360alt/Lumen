// Software Update — Electron entry point, built like the Lumen installer and LiquidDesktop's apps.
// It runs the engine (backend/lumen-update): "check" as you, "apply" through sudo with the password you type
// (LiquidDesktop has no polkit agent, so the app asks itself, in a LiquidDesktop alert).
//
//   lumen-updater            --test   check for real, simulate installing (no root)    --devtools
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(1);
const TEST = argv.includes('--test') || process.env.LUMEN_UPDATE_TEST === '1';
const themeArg = (argv.find((a) => a.startsWith('--theme=')) || '').slice(8);
const ENGINE = path.join(__dirname, '..', 'backend', 'lumen-update');
// test runs can point at a system in a folder and another repository
const EXTRA = [...(process.env.LUMEN_UPDATE_ROOT ? ['--root', process.env.LUMEN_UPDATE_ROOT] : []), ...(process.env.LUMEN_UPDATE_REPO ? ['--repo', process.env.LUMEN_UPDATE_REPO] : [])];

const SOFTWARE = process.env.LIBGL_ALWAYS_SOFTWARE === '1' || process.env.LUMEN_SOFTWARE_RENDERING === '1';
if (SOFTWARE) app.disableHardwareAcceleration();
app.setName('Software Update');
app.setDesktopName('lumen-updater.desktop');

/* ------------------------------------------------------------------ follow LiquidDesktop's light/dark */
// LiquidDesktop keeps Appearance in its own localStorage (key liquid.settings.v1, field "theme": light|dark|auto),
// which only LD can read properly. Until LD publishes it in a plain file (~/.config/LiquidDesktop/appearance, asked
// for in LIQUIDDESKTOP-REQUESTS.md), read the stored value straight out of its LevelDB files: the newest write wins
// (.log files are newer than .ldb tables; higher numbers are newer). "auto" = dark from 19:00 to 7:00, as in LD.
const LD = path.join(process.env.XDG_CONFIG_HOME || path.join(require('os').homedir(), '.config'), 'LiquidDesktop');
let ldStamp = '', ldCached = null;
function ldTheme() {
  if (themeArg === 'light' || themeArg === 'dark') return themeArg;
  try { const t = fs.readFileSync(path.join(LD, 'appearance'), 'utf8').trim(); if (/^(light|dark|auto)$/.test(t)) return t; } catch { /* not published */ }
  const dir = path.join(LD, 'Local Storage', 'leveldb');
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => /^\d+\.(log|ldb)$/.test(f)).map((f) => ({ f, st: fs.statSync(path.join(dir, f)) }));
  } catch { return null; }
  const stamp = files.map((x) => x.f + x.st.mtimeMs + ':' + x.st.size).join();
  if (stamp === ldStamp) return ldCached;
  ldStamp = stamp; ldCached = null;
  files.sort((a, b) => (a.f.endsWith('.log') - b.f.endsWith('.log')) || (parseInt(a.f, 10) - parseInt(b.f, 10)));
  for (const { f } of files) {
    let text;
    // values are stored as Latin-1 or UTF-16: dropping the zero bytes reads both
    try { text = fs.readFileSync(path.join(dir, f)).toString('latin1').replace(/\0/g, ''); } catch { continue; }
    let i = -1;
    while ((i = text.indexOf('liquid.settings.v1', i + 1)) !== -1) {
      const m = text.slice(i, i + 65536).match(/^liquid\.settings\.v1[^{]{0,16}(\{[^]*?)(?:liquid\.|$)/);
      const t = m && m[1].match(/"theme":"(light|dark|auto)"/);
      if (t) ldCached = t[1];
    }
  }
  return ldCached;
}

let win, child = null;
const send = (ev) => win?.webContents.send('upd:event', ev);

function create() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(900, sw - 40), height: Math.min(640, sh - 60), minWidth: 760, minHeight: 520,
    title: 'Software Update', frame: false, transparent: !SOFTWARE, backgroundColor: SOFTWARE ? '#1c1c1e' : '#00000000', show: false, center: true,
    icon: path.join(__dirname, '..', 'renderer', 'liquid', 'img', 'lumen.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: { test: TEST ? '1' : '0', theme: ldTheme() || '', opaque: SOFTWARE ? '1' : '0' } });
  // switching Appearance in LiquidDesktop while this is open: follow it
  let last = ldTheme();
  const follow = setInterval(() => { const t = ldTheme(); if (t !== last) { last = t; win?.webContents.send('upd:theme', t); } }, 3000);
  win.on('closed', () => clearInterval(follow));
  win.once('ready-to-show', () => { win.show(); if (argv.includes('--devtools')) win.webContents.openDevTools({ mode: 'detach' }); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const [ev, st] of [['maximize', { maximized: true }], ['unmaximize', { maximized: false }], ['focus', { focused: true }], ['blur', { focused: false }]]) win.on(ev, () => win.webContents.send('win:state', st));
  win.on('close', (e) => { if (child && !win.forceClose) e.preventDefault(); });   // never close in the middle of an update
}

function engine(args) {
  return new Promise((res, rej) => execFile('/bin/bash', [ENGINE, ...args, ...EXTRA], { maxBuffer: 64 << 20, timeout: 180000 }, (err, out, errOut) => {
    if (err) {
      const m = /@@ERROR (.*)/.exec(String(out)) || /@@ERROR (.*)/.exec(String(errOut));
      return rej(new Error(m ? m[1] : String(errOut || err.message).trim()));
    }
    res(String(out));
  }));
}

function apply(opts, password) {
  if (child) throw new Error('An update is already running.');
  const args = ['apply', ...(opts.commit ? ['--commit', opts.commit] : []), ...(opts.upgrade ? ['--upgrade'] : []), ...(opts.flatpak ? ['--flatpak'] : []), ...EXTRA];
  // test mode: simulate as you; otherwise sudo, the password on stdin (never on a command line)
  child = TEST ? spawn('/bin/bash', [ENGINE, ...args, '--dry-run']) : spawn('sudo', ['-S', '-p', '', '--', '/bin/bash', ENGINE, ...args]);
  if (!TEST) { child.stdin.write(password + '\n'); }
  child.stdin.end();
  let buf = '', errBuf = '', failed = '';
  const line = (l) => {
    let m;
    if ((m = /^@@PROGRESS (\d+) (.*)$/.exec(l))) send({ type: 'progress', value: +m[1], text: m[2] });
    else if ((m = /^@@ERROR (.*)$/.exec(l))) { failed = m[1]; send({ type: 'log', text: 'Error: ' + m[1] }); }
    else if (l === '@@RESTART') send({ type: 'restart' });
    else if (l === '@@DONE') send({ type: 'done' });
    else if (l) send({ type: 'log', text: l });
  };
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
  child.stderr.on('data', (d) => { errBuf += d; for (const l of String(d).split('\n')) if (l.trim() && !/^\[sudo\]|^Password/.test(l)) send({ type: 'log', text: l }); });
  child.on('close', (code) => {
    child = null;
    if (buf) line(buf);
    if (code === 0 && !failed) return;
    const badPass = /incorrect password|try again|no password was provided/i.test(errBuf);
    send({ type: 'failed', badPassword: badPass, error: badPass ? 'The password is incorrect.' : failed || errBuf.trim().split('\n').pop() || `Update failed (code ${code}).` });
  });
  return { ok: true };
}

app.whenReady().then(() => {
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (err) { return { __error: String(err.message || err) }; } });
  h('upd:info', () => {
    const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
    const rel = Object.fromEntries(read('/etc/os-release').split('\n').map((l) => /^(\w+)="?(.*?)"?$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
    return { test: TEST, os: rel.PRETTY_NAME || 'Lumen', user: process.env.USER || '' };
  });
  h('upd:check', async () => JSON.parse(await engine(['check'])));
  h('upd:history', async () => (await engine(['history'])).split('\n').filter(Boolean).map((l) => { const [date, from, to, subject] = l.split('\t'); return { date, from, to, subject }; }).reverse());
  h('upd:apply', (opts, password) => apply(opts || {}, password || ''));
  h('power:reboot', () => { if (!TEST) execFile('systemctl', ['reboot'], () => {}); return { ok: true }; });
  h('win:close', () => { if (win && !child) { win.forceClose = true; win.close(); } });
  h('win:minimize', () => win?.minimize());
  h('win:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  create();
});
app.on('window-all-closed', () => app.quit());
