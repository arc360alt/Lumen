// Step 4 — Storage: which disk, erase it or use existing partitions, file system, encryption and swap.
import { h } from '../util.js';
import { sym } from '../icons.js';
import { state, api, changed, TEST } from '../state.js';
import { hero, row, toggle, seg, select, note, fmtBytes, alertDialog } from '../ui.js';

const S = () => state.storage;
const MIN_ROOT = 15e9;
const FILESYSTEMS = [['ext4', 'ext4 — reliable and simple (recommended)'], ['btrfs', 'Btrfs — snapshots and compression'], ['xfs', 'XFS — fast with big files']];
const COLORS = { efi: '#ff9f0a', boot: '#ffd60a', root: 'var(--accent)', home: '#34c759', other: ['#8e8e93', '#636366', '#aeaeb2', '#48484a'] };
let loaded = false;

const disk = () => state.disks.find((d) => d.path === S().disk);
const partOf = (p) => disk()?.parts.find((x) => x.path === p);

function partitionBar(segments, total) {
  return h('div.pbar', ...segments.map((s) => h('span' + (s.free ? '.free' : ''), { title: `${s.label} — ${fmtBytes(s.size)}`, style: { flex: `${Math.max(s.size / total, 0.012)} 0 0`, background: s.color || '' } }, s.label)));
}

function layoutPreview(d) {
  const used = d.parts.reduce((a, p) => a + p.size, 0);
  const before = d.parts.length
    ? [...d.parts.map((p, i) => ({ label: p.label || p.fstype || p.name, size: p.size, color: COLORS.other[i % 4] })), ...(d.size - used > 1e9 ? [{ label: 'Free', size: d.size - used, free: true }] : [])]
    : [{ label: d.table ? 'Empty' : 'No partition table', size: d.size, free: true }];
  let after;
  if (S().mode === 'erase') {
    const uefi = state.info?.uefi;
    after = uefi ? [{ label: 'EFI', size: 1.07e9, color: COLORS.efi }] : [{ label: 'BIOS', size: 1e6, color: COLORS.boot }];
    if (!uefi && S().encrypt) after.push({ label: '/boot', size: 1.07e9, color: COLORS.boot });
    after.push({ label: `Lumen${S().encrypt ? ' 🔒' : ''} — ${S().filesystem}`, size: d.size - after.reduce((a, s) => a + s.size, 0), color: COLORS.root });
  } else {
    after = d.parts.map((p, i) => {
      const role = p.path === S().root ? 'root' : p.path === S().efi ? 'efi' : p.path === S().home ? 'home' : null;
      return { label: role === 'root' ? 'Lumen (/)' : role === 'efi' ? 'EFI' : role === 'home' ? '/home' : (p.label || p.fstype || p.name), size: p.size, color: role ? COLORS[role] : COLORS.other[i % 4] };
    });
    if (d.size - used > 1e9) after.push({ label: 'Free', size: d.size - used, free: true });
  }
  return h('div.group.pbar-wrap',
    h('div.pbar-label', h('span', 'Now'), h('span', fmtBytes(d.size))), partitionBar(before, d.size),
    h('div.pbar-label', h('span', 'After installing')), partitionBar(after, d.size),
    h('div.legend', ...(S().mode === 'erase'
      ? [h('span', h('i', { style: { background: COLORS.root } }), 'Lumen'), h('span', h('i', { style: { background: state.info?.uefi ? COLORS.efi : COLORS.boot } }), state.info?.uefi ? 'EFI system partition (start-up files)' : 'Start-up files')]
      : [h('span', h('i', { style: { background: COLORS.root } }), 'Lumen'), h('span', h('i', { style: { background: COLORS.efi } }), 'EFI'), h('span', h('i', { style: { background: COLORS.home } }), 'Home'), h('span', h('i', { style: { background: '#8e8e93' } }), 'Kept as it is')])));
}

