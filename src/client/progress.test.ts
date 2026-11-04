import { describe, expect, it, vi } from 'vitest';
import { HEALTH } from '../shared/constants';
import { compile } from '../shared/level';
import { HALL } from '../shared/map';
import { ITEM, PHASE } from '../shared/types';
import type { Item, SnapPlayer, Snapshot } from '../shared/types';
import { createDelay, createEffects } from './effects';
import { SAY } from './hud';
import type { Hud } from './hud';
import { ITEM_COLOR } from './items';
import { clock, createProgress, facing } from './progress';

vi.mock('../shared/levels', async () => {
  const { HALL } = await import('../shared/map');
  return { LEVELS: [HALL, { ...HALL }, { ...HALL }] };
});

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
  cool: 0,
  hp,
  ack: 0,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  tick: 0,
  players: [player(YOU)],
  shots: [],
  monsters: [],
  bullets: [],
  events: [],
  level: 0,
  hard: false,
  phase: PHASE.HUNT,
  keys: 0,
  items: [],
  ...over,
});

const setup = () => {
  const said: [number, string][] = [];
  const shown = { hp: -1, keys: -1, dead: false };
  const hud: Hud = {
    hp: n => (shown.hp = n),
    keys: n => (shown.keys = n),
    dead: on => (shown.dead = on),
    say: (slot, text) => void said.push([slot, text]),
    update: () => {},
  };
  const fx = createEffects();
  const first = compile(HALL);
  const predictor = { level: vi.fn() };
  const rd = { level: vi.fn() };
  const delay = createDelay<number>();
  const progress = createProgress({
    lvl: first,
    you: () => YOU,
    predictor,
    rd,
    delays: [delay],
    fx,
    hud,
  });
  return { progress, said, shown, fx, first, predictor, rd, delay };
};

describe('clock', () => {
  it('writes ticks as m:ss.s, the tenth cut', () => {
    expect(clock(3723)).toBe('1:02.0');
    expect(clock(0)).toBe('0:00.0');
    expect(clock(59)).toBe('0:00.9');
    expect(clock(60 * 60 * 12 + 30)).toBe('12:00.5');
    expect(clock(60 * 599.9)).toBe('9:59.9');
  });
});

describe('level switch', () => {
  it('sets the level on the first snapshot: compiled, handed to the predictor and the renderer', () => {
    const { progress, predictor, rd, first } = setup();
    progress.snapshot(snap());
    const lvl = progress.lvl;
    expect(lvl).not.toBe(first);
    expect(lvl.map).toBe(HALL);
    expect(lvl.edges).toEqual(first.edges);
    expect(predictor.level).toHaveBeenCalledExactlyOnceWith(lvl);
    expect(rd.level).toHaveBeenCalledExactlyOnceWith(lvl);
  });

  it('resets the effects and drops what the delays hold', () => {
    const { progress, fx, delay, said } = setup();
    progress.snapshot(snap());
    fx.event({ type: 0, id: 20, x: 8, y: 2, z: 8 }, YOU);
    fx.hit();
    delay.push([1], 0);
    expect(fx.gibs.length + fx.blasts.length).toBeGreaterThan(0);
    progress.snapshot(snap({ level: 1 }));
    expect([fx.gibs, fx.sparks, fx.blasts]).toEqual([[], [], []]);
    expect(fx.hurt).toBe(0);
    expect(delay.due(1e6)).toEqual([]);
    expect(said.at(-1)).toEqual([SAY.NOTE, 'Find the exit']);
  });

  it('shows the level number for a title, and "Hard mode" on the second run', () => {
    const { progress, said } = setup();
    progress.snapshot(snap());
    progress.snapshot(snap({ level: 2 }));
    progress.snapshot(snap({ level: 0, hard: true }));
    expect(said.filter(([slot]) => slot == SAY.TITLE)).toEqual([
      [SAY.TITLE, 'Level 1'],
      [SAY.TITLE, 'Level 3'],
      [SAY.TITLE, 'Level 1\nHard mode'],
    ]);
  });

  it('leaves everything as is while the level stays', () => {
    const { progress, predictor, rd, said } = setup();
    progress.snapshot(snap());
    const lvl = progress.lvl;
    progress.snapshot(snap({ tick: 2 }));
    expect(progress.lvl).toBe(lvl);
    expect(predictor.level).toHaveBeenCalledTimes(1);
    expect(rd.level).toHaveBeenCalledTimes(1);
    expect(said).toHaveLength(2);
  });

  it('works without a renderer', () => {
    const { progress } = setup();
    const bare = createProgress({
      lvl: compile(HALL),
      you: () => YOU,
      predictor: { level: () => {} },
      delays: [],
      fx: createEffects(),
      hud: { hp() {}, keys() {}, dead() {}, say() {}, update() {} },
    });
    expect(() => bare.snapshot(snap())).not.toThrow();
    expect(progress.lvl).toBeDefined();
  });

  it('ignores a level it does not know', () => {
    const { progress, predictor, said } = setup();
    progress.snapshot(snap());
    const lvl = progress.lvl;
    progress.snapshot(snap({ level: 9 }));
    expect(progress.lvl).toBe(lvl);
    expect(predictor.level).toHaveBeenCalledTimes(1);
    expect(said.filter(([slot]) => slot == SAY.TITLE)).toHaveLength(1);
  });
});

