// A design sheet for a character model: one row per level of detail (close, near, far), each seen
// from several angles round him at the distance that picks that level in a match, with the
// vertices each level writes. Built from the game's own renderer: what it shows is what plays.
//
// Parameters:
//   role=marine|ninja|astro|xeno|hunter   the class (astro picks Tranquility, the others Highline)
//   body=0|1                              the build
//   map=highline|tranquility              overrides the map
//   views=0,45,90,180,270                 degrees round from his front, positive towards his left
//   lods=close,near,far                   the rows
//   eye=1.0                               the camera's height over his feet (m)
//   at=1.0                                the height it looks at (m; the Hunter's default 1.2)
//   zoom=1                                over 1 closer in, under 1 wider (the Hunter's default 0.8)
//   size=320                              each picture's height in CSS pixels (4:3)
//   color=#e23b3b                         his team colour
//   set=wield:1,railed:1,ammo:10          PlayerState fields to override (numbers, 0/1 as booleans)
//   t=0.5                                 seconds he is animated before the pictures (fake clock)
import { createRenderer } from '../src/client/render';
import { createRunner, soldier, warmHunter } from '../src/client/soldier';
import { Verts } from '../src/client/verts';
import { STRIDE } from '../src/client/mesh';
import { MAPS } from '../src/shared/maps';
import { build } from '../src/shared/world';
import { spawn, STILL } from '../src/shared/physics';
import { KITS, ROLE } from '../src/shared/kit';
import type { PlayerState } from '../src/shared/types';
import type { Pieces } from '../src/client/store';

const q = new URLSearchParams(location.search);
// A fake clock: every picture is the same from run to run, and headless Chrome is not rushed.
let now = 50_000;
performance.now = () => now;
Date.now = () => now;

const ROLES: Record<string, number> = {
  marine: ROLE.MARINE,
  ninja: ROLE.NINJA,
  astro: ROLE.ASTRONAUT,
  xeno: ROLE.XENO,
  hunter: ROLE.HUNTER,
};
const roleName = q.get('role') ?? 'marine';
const role = ROLES[roleName] ?? ROLE.MARINE;
const mapKey = q.get('map') ?? (role === ROLE.ASTRONAUT ? 'tranquility' : 'highline');
const bodyBuild = +(q.get('body') ?? 0);
const color = q.get('color') ?? '#e23b3b';
const tall = role === ROLE.HUNTER;
const eyeUp = +(q.get('eye') ?? (tall ? 1.2 : 1.0));
const at = +(q.get('at') ?? (tall ? 1.2 : 1.0));
const zoom = +(q.get('zoom') ?? (tall ? 0.8 : 1));
const size = +(q.get('size') ?? 320);
const views = (q.get('views') ?? '0,45,90,135,180,270').split(',').map(Number);
// Each level at a distance inside its band (render.ts: close under 4 m, near under 10, far past),
// the field of view narrowed with it so he fills the picture alike.
const LODS: Record<string, { lod: number; away: number; fov: number }> = {
  close: { lod: 3, away: 3.2, fov: 34 },
  near: { lod: 1, away: 7, fov: 15.5 },
  far: { lod: 0, away: 14, fov: 7.8 },
};
const rows = (q.get('lods') ?? 'close,near,far').split(',').filter(k => LODS[k]);

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const [w, h] = [Math.round((size * 4) / 3) * 2, size * 2];
canvas.width = w;
canvas.height = h;
canvas.style.width = `${w}px`;
canvas.style.height = `${h}px`;
const world = build(MAPS[mapKey]);
const rd = createRenderer(canvas, world);
if (role === ROLE.HUNTER) {
  warmHunter();
}

const overrides: Record<string, number | boolean> = {};
for (const pair of (q.get('set') ?? '').split(',').filter(Boolean)) {
  const [k, v] = pair.split(':');
  overrides[k] = v === 'true' || v === 'false' ? v === 'true' : +v;
}
const id = 2;
// High over the map, as the menu's pictures: the sky behind him and no roof to clip the camera.
const me: PlayerState = {
  ...STILL,
  ...spawn(id, world, 0, 0, KITS[role]),
  id,
  y: 500,
  yaw: 0,
  pitch: 0,
  ...{ vx: 0, vy: 0, vz: 0, ammo: -1, wield: false, railed: false, blade: false },
  ...overrides,
} as PlayerState;

rd.wear(new Map([[id, bodyBuild]]), new Map([[id, { role, body: bodyBuild }]]));

// The vertices one runner writes at each level: those of the frame and those of the store's pieces.
const count = (lod: number) => {
  const r = createRunner(me, undefined, bodyBuild, { role, body: bodyBuild }, true);
  r.menace = role === ROLE.XENO;
  const v = new Verts();
  const pieces: Pieces = [];
  soldier(v, r, [0.9, 0.2, 0.2], lod, !!world.def.helmets, !!world.def.armor, pieces);
  const own = v.length / STRIDE;
  const stored = pieces.reduce((n, d) => n + d.m.count, 0);
  return { own, stored, n: pieces.length };
};

const dt = 1 / 60;
const settle = Math.max(2, Math.round(+(q.get('t') ?? 0.5) / dt));
const out = document.getElementById('out')!;
const head = document.createElement('div');
head.className = 'row';
head.innerHTML = `<div class="tag">${roleName} body ${bodyBuild}\n${mapKey}</div>`;
out.append(head);

const shoot = (away: number, fov: number, deg: number) => {
  const a = me.yaw + (deg * Math.PI) / 180;
  const eye: [number, number, number] = [
    me.x - Math.sin(a) * away,
    me.y + eyeUp,
    me.z - Math.cos(a) * away,
  ];
  const look = Math.atan2(-(me.x - eye[0]), -(me.z - eye[2]));
  // The camera at `eye` metres looks up or down to `at` metres over his feet.
  const pitch = Math.atan2(at - eyeUp, away);
  const lens = { fov: fov / zoom - 70, roll: 0, lines: 0 };
  // The same frame several times so the renderer's own easing (shadows, exposure) settles.
  for (let i = 0; i < settle; i++) {
    now += 1000 * dt;
    rd.frame(
      eye,
      look,
      pitch,
      [me],
      new Map([[id, color]]),
      lens as never,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { width: w, height: h, now },
    );
  }
  const c = Object.assign(document.createElement('canvas'), {
    width: w,
    height: h,
    className: 'shot',
  });
  c.style.width = `${w / 2}px`;
  c.style.height = `${h / 2}px`;
  c.getContext('2d')!.drawImage(canvas, 0, 0);
  return c;
};

const go = () => {
  for (const key of rows) {
    const { lod, away, fov } = LODS[key];
    const { own, stored, n } = count(lod);
    const row = document.createElement('div');
    row.className = 'row';
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent =
      `${key} (lod ${lod})\n${away} m\n\n` +
      `frame  ${own.toLocaleString('en')}\npieces ${stored.toLocaleString('en')} (${n})\n` +
      `total  ${(own + stored).toLocaleString('en')}`;
    row.append(tag);
    for (const deg of views) {
      const fig = document.createElement('figure');
      const cap = document.createElement('figcaption');
      cap.textContent = `${deg}°`;
      fig.append(shoot(away, fov, deg), cap);
      row.append(fig);
    }
    out.append(row);
  }
  document.title = 'DONE';
};
setTimeout(go, 100);
