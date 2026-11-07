// The HUD, in the game's Shadow DOM: the title screen with the controls, the muted mark, the score
// and the clock with the state of both flags, the markers toward the flags, the banner of the last
// event and the end screen of a match.
import { HP_MAX, TEAM_COLOR, TEAM_NAME } from '../shared/constants';
import type { Result } from '../shared/protocol';
import { FLAG } from '../shared/types';
import type { Snapshot } from '../shared/types';
import type { Mark } from './marks';

export const HUD_CSS =
  `h5,aside,nav,output,section,em,u,ul,dl,s,mark,b{position:absolute;margin:0;padding:0;pointer-events:none;user-select:none;white-space:pre-line}` +
  `h5{top:8px;right:12px;font-size:12px}` +
  `u{inset:0;opacity:0;background:radial-gradient(ellipse at center,#0000 35%,#d10000dd 120%)}` +
  `nav{top:8px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:1fr auto 1fr;gap:2px 16px;align-items:center;text-align:center;font-size:13px}` +
  `nav span,nav time{font:900 clamp(16px,4.6vw,24px)/1 system-ui,sans-serif;letter-spacing:.03em;white-space:nowrap}nav time{min-width:4.2ch;font-variant-numeric:tabular-nums;font-size:clamp(14px,3.8vw,20px)}` +
  `nav small{font-size:clamp(10px,2.6vw,12px);white-space:nowrap;opacity:.95}nav small:first-of-type{text-align:right}nav small:last-of-type{text-align:left}` +
  `output{top:20%;left:50%;transform:translateX(-50%);padding:6px 18px;font:900 clamp(18px,3.4vw,30px)/1.1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;background:#000a;border-bottom:3px solid currentColor}` +
  `em{font-style:normal;font-size:13px;font-weight:800;line-height:1.1;text-align:center;transform:translate(-50%,-50%)}em span{display:block;font-size:20px;line-height:1}` +
  `section{inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:0 12px;text-align:center;background:#000c}` +
  `section h6{font:900 clamp(30px,9vw,72px)/1 system-ui,sans-serif;letter-spacing:.04em}section strong{font-size:34px}` +
  `section td:first-child{text-align:left;opacity:1}section td+td{text-align:center}section th{padding:2px 10px;font-size:12px;opacity:.7;font-weight:600}` +
  `aside{inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 12px;text-align:center;background:#000b}` +
  `h6{margin:0;font-size:inherit;text-shadow:none}` +
  `aside h6{font:900 clamp(36px,13vw,84px)/1 system-ui,sans-serif;letter-spacing:.04em;transform:skewX(-8deg);` +
  `background:linear-gradient(#fe6,#f92 45%,#d21);-webkit-background-clip:text;background-clip:text;color:transparent;` +
  `filter:drop-shadow(0 3px 0 #500) drop-shadow(0 0 14px #f604)}` +
  `ul{left:12px;bottom:30px;display:flex;gap:4px;list-style:none}li{width:16px;height:6px;background:#fff;box-shadow:0 0 0 1px #0008}` +
  `li.e{background:#0000;box-shadow:inset 0 0 0 1px #fffb,0 0 0 1px #0008}ul.low li{background:#f55}ul.low li.e{background:#0000}` +
  `dl{left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:center;gap:10px}dl svg{width:38px;fill:#fff;filter:drop-shadow(0 1px 1px #000)}` +
  `dl.k svg:first-child,dl:not(.k) svg+svg,dl.k data{display:none}dl.k svg{width:64px;fill:#8ef}` +
  `dl small{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);display:flex;gap:10px;font-size:11px;white-space:nowrap}dl kbd{font:inherit;opacity:.5}dl kbd.a{opacity:1}` +
  `@media(max-width:520px){dl{left:auto;right:12px;bottom:46px;transform:none}dl small{left:auto;right:0;transform:none}}` +
  `dl data{font:900 clamp(30px,5vw,46px)/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}dl.e data{color:#f66}` +
  `s{left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;` +
  `background:linear-gradient(45deg,#0000 44%,#fff 44% 56%,#0000 56%),linear-gradient(-45deg,#0000 44%,#fff 44% 56%,#0000 56%);` +
  `-webkit-mask:radial-gradient(#0000 6px,#000 7px);mask:radial-gradient(#0000 6px,#000 7px)}` +
  `mark{inset:0;z-index:1;padding-top:30vh;text-align:center;color:#ddd;` +
  `background:radial-gradient(ellipse at center,#6668 0%,#4a0c0ce8 130%);backdrop-filter:grayscale(1)}` +
  `mark::first-line{font:900 clamp(30px,8vw,64px)/1 system-ui,sans-serif;letter-spacing:.24em}` +
  `b{left:50%;top:64%;width:min(320px,70vw);height:12px;transform:translateX(-50%);border-radius:6px;` +
  `background:linear-gradient(90deg,#e23b3b,#fff3 50%,#8ef);box-shadow:0 0 0 1px #0008}` +
  `b::before{content:'CLICK!';position:absolute;bottom:150%;left:50%;transform:translateX(-50%);` +
  `font:900 clamp(18px,3.4vw,28px)/1 system-ui,sans-serif;letter-spacing:.1em;color:#fff;text-shadow:0 2px 0 #000a}` +
  `b i{position:absolute;top:-5px;width:6px;height:22px;margin-left:-3px;border-radius:3px;background:#fff;box-shadow:0 0 8px #8ef}` +
  `strong{font-size:22px}` +
  `table{border-collapse:collapse;font-size:16px}td{padding:2px 10px}td+td{text-align:left}td:first-child{text-align:right;opacity:.7}`;

