import { describe, expect, it } from 'vitest';
import {
  ALERT_R,
  FLYER_H,
  FLYER_HOVER,
  MAX_PLAYERS,
  MELEE_EVERY,
  PLAYER_H,
  SIGHT_EVERY,
  WALKER_H,
} from './constants';
import { bar, compile, sectorAt } from './level';
import { HALL } from './map';
import { createHorde, mulberry32 } from './monsters';
import type { Horde } from './monsters';
import { EVENT, ITEM, MONSTER, PHASE } from './types';
import type { GameEvent, MapDef, Monster, PlayerState, Sector } from './types';

const { WALKER, FLYER } = MONSTER;
/** No wandering: 0.5 turns by nothing, and every wait is a middle one. */
const calm = () => 0.5;

const rect = (x0: number, z0: number, x1: number, z1: number, floor = 0, ceil = 5): Sector => ({
  pts: [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ],
  floor,
  ceil,
  ft: 0,
  wt: 0,
  ct: 0,
});
const level = (sectors: Sector[], monsters: MapDef['monsters']) =>
  compile({ sectors, spawns: [[1, 1, 0]], monsters });
/** An open room, 40 m by 20 m. */
const OPEN = [rect(0, 0, 40, 20)];

const player = (id: number, x: number, z: number, y = 0): PlayerState => ({
  id,
  x,
  y,
  z,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  cool: 0,
});

/** Yaw that faces +x, -x, +z (yaw 0 faces -z). */
const EAST = Math.PI * 1.5;
const WEST = Math.PI * 0.5;
const SOUTH = Math.PI;

/** A run of ticks: the events that came out of each, with its number (counted from 1). */
const run = (h: Horde, players: PlayerState[], n: number, from = 0) => {
  const log: { tick: number; e: GameEvent }[] = [];
  for (let k = 1; k <= n; k++) {
    h.step(players);
    h.events.splice(0).forEach(e => log.push({ tick: from + k, e }));
  }
  return log;
};
const mob = (h: Horde, id: number): Monster => h.monsters().find(m => m.id === id)!;
const chasing = (h: Horde): boolean[] => h.monsters().map(m => m.chase);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('horde: spawning', () => {
  it('spawns the map monsters with ids from MAX_PLAYERS up, in map order, on their floors', () => {
    const h = createHorde(compile(HALL), calm);
    const list = h.monsters();
    expect(list.map(m => m.id)).toEqual(HALL.monsters!.map((_, i) => MAX_PLAYERS + i));
    list.forEach((m, i) => {
      const [x, z, yaw, kind] = HALL.monsters![i];
      expect([m.kind, m.x, m.z, m.chase]).toEqual([kind, x, z, false]);
      expect(m.yaw).toBeCloseTo(yaw % (Math.PI * 2));
      const floor = HALL.sectors[sectorAt(compile(HALL), x, z)].floor;
      expect(m.y).toBeCloseTo(kind === FLYER ? floor + FLYER_HOVER : floor);
    });
  });

  it('has none without map monsters', () => {
    const h = createHorde(level(OPEN, undefined), calm);
    expect(h.monsters()).toEqual([]);
    expect(run(h, [player(0, 5, 5)], 400)).toEqual([]);
    expect(h.monsters()).toEqual([]);
    expect(h.bullets()).toEqual([]);
  });
});

