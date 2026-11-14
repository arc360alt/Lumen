// Everything the person chooses, in one place. The Review step shows it; Install sends it to the back end.
import { Emitter } from './util.js';

export const params = new URLSearchParams(location.search);
export const TEST = params.get('test') === '1';
export const api = window.lumen;

export const state = {
  info: null,                 // firmware, memory, live system… (main/system.js info())
  locale: 'en_US.UTF-8',
  timezone: '',
  keyboard: { layout: 'us', variant: '' },
  storage: {
    mode: 'erase', disk: '', filesystem: 'ext4', swap: 'zram', encrypt: false, passphrase: '', passphrase2: '',
    root: '', efi: '', formatEfi: false, home: '', formatHome: false,
  },
  user: { fullName: '', username: '', password: '', password2: '', autologin: false, avatarColor: 0, avatar: '' },
  hostname: '',
  hostnameEdited: false, usernameEdited: false,
  // graphics: hw = main/system.js gpus(); nvidia = 'nvidia' | 'nouveau' (null until the cards are known)
  drivers: { hw: null, nvidia: null, forceNvidia: false, redraw: null },
  root: 'locked',             // locked (use sudo, like macOS) | same (root gets the same password)
  disks: [],
};
export const events = new Emitter();
export const changed = () => events.emit('change');

// what the back end gets (main/install.js → backend/lumen-install)
export function installConfig() {
  const s = state.storage;
  return {
    locale: state.locale, timezone: state.timezone, keyboard: { ...state.keyboard }, hostname: state.hostname,
    user: { fullName: state.user.fullName.trim(), username: state.user.username, password: state.user.password, autologin: state.user.autologin, avatar: state.user.avatar },
    root: state.root,
    drivers: (({ nvidia, hybrid, laptop }) => ({ nvidia, hybrid, laptop }))(driverPlan()),
    storage: s.mode === 'erase'
      ? { mode: 'erase', disk: s.disk, filesystem: s.filesystem, swap: s.swap, encrypt: s.encrypt, passphrase: s.encrypt ? s.passphrase : '' }
      : { mode: 'manual', root: s.root, efi: s.efi, formatEfi: s.formatEfi, home: s.home, formatHome: s.formatHome, filesystem: s.filesystem, swap: s.swap },
  };
}

// what's decided, in one place: the Review step and the back end use it
export function driverPlan() {
  const g = state.drivers.hw || { gpus: [] };
  const nvidiaCards = g.gpus.filter((x) => x.kind === 'nvidia');
  const supported = nvidiaCards.some((x) => x.supported);
  const nvidia = (supported && state.drivers.nvidia === 'nvidia') || (!nvidiaCards.length && state.drivers.forceNvidia);
  return { nvidia, hybrid: nvidia && !!g.hybrid, laptop: !!g.laptop, nvidiaCards, supported };
}


export const RESERVED = new Set(['root', 'bin', 'daemon', 'mail', 'ftp', 'http', 'nobody', 'dbus', 'greeter', 'lumen', 'polkitd', 'git', 'avahi', 'colord', 'rtkit', 'usbmux', 'uuidd', 'adm', 'wheel', 'users', 'sys', 'tss']);
export const validUsername = (u) => /^[a-z_][a-z0-9_-]{0,31}$/.test(u) && !RESERVED.has(u) && !u.startsWith('systemd-');
export const validHostname = (h) => /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(h);

// 0–4, for the little meter under a password
export function strength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^a-zA-Z0-9]/.test(p)) s++;
  return Math.max(1, Math.min(4, s));
}
