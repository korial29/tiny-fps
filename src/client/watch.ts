// The bot view, to debug the bots: B looks through a bot's eyes, again the next bot, then back to
// the own; its way is drawn over the view (the points it has passed dim, the one it goes to now
// yellow, its goal red) and a panel says what it is up to (the room's 'bot' text, bot.ts's view()).
// The eye is the bot as the others are drawn, INTERP_DELAY in the past; the way and the panel are the
// room's live tick, about 6 frames ahead of it.
import type { BotView } from '../shared/bot';
import { KEY } from '../shared/types';

/** The keys a bot pressed, as a panel shows them. */
const KEYS: [bit: number, name: string][] = [
  [KEY.FORWARD, 'W'],
  [KEY.LEFT, 'A'],
  [KEY.BACK, 'S'],
  [KEY.RIGHT, 'D'],
  [KEY.SPRINT, 'sprint'],
  [KEY.JUMP, 'jump'],
  [KEY.DASH, 'dash'],
  [KEY.CROUCH, 'crouch'],
  [KEY.FIRE, 'fire'],
  [KEY.RELOAD, 'reload'],
];

export interface Watch {
  /** The bot watched, if any. */
  readonly id: number | undefined;
  /** The next of these bots after the one watched (the first when none), or none after the last. */
  next(bots: number[]): number | undefined;
  /** What the bot watched is up to, as the room last told it. */
  take(v: BotView): void;
  /** Its way and its panel over the frame just drawn, `project` the renderer's; with no bot watched, nothing. */
  draw(
    project: (x: number, y: number, z: number) => [number, number] | undefined,
    name: (id: number) => string,
  ): void;
  /** Takes its canvas and panel off the screen. */
  destroy(): void;
}

export const createWatch = (screen: HTMLElement): Watch => {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  const panel = document.createElement('pre');
  panel.style.cssText =
    'position:absolute;top:12px;left:12px;margin:0;padding:8px 10px;background:#000a;border-radius:6px;font:12px/1.5 ui-monospace,monospace;pointer-events:none';
  canvas.hidden = panel.hidden = true;
  screen.append(canvas, panel);
  const g = canvas.getContext('2d');
  let id: number | undefined;
  let view: BotView | undefined;
  return {
    get id() {
      return id;
    },
    next(bots) {
      const sorted = [...bots].sort((a, b) => a - b);
      id = id === undefined ? sorted[0] : sorted.find(b => b > id!);
      view = undefined;
      canvas.hidden = panel.hidden = id === undefined;
      return id;
    },
    take(v) {
      view = v.id === id ? v : view;
    },
    draw(project, name) {
      if (id === undefined || !g) {
        return;
      }
      const [w, h] = [canvas.clientWidth, canvas.clientHeight];
      if (canvas.width != w || canvas.height != h) {
        [canvas.width, canvas.height] = [w, h];
      }
      g.clearRect(0, 0, w, h);
      if (!view) {
        panel.textContent = `${name(id)}: waiting for the room…`;
        return;
      }
      const v = view;
      const at = v.path.map(([x, y, z]) => project(x, y + 0.1, z));
      g.lineWidth = 2;
      for (let k = 1; k < at.length; k++) {
        const [a, b] = [at[k - 1], at[k]];
        if (a && b) {
          g.strokeStyle = k <= v.next ? '#fff5' : '#4cf';
          g.beginPath();
          g.moveTo(a[0] * w, a[1] * h);
          g.lineTo(b[0] * w, b[1] * h);
          g.stroke();
        }
      }
      at.forEach((p, k) => {
        if (p) {
          g.fillStyle =
            k == at.length - 1 ? '#f44' : k == v.next ? '#fd3' : k < v.next ? '#fff5' : '#4cf';
          g.beginPath();
          g.arc(p[0] * w, p[1] * h, k == v.next || k == at.length - 1 ? 7 : 4, 0, 2 * Math.PI);
          g.fill();
        }
      });
      const keys = KEYS.filter(([bit]) => v.keys & bit).map(([, n]) => n);
      panel.textContent =
        `${name(v.id)} (B: next bot)\n` +
        `goal   ${v.why || '-'}\n` +
        `doing  ${v.doing}, point ${Math.min(v.next + 1, v.path.length)} of ${v.path.length}\n` +
        `fights ${v.foe >= 0 ? name(v.foe) : '-'}\n` +
        `keys   ${keys.join(' ') || '-'}`;
    },
    destroy() {
      canvas.remove();
      panel.remove();
    },
  };
};
