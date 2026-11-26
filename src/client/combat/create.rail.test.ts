import { describe, expect, it, vi } from 'vitest';
import { CHARGE_TAP, INTERP_DELAY, HARPOON } from '../../shared/constants';
import type { PlayerState } from '../../shared/types';
import { createCombat } from '../combat';
import { aimed, focus, tip } from '../gun';
import type { Vec3 } from '../mesh';
import { SOUND } from '../sfx';
import { VIEW, WORLD, player, setup } from './testing';

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

  it('whine for no xenomorph: its charge is its tail’s (the user, 2026-11-23)', () => {
    const t = setup();
    const loops = new Map<number, { v: number; r: number }[]>();
    const audio = {
      ...t.audio,
      loop: (id: number) => {
        loops.set(id, []);
        return { set: (v: number, r: number) => loops.get(id)!.push({ v, r }) };
      },
    };
    const combat = createCombat(
      WORLD,
      audio,
      t.hud,
      t.fx,
      t.tracer,
      t.ctl,
      t.balls,
      undefined,
      undefined,
      undefined,
      id => id == 1,
    );
    // The gun's loop is made while a gun is in hand; the xenomorph charges its tail after.
    const charges = [0, ...Array.from({ length: 40 }, (_, k) => CHARGE_TAP + k)];
    charges.forEach((charge, k) =>
      combat.frame(VIEW, player({ charge }), [], 0, 1 / 60, 1000 + (k * 1000) / 60),
    );
    expect(loops.get(SOUND.CHARGE)!.every(s => s.v == 0)).toBe(true);
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
    expect(audio.play).toHaveBeenLastCalledWith(SOUND.SPLASH, [5, 1.6, -7], 0, 1);
    expect(orbs()).toEqual([]);
  });

  it('strike a harpoon bolt as a shock with its own crack, not a plasma splash', () => {
    const { frame, balls, bursts, audio, at, tracer } = setup();
    const impact = vi.spyOn(tracer, 'impact');
    const p = other(1);
    frame(player(), [p]);
    const bolt = { id: 1, by: 2, x: 5, y: 1.6, z: -5, dx: 0, dy: 0, dz: -1, burst: false };
    balls.snapshot([{ ...bolt, power: HARPOON }], 1, at());
    balls.snapshot([{ ...bolt, z: -7, power: HARPOON, burst: true }], 1, at());
    for (let k = 0; k < 20 && !impact.mock.calls.length; k++) {
      frame(player(), [p]);
    }
    expect(impact).toHaveBeenCalledWith([5, 1.6, -7]);
    expect(bursts).toEqual([]);
    expect(audio.play.mock.lastCall?.slice(0, 2)).toEqual([SOUND.HARPOON_HIT, [5, 1.6, -7]]);
  });
});
