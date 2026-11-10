import { describe, expect, it } from 'vitest';
import { EAST, NORTH, Sim, WEST, toward } from '../../test/pilot';
import { EYE, GRAVITY, JUMP_SPEED, PLAYER_H, PLAYER_R } from './constants';
import { LAYOUT, MOON, ZED } from './moon';
import { BASE, DOME, FIT, HALL, HEAD, MODULES, MOUTHS, ROOM, TUBES, WALL } from './moonbase';
import { KEY } from './types';
import { build, hidden, ray } from './world';
import type { Brush } from './world';

/** The beams over the doorways of the modules. */
const LINTELS = BASE.filter(b => b.min[1] === HEAD && b.max[1] === ROOM);
const world = build(MOON);
const { brushes } = MOON;
const [CX, CZ] = DOME;

/** The jump at half gravity: its height. */
const HALF = GRAVITY / 2;
const APEX = JUMP_SPEED ** 2 / (2 * HALF);
/** The drawn dome: its radius at a height. */
const shell = (y: number) => (y < 5 ? 22.4 : 22.4 * Math.sqrt(1 - ((y - 5) / 12) ** 2));
/** The hall's boxes as half sides, and whether a point (from the dome's centre) is in the hall. */
const RECTS = [...HALL, ...HALL.map(([a, b]) => [b, a])];
const inHall = (x: number, z: number, m = 0) =>
  RECTS.some(([a, b]) => Math.abs(x) < a - m && Math.abs(z) < b - m);
const over = (b: Brush, x: number, z: number, r = 0) =>
  b.min[0] < x + r && x - r < b.max[0] && b.min[2] < z + r && z - r < b.max[2];

