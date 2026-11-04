import { describe, expect, it } from 'vitest';
import { INTERP_DELAY } from '../shared/constants';
import { compile, sectorAt } from '../shared/level';
import { HALL } from '../shared/map';
import { EVENT, KEY, MONSTER } from '../shared/types';
import type { GameEvent, Monster, PlayerState, Shot } from '../shared/types';
import { createDelay, createEffects, glow } from './effects';
import { CHUNKS } from './monsters';

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

describe('monsters seen', () => {
  const mob = (x: number, o: Partial<Monster> = {}): Monster => ({
    id: 16,
    kind: MONSTER.WALKER,
    x,
    y: 1,
    z: 8,
    yaw: 0,
    chase: false,
    ...o,
  });

  it('walk as far as they moved, and not while they stand', () => {
    const fx = createEffects();
    fx.track([mob(5)], []);
    for (let i = 0; i < 100; i++) {
      fx.track([mob(5)], []);
      fx.update(undefined, 0, DT);
    }
    expect(fx.herd.get(16)?.walked).toBe(0);
    fx.track([mob(5.3)], []);
    fx.track([mob(5.5)], []);
    expect(fx.herd.get(16)?.walked).toBeCloseTo(0.5);
  });

  it('do not run their limbs for a jump of metres, and keep the others apart', () => {
    const fx = createEffects();
    fx.track([mob(5), mob(5, { id: 17, kind: MONSTER.FLYER })], []);
    fx.track([mob(30), mob(5.1, { id: 17, kind: MONSTER.FLYER })], []);
    expect(fx.herd.get(16)?.walked).toBe(0);
    expect(fx.herd.get(17)?.walked).toBeCloseTo(0.1);
    expect(fx.herd.get(17)?.kind).toBe(MONSTER.FLYER);
  });

  it('give a bullet its heading once it has moved, and forget it when it is gone', () => {
    const fx = createEffects();
    fx.track([], [{ id: 3, x: 0, y: 1, z: 0 }]);
    expect(fx.aim.size).toBe(0);
    fx.track([], [{ id: 3, x: 0, y: 1, z: -0.2 }]);
    expect(fx.aim.get(3)).toEqual([0, 0, -1]);
    fx.track([], [{ id: 3, x: 0, y: 1, z: -0.2 }]);
    expect(fx.aim.get(3)).toEqual([0, 0, -1]);
    fx.track([], []);
    expect(fx.aim.size).toBe(0);
  });
});

