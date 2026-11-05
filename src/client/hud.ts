// The HUD, in the game's Shadow DOM: the title screen with the controls and the muted mark.

export const HUD_CSS =
  `h5,aside{position:absolute;margin:0;padding:0;pointer-events:none;user-select:none;white-space:pre-line}` +
  `h5{top:8px;right:12px;font-size:12px}` +
  `aside{inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 12px;text-align:center;background:#000b}` +
  `h6{margin:0;font-size:inherit;text-shadow:none}` +
  `aside h6{font:900 clamp(36px,13vw,84px)/1 system-ui,sans-serif;letter-spacing:.04em;transform:skewX(-8deg);` +
  `background:linear-gradient(#fe6,#f92 45%,#d21);-webkit-background-clip:text;background-clip:text;color:transparent;` +
  `filter:drop-shadow(0 3px 0 #500) drop-shadow(0 0 14px #f604)}` +
  `strong{font-size:22px}` +
  `table{border-collapse:collapse;font-size:16px}td{padding:2px 10px}td+td{text-align:left}td:first-child{text-align:right;opacity:.7}`;

export interface Hud {
  /** The title screen with `status` under the controls, "Click to play" or why not; '' hides it. */
  title(status: string, name: string): void;
  /** Shows or hides the muted mark. */
  mute(on: boolean): void;
}

/** Appends the HUD to `screen`, whose stylesheet has HUD_CSS. */
export const createHud = (screen: HTMLElement): Hud => {
  screen.insertAdjacentHTML(
    'beforeend',
    `<aside hidden><h6>TINY FPS</h6><span></span><table>` +
      `<tr><td>Mouse<td>look<tr><td>WASD / ZQSD<td>move<tr><td>Shift<td>sprint<tr><td>Space<td>jump, again in the air` +
      `<tr><td>E / right click<td>dash<tr><td>C<td>crouch, slide when fast<tr><td>M<td>mute</table>` +
      `<strong></strong></aside>` +
      `<h5 hidden>Muted (M)</h5>`,
  );
  const one = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const [muted, menu] = ['h5', 'aside'].map(t => one(t));
  const [name, status] = ['aside span', 'strong'].map(t => one(t));
  const set = (el: HTMLElement, text: string) => el.textContent != text && (el.textContent = text);
  return {
    title(text, map) {
      menu.hidden = !text;
      set(name, map);
      set(status, text);
    },
    mute: on => (muted.hidden = !on),
  };
};
