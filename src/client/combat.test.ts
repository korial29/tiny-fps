import { describe, expect, it, vi } from 'vitest';
import { AMMO_PACK, GUN_RANGE, MAX_PITCH, RECOIL } from '../shared/constants';
import { STILL } from '../shared/physics';
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import { createTracer } from './beams';
import { createCombat, fired, sight } from './combat';
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
  const s = sight(WORLD, v.eye, v.cam, v.yaw, v.pitch, v.drawn);
  return { ...v, muzzle: [0.2, -0.1, 0.6], end: s.end, hit: s.hit };
};
const VIEW = mk();

const setup = () => {
  const audio = { play: vi.fn() };
  const hud = { vitals: vi.fn(), hit: vi.fn(), down: vi.fn() };
  const fx = { fire: vi.fn(), wound: vi.fn(), lie: 0 };
  const tracer = createTracer();
  const ctl = { pitch: 0 };
  const combat = createCombat(WORLD, audio, hud, fx, tracer, ctl);
  const ids = () => audio.play.mock.calls.map(c => c[0]);
  const frame = (
    me: PlayerState | undefined,
    others: PlayerState[] = [],
    keys = 0,
    v: View | undefined = me && VIEW,
  ) => combat.frame(v, me, others, keys, 1 / 60);
  return { audio, hud, fx, tracer, ctl, combat, ids, frame };
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
  it('draw one beam per shot from the muzzle, and play the laser each time', () => {
    const { combat, frame, tracer, ids } = setup();
    frame(player());
    combat.step(player({ shots: 0 }), player({ shots: 2 }));
    frame(player({ shots: 2 }));
    expect(tracer.count).toBe(2);
    expect(ids()).toEqual([SOUND.LASER, SOUND.LASER]);
    // Once only: the next frame adds nothing.
    frame(player({ shots: 2 }));
    expect(tracer.count).toBe(2);
  });

  it('end the beam on the wall the look ray meets, or at the range in the open', () => {
    const { combat, frame, tracer } = setup();
    const ends: number[][] = [];
    const shoot = tracer.shoot.bind(tracer);
    tracer.shoot = (a, b, hit, own) => {
      ends.push([...b, +hit]);
      shoot(a, b, hit, own);
    };
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(player({ shots: 1 }));
    // Looking along -z at z = -20.
    expect(ends[0][2]).toBeCloseTo(-20, 3);
    expect(ends[0][3]).toBe(1);
    // Looking the other way: nothing within the range.
    combat.step(player({ shots: 1 }), player({ shots: 2 }));
    frame(player({ shots: 2 }), [], 0, mk({ yaw: Math.PI }));
    expect(ends[1][2]).toBeCloseTo(GUN_RANGE * 1, 0);
    expect(ends[1][3]).toBe(0);
  });

  it('start at the muzzle in the camera, kicked and shaken with it', () => {
    const { combat, frame, tracer } = setup();
    const from: number[][] = [];
    const shoot = tracer.shoot.bind(tracer);
    tracer.shoot = (a, b, hit, own) => {
      from.push(a);
      shoot(a, b, hit, own);
    };
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(player({ shots: 1 }), [], 0, mk({ cam: [0, 1.7, 0] }));
    expect(from[0]).toEqual([
      expect.closeTo(0.2, 6),
      expect.closeTo(1.6, 6),
      expect.closeTo(-0.6, 6),
    ]);
  });

  it('draw no beam and play nothing without a view', () => {
    const { combat, frame, tracer, ids } = setup();
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(undefined, [], 0, undefined);
    expect(tracer.count).toBe(0);
    expect(ids()).toEqual([]);
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

  it('start at the emitter of the gun of a runner, and the gun points along them', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [0.5, 0.2],
      [Math.PI, -0.1],
    ]) {
      const { frame, tracer } = setup();
      const beams: [Vec3, Vec3][] = [];
      const shoot = tracer.shoot.bind(tracer);
      tracer.shoot = (a, b, hit, own) => {
        beams.push([a, b]);
        shoot(a, b, hit, own);
      };
      const at = (shots: number) => player({ id: 2, x: 5, z: -3, yaw, pitch, shots });
      frame(player(), [at(1)]);
      frame(player(), [at(2)]);
      const [to] = focus(at(2), WORLD);
      const [grip, ax] = aimed(at(2), to);
      expect(beams).toHaveLength(1);
      expect(beams[0][0]).toEqual(tip(grip, ax));
      expect(beams[0][1]).toEqual(to);
      // The long axis of the gun, from the back of its body to the emitter, lies along the beam.
      const rear: Vec3 = [0, 1, 2].map(i => grip[i] + ax[1][i] * 0.095 - ax[2][i] * 0.06) as Vec3;
      expect(angle(dir(rear, beams[0][0]), dir(beams[0][0], to))).toBeLessThan(0.5);
    }
  });

  it('are along the beam of the own gun too: from the muzzle to the end of the look ray', () => {
    const { combat, frame, tracer } = setup();
    const beams: [Vec3, Vec3][] = [];
    const shoot = tracer.shoot.bind(tracer);
    tracer.shoot = (a, b, hit, own) => {
      beams.push([a, b]);
      shoot(a, b, hit, own);
    };
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(player({ shots: 1 }));
    expect(beams[0][1]).toEqual(VIEW.end);
    expect(beams[0][1][2]).toBeCloseTo(-20, 3);
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
  const other = (shots: number) => player({ id: 2, x: 5, z: -3, shots });

  it('draw a beam from the shooter and play the laser at his place, for each change', () => {
    const { frame, tracer, audio } = setup();
    frame(player(), [other(10)]);
    expect(tracer.count).toBe(0);
    frame(player(), [other(11)]);
    expect(tracer.count).toBe(1);
    expect(audio.play).toHaveBeenCalledWith(
      SOUND.LASER,
      [5, 1.6, -3],
      expect.any(Number),
      expect.any(Number),
    );
    frame(player(), [other(11)]);
    expect(tracer.count).toBe(1);
  });

  it('draw one beam per increment, a few at most for a long gap', () => {
    const { frame, tracer } = setup();
    frame(player(), [other(10)]);
    frame(player(), [other(12)]);
    expect(tracer.count).toBe(2);
    frame(player(), [other(200)]);
    expect(tracer.count).toBe(5);
  });

  it('forget a player who left: he is new when he is back', () => {
    const { frame, tracer } = setup();
    frame(player(), [other(10)]);
    frame(player(), []);
    frame(player(), [other(40)]);
    expect(tracer.count).toBe(0);
  });

  it('fade: the beams are gone in 80 ms', () => {
    const { frame, tracer } = setup();
    frame(player(), [other(1)]);
    frame(player(), [other(2)]);
    expect(tracer.count).toBe(1);
    for (let i = 0; i < 6; i++) {
      frame(player(), [other(2)]);
    }
    expect(tracer.count).toBe(0);
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

  it('plays hurt and the red flash when the health goes down, going down when it runs out', () => {
    const { frame, ids, fx } = setup();
    frame(player({ hp: 5 }));
    frame(player({ hp: 4 }));
    expect(ids()).toEqual([SOUND.HURT]);
    expect(fx.wound).toHaveBeenCalledTimes(1);
    frame(player({ hp: 0, down: 120, ammo: -1 }));
    expect(ids()).toEqual([SOUND.HURT, SOUND.DOWN]);
    expect(fx.wound).toHaveBeenCalledTimes(2);
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
    expect(ids()).toEqual([SOUND.GUN]);
    frame(player({ ammo: 59 }));
    frame(player({ ammo: 58 }));
    expect(ids()).toEqual([SOUND.GUN]);
    frame(player({ ammo: 60 }));
    expect(ids()).toEqual([SOUND.GUN, SOUND.GUN]);
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
    frame(player({ hp: 3, ammo: 12, down: 0 }));
    expect(hud.vitals).toHaveBeenLastCalledWith(3, 12);
    expect(hud.down).toHaveBeenLastCalledWith(0, 0);
    frame(player({ hp: 0, ammo: -1, down: 90 }));
    expect(hud.vitals).toHaveBeenLastCalledWith(0, -1);
    expect(hud.down).toHaveBeenLastCalledWith(0, 1.5);
  });
});
