import { describe, expect, it, vi } from 'vitest';
import { HEALTH, PLAYER_RESPAWN, TICK_HZ } from '../shared/constants';
import { compile } from '../shared/level';
import { LEVELS } from '../shared/levels';
import { HALL } from '../shared/map';
import { ITEM, PHASE } from '../shared/types';
import type { Item, PlayerInfo, SnapPlayer, Snapshot } from '../shared/types';
import { HURT, createDelay, createEffects } from './effects';
import { SAY } from './hud';
import type { Hud, Score } from './hud';
import { ITEM_COLOR } from './items';
import { SOUND } from './sfx';
import { clock, createProgress, facing } from './progress';

vi.mock('../shared/levels', async () => {
  const { HALL } = await import('../shared/map');
  return { LEVELS: [{ ...HALL, name: 'Warm-up' }, { ...HALL, name: 'Foundry' }, { ...HALL }] };
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

const ROSTER: PlayerInfo[] = [
  { id: YOU, name: 'Ann', color: '#e6194b' },
  { id: 2, name: 'Bob', color: '#3cb44b' },
  { id: 3, name: 'Cy', color: '#ffe119' },
];

const setup = () => {
  const said: [number, string][] = [];
  const shown = { hp: -1, keys: -1, dead: 0 };
  const ended: { head: string; scores: Score[]; foot: string }[] = [];
  const hud: Hud = {
    hp: n => (shown.hp = n),
    keys: n => (shown.keys = n),
    dead: secs => (shown.dead = secs),
    fade: () => {},
    title: () => {},
    end: (head, scores, foot) => void ended.push({ head, scores, foot }),
    mute: () => {},
    say: (slot, text) => void said.push([slot, text]),
    update: () => {},
  };
  const fx = createEffects();
  const first = compile(HALL);
  const predictor = { level: vi.fn() };
  const rd = { level: vi.fn() };
  const delay = createDelay<number>();
  const audio = { play: vi.fn() };
  const progress = createProgress({
    lvl: first,
    you: () => YOU,
    roster: () => ROSTER,
    predictor,
    rd,
    delays: [delay],
    fx,
    hud,
    audio,
  });
  return { progress, said, shown, ended, fx, first, predictor, rd, delay, audio };
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
    expect(lvl.map).toBe(LEVELS[0]);
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
      roster: () => [],
      predictor: { level: () => {} },
      delays: [],
      fx: createEffects(),
      hud: {
        hp() {},
        keys() {},
        dead() {},
        fade() {},
        title() {},
        end() {},
        mute() {},
        say() {},
        update() {},
      },
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
    expect(shown).toEqual({ hp: 5, keys: 0b1010, dead: 0 });
    expect(progress.hp).toBe(5);
    progress.snapshot(snap({ keys: 0, players: [player(YOU, 0)] }));
    expect(shown).toEqual({ hp: 0, keys: 0, dead: 3 });
    expect([progress.dead, progress.hp]).toEqual([true, 0]);
    progress.snapshot(snap({ players: [player(YOU, HEALTH)] }));
    expect(shown.dead).toBe(0);
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

  it('names the level and its mode for the title screen', () => {
    const { progress } = setup();
    expect(progress.name).toBe('Level 1: Warm-up');
    progress.snapshot(snap({ level: 1 }));
    expect(progress.name).toBe('Level 2: Foundry');
    progress.snapshot(snap({ level: 0, hard: true }));
    expect(progress.name).toBe('Level 1: Warm-up (hard mode)');
    // A level without a name shows its number alone.
    progress.snapshot(snap({ level: 2, hard: true }));
    expect(progress.name).toBe('Level 3 (hard mode)');
  });
});

describe('end screen', () => {
  const stats = [
    { id: YOU, kills: 4, deaths: 2 },
    { id: 2, kills: 9, deaths: 5 },
    { id: 3, kills: 4, deaths: 0 },
  ];

  it('shows the time, and a hard run says so', () => {
    const { progress, ended } = setup();
    progress.end(3723, false, []);
    expect(ended[0]).toEqual({
      head: 'Run complete\n1:02.0',
      scores: [],
      foot: 'Next run: Hard mode',
    });
    progress.end(600, true, []);
    expect(ended[1].head).toBe('Run complete\n0:10.0 (hard)');
  });

  it('lists the players with their names and colours, the most kills first', () => {
    const { progress, ended } = setup();
    progress.end(60, false, stats);
    expect(ended[0].scores).toEqual([
      ['Bob', '#3cb44b', 9, 5],
      ['Cy', '#ffe119', 4, 0],
      ['Ann', '#e6194b', 4, 2],
    ]);
  });

  it('breaks a tie of kills by the fewer deaths, then the lower id', () => {
    const { progress, ended } = setup();
    progress.end(60, false, [
      { id: 3, kills: 1, deaths: 1 },
      { id: 2, kills: 1, deaths: 1 },
      { id: YOU, kills: 1, deaths: 2 },
    ]);
    expect(ended[0].scores.map(r => r[0])).toEqual(['Bob', 'Cy', 'Ann']);
  });

  it('leaves out a player the roster does not know', () => {
    const { progress, ended } = setup();
    progress.end(60, false, [...stats, { id: 7, kills: 99, deaths: 0 }]);
    expect(ended[0].scores).toHaveLength(3);
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

  it('starts over with the level: full health there', () => {
    const { progress } = setup();
    progress.snapshot(snap({ players: [player(YOU, 1)] }));
    expect(progress.hp).toBe(1);
    progress.snapshot(snap({ level: 1, players: [player(YOU, HEALTH)] }));
    expect(progress.hp).toBe(HEALTH);
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
    const { progress, fx, audio } = setup();
    progress.snapshot(snap({ items }));
    progress.snapshot(snap({ items: [items[0]] }));
    expect(fx.gain).toBe(0);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('plays COLLECT once for an item the own player takes, and only then', () => {
    const { progress, audio } = setup();
    progress.snapshot(snap({ items }));
    progress.snapshot(snap({ items }));
    expect(audio.play).not.toHaveBeenCalled();
    progress.snapshot(snap({ items: [items[1]] }));
    progress.snapshot(snap({ items: [items[1]] }));
    expect(audio.play.mock.calls).toEqual([[SOUND.COLLECT]]);
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

describe('returning', () => {
  it('follows the phase, and starts over with a level', () => {
    const { progress } = setup();
    expect(progress.returning).toBe(false);
    progress.snapshot(snap({ phase: PHASE.RETURN }));
    expect(progress.returning).toBe(true);
    progress.snapshot(snap({ level: 1, phase: PHASE.HUNT }));
    expect(progress.returning).toBe(false);
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