function eraseOptions(redraw) {
  const s = S();
  const pass = h('div', s.encrypt ? h('div.group', { style: { marginTop: '6px' } },
    row('Passphrase', h('input.field.wide', { type: 'password', value: s.passphrase, placeholder: 'At least 8 characters', oninput: (e) => { s.passphrase = e.target.value; changed(); } })),
    row('Confirm passphrase', h('input.field.wide', { type: 'password', value: s.passphrase2, placeholder: 'Type it again', oninput: (e) => { s.passphrase2 = e.target.value; changed(); } }))) : null);
  return [
    h('div.group-title', 'Options'),
    h('div.group',
      row('File system', select(s.filesystem, FILESYSTEMS, (v) => { s.filesystem = v; redraw(); }, { width: '280px' })),
      row('Encrypt the disk', toggle(s.encrypt, (v) => { s.encrypt = v; redraw(); }), 'Asks for a passphrase every time the computer starts. If you forget it, your files can’t be recovered.'),
      row('Swap in memory (zram)', toggle(s.swap === 'zram', (v) => { s.swap = v ? 'zram' : 'none'; changed(); }), 'Compressed swap that makes the most of your memory. Recommended.')),
    pass,
  ];
}

function manualOptions(d, redraw) {
  const s = S();
  const uefi = state.info?.uefi;
  const roleOf = (p) => (p.path === s.root ? 'root' : p.path === s.efi ? 'efi' : p.path === s.home ? 'home' : '');
  const setRole = (p, role) => {
    for (const k of ['root', 'efi', 'home']) if (s[k] === p.path) s[k] = '';
    if (role) s[role] = p.path;
    if (role === 'efi') s.formatEfi = p.fstype !== 'vfat';
    if (role === 'home') s.formatHome = !p.fstype;
    redraw();
  };
  const roles = [['', 'Don’t use'], ['root', 'Lumen ( / )'], ...(uefi ? [['efi', 'EFI system partition']] : []), ['home', 'Home ( /home )']];
  const table = h('table.part-table',
    h('tr', h('th', 'Partition'), h('th', 'Size'), h('th', 'Contains'), h('th', 'Use as')),
    ...d.parts.map((p, i) => h('tr',
      h('td.dev', h('span.sw', { style: { background: COLORS[roleOf(p)] || COLORS.other[i % 4] } }), p.name),
      h('td', fmtBytes(p.size)),
      h('td.muted', [p.fstype || 'unformatted', p.label].filter(Boolean).join(' · '), p.mounted ? ' (in use)' : ''),
      h('td', p.mounted && !TEST ? h('span.muted', 'Mounted') : select(roleOf(p), roles, (v) => setRole(p, v), { minWidth: '170px' })))));
  const efiPart = partOf(s.efi), homePart = partOf(s.home);
  return [
    h('div.group-title', 'Partitions on ' + d.model),
    d.parts.length ? h('div.group', { style: { overflowX: 'auto' } }, table) : note('warn', 'This disk has no partitions. Choose “Erase Disk”, or make some with the partition editor.'),
    h('div.group-title', 'Options'),
    h('div.group',
      row('File system for Lumen', select(s.filesystem, FILESYSTEMS, (v) => { s.filesystem = v; changed(); }, { width: '280px' }), 'The partition used for Lumen is always formatted.'),
      efiPart ? row('Format the EFI partition', toggle(s.formatEfi, (v) => { s.formatEfi = v; changed(); }), efiPart.fstype === 'vfat' ? 'Leave this off if another system (like Windows) starts from it.' : 'It isn’t FAT32 yet, so it has to be formatted.') : null,
      homePart ? row('Format the home partition', toggle(s.formatHome, (v) => { s.formatHome = v; changed(); }), s.formatHome ? 'Everything on it is erased.' : 'Files on it are kept.') : null,
      row('Swap in memory (zram)', toggle(s.swap === 'zram', (v) => { s.swap = v ? 'zram' : 'none'; changed(); }))),
  ];
}