describe('hud', () => {
  it('follows the own health, the keys and the death', () => {
    const { progress, shown } = setup();
    progress.snapshot(snap({ keys: 0b1010, players: [player(YOU, 5)] }));
    expect(shown).toEqual({ hp: 5, keys: 0b1010, dead: false });
    progress.snapshot(snap({ keys: 0, players: [player(YOU, 0)] }));
    expect(shown).toEqual({ hp: 0, keys: 0, dead: true });
    expect(progress.dead).toBe(true);
    progress.snapshot(snap({ players: [player(YOU, HEALTH)] }));
    expect(shown.dead).toBe(false);
    expect(progress.dead).toBe(false);
  });

  it('hints at the phase when it changes, and at a level start', () => {
    const { progress, said } = setup();
    const notes = () => said.filter(([slot]) => slot == SAY.NOTE).map(([, t]) => t);
    progress.snapshot(snap());
    progress.snapshot(snap({ tick: 2 }));
    expect(notes()).toEqual(['Find the exit']);
    progress.snapshot(snap({ phase: PHASE.RETURN }));
    progress.snapshot(snap({ phase: PHASE.RETURN }));
    expect(notes()).toEqual(['Find the exit', 'Back to the start!']);
    progress.snapshot(snap({ level: 1, phase: PHASE.HUNT }));
    expect(notes()).toEqual(['Find the exit', 'Back to the start!', 'Find the exit']);
  });

  it('shows the end screen with the time', () => {
    const { progress, said } = setup();
    progress.end(3723, false);
    expect(said).toEqual([[SAY.END, 'Run complete\n1:02.0\nNext run: Hard mode']]);
    progress.end(600, true);
    expect(said.at(-1)![1]).toBe('Run complete\n0:10.0 (hard)\nNext run: Hard mode');
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
    expect(fx.hurt).toBeCloseTo(0.15);
    fx.update(undefined, 0, 1);
    hp(8);
    hp(9);
    expect(fx.hurt).toBe(0);
    hp(0);
    expect(fx.hurt).toBeCloseTo(0.15);
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

  it('does not fire on a new level, whatever the health there', () => {
    const { progress, fx } = setup();
    progress.snapshot(snap({ players: [player(YOU, 9)] }));
    progress.snapshot(snap({ level: 1, players: [player(YOU, 3)] }));
    expect(fx.hurt).toBe(0);
  });
});

describe('pickup fade', () => {
  const item = (id: number, kind: number, x: number, z: number): Item => ({ id, kind, x, y: 1, z });
  const items = [item(0, ITEM.HEALTH, 3, 2), item(1, ITEM.KEY_BLUE, 2, 9)];

  it('fades the colour of an item that vanishes near the own player', () => {
    const { progress, fx } = setup();
    progress.snapshot(snap({ items }));
    expect(fx.gain).toBe(0);
    progress.snapshot(snap({ items: [items[1]] }));
    expect(fx.gain).toBeCloseTo(0.4);
    expect(fx.gainC).toEqual(ITEM_COLOR[ITEM.HEALTH]);
  });

  it('keeps quiet for an item that vanishes far from the own player', () => {
    const { progress, fx } = setup();
    progress.snapshot(snap({ items }));
    progress.snapshot(snap({ items: [items[0]] }));
    expect(fx.gain).toBe(0);
  });

  it('keeps quiet for items that appear, stay, or go with the level', () => {
    const { progress, fx } = setup();
    progress.snapshot(snap({ items: [] }));
    progress.snapshot(snap({ items }));
    progress.snapshot(snap({ items }));
    progress.snapshot(snap({ level: 1, items: [] }));
    expect(fx.gain).toBe(0);
    expect(progress.items).toEqual([]);
  });

  it('keeps the items of the latest snapshot', () => {
    const { progress } = setup();
    progress.snapshot(snap({ items }));
    expect(progress.items).toBe(items);
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
