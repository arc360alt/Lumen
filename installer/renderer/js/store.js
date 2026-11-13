// Stand-in for LiquidDesktop's renderer/js/store.js, which the vendored icons.js imports. The installer has no
// settings of its own to persist: it just answers with LiquidDesktop's defaults (accent, icon style…), so icons
// draw exactly as they do on a fresh desktop.
export const defaults = { theme: 'auto', accent: '#0a84ff', iconStyle: 'default', uniformIcons: true, glass: 'clear', refraction: true, reduceTransparency: false };
const values = { ...defaults };
export const store = {
  get: (k) => values[k],
  set: (k, v) => { values[k] = v; },
};
