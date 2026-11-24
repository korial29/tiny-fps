// The character screen before a match (the user, 2026-11-24): the whole page, the classes as tiles
// on the left, the class's name over a large live picture on the right and its strengths and
// weaknesses under it, Start in the middle at the bottom. Nothing of the match loads and the room
// is not joined before Start: the picture has a renderer of its own over an empty studio, one
// brush under the map's sky, which goes when Start is pressed.
import { PARRY, RIFLE_CLIP, TEAM_COLOR, XENO_HP } from '../shared/constants';
import { ROLE, buildOf, rolesOf } from '../shared/kit';
import { STILL, spawn } from '../shared/physics';
import type { Choice, PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import { TONES } from './features';
import { CAST, HAIR_NAMES, swatch } from './hud';
import { PORTRAIT, backing, createRenderer } from './render';
import type { Renderer, Shot } from './render';

/** A whole choice: the body, the skin, the haircut and the class. */
export type Cast = Choice & { body: number };

/** Each class in ROLE's order: its name, a few words for its tile, and plain lists of what it is good and bad at. */
export const TRAITS: { name: string; tag: string; pros: string[]; cons: string[] }[] = [
  {
    name: 'Marine',
    tag: 'Full firepower',
    pros: ['Full ammo and magazines', 'Full rate of fire and damage with every gun'],
    cons: ['Standard moves: one dash', 'Normal speed and jumps', 'City maps only'],
  },
  {
    name: 'Ninja',
    tag: 'Speed and blade',
    pros: [
      '20 % faster, higher jumps',
      'Twice the wall-run time, 3 dashes',
      'Starts with a katana',
      'Katana and fists strike twice as fast',
      `The katana parries ${Math.round(PARRY * 100)} % of frontal shots`,
    ],
    cons: ['Half ammo and magazine size', 'Half fire rate and damage', 'Guns slow him down'],
  },
  {
    name: 'Astronaut',
    tag: 'Moon trooper',
    pros: ['The marine’s full firepower', 'A suit made for low gravity'],
    cons: ['Standard moves: one dash', 'Moon only'],
  },
  {
    name: 'Xenomorph',
    tag: 'Wall-crawling beast',
    pros: [
      `${XENO_HP} health, slightly faster`,
      'Double jump height, runs up walls',
      '3 long dashes that pin foes',
      'A head bite heals it',
      'Claws, charged tail, acid blood',
      'Sees through walls',
    ],
    cons: ['Melee only', 'No armour', 'No vehicles'],
  },
  {
    name: 'Hunter',
    tag: 'Stalker with gadgets',
    pros: [
      'Twin wrist blades',
      'Scoped harpoon rifle: 4 HP a bolt',
      'Shoulder cannon that locks on',
      'A disc that comes back',
      'Thermal and alien vision (V)',
    ],
    cons: ['No fists', 'Takes no weapon from the racks', 'Harpoon reloads in 1.3 s'],
  },
];

/** Where the last choice is kept, so the next visit starts with it. */
const SAVED = 'tiny-fps-cast';
/**
 * The id each class's pictures are drawn with (its face is this id's): one per class, as the
 * renderer keeps a player's skin by his id, and a tile of another class would take the big
 * picture's.
 */
const idOf = (role: number) => 10 + role;
/** Pictures a second at most: the runner breathes, nothing more. */
const HZ = 30;
/** The whole runner, feet to head, in a picture about as wide as high (the Hunter has his own in portrait()). */
const FULL: Shot = { ...PORTRAIT, eye: 0.95, away: 3.9, turn: -0.35, fov: 30 };
/**
 * The weapon each class holds in its big picture (the user, 2026-11-24): the marine's assault
 * rifle, the ninja's katana, the Hunter's wrist blades; the others empty-handed.
 */
const ARMED: Partial<Record<number, Partial<Shot>>> = {
  // The rifle low, at the ready, rather than aimed at the camera.
  [ROLE.MARINE]: {
    hold: { rifle: RIFLE_CLIP, clip: RIFLE_CLIP, rifled: true, pitch: -0.2 },
    spin: 0.35,
  },
  [ROLE.NINJA]: { hold: { blade: true, wield: true } },
  // His disc put away (the user, 2026-11-24): as while it flies (`clip`), none hangs at his belt.
  [ROLE.HUNTER]: { hold: { blade: true, wield: true, clip: 1 }, spin: 0.45 },
};
/** A tile's picture: head and shoulders. */
const BUST: Shot = { ...PORTRAIT, eye: 1.5, away: 1.6, turn: -0.4, fov: 22 };

/** No lens effect on the frame that sizes the targets. */
const BLANK = { fov: 0, roll: 0, lines: 0 } as unknown as Parameters<Renderer['frame']>[5];

const CSS =
  `:host{display:block;width:100%;height:100%}` +
  `.lb{position:relative;width:100%;height:100%;box-sizing:border-box;overflow:hidden;display:grid;grid-template:"logo main" auto "side main" 1fr "go go" auto/clamp(250px,27vw,360px) minmax(0,1fr);gap:10px clamp(18px,3vw,40px);` +
  `padding:clamp(14px,3vh,30px) clamp(16px,3.5vw,48px);background:radial-gradient(ellipse at 68% 38%,#1d2a37,#070b10 72%);color:#e9eef3;font:500 14px/1.35 system-ui,sans-serif;user-select:none}` +
  `button{margin:0;padding:0;font:inherit;color:inherit;cursor:pointer;border:1px solid #0000;border-radius:10px;background:none}button:focus-visible{outline:2px solid #ffb347;outline-offset:2px}` +
  `h6{grid-area:logo;margin:0;font:900 clamp(26px,4.4vh,38px)/1 system-ui,sans-serif;letter-spacing:.04em;transform:skewX(-8deg);justify-self:start;` +
  `background:linear-gradient(#fe6,#f92 45%,#d21);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #500) drop-shadow(0 0 14px #f604)}` +
  `h4{margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8d9aa7}` +
  `.side{grid-area:side;min-height:0;display:flex;flex-direction:column;gap:clamp(8px,1.6vh,14px)}` +
  `.tl{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:clamp(5px,1vh,8px)}` +
  `.tl button{flex:1 1 0;min-height:0;max-height:92px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:1fr 1fr;column-gap:12px;align-items:center;padding:6px 12px 6px 6px;text-align:left;` +
  `border-color:#26323e;background:#0f161e;transition:border-color .15s,background .15s}` +
  `.tl button:hover{border-color:#3a4a5a;background:#141e28}.tl [aria-checked=true],.tl [aria-checked=true]:hover{border-color:#f7782a;box-shadow:0 0 0 1px #f7782a;background:linear-gradient(90deg,#f7782a2a,#0f161e 70%)}` +
  `.tl canvas{grid-row:span 2;height:100%;max-height:78px;aspect-ratio:1;border-radius:8px;background:radial-gradient(#26323e,#0d141c)}` +
  `.tl b{align-self:end;font-size:clamp(14px,2.3vh,18px);font-weight:800;color:#fff}.tl small{align-self:start;font-size:12px;color:#8d9aa7}` +
  `.look{display:grid;gap:8px;padding:10px 12px;border:1px solid #26323e;border-radius:12px;background:#0b1117}.look[hidden],.look [hidden]{display:none}` +
  `.look>div{display:grid;grid-template-columns:46px 1fr;gap:12px;align-items:center}.look h4{margin:0}.look [role=radiogroup]{display:flex;flex-wrap:wrap;gap:5px}` +
  `.look [role=radio]{padding:4px 10px;border-color:#26323e;background:#121a23;font-size:12px;font-weight:700}.look [role=radio]:hover{border-color:#3a4a5a}` +
  `.look [aria-checked=true],.look [aria-checked=true]:hover{border-color:#f7782a;box-shadow:0 0 0 1px #f7782a;color:#fff}` +
  `.sw [role=radio]{width:22px;height:22px;padding:0;border-radius:50%;border:2px solid #0b1016}.sw [aria-checked=true]{box-shadow:0 0 0 2px #f7782a}` +
  `main{grid-area:main;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:clamp(6px,1.4vh,14px)}` +
  `h1{margin:0;text-align:center;font:900 clamp(34px,8.5vh,84px)/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#fff;text-shadow:0 4px 30px #f7782a55}` +
  `figure{position:relative;margin:0;min-height:0;border:1px solid #26323e;border-radius:16px;overflow:hidden;background:radial-gradient(#26323e,#0d141c)}` +
  `figure canvas{display:block;width:100%;height:100%}` +
  `figure span{position:absolute;inset:0;display:grid;place-items:center;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8d9aa7}figure span[hidden]{display:none}` +
  `.tr{display:grid;grid-template-columns:1fr 1fr;gap:clamp(12px,3vw,40px);max-width:820px;width:100%;justify-self:center}` +
  `ul{margin:0;padding:0;list-style:none;display:grid;gap:3px}li{position:relative;padding-left:22px;font-size:clamp(13px,1.9vh,15px)}` +
  `li::before{position:absolute;left:0;font-weight:900}.p li::before{content:"+";color:#5ad17a}.c li::before{content:"−";color:#ff5a4f}` +
  `.go{grid-area:go;justify-self:center;min-width:min(320px,80vw);padding:clamp(12px,2vh,18px) 48px;border:0;background:linear-gradient(#ff9a4a,#e8590c);box-shadow:0 10px 30px -8px #e8590ccc;` +
  `font:900 clamp(18px,3vh,24px)/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#fff}.go:hover{filter:brightness(1.1)}` +
  // The renderer's own canvas: the size of the picture, under it, never seen (portrait() copies from it).
  // In a match (Again): no pictures (no second renderer beside the game's, the user, 2026-11-25),
  // the class's name and its lists in the middle, and the way back, left of Apply.
  // The logo's place stays, empty: the page may show something of its own there (the demo's bar).
  `.ag h6{visibility:hidden}.ag figure,.ag .tl canvas{display:none}.ag .tl button{grid-template:1fr/auto 1fr;padding-left:16px;max-height:64px}.ag .tl b,.ag .tl small{align-self:center}.ag main{grid-template-rows:auto auto;align-content:center;gap:clamp(18px,5vh,44px)}` +
  `.bk{grid-area:go;justify-self:start;align-self:center;padding:10px 14px;font-size:15px;font-weight:700;color:#8d9aa7}.bk:hover{color:#fff}` +
  `.gl{position:absolute;left:0;top:0;visibility:hidden;pointer-events:none}`;

const load = (): Partial<Cast> => {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Partial<Cast>;
  } catch {
    return {};
  }
};

