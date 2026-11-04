// The minimal HUD, in the game's Shadow DOM: health pips, the keys held, a title, a hint, the
// respawn text and the end screen. Timed texts count down on the frame loop (update).
import { HEALTH } from '../shared/constants';
import { ITEM_COLOR, css } from './items';

/** Slots of say(): a title, a hint under it, the end screen; and seconds each stays up. */
export const SAY = { TITLE: 0, NOTE: 1, END: 2 } as const;
const SHOW = [2, 3, 6];

export const HUD_CSS =
  `h1,h2,h3,h4,ul,ol{position:absolute;margin:0;padding:0;pointer-events:none;user-select:none;white-space:pre-line}` +
  `h1,h2,h4{left:0;right:0;text-align:center}` +
  `h1{top:14%;font-size:20px;line-height:1.4}h1::first-line{font-size:44px}` +
  `h2{top:32%;font-size:22px}h4{top:45%;font-size:26px}` +
  `h3{inset:0;padding-top:25%;text-align:center;background:#000b;font-size:22px;line-height:1.6}h3::first-line{font-size:48px}` +
  `ul,ol{left:12px;display:flex;gap:3px;list-style:none}ul{bottom:12px}ol{bottom:38px}` +
  `ul li{width:14px;height:18px;border-radius:2px;background:#e33;box-shadow:0 0 0 1px #0008}` +
  `ol li{width:16px;height:9px;border-radius:2px;box-shadow:0 0 0 1px #0008}`;

export interface Hud {
  /** Health pips: the first n are lit. */
  hp(n: number): void;
  /** The keys held, as the snapshot's bit set (1 << ITEM.KEY_*). */
  keys(bits: number): void;
  /** The own player is dead: "Respawning…". */
  dead(on: boolean): void;
  /** Shows text in a SAY slot, for that slot's time. */
  say(slot: number, text: string): void;
  /** Advances dt seconds. */
  update(dt: number): void;
}

/** Appends the HUD to `screen`, whose stylesheet has HUD_CSS. */
export const createHud = (screen: HTMLElement): Hud => {
  screen.insertAdjacentHTML(
    'beforeend',
    `<ul>${'<li></li>'.repeat(HEALTH)}</ul><ol>${'<li hidden></li>'.repeat(3)}</ol>` +
      `<h1 hidden></h1><h2 hidden></h2><h3 hidden></h3><h4 hidden>Respawning…</h4>`,
  );
  const all = <T extends HTMLElement>(sel: string) => [...screen.querySelectorAll<T>(sel)];
  const [pips, marks, texts] = [all('ul li'), all('ol li'), all('h1,h2,h3')];
  const respawn = screen.querySelector('h4')!;
  marks.forEach((m, i) => (m.style.background = css(ITEM_COLOR[i + 1])));
  const left = SHOW.map(() => 0);
  return {
    hp: n => pips.forEach((p, i) => (p.style.opacity = i < n ? '1' : '0.2')),
    keys: bits => marks.forEach((m, i) => (m.hidden = !((bits >> (i + 1)) & 1))),
    dead: on => (respawn.hidden = !on),
    say(slot, text) {
      texts[slot].textContent = text;
      texts[slot].hidden = false;
      left[slot] = SHOW[slot];
    },
    update(dt) {
      left.forEach((t, i) => {
        if (t > 0 && (left[i] = t - dt) <= 0) {
          texts[i].hidden = true;
        }
      });
    },
  };
};
