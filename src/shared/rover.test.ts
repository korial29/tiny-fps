import { describe, expect, it } from 'vitest';
import { EAST, WEST, toward } from '../../test/pilot';
import {
  box,
  flying,
  hill,
  land,
  off,
  ramp,
  rest,
  rise,
  rover,
  run,
  speeds,
  upTo,
} from '../../test/slope';
import { duo } from '../../test/teams';
import { BOLT, DASH_COOLDOWN, DASH_TICKS, PLAYER_R, SPRINT_SPEED, STEP_H } from './constants';
import { step } from './gun';
import { gapTo, move, spawn } from './physics';
import type { Body } from './physics';
import { onWire } from './protocol';
import { ground } from './relief';
import {
  GUNS,
  ROVER,
  board,
  bolts,
  drive,
  footprint,
  hull,
  leave,
  park,
  ride,
  seat,
  wheels,
} from './rover';
import { EV, KEY, MODE, NOBODY, TEX } from './types';
import type { Input, PlayerState, Rover } from './types';
import { build } from './world';
import type { Spawn, World } from './world';

const { A, B, WR, L0, RB, BODY, BODY_H } = ROVER;
const f32 = Math.fround;

/** A slab 200 m square with nothing round it, at full gravity: off its edge is the void. */
const world = (rovers?: Spawn[]): World =>
  build({
    brushes: [{ min: [-100, -5, -100], max: [100, 0, 100], top: TEX.STONE, side: TEX.STONE }],
    teams: duo([[0, 0, 0, 0]]),
    floor: -20,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    rovers,
  });
const yard = world([
  [10, 0, 5, 0],
  [-30, 0, 40, Math.PI / 2],
]);
/** The moon's half gravity on flat ground. */
const flat = land();
const input = (keys: number, yaw = 0): Input => ({ seq: 0, keys, yaw, pitch: 0 });
const FLOATS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'roll', 'wy', 'wp', 'wr'] as const;
/** The height the centre sits at on flat ground, on the moon: the springs give g / 4K under the load. */
const REST = WR + L0 - 10 / (4 * ROVER.K);

describe('park', () => {
  it('puts the rovers of the map on their spawns, at rest, nobody aboard', () => {
    const [a, b] = park(yard);
    expect([a.x, a.y, a.z]).toEqual([10, f32(WR + L0), 5]);
    expect(a.yaw).toBe(0);
    expect(b.yaw).toBe(f32(Math.PI / 2));
    expect([a.vx, a.vy, a.vz, a.pitch, a.roll, a.wy, a.wp, a.wr, a.steer]).toEqual(
      Array(9).fill(0),
    );
    expect([a.driver, a.rider, b.driver, b.rider]).toEqual(Array(4).fill(NOBODY));
  });

  it('has none on a map without rovers', () => {
    expect(park(world())).toEqual([]);
  });
});

