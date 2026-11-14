import { describe, expect, it, vi } from 'vitest';
import {
  AMMO_PACK,
  BLOW,
  PUNCHES,
  GUN_RELOAD,
  RAIL_RELOAD,
  CUTS,
  CHARGE_TAP,
  GUN_RANGE,
  INTERP_DELAY,
  MAX_PITCH,
  PLASMA_R,
  PLASMA_SPEED,
  RECOIL,
  NADE,
  NADE_COOL,
} from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import { TRAIL, createBalls } from './balls';
import { createTracer } from './beams';
import type { Orb } from './beams';
import { createCombat, fired, sight, struck, swung, voiceOf } from './combat';
import { aimed, focus, tip } from './gun';
import type { Vec3 } from './mesh';
import type { View } from './combat';
import { SOUND } from './sfx';

const player = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ammo: 30,
  ...o,
});
/** A roof 10 m long along z, and a wall at z = -20. */
const WORLD = build({
  brushes: [
    { min: [-50, -30, -10], max: [50, 0, 10], top: 0, side: 0 },
    { min: [-50, 0, -21], max: [50, 8, -20], top: 0, side: 0 },
  ],
  teams: [
    { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
    { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
  ],
  floor: -25,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
const mk = (o: Partial<Pick<View, 'yaw' | 'cam' | 'drawn' | 'pitch'>> = {}): View => {
  const v = {
    eye: [0, 1.6, 0] as Vec3,
    cam: [0, 1.6, 0] as Vec3,
    yaw: 0,
    pitch: 0,
    drawn: 0,
    ...o,
  };
  return { ...v, muzzle: [0.2, -0.1, 0.6] };
};
const VIEW = mk();

const setup = () => {
  const audio = { play: vi.fn() };
  const hud = { vitals: vi.fn(), hit: vi.fn(), down: vi.fn() };
  const fx = {
    fire: vi.fn(),
    cut: vi.fn(),
    wound: vi.fn(),
    quake: vi.fn(),
    lie: 0,
    blow: vi.fn(),
    punch: vi.fn(),
  };
  const tracer = createTracer();
  const ctl = { pitch: 0 };
  const balls = createBalls(WORLD);
  const combat = createCombat(WORLD, audio, hud, fx, tracer, ctl, balls);
  const ids = () => audio.play.mock.calls.map(c => c[0]);
  /** The time of the frames, ms: each one 1/60 s on. */
  let now = 1000;
  const frame = (
    me: PlayerState | undefined,
    others: PlayerState[] = [],
    keys = 0,
    v: View | undefined = me && VIEW,
  ) => combat.frame(v, me, others, keys, 1 / 60, (now += 1000 / 60));
  /** What the tracer is given and does: the flashes, the bursts and the balls of the last frame. */
  const flashes: [Vec3, boolean | undefined][] = [];
  const bursts: Vec3[] = [];
  /** Which of them were red. */
  const reds: boolean[] = [];
  let orbs: Orb[] = [];
  const [flash, burst, list] = [tracer.flash, tracer.burst, tracer.orbs];
  tracer.flash = (a, own) => (flashes.push([a, own]), flash(a, own));
  tracer.burst = (at, red) => (bursts.push(at), reds.push(!!red), burst(at, red));
  tracer.orbs = l => ((orbs = l), list(l));
  return {
    audio,
    hud,
    fx,
    tracer,
    ctl,
    balls,
    combat,
    ids,
    frame,
    flashes,
    bursts,
    reds,
    orbs: () => orbs,
    at: () => now,
  };
};

describe('fired', () => {
  it('counts the shots between two states, on a u8 that wraps', () => {
    expect(fired(player({ shots: 3 }), player({ shots: 5 }))).toBe(2);
    expect(fired(player({ shots: 254 }), player({ shots: 1 }))).toBe(3);
    expect(fired(player({ shots: 9 }), player({ shots: 9 }))).toBe(0);
    expect(fired(undefined, player({ shots: 9 }))).toBe(0);
  });
});

describe('the recoil', () => {
  it('kicks the look up by RECOIL for each own shot, so that the next input carries it', () => {
    const { combat, ctl, fx } = setup();
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    expect(ctl.pitch).toBeCloseTo(RECOIL, 9);
    combat.step(player({ shots: 1 }), player({ shots: 2 }));
    expect(ctl.pitch).toBeCloseTo(2 * RECOIL, 9);
    expect(fx.fire).toHaveBeenCalledTimes(2);
  });

  it('kicks a charged shot up much further, and plays the long blast under it', () => {
    const { combat, ctl, fx, frame, ids } = setup();
    combat.step(player({ shots: 0 }), player({ shots: 1, power: 5 }));
    expect(ctl.pitch).toBeCloseTo(RECOIL * 3.4, 9);
    expect(fx.fire).toHaveBeenLastCalledWith(5);
    frame(player({ shots: 1 }));
    expect(ids()).toEqual([SOUND.LASER, SOUND.BLAST]);
    // A plain shot has no blast.
    combat.step(player({ shots: 1 }), player({ shots: 2, power: 1 }));
    frame(player({ shots: 2 }));
    expect(ids().filter(i => i === SOUND.BLAST)).toHaveLength(1);
  });

  it('lights the muzzles that charge, the own and the others', () => {
    const { frame, tracer } = setup();
    const charging = vi.spyOn(tracer, 'charging');
    const him = (charge: number) => player({ id: 2, x: 5, z: -3, ammo: 30, charge });
    frame(player({ ammo: 30, charge: 2 }), [him(0)]);
    expect(charging).toHaveBeenLastCalledWith([]);
    frame(player({ ammo: 30, charge: 60 }), [him(35)]);
    const [list] = charging.mock.lastCall!;
    expect(list.map(h => h.k)).toEqual([1, 0.5]);
  });

  it('climbs with sustained fire, and the player pulls down to compensate', () => {
    const { combat, ctl } = setup();
    for (let i = 0; i < 20; i++) {
      combat.step(player({ shots: i }), player({ shots: i + 1 }));
    }
    expect(ctl.pitch).toBeCloseTo(20 * RECOIL, 9);
    ctl.pitch -= 20 * RECOIL;
    expect(ctl.pitch).toBeCloseTo(0, 9);
  });

  it('does nothing for a step that fired nothing, and stops at the top of the range', () => {
    const { combat, ctl, fx } = setup();
    combat.step(player(), player());
    combat.step(undefined, player());
    expect(ctl.pitch).toBe(0);
    expect(fx.fire).not.toHaveBeenCalled();
    ctl.pitch = MAX_PITCH - RECOIL / 2;
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    expect(ctl.pitch).toBe(MAX_PITCH);
  });
});

describe('the own shots', () => {
  it('flash the muzzle and play the shot once each, and launch a ball from the eye along the look', () => {
    const { combat, frame, ids, flashes, orbs } = setup();
    frame(player());
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(player({ shots: 1 }));
    expect(flashes).toHaveLength(1);
    expect(flashes[0][1]).toBe(true);
    expect(ids()).toEqual([SOUND.LASER]);
    // Drawn from the muzzle at first.
    expect(orbs()).toHaveLength(1);
    expect(orbs()[0].p).toEqual([
      expect.closeTo(0.2, 6),
      expect.closeTo(1.5, 6),
      expect.closeTo(-0.6, 6),
    ]);
    expect(orbs()[0].d).toEqual([expect.closeTo(0, 9), expect.closeTo(0, 9), -1]);
    // Once only.
    frame(player({ shots: 1 }));
    expect(flashes).toHaveLength(1);
    expect(ids()).toEqual([SOUND.LASER]);
  });

  it('hiss once when the rail gun overheats, the own one and another one where he is', () => {
    const { frame, ids, audio } = setup();
    const railed = { ammo: -1, rail: 200, cap: 40, railed: true };
    const other = player({ ...railed, id: 2, x: 5 });
    frame(player(railed), [other]);
    frame(player({ ...railed, hot: true }), [other]);
    frame(player({ ...railed, hot: true }), [other]);
    expect(ids()).toEqual([SOUND.HISS]);
    frame(player({ ...railed, hot: true }), [{ ...other, hot: true }]);
    expect(ids()).toEqual([SOUND.HISS, SOUND.HISS]);
    expect(audio.play.mock.calls[1][1]).toBeDefined();
  });

  it('of the laser rifle launch a red ball (power 0) from the muzzle, with a red flash and its punch', () => {
    const { combat, frame, ids, flashes, orbs } = setup();
    const rifled = { ammo: -1, rifle: 50, clip: 20, rifled: true };
    frame(player(rifled));
    combat.step(player({ ...rifled, shots: 0 }), player({ ...rifled, shots: 1 }));
    frame(player({ ...rifled, shots: 1 }));
    expect(ids()).toEqual([SOUND.LASE]);
    expect(flashes).toHaveLength(1);
    expect(orbs()).toHaveLength(1);
    expect(orbs()[0].power).toBe(0);
  });

  it('of the rifle’s launcher thump a grenade out under the muzzle: an orange flash, a hard kick, no laser', () => {
    const { combat, frame, ids, flashes, orbs, fx, ctl } = setup();
    const rifled = { ammo: -1, rifle: 50, clip: 20, rifled: true, nades: 2 };
    const after = player({ ...rifled, shots: 1, lob: NADE_COOL, pitch: 0.3 });
    frame(player(rifled));
    combat.step(player({ ...rifled, shots: 0 }), after);
    expect(fx.fire).toHaveBeenLastCalledWith(3);
    expect(ctl.pitch).toBeGreaterThan(0);
    frame(after);
    expect(ids()).toEqual([SOUND.TACKLE, SOUND.DASH]);
    expect(flashes).toHaveLength(1);
    // Under the rifle's muzzle, and behind it.
    const m = VIEW.muzzle;
    expect(flashes[0][0][1]).toBeLessThan(VIEW.cam[1] + m[1] - 0.05);
    expect(flashes[0][0][2]).toBeGreaterThan(VIEW.cam[2] - m[2] + 0.2);
    expect(orbs()).toHaveLength(1);
    expect(orbs()[0].power).toBe(NADE);
  });

  it('of the rifle’s launcher burst in a fireball with a blast, and shake the view of who is near', () => {
    const { combat, frame, audio, orbs, bursts, tracer, fx } = setup();
    const blast = vi.spyOn(tracer, 'blast');
    const rifled = { ammo: -1, rifle: 50, clip: 20, rifled: true };
    const after = player({ ...rifled, shots: 1, lob: NADE_COOL, pitch: -0.9 });
    frame(player(rifled));
    combat.step(player({ ...rifled, shots: 0 }), after);
    for (let k = 0; k < 90 && !blast.mock.calls.length; k++) {
      frame(after);
    }
    // On the roof at his feet: no plain splash, the three sounds of the blast there, a hard shake.
    expect(blast).toHaveBeenCalledTimes(1);
    const [at] = blast.mock.calls[0];
    expect(at[1]).toBeCloseTo(0.12, 2);
    expect(bursts).toEqual([]);
    expect(orbs()).toEqual([]);
    expect(audio.play.mock.calls.slice(-3).map(c => [c[0], c[1]])).toEqual([
      [SOUND.BLAST, at],
      [SOUND.TACKLE, at],
      [SOUND.SPLASH, at],
    ]);
    expect(fx.quake).toHaveBeenCalledTimes(1);
    expect(fx.quake.mock.calls[0][0]).toBeGreaterThan(0.8);
  });

  it('of another’s launcher thump at his gun, and not as a laser shot', () => {
    const { frame, ids, flashes } = setup();
    const foe = { id: 5, x: 3, z: -4, ammo: -1, rifle: 50, clip: 20, rifled: true };
    frame(player(), [player({ ...foe, shots: 4 })]);
    frame(player(), [player({ ...foe, shots: 5, lob: NADE_COOL - 2 })]);
    expect(ids()).toEqual([SOUND.TACKLE, SOUND.DASH]);
    expect(flashes).toHaveLength(1);
    frame(player(), [player({ ...foe, shots: 6, lob: NADE_COOL - 9 })]);
    expect(ids().at(-1)).toBe(SOUND.LASE);
  });

  it('of another player’s long gun leave from its muzzle as his runner was drawn, from where he is now', () => {
    const t = setup();
    const combat = createCombat(WORLD, t.audio, t.hud, t.fx, t.tracer, t.ctl, t.balls, id =>
      id == 5 ? [0.1, 1.4, -0.9] : undefined,
    );
    const foe = { id: 5, x: 3, z: -4, ammo: -1, rifle: 50, clip: 20, rifled: true };
    const frame = (o: Partial<PlayerState>, now: number) =>
      combat.frame(VIEW, player(), [player({ ...foe, ...o })], 0, 1 / 60, now);
    frame({ shots: 4 }, 1000);
    frame({ shots: 5, x: 3.5 }, 1016);
    expect(t.flashes).toHaveLength(1);
    t.flashes[0][0].forEach((v, i) => expect(v).toBeCloseTo([3.6, 1.4, -4.9][i]));
    // The gun, in one hand, is not shouldered: its muzzle is where aimed() holds it out.
    frame({ shots: 6, ammo: 9, rifled: false }, 1032);
    expect(Math.hypot(...t.flashes[1][0].map((v, i) => v - [3.1, 1.4, -4.9][i]))).toBeGreaterThan(
      0.1,
    );
  });

  it('of the laser rifle burst red on the wall, with a deeper, louder thud', () => {
    const { combat, frame, audio, orbs, bursts, reds } = setup();
    const rifled = { ammo: -1, rifle: 50, clip: 20, rifled: true };
    frame(player(rifled));
    combat.step(player({ ...rifled, shots: 0 }), player({ ...rifled, shots: 1 }));
    for (let k = 0; k < 40 && !bursts.length; k++) {
      frame(player({ ...rifled, shots: 1 }));
    }
    expect(orbs()).toEqual([]);
    expect(reds).toEqual([true]);
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SPLASH, bursts[0], 1.3, 0.6);
  });

  it('fly at PLASMA_SPEED onto the look line, and burst on the wall it meets, with the zap there', () => {
    const { combat, frame, ids, audio, orbs, bursts } = setup();
    frame(player());
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(player({ shots: 1 }));
    // A quarter of a second on: 10 m out, on the line from the eye (x 0, y 1.6).
    for (let k = 0; k < 15; k++) {
      frame(player({ shots: 1 }));
    }
    const [o] = orbs();
    expect(o.p[0]).toBeCloseTo(0, 6);
    expect(o.p[1]).toBeCloseTo(1.6, 6);
    expect(o.p[2]).toBeCloseTo(-PLASMA_SPEED / 4, 0);
    expect(o.tail).toBeCloseTo(TRAIL, 6);
    // The wall at z = -20, 20 m from the eye: half a second.
    for (let k = 0; k < 20 && !bursts.length; k++) {
      frame(player({ shots: 1 }));
    }
    expect(bursts).toHaveLength(1);
    expect(bursts[0][2]).toBeCloseTo(-20 + PLASMA_R, 6);
    expect(orbs()).toEqual([]);
    expect(ids()).toEqual([SOUND.LASER, SOUND.SPLASH]);
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SPLASH, bursts[0], 1, 1);
  });

  it('start at the muzzle in the camera, kicked and shaken with it', () => {
    const { combat, frame, flashes } = setup();
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(player({ shots: 1 }), [], 0, mk({ cam: [0, 1.7, 0] }));
    expect(flashes[0][0]).toEqual([
      expect.closeTo(0.2, 6),
      expect.closeTo(1.6, 6),
      expect.closeTo(-0.6, 6),
    ]);
  });

  it('flash nothing and play nothing without a view', () => {
    const { combat, frame, ids, flashes, orbs } = setup();
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(undefined, [], 0, undefined);
    expect(flashes).toEqual([]);
    expect(orbs()).toEqual([]);
    expect(ids()).toEqual([]);
  });
});

describe('the rail gun’s bolts', () => {
  /** The setup, with the bolts the tracer is given at the last frame. */
  const rig = () => {
    const t = setup();
    let zaps: { a: Vec3; b: Vec3 }[] = [];
    const lightning = t.tracer.lightning;
    t.tracer.lightning = l => ((zaps = l), lightning(l));
    return { ...t, zaps: () => zaps };
  };
  const RAILED = { rail: 100, railed: true, ammo: -1 };

  it('go from the own muzzle to the wall the look meets on every frame it is held, with no ball', () => {
    const { frame, ids, orbs, zaps } = rig();
    frame(player({ ...RAILED, zapping: true }));
    expect(zaps()).toHaveLength(1);
    // The wall at z = -20, straight ahead of the eye.
    expect(zaps()[0].b).toEqual([
      expect.closeTo(0, 6),
      expect.closeTo(1.6, 6),
      expect.closeTo(-20, 3),
    ]);
    expect(zaps()[0].a[2]).toBeCloseTo(-0.6, 6);
    expect(orbs()).toHaveLength(0);
    for (let k = 0; k < 59; k++) {
      frame(player({ ...RAILED, zapping: true }));
      expect(zaps()).toHaveLength(1);
    }
    // The own is heard as the looped buzz, not as crackles.
    expect(ids()).toEqual([]);
    frame(player({ ...RAILED, zapping: false }));
    expect(zaps()).toHaveLength(0);
  });

  it('buzz in a loop while the own rail gun is in hand, up and down in pitch while the bolt goes out', () => {
    const t = setup();
    const loops = new Map<number, { v: number; r: number }[]>();
    const audio = {
      ...t.audio,
      loop: (id: number) => {
        loops.set(id, []);
        return { set: (v: number, r: number) => loops.get(id)!.push({ v, r }) };
      },
    };
    const combat = createCombat(WORLD, audio, t.hud, t.fx, t.tracer, t.ctl, t.balls);
    for (let k = 0; k < 60; k++) {
      combat.frame(
        VIEW,
        player({ ...RAILED, zapping: k >= 10 }),
        [],
        0,
        1 / 60,
        1000 + (k * 1000) / 60,
      );
    }
    const [hum, buzz] = [loops.get(SOUND.HUM)!, loops.get(SOUND.BUZZ)!];
    expect(hum.every(s => s.v > 0)).toBe(true);
    expect(buzz.slice(0, 10).every(s => s.v == 0)).toBe(true);
    expect(buzz.slice(10).every(s => s.v > 0)).toBe(true);
    const rates = buzz.slice(10).map(s => s.r);
    expect(Math.max(...rates)).toBeGreaterThan(1.2);
    expect(Math.min(...rates)).toBeLessThan(0.8);
  });

  it('whine in a loop while the own gun charges past a tap, higher and louder as it fills (the user, 2026-11-09)', () => {
    const t = setup();
    const loops = new Map<number, { v: number; r: number }[]>();
    const audio = {
      ...t.audio,
      loop: (id: number) => {
        loops.set(id, []);
        return { set: (v: number, r: number) => loops.get(id)!.push({ v, r }) };
      },
    };
    const combat = createCombat(WORLD, audio, t.hud, t.fx, t.tracer, t.ctl, t.balls);
    // A tap, then a charge growing to full, then the shot.
    const charges = [0, 2, ...Array.from({ length: 60 }, (_, k) => CHARGE_TAP + k), 0];
    charges.forEach((charge, k) =>
      combat.frame(VIEW, player({ charge }), [], 0, 1 / 60, 1000 + (k * 1000) / 60),
    );
    const whine = loops.get(SOUND.CHARGE)!;
    expect(whine.slice(0, 2).every(s => s.v == 0)).toBe(true);
    const on = whine.slice(2, -1);
    expect(on.every(s => s.v > 0)).toBe(true);
    expect(on[on.length - 1].r).toBeGreaterThan(on[0].r * 1.5);
    expect(on[on.length - 1].v).toBeGreaterThan(on[0].v);
    expect(whine[whine.length - 1].v).toBe(0);
  });

  it('go from an other runner’s rail gun while he holds it, with the crackle where he is', () => {
    const { frame, ids, audio, zaps } = rig();
    const me = player();
    frame(me, [player({ id: 4, x: 3, z: -2, ...RAILED, zapping: true })]);
    expect(zaps()).toHaveLength(1);
    expect(zaps()[0].b[2]).toBeCloseTo(-20, 3);
    expect(ids()).toEqual([SOUND.RAIL]);
    expect(audio.play.mock.calls[0][1]).toEqual([3, expect.any(Number), -2]);
    frame(me, [player({ id: 4, x: 3, z: -2, ...RAILED, zapping: false })]);
    expect(zaps()).toHaveLength(0);
  });
});

describe('where the shots go', () => {
  const dir = (a: Vec3, b: Vec3): Vec3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const angle = (a: Vec3, b: Vec3) =>
    (Math.acos(
      Math.min(
        1,
        (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)),
      ),
    ) *
      180) /
    Math.PI;

  it('flash at the emitter of the gun of a runner, and the gun points along his look', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [0.5, 0.2],
      [Math.PI, -0.1],
    ]) {
      const { frame, flashes } = setup();
      const at = (shots: number) => player({ id: 2, x: 5, z: -3, yaw, pitch, shots });
      frame(player(), [at(1)]);
      frame(player(), [at(2)]);
      const [to] = focus(at(2), WORLD);
      const [grip, ax] = aimed(at(2), to);
      expect(flashes).toHaveLength(1);
      expect(flashes[0].slice(0, 2)).toEqual([tip(grip, ax), false]);
      // The long axis of the gun, from the back of its body to the emitter, points where he looks.
      const rear: Vec3 = [0, 1, 2].map(i => grip[i] + ax[1][i] * 0.095 - ax[2][i] * 0.06) as Vec3;
      expect(angle(dir(rear, flashes[0][0]), dir(flashes[0][0], to))).toBeLessThan(0.5);
    }
  });
});