describe('horde: sight', () => {
  /** Whether a calm walker at (10, 10) facing -z hunts a player at (px, pz) within 130 ticks. */
  const sees = (px: number, pz: number, sectors = OPEN, at: [number, number] = [10, 10]) => {
    const h = createHorde(level(sectors, [[...at, 0, WALKER]]), calm);
    run(h, [player(0, px, pz)], SIGHT_EVERY * 2 + 10);
    return h.monsters()[0].chase;
  };

  it('looks once per SIGHT_EVERY ticks, staggered by id', () => {
    // Both see the player in the middle, far enough apart not to alert each other.
    const h = createHorde(
      level(OPEN, [
        [3, 10, EAST, WALKER],
        [35, 10, WEST, WALKER],
      ]),
      calm,
    );
    const p = [player(0, 19, 10)];
    // Id 16 looks when tick + 16 is a multiple of 60: tick 44. Id 17: tick 43.
    run(h, p, 42);
    expect(chasing(h)).toEqual([false, false]);
    run(h, p, 1, 42);
    expect(chasing(h)).toEqual([false, true]);
    run(h, p, 1, 43);
    expect(chasing(h)).toEqual([true, true]);
  });

  it('sees a player in front, in range, and not one behind or outside the cone', () => {
    expect(sees(10, 4)).toBe(true);
    // Behind it.
    expect(sees(10, 16)).toBe(false);
    // 20 degrees off the line of sight is inside the cone, 45 degrees is outside.
    expect(sees(10 + 6 * Math.tan(0.35), 4)).toBe(true);
    expect(sees(10 + 6, 4)).toBe(false);
  });

  it('sees as far as SIGHT_RANGE, not beyond', () => {
    // Facing +x along the room: the walker moves on a little before it looks.
    const far = (px: number) => {
      const h = createHorde(level([rect(0, 0, 80, 20)], [[1, 10, EAST, WALKER]]), calm);
      run(h, [player(0, px, 10)], SIGHT_EVERY * 2);
      return h.monsters()[0].chase;
    };
    expect(far(26)).toBe(true);
    expect(far(45)).toBe(false);
  });

  it('does not see through a wall, but does with the wall gone', () => {
    // Two rooms side by side, no door between them.
    const walled = [rect(0, 0, 10, 20), rect(12, 0, 22, 20)];
    const at = (sectors: Sector[]) => {
      const h = createHorde(level(sectors, [[5, 10, EAST, WALKER]]), calm);
      run(h, [player(0, 15, 10)], SIGHT_EVERY * 2);
      return h.monsters()[0].chase;
    };
    expect(at(walled)).toBe(false);
    expect(at([rect(0, 0, 22, 20)])).toBe(true);
  });

  it('does not see into a room whose ceiling is below the line of sight', () => {
    // A low roof between the two eyes: the player stands under a 1 m slab.
    const roofed = [rect(0, 0, 10, 20), rect(10, 0, 20, 20, 0, 1)];
    const h = createHorde(level(roofed, [[5, 10, EAST, WALKER]]), calm);
    run(h, [player(0, 15, 10)], SIGHT_EVERY * 2);
    expect(h.monsters()[0].chase).toBe(false);
  });

  it('picks the nearest of the players it can see', () => {
    const h = createHorde(level(OPEN, [[10, 15, 0, WALKER]]), calm);
    // Player 1 is 3 m away and a little right; player 0 is 7 m away and a little left.
    const far = player(0, 9, 8);
    const near = player(1, 11, 12);
    run(h, [far, near], SIGHT_EVERY);
    // Turning toward the near one: yaw goes below 2π (to the right of -z), not above 0.
    expect(mob(h, 16).chase).toBe(true);
    expect(mob(h, 16).yaw).toBeGreaterThan(Math.PI);
  });
});

