// The bots' map of a world: a navigation mesh of the floor a body's middle may stand on, made from
// the brushes alone (their tops less what stands on them, docs/BOTS.md) and the relief, joined by
// portals where a body walks, steps or drops from one to the next. HIGHLINE's routes and the moon's
// crossings (routes.ts) add their jumps as links, flown as the tests fly them. A way is A* over the
// rectangles, then the funnel pulls it straight through the portals.
import { FALL_SAFE, PLAYER_H, PLAYER_R, STEP_H } from './constants';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { gravity } from './physics';
import { ground } from './relief';
import { HIGH, LOW, MID, UP, flip, leap, mirror } from './routes';
import type { Leg } from './routes';
import { key, near } from './world';
import type { World } from './world';

export type Vec3 = [number, number, number];
type Rect = [x0: number, z0: number, x1: number, z1: number];

/** A rectangle of floor at the height `y`, or on the relief's ground when `r`. */
export interface Poly {
  q: Rect;
  y: number;
  r?: boolean;
}

/** How a body goes through a portal: walks either way, drops down it, or jumps up onto a box. */
export const PASS = { WALK: 0, DROP: 1, HOP: 2 } as const;

/** A way out of a rectangle: through a portal (from `a` to `b` on the line between the two), or a link of legs. */
export interface Edge {
  to: number;
  a?: [number, number];
  b?: [number, number];
  pass?: number;
  /** A link: where its first leg starts, where its last ends, its legs and the route it is a leg of (-1 none). */
  from?: Vec3;
  end?: Vec3;
  legs?: Leg[];
  route?: number;
  /** Seconds, about, past the walk to it: a link's own. */
  cost: number;
  /** How often a bot came down off this link: each makes it dearer for the room's life. */
  fails?: number;
  /** The first link of a crossing (the moon's): AREA more for a bot that prefers another route. */
  toll?: boolean;
}

export interface Nav {
  polys: Poly[];
  out: Edge[][];
  /** Cell key to the rectangles that touch the cell, PORTAL metres round included. */
  grid: Map<number, number[]>;
  /** The route each rectangle is a crossing of, an index of ROUTES; -1 for none. */
  route: Int8Array;
}

/** A point a bot goes to: walking, or flying a leg there (`edge` the link of the leg). */
export interface Step {
  to: Vec3;
  leg?: Leg;
  edge?: Edge;
}

/** Metres a second a bot is taken to run, for the costs. */
const PACE = 7;
/** Seconds added to a jump, and to a jump that wants a dash, a double jump or a wall-run. */
const LEAP = 0.5;
const TRICK = 1.5;
/** Seconds added to a drop and to a jump onto a box. */
const DOWN = 0.3;
const HOP_COST = 1;
/** The highest box a body jumps onto standing (a standing jump lands on 1.7 m), and the floor it wants behind the edge. */
const HOP = 1.6;
const HOP_DEPTH = 2.5;
/** The most a body drops onto any floor; past it, it wants SPAN metres of floor ahead to come down on at a run. */
const DROP = 2;
const SPAN = 4;
/** Seconds added to a crossing of a route the bot does not prefer: the bridge's rectangles, a jump's first link. */
const AREA = 20;
/** The widest crack two rectangles are joined across: a drop's, where the higher's edge is a body's radius off the lower. */
const PORTAL = PLAYER_R + 0.1;
/** Metres a wall is kept off: the body's radius and a little. */
const KEEP = PLAYER_R + 0.05;
/** Metres back along a jump's way a bot comes at its take-off from. */
const RUN_IN = 3;
/** Metres the ends of a portal are drawn in, at most. */
const EDGE = 0.7;
/** The relief's squares merged into a rectangle at most, a side. */
const MERGE = 8;
/** Metres of grid cell. */
const CELL = 4;
/** A link of a route the bot does not prefer costs this many times more, one of its own as many times less. */
const OTHER = 3;

/** The routes, fastest first: the Spine, Midtown, the Lowline. */
export const ROUTES = [HIGH, MID, LOW];

