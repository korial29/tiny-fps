// The bots' map of a world: points on the roofs joined by the legs of routes.ts (jumps, dashes,
// wall-runs, as the tests fly them) and by straight walks along a roof. HIGHLINE has routes, MOON
// lanes written by hand; another map has no points, and a bot runs straight at what it wants.
import { PLAYER_R, STEP_H } from './constants';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { floorAt } from './physics';
import { HIGH, LOW, MID, UP, flip, leap, mirror } from './routes';
import type { Leg } from './routes';
import { ray } from './world';
import type { World } from './world';

export type Vec3 = [number, number, number];

/** A way from one point to another: a leg of a route, or a straight walk when `leg` is absent. */
export interface Edge {
  to: number;
  leg?: Leg;
  /** The route of the leg, an index of ROUTES; -1 for a walk or a way back up. */
  route: number;
  /** Seconds, about. */
  cost: number;
}

export interface Nav {
  nodes: Vec3[];
  /** The ways out of each node. */
  out: Edge[][];
  /** Nodes a straight walk must not end at: the take-off of a run and jump, whose run-up is the leg before it. */
  runUp: Set<number>;
}

/** Metres a second a bot is taken to run, for the costs. */
const PACE = 7;
/** Seconds added to a jump, and to a jump that wants a dash, a double jump or a wall-run. */
const LEAP = 0.5;
const TRICK = 1.5;
/** The longest straight walk between two points, metres. */
const WALK = 30;
/** The most a straight walk steps down, metres: off a plinth, down a short drop. */
const DROP = 2;
/**
 * Metres to the nearest node a bot heads for when no straight walk reaches one (the moon's relief
 * fails most, a stair all), how far above it may be (up a stair, or a ledge to climb) and how far
 * below: a drop that does not hurt at full gravity.
 */
const NEAR = 20;
/** The metres of way a metre of height off a bot counts for, when it picks a node to head for. */
const LEVEL = 3;
const ABOVE = 2.2;
const BELOW = 8;
/** Two points of the routes this close (metres, and in height) are one. */
const SAME = 0.6;

/** The routes, fastest first: the Spine, Midtown, the Lowline. */
export const ROUTES = [HIGH, MID, LOW];
/** A leg of a route the bot does not prefer costs this many times more. */
const OTHER = 3;

/**
 * MOON's lanes in red's half, walked straight from point to point both ways: round the dome on the
 * west (the modules close the east), in at its door to the flag, and across the field to the three
 * crossings of the rille (the bridge, the west jump's run-up, the east stones' lip). Blue's are
 * their mirror across z = 140. Relief and boulders fail walkable(), so these are not checked: a
 * bot jumps what it bumps into.
 */
const LANES: Vec3[][] = [
  [
    [72, 0, 258],
    [80, 0, 269],
    [52, 0, 270],
    [50, 0, 212],
    [80, 0, 208],
    [80, 0, 214.5],
    [80, 0, 224],
    [80, 1, 232],
  ],
  [
    [80, 0, 208],
    [80, 0, 152],
    [80, 0, 140],
  ],
  [
    [50, 0, 212],
    [18, 0, 190],
  ],
  [
    [18, 0, 125],
    [18, 0, 90],
  ],
  [
    [80, 0, 208],
    [128.5, 0, 160],
    [128.5, 0, 150],
  ],
];

/**
 * The jumps over MOON's rille from red's side, as moon.test.ts flies them: the west long jump (a
 * sprint jumped at the lip, a dash late in the air), and the east stones at 1.2, 2.4 and 1.2 m,
 * each a jump that comes down on the stone. Blue's are their mirror. With the bridge (LANES[1]),
 * they are the moon's three routes, an index of ROUTES each, so that bots spread over them.
 */
const BRIDGE = 1;
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
const end = (l: Leg): Vec3 => [l.to[0], l.y, l.to[1]];

/** Where a leg starts its own move: a jump's take-off, a slide's run-in, a run's goal. */
const from = (l: Leg): [number, number] =>
  l.k === 'leap' ? l.at : l.k === 'slide' ? l.from : l.to;

const flat = (a: Vec3 | [number, number], b: Vec3 | [number, number]): number => {
  const [ax, az] = a.length === 3 ? [a[0], a[2]] : a;
  const [bx, bz] = b.length === 3 ? [b[0], b[2]] : b;
  return Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
};

/**
 * Whether a body walks in a straight line from a to b, a step up or a drop of DROP at most: a floor
 * under the middle and both sides of the body every half metre, and nothing in the way at the knees
 * or the head from the height of a.
 */
