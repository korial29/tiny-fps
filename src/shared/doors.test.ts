import { describe, expect, it } from 'vitest';
import { NORTH, SOUTH, Sim } from '../../test/pilot';
import { DASH_SPEED, DASH_TICKS, SNAP_EVERY, SPRINT_SPEED, TICK_HZ } from './constants';
import { DOOR, shut, swing } from './doors';
import { HIGHLINE } from './map';
import { MOON, ZED } from './moon';
import { DOORS } from './moonbase';
import { floorAt, spawn } from './physics';
import { fly, launch } from './plasma';
import { decodeSnapshot, encodeSnapshot } from './protocol';
import { beam } from './rail';
import { Room } from './room';
import { ROVER, bolts, park } from './rover';
import { KEY } from './types';
import type { Conn, PlayerState, Snapshot } from './types';
import { build, hidden, ray } from './world';
import type { World } from './world';

type Vec3 = [number, number, number];
/** The dome's door of red: x 78 to 82, in the passage through the wall, z 214.65 to 214.95. */
const [DOME, AIR] = DOORS;
const Z = (DOME.min[2] + DOME.max[2]) / 2;
const steps = (w: World, n: number, feet: Vec3[], rovers: Vec3[] = []) => {
  for (let k = 0; k < n; k++) {
    swing(w, feet, rovers);
  }
};

describe('doors, the map', () => {
  it('has three a base on the moon, the dome door and the two airlocks, blue the mirror of red, and none on Highline', () => {
    expect(HIGHLINE.doors).toBeUndefined();
    expect(build(HIGHLINE).doors).toBeUndefined();
    expect(MOON.doors).toHaveLength(6);
    expect(MOON.doors!.slice(0, 3)).toEqual(DOORS);
    MOON.doors!.slice(3).forEach((d, i) => {
      expect(d.min).toEqual([DOORS[i].min[0], 0, ZED - DOORS[i].max[2]]);
      expect(d.max).toEqual([DOORS[i].max[0], DOORS[i].max[1], ZED - DOORS[i].min[2]]);
    });
    expect([DOME.max[0] - DOME.min[0], DOME.max[1]]).toEqual([4, 3]);
    expect(build(MOON).doors).toEqual(MOON.doors!.map(() => ({ open: 0, wait: 0 })));
  });

  it('stands each in a doorway: no brush in its box, a wall at each end for the panels to slide into', () => {
    for (const { min, max } of MOON.doors!) {
      const meets = (lo: number[], hi: number[]) =>
        MOON.brushes.some(b =>
          [0, 1, 2].every(a => b.min[a] < hi[a] - 1e-6 && b.max[a] > lo[a] + 1e-6),
        );
      expect(meets(min, max)).toBe(false);
      const w = max[0] - min[0];
      // Half its width further on each side, at mid height: inside a brush.
      for (const s of [-1, 1]) {
        const x = s < 0 ? min[0] - w / 2 : max[0];
        expect(meets([x + 0.05, 1, min[2] + 0.05], [x + w / 2 - 0.05, 2, max[2] - 0.05])).toBe(
          true,
        );
      }
    }
  });
});

