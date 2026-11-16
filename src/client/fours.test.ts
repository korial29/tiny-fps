import { describe, expect, it } from 'vitest';
import { BLOW, PLAYER_R, STING } from '../shared/constants';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { DROP, RISE, createFours } from './fours';
import { JOINT as J, rest, solve, turn } from './rig';
import { FOOT_TIP } from './xeno';
import type { Vec3 } from './mesh';

const DT = 1 / 60;

const state = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  mode: MODE.GROUND,
  t: 0,
  wall: 0,
  edge: 0,
  jumps: 1,
  dashes: 1,
  dash: 0,
  stun: 0,
  coyote: 0,
  buffer: 0,
  held: 0,
  hp: 12,
  ammo: -1,
  cool: 0,
  down: 0,
  shots: 0,
  hits: 0,
  ev: 0,
  fall: 0,
  ...o,
});

/** Runs a player along at a steady velocity for `secs`, handing each frame's solved pose to `look`. */
const run = (
  o: Partial<PlayerState>,
  secs: number,
  look?: (s: ReturnType<typeof solve>, p: PlayerState) => void,
) => {
  const f = createFours();
  const p = state(o);
  for (let t = 0; t < secs; t += DT) {
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.z += p.vz * DT;
    f.update(p, DT);
    look?.(solve(f.apply(rest([p.x, p.y, p.z], p.yaw))), p);
  }
  return { f, p };
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(...a);
const PAWS = [J.HAND_L, J.HAND_R, J.FOOT_L, J.FOOT_R];
/** Where a paw touches: the wrist, or the end of the long foot, where the toes are drawn. */
const paw = (s: ReturnType<typeof solve>, j: number): Vec3 =>
  j == J.HAND_L || j == J.HAND_R
    ? s.pos[j]
    : (s.pos[j].map((v, i) => v + turn(s.rot[j], FOOT_TIP)[i]) as Vec3);

describe('on all fours', () => {
  it('stands up under a sprint and drops on all fours in one', () => {
    expect(run({ vz: -(DROP - 0.5) }, 1).f.weight).toBe(0);
    expect(run({ vz: -(DROP + 1) }, 1).f.weight).toBeGreaterThan(0.99);
  });

  it('stays down until the speed falls under RISE', () => {
    const f = createFours();
    const p = state({ vz: -16 });
    for (let i = 0; i < 60; i++) {
      f.update(p, DT);
    }
    p.vz = -(RISE + 0.3);
    for (let i = 0; i < 60; i++) {
      f.update(p, DT);
    }
    expect(f.weight).toBeGreaterThan(0.99);
    p.vz = -(RISE - 0.3);
    for (let i = 0; i < 90; i++) {
      f.update(p, DT);
    }
    expect(f.weight).toBe(0);
  });

  it('leaves the pose as it is while it stands', () => {
    const f = createFours();
    const p = state({ vz: -3 });
    f.update(p, DT);
    const pose = rest();
    expect(f.apply(pose)).toBe(pose);
  });

  it('gallops with its trunk level, the head ahead of the shoulders', () => {
    run({ vz: -18 }, 1.5, s => {
      const back = sub(s.pos[J.NECK], s.pos[J.PELVIS]);
      // Ahead (-z) and near level.
      expect(-back[2] / len(back)).toBeGreaterThan(0.8);
      expect(s.pos[J.HEAD][2]).toBeLessThan(s.pos[J.NECK][2] + 0.05);
      expect(s.pos[J.PELVIS][1]).toBeGreaterThan(0.45);
      expect(s.pos[J.PELVIS][1]).toBeLessThan(0.85);
    });
  });

  it('sets each paw down in a gallop and lifts it, a planted one never sliding', () => {
    const lows = PAWS.map(() => Infinity);
    const highs = PAWS.map(() => -Infinity);
    const was: (Vec3 | undefined)[] = PAWS.map(() => undefined);
    let slid = 0;
    run({ vz: -18 }, 2, (s, p) => {
      if (p.z > -5) {
        return;
      }
      PAWS.forEach((j, i) => {
        const at = paw(s, j);
        lows[i] = Math.min(lows[i], at[1]);
        highs[i] = Math.max(highs[i], at[1]);
        // A hand's wrist and a foot's toes stay put while they are on the floor: the wrist stands
        // 3.5 cm over it, the toes 2.
        const down = at[1] < (j == J.HAND_L || j == J.HAND_R ? 0.04 : 0.025);
        if (down && was[i]) {
          slid = Math.max(slid, len(sub(at, was[i])));
        }
        was[i] = down ? [...at] : undefined;
      });
    });
    lows.forEach(y => expect(y).toBeLessThan(0.07));
    highs.forEach(y => expect(y).toBeGreaterThan(0.15));
    expect(slid).toBeLessThan(0.005);
  });

  it('climbs a wall with its belly to it, head up, the paws on its face', () => {
    // The wall to the north: its face PLAYER_R off the player's middle, toward -z.
    const face = -PLAYER_R;
    let near = 0;
    run({ mode: MODE.CLING, wall: SIDE.NORTH, vy: 4.5 }, 1.5, (s, p) => {
      const back = sub(s.pos[J.NECK], s.pos[J.PELVIS]);
      expect(back[1] / len(back)).toBeGreaterThan(0.85);
      // The trunk off the wall as it stands over a floor, nothing through it.
      for (const j of [J.PELVIS, J.CHEST, J.NECK]) {
        const d = s.pos[j][2] - p.z - face;
        expect(d).toBeGreaterThan(0.15);
        expect(d).toBeLessThan(0.85);
      }
      for (const j of PAWS) {
        expect(paw(s, j)[2] - p.z - face).toBeGreaterThan(-0.03);
      }
      near = Math.max(near, ...PAWS.map(j => +(paw(s, j)[2] - p.z - face < 0.08)));
    });
    expect(near).toBe(1);
  });

  it('heads down the wall as it goes down it', () => {
    run({ mode: MODE.CLING, wall: SIDE.NORTH, vy: -4.5 }, 1.5, (s, p) => {
      if (p.y > -3) {
        return;
      }
      expect(s.pos[J.HEAD][1]).toBeLessThan(s.pos[J.PELVIS][1] - 0.3);
    });
  });

  it('rears up to strike with its claws, not with its tail', () => {
    const claws = run({ vz: -18, swing: 10, cut: BLOW.CLAW_L }, 1).f;
    const tail = run({ vz: -18, swing: 10, cut: STING.STAB }, 1).f;
    expect(claws.weight).toBe(0);
    expect(tail.weight).toBeGreaterThan(0.99);
  });

  it('keeps on all fours in a leap off a gallop', () => {
    const f = createFours();
    const p = state({ vz: -18 });
    for (let i = 0; i < 60; i++) {
      f.update(p, DT);
    }
    p.mode = MODE.AIR;
    for (let i = 0; i < 20; i++) {
      f.update(p, DT);
    }
    expect(f.weight).toBeGreaterThan(0.99);
  });
});