export const walkable = (w: World, a: Vec3, b: Vec3): boolean => {
  if (b[1] - a[1] > STEP_H || a[1] - b[1] > DROP) {
    return false;
  }
  const d = flat(a, b);
  if (d < 1e-3) {
    return true;
  }
  const [ux, uz] = [(b[0] - a[0]) / d, (b[2] - a[2]) / d];
  const y = Math.min(a[1], b[1]);
  for (const s of [-PLAYER_R, 0, PLAYER_R]) {
    const [ox, oz] = [a[0] - uz * s, a[2] + ux * s];
    for (const h of [STEP_H + 0.1, 1.5]) {
      if (ray(w, [ox, a[1] + h, oz], [ux, 0, uz], d) < d) {
        return false;
      }
    }
    for (let t = 0; t <= d; t += 0.5) {
      if (floorAt(w, ox + ux * t, oz + uz * t, Math.max(a[1], b[1]) + STEP_H) < y - 0.3) {
        return false;
      }
    }
  }
  return true;
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

const build = (w: World): Nav => {
  const nodes: Vec3[] = [];
  const out: Edge[][] = [];
  const runUp = new Set<number>();
  const node = (p: Vec3): number => {
    let i = nodes.findIndex(n => flat(n, p) < SAME && Math.abs(n[1] - p[1]) < SAME);
    if (i < 0) {
      i = nodes.push(p) - 1;
      out.push([]);
    }
    return i;
  };
  const chain = (start: Vec3, legs: Leg[], route = -1): void => {
    let at = node(start);
    for (const l of legs) {
      const to = node(end(l));
      const tricky = l.k === 'leap' && (l.dash !== undefined || l.double !== undefined || l.run);
      const cost =
        (flat(nodes[at], from(l)) + flat(from(l), end(l))) / PACE +
        (l.k === 'go' ? 0 : tricky ? TRICK : LEAP);
      out[at].push({ to, leg: l, route, cost });
      if (l.k === 'leap' && l.sprint && legs[0] !== l) {
        runUp.add(at);
      }
      at = to;
    }
  };
  if (w.def === HIGHLINE) {
    const [red] = w.def.teams;
    for (const f of [(l: Leg) => l, flip]) {
      const z = (p: Vec3): Vec3 => (f === flip ? [p[0], p[1], 240 - p[2]] : p);
      ROUTES.forEach((r, k) => {
        const [sx, sy, sz] = red.spawns[r.start];
        chain(z([sx, sy, sz]), r.out.map(f), k);
        if (r.flag.length) {
          chain(z(red.base), [...r.flag, ...r.out].map(f), k);
        }
        chain(z(r.mid), r.in.map(f), k);
      });
      for (const u of Object.values(UP)) {
        chain(z(u.from), u.legs.map(f));
      }
    }
  }
  if (w.def === MOON) {
    for (const [route, [x, y, z], legs] of CROSSINGS) {
      chain([x, y, z], legs, route);
      chain(
        [x, y, 280 - z],
        legs.map(l => mirror(l, 280)),
        route,
      );
    }
    const lanes = [...LANES, ...LANES.map(l => l.map(([x, y, z]): Vec3 => [x, y, 280 - z]))];
    lanes.forEach((lane, i) => {
      const route = i % LANES.length === BRIDGE ? 0 : -1;
      for (let k = 1; k < lane.length; k++) {
        const [a, b] = [node(lane[k - 1]), node(lane[k])];
        const cost = flat(nodes[a], nodes[b]) / PACE;
        out[a].push({ to: b, route, cost });
        out[b].push({ to: a, route, cost });
      }
    });
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      const d = flat(nodes[i], nodes[j]);
      if (i !== j && !runUp.has(j) && d <= WALK && walkable(w, nodes[i], nodes[j])) {
        out[i].push({ to: j, route: -1, cost: d / PACE });
      }
    }
  }
  return { nodes, out, runUp };
};

/** A way across the map: walk straight to `entry`, follow the edges, then walk straight to the goal. */
export interface Way {
  entry?: Vec3;
  edges: Edge[];
}

/**
 * The node a bot goes to, or from, when no straight walk joins it to the point `p`: among the nodes
 * `ok` takes, within NEAR, the best by `weigh` whose height off `p` a body manages (a stair, a
 * ledge to climb, a drop that does not hurt), `up` 1 when the bot goes from `p` to the node and -1
 * when it goes from the node to `p`; with nothing in the way of the head first, then even hidden.
 * `weigh` takes the way to the node with each metre of height as LEVEL metres: from a beam, a node
 * along it beats one on the roof below, which no step off the beam reaches.
 */