describe('horde: alert', () => {
  // A wide room, and a second one next to it behind a wall.
  const sectors = [rect(0, 0, 30, 20), rect(31, 0, 41, 20)];
  const shooter = player(0, 28, 4);
  const monsters: MapDef['monsters'] = [
    // 16 sees the player ahead of it.
    [28, 10, 0, WALKER],
    // 17 is in the same room within ALERT_R, looking away: it never sees the player itself.
    [25, 15, SOUTH, WALKER],
    // 18 is just as near, but behind the wall.
    [33, 10, SOUTH, WALKER],
    // 19 is in view of 16 but farther than ALERT_R.
    [12, 10, SOUTH, FLYER],
  ];
  const horde = () => createHorde(level(sectors, monsters), calm);

  it('makes the monsters within ALERT_R that see the one who spotted hunt the same player', () => {
    const h = horde();
    expect(Math.hypot(28 - 25, 10 - 15)).toBeLessThan(ALERT_R);
    expect(Math.hypot(28 - 12, 0)).toBeGreaterThan(ALERT_R);
    // 16 looks at tick 44.
    run(h, [shooter], 43);
    expect(chasing(h)).toEqual([false, false, false, false]);
    run(h, [shooter], 1, 43);
    // Only 17 comes with it: 18 is behind a wall and 19 too far.
    expect(chasing(h)).toEqual([true, true, false, false]);
  });

  it('does the same on a death, for the one who shot it', () => {
    const h = horde();
    h.kill(16, 7);
    expect(h.monsters().map(m => m.id)).toEqual([17, 18, 19]);
    expect(h.events).toEqual([expect.objectContaining({ type: EVENT.DIE, id: 16 })]);
    // 17 sees where 16 died; 18 is behind the wall and 19 too far.
    expect(chasing(h)).toEqual([true, false, false]);
    // It hunts player 7: it keeps at it while 7 is in the room, and gives up when 7 is not.
    run(h, [shooter, player(7, 20, 18)], 1);
    expect(mob(h, 17).chase).toBe(true);
    run(h, [shooter], 1, 1);
    expect(mob(h, 17).chase).toBe(false);
  });

  it('leaves the ones already hunting alone: a second alert does not change their target', () => {
    const h = createHorde(
      level(OPEN, [
        [10, 10, 0, WALKER],
        [12, 10, 0, WALKER],
        [11, 12, 0, WALKER],
      ]),
      calm,
    );
    h.kill(16, 7);
    h.kill(17, 0);
    // 18 hunts player 7, far to the east: not player 0, far to the west, who shot the second.
    run(h, [player(0, 2, 12), player(7, 30, 12)], 20);
    expect(mob(h, 18).chase).toBe(true);
    expect(mob(h, 18).yaw).toBeGreaterThan(Math.PI);
  });
});

describe('horde: chase', () => {
  const closes = (kind: number) => {
    const h = createHorde(level(OPEN, [[5, 10, EAST, kind]]), calm);
    const p = [player(0, 20, 10)];
    run(h, p, 90);
    const early = dist(mob(h, 16), p[0]);
    run(h, p, 330, 90);
    return { early, late: dist(mob(h, 16), p[0]), m: mob(h, 16) };
  };

  it('closes in on a walker until it stands next to the player', () => {
    const { early, late, m } = closes(WALKER);
    expect(early).toBeLessThan(15);
    expect(early).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(0.9);
    expect(late).toBeLessThan(1.1);
    expect(m.chase).toBe(true);
    // Facing it.
    expect(m.yaw).toBeCloseTo(EAST);
  });

  it('closes in on a flyer, at hover height', () => {
    const { late, m } = closes(FLYER);
    expect(late).toBeLessThan(1.1);
    expect(m.y).toBeCloseTo(FLYER_HOVER);
  });

  it('turns at a bounded rate', () => {
    // The player is right behind the walker: a half turn takes more than a second.
    const h = createHorde(
      level(OPEN, [
        [20, 12, 0, WALKER],
        [20, 10, 0, WALKER],
      ]),
      calm,
    );
    h.kill(16, 0);
    run(h, [player(0, 20, 16)], 30);
    const { yaw } = mob(h, 17);
    // 30 ticks at 0.05 rad, either way round.
    expect(Math.min(yaw, Math.PI * 2 - yaw)).toBeCloseTo(1.5, 1);
  });

  it('drops a target that leaves the room, and patrols again', () => {
    const h = createHorde(level(OPEN, [[5, 10, EAST, WALKER]]), calm);
    run(h, [player(0, 20, 10)], 60);
    expect(mob(h, 16).chase).toBe(true);
    run(h, [], 1, 60);
    expect(mob(h, 16).chase).toBe(false);
    // And walks on, in its own direction.
    const [x] = [mob(h, 16).x];
    run(h, [], 30, 61);
    expect(mob(h, 16).x).toBeGreaterThan(x);
  });
});

