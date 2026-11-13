// The HUD, in the game's Shadow DOM: the title screen (a menu on the left, the Game panel with the characters,
// the mode and the map, the Controls panel), the muted mark, the score
// and the clock with the state of both flags, the markers toward the flags, the banner of the last
// event and the end screen of a match.
import {
  GUN_MAG,
  HP_MAX,
  RAIL_CAP,
  RAIL_MAX,
  NADE_MAX,
  RIFLE_CLIP,
  RULES,
  TEAM_COLOR,
  TEAM_NAME,
  VEHICLE,
} from '../shared/constants';
import type { Result } from '../shared/protocol';
import { free, gap2, nearby } from '../shared/rover';
import { SHIP } from '../shared/ship';
import { FLAG, MODE } from '../shared/types';
import type { Choice, PlayerState, Rover, Snapshot } from '../shared/types';
import { TONES } from './features';
import { ROLE } from '../shared/kit';
import { FH, FW, PALETTE, sprite } from './face';
import { VISOR } from './helmet';
import type { Mark } from './marks';

/**
 * The outline of the helmet's visor as the runners wear it (helmet.ts: VISOR and band()), seen from
 * inside, over the whole screen in a box of 100 by 100: its upper edge comes down to the middle (a
 * frown), its lower edge runs from the ends, half way up the sides, down toward the middle (a V),
 * where the guard comes up in a notch with a flat top. The notch is cut to the face of the HUD, which
 * sits in it: its flat top `NOTCH[2]` up from the bottom, `NOTCH[0]` and `NOTCH[1]` its half widths.
 */
// Softened (the user, 2026-11-12): a short flat top and long, gentle shoulders, so it reads as a swell.
const NOTCH = [5, 24, 21];
/** The exponent of the outline's round ends: 2 a half circle, more squarer. */
const ROUND = 3;
export const rim = (): [number, number][] => {
  // Low on the screen (the user, 2026-11-12: lower it, then lower still): its lower edge runs off the bottom beside the notch.
  const [x0, x1, y0, y1] = [4, 96, 12, 103];
  const h = y1 - y0;
  // The helmet's own proportions: the ends' rise over the visor's height, and its frown, softened.
  const rise = (VISOR.rise / (2 * VISOR.r[1])) * h;
  const frown = ((0.6 * VISOR.frown) / (2 * VISOR.r[1])) * h;
  const t = (x: number) => Math.abs(x - 50) / ((x1 - x0) / 2);
  // The frown's point is rounded over a few hundredths of the width.
  const top0 = (x: number) => y0 + frown * (1 - Math.sqrt(t(x) ** 2 + 0.002));
  const low0 = (x: number) => {
    const a = Math.abs(x - 50);
    const base = y1 - rise * t(x) ** 1.15;
    const up =
      a < NOTCH[0]
        ? 1
        : a < NOTCH[1]
          ? (1 + Math.cos((Math.PI * (a - NOTCH[0])) / (NOTCH[1] - NOTCH[0]))) / 2
          : 0;
    return base - up * Math.max(0, base - (100 - NOTCH[2]));
  };
  // Round ends, as the helmet's visor has (its superellipse, softer here): the two edges close on
  // each other toward the sides instead of meeting the side in corners (the user, 2026-11-12).
  const edge = (x: number, side: 1 | -1): [number, number] => {
    const [a, b] = [top0(x), low0(x)];
    const k = (1 - Math.min(t(x), 1) ** ROUND) ** (1 / ROUND);
    return [x, (a + b) / 2 + (side * k * (b - a)) / 2];
  };
  // Every half unit, and every tenth in the last four toward each end, where the outline turns.
  const xs: number[] = [];
  for (let x = x0; x < x1 + 1e-9; x += x < x0 + 4 - 1e-9 || x > x1 - 4 - 1e-9 ? 0.1 : 0.5) {
    xs.push(+x.toFixed(1));
  }
  return [...xs.map(x => edge(x, -1)), ...xs.reverse().map(x => edge(x, 1))];
};
/**
 * RIM as a background, with the sheen the rounded rim had: inside the outline only (it clips itself),
 * a soft pale glow, a shade along the lower edge and a heavier one under the brow, and no line (the
 * user, 2026-11-12: no white border). Widths in pixels whatever the screen's size; the glass itself is not filled.
 */
const RIM = (() => {
  const pts = rim().map(([x, y]) => `${x} ${+y.toFixed(2)}`);
  const d = `M${pts.join('L')}Z`;
  const half = pts.length / 2;
  const [brow, jaw] = [pts.slice(0, half), pts.slice(half)].map(l => `M${l.join('L')}`);
  const line = (path: string, colour: string, alpha: number, width: number) =>
    `<path d="${path}" fill="none" stroke="${colour}" stroke-opacity="${alpha}" stroke-width="${width}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><clipPath id="c"><path d="${d}"/></clipPath><g clip-path="url(#c)">` +
      line(brow, '#000', 0.16, 70) +
      line(brow, '#000', 0.2, 34) +
      line(jaw, '#000', 0.14, 30) +
      line(d, '#fff', 0.05, 34) +
      `</g></svg>`,
  )}")`;
})();

