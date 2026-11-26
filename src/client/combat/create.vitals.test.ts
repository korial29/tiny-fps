import { describe, expect, it } from 'vitest';
import { AMMO_PACK } from '../../shared/constants';
import { BODY, KEY, LIMB } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { createCombat, dreadful, voiceOf } from '../combat';
import type { Vec3 } from '../mesh';
import { SOUND } from '../sfx';
import { VIEW, WORLD, player, setup } from './testing';

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

  it('cries out at a dreadful death, groans at any other: a limb cut off, a hard fall, a heavy hit', () => {
    const was = { life: 1, vy: 0 };
    expect(dreadful(was, player({ hp: 0, down: 120 }))).toBe(false);
    expect(dreadful(was, player({ hp: 0, down: 120, lost: LIMB.HEAD }))).toBe(true);
    expect(dreadful({ life: 1, vy: -25 }, player({ hp: 0, down: 120 }))).toBe(true);
    expect(dreadful({ life: 5, vy: 0 }, player({ hp: 0, down: 120 }))).toBe(true);
    expect(dreadful({ life: 2, vy: -10 }, player({ hp: 0, down: 120 }))).toBe(false);
  });

  it('groans as a shot puts a player down, cries out in pain as a cut takes a limb; hers her own', () => {
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
      id => (id == 3 ? BODY.FEMALE : undefined),
    );
    const frame = (others: PlayerState[]) => combat.frame(VIEW, player(), others, 0, 1 / 60, 1000);
    const him = (o: Partial<PlayerState>) => player({ id: 2, x: 5, ...o });
    const her = (o: Partial<PlayerState>) => player({ id: 3, x: -5, ...o });
    const down = { hp: 0, down: 120, ammo: -1 };
    frame([him({ hp: 1 }), her({ hp: 1 })]);
    frame([him(down), her(down)]);
    frame([him({ hp: 1, ammo: -1 }), her({ hp: 1, ammo: -1 })]);
    frame([him({ ...down, lost: LIMB.ARM_L }), her({ ...down, lost: LIMB.HEAD })]);
    const cries = t.audio.play.mock.calls.filter(c =>
      [SOUND.DEATH, SOUND.HER_DEATH, SOUND.GROAN, SOUND.HER_GROAN].includes(c[0] as never),
    );
    expect(cries.map(c => c[0])).toEqual([
      SOUND.GROAN,
      SOUND.HER_GROAN,
      SOUND.DEATH,
      SOUND.HER_DEATH,
    ]);
    // Where each stands, and hers not sped up by her higher voice: that raised the vowel too.
    expect(cries.map(c => (c[1] as Vec3)[0])).toEqual([5, -5, 5, -5]);
    for (const c of cries) {
      expect(c[3]).toBeGreaterThan(0.8);
      expect(c[3]).toBeLessThan(1.2);
    }
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

  it('plays the armour its own sound, not the pack (the user, 2026-11-14: one sound each)', () => {
    const { frame, ids } = setup();
    frame(player({ armor: 0 }));
    frame(player({ armor: 3 }));
    expect(ids()).toEqual([SOUND.ARMOR]);
  });

  it('plays the pickup when the gun is taken, the ammo sound on a refill, nothing on a shot', () => {
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
    expect(ids()).toEqual([SOUND.GUN, SOUND.BOOT, SOUND.AMMO]);
  });

  it('plays the ammo sound for an ammo pack: plus AMMO_PACK from any count, at once, the rifle too', () => {
    for (const from of [0, 10, 25]) {
      const { frame, ids } = setup();
      frame(player({ ammo: from }));
      frame(player({ ammo: from + AMMO_PACK }));
      expect(ids()).toEqual([SOUND.AMMO]);
      frame(player({ ammo: from + AMMO_PACK }));
      expect(ids()).toEqual([SOUND.AMMO]);
    }
    const { frame, ids } = setup();
    frame(player({ ammo: -1, rifle: 30 }));
    frame(player({ ammo: -1, rifle: 90 }));
    expect(ids()).toEqual([SOUND.AMMO]);
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
      false,
      false,
      -1,
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
      false,
      false,
      -1,
    );
    expect(hud.down).toHaveBeenLastCalledWith(0, 1.5);
  });
});