describe('sight', () => {
  it('is the end of the look ray, in the world and in the camera space the gun points in', () => {
    const near = sight(WORLD, [0, 1.6, 0], [0, 1.6, 0], 0, 0, 0);
    expect(near.hit).toBe(true);
    expect(near.end).toEqual([
      expect.closeTo(0, 6),
      expect.closeTo(1.6, 6),
      expect.closeTo(-20, 3),
    ]);
    // The camera space is (right, up, forward): 20 m straight ahead.
    expect(near.local).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6), expect.closeTo(20, 3)]);
    const far = sight(WORLD, [0, 1.6, 0], [0, 1.6, 0], Math.PI, 0, 0);
    expect(far.hit).toBe(false);
    expect(far.local[2]).toBeCloseTo(GUN_RANGE, 3);
  });

  it('follows the camera when it moves or shakes: the same point seen from the camera', () => {
    // The camera 10 cm above the eye and pitched 0.05 higher than the look: the end drops and goes right of nothing.
    const s = sight(WORLD, [0, 1.6, 0], [0, 1.7, 0], 0, 0, 0.05);
    expect(s.local[1]).toBeLessThan(-0.1);
    expect(Math.hypot(...s.local)).toBeCloseTo(20, 0);
  });
});

describe('the others shots', () => {
  const other = (shots: number, o: Partial<PlayerState> = {}) =>
    player({ id: 2, x: 5, z: -3, shots, ...o });

  it('flash his muzzle and play the shot at his place, once for a change', () => {
    const { frame, flashes, audio } = setup();
    frame(player(), [other(10)]);
    expect(flashes).toEqual([]);
    frame(player(), [other(11)]);
    expect(flashes).toHaveLength(1);
    expect(audio.play).toHaveBeenCalledWith(
      SOUND.LASER,
      [5, 1.6, -3],
      expect.any(Number),
      expect.any(Number),
    );
    frame(player(), [other(11)]);
    // A shot let go from a full charge: the long blast under it, at his place.
    frame(player(), [other(11, { charge: 60 })]);
    frame(player(), [other(12)]);
    expect(audio.play).toHaveBeenCalledWith(
      SOUND.BLAST,
      [5, 1.6, -3],
      expect.any(Number),
      expect.any(Number),
    );
    frame(player(), [other(12)]);
    // A long gap in the snapshots is one flash.
    frame(player(), [other(200)]);
    expect(flashes).toHaveLength(3);
  });

  it('forget a player who left: he is new when he is back', () => {
    const { frame, flashes } = setup();
    frame(player(), [other(10)]);
    frame(player(), []);
    frame(player(), [other(40)]);
    expect(flashes).toEqual([]);
  });

  it('draw his balls from the snapshots, out of his muzzle, and burst them where the host says', () => {
    const { frame, balls, orbs, bursts, audio, at } = setup();
    const p = other(1);
    frame(player(), [p]);
    const ball = { id: 1, by: 2, x: 5, y: 1.6, z: -5, dx: 0, dy: 0, dz: -1, burst: false };
    balls.snapshot([ball], 1, at());
    // Drawn INTERP_DELAY late, like him.
    frame(player(), [p]);
    expect(orbs()).toEqual([]);
    const sent = at();
    for (let k = 0; k < 10 && !orbs().length; k++) {
      frame(player(), [p]);
    }
    expect(at() - sent).toBeGreaterThanOrEqual(INTERP_DELAY - 1000 / 60);
    expect(orbs()).toHaveLength(1);
    const [grip, ax] = aimed(p, focus(p, WORLD)[0]);
    expect(orbs()[0].tail).toBeLessThan(0.1);
    const muzzle = tip(grip, ax);
    expect(Math.hypot(...orbs()[0].p.map((v, i) => v - muzzle[i]))).toBeLessThan(0.1);
    balls.snapshot([{ ...ball, z: -6 }], 1, at());
    balls.snapshot([{ ...ball, z: -7, burst: true }], 1, at());
    for (let k = 0; k < 10 && !bursts.length; k++) {
      frame(player(), [p]);
    }
    expect(bursts).toEqual([[5, 1.6, -7]]);
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SPLASH, [5, 1.6, -7], 1, 1);
    expect(orbs()).toEqual([]);
  });
});