describe('doors, opening and shutting', () => {
  it('opens in 0.35 s when a player comes within 7 m from either side, stays a second after he leaves, shuts in 0.5 s', () => {
    expect([DOOR.OPEN / TICK_HZ, DOOR.SHUT / TICK_HZ, DOOR.HOLD / TICK_HZ]).toEqual([0.35, 0.5, 1]);
    for (const side of [-1, 1]) {
      const w = build(MOON);
      const at = (d: number): Vec3 => [80, 0, Z + side * d];
      steps(w, 30, [at(DOOR.R + 0.3)]);
      expect(w.doors![0].open).toBe(0);
      steps(w, 1, [at(DOOR.R - 0.3)]);
      expect(w.doors![0].open).toBeCloseTo(1 / DOOR.OPEN, 9);
      steps(w, DOOR.OPEN - 2, [at(3)]);
      expect(w.doors![0].open).toBeLessThan(1);
      steps(w, 1, [at(0)]);
      expect(w.doors![0].open).toBe(1);
      // Only that door: the airlocks and blue's stay shut.
      expect(w.doors!.slice(1).every(d => d.open === 0)).toBe(true);
      steps(w, DOOR.HOLD, [at(40)]);
      expect(w.doors![0].open).toBe(1);
      steps(w, DOOR.SHUT - 1, []);
      expect(w.doors![0].open).toBeGreaterThan(0);
      steps(w, 1, []);
      expect(w.doors![0].open).toBe(0);
    }
  });

  it('stays open while any of several players is near, opens to a driven rover from 14 m, not to someone on the roof', () => {
    const w = build(MOON);
    const far: Vec3 = [80, 0, 180];
    steps(w, 40, [far, [81, 0, Z - 4]]);
    steps(w, 200, [far, [60, 0, 150], [79, 1.5, Z + 5]]);
    expect(w.doors![0].open).toBe(1);
    steps(w, DOOR.HOLD + DOOR.SHUT, [far]);
    expect(w.doors![0].open).toBe(0);
    steps(w, 5, [far], [[80, 0.6, Z - DOOR.ROVER_R - 0.5]]);
    expect(w.doors![0].open).toBe(0);
    steps(w, 5, [far], [[80, 0.6, Z - DOOR.ROVER_R + 0.5]]);
    expect(w.doors![0].open).toBeGreaterThan(0);
    // The first module's airlock, and a runner on its roof 5 m up, over it.
    const x = (AIR.min[0] + AIR.max[0]) / 2;
    steps(w, 30, [[x, 5, AIR.min[2] - 1]]);
    expect(w.doors![1].open).toBe(0);
    steps(w, 30, [[x, 0, AIR.min[2] - 1]]);
    expect(w.doors![1].open).toBe(1);
    shut(w);
    expect(w.doors!.every(d => d.open === 0 && d.wait === 0)).toBe(true);
  });

  it('is wide open before a runner who sprints or dashes at it from where it starts to open gets there, from either side', () => {
    // The fastest way in: the burst of a dash, then the sprint.
    expect(DOOR.R).toBeGreaterThan(
      (DASH_SPEED * DASH_TICKS + SPRINT_SPEED * (DOOR.OPEN - DASH_TICKS)) / TICK_HZ + 2,
    );
    expect(DOOR.ROVER_R / ROVER.VMAX).toBeGreaterThan(DOOR.OPEN / TICK_HZ + 0.2);
    for (const [from, yaw] of [
      [Z - DOOR.R - 9, SOUTH],
      [Z + DOOR.R + 9, NORTH],
    ]) {
      for (const dash of [0, KEY.DASH]) {
        const w = build(MOON);
        const s = Sim.at(w).put(80, 0, from, yaw);
        let [seen, least] = [false, 1];
        for (let k = 0; k < 400; k++) {
          const d = Math.abs(s.p.z - Z);
          // He dashes as he crosses the line where it starts to open.
          s.step(KEY.FORWARD | KEY.SPRINT | (d < DOOR.R + 0.3 && d > DOOR.R - 0.3 ? dash : 0), yaw);
          swing(w, [[s.p.x, s.p.y, s.p.z]]);
          if (Math.abs(s.p.z - Z) < 1) {
            seen = true;
            least = Math.min(least, w.doors![0].open);
          }
        }
        expect(seen).toBe(true);
        expect(least, `from ${from}, dash ${dash}`).toBe(1);
      }
    }
  });

  it('never stops a body: a runner walks through a door that is shut as through an open one', () => {
    const run = (open: number) => {
      const w = build(MOON);
      w.doors!.forEach(d => (d.open = open));
      const s = Sim.at(w).put(80, 0, Z - 6, SOUTH);
      s.run(120, KEY.FORWARD, SOUTH);
      return s.p;
    };
    expect(run(0).z).toBeGreaterThan(Z + 4);
    expect(run(0)).toEqual(run(1));
  });
});