describe('drive', () => {
  it('settles on its springs within a second, at half and full gravity', () => {
    for (const [share, sag] of [
      [0.5, 0.083],
      [1, 0.167],
    ]) {
      const w = land(undefined, [], share);
      const r = rover(w, 0, 0, 1, 0);
      expect(r.y).toBe(f32(WR + L0));
      rest(r, w, 60);
      const y = r.y;
      expect(WR + L0 - y).toBeCloseTo(sag, 2);
      for (let n = 0; n < 120; n++) {
        rest(r, w, 1);
        expect(Math.abs(r.y - y)).toBeLessThan(5e-3);
      }
      // Straight down: it neither creeps nor leans.
      expect([r.x, r.z, r.vx, r.vz, r.pitch, r.roll, r.wy]).toEqual(Array(7).fill(0));
      expect(Math.abs(r.vy)).toBeLessThan(5e-3);
    }
  });

  it('tops out near 22 m/s and reverses near 8', () => {
    const r = rover(flat, -250, 0, EAST);
    // Off the line like a sprinter within a second, then far past him.
    run(r, flat, 60, KEY.FORWARD);
    expect(speeds(r).along).toBeGreaterThan(8);
    expect(speeds(r).along).toBeLessThan(SPRINT_SPEED + 1);
    run(r, flat, 660, KEY.FORWARD);
    const top = speeds(r).along;
    expect(top).toBeGreaterThan(21.5);
    expect(top).toBeLessThan(22.5);
    expect(top).toBeGreaterThan(2 * SPRINT_SPEED);
    run(r, flat, 300, KEY.FORWARD);
    expect(speeds(r).along - top).toBeLessThan(0.1);
    // Straight as it goes: no speed across, no turn.
    expect(Math.abs(speeds(r).across)).toBeLessThan(1e-3);
    expect(r.z).toBeCloseTo(0, 3);

    const back = rover(flat, 0, 0, EAST);
    run(back, flat, 360, KEY.BACK);
    expect(speeds(back).along).toBeLessThan(-7.2);
    expect(speeds(back).along).toBeGreaterThan(-8);
    expect(back.x).toBeLessThan(-30);
  });

  it('boosts with Shift and W: off the line faster, on past its top speed, and back down when let go', () => {
    const [r, b] = [rover(flat, -250, 0, EAST), rover(flat, -250, 20, EAST)];
    run(r, flat, 60, KEY.FORWARD);
    run(b, flat, 60, KEY.FORWARD | KEY.SPRINT);
    expect(speeds(b).along).toBeGreaterThan(1.5 * speeds(r).along);
    run(b, flat, 840, KEY.FORWARD | KEY.SPRINT);
    expect(speeds(b).along).toBeGreaterThan(30);
    expect(speeds(b).along).toBeLessThan(ROVER.VBOOST);
    const top = speeds(b).along;
    run(b, flat, 120, KEY.FORWARD);
    expect(speeds(b).along).toBeLessThan(top - 1);
    // Not in reverse.
    const back = rover(flat, 0, 0, EAST);
    run(back, flat, 360, KEY.BACK | KEY.SPRINT);
    expect(speeds(back).along).toBeGreaterThan(-8);
  });

  it('brakes against its motion, harder than it rolls out', () => {
    const stop = (keys: number | undefined): number => {
      const r = rover(flat, -100, 0, EAST);
      upTo(r, flat, 20);
      const from = r.x;
      for (let n = 0; n < 3000 && speeds(r).along > 0.01; n++) {
        if (keys === undefined) {
          rest(r, flat, 1);
        } else {
          run(r, flat, 1, keys);
        }
      }
      return r.x - from;
    };
    const [braked, parked, rolled] = [stop(KEY.BACK), stop(undefined), stop(0)];
    // v² / 2a: the brake holds what the tyres pass on (MUL g), nobody at the wheel is the handbrake.
    expect(braked).toBeGreaterThan(14);
    expect(braked).toBeLessThan(20);
    expect(parked).toBeGreaterThan(braked);
    expect(parked).toBeLessThan(40);
    expect(rolled).toBeGreaterThan(200);
  });

  it("turns to the driver's look and drifts over the grip", () => {
    // Slow, the tyres hold: the nose comes round and the speed with it.
    const slow = rover(flat, 0, 0, 0);
    let slid = 0;
    for (let n = 0; n < 240; n++) {
      run(slow, flat, 1, speeds(slow).along < 4 ? KEY.FORWARD : 0, n < 60 ? 0 : WEST);
      slid = Math.max(slid, Math.abs(speeds(slow).across));
    }
    expect(Math.abs(off(slow, WEST))).toBeLessThan(0.05);
    expect(slid).toBeLessThan(0.2);
    expect(slow.vx).toBeLessThan(-3.5);

    // Fast, a quarter turn to the left: the nose is round within a second, the speed is not.
    const r = rover(flat, 0, 0, 0);
    upTo(r, flat, 15);
    let ticks = 0;
    while (Math.abs(off(r, WEST)) > 0.1 && ticks < 300) {
      run(r, flat, 1, KEY.FORWARD, WEST);
      ticks++;
      // The front wheels never turn past their lock, nor the nose faster than its cap.
      expect(Math.abs(r.steer)).toBeLessThanOrEqual(f32(ROVER.SMAX));
      expect(Math.abs(r.wy)).toBeLessThanOrEqual(ROVER.YMAX);
    }
    expect(ticks).toBeGreaterThan(30);
    expect(ticks).toBeLessThan(60);
    // It slides to the right of its nose, still going north for the most part, leaning out.
    expect(speeds(r).across).toBeGreaterThan(8);
    expect(r.vz).toBeLessThan(-8);
    expect(r.roll).toBeGreaterThan(0.03);
    // The grip then takes the slide away, no faster than MU g, and it leaves to the west.
    let before = speeds(r).across;
    for (let n = 0; n < 150; n++) {
      run(r, flat, 1, KEY.FORWARD, WEST);
      const now = speeds(r).across;
      expect(before - now).toBeLessThan((ROVER.MU * 10 * 2) / 60 + ROVER.YMAX * 25 * (1 / 60));
      before = now;
    }
    expect(Math.abs(speeds(r).across)).toBeLessThan(0.05);
    expect(Math.abs(off(r, WEST))).toBeLessThan(0.02);
    expect(r.vx).toBeLessThan(-15);
    expect(Math.abs(r.vz)).toBeLessThan(0.5);
  });

  it('steers the nose to the look in reverse too', () => {
    const r = rover(flat, 0, 0, 0);
    run(r, flat, 240, KEY.BACK, 0.8);
    expect(speeds(r).along).toBeLessThan(-5);
    expect(Math.abs(off(r, 0.8))).toBeLessThan(0.05);
  });

  it('swings its tail under the handbrake', () => {
    const turn = (hand: number): { ticks: number; slide: number } => {
      const r = rover(flat, 0, 0, 0);
      upTo(r, flat, 15);
      let [ticks, slide] = [0, 0];
      while (Math.abs(off(r, WEST)) > 0.1 && ticks < 300) {
        run(r, flat, 1, KEY.FORWARD | hand, WEST);
        ticks++;
      }
      for (let n = 0; n < 30; n++) {
        run(r, flat, 1, KEY.FORWARD | hand, WEST);
        slide = Math.max(slide, speeds(r).across);
      }
      return { ticks, slide };
    };
    const [free, pulled] = [turn(0), turn(KEY.JUMP)];
    expect(pulled.ticks).toBeLessThan(free.ticks - 5);
    expect(pulled.slide).toBeGreaterThan(free.slide + 1);

    // Straight on it only slows, and holds the rover once stopped.
    const r = rover(flat, 0, 0, 0);
    upTo(r, flat, 15);
    run(r, flat, 60, KEY.JUMP);
    expect(speeds(r).along).toBeLessThan(15 - ROVER.HB + 0.5);
    expect(speeds(r).along).toBeGreaterThan(15 - ROVER.HB - ROVER.ROLL - 0.5);
    expect(Math.abs(off(r, 0))).toBeLessThan(1e-3);
  });

  it('flies off a ramp and lands level', () => {
    const w = land(ramp(20));
    const r = rover(w, -25, 0, EAST);
    const hold = (): boolean => run(r, w, 1, KEY.FORWARD);
    while (r.x < 58) {
      hold();
    }
    // On the ramp it leans back with the slope and climbs with it, at 17 m/s by the lip.
    expect(r.pitch).toBeGreaterThan(0.3);
    expect(r.y).toBeGreaterThan(6);
    expect(speeds(r).along).toBeGreaterThan(16.5);
    expect(speeds(r).along).toBeLessThan(17.5);
    while (!flying(r, w)) {
      hold();
    }
    const from = r.x;
    expect(from).toBeLessThan(63);
    expect(r.vy).toBeGreaterThan(3);
    let [air, top] = [0, 0];
    while (flying(r, w) && air < 600) {
      hold();
      air++;
      top = Math.max(top, r.y);
    }
    // About 1.8 s in the moon's gravity, 30 m past the lip, the nose down to level on the way.
    expect(air / 60).toBeGreaterThan(1.6);
    expect(air / 60).toBeLessThan(2.1);
    expect(r.x - from).toBeGreaterThan(27);
    expect(r.x - from).toBeLessThan(36);
    expect(top).toBeGreaterThan(8.5);
    expect(Math.abs(r.pitch)).toBeLessThan(0.05);
    expect(Math.abs(r.roll)).toBeLessThan(0.01);
    expect(Math.abs(off(r, EAST))).toBeLessThan(0.01);
    // The springs take the fall: it never goes lower than they let it, and drives on.
    let low = Infinity;
    for (let n = 0; n < 120; n++) {
      hold();
      low = Math.min(low, r.y);
    }
    expect(low).toBeGreaterThan(WR + L0 - ROVER.CMAX - 0.05);
    expect(low).toBeLessThan(REST - 0.2);
    expect(r.y).toBeCloseTo(REST, 2);
    expect(Math.abs(r.pitch)).toBeLessThan(0.02);
    expect(speeds(r).along).toBeGreaterThan(16);
  });

  it('falls at the gravity of the map', () => {
    for (const [share, g] of [
      [0.5, 10],
      [1, 20],
    ]) {
      const w = land(undefined, [], share);
      const r = rover(w, 0, 0, 0);
      Object.assign(r, { y: 30, vy: 0, pitch: 0.4, roll: -0.3 });
      rest(r, w, 60);
      expect(r.vy).toBeCloseTo(-g, 3);
      // Nothing to push on: it only levels out.
      expect([r.x, r.z, r.vx, r.vz, r.wy]).toEqual(Array(5).fill(0));
      expect(Math.abs(r.pitch)).toBeLessThan(0.15);
      expect(Math.abs(r.roll)).toBeLessThan(0.12);
    }
  });

  it('does not pass a wall, and slides along it', () => {
    // Its front circle stops RB short of the wall, whatever the wall's thickness.
    const stop = 30 - RB - BODY[0];
    for (const thick of [1, 0.1]) {
      const w = land(undefined, [box([30, -1, -60], [30 + thick, 6, 60])]);
      const r = rover(w, -80, 0, EAST);
      for (let n = 0; n < 720; n++) {
        run(r, w, 1, KEY.FORWARD);
        expect(r.x).toBeLessThan(stop + 5e-3);
      }
      expect(r.x).toBeCloseTo(stop, 2);
      expect(speeds(r).all).toBeLessThan(1e-3);
      expect(r.y).toBeCloseTo(REST, 2);
      // Backing off works.
      run(r, w, 120, KEY.BACK);
      expect(r.x).toBeLessThan(stop - 3);
    }
    // At a slant it keeps what goes along the wall.
    const w = land(undefined, [box([30, -1, -200], [31, 6, 60])]);
    const r = rover(w, 0, 0, toward(0, 0, 1, -1));
    for (let n = 0; n < 480; n++) {
      run(r, w, 1, KEY.FORWARD);
      expect(Math.max(...footprint(r).map(([x]) => x))).toBeLessThan(30 - RB + 5e-3);
    }
    expect(footprint(r)[0][0]).toBeCloseTo(30 - RB, 2);
    expect(r.z).toBeLessThan(-60);
    // Scraping, the nose still into the wall: slower than free, and none of it into the wall.
    expect(r.vz).toBeLessThan(-3);
    expect(Math.abs(r.vx)).toBeLessThan(0.3);
  });

  it('climbs a step a player walks up and not a higher one', () => {
    const over = (h: number, fast: boolean): Rover => {
      const w = land(undefined, [box([20, -1, -10], [280, h, 10])]);
      const r = rover(w, fast ? -60 : 10, 0, EAST);
      run(r, w, 360, KEY.FORWARD);
      rest(r, w, 240);
      return r;
    };
    for (const fast of [false, true]) {
      for (const h of [0.3, STEP_H]) {
        const r = over(h, fast);
        expect(r.x).toBeGreaterThan(25);
        expect(r.y).toBeCloseTo(h + REST, 2);
      }
      // 0.6 m and 1 m are walls: the body stops against them, on the ground.
      for (const h of [0.6, 1]) {
        const r = over(h, fast);
        expect(r.x).toBeCloseTo(20 - RB - BODY[0], 2);
        expect(r.y).toBeCloseTo(REST, 2);
      }
    }
  });

  it('drives off a step, the nose down, and on', () => {
    const w = land(undefined, [box([-40, -1, -10], [20, 1.5, 10])]);
    const r = rover(w, 0, 0, EAST, 0);
    Object.assign(r, { y: f32(1.5 + REST) });
    rest(r, w, 60);
    expect(r.y).toBeCloseTo(1.5 + REST, 2);
    let dip = 0;
    for (let n = 0; n < 300; n++) {
      run(r, w, 1, KEY.FORWARD);
      dip = Math.min(dip, r.pitch);
    }
    expect(dip).toBeLessThan(-0.1);
    expect(r.x).toBeGreaterThan(40);
    expect(r.y).toBeCloseTo(REST, 1);
    expect(Math.abs(r.z)).toBeLessThan(1e-3);
  });

  it('stays parked on a 25 degree slope', () => {
    const w = land(hill(25));
    for (const yaw of [EAST, WEST, 0, 1]) {
      const r = rover(w, 60, 0, yaw);
      const [x, z] = [r.x, r.z];
      rest(r, w, 600);
      expect(Math.abs(r.x - x)).toBeLessThan(0.01);
      expect(Math.abs(r.z - z)).toBeLessThan(0.01);
      expect(speeds(r).all).toBeLessThan(1e-3);
      // It leans with the slope, its wheels all on it.
      expect(Math.abs(r.pitch) + Math.abs(r.roll)).toBeGreaterThan(0.4);
      for (const [wx, wy, wz, c] of wheels(r, w)) {
        expect(c).toBeGreaterThan(0.02);
        expect(wy - WR).toBeCloseTo(ground(w, wx, wz), 5);
      }
    }
    // A driver off the pedals lets it roll down; with the throttle it climbs.
    const r = rover(w, 60, 0, EAST);
    run(r, w, 180, 0);
    expect(r.x).toBeLessThan(50);
    expect(speeds(r).along).toBeLessThan(-5);
    const up = rover(w, 0, 0, EAST);
    run(up, w, 600, KEY.FORWARD);
    expect(up.x).toBeGreaterThan(100);
    expect(up.y).toBeCloseTo((up.x - 20) * rise(25) + REST, 0);
    expect(speeds(up).along).toBeGreaterThan(10);
  });

  it('stops at the bound', () => {
    const r = rover(flat, 270, 0, EAST);
    for (let n = 0; n < 300; n++) {
      run(r, flat, 1, KEY.FORWARD);
      expect(r.x).toBeLessThanOrEqual(300);
    }
    expect(r.x).toBeCloseTo(300, 3);
    expect(speeds(r).all).toBeLessThan(1e-3);
    // Along the edge at a slant, inside all the way.
    const s = rover(flat, 190, 190, toward(0, 0, 0.97, -0.26));
    for (let n = 0; n < 600; n++) {
      run(s, flat, 1, KEY.FORWARD);
      expect((s.x * s.x + s.z * s.z) / 9e4).toBeLessThan(1 + 1e-6);
    }
    expect((s.x * s.x + s.z * s.z) / 9e4).toBeGreaterThan(0.999);
    expect(s.z).toBeLessThan(150);
    run(r, flat, 180, KEY.BACK);
    expect(r.x).toBeLessThan(290);
  });

  it('tells when it is under the kill floor', () => {
    const [r] = park(yard);
    expect(drive(r, undefined, yard)).toBe(false);
    Object.assign(r, { x: 90, z: 0, yaw: f32(EAST) });
    let ticks = 0;
    // Off the edge of the slab: the front wheels over nothing, then all of it.
    while (!run(r, yard, 1, KEY.FORWARD) && ticks < 900) {
      ticks++;
      expect(r.y).toBeGreaterThanOrEqual(-20);
    }
    expect(ticks).toBeLessThan(900);
    expect(r.x).toBeGreaterThan(100);
    expect(r.y).toBeLessThan(-20);
    for (const k of FLOATS) {
      expect(Number.isFinite(r[k])).toBe(true);
    }
    expect(drive(r, input(0), yard)).toBe(true);
  });

  it('keeps every field float32 and finite over random driving', () => {
    // Hills of up to 3 m a cell round a flat yard with walls, steps, a slab overhead and a ramp.
    const hash = (i: number, j: number): number => {
      const h = Math.imul(Math.imul(i, 374761393) ^ Math.imul(j, 668265263), 1274126177);
      return ((h ^ (h >>> 15)) >>> 0) / 2 ** 32;
    };
    const brushes = [
      box([10, -1, -20], [11, 4, 20]),
      box([-20, -1, 10], [20, 3, 11]),
      box([-25, -1, -25], [-15, 0.5, -15]),
      box([-15, -1, -25], [-5, 1, -15]),
      box([-3, -1, -3], [-2.5, 2, 6]),
      box([14, -1, -6], [22, 2.5, 6]),
      box([-28, 2.2, -5], [-18, 2.6, 5]),
      box([60, -1, 30], [90, 6, 60]),
    ];
    const w = land((x, z) => {
      if (Math.abs(x) < 30 && Math.abs(z) < 30) {
        return 0;
      }
      return ramp(20)(x, z) || 3 * hash(Math.round(x / 4), Math.round(z / 4));
    }, brushes);
    let [fast, high, flown] = [0, 0, 0];
    const wrong: string[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      let s = seed;
      const rnd = (): number => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const r = rover(w, (rnd() - 0.5) * 40, (rnd() - 0.5) * 16 - 10, rnd() * 6);
      let [keys, yaw, turn] = [0, r.yaw, 0];
      for (let k = 0; k < 6000; k++) {
        if (k % 20 === 0) {
          keys =
            (rnd() < 0.75 ? KEY.FORWARD : 0) |
            (rnd() < 0.15 ? KEY.BACK : 0) |
            (rnd() < 0.15 ? KEY.JUMP : 0);
          turn = rnd() < 0.2 ? (rnd() - 0.5) * 18 : (rnd() - 0.5) * 0.3;
          // Now and then back toward the yard, and its walls.
          yaw = rnd() < 0.05 ? toward(r.x, r.z, 0, 0) : yaw;
        }
        yaw += turn / 60;
        // A step in a hundred with nobody at the wheel.
        const i = rnd() < 0.01 ? undefined : onWire({ seq: k, keys, yaw, pitch: 0 });
        const fell = drive(r, i, w);
        // Wedged between two walls it is pressed into one, never through.
        const walled = footprint(r).every(([x, y, z]) =>
          brushes.every(({ min, max }) => {
            const dx = x - Math.min(Math.max(x, min[0]), max[0]);
            const dz = z - Math.min(Math.max(z, min[2]), max[2]);
            return min[1] > y || max[1] < y + BODY_H || dx * dx + dz * dz > (RB / 2) ** 2;
          }),
        );
        const checks: [string, boolean][] = [
          ['fell', !fell],
          [
            'float32',
            [...FLOATS, 'steer' as const].every(f => Number.isFinite(r[f]) && r[f] === f32(r[f])),
          ],
          ['seats', r.driver === NOBODY && r.rider === NOBODY],
          ['yaw', r.yaw >= 0 && r.yaw < 2 * Math.PI + 1e-6],
          ['tilt', Math.max(Math.abs(r.pitch), Math.abs(r.roll)) <= f32(ROVER.TILT)],
          ['lock', Math.abs(r.steer) <= f32(ROVER.SMAX)],
          ['bound', (r.x * r.x + r.z * r.z) / 9e4 < 1 + 1e-6],
          ['ground', r.y > ground(w, r.x, r.z)],
          ['wall', walled],
        ];
        for (const [what, ok] of checks) {
          if (!ok) {
            wrong.push(`${what}: seed ${seed}, step ${k}`);
          }
        }
        fast = Math.max(fast, speeds(r).all);
        high = Math.max(high, r.y - ground(w, r.x, r.z));
        flown += +flying(r, w);
      }
    }
    expect(wrong).toEqual([]);
    // It did drive: at speed, off the ground, and no faster than a fall makes it.
    expect(fast).toBeGreaterThan(12);
    expect(fast).toBeLessThan(40);
    expect(high).toBeGreaterThan(3);
    expect(flown).toBeGreaterThan(600);
  });

  it('ends bit for bit the same on two runs of the same inputs, and from a copy of its state', () => {
    const w = land(ramp(20), [box([70, -1, -30], [71, 5, 30]), box([-20, -1, 5], [-10, 0.5, 15])]);
    const inputs: Input[] = [];
    let s = 7;
    const rnd = (): number => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    let [keys, yaw] = [0, EAST];
    for (let k = 0; k < 1800; k++) {
      if (k % 15 === 0) {
        keys = (rnd() < 0.8 ? KEY.FORWARD : KEY.BACK) | (rnd() < 0.2 ? KEY.JUMP : 0);
        yaw += (rnd() - 0.5) * 1.5;
      }
      inputs.push(onWire({ seq: k, keys, yaw, pitch: 0 }));
    }
    const a = rover(w, 0, 0, EAST);
    const b = rover(w, 0, 0, EAST);
    let c: Rover | undefined;
    inputs.forEach((i, k) => {
      drive(a, i, w);
      drive(b, i, w);
      // The predictor's replay: nothing but the state goes on, as the snapshot carries it.
      if (k === 900) {
        c = JSON.parse(JSON.stringify(a)) as Rover;
      } else if (c) {
        drive(c, i, w);
      }
    });
    expect(Math.abs(a.x) + Math.abs(a.z)).toBeGreaterThan(20);
    for (const k of [...FLOATS, 'steer'] as const) {
      expect(Object.is(a[k], b[k])).toBe(true);
      expect(Object.is(a[k], c![k])).toBe(true);
    }
  });
});

