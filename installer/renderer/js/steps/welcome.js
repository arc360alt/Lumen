// Step 1 — Welcome: what this is, and the language/region Lumen will use.
import { h } from '../util.js';
import { sym, logoBadge } from '../icons.js';
import { state, api, TEST, changed } from '../state.js';
import { pickList, note, fmtBytes } from '../ui.js';

let locales = null;
const lang = new Intl.DisplayNames(['en'], { type: 'language' });
const region = new Intl.DisplayNames(['en'], { type: 'region' });
export function localeName(id) {
  const m = /^([a-z]{2,3})(?:_([A-Z]{2}))?/.exec(id);
  if (!m) return id;
  let l = id, r = '';
  try { l = lang.of(m[1]); } catch { /* unknown */ }
  try { if (m[2]) r = region.of(m[2]); } catch { /* unknown */ }
  const mod = /@(\w+)/.exec(id)?.[1];
  return `${l}${r ? ` (${r})` : ''}${mod ? ` — ${mod}` : ''}`;
}

export default {
  id: 'welcome', title: 'Welcome', color: 'linear-gradient(135deg,#7cc7ff,#3a7bff 50%,#8a4dff)', icon: sym.sparkles,
  valid: () => (!TEST && state.info && !state.info.canInstall ? 'Lumen can only be installed from the Lumen live system.' : null),
  showErrors: true,
  async render() {
    locales ||= await api.locales().catch(() => ['en_US.UTF-8']);
    const items = locales.map((id) => ({ id, label: localeName(id), sub: id.replace('.UTF-8', '') }))
      .sort((a, b) => (b.id === 'en_US.UTF-8') - (a.id === 'en_US.UTF-8') || (/^[a-z]/.test(a.label) - /^[a-z]/.test(b.label)) || a.label.localeCompare(b.label));
    const i = state.info || {};
    return [
      h('div.set-hero.inst-hero', h('div.big-logo', { html: logoBadge() }), h('h2', 'Welcome to Lumen'),
        h('p', 'Arch Linux with the LiquidDesktop environment, Flatpak and Flathub, ready to go. This will set up Lumen on this computer — it takes about five minutes.')),
      !TEST && !i.live ? note('danger', 'This isn’t the Lumen live system, so nothing can be installed from here. Start the computer from the Lumen USB stick or DVD.') : null,
      !TEST && i.live && !i.sudo ? note('danger', 'The installer can’t get administrator rights (sudo). Log in as the “lumen” live user and try again.') : null,
      TEST ? note('info', 'Test mode: every step works, but installing only shows what would happen. No disks or files on this computer are changed.') : null,
      h('div.group-title', 'Language and Region'),
      pickList({ items, value: state.locale, placeholder: 'Search languages', onPick: (id) => { state.locale = id; changed(); } }),
      h('div.group-title', 'This Computer'),
      h('div.group',
        h('div.row', h('div.label', 'Processor'), h('span.muted.ellipsis', { style: { maxWidth: '60%' } }, i.cpu || '—')),
        h('div.row', h('div.label', 'Memory'), h('span.muted', fmtBytes(i.memory))),
        h('div.row', h('div.label', 'Start-up firmware'), h('span.muted', i.uefi ? 'UEFI' : 'BIOS (legacy)'))),
    ];
  },
};
