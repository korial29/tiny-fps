import { describe, expect, it } from 'vitest';
import { BLOW, DASH_COOLDOWN, DASH_TICKS } from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, EV, KEY, MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createEffects, stepLength, stepping } from './effects';
import type { Effects } from './effects';

const DT = 1 / 60;
const me = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...over,
});
type Fx = ReturnType<typeof createEffects>;
/** Runs the frames of `seconds` on the same state (a sprint is one with a speed), then returns the effects. */
const run = (fx: Fx, state: PlayerState | undefined, seconds: number, keys = 0) => {
  for (let t = 0; t < seconds; t += DT) {
    fx.update(state, keys, DT);
  }
  return fx;
};
/** A player running along x at v m/s: where it is after `t` seconds. */
const at = (v: number, t: number, over: Partial<PlayerState> = {}) =>
  me({ x: v * t, vx: v, ...over });

describe('bob', () => {
  const walk = (over: Partial<PlayerState>) => {
    const fx = createEffects();
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      fx.update(me({ x: i * 0.1, ...over }), KEY.FORWARD, DT);
      peak = Math.max(peak, Math.abs(fx.dy));
    }
    return peak;
  };

  it('moves the eye while walking on the ground', () => {
    expect(walk({})).toBeGreaterThan(0.01);
  });

  it('stays still when standing, and when walking in the air', () => {
    expect(run(createEffects(), me(), 1).dy).toBe(0);
    expect(walk({ mode: MODE.AIR, ground: false })).toBe(0);
  });

  it('follows the distance walked, not the time passed', () => {
    const fx = createEffects();
    fx.update(me({ x: 0 }), 0, DT);
    fx.update(me({ x: 0.3 }), 0, DT);
    expect(fx.dy).not.toBe(0);
    const still = createEffects();
    still.update(me({ x: 0 }), 0, DT);
    still.update(me({ x: 0 }), 0, DT);
    expect(still.dy).toBe(0);
  });

  it('ignores a respawn jump', () => {
    const fx = createEffects();
    fx.update(me({ x: 0 }), 0, DT);
    fx.update(me({ x: 30 }), 0, DT);
    expect(fx.dy).toBe(0);
    expect(fx.stride).toBe(0);
  });

  it('is lower at the footfall, and a step is longer at a sprint', () => {
    const fx = createEffects();
    // One stride: the footfall (a whole number of steps) is where the eye is lowest.
    const d = stepLength(6);
    let low = 0;
    let x = 0;
    while (fx.stride < 1) {
      x += 0.05;
      fx.update(me({ x, vx: 6 }), 0, DT);
      low = Math.min(low, fx.dy);
    }
    expect(x).toBeGreaterThanOrEqual(d);
    expect(x).toBeLessThan(d + 0.06);
    expect(fx.dy).toBeLessThan(0);
    expect(stepLength(9)).toBeGreaterThan(stepLength(6));
  });

  it('dips as a drawn foot lands when it has the legs’ phase: a whole step each half of it', () => {
    const fx = createEffects();
    const dy: number[] = [];
    for (let i = 0; i < 120; i++) {
      // The legs at 1.5 strides a second, a foot down at phases 0 and 0.5.
      const phase = (i * DT * 1.5) % 1;
      fx.update(me({ x: i * 0.1, vx: 6 }), 0, DT, undefined, phase);
      expect(fx.stride).toBeCloseTo(2 * phase);
      dy.push(fx.dy);
    }
    // In the last stride (frames 80 to 119), lowest at a foot down, highest between.
    const at = (ph: number) =>
      dy[80 + Math.round(((ph - ((80 * DT * 1.5) % 1) + 1) % 1) / (DT * 1.5))];
    expect(at(0.5)).toBeLessThan(at(0.25));
    expect(at(0.5)).toBeLessThan(at(0.75));
  });

  it('counts the steps along a wall too, and not on a slide or in the air', () => {
    expect([MODE.GROUND, MODE.CROUCH, MODE.WALLRUN].map(mode => stepping(me({ mode })))).toEqual([
      true,
      true,
      true,
    ]);
    expect(
      [MODE.AIR, MODE.SLIDE, MODE.HANG, MODE.CLIMB].map(mode => stepping(me({ mode }))),
    ).toEqual([false, false, false, false]);
    const fx = createEffects();
    fx.update(me({ mode: MODE.WALLRUN, wall: SIDE.EAST }), 0, DT);
    fx.update(me({ mode: MODE.WALLRUN, wall: SIDE.EAST, z: -0.5, vz: -8 }), 0, DT);
    expect(fx.stride).toBeCloseTo(0.5 / stepLength(8));
    expect(fx.dy).toBe(0);
  });
});