describe('the sounds and the screen of what happens to the own player', () => {
  it('plays the hit sound and shows the marker on a change of `hits`, and not otherwise', () => {
    const { frame, ids, hud } = setup();
    frame(player({ hits: 3 }));
    frame(player({ hits: 3 }));
    expect(ids()).toEqual([]);
    frame(player({ hits: 4 }));
    expect(ids()).toEqual([SOUND.HIT]);
    expect(hud.hit).toHaveBeenCalledTimes(1);
    frame(player({ hits: 4 }));
    expect(ids()).toEqual([SOUND.HIT]);
    // The counter wraps.
    frame(player({ hits: 255 }));
    frame(player({ hits: 0 }));
    expect(ids()).toEqual([SOUND.HIT, SOUND.HIT, SOUND.HIT]);
  });

  it('does not play the hit sound for the others hits, nor for its own shots', () => {
    const { frame, ids, combat } = setup();
    frame(player());
    combat.step(player(), player({ shots: 1 }));
    frame(player({ shots: 1 }), [player({ id: 2, hits: 0 })]);
    frame(player({ shots: 1 }), [player({ id: 2, hits: 1 })]);
    expect(ids()).not.toContain(SOUND.HIT);
  });

  it('plays hurt, a cry and the red flash when the health goes down, going down and the death cry when it runs out', () => {
    const { frame, ids, fx } = setup();
    frame(player({ hp: 5 }));
    frame(player({ hp: 4 }));
    expect(ids()).toEqual([SOUND.HURT, SOUND.PAIN]);
    expect(fx.wound).toHaveBeenCalledTimes(1);
    frame(player({ hp: 0, down: 120, ammo: -1 }));
    expect(ids()).toEqual([SOUND.HURT, SOUND.PAIN, SOUND.DOWN, SOUND.DEATH]);
    expect(fx.wound).toHaveBeenCalledTimes(2);
  });

  it('makes the others cry out where they stand when they lose health, and as they go down, not when they heal or respawn', () => {
    const { frame, audio } = setup();
    const cries = () =>
      audio.play.mock.calls.filter(c => c[0] == SOUND.PAIN || c[0] == SOUND.DEATH);
    const bob = (o: Partial<PlayerState>) => player({ id: 2, x: 5, ...o });
    frame(player(), [bob({ hp: 5 })]);
    frame(player(), [bob({ hp: 3 })]);
    expect(cries().map(c => c[0])).toEqual([SOUND.PAIN]);
    // At him, not centred.
    expect(cries()[0][1]?.[0]).toBe(5);
    frame(player(), [bob({ hp: 0, down: 120, ammo: -1 })]);
    frame(player(), [bob({ hp: 5, down: 0, ammo: -1 })]);
    frame(player(), [bob({ hp: 5, down: 0, ammo: -1 })]);
    expect(cries().map(c => c[0])).toEqual([SOUND.PAIN, SOUND.DEATH]);
  });

  it('gives each player a voice of his own, the woman a higher one', () => {
    const men = [0, 1, 2, 3, 4, 5].map(id => voiceOf(id));
    expect(new Set(men).size).toBe(6);
    for (const v of men) {
      expect(v).toBeGreaterThanOrEqual(0.9);
      expect(v).toBeLessThan(1.1);
    }
    expect(voiceOf(3, 1)).toBeGreaterThan(Math.max(...men));
  });

  it('plays the pack when the health goes up, and nothing for a respawn at full health', () => {
    const { frame, ids } = setup();
    frame(player({ hp: 3 }));
    frame(player({ hp: 5 }));
    expect(ids()).toEqual([SOUND.PACK]);
    frame(player({ hp: 0, down: 5, ammo: -1 }));
    frame(player({ hp: 5, down: 0, ammo: -1 }));
    expect(ids().filter(i => i == SOUND.PACK)).toHaveLength(1);
  });

  it('plays the pickup when the gun is taken, and on a refill, not on a shot', () => {
    const { frame, ids } = setup();
    frame(player({ ammo: -1 }));
    frame(player({ ammo: 60 }));
    // Taken, the pickup at once; it powers up as the thumb presses its button, PRESS later, this
    // first time only.
    expect(ids()).toEqual([SOUND.GUN]);
    for (let i = 0; i < 28; i++) {
      frame(player({ ammo: 60 }));
    }
    expect(ids()).toEqual([SOUND.GUN, SOUND.BOOT]);
    frame(player({ ammo: 59 }));
    frame(player({ ammo: 58 }));
    expect(ids()).toEqual([SOUND.GUN, SOUND.BOOT]);
    frame(player({ ammo: 60 }));
    expect(ids()).toEqual([SOUND.GUN, SOUND.BOOT, SOUND.GUN]);
  });

  it('plays it too for an ammo pack: plus AMMO_PACK from any count, at once', () => {
    for (const from of [0, 10, 25]) {
      const { frame, ids } = setup();
      frame(player({ ammo: from }));
      frame(player({ ammo: from + AMMO_PACK }));
      expect(ids()).toEqual([SOUND.GUN]);
      frame(player({ ammo: from + AMMO_PACK }));
      expect(ids()).toEqual([SOUND.GUN]);
    }
  });

  it('clicks once when the trigger is pulled on an empty gun', () => {
    const { frame, ids } = setup();
    frame(player({ ammo: 0 }), [], 0);
    frame(player({ ammo: 0 }), [], KEY.FIRE);
    frame(player({ ammo: 0 }), [], KEY.FIRE);
    expect(ids()).toEqual([SOUND.DRY]);
    frame(player({ ammo: 0 }), [], 0);
    frame(player({ ammo: 0 }), [], KEY.FIRE);
    expect(ids()).toEqual([SOUND.DRY, SOUND.DRY]);
  });

  it('does not click with no gun, nor with rounds left', () => {
    const { frame, ids } = setup();
    frame(player({ ammo: -1 }), [], 0);
    frame(player({ ammo: -1 }), [], KEY.FIRE);
    expect(ids()).toEqual([]);
    const full = setup();
    full.frame(player({ ammo: 5 }), [], 0);
    full.frame(player({ ammo: 5 }), [], KEY.FIRE);
    expect(full.ids()).toEqual([]);
  });

  it('feeds the HUD each frame: health, ammo, and how far down', () => {
    const { frame, hud } = setup();
    frame(player({ hp: 3, ammo: 12, down: 0, armor: 2 }));
    expect(hud.vitals).toHaveBeenLastCalledWith(
      3,
      12,
      false,
      false,
      -1,
      false,
      0,
      false,
      -1,
      false,
      0,
      2,
    );
    expect(hud.down).toHaveBeenLastCalledWith(0, 0);
    frame(player({ hp: 0, ammo: -1, down: 90 }));
    expect(hud.vitals).toHaveBeenLastCalledWith(
      0,
      -1,
      false,
      false,
      -1,
      false,
      0,
      false,
      -1,
      false,
      0,
      0,
    );
    expect(hud.down).toHaveBeenLastCalledWith(0, 1.5);
  });
});

