// Software Update's only bridge to the system.
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a).then((r) => { if (r && r.__error) throw new Error(r.__error); return r; });
contextBridge.exposeInMainWorld('lumen', {
  info: () => call('upd:info'),
  check: () => call('upd:check'),
  apply: (opts, password) => call('upd:apply', opts, password),
  history: () => call('upd:history'),
  onTheme: (fn) => ipcRenderer.on('upd:theme', (_e, t) => fn(t)),
  onEvent: (fn) => ipcRenderer.on('upd:event', (_e, ev) => fn(ev)),
  reboot: () => call('power:reboot'),
  win: {
    close: () => call('win:close'),
    minimize: () => call('win:minimize'),
    toggleMaximize: () => call('win:toggleMaximize'),
    onState: (fn) => ipcRenderer.on('win:state', (_e, s) => fn(s)),
  },
});