describe('roll', () => {
  it('leans right when strafing right, left for left, and settles back', () => {
    const fx = createEffects();
    run(fx, me(), 1, KEY.RIGHT);
    expect(fx.roll).toBeGreaterThan(0.02);
    run(fx, me(), 1, KEY.LEFT);
    expect(fx.roll).toBeLessThan(-0.02);
    run(fx, me(), 2);
    expect(Math.abs(fx.roll)).toBeLessThan(1e-3);
  });

  it('does not lean when both or none are held', () => {
    const fx = createEffects();
    run(fx, me(), 1, KEY.LEFT | KEY.RIGHT);
    expect(fx.roll).toBeCloseTo(0);
  });

  it('leans toward the wall of a wall-run, whichever way the player looks', () => {
    const run8 = (wall: number, yaw: number) =>
      run(createEffects(), me({ mode: MODE.WALLRUN, wall, yaw, vx: 8 }), 1).roll;
    // At yaw 0 the right hand is east; at a quarter turn left (yaw π/2) it is north.
    expect(run8(SIDE.EAST, 0)).toBeGreaterThan(0.1);
    expect(run8(SIDE.WEST, 0)).toBeLessThan(-0.1);
    expect(run8(SIDE.NORTH, Math.PI / 2)).toBeGreaterThan(0.1);
    expect(run8(SIDE.SOUTH, Math.PI / 2)).toBeLessThan(-0.1);
  });

  it('tilts on a slide, and comes back', () => {
    const fx = run(createEffects(), me({ mode: MODE.SLIDE, vx: 8 }), 1);
    expect(fx.roll).toBeGreaterThan(0.03);
    expect(Math.abs(run(fx, me(), 2).roll)).toBeLessThan(1e-3);
  });
});

describe('field of view', () => {
  it('stays put at a run, and widens with speed up to the sprint', () => {
    expect(run(createEffects(), at(6, 0), 1).fov).toBeCloseTo(0);
    const mid = run(createEffects(), at(7.5, 0), 1).fov;
    const top = run(createEffects(), at(9, 0), 1).fov;
    expect(mid).toBeGreaterThan(1);
    expect(top).toBeGreaterThan(mid);
    expect(top).toBeLessThan(6);
  });

  it('punches on a dash, sharply, then eases back to the speed of the moment', () => {
    const fx = run(createEffects(), at(9, 0), 1);
    const sprint = fx.fov;
    const burst = at(16, 0, { dash: DASH_COOLDOWN });
    run(fx, burst, 3 * DT);
    const early = fx.fov;
    expect(early).toBeGreaterThan(sprint + 3);
    run(fx, burst, (DASH_TICKS - 3) * DT);
    const peak = fx.fov;
    expect(peak).toBeGreaterThan(sprint + 6);
    // The burst is over, the speed is the exit speed's: the punch falls over about half a second.
    const after = at(10, 0, { dash: DASH_COOLDOWN - DASH_TICKS });
    run(fx, after, 0.1);
    expect(fx.fov).toBeLessThan(peak);
    run(fx, after, 1);
    expect(fx.fov).toBeCloseTo(sprint, 0);
  });
});

describe('speed lines', () => {
  it('are off below the sprint speed and on above it', () => {
    expect(run(createEffects(), at(3, 0), 1).lines).toBe(0);
    expect(run(createEffects(), at(6, 0), 1).lines).toBe(0);
    expect(run(createEffects(), at(6.5, 0), 1).lines).toBeCloseTo(0);
    expect(run(createEffects(), at(9, 0), 1).lines).toBeGreaterThan(0.2);
  });

  it('are stronger on a dash, and fade after it', () => {
    const fx = run(createEffects(), at(9, 0), 1);
    const sprint = fx.lines;
    expect(sprint).toBeLessThan(0.5);
    run(fx, at(16, 0, { dash: DASH_COOLDOWN }), 8 * DT);
    expect(fx.lines).toBeGreaterThan(0.7);
    expect(fx.lines).toBeLessThanOrEqual(1);
    run(fx, at(0, 0), 2);
    expect(fx.lines).toBeLessThan(0.01);
  });
});

