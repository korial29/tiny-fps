import { STRIDE, add, dot, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, axis, mul, rest, slerp, solve } from '../rig';
import type { Quat } from '../rig';
import {
  CANNON_ELBOW,
  CANNON_FOLD,
  CANNON_HINGE,
  CANNON_POST as POST_BASE,
  hunter as hunterModel,
  folded,
} from '../hunter';

import { body } from '../skin';
import type { Out } from '../verts';
import type { Pieces } from '../store';
import { placeRigid } from './reach';
import type { Solved } from './types';

type HunterViewPart = { key: string; joint: number; orientation: number; vertices: number[] };
const hunterViewParts = new Map<string, HunterViewPart[]>();

/** The Hunter's equipment that can be seen from the eye: wrists, shoulder, chest and belt. */
/**
 * A bracer on its first-person forearm at rest, a smooth thick tube (the runner's, cut from
 * his forearm's facets, is angular this close): from the wrist over the whole forearm (BRACER_TOP), each ring an ellipse round the skin's slice there, which holds all of the
 * slice, BRACER_GAP off it; the inner face, then BRACER_THICK out, the outer, and rims at both ends.
 * Its colour and layer are the runner's bracer's (`source`).
 */
const BRACER_GAP = 0.008;
/** The bracer's thickness, its outer face off its inner one. */
const BRACER_THICK = 0.006;
/** How far from the wrist toward the elbow the bracer reaches. */
const BRACER_TOP = 0.8;
/** The share of the bracer, at its elbow's end, over which it slopes down onto the arm. */
const BRACER_BEVEL = 0.035;
/** Where the grooves round the bracer's outer face lie, of the way from the wrist. */
const BRACER_GROOVES = [0.2, 0.4, 0.6, 0.8];
/** A groove's half width (of the bracer's length) and its depth, metres. */
const [GROOVE_W, GROOVE_DEPTH] = [0.02, 0.0025];
/** How far into the skin the sloped end sinks, so no gap shows round it. */
const BRACER_SINK = 0.003;
const fitBracer = (source: number[], build: number, joints: Solved, right: boolean): number[] => {
  const [hand, fore] = right ? [J.HAND_R, J.FOREARM_R] : [J.HAND_L, J.FOREARM_L];
  const skinOf = body(2, build);
  const [wrist, elbow] = [joints.pos[hand], joints.pos[fore]];
  const length = elbow[1] - wrist[1];
  const arm: Vec3[] = [];
  for (let k = 0; k < skinOf.v.length / 6; k++) {
    if (skinOf.j[2 * k] === fore || skinOf.j[2 * k + 1] === fore) {
      arm.push([skinOf.v[6 * k], skinOf.v[6 * k + 1], skinOf.v[6 * k + 2]]);
    }
  }
  // The whole forearm, from the wrist to just short of the elbow's bend.
  const top = BRACER_TOP;
  // Even rings along the bracer, and closer ones over its short slope at the elbow's end.
  // Each groove gets its edges and its floor as rings of their own.
  const fracs = [
    ...Array.from({ length: 12 }, (_, j) => ((1 - BRACER_BEVEL) * j) / 12),
    ...Array.from({ length: 5 }, (_, j) => 1 - BRACER_BEVEL + (BRACER_BEVEL * j) / 4),
    ...BRACER_GROOVES.flatMap(f => [
      f - GROOVE_W,
      f - GROOVE_W / 3,
      f,
      f + GROOVE_W / 3,
      f + GROOVE_W,
    ]),
  ]
    .sort((a, b) => a - b)
    .filter((f, j, all) => !j || f - all[j - 1] > 1e-4);
  // How deep the outer face is grooved at `f` of the way, 0 to 1.
  const groove = (f: number) =>
    Math.max(0, ...BRACER_GROOVES.map(g => 1 - (Math.abs(f - g) / GROOVE_W) ** 2));
  const [rows, sides] = [fracs.length - 1, 28];
  // Each ring: its height, its centre (x, z) and its half axes across and through.
  const rings = Array.from({ length: rows + 1 }, (_, j) => {
    const y = wrist[1] + top * fracs[j] * length;
    // The skin a little above the wrist, clear of the hand's heel.
    const at = wrist[1] + Math.max(0.1 * length, y - wrist[1]);
    // The skin's rings are some 2.5 cm apart: the nearest one or two of them.
    // Its own height too, so the wrist's skin at the bracer's mouth stays inside it.
    const slice = arm.filter(q => Math.min(Math.abs(q[1] - at), Math.abs(q[1] - y)) < 0.026);
    const lo = [0, 2].map(k => Math.min(...slice.map(q => q[k])));
    const hi = [0, 2].map(k => Math.max(...slice.map(q => q[k])));
    const mid = [0, 1].map(k => (lo[k] + hi[k]) / 2);
    const half = [0, 1].map(k => (hi[k] - lo[k]) / 2);
    // The ellipse through the box's sides misses its corners: grown until it holds every point.
    const fit = Math.max(
      1,
      ...slice.map(q => Math.hypot((q[0] - mid[0]) / half[0], (q[2] - mid[1]) / half[1])),
    );
    return { y, mid, half: half.map(h => h * fit) };
  });
  // Neighbouring rings averaged, so the skin's bumps do not dent the tube.
  const even = rings.map((r, j) => {
    const near = rings.slice(Math.max(0, j - 1), j + 2);
    const avg = (f: (x: (typeof rings)[0]) => number[]) =>
      [0, 1].map(k => near.reduce((n, x) => n + f(x)[k], 0) / near.length);
    return { y: r.y, mid: avg(x => x.mid), half: avg(x => x.half) };
  });
  const [r, g, layer, b] = [source[6], source[7], source[8], source[9]];
  const out: number[] = [];
  // Toward the elbow both faces slope down onto the arm and end a little in it (BRACER_SINK), so
  // no gap shows between the bracer's end and the skin: how far each face stands off the skin.
  const bevel = (j: number) => {
    const t = Math.min(1, Math.max(0, (fracs[j] - 1 + BRACER_BEVEL) / BRACER_BEVEL));
    return t * t * (3 - 2 * t);
  };
  const off = (j: number, outer: boolean) => {
    const from = outer ? BRACER_GAP + BRACER_THICK - GROOVE_DEPTH * groove(fracs[j]) : BRACER_GAP;
    return from + (-BRACER_SINK - from) * bevel(j);
  };
  const at = (j: number, i: number, outer: boolean): Vec3 => {
    const { y, mid, half } = even[j];
    const grow = off(j, outer);
    const a = (2 * Math.PI * i) / sides;
    return [mid[0] + (half[0] + grow) * Math.cos(a), y, mid[1] + (half[1] + grow) * Math.sin(a)];
  };
  // The ellipse's normal, tipped up the arm as the face slopes down to it.
  const normal = (j: number, i: number, outer: boolean): Vec3 => {
    const a = (2 * Math.PI * i) / sides;
    const [lo, hi] = [Math.max(0, j - 1), Math.min(rows, j + 1)];
    const slope = (off(hi, outer) - off(lo, outer)) / (even[hi].y - even[lo].y);
    const n = unit([Math.cos(a) / even[j].half[0], 0, Math.sin(a) / even[j].half[1]]);
    return unit([n[0], -slope, n[2]]);
  };
  // A triangle wound to face its first corner's normal.
  const tri = (p: Vec3[], n: Vec3[], shade = [0, 0, 0]) => {
    const [u, w] = [sub(p[1], p[0]), sub(p[2], p[0])];
    const c: Vec3 = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    const order = dot(c, n[0]) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) {
      const dark = 1 - 0.45 * shade[k];
      out.push(...p[k], ...n[k], r * dark, g * dark, layer, b * dark);
    }
  };
  const quad = (p: Vec3[], n: Vec3[], shade = [0, 0, 0, 0]) => {
    tri([p[0], p[1], p[2]], [n[0], n[1], n[2]], [shade[0], shade[1], shade[2]]);
    tri([p[0], p[2], p[3]], [n[0], n[2], n[3]], [shade[0], shade[2], shade[3]]);
  };
  const flip = (n: Vec3): Vec3 => [-n[0], -n[1], -n[2]];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const corners: [number, number][] = [
        [j, i],
        [j, i + 1],
        [j + 1, i + 1],
        [j + 1, i],
      ];
      quad(
        corners.map(([jj, ii]) => at(jj, ii, true)),
        corners.map(([jj, ii]) => normal(jj, ii, true)),
        corners.map(([jj]) => groove(fracs[jj])),
      );
      quad(
        corners.map(([jj, ii]) => at(jj, ii, false)),
        corners.map(([jj, ii]) => flip(normal(jj, ii, false))),
      );
    }
  }
  // The rim at the wrist; the elbow's end has sloped into the arm.
  for (let i = 0; i < sides; i++) {
    const face: Vec3 = [0, -1, 0];
    quad(
      [at(0, i, false), at(0, i + 1, false), at(0, i + 1, true), at(0, i, true)],
      [face, face, face, face],
    );
  }
  return out;
};

