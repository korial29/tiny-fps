import { describe, expect, it } from 'vitest';
import { FLYER_H, FLYER_R, PLAYER_H, PLAYER_R, WALKER_H, WALKER_R } from '../shared/constants';
import { MONSTER } from '../shared/types';
import type { Monster, PlayerState } from '../shared/types';
import { STRIDE } from './mesh';
import { CHUNKS, GAIT, bullet, flyer, follow, pace, soldier, strike, walker } from './monsters';
import type { Gait } from './monsters';

const mob = (kind: number, o: Partial<Monster> = {}): Monster => ({
  id: 16,
  kind,
  x: 5,
  y: 1,
  z: -3,
  yaw: 0,
  chase: false,
  ...o,
});
const build = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  return out;
};
const walked = (d: number, blow = 0, o?: Partial<Monster>, pace = 1) =>
  build(out => walker(out, mob(MONSTER.WALKER, o), d, blow, pace));
/** The vertices from box `from` (36 vertices each) up to box `to`, as [x, y, z, layer, r]. */
const boxes = (v: number[], from: number, to: number) =>
  Array.from({ length: Math.ceil((to - from) * 36) }, (_, i) => {
    const k = (from * 36 + i) * STRIDE;
    return v.slice(k, k + STRIDE);
  });
/** Vertices `from` to `to` of a model, as [x, y, z, layer, r] after the position and normal. */
const rows = (v: number[], from = 0, to = v.length / STRIDE) =>
  Array.from({ length: to - from }, (_, i) => {
    const k = (from + i) * STRIDE;
    return [v[k], v[k + 1], v[k + 2], v[k + 8], v[k + 6], v[k + 7], v[k + 9]];
  });
const mean = (v: number[][], i: number) => v.reduce((s, p) => s + p[i], 0) / v.length;
const lowest = (v: number[][]) => v.filter(p => p[1] < Math.min(...v.map(q => q[1])) + 0.01);
/** Where the walker's vertices sit: torso, head, then per side (left, right) these runs. */
const W = {
  torso: [0, 180],
  head: [180, 372],
  left: 372,
  right: 924,
  // Offsets inside a side: thigh, shin, foot, upper arm, forearm, shoulder spike, eye.
  thigh: [0, 90],
  shin: [90, 180],
  foot: [180, 216],
  upper: [216, 306],
  fore: [306, 456],
  spike: [456, 516],
  eye: [516, 552],
} as const;
const part = (v: number[], side: number, [a, b]: readonly number[]) => rows(v, side + a, side + b);

describe('follow', () => {
  const step = (book: Map<number, Gait>, x: number, dt = 1 / 60) => follow(book, 1, x, 0, dt);

  it('adds up the distance, and a jump of metres is not a walk', () => {
    const book = new Map<number, Gait>();
    step(book, 0);
    step(book, 0.3);
    expect(step(book, 0.5).walked).toBeCloseTo(0.5);
    expect(step(book, 40).walked).toBeCloseTo(0.5);
    expect(step(book, 40.2).walked).toBeCloseTo(0.7);
  });

  it('eases toward the speed it is going, and back to rest', () => {
    const book = new Map<number, Gait>();
    let x = 0;
    for (let i = 0; i < 30; i++) {
      step(book, (x += 0.05));
    }
    expect(pace(book.get(1)!)).toBe(1);
    for (let i = 0; i < 60; i++) {
      step(book, x);
    }
    expect(pace(book.get(1)!)).toBeLessThan(0.01);
  });

  it('keeps the speed when no time has passed', () => {
    const book = new Map<number, Gait>();
    step(book, 0);
    step(book, 0.05);
    const v = book.get(1)!.vx;
    step(book, 0.1, 0);
    expect(book.get(1)!.vx).toBe(v);
  });
});