export const HUD_CSS =
  `h5,aside,nav,output,section,em,u,ul,dl,s,mark,ins,figure,del,menu,samp,cite,q,dfn,tt{position:absolute;margin:0;padding:0;pointer-events:none;user-select:none;white-space:pre-line}` +
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
  // The title screen: the paused view dimmed, and over it a panel that takes its own clicks (a click on
  // the view round it, or on the orange button, plays): the logo, the two tabs and the button on the
  // left, the panel of the chosen tab on the right. Under 760 px the left column is a bar on top.
  `aside{inset:0;z-index:1;display:flex;align-items:center;justify-content:center;background:#04070bb0;container-type:size;text-shadow:none}` +
  `aside main{pointer-events:auto;display:flex;width:min(1120px,100% - 32px);max-height:calc(100% - 32px);border:1px solid #2c3a48;border-radius:16px;overflow:hidden;` +
  `background:#0b1016e6;backdrop-filter:blur(14px);box-shadow:0 24px 80px #000b;color:#e9eef3;text-align:left;font-weight:500;line-height:1.45;white-space:normal;user-select:none}` +
  `aside header{flex:0 0 216px;display:flex;flex-direction:column;gap:6px;padding:26px 14px 16px;background:linear-gradient(#f7782a1c,#0000 42%),#0d141c;border-right:1px solid #26323e}` +
  `aside button{margin:0;padding:0;font:inherit;color:inherit;cursor:pointer;border:1px solid #0000;border-radius:10px;background:none}aside button:focus-visible{outline:2px solid #ffb347;outline-offset:2px}` +
  `aside [role=tab]{padding:11px 14px;border-left-width:3px;border-radius:4px 10px 10px 4px;text-align:left;font-size:15px;font-weight:700;color:#8d9aa7}aside [role=tab]:hover{color:#e9eef3;background:#ffffff0d}` +
  `aside [aria-selected=true],aside [aria-selected=true]:hover{color:#fff;background:#f7782a26;border-left-color:#f7782a}` +
  `aside header>:last-child{margin-top:auto;padding:14px 8px;border:0;background:linear-gradient(#ff9a4a,#e8590c);box-shadow:0 8px 24px -8px #e8590caa;text-align:center;text-transform:uppercase;letter-spacing:.08em}` +
  `aside header>:last-child:hover{filter:brightness(1.1)}aside header strong{font-size:15px;font-weight:800}` +
  `aside article{flex:1;min-width:0;min-height:0;overflow:auto;padding:24px 26px;pointer-events:auto}` +
  `aside article:first-of-type{display:grid;grid-template-columns:minmax(0,480px) minmax(0,1fr);gap:22px 30px;align-content:start}` +
  `aside h4,aside caption{margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;text-align:left;color:#8d9aa7}` +
  // Paused in a game (Escape): a small menu in the middle, and the panel shows only the part it opens, with a way back.
  `aside .pm{pointer-events:auto;display:grid;gap:10px;width:min(300px,100% - 32px);padding:24px 22px;border:1px solid #2c3a48;border-radius:16px;background:#0b1016e6;backdrop-filter:blur(14px);box-shadow:0 24px 80px #000b;color:#e9eef3;text-align:center;user-select:none}` +
  `aside .pm strong{margin-bottom:6px;font:900 18px/1 system-ui,sans-serif;letter-spacing:.2em;color:#ffb347}aside .pm button{padding:12px;border-color:#26323e;background:#121a23;font-size:15px;font-weight:800}aside .pm button:hover{border-color:#f7782a}` +
  `aside .pm button:first-of-type{border:0;background:linear-gradient(#ff9a4a,#e8590c);text-transform:uppercase;letter-spacing:.08em}` +
  `aside[data-v=pause] main,aside:not([data-v=pause]) .pm,aside[data-v=controls] [role=tab],aside[data-v=character] [role=tab],aside[data-v=character] blockquote,aside[data-v=character] address{display:none}` +
  `aside:not([data-v=controls]):not([data-v=character]) .bk{display:none}aside .bk{padding:11px 14px;text-align:left;font-size:15px;font-weight:700;color:#8d9aa7}aside .bk:hover{color:#fff}` +
  // The character: his live picture, beside it the body, the skin and the haircut, a row of chips
  // each; under them the class, a card each, the ones the map does not offer greyed out.
  `aside fieldset{display:grid;grid-template-columns:240px minmax(0,1fr);gap:10px 16px;align-content:start;margin:0;padding:0;border:0;min-width:0}aside fieldset h4{grid-column:1/-1;margin:0}` +
  `aside canvas{width:100%;height:auto;aspect-ratio:3/4;border:1px solid #26323e;border-radius:14px;cursor:inherit;background:radial-gradient(#26323e,#0d141c)}` +
  `aside .op{display:grid;gap:5px;align-content:start}aside fieldset small{margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8d9aa7}` +
  `aside [role=radiogroup]{display:flex;flex-wrap:wrap;gap:6px}aside [role=radiogroup][hidden]{display:none}` +
  `aside .hc [role=radio]{display:grid;justify-items:center;gap:3px;width:60px;padding:4px 3px 5px;font-size:11px}aside .hc canvas{width:52px;aspect-ratio:1;border-radius:8px}aside.hm .hc canvas{display:none}` +
  `aside [role=radio]{position:relative;padding:6px 11px;border-color:#26323e;background:#121a23;font-size:13px;font-weight:700;transition:border-color .15s,box-shadow .15s}` +
  `aside [role=radio]:hover{border-color:#3a4a5a}aside [role=radio]:disabled{opacity:.4;cursor:not-allowed}` +
  `aside [aria-checked=true],aside [aria-checked=true]:hover{border-color:#f7782a;box-shadow:0 0 0 1px #f7782a;color:#fff}` +
  `aside .sw [role=radio]{width:24px;height:24px;padding:0;border-radius:50%;border:2px solid #0b1016}aside .sw [aria-checked=true]{box-shadow:0 0 0 2px #f7782a}` +
  `aside .cl{grid-column:1/-1;display:grid;gap:6px}` +
  `aside .cl [role=radio]{display:grid;grid-template-columns:86px 1fr;gap:2px 10px;align-items:baseline;padding:9px 12px;border-radius:12px;text-align:left}aside .cl strong{grid-row:span 3;font-size:15px;font-weight:800}` +
  `aside .cl span{font-size:12px;font-weight:500;line-height:1.35;color:#b7c2cd}aside .cl .w{font-size:11px;font-weight:700;color:#ffb347}` +
  // A class's pros and cons, a + and a − before each.
  `aside .cl .p::before,aside .cl .c::before{display:inline-block;width:1.1em;font-weight:900}aside .cl .p::before{content:"+";color:#5fd38a}aside .cl .c::before{content:"−";color:#ff6b5e}` +
  // The mode: its badge, its name, and the rules a line each.
  `aside blockquote{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;align-items:center;align-content:start;margin:0}aside blockquote h4,aside blockquote span{grid-column:1/-1;margin:0}` +
  `aside abbr{display:grid;place-items:center;width:46px;height:46px;border-radius:11px;background:#f7782a26;color:#ffb347;font:900 15px/1 system-ui,sans-serif;letter-spacing:.06em}aside blockquote strong{font-size:18px;font-weight:800}` +
  `aside blockquote span{position:relative;padding-left:16px;font-size:13.5px;color:#b7c2cd}aside blockquote span::before{content:"";position:absolute;left:2px;top:.52em;width:6px;height:6px;border-radius:2px;background:#f7782a}` +
  `aside abbr+strong+span{margin-top:6px}` +
  // The map: its name, what kind of place it is, its story, and the host's buttons.
  `aside address{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 30px;padding-top:20px;border-top:1px solid #26323e;font-style:normal}aside address>*{grid-column:1}aside address h4{margin:0}aside h3{margin:0;font:900 26px/1.1 system-ui,sans-serif;letter-spacing:.02em}` +
  `aside address small{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ffb347}aside address>span{font-size:13.5px;color:#b7c2cd}` +
  `` +
  // The controls: a table a group, in two columns; a key is a cap.
  `aside article+article{columns:2;column-gap:34px}aside table{width:100%;margin:0 0 18px;break-inside:avoid;font-size:13.5px}aside caption{margin:0 0 6px;padding-bottom:6px;border-bottom:1px solid #26323e}` +
  `aside td{padding:4px 0;vertical-align:top}aside td:first-child{width:46%;padding-right:12px;text-align:right;white-space:nowrap;opacity:1;color:#8d9aa7}aside td+td{color:#dbe3ea}` +
  `aside kbd{display:inline-block;min-width:24px;padding:2px 7px;border:1px solid #3a4a5a;border-bottom-width:2px;border-radius:6px;background:#18222c;color:#fff;font:700 12px/1.3 system-ui,sans-serif;text-align:center}` +
  `aside article[hidden]{display:none}` +
  `@container (max-width:980px){aside address{grid-template-columns:1fr}}` +
  `@container (max-width:760px){aside main{flex-direction:column}aside header{flex:none;flex-flow:row wrap;align-items:center;padding:10px 12px;border-right:0;border-bottom:1px solid #26323e}` +
  `aside header h6{margin:0 8px 0 4px;font-size:22px}aside [role=tab]{padding:8px 12px;border-left-width:1px;border-radius:10px}aside header>:last-child{margin:0 0 0 auto;padding:10px 16px}` +
  `aside article{padding:16px}aside article:first-of-type,aside address{grid-template-columns:1fr}aside fieldset{max-width:480px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}aside article+article{columns:1}aside td:first-child{white-space:normal}}` +
  `h6{margin:0;font-size:inherit;text-shadow:none}` +
  `aside h6{align-self:center;margin-bottom:20px;font:900 36px/1 system-ui,sans-serif;letter-spacing:.04em;transform:skewX(-8deg);` +
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
  // The rim of a helmet round the view: the dark of the shell at the corners, as it always was, and the outline of the
  // helmet's own visor (RIM, below) as a pale line over a clear view. Drawn before the face, the health and the counts.
  `del{inset:0;background:radial-gradient(ellipse 74% 80% at 50% 54%,#0000 60%,#000d 100%)}` +
  `del::before{content:"";position:absolute;inset:0;background:${RIM} 0 0/100% 100% no-repeat}` +
  `strong{font-size:22px}` +
  `table{border-collapse:collapse;font-size:16px}td{padding:2px 10px}td+td{text-align:left}td:first-child{text-align:right;opacity:.7}` +
  // The rover: the key to get in or out, over the face, and the speed where the gun's count is; at the wheel the gun, the crosshair and the visor's rim go.
  `samp{left:50%;bottom:128px;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#0008;font:inherit;font-size:15px;white-space:nowrap}` +
  `samp var{display:inline-block;margin-right:8px;padding:1px 7px;border:1px solid #fffb;border-radius:4px;font-style:normal;font-weight:900}` +
  `q{width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid #5f8;border-radius:50%;box-shadow:0 0 6px #3f6,inset 0 0 4px #3f6;background:radial-gradient(#afc 0 1.5px,#0000 2px)}q::before,q::after{content:none}` +
  `cite{right:12px;bottom:10px;font:900 clamp(30px,5vw,46px)/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}cite small{margin-left:6px;font-size:14px}` +
  `div.v>i,.v dl,.v del{display:none}` +
  // A vehicle's health: ten pips over the speed for who is in it, and a small bar over one near by.
  `tt{right:12px;bottom:62px;width:148px;height:10px;background:linear-gradient(90deg,var(--c,#5fd28a) var(--a,100%),#fff3 0);-webkit-mask:repeating-linear-gradient(90deg,#000 0 13px,#0000 13px 15px);mask:repeating-linear-gradient(90deg,#000 0 13px,#0000 13px 15px);filter:drop-shadow(0 1px 1px #000)}` +
  `tt+tt{right:auto;bottom:auto;transform:translate(-50%,-50%) scale(.5)}` +
  // The ship: its missiles and its height, bottom left; the limit's warning, flashing, under the banner.
  `dfn{left:12px;bottom:10px;padding:7px 14px;border-radius:6px;font:800 15px/1 system-ui,sans-serif;font-style:normal;font-variant-numeric:tabular-nums;letter-spacing:.04em;background:#000a}` +
  `dfn+dfn{left:50%;top:30%;bottom:auto;transform:translateX(-50%);padding:8px 22px;font-size:clamp(14px,2.6vw,20px);background:#a10e0ecc;animation:blink .5s steps(2) infinite alternate}` +
  `@keyframes blink{to{opacity:.35}}`;