describe('eye', () => {
  /** The lowest and the highest the eye is drawn at over the seconds after a hit. */
  const after = (hit: { ev: number; fall: number }, seconds = 1.5) => {
    const fx = createEffects();
    fx.update(me(), 0, DT);
    fx.update(me(), 0, DT, hit);
    let [lo, hi] = [fx.dy, fx.dy];
    for (let t = 0; t < seconds; t += DT) {
      fx.update(me(), 0, DT);
      [lo, hi] = [Math.min(lo, fx.dy), Math.max(hi, fx.dy)];
    }
    return { fx, lo, hi };
  };

  it('dips on a landing by how hard it was, and recovers with a little overshoot', () => {
    const soft = after({ ev: EV.LAND, fall: 6 });
    const hard = after({ ev: EV.LAND, fall: 16 });
    expect(soft.lo).toBeLessThan(-0.03);
    expect(hard.lo).toBeLessThan(-0.1);
    expect(hard.lo / soft.lo).toBeGreaterThan(2);
    expect(hard.lo).toBeGreaterThan(-0.4);
    expect(hard.hi).toBeGreaterThan(0.005);
    expect(hard.hi).toBeLessThan(0.1);
    expect(Math.abs(hard.fx.dy)).toBeLessThan(1e-3);
  });

  it('caps the dip of a very long fall', () => {
    expect(after({ ev: EV.LAND, fall: 60 }).lo).toBeCloseTo(after({ ev: EV.LAND, fall: 20 }).lo);
  });

  it('lifts a little on a jump', () => {
    for (const ev of [EV.JUMP, EV.DOUBLE]) {
      const { hi, lo, fx } = after({ ev, fall: 0 });
      expect(hi).toBeGreaterThan(0.02);
      expect(hi).toBeLessThan(0.1);
      expect(lo).toBeGreaterThan(-0.03);
      expect(Math.abs(fx.dy)).toBeLessThan(1e-3);
    }
  });

  it('eases down to the eye height of a slide or a crouch, and back up', () => {
    const fx = run(createEffects(), me(), 0.2);
    expect(fx.dy).toBe(0);
    fx.update(me({ mode: MODE.SLIDE }), 0, DT);
    // The physics eye dropped 0.9 m at once: the drawn one has not followed yet.
    expect(fx.dy).toBeGreaterThan(0.6);
    run(fx, me({ mode: MODE.SLIDE }), 1);
    expect(Math.abs(fx.dy)).toBeLessThan(0.01);
    // Standing up: the drawn eye starts low and rises.
    fx.update(me(), 0, DT);
    expect(fx.dy).toBeLessThan(-0.6);
    expect(fx.dy).toBeGreaterThan(-1);
    run(fx, me(), 1);
    expect(Math.abs(fx.dy)).toBeLessThan(0.01);
  });

  it('starts at the eye height of the first state, without a swoop', () => {
    const fx = createEffects();
    fx.update(me({ mode: MODE.CROUCH }), 0, DT);
    expect(fx.dy).toBe(0);
  });
});

describe('hang and climb', () => {
  it('settles the look down on a grab, then back', () => {
    const fx = createEffects();
    fx.update(me({ mode: MODE.HANG }), 0, DT, { ev: EV.GRAB, fall: 0 });
    let low = 0;
    for (let t = 0; t < 1.5; t += DT) {
      fx.update(me({ mode: MODE.HANG }), 0, DT);
      low = Math.min(low, fx.pitch);
    }
    expect(low).toBeLessThan(-0.02);
    expect(low).toBeGreaterThan(-0.1);
    expect(Math.abs(fx.pitch)).toBeLessThan(1e-3);
  });

  it('arcs the look up while climbing, and levels after', () => {
    const fx = createEffects();
    let peak = 0;
    for (let t = 0; t < 24; t++) {
      fx.update(me({ mode: MODE.CLIMB, t }), 0, DT);
      peak = Math.max(peak, fx.pitch);
    }
    expect(peak).toBeGreaterThan(0.04);
    expect(peak).toBeLessThan(0.15);
    run(fx, me(), 1);
    expect(Math.abs(fx.pitch)).toBeLessThan(1e-3);
  });

  it('dips a little on the top of a climb', () => {
    const fx = createEffects();
    fx.update(me(), 0, DT, { ev: EV.CLIMB, fall: 0 });
    let low = 0;
    for (let t = 0; t < 0.5; t += DT) {
      fx.update(me(), 0, DT);
      low = Math.min(low, fx.dy);
    }
    expect(low).toBeLessThan(-0.02);
  });
});

