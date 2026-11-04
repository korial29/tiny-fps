import { describe, expect, it } from 'vitest';
import { KEY } from '../shared/types';
import type { PlayerState, Shot } from '../shared/types';
import { createEffects } from './effects';

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
  cool: 0,
});
const shot: Shot = { id: 2, x: 0, y: 1, z: -10, hit: -1 };
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

describe('own shot', () => {
  it('kicks the gun, flashes for about 50 ms and shakes the camera, then all settles', () => {
    const fx = createEffects(() => 1);
    fx.shot(shot, [0, 1.6, 0], true);
    fx.update(undefined, 0, 0);
    expect(fx.kick).toBe(1);
    expect(fx.flash).toBeCloseTo(0.05);
    expect(fx.shakeYaw).toBeGreaterThan(0);
    run(fx, 0, 0.03);
    expect(fx.flash).toBeGreaterThan(0);
    run(fx, 0, 0.03);
    expect(fx.flash).toBe(0);
    run(fx, 0, 1);
    expect(fx.kick).toBeLessThan(0.01);
    expect(Math.abs(fx.shakeYaw)).toBeLessThan(1e-3);
  });

  it('shakes in both directions', () => {
    let n = 0;
    const fx = createEffects(() => (n++ % 3 ? 0 : 1));
    fx.shot(shot, [0, 1.6, 0], true);
    fx.update(undefined, 0, 0);
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      fx.update(undefined, 0, 0);
      seen.add(Math.sign(fx.shakeYaw));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('does not kick or shake for a remote shot, which flashes at its shooter', () => {
    const fx = createEffects();
    fx.shot(shot, [3, 1.6, 0], false);
    fx.update(undefined, 0, 0);
    expect(fx.kick + fx.flash + Math.abs(fx.shakeYaw)).toBe(0);
    expect(fx.flashes.get(2)).toBeCloseTo(0.05);
    run(fx, 0, 0.06);
    expect(fx.flashes.size).toBe(0);
  });
});

describe('barrel spin', () => {
  const rate = (fx: ReturnType<typeof createEffects>, keys: number) => {
    const a = fx.spin;
    fx.update(undefined, keys, DT);
    return (fx.spin - a + 2 * Math.PI) % (2 * Math.PI);
  };

  it('spins up while fire is held, then down once released', () => {
    const fx = createEffects();
    expect(rate(fx, 0)).toBe(0);
    const early = rate(fx, KEY.FIRE);
    for (let i = 0; i < 60; i++) {
      fx.update(undefined, KEY.FIRE, DT);
    }
    const fast = rate(fx, KEY.FIRE);
    expect(fast).toBeGreaterThan(early * 5);
    for (let i = 0; i < 90; i++) {
      fx.update(undefined, 0, DT);
    }
    expect(rate(fx, 0)).toBe(0);
  });

  it('keeps turning for a while after release', () => {
    const fx = createEffects();
    run(fx, KEY.FIRE, 1);
    expect(rate(fx, 0)).toBeGreaterThan(0.1);
  });
});

describe('sparks', () => {
  it('fly back toward the shooter from the impact, and fall', () => {
    const fx = createEffects(() => 0.5);
    fx.shot(shot, [0, 1, 0], false);
    expect(fx.sparks.length).toBeGreaterThan(1);
    for (const s of fx.sparks) {
      expect(s.p).toEqual([0, 1, -10]);
      expect(s.v[2]).toBeGreaterThan(0);
    }
    const [{ v }] = fx.sparks;
    const vy = v[1];
    fx.update(undefined, 0, 0.1);
    expect(fx.sparks[0].p[2]).toBeGreaterThan(-10);
    expect(fx.sparks[0].v[1]).toBeLessThan(vy);
  });

  it('expire within 0.3 s', () => {
    const fx = createEffects();
    fx.shot(shot, [0, 1, 0], true);
    run(fx, 0, 0.2);
    expect(fx.sparks.length).toBeGreaterThan(0);
    run(fx, 0, 0.12);
    expect(fx.sparks).toHaveLength(0);
  });

  it('are left out when asked, still flashing at the shooter', () => {
    const fx = createEffects();
    fx.shot(shot, [0, 1, 0], false, false);
    expect(fx.sparks).toHaveLength(0);
    expect(fx.flashes.get(2)).toBeGreaterThan(0);
  });

  it('skip a shot that went the full range, and stay bounded', () => {
    const fx = createEffects();
    fx.shot({ ...shot, z: -100 }, [0, 1, 0], false);
    expect(fx.sparks).toHaveLength(0);
    for (let i = 0; i < 100; i++) {
      fx.shot(shot, [0, 1, 0], false);
    }
    expect(fx.sparks.length).toBeLessThanOrEqual(96);
  });
});