describe('walker', () => {
  it('is 1476 vertices: torso, head, and per side two leg parts, a foot, two arm parts, a spike, an eye', () => {
    expect(walked(0)).toHaveLength(1476 * STRIDE);
  });

  it('fits its cylinder, feet on the floor, and the eyes alone glow', () => {
    const v = rows(walked(0));
    expect(Math.min(...v.map(p => p[1]))).toBeCloseTo(1, 1);
    expect(Math.max(...v.map(p => p[1]))).toBeCloseTo(1 + WALKER_H, 1);
    expect(Math.max(...v.map(p => p[1]))).toBeLessThanOrEqual(1 + WALKER_H + 1e-6);
    for (const p of v) {
      expect(Math.hypot(p[0] - 5, p[2] + 3)).toBeLessThan(WALKER_R * 1.2);
    }
    for (const side of [W.left, W.right]) {
      expect(part(walked(0), side, [0, W.eye[0]]).every(p => p[3] == -1)).toBe(true);
      const eye = part(walked(0), side, W.eye);
      expect(eye.every(p => p[3] == -2)).toBe(true);
      expect(eye.every(p => p[4] > 2 * p[5] && p[4] > 2 * p[6])).toBe(true);
    }
    expect(rows(walked(0), 0, 372).every(p => p[3] == -1)).toBe(true);
  });

  it('looks along forward(yaw)', () => {
    const eyes = (o?: Partial<Monster>) => part(walked(0, 0, o), W.left, W.eye);
    expect(mean(eyes(), 2)).toBeLessThan(-3);
    expect(mean(eyes({ yaw: Math.PI / 2 }), 0)).toBeLessThan(5);
    expect(mean(eyes({ yaw: Math.PI / 2 }), 2)).toBeCloseTo(-3, 0);
  });

  it('hunches forward: the head is ahead of the feet', () => {
    expect(mean(rows(walked(0), ...W.head), 2)).toBeLessThan(-3.1);
  });

  it('swings the legs with the distance walked, one against the other', () => {
    const [still, a] = [walked(0), walked(0.2)];
    const foot = (v: number[], side: number) => lowest(part(v, side, W.shin));
    // The feet of a leg swing about its hip: forward is -z.
    expect(mean(foot(a, W.left), 2)).toBeLessThan(mean(foot(still, W.left), 2) - 0.1);
    expect(mean(foot(a, W.right), 2)).toBeGreaterThan(mean(foot(still, W.right), 2) + 0.1);
  });

  it('bends the knees as a leg trails, and keeps them straight standing', () => {
    const reach = (v: number[], d: number) => {
      const shin = part(v, W.left, W.shin);
      const [hx, hy, hz] = [4.86, 1.88 - 0.1 * Math.sin(d * GAIT) ** 2, -3.02];
      return Math.max(...shin.map(p => Math.hypot(p[0] - hx, p[1] - hy, p[2] - hz)));
    };
    expect(reach(walked(0), 0)).toBeGreaterThan(0.88);
    expect(reach(walked(1.17), 1.17)).toBeLessThan(0.86);
    expect(reach(walked(1.17, 0, undefined, 0), 0)).toBeGreaterThan(0.88);
  });

  it('does not move the limbs of a body that stands, whatever its distance', () => {
    expect(walked(0.77, 0, undefined, 0)).toEqual(walked(0, 0, undefined, 0));
    expect(walked(0.77)).not.toEqual(walked(0));
  });

  it('swings the arms against the legs on the same side', () => {
    const [still, a] = [walked(0), walked(0.2)];
    const dz = (side: number, r: readonly number[]) =>
      mean(lowest(part(a, side, r)), 2) - mean(lowest(part(still, side, r)), 2);
    // Left leg and right arm go together: forward and back, then the other pair.
    expect(Math.sign(dz(W.left, W.shin))).toBe(Math.sign(dz(W.right, W.fore)));
    expect(Math.sign(dz(W.left, W.shin))).toBe(-Math.sign(dz(W.left, W.fore)));
  });

  it('glows brighter, and bigger, while chasing', () => {
    const eye = (o?: Partial<Monster>) => part(walked(0, 0, o), W.left, W.eye);
    const [calm, chase] = [eye(), eye({ chase: true })];
    expect(chase[0][4]).toBeGreaterThan(calm[0][4]);
    expect(chase[0][5]).toBeGreaterThan(calm[0][5]);
    const w = (v: number[][]) => Math.max(...v.map(p => p[0])) - Math.min(...v.map(p => p[0]));
    expect(w(chase)).toBeGreaterThan(w(calm));
  });
});