/**
 * MOON's walks across the rille, x0 and x1 and the route each is a crossing of: the bridge (the
 * first), and round the rille's two closed ends (the west with the long jump, the east with the
 * stones). The jumps are links of their own.
 */
const ACROSS: [x0: number, x1: number, route: number][] = [
  [74, 86, 0],
  [-60, 0, 1],
  [160, 220, 2],
];

/**
 * The jumps over MOON's rille from red's side, as moon.test.ts flies them: the west long jump (a
 * sprint jumped at the lip, a dash late in the air), and the east stones at 1.2, 2.4 and 1.2 m,
 * each a jump that comes down on the stone. Blue's are their mirror. With the bridge, they are the
 * moon's three routes, an index of ROUTES each, so that bots spread over them.
 */
const CROSSINGS: [route: number, start: Vec3, legs: Leg[]][] = [
  [1, [18, 0, 190], [leap([18, 147], [18, 125], 0, { dash: 20 })]],
  [
    2,
    [128.5, 0, 150],
    [
      [128.5, 150, 128.5, 145, 1.2],
      [128.5, 145, 132.5, 140, 2.4],
      [132.5, 140, 128.5, 135, 1.2],
      [128.5, 135, 128.5, 130, 0],
    ].map(([ax, az, tx, tz, y]) => leap([ax, az], [tx, tz], y, { sprint: false, land: true })),
  ],
];

/** Where a leg ends: a jump steers for its `to`, which is on the roof it lands on. */
export const end = (l: Leg): Vec3 => [l.to[0], l.y, l.to[1]];

const flat = (ax: number, az: number, bx: number, bz: number): number =>
  Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);

/** The rectangle r less h: up to four rectangles. */
const cut = (r: Rect, h: Rect): Rect[] => {
  if (h[0] >= r[2] || h[2] <= r[0] || h[1] >= r[3] || h[3] <= r[1]) {
    return [r];
  }
  const out: Rect[] = [];
  const [x0, x1] = [Math.max(r[0], h[0]), Math.min(r[2], h[2])];
  if (h[0] > r[0]) {
    out.push([r[0], r[1], h[0], r[3]]);
  }
  if (h[2] < r[2]) {
    out.push([h[2], r[1], r[2], r[3]]);
  }
  if (h[1] > r[1]) {
    out.push([x0, r[1], x1, h[1]]);
  }
  if (h[3] < r[3]) {
    out.push([x0, h[3], x1, r[3]]);
  }
  return out;
};

/** Rectangles that share a whole side, merged, until none do. */
const merge = (rs: Rect[]): Rect[] => {
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const [a, b] = [rs[i], rs[j]];
      const m: Rect | undefined =
        a[0] === b[0] && a[2] === b[2] && (a[3] === b[1] || b[3] === a[1])
          ? [a[0], Math.min(a[1], b[1]), a[2], Math.max(a[3], b[3])]
          : a[1] === b[1] && a[3] === b[3] && (a[2] === b[0] || b[2] === a[0])
            ? [Math.min(a[0], b[0]), a[1], Math.max(a[2], b[2]), a[3]]
            : undefined;
      if (m) {
        rs[i] = m;
        rs.splice(j, 1);
        j = i;
      }
    }
  }
  return rs;
};

/** The height of a rectangle's floor at (x, z). */
export const heightAt = (w: World, p: Poly, x: number, z: number): number =>
  p.r ? ground(w, x, z) : p.y;