/** The own player in the katana's swing: `swing` ticks left of `cut`. */
const cutting = (cut: number, swing: number, o: Partial<PlayerState> = {}) =>
  player({ blade: true, wield: true, cut, swing, ...o });

describe('swung and struck', () => {
  it('read the start of a swing: `swing` jumping up, or the cut changing under a running one', () => {
    expect(swung(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 36))).toBe(CUT.SLASH);
    expect(swung(cutting(CUT.THRUST, 0), cutting(CUT.THRUST, 24))).toBe(CUT.THRUST);
    // A swing that ran its course and a new one in the same two ticks.
    expect(swung(cutting(CUT.LEFT, 1), cutting(CUT.RIGHT, 30))).toBe(CUT.RIGHT);
    expect(swung(cutting(CUT.LEFT, 10), cutting(CUT.THRUST, 9))).toBe(CUT.THRUST);
  });

  it('read nothing from a swing running down, a swing that ended, or a state that does not swing', () => {
    expect(swung(cutting(CUT.SLASH, 30), cutting(CUT.SLASH, 29))).toBe(-1);
    expect(swung(cutting(CUT.SLASH, 1), cutting(CUT.SLASH, 0))).toBe(-1);
    expect(swung(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 0))).toBe(-1);
    expect(swung(player(), player())).toBe(-1);
    expect(swung(undefined, cutting(CUT.SLASH, 36))).toBe(-1);
    expect(swung(cutting(CUT.SLASH, 0), undefined)).toBe(-1);
  });

  it('find the strike once in a whole swing, whatever the cut', () => {
    for (const [cut, { ticks }] of CUTS.entries()) {
      let n = 0;
      let at = -1;
      for (let swing = ticks; swing > 0; swing--) {
        if (struck(cutting(cut, swing), cutting(cut, swing - 1))) {
          n++;
          at = ticks - (swing - 1);
        }
      }
      expect(n).toBe(1);
      expect(at).toBe(CUTS[cut].strike);
    }
  });

  it('do not take the start of a swing, nor a state without one, for a strike', () => {
    expect(struck(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 36))).toBe(false);
    expect(struck(undefined, cutting(CUT.SLASH, 20))).toBe(false);
    expect(struck(player(), player())).toBe(false);
  });
});