export const hunterView = (build: number): HunterViewPart[] => {
  const key = `1:${build}`;
  const cached = hunterViewParts.get(key);
  if (cached) {
    return cached;
  }
  const joints = solve(rest([0, 0, 0], 0, build));
  const at = (name: string) => {
    if (name === 'Belt' || name === 'Flying disc') {
      return J.PELVIS;
    }
    if (name === 'Left bracer') {
      return J.HAND_L;
    }
    if (name === 'Blade cuff') {
      return J.HAND_R;
    }
    return J.CHEST;
  };
  const visible = new Set([
    'Harpoon harness',
    'Blade cuff',
    'Left bracer',
    'Laser saddle',
    'Laser mount',
    'Laser knuckle',
    // Not the shoulder plates: beside the eye, they showed grey in the view's top corners.
    'Belt',
    'Flying disc',
  ]);
  const whole = hunterModel(1);
  // The strips and the tassets under the belt are parts of their own (hunter.ts, stripSwing());
  // in the own view they hang with the belt, one piece.
  const model: typeof whole = {
    ...whole,
    Belt: Object.keys(whole)
      .filter(name => name.startsWith('Belt'))
      .flatMap(name => whole[name]),
  };
  const parts = Object.entries(model)
    .filter(([name]) => visible.has(name))
    .map(([name, source]) => {
      const joint = at(name);
      const wrist = joint === J.HAND_L || joint === J.HAND_R;
      const orientation = wrist ? (joint === J.HAND_L ? J.FOREARM_L : J.FOREARM_R) : joint;
      // The bracelet is drawn on the runner's sculpted, scaled wrist. Rebase
      // its lower rim onto the first-person wrist and let the forearm turn it.
      // The left bracer is first refitted onto the first-person forearm itself.
      // Both bracers (the right one under the blades' housing) are refitted onto the first-person forearms.
      const bracer = name === 'Left bracer' || name === 'Blade cuff';
      const anchor: Vec3 = bracer
        ? joints.pos[joint]
        : wrist
          ? [(joint === J.HAND_L ? -1 : 1) * 0.392 * 1.08, 0.884 * 1.2, -0.002 * 1.104]
          : joints.pos[joint];
      const fit = wrist && !bracer ? 0.78 : 1;
      const rotation = joints.rot[orientation];
      const inverse: Quat = [-rotation[0], -rotation[1], -rotation[2], rotation[3]];
      const vertices = bracer
        ? fitBracer(source, build, joints, joint === J.HAND_R)
        : source.slice();
      for (let i = 0; i < vertices.length; i += STRIDE) {
        const [qx, qy, qz, qw] = inverse;
        const x = (vertices[i] - anchor[0]) * fit,
          y = (vertices[i + 1] - anchor[1]) * fit,
          z = (vertices[i + 2] - anchor[2]) * fit;
        const tx = 2 * (qy * z - qz * y),
          ty = 2 * (qz * x - qx * z),
          tz = 2 * (qx * y - qy * x);
        vertices[i] = x + qw * tx + qy * tz - qz * ty;
        vertices[i + 1] = y + qw * ty + qz * tx - qx * tz;
        vertices[i + 2] = z + qw * tz + qx * ty - qy * tx;
        const nx = vertices[i + 3],
          ny = vertices[i + 4],
          nz = vertices[i + 5];
        const ntx = 2 * (qy * nz - qz * ny),
          nty = 2 * (qz * nx - qx * nz),
          ntz = 2 * (qx * ny - qy * nx);
        vertices[i + 3] = nx + qw * ntx + qy * ntz - qz * nty;
        vertices[i + 4] = ny + qw * nty + qz * ntx - qx * ntz;
        vertices[i + 5] = nz + qw * ntz + qx * nty - qy * ntx;
      }
      return { key: `hunter view ${build} ${name}`, joint, orientation, vertices };
    });
  hunterViewParts.set(key, parts);
  return parts;
};

