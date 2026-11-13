// Step 2 — Location: the time zone (picked from a list or the map, or detected from the internet connection).
import { h } from '../util.js';
import { sym } from '../icons.js';
import { state, api, changed } from '../state.js';
import { pickList, hero } from '../ui.js';

let tz = null, detected = false, clockTimer = 0;

const offset = (zone) => {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', 'UTC') || ''; } catch { return ''; }
};
const pretty = (zone) => {
  const parts = zone.split('/');
  return { city: parts[parts.length - 1].replace(/_/g, ' '), region: parts.slice(0, -1).join(' / ').replace(/_/g, ' ') };
};

// an equirectangular "map": every time zone's city as a dot, which sketches the continents
const W = 600, H = 150;
const proj = (lat, lon) => [((lon + 180) / 360) * W, ((78 - lat) / (78 + 56)) * H];

function worldMap(onPick) {
  const dots = Object.entries(tz.coords).map(([, c]) => { const [x, y] = proj(c.lat, c.lon); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6"/>`; }).join('');
  const pin = h('div.pin');
  const el = h('div.world.group', { html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g fill="currentColor" opacity=".28">${dots}</g></svg>`, style: { color: 'var(--text)' } }, pin);
  el.addEventListener('click', (e) => {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    let best = null, bd = Infinity;
    for (const [zone, c] of Object.entries(tz.coords)) {
      if (!tz.zones.includes(zone)) continue;
      const [zx, zy] = proj(c.lat, c.lon);
      const d = (zx - x) ** 2 + (zy - y) ** 2;
      if (d < bd) { bd = d; best = zone; }
    }
    if (best) onPick(best);
  });
  el.place = (zone) => {
    const c = tz.coords[zone];
    pin.hidden = !c;
    if (!c) return;
    const [x, y] = proj(c.lat, c.lon);
    pin.style.left = (x / W) * 100 + '%';
    pin.style.top = (y / H) * 100 + '%';
  };
  return el;
}

function clockFace() {
  return `<svg viewBox="0 0 64 64" class="face"><circle cx="32" cy="32" r="30" fill="var(--control)" stroke="var(--separator)"/><g stroke="var(--text-3)" stroke-width="2" stroke-linecap="round">${
    Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<line x1="${32 + Math.sin(a) * 24}" y1="${32 - Math.cos(a) * 24}" x2="${32 + Math.sin(a) * 27}" y2="${32 - Math.cos(a) * 27}"/>`; }).join('')
  }</g><line class="hh" x1="32" y1="32" x2="32" y2="17" stroke="var(--text)" stroke-width="3.5" stroke-linecap="round"/><line class="mm" x1="32" y1="32" x2="32" y2="9" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="32" r="2.5" fill="var(--accent)"/></svg>`;
}

export default {
  id: 'location', title: 'Location', color: '#34c759', icon: sym.location,
  valid: () => (state.timezone ? null : 'Choose your time zone.'),
  leave: () => clearInterval(clockTimer),
  async render() {
    tz ||= await api.timezones().catch(() => ({ zones: ['UTC'], coords: {}, current: 'UTC' }));
    if (!state.timezone) state.timezone = tz.zones.includes(tz.current) ? tz.current : '';
    const items = tz.zones.map((z) => { const p = pretty(z); return { id: z, label: p.city, sub: `${p.region} · ${offset(z)}`, search: z.replace(/_/g, ' ') }; })
      .sort((a, b) => a.label.localeCompare(b.label));

    const t = h('div.t'), d = h('div.d');
    const card = h('div.group.clock-card', { html: clockFace() }, h('div', t, d));
    const tick = () => {
      if (!state.timezone) { t.textContent = '—'; d.textContent = 'No time zone chosen'; return; }
      const now = new Date();
      t.textContent = now.toLocaleTimeString('en-US', { timeZone: state.timezone, hour: 'numeric', minute: '2-digit' });
      d.textContent = `${now.toLocaleDateString('en-US', { timeZone: state.timezone, weekday: 'long', month: 'long', day: 'numeric' })} · ${pretty(state.timezone).city} (${offset(state.timezone)})`;
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: state.timezone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, +p.value]));
      card.querySelector('.hh')?.setAttribute('transform', `rotate(${((parts.hour % 12) + parts.minute / 60) * 30} 32 32)`);
      card.querySelector('.mm')?.setAttribute('transform', `rotate(${parts.minute * 6} 32 32)`);
    };
    clearInterval(clockTimer);
    clockTimer = setInterval(tick, 10000);

    const set = (zone) => { state.timezone = zone; map.place(zone); list.set(zone); tick(); changed(); };
    const map = worldMap(set);
    const list = pickList({ items, value: state.timezone, placeholder: 'Search cities and regions', onPick: (z) => { state.timezone = z; map.place(z); tick(); changed(); } });
    const status = h('span.muted', { style: { fontSize: '12px' } });
    const detect = async () => {
      status.textContent = 'Looking up your location…';
      const r = await api.geoip().catch(() => null);
      if (r?.timezone && tz.zones.includes(r.timezone)) { set(r.timezone); status.textContent = r.city ? `Found: near ${r.city}` : 'Found your time zone'; } else status.textContent = 'Couldn’t detect it (no internet connection?). Pick it from the list.';
    };
    requestAnimationFrame(() => { map.place(state.timezone); tick(); });
    if (!detected) { detected = true; if (!state.timezone || state.timezone === 'UTC') detect(); }

    return [
      hero('#34c759', sym.location.replace('class="sym"', ''), 'Location', 'Choose your time zone, so the clock is right. Click the map, search for a nearby city, or detect it from your internet connection.'),
      card,
      h('div', { style: { height: '10px' } }),
      map,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 2px 0' } },
        h('button.btn', { onclick: detect, html: sym.location.replace('class="sym"', 'style="width:14px;height:14px"') + 'Detect My Location' }), status),
      h('div.group-title', 'Time Zone'),
      list,
    ];
  },
};