describe('wheels and footprint', () => {
  it('tell where the wheels are and how far each spring is squeezed', () => {
    const r = rover(flat, 5, 0, 0);
    const at = wheels(r, flat);
    // Front left, front right, rear left, rear right of a nose that points to -z.
    expect(at.map(([x, , z]) => [x - 5, z].map(v => +v.toFixed(3)))).toEqual([
      [-B, -A],
      [B, -A],
      [-B, A],
      [B, A],
    ]);
    for (const [, y, , c] of at) {
      expect(y).toBeCloseTo(WR, 5);
      expect(c).toBeCloseTo(WR + L0 - REST, 2);
    }
    // In the air the springs are out; near the ground they are squeezed to their travel at most.
    r.y = 5;
    for (const [, y, , c] of wheels(r, flat)) {
      expect(c).toBe(0);
      expect(y).toBeCloseTo(5 - L0, 5);
    }
    r.y = 0.3;
    for (const [, y, , c] of wheels(r, flat)) {
      expect(c).toBe(ROVER.CMAX);
      expect(y).toBeCloseTo(0.3 - L0 + ROVER.CMAX, 5);
    }
    // Nose up, right side down: the front and the left corners are the high ones.
    Object.assign(r, { y: 5, pitch: 0.3, roll: 0.2 });
    const [fl, fr, rl, rr] = wheels(r, flat).map(([, y]) => y);
    expect(fl).toBeGreaterThan(fr);
    expect(fr).toBeGreaterThan(rl);
    expect(rl).toBeGreaterThan(rr);
  });

  it('give the three circles of the body along the nose, at the height of the wheels', () => {
    const r = rover(flat, 0, 0, EAST);
    const body = footprint(r);
    expect(body.map(([x]) => +x.toFixed(3))).toEqual(BODY);
    for (const [, y, z] of body) {
      expect(y).toBeCloseTo(r.y - WR - L0, 6);
      expect(z).toBeCloseTo(0, 6);
    }
    // They cover the wheels: a wall the body clears, the wheels clear.
    for (const [x, , z] of wheels(r, flat)) {
      expect(Math.min(...body.map(([bx, , bz]) => Math.hypot(x - bx, z - bz)))).toBeLessThan(RB);
    }
  });
});