describe('no player yet', () => {
  it('draws nothing moved, and settles what was', () => {
    const fx = run(createEffects(), at(9, 0), 1);
    run(fx, undefined, 2);
    expect(fx.fov).toBeCloseTo(0, 1);
    expect(fx.lines).toBeCloseTo(0, 1);
    expect(fx.dy).toBeCloseTo(0);
    // The eye height is not eased up from nothing when the player shows up.
    fx.update(me(), 0, DT);
    expect(fx.dy).toBeCloseTo(0);
  });
});

describe('tackle', () => {
  /** The peak of each camera value over `seconds` after `act`, on a player standing still. */
  const peaks = (act: (fx: Fx) => void, state = me(), seconds = 1) => {
    const fx = createEffects();
    run(fx, state, 0.3);
    act(fx);
    const out = { dy: 0, pitch: 0, roll: 0, fov: 0, hurt: 0 };
    for (let t = 0; t < seconds; t += DT) {
      fx.update(state, 0, DT);
      for (const k of Object.keys(out) as (keyof typeof out)[]) {
        out[k] = Math.max(out[k], Math.abs(fx[k]));
      }
    }
    return { fx, ...out };
  };

  it('jolts the eye, the look and the roll hard, and reddens the view fully', () => {
    const hit = peaks(fx => fx.jolt());
    const nothing = peaks(() => {});
    expect(nothing).toMatchObject({ dy: 0, pitch: 0, roll: 0, fov: 0, hurt: 0 });
    // A landing from 10 m/s dips the eye by about 10 cm; this one by 25 cm or more.
    expect(hit.dy).toBeGreaterThan(0.25);
    expect(hit.pitch).toBeGreaterThan(0.1);
    expect(hit.roll).toBeGreaterThan(0.15);
    expect(hit.hurt).toBeGreaterThan(0.95);
    expect(hit.hurt).toBeLessThanOrEqual(1);
  });

  it('quakes with a grenade’s burst as hard as a jolt when it is on him, less further off, with no vignette', () => {
    const [jolt, near, far, none] = [
      peaks(fx => fx.jolt()),
      peaks(fx => fx.quake(1)),
      peaks(fx => fx.quake(0.3)),
      peaks(fx => fx.quake(0)),
    ];
    expect([near.dy, near.pitch]).toEqual([jolt.dy, jolt.pitch]);
    expect(near.hurt).toBe(0);
    expect(far.dy).toBeGreaterThan(0.02);
    expect(far.dy).toBeLessThan(near.dy / 2);
    expect(none).toMatchObject({ dy: 0, pitch: 0, roll: 0 });
  });

  it('fades the vignette in under a second, and the jolt settles', () => {
    const { fx } = peaks(f => f.jolt(), me(), 1.5);
    expect(fx.hurt).toBeLessThan(0.02);
    expect(Math.abs(fx.dy)).toBeLessThan(0.01);
    expect(Math.abs(fx.roll)).toBeLessThan(0.01);
    // Half a second on, it is still there but going.
    const half = createEffects();
    run(half, me(), 0.2);
    half.jolt();
    run(half, me(), 0.5);
    expect(half.hurt).toBeGreaterThan(0.1);
    expect(half.hurt).toBeLessThan(0.5);
  });

  it('punches the tackler a little: a small kick of the look and the field of view, no vignette', () => {
    const punch = peaks(fx => fx.punch());
    const jolt = peaks(fx => fx.jolt());
    expect(punch.hurt).toBe(0);
    expect(punch.fov).toBeGreaterThan(1);
    expect(punch.pitch).toBeGreaterThan(0.02);
    expect(punch.dy).toBeGreaterThan(0.02);
    expect(punch.pitch).toBeLessThan(jolt.pitch / 2);
    expect(punch.dy).toBeLessThan(jolt.dy / 2);
    expect(peaks(() => {}).fov).toBe(0);
  });

  it('tilts the view while the stumble lasts, and levels it when it is over', () => {
    const reeling = peaks(() => {}, me({ stun: 40 }));
    expect(reeling.roll).toBeGreaterThan(0.05);
    expect(reeling.pitch).toBeGreaterThan(0.02);
    const after = createEffects();
    run(after, me({ stun: 40 }), 0.5);
    run(after, me(), 1);
    expect(Math.abs(after.roll)).toBeLessThan(0.01);
    expect(Math.abs(after.pitch)).toBeLessThan(0.01);
  });
});

