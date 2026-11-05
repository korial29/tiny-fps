import { describe, expect, it } from 'vitest';
import { INTERP_DELAY } from '../shared/constants';
import { compile } from '../shared/level';
import { HALL } from '../shared/map';
import { KEY } from '../shared/types';
import type { PlayerState, Shot } from '../shared/types';
import { GAIN, HURT, MOTES, TRAIL, createDelay, createEffects, lit } from './effects';

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

describe('hurt', () => {
  it('keeps the hit vignette for a moment, long enough to fade out', () => {
    const fx = createEffects();
    fx.hit();
    expect(fx.hurt).toBeCloseTo(HURT);
    expect(HURT).toBeGreaterThanOrEqual(0.4);
    run(fx, 0, HURT - 0.05);
    expect(fx.hurt).toBeGreaterThan(0);
    run(fx, 0, 0.06);
    expect(fx.hurt).toBe(0);
  });
});

describe('delay', () => {
  it('holds what it is given for INTERP_DELAY, then hands it over in order', () => {
    const q = createDelay<string>();
    q.push(['a'], 1000);
    q.push(['b', 'c'], 1030);
    expect(q.due(1000 + INTERP_DELAY - 1)).toEqual([]);
    expect(q.due(1000 + INTERP_DELAY)).toEqual(['a']);
    expect(q.due(1000 + INTERP_DELAY)).toEqual([]);
    expect(q.due(1030 + INTERP_DELAY)).toEqual(['b', 'c']);
  });

  it('keeps the newest max', () => {
    const q = createDelay<number>(3);
    q.push([1, 2, 3, 4, 5], 0);
    expect(q.due(1e6)).toEqual([3, 4, 5]);
  });
});

describe('pickup', () => {
  it('fades the item colour over 0.4 s', () => {
    const fx = createEffects();
    fx.pickup([1, 0, 0]);
    expect(fx.gain).toBeCloseTo(GAIN);
    expect(fx.gainC).toEqual([1, 0, 0]);
    run(fx, 0, 0.3);
    expect(fx.gain).toBeGreaterThan(0);
    run(fx, 0, 0.12);
    expect(fx.gain).toBe(0);
  });
});

