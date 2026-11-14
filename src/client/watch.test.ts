import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { basis } from './mesh';
import { JOINT as J, turn } from './rig';
import { WATCH, animate, soldier, watched } from './soldier';
import type { Runner } from './soldier';

const DT = 1 / 60;
const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 5,
  y: 1,
  z: -3,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const [right, , fwd] = basis(0, 0);
/** Another runner `d` metres away, `a` radians to the right of the first one's aim. */
const other = (a: number, d = 4, o: Partial<PlayerState> = {}) =>
  man({
    id: 2,
    x: 5 + d * (Math.cos(a) * fwd[0] + Math.sin(a) * right[0]),
    z: -3 + d * (Math.cos(a) * fwd[2] + Math.sin(a) * right[2]),
    ...o,
  });
/** Where the first runner's head points and is after `n` frames among `crowd`, and his runner. */
const head = (crowd: PlayerState[], n = 90) => {
  const book = new Map<number, Runner>();
  let s;
  for (let i = 0; i < n; i++) {
    animate(book, crowd, DT);
    s = soldier([], book.get(1)!, [1, 0, 0]);
  }
  return { dir: turn(s!.rot[J.HEAD], [0, 0, -1]), at: s!.pos[J.HEAD], r: book.get(1)! };
};
const angle = (a: number[], b: number[]) =>
  Math.acos(
    Math.min(
      Math.max((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b), -1),
      1,
    ),
  );

describe('the head on a runner one looks at', () => {
  it('turns to him and fixes him', () => {
    const alone = head([man()]);
    const b = other(0.6);
    const seen = head([man(), b]);
    const to = [b.x - seen.at[0], b.y + 1.66 - seen.at[1], b.z - seen.at[2]];
    expect(angle(alone.dir, to)).toBeGreaterThan(0.4);
    expect(angle(seen.dir, to)).toBeLessThan(0.06);
    // To his right: the head's own right is toward the other.
    expect(seen.dir[0] * right[0] + seen.dir[2] * right[2]).toBeGreaterThan(0.4);
  });
  it('turns no further than its limit, the eyes going on', () => {
    const alone = head([man()]);
    const seen = head([man(), other(1.15)]);
    const t = angle(alone.dir, seen.dir);
    expect(t).toBeGreaterThan(WATCH.turn[0] - 0.12);
    expect(t).toBeLessThan(WATCH.turn[0] + 0.05);
    expect(Math.abs(seen.r.gaze![0])).toBeCloseTo(WATCH.turn[0], 2);
    // Up at one on a roof: no further than the limit either.
    const up = head([man(), other(0, 2, { y: 9 })]);
    expect(Math.abs(up.r.gaze![1])).toBeLessThan(WATCH.turn[1] + 1e-6);
  });
  it('eases there and back, and leaves the head alone when no one is looked at', () => {
    const alone = head([man()]);
    expect(head([man(), other(0.6)], 3).r.gaze![0]).toBeLessThan(0.3);
    // Behind him, too far, himself, or down himself: no one.
    expect(watched(man(), [man(), other(2.4)])).toBeUndefined();
    expect(watched(man(), [man(), other(0.2, WATCH.far + 1)])).toBeUndefined();
    expect(watched(man(), [man()])).toBeUndefined();
    expect(watched(man({ down: 10 }), [man(), other(0.2)])).toBeUndefined();
    expect(angle(head([man(), other(2.4)]).dir, alone.dir)).toBeLessThan(1e-6);
    // The nearest of two.
    const [far, near] = [other(0.3, 9), other(-0.4, 3, { id: 3 })];
    expect(watched(man(), [man(), far, near])!.at[0]).toBeCloseTo(near.x, 6);
    // Gone, the head comes back.
    const book = new Map<number, Runner>();
    for (let i = 0; i < 90; i++) {
      animate(book, i < 45 ? [man(), other(0.6)] : [man()], DT);
      soldier([], book.get(1)!, [1, 0, 0]);
    }
    expect(Math.hypot(...book.get(1)!.gaze!)).toBeLessThan(0.02);
  });
  it('follows him as he goes by, as far as the head and the eyes reach', () => {
    // He comes in front, then walks round to the side, out of the cone a new one is picked in.
    const book = new Map<number, Runner>();
    const path = (i: number) => other(Math.min(0.5 + i * 0.02, 1.5));
    for (let i = 0; i < 120; i++) {
      animate(book, [man(), path(i)], DT);
      soldier([], book.get(1)!, [1, 0, 0]);
    }
    expect(1.5).toBeGreaterThan(WATCH.cone);
    expect(book.get(1)!.watching).toBe(2);
    expect(book.get(1)!.gaze![0]).toBeCloseTo(WATCH.turn[0], 2);
    // Met there first, he is not picked; past the reach he is let go.
    expect(watched(man(), [man(), other(1.5)])).toBeUndefined();
    expect(watched(man(), [man(), other(1.5)], 2)?.id).toBe(2);
    expect(watched(man(), [man(), other(WATCH.hold + 0.1)], 2)).toBeUndefined();
    // Kept over a nearer one, so the head does not flick between two.
    const near = other(0.1, 2, { id: 3 });
    expect(watched(man(), [man(), other(0.3, 9), near], 2)?.id).toBe(2);
    expect(watched(man(), [man(), other(0.3, 9), near])?.id).toBe(3);
  });
});