describe('the seats', () => {
  it("take a player aboard: he rides, on his seat, at the rover's speed", () => {
    const [r] = park(yard);
    Object.assign(r, { vx: 3, vy: 1, vz: -2 });
    const p = { ...spawn(4, yard, 0), edge: 2, dash: DASH_COOLDOWN, buffer: 3, coyote: 4 };
    board(p, r, 0);
    expect(r.driver).toBe(4);
    expect(r.rider).toBe(NOBODY);
    expect(p.mode).toBe(MODE.RIDE);
    expect(p.ground).toBe(false);
    expect([p.t, p.edge, p.buffer, p.coyote]).toEqual([0, 0, 0, 0]);
    // A dash's burst is over, its cooldown is not.
    expect(p.dash).toBe(DASH_COOLDOWN - DASH_TICKS);
    expect([p.vx, p.vy, p.vz]).toEqual([3, 1, -2]);
    // The driver sits on the left of a nose that points to -z, the rider on the right.
    expect(p.x).toBeLessThan(r.x);
    const q = { ...spawn(5, yard, 0), dash: 7 };
    board(q, r, 1);
    expect(r.rider).toBe(5);
    expect(q.dash).toBe(7);
    expect(q.x).toBeGreaterThan(r.x);
    expect(q.y).toBe(p.y);
    expect(Math.hypot(q.x - r.x, q.z - r.z)).toBeLessThan(RB);
  });

  it('follow the rover, leaning with it', () => {
    const [r] = park(yard);
    const p = spawn(1, yard, 0);
    board(p, r, 1);
    const [dx, dy, dz] = [p.x - r.x, p.y - r.y, p.z - r.z];
    Object.assign(r, { x: 40, y: 6, z: -12 });
    seat(p, r, 1);
    expect(p.x - r.x).toBeCloseTo(dx, 5);
    expect(p.y - r.y).toBeCloseTo(dy, 5);
    expect(p.z - r.z).toBeCloseTo(dz, 5);
    expect([p.x, p.y, p.z].map(f32)).toEqual([p.x, p.y, p.z]);

    // Parked across a 25 degree slope: neither seat is left in the air or sunk in the ground.
    const w = land(hill(25));
    const s = rover(w, 60, 0, 0);
    const [left, right] = [spawn(1, w, 0), spawn(2, w, 0)];
    board(left, s, 0);
    board(right, s, 1);
    expect(right.y - left.y).toBeGreaterThan(0.3);
    const over = [left, right].map(q => q.y - ground(w, q.x, q.z));
    expect(Math.abs(over[0] - over[1])).toBeLessThan(0.05);
    expect(over[0]).toBeGreaterThan(0.5);
    expect(over[0]).toBeLessThan(0.9);
    // Nose up the same slope, the seats ahead of the centre are higher than it would be level.
    const up = rover(w, 60, 0, EAST);
    const d = spawn(3, w, 0);
    board(d, up, 0);
    expect(d.y - up.y).toBeGreaterThan(dy + 0.03);
  });

  it('let a player out on the side of his seat, in the air, at its speed', () => {
    const r = rover(flat, 0, 0, 0);
    Object.assign(r, { vx: 2, vy: 0.5, vz: -9 });
    const [p, q] = [spawn(1, flat, 0), spawn(2, flat, 0)];
    board(p, r, 0);
    board(q, r, 1);
    leave(p, r, 0, flat);
    expect([r.driver, r.rider]).toEqual([NOBODY, 2]);
    expect(p.mode).toBe(MODE.AIR);
    expect([p.t, p.coyote]).toEqual([0, 0]);
    expect([p.vx, p.vy, p.vz]).toEqual([2, 0.5, -9]);
    // Clear of the body on the left, his feet on the ground.
    expect(p.x).toBeLessThan(-RB - PLAYER_R);
    expect(p.x).toBeGreaterThan(-RB - 3 * PLAYER_R);
    expect(p.y).toBe(0);
    leave(q, r, 1, flat);
    expect(r.rider).toBe(NOBODY);
    expect(q.x).toBe(-p.x);
    expect([q.y, q.z]).toEqual([p.y, p.z]);
    for (const v of [p.x, p.y, p.z, q.x]) {
      expect(v).toBe(f32(v));
    }
    // In flight there is no floor beside it: he leaves from the top of it.
    r.y = 12;
    board(p, r, 0);
    leave(p, r, 0, flat);
    expect(p.y).toBeCloseTo(12 - WR - L0 + BODY_H, 5);
    expect(Math.abs(p.x)).toBeLessThan(0.01);
  });

  it('let him out on the other side of a wall, on top between two, never in a brush or the ground', () => {
    // A wall along the left of a nose to -z, as close as the body gets to it.
    const wall = box([-2.2, -1, -20], [-1.2, 4, 20]);
    const w = land(undefined, [wall]);
    const r = rover(w, 0, 0, 0);
    const p = spawn(1, w, 0);
    board(p, r, 0);
    leave(p, r, 0, w);
    expect(p.x).toBeGreaterThan(RB + PLAYER_R);
    expect(p.y).toBe(0);
    // The rider's own side is free.
    board(p, r, 1);
    leave(p, r, 1, w);
    expect(p.x).toBeGreaterThan(RB + PLAYER_R);

    // Walls on both sides: he stands up on the rover.
    const alley = land(undefined, [wall, box([1.2, -1, -20], [2.2, 4, 20])]);
    for (const s of [0, 1] as const) {
      board(p, r, s);
      leave(p, r, s, alley);
      expect(Math.abs(p.x)).toBeLessThan(0.01);
      expect(p.y).toBeCloseTo(r.y - WR - L0 + BODY_H, 5);
      expect(p.mode).toBe(MODE.AIR);
    }

    // A low step beside it is a floor to get out on, a slab at head height is in the way.
    const kerb = land(undefined, [box([-3, -1, -20], [-1.2, 0.4, 20])]);
    board(p, r, 0);
    leave(p, r, 0, kerb);
    expect(p.x).toBeLessThan(-RB - PLAYER_R);
    expect(p.y).toBe(f32(0.4));
    const lintel = land(undefined, [box([-3, 1.2, -20], [-1.2, 1.6, 20])]);
    board(p, r, 0);
    leave(p, r, 0, lintel);
    expect(p.x).toBeGreaterThan(RB + PLAYER_R);

    // Across a slope, the uphill side: on the ground there, not under it.
    const slope = land(hill(25));
    const s = rover(slope, 60, 0, 0);
    board(p, s, 1);
    leave(p, s, 1, slope);
    expect(p.x).toBeGreaterThan(s.x + RB);
    expect(p.y).toBeCloseTo(ground(slope, p.x, p.z), 5);
    board(p, s, 0);
    leave(p, s, 0, slope);
    expect(p.x).toBeLessThan(s.x - RB);
    expect(p.y).toBeGreaterThanOrEqual(ground(slope, p.x, p.z));

    // On a bridge as wide as the rover, a drop on both sides: on top, over the deck.
    const bridge = land(() => -10, [box([-1.3, -11, -20], [1.3, 0, 20])]);
    const b = rover(bridge, 0, 0, 0, 0);
    Object.assign(b, { y: f32(REST) });
    for (const s of [0, 1] as const) {
      board(p, b, s);
      leave(p, b, s, bridge);
      expect(Math.abs(p.x)).toBeLessThan(0.01);
      expect(p.y).toBeGreaterThan(1);
    }
    // A deck a little wider on the driver's side: he steps out on it, and the rider follows him there.
    const quay = land(() => -10, [box([-3, -11, -20], [1.3, 0, 20])]);
    board(p, b, 0);
    leave(p, b, 0, quay);
    expect(p.x).toBeLessThan(-RB - PLAYER_R);
    expect(p.y).toBe(0);
    board(p, b, 1);
    leave(p, b, 1, quay);
    expect(p.x).toBeLessThan(-RB - PLAYER_R);

    // At the bound, the side past it: he is kept inside.
    const edge = rover(flat, 299.5, 0, 0);
    board(p, edge, 1);
    leave(p, edge, 1, flat);
    expect(p.x).toBeLessThanOrEqual(300);
  });
});