describe('death', () => {
  const lvl = compile(HALL);
  const die = (x: number, y: number, z: number, id = 16): GameEvent => ({
    type: EVENT.DIE,
    id,
    x,
    y,
    z,
  });
  const step = (fx: ReturnType<typeof createEffects>, seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      fx.update(undefined, 0, DT);
    }
  };

  it('throws 10 to 16 gibs from the middle of the body, with a blast and sparks', () => {
    for (const [r, n] of [
      [0, 10],
      [0.999, 16],
    ]) {
      const fx = createEffects(() => r, lvl);
      fx.event(die(8, 2, 8), 1);
      expect(fx.gibs).toHaveLength(n);
      expect(fx.blasts).toHaveLength(1);
      expect(fx.sparks.length).toBeGreaterThan(5);
      expect(fx.gibs.every(g => Math.abs(g.p[0] - 8) + Math.abs(g.p[2] - 8) == 0)).toBe(true);
    }
  });

  it('bursts a walker and a flyer in their own colours', () => {
    const fx = createEffects(Math.random, lvl);
    fx.track([{ id: 16, kind: MONSTER.WALKER, x: 8, y: 1, z: 8, yaw: 0, chase: false }], []);
    fx.track([{ id: 17, kind: MONSTER.FLYER, x: 8, y: 1, z: 8, yaw: 0, chase: false }], []);
    // The monster is gone from the drawn list by the time its event fires: the herd remembers.
    fx.track([], []);
    for (const [id, kind] of [
      [16, MONSTER.WALKER],
      [17, MONSTER.FLYER],
    ]) {
      fx.gibs = [];
      fx.event(die(8, 2, 8, id), 1);
      expect(fx.gibs.every(g => CHUNKS[kind].includes(g.c))).toBe(true);
    }
    expect(new Set(CHUNKS[0].flat()).size).toBeGreaterThan(new Set(CHUNKS[1].flat()).size);
  });

  it('lands the gibs on the floor of the sector below, then makes them vanish after 2 to 3 s', () => {
    const fx = createEffects(Math.random, lvl);
    // The start room (floor 1) and the lava pit (floor 0): a flyer's corpse over each.
    fx.event(die(8, 2.2, 8), 1);
    fx.event(die(28, 1.6, 8, 17), 1);
    const flying = fx.gibs.length;
    step(fx, 0.1);
    expect(fx.gibs.every(g => !g.rest)).toBe(true);
    step(fx, 1.7);
    expect(fx.gibs).toHaveLength(flying);
    for (const g of fx.gibs) {
      expect(g.rest).toBe(true);
      expect(g.p[1]).toBeCloseTo(lvl.map.sectors[sectorAt(lvl, g.p[0], g.p[2])].floor + g.size);
    }
    step(fx, 1.3);
    expect(fx.gibs).toHaveLength(0);
  });

  it('drops into the pit when thrown over it', () => {
    const fx = createEffects(() => 0, lvl);
    fx.event(die(28, 1.6, 8), 1);
    step(fx, 1.5);
    expect(fx.gibs.length).toBeGreaterThan(0);
    for (const g of fx.gibs) {
      expect(g.p[1]).toBeCloseTo(g.size);
    }
  });

  it('never leaves the map: the gibs bounce off a wall', () => {
    const fx = createEffects(() => 0.5, lvl);
    // Every gib flies toward -x, at the wall 0.5 m away.
    fx.event(die(0.5, 1.6, 8), 1);
    for (let t = 0; t < 2; t += DT) {
      fx.update(undefined, 0, DT);
      for (const g of fx.gibs) {
        expect(g.p[0]).toBeGreaterThan(0);
      }
    }
  });

  it('grows the explosion, then shrinks it to nothing within 0.3 s', () => {
    const fx = createEffects(Math.random, lvl);
    fx.event(die(8, 2, 8), 1);
    const size = (t: number) => glow({ ...fx.blasts[0], t });
    expect(size(0.03)).toBeLessThan(size(0.08));
    expect(size(0.08)).toBeLessThan(size(0.15));
    expect(size(0.29)).toBeLessThan(size(0.15) / 2);
    expect(size(0.3)).toBe(0);
    step(fx, 0.2);
    expect(fx.blasts).toHaveLength(1);
    step(fx, 0.12);
    expect(fx.blasts).toHaveLength(0);
  });

  it('keeps every list bounded through a long fight', () => {
    const fx = createEffects(Math.random, lvl);
    for (let i = 0; i < 50; i++) {
      fx.event(die(8, 2, 8), 1);
      fx.event({ type: EVENT.BOOM, id: i, x: 8, y: 2, z: 8 }, 1);
      fx.event({ type: EVENT.HURT, id: 2, x: 8, y: 2, z: 8 }, 1);
      fx.event({ type: EVENT.SWING, id: 16 + (i % 64), x: 8, y: 2, z: 8 }, 1);
    }
    expect(fx.gibs.length).toBeLessThanOrEqual(64);
    expect(fx.blasts.length).toBeLessThanOrEqual(12);
    expect(fx.sparks.length).toBeLessThanOrEqual(96);
    expect(fx.swings.size).toBeLessThanOrEqual(64);
  });

  it('keeps the newest gibs when it must drop some', () => {
    const fx = createEffects(() => 0.5, lvl);
    for (let i = 0; i < 10; i++) {
      fx.event(die(8, 2, 8 + i * 0.1), 1);
    }
    expect(fx.gibs.at(-1)?.p[2]).toBeCloseTo(8.9);
    expect(fx.gibs[0].p[2]).toBeGreaterThan(8);
  });

  it('works without a level: gibs only fall to the spawn floor', () => {
    const fx = createEffects();
    fx.event(die(8, 2, 8), 1);
    step(fx, 3.5);
    expect(fx.gibs).toHaveLength(0);
  });
});

