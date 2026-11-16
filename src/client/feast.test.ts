import { describe, expect, it } from 'vitest';
import { GLORY_DASH, GLORY_TICKS } from '../shared/constants';
import { ROLE } from '../shared/kit';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { BITE } from './body';
import { FEAST, clutched, mounted, seize } from './feast';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve } from './rig';
import { animate, stance } from './soldier';
import type { Runner } from './soldier';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const PREY: Vec3 = [0, 0, -1];
/** The xenomorph at the origin facing a little off its prey a metre ahead (-z). */
const xeno = () => ({ ...rest([0, 0, 0], 0.3), hips: [0, -0.1, 0] as Vec3 });

describe('the xenomorph on its prey (mounted())', () => {
  it('stays on its feet through its dash, leaps after it and is on him for the bite', () => {
    const at = (e: number) => mounted(GLORY_TICKS - e);
    expect(at(0)).toBe(0);
    expect(at(GLORY_DASH - 3)).toBe(0);
    expect(at(FEAST.LEAP[0] + FEAST.LEAP[1] / 2)).toBeGreaterThan(0.2);
    expect(at(FEAST.LEAP[0] + FEAST.LEAP[1] / 2)).toBeLessThan(0.8);
    // On him before it draws its head back for the bite (devour()).
    expect(at(BITE[0])).toBe(1);
    expect(mounted(1)).toBe(1);
    for (let k = GLORY_TICKS; k > 0; k--) {
      expect(mounted(k - 1)).toBeGreaterThanOrEqual(mounted(k));
    }
  });
});

describe('seize()', () => {
  it('leaves the pose as it is off him', () => {
    const p = xeno();
    expect(seize(p, PREY, 0)).toBe(p);
  });

  it('turns it to him, up against him, its feet on the floor', () => {
    const p = xeno();
    const q = seize(p, PREY, 1);
    // Facing him: forward(yaw) is (-sin yaw, -cos yaw), and he is along -z.
    expect(Math.sin(q.yaw)).toBeCloseTo(0, 6);
    expect(Math.cos(q.yaw)).toBeCloseTo(1, 6);
    const s = solve(q);
    const pelvis = s.pos[J.PELVIS];
    expect(Math.hypot(pelvis[0] - PREY[0], pelvis[2] - PREY[2])).toBeCloseTo(FEAST.CLING, 6);
    expect(pelvis[2]).toBeGreaterThan(PREY[2]);
    // Its legs as they were, its feet on the floor: no higher than in the pose it had.
    const was = solve(p);
    for (const j of [J.FOOT_L, J.FOOT_R, J.PELVIS]) {
      expect(s.pos[j][1]).toBeCloseTo(was.pos[j][1], 1);
    }
  });
});

describe('clutched()', () => {
  it('turns him to it, bent back and sunk, his feet where they were, his hands against its chest', () => {
    const p = rest([0, 0, -1], 2);
    const before = solve(p);
    const q = clutched(p, [0, 0, 0], 1);
    // Facing the xenomorph along +z.
    expect(Math.sin(q.yaw)).toBeCloseTo(0, 6);
    expect(Math.cos(q.yaw)).toBeCloseTo(-1, 6);
    const s = solve(q);
    expect(s.pos[J.PELVIS][1]).toBeCloseTo(before.pos[J.PELVIS][1] - FEAST.SINK, 6);
    // His feet stay where they stood, though he turned on them.
    const feet = solve({ ...p, yaw: q.yaw });
    for (const j of [J.FOOT_L, J.FOOT_R]) {
      expect(dist(s.pos[j], feet.pos[j])).toBeLessThan(0.01);
    }
    // Bent back: his head behind his pelvis, away from it.
    expect(s.pos[J.HEAD][2]).toBeLessThan(s.pos[J.PELVIS][2] - 0.1);
    const [px, pt, py] = FEAST.PUSH;
    expect(dist(s.pos[J.HAND_R], [-px, py, -1 + pt])).toBeLessThan(0.02);
  });
});

describe('a glory kill drawn', () => {
  const XENO = 1;
  const PREY_ID = 2;
  const looks = new Map([
    [XENO, { role: ROLE.XENO }],
    [PREY_ID, { role: ROLE.MARINE }],
  ]);
  const state = (id: number, over: Partial<PlayerState>): PlayerState => ({
    id,
    x: 0,
    y: 0,
    z: 0,
    vy: 0,
    yaw: 0,
    pitch: 0,
    ground: true,
    ...STILL,
    ...over,
  });
  const frames = (book: Map<number, Runner>, ps: PlayerState[], n: number) => {
    for (let k = 0; k < n; k++) {
      animate(book, ps, 1 / 60, undefined, undefined, undefined, undefined, looks);
    }
  };

  it('puts the xenomorph up against its prey while locked, then lets go of him over DROP', () => {
    const book = new Map();
    const free = [state(XENO, {}), state(PREY_ID, { z: -1, yaw: Math.PI })];
    frames(book, free, 2);
    const low = stance(book.get(XENO)).s.pos[J.PELVIS][1];
    const locked = [
      state(XENO, { lock: 10, foe: PREY_ID }),
      state(PREY_ID, { z: -1, yaw: Math.PI, lock: 10, foe: XENO }),
    ];
    frames(book, locked, 2);
    expect(book.get(XENO).mount).toBe(1);
    expect(book.get(PREY_ID).mount).toBe(1);
    const on = stance(book.get(XENO)).s;
    // Up against him on its feet: its claws over his shoulders, its head just by his.
    expect(Math.min(on.pos[J.TOE_L][1], on.pos[J.TOE_R][1])).toBeLessThan(0.15);
    const [cx, ct, cy] = FEAST.CLAWS;
    expect(dist(on.pos[J.HAND_L], [-cx, cy, -1 + ct])).toBeLessThan(0.02);
    expect(dist(on.pos[J.HAND_R], [cx, cy, -1 + ct])).toBeLessThan(0.02);
    expect(dist(on.pos[J.HEAD], stance(book.get(PREY_ID)).s.pos[J.HEAD])).toBeLessThan(0.45);
    // The kill: both free, he goes down; it is still on him a moment, then off.
    const after = [state(XENO, {}), state(PREY_ID, { z: -1, yaw: Math.PI, down: 100 })];
    frames(book, after, Math.round((FEAST.DROP / 2) * 60));
    expect(book.get(XENO).mount).toBeGreaterThan(0.3);
    expect(book.get(XENO).mount).toBeLessThan(0.7);
    frames(book, after, Math.round((FEAST.DROP / 2) * 60) + 2);
    expect(book.get(XENO).mount).toBe(0);
    expect(stance(book.get(XENO)).s.pos[J.PELVIS][1]).toBeCloseTo(low, 1);
    expect(stance(book.get(XENO)).s.pos[J.PELVIS][2]).toBeCloseTo(0, 1);
  });

  it('leaves a lock of two humans (a saber lock) to the katana', () => {
    const book = new Map();
    const man = new Map([
      [XENO, { role: ROLE.MARINE }],
      [PREY_ID, { role: ROLE.MARINE }],
    ]);
    const ps = [
      state(XENO, { lock: 10, foe: PREY_ID }),
      state(PREY_ID, { z: -1, lock: 10, foe: XENO }),
    ];
    for (let k = 0; k < 2; k++) {
      animate(book, ps, 1 / 60, undefined, undefined, undefined, undefined, man);
    }
    expect(book.get(XENO).mount ?? 0).toBe(0);
  });
});