/** What the end screen shows: the final captures and what each player did. */
export interface Summary {
  score: [number, number];
  players: Result[];
}

export interface Hud {
  /** The title screen with `status` under the controls, "Click to play" or why not; '' hides it. */
  title(status: string, name: string): void;
  /** Shows or hides the muted mark. */
  mute(on: boolean): void;
  /**
   * The score and the clock at the top, and under them the state of both flags: at home, taken by
   * a player (`who` gives his name) or dropped with the seconds left. Over, the clock reads END.
   */
  match(m: Pick<Snapshot, 'score' | 'clock' | 'over' | 'flags'>, who: (id: number) => string): void;
  /** The markers of this frame (see marks.ts), in the order given; the ones before are removed. */
  marks(list: Mark[]): void;
  /** The red vignette of a tackle, 0 (none) to 1 (full). */
  hurt(level: number): void;
  /**
   * The health as pips out of HP_MAX, and the weapon in hand: the ammo counter with the gun glyph,
   * or the katana glyph when `wield` (or when it is all there is). -1 ammo is no gun, `blade` is a
   * katana carried; both carried show the slots (1 gun, 2 katana) over the glyph, none hides it.
   */
  vitals(hp: number, ammo: number, blade?: boolean, wield?: boolean): void;
  /** A hit marker on the crosshair for a moment: a ball or a cut of the own player hit. */
  hit(): void;
  /**
   * A saber lock: the gauge of the tug of war under the crosshair, with `lead` the own side's, -1
   * (the foe wins) to 1 (he wins), and a call to click; undefined hides it.
   */
  duel(lead: number | undefined): void;
  /** The state of being down: `level` 0 (up) to 1 hides or greys the screen, `left` seconds till the respawn. */
  down(level: number, left: number): void;
  /** A line in the middle of the top of the screen in `team`'s colour, for a few seconds; a newer one replaces it. */
  banner(text: string, team?: number): void;
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
      `<tr><td>Move key twice<td>dash that way<tr><td>C<td>crouch, slide when fast<tr><td>Left click<td>fire, hold to charge<tr><td>1, 2, wheel<td>gun, katana` +
      `<tr><td>Katana + W<td>thrust<tr><td>Katana + A or D<td>cut across<tr><td>Katana alone<td>slash<tr><td>Double click<td>special: lunge, spin, leap<tr><td>Blades locked<td>click fast; step aside to break<tr><td>M<td>mute</table>` +
      `<span>Take the enemy flag to your own base while yours is home. Jump onto the armoury past your flag for the gun and the katana.</span>` +
      `<strong></strong></aside>` +
      `<u></u><h5 hidden>Muted (M)</h5>` +
      `<ul>${'<li></li>'.repeat(HP_MAX)}</ul>` +
      `<dl hidden><svg viewBox="0 0 38 22"><path d="M1 7c3-5 13-7 22-4l7 3 3 1v4l-6 1-4 2-1 1-3 6h-5l2-7-5-1c-6-1-12-3-10-6z"/></svg>` +
      `<svg viewBox="0 0 38 22"><path d="M12 14.4C19 11.6 29 6.4 37 1c-3.6 7-14.4 13.4-24.4 16zM1 20.2l7-6.6 1.6 1.8-7 6.6zM7.6 12.4l3.2-1.4 2 4.6-3.2 1.4z"/></svg>` +
      `<data></data><small hidden><kbd>1 gun</kbd><kbd>2 katana</kbd></small></dl>` +
      `<s hidden></s><mark hidden></mark><b hidden><i></i></b>` +
      `<nav hidden><span></span><time></time><span></span><small></small><small></small></nav>` +
      `<output hidden></output>` +
      `<section hidden><h6></h6><strong></strong><table></table><span></span></section>`,
  );
  const one = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const [muted, menu] = ['h5', 'aside'].map(t => one(t));
  const [name, status] = ['aside span', 'aside strong'].map(t => one(t));
  const set = (el: HTMLElement, text: string) => el.textContent != text && (el.textContent = text);
  const bar = one('nav');
  const [red, time, blue] = [...bar.querySelectorAll<HTMLElement>('span, time')];
  const [redFlag, blueFlag] = [...bar.querySelectorAll<HTMLElement>('small')];
  const pips = [...screen.querySelectorAll('li')];
  const [life, ammo, marker, fallen] = [one('ul'), one('dl'), one('s'), one('mark')];
  const [rope, knot] = [one('b'), one('b i')];
  const [count, slots] = [one('data'), one('dl small')];
  let ticker: ReturnType<typeof setTimeout> | undefined;
  const banner = one('output');
  const vignette = one('u');
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
      set(name, map);
      set(status, text);
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
    hurt(level) {
      const v = level < 0.01 ? '' : `${Math.min(1, level)}`;
      if (vignette.style.opacity != v) {
        vignette.style.opacity = v;
      }
    },
    vitals(hp, rounds, blade = false, wield = false) {
      pips.forEach((li, i) => li.classList.toggle('e', i >= hp));
      life.classList.toggle('low', hp <= 1);
      const gun = rounds >= 0;
      const k = blade && (wield || !gun);
      ammo.hidden = !gun && !blade;
      ammo.classList.toggle('k', k);
      ammo.classList.toggle('e', !k && !rounds);
      set(count, `${Math.max(rounds, 0)}`);
      slots.hidden = !(gun && blade);
      [...slots.children].forEach((kbd, i) => kbd.classList.toggle('a', !!i == k));
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
      set(banner, text);
      banner.style.color = team === undefined ? '#fff' : TEAM_COLOR[team];
      clearTimeout(timer);
      timer = setTimeout(() => (banner.hidden = true), BANNER_MS);
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
      set(next, `Next match in ${left}`);
    },
  };
};