describe('a blow', () => {
  const fist = (blow: number) => lowest(part(walked(0, blow), W.right, W.fore));

  it('winds the arm up and back, strikes it down and forward, then settles', () => {
    expect(strike(0.2)).toBeGreaterThan(1.5);
    expect(strike(0.4)).toBeGreaterThan(strike(0.2));
    expect(strike(0.6)).toBeLessThan(strike(0.4) - 0.5);
    expect(Math.abs(strike(1))).toBeLessThan(1e-9);
    // The fist goes up while winding, then drops below that and ahead of where it was.
    expect(mean(fist(0.38), 1)).toBeGreaterThan(mean(fist(0), 1) + 0.6);
    expect(mean(fist(0.7), 1)).toBeLessThan(mean(fist(0.38), 1) - 0.5);
    expect(mean(fist(0.7), 2)).toBeLessThan(mean(fist(0), 2) - 0.1);
    expect(walked(0, 1)).toEqual(walked(0, 0));
  });

  it('leans the body back while the arm is up, and leaves the legs alone', () => {
    const [rest, up] = [walked(0), walked(0, 0.38)];
    expect(mean(rows(up, ...W.head), 2)).toBeGreaterThan(mean(rows(rest, ...W.head), 2) + 0.05);
    for (const side of [W.left, W.right]) {
      expect(part(up, side, [0, 216])).toEqual(part(rest, side, [0, 216]));
    }
    expect(part(up, W.right, W.fore)).not.toEqual(part(rest, W.right, W.fore));
  });
});

describe('flyer', () => {
  const verts = (t: number, o?: Partial<Monster>, vx = 0, vz = 0) =>
    build(out => flyer(out, mob(MONSTER.FLYER, o), t, vx, vz));
  /** Vertex runs: the pod, the stinger, the eye, then four membranes of two quads, both faces. */
  const [POD, STING, EYE] = [420, 480, 516];

  it('is 612 vertices: a lathed pod, a stinger, an eye and four membranes, the eye alone glowing', () => {
    const v = verts(0);
    expect(v).toHaveLength(612 * STRIDE);
    const layers = rows(v).map(p => p[3]);
    expect(layers.slice(STING, EYE).every(l => l == -2)).toBe(true);
    expect(layers.filter(l => l == -2)).toHaveLength(36);
  });

  it('floats about FLYER_R wide and FLYER_H tall above its underside', () => {
    const pod = rows(verts(0, { id: 0 }), 0, POD);
    expect(Math.min(...pod.map(p => p[1]))).toBeCloseTo(1);
    expect(Math.max(...pod.map(p => p[1]))).toBeCloseTo(1 + FLYER_H);
    expect(Math.max(...pod.map(p => Math.hypot(p[0] - 5, p[2] + 3)))).toBeCloseTo(FLYER_R, 1);
  });

  it('bobs on a slow sine', () => {
    const low = (t: number) => Math.min(...rows(verts(t), 0, POD).map(p => p[1]));
    const seen = [0, 0.4, 0.8, 1.2, 1.6].map(low);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.04);
    expect(Math.max(...seen)).toBeLessThan(1.07);
    expect(Math.min(...seen)).toBeGreaterThan(0.93);
  });

  it('flaps its membranes: their tips rise and fall against the pod', () => {
    const tip = (t: number) => {
      const v = verts(t, { id: 0 });
      const wings = rows(v, EYE).map(p => p[1]);
      const pod = rows(v, 0, POD).map(p => p[1]);
      return Math.max(...wings) - Math.min(...pod);
    };
    const seen = [0, 0.05, 0.1, 0.15, 0.2, 0.25].map(tip);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.2);
  });

  it('stands upright still, and leans toward where it goes', () => {
    const top = (v: number[]) => {
      const pod = rows(v, 0, POD);
      const [hi, lo] = [Math.max(...pod.map(p => p[1])), Math.min(...pod.map(p => p[1]))];
      const end = (f: (p: number[]) => boolean) => pod.filter(f);
      return [end(p => p[1] > hi - 0.1), end(p => p[1] < lo + 0.1)] as const;
    };
    const lean = (v: number[], i: number) => {
      const [hi, lo] = top(v);
      return mean(hi, i) - mean(lo, i);
    };
    const still = verts(0);
    expect(Math.abs(lean(still, 0))).toBeLessThan(1e-6);
    expect(Math.abs(lean(still, 2))).toBeLessThan(1e-6);
    // Yaw 0 looks toward -z, right is +x.
    expect(lean(verts(0, {}, 0, -3.5), 2)).toBeLessThan(-0.08);
    expect(lean(verts(0, {}, 3.5, 0), 0)).toBeGreaterThan(0.08);
    // Turned a quarter, the same speed leans the other axis.
    expect(lean(verts(0, { yaw: Math.PI / 2 }, -3.5, 0), 0)).toBeLessThan(-0.08);
    expect(lean(verts(0, {}, 0, 3.5), 2)).toBeGreaterThan(0.08);
  });

  it('keeps the pod whole: it only turns about its middle', () => {
    const pod = rows(verts(0, { id: 0 }, 0, -3.5), 0, POD);
    expect(Math.min(...pod.map(p => p[1]))).toBeGreaterThan(1);
    expect(Math.max(...pod.map(p => p[1]))).toBeLessThan(1 + FLYER_H);
  });

  it('glows brighter while chasing, and its eye faces yaw', () => {
    const eye = (o?: Partial<Monster>) => rows(verts(0, o), 480, EYE);
    expect(eye({ chase: true })[0][4]).toBeGreaterThan(eye()[0][4]);
    expect(mean(eye(), 2)).toBeLessThan(-3);
    expect(mean(eye({ yaw: Math.PI }), 2)).toBeGreaterThan(-3);
  });
});