/** The relief's ground as rectangles of whole squares, none over the hole, a pit or past the bound. */
const lowlands = (w: World): Rect[] => {
  const r = w.relief;
  if (!r) {
    return [];
  }
  const { x0, z0, cell, nx, nz, hole, pits, pitted, bound } = r;
  const [cx, cz, ea, eb] = bound;
  const [mx, mz] = [nx - 1, nz - 1];
  const over = (q: Rect, h: readonly number[]) =>
    q[0] < h[2] && q[2] > h[0] && q[1] < h[3] && q[3] > h[1];
  const free = new Uint8Array(mx * mz);
  for (let j = 0; j < mz; j++) {
    for (let i = 0; i < mx; i++) {
      const q: Rect = [x0 + i * cell, z0 + j * cell, x0 + (i + 1) * cell, z0 + (j + 1) * cell];
      let inside = true;
      for (const [x, z] of [
        [q[0], q[1]],
        [q[2], q[1]],
        [q[0], q[3]],
        [q[2], q[3]],
      ]) {
        inside &&= ((x - cx) / ea) ** 2 + ((z - cz) / eb) ** 2 <= 1;
      }
      free[i + j * mx] = +(
        inside &&
        !over(q, hole) &&
        !(pitted[i + j * nx] && pits.some(p => over(q, p)))
      );
    }
  }
  const out: Rect[] = [];
  for (let j = 0; j < mz; j++) {
    for (let i = 0; i < mx; i++) {
      if (!free[i + j * mx]) {
        continue;
      }
      let a = 1;
      while (i + a < mx && a < MERGE && free[i + a + j * mx]) {
        a++;
      }
      let b = 1;
      while (j + b < mz && b < MERGE) {
        let row = true;
        for (let k = 0; k < a; k++) {
          row &&= !!free[i + k + (j + b) * mx];
        }
        if (!row) {
          break;
        }
        b++;
      }
      for (let l = 0; l < b; l++) {
        free.fill(0, i + (j + l) * mx, i + a + (j + l) * mx);
      }
      out.push([x0 + i * cell, z0 + j * cell, x0 + (i + a) * cell, z0 + (j + b) * cell]);
    }
  }
  return out;
};

/**
 * The floor of a world as rectangles a body's middle may stand on: each brush's top, and the
 * relief's ground, less the footprint of what stands on it within a body's height: kept KEEP off
 * a wall, cut to the edge of a box low enough to step onto (which is a floor of its own).
 */
const floors = (w: World): Poly[] => {
  const { brushes, floor } = w.def;
  const polys: Poly[] = [];
  const add = (q: Rect, y: number, r: boolean, self: number) => {
    const s = Math.max(q[2] - q[0], q[3] - q[1]) / 2 + KEEP;
    let rs = [q];
    for (const i of near(w, (q[0] + q[2]) / 2, (q[1] + q[3]) / 2, s)) {
      const b = brushes[i];
      if (i === self || b.max[0] <= q[0] - KEEP || b.min[0] >= q[2] + KEEP) {
        continue;
      }
      if (b.max[2] <= q[1] - KEEP || b.min[2] >= q[3] + KEEP) {
        continue;
      }
      // The floor under the brush: the highest and the lowest of the ground there, on the relief.
      let [lo, hi] = [y, y];
      if (r) {
        const [ax, az] = [Math.max(q[0], b.min[0]), Math.max(q[1], b.min[2])];
        const [bx, bz] = [Math.min(q[2], b.max[0]), Math.min(q[3], b.max[2])];
        const gs = [
          [ax, az],
          [bx, az],
          [ax, bz],
          [bx, bz],
          [(ax + bx) / 2, (az + bz) / 2],
        ].map(([x, z]) => ground(w, x, z));
        [lo, hi] = [Math.min(...gs), Math.max(...gs)];
      }
      const top = b.max[1];
      // Under the floor, over a head, or a top no higher: on the relief a slab at its height (both
      // are floor there: a slab half under the ground would leave a hole), on a brush one of the
      // same height listed after this one (one rectangle is enough).
      if (top < lo - 0.05 || b.min[1] >= hi + PLAYER_H - 0.05) {
        continue;
      }
      if (top <= hi + 1e-3 && (r || !(top >= y - 1e-3 && i < self))) {
        continue;
      }
      const k = top - hi <= STEP_H ? 0 : KEEP;
      rs = rs.flatMap(c => cut(c, [b.min[0] - k, b.min[2] - k, b.max[0] + k, b.max[2] + k]));
    }
    for (const c of merge(rs)) {
      const [x, z] = [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2];
      // A slab the relief buries is no floor.
      if (c[2] - c[0] > 0.1 && c[3] - c[1] > 0.1 && (r || ground(w, x, z) <= y + 0.05)) {
        polys.push({ q: c, y, ...(r ? { r } : {}) });
      }
    }
  };
  brushes.forEach((b, i) => {
    if (b.max[1] > floor) {
      add([b.min[0], b.min[2], b.max[0], b.max[2]], b.max[1], false, i);
    }
  });
  for (const q of lowlands(w)) {
    add(q, 0, true, -1);
  }
  return polys;
};