describe('dead', () => {
  const sunk = (seconds: number, dead = true) => {
    const fx = createEffects();
    for (let t = 0; t < seconds; t += DT) {
      fx.update(me(), 0, DT, dead);
    }
    return fx;
  };

  it('sinks the eye to the floor and tilts the camera, over half a second', () => {
    const [half, done] = [sunk(0.25), sunk(0.6)];
    expect(half.bob).toBeLessThan(-0.5);
    expect(done.dead).toBe(1);
    expect(done.bob).toBeCloseTo(-1.3);
    expect(done.roll).toBeCloseTo(0.9);
    expect(half.roll).toBeLessThan(done.roll);
  });

  it('is 0 while alive, and rises again after a respawn', () => {
    expect(sunk(1, false).dead).toBe(0);
    const fx = sunk(1);
    for (let t = 0; t < 0.7; t += DT) {
      fx.update(me(), 0, DT, false);
    }
    expect(fx.dead).toBe(0);
    expect(fx.bob).toBeCloseTo(0);
    expect(fx.roll).toBeCloseTo(0);
  });

  it('keeps the strafe lean apart from the tilt', () => {
    const fx = createEffects();
    for (let t = 0; t < 1; t += DT) {
      fx.update(me(), KEY.RIGHT, DT, true);
    }
    expect(fx.roll).toBeCloseTo(0.9 + 0.03, 2);
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

    it('shows nothing once the own player is dead, and again after the respawn', () => {
      const fx = createEffects(seeded());
      fx.update(me(), 0, DT);
      fx.motes.fill(0);
      fx.motes.set([0, 1.6, -4]);
      expect(lit(fx, eye, FWD)).toHaveLength(4);
      fx.update(me(), 0, DT, true);
      expect(lit(fx, eye, FWD)).toHaveLength(0);
      for (let i = 0; i < 40; i++) {
        fx.update(me(), 0, DT, false);
      }
      expect(lit(fx, eye, FWD).length).toBeGreaterThan(0);
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

describe('shell casings', () => {
  const lvl = compile(HALL);
  const live = (fx: ReturnType<typeof createEffects>) => fx.casings.filter(c => c.life > 0);
  const step = (fx: ReturnType<typeof createEffects>, seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      fx.update(undefined, 0, DT);
    }
  };
  /** Fires from the eye `from` at the point 10 m away along (dx, dz). */
  const fire = (
    fx: ReturnType<typeof createEffects>,
    from: [number, number, number],
    [dx, dz]: [number, number],
    own = true,
  ) =>
    fx.shot(
      { id: own ? 1 : 2, x: from[0] + dx * 10, y: from[1], z: from[2] + dz * 10, hit: -1 },
      from,
      own,
    );
  // The start room (floor 1) and, over the lava pit, a floor at 0.
  const room: [number, number, number] = [8, 2.6, 8];
  const pit: [number, number, number] = [28, 2.6, 8];

  it('ejects to the right of the view, whichever way it points', () => {
    for (const [dir, right] of [
      [
        [0, -1],
        [1, 0],
      ],
      [
        [1, 0],
        [0, 1],
      ],
      [
        [0, 1],
        [-1, 0],
      ],
      [
        [-1, 0],
        [0, -1],
      ],
    ] as const) {
      const fx = createEffects(() => 0.5, lvl);
      fire(fx, room, [dir[0], dir[1]]);
      const [c] = live(fx);
      const [dx, dz] = [c.p[0] - room[0], c.p[2] - room[2]];
      expect(dx * right[0] + dz * right[1]).toBeGreaterThan(0.25);
      expect(c.v[0] * right[0] + c.v[2] * right[1]).toBeGreaterThan(0.5);
      // Down from the eye, out of the gun's port.
      expect(c.p[1]).toBeLessThan(room[1] - 0.15);
    }
  });

  it('falls, bounces once or twice on the floor below, then lies flat and still', () => {
    for (const [from, floor] of [
      [room, 1],
      [pit, 0],
    ] as const) {
      const fx = createEffects(() => 0.5, lvl);
      fire(fx, from, [0, -1]);
      const c = live(fx)[0];
      let [bounces, last] = [0, c.v[1]];
      for (let t = 0; t < 2.5; t += DT) {
        fx.update(undefined, 0, DT);
        bounces += +(last < 0 && c.v[1] > 0);
        last = c.v[1];
        expect(c.p[1]).toBeGreaterThanOrEqual(floor + c.size - 1e-9);
      }
      expect(bounces).toBeGreaterThanOrEqual(1);
      expect(bounces).toBeLessThanOrEqual(2);
      expect(c.rest).toBe(true);
      expect(c.p[1]).toBeCloseTo(floor + c.size);
      expect([...c.v, c.tilt]).toEqual([0, 0, 0, 0]);
      const at = [...c.p];
      step(fx, 1);
      expect(c.p).toEqual(at);
    }
  });

  it('tumbles while it flies', () => {
    const fx = createEffects(() => 0.5, lvl);
    fire(fx, room, [0, -1]);
    const c = live(fx)[0];
    const tilt = c.tilt;
    step(fx, 0.1);
    expect(Math.abs(c.tilt - tilt)).toBeGreaterThan(1);
  });

  it('stays in the room: a wall stops it', () => {
    const fx = createEffects(() => 0.5, lvl);
    // 0.2 m from the west wall, ejecting west.
    fire(fx, [0.3, 2.6, 8], [0, 1]);
    step(fx, 2);
    expect(live(fx)[0].p[0]).toBeGreaterThan(0);
  });

  it('shrinks away after 3 to 4 s of life, and its slot is free again', () => {
    const fx = createEffects(() => 0.5, lvl);
    fire(fx, room, [0, -1]);
    step(fx, 2.9);
    expect(live(fx)).toHaveLength(1);
    expect(live(fx)[0].rest).toBe(true);
    step(fx, 1.2);
    expect(live(fx)).toHaveLength(0);
    // Back in the pool for the next shot.
    fire(fx, room, [0, -1]);
    expect(live(fx)).toHaveLength(1);
  });

  it('keeps a pool of 32 that is never reallocated, and the own gun recycles the oldest', () => {
    const fx = createEffects(Math.random, lvl);
    const pool = fx.casings;
    expect(pool).toHaveLength(32);
    const first = pool[0];
    for (let i = 0; i < 100; i++) {
      fire(fx, room, [0, -1]);
      step(fx, 0.02);
    }
    expect(fx.casings).toBe(pool);
    expect(pool).toHaveLength(32);
    expect(pool[0]).toBe(first);
    expect(live(fx)).toHaveLength(32);
    // The newest is the one just ejected.
    expect(Math.max(...live(fx).map(c => c.life))).toBeGreaterThan(2.9);
  });

  it('draws smaller ones for the others, and at most 8 of them at once', () => {
    const fx = createEffects(() => 0.5, lvl);
    fire(fx, room, [0, -1]);
    for (let i = 0; i < 30; i++) {
      fire(fx, room, [0, -1], false);
    }
    const [own, ...others] = live(fx);
    expect(own.own).toBe(true);
    expect(others).toHaveLength(8);
    expect(others.every(c => !c.own && c.size < own.size)).toBe(true);
    // Remote ones never take the own gun's slots, and the own gun still ejects over them.
    for (let i = 0; i < 40; i++) {
      fire(fx, room, [0, -1]);
    }
    expect(live(fx).filter(c => !c.own).length).toBeLessThanOrEqual(8);
    expect(live(fx).filter(c => c.own).length).toBeGreaterThan(8);
  });

  it('ejects when the shot hit something point blank', () => {
    const fx = createEffects(() => 0.5, lvl);
    fx.shot({ id: 1, x: 8, y: 2.6, z: 8, hit: -1 }, room, true);
    expect(live(fx)).toHaveLength(1);
    expect(live(fx)[0].p.every(Number.isFinite)).toBe(true);
  });

  it('works without a level: it falls to the shooter feet', () => {
    const fx = createEffects(() => 0.5);
    fire(fx, [0, 1.6, 0], [0, -1]);
    step(fx, 2);
    expect(live(fx)[0].p[1]).toBeCloseTo(live(fx)[0].size);
  });
});

describe('spark streaks', () => {
  it('spans TRAIL seconds of velocity', () => {
    expect(TRAIL).toBeGreaterThan(0.02);
    expect(TRAIL).toBeLessThan(0.1);
  });
});
