import { VISOR } from '../helmet';

/**
 * The outline of the helmet's visor as the runners wear it (helmet.ts: VISOR and band()), seen from
 * inside, over the whole screen in a box of 100 by 100: its upper edge comes down to the middle (a
 * frown), its lower edge runs from the ends, half way up the sides, down toward the middle (a V),
 * where the guard comes up in a notch with a flat top. The notch is cut to the face of the HUD, which
 * sits in it: its flat top `NOTCH[2]` up from the bottom, `NOTCH[0]` and `NOTCH[1]` its half widths.
 */
// Softened (the user, 2026-11-12): a short flat top and long, gentle shoulders, so it reads as a swell.
// Its top lowered to just over the face (the user, 2026-11-14).
const NOTCH = [5, 24, 18.8];
/** The exponent of the outline's round ends: 2 a half circle, more squarer. */
const ROUND = 3;
export const rim = (): [number, number][] => {
  // Low on the screen (the user, 2026-11-12: lower it, then lower still): its lower edge runs off the bottom beside the notch.
  // Wide, so the frame round it is thin (the user, 2026-11-14).
  const [x0, x1, y0, y1] = [1, 99, 6, 103];
  const h = y1 - y0;
  // The helmet's own proportions: the ends' rise over the visor's height, and its frown, softened.
  // Its ends rise less than the helmet's, so the frame under it is thin (the user, 2026-11-14).
  const rise = 0.4 * (VISOR.rise / (2 * VISOR.r[1])) * h;
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
 * BLUR, where the view is blurred: outside the outline, and a soft band inside it, so the view goes
 * out of focus toward the glass's edge (the user, 2026-11-13; stronger and wider, 2026-11-14, then a little less).
 */
const [RIM, BLUR] = (() => {
  const pts = rim().map(([x, y]) => `${x} ${+y.toFixed(2)}`);
  const d = `M${pts.join('L')}Z`;
  const half = pts.length / 2;
  const [brow, jaw] = [pts.slice(0, half), pts.slice(half)].map(l => `M${l.join('L')}`);
  const line = (path: string, colour: string, alpha: number, width: number) =>
    `<path d="${path}" fill="none" stroke="${colour}" stroke-opacity="${alpha}" stroke-width="${width}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  const svg = (body: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${body}</svg>`,
    )}")`;
  return [
    svg(
      `<clipPath id="c"><path d="${d}"/></clipPath><g clip-path="url(#c)">` +
        line(brow, '#000', 0.16, 70) +
        line(brow, '#000', 0.2, 34) +
        line(jaw, '#000', 0.14, 30) +
        line(d, '#fff', 0.05, 34) +
        `</g>`,
    ),
    svg(
      `<filter id="f"><feGaussianBlur stdDeviation="4"/></filter><path d="M-20-20H120V120H-20Z${d}" fill-rule="evenodd" stroke="#000" stroke-width="13" filter="url(#f)"/>`,
    ),
  ];
})();