describe('shape', () => {
  it('holds the numbers the camera draws and the stride, and update', () => {
    expect(Object.keys(createEffects()).sort()).toEqual([
      'blow',
      'cut',
      'dy',
      'fire',
      'fov',
      'hurt',
      'jolt',
      'kick',
      'lie',
      'lines',
      'pitch',
      'punch',
      'quake',
      'roll',
      'stride',
      'update',
      'wound',
    ]);
  });
});

describe('the gun', () => {
  const run = (fx: Effects, p: PlayerState, n: number) => {
    for (let i = 0; i < n; i++) {
      fx.update(p, 0, 1 / 60);
    }
  };

  it('kicks the gun with a shot and lets it settle in a fraction of a second', () => {
    const fx = createEffects();
    run(fx, me(), 5);
    fx.fire();
    expect(fx.kick).toBe(1);
    run(fx, me(), 12);
    expect(fx.kick).toBeLessThan(0.2);
  });

  it('kicks a charged shot much harder: 3 times the gun kick and 3.4 times the look at the full charge', () => {
    const peak = (power: number) => {
      const fx = createEffects();
      run(fx, me(), 5);
      fx.fire(power);
      const kick = fx.kick;
      let pitch = 0;
      for (let i = 0; i < 20; i++) {
        run(fx, me(), 1);
        pitch = Math.max(pitch, Math.abs(fx.pitch));
      }
      return { kick, pitch };
    };
    const [plain, full] = [peak(1), peak(5)];
    expect([plain.kick, full.kick]).toEqual([1, 3]);
    expect(full.pitch / plain.pitch).toBeCloseTo(3.4, 1);
  });

  it('shakes the look and the roll a little with each shot, not by more than a degree or two', () => {
    const fx = createEffects();
    run(fx, me(), 5);
    let [pitch, roll] = [0, 0];
    for (let i = 0; i < 30; i++) {
      if (i % 7 == 0) {
        fx.fire();
      }
      run(fx, me(), 1);
      [pitch, roll] = [Math.max(pitch, Math.abs(fx.pitch)), Math.max(roll, Math.abs(fx.roll))];
    }
    expect(pitch).toBeGreaterThan(0.002);
    expect(pitch).toBeLessThan(0.06);
    expect(roll).toBeLessThan(0.06);
  });

  it('shows the red vignette when wounded', () => {
    const fx = createEffects();
    fx.wound();
    expect(fx.hurt).toBe(1);
  });

  it('takes the view down to the floor and over on its side while down, and back up after', () => {
    const fx = createEffects();
    run(fx, me(), 5);
    expect(fx.lie).toBe(0);
    run(fx, me({ down: 60 }), 90);
    expect(fx.lie).toBeGreaterThan(0.95);
    expect(fx.dy).toBeLessThan(-1.2);
    expect(fx.roll).toBeGreaterThan(0.8);
    run(fx, me(), 120);
    expect(fx.lie).toBeLessThan(0.01);
    expect(Math.abs(fx.dy)).toBeLessThan(0.05);
  });
});

