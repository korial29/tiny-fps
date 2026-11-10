// The HUD, in the game's Shadow DOM: the title screen with the controls and the maps, the muted mark, the score
// and the clock with the state of both flags, the markers toward the flags, the banner of the last
// event and the end screen of a match.
import {
  GUN_MAG,
  HP_MAX,
  RAIL_CAP,
  RAIL_MAX,
  RIFLE_CLIP,
  TEAM_COLOR,
  TEAM_NAME,
} from '../shared/constants';
import type { Result } from '../shared/protocol';
import { ROVER } from '../shared/rover';
import { FLAG, MODE, NOBODY } from '../shared/types';
import type { PlayerState, Rover, Snapshot } from '../shared/types';
import { FH, FW, PALETTE, sprite } from './face';
import type { Mark } from './marks';

export const HUD_CSS =
  `h5,aside,nav,output,section,em,u,ul,dl,s,mark,ins,figure,del,menu,samp,cite,q{position:absolute;margin:0;padding:0;pointer-events:none;user-select:none;white-space:pre-line}` +
  `h5{top:8px;right:12px;font-size:12px}` +
  `u{inset:0;opacity:0;background:radial-gradient(ellipse at center,#0000 35%,#d10000dd 120%)}` +
  `nav{top:8px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:1fr auto 1fr;gap:2px 16px;align-items:center;text-align:center;font-size:13px}` +
  `nav span,nav time{font:900 clamp(16px,4.6vw,24px)/1 system-ui,sans-serif;letter-spacing:.03em;white-space:nowrap}nav time{min-width:4.2ch;font-variant-numeric:tabular-nums;font-size:clamp(14px,3.8vw,20px)}` +
  `nav small{font-size:clamp(10px,2.6vw,12px);white-space:nowrap;opacity:.95}nav small:first-of-type{text-align:right}nav small:last-of-type{text-align:left}` +
  // The banner of an event (the user, 2026-11-09: no underline, a nicer design): heavy italic in the
  // team's colour, glowing, on a dark band fading out at both ends, popping in.
  `output{top:18%;left:50%;transform:translateX(-50%);padding:12px 64px;font:900 italic clamp(20px,4.4vw,40px)/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;` +
  `background:linear-gradient(90deg,#0000,#000c 24%,#000c 76%,#0000);text-shadow:0 0 18px currentColor,0 0 2px currentColor,0 3px 0 #000;animation:pop .4s cubic-bezier(.2,1.5,.4,1)}` +
  `@keyframes pop{from{opacity:0;transform:translateX(-50%) scale(1.5)}}` +
  `em{font-style:normal;font-size:13px;font-weight:800;line-height:1.1;text-align:center;transform:translate(-50%,-50%)}em span{display:block;font-size:20px;line-height:1}` +
  `section{inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:0 12px;text-align:center;background:#000c}` +
  `section h6{font:900 clamp(30px,9vw,72px)/1 system-ui,sans-serif;letter-spacing:.04em}section strong{font-size:34px}` +
  `section td:first-child{text-align:left;opacity:1}section td+td{text-align:center}section th{padding:2px 10px;font-size:12px;opacity:.7;font-weight:600}` +
  `aside{inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 12px;text-align:center;background:#000b}` +
  `h6{margin:0;font-size:inherit;text-shadow:none}` +
  `aside h6{font:900 clamp(36px,13vw,84px)/1 system-ui,sans-serif;letter-spacing:.04em;transform:skewX(-8deg);` +
  `background:linear-gradient(#fe6,#f92 45%,#d21);-webkit-background-clip:text;background-clip:text;color:transparent;` +
  `filter:drop-shadow(0 3px 0 #500) drop-shadow(0 0 14px #f604)}` +
  `ul{left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:4px;list-style:none}li{width:16px;height:6px;background:#fff;box-shadow:0 0 0 1px #0008}` +
  `li.e{background:#0000;box-shadow:inset 0 0 0 1px #fffb,0 0 0 1px #0008}ul.low li{background:#f55}ul.low li.e{background:#0000}` +
  `dl{right:12px;bottom:10px;display:flex;align-items:center;gap:10px}dl svg{width:38px;fill:#fff;filter:drop-shadow(0 1px 1px #000)}` +
  `dl.k svg:first-child,dl:not(.k) svg+svg,dl.k data,dl.k span{display:none}dl.w data{opacity:.35}dl.k svg{width:64px;fill:#8ef}dl.r svg{fill:#c9f}dl.r data{color:#dcf}dl.f svg{fill:#f86}dl.f data{color:#fdb}dl span::first-line{font-size:22px}` +
  `dl small{position:absolute;bottom:100%;right:0;display:flex;gap:10px;font-size:11px;white-space:nowrap}dl kbd{font:inherit;opacity:.5}dl kbd.a{opacity:1}` +
  `dl data{font:900 clamp(30px,5vw,46px)/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}dl.e data{color:#f66}` +
  `s{left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;` +
  `background:linear-gradient(45deg,#0000 44%,#fff 44% 56%,#0000 56%),linear-gradient(-45deg,#0000 44%,#fff 44% 56%,#0000 56%);` +
  `-webkit-mask:radial-gradient(#0000 6px,#000 7px);mask:radial-gradient(#0000 6px,#000 7px)}` +
  `mark{inset:0;z-index:1;padding-top:30vh;text-align:center;color:#ddd;` +
  `background:radial-gradient(ellipse at center,#6668 0%,#4a0c0ce8 130%);backdrop-filter:grayscale(1)}` +
  `mark::first-line{font:900 clamp(30px,8vw,64px)/1 system-ui,sans-serif;letter-spacing:.24em}` +
  `ins{left:50%;top:64%;width:min(320px,70vw);height:12px;transform:translateX(-50%);border-radius:6px;` +
  `background:linear-gradient(90deg,#e23b3b,#fff3 50%,#8ef);box-shadow:0 0 0 1px #0008}` +
  `ins i{position:absolute;top:-5px;width:6px;height:22px;margin-left:-3px;border-radius:3px;background:#fff;box-shadow:0 0 8px #8ef}` +
  `figure{left:50%;bottom:24px;transform:translateX(-50%)}figure canvas{display:block;width:72px;height:87px;image-rendering:pixelated;filter:drop-shadow(0 2px 2px #000a)}` +
  // The visor rim of a helmet: the dark of the shell at the corners, a curved edge and a sheen on it.
  `del{inset:0;background:radial-gradient(ellipse 74% 80% at 50% 54%,#0000 62%,#000c 100%)}` +
  `del::before{content:"";position:absolute;inset:3% 4% 6%;border-radius:42% 42% 30% 30%/34% 34% 24% 24%;box-shadow:inset 0 0 0 2px #fff1,inset 0 10px 16px #fff1,inset 0 -8px 14px #0006}` +
  `strong{font-size:22px}` +
  `table{border-collapse:collapse;font-size:16px}td{padding:2px 10px}td+td{text-align:left}td:first-child{text-align:right;opacity:.7}` +
  // The maps over the title screen, and over the end screen when the pointer is free: the host's buttons.
  `menu{top:10px;left:50%;transform:translateX(-50%);z-index:3;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;width:max-content;max-width:calc(100% - 24px);font-size:12px}` +
  `menu button{font:700 13px system-ui,sans-serif;color:#fff;background:#0008;border:1px solid #fff5;border-radius:4px;padding:5px 12px;cursor:pointer;pointer-events:auto}` +
  `menu .n{border-color:#fe6;color:#fe6;box-shadow:0 0 8px #f924}menu button:disabled{cursor:default}` +
  // The rover: the key to get in or out, over the face, and the speed where the gun's count is; at the wheel the gun, the crosshair and the visor's rim go.
  `samp{left:50%;bottom:128px;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#0008;font:inherit;font-size:15px;white-space:nowrap}` +
  `samp var{display:inline-block;margin-right:8px;padding:1px 7px;border:1px solid #fffb;border-radius:4px;font-style:normal;font-weight:900}` +
  `q{width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid #5f8;border-radius:50%;box-shadow:0 0 6px #3f6,inset 0 0 4px #3f6;background:radial-gradient(#afc 0 1.5px,#0000 2px)}q::before,q::after{content:none}` +
  `cite{right:12px;bottom:10px;font:900 clamp(30px,5vw,46px)/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}cite small{margin-left:6px;font-size:14px}` +
  `div.v>i,.v dl,.v del{display:none}`;

