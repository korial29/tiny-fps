import { describe, expect, it } from 'vitest';
import { CUTS, EXEC, GLORY_DASH, GLORY_TICKS } from '../shared/constants';
import { ROLE } from '../shared/kit';
import { STILL } from '../shared/physics';
import { CUT, LIMB } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { BITE } from './body';
import {
  EXECUTE,
  FEAST,
  chew,
  clutched,
  eating,
  kneel,
  kneeling,
  mounted,
  seize,
  spun,
  topple,
  toppled,
} from './feast';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
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

  it('turns it to him, up on him a little, its feet on the front of his thighs', () => {
    const p = xeno();
    const q = seize(p, PREY, 1);
    // Facing him: forward(yaw) is (-sin yaw, -cos yaw), and he is along -z.
    expect(Math.sin(q.yaw)).toBeCloseTo(0, 6);
    expect(Math.cos(q.yaw)).toBeCloseTo(1, 6);
    const s = solve(q);
    const pelvis = s.pos[J.PELVIS];
    expect(Math.hypot(pelvis[0] - PREY[0], pelvis[2] - PREY[2])).toBeCloseTo(FEAST.CLING, 6);
    expect(pelvis[2]).toBeGreaterThan(PREY[2]);
    expect(pelvis[1]).toBeGreaterThan(solve(p).pos[J.PELVIS][1] + FEAST.LIFT - 0.05);
    const [fx, ft, fy] = FEAST.FEET;
    expect(dist(s.pos[J.FOOT_L], [-fx, fy, -1 + ft])).toBeLessThan(0.02);
    expect(dist(s.pos[J.FOOT_R], [fx, fy, -1 + ft])).toBeLessThan(0.02);
    // Its knees bent as a knee bends: forward, toward him, ahead of the line from its hip to its foot.
    for (const [hip, knee, foot] of [
      [J.THIGH_L, J.SHIN_L, J.FOOT_L],
      [J.THIGH_R, J.SHIN_R, J.FOOT_R],
    ]) {
      const mid = [0, 1, 2].map(i => (s.pos[hip][i] + s.pos[foot][i]) / 2);
      expect(s.pos[knee][2]).toBeLessThan(mid[2]);
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

describe('his panic', () => {
  it('throws his head about every way, his feet where they stand', () => {
    const p = rest([0, 0, -1], 0);
    const at = (t: number) => solve(clutched(p, [0, 0, 0], 1, t));
    const a = at(0);
    const ts = Array.from({ length: 60 }, (_, i) => i / 30);
    const looks = ts.map(t => {
      const s = at(t);
      const q = s.rot[J.HEAD];
      // Where the top of his head points, from his neck.
      return [2 * (q[0] * q[1] + q[3] * q[2]), 2 * (q[1] * q[2] - q[3] * q[0])];
    });
    // Side to side and back and forth, well apart on each.
    for (const k of [0, 1]) {
      const v = looks.map(l => l[k]);
      expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(0.3);
    }
    // His feet stay where they stand however he fights.
    for (const t of ts) {
      const s = at(t);
      for (const j of [J.FOOT_L, J.FOOT_R]) {
        expect(dist(s.pos[j], a.pos[j])).toBeLessThan(0.01);
      }
    }
  });

  it('fights it with his body: his chest twists and his hands shove, and he jerks back as it seizes him', () => {
    const p = rest([0, 0, -1], 0);
    const ts = Array.from({ length: 60 }, (_, i) => i / 30);
    const chest = ts.map(t => solve(clutched(p, [0, 0, 0], 1, t)).pos[J.ARM_R][2]);
    expect(Math.max(...chest) - Math.min(...chest)).toBeGreaterThan(0.05);
    const hand = ts.map(t => solve(clutched(p, [0, 0, 0], 1, t)).pos[J.HAND_R][2]);
    expect(Math.max(...hand) - Math.min(...hand)).toBeGreaterThan(0.04);
    // Halfway through its lunge his head is further back than the bend alone would put it (he faces it already).
    const facing = rest([0, 0, -1], Math.PI);
    const head = (m: number) => solve(clutched(facing, [0, 0, 0], m, 0)).pos[J.NECK][2];
    expect(head(0.5)).toBeLessThan(head(0) + (head(1) - head(0)) / 2 - 0.03);
  });
});

describe('its eating', () => {
  it('starts with its strike, and fades as it lets go of him', () => {
    expect(eating(GLORY_TICKS - BITE[1] + 1, 1)).toBe(0);
    expect(eating(GLORY_TICKS - BITE[1], 1)).toBe(1);
    expect(eating(1, 1)).toBe(1);
    expect(eating(0, 0.4)).toBe(0.4);
    expect(eating(0, 0)).toBe(0);
  });

  it('shakes its head left and right, CHEW[1] times a second, not up and down', () => {
    const p = xeno();
    expect(chew(p, 0, 1)).toBe(p);
    // Where its head looks: left and right, not up and down.
    const look = (t: number) => turn(solve(chew(p, 1, t)).rot[J.HEAD], [0, 0, -1]);
    const ts = Array.from({ length: 40 }, (_, i) => i / 120);
    const [xs, ys] = [0, 1].map(k => ts.map(t => look(t)[k]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.05);
    const tip = (t: number) => look(t)[0];
    // Back where it was a full shake later.
    expect(tip(0.1 + 1 / FEAST.CHEW[1])).toBeCloseTo(tip(0.1), 6);
    expect(Math.abs(tip(0.1 + 0.5 / FEAST.CHEW[1]) - tip(0.1))).toBeGreaterThan(0.1);
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
  let drops = 0;
  let bursts = 0;
  const tracer = {
    shock() {},
    spit() {},
    gore(_: Vec3, n: number) {
      drops += n;
      bursts += +(n >= FEAST.GORE[1]);
    },
  };
  const frames = (book: Map<number, Runner>, ps: PlayerState[], n: number) => {
    for (let k = 0; k < n; k++) {
      animate(book, ps, 1 / 60, undefined, tracer, undefined, undefined, looks);
    }
  };

  it('puts the xenomorph up on its prey while locked, then lets go of him over DROP', () => {
    const book = new Map();
    const free = [state(XENO, {}), state(PREY_ID, { z: -1, yaw: Math.PI })];
    frames(book, free, 2);
    const low = stance(book.get(XENO)).s.pos[J.PELVIS][1];
    const locked = [
      state(XENO, { lock: 30, foe: PREY_ID }),
      state(PREY_ID, { z: -1, yaw: Math.PI, lock: 30, foe: XENO }),
    ];
    frames(book, locked, 2);
    // Locked before its strike: no blood yet.
    expect(drops).toBe(0);
    expect(book.get(XENO).mount).toBe(1);
    expect(book.get(PREY_ID).mount).toBe(1);
    const on = stance(book.get(XENO)).s;
    // Up on him: its claws over his shoulders, its head over his.
    const [cx, ct, cy] = FEAST.CLAWS;
    expect(dist(on.pos[J.HAND_L], [-cx, cy, -1 + ct])).toBeLessThan(0.02);
    expect(dist(on.pos[J.HAND_R], [cx, cy, -1 + ct])).toBeLessThan(0.02);
    const his = stance(book.get(PREY_ID)).s.pos[J.HEAD];
    expect(on.pos[J.HEAD][1]).toBeGreaterThan(his[1] + 0.2);
    expect(Math.hypot(on.pos[J.HEAD][0] - his[0], on.pos[J.HEAD][2] - his[2])).toBeLessThan(0.4);
    // Its bite: his blood spurts from his head, some FEAST.GORE[0] drops a second.
    const biting = locked.map(q => ({ ...q, lock: 3 }));
    frames(book, biting, 60);
    expect(drops).toBeGreaterThan(FEAST.GORE[0] * 0.9);
    expect(drops).toBeLessThan(FEAST.GORE[0] * 1.1);
    expect(bursts).toBe(0);
    // The kill: both free, he goes down; it is still on him a moment, then off.
    const after = [state(XENO, {}), state(PREY_ID, { z: -1, yaw: Math.PI, down: 100 })];
    frames(book, after, Math.round((FEAST.DROP / 2) * 60));
    // A burst as his head goes.
    expect(bursts).toBe(1);
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

describe('the katana’s execution drawn', () => {
  const at = (e: number) => EXEC.TICKS - e;

  it('puts him on his knees on the strike of the cut down, and spins the swordsman a whole turn into the cut across', () => {
    expect(EXECUTE.KNEEL[0]).toBe(EXEC.CUTS[0] + CUTS[CUT.SLASH].strike);
    expect(kneeling(at(EXECUTE.KNEEL[0]))).toBe(0);
    expect(kneeling(at(EXECUTE.KNEEL[0] + EXECUTE.KNEEL[1]))).toBe(1);
    expect(kneeling(1)).toBe(1);
    expect(spun(at(EXEC.CUTS[1]))).toBe(0);
    // The cut across strikes on the lock's last tick, facing him again after a whole turn.
    expect(EXEC.CUTS[1] + CUTS[CUT.RIGHT].strike).toBe(EXEC.TICKS - 1);
    expect(spun(1)).toBeCloseTo(2 * Math.PI, 6);
    expect(spun(at(EXEC.CUTS[1] + 6))).toBeGreaterThan(Math.PI / 2);
  });

  it('drops him on his right knee, his left foot ahead, bent over with his hands on his belly', () => {
    // He looks away from the swordsman at +z.
    const p = rest([0, 0, -1], 0);
    const stood = solve(p);
    const up = kneel(p, [0, 0, 0], at(EXECUTE.TURN));
    expect(Math.cos(up.yaw)).toBeCloseTo(-1, 6);
    expect(solve(up).pos[J.PELVIS][1]).toBeCloseTo(stood.pos[J.PELVIS][1], 6);
    const s = solve(kneel(p, [0, 0, 0], 1));
    expect(s.pos[J.PELVIS][1]).toBeCloseTo(stood.pos[J.PELVIS][1] - EXECUTE.LOW, 6);
    // Facing +z: the right knee down on the floor ahead of its foot, the left foot planted ahead
    // of its hip and its knee up.
    expect(s.pos[J.SHIN_R][1]).toBeLessThan(0.2);
    expect(s.pos[J.SHIN_R][2]).toBeGreaterThan(s.pos[J.FOOT_R][2] + 0.2);
    expect(s.pos[J.FOOT_L][1]).toBeCloseTo(0.1, 2);
    expect(s.pos[J.FOOT_L][2]).toBeGreaterThan(s.pos[J.THIGH_L][2] + EXECUTE.STEP - 0.05);
    expect(s.pos[J.SHIN_L][1]).toBeGreaterThan(0.4);
    // Bent over: his head ahead of his pelvis; his hands on his belly.
    expect(s.pos[J.HEAD][2]).toBeGreaterThan(s.pos[J.PELVIS][2] + 0.1);
    // Facing +z, his right is -x.
    const [across, fore, up_] = EXECUTE.BELLY;
    const pelvis = s.pos[J.PELVIS];
    expect(
      dist(s.pos[J.HAND_L], [pelvis[0] + across, pelvis[1] + up_, pelvis[2] + fore]),
    ).toBeLessThan(0.03);
    expect(
      dist(s.pos[J.HAND_R], [pelvis[0] - across, pelvis[1] + up_, pelvis[2] + fore]),
    ).toBeLessThan(0.03);
  });

  it('pants, and shakes his head no', () => {
    const p = rest([0, 0, -1], 0);
    const ts = Array.from({ length: 60 }, (_, i) => i / 60);
    const look = (t: number) => turn(solve(kneel(p, [0, 0, 0], 1, t)).rot[J.HEAD], [0, 0, -1])[0];
    const chest = (t: number) => solve(kneel(p, [0, 0, 0], 1, t)).pos[J.NECK][1];
    const [l, c] = [ts.map(look), ts.map(chest)];
    // Side to side, both ways.
    expect(Math.min(...l)).toBeLessThan(-0.2);
    expect(Math.max(...l)).toBeGreaterThan(0.2);
    // The chest heaves: up and down, a few centimetres.
    expect(Math.max(...c) - Math.min(...c)).toBeGreaterThan(0.02);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThan(0.15);
  });

  it('draws the two through animate() and stance(): him kneeling, the blood, his head off from where it was drawn', () => {
    const [K, V] = [1, 2];
    const looks = new Map([
      [K, { role: ROLE.NINJA }],
      [V, { role: ROLE.MARINE }],
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
    const gores: [Vec3, number][] = [];
    let shocks = 0;
    const tracer = {
      shock: () => shocks++,
      spit() {},
      gore: (p: Vec3, n: number) => gores.push([p, n]),
    };
    const book = new Map<number, Runner>();
    const frame = (lock: number, over: Partial<PlayerState> = {}) =>
      animate(
        book,
        [
          state(K, {
            z: 0.3,
            blade: true,
            wield: true,
            lock,
            foe: V,
            exec: lock ? EXEC.KILLER : 0,
          }),
          state(V, { z: -1, yaw: Math.PI, lock, foe: K, exec: lock ? EXEC.VICTIM : 0, ...over }),
        ],
        1 / 60,
        undefined,
        tracer,
        undefined,
        undefined,
        looks,
      );
    const stood = (frame(at(1)), stance(book.get(V)!).s);
    for (let e = 2; e < EXEC.TICKS; e++) {
      frame(at(e));
    }
    const s = stance(book.get(V)!).s;
    // Down on his knee: the floor (footing()) holds him up a little.
    expect(s.pos[J.PELVIS][1]).toBeLessThan(stood.pos[J.PELVIS][1] - EXECUTE.LOW + 0.07);
    // The cut down: one spurt and a shock.
    expect(gores).toEqual([[[0, 1.25, -1], EXECUTE.WOUND]]);
    expect(shocks).toBe(1);
    // His weapon hand is not held up: he is busy dying.
    expect(stance(book.get(V)!).s.pos[J.HAND_R][1]).toBeLessThan(1.4);
    // The kill: his head goes from the kneeling head, with a burst, then blood from the neck.
    book.get(V)!.s = s;
    frame(0, { down: 100, lost: LIMB.HEAD });
    expect(gores[1]).toEqual([[0, 1.05, -1], EXECUTE.NECK]);
    // The head leaves from where it was drawn, low on his knees, not from a standing pose.
    const cut = book.get(V)!.cut!;
    expect(cut.c[1]).toBeCloseTo(s.pos[J.HEAD][1] + 0.1, 0);
    expect(cut.c[1]).toBeLessThan(stood.pos[J.HEAD][1] - 0.3);
    for (let k = 0; k < 30; k++) {
      frame(0, { down: 100, lost: LIMB.HEAD });
    }
    expect(gores.length).toBeGreaterThan(10);
    expect(book.get(V)!.bleed).toBeLessThan(EXECUTE.BLEEDING);
  });
});

describe('the beheaded victim', () => {
  const knelt = () => kneel(rest([0, 0, -1], 0), [0, 0, 0], 1);

  it('tips over from his knee, faster as he goes, a little bounce on the floor, then still', () => {
    const [T, A] = EXECUTE.FALL;
    expect(toppled(0)).toBe(0);
    expect(toppled(T / 2)).toBeCloseTo(A / 4, 6);
    expect(toppled(T)).toBeCloseTo(A, 6);
    expect(Math.max(...[0.05, 0.1, 0.15].map(d => toppled(T + d)))).toBeGreaterThan(A);
    expect(toppled(T + 3)).toBeCloseTo(A, 3);
  });

  it('starts where he knelt, and goes over onto his right side about his right knee', () => {
    const p = knelt();
    const [a, b] = [solve(p), solve(topple(p, 0))];
    a.pos.forEach((v, j) => expect(dist(v, b.pos[j])).toBeLessThan(1e-9));
    const down = solve(topple(p, 3));
    // His right knee stays where it was on the floor; he faces +z, so his right is -x.
    expect(dist(down.pos[J.SHIN_R], a.pos[J.SHIN_R])).toBeLessThan(1e-6);
    expect(down.pos[J.CHEST][0]).toBeLessThan(a.pos[J.CHEST][0] - 0.4);
    expect(down.pos[J.CHEST][1]).toBeLessThan(0.5);
  });

  it('goes limp: the raised leg stretches out, the arms fall along the body', () => {
    const [a, s] = [solve(knelt()), solve(topple(knelt(), 3))];
    const reach = (x: ReturnType<typeof solve>, j: number, k: number) => dist(x.pos[j], x.pos[k]);
    expect(reach(s, J.THIGH_L, J.FOOT_L)).toBeGreaterThan(reach(a, J.THIGH_L, J.FOOT_L) + 0.15);
    // The hands off the belly, out at the end of arms nearly straight.
    for (const [arm, hand] of [
      [J.ARM_L, J.HAND_L],
      [J.ARM_R, J.HAND_R],
    ]) {
      expect(reach(s, arm, hand)).toBeGreaterThan(0.5);
      expect(reach(a, arm, hand)).toBeLessThan(0.45);
    }
  });
});
