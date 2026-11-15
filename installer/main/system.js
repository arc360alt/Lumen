// Everything the installer reads from the system before installing: disks, firmware, languages, time zones,
// keyboard layouts. Nothing here changes the computer (apart from the live keyboard layout, so the test field works).
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { net } = require('electron');

const run = (cmd, args, opts = {}) => new Promise((res) => execFile(cmd, args, { timeout: 15000, maxBuffer: 32 << 20, env: { ...process.env, LC_ALL: 'C' }, ...opts },
  (err, out, e) => res({ ok: !err, code: err?.code ?? 0, out: String(out || ''), err: String(e || '') })));
const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const has = (bin) => (process.env.PATH || '/usr/bin').split(':').some((d) => exists(path.join(d, bin)));

// The smallest disk Lumen goes on: the system takes ~9 GB unpacked, plus room to live in
const MIN_BYTES = 20e9;

function osRelease() {
  const out = {};
  for (const l of read('/etc/os-release').split('\n')) { const m = /^(\w+)="?(.*?)"?$/.exec(l); if (m) out[m[1]] = m[2]; }
  return out;
}

async function info({ test }) {
  const live = exists('/run/archiso');
  const sudo = test ? { ok: true } : await run('sudo', ['-n', 'true']);
  const cpu = (read('/proc/cpuinfo').match(/^model name\s*:\s*(.+)$/m) || [])[1] || os.cpus()[0]?.model || '';
  const rel = osRelease();
  return {
    test, live, canInstall: test || (live && sudo.ok), sudo: sudo.ok,
    uefi: exists('/sys/firmware/efi'), memory: os.totalmem(), cpu: cpu.trim(), host: os.hostname(),
    os: rel.PRETTY_NAME || 'Lumen', version: rel.VERSION_ID || rel.BUILD_ID || '', minBytes: MIN_BYTES,
    partitionEditor: has('gparted'), build: buildInfo(),
  };
}

/* ------------------------------------------------------------------ disks */
// The device the live system was started from: never offered as a target
async function liveDevice() {
  const r = await run('findmnt', ['-no', 'SOURCE', '/run/archiso/bootmnt']);
  const src = r.out.trim();
  if (!src) return null;
  const p = await run('lsblk', ['-no', 'PKNAME', src]);
  return p.out.trim() ? '/dev/' + p.out.trim().split('\n')[0] : src;
}