describe('horde: moving like players', () => {
  it('walks at a slow pace on patrol, and turns round at a wall', () => {
    const h = createHorde(level(OPEN, [[5, 10, EAST, WALKER]]), calm);
    run(h, [], 60);
    // 40 % of WALKER_SPEED, for a second.
    expect(mob(h, 16).x - 5).toBeCloseTo(1, 1);
    // To the east wall and back: it never gets through it.
    let max = 0;
    for (let k = 0; k < 2400; k++) {
      h.step([]);
      max = Math.max(max, mob(h, 16).x);
    }
    expect(max).toBeLessThan(40 - 0.39);
    expect(max).toBeGreaterThan(39);
    expect(mob(h, 16).x).toBeLessThan(40 - 5);
  });

  it('wanders with the seed it is given, the same way each time', () => {
    const path = (seed: number) => {
      const h = createHorde(compile(HALL), mulberry32(seed));
      run(h, [], 900);
      return JSON.stringify(h.monsters());
    };
    expect(path(1)).toBe(path(1));
    expect(path(1)).not.toBe(path(2));
    // It does change its heading now and then.
    const h = createHorde(level(OPEN, [[20, 10, 0, WALKER]]), mulberry32(3));
    const yaws = new Set<number>();
    for (let k = 0; k < 900; k++) {
      h.step([]);
      yaws.add(mob(h, 16).yaw);
    }
    expect(yaws.size).toBeGreaterThan(2);
  });

  // A walker facing the lava pit of HALL from the north (the pit is x 26-30, z 6-10, 1 m deep).
  const pitHall = (rand: () => number) =>
    createHorde(compile({ ...HALL, monsters: [[28, 3, SOUTH, WALKER]] }), rand);

  it('does not patrol into the pit', () => {
    const h = pitHall(calm);
    let low = Infinity;
    for (let k = 0; k < 1500; k++) {
      h.step([]);
      low = Math.min(low, mob(h, 16).y);
    }
    expect(low).toBe(1);
  });

  it('falls into the pit when it chases across it, as a player does, and cannot climb out', () => {
    const h = pitHall(calm);
    const p = [player(0, 28, 14, 1)];
    run(h, p, 600);
    // The pit floor is at 0, a metre below the hall; the wall is too high for a step.
    expect(mob(h, 16).y).toBe(0);
    expect(sectorAt(compile(HALL), mob(h, 16).x, mob(h, 16).z)).toBe(6);
  });

  it('climbs steps up to STEP_H on a chase, not a wall of 2 m', () => {
    const stairs = [rect(0, 0, 10, 20), rect(10, 0, 20, 20, 0.4, 5), rect(20, 0, 30, 20, 2.4, 5)];
    const h = createHorde(level(stairs, [[5, 10, EAST, WALKER]]), calm);
    run(h, [player(0, 29, 10, 2.4)], 600);
    // Over the 0.4 m step, stopped by the 2 m one.
    const m = mob(h, 16);
    expect(m.y).toBeCloseTo(0.4);
    expect(m.x).toBeLessThan(20);
    expect(m.x).toBeGreaterThan(18);
  });

  it('is stopped by a doorway too low for it: a walker and a flyer', () => {
    // 0.7 m of headroom beside the player: no body of either kind fits.
    const world = (ceil: number) => {
      const h = createHorde(
        level(
          [rect(0, 0, 10, 20), rect(10, 0, 20, 20, 0, ceil)],
          [
            [5, 8, EAST, WALKER],
            [5, 12, EAST, FLYER],
          ],
        ),
        calm,
      );
      run(h, [player(0, 15, 10)], 500);
      return h.monsters().map(m => m.x);
    };
    const [low0, low1] = world(0.7);
    expect(low0).toBeLessThan(10);
    expect(low1).toBeLessThan(10);
    // The same room with a tall ceiling: both cross.
    const [tall0, tall1] = world(5);
    expect(tall0).toBeGreaterThan(12);
    expect(tall1).toBeGreaterThan(12);
  });

  it('lets a flyer over a ledge a walker cannot climb, and over the pit', () => {
    const h = createHorde(
      level(
        [rect(0, 0, 10, 20), rect(10, 0, 20, 20, 2, 8)],
        [
          [5, 8, EAST, WALKER],
          [5, 12, EAST, FLYER],
        ],
      ),
      calm,
    );
    run(h, [player(0, 15, 10, 2)], 500);
    const [walker, flyer] = h.monsters();
    expect(walker.x).toBeLessThan(10);
    // The flyer rose with the floor: its underside is above it, hovering.
    expect(flyer.x).toBeGreaterThan(12);
    expect(flyer.y).toBeGreaterThanOrEqual(2);
    expect(flyer.y).toBeLessThan(8 - FLYER_H + 1e-6);

    // And across the pit of HALL a flyer never goes lower than the ledges around it.
    const over = createHorde(compile({ ...HALL, monsters: [[28, 3, SOUTH, FLYER]] }), calm);
    let low = Infinity;
    for (let k = 0; k < 600; k++) {
      over.step([player(0, 28, 14, 1)]);
      low = Math.min(low, mob(over, 16).y);
    }
    expect(low).toBeGreaterThanOrEqual(1);
    expect(mob(over, 16).z).toBeGreaterThan(10);
  });

  it(
    'keeps every monster inside the map, and flyers between floor and ceiling (seeded fuzz)',
    { timeout: 60_000 },
    () => {
      const lvl = compile(HALL);
      // A spot inside each sector for the players to hop between: monsters chase them across the
      // hall, the pit, the stairs and the balcony.
      const spots = HALL.sectors.map(({ pts, floor }) => {
        const [x, z] = [
          pts.reduce((s, q) => s + q[0], 0) / pts.length,
          pts.reduce((s, q) => s + q[1], 0) / pts.length,
        ];
        return player(0, x, z, floor);
      });
      let bad = '';
      let chased = 0;
      let fell = 0;
      for (const seed of [1, 2, 3]) {
        const rand = mulberry32(seed);
        const h = createHorde(lvl, rand);
        let players = [spots[0]];
        for (let k = 0; k < 6000; k++) {
          if (k % 250 === 0) {
            players = [0, 1].map(id => ({
              ...spots[Math.floor(rand() * spots.length)],
              id,
            }));
          }
          h.step(players);
          h.events.length = 0;
          for (const m of h.monsters()) {
            const s = sectorAt(lvl, m.x, m.z);
            const { floor, ceil } = s < 0 ? { floor: 0, ceil: 0 } : HALL.sectors[s];
            const height = m.kind === FLYER ? FLYER_H : WALKER_H;
            if (s < 0 || m.y < floor - 1e-4 || m.y + height > ceil + 1e-4) {
              bad ||= `seed ${seed} tick ${k}: monster ${m.id} at (${m.x}, ${m.y}, ${m.z})`;
            }
            chased += +m.chase;
            fell += +(m.kind === WALKER && s === 6 && m.y < floor + 1e-4);
          }
        }
      }
      expect(bad).toBe('');
      // The fuzz did exercise a chase, and a walker in the pit.
      expect(chased).toBeGreaterThan(5000);
      expect(fell).toBeGreaterThan(0);
    },
  );
});