describe('doors, shots and sight', () => {
  /** A shooter 8 m before the dome's door, looking through it into the hall. */
  const shooter = (w: World): PlayerState => ({
    ...spawn(1, w, 0),
    x: 80,
    y: floorAt(w, 80, Z - 8, 99),
    z: Z - 8,
    yaw: SOUTH,
    pitch: 0,
  });
  const world = (open: number) => {
    const w = build(MOON);
    w.doors![0].open = open;
    return w;
  };

  it('stops a ray at a door less than half open, lets it through from half open on', () => {
    const o: Vec3 = [80, 1.5, Z - 8];
    expect(ray(world(0), o, [0, 0, 1], 60)).toBeCloseTo(8 - 0.15, 6);
    expect(ray(world(0.49), o, [0, 0, 1], 60)).toBeCloseTo(8 - 0.15, 6);
    expect(ray(world(0.5), o, [0, 0, 1], 60)).toBeGreaterThan(20);
    expect(ray(world(1), o, [0, 0, 1], 60)).toBeGreaterThan(20);
    // Over it and beside it the wall stops the ray as before, and from inside it stops too.
    expect(ray(world(0), [80, 1.5, Z + 8], [0, 0, -1], 60)).toBeCloseTo(8 - 0.15, 6);
    expect(ray(world(1), [70, 1.5, Z - 8], [0, 0, 1], 60)).toBeLessThan(9);
    // A ball is a sphere: it stops its radius early.
    expect(ray(world(0), o, [0, 0, 1], 60, 0.2)).toBeCloseTo(8 - 0.35, 6);
  });

  it('hides what is behind a shut door, shows it through an open one', () => {
    const [a, b]: Vec3[] = [
      [80, 1.6, Z - 5],
      [80, 1.6, Z + 5],
    ];
    expect(hidden(world(0), a, b)).toBe(true);
    expect(hidden(world(0), b, a)).toBe(true);
    expect(hidden(world(1), a, b)).toBe(false);
  });

  it('stops a plasma ball, a rail beam and a rover bolt at a shut door, and lets them through an open one', () => {
    for (const [open, through] of [
      [0, false],
      [1, true],
    ] as const) {
      const w = world(open);
      const p = shooter(w);
      const ball = launch(p);
      fly(w, ball, 30, []);
      expect(ball.z > Z + 1, `ball, open ${open}`).toBe(through);
      expect(!!ball.burst).toBe(!through);
      expect(beam(w, p).t > 9, `beam, open ${open}`).toBe(through);
      const r = { ...park(w)[0], x: 80, y: 1, z: Z - 6, yaw: SOUTH };
      for (const bolt of bolts(r, 1, 0, SOUTH, 0, 2)) {
        fly(w, bolt, 30, []);
        expect(bolt.z > Z + 1, `bolt, open ${open}`).toBe(through);
      }
    }
  });
});