/** The menu of a game paused by Escape (the user, 2026-11-12): play on, then the two parts of the title screen it opens, then leave. */
export const PAUSE = ['Resume', 'Controls', 'Character', 'Quit'];

/** The tabs of the title screen's menu, the first one shown first. */
export const TABS = ['Game', 'Controls'];

/** The characters' first names (the user, 2026-11-11: names, not "man" and "woman"), in BODY's order, and the size of the character's picture in pixels. */
export const CAST = ['Kai', 'Nova'];
export const SHOT = [480, 640];
/** The size of a haircut's picture, pixels. */
export const HEAD_PX = 112;

/** The haircuts of each body, in HAIRS_N's order: the man's by length (LENGTHS, soldier.ts), the woman's STYLE (hair.ts). */
export const HAIR_NAMES = [
  ['Shaved', 'Buzz', 'Short', 'Full'],
  ['Ponytail', 'Bob', 'Bun', 'Braid', 'Undercut'],
];

/** The classes, in ROLE's order (kit.ts): the name, what it is good at, what it pays for it, and where it plays. */
export const ROLES: [name: string, pros: string, cons: string, where: string][] = [
  [
    'Marine',
    'Full ammo, magazines, rate of fire and damage with every gun.',
    'The standard moves: one dash, normal speed and jumps.',
    'City maps',
  ],
  [
    'Ninja',
    'Runs 20 % faster, jumps much higher, wall-runs twice as long, chains 3 dashes; katana and fists twice as fast.',
    'Guns: half the ammo, magazine, rate of fire and damage, and slowed hard while one is in hand.',
    'City maps',
  ],
  [
    'Astronaut',
    'The marine’s full firepower, in a suit made for the moon’s low gravity.',
    'The standard moves; plays nowhere but the moon.',
    'Moon only',
  ],
];