/** The cells a rectangle touches, `m` metres round it. */
const cells = (q: Rect, m: number, f: (k: number) => void): void => {
  for (let cx = Math.floor((q[0] - m) / CELL); cx <= Math.floor((q[2] + m) / CELL); cx++) {
    for (let cz = Math.floor((q[1] - m) / CELL); cz <= Math.floor((q[3] + m) / CELL); cz++) {
      f(key(cx, cz));
    }
  }
};

/**
 * Joins the rectangles that touch, or face each other across a crack of PORTAL at most, along a
 * side: walked either way when their heights are a step apart, dropped down when the lower is a
 * fall that does not hurt, jumped up onto a box of HOP at most.
 */
const portals = (w: World, polys: Poly[], grid: Map<number, number[]>): Edge[][] => {
  const out: Edge[][] = polys.map(() => []);
  const deep = (0.8 * FALL_SAFE) ** 2 / (2 * gravity(w));
  // The rectangle that last met each: one in several cells is met once.
  const met = new Int32Array(polys.length).fill(-1);
  polys.forEach((pa, i) => {
    cells(pa.q, PORTAL, k => {
      for (const j of grid.get(k) ?? []) {
        if (j <= i || met[j] === i) {
          continue;
        }
        met[j] = i;
        const [a, b] = [pa.q, polys[j].q];
        const gx = Math.max(b[0] - a[2], a[0] - b[2]);
        const gz = Math.max(b[1] - a[3], a[1] - b[3]);
        // Apart along one axis by a crack, overlapping along the other by a span.
        const alongZ = gx > -1e-3 && gx <= PORTAL && gz < -0.1;
        const alongX = gz > -1e-3 && gz <= PORTAL && gx < -0.1;
        if (!alongZ && !alongX) {
          continue;
        }
        // The line between them, and the span of the portal on it.
        const c = alongZ
          ? a[2] <= b[0] + 1e-3
            ? (a[2] + b[0]) / 2
            : (a[0] + b[2]) / 2
          : a[3] <= b[1] + 1e-3
            ? (a[3] + b[1]) / 2
            : (a[1] + b[3]) / 2;
        const [s0, s1] = alongZ
          ? [Math.max(a[1], b[1]), Math.min(a[3], b[3])]
          : [Math.max(a[0], b[0]), Math.min(a[2], b[2])];
        const m = (s0 + s1) / 2;
        const at = (s: number): [number, number] => (alongZ ? [c, s] : [s, c]);
        const [mx, mz] = at(m);
        const dy = heightAt(w, polys[j], mx, mz) - heightAt(w, pa, mx, mz);
        const [pa0, pa1] = [at(s0), at(s1)];
        const join = (from: number, to: number, pass: number) =>
          out[from].push({ to, a: pa0, b: pa1, pass, cost: 0 });
        if (Math.abs(dy) <= STEP_H + 0.05) {
          join(i, j, PASS.WALK);
          join(j, i, PASS.WALK);
        } else {
          const [up, down] = dy > 0 ? [j, i] : [i, j];
          // How far a body goes on over each floor past the portal.
          const depth = (k: number) => {
            const q = polys[k].q;
            return alongZ ? q[2] - q[0] : q[3] - q[1];
          };
          if (Math.abs(dy) <= DROP || (Math.abs(dy) <= deep && depth(down) >= SPAN)) {
            join(up, down, PASS.DROP);
          }
          if (Math.abs(dy) <= HOP && depth(up) >= HOP_DEPTH) {
            join(down, up, PASS.HOP);
          }
        }
      }
    });
  });
  return out;
};

