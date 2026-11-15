// Step 5 — Drivers: the graphics cards in this computer and the driver each one gets. AMD and Intel work out of the
// box with Mesa (it's on the ISO); for NVIDIA cards you choose NVIDIA's own driver (bundled on the ISO, installed
// offline) or the open-source nouveau one. Laptops with NVIDIA + Intel/AMD graphics get PRIME render offload.
import { h } from '../util.js';
import { sym } from '../icons.js';
import { state, api, changed, TEST, driverPlan } from '../state.js';
import { hero, row, toggle, note } from '../ui.js';

const D = () => state.drivers;
const VENDOR = {
  nvidia: { label: 'NVIDIA', color: '#76b900' },
  amd: { label: 'AMD', color: '#e8352e' },
  intel: { label: 'Intel', color: '#0a6fd1' },
  virtual: { label: 'VM', color: '#8e8e93' },
  other: { label: 'GPU', color: '#8e8e93' },
};
const CHIP = '<svg class="sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="9" cy="12" r="2.6"/><path d="M14 10h4M14 14h4M6 18v2M10 18v2M14 18v2"/></svg>';

export function driverFor(gpu) {
  const p = driverPlan();
  switch (gpu.kind) {
    case 'nvidia': return p.nvidia ? 'NVIDIA driver (open kernel modules)' : 'Nouveau (open source)';
    case 'amd': return 'AMDGPU + Mesa (open source)';
    case 'intel': return 'Intel + Mesa (open source)';
    case 'virtual': return 'Virtual graphics (built in)';
    default: return 'Built-in driver';
  }
}

function gpuRow(gpu, hw) {
  const v = VENDOR[gpu.kind] || VENDOR.other;
  const role = gpu.kind === 'virtual' ? 'Virtual machine graphics'
    : gpu.integrated ? 'Built-in graphics' : gpu.kind === 'nvidia' || gpu.kind === 'amd' || gpu.kind === 'intel' ? 'Dedicated graphics' : 'Graphics';
  const screen = hw.gpus.length > 1 && gpu.boot ? ' · drives the screen' : '';
  const ready = gpu.kind !== 'nvidia' || !gpu.supported || driverPlan().nvidia;
  return h('div.row.gpu',
    h('span.vendor', { style: { background: v.color } }, v.label),
    h('div.label', gpu.name, h('small', role + screen)),
    h('span.pill' + (ready ? '.ok' : ''), driverFor(gpu).replace(/ \(.*\)$/, '')));
}

function choiceCard(id, title, badge, lines) {
  const on = D().nvidia === id;
  return h('div.disk.choice' + (on ? '.sel' : ''), { onclick: () => { D().nvidia = id; changed(); D().redraw?.(); } },
    h('b', title, badge ? h('span.badge', badge) : null),
    ...lines.map((l) => h('div.size', l)),
    h('div.check', { html: sym.check }));
}

export default {
  id: 'drivers', title: 'Drivers', color: '#30b0c7', icon: CHIP,
  valid: () => (D().hw ? null : 'Looking for graphics cards…'),
  hint: () => {
    const p = driverPlan();
    return p.nvidia ? 'The NVIDIA driver will be installed.' : '';
  },
  async render() {
    const wrap = h('div');
    const draw = () => {
      wrap.innerHTML = '';
      const hw = D().hw;
      if (!hw) { wrap.append(h('div.group', { style: { padding: '30px', textAlign: 'center' } }, h('div.spin', { style: { margin: '0 auto' } }))); return; }
      const p = driverPlan();
      const others = hw.gpus.filter((g) => g.kind !== 'nvidia' && g.kind !== 'virtual');
      wrap.append(
        h('div.group-title', hw.gpus.length === 1 ? 'Graphics Card' : 'Graphics Cards'),
        hw.gpus.length ? h('div.group', ...hw.gpus.map((g) => gpuRow(g, hw)))
          : note('info', 'No graphics card was found. Lumen uses the computer’s basic display driver.'),
      );

      if (p.nvidiaCards.length && p.supported) {
        wrap.append(
          h('div.group-title', 'NVIDIA Driver'),
          h('div.disks.choices',
            choiceCard('nvidia', 'NVIDIA', 'Recommended', ['NVIDIA’s own driver: full speed in games and 3D apps, Vulkan, CUDA and OpenCL, video encoding (NVENC), and reliable sleep.']),
            choiceCard('nouveau', 'Open Source (Nouveau)', '', ['Fully open source, but without 3D acceleration on recent cards (the desktop draws in software) and without CUDA. Not for gaming.'])),
        );
        if (p.nvidia) {
          const boost = p.laptop ? ' Dynamic Boost is turned on too, sharing power between the processor and the graphics card.' : '';
          const igpu = others.map((g) => VENDOR[g.kind].label).join(' / ');
          wrap.append(...[
            p.hybrid ? h('div.group', { style: { marginTop: '12px' } },
              row('Install NVIDIA PRIME (prime-run)', toggle(D().prime, (v) => { D().prime = v; changed(); draw(); }),
                `Hybrid graphics: the desktop runs on the ${igpu} graphics to save battery. With PRIME you choose when an app or game uses the NVIDIA card instead: start it with “prime-run” (in Steam, set its launch options to “prime-run %command%”).`)) : null,
            p.hybrid && !D().prime ? note('info', `Without PRIME, everything runs on the ${igpu} graphics unless an app picks the NVIDIA card itself. You can add it later: sudo pacman -S nvidia-prime`) : null,
            boost ? note('info', boost.trim()) : null,
            !hw.bundled && !TEST ? note('warn', 'This copy of Lumen doesn’t include the NVIDIA driver, so it’s downloaded while installing. Connect to the internet first.') : null,
          ].filter(Boolean));
        }
      } else if (p.nvidiaCards.length) {
        wrap.append(note('warn', `NVIDIA’s current driver supports GeForce GTX 16, RTX 20 and newer cards. ${p.nvidiaCards[0].name} is older, so Lumen uses the open-source Nouveau driver for it. NVIDIA’s legacy driver for older cards (580xx) is available from the AUR after installing.`));
      }

      if (others.length && !p.nvidiaCards.length) {
        wrap.append(note('info', `${[...new Set(others.map((g) => VENDOR[g.kind].label))].join(' and ')} graphics are ready out of the box: Lumen includes Mesa with Vulkan and hardware video decoding, kept up to date with the rest of the system.`));
      }

      if (!p.nvidiaCards.length) {
        wrap.append(
          h('div.group-title', 'Other Options'),
          h('div.group', row('Install the NVIDIA driver anyway', toggle(D().forceNvidia, (v) => { D().forceNvidia = v; changed(); draw(); }),
            'For an NVIDIA card that isn’t connected right now, like an external graphics card. GeForce GTX 16 / RTX 20 and newer.')),
        );
      }
    };
    D().redraw = draw;
    draw();
    if (!D().hw) {
      api.gpus().then((hw) => {
        D().hw = hw;
        // NVIDIA's driver by default whenever the card supports it
        if (D().nvidia === null) D().nvidia = hw.gpus.some((g) => g.kind === 'nvidia' && g.supported) ? 'nvidia' : 'nouveau';
        draw(); changed();
      }).catch(() => { D().hw = { gpus: [], laptop: false, hybrid: false, bundled: false }; D().nvidia = 'nouveau'; draw(); changed(); });
    }
    return [
      hero('#30b0c7', CHIP, 'Graphics Drivers', 'Lumen found these graphics cards. Each gets the driver shown — for NVIDIA cards, you choose.'),
      wrap,
    ];
  },
  leave() { D().redraw = null; },
};