describe('the katana', () => {
  /** The extremes of pitch, roll and fov over half a second after a cut struck, on a player standing still. */
  const strike = (c: number) => {
    const fx = createEffects();
    run(fx, me(), 0.3);
    fx.cut(c);
    const out = { pitch: [0, 0], roll: [0, 0], fov: 0, hurt: 0 };
    for (let t = 0; t < 0.5; t += DT) {
      fx.update(me(), 0, DT);
      out.pitch = [Math.min(out.pitch[0], fx.pitch), Math.max(out.pitch[1], fx.pitch)];
      out.roll = [Math.min(out.roll[0], fx.roll), Math.max(out.roll[1], fx.roll)];
      out.fov = Math.max(out.fov, fx.fov);
      out.hurt = Math.max(out.hurt, fx.hurt);
    }
    return out;
  };

  it('dips the look for a slash, punches the field of view for a thrust, and leaves the rest alone', () => {
    expect(strike(CUT.SLASH).pitch[0]).toBeLessThan(-0.02);
    expect(strike(CUT.SLASH).fov).toBeLessThan(0.1);
    expect(strike(CUT.THRUST).fov).toBeGreaterThan(1);
    expect(strike(CUT.THRUST).pitch[0]).toBeGreaterThan(-0.01);
    expect(strike(CUT.THRUST).roll).toEqual([0, 0]);
  });

  it('rolls toward the side a cut across ends on: right for the one from the left', () => {
    const left = strike(CUT.LEFT);
    const right = strike(CUT.RIGHT);
    expect(left.roll[1]).toBeGreaterThan(0.02);
    expect(left.roll[0]).toBeGreaterThan(-0.02);
    expect(right.roll[0]).toBeLessThan(-0.02);
    expect(right.roll[1]).toBeLessThan(0.02);
  });

  it('stays a small camera punch: no vignette, well under a jolt, and settles', () => {
    for (const c of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH]) {
      const s = strike(c);
      expect(s.hurt).toBe(0);
      expect(s.pitch[0]).toBeGreaterThan(-0.08);
      expect(s.roll[1]).toBeLessThan(0.08);
    }
    const fx = createEffects();
    fx.cut(CUT.SLASH);
    run(fx, me(), 1.5);
    expect(Math.abs(fx.pitch)).toBeLessThan(0.005);
    expect(fx.fov).toBeCloseTo(0, 1);
  });
});

describe('the fists', () => {
  /** The extremes of pitch, roll and fov over half a second after a blow, on a player standing still. */
  const blow = (b: number, taken?: boolean) => {
    const fx = createEffects();
    run(fx, me(), 0.3);
    fx.blow(b, taken);
    const out = { pitch: [0, 0], roll: [0, 0], fov: 0 };
    for (let t = 0; t < 0.5; t += DT) {
      fx.update(me(), 0, DT);
      out.pitch = [Math.min(out.pitch[0], fx.pitch), Math.max(out.pitch[1], fx.pitch)];
      out.roll = [Math.min(out.roll[0], fx.roll), Math.max(out.roll[1], fx.roll)];
      out.fov = Math.max(out.fov, fx.fov);
    }
    return out;
  };

  it('rolls the view toward the fist that strikes, a hook most, a lunge punching the field of view', () => {
    const [jab, cross, hook, lunge] = [BLOW.JAB, BLOW.CROSS, BLOW.HOOK, BLOW.LUNGE].map(b =>
      blow(b),
    );
    expect(Math.sign(jab.roll[0] + jab.roll[1])).toBe(-Math.sign(cross.roll[0] + cross.roll[1]));
    expect(Math.max(-hook.roll[0], hook.roll[1])).toBeGreaterThan(
      2 * Math.max(-jab.roll[0], jab.roll[1]),
    );
    expect(lunge.fov).toBeGreaterThan(1);
    expect(jab.fov).toBeLessThan(0.1);
    // Small: a jab is felt, not a jolt.
    expect(Math.max(-jab.roll[0], jab.roll[1])).toBeLessThan(0.05);
  });

  it('knocks the look up when the own player takes a blow, harder than he gives one', () => {
    const [given, taken] = [blow(BLOW.CROSS), blow(BLOW.CROSS, true)];
    expect(taken.pitch[1]).toBeGreaterThan(0.02);
    expect(taken.pitch[1]).toBeGreaterThan(given.pitch[1] * 3);
  });
});

describe('the rail gun’s bolt', () => {
  const jolt = (over: Partial<PlayerState>) => {
    const fx = createEffects();
    let most = 0;
    for (let t = 0; t < 0.5; t += DT) {
      fx.update(me(over), 0, DT);
      most = Math.max(most, Math.abs(fx.pitch));
    }
    return most;
  };

  it('jolts the view while it goes out, harder as the gun heats, and not when it does not', () => {
    expect(jolt({})).toBe(0);
    expect(jolt({ zapping: true })).toBeGreaterThan(0.004);
    expect(jolt({ zapping: true, heat: 110 })).toBeGreaterThan(jolt({ zapping: true }) * 1.5);
  });
});