describe('the own cuts', () => {
  it('play the swish when a swing starts, once, at a pitch and a weight that follow the cut', () => {
    const { combat, frame, audio } = setup();
    frame(cutting(CUT.SLASH, 0));
    combat.step(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 36));
    frame(cutting(CUT.SLASH, 36));
    expect(audio.play).toHaveBeenCalledWith(SOUND.SWISH, undefined, 1, 0.8);
    combat.step(cutting(CUT.SLASH, 36), cutting(CUT.SLASH, 35));
    frame(cutting(CUT.SLASH, 35));
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('make a thrust higher and shorter than a slash, with the cut across between', () => {
    const rate = (cut: number) => {
      const { combat, frame, audio } = setup();
      frame(cutting(cut, 0));
      combat.step(cutting(cut, 0), cutting(cut, CUTS[cut].ticks));
      frame(cutting(cut, CUTS[cut].ticks));
      return audio.play.mock.calls.find(c => c[0] == SOUND.SWISH)![3];
    };
    expect(rate(CUT.THRUST)).toBeGreaterThan(rate(CUT.LEFT));
    expect(rate(CUT.LEFT)).toBeGreaterThan(rate(CUT.SLASH));
    expect(rate(CUT.RIGHT)).toBeGreaterThan(rate(CUT.SLASH));
  });

  it('play a swish for each of two cuts in a frame, and none without a swing', () => {
    const { combat, frame, ids } = setup();
    frame(cutting(CUT.THRUST, 0));
    combat.step(cutting(CUT.THRUST, 0), cutting(CUT.THRUST, 0));
    frame(cutting(CUT.THRUST, 0));
    expect(ids()).toEqual([]);
    combat.step(cutting(CUT.THRUST, 0), cutting(CUT.THRUST, 24));
    combat.step(cutting(CUT.THRUST, 1), cutting(CUT.LEFT, 30));
    frame(cutting(CUT.LEFT, 30));
    expect(ids()).toEqual([SOUND.SWISH, SOUND.SWISH]);
  });

  it('punch the camera on the strike tick, not before and not twice, with the cut', () => {
    const { combat, fx } = setup();
    const { ticks, strike } = CUTS[CUT.SLASH];
    combat.step(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, ticks));
    for (let n = 1; n < strike; n++) {
      combat.step(cutting(CUT.SLASH, ticks - n + 1), cutting(CUT.SLASH, ticks - n));
    }
    expect(fx.cut).not.toHaveBeenCalled();
    combat.step(cutting(CUT.SLASH, ticks - strike + 1), cutting(CUT.SLASH, ticks - strike));
    expect(fx.cut).toHaveBeenCalledWith(CUT.SLASH);
    combat.step(cutting(CUT.SLASH, ticks - strike), cutting(CUT.SLASH, ticks - strike - 1));
    expect(fx.cut).toHaveBeenCalledTimes(1);
  });

  it('give the katana no recoil, no shot and no ball', () => {
    const { combat, frame, ctl, fx, flashes, orbs, ids } = setup();
    frame(cutting(CUT.THRUST, 0));
    combat.step(cutting(CUT.THRUST, 0), cutting(CUT.THRUST, 24));
    frame(cutting(CUT.THRUST, 24));
    expect(ctl.pitch).toBe(0);
    expect(fx.fire).not.toHaveBeenCalled();
    expect([flashes, orbs()]).toEqual([[], []]);
    expect(ids()).not.toContain(SOUND.LASER);
  });
});

