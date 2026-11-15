import type { WorldDef } from '../shared/world';

/**
 * The steps of a map's loading, in order: its label, the share of the bar done at its end, and
 * about how long it takes (ms, measured on a laptop). The last is the first frame drawn.
 */
export const STEPS: readonly (readonly [string, number, number])[] = [
  ['Building the map', 0.15, 700],
  ['Joining the room', 0.25, 400],
  ['Dressing your runner', 0.5, 1500],
  ['Drawing the world', 1, 2500],
];

/** How far the bar creeps into a step before it is done: it never reaches a step's end early. */
const CREEP = 0.9;

/** The fill's ease out, and the keyframes it is drawn through, so that the page can tell where it is. */
const ease = (k: number) => 1 - (1 - k) ** 2;
const EASE = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/** The share filled at `t` (ms) by the animation `[from, to, since, ms]`. */
export const fillAt = ([from, to, since, ms]: number[], t: number) =>
  from + (to - from) * ease(Math.min(1, Math.max(0, (t - since) / ms)));

/** The bar's goal while step `i` runs (`i` past the last: full), and how long it takes to get there. */
export const goal = (i: number): [number, number] => {
  if (i >= STEPS.length) {
    return [1, 250];
  }
  const start = i ? STEPS[i - 1][1] : 0;
  return [start + (STEPS[i][1] - start) * CREEP, STEPS[i][2]];
};

const CSS =
  `:host{position:absolute;inset:0;z-index:3;display:grid;place-items:center;background:radial-gradient(at 50% 0,#2a1a12,#0b1016 70%);color:#e9eef3;font:600 14px system-ui,sans-serif;transition:opacity .3s}` +
  `div{display:grid;gap:10px;width:min(420px,100% - 32px);text-align:center}` +
  `em{font-size:12px;font-style:normal;letter-spacing:.08em;text-transform:uppercase;color:#ffb347}` +
  `strong{font:900 clamp(28px,7vw,44px)/1 system-ui;letter-spacing:.04em}` +
  `s{position:relative;height:8px;margin-top:14px;border-radius:4px;background:#18222c;overflow:hidden}` +
  // The fill and its sheen move by transform alone, on the compositor: they keep going while
  // the main thread is busy cutting the armour.
  `i,b{position:absolute;inset:0;transform-origin:0 0}i{background:linear-gradient(90deg,#ff9a4a,#e8590c);transform:scaleX(0)}` +
  `b{background:linear-gradient(90deg,#0000,#fff6,#0000);width:30%;animation:k 1.1s linear infinite}` +
  `@keyframes k{from{transform:translateX(-100%)}to{transform:translateX(340%)}}` +
  `p{margin:0;color:#8d9aa7;font-size:13px}`;

export interface Loader {
  /** The screen, last in the container so that it lies over the game. */
  el: HTMLElement;
  /** Step `i` of STEPS has started; STEPS.length or more: everything is done, the screen fades out. */
  step(i: number): void;
  /** Removed at once. */
  destroy(): void;
}

/** The loading screen over `container` while the map `def` is built: its name, a bar and the step. */
export const createLoader = (container: HTMLElement, def: WorldDef): Loader => {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><div><em></em><strong></strong><s><i></i><b></b></s><p></p></div>`;
  root.querySelector('em')!.textContent = def.tag ?? '';
  root.querySelector('strong')!.textContent = def.name ?? '';
  const fill = root.querySelector('i')!;
  const label = root.querySelector('p')!;
  // Over the game, which is positioned in its container.
  if (getComputedStyle(container).position == 'static') {
    container.style.position = 'relative';
  }
  container.append(host);
  let at = -1;
  /** The fill's animation: from, to, since (ms) and for how long. */
  let run = [0, 0, 0, 1];
  const loader: Loader = {
    el: host,
    step(i) {
      if (i <= at) {
        return;
      }
      at = i;
      const [to, ms] = goal(i);
      // Where the fill is now, by the clock: the page's own view of an animation stands still
      // while the main thread is busy, the compositor's does not.
      const t = performance.now();
      const from = fillAt(run, t);
      run = [from, to, t, ms];
      // A later animation replaces this one, and the browser drops it.
      fill.animate?.(
        EASE.map(k => ({ transform: `scaleX(${from + (to - from) * ease(k)})`, offset: k })),
        { duration: ms, fill: 'forwards' },
      );
      label.textContent = STEPS[i]?.[0] ?? '';
      if (i >= STEPS.length) {
        host.style.opacity = '0';
        setTimeout(loader.destroy, 300);
      }
    },
    destroy() {
      host.remove();
    },
  };
  loader.step(0);
  return loader;
};
