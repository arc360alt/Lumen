// Step 6 — Account: who you are, your picture (shown on the LiquidDesktop login screen), password, computer name.
import { h } from '../util.js';
import { sym } from '../icons.js';
import { state, changed, validUsername, validHostname, strength, RESERVED } from '../state.js';
import { hero, row, toggle, select } from '../ui.js';

const U = () => state.user;
// the same palette as LiquidDesktop's accent colors, as soft gradients
const PICTURES = [['#7cc7ff', '#3a7bff', '#8a4dff'], ['#5ac8fa', '#007aff'], ['#bf5af2', '#5e5ce6'], ['#ff6482', '#ff2d55'], ['#ff9f0a', '#ff3b30'], ['#ffd60a', '#ff9500'], ['#30d158', '#00a86b'], ['#98989d', '#48484a']];

const initials = (name) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '';
};
const slug = (name) => (name.trim().split(/\s+/)[0] || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[^a-z_]+/, '').slice(0, 32);

function paint(canvas) {
  const c = canvas.getContext('2d'), S = canvas.width;
  const stops = PICTURES[U().avatarColor] || PICTURES[0];
  const g = c.createLinearGradient(0, 0, S, S);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  c.clearRect(0, 0, S, S);
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  // a soft highlight, like LiquidDesktop's glass sheen
  const hl = c.createRadialGradient(S * 0.3, S * 0.15, 0, S * 0.3, S * 0.15, S * 0.8);
  hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hl; c.fillRect(0, 0, S, S);
  const txt = initials(U().fullName);
  c.fillStyle = '#fff';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (txt) {
    c.font = `600 ${S * 0.4}px "Inter Variable", system-ui, sans-serif`;
    c.fillText(txt, S / 2, S / 2 + S * 0.02);
  } else {
    // a person silhouette
    c.beginPath(); c.arc(S / 2, S * 0.4, S * 0.17, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(S / 2, S * 0.92, S * 0.33, S * 0.27, 0, Math.PI, 0); c.fill();
  }
  U().avatar = canvas.toDataURL('image/png');
}

export default {
  id: 'account', title: 'Account', color: '#ff9500', icon: sym.user,
  showErrors: true,
  valid() {
    const u = U();
    if (!u.fullName.trim()) return 'Enter your name.';
    if (!u.username) return 'Choose an account name.';
    if (RESERVED.has(u.username) || u.username.startsWith('systemd-')) return `“${u.username}” is used by the system. Choose another account name.`;
    if (!validUsername(u.username)) return 'The account name can only use lowercase letters, numbers, - and _, and must start with a letter.';
    if (!validHostname(state.hostname)) return 'The computer name can only use letters, numbers and dashes.';
    if (!u.password) return 'Choose a password.';
    if (u.password !== u.password2) return 'The passwords don’t match.';
    return null;
  },
  hint: () => (U().password && strength(U().password) < 2 ? 'That password is easy to guess.' : ''),
  render() {
    const u = U();
    const canvas = h('canvas', { width: 256, height: 256 });
    const userIn = h('input.field.wide', { value: u.username, spellcheck: false, placeholder: 'e.g. alex', oninput: (e) => { u.username = e.target.value; state.usernameEdited = !!e.target.value; syncHost(); changed(); } });
    const hostIn = h('input.field.wide', { value: state.hostname, spellcheck: false, placeholder: 'e.g. alex-pc', oninput: (e) => { state.hostname = e.target.value; state.hostnameEdited = !!e.target.value; changed(); } });
    const syncHost = () => { if (!state.hostnameEdited) { state.hostname = u.username ? `${u.username}-pc` : ''; hostIn.value = state.hostname; } };
    const nameIn = h('input.field.wide', { value: u.fullName, placeholder: 'Your name', oninput: (e) => {
      u.fullName = e.target.value;
      if (!state.usernameEdited) { u.username = slug(u.fullName); userIn.value = u.username; syncHost(); }
      paint(canvas); changed();
    } });
    const meter = h('div.meter', { 'data-s': String(strength(u.password)) }, h('i'), h('i'), h('i'), h('i'));
    const colors = h('div.accent-row', ...PICTURES.map((p, i) => h('button' + (i === u.avatarColor ? '.sel' : ''), { title: 'Picture color', style: { background: `linear-gradient(135deg, ${p.join(',')})` },
      onclick: (e) => { u.avatarColor = i; colors.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b === e.currentTarget)); paint(canvas); } })));
    requestAnimationFrame(() => { paint(canvas); if (!u.fullName) nameIn.focus(); });
    document.fonts?.ready.then(() => paint(canvas));
    return [
      hero('#ff9500', sym.user, 'Your Account', 'This is how you log in to Lumen. Your account can also make changes to the system (with sudo), using the same password.'),
      h('div.avatar-pick', canvas, colors),
      h('div.group',
        row('Full name', nameIn),
        row('Account name', userIn, 'Used for your home folder; can’t be changed later.'),
        row('Computer name', hostIn, 'How this computer appears on the network.')),
      h('div.group-title', 'Password'),
      h('div.group',
        row('Password', h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, meter,
          h('input.field', { type: 'password', value: u.password, style: { width: '200px' }, oninput: (e) => { u.password = e.target.value; meter.dataset.s = String(strength(u.password)); changed(); } }))),
        row('Confirm password', h('input.field.wide', { type: 'password', value: u.password2, oninput: (e) => { u.password2 = e.target.value; changed(); } }))),
      h('div.group-title', 'Signing In'),
      h('div.group',
        row('Log in automatically', toggle(u.autologin, (v) => { u.autologin = v; changed(); }), 'Skip the login screen when the computer starts. Anyone with the computer can use your account.'),
        row('Administrator (root) account', select(state.root, [['locked', 'Off — use sudo (recommended)'], ['same', 'On — same password as mine']], (v) => { state.root = v; changed(); }, { width: '250px' }))),
    ];
  },
};