/** A skin tone (TONES, linear) as a CSS colour. */
const swatch = (t: number[]) =>
  `rgb(${t.map(v => Math.round(255 * Math.min(1, v) ** (1 / 2.2))).join()})`;

/** Capture the flag in a few lines, with the room's default rules. */
export const GOAL = [
  'Two teams, two flags. Take the enemy flag from its base and run it home.',
  'A capture counts only while your own flag is at home.',
  `First team to ${RULES.scoreLimit} captures wins, or the one ahead after ${RULES.timeLimit / 60} minutes.`,
  'The gun, the katana, the rail gun and the rifle wait on the armoury past your flag.',
];

/**
 * The controls of the title screen, a group each: the caps of a row split by `|` (a `+`, `/`, `or`
 * or `twice` between them stays text), what they do, and the KeyboardEvent.codes the row tells,
 * which together must be all of input.ts's CODES.
 */
export const CONTROLS: [group: string, rows: [keys: string, does: string, codes?: string][]][] = [
  [
    'Movement',
    [
      ['Mouse', 'look'],
      [
        'W|A|S|D|or|Arrows',
        'move (ZQSD on AZERTY)',
        'KeyW KeyA KeyS KeyD ArrowUp ArrowDown ArrowLeft ArrowRight',
      ],
      ['Shift', 'sprint', 'ShiftLeft ShiftRight'],
      ['Space', 'jump, again in the air', 'Space'],
      ['Q', 'dash toward the keys held (A on AZERTY)', 'KeyQ'],
      ['Move key|twice', 'dash that way'],
      ['C', 'crouch, slide when fast', 'KeyC'],
    ],
  ],
  [
    'Combat',
    [
      ['Left click', 'fire, hold to charge; bare hands: punch'],
      ['R', 'swap the battery', 'KeyR'],
      ['1|2|3|4', 'gun, katana, rail gun, laser rifle', 'Digit1 Digit2 Digit3 Digit4'],
      ['Wheel', 'next weapon'],
      ['G', 'laser rifle: a grenade from its launcher', 'KeyG'],
    ],
  ],
  [
    'Katana',
    [
      ['Left click', 'slash'],
      ['W|+|Left click', 'thrust'],
      ['A|or|D|+|Left click', 'cut across'],
      ['Double click', 'special: lunge, energy arc, leap'],
      ['Blades locked', 'click fast; step aside to break'],
    ],
  ],
  [
    'Rover',
    [
      ['E', 'get in, get out', 'KeyE'],
      ['W|S', 'drive toward the look'],
      ['Space', 'handbrake'],
      ['Left click', 'lasers'],
    ],
  ],
  [
    'Ship',
    [
      ['E', 'board, get out'],
      ['Mouse', 'aim the nose'],
      ['W|S', 'thrust, brake'],
      ['A|D', 'slide'],
      ['Space|C', 'climb, sink'],
      ['Shift', 'boost'],
      ['Left click', 'lasers'],
      ['G', 'missiles'],
    ],
  ],
  [
    'Game',
    [
      ['M', 'mute', 'KeyM'],
      ['Esc', 'this screen'],
    ],
  ],
];