describe('ride', () => {
  it('keeps the driver on his seat, unarmed, until a press of USE', () => {
    const [r] = park(yard);
    const p = spawn(1, yard, 0);
    board(p, r, 0);
    expect(ride(p, r, input(KEY.FORWARD | KEY.FIRE), yard, 0)).toBe(false);
    expect(p.mode).toBe(MODE.RIDE);
    expect(r.driver).toBe(1);
    expect(p.shots).toBe(0);
    // Held from before he sat: not a press.
    p.held = KEY.USE;
    ride(p, r, input(KEY.USE), yard, 0);
    expect(r.driver).toBe(1);
    ride(p, r, input(0), yard, 0);
    ride(p, r, input(KEY.USE), yard, 0);
    expect(r.driver).toBe(NOBODY);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.x).toBeLessThan(r.x - RB);
  });

  it('drives the rover by his keys and his look, and carries him', () => {
    const r = rover(flat, 0, 0, 0);
    const p = spawn(1, flat, 0);
    board(p, r, 0);
    for (let n = 0; n < 240; n++) {
      // JUMP is the handbrake, not a jump: he stays seated.
      ride(p, r, onWire(input(KEY.FORWARD | (n > 200 ? KEY.JUMP : 0), 0.6)), flat, 0);
      expect(p.mode).toBe(MODE.RIDE);
    }
    expect(Math.abs(off(r, 0.6))).toBeLessThan(0.05);
    expect(speeds(r).all).toBeGreaterThan(8);
    expect(Math.hypot(r.x, r.z)).toBeGreaterThan(20);
    // On his seat, at its speed, looking where he looks.
    const q = { ...p };
    seat(q, r, 0);
    expect([p.x, p.y, p.z, p.vx, p.vy, p.vz]).toEqual([q.x, q.y, q.z, r.vx, r.vy, r.vz]);
    expect(p.yaw).toBeCloseTo(0.6, 3);
    expect(p.held).toBe(KEY.JUMP);
  });

  it('gets him out at speed the same on every replay', () => {
    const go = (): [Rover, ReturnType<typeof spawn>] => {
      const r = rover(flat, 0, 0, 0);
      const p = spawn(1, flat, 0);
      board(p, r, 0);
      for (let n = 0; n < 200; n++) {
        ride(p, r, onWire(input(KEY.FORWARD | (n === 199 ? KEY.USE : 0), n / 150)), flat, 0);
      }
      return [r, p];
    };
    const [r, p] = go();
    expect(r.driver).toBe(NOBODY);
    expect(p.mode).toBe(MODE.AIR);
    expect(Math.hypot(p.vx, p.vz)).toBeGreaterThan(10);
    expect([p.vx, p.vy, p.vz]).toEqual([r.vx, r.vy, r.vz]);
    expect(go()).toEqual([r, p]);
  });

  it('frees the seat of a driver the kill floor took', () => {
    const [r] = park(yard);
    Object.assign(r, { x: 95, z: 0, yaw: f32(EAST) });
    const p = spawn(1, yard, 0);
    board(p, r, 0);
    let [fell, ticks, ev] = [false, 0, 0];
    while (r.driver === 1 && ticks < 900) {
      fell = ride(p, r, input(KEY.FORWARD, EAST), yard, 0) || fell;
      ev |= p.ev;
      ticks++;
    }
    // The rover went under with him; he is back at his spawn, on his feet.
    expect(fell).toBe(true);
    expect(ev & EV.RESPAWN).toBe(EV.RESPAWN);
    expect(r.driver).toBe(NOBODY);
    expect(p.mode).toBe(MODE.GROUND);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
  });
});