describe('the own hits with the katana', () => {
  it('play the zap with the hit sound when the katana is in hand', () => {
    const { frame, ids, hud } = setup();
    frame(cutting(CUT.SLASH, 20, { hits: 0 }));
    frame(cutting(CUT.SLASH, 19, { hits: 1 }));
    expect(ids()).toEqual([SOUND.HIT, SOUND.ZAP]);
    expect(hud.hit).toHaveBeenCalledTimes(1);
  });

  it('play only the hit sound when the gun is in hand, though the katana is carried', () => {
    const { frame, ids } = setup();
    frame(player({ blade: true, wield: false, hits: 0 }));
    frame(player({ blade: true, wield: false, hits: 1 }));
    expect(ids()).toEqual([SOUND.HIT]);
  });

  it('play only the hit sound for a laser hit, and nothing for the others hits', () => {
    const { frame, ids } = setup();
    frame(player({ hits: 0 }), [cutting(CUT.SLASH, 20, { id: 2, hits: 0 })]);
    frame(player({ hits: 1 }), [cutting(CUT.SLASH, 20, { id: 2, hits: 1 })]);
    expect(ids()).toEqual([SOUND.HIT]);
  });

  it('feed the HUD with the katana carried and in hand', () => {
    const { frame, hud } = setup();
    frame(player({ ammo: 12, blade: true, wield: true }));
    expect(hud.vitals).toHaveBeenLastCalledWith(
      expect.any(Number),
      12,
      true,
      true,
      -1,
      false,
      0,
      false,
      -1,
      false,
      0,
      0,
    );
    frame(player({ ammo: 12, blade: true, wield: false }));
    expect(hud.vitals).toHaveBeenLastCalledWith(
      expect.any(Number),
      12,
      true,
      false,
      -1,
      false,
      0,
      false,
      -1,
      false,
      0,
      0,
    );
  });
});