describe('soldier', () => {
  const man = (o: Partial<PlayerState> = {}): PlayerState => ({
    id: 1,
    x: 5,
    y: 1,
    z: -3,
    vy: 0,
    yaw: 0,
    pitch: 0,
    ground: true,
    cool: 0,
    ...o,
  });
  const GREEN = [0.1, 0.8, 0.2];
  // One gun vertex a metre ahead of its origin, to see where the hands carry the gun.
  const GUN = [[0, 0, -1, 0, 0, 1, 0.5, 0.5, -1, 0.5]];
  const dressed = (o?: Partial<PlayerState>, d = 0, pc = 1, gun: number[][] = []) =>
    build(out => soldier(out, man(o), GREEN, d, pc, gun));
  /** Vertex runs: torso, helmet, visor, pack, then per side leg (thigh, shin, boot) and arm (upper, forearm). */
  const [VISOR, SIDE] = [372, 444];
  const side = (n: number) => SIDE + n * 456;

  it('is 1356 vertices, and a gun adds its own', () => {
    expect(dressed()).toHaveLength(1356 * STRIDE);
    expect(dressed(undefined, 0, 1, GUN)).toHaveLength(1357 * STRIDE);
  });

  it('stands PLAYER_H tall on its feet, torso, head and legs inside PLAYER_R', () => {
    const v = rows(dressed());
    expect(Math.min(...v.map(p => p[1]))).toBeCloseTo(1, 1);
    expect(Math.max(...v.map(p => p[1]))).toBeCloseTo(1 + PLAYER_H, 1);
    expect(Math.max(...v.map(p => p[1]))).toBeLessThanOrEqual(1 + PLAYER_H + 1e-6);
    const core = [
      ...v.slice(0, 444),
      ...v.slice(side(0), side(0) + 216),
      ...v.slice(side(1), side(1) + 216),
    ];
    for (const p of core) {
      expect(Math.hypot(p[0] - 5, p[2] + 3)).toBeLessThan(PLAYER_R * 1.2);
    }
  });

  it('wears a visor in its colour: the one thing that glows, ahead of the face', () => {
    const v = rows(dressed());
    const visor = v.slice(VISOR, VISOR + 36);
    expect(visor.every(p => p[3] == -2)).toBe(true);
    expect(v.filter(p => p[3] == -2)).toHaveLength(36);
    expect(visor[0][5]).toBeGreaterThan(visor[0][4]);
    expect(visor[0][5]).toBeGreaterThan(GREEN[1] * 0.9);
    expect(visor[0][4]).toBeGreaterThan(GREEN[0]);
    expect(mean(visor, 2)).toBeLessThan(-3);
    expect(mean(rows(dressed({ yaw: Math.PI / 2 })).slice(VISOR, VISOR + 36), 0)).toBeLessThan(5);
  });

  it('paints the torso in the colour and the rest darker', () => {
    const v = rows(dressed());
    expect(v[0].slice(4)).toEqual([GREEN[0], GREEN[1], GREEN[2]]);
    expect(v[side(0)][5]).toBeLessThan(GREEN[1]);
  });

  it('strides with the distance walked, not when standing', () => {
    const foot = (d: number, pc = 1, n = 0) =>
      mean(lowest(rows(dressed(undefined, d, pc)).slice(side(n) + 90, side(n) + 180)), 2);
    expect(foot(0.2)).toBeLessThan(foot(0) - 0.1);
    expect(foot(0.2, 1, 1)).toBeGreaterThan(foot(0, 1, 1) + 0.1);
    expect(dressed(undefined, 0.77, 0)).toEqual(dressed(undefined, 0, 0));
    expect(dressed(undefined, 0.77)).not.toEqual(dressed(undefined, 0));
    expect(rows(dressed(undefined, 1.17)).slice(side(0) + 90, side(0) + 180)).not.toEqual(
      rows(dressed(undefined, 1.17 + 1.75)).slice(side(0) + 90, side(0) + 180),
    );
  });

  it('holds the gun out ahead with both hands, the left further out on it', () => {
    const [a, b] = [dressed(undefined, 0, 1, GUN), dressed()];
    const gun = rows(a, 0, 1357).slice(444, 445);
    // Placed before the legs: the gun vertex is the first after the pack.
    expect(gun[0][2]).toBeLessThan(-3 - 1);
    const reach = (n: number) => Math.min(...rows(b, side(n) + 306, side(n) + 456).map(p => p[2]));
    expect(reach(0)).toBeLessThan(-3 - 0.3);
    expect(reach(1)).toBeLessThan(-3 - 0.2);
    expect(reach(0)).toBeLessThan(reach(1));
  });

  it('aims the gun with the pitch', () => {
    const [flat, up] = [dressed(undefined, 0, 1, GUN), dressed({ pitch: 0.6 }, 0, 1, GUN)];
    expect(rows(up)[444][1]).toBeGreaterThan(rows(flat)[444][1] + 0.4);
    const hand = (v: number[]) => mean(rows(v, side(0) + 307, side(0) + 457), 1);
    expect(hand(up)).toBeGreaterThan(hand(flat));
  });
});

describe('bullet', () => {
  const b = { id: 1, x: 2, y: 1, z: -4 };

  it('is an unlit blob, with a tail behind it when it has a heading', () => {
    const blob = build(out => bullet(out, b));
    expect(blob).toHaveLength(2 * 36 * STRIDE);
    const tail = build(out => bullet(out, b, [0, 0, -1]));
    expect(tail).toHaveLength(4 * 36 * STRIDE);
    for (const v of [blob, tail]) {
      expect(boxes(v, 0, v.length / STRIDE / 36).every(p => p[8] == -2)).toBe(true);
    }
    const behind = boxes(tail, 2, 4);
    expect(Math.min(...behind.map(p => p[2]))).toBeGreaterThan(-4);
    expect(mean(behind, 2)).toBeGreaterThan(-4);
  });
});

describe('chunks', () => {
  it('has a colour list for each monster kind', () => {
    expect(CHUNKS).toHaveLength(2);
    expect(CHUNKS.every(c => c.every(rgb => rgb.length == 3))).toBe(true);
  });
});
