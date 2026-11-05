import { describe, expect, it } from 'vitest';
import { HEALTH, PLAYER_RESPAWN, TICK_HZ } from '../shared/constants';
import { compile } from '../shared/level';
import { HALL } from '../shared/map';
import type { SnapPlayer, Snapshot } from '../shared/types';
import { HURT, createEffects } from './effects';
import type { Hud } from './hud';
import { createProgress, facing } from './progress';

const YOU = 1;
const player = (id: number, hp = HEALTH, x = 2, z = 2): SnapPlayer => ({
  id,
  x,
  y: 1,
  z,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  hp,
  ack: 0,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  tick: 0,
  players: [player(YOU)],
  ...over,
});

const setup = () => {
  const shown = { hp: -1, dead: 0 };
  const hud: Hud = {
    hp: n => (shown.hp = n),
    dead: secs => (shown.dead = secs),
    fade: () => {},
    title: () => {},
    mute: () => {},
    update: () => {},
  };
  const fx = createEffects();
  const progress = createProgress({ lvl: compile(HALL), you: () => YOU, fx, hud });
  return { progress, shown, fx };
};

describe('hud', () => {
  it('follows the own health and the death', () => {
    const { progress, shown } = setup();
    progress.snapshot(snap({ players: [player(YOU, 5)] }));
    expect(shown).toEqual({ hp: 5, dead: 0 });
    expect(progress.hp).toBe(5);
    progress.snapshot(snap({ players: [player(YOU, 0)] }));
    expect(shown).toEqual({ hp: 0, dead: 3 });
    expect([progress.dead, progress.hp]).toEqual([true, 0]);
    progress.snapshot(snap({ players: [player(YOU, HEALTH)] }));
    expect(shown.dead).toBe(0);
    expect(progress.dead).toBe(false);
  });
});

describe('death countdown', () => {
  const dead = (tick: number) => snap({ tick, players: [player(YOU, 0)] });

  it('counts the seconds to the respawn from the tick the health hit 0', () => {
    const { progress, shown } = setup();
    progress.snapshot(snap({ tick: 100 }));
    const left = (since: number) => {
      progress.snapshot(dead(100 + since));
      return shown.dead;
    };
    expect([0, 2, 59, 60, 61, 119, 120, 121, 179, PLAYER_RESPAWN - 1].map(left)).toEqual([
      3, 3, 3, 2, 2, 2, 1, 1, 1, 1,
    ]);
    // Never 0 while still dead: that hides the screen.
    expect(left(PLAYER_RESPAWN + 30)).toBe(1);
  });

  it('measures from the first snapshot that shows the death, not from the last', () => {
    const { progress, shown } = setup();
    progress.snapshot(snap({ tick: 0 }));
    progress.snapshot(dead(10));
    progress.snapshot(dead(10 + TICK_HZ * 2));
    expect(shown.dead).toBe(1);
  });

  it('counts across the u16 wrap of the host tick', () => {
    const { progress, shown } = setup();
    progress.snapshot(snap({ tick: 65500 }));
    progress.snapshot(dead(65530));
    expect(shown.dead).toBe(3);
    progress.snapshot(dead(65530 + 130 - 65536));
    expect(shown.dead).toBe(1);
  });

  it('starts over at each death, and hides at the respawn', () => {
    const { progress, shown } = setup();
    progress.snapshot(dead(0));
    progress.snapshot(dead(150));
    expect(shown.dead).toBe(1);
    progress.snapshot(snap({ tick: 200 }));
    expect(shown.dead).toBe(0);
    progress.snapshot(dead(1000));
    expect(shown.dead).toBe(3);
  });
});

describe('low health', () => {
  it('reads the own health for the heartbeat: 0 when dead or unseen', () => {
    const { progress } = setup();
    expect(progress.hp).toBe(0);
    progress.snapshot(snap({ players: [player(YOU, 2)] }));
    expect(progress.hp).toBe(2);
    progress.snapshot(snap({ players: [player(YOU, 6)] }));
    expect(progress.hp).toBe(6);
    progress.snapshot(snap({ players: [player(YOU, 0)] }));
    expect(progress.hp).toBe(0);
    progress.snapshot(snap({ players: [player(2, 1)] }));
    expect(progress.hp).toBe(0);
  });
});

describe('death', () => {
  it('hides the others at no health, and nobody it has not seen die', () => {
    const { progress } = setup();
    progress.snapshot(snap({ players: [player(YOU), player(2, 0), player(3, 4)] }));
    expect(progress.alive(2)).toBe(false);
    expect(progress.alive(3)).toBe(true);
    expect(progress.alive(7)).toBe(true);
    progress.snapshot(snap({ players: [player(YOU), player(2, HEALTH), player(3, 4)] }));
    expect(progress.alive(2)).toBe(true);
  });
});

describe('hurt flash', () => {
  it('fires when the own health drops, and only then', () => {
    const { progress, fx } = setup();
    const hp = (n: number, others = [player(2)]) =>
      progress.snapshot(snap({ players: [player(YOU, n), ...others] }));
    hp(9);
    expect(fx.hurt).toBe(0);
    hp(9);
    hp(9, [player(2, 3)]);
    expect(fx.hurt).toBe(0);
    hp(8);
    expect(fx.hurt).toBeCloseTo(HURT);
    fx.update(undefined, 0, 1);
    hp(8);
    hp(9);
    expect(fx.hurt).toBe(0);
    hp(0);
    expect(fx.hurt).toBeCloseTo(HURT);
    fx.update(undefined, 0, 1);
    // Dead, then back at the start with all its health.
    hp(HEALTH);
    expect(fx.hurt).toBe(0);
  });

  it('does not fire for the drop of a player that is not the own one', () => {
    const { progress, fx } = setup();
    progress.snapshot(snap({ players: [player(YOU), player(2, 9)] }));
    progress.snapshot(snap({ players: [player(YOU), player(2, 5)] }));
    expect(fx.hurt).toBe(0);
  });
});

describe('facing', () => {
  it('takes the yaw of the nearest spawn', () => {
    const map = {
      sectors: [],
      spawns: [
        [0, 0, 1],
        [10, 0, 2],
        [0, 10, 3],
      ] as [number, number, number][],
    };
    expect(facing(map, 9, 1)).toBe(2);
    expect(facing(map, 1, 8)).toBe(3);
    expect(facing(map, 0.5, 0.5)).toBe(1);
  });
});