describe('drawing and sheathing the katana', () => {
  it('play the ignition when it comes into the hand, at the press the first time, and the shing when it leaves it', () => {
    const { frame, audio } = setup();
    frame(player({ blade: true, wield: false }));
    frame(player({ blade: true, wield: true }));
    expect(audio.play).not.toHaveBeenCalled();
    for (let i = 0; i < 28; i++) {
      frame(player({ blade: true, wield: true }));
    }
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.IGNITE, undefined, expect.any(Number), 1);
    frame(player({ blade: true, wield: true }));
    expect(audio.play).toHaveBeenCalledTimes(1);
    frame(player({ blade: true, wield: false }));
    expect(audio.play).toHaveBeenCalledWith(SOUND.SHING, undefined, expect.any(Number), 0.85);
    // The gun back in hand powers up.
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.BOOT, undefined, expect.any(Number), 1);
    expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it('play the swaps: the battery out and home, the capsule popped and screwed in three turns', () => {
    const { frame, ids } = setup();
    frame(player({ ammo: 40, mag: 0 }));
    for (let r = GUN_RELOAD; r >= 0; r--) {
      frame(player({ ammo: 40, mag: r ? 0 : 15, reload: r }));
    }
    expect(ids()).toEqual([SOUND.EJECT, SOUND.CLICK, SOUND.BOOT]);
    const rail = setup();
    rail.frame(player({ ammo: -1, rail: 160, railed: true, cap: 0 }));
    for (let r = RAIL_RELOAD; r >= 0; r--) {
      rail.frame(player({ ammo: -1, rail: 160, railed: true, cap: r ? 0 : 80, reload: r }));
    }
    expect(rail.ids()).toEqual([SOUND.POP, SOUND.SCREW, SOUND.SCREW, SOUND.SCREW, SOUND.BOOT]);
  });

  it('play the draw for a katana picked up with no gun, which is in hand at once', () => {
    const { frame, ids } = setup();
    frame(player({ ammo: -1 }));
    for (let i = 0; i < 29; i++) {
      frame(player({ ammo: -1, blade: true, wield: true }));
    }
    expect(ids()).toEqual([SOUND.IGNITE]);
  });

  it('play no sheath for a katana that is lost, going down', () => {
    const { frame, ids } = setup();
    frame(player({ ammo: -1, blade: true, wield: true }));
    ids().length = 0;
    frame(player({ ammo: -1, blade: false, wield: false, hp: 0, down: 60 }));
    expect(ids()).not.toContain(SOUND.SHING);
  });
});