describe('bolts', () => {
  const r = { ...park(build({ ...land().def, rovers: [[10, 0, 5, 0]] }))[0] };

  it('are two, one from each laser, named in a row, as strong as BOLT says', () => {
    const [l, q] = bolts(r, 3, 1, 0, 0, 255);
    expect([l.id, q.id]).toEqual([255, 0]);
    expect([l.by, l.team, l.power, l.left, l.burst]).toEqual([3, 1, BOLT, ROVER.GUN_RANGE, false]);
    // The nose points to -z: the left laser is on -x, both ahead of the centre.
    expect(l.x).toBeCloseTo(r.x + GUNS[0][0], 5);
    expect(q.x).toBeCloseTo(r.x + GUNS[1][0], 5);
    expect(l.z).toBeCloseTo(r.z - GUNS[0][2], 5);
    expect(l.y).toBeCloseTo(r.y + GUNS[0][1], 5);
  });

  it('cross where the driver looks, GUN_AIM metres from the centre, whatever the nose points at', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [1.2, 0.25],
      [4, -0.6],
    ]) {
      const aim = [
        r.x - Math.sin(yaw) * Math.cos(pitch) * ROVER.GUN_AIM,
        r.y + Math.sin(pitch) * ROVER.GUN_AIM,
        r.z - Math.cos(yaw) * Math.cos(pitch) * ROVER.GUN_AIM,
      ];
      for (const b of bolts(r, 0, 0, yaw, pitch, 0)) {
        expect(Math.hypot(b.dx, b.dy, b.dz)).toBeCloseTo(1, 9);
        const t = Math.hypot(aim[0] - b.x, aim[1] - b.y, aim[2] - b.z);
        expect(b.x + b.dx * t).toBeCloseTo(aim[0], 6);
        expect(b.y + b.dy * t).toBeCloseTo(aim[1], 6);
        expect(b.z + b.dz * t).toBeCloseTo(aim[2], 6);
      }
    }
  });
});