const close = (
  w: World,
  nodes: Vec3[],
  p: Vec3,
  ok: (i: number) => boolean,
  weigh: (d: number, i: number) => number,
  up: number,
): number => {
  for (const clear of [true, false]) {
    let best = -1;
    let least = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const [d, dy] = [flat(p, nodes[i]), (nodes[i][1] - p[1]) * up];
      const [ux, uz] = [(nodes[i][0] - p[0]) / (d || 1), (nodes[i][2] - p[2]) / (d || 1)];
      const head = Math.max(p[1], nodes[i][1]) + 1.5;
      if (
        ok(i) &&
        d < NEAR &&
        dy <= ABOVE &&
        dy >= -BELOW &&
        weigh(d + LEVEL * Math.abs(dy), i) < least &&
        (!clear || ray(w, [p[0], head, p[2]], [ux, 0, uz], d) >= d)
      ) {
        [best, least] = [i, weigh(d + LEVEL * Math.abs(dy), i)];
      }
    }
    if (best >= 0) {
      return best;
    }
  }
  return -1;
};

/**
 * The cheapest way from the point `a` to the point `b`. No entry when `a` walks straight to `b`, or
 * when the map has no way. The legs of the routes other than `prefer` (an index of ROUTES) cost
 * more, so bots that prefer different ones spread over the map. The nodes in `shun` are no entry:
 * the bot could not get to them.
 */
export const path = (
  nav: Nav,
  w: World,
  a: Vec3,
  b: Vec3,
  prefer = -1,
  shun: ReadonlySet<number> = new Set(),
): Way => {
  const { nodes, out, runUp } = nav;
  if (!nodes.length || walkable(w, a, b)) {
    return { edges: [] };
  }
  const n = nodes.length;
  const cost = new Array<number>(n).fill(Infinity);
  const prev = new Array<Edge | undefined>(n);
  const back = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!runUp.has(i) && !shun.has(i) && flat(a, nodes[i]) <= WALK && walkable(w, a, nodes[i])) {
      cost[i] = flat(a, nodes[i]) / PACE;
    }
  }
  // Against a wall the body's sides see into it, on a stair no node is level: the nearest node not
  // too high or too low, with nothing in the way of the head, will do; behind a shuttle or a plinth,
  // the nearest one even hidden, which a bot walks round as it can.
  if (!cost.some(c => c < Infinity)) {
    const first = close(
      w,
      nodes,
      a,
      i => !runUp.has(i) && !shun.has(i),
      d => d,
      1,
    );
    if (first >= 0) {
      cost[first] = flat(a, nodes[first]) / PACE;
    }
  }
  for (;;) {
    let i = -1;
    for (let k = 0; k < n; k++) {
      if (!done[k] && cost[k] < Infinity && (i < 0 || cost[k] < cost[i])) {
        i = k;
      }
    }
    if (i < 0) {
      break;
    }
    done[i] = true;
    for (const e of out[i]) {
      const c = cost[i] + e.cost * (e.route >= 0 && prefer >= 0 && e.route !== prefer ? OTHER : 1);
      if (c < cost[e.to]) {
        cost[e.to] = c;
        prev[e.to] = e;
        back[e.to] = i;
      }
    }
  }
  let best = -1;
  let total = Infinity;
  for (let i = 0; i < n; i++) {
    const c = cost[i] + flat(nodes[i], b) / PACE;
    if (cost[i] < Infinity && c < total && flat(nodes[i], b) <= WALK && walkable(w, nodes[i], b)) {
      [best, total] = [i, c];
    }
  }
  // A goal no node walks straight to (on a plinth, a box, a ledge): the cheapest node close to it, up
  // or down as a start may be. Without it every bot after that goal would run straight at it, across
  // the map, and they would heap up at the first wall on the way.
  if (best < 0) {
    best = close(
      w,
      nodes,
      b,
      i => cost[i] < Infinity,
      (d, i) => cost[i] + d / PACE,
      -1,
    );
  }
  const edges: Edge[] = [];
  let i = best;
  for (; i >= 0 && prev[i]; i = back[i]) {
    edges.unshift(prev[i]!);
  }
  return i < 0 ? { edges: [] } : { entry: nodes[i], edges };
};
