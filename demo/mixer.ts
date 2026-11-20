// The mixer (?mixer): a slider per group of sounds, LEVELS of audio.ts, applied live and kept in
// this browser. Copy gives the groups' gains, to bake into LEVELS.
import { LEVELS, remix } from '../src/client/audio';

const KEPT = 'tiny-fps-mix';
/** LEVELS' groups, by index. */
const NAMES = ['VOICES', 'MOVES', 'WEAPONS', 'VEHICLES', 'BREATH', 'GAME', 'MUSIC'];
/** The order of the sliders. */
const SHOWN = ['MUSIC', 'VOICES', 'MOVES', 'WEAPONS', 'VEHICLES', 'BREATH', 'GAME'];
const BAKED = [...LEVELS];
type Mix = Record<string, number>;

const apply = (mix: Mix) => {
  NAMES.forEach((name, i) => (LEVELS[i] = mix[name] ?? BAKED[i]));
  remix();
};

export const mixer = () => {
  let mix: Mix = {};
  try {
    mix = JSON.parse(localStorage.getItem(KEPT) ?? '{}') as Mix;
  } catch {
    // The baked mix.
  }
  apply(mix);
  const keep = () => {
    try {
      localStorage.setItem(KEPT, JSON.stringify(mix));
    } catch {
      // Live only.
    }
  };

  const panel = document.createElement('aside');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;width:280px;overflow:auto;z-index:1000;' +
    'background:rgba(10,12,16,.92);color:#ddd;font:12px system-ui;padding:8px;border-radius:6px';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  head.innerHTML = '<strong style="flex:1">Mixer</strong>';
  const button = (label: string, on: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = on;
    head.append(b);
    return b;
  };
  const rows = new Map<string, (gain: number) => void>();
  const copy = button('Copy', () => {
    const text = JSON.stringify(Object.fromEntries(NAMES.map((n, i) => [n, LEVELS[i]])), null, 2);
    navigator.clipboard?.writeText(text).then(
      () => (copy.textContent = 'Copied'),
      () => prompt('Mix', text),
    );
    setTimeout(() => (copy.textContent = 'Copy'), 1500);
  });
  button('Reset', () => {
    mix = {};
    apply(mix);
    keep();
    NAMES.forEach((name, i) => rows.get(name)!(BAKED[i]));
  });
  button('Hide', () => (panel.hidden = true));
  panel.append(head);

  for (const name of SHOWN) {
    const i = NAMES.indexOf(name);
    const row = document.createElement('label');
    row.style.cssText =
      'display:grid;grid-template-columns:90px 1fr 34px;gap:6px;align-items:center';
    const input = Object.assign(document.createElement('input'), {
      type: 'range',
      min: '0',
      max: '2',
      step: '0.05',
    });
    const value = document.createElement('span');
    const set = (gain: number) => {
      input.value = String(gain);
      value.textContent = gain.toFixed(2);
    };
    set(LEVELS[i]);
    input.oninput = () => {
      const gain = Number(input.value);
      if (gain === BAKED[i]) {
        delete mix[name];
      } else {
        mix[name] = gain;
      }
      set(gain);
      apply(mix);
      keep();
    };
    row.append(Object.assign(document.createElement('span'), { textContent: name }), input, value);
    rows.set(name, set);
    panel.append(row);
  }
  // Alt+M hides it and brings it back.
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyM' && e.altKey) {
      panel.hidden = !panel.hidden;
    }
  });
  document.body.append(panel);
};
