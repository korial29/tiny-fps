import { describe, expect, it, vi } from 'vitest';
import { DASH_COOLDOWN, BLOW, STING, TAILS, PUNCHES, HEAVY_MAX } from '../../shared/constants';
import { swingOf } from '../../shared/blade';
import { CUT } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { createCombat } from '../combat';
import { SOUND } from '../sfx';
import { VIEW, WORLD, cutting, player, setup } from './testing';

describe('the others and the katana', () => {
  const other = (cut: number, swing: number, o: Partial<PlayerState> = {}) =>
    cutting(cut, swing, { id: 2, x: 5, z: -3, ...o });

  it('swish at the runner when his swing starts, once, and again for the next', () => {
    const { frame, audio } = setup();
    frame(player(), [other(CUT.SLASH, 0)]);
    frame(player(), [other(CUT.SLASH, 36)]);
    expect(audio.play).toHaveBeenCalledWith(SOUND.SWISH, [5, 1.6, -3], 0, 0.8);
    frame(player(), [other(CUT.SLASH, 20)]);
    frame(player(), [other(CUT.SLASH, 0)]);
    expect(audio.play).toHaveBeenCalledTimes(1);
    frame(player(), [other(CUT.THRUST, 24)]);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenLastCalledWith(
      SOUND.SWISH,
      [5, 1.6, -3],
      expect.closeTo(-4.44, 2),
      1.3,
    );
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

describe('the xenomorph’s sounds', () => {
  const beastly = () => {
    const t = setup();
    const audio = { play: vi.fn(), speak: vi.fn(() => true) };
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
      id => id == 2,
    );
    let now = 1000;
    const frame = (others: PlayerState[], me = player()) =>
      combat.frame(VIEW, me, others, 0, 1 / 60, (now += 1000 / 60));
    const ids = () => audio.play.mock.calls.map(c => c[0]);
    const x = (o: Partial<PlayerState>) => player({ id: 2, x: 5, ammo: -1, hp: 12, ...o });
    return { audio, frame, ids, x };
  };

  it('screeches when hurt and shrieks going down, its acid sizzling, never in a runner’s voice', () => {
    const { audio, frame, ids, x } = beastly();
    frame([x({})]);
    frame([x({ hp: 10 })]);
    expect(ids()).toEqual([SOUND.XENO_PAIN, SOUND.ACID]);
    frame([x({ hp: 0, down: 120 })]);
    expect(ids()).toEqual([SOUND.XENO_PAIN, SOUND.ACID, SOUND.XENO_DEATH, SOUND.ACID]);
    expect(audio.speak).not.toHaveBeenCalled();
    // Where it stands.
    expect(audio.play.mock.calls.every(c => c[1]?.[0] == 5)).toBe(true);
  });

  it('hisses as its tail charges and shrieks at each dash, not as the charge ends', () => {
    const { frame, ids, x } = beastly();
    frame([x({})]);
    frame([x({ charge: 4 })]);
    frame([x({ charge: 30 })]);
    frame([x({ charge: 0 })]);
    expect(ids()).toEqual([SOUND.XENO_HISS]);
    frame([x({ dash: DASH_COOLDOWN })]);
    frame([x({ dash: DASH_COOLDOWN - 16 })]);
    frame([x({ dash: DASH_COOLDOWN })]);
    expect(ids()).toEqual([SOUND.XENO_HISS, SOUND.SHRIEK, SOUND.SHRIEK]);
  });

  it('swipes its claws and whips its tail with sounds of their own, not the fists’ whoosh', () => {
    const { frame, ids, x } = beastly();
    for (const [b, id] of [
      [BLOW.CLAW_L, SOUND.CLAW],
      [BLOW.CLAW_R, SOUND.CLAW],
      [STING.STAB, SOUND.STING],
      [STING.SPIN, SOUND.STING],
    ]) {
      frame([x({ swing: 0, cut: b })]);
      frame([x({ swing: TAILS[b].ticks, cut: b })]);
      expect(ids().at(-1)).toBe(id);
    }
    expect(ids()).not.toContain(SOUND.SWISH);
  });

  it('whips its tail when it lets go, a tap or a full charge, not at the press that coils it (the user, 2026-11-23)', () => {
    const { frame, ids, x } = beastly();
    const { ticks, hold } = TAILS[STING.LASH];
    const coil = (charge: number) => x({ cut: STING.LASH, swing: ticks - hold, charge });
    frame([x({})]);
    // Pressed and held: the hiss, no whip.
    for (let k = 1; k <= HEAVY_MAX; k++) {
      frame([coil(k)]);
    }
    expect(ids()).toEqual([SOUND.XENO_HISS]);
    // Let go at a full charge: the heavy release runs shorter than what was left of the swing.
    const heavy = swingOf({ cut: STING.LASH, heavy: true }, TAILS).ticks;
    expect(heavy).toBeLessThan(ticks - hold);
    frame([x({ cut: STING.LASH, swing: heavy, heavy: true, charge: HEAVY_MAX })]);
    expect(ids()).toEqual([SOUND.XENO_HISS, SOUND.STING]);
    // A tap: coiled for a few ticks, then the strike from the top.
    frame([x({})]);
    frame([coil(1)]);
    frame([coil(2)]);
    frame([x({ cut: STING.LASH, swing: ticks - hold - 1, charge: 0 })]);
    expect(ids().filter(id => id == SOUND.STING)).toHaveLength(2);
  });
});