describe('MOON, the domes, the modules and the tubes', () => {
  const ghosts = brushes.filter(b => b.ghost);

  it('has a ghost roof over each dome, 3 bands of 4 stepped boxes from 10.5 m, on a ghost wall with two mouths', () => {
    const roof = BASE.filter(b => b.ghost && b.min[1] >= 10.5);
    expect(roof).toHaveLength(12);
    expect(Math.max(...roof.map(b => b.max[1]))).toBe(17);
    const wall = BASE.filter(b => b.ghost && b.max[1] === 10.5);
    expect(wall).toHaveLength(20);
    // Every piece stands on the floor, but the two over the mouths.
    expect(wall.map(b => b.min[1]).sort()).toEqual([...Array<number>(18).fill(0), 3, 3.5]);
    expect(MOUTHS.map(m => m[3])).toEqual([3, 3.5]);
    for (const cz of [236, ZED - 236]) {
      const mine = ghosts.filter(
        b => b.max[1] >= 10.5 && Math.abs((b.min[2] + b.max[2]) / 2 - cz) < 23,
      );
      expect(mine).toHaveLength(32);
    }
    // Higher than a double jump from a module roof: 5 + apex + the second jump's rise, with a margin.
    expect(10.5).toBeGreaterThan(5 + APEX + 6 ** 2 / (2 * HALF) + 0.5);
    // A half of the base stays under 100 brushes: the map's cap is 450.
    expect(BASE.length).toBeLessThanOrEqual(100);
  });

  it('covers the drawn shell from outside: every point of its surface is in a ghost of the dome, in the door or in the tubes', () => {
    const [, , w, h] = MOUTHS[0];
    let open = 0;
    for (let y = 0.1; y < 17; y += 0.4) {
      for (let deg = 0; deg < 360; deg += 1) {
        const r = shell(y) - 0.01;
        const [x, z] = [
          CX + r * Math.cos((deg * Math.PI) / 180),
          CZ + r * Math.sin((deg * Math.PI) / 180),
        ];
        const door = Math.abs(x - CX) < w && z < CZ && y < h;
        const tube = TUBES.some(t => over(t as Brush, x, z) && y < t.max[1]);
        open += +(door || tube);
        // Over 9 m the corners of the hall stand out of the shell: its air, where no body gets.
        const air = y > 9 && inHall(x - CX, z - CZ);
        expect(
          door ||
            tube ||
            air ||
            BASE.some(b => b.ghost && over(b, x, z, 1e-9) && b.min[1] <= y && y <= b.max[1]),
          `${x.toFixed(2)}, ${y.toFixed(1)}, ${z.toFixed(2)}`,
        ).toBe(true);
      }
    }
    // The two mouths: a few degrees of the drum each.
    expect(open).toBeGreaterThan(100);
    expect(open).toBeLessThan(300);
  });

  it('fits the hall under the roof and inside the drawn shell, up to the 8 m its walls are drawn to', () => {
    const roof = BASE.filter(b => b.ghost && b.min[1] === 10.5);
    for (const [a, b] of RECTS) {
      // A box of the roof's first band over each box of the hall: no way out between wall and roof.
      expect(
        roof.some(
          r =>
            r.min[0] <= CX - a + 1e-9 &&
            r.max[0] >= CX + a - 1e-9 &&
            r.min[2] <= CZ - b + 1e-9 &&
            r.max[2] >= CZ + b - 1e-9,
        ),
        `${a} x ${b}`,
      ).toBe(true);
      expect(Math.hypot(a, b)).toBeLessThan(shell(8) - 0.3);
    }
    // The wall is at least 1.2 m thick behind every corner, the hall 40 m across.
    expect(Math.max(...RECTS.map(([a, b]) => Math.hypot(a, b)))).toBeLessThan(22.4 - 1.2);
    expect(HALL[0][0] * 2).toBeGreaterThan(39);
    // The eyes at the top of a double jump from the mezzanine, in a corner, are inside the inner shell.
    const eye = 3.5 + APEX + 6 ** 2 / (2 * HALF) + EYE;
    expect(Math.max(...RECTS.map(([a, b]) => Math.hypot(a - PLAYER_R, b - PLAYER_R)))).toBeLessThan(
      shell(eye) - 0.3,
    );
  });

  it('lays out the domes, the modules and the tubes the scenery draws on: both halves, each tube from its module to the dome', () => {
    const { domes, modules, tubes } = LAYOUT;
    expect([domes.length, modules.length, tubes.length]).toEqual([2, 4, 4]);
    expect(domes[1]).toEqual([80, ZED - 236]);
    // A module is a roof slab over its whole box; a tube a roof slab, its top the tube's.
    for (const [k, m] of [...modules, ...tubes].entries()) {
      const roof = brushes.filter(
        b =>
          !b.ghost &&
          b.max[1] === m.max[1] &&
          [0, 2].every(a => b.min[a] === m.min[a] && b.max[a] === m.max[a]),
      );
      expect(roof, `box ${k}`).toHaveLength(1);
      expect(roof[0].min[1]).toBe(k < 4 ? ROOM : HEAD);
    }
    // Each tube reaches the module it joins (the first its low x face, the second its high z face).
    expect(tubes[0].max[0]).toBe(modules[0].min[0]);
    expect(tubes[1].min[2]).toBe(modules[1].max[2]);
    expect(tubes[0].min[2]).toBeGreaterThanOrEqual(modules[0].min[2]);
    expect(tubes[1].min[0]).toBeGreaterThanOrEqual(modules[1].min[0]);
    // The second runs across the end of the first, where the hall's second mouth is.
    expect(tubes[1].max[0]).toBe(tubes[0].min[0]);
    expect(tubes[1].max[2]).toBe(tubes[0].max[2]);
    const [mx, mz, mw, , md] = MOUTHS[1];
    expect(CX + mx + md).toBe(tubes[1].min[0]);
    expect([CZ + mz - mw, CZ + mz + mw]).toEqual([tubes[0].min[2], tubes[0].max[2]]);
  });

  it('hollows the modules and the tubes: walls 0.4 m thick, a door to the tube and an airlock in each module', () => {
    for (const m of MODULES) {
      const walls = BASE.filter(
        b => !b.ghost && b.min[1] === 0 && b.max[1] === ROOM && over(b, ...mid(m), 8),
      );
      expect(walls.length).toBeGreaterThanOrEqual(6);
      for (const b of walls) {
        expect(Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2])).toBeCloseTo(WALL, 9);
      }
      // Two doorways, each under a beam: one against a tube, one to the outside.
      const beams = LINTELS.filter(l => over(l, ...mid(m), 8));
      expect(beams).toHaveLength(2);
      expect(beams.filter(l => TUBES.some(t => over(t as Brush, ...mid(l), 0.5)))).toHaveLength(1);
      for (const l of beams) {
        expect(Math.max(l.max[0] - l.min[0], l.max[2] - l.min[2])).toBeGreaterThanOrEqual(2.4);
      }
    }
    // A tube is 3.2 m wide inside and 2.4 m high at least.
    for (const t of TUBES) {
      expect(Math.min(t.max[0] - t.min[0], t.max[2] - t.min[2]) - 2 * WALL).toBeCloseTo(3.2, 9);
    }
    expect(HEAD).toBeGreaterThanOrEqual(2.4);
    expect(LINTELS.every(l => l.min[1] === HEAD)).toBe(true);
  });

  it('stands a mezzanine 3.5 m up along the hall, stairs of steps under 0.46 m up to it and cover', () => {
    expect(FIT.every(b => b.ghost)).toBe(true);
    const decks = FIT.filter(b => b.max[1] === 3.5 && b.min[1] === 3.1);
    expect(decks).toHaveLength(7);
    // None over the door: the way in is open to the roof.
    expect(decks.some(b => over(b, CX, CZ + MOUTHS[0][1] + 1))).toBe(false);
    const steps = FIT.filter(b => b.min[1] === 0 && over(b, CX, CZ + 9, 4)).sort(
      (a, b) => a.max[1] - b.max[1],
    );
    expect(steps).toHaveLength(8);
    steps.forEach((s, i) => {
      expect(s.max[1] - (i ? steps[i - 1].max[1] : 0)).toBeLessThanOrEqual(0.46);
    });
    expect(steps[7].max[1]).toBe(3.5);
    expect(FIT.length - decks.length - steps.length).toBe(6);
  });
});