/** A rectangle with (x, z) on or within `m` of it and its floor the highest not over y + 0.6, else -1. */
const under = (nav: Nav, w: World, x: number, y: number, z: number, m: number): number => {
  let best = -1;
  let top = -Infinity;
  for (const i of nav.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
    const p = nav.polys[i];
    const q = p.q;
    if (x < q[0] - m || x > q[2] + m || z < q[1] - m || z > q[3] + m) {
      continue;
    }
    const h = heightAt(w, p, Math.min(Math.max(x, q[0]), q[2]), Math.min(Math.max(z, q[1]), q[3]));
    if (h <= y + 0.6 && h > top) {
      [best, top] = [i, h];
    }
  }
  return best;
};

/** The point of a rectangle nearest (x, z), on its floor. */
const onto = (w: World, p: Poly, x: number, z: number): Vec3 => {
  const [cx, cz] = [Math.min(Math.max(x, p.q[0]), p.q[2]), Math.min(Math.max(z, p.q[1]), p.q[3])];
  return [cx, heightAt(w, p, cx, cz), cz];
};

/** Metres to the nearest floor of a body on none, and how far above and below him it may be. */
const NEAR = 6;
const ABOVE = 2.2;
const BELOW = 8;

/**
 * The rectangle a body at `v` stands on, or the nearest one within NEAR metres, at most ABOVE over
 * it and BELOW under it, as (index, the point of it to walk to); -1 when none.
 */
export const locate = (nav: Nav, w: World, v: Vec3): [number, Vec3] => {
  const i = under(nav, w, v[0], v[1], v[2], PLAYER_R);
  if (i >= 0 && heightAt(w, nav.polys[i], v[0], v[2]) > v[1] - 1.5) {
    return [i, onto(w, nav.polys[i], v[0], v[2])];
  }
  let best = -1;
  let least = Infinity;
  let pt: Vec3 = v;
  const seen = new Set<number>();
  cells([v[0], v[2], v[0], v[2]], NEAR, k => {
    for (const j of nav.grid.get(k) ?? []) {
      if (seen.has(j)) {
        continue;
      }
      seen.add(j);
      const o = onto(w, nav.polys[j], v[0], v[2]);
      const d = flat(v[0], v[2], o[0], o[2]) + Math.abs(o[1] - v[1]);
      if (d < least && o[1] - v[1] <= ABOVE && v[1] - o[1] <= BELOW) {
        [best, least, pt] = [j, d, o];
      }
    }
  });
  return [least <= NEAR ? best : -1, pt];
};

/**
 * Adds a route's legs from `start` as links: a jump with the run up to it, a slide; the runs
 * between are the mesh's. With `toll`, the first is a crossing's (see Edge.toll).
 */
const links = (nav: Nav, w: World, start: Vec3, legs: Leg[], route = -1, toll = false): void => {
  let at = start;
  legs.forEach((l, k) => {
    const next = legs[k + 1];
    if (l.k === 'go' && next?.k === 'leap' && next.sprint) {
      return;
    }
    const run = legs[k - 1]?.k === 'go' && l.k === 'leap' && l.sprint;
    // A run-up's start: the run before the jump left `at` where it was.
    const from = at;
    if (l.k !== 'go') {
      const [i] = locate(nav, w, from);
      const [j] = locate(nav, w, end(l));
      if (i >= 0 && j >= 0) {
        const tricky = l.k === 'leap' && (l.dash !== undefined || l.double !== undefined || l.run);
        const pts = run ? [from, end(legs[k - 1]), end(l)] : [from, end(l)];
        let len = 0;
        for (let n = 1; n < pts.length; n++) {
          len += flat(pts[n - 1][0], pts[n - 1][2], pts[n][0], pts[n][2]);
        }
        nav.out[i].push({
          to: j,
          from,
          end: end(l),
          legs: run ? [legs[k - 1], l] : [l],
          route,
          cost: len / PACE + (tricky ? TRICK : LEAP),
          ...(toll && k === 0 ? { toll } : {}),
        });
      }
    }
    at = end(l);
  });
};

