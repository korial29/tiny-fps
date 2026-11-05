import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
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
  ...STILL,
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

describe('dust', () => {
  it('is gone with the flashlight it showed in: the effects hold the bob and the roll only', () => {
    expect(Object.keys(createEffects()).sort()).toEqual(['bob', 'roll', 'update']);
  });
});
