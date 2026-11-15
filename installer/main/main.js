// Install Lumen — Electron entry point. Built like LiquidDesktop's own apps: plain JavaScript, a small main
// process that talks to the system, and a web UI made from LiquidDesktop's design files (renderer/css/liquid).
//
//   lumen-installer            the real installer (run from the Lumen live session, which has passwordless sudo)
//   lumen-installer --test     try it anywhere: every step works, but installing only simulates (nothing is changed)
//   --devtools                 open the inspector     --theme=light|dark   force a look (default: by time of day)
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const system = require('./system');
const installer = require('./install');

const argv = process.argv.slice(1);
const TEST = argv.includes('--test') || process.env.LUMEN_INSTALLER_TEST === '1';
const themeArg = (argv.find((a) => a.startsWith('--theme=')) || '').slice(8);

// software rendering (nouveau, no GPU driver, "safe graphics"): Chromium's GPU path over llvmpipe and transparent
// windows draw nothing but an empty pane there, so use Chromium's own software renderer and a solid window
const SOFTWARE = process.env.LIBGL_ALWAYS_SOFTWARE === '1' || process.env.LUMEN_SOFTWARE_RENDERING === '1' || argv.includes('--software');
if (SOFTWARE) app.disableHardwareAcceleration();
else {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
app.setName('Install Lumen');
app.setDesktopName('lumen-installer.desktop');

let win;
function create() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(980, sw - 40), height: Math.min(680, sh - 60), minWidth: 820, minHeight: 580,
    title: 'Install Lumen', frame: false, transparent: !SOFTWARE, backgroundColor: SOFTWARE ? (themeArg === 'light' ? '#f2f2f7' : '#1c1c1e') : '#00000000', show: false, center: true,
    icon: path.join(__dirname, '..', 'renderer', 'img', 'lumen.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: { test: TEST ? '1' : '0', theme: themeArg, blur: argv.includes('--blur') ? '1' : '0', opaque: SOFTWARE ? '1' : '0' } });
  win.once('ready-to-show', () => { win.show(); if (argv.includes('--devtools')) win.webContents.openDevTools({ mode: 'detach' }); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));
  win.on('focus', () => win.webContents.send('win:state', { focused: true }));
  win.on('blur', () => win.webContents.send('win:state', { focused: false }));
  // closing in the middle of an install would leave a half-written disk: the UI asks first
  win.on('close', (e) => { if (installer.running() && !win.forceClose) { e.preventDefault(); win.webContents.send('win:closeRequested'); } });
}

app.whenReady().then(() => {
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (err) { return { __error: String(err.message || err) }; } });
  h('sys:info', () => system.info({ test: TEST }));
  h('sys:disks', () => system.disks({ test: TEST }));
  h('sys:gpus', () => system.gpus({ test: TEST }));
  h('sys:locales', () => system.locales());
  h('sys:timezones', () => system.timezones());
  h('sys:keyboards', () => system.keyboards());
  h('sys:setKeyboard', (layout, variant) => system.setKeyboard(layout, variant));
  h('sys:geoip', () => system.geoip());
  h('sys:partitionEditor', () => (TEST ? { ok: false, error: 'The partition editor is turned off in test mode, so nothing on this computer can change.' } : system.partitionEditor()));
  h('install:start', (config) => installer.start({ ...config, test: TEST }, (ev) => win?.webContents.send('install:event', ev)));
  h('install:cancel', () => installer.cancel());
  h('power:reboot', () => system.reboot({ test: TEST }));
  h('win:close', () => { if (win) { win.forceClose = true; win.close(); } });
  h('win:minimize', () => win?.minimize());
  h('win:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  create();
});
app.on('window-all-closed', () => app.quit());