/** Seconds the way out is shown after sitting down. */
export const OUT_HINT = 4;

/**
 * What E does for a player on foot: 'drive' within ROVER.ENTER_R of a rover whose wheel is free,
 * 'ride' when only the seat beside it is, or when he carries a flag (a carrier does not drive),
 * '' with no free seat in reach, seated or down. The nearest rover with a seat for him counts.
 */
export const boarding = (
  me: Pick<PlayerState, 'x' | 'y' | 'z' | 'mode' | 'down'> | undefined,
  rovers: readonly Rover[],
  carrying = false,
): '' | 'drive' | 'ride' => {
  let [best, what]: [number, '' | 'drive' | 'ride'] = [ROVER.ENTER_R, ''];
  if (!me || me.down || me.mode === MODE.RIDE) {
    return what;
  }
  for (const r of rovers) {
    const d = Math.hypot(r.x - me.x, r.z - me.z);
    const seat = r.driver === NOBODY && !carrying ? 'drive' : r.rider === NOBODY ? 'ride' : '';
    if (seat && d <= best && Math.abs(r.y - me.y) <= ROVER.ENTER_R) {
      [best, what] = [d, seat];
    }
  }
  return what;
};

/** The speed-o-meter's reading of a rover: whole km/h over the ground. */
export const kmh = (r: Pick<Rover, 'vx' | 'vz'>): number =>
  Math.round(Math.hypot(r.vx, r.vz) * 3.6);

