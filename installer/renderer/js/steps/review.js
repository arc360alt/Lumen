// Step 6 — Review: everything chosen, with Edit links, and the last confirmation before the disk is touched.
import { h } from '../util.js';
import { sym } from '../icons.js';
import { state, TEST } from '../state.js';
import { hero, alertDialog, fmtBytes, warnIcon } from '../ui.js';
import { localeName } from './welcome.js';

const disk = () => state.disks.find((d) => d.path === state.storage.disk);
const part = (p) => disk()?.parts.find((x) => x.path === p);

function section(title, step, rows, goto) {
  return [
    h('div.group-title', { style: { display: 'flex', alignItems: 'center' } }, h('span', title), h('span.spacer'),
      h('button.btn.plain', { style: { height: '22px', fontSize: '12px', color: 'var(--accent)' }, onclick: () => goto(step) }, 'Edit')),
    h('div.group', ...rows.filter(Boolean).map(([k, v]) => h('div.row', h('div.label', k), h('span.muted.ellipsis', { style: { maxWidth: '62%', textAlign: 'right' } }, v)))),
  ];
}

export default {
  id: 'review', title: 'Review', color: '#ff2d55', icon: sym.check,
  nextLabel: () => (TEST ? 'Install (Simulated)' : 'Install'),
  nextDanger: () => state.storage.mode === 'erase' && !TEST,
  async beforeNext() {
    const s = state.storage, d = disk();
    const what = s.mode === 'erase'
      ? `Everything on “${d?.model}” (${fmtBytes(d?.size)}) will be permanently erased, and Lumen installed in its place.`
      : `${part(s.root)?.name} will be formatted${s.formatEfi ? `, and ${part(s.efi)?.name} (EFI) too` : ''}${s.home && s.formatHome ? `, and ${part(s.home)?.name} (home)` : ''}. Other partitions aren’t changed.`;
    const r = await alertDialog({
      icon: warnIcon.replace('class="sym"', 'style="width:58px;height:58px;color:#ff9f0a"'),
      title: TEST ? 'Simulate installing Lumen?' : 'Install Lumen now?',
      text: TEST ? `Test mode: nothing will really be changed. (For real: ${what})` : `${what} This can’t be undone.`,
      buttons: [{ label: 'Cancel' }, { label: TEST ? 'Simulate' : (s.mode === 'erase' ? 'Erase and Install' : 'Install'), danger: !TEST, primary: TEST }], cancel: 0,
    });
    return r === 1;
  },
  render({ goto }) {
    const s = state.storage, u = state.user, d = disk();
    const fs = { ext4: 'ext4', btrfs: 'Btrfs (with subvolumes)', xfs: 'XFS' }[s.filesystem];
    const storageRows = s.mode === 'erase'
      ? [['Disk', `${d?.model} — ${fmtBytes(d?.size)} (${d?.path})`], ['Installation type', 'Erase the whole disk'], ['File system', fs], ['Encryption', s.encrypt ? 'On (passphrase at start-up)' : 'Off'], ['Swap', s.swap === 'zram' ? 'zram (compressed, in memory)' : 'None'], ['Boot loader', `GRUB (${state.info?.uefi ? 'UEFI' : 'BIOS'})`]]
      : [['Disk', `${d?.model} (${d?.path})`], ['Lumen', `${part(s.root)?.name} — ${fmtBytes(part(s.root)?.size)}, formatted as ${fs}`],
        s.efi ? ['EFI partition', `${part(s.efi)?.name}${s.formatEfi ? ' (formatted)' : ' (kept, shared)'}`] : null,
        s.home ? ['Home', `${part(s.home)?.name}${s.formatHome ? ' (formatted)' : ' (files kept)'}`] : null,
        ['Swap', s.swap === 'zram' ? 'zram (compressed, in memory)' : 'None'], ['Boot loader', `GRUB (${state.info?.uefi ? 'UEFI' : 'BIOS'}), finds other systems`]];
    return [
      hero('#ff2d55', sym.check, 'Ready to Install', 'Check everything below. Nothing has been changed yet — that starts when you press Install.'),
      ...section('Language & Region', 'welcome', [['Language', localeName(state.locale)], ['Time zone', state.timezone.replace(/_/g, ' ')]], goto),
      ...section('Keyboard', 'keyboard', [['Layout', state.keyboard.layout + (state.keyboard.variant ? ` (${state.keyboard.variant})` : '')]], goto),
      ...section('Storage', 'storage', storageRows, goto),
      ...section('Account', 'account', [['Name', u.fullName], ['Account name', u.username], ['Computer name', state.hostname], ['Log in automatically', u.autologin ? 'Yes' : 'No'], ['Root account', state.root === 'same' ? 'On (same password)' : 'Off (use sudo)']], goto),
      ...section('Software', 'welcome', [['System', 'Arch Linux (rolling), linux kernel'], ['Desktop', 'LiquidDesktop'], ['Login screen', 'LiquidDesktop login screen (greetd)'], ['Apps', 'Flatpak with Flathub, App Store']], goto),
    ];
  },
};