const build = (w: World): Nav => {
  const polys = floors(w);
  const grid = new Map<number, number[]>();
  polys.forEach((p, i) =>
    cells(p.q, PORTAL, k => {
      const list = grid.get(k);
      if (list) {
        list.push(i);
      } else {
        grid.set(k, [i]);
      }
    }),
  );
  const route = new Int8Array(polys.length).fill(-1);
  const nav: Nav = { polys, out: portals(w, polys, grid), grid, route };
  if (w.def === HIGHLINE) {
    const [red] = w.def.teams;
    for (const f of [(l: Leg) => l, flip]) {
      const z = (p: Vec3): Vec3 => (f === flip ? [p[0], p[1], 240 - p[2]] : p);
      ROUTES.forEach((r, k) => {
        const [sx, sy, sz] = red.spawns[r.start];
        links(nav, w, z([sx, sy, sz]), r.out.map(f), k);
        if (r.flag.length) {
          links(nav, w, z(red.base), [...r.flag, ...r.out].map(f), k);
        }
        links(nav, w, z(r.mid), r.in.map(f), k);
      });
      for (const u of Object.values(UP)) {
        links(nav, w, z(u.from), u.legs.map(f));
      }
    }
  }
  if (w.def === MOON) {
    // A rectangle across the rille's middle line, within one of them.
    polys.forEach(({ q }, i) => {
      const a = ACROSS.find(([x0, x1]) => q[0] < x1 && q[2] > x0 && q[1] < 140 && q[3] > 140);
      if (a) {
        route[i] = a[2];
      }
    });
    for (const [k, [x, y, z], legs] of CROSSINGS) {
      links(nav, w, [x, y, z], legs, k, true);
      links(
        nav,
        w,
        [x, y, 280 - z],
        legs.map(l => mirror(l, 280)),
        k,
        true,
      );
    }
  }
  return nav;
};

const built = new WeakMap<World, Nav>();

/** Whether the bots' map of a world is built. */
export const navBuilt = (w: World): boolean => built.has(w);

/** The bots' map of a world, built once per world. */
export const navOf = (w: World): Nav => {
  let nav = built.get(w);
  if (!nav) {
    nav = build(w);
    built.set(w, nav);
  }
  return nav;
};

/** Twice the signed area of the triangle a, b, c on the floor plane. */
const area = (a: number[], b: number[], c: number[]): number =>
  (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]);

/**
 * The corners of the shortest line from `s` to `t` through the portals, each [left, right] as one
 * goes (the simple stupid funnel algorithm), `t` last.
 */
export const funnel = (s: number[], ports: [number[], number[]][], t: number[]): number[][] => {
  const ps: [number[], number[]][] = [...ports, [t, t]];
  const out: number[][] = [];
  let [apex, left, right] = [s, s, s];
  let [ai, li, ri] = [-1, -1, -1];
  for (let i = 0; i < ps.length; i++) {
    const [l, r] = ps[i];
    if (area(apex, right, r) <= 0) {
      if (apex === right || area(apex, left, r) > 0) {
        [right, ri] = [r, i];
      } else {
        out.push(left);
        [apex, ai] = [left, li];
        [left, right, ri] = [apex, apex, ai];
        i = ai;
        continue;
      }
    }
    if (area(apex, left, l) >= 0) {
      if (apex === left || area(apex, right, l) < 0) {
        [left, li] = [l, i];
      } else {
        out.push(right);
        [apex, ai] = [right, ri];
        [left, right, li] = [apex, apex, ai];
        i = ai;
        continue;
      }
    }
  }
  if (out.at(-1) !== t) {
    out.push(t);
  }
  return out;
};