async function disks({ test }) {
  const r = await run('lsblk', ['-J', '-b', '-o', 'NAME,PATH,SIZE,TYPE,MODEL,VENDOR,TRAN,RM,RO,FSTYPE,LABEL,PARTLABEL,PARTTYPENAME,MOUNTPOINTS,PTTYPE']);
  if (!r.ok) throw new Error('Couldn’t list the disks (lsblk): ' + r.err.trim());
  const live = await liveDevice();
  const tree = JSON.parse(r.out).blockdevices || [];
  const mounted = (d) => (d.mountpoints || []).some((m) => m && m !== '[SWAP]') || (d.children || []).some(mounted);
  const out = [];
  for (const d of tree) {
    if (d.type !== 'disk' || /^(zram|loop|sr|ram|fd)/.test(d.name)) continue;
    const parts = (d.children || []).filter((c) => c.type === 'part').map((c) => ({
      path: c.path, name: c.name, size: +c.size, fstype: c.fstype || '', label: c.label || c.partlabel || '',
      type: c.parttypename || '', mounted: mounted(c), mountpoints: (c.mountpoints || []).filter(Boolean),
      crypt: c.fstype === 'crypto_LUKS',
    }));
    const model = [d.vendor, d.model].map((s) => (s || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const isLive = live && d.path === live;
    const busy = !test && mounted(d);
    out.push({
      path: d.path, name: d.name, size: +d.size, model: model || d.name, tran: d.tran || '', removable: d.rm === true || d.rm === '1',
      readOnly: d.ro === true || d.ro === '1', table: d.pttype || '', parts,
      live: !!isLive, busy, tooSmall: +d.size < MIN_BYTES,
      usable: !isLive && !busy && !(d.ro === true || d.ro === '1') && +d.size >= MIN_BYTES,
    });
  }
  // the internal disks first, biggest first
  return out.sort((a, b) => (a.live - b.live) || (a.removable - b.removable) || b.size - a.size);
}

/* ------------------------------------------------------------------ language, time, keyboard */
function locales() {
  const list = read('/usr/share/i18n/SUPPORTED').split('\n').map((l) => l.trim().split(/\s+/)).filter(([n, cs]) => n && cs === 'UTF-8').map(([n]) => n);
  const fallback = ['en_US.UTF-8', 'en_GB.UTF-8', 'de_DE.UTF-8', 'fr_FR.UTF-8', 'es_ES.UTF-8', 'it_IT.UTF-8', 'pt_BR.UTF-8', 'nl_NL.UTF-8', 'sv_SE.UTF-8', 'pl_PL.UTF-8', 'ru_RU.UTF-8', 'ja_JP.UTF-8', 'zh_CN.UTF-8', 'ko_KR.UTF-8'];
  return [...new Set(list.length ? list : fallback)];
}

async function timezones() {
  const r = await run('timedatectl', ['list-timezones', '--no-pager']);
  let list = r.ok ? r.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  if (!list.length) {
    // walk the zoneinfo tree (the chroot / no-systemd case)
    const root = '/usr/share/zoneinfo';
    const walk = (d, pre) => { for (const f of fs.readdirSync(path.join(root, d))) {
      const rel = pre ? `${pre}/${f}` : f;
      if (!/^[A-Z]/.test(f) || ['Etc', 'SystemV', 'US', 'posix', 'right'].includes(f)) continue;
      if (fs.statSync(path.join(root, d, f)).isDirectory()) walk(path.join(d, f), rel); else if (rel.includes('/')) list.push(rel);
    } };
    try { walk('', ''); } catch { /* none */ }
  }
  // coordinates from zone1970.tab / zone.tab, for the little map
  const coords = {};
  for (const tab of ['/usr/share/zoneinfo/zone1970.tab', '/usr/share/zoneinfo/zone.tab']) {
    for (const l of read(tab).split('\n')) {
      if (!l || l[0] === '#') continue;
      const [cc, c, tz] = l.split('\t');
      const m = /^([+-]\d{2})(\d{2})(\d{2})?([+-]\d{3})(\d{2})(\d{2})?$/.exec(c || '');
      if (!m || coords[tz]) continue;
      const lat = Math.sign(+m[1]) * (Math.abs(+m[1]) + +m[2] / 60 + (+m[3] || 0) / 3600);
      const lon = Math.sign(+m[4]) * (Math.abs(+m[4]) + +m[5] / 60 + (+m[6] || 0) / 3600);
      coords[tz] = { lat, lon, cc: cc.split(',')[0] };
    }
  }
  let current = '';
  try { current = fs.readlinkSync('/etc/localtime').replace(/^.*zoneinfo\//, ''); } catch { /* UTC */ }
  return { zones: list.filter((z) => z !== 'UTC'), coords, current };
}

// X keyboard layouts and variants, from xkeyboard-config's list
function keyboards() {
  const text = read('/usr/share/X11/xkb/rules/base.lst');
  const layouts = [], variants = {};
  let sec = '';
  for (const l of text.split('\n')) {
    if (l.startsWith('! ')) { sec = l.slice(2).trim(); continue; }
    const m = /^\s+(\S+)\s+(.*)$/.exec(l);
    if (!m) continue;
    if (sec === 'layout') layouts.push({ id: m[1], name: m[2] });
    else if (sec === 'variant') {
      const v = /^(\S+):\s*(.*)$/.exec(m[2]);
      if (v) (variants[v[1]] ||= []).push({ id: m[1], name: v[2] });
    }
  }
  if (!layouts.length) layouts.push({ id: 'us', name: 'English (US)' });
  layouts.sort((a, b) => a.name.localeCompare(b.name));
  return { layouts, variants };
}

async function setKeyboard(layout, variant) {
  // so "type here to test your keyboard" uses the layout picked (only the live session; installs set it for real)
  if (!process.env.DISPLAY || !has('setxkbmap') || !/^[\w-]+$/.test(layout) || (variant && !/^[\w-]+$/.test(variant))) return { ok: false };
  if (!exists('/run/archiso')) return { ok: false, skipped: 'not the live system' };
  const r = await run('setxkbmap', ['-layout', layout, ...(variant ? ['-variant', variant] : [])]);
  return { ok: r.ok };
}

// Where is this computer? (time zone + country, from an IP lookup; only used to pre-fill the Location step)
async function geoip() {
  const get = async (url) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    try { const r = await net.fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  };
  const a = await get('https://ipapi.co/json/');
  if (a?.timezone) return { timezone: a.timezone, country: a.country_code || '', city: a.city || '' };
  const b = await get('http://ip-api.com/json/?fields=status,timezone,countryCode,city');
  if (b?.timezone) return { timezone: b.timezone, country: b.countryCode || '', city: b.city || '' };
  return null;
}

/* ------------------------------------------------------------------ graphics cards (the Drivers step) */
const VENDORS = { '10de': 'nvidia', '1002': 'amd', '8086': 'intel', '1af4': 'virtual', '1234': 'virtual', '15ad': 'virtual', '80ee': 'virtual', '1b36': 'virtual', '1414': 'virtual' };

// "AD107M [GeForce RTX 4060 Max-Q / Mobile]" → "GeForce RTX 4060 Max-Q / Mobile"
const niceName = (dev) => ((/\[([^\]]+)\]\s*$/.exec(dev) || [])[1] || dev).replace(/\s+/g, ' ').trim();

function isLaptop() {
  const chassis = +read('/sys/class/dmi/id/chassis_type').trim();
  if ([8, 9, 10, 11, 14, 30, 31, 32].includes(chassis)) return true;
  if (chassis) return false;
  // no chassis type: a battery of the computer itself (not a wireless mouse's, whose scope is "Device")
  try { return fs.readdirSync('/sys/class/power_supply').some((d) => read(`/sys/class/power_supply/${d}/type`).trim() === 'Battery' && read(`/sys/class/power_supply/${d}/scope`).trim() !== 'Device'); } catch { return false; }
}

// Pretend hardware for trying the Drivers step: LUMEN_FAKE_GPUS=laptop | desktop | old (test mode only)
const FAKE = {
  laptop: [
    { slot: '0000:00:02.0', vendorId: '8086', deviceId: 'a788', vendorName: 'Intel Corporation', name: 'Raptor Lake-S UHD Graphics', driver: 'i915', boot: true },
    { slot: '0000:01:00.0', vendorId: '10de', deviceId: '2860', vendorName: 'NVIDIA Corporation', name: 'GeForce RTX 4070 Max-Q / Mobile', driver: 'nouveau', boot: false },
  ],
  desktop: [{ slot: '0000:01:00.0', vendorId: '10de', deviceId: '2684', vendorName: 'NVIDIA Corporation', name: 'GeForce RTX 4090', driver: 'nouveau', boot: true }],
  old: [{ slot: '0000:01:00.0', vendorId: '10de', deviceId: '1b80', vendorName: 'NVIDIA Corporation', name: 'GeForce GTX 1080', driver: 'nouveau', boot: true }],
};

async function gpus({ test }) {
  let list = [];
  const fake = test && FAKE[process.env.LUMEN_FAKE_GPUS];
  if (fake) list = fake.map((g) => ({ ...g }));
  else {
    const base = '/sys/bus/pci/devices';
    let slots = [];
    try { slots = fs.readdirSync(base); } catch { /* no PCI */ }
    for (const slot of slots) {
      if (!read(`${base}/${slot}/class`).trim().startsWith('0x03')) continue;   // display controllers
      const vendorId = read(`${base}/${slot}/vendor`).trim().replace(/^0x/, '');
      const deviceId = read(`${base}/${slot}/device`).trim().replace(/^0x/, '');
      let driver = '';
      try { driver = path.basename(fs.readlinkSync(`${base}/${slot}/driver`)); } catch { /* none bound */ }
      const r = await run('lspci', ['-vmm', '-s', slot]);
      const field = (k) => (new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(r.out) || [])[1] || '';
      list.push({ slot, vendorId, deviceId, vendorName: field('Vendor'), name: niceName(field('Device')) || `Graphics card ${vendorId}:${deviceId}`, driver, boot: read(`${base}/${slot}/boot_vga`).trim() === '1' });
    }
  }
  for (const g of list) {
    g.kind = VENDORS[g.vendorId] || 'other';
    // NVIDIA's current driver (the open kernel modules) supports Turing and newer: GTX 16xx, RTX 20xx and up
    if (g.kind === 'nvidia') g.supported = parseInt(g.deviceId, 16) >= 0x1e00;
    if (g.kind === 'intel') g.integrated = !/\bArc (A|B)\d/.test(g.name);
    if (g.kind === 'amd') g.integrated = !/\b(RX|PRO W|Instinct|FirePro|HD \d{4})\b/.test(g.name) && /Graphics|Vega|Renoir|Cezanne|Rembrandt|Raphael|Phoenix|Strix|Hawk|Lucienne|Picasso|Barcelo|Mendocino|Granite|Krackan/.test(g.name);
  }
  const nvidia = list.filter((g) => g.kind === 'nvidia');
  return {
    gpus: list.sort((a, b) => b.boot - a.boot),
    laptop: fake ? process.env.LUMEN_FAKE_GPUS === 'laptop' : isLaptop(),
    // NVIDIA plus another graphics chip that drives the screen (most laptops): PRIME render offload
    hybrid: nvidia.length > 0 && list.some((g) => g.kind === 'intel' || g.kind === 'amd'),
    // the live system comes with NVIDIA's driver; an ISO without it downloads it while installing
    bundled: exists('/usr/bin/nvidia-smi'),
  };
}

function buildInfo() {
  const out = {};
  for (const l of read('/usr/share/lumen/build-info').split('\n')) { const m = /^(\w+)=(.*)$/.exec(l); if (m) out[m[1]] = m[2]; }
  return out;
}

// GParted, for people who want to make room by hand. Waits until it's closed so the disk list can refresh.
function partitionEditor() {
  return new Promise((res) => {
    if (!has('gparted')) return res({ ok: false, error: 'GParted isn’t installed.' });
    const p = spawn('sudo', ['-n', '-E', 'gparted'], { stdio: 'ignore' });
    p.on('error', (e) => res({ ok: false, error: e.message }));
    p.on('exit', (code) => res({ ok: code === 0 }));
  });
}

function reboot({ test }) {
  if (test) return { ok: true, test: true };
  execFile('systemctl', ['reboot'], () => {});
  return { ok: true };
}

module.exports = { info, gpus, disks, locales, timezones, keyboards, setKeyboard, geoip, partitionEditor, reboot };