describe('doors, the room and the wire', () => {
  const peer = () => {
    const bins: ArrayBuffer[] = [];
    const conn: Conn & { bins: ArrayBuffer[] } = {
      bins,
      send: data => void (typeof data === 'string' || bins.push(data)),
    };
    return conn;
  };
  const inside = (room: Room) =>
    room as unknown as {
      world: World;
      players(): { state: PlayerState }[];
      restart(p: unknown[]): void;
      next?: string;
      load(): void;
    };
  const last = (c: { bins: ArrayBuffer[] }): Snapshot => decodeSnapshot(c.bins.at(-1)!)!;

  it('moves the doors each tick from where the players are and sends them in the snapshot', () => {
    const room = new Room({ map: 'tranquility' });
    const c = peer();
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'a' }));
    room.tick();
    room.tick();
    expect(last(c).doors).toEqual([0, 0, 0, 0, 0, 0]);
    const { state } = inside(room).players()[0];
    Object.assign(state, { x: 80, y: 0, z: Z - 5 });
    for (let k = 0; k < 2 * SNAP_EVERY; k++) {
      room.tick();
    }
    const [open, ...rest] = last(c).doors!;
    expect(open).toBeCloseTo(Math.round((15 * 4) / DOOR.OPEN) / 15, 9);
    expect(rest).toEqual([0, 0, 0, 0, 0]);
    // Lying down, he holds no door: it shuts.
    for (let k = 0; k < DOOR.OPEN; k++) {
      room.tick();
    }
    expect(inside(room).world.doors![0].open).toBe(1);
    state.down = 250;
    for (let k = 0; k < DOOR.HOLD + DOOR.SHUT; k++) {
      state.down = 250;
      room.tick();
    }
    expect(inside(room).world.doors![0].open).toBe(0);
  });

  it('shuts every door on a new match and on a new map', () => {
    const room = new Room({ map: 'tranquility' });
    const c = peer();
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'a' }));
    const open = () =>
      inside(room).world.doors!.forEach(d => Object.assign(d, { open: 1, wait: 30 }));
    open();
    inside(room).restart(inside(room).players());
    expect(inside(room).world.doors).toEqual(MOON.doors!.map(() => ({ open: 0, wait: 0 })));
    open();
    inside(room).next = 'tranquility';
    inside(room).load();
    expect(inside(room).world.doors).toEqual(MOON.doors!.map(() => ({ open: 0, wait: 0 })));
    inside(room).next = 'highline';
    inside(room).load();
    expect(inside(room).world.doors).toBeUndefined();
    room.tick();
    room.tick();
    expect(last(c).doors).toBeUndefined();
  });

  const base: Snapshot = {
    tick: 7,
    players: [],
    score: [1, 2],
    clock: 99,
    over: false,
    flags: [
      { state: 0, by: 0, x: 0, y: 0, z: 0, left: 0 },
      { state: 0, by: 0, x: 0, y: 0, z: 0, left: 0 },
    ],
    packs: 5,
  };
  const ball = { id: 3, by: 1, x: 1, y: 2, z: 3, dx: 0, dy: 0, dz: -1, burst: false, power: 1 };

  it('adds no byte to a snapshot of a map without doors', () => {
    const plain = new Uint8Array(encodeSnapshot(base));
    expect(plain).toHaveLength(4 + 12);
    expect(new Uint8Array(encodeSnapshot({ ...base, doors: undefined }))).toEqual(plain);
    expect(new Uint8Array(encodeSnapshot({ ...base, doors: [] }))).toEqual(plain);
    expect(decodeSnapshot(plain.buffer)!.doors).toBeUndefined();
    const flown = new Uint8Array(encodeSnapshot({ ...base, balls: [ball] }));
    expect(flown).toHaveLength(4 + 12 + 1 + 11);
    expect(new Uint8Array(encodeSnapshot({ ...base, balls: [ball], doors: [] }))).toEqual(flown);
  });

  it('carries the doors in a nibble each after the balls: 5 bytes for six, 4 when a ball flies, and they round-trip', () => {
    const doors = [0, 1 / 15, 7 / 15, 8 / 15, 14 / 15, 1];
    const a = encodeSnapshot({ ...base, doors });
    expect(a.byteLength).toBe(4 + 12 + 5);
    expect(decodeSnapshot(a)).toMatchObject({ ...base, doors });
    expect(decodeSnapshot(a)!.balls).toBeUndefined();
    const b = encodeSnapshot({ ...base, balls: [ball], doors });
    expect(b.byteLength).toBe(4 + 12 + 1 + 11 + 4);
    expect(decodeSnapshot(b)!.doors).toEqual(doors);
    expect(decodeSnapshot(b)!.balls).toHaveLength(1);
    // An odd count, and a state between two steps goes to the nearest: half open stays half open.
    const odd = decodeSnapshot(encodeSnapshot({ ...base, doors: [0.49, 0.5, 0.52] }))!.doors!;
    expect(odd.map(d => d < 0.5)).toEqual([true, false, false]);
    // A lone zero count is still no snapshot, nor is a block cut short.
    expect(
      decodeSnapshot(new Uint8Array([...new Uint8Array(encodeSnapshot(base)), 0]).buffer),
    ).toBeNull();
    expect(decodeSnapshot(a.slice(0, a.byteLength - 1))).toBeNull();
  });
});