/** The shoulder cannon's vertices from its hinge, for the own view, made once. */
let cannonBuilt: number[] | undefined;
export const cannonVertices = (): number[] => {
  if (!cannonBuilt) {
    cannonBuilt = hunterModel(1)['Shoulder laser'].slice();
    for (let i = 0; i < cannonBuilt.length; i += STRIDE) {
      for (let k = 0; k < 3; k++) {
        cannonBuilt[i + k] -= CANNON_HINGE[k];
      }
    }
  }
  return cannonBuilt;
};
/**
 * The cannon's post in the own view: it stands on the left shoulder, at SHOULDER in the camera's
 * space (right, up, forward), and is ARM metres long to the cannon's hinge. Stowed, it lies back
 * behind the shoulder, out of sight; out, it swings up and forward so the cannon rides over the
 * left of the view and the post comes in from the bottom left corner, fixed to the shoulder (the
 * user, 2026-11-23). Its turn about the camera's right, ARM_DOWN stowed and ARM_UP out.
 */
const SHOULDER: Vec3 = [-0.39, -0.34, 0.13];
/** How much stouter the post is in the own view than on the runner. */
const POST_THICK = 1.1;
const ARM = 0.4;
const [ARM_DOWN, ARM_UP] = [1.6, -0.46];
/** The post leans in towards the middle of the view as it rises (a turn about the forward axis). */
const LEAN = -0.35;
/** The post's turn in the model's axes when folded out by `f` (0 to 1): its +y to the hinge. */
export const armTurn = (f: number): Quat =>
  mul(axis([1, 0, 0], ARM_DOWN + (ARM_UP - ARM_DOWN) * f), axis([0, 0, 1], LEAN));
