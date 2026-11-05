import { describe, expect, it } from 'vitest';
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import type { PlayerState } from '../shared/types';
import { STRIDE } from './mesh';
import { follow, pace, soldier } from './soldier';
import type { Gait } from './soldier';

const build = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  return out;
};
/** Vertices `from` to `to` of a model, as [x, y, z, layer, r] after the position and normal. */
const rows = (v: number[], from = 0, to = v.length / STRIDE) =>
  Array.from({ length: to - from }, (_, i) => {
    const k = (from + i) * STRIDE;
    return [v[k], v[k + 1], v[k + 2], v[k + 8], v[k + 6], v[k + 7], v[k + 9]];
  });
const mean = (v: number[][], i: number) => v.reduce((s, p) => s + p[i], 0) / v.length;
const lowest = (v: number[][]) => v.filter(p => p[1] < Math.min(...v.map(q => q[1])) + 0.01);
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