/** What the end screen shows: the final captures and what each player did. */
export interface Summary {
  score: [number, number];
  players: Result[];
}

export interface Hud {
  /** The title screen with `status` under the controls, "Click to play" or why not; '' hides it. */
  title(status: string, name: string): void;
  /**
   * The maps over the title screen, [key, name] each: the one the next match plays (`next`, else
   * `played`) stands out. They are buttons that `pick` when the own player is the host (`mine`),
   * read-only for the others; `host` is his name.
   */
  maps(
    list: [string, string][],
    played: string,
    next: string | undefined,
    host: string,
    mine: boolean,
    pick: (key: string) => void,
  ): void;
  /** Shows or hides the muted mark. */
  mute(on: boolean): void;
  /**
   * The score and the clock at the top, and under them the state of both flags: at home, taken by
   * a player (`who` gives his name) or dropped with the seconds left. Over, the clock reads END.
   */
  match(m: Pick<Snapshot, 'score' | 'clock' | 'over' | 'flags'>, who: (id: number) => string): void;
  /** The markers of this frame (see marks.ts), in the order given; the ones before are removed. */
  marks(list: Mark[]): void;
  /** The dark rim of a space helmet's visor around the screen: on while the own player wears one, off otherwise. */
  visor(on: boolean): void;
  /** The red vignette of a tackle, 0 (none) to 1 (full). */
  hurt(level: number): void;
  /**
   * The health as pips out of HP_MAX, and the weapon in hand: the ammo counter with the gun glyph,
   * the katana glyph when `wield` (or when it is all there is), or the rail gun's lightning left
   * (charge(), 99 full) with the gun glyph in violet when `railed`. -1 ammo is no gun, `blade` is a
   * katana carried, `rail` the rail gun's lightning (-1 none); two or more carried show their slots (1 gun, 2 katana, 3 rail gun)
   * over the glyph, none hides it. `loaded` is what the battery or the capsule of the gun in hand
   * holds, in the same count: big, with the rest after it as the magazines it makes (an open one for
   * a part) over its count; faded while `swapping` it. `rifle` is the
   * laser rifle's rounds (-1 none), shown with the glyph in red when `rifled` (slot 4).
   */
  vitals(
    hp: number,
    ammo: number,
    blade?: boolean,
    wield?: boolean,
    rail?: number,
    railed?: boolean,
    loaded?: number,
    swapping?: boolean,
    rifle?: number,
    rifled?: boolean,
  ): void;
  /** A hit marker on the crosshair for a moment: a ball or a cut of the own player hit. */
  hit(): void;
  /** The face over the health, frame `n` of face.ts (-1 hides it). */
  face(n: number): void;
  /**
   * A saber lock: the gauge of the tug of war under the crosshair, with `lead` the own side's, -1
   * (the foe wins) to 1 (he wins); undefined hides it.
   */
  duel(lead: number | undefined): void;
  /** The state of being down: `level` 0 (up) to 1 hides or greys the screen, `left` seconds till the respawn. */
  down(level: number, left: number): void;
  /** A line in the middle of the top of the screen in `team`'s colour, for a few seconds; a newer one replaces it. */
  banner(text: string, team?: number): void;
  /**
   * The rover: `act` is what E does now ('drive', 'ride', 'get out'; '' hides the prompt), and
   * `speed` the km/h shown at the wheel, where the gun and the crosshair then hide; undefined off it.
   */
  rover(act: string, speed?: number): void;
  /** The rover's reticle, where its lasers cross: `at` on screen in [0, 1] from the top left; undefined hides it. */
  aim(at?: [number, number]): void;
  /** The end screen with the result and each player's captures and returns, `next` seconds before the next match; undefined hides it. */
  end(sum: Summary | undefined, next: number): void;
}