describe('other events', () => {
  const ev = (type: number, id: number): GameEvent => ({ type, id, x: 3, y: 1, z: 4 });

  it('leave the own player hurt to the health drop: no tint, no sparks in the camera', () => {
    const fx = createEffects();
    fx.event(ev(EVENT.HURT, 2), 2);
    expect(fx.hurt).toBe(0);
    expect(fx.sparks).toHaveLength(0);
  });

  it('tint the screen red for 0.15 s on a hit', () => {
    const fx = createEffects();
    fx.hit();
    expect(fx.hurt).toBeCloseTo(0.15);
    run(fx, 0, 0.1);
    expect(fx.hurt).toBeGreaterThan(0);
    run(fx, 0, 0.06);
    expect(fx.hurt).toBe(0);
  });

  it('burst red sparks at another player hurt, with no tint', () => {
    const fx = createEffects();
    fx.event(ev(EVENT.HURT, 5), 2);
    expect(fx.hurt).toBe(0);
    expect(fx.sparks.length).toBeGreaterThan(3);
    for (const s of fx.sparks) {
      expect(s.p).toEqual([3, 1, 4]);
      expect(s.c![0]).toBeGreaterThan(s.c![1] * 4);
    }
    run(fx, 0, 0.4);
    expect(fx.sparks).toHaveLength(0);
  });

  it('burst a few sparks and a tiny flash on a bullet bursting', () => {
    const fx = createEffects();
    fx.event(ev(EVENT.BOOM, 9), 2);
    expect(fx.sparks.length).toBeGreaterThan(3);
    expect(fx.blasts[0].r).toBeLessThan(0.5);
    expect(fx.hurt).toBe(0);
    run(fx, 0, 0.4);
    expect(fx.sparks.length + fx.blasts.length).toBe(0);
  });

  it('make a monster strike for 0.3 s', () => {
    const fx = createEffects();
    fx.event(ev(EVENT.SWING, 20), 2);
    expect(fx.swings.get(20)).toBeCloseTo(0.3);
    run(fx, 0, 0.2);
    expect(fx.swings.get(20)).toBeGreaterThan(0);
    run(fx, 0, 0.12);
    expect(fx.swings.size).toBe(0);
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

  it('forgets what it holds on clear', () => {
    const q = createDelay<number>();
    q.push([1, 2], 0);
    q.clear();
    expect(q.due(1e6)).toEqual([]);
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
    expect(fx.gain).toBeCloseTo(0.4);
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

describe('reset', () => {
  const lvl = compile(HALL);
  const die = (x: number, y: number, z: number): GameEvent => ({
    type: EVENT.DIE,
    id: 16,
    x,
    y,
    z,
  });
  const step = (fx: ReturnType<typeof createEffects>, seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      fx.update(undefined, 0, DT);
    }
  };

  it('drops every effect of the old level', () => {
    const fx = createEffects(Math.random, lvl);
    fx.event(die(8, 2, 8), 1);
    fx.event({ type: EVENT.SWING, id: 20, x: 8, y: 2, z: 8 }, 1);
    fx.track([{ id: 20, kind: 0, x: 8, y: 1, z: 8, yaw: 0, chase: false }], []);
    fx.shot(shot, [0, 1.6, 0], true);
    fx.shot({ ...shot, id: 2 }, [0, 1.6, 0], false);
    fx.hit();
    fx.pickup([1, 1, 1]);
    fx.reset(lvl);
    expect([fx.gibs, fx.sparks, fx.blasts]).toEqual([[], [], []]);
    expect([fx.swings.size, fx.herd.size, fx.flashes.size, fx.aim.size]).toEqual([0, 0, 0, 0]);
    expect([fx.hurt, fx.gain, fx.flash]).toEqual([0, 0, 0]);
  });

  it('lets later gibs land on the new level', () => {
    const fx = createEffects(() => 0.5);
    fx.reset(lvl);
    fx.event(die(8, 5, 8), 1);
    expect(fx.gibs.length).toBeGreaterThan(0);
    for (const g of fx.gibs) {
      expect(g.floor).toBe(lvl.map.sectors[sectorAt(lvl, 8, 8)].floor);
    }
    step(fx, 1);
    expect(Math.min(...fx.gibs.map(g => g.p[1]))).toBeGreaterThanOrEqual(1);
  });
});
