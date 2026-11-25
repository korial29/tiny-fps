import { describe, expect, it } from 'vitest';
import { BEACH, FIRES, FLAME, LAYOUT, ZED, walked } from './beach';
import { FIRE_HP, FIRE_TICKS, HP_MAX, PLAYER_H, PLAYER_R } from './constants';
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

  it("keeps Landfall's flames off the ways across: only the burning engines' backs and the lagoon's legs clear", () => {
    const kind = new Map(LAYOUT.pieces.map(p => [`${p.min}|${p.max}`, p.kind]));
    const legs = LAGOON.out.concat(LAGOON.in);
    const points = legs.flatMap(l => (l.k === 'leap' ? [l.at, l.to] : [l.to]));
    for (const [x, y, z, r, h] of BEACH.fires!) {
      // Every top a body standing in the flames would stand on: the fallen engine's, which
      // burns, or the lagoon engine's south corner; never the sand, a deck or the back.
      expect(walked(x, z) + PLAYER_H <= y || walked(x, z) >= y + h).toBe(true);
      for (const b of BEACH.brushes) {
        const [dx, dz] = [
          Math.max(b.min[0] - x, 0, x - b.max[0]),
          Math.max(b.min[2] - z, 0, z - b.max[2]),
        ];
        if (Math.hypot(dx, dz) < r + PLAYER_R && b.max[1] < y + h && b.max[1] + PLAYER_H > y) {
          expect(['fallen', 'engine']).toContain(kind.get(`${b.min}|${b.max}`));
        }
      }
      for (const [px, pz] of points) {
        for (const side of [pz, ZED - pz]) {
          expect(Math.hypot(px - x, side - z)).toBeGreaterThan(r + PLAYER_R);
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