describe('collisions', () => {
  /** How far the player's centre is from the body's axis on the floor plane. */
  const from = (p: PlayerState, o: Body): number => Math.hypot(...gapTo(o, p.x, p.z).slice(0, 2));
  /** The least distance from a circle of r's body to o's axis, and the overlap of their heights. */
  const gap = (r: Rover, o: Rover): number =>
    Math.min(...footprint(r).map(([x, , z]) => Math.hypot(...gapTo(hull(o), x, z).slice(0, 2))));
  /** A player on foot at (x, z) of the moon's flat ground, standing. */
  const walker = (x: number, z: number): PlayerState => ({ ...spawn(1, flat, 0), x, z });
  /** `n` steps of a player on foot toward `yaw` among the bodies. */
  const walk = (p: PlayerState, n: number, keys: number, yaw: number, bodies: Body[]): void => {
    for (let k = 0; k < n; k++) {
      move(p, onWire(input(keys, yaw)), flat, 0, bodies);
    }
  };

  it('gives the body as the stadium round the front and rear circles of the footprint', () => {
    const r = rover(flat, 3, 4, 0.7);
    const [front, , rear] = footprint(r);
    expect(hull(r)).toEqual({ a: front, b: rear, r: RB, h: BODY_H });
  });

  it('stops a player walking into a parked rover from every side, and he slides along it', () => {
    const r = rover(flat, 0, 0, 0.6);
    const body = hull(r);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const [x, z] = [10 * Math.sin(a), 10 * Math.cos(a)];
      const yaw = toward(x, z, 0, 0);
      const p = walker(x, z);
      let least = Infinity;
      for (let n = 0; n < 240; n++) {
        walk(p, 1, KEY.FORWARD | KEY.SPRINT, yaw, [body]);
        least = Math.min(least, from(p, body));
      }
      // He came against it and round it, never into it, on the ground.
      expect(least).toBeGreaterThan(RB + PLAYER_R - 1e-4);
      expect(least).toBeLessThan(RB + PLAYER_R + 0.01);
      expect(p.mode).toBe(MODE.GROUND);
      expect(p.y).toBe(0);
      // Without it he walks through.
      const ghost = walker(x, z);
      let through = Infinity;
      for (let n = 0; n < 240; n++) {
        walk(ghost, 1, KEY.FORWARD | KEY.SPRINT, yaw, []);
        through = Math.min(through, from(ghost, body));
      }
      expect(through).toBeLessThan(0.5);
    }
    // Along its side he is not held: he slides on past its nose.
    const side = rover(flat, 0, 0, 0);
    const p = walker(-5, 0.5);
    walk(p, 120, KEY.FORWARD, toward(-5, 0, 0, -4), [hull(side)]);
    expect(p.z).toBeLessThan(-ROVER.BODY[0] - RB);
    expect(from(p, hull(side))).toBeGreaterThan(RB + PLAYER_R - 1e-4);
  });

  it('lets a player land on top, stand there, jump up onto it and walk off it', () => {
    const r = rover(flat, 0, 0, EAST);
    const body = hull(r);
    const top = footprint(r)[1][1] + BODY_H;
    const p = { ...walker(0.5, 0.2), y: 4 };
    walk(p, 120, 0, 0, [body]);
    expect(p.mode).toBe(MODE.GROUND);
    expect(p.y).toBeCloseTo(top, 3);
    // It is too tall to walk up: he jumps onto it from the ground (half gravity).
    const q = walker(0, 5);
    let on = false;
    for (let n = 0; n < 120 && !on; n++) {
      walk(q, 1, KEY.FORWARD | (n % 2 ? 0 : KEY.JUMP), 0, [body]);
      on = q.mode === MODE.GROUND && q.y > top - 0.01;
    }
    expect(on).toBe(true);
    expect(BODY_H).toBeGreaterThan(STEP_H);
    // And off the far side, down to the ground.
    walk(q, 120, KEY.FORWARD, 0, [body]);
    expect(q.z).toBeLessThan(-RB - PLAYER_R);
    expect(q.y).toBe(0);
    expect(q.mode).toBe(MODE.GROUND);
  });

  it('pushes a player out of a rover that drove into him slowly', () => {
    const r = rover(flat, 0, 0, EAST);
    const p = walker(2.6, 0);
    walk(p, 1, 0, 0, [hull(r)]);
    expect(from(p, hull(r))).toBeGreaterThan(RB + PLAYER_R - 1e-4);
    // Ahead of the nose, out ahead of it.
    expect(p.x).toBeGreaterThan(ROVER.BODY[0] + RB);
    // Dead on the axis: out by its right.
    const q = walker(0, 0);
    walk(q, 1, 0, 0, [hull(r)]);
    expect(q.z).toBeCloseTo(RB + PLAYER_R, 4);
  });

  it('does not touch the players in its seats', () => {
    const go = (bodies: boolean): [PlayerState, PlayerState, Rover] => {
      const r = rover(flat, 0, 0, EAST);
      const [d, s] = [spawn(1, flat, 0), spawn(2, flat, 1)];
      board(d, r, 0);
      board(s, r, 1);
      for (let n = 0; n < 180; n++) {
        const i = onWire(
          input(KEY.FORWARD | (n % 40 === 0 ? KEY.JUMP : 0), EAST + Math.sin(n / 30)),
        );
        ride(d, r, i, flat, 0, bodies ? [r] : []);
        step(s, i, flat, 0, true, bodies ? [hull(r)] : []);
        seat(s, r, 1);
        expect([d.mode, s.mode]).toEqual([MODE.RIDE, MODE.RIDE]);
      }
      return [d, s, r];
    };
    const [d, s, r] = go(true);
    expect(speeds(r).all).toBeGreaterThan(8);
    expect(go(false)).toEqual([d, s, r]);
  });

  it('stops a rover on another, which it does not push, and bounces it back a little', () => {
    const go = (fleet: boolean, yaw = 0): { a: Rover; b: Rover; least: number; before: number } => {
      const a = rover(flat, -20, 0, EAST);
      const b = rover(flat, 0, 0, yaw);
      const both = fleet ? [a, b] : [];
      const still = (): number[] => [b.x, b.z, b.vx, b.vz, b.yaw];
      const parked = still();
      let [least, before] = [Infinity, 0];
      for (let n = 0; n < 300; n++) {
        // Its speed on the last step before the first touch.
        before = least > 2 * RB + 0.5 ? speeds(a).along : before;
        drive(a, onWire(input(KEY.FORWARD, EAST)), flat, both);
        drive(b, undefined, flat, both);
        least = Math.min(least, gap(a, b));
        if (fleet) {
          expect(still()).toEqual(parked);
        }
      }
      return { a, b, least, before };
    };
    for (const yaw of [0, EAST, 0.8]) {
      const { a, least, before } = go(true, yaw);
      expect(least).toBeGreaterThan(2 * RB - 1e-3);
      expect(before).toBeGreaterThan(10);
      // Square on, against it at the end, its engine still pushing: no further on. At an angle it
      // slides off the other's side.
      if (yaw !== 0.8) {
        expect(a.x).toBeLessThan(0);
        expect(speeds(a).along).toBeLessThan(before / 2);
      }
      expect(go(true, yaw)).toEqual(go(true, yaw));
    }
    // The first contact sends it back: its speed toward the other turns round.
    const a = rover(flat, -6, 0, EAST);
    const b = rover(flat, 0, 0, 0);
    Object.assign(a, { vx: 10 });
    let back = false;
    for (let n = 0; n < 60 && !back; n++) {
      drive(a, undefined, flat, [a, b]);
      back = a.vx < 0;
    }
    expect(back).toBe(true);
    // Without a fleet the two pass through each other.
    expect(go(false).least).toBeLessThan(0.5);
  });

  it('keeps two rovers driven at each other apart: head on they stop, off centre they scrape past', () => {
    for (const dz of [0, 0.5]) {
      const a = rover(flat, -20, 0, EAST);
      const b = rover(flat, 20, dz, WEST);
      let least = Infinity;
      for (let n = 0; n < 300; n++) {
        drive(a, onWire(input(KEY.FORWARD, EAST)), flat, [a, b]);
        drive(b, onWire(input(KEY.FORWARD, WEST)), flat, [a, b]);
        least = Math.min(least, gap(a, b), gap(b, a));
      }
      // Each moves out of the other on its own step: at most one step of the other's into it.
      expect(least).toBeGreaterThan(2 * RB - 0.3);
      if (dz) {
        expect(Math.abs(b.z - a.z)).toBeGreaterThan(2 * RB);
      } else {
        expect(b.x - a.x).toBeGreaterThan(2 * (BODY[0] + RB) - 0.3);
      }
    }
  });
});