/** The cannon's hinge in the camera's space, its post folded out by `f`. */
const hingeAt = (f: number): Vec3 => {
  const t = ARM_DOWN + (ARM_UP - ARM_DOWN) * f;
  const c = Math.cos(LEAN);
  return add(SHOULDER, [-ARM * Math.sin(LEAN), ARM * c * Math.cos(t), -ARM * c * Math.sin(t)]);
};
/**
 * The post's vertices for the own view, made once: the model's 'Laser mount' stretched to ARM
 * along +y, its top at the origin, on its 'Laser saddle', both a little stouter; its 'Laser
 * knuckle' keeps its shape at its place along the arm.
 */
let postBuilt: number[] | undefined;
export const postVertices = (): number[] => {
  if (!postBuilt) {
    const parts = hunterModel(1);
    const u = unit(sub(CANNON_HINGE, POST_BASE));
    const long = Math.hypot(...sub(CANNON_HINGE, POST_BASE));
    const e1 = unit([u[1], -u[0], 0]);
    const e2: Vec3 = [
      e1[1] * u[2] - e1[2] * u[1],
      e1[2] * u[0] - e1[0] * u[2],
      e1[0] * u[1] - e1[1] * u[0],
    ];
    postBuilt = [];
    for (const [name, from, stretch] of [
      ['Laser mount', CANNON_HINGE, ARM / long],
      ['Laser knuckle', CANNON_ELBOW, 1],
      ['Laser saddle', POST_BASE, 1],
    ] as const) {
      // Where `from` goes: the arm's length stretched, so each part keeps its place along it.
      const c = sub(from, CANNON_HINGE);
      const at = (dot(c, u) * ARM) / long;
      const v = parts[name];
      for (let i = 0; i < v.length; i += STRIDE) {
        const d = sub([v[i], v[i + 1], v[i + 2]], from);
        const n: Vec3 = [v[i + 3], v[i + 4], v[i + 5]];
        postBuilt.push(
          (dot(c, e1) + dot(d, e1)) * POST_THICK,
          dot(d, u) * stretch + at,
          (dot(c, e2) + dot(d, e2)) * POST_THICK,
          dot(n, e1),
          dot(n, u),
          dot(n, e2),
          ...v.slice(i + 6, i + STRIDE),
        );
      }
    }
  }
  return postBuilt;
};
/** A direction in the camera's space (right, up, forward) in the model's axes (right, up, back). */
export const model = ([a, b, c]: Vec3): Vec3 => [a, b, -c];
/**
 * The own shoulder cannon, folded out by `k`: its hinge in the camera's space and its turn from
 * the camera's frame. Out, it points from its hinge at what the look meets (`target`).
 */
export const cannonInView = (k: number, target: Vec3): [Vec3, Quat] => {
  const f = folded(k);
  const hinge = hingeAt(f);
  const [dx, dy, dz] = model(unit(sub(target, hinge)));
  const look = mul(axis([0, 1, 0], Math.atan2(-dx, -dz)), axis([1, 0, 0], Math.asin(dy)));
  return [hinge, slerp(axis([1, 0, 0], CANNON_FOLD), look, f)];
};

/** Draws one rigid Hunter part from its rest joint onto the first-person pose. */
export const drawHunterPart = (out: Out, part: HunterViewPart, s: Solved, pieces?: Pieces): void =>
  placeRigid(out, part.key, part.vertices, s.rot[part.orientation], s.pos[part.joint], pieces);