/** A binary heap of indices by cost, smallest first. */
const pop = (h: number[], f: Float64Array): number => {
  const top = h[0];
  const last = h.pop()!;
  if (h.length) {
    let i = 0;
    for (;;) {
      const [l, r] = [2 * i + 1, 2 * i + 2];
      let m = i;
      if (l < h.length && f[h[l]] < f[last] && (r >= h.length || f[h[l]] <= f[h[r]])) {
        m = l;
      } else if (r < h.length && f[h[r]] < f[last]) {
        m = r;
      }
      if (m === i) {
        break;
      }
      h[i] = h[m];
      i = m;
    }
    h[i] = last;
  }
  return top;
};
const push = (h: number[], f: Float64Array, v: number): void => {
  let i = h.push(v) - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (f[h[p]] <= f[v]) {
      break;
    }
    h[i] = h[p];
    i = p;
  }
  h[i] = v;
};

/** The point of the segment a b nearest (x, z). */
const nearest = (a: number[], b: number[], x: number, z: number): [number, number] => {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.min(
    Math.max(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0),
    1,
  );
  return [a[0] + dx * t, a[1] + dz * t];
};

/**
 * The points a bot goes through from `a` to `b`, the last `b` or, when no way gets there, the
 * nearest point it can get to. The links of the routes other than `prefer` (an index of ROUTES)
 * cost more, so bots that prefer different ones spread over the map. Off the mesh, `b` alone.
 */