/** Seconds the way out is shown after sitting down. */
export const OUT_HINT = 4;

/**
 * What E does for a player on foot: 'drive' near a rover whose wheel is free, 'ride' when only the
 * seat beside it is, or when he carries a flag (a carrier does not drive), 'fly' near a ship that
 * is there and has no pilot (a carrier does not fly), '' with no free seat in reach, seated or
 * down. The nearest vehicle with a seat for him counts, as the room judges it (nearby(), free()).
 */
export const boarding = (
  me: Pick<PlayerState, 'x' | 'y' | 'z' | 'mode' | 'down'> | undefined,
  rovers: readonly Rover[],
  carrying = false,
): '' | 'drive' | 'ride' | 'fly' => {
  let [best, what]: [number, '' | 'drive' | 'ride' | 'fly'] = [Infinity, ''];
  if (!me || me.down || me.mode === MODE.RIDE) {
    return what;
  }
  for (const r of rovers) {
    const s = free(r, carrying);
    const d = gap2(r, me);
    if (s >= 0 && nearby(r, me) && d <= best) {
      [best, what] = [d, r.ship ? 'fly' : s ? 'ride' : 'drive'];
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
  /**
   * The title screen with `status` on its button, "Click to play" or why not; '' hides it. `name`,
   * `tag` and `lore` are the map's (WorldDef).
   */
  title(status: string, name: string, tag?: string, lore?: string): void;
  /**
   * Whether the player has been in the game: then the title screen opens on the pause menu (PAUSE)
   * rather than the whole panel, until he plays again.
   */
  paused(on: boolean): void;
  /**
   * The character on the title screen: `pick` is told the whole choice (the body, the skin, the
   * haircut, the class) each time the player changes a part of it. Returns the canvas of his live
   * picture (SHOT pixels).
   */
  cast(pick: (c: Choice & { body: number }) => void): HTMLCanvasElement;
  /** The pictures of the haircuts on offer, in their order (HEAD_PX square): the own head with each. */
  heads(): HTMLCanvasElement[];
  /** The own player's magazines, as his class holds them (Kit's mag, cap, clip): the spare ones counted by them. */
  magazines(sizes: number[]): void;
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
   * laser rifle's rounds (-1 none), shown with the glyph in red when `rifled` (slot 4), with the
   * `nades` left in its launcher as dots after the count, hollow for the ones spent.
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
    nades?: number,
  ): void;
  /** A hit marker on the crosshair for a moment: a ball or a cut of the own player hit. */
  hit(): void;
  /** The face over the health, frame `n` of face.ts (-1 hides it). */
  face(n: number): void;
  /**
   * The own player's character (BODY): the face is hers when she is the woman. `c` is what the
   * roster says he picked, shown chosen on the title screen, and `roles` the classes the map offers
   * (ROLE): the others are greyed out.
   */
  wear(body: number, c?: Choice, roles?: number[]): void;
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
  /** The ship flown: its missiles and height, and how near its limits are (limits(), ship.ts); undefined hides it. */
  ship(s?: ShipPanel): void;
  /**
   * A vehicle's health, of VEHICLE.HP: `own` in pips for who is seated in it (undefined on foot),
   * and `near` as a small bar over a vehicle close by, `at` on screen in [0, 1] from the top left.
   */
  hull(own?: number, near?: { hp: number; at: [number, number] }): void;
  /** The end screen with the result and each player's captures and returns, `next` seconds before the next match; undefined hides it. */
  end(sum: Summary | undefined, next: number): void;
}

/** What the ship's panel shows. */
export interface ShipPanel {
  nades: number;
  /** Metres over the crater's floor. */
  alt: number;
  /** limits(): the ceiling's and the edge's nearness, 1 at the limit. */
  up: number;
  out: number;
}

/** The warning of the nearest limit once one is within its last half of WARN, or ''. */
export const warning = (up: number, out: number): string =>
  Math.max(up, out) < 0.5 ? '' : up >= out ? 'CEILING · DESCEND' : 'CRATER EDGE · TURN BACK';

/** Milliseconds a banner stays, and a hit marker. */
export const BANNER_MS = 2800;
export const HIT_MS = 140;

/** m:ss. */
export const clock = (s: number): string => `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;

/**
 * Appends the HUD to `screen`, whose stylesheet has HUD_CSS. `play` is the title screen's button:
 * the click that starts the game (the panel takes its other clicks, the view round it plays too).
 */
export const createHud = (screen: HTMLElement, play = () => {}, quit = () => {}): Hud => {
  screen.insertAdjacentHTML(
    'beforeend',
    `<aside hidden><span class="pm"><strong>PAUSED</strong>${PAUSE.map(t => `<button>${t}</button>`).join('')}</span>` +
      `<main><header><h6>TINY FPS</h6>` +
      TABS.map(
        (t, i) => `<button role="tab" aria-selected="${!i}" tabindex="${i && -1}">${t}</button>`,
      ).join('') +
      `<button class="bk">← Back</button><button><strong></strong></button></header>` +
      `<article role="tabpanel"><fieldset><h4>Character</h4><canvas width="${SHOT[0]}" height="${SHOT[1]}"></canvas><span class="op">` +
      `<span role="radiogroup" aria-label="Body">${CAST.map(c => `<button role="radio">${c}</button>`).join('')}</span>` +
      `<small>Skin</small><span role="radiogroup" aria-label="Skin" class="sw">${TONES.map(
        (t, i) =>
          `<button role="radio" aria-label="Skin ${i + 1}" style="background:${swatch(t)}"></button>`,
      ).join('')}</span>` +
      `<small>Hair</small><span role="radiogroup" aria-label="Hair" class="hc"></span></span>` +
      `<h4>Class</h4><span role="radiogroup" aria-label="Class" class="cl">${ROLES.map(
        ([n, pros, cons, where]) =>
          `<button role="radio"><strong>${n}</strong><span class="p">${pros}</span><span class="c">${cons}</span><span class="w">${where}</span></button>`,
      ).join('')}</span>` +
      `</fieldset><blockquote><h4>Game mode</h4><abbr>CTF</abbr><strong>Capture the flag</strong>${GOAL.map(l => `<span>${l}</span>`).join('')}</blockquote>` +
      `<address><h4>Map</h4><h3></h3><small></small><span></span></address></article>` +
      `<article role="tabpanel" hidden>${CONTROLS.map(
        ([group, rows]) =>
          `<table><caption>${group}</caption>${rows
            .map(
              ([keys, does]) =>
                `<tr><td>${keys
                  .split('|')
                  .map(k => (/^(\+|\/|or|twice)$/.test(k) ? k : `<kbd>${k}</kbd>`))
                  .join(' ')}<td>${does}`,
            )
            .join('')}</table>`,
      ).join('')}</article></main></aside>` +
      `<del hidden></del><u></u><h5 hidden>Muted (M)</h5>` +
      `<ul>${'<li></li>'.repeat(HP_MAX)}</ul><figure hidden><canvas width="${FW}" height="${FH}"></canvas></figure>` +
      `<dl hidden><svg viewBox="0 0 38 22"><path d="M1 7c3-5 13-7 22-4l7 3 3 1v4l-6 1-4 2-1 1-3 6h-5l2-7-5-1c-6-1-12-3-10-6z"/></svg>` +
      `<svg viewBox="0 0 38 22"><path d="M12 14.4C19 11.6 29 6.4 37 1c-3.6 7-14.4 13.4-24.4 16zM1 20.2l7-6.6 1.6 1.8-7 6.6zM7.6 12.4l3.2-1.4 2 4.6-3.2 1.4z"/></svg>` +
      `<data></data><span></span><small hidden><kbd>1 gun</kbd><kbd>2 katana</kbd><kbd>3 rail</kbd><kbd>4 rifle</kbd></small></dl>` +
      `<s hidden></s><mark hidden></mark><ins hidden><i></i></ins>` +
      `<nav hidden><span></span><time></time><span></span><small></small><small></small></nav>` +
      `<output hidden></output><samp hidden><var>E</var><span></span></samp><cite hidden><span></span><small>km/h</small></cite><q hidden></q><dfn hidden></dfn><dfn hidden></dfn><tt hidden></tt><tt hidden></tt>` +
      `<section hidden><h6></h6><strong></strong><table></table><span></span></section>`,
  );
  const one = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const [muted, menu] = ['h5', 'aside'].map(t => one(t));
  let mags = [GUN_MAG, RAIL_CAP, RIFLE_CLIP];
  const [name, tag, lore, status] = ['h3', 'address small', 'address>span', 'header strong'].map(
    t => one(`aside ${t}`),
  );
  const all = (sel: string) => [...menu.querySelectorAll<HTMLElement>(sel)];
  const [tabs, panels, groups] = ['[role=tab]', 'article', '[role=radiogroup]'].map(all);
  /** The one of `list` that is on, by its ARIA state `attr`: it alone is in the Tab order, the arrows go to the others. */
  const turn = (list: HTMLElement[], attr: string, on: number) =>
    list.forEach((el, i) => {
      el.setAttribute(attr, `${i == on}`);
      el.tabIndex = i == on ? 0 : -1;
    });
  /** The arrows over `list` go to the next one or the one before, round, which `go` then takes. */
  const arrows = (list: HTMLElement[], go: (i: number) => void) =>
    list.forEach((el, i) => {
      el.onclick = () => go(i);
      el.onkeydown = e => {
        const d = +/^Arrow(Down|Right)/.test(e.code) - +/^Arrow(Up|Left)/.test(e.code);
        if (d) {
          e.preventDefault();
          const to = (i + d + list.length) % list.length;
          go(to);
          list[to].focus();
        }
      };
    });
  arrows(tabs, i => {
    turn(tabs, 'aria-selected', i);
    panels.forEach((p, k) => (p.hidden = k != i));
  });
  one('header>:last-child').onclick = play;
  // The pause menu: what it shows (data-v): the menu, or the part of the panel it opened.
  let started = false;
  const view = (v: string) => {
    menu.dataset.v = v;
    tabs[+(v == 'controls')].click();
  };
  const [resume, controls, character, leave] = [
    ...menu.querySelectorAll<HTMLElement>('.pm button'),
  ];
  resume.onclick = play;
  controls.onclick = () => view('controls');
  character.onclick = () => view('character');
  leave.onclick = quit;
  one('.bk').onclick = () => view('pause');
  // The character's choice, in the order of its groups: body, skin, haircut, class.
  const KEYS = ['body', 'tone', 'hair', 'role'] as const;
  let picked: Choice & { body: number } = { body: 0 };
  let chose = (_: Choice & { body: number }) => {};
  const radios = (k: number) => [...groups[k].children] as HTMLButtonElement[];
  /** The woman's haircuts or the man's. */
  const cuts = (body: number) =>
    groups[2].replaceChildren(
      ...HAIR_NAMES[body].map(n => {
        const b = document.createElement('button');
        b.setAttribute('role', 'radio');
        b.innerHTML = `<canvas width="${HEAD_PX}" height="${HEAD_PX}"></canvas>${n}`;
        return b;
      }),
    );
  /** Each group's pick lit and in the Tab order; with none, its first is. The ninja's hood hides the hair: no haircut to pick. */
  const lit = () => {
    KEYS.forEach((k, g) => {
      const on = picked[k] ?? -1;
      turn(radios(g), 'aria-checked', on);
      radios(g)[0].tabIndex = on < 0 ? 0 : radios(g)[0].tabIndex;
    });
    const hooded = picked.role == ROLE.NINJA;
    groups[2].hidden = hooded;
    (groups[2].previousElementSibling as HTMLElement).hidden = hooded;
  };
  const choose = (g: number, i: number) => {
    const b = radios(g)[i];
    if (!b || b.disabled || b.getAttribute('aria-checked') == 'true') {
      return;
    }
    picked = { ...picked, [KEYS[g]]: i };
    if (g == 0) {
      // Another body: its own haircuts, his id's until he picks one.
      delete picked.hair;
      cuts(i);
    }
    lit();
    chose(picked);
  };
  groups.forEach((group, g) => {
    group.onclick = e => {
      const b = (e.target as Element).closest('[role=radio]');
      choose(g, radios(g).indexOf(b as HTMLButtonElement));
    };
    group.onkeydown = e => {
      const d = +/^Arrow(Down|Right)/.test(e.code) - +/^Arrow(Up|Left)/.test(e.code);
      const all = radios(g);
      const at = all.indexOf(e.target as HTMLButtonElement);
      if (d && at >= 0) {
        e.preventDefault();
        // The next one the map offers, round.
        let to = at;
        do {
          to = (to + d + all.length) % all.length;
        } while (all[to].disabled && to != at);
        choose(g, to);
        all[to].focus();
      }
    };
  });
  cuts(0);
  lit();
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
  /** 1 when the own player is the woman: her face (sprite()). */
  let fem = 0;
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
    title(text, map, kind = '', story = '') {
      if (!text && !menu.hidden) {
        // A tab or a card that kept the focus would take the game's Space and Enter.
        menu.querySelector<HTMLElement>(':focus')?.blur();
      }
      if (menu.hidden && text && started) {
        view('pause');
      }
      menu.hidden = !text;
      set(name, map);
      set(tag, kind);
      set(lore, story);
      set(status, text);
    },
    paused(on) {
      if (on != started && !on) {
        view('');
      }
      started = on;
    },
    heads: () => [...groups[2].querySelectorAll('canvas')],
    cast(pick) {
      chose = pick;
      return groups[0].closest('fieldset')!.querySelector('canvas')!;
    },
    magazines: sizes => (mags = sizes),
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
    visor: on => {
      rim.hidden = !on;
      // Under a space helmet no haircut shows: no pictures of them.
      menu.classList.toggle('hm', on);
    },
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
      nades = 0,
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
      const size = rifled ? mags[2] : railed ? (mags[1] * 99) / RAIL_MAX : mags[0];
      const dots = rifled
        ? `  ${'●'.repeat(nades)}${'○'.repeat(Math.max(NADE_MAX - nades, 0))}`
        : '';
      set(spare, `${'▮'.repeat(rest / size)}${rest % size ? '▯' : ''}\n${rest}${dots}`);
      slots.hidden = have.filter(Boolean).length < 2;
      [...slots.children].forEach((kbd, i) => {
        (kbd as HTMLElement).hidden = !have[i];
        kbd.classList.toggle('a', i == (k ? 1 : rifled ? 3 : railed ? 2 : 0));
      });
    },
    wear(body, c = {}, roles) {
      if (+!!body != picked.body) {
        cuts(+!!body);
      }
      picked = { ...c, body: +!!body };
      radios(3).forEach((b, i) => (b.disabled = !!roles && !roles.includes(i)));
      lit();
      if (+!!body != fem) {
        [fem, shown] = [+!!body, -1];
      }
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
        sprite(n, fem).forEach((c, i) => (px[i] = PALETTE[c]));
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
    ship(s) {
      const [panel, warn] = screen.querySelectorAll<HTMLElement>('dfn');
      panel.hidden = !s;
      const w = s ? warning(s.up, s.out) : '';
      warn.hidden = !w;
      set(warn, w);
      if (s) {
        set(panel, `MISSILES ${s.nades}/${SHIP.MISSILES}  ·  ALT ${Math.round(s.alt)} m`);
      }
    },
    hull(own, near) {
      const bars = screen.querySelectorAll<HTMLElement>('tt');
      [own, near?.hp].forEach((hp, i) => {
        const bar = bars[i];
        bar.hidden = hp === undefined;
        if (hp !== undefined) {
          // Green, amber from 6 down, red from 3.
          bar.style.setProperty('--a', `${Math.max(0, Math.min(1, hp / VEHICLE.HP)) * 100}%`);
          bar.style.setProperty('--c', hp > 6 ? '#5fd28a' : hp > 3 ? '#f0b429' : '#e5484d');
        }
      });
      if (near) {
        bars[1].style.left = `${near.at[0] * 100}%`;
        bars[1].style.top = `${near.at[1] * 100}%`;
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
      set(next, `Next match in ${left}`);
    },
  };
};
