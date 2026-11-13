// Step 3 — Keyboard: layout and variant, with a field to try them out.
import { h } from '../util.js';
import { sym } from '../icons.js';
import { state, api, changed } from '../state.js';
import { pickList, hero, row, select } from '../ui.js';

let kb = null, suggested = false;

// the layout most people in a language's country use
function suggestion(locale, layouts) {
  const m = /^([a-z]{2,3})_([A-Z]{2})/.exec(locale);
  if (!m) return null;
  const special = { en_US: 'us', en_GB: 'gb', en_IE: 'ie', en_CA: 'us', fr_CA: 'ca', pt_BR: 'br', de_CH: 'ch', fr_CH: 'ch', fr_BE: 'be', nl_BE: 'be', ja_JP: 'jp', ko_KR: 'kr', sv_SE: 'se', da_DK: 'dk', nb_NO: 'no', cs_CZ: 'cz', el_GR: 'gr', uk_UA: 'ua', zh_CN: 'cn', zh_TW: 'tw', en_AU: 'us', en_NZ: 'us', es_MX: 'latam', es_AR: 'latam' };
  const id = special[`${m[1]}_${m[2]}`] || m[2].toLowerCase();
  return layouts.some((l) => l.id === id) ? id : null;
}

export default {
  id: 'keyboard', title: 'Keyboard', color: '#8e8e93', icon: sym.keyboard,
  valid: () => (state.keyboard.layout ? null : 'Choose a keyboard layout.'),
  async render() {
    kb ||= await api.keyboards().catch(() => ({ layouts: [{ id: 'us', name: 'English (US)' }], variants: {} }));
    if (!suggested) {
      suggested = true;
      const s = suggestion(state.locale, kb.layouts);
      if (s && state.keyboard.layout === 'us' && !state.keyboard.variant) state.keyboard.layout = s;
    }
    const apply = () => { api.setKeyboard(state.keyboard.layout, state.keyboard.variant).catch(() => {}); changed(); };
    const variantRow = h('div');
    const drawVariants = () => {
      const vs = kb.variants[state.keyboard.layout] || [];
      variantRow.innerHTML = '';
      variantRow.append(h('div.group', row('Variant', select(state.keyboard.variant, [['', 'Default'], ...vs.map((v) => [v.id, v.name])], (v) => { state.keyboard.variant = v; apply(); }, { maxWidth: '300px' }),
        vs.length ? `${vs.length} variant${vs.length === 1 ? '' : 's'} of this layout` : 'This layout has no variants')));
    };
    const items = kb.layouts.map((l) => ({ id: l.id, label: l.name, sub: l.id }));
    const list = pickList({ items, value: state.keyboard.layout, placeholder: 'Search layouts', onPick: (id) => { state.keyboard.layout = id; state.keyboard.variant = ''; drawVariants(); apply(); } });
    drawVariants();
    apply();
    return [
      hero('#8e8e93', sym.keyboard, 'Keyboard', 'Choose the layout printed on your keyboard. You can change it, or add more, later in Settings › Keyboard.'),
      h('div.group-title', 'Layout'),
      list,
      h('div', { style: { height: '8px' } }),
      variantRow,
      h('div.group-title', 'Try It'),
      h('div.group', { style: { padding: '12px' } }, h('input.field.kb-test', { placeholder: 'Type here to test your keyboard — try @ " # ü ñ', spellcheck: false })),
    ];
  },
};