export default {
  id: 'storage', title: 'Storage', color: '#5e5ce6', icon: sym.drive,
  showErrors: true,
  valid() {
    const s = S(), d = disk();
    if (!d) return 'Choose a disk to install Lumen on.';
    if (s.mode === 'erase') {
      if (s.encrypt && s.passphrase.length < 8) return 'The passphrase needs at least 8 characters.';
      if (s.encrypt && s.passphrase !== s.passphrase2) return 'The passphrases don’t match.';
      return null;
    }
    const root = partOf(s.root);
    if (!root) return 'Choose a partition to use for Lumen.';
    if (root.size < MIN_ROOT) return `The partition for Lumen needs at least ${fmtBytes(MIN_ROOT)}.`;
    if (state.info?.uefi && !s.efi) return 'Choose an EFI system partition (this computer starts with UEFI).';
    const efi = partOf(s.efi);
    if (efi && efi.size < 100e6) return 'The EFI partition is too small (it needs 100 MB or more).';
    if (efi && efi.fstype !== 'vfat' && !s.formatEfi) return 'The EFI partition must be FAT32: turn on “Format the EFI partition”.';
    if (s.home && partOf(s.home)?.crypt) return 'Encrypted home partitions aren’t supported yet.';
    return null;
  },
  hint: () => (S().mode === 'erase' && disk() ? `Everything on ${disk().model} will be erased.` : ''),
  async render({ refresh }) {
    const s = S();
    const wrap = h('div');
    const redraw = () => { draw(); changed(); };
    const reload = async () => {
      wrap.style.opacity = '0.5';
      state.disks = await api.disks().catch(() => []);
      loaded = true;
      if (s.disk && !state.disks.some((d) => d.path === s.disk && d.usable)) s.disk = '';
      if (!s.disk) s.disk = state.disks.find((d) => d.usable)?.path || '';
      wrap.style.opacity = '';
      redraw();
    };
    const draw = () => {
      wrap.innerHTML = '';
      const usable = state.disks.filter((d) => !d.live);
      const cards = h('div.disks', ...usable.map((d) => h('div.disk' + (d.path === s.disk ? '.sel' : '') + (!d.usable ? '.off' : ''),
        { onclick: () => { if (s.disk !== d.path) { s.disk = d.path; s.root = s.efi = s.home = ''; } redraw(); } },
        h('div.dicon', { html: sym.drive.replace('class="sym"', 'style="width:38px;height:38px;color:var(--accent)"') }),
        h('b', d.model), h('div.size', `${fmtBytes(d.size)} · ${(d.tran || 'disk').toUpperCase()} · ${d.path}`),
        d.tooSmall ? h('div.why', `Too small (needs ${fmtBytes(state.info?.minBytes || 20e9)})`) : d.busy ? h('div.why', 'In use right now') : d.readOnly ? h('div.why', 'Read-only') : null,
        h('div.check', { html: sym.check }))));
      wrap.append(
        h('div.group-title', h('span', 'Disk'), ' '),
        !loaded ? h('div.group', { style: { padding: '30px', textAlign: 'center' } }, h('div.spin', { style: { margin: '0 auto' } })) :
          usable.length ? cards : note('danger', 'No disks were found that Lumen can be installed on.'),
        h('div', { style: { display: 'flex', gap: '8px', margin: '10px 2px 0', alignItems: 'center' } },
          h('button.btn', { onclick: reload, html: sym.refresh.replace('class="sym"', 'style="width:14px;height:14px"') + 'Refresh' }),
          state.info?.partitionEditor ? h('button.btn', { onclick: async () => {
            const r = await api.partitionEditor().catch((e) => ({ error: e.message }));
            if (r?.error) await alertDialog({ title: 'Partition Editor', text: r.error });
            reload();
          } }, 'Open Partition Editor…') : null));
      const d = disk();
      if (!d) return;
      wrap.append(
        h('div.group-title', 'How to Install'),
        h('div.group', row(h('span', 'Installation type'), seg(s.mode, [['erase', 'Erase Disk'], ['manual', 'Use Existing Partitions']], (v) => { s.mode = v; if (v === 'manual') s.encrypt = false; redraw(); }),
          s.mode === 'erase' ? 'Lumen gets the whole disk. Best for a new or spare disk.' : 'Choose partitions yourself — for example next to Windows. Make room first with the partition editor.')),
        h('div', { style: { height: '10px' } }),
        layoutPreview(d),
        ...(s.mode === 'erase' ? eraseOptions(redraw) : manualOptions(d, redraw)),
        s.mode === 'erase' ? note('danger', `Everything on “${d.model}” (${fmtBytes(d.size)}) will be erased${d.parts.length ? ` — including ${d.parts.length} partition${d.parts.length === 1 ? '' : 's'}` : ''}. Back up anything you want to keep.`) : null,
      );
    };
    draw();
    if (!loaded) reload();
    return [
      hero('#5e5ce6', sym.drive, 'Storage', 'Choose where Lumen goes. You’ll see a summary and confirm before anything is changed.'),
      wrap,
    ];
  },
};
