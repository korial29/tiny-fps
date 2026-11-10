import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import { gravity } from '../shared/physics';
import { ROVER } from '../shared/rover';
import { NOBODY, TEX } from '../shared/types';
import type { Rover } from '../shared/types';
import { build } from '../shared/world';
import { DUST_FAR, DUST_LIFE, DUST_MAX, DUST_SLIP, DUST_SPEED, createDust, raising } from './dust';
import { STRIDE } from './mesh';
import { contacts } from './rover';

const world = (gravity = 0.5) =>
  build({
    brushes: [
      { min: [-500, -5, -500], max: [500, 0, 500], top: TEX.STONE, side: TEX.STONE },
      // A kerb under the right wheels of a rover at the origin.
      { min: [0.5, 0, -10], max: [10, 0.3, 10], top: TEX.STONE, side: TEX.STONE },
    ],
    teams: duo([[0, 0, 0, 0]]),
    floor: -20,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    gravity,
  });
const W = world();
const rover = (o: Partial<Rover> = {}): Rover => ({
  x: -50,
  y: ROVER.L0 + ROVER.WR - 0.08,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  wy: 0,
  wp: 0,
  wr: 0,
  steer: 0,
  driver: NOBODY,
  rider: NOBODY,
  ...o,
});
const DT = 1 / 60;
/** The puffs drawn: the middle of each (the mean of its vertices), and its opacity. */
const puffs = (v: number[]) => {
  const n = v.length / STRIDE;
  const per = n / Math.max(1, Math.round(n / 72));
  const out: number[][] = [];
  for (let i = 0; i < n; i += per) {
    const m = [0, 0, 0, 0];
    for (let k = i; k < i + per; k++) {
      [0, 1, 2, 7].forEach((j, c) => (m[c] += v[k * STRIDE + j] / per));
    }
    out.push(m);
  }
  return out;
};