describe('horde: melee', () => {
  /**
   * A flyer (no bullets) at (10, 10) hunting player 0, whose death-alert it got from a decoy at
   * (4, 4); `face` is its yaw.
   */
  const hunted = (face: number) => {
    const h = createHorde(
      level(OPEN, [
        [4, 4, 0, WALKER],
        [10, 10, face, FLYER],
      ]),
      calm,
    );
    h.kill(16, 0);
    h.events.length = 0;
    return h;
  };

  it('swings once per MELEE_EVERY, and the blow lands a moment later on a target in front', () => {
    const h = hunted(0);
    // The player is 0.8 m ahead (facing -z), within reach.
    const log = run(h, [player(0, 10, 9.2)], 100);
    const at = (type: number) => log.filter(l => l.e.type === type).map(l => l.tick);
    expect(at(EVENT.SWING)).toEqual([1, 1 + MELEE_EVERY, 1 + 2 * MELEE_EVERY]);
    const hurts = at(EVENT.HURT);
    expect(hurts).toHaveLength(2);
    expect(hurts[0]).toBeGreaterThan(1);
    expect(hurts[0]).toBeLessThan(30);
    expect(hurts[1] - hurts[0]).toBe(MELEE_EVERY);
    expect(log.find(l => l.e.type === EVENT.HURT)!.e).toMatchObject({ id: 0, x: 10, z: 9.2 });
    expect(log.find(l => l.e.type === EVENT.SWING)!.e).toMatchObject({ id: 17 });
  });

  it('swings at a target in reach and misses it when it has gone by the blow', () => {
    const h = hunted(0);
    const p = player(0, 10, 9.2);
    expect(run(h, [p], 1).map(l => l.e.type)).toEqual([EVENT.SWING]);
    // The player has run 5 m ahead, still in front, before the blow lands.
    const log = run(h, [player(0, 10, 5)], 20, 1);
    expect(log.filter(l => l.e.type === EVENT.HURT)).toEqual([]);
  });

  it('misses a target behind it: the blow needs it in front', () => {
    // It faces +z, the player is 0.8 m behind (north): it takes about a second to turn round.
    const h = hunted(SOUTH);
    const log = run(h, [player(0, 10, 10.8 - 1.6)], 40);
    expect(log.filter(l => l.e.type === EVENT.SWING).map(l => l.tick)).toEqual([1]);
    expect(log.filter(l => l.e.type === EVENT.HURT)).toEqual([]);
    // Turned round by the second swing, it connects.
    const later = run(h, [player(0, 10, 9.2)], 60, 40);
    expect(later.filter(l => l.e.type === EVENT.HURT)).toHaveLength(1);
  });

  it('does not swing at a target out of reach', () => {
    const h = hunted(0);
    // 3 m away: a flyer needs more than 15 ticks to close in to 1.4 m.
    expect(run(h, [player(0, 10, 7)], 15)).toEqual([]);
  });

  it('does not reach a target above or below it', () => {
    // A flyer hovering 1.2 m up (its body 1.2 to 2.1 m) cannot hit a player 3 m under it, on a
    // floor of the same room.
    const h = createHorde(
      level([rect(0, 0, 20, 20), rect(20, 0, 30, 20, -3, 5)], [[22, 10, 0, FLYER]]),
      calm,
    );
    expect(mob(h, 16).y).toBeCloseTo(-1.8);
    const log = run(h, [player(0, 22, 9.2, 4)], 1);
    expect(log).toEqual([]);
  });
});