export const path = (nav: Nav, w: World, a: Vec3, b: Vec3, prefer = -1): Step[] => {
  const [s, sp] = locate(nav, w, a);
  const [t, tp] = locate(nav, w, b);
  if (s < 0) {
    return [{ to: b }];
  }
  const n = nav.polys.length;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const prev = new Array<Edge | undefined>(n);
  const back = new Int32Array(n).fill(-1);
  const at = new Float64Array(2 * n);
  const done = new Uint8Array(n);
  const h = (i: number) => flat(at[2 * i], at[2 * i + 1], b[0], b[2]) / PACE;
  g[s] = flat(a[0], a[2], sp[0], sp[2]) / PACE;
  [at[2 * s], at[2 * s + 1]] = [sp[0], sp[2]];
  f[s] = g[s] + h(s);
  const heap = [s];
  // The rectangle nearest b reached so far, for a goal no way gets to.
  let close = s;
  while (heap.length) {
    const i = pop(heap, f);
    if (done[i]) {
      continue;
    }
    done[i] = 1;
    if (h(i) < h(close)) {
      close = i;
    }
    if (i === t) {
      break;
    }
    const [x, z] = [at[2 * i], at[2 * i + 1]];
    for (const e of nav.out[i]) {
      if (done[e.to]) {
        continue;
      }
      let c: number;
      let p: [number, number];
      if (e.legs) {
        const [fx, , fz] = e.from!;
        // Its own route's links cheaper, the others' dearer: the walks between are everyone's.
        const other = e.route! < 0 || prefer < 0 ? 1 : e.route === prefer ? 1 / OTHER : OTHER;
        c =
          flat(x, z, fx, fz) / PACE +
          e.cost * other * (1 + (e.fails ?? 0)) +
          (e.toll && other > 1 ? AREA : 0);
        p = [e.end![0], e.end![2]];
      } else {
        p = nearest(e.a!, e.b!, x, z);
        const r = nav.route[e.to];
        c =
          flat(x, z, p[0], p[1]) / PACE +
          (e.pass === PASS.HOP ? HOP_COST : e.pass ? DOWN : 0) +
          (r >= 0 && prefer >= 0 && r !== prefer && nav.route[i] !== r ? AREA : 0);
      }
      if (g[i] + c < g[e.to]) {
        g[e.to] = g[i] + c;
        prev[e.to] = e;
        back[e.to] = i;
        [at[2 * e.to], at[2 * e.to + 1]] = p;
        f[e.to] = g[e.to] + h(e.to);
        push(heap, f, e.to);
      }
    }
  }
  const goal = t >= 0 && done[t] ? t : close;
  // On the floor it stands on, b itself; else the nearest point of the floor got to.
  const target =
    goal !== t
      ? onto(w, nav.polys[goal], b[0], b[2])
      : flat(b[0], b[2], tp[0], tp[2]) < 0.5
        ? b
        : tp;
  const edges: Edge[] = [];
  for (let i = goal; i !== s && prev[i]; i = back[i]) {
    edges.unshift(prev[i]!);
  }
  // The walks between the links, pulled straight through their portals.
  const steps: Step[] = [];
  let from: Vec3 = a;
  let polyAt = s;
  let ports: [number[], number[]][] = [];
  let heights: number[] = [];
  const walk = (to: Vec3) => {
    const pts = funnel([from[0], from[2]], ports, [to[0], to[2]]);
    for (const [k, q] of pts.entries()) {
      if (k < pts.length - 1) {
        const y = heights[ports.findIndex(pt => pt[0] === q || pt[1] === q)] ?? to[1];
        steps.push({ to: [q[0], y, q[1]] });
      }
    }
    steps.push({ to });
    ports = [];
    heights = [];
  };
  for (const e of edges) {
    if (e.legs) {
      // A link that starts where the last one ended is flown on from it: a walk to its point would
      // run a body off a stone.
      const [fx, , fz] = e.from!;
      if (ports.length || !steps.at(-1)?.leg || flat(from[0], from[2], fx, fz) > 1) {
        // A jump with no run of its own is come at along its way, from RUN_IN back on the same floor.
        const l = e.legs[0];
        if (l.k === 'leap') {
          const d = flat(l.at[0], l.at[1], l.to[0], l.to[1]) || 1;
          const [rx, rz] = [
            fx - ((l.to[0] - l.at[0]) / d) * RUN_IN,
            fz - ((l.to[1] - l.at[1]) / d) * RUN_IN,
          ];
          // Floor all along the run-in, at the take-off's height: no gap, no wall's lee to cross.
          let level = true;
          for (let u = 0; u <= 1 && level; u += 0.25) {
            const [ux, uz] = [rx + (fx - rx) * u, rz + (fz - rz) * u];
            const k = under(nav, w, ux, e.from![1], uz, 0);
            level = k >= 0 && Math.abs(heightAt(w, nav.polys[k], ux, uz) - e.from![1]) < 0.3;
          }
          if (level) {
            walk([rx, e.from![1], rz]);
            from = [rx, e.from![1], rz];
          }
        }
        walk(e.from!);
      }
      for (const l of e.legs) {
        steps.push({ to: end(l), leg: l, edge: e });
      }
      from = e.end!;
    } else {
      // Left and right as the body goes from the middle of one rectangle to the next.
      const [p, q] = [nav.polys[polyAt].q, nav.polys[e.to].q];
      const [dx, dz] = [(q[0] + q[2] - p[0] - p[2]) / 2, (q[1] + q[3] - p[1] - p[3]) / 2];
      const [ax, az] = e.a!;
      const [bx, bz] = e.b!;
      // Each end drawn in, so the line pulled through keeps off the edge of a roof at a run.
      const len = flat(ax, az, bx, bz);
      const k = Math.min(EDGE, len * 0.4) / (len || 1);
      const ea = [ax + (bx - ax) * k, az + (bz - az) * k];
      const eb = [bx - (bx - ax) * k, bz - (bz - az) * k];
      const right = dx * (eb[1] - ea[1]) - dz * (eb[0] - ea[0]) < 0;
      ports.push(right ? [ea, eb] : [eb, ea]);
      heights.push(heightAt(w, nav.polys[e.to], (ax + bx) / 2, (az + bz) / 2));
    }
    polyAt = e.to;
  }
  walk(target);
  return steps;
};
