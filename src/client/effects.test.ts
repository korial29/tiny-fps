import { describe, expect, it } from 'vitest';
import { INTERP_DELAY } from '../shared/constants';
import { compile, sectorAt } from '../shared/level';
import { HALL } from '../shared/map';
import { EVENT, KEY, MONSTER } from '../shared/types';
import type { GameEvent, Monster, PlayerState, Shot } from '../shared/types';
import {
  BLOOD,
  GAIN,
  HURT,
  MOTES,
  TRAIL,
  createDelay,
  createEffects,
  fade,
  glow,
  lit,
  puff,
} from './effects';
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
      expect(fx.gibs.every(g => g.c == BLOOD || CHUNKS[kind].includes(g.c))).toBe(true);
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
    expect(fx.smoke.length).toBeLessThanOrEqual(40);
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

  it('keep the hit vignette for a moment, long enough to fade out', () => {
    const fx = createEffects();
    fx.hit();
    expect(fx.hurt).toBeCloseTo(HURT);
    expect(HURT).toBeGreaterThanOrEqual(0.4);
    run(fx, 0, HURT - 0.05);
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
    expect(fx.smoke.length).toBeGreaterThan(0);
    fx.splats.push({ p: [8, 1, 8], r: 0.1, yaw: 0, life: 5 });
    fx.event({ type: EVENT.SWING, id: 20, x: 8, y: 2, z: 8 }, 1);
    fx.track([{ id: 20, kind: 0, x: 8, y: 1, z: 8, yaw: 0, chase: false }], []);
    fx.shot(shot, [0, 1.6, 0], true);
    fx.shot({ ...shot, id: 2 }, [0, 1.6, 0], false);
    fx.hit();
    fx.pickup([1, 1, 1]);
    fx.reset(lvl);
    expect([fx.gibs, fx.sparks, fx.blasts, fx.smoke, fx.splats]).toEqual([[], [], [], [], []]);
    expect(fx.casings.filter(c => c.life > 0)).toHaveLength(0);
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

describe('smoke', () => {
  const lvl = compile(HALL);
  const ev = (type: number): GameEvent => ({ type, id: 16, x: 8, y: 1, z: 8 });
  const step = (fx: ReturnType<typeof createEffects>, seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      fx.update(undefined, 0, DT);
    }
  };

  it('puffs on a DIE, fewer and smaller on a BOOM', () => {
    const [die, boom] = [EVENT.DIE, EVENT.BOOM].map(type => {
      const fx = createEffects(() => 0.5, lvl);
      fx.event(ev(type), 1);
      return fx.smoke;
    });
    expect(die.length).toBeGreaterThanOrEqual(6);
    expect(boom.length).toBeGreaterThan(0);
    expect(boom.length).toBeLessThan(die.length);
    expect(boom[0].r).toBeLessThan(die[0].r);
  });

  it('puffs nothing for the other events', () => {
    const fx = createEffects();
    for (const type of [EVENT.HURT, EVENT.SWING]) {
      fx.event(ev(type), 2);
    }
    expect(fx.smoke).toHaveLength(0);
  });

  it('rises and drifts', () => {
    const fx = createEffects(() => 0.9, lvl);
    fx.event(ev(EVENT.DIE), 1);
    const [before] = fx.smoke.map(s => [...s.p]);
    step(fx, 0.5);
    const [after] = fx.smoke.map(s => s.p);
    expect(after[1]).toBeGreaterThan(before[1] + 0.2);
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.05);
  });

  it('stays under the ceiling', () => {
    const fx = createEffects(() => 0.99, lvl);
    fx.event({ ...ev(EVENT.DIE), y: 2 }, 1);
    step(fx, 1.4);
    const ceil = lvl.map.sectors[sectorAt(lvl, 8, 8)].ceil;
    expect(fx.smoke.length).toBeGreaterThan(0);
    for (const s of fx.smoke) {
      expect(s.p[1]).toBeLessThanOrEqual(ceil);
    }
  });

  it('grows, then shrinks to nothing as it ends', () => {
    const fx = createEffects(() => 0.5, lvl);
    fx.event(ev(EVENT.DIE), 1);
    const [s] = fx.smoke;
    const size = (u: number) => puff({ ...s, t: u * s.life });
    expect(size(0)).toBeGreaterThan(0);
    expect(size(0.1)).toBeGreaterThan(size(0));
    expect(size(0.5)).toBeGreaterThan(size(0.1));
    expect(size(0.9)).toBeLessThan(size(0.5));
    expect(size(0.99)).toBeLessThan(size(0.9));
    expect(size(1)).toBe(0);
  });

  it('fades in over a tenth of its life, then thins out to nothing', () => {
    const fx = createEffects(() => 0.5, lvl);
    fx.event(ev(EVENT.DIE), 1);
    const [s] = fx.smoke;
    const alpha = (u: number) => fade({ ...s, t: u * s.life });
    expect(alpha(0)).toBe(0);
    expect(alpha(0.05)).toBeGreaterThan(0);
    expect(alpha(0.05)).toBeLessThan(alpha(0.1));
    expect(alpha(0.1)).toBeGreaterThan(alpha(0.5));
    expect(alpha(0.5)).toBeGreaterThan(alpha(0.9));
    expect(alpha(1)).toBe(0);
    for (let u = 0; u <= 1; u += 0.05) {
      expect(alpha(u)).toBeGreaterThanOrEqual(0);
      expect(alpha(u)).toBeLessThan(1);
    }
  });

  it('lives 1.5 to 2.5 s, then goes', () => {
    for (const [r, life] of [
      [0, 1.5],
      [0.999, 2.5],
    ]) {
      const fx = createEffects(() => r, lvl);
      fx.event(ev(EVENT.BOOM), 1);
      expect(fx.smoke[0].life).toBeCloseTo(life, 2);
      step(fx, life - 0.1);
      expect(fx.smoke.length).toBeGreaterThan(0);
      step(fx, 0.2);
      expect(fx.smoke).toHaveLength(0);
    }
  });

  it('keeps the newest puffs when capped', () => {
    const fx = createEffects(() => 0.5, lvl);
    for (let i = 0; i < 30; i++) {
      fx.event({ ...ev(EVENT.DIE), z: 8 + i * 0.1 }, 1);
    }
    expect(fx.smoke).toHaveLength(40);
    expect(fx.smoke.at(-1)!.p[2]).toBeGreaterThan(10.8);
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

  it('are scattered again after a level change', () => {
    const fx = createEffects(seeded());
    fx.update(me(), 0, DT);
    fx.motes.fill(0);
    fx.reset(compile(HALL));
    fx.update(me(), 0, DT);
    expect(fx.motes.some(m => m != 0)).toBe(true);
    expect(spread(fx, 0, 0).some(([x]) => Math.abs(x) > 1)).toBe(true);
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

  it('lands on the new level after a reset', () => {
    const fx = createEffects(() => 0.5);
    fire(fx, room, [0, -1]);
    fx.reset(lvl);
    expect(live(fx)).toHaveLength(0);
    fire(fx, room, [0, -1]);
    step(fx, 1.5);
    expect(live(fx)[0].p[1]).toBeCloseTo(1 + live(fx)[0].size);
  });
});

describe('gib shapes and splats', () => {
  const lvl = compile(HALL);
  const die = (x: number, y: number, z: number): GameEvent => ({
    type: EVENT.DIE,
    id: 16,
    x,
    y,
    z,
  });
  const step = (fx: ReturnType<typeof createEffects>, seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      fx.update(undefined, 0, DT);
    }
  };
  /** A fixed sequence of numbers in [0, 1): the tests are exact. */
  const lcg =
    (seed = 7) =>
    () =>
      (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
  const kind = ({ half: [x, y, z] }: { half: number[] }) =>
    z > 1.5 * x ? 'long' : y < 0.5 * x ? 'flat' : Math.max(x, y, z) < 0.04 ? 'speck' : 'chunk';

  it('throws flat slabs, long bits, specks and chunks', () => {
    const fx = createEffects(lcg(), lvl);
    const kinds = new Set<string>();
    for (let i = 0; i < 12; i++) {
      fx.gibs = [];
      fx.event(die(8, 2, 8), 1);
      fx.gibs.forEach(g => kinds.add(kind(g)));
    }
    expect([...kinds].sort()).toEqual(['chunk', 'flat', 'long', 'speck']);
  });

  it('rests a gib on its own height', () => {
    const fx = createEffects(lcg(), lvl);
    fx.event(die(8, 2, 8), 1);
    expect(fx.gibs.every(g => g.size == g.half[1])).toBe(true);
    step(fx, 1.8);
    for (const g of fx.gibs) {
      expect(g.p[1]).toBeCloseTo(1 + g.half[1]);
    }
  });

  it('makes some of them dark red, and only those leave a splat where they first land', () => {
    const fx = createEffects(lcg(3), lvl);
    fx.event(die(8, 2, 8), 1);
    const gore = fx.gibs.filter(g => g.gore);
    expect(gore.length).toBeGreaterThan(0);
    expect(gore.length).toBeLessThan(fx.gibs.length);
    expect(gore.every(g => g.c == BLOOD)).toBe(true);
    expect(fx.gibs.filter(g => !g.gore).every(g => g.c != BLOOD)).toBe(true);
    expect(fx.splats).toHaveLength(0);
    const ids = new Set(gore);
    step(fx, 1.5);
    // One splat each, on the floor of the start room, flat just above it.
    expect(fx.splats).toHaveLength(gore.length);
    for (const s of fx.splats) {
      expect(s.p[1]).toBeCloseTo(1.004);
      expect(s.r).toBeGreaterThan(0.09);
    }
    expect(ids.size).toBe(gore.length);
    expect(gore.every(g => !g.gore)).toBe(true);
  });

  it('puts the splat where the gib first touched the floor', () => {
    const fx = createEffects(() => 0, lvl);
    // Every gib is dark red, thrown at the same speed: straight up from the middle.
    fx.event(die(8, 2, 8), 1);
    const g = fx.gibs[0];
    let at: number[] | undefined;
    for (let t = 0; t < 1 && !fx.splats.length; t += DT) {
      fx.update(undefined, 0, DT);
      at = [...g.p];
    }
    expect(fx.splats[0].p[0]).toBeCloseTo(at![0]);
    expect(fx.splats[0].p[2]).toBeCloseTo(at![2]);
  });

  it('lets a splat lie for 8 s, then it is gone', () => {
    const fx = createEffects(() => 0, lvl);
    fx.event(die(8, 2, 8), 1);
    step(fx, 3.5);
    expect(fx.gibs).toHaveLength(0);
    expect(fx.splats.length).toBeGreaterThan(0);
    step(fx, 3);
    expect(fx.splats.length).toBeGreaterThan(0);
    step(fx, 2.5);
    expect(fx.splats).toHaveLength(0);
  });

  it('keeps at most 24 splats, the newest', () => {
    const fx = createEffects(() => 0, lvl);
    for (let i = 0; i < 6; i++) {
      fx.event(die(8, 2, 8), 1);
      step(fx, 1.2);
    }
    expect(fx.splats).toHaveLength(24);
  });
});

describe('spark streaks', () => {
  it('spans TRAIL seconds of velocity', () => {
    expect(TRAIL).toBeGreaterThan(0.02);
    expect(TRAIL).toBeLessThan(0.1);
  });
});
