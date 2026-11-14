// The installer UI's only bridge to the system (like LiquidDesktop's preload.js / window.sys).
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a).then((r) => { if (r && r.__error) throw new Error(r.__error); return r; });
contextBridge.exposeInMainWorld('lumen', {
  info: () => call('sys:info'),
  disks: () => call('sys:disks'),
  gpus: () => call('sys:gpus'),
  locales: () => call('sys:locales'),
  timezones: () => call('sys:timezones'),
  keyboards: () => call('sys:keyboards'),
  setKeyboard: (layout, variant) => call('sys:setKeyboard', layout, variant),
  geoip: () => call('sys:geoip'),
  partitionEditor: () => call('sys:partitionEditor'),
  install: (config) => call('install:start', config),
  cancel: () => call('install:cancel'),
  onInstall: (fn) => ipcRenderer.on('install:event', (_e, ev) => fn(ev)),
  reboot: () => call('power:reboot'),
  win: {
    close: () => call('win:close'),
    minimize: () => call('win:minimize'),
    toggleMaximize: () => call('win:toggleMaximize'),
    onState: (fn) => ipcRenderer.on('win:state', (_e, s) => fn(s)),
    onCloseRequested: (fn) => ipcRenderer.on('win:closeRequested', () => fn()),
  },
});