/** The middle of a box, x and z. */
const mid = (b: { min: number[]; max: number[] }): [number, number] => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[2] + b.max[2]) / 2,
];

describe('MOON, the base flown with the real physics', () => {
  /**
   * Walks to within `jd` of a point on a top, then jumps and steers in the air: forward or back so
   * as to land on the point, as a player does. Returns the steps taken, -1 if it never stands there.
   */
  const flyTo = (s: Sim, [x, y, z]: [number, number, number], jd = 99, r = 1.2) =>
    s.until(
      p => p.ground && Math.abs(p.y - y) < 1e-3 && Math.hypot(p.x - x, p.z - z) < r,
      p => {
        const d = Math.hypot(x - p.x, z - p.z);
        if (p.ground) {
          return KEY.FORWARD | (d < jd ? KEY.JUMP : 0);
        }
        const v = (p.vx * (x - p.x) + p.vz * (z - p.z)) / (d || 1);
        const t = Math.max(
          (p.vy + Math.sqrt(Math.max(p.vy ** 2 + 2 * HALF * (p.y - y), 0))) / HALF,
          0.05,
        );
        return v * t < d - 0.3 ? KEY.FORWARD : v * t > d + 0.3 ? KEY.BACK : 0;
      },
      p => toward(p.x, p.z, x, z),
      400,
    );
  /** Walks the legs (x, z, the height to stand at there), each to within 0.3 m. */
  const walk = (s: Sim, legs: number[][]) => {
    for (const [x, z, y] of legs) {
      expect(s.goTo(x, z, { r: 0.3 }), `to ${x}, ${z}`).toBeGreaterThanOrEqual(0);
      s.settle();
      expect(s.p.y, `at ${x}, ${z}`).toBeCloseTo(y, 2);
    }
  };

  it('cannot be stood on or in at the domes: a double jump from a module roof stays under the first band', () => {
    const m = Sim.at(world).put(118, 5, 226, WEST);
    let high = 0;
    m.step(KEY.JUMP, WEST);
    m.until(p => p.vy <= 0, 0, WEST, 100);
    m.step(0, WEST);
    for (let k = 0; k < 100; k++) {
      m.step(k === 0 ? KEY.JUMP : 0, WEST);
      high = Math.max(high, m.p.y);
    }
    expect(high).toBeLessThan(10.5);
    expect(high).toBeGreaterThan(9);
  });

  it('climbs onto the tube tops by the ramps, then jumps up to the module roofs', () => {
    const s = Sim.at(world).put(107, 0, 211, NORTH);
    expect(s.goTo(107, 226, { r: 0.3 })).toBeGreaterThan(0);
    expect(s.p.y).toBeCloseTo(3.5, 2);
    // And the other way: from the tube top up to the first module's roof, 1.5 m.
    const m = Sim.at(world).put(107, 3.5, 226, EAST);
    expect(flyTo(m, [118, 5, 226])).toBeGreaterThanOrEqual(0);
    // The second tube: its ramp from the east, then the second module.
    const t = Sim.at(world).put(109, 0, 208, WEST);
    expect(t.goTo(100, 208, { r: 0.3 })).toBeGreaterThan(0);
    expect(t.p.y).toBeCloseTo(3.5, 2);
    // Its top runs on to the first tube's, where both meet the dome.
    expect(t.goTo(101.5, 225, { r: 0.3 })).toBeGreaterThan(0);
    expect(t.goTo(106, 225, { r: 0.3 })).toBeGreaterThan(0);
    expect(t.p.y).toBeCloseTo(3.5, 2);
  });

  it('walks from the flag pad through the door into the hall, up the stairs to the mezzanine, through a tube into a module and out by its airlock', () => {
    const [x, y, z] = MOON.teams[0].base;
    const s = Sim.at(world).put(x, y, z, NORTH);
    walk(s, [
      // Off the pad, through the door, across the hall to the foot of the stairs.
      [80, 212, 0],
      [80, 218, 0],
      [80, 241, 0],
      // Up them to the mezzanine, along it to over the tubes' mouth.
      [80, 250, 3.5],
      [94, 249, 3.5],
      [94, 226, 3.5],
      // Down off its edge, then east: the mouth, the first tube, the first module, its airlock.
      [90.5, 225.2, 0],
      [100, 225.2, 0],
      [110, 225.2, 0],
      [113, 225.2, 0],
      [118, 228, 0],
      [118, 233, 0],
    ]);
    expect(s.low).toBeGreaterThanOrEqual(0);
    expect(inHall(s.p.x - CX, s.p.z - CZ)).toBe(false);
    // And back in by the second module: its airlock, its tube, the mouth, the hall.
    const t = Sim.at(world).put(103, 0, 192, NORTH);
    walk(t, [
      [103, 198.5, 0],
      [100, 202, 0],
      [100, 206, 0],
      [100, 225.2, 0],
      [93, 225.2, 0],
    ]);
    expect(inHall(t.p.x - CX, t.p.z - CZ, PLAYER_R)).toBe(true);
  });

  it('walks all round the mezzanine but over the door, and jumps up to it from the floor', () => {
    const s = Sim.at(world).put(80, 3.5, 250, EAST);
    walk(s, [
      [94, 249, 3.5],
      [94, 223.5, 3.5],
      [92.7, 222, 3.5],
      [67.3, 222, 3.5],
      [66, 223.5, 3.5],
      [66, 249, 3.5],
      [80, 250, 3.5],
    ]);
    expect(s.low).toBe(3.5);
    // A double jump from the floor lands on it: 3.5 m is under the two rises.
    const j = Sim.at(world).put(86, 0, 236, EAST);
    j.run(30, KEY.FORWARD, EAST);
    j.step(KEY.FORWARD | KEY.JUMP, EAST);
    j.until(p => p.vy <= 0.5, KEY.FORWARD, EAST, 100);
    j.step(KEY.FORWARD, EAST);
    j.step(KEY.FORWARD | KEY.JUMP, EAST);
    j.until(p => p.ground, KEY.FORWARD, EAST, 200);
    expect(j.p.y).toBeCloseTo(3.5, 2);
  });

  it('stops a shot at the dome wall and lets it through the door and the tubes', () => {
    // From the flag pad to the middle of the hall: through the door, not beside it, not over it.
    expect(hidden(world, [80, 1.5, 205], [80, 1.5, 236])).toBe(false);
    expect(hidden(world, [70, 1.5, 205], [70, 1.5, 236])).toBe(true);
    expect(ray(world, [70, 1.5, 205], [0, 0, 1], 100)).toBeCloseTo(10, 6);
    expect(hidden(world, [80, 4, 205], [80, 4, 236])).toBe(true);
    // From the hall into the first module, along the tube, under its roof.
    expect(hidden(world, [90, 1.5, 225.2], [113, 1.5, 225.2])).toBe(false);
    expect(hidden(world, [90, 3, 225.2], [113, 3, 225.2])).toBe(true);
    // And through an airlock.
    expect(hidden(world, [118, 1.5, 226], [118, 1.5, 236])).toBe(false);
    expect(hidden(world, [114, 1.5, 226], [114, 1.5, 236])).toBe(true);
  });

  it('is closed all round and above: from the middle of the hall a ray leaves only by the two mouths', () => {
    const from: [number, number, number] = [CX, 1.5, CZ];
    let [door, tubes, flag] = [0, 0, 0];
    for (let deg = 0; deg < 360; deg += 0.5) {
      const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
      // Level at the chest, then over the mouths, then up to the zenith.
      for (let up = 0; up < 90; up += 10) {
        const e = (up * Math.PI) / 180;
        const d = ray(world, from, [c * Math.cos(e), Math.sin(e), s * Math.cos(e)], 100);
        const [x, z] = [c * Math.cos(e) * d, s * Math.cos(e) * d];
        if (inHall(x, z, -1e-6)) {
          // It stopped in the hall: on a wall, on what stands there, or under the roof.
          expect(1.5 + Math.sin(e) * d).toBeLessThanOrEqual(10.5 + 1e-6);
          continue;
        }
        // Out of the hall: level, and through the door or through the mouth of the tubes.
        expect(up, `${deg}°`).toBe(0);
        const [, mz, w] = MOUTHS[0];
        const [mx, nz, v] = MOUTHS[1];
        const byDoor = s < 0 && Math.abs((c / s) * mz) < w;
        const byTubes = c > 0 && Math.abs((s / c) * mx - nz) < v;
        expect(byDoor || byTubes, `${deg}°`).toBe(true);
        door += +byDoor;
        tubes += +byTubes;
        // In the tubes it ends on a wall; through the door, on its side or past the flag pad.
        expect(byDoor || d < 30, `${deg}°`).toBe(true);
        flag += +(d > 31);
      }
    }
    expect(door).toBeGreaterThan(10);
    expect(tubes).toBeGreaterThan(10);
    expect(flag).toBeGreaterThan(5);
  });

  it('cannot be entered from a tube top or over the wall: a runner who jumps at the dome stays out and under 10.5 m', () => {
    for (const [x, y, z, yaw] of [
      [107, 3.5, 225.2, WEST],
      [100, 3.5, 210, NORTH + Math.PI],
      [60, 0, 205, toward(60, 205, CX, CZ)],
      [80, 0, 268, NORTH],
    ]) {
      const s = Sim.at(world).put(x, y, z, yaw);
      let high = 0;
      for (let k = 0; k < 600; k++) {
        // A jump whenever one is to be had, the second at the top of the first.
        s.step(KEY.FORWARD | (s.p.ground || (s.p.vy < 0.2 && s.p.vy > 0) ? KEY.JUMP : 0), yaw);
        high = Math.max(high, s.p.y);
        expect(inHall(s.p.x - CX, s.p.z - CZ), `from ${x}, ${z}`).toBe(false);
      }
      expect(high).toBeLessThan(10.5);
      expect(Math.hypot(s.p.x - CX, s.p.z - CZ)).toBeGreaterThan(20.5);
    }
  });

  it('leaves a standing body its headroom everywhere indoors: the hall, the mezzanine, the stairs, the tubes, the modules', () => {
    let places = 0;
    const tops = [0, ...new Set(BASE.filter(b => b.max[1] <= 5).map(b => b.max[1]))];
    for (let x = 57.25; x < 126; x += 0.5) {
      for (let z = 195.25; z < 260; z += 0.5) {
        const here = brushes.filter(b => over(b, x, z));
        for (const y of tops) {
          // A top to stand on, clear at the feet, and something overhead: indoors.
          if (
            !here.some(b => b.max[1] === y) ||
            here.some(b => b.min[1] < y + 0.01 && b.max[1] > y + 0.01) ||
            !here.some(b => b.min[1] > y)
          ) {
            continue;
          }
          places++;
          const low = Math.min(
            ...brushes
              .filter(b => over(b, x, z, PLAYER_R) && b.min[1] > y + 0.01)
              .map(b => b.min[1]),
          );
          expect(low - y, `${x}, ${y}, ${z}`).toBeGreaterThanOrEqual(PLAYER_H);
          // The hall's own roof is no lower than 10.5 m over its floor.
          if (
            y === 0 &&
            inHall(x - CX, z - CZ, PLAYER_R) &&
            !brushes.some(b => over(b, x, z, PLAYER_R) && b.max[1] <= 5 && b.min[1] > 0)
          ) {
            expect(low).toBe(10.5);
          }
        }
      }
    }
    // The hall alone is 1300 m2, four places a square metre.
    expect(places).toBeGreaterThan(6000);
  });
});
