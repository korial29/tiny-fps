import { describe, expect, it } from 'vitest';
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { MOTES, createEffects, lit } from './effects';

const DT = 1 / 60;
const me = (x = 0, ground = true): PlayerState => ({
  id: 1,
  x,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground,
});
const run = (fx: ReturnType<typeof createEffects>, keys: number, seconds: number) => {
  for (let t = 0; t < seconds; t += DT) {
    fx.update(me(), keys, DT);
  }
};

describe('bob', () => {
  const walk = (ground: boolean) => {
    const fx = createEffects();
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      fx.update(me(i * 0.1, ground), KEY.FORWARD, DT);
      peak = Math.max(peak, Math.abs(fx.bob));
    }
    return peak;
  };

  it('moves the eye while walking on the ground', () => {
    expect(walk(true)).toBeGreaterThan(0.01);
  });

  it('stays still when standing, and when walking in the air', () => {
    const fx = createEffects();
    run(fx, 0, 1);
    expect(fx.bob).toBe(0);
    expect(walk(false)).toBe(0);
  });

  it('follows the distance walked, not the time passed', () => {
    const fx = createEffects();
    fx.update(me(0), 0, DT);
    fx.update(me(0.3), 0, DT);
    expect(fx.bob).not.toBe(0);
    const still = createEffects();
    still.update(me(0), 0, DT);
    still.update(me(0), 0, DT);
    expect(still.bob).toBe(0);
  });

  it('ignores a respawn jump', () => {
    const fx = createEffects();
    fx.update(me(0), 0, DT);
    fx.update(me(30), 0, DT);
    expect(fx.bob).toBe(0);
  });
});

describe('roll', () => {
  it('leans right when strafing right, left for left, and settles back', () => {
    const fx = createEffects();
    run(fx, KEY.RIGHT, 1);
    expect(fx.roll).toBeGreaterThan(0.02);
    run(fx, KEY.LEFT, 1);
    expect(fx.roll).toBeLessThan(-0.02);
    run(fx, 0, 2);
    expect(Math.abs(fx.roll)).toBeLessThan(1e-3);
  });

  it('does not lean when both or none are held', () => {
    const fx = createEffects();
    run(fx, KEY.LEFT | KEY.RIGHT, 1);
    expect(fx.roll).toBeCloseTo(0);
  });
});

describe('dust motes', () => {
  /** A seeded generator: the motes need real spread. */
  const seeded = () => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  };
  const EYE_Y = 1.6;
  const spread = (fx: ReturnType<typeof createEffects>, x: number, z: number) => {
    const d = [];
    for (let i = 0; i < fx.motes.length; i += 3) {
      d.push([fx.motes[i] - x, fx.motes[i + 1] - EYE_Y, fx.motes[i + 2] - z]);
    }
    return d;
  };

  it('scatter around the eye on the first update, and not before a player is known', () => {
    const fx = createEffects(seeded());
    fx.update(undefined, 0, DT);
    expect(fx.motes.every(m => m == 0)).toBe(true);
    fx.update(me(10), 0, DT);
    expect(fx.motes).toHaveLength(MOTES * 3);
    const d = spread(fx, 10, 0);
    expect(d.every(([x, y, z]) => Math.abs(x) <= 5 && Math.abs(y) <= 1.7 && Math.abs(z) <= 5)).toBe(
      true,
    );
    expect(Math.max(...d.map(([x]) => x))).toBeGreaterThan(2);
    expect(Math.min(...d.map(([x]) => x))).toBeLessThan(-2);
    expect(Math.max(...d.map(([, y]) => y))).toBeGreaterThan(0.5);
  });

  it('drift slowly while the player stands', () => {
    const fx = createEffects(seeded());
    fx.update(me(), 0, DT);
    const before = Float32Array.from(fx.motes);
    for (let i = 0; i < 60; i++) {
      fx.update(me(), 0, DT);
    }
    // Across a wrap a mote comes out on the other side of its box: measure the short way round.
    const moved = [...fx.motes].map((m, i) => {
      const [d, side] = [Math.abs(m - before[i]), i % 3 == 1 ? 3.2 : 10];
      return Math.min(d, side - d);
    });
    expect(Math.max(...moved)).toBeLessThan(0.5);
    expect(moved.filter(m => m > 0.01).length).toBeGreaterThan(MOTES);
  });

  it('are recycled round the box as the player walks off, and never leave it', () => {
    const fx = createEffects(seeded());
    for (let i = 0; i < 600; i++) {
      fx.update(me(i * 0.1), KEY.FORWARD, DT);
      const d = spread(fx, i * 0.1, 0);
      expect(
        d.every(([x, y, z]) => Math.abs(x) <= 5.01 && Math.abs(y) <= 1.61 && Math.abs(z) <= 5.01),
      ).toBe(true);
    }
    const d = spread(fx, 59.9, 0);
    expect(Math.max(...d.map(([x]) => x))).toBeGreaterThan(2);
    expect(Math.min(...d.map(([x]) => x))).toBeLessThan(-2);
  });

  it('follow a respawn jump', () => {
    const fx = createEffects(seeded());
    fx.update(me(0), 0, DT);
    fx.update(me(300), 0, DT);
    expect(spread(fx, 300, 0).every(([x]) => Math.abs(x) <= 5.01)).toBe(true);
  });

  describe('lit', () => {
    const FWD: [number, number, number] = [0, 0, -1];
    const eye: [number, number, number] = [0, 1.6, 0];
    const at = (...p: [number, number, number][]) => {
      const fx = createEffects();
      fx.motes.set(p.flat());
      return fx;
    };

    it('shows a mote in the cone and none outside it', () => {
      const fx = at([0, 1.6, -4], [4, 1.6, -4], [0, 1.6, 4], [0, 1.6, -7], [0, 3.8, -4]);
      const seen = lit(fx, eye, FWD);
      expect(seen).toHaveLength(4);
      expect(seen[0]).toBe(0);
      expect(seen[1]).toBeCloseTo(1.6);
      expect(seen[2]).toBe(-4);
      expect(seen[3]).toBeGreaterThan(0);
    });

    it('shows more of what is near the axis and near the eye', () => {
      const fx = at([0, 1.6, -4], [1, 1.6, -4], [0, 1.6, -5.5]);
      const [on, off, far] = [0, 4, 8].map(i => lit(fx, eye, FWD)[i + 3]);
      expect(on).toBeGreaterThan(off);
      expect(on).toBeGreaterThan(far);
      expect(on).toBeLessThanOrEqual(1);
    });

    it('follows the view direction', () => {
      const fx = at([4, 1.6, 0]);
      expect(lit(fx, eye, FWD)).toHaveLength(0);
      expect(lit(fx, eye, [1, 0, 0])).toHaveLength(4);
    });

    it('lights a few motes of a real scatter, a fraction of them', () => {
      const fx = createEffects(seeded());
      fx.update(me(), 0, DT);
      const n = lit(fx, eye, FWD).length / 4;
      expect(n).toBeGreaterThan(2);
      expect(n).toBeLessThan(MOTES / 2);
    });
  });
});
