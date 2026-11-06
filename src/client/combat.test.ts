import { describe, expect, it, vi } from 'vitest';
import { AMMO_PACK, CUTS, GUN_RANGE, MAX_PITCH, RECOIL } from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import { createTracer } from './beams';
import { createCombat, fired, sight, struck, swung } from './combat';
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
  const fx = { fire: vi.fn(), cut: vi.fn(), wound: vi.fn(), lie: 0 };
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
    expect(hud.vitals).toHaveBeenLastCalledWith(3, 12, false, false);
    expect(hud.down).toHaveBeenLastCalledWith(0, 0);
    frame(player({ hp: 0, ammo: -1, down: 90 }));
    expect(hud.vitals).toHaveBeenLastCalledWith(0, -1, false, false);
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

  it('give the katana no recoil, no shot and no beam', () => {
    const { combat, frame, ctl, fx, tracer, ids } = setup();
    frame(cutting(CUT.THRUST, 0));
    combat.step(cutting(CUT.THRUST, 0), cutting(CUT.THRUST, 24));
    frame(cutting(CUT.THRUST, 24));
    expect(ctl.pitch).toBe(0);
    expect(fx.fire).not.toHaveBeenCalled();
    expect(tracer.count).toBe(0);
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
    expect(hud.vitals).toHaveBeenLastCalledWith(expect.any(Number), 12, true, true);
    frame(player({ ammo: 12, blade: true, wield: false }));
    expect(hud.vitals).toHaveBeenLastCalledWith(expect.any(Number), 12, true, false);
  });
});

describe('drawing and sheathing the katana', () => {
  it('play the shing when it comes into the hand, and a lower one when it leaves it', () => {
    const { frame, audio } = setup();
    frame(player({ blade: true, wield: false }));
    frame(player({ blade: true, wield: true }));
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SHING, undefined, expect.any(Number), 1);
    frame(player({ blade: true, wield: true }));
    expect(audio.play).toHaveBeenCalledTimes(1);
    frame(player({ blade: true, wield: false }));
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SHING, undefined, expect.any(Number), 0.85);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('play the draw for a katana picked up with no gun, which is in hand at once', () => {
    const { frame, ids } = setup();
    frame(player({ ammo: -1 }));
    frame(player({ ammo: -1, blade: true, wield: true }));
    expect(ids()).toEqual([SOUND.SHING]);
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

  it('shing at the runner when he draws or sheathes, and not when he loses it', () => {
    const { frame, audio } = setup();
    frame(player(), [other(0, 0, { blade: true, wield: false })]);
    frame(player(), [other(0, 0, { blade: true, wield: true })]);
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SHING, [5, 1.6, -3], expect.any(Number), 1);
    frame(player(), [other(0, 0, { blade: true, wield: false })]);
    expect(audio.play).toHaveBeenLastCalledWith(
      SOUND.SHING,
      [5, 1.6, -3],
      expect.any(Number),
      0.85,
    );
    frame(player(), [other(0, 0, { blade: true, wield: true })]);
    frame(player(), [other(0, 0, { blade: false, wield: false })]);
    expect(audio.play).toHaveBeenCalledTimes(3);
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
