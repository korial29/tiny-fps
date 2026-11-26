import { describe, expect, it, vi } from 'vitest';
import { MAX_PITCH, PLASMA_R, PLASMA_SPEED, RECOIL, NADE, NADE_COOL } from '../../shared/constants';
import type { PlayerState } from '../../shared/types';
import { TRAIL } from '../balls';
import { createCombat } from '../combat';
import { aimed, focus, tip } from '../gun';
import type { Vec3 } from '../mesh';
import { SOUND } from '../sfx';
import { VIEW, WORLD, mk, player, setup } from './testing';

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
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SPLASH, bursts[0], 2.3, 0.6);
  });

  it('fly at PLASMA_SPEED onto the look line, and burst on the wall it meets, with the zap there', () => {
    const { combat, frame, ids, audio, orbs, bursts } = setup();
    frame(player());
    combat.step(player({ shots: 0 }), player({ shots: 1 }));
    frame(player({ shots: 1 }));
    // 0.15 s on, past CATCH: 12 m out, on the line from the eye (x 0, y 1.6).
    for (let k = 0; k < 9; k++) {
      frame(player({ shots: 1 }));
    }
    const [o] = orbs();
    expect(o.p[0]).toBeCloseTo(0, 6);
    expect(o.p[1]).toBeCloseTo(1.6, 6);
    expect(o.p[2]).toBeCloseTo(-PLASMA_SPEED * 0.15, 0);
    expect(o.tail).toBeCloseTo(TRAIL, 6);
    // The wall at z = -20, 20 m from the eye: half a second.
    for (let k = 0; k < 20 && !bursts.length; k++) {
      frame(player({ shots: 1 }));
    }
    expect(bursts).toHaveLength(1);
    expect(bursts[0][2]).toBeCloseTo(-20 + PLASMA_R, 6);
    expect(orbs()).toEqual([]);
    expect(ids()).toEqual([SOUND.LASER, SOUND.SPLASH]);
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SPLASH, bursts[0], 0, 1);
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