describe('raising', () => {
  it('is no wheel of a rover at rest or slow, and all four on the ground from DUST_SPEED', () => {
    expect(raising(rover(), W)).toEqual([false, false, false, false]);
    expect(raising(rover({ vz: -(DUST_SPEED - 0.5) }), W)).toEqual([false, false, false, false]);
    expect(raising(rover({ vz: -DUST_SPEED }), W)).toEqual([true, true, true, true]);
    expect(raising(rover({ vx: DUST_SPEED, vz: 1 }), W)).toEqual([true, true, true, true]);
  });

  it('is a slide across the nose from DUST_SLIP, however slow', () => {
    expect(raising(rover({ vx: DUST_SLIP - 0.3 }), W)).toEqual([false, false, false, false]);
    expect(raising(rover({ vx: -DUST_SLIP }), W)).toEqual([true, true, true, true]);
    // The same speed along the nose is no slide.
    expect(raising(rover({ vx: DUST_SLIP, yaw: -Math.PI / 2 }), W)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('is only the wheels that touch: none in the air, the left pair alone when the right hangs', () => {
    expect(raising(rover({ vz: -20, y: 3 }), W)).toEqual([false, false, false, false]);
    expect(raising(rover({ vz: -20, y: 0.85, roll: -0.5 }), W)).toEqual([true, false, true, false]);
  });
});

describe('createDust', () => {
  const run = (d: ReturnType<typeof createDust>, r: Rover, n: number, w = W) => {
    for (let i = 0; i < n; i++) {
      d.update([r], w, DT);
    }
  };

  it('throws nothing from a rover at rest, in the air or too far to see', () => {
    const d = createDust();
    run(d, rover(), 60);
    run(d, rover({ vz: -20, y: 3 }), 60);
    d.update([rover({ vz: -20 })], W, 0.1, [-50 + DUST_FAR + 1, 0, 0]);
    expect(d.count).toBe(0);
    const out: number[] = [];
    d.draw(out);
    expect(out).toHaveLength(0);
  });

  it('throws puffs of smoke from the tyres on the ground of a fast rover, more the faster, DUST_MAX at most', () => {
    const [slow, fast] = [createDust(), createDust()];
    run(slow, rover({ vz: -DUST_SPEED }), 12);
    run(fast, rover({ vz: -2 * DUST_SPEED }), 12);
    expect(slow.count).toBeGreaterThan(8);
    expect(fast.count).toBeGreaterThan(1.5 * slow.count);
    const out: number[] = [];
    slow.draw(out);
    expect(out.length % (3 * STRIDE)).toBe(0);
    expect(out.every(Number.isFinite)).toBe(true);
    // Smoke: layer -3, grey, see-through.
    for (let i = 0; i < out.length; i += STRIDE) {
      expect(out[i + 8]).toBe(-3);
      expect(out[i + 7]).toBeGreaterThan(0);
      expect(out[i + 7]).toBeLessThan(0.7);
    }
    // Born at the four tyres' contacts.
    const first = createDust();
    const r = rover({ vz: -2 * DUST_SPEED });
    run(first, r, 4);
    const v: number[] = [];
    first.draw(v);
    const at = contacts(r, W);
    for (const [x, y, z] of puffs(v)) {
      expect(Math.min(...at.map(c => Math.hypot(c[0] - x, c[2] - z)))).toBeLessThan(0.6);
      expect(y).toBeLessThan(0.6);
    }
    run(fast, rover({ vz: -40 }), 600);
    expect(fast.count).toBeLessThanOrEqual(DUST_MAX);
  });

  it('comes from the wheels that touch only', () => {
    const d = createDust();
    const r = rover({ vz: -20, y: 0.85, roll: -0.5 });
    run(d, r, 3);
    const v: number[] = [];
    d.draw(v);
    expect(d.count).toBeGreaterThan(0);
    // The left wheels are B to the left of its middle.
    expect(puffs(v).every(p => p[0] < r.x)).toBe(true);
  });

  it('flies an arc under the gravity of the world, with no air to hold it, and is gone when it lands or after DUST_LIFE', () => {
    const d = createDust();
    run(d, rover({ vz: -2 * DUST_SPEED }), 1);
    run(d, rover({ vz: -2 * DUST_SPEED }), 1);
    const n = d.count;
    expect(n).toBeGreaterThan(0);
    // The rover stops: no more comes, and what flies goes up, then down, thinning.
    const still = rover();
    const ys: number[] = [];
    const seen: number[] = [];
    for (let i = 0; i < DUST_LIFE * 60 + 2; i++) {
      d.update([still], W, DT);
      const v: number[] = [];
      d.draw(v);
      const p = puffs(v);
      expect(d.count).toBeLessThanOrEqual(n);
      if (d.count == n) {
        ys.push(p.reduce((s, q) => s + q[1], 0) / n);
        seen.push(p.reduce((s, q) => s + q[3], 0) / n);
      }
    }
    expect(d.count).toBe(0);
    const top = ys.indexOf(Math.max(...ys));
    expect(top).toBeGreaterThan(3);
    expect(Math.max(...ys)).toBeGreaterThan(0.2);
    // A parabola: the second difference of the height is -g dt², the world's own (half the Earth's on the moon).
    const g = -(ys[2] - 2 * ys[1] + ys[0]) / (DT * DT);
    expect(g).toBeCloseTo(gravity(W), 1);
    expect(gravity(W)).toBe(gravity(world(1)) / 2);
    expect(seen[seen.length - 1]).toBeLessThan(seen[0]);
    // Twice the gravity brings it down sooner.
    const [moon, earth] = [createDust(), createDust()];
    const life = (dust: typeof moon, w: typeof W) => {
      run(dust, rover({ vz: -2 * DUST_SPEED }), 2, w);
      let t = 0;
      while (dust.count) {
        dust.update([still], w, DT);
        t++;
      }
      return t;
    };
    expect(life(earth, world(1))).toBeLessThan(life(moon, W));
  });
});