export interface Lobby {
  destroy(): void;
}

/**
 * The screen opened again in a match, from the pause menu (the user, 2026-11-25): over the game,
 * on what the player wears `now`, without the pictures, Apply for Start and a way `back` (Escape too) that
 * changes nothing.
 */
export interface Again {
  now: Partial<Cast>;
  back(): void;
}

/**
 * Shows the character screen in `container` for the map `def` (the classes it offers, its sky);
 * `start` hears the whole choice on Start, after the screen is gone. `again`: opened in a match.
 */
export const createLobby = (
  container: HTMLElement,
  def: WorldDef,
  start: (c: Cast) => void,
  again?: Again,
): Lobby => {
  const roles = rolesOf(def);
  const was = again?.now ?? load();
  let c: Cast = { body: 0, tone: 0, hair: 0, role: roles[0] };
  // A part the player never picked is undefined in a match: the default stays.
  for (const k of ['body', 'tone', 'hair', 'role'] as const) {
    c[k] = was[k] ?? c[k]!;
  }
  c.body = +!!c.body;
  if (!roles.includes(c.role ?? -1)) {
    c.role = roles[0];
  }
  if ((c.hair ?? 0) >= HAIR_NAMES[c.body].length) {
    c.hair = 0;
  }
  const host = document.createElement('div');
  // In a match the host is a child of the game's screen, over its menu and its death screen.
  host.style.cssText = again
    ? 'position:absolute;inset:0;z-index:4;width:100%;height:100%;background:none;text-shadow:none'
    : 'width:100%;height:100%';
  const root = host.attachShadow({ mode: 'open' });
  const radio = (label: string, extra = '') => `<button role="radio" ${extra}>${label}</button>`;
  root.innerHTML =
    `<style>${CSS}</style><div class="lb${again ? ' ag' : ''}"><h6>TINY FPS</h6>` +
    `<div class="side"><div role="radiogroup" aria-label="Class" class="tl">${roles
      .map(r =>
        radio(
          `<canvas width="112" height="112"></canvas><b>${TRAITS[r].name}</b><small>${TRAITS[r].tag}</small>`,
        ),
      )
      .join('')}</div>` +
    `<div class="look"><div><h4>Body</h4><div role="radiogroup" aria-label="Body">${CAST.map(n => radio(n)).join('')}</div></div>` +
    `<div><h4>Skin</h4><div role="radiogroup" aria-label="Skin" class="sw">${TONES.map((t, i) =>
      radio('', `aria-label="Skin ${i + 1}" style="background:${swatch(t)}"`),
    ).join('')}</div></div>` +
    `<div><h4>Hair</h4><div role="radiogroup" aria-label="Hair"></div></div></div></div>` +
    `<main><h1></h1><figure><canvas></canvas><span>Loading</span></figure>` +
    `<div class="tr"><div><h4>Strengths</h4><ul class="p"></ul></div><div><h4>Weaknesses</h4><ul class="c"></ul></div></div></main>` +
    (again ? `<button class="bk">← Back</button>` : '') +
    `<button class="go">${again ? 'Apply' : 'Start'}</button><canvas class="gl"></canvas></div>`;
  container.append(host);
  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const [tiles, bodies, skins, hairs] = [
    ...root.querySelectorAll<HTMLElement>('[role=radiogroup]'),
  ];
  const look = $<HTMLElement>('.look');
  const [title, figure, loader] = [
    $<HTMLElement>('h1'),
    $<HTMLElement>('figure'),
    $<HTMLElement>('figure span'),
  ];
  const picture = $<HTMLCanvasElement>('figure canvas');
  const gl = $<HTMLCanvasElement>('.gl');
  const [pros, cons] = [$<HTMLElement>('.p'), $<HTMLElement>('.c')];
  const thumbs = [...tiles.querySelectorAll('canvas')];
  const sheet = document.createElement('canvas');
  const buttons = (g: HTMLElement) => [...g.children] as HTMLButtonElement[];

  /** Each group's pick lit and alone in the Tab order; the parts the class has no choice of hidden. */
  const lit = () => {
    const at = [roles.indexOf(c.role!), c.body, c.tone ?? -1, c.hair ?? -1];
    [tiles, bodies, skins, hairs].forEach((g, k) =>
      buttons(g).forEach((b, i) => {
        b.setAttribute('aria-checked', `${i == at[k]}`);
        b.tabIndex = i == Math.max(0, at[k]) ? 0 : -1;
      }),
    );
    const fixed = c.role == ROLE.XENO || c.role == ROLE.HUNTER;
    look.hidden = fixed;
    hairs.parentElement!.hidden = c.role == ROLE.NINJA;
    const t = TRAITS[c.role!];
    title.textContent = t.name;
    pros.innerHTML = t.pros.map(s => `<li>${s}</li>`).join('');
    cons.innerHTML = t.cons.map(s => `<li>${s}</li>`).join('');
  };
  const cuts = () =>
    hairs.replaceChildren(
      ...HAIR_NAMES[c.body].map(n => {
        const b = document.createElement('button');
        b.setAttribute('role', 'radio');
        b.textContent = n;
        return b;
      }),
    );
  const choose = (k: number, i: number) => {
    if (i < 0) {
      return;
    }
    if (k == 0) {
      c.role = roles[i];
    } else if (k == 1 && i != c.body) {
      c = { ...c, body: i, hair: 0 };
      cuts();
    } else if (k == 2) {
      c.tone = i;
    } else if (k == 3) {
      c.hair = i;
    }
    lit();
    thumbed = '';
  };
  [tiles, bodies, skins, hairs].forEach((g, k) => {
    g.onclick = e => choose(k, buttons(g).indexOf((e.target as Element).closest('[role=radio]')!));
    g.onkeydown = e => {
      const d = +/^Arrow(Down|Right)/.test(e.code) - +/^Arrow(Up|Left)/.test(e.code);
      const all = buttons(g);
      const at = all.indexOf(e.target as HTMLButtonElement);
      if (d && at >= 0) {
        e.preventDefault();
        const to = (at + d + all.length) % all.length;
        choose(k, to);
        all[to].focus();
      }
    };
  });
  cuts();
  lit();

  // The pictures: a renderer over an empty studio under the map's sky, made once the screen is painted.
  const studio = build({
    ...{ name: def.name, sun: def.sun, sky: def.sky, fog: def.fog, gravity: def.gravity },
    ...{ helmets: def.helmets, armor: def.armor, teams: def.teams, floor: 0 },
    brushes: [def.brushes[0]],
  });
  const stand = (role: number): PlayerState => ({
    ...STILL,
    ...spawn(idOf(role), studio, 0, 0),
    id: idOf(role),
  });
  const men = roles.map(stand);
  const me = (role: number) => men[roles.indexOf(role)];
  let rd: Renderer | undefined;
  let raf = 0;
  let next = 0;
  /** The look the tiles were last drawn with, and the tiles still to draw for it, one a frame. */
  let thumbed = '';
  let todo: number[] = [];
  let shown = false;
  /** The size changed: a frame of the view first, which sizes the renderer's own targets anew. */
  let resized = false;
  /** The last frame drew the big picture. */
  let drew = false;
  /** The picture's and the renderer's canvases the size the picture shows at. */
  const fit = () => {
    const [w, h] = [figure.clientWidth, figure.clientHeight];
    gl.style.width = `${w}px`;
    gl.style.height = `${h}px`;
    const [pw, ph] = backing(w, h, devicePixelRatio);
    if (picture.width != pw || picture.height != ph) {
      [picture.width, picture.height] = [pw, ph];
      [next, resized] = [0, true];
    }
  };
  const seen = new ResizeObserver(fit);
  if (!again) {
    seen.observe(figure);
  }
  const color = TEAM_COLOR[0];
  const lookOf = (role: number): Choice => ({ ...c, role });
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!rd || !picture.height) {
      return;
    }
    if (resized) {
      resized = false;
      rd.frame([men[0].x, men[0].y + 1.6, men[0].z + 3], 0, 0, [], new Map(), BLANK, []);
    }
    const key = JSON.stringify(c);
    if (key != thumbed) {
      thumbed = key;
      // Each class's player dressed as the room would: the Hunter's model needs it.
      rd.wear(
        new Map(roles.map(r => [idOf(r), buildOf({ ...c, role: r }, def)])),
        new Map(roles.map(r => [idOf(r), lookOf(r)])),
      );
      todo = roles.map((_, i) => i);
    }
    // The big picture first, then a tile every other frame: on a slow machine every frame is due
    // for the big one.
    if (shown && todo.length && drew) {
      drew = false;
      const i = todo.shift()!;
      const r = roles[i];
      // Drawn the big picture's size, then its middle cut out: portrait() drawing pictures of
      // another size between them, with no frame of the view in between, leaves the big one blank.
      [sheet.width, sheet.height] = [picture.width, picture.height];
      if (rd.portrait(sheet, me(r), buildOf({ ...c, role: r }, def), color, lookOf(r), BUST)) {
        // The Hunter's pictures are always of the whole of him (portrait()): his head and chest cut out.
        const tall = r == ROLE.HUNTER;
        const side = sheet.height * (tall ? 0.42 : 1);
        thumbs[i]
          .getContext('2d')
          ?.drawImage(
            sheet,
            (sheet.width - side) / 2,
            tall ? sheet.height * 0.04 : 0,
            side,
            side,
            0,
            0,
            thumbs[i].width,
            thumbs[i].height,
          );
      }
    } else if (now >= next || !shown) {
      next = Math.max(next, now - 1000 / HZ) + 1000 / HZ;
      drew = rd.portrait(picture, me(c.role!), buildOf(c, def), color, c, {
        ...FULL,
        ...ARMED[c.role!],
      });
      if (drew && !shown) {
        shown = true;
        loader.hidden = true;
      }
    }
  };
  // In a match the screen draws nothing: the game's renderer stays the only one.
  const timer = setTimeout(() => {
    if (again) {
      return;
    }
    fit();
    try {
      rd = createRenderer(gl, studio);
    } catch {
      loader.textContent = 'WebGL2 is not available';
    }
  }, 50);
  if (!again) {
    raf = requestAnimationFrame(tick);
  }

  let gone = false;
  const destroy = () => {
    if (gone) {
      return;
    }
    gone = true;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    seen.disconnect();
    document.removeEventListener('keydown', onKey);
    rd?.destroy();
    host.remove();
  };
  const go = () => {
    try {
      localStorage.setItem(SAVED, JSON.stringify(c));
    } catch {
      // No storage (a private window): the next visit starts afresh.
    }
    destroy();
    start(c);
  };
  const back = () => {
    destroy();
    again?.back();
  };
  // Enter starts from anywhere but a button, which Enter presses.
  const onKey = (e: KeyboardEvent) => {
    if (e.code == 'Enter' && !(e.composedPath()[0] instanceof HTMLButtonElement)) {
      go();
    } else if (e.code == 'Escape' && again) {
      back();
    }
  };
  document.addEventListener('keydown', onKey);
  if (again) {
    $<HTMLElement>('.bk').onclick = back;
  }
  $<HTMLElement>('.go').onclick = go;
  return { destroy };
};
