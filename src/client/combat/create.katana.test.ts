import { describe, expect, it } from 'vitest';
import { GUN_RELOAD, RAIL_RELOAD, CUTS } from '../../shared/constants';
import { step } from '../../shared/gun';
import { KITS, ROLE } from '../../shared/kit';
import { MAPS } from '../../shared/maps';
import { spawn } from '../../shared/physics';
import { CUT, KEY } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { build } from '../../shared/world';
import { createCombat } from '../combat';
import { pressAt } from '../gun';
import { SOUND } from '../sfx';
import { VIEW, WORLD, cutting, player, setup } from './testing';

describe('the own cuts', () => {
  it('play the swish when a swing starts, once, at a pitch and a weight that follow the cut', () => {
    const { combat, frame, audio } = setup();
    frame(cutting(CUT.SLASH, 0));
    combat.step(cutting(CUT.SLASH, 0), cutting(CUT.SLASH, 36));
    frame(cutting(CUT.SLASH, 36));
    expect(audio.play).toHaveBeenCalledWith(SOUND.SWISH, undefined, 0, 0.8);
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
      false,
      false,
      -1,
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
      false,
      false,
      -1,
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

  it('play nothing for the Hunter’s shoulder cannon but its shots: no hum, whine, pickup or boot as its shots come back (the user, 2026-11-24)', () => {
    const highline = build(MAPS.highline);
    const kit = KITS[ROLE.HUNTER];
    const t = setup();
    const loud = new Set<number>();
    const audio = {
      ...t.audio,
      loop: (id: number) => ({ set: (v: number) => void (v > 0 && loud.add(id)) }),
    };
    const combat = createCombat(
      highline,
      audio,
      t.hud,
      t.fx,
      t.tracer,
      t.ctl,
      t.balls,
      undefined,
      undefined,
      undefined,
      undefined,
      () => true,
    );
    // His cannon found on its rack, its battery full.
    const p = Object.assign(spawn(0, highline, 0, 0, kit), { id: 1, rail: 0, cap: kit.cap });
    let now = 1000;
    /** `n` ticks of the real step with `keys`, two frames each, as the client sees them. */
    const run = (keys: number, n: number) => {
      for (let k = 0; k < n; k++) {
        step(p, { seq: k, keys, yaw: 0, pitch: 0 }, highline, 0, true, [], kit);
        for (let f = 0; f < 2; f++) {
          combat.frame(VIEW, { ...p }, [], keys, 1 / 60, (now += 1000 / 60));
        }
      }
    };
    run(KEY.RAIL, 60);
    t.audio.play.mockClear();
    run(KEY.RAIL | KEY.FIRE, 120);
    // Its shots are spent: their sound is the step's (fired()), not the frame's.
    expect(p.shots).toBeGreaterThan(1);
    run(KEY.RAIL, 240);
    expect(t.ids()).toEqual([]);
    expect([...loud]).toEqual([]);
  });

  it('play the Hunter’s own rack of a harpoon bolt, not the battery’s swap', () => {
    const t = setup();
    const combat = createCombat(
      WORLD,
      t.audio,
      t.hud,
      t.fx,
      t.tracer,
      t.ctl,
      t.balls,
      undefined,
      undefined,
      undefined,
      undefined,
      () => true,
    );
    let now = 1000;
    const frame = (p: PlayerState) => combat.frame(VIEW, p, [], 0, 1 / 60, (now += 1000 / 60));
    frame(player({ ammo: 12, mag: 0, blade: true }));
    for (let r = GUN_RELOAD; r >= 0; r--) {
      frame(player({ ammo: 12, mag: r ? 0 : 1, blade: true, reload: r }));
    }
    expect(t.ids()).toContain(SOUND.HARPOON_RELOAD);
    expect(t.ids().filter(id => id === SOUND.HARPOON_RELOAD)).toHaveLength(1);
    expect(t.ids()).not.toContain(SOUND.EJECT);
    expect(t.ids()).not.toContain(SOUND.CLICK);
  });

  it('play the Hunter’s blades sliding out each time he takes them, after the press', () => {
    const t = setup();
    const combat = createCombat(
      WORLD,
      t.audio,
      t.hud,
      t.fx,
      t.tracer,
      t.ctl,
      t.balls,
      undefined,
      undefined,
      undefined,
      undefined,
      () => true,
    );
    let now = 1000;
    const frame = (p: PlayerState) => combat.frame(VIEW, p, [], 0, 1 / 60, (now += 1000 / 60));
    const draws = () => t.ids().filter(id => id === SOUND.HUNTER_BLADE_DRAW).length;
    // The harpoon in hand, then the blades, then the harpoon and the blades again (the user,
    // 2026-11-24: not only the first time).
    for (let take = 1; take <= 2; take++) {
      for (let i = 0; i < 30; i++) {
        frame(player({ ammo: 12, mag: 1, blade: true }));
      }
      frame(player({ ammo: 12, mag: 1, blade: true, wield: true }));
      // Not at once: after the press, with the blades (body.ts).
      expect(draws()).toBe(take - 1);
      for (let i = 0; i < 60 * pressAt(1) + 2; i++) {
        frame(player({ ammo: 12, mag: 1, blade: true, wield: true }));
      }
      expect(draws()).toBe(take);
    }
    // Heard: at full level. Its gain went through db() as 0, minus infinity decibels, and the
    // blades came out in silence (the user, 2026-11-25).
    const drawn = t.audio.play.mock.calls.filter(c => c[0] === SOUND.HUNTER_BLADE_DRAW);
    expect(drawn.map(c => c[2])).toEqual([0, 0]);
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