describe('the others and the katana', () => {
  const other = (cut: number, swing: number, o: Partial<PlayerState> = {}) =>
    cutting(cut, swing, { id: 2, x: 5, z: -3, ...o });

  it('swish at the runner when his swing starts, once, and again for the next', () => {
    const { frame, audio } = setup();
    frame(player(), [other(CUT.SLASH, 0)]);
    frame(player(), [other(CUT.SLASH, 36)]);
    expect(audio.play).toHaveBeenCalledWith(SOUND.SWISH, [5, 1.6, -3], 1, 0.8);
    frame(player(), [other(CUT.SLASH, 20)]);
    frame(player(), [other(CUT.SLASH, 0)]);
    expect(audio.play).toHaveBeenCalledTimes(1);
    frame(player(), [other(CUT.THRUST, 24)]);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SWISH, [5, 1.6, -3], 0.6, 1.3);
  });

  it('swish for a cut that changed under a running swing', () => {
    const { frame, ids } = setup();
    frame(player(), [other(CUT.LEFT, 10)]);
    frame(player(), [other(CUT.SLASH, 9)]);
    expect(ids()).toEqual([SOUND.SWISH]);
  });

  it('do not swish for a runner met mid-swing, nor one who left and is back', () => {
    const { frame, ids } = setup();
    frame(player(), [other(CUT.SLASH, 20)]);
    frame(player(), []);
    frame(player(), [other(CUT.SLASH, 30)]);
    expect(ids()).toEqual([]);
  });

  it('ignite at the runner when he draws, shing when he sheathes, and nothing when he loses it', () => {
    const { frame, audio } = setup();
    frame(player(), [other(0, 0, { blade: true, wield: false })]);
    // The first time at his press, PRESS later; the second at once.
    for (let i = 0; i < 29; i++) {
      frame(player(), [other(0, 0, { blade: true, wield: true })]);
    }
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.IGNITE, [5, 1.6, -3], expect.any(Number), 1);
    frame(player(), [other(0, 0, { blade: true, wield: false })]);
    expect(audio.play).toHaveBeenCalledWith(SOUND.SHING, [5, 1.6, -3], expect.any(Number), 0.85);
    frame(player(), [other(0, 0, { blade: true, wield: true })]);
    frame(player(), [other(0, 0, { blade: false, wield: false })]);
    const calls = (s: number) => vi.mocked(audio.play).mock.calls.filter(([id]) => id === s);
    expect(calls(SOUND.SHING)).toHaveLength(1);
    expect(calls(SOUND.IGNITE)).toHaveLength(2);
  });

  it('crackle around a runner while his stumble is a shock, and not for a tackle or when it ends', () => {
    const { frame, tracer } = setup();
    const crackle = vi.spyOn(tracer, 'crackle');
    frame(player(), [other(0, 0, { stun: 20, zap: true })]);
    expect(crackle).toHaveBeenCalledWith([5, 1, -3]);
    frame(player(), [other(0, 0, { stun: 19, zap: true })]);
    expect(crackle).toHaveBeenCalledTimes(2);
    frame(player(), [other(0, 0, { stun: 40, zap: false })]);
    frame(player(), [other(0, 0, { stun: 0, zap: true })]);
    expect(crackle).toHaveBeenCalledTimes(2);
  });
});

describe('the fists’ feel (the user, 2026-11-13: their own, not the katana’s)', () => {
  const BARE = { ammo: -1 };
  /** A blow's swing at `k` ticks in. */
  const at = (b: number, k: number, o: Partial<PlayerState> = {}) =>
    player({ ...BARE, cut: b, swing: PUNCHES[b].ticks - k, ...o });

  it('whooshes on each blow, shorter and softer than a cut, and kicks the look by the blow at its strike', () => {
    for (const b of [BLOW.JAB, BLOW.CROSS, BLOW.HOOK, BLOW.LUNGE]) {
      const { combat, audio, fx, frame } = setup();
      combat.step(player(BARE), at(b, 0));
      frame(at(b, 0));
      const swish = audio.play.mock.calls.find(c => c[0] === SOUND.SWISH)!;
      expect(swish[3], `blow ${b}`).toBeGreaterThan(1.4);
      combat.step(at(b, PUNCHES[b].strike - 1), at(b, PUNCHES[b].strike));
      expect(fx.blow).toHaveBeenCalledWith(b);
      expect(fx.cut).not.toHaveBeenCalled();
    }
  });

  it('thuds when an own blow lands, and a hook or a lunge punches the view', () => {
    for (const b of [BLOW.JAB, BLOW.HOOK]) {
      const { audio, fx, frame } = setup();
      frame(at(b, 2, { hits: 0 }));
      frame(at(b, PUNCHES[b].strike + 1, { hits: 1 }));
      expect(audio.play.mock.calls.map(c => c[0])).toContain(SOUND.TACKLE);
      expect(fx.punch).toHaveBeenCalledTimes(b === BLOW.HOOK ? 1 : 0);
    }
  });

  it('knocks the own view when an enemy’s blow lands and he faces the own player within reach, not else', () => {
    const tried = (x: number, yaw: number) => {
      const { audio, fx, frame } = setup();
      const me = player({ ...BARE, id: 1 });
      const foe = (hits: number) => at(BLOW.CROSS, PUNCHES[1].strike + 1, { id: 5, x, yaw, hits });
      frame(me, [foe(0)]);
      frame(me, [foe(1)]);
      expect(audio.play.mock.calls.map(c => c[0])).toContain(SOUND.TACKLE);
      return fx.blow.mock.calls;
    };
    // Facing west, toward the own player, a metre away.
    expect(tried(1.2, Math.PI / 2)).toEqual([[BLOW.CROSS, true]]);
    // Facing away, or out of reach: someone else took it.
    expect(tried(1.2, (3 * Math.PI) / 2)).toEqual([]);
    expect(tried(4, Math.PI / 2)).toEqual([]);
  });
});