/** Milliseconds a banner stays, and a hit marker. */
export const BANNER_MS = 2800;
export const HIT_MS = 140;

/** m:ss. */
export const clock = (s: number): string => `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;

/** Appends the HUD to `screen`, whose stylesheet has HUD_CSS. */
export const createHud = (screen: HTMLElement): Hud => {
  screen.insertAdjacentHTML(
    'beforeend',
    `<aside hidden><h6>TINY FPS</h6><span></span><table>` +
      `<tr><td>Mouse<td>look<tr><td>WASD / ZQSD<td>move<tr><td>Shift<td>sprint<tr><td>Space<td>jump, again in the air` +
      `<tr><td>Move key twice<td>dash that way<tr><td>C<td>crouch, slide when fast<tr><td>Left click<td>fire, hold to charge<tr><td>R<td>swap the battery<tr><td>1, 2, 3, 4, wheel<td>gun, katana, rail gun, laser rifle` +
      `<tr><td>Katana + W<td>thrust<tr><td>Katana + A or D<td>cut across<tr><td>Katana alone<td>slash<tr><td>Double click<td>special: lunge, energy arc, leap<tr><td>Blades locked<td>click fast; step aside to break<tr><td>E<td>rover: get in, get out (W/S drive toward the look, Space handbrake)<tr><td>M<td>mute<tr><td>Esc<td>this screen: the host picks the map at the top</table>` +
      `<span>Take the enemy flag to your own base while yours is home. Jump onto the armoury past your flag for the gun, the katana and the rail gun. Hold the rail gun's lightning on a foe: it slows him and drains 1 health a second, and 3 s more after it lets go.</span>` +
      `<strong></strong></aside><menu hidden></menu>` +
      `<del hidden></del><u></u><h5 hidden>Muted (M)</h5>` +
      `<ul>${'<li></li>'.repeat(HP_MAX)}</ul><figure hidden><canvas width="${FW}" height="${FH}"></canvas></figure>` +
      `<dl hidden><svg viewBox="0 0 38 22"><path d="M1 7c3-5 13-7 22-4l7 3 3 1v4l-6 1-4 2-1 1-3 6h-5l2-7-5-1c-6-1-12-3-10-6z"/></svg>` +
      `<svg viewBox="0 0 38 22"><path d="M12 14.4C19 11.6 29 6.4 37 1c-3.6 7-14.4 13.4-24.4 16zM1 20.2l7-6.6 1.6 1.8-7 6.6zM7.6 12.4l3.2-1.4 2 4.6-3.2 1.4z"/></svg>` +
      `<data></data><span></span><small hidden><kbd>1 gun</kbd><kbd>2 katana</kbd><kbd>3 rail</kbd><kbd>4 rifle</kbd></small></dl>` +
      `<s hidden></s><mark hidden></mark><ins hidden><i></i></ins>` +
      `<nav hidden><span></span><time></time><span></span><small></small><small></small></nav>` +
      `<output hidden></output><samp hidden><var>E</var><span></span></samp><cite hidden><span></span><small>km/h</small></cite><q hidden></q>` +
      `<section hidden><h6></h6><strong></strong><table></table><span></span></section>`,
  );
  const one = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const [muted, menu, maps] = ['h5', 'aside', 'menu'].map(t => one(t));
  /** The name of the map the host picked for the next match, for the end screen. */
  let soon = '';
  const [name, status] = ['aside span', 'aside strong'].map(t => one(t));
  const set = (el: HTMLElement, text: string) => el.textContent != text && (el.textContent = text);
  const bar = one('nav');
  const [red, time, blue] = [...bar.querySelectorAll<HTMLElement>('span, time')];
  const [redFlag, blueFlag] = [...bar.querySelectorAll<HTMLElement>('small')];
  const pips = [...screen.querySelectorAll('li')];
  const [life, ammo, marker, fallen] = [one('ul'), one('dl'), one('s'), one('mark')];
  const [rope, knot] = [one('ins'), one('ins i')];
  const [count, spare, slots] = [one('data'), one('dl span'), one('dl small')];
  let ticker: ReturnType<typeof setTimeout> | undefined;
  const [frame, mug] = [one('figure'), one<HTMLCanvasElement>('figure canvas')];
  let pen: CanvasRenderingContext2D | null | undefined;
  let shown = -1;
  const banner = one('output');
  const [prompt, act, meter, speed] = ['samp', 'samp span', 'cite', 'cite span'].map(t => one(t));
  const vignette = one('u');
  const rim = one('del');
  const end = one('section');
  const [title, score, next] = ['h6', 'strong', 'span'].map(t =>
    end.querySelector<HTMLElement>(t)!,
  );
  const table = end.querySelector('table')!;
  const pins: HTMLElement[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The summary the end screen's table was built from. */
  let built: Summary | undefined;
  const tint = (el: HTMLElement, team: number) => (el.style.color = TEAM_COLOR[team]);
  [red, redFlag].forEach(el => tint(el, 0));
  [blue, blueFlag].forEach(el => tint(el, 1));
  return {
    title(text, map) {
      menu.hidden = !text;
      maps.hidden = !text || !maps.childElementCount;
      set(name, map);
      set(status, text);
    },
    maps(list, played, next, host, mine, pick) {
      const label = document.createElement('span');
      label.textContent = mine ? 'You host. Map of the next match:' : `${host} hosts. Map:`;
      maps.replaceChildren(label);
      soon = '';
      for (const [key, name] of list) {
        const b = document.createElement('button');
        b.textContent = key == played && next ? `${name} (now)` : name;
        b.disabled = !mine;
        b.className = key == (next ?? played) ? 'n' : '';
        b.onclick = () => pick(key);
        maps.append(b);
        soon = key == next ? name : soon;
      }
    },
    mute: on => (muted.hidden = !on),
    match(m, who) {
      bar.hidden = false;
      set(red, `${TEAM_NAME[0].toUpperCase()} ${m.score[0]}`);
      set(blue, `${m.score[1]} ${TEAM_NAME[1].toUpperCase()}`);
      set(time, m.over ? 'END' : clock(m.clock));
      m.flags.forEach((f, k) => {
        const state =
          f.state === FLAG.CARRIED
            ? `taken by ${who(f.by)}`
            : f.state === FLAG.DROPPED
              ? `dropped ${f.left}s`
              : 'home';
        set(k ? blueFlag : redFlag, `${TEAM_NAME[k]} flag: ${state}`);
      });
    },
    marks(list) {
      while (pins.length < list.length) {
        const el = document.createElement('em');
        el.innerHTML = '<span></span><small></small>';
        pins.push(el);
        screen.append(el);
      }
      pins.splice(list.length).forEach(el => el.remove());
      list.forEach((m, i) => {
        const el = pins[i];
        el.style.left = `${m.x * 100}%`;
        el.style.top = `${m.y * 100}%`;
        tint(el, m.team);
        const [arrow, text] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement];
        // Over its target a mark points down at it; at the edge it points the way to turn.
        arrow.style.transform = m.arrow === undefined ? '' : `rotate(${m.arrow}rad)`;
        set(arrow, m.arrow === undefined ? '▼' : '▲');
        set(text, `${m.kind === 'base' ? 'Base ' : ''}${m.text}`);
      });
    },
    visor: on => (rim.hidden = !on),
    hurt(level) {
      const v = level < 0.01 ? '' : `${Math.min(1, level)}`;
      if (vignette.style.opacity != v) {
        vignette.style.opacity = v;
      }
    },
    vitals(
      hp,
      rounds,
      blade = false,
      wield = false,
      rail = -1,
      railed = false,
      loaded,
      swapping = false,
      rifle = -1,
      rifled = false,
    ) {
      pips.forEach((li, i) => li.classList.toggle('e', i >= hp));
      life.classList.toggle('low', hp <= 1);
      const have = [rounds >= 0, blade, rail >= 0, rifle >= 0];
      const k = !railed && !rifled && blade && (wield || !have[0]);
      const n = rifled ? rifle : railed ? rail : rounds;
      ammo.hidden = !have.some(Boolean);
      ammo.classList.toggle('k', k);
      ammo.classList.toggle('r', railed);
      ammo.classList.toggle('f', rifled);
      const m = Math.max(loaded ?? n, 0);
      ammo.classList.toggle('e', !k && !m);
      ammo.classList.toggle('w', swapping);
      set(count, `${m}`);
      // The rest as the magazines it makes, full ones and an open one for a part, over its count.
      const rest = Math.max(n - m, 0);
      const size = rifled ? RIFLE_CLIP : railed ? (RAIL_CAP * 99) / RAIL_MAX : GUN_MAG;
      set(spare, `${'▮'.repeat(rest / size)}${rest % size ? '▯' : ''}\n${rest}`);
      slots.hidden = have.filter(Boolean).length < 2;
      [...slots.children].forEach((kbd, i) => {
        (kbd as HTMLElement).hidden = !have[i];
        kbd.classList.toggle('a', i == (k ? 1 : rifled ? 3 : railed ? 2 : 0));
      });
    },
    face(n) {
      frame.hidden = n < 0;
      if (n < 0 || n == shown) {
        return;
      }
      shown = n;
      pen ??= mug.getContext('2d');
      if (pen) {
        const img = pen.createImageData(FW, FH);
        const px = new Uint32Array(img.data.buffer);
        sprite(n).forEach((c, i) => (px[i] = PALETTE[c]));
        pen.putImageData(img, 0, 0);
      }
    },
    hit() {
      marker.hidden = false;
      clearTimeout(ticker);
      ticker = setTimeout(() => (marker.hidden = true), HIT_MS);
    },
    duel(lead) {
      rope.hidden = lead === undefined;
      knot.style.left = `${50 + 50 * Math.max(-1, Math.min(1, lead ?? 0))}%`;
    },
    down(level, left) {
      fallen.hidden = level < 0.02;
      fallen.style.opacity = `${Math.min(level, 1)}`;
      set(fallen, fallen.hidden ? '' : `DOWN\nBack in ${left.toFixed(1)}`);
    },
    banner(text, team) {
      banner.hidden = false;
      // Each banner pops in again.
      banner.style.animation = 'none';
      void banner.offsetWidth;
      banner.style.animation = '';
      set(banner, text);
      banner.style.color = team === undefined ? '#fff' : TEAM_COLOR[team];
      clearTimeout(timer);
      timer = setTimeout(() => (banner.hidden = true), BANNER_MS);
    },
    aim(at) {
      const q = one('q');
      q.hidden = !at;
      if (at) {
        q.style.left = `${at[0] * 100}%`;
        q.style.top = `${at[1] * 100}%`;
      }
    },
    rover(what, v) {
      prompt.hidden = !what;
      set(act, what);
      meter.hidden = v === undefined;
      set(speed, `${v ?? 0}`);
      screen.classList.toggle('v', v !== undefined);
    },
    end(sum, left) {
      end.hidden = !sum;
      if (!sum) {
        built = undefined;
        return;
      }
      if (built !== sum) {
        built = sum;
        const [r, b] = sum.score;
        const win = r > b ? 0 : b > r ? 1 : -1;
        set(title, win < 0 ? 'DRAW' : `${TEAM_NAME[win].toUpperCase()} WINS`);
        title.style.color = win < 0 ? '#fff' : TEAM_COLOR[win];
        set(score, `${r} – ${b}`);
        // The most captures first, then returns.
        const rows = [...sum.players].sort(
          (x, y) => y.caps - x.caps || y.returns - x.returns || x.id - y.id,
        );
        table.replaceChildren();
        table.insertAdjacentHTML('beforeend', '<tr><th>Player<th>Captures<th>Returns</tr>');
        for (const p of rows) {
          const tr = table.insertRow();
          [p.name, p.caps, p.returns].forEach(v => (tr.insertCell().textContent = `${v}`));
          tr.style.color = TEAM_COLOR[p.team];
        }
      }
      set(next, `Next match in ${left}${soon && ` on ${soon}`}`);
    },
  };
};