describe('horde: walkers shoot', () => {
  const long = [rect(0, 0, 200, 20)];
  /** A walker at (5, 10) facing +x, hunting player 0, after a decoy was shot dead at (2, 8). */
  const hunted = (sectors = OPEN) => {
    const h = createHorde(
      level(sectors, [
        [2, 8, 0, WALKER],
        [5, 10, EAST, WALKER],
      ]),
      calm,
    );
    h.kill(16, 0);
    h.events.length = 0;
    return h;
  };

  it('fires a bullet that reaches the player: a HURT on the cylinder, then the bullet is gone', () => {
    const h = hunted();
    const p = [player(0, 33, 10)];
    run(h, p, 60);
    // One bullet in flight, heading for the player at BULLET_SPEED.
    const [b] = h.bullets();
    expect(h.bullets()).toHaveLength(1);
    run(h, p, 1, 60);
    expect(h.bullets()[0].x - b.x).toBeCloseTo(12 / 60);
    // Far from a swing: the first HURT is the bullet.
    const log = run(h, p, 200, 61);
    const hurt = log.find(l => l.e.type === EVENT.HURT)!;
    expect(log.slice(0, log.indexOf(hurt)).map(l => l.e.type)).toEqual([]);
    expect(hurt.e.id).toBe(0);
    // It stopped on the side of the cylinder (PLAYER_R plus the bullet's radius from the axis)
    // at about chest height.
    expect(hurt.e.x).toBeCloseTo(33 - 0.55, 1);
    expect(hurt.e.y).toBeGreaterThan(1);
    expect(hurt.e.y).toBeLessThan(1.6);
    expect(hurt.tick).toBeGreaterThan(120);
    expect(hurt.tick).toBeLessThan(220);
  });

  it('fires once per SHOOT_EVERY, with a little jitter', () => {
    const h = hunted();
    const ids = new Set<number>();
    const p = [player(0, 33, 10)];
    for (let k = 0; k < 400; k++) {
      h.step(p);
      h.bullets().forEach(b => ids.add(b.id));
    }
    // First at about tick 46, then every 90 ticks: tick 46, 136, 226, 316.
    expect(ids.size).toBeGreaterThanOrEqual(3);
    expect(ids.size).toBeLessThanOrEqual(5);
  });

  it('bursts on the wall a bullet reaches without finding anyone', () => {
    const h = hunted();
    run(h, [player(0, 33, 10)], 60);
    const [b] = h.bullets();
    // The player steps out of the line of fire: the bullet flies on to the far wall.
    const log = run(h, [player(0, 33, 1)], 200, 60);
    const boom = log.find(l => l.e.type === EVENT.BOOM && l.e.id === b.id)!;
    expect(boom).toBeDefined();
    expect(boom.e.x).toBeCloseTo(40, 1);
    expect(boom.e.z).toBeCloseTo(10, 1);
    expect(h.bullets().find(x => x.id === b.id)).toBeUndefined();
    // No hurt for a player who was out of the way.
    expect(log.filter(l => l.e.type === EVENT.HURT && l.tick < boom.tick)).toEqual([]);
  });

  it('lets a bullet live BULLET_LIFE ticks at most, then drops it without a burst', () => {
    // A room of 200 m: the wall is farther than a bullet goes (300 ticks at 12 m/s is 60 m).
    const h = hunted(long);
    run(h, [player(0, 30, 10)], 60);
    expect(h.bullets()).toHaveLength(1);
    // Nobody left to hunt: the walker patrols and shoots no more.
    const log = run(h, [], 300, 60);
    expect(log).toEqual([]);
    expect(h.bullets()).toEqual([]);
  });

  it('does not fire without seeing the target, nor a flyer at all', () => {
    // Two rooms, no door: the walker hunts a player it cannot see.
    const h = createHorde(
      level(
        [rect(0, 0, 10, 20), rect(12, 0, 22, 20)],
        [
          [2, 8, 0, WALKER],
          [5, 10, EAST, WALKER],
          [3, 14, EAST, FLYER],
        ],
      ),
      calm,
    );
    h.kill(16, 0);
    run(h, [player(0, 17, 10)], 400);
    expect(h.bullets()).toEqual([]);
    expect(chasing(h)).toEqual([true, true]);
    // A flyer in the open fires nothing either.
    const f = createHorde(
      level(OPEN, [
        [2, 8, 0, WALKER],
        [5, 10, EAST, FLYER],
      ]),
      calm,
    );
    f.kill(16, 0);
    run(f, [player(0, 33, 10)], 400);
    expect(f.bullets()).toEqual([]);
  });
});

