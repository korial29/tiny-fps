import { describe, expect, it } from 'vitest';
import { BEACH, ENGINES, FIRES, FLAME, ZED } from './beach';
import { FIRE_HP, FIRE_TICKS, HP_MAX, PLAYER_R } from './constants';
import { LAGOON } from './routes';
import { STILL } from './physics';
import { encodeInput } from './protocol';
import { Room } from './room';
import { TEX } from './types';
import type { Conn, PlayerState } from './types';
import type { WorldDef } from './world';
import { duo } from '../../test/teams';

/** A flat slab at y = 1 with a fire on it at the origin, 1 m wide and 2 m tall. */
const SLAB: WorldDef = {
  brushes: [{ min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK }],
  teams: duo([[-60, 1, 0, 0]], [[60, 1, 0, 0]]),
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
  fires: [[0, 1, 0, 1, 2]],
};

/** Ann (red) standing still at (x, y, z) for `ticks`: her state then. */
const stand = (x: number, y: number, z: number, ticks: number): PlayerState => {
  const room = new Room({}, SLAB);
  const ann: Conn = { send: () => {} };
  room.connect(ann);
  room.receive(ann, JSON.stringify({ t: 'join', name: 'Ann' }));
  const p = room['peers'].get(ann)!.state;
  Object.assign(p, STILL, { x, y, z, vy: 0, ground: y === 1 });
  for (let seq = 0; seq < ticks; seq++) {
    room.receive(ann, encodeInput({ seq, keys: 0, yaw: 0, pitch: 0 }));
    room.tick();
  }
  return p;
};

describe('fire', () => {
  it('burns a body in the flames FIRE_HP at once, then each FIRE_TICKS', () => {
    expect(stand(0.5, 1, 0, 1).hp).toBe(HP_MAX - FIRE_HP);
    expect(stand(0.5, 1, 0, FIRE_TICKS).hp).toBe(HP_MAX - FIRE_HP);
    expect(stand(0.5, 1, 0, 2 * FIRE_TICKS + 1).hp).toBe(HP_MAX - 3 * FIRE_HP);
  });

  it('leaves one beside the flames unhurt', () => {
    expect(stand(1.5, 1, 0, 60).hp).toBe(HP_MAX);
  });

  it("keeps Landfall's flames off the ways across: the nacelle's roof and run-through, the lagoon's legs", () => {
    // A body on the nacelle's roof (1.3 m each side of its middle, beach.ts nacelle()) or run through it has its middle within that.
    const roof = ENGINES[0][0] + 1.3;
    const legs = LAGOON.out.concat(LAGOON.in);
    const points = legs.flatMap(l => (l.k === 'leap' ? [l.at, l.to] : [l.to]));
    for (const [x, y, z, fr] of BEACH.fires!) {
      if (y < 5) {
        if (x > 50) {
          expect(x - fr - PLAYER_R).toBeGreaterThan(roof);
        }
        for (const [px, pz] of points) {
          for (const side of [pz, ZED - pz]) {
            expect(Math.hypot(px - x, side - z)).toBeGreaterThan(fr + PLAYER_R);
          }
        }
      }
    }
  });

  it("burns on Landfall where smoke.ts draws the flames, every column's foot", () => {
    expect(BEACH.fires).toHaveLength(FIRES.length);
    BEACH.fires!.forEach(([x, y, z, r, h], i) => {
      expect([x, y, z]).toEqual(FIRES[i].slice(0, 3));
      expect(r).toBeCloseTo(0.6 * FIRES[i][4] + FLAME[0]);
      expect(h).toBe(FLAME[1]);
    });
  });
});