export const HUD_CSS =
  `h5,aside,nav,var,output,section,em,u,sup,ul,dl,s,mark,ins,figure,del,menu,label,samp,cite,q,dfn,tt,h1,h2,ol,i{position:absolute;margin:0;padding:0;pointer-events:none;user-select:none;white-space:pre-line}` +
  `h5{top:8px;right:12px;font-size:12px}` +
  // The red halo of a hit: a glow in from every edge over a dark red rim.
  `u{inset:0;opacity:0;box-shadow:inset 0 0 16vmin 3vmin #e00c;background:radial-gradient(ellipse at center,#0000 55%,#a008 100%)}` +
  // The orbital strike's light: white from above, red hot round it, growing until the view is white.
  `sup{inset:0;z-index:1;opacity:0;--w:0%;background:radial-gradient(circle at 50% 0,#fff var(--w),#ffd2bc calc(var(--w) + 30%),#ff3c1e00 calc(var(--w) + 80%))}` +
  `nav{top:8px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:1fr auto 1fr;gap:2px 16px;align-items:center;text-align:center;font-size:13px}` +
  `nav span,nav time{font:900 clamp(16px,4.6vw,24px)/1 system-ui,sans-serif;letter-spacing:.03em;white-space:nowrap}nav time{min-width:4.2ch;font-variant-numeric:tabular-nums;font-size:clamp(14px,3.8vw,20px)}` +
  `nav small{font-size:clamp(10px,2.6vw,12px);white-space:nowrap;opacity:.95}nav small:first-of-type{text-align:right}nav small:last-of-type{text-align:left}` +
  // The orbital station's mission under the score, in amber; urgent, red and blinking.
  `var{top:66px;left:50%;transform:translateX(-50%);padding:5px 14px;border:1px solid #ffb34780;border-radius:4px;background:#000b;color:#ffb347;font:800 normal clamp(11px,2.6vw,14px)/1.2 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}` +
  `var.hot{color:#ff5a3c;border-color:#ff5a3c;animation:hot 1s steps(2) infinite}@keyframes hot{50%{border-color:#ff5a3c00}}` +
  `i.hv{pointer-events:none;top:48px;width:auto;height:auto;margin:0;white-space:nowrap;left:50%;transform:translateX(-50%);padding:4px 10px;border:1px solid #8fffc080;border-radius:4px;background:#00130dcc;color:#a4ffcf;font:800 11px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}` +
  // The Hunter's V: a key cap before the view's name; blinking while the view is the plain one, to
  // tell the player the view can change (the user, 2026-11-23).
  `i.hv kbd{display:inline-block;font:inherit;margin-right:7px;padding:2px 5px;border:1px solid #a4ffcf;border-radius:3px;color:#00130d;background:#a4ffcf}i.hv.idle{animation:blink .5s steps(2) infinite alternate}` +
  // The Hunter's shoulder cannon: Predator-like red brackets close around one target, then lock.
  `i.hl{z-index:2;width:0;height:0;color:#ff3029;filter:drop-shadow(0 0 4px #f21);transition:filter .12s}` +
  // The three sides of a triangle round the foe (the user, 2026-11-23), each a bar 14 px from his
  // centre, 3 px thick and mitred at 60 degrees so the three meet in clean corners: 2 × 17 × tan 60
  // = 58.9 px outside, 5.2 px shorter at each end inside. hunterAim() turns and spreads them.
  `i.hl b{position:absolute;left:-29.45px;top:-17px;width:58.9px;height:3px;transform-origin:50% 17px;background:currentColor;clip-path:polygon(0 0,100% 0,calc(100% - 5.2px) 100%,5.2px 100%);opacity:.75}` +
  `i.hl small{position:absolute;top:44px;left:0;transform:translateX(-50%);padding:3px 6px;background:#200d;color:currentColor;font:900 9px/1 system-ui,sans-serif;letter-spacing:.16em;white-space:nowrap}` +
  `i.hl.locked{filter:drop-shadow(0 0 8px #f22);animation:hl-pulse .7s steps(2,end) infinite}i.hl.locked b{opacity:1}@keyframes hl-pulse{50%{opacity:.7}}` +
  // The banner of an event (the user, 2026-11-09: no underline, a nicer design): heavy italic in the
  // team's colour, glowing, on a dark band fading out at both ends, popping in.
  `output{top:18%;left:50%;transform:translateX(-50%);padding:12px 64px;font:900 italic clamp(20px,4.4vw,40px)/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;` +
  `background:linear-gradient(90deg,#0000,#000c 24%,#000c 76%,#0000);text-shadow:0 0 18px currentColor,0 0 2px currentColor,0 3px 0 #000;animation:pop .4s cubic-bezier(.2,1.5,.4,1)}` +
  `@keyframes pop{from{opacity:0;transform:translateX(-50%) scale(1.5)}}` +
  // An own frag under the banner: the name of who went down, and the announcer's award in gold under it.
  `h2{left:50%;top:29%;transform:translateX(-50%);display:grid;justify-items:center;gap:6px;text-align:center;white-space:nowrap;animation:pop .3s cubic-bezier(.2,1.5,.4,1)}` +
  `h2 span{font:900 italic clamp(16px,3vw,26px)/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase}` +
  `h2 small{font:900 italic clamp(22px,5vw,46px)/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ffd23f;text-shadow:0 0 16px #f90,0 3px 0 #000}h2 :empty{display:none}` +
  // The kill feed, top right, and the own frags, top left.
  `ol{top:30px;right:12px;display:grid;justify-items:end;gap:3px;list-style:none;font-size:13px;font-weight:700}` +
  `ol li{width:auto;height:auto;padding:3px 9px;border-radius:4px;background:#000a;box-shadow:none;white-space:nowrap}ol li em{position:static;transform:none;margin:0 6px;font-size:11px;opacity:.75}` +
  // An ally on the radio (the user, 2026-11-15): his face on a small screen that flickers open
  // under the own frags while he speaks, framed in his team's colour, his name and a level meter;
  // the picture comes scrambled, with bad reception (signal.ts).
  `label{left:12px;top:40px;display:grid;justify-items:center;gap:4px;padding:5px 5px 6px;border:2px solid currentColor;border-radius:8px;background:#000c;box-shadow:0 0 14px currentColor;transform-origin:center;animation:comm .3s ease-out}` +
  `label canvas{display:block;width:96px;height:96px;border-radius:4px;background:radial-gradient(#26323e,#05080c)}` +
  `label span{max-width:96px;overflow:hidden;text-overflow:ellipsis;font:800 11px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}` +
  `label i{display:flex;gap:2px;align-items:end;height:8px}label i b{width:3px;height:100%;background:currentColor;animation:talk .28s ease-in-out infinite alternate}` +
  `label i b:nth-child(2n){animation-duration:.2s}label i b:nth-child(3n){animation-duration:.34s}` +
  `@keyframes comm{0%{opacity:0;transform:scale(1,.04)}45%{opacity:1;transform:scale(1.06,.12)}100%{transform:none}}` +
  `@keyframes talk{from{transform:scaleY(.2)}}` +
  `h1{left:12px;top:8px;font:900 13px/1 system-ui,sans-serif;letter-spacing:.1em}h1 span{margin-left:6px;font-size:24px;font-variant-numeric:tabular-nums}` +
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
  `aside[data-v=pause] main,aside:not([data-v=pause]) .pm,aside[data-v=controls] [role=tab],aside[data-v=character] [role=tab],aside[data-v=audio] [role=tab],aside[data-v=character] blockquote,aside[data-v=character] address{display:none}` +
  `aside:not([data-v=controls]):not([data-v=character]):not([data-v=audio]) .bk{display:none}aside .bk{padding:11px 14px;text-align:left;font-size:15px;font-weight:700;color:#8d9aa7}aside .bk:hover{color:#fff}` +
  // The character: his live picture, beside it the body, the skin and the haircut, a row of chips
  // each; under them the class, a card each, the ones the map does not offer not shown (the user,
  // 2026-11-17: hidden, not greyed out).
  `aside fieldset{display:grid;grid-template-columns:240px minmax(0,1fr);gap:10px 16px;align-content:start;margin:0;padding:0;border:0;min-width:0}aside fieldset h4{grid-column:1/-1;margin:0}` +
  `aside .loader{grid-area:3/1}aside .loader[hidden]{display:none}` +
  `aside canvas{width:100%;height:auto;aspect-ratio:3/4;border:1px solid #26323e;border-radius:14px;cursor:inherit;background:radial-gradient(#26323e,#0d141c)}` +
  `aside .op{display:grid;gap:5px;align-content:start}aside fieldset small{margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8d9aa7}` +
  `aside [role=radiogroup]{display:flex;flex-wrap:wrap;gap:6px}aside [role=radiogroup][hidden]{display:none}` +
  `aside .hc [role=radio]{display:grid;justify-items:center;gap:3px;width:60px;padding:4px 3px 5px;font-size:11px}aside .hc canvas{width:52px;aspect-ratio:1;border-radius:8px}aside.hm .hc canvas{display:none}` +
  `aside [role=radio]{position:relative;padding:6px 11px;border-color:#26323e;background:#121a23;font-size:13px;font-weight:700;transition:border-color .15s,box-shadow .15s}` +
  `aside [role=radio]:hover{border-color:#3a4a5a}aside [role=radio]:disabled{opacity:.4;cursor:not-allowed}` +
  `aside [aria-checked=true],aside [aria-checked=true]:hover{border-color:#f7782a;box-shadow:0 0 0 1px #f7782a;color:#fff}` +
  `aside .sw [role=radio]{width:24px;height:24px;padding:0;border-radius:50%;border:2px solid #0b1016}aside .sw [aria-checked=true]{box-shadow:0 0 0 2px #f7782a}` +
  `aside .cl{grid-column:1/-1;display:grid;gap:6px}aside .cl [role=radio][hidden]{display:none}` +
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
  // The Audio panel: a slider a bus, its level in dB beside it.
  `aside article.mx{columns:auto;display:grid;gap:14px;max-width:560px;align-content:start}aside .mx div{position:static;width:auto;height:auto;overflow:visible;background:none;text-shadow:none;display:grid;grid-template-columns:120px 1fr 64px;gap:14px;align-items:center;font-size:14px;font-weight:700}` +
  `aside .mx input{accent-color:#f7782a}aside .mx div span{text-align:right;color:#b7c2cd;font-variant-numeric:tabular-nums}aside .mx button{justify-self:start;padding:8px 14px;border-color:#26323e;background:#121a23;font-weight:700}` +
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
  // The armour: gold pips after the health, only the ones there.
  `ul li.a{background:#fc3}li.a.e{display:none}li:not(.a)+li.a{margin-left:6px}` +
  `dl{right:12px;bottom:10px;display:flex;align-items:center;gap:10px}dl svg{width:38px;fill:#fff;filter:drop-shadow(0 1px 1px #000)}` +
  `dl.k svg:first-child,dl:not(.k) svg+svg,dl.k data,dl.k span,dl.b>:not(small){display:none}dl.w data{opacity:.35}dl.k svg{width:64px;fill:#8ef}dl.r svg{fill:#c9f}dl.r data{color:#dcf}dl.f svg{fill:#f86}dl.f data{color:#fdb}dl span::first-line{font-size:22px}` +
  // The Hunter's own glyphs (the user, 2026-11-24): the one of the weapon in hand (h0 to h3, in his
  // slots' order) in its colour: the blades' steel, the harpoon's bronze, the cannon's plasma red,
  // the disc's silver. svg.h is the last svg, which `dl:not(.k) svg+svg` would hide.
  `dl svg.h,dl.h svg{display:none}dl.h svg.h{display:block;width:52px;fill-rule:evenodd}dl.h svg.h path{display:none}` +
  `dl.h0 .h :nth-child(1),dl.h1 .h :nth-child(2),dl.h2 .h :nth-child(3),dl.h3 .h :nth-child(4){display:inline}` +
  `dl.h0 svg.h{fill:#8ef}dl.h1 svg.h{fill:#dcb27a}dl.h2 svg.h{fill:#f65}dl.h3 svg.h{fill:#cde}` +
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
  `del{inset:0;background:radial-gradient(ellipse 84% 90% at 50% 52%,#0000 64%,#000d 100%)}` +
  // The view out of focus round the visor (BLUR), under the sheen.
  `del::before{content:"";position:absolute;inset:0;backdrop-filter:blur(7px);mask:${BLUR} 0 0/100% 100%}` +
  `del::after{content:"";position:absolute;inset:0;background:${RIM} 0 0/100% 100% no-repeat}` +
  `strong{font-size:22px}` +
  `table{border-collapse:collapse;font-size:16px}td{padding:2px 10px}td+td{text-align:left}td:first-child{text-align:right;opacity:.7}` +
  // What E does, just under the crosshair where the eye is (over the face it was missed), and the speed where the gun's count is; at the wheel the gun, the crosshair and the visor's rim go.
  `samp{left:50%;top:57%;transform:translateX(-50%);padding:7px 14px;border-radius:6px;background:#000b;font:800 18px/1 system-ui;text-transform:uppercase;white-space:nowrap}` +
  // In line: the orbital mission's var rule had put the key 66 px down, onto the face.
  `samp var{position:static;margin-right:9px;padding:3px 8px;border:0;background:#fff;color:#000;font:inherit;text-shadow:none}` +
  // A glory kill on offer swells and shrinks, in red, to make the player take it.
  `samp.g{background:#600c;box-shadow:0 0 0 2px #f53;animation:urge .7s infinite alternate}samp.g var{background:#f53}` +
  `@keyframes urge{to{transform:translateX(-50%) scale(1.14)}}` +
  `cite{right:12px;bottom:10px;font:900 clamp(30px,5vw,46px)/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}cite small{margin-left:6px;font-size:14px}` +
  // Out of the head (at the wheel, or watching a glory kill): no crosshair, no gun, no visor.
  `.scoped::before{content:"";position:absolute;inset:0;pointer-events:none;background:` +
  `linear-gradient(#241919,#241919) center/1px 76vmin no-repeat,` +
  `linear-gradient(#241919,#241919) center/76vmin 1px no-repeat,` +
  `radial-gradient(circle at center,transparent 37vmin,#211b1a 38vmin,#080707fa 39vmin)}` +
  `div.v>i,.v dl,.v del,div.o>i,.o dl,.o del{display:none}` +
  `div.v .hl,div.o .hl{display:none}` +
  // A vehicle's health: ten pips over the speed for who is in it, and a small bar over one near by.
  `tt{right:12px;bottom:62px;width:148px;height:10px;background:linear-gradient(90deg,var(--c,#5fd28a) var(--a,100%),#fff3 0);-webkit-mask:repeating-linear-gradient(90deg,#000 0 13px,#0000 13px 15px);mask:repeating-linear-gradient(90deg,#000 0 13px,#0000 13px 15px);filter:drop-shadow(0 1px 1px #000)}` +
  `tt+tt{right:auto;bottom:auto;transform:translate(-50%,-50%) scale(.5)}` +
  // The ship: its missiles and its height, bottom left; the limit's warning, flashing, under the banner.
  `dfn{left:12px;bottom:10px;padding:7px 14px;border-radius:6px;font:800 15px/1 system-ui,sans-serif;font-style:normal;font-variant-numeric:tabular-nums;letter-spacing:.04em;background:#000a}` +
  `dfn+dfn{left:50%;top:30%;bottom:auto;transform:translateX(-50%);padding:8px 22px;font-size:clamp(14px,2.6vw,20px);background:#a10e0ecc;animation:blink .5s steps(2) infinite alternate}` +
  `@keyframes blink{to{opacity:.35}}`;