describe('horde: death', () => {
  const two = (): [Horde, ReturnType<typeof level>] => {
    const lvl = level(OPEN, [
      [10, 10, 0, WALKER],
      [30, 10, 0, FLYER],
    ]);
    return [createHorde(lvl, calm), lvl];
  };

  it('kills a monster at once: gone, with a DIE at the middle of its body', () => {
    const [h] = two();
    h.kill(16, 0);
    expect(h.monsters().map(m => m.id)).toEqual([17]);
    h.kill(17, 0);
    expect(h.monsters()).toEqual([]);
    const [die0, die1] = h.events.splice(0);
    expect(die0).toEqual({ type: EVENT.DIE, id: 16, x: 10, y: WALKER_H / 2, z: 10 });
    expect(die1).toEqual({
      type: EVENT.DIE,
      id: 17,
      x: 30,
      y: expect.closeTo(FLYER_HOVER + FLYER_H / 2, 5),
      z: 10,
    });
  });

  it('ignores a monster that is not there, a player id, and a second kill', () => {
    const [h] = two();
    h.kill(16, 0);
    h.kill(16, 0);
    h.kill(3, 0);
    h.kill(99, 0);
    expect(h.events).toHaveLength(1);
    expect(h.monsters()).toHaveLength(1);
  });

  it('returns the monster it killed, and nothing for one that is not alive', () => {
    const [h] = two();
    expect(h.kill(17, 0)).toMatchObject({ id: 17, kind: FLYER, x: 30, z: 10 });
    expect(h.kill(17, 0)).toBeUndefined();
    expect(h.kill(3, 0)).toBeUndefined();
  });

  it('never brings the monsters back: the level is over when they are dead', () => {
    const [h] = two();
    const p = [player(0, 20, 2)];
    h.kill(16, 0);
    h.kill(17, 0);
    run(h, p, 1000);
    expect(h.monsters()).toEqual([]);
  });
});

