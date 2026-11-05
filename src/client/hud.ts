// The HUD, in the game's Shadow DOM: the health bar, the hurt fade, the title and death screens,
// and the muted mark. The health bar's flash and shake count down on the frame loop (update).
import { HEALTH } from '../shared/constants';

/** Seconds the health bar flashes (up) or shakes (down). */
const BUMP = 0.35;

export const HUD_CSS =
  `h4,h5,ul,aside,s{position:absolute;margin:0;padding:0;pointer-events:none;user-select:none;white-space:pre-line}` +
  `h4{left:0;right:0;text-align:center;top:28%;font-size:22px;line-height:1.5;color:#fcc;text-shadow:0 2px 8px #800}h4::first-line{font-size:52px;color:#f33}` +
  `h5{top:8px;right:12px;font-size:12px}` +
  `s{inset:0;opacity:0;background:radial-gradient(#d000 45%,#d00 115%)}` +
  `ul{--f:0;--s:0;--d:0;left:12px;bottom:12px;width:min(40vw,140px);height:22px;border-radius:4px;overflow:hidden;background:#0009;` +
  `box-shadow:0 0 0 1px #0008,0 0 0 calc(var(--d)*3px) #f22;transform:translateX(calc(var(--s)*1px));filter:brightness(calc(1 + var(--f)*2))}` +
  `ul li{position:absolute;top:0;bottom:0;left:0;transition:width .15s}` +
  `ul li+li{right:0;width:auto;text-align:center;line-height:22px;font-size:14px}` +
  `aside{inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 12px;text-align:center;background:#000b}` +
  `h6{margin:0;font-size:inherit;text-shadow:none}` +
  `aside h6{font:900 clamp(36px,13vw,84px)/1 system-ui,sans-serif;letter-spacing:.04em;transform:skewX(-8deg);` +
  `background:linear-gradient(#fe6,#f92 45%,#d21);-webkit-background-clip:text;background-clip:text;color:transparent;` +
  `filter:drop-shadow(0 3px 0 #500) drop-shadow(0 0 14px #f604)}` +
  `strong{font-size:22px}` +
  `table{border-collapse:collapse;font-size:16px}td{padding:2px 10px}td+td{text-align:left}td:first-child{text-align:right;opacity:.7}`;

export interface Hud {
  /** The own health: the bar's width, number and colour. It flashes on a rise and shakes on a fall. */
  hp(n: number): void;
  /** The own player is dead and respawns in `secs` seconds; 0 hides the death screen. */
  dead(secs: number): void;
  /**
   * The red vignette, each 0 to 1: the fade of a hit, and the low-health beat (0 when the health
   * is not low).
   */
  fade(hurt: number, low: number): void;
  /** The title screen with `status` under the controls, "Click to play" or why not; '' hides it. */
  title(status: string, level: string): void;
  /** Shows or hides the muted mark. */
  mute(on: boolean): void;
  /** Advances dt seconds. */
  update(dt: number): void;
}

/** Appends the HUD to `screen`, whose stylesheet has HUD_CSS. */
export const createHud = (screen: HTMLElement): Hud => {
  screen.insertAdjacentHTML(
    'beforeend',
    `<s></s><ul><li></li><li></li></ul>` +
      `<aside hidden><h6>TINY FPS</h6><span></span><table>` +
      `<tr><td>Mouse<td>look<tr><td>WASD / ZQSD<td>move<tr><td>Space<td>jump<tr><td>M<td>mute</table>` +
      `<strong></strong></aside>` +
      `<h4 hidden></h4><h5 hidden>Muted (M)</h5>`,
  );
  const one = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const vignette = one('s');
  const [bar, fill, num] = [one('ul'), one('ul li'), one('ul li+li')];
  const [respawn, muted, menu] = ['h4', 'h5', 'aside'].map(t => one(t));
  const [level, status] = ['aside span', 'strong'].map(t => one(t));
  /** Health shown, and seconds of flash and shake left. */
  let shown = 0;
  let [flash, shake] = [0, 0];
  const set = (el: HTMLElement, text: string) => el.textContent != text && (el.textContent = text);
  return {
    hp(n) {
      if (shown) {
        flash = n > shown ? BUMP : flash;
        shake = n < shown ? BUMP : shake;
      }
      shown = n;
      fill.style.width = `${(n / HEALTH) * 100}%`;
      fill.style.background = `hsl(${((Math.max(n, 1) - 1) / (HEALTH - 1)) * 110},75%,42%)`;
      set(num, String(n));
    },
    dead(secs) {
      respawn.hidden = !secs;
      if (secs) {
        set(respawn, `You died\nRespawn in ${secs}`);
      }
    },
    fade(hurt, low) {
      vignette.style.opacity = String(Math.max(hurt * 0.9, low && 0.2 + low * 0.4));
    },
    title(text, name) {
      menu.hidden = !text;
      set(level, name);
      set(status, text);
    },
    mute: on => (muted.hidden = !on),
    update(dt) {
      flash = Math.max(0, flash - dt);
      shake = Math.max(0, shake - dt);
      for (const [k, v] of [
        ['--f', flash / BUMP],
        ['--d', shake / BUMP],
        ['--s', (Math.sin(shake * 90) * 8 * shake) / BUMP],
      ] as const) {
        bar.style.setProperty(k, String(v));
      }
    },
  };
};