describe('horde: barred sectors', () => {
  /** A hall, a gate and a room beyond it; the monster is in the hall, the player in the room. */
  const gated = (kind: number) => {
    const lvl = compile({
      sectors: [rect(0, 0, 10, 10), rect(10, 0, 14, 10), rect(14, 0, 30, 10)],
      spawns: [[1, 1, 0]],
      monsters: [[5, 5, EAST, kind]],
      gates: [{ sector: 1, key: ITEM.KEY_RED }],
    });
    return [createHorde(lvl, calm), lvl] as const;
  };

  for (const kind of [WALKER, FLYER]) {
    it(`stops a ${kind === WALKER ? 'walker' : 'flyer'} at a gate it chases through, until the key is held`, () => {
      const [h, lvl] = gated(kind);
      const p = [player(0, 20, 5)];
      // It sees the player through the bars and runs at them.
      run(h, p, 600);
      expect(mob(h, 16).chase).toBe(true);
      expect(mob(h, 16).x).toBeGreaterThan(8);
      expect(mob(h, 16).x).toBeLessThan(10);
      bar(lvl, 1 << ITEM.KEY_RED, PHASE.HUNT);
      run(h, p, 600, 600);
      expect(mob(h, 16).x).toBeGreaterThan(17);
    });
  }
});

describe('HALL monsters', () => {
  const lvl = compile(HALL);

  it('has about five walkers and three flyers', () => {
    const kinds = HALL.monsters!.map(m => m[3]);
    expect(kinds.filter(k => k === WALKER)).toHaveLength(5);
    expect(kinds.filter(k => k === FLYER)).toHaveLength(3);
  });

  it('puts each one inside a sector, away from the walls, and none in the start room or corridor', () => {
    for (const [x, z, , kind] of HALL.monsters!) {
      const s = sectorAt(lvl, x, z);
      expect(s, `(${x}, ${z}) is outside the map`).toBeGreaterThan(1);
      const { floor, ceil } = HALL.sectors[s];
      expect(ceil - floor).toBeGreaterThan(kind === FLYER ? FLYER_HOVER + FLYER_H : PLAYER_H);
      // At least a metre from every wall of its own sector.
      for (const e of lvl.edges.filter(e => e.front === s && e.back < 0)) {
        const [ex, ez] = [e.bx - e.ax, e.bz - e.az];
        const d = Math.abs(ex * (z - e.az) - ez * (x - e.ax)) / Math.hypot(ex, ez);
        expect(d, `(${x}, ${z}) is ${d} m from a wall`).toBeGreaterThan(1);
      }
    }
  });

  it('keeps one flyer over the pit, and one monster on the balcony', () => {
    const sectors = HALL.monsters!.map(([x, z, , kind]) => [sectorAt(lvl, x, z), kind]);
    expect(sectors).toContainEqual([6, FLYER]);
    expect(sectors.filter(([s]) => s === 10).length).toBeGreaterThan(0);
  });
});
