import { describe, expect, it } from 'vitest';
import { ROLE } from '../shared/kit';
import { STILL } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { MOVE, MOVES, createGait } from './gait';
import { JOINT as J, JOINTS, rest, solve, turn } from './rig';
import { KIND } from './features';
import { REGION, beast, body, skin } from './skin';
import { animate, createRunner, stance } from './soldier';
import {
  FOOT_TIP,
  HEAD,
  HOOKED,
  backOf,
  elbow,
  eyes,
  heel,
  lashOf,
  metatarsal,
  ribs,
  sinews,
  skull,
  tail,
  teeth,
  toes,
} from './xeno';
import type { Lash } from './xeno';
import { STING, TAILS } from '../shared/constants';
import type { Vec3 } from './mesh';
import type { Quat } from './rig';

const ID: Quat = [0, 0, 0, 1];
const O: Vec3 = [0, 0, 0];
const at = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
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
/** The vertices (x, y, z) of a list of STRIDE floats. */
const points = (v: number[]) =>
  Array.from({ length: v.length / 10 }, (_, i) => v.slice(i * 10, i * 10 + 3));

describe('the xenomorph’s skin', () => {
  it('is built at every level on the rig’s joints, with no human head, and fewer vertices than the man close up', () => {
    for (const lod of [0, 1, 2, 3]) {
      const s = beast(lod);
      expect(s.v.every(Number.isFinite)).toBe(true);
      expect(Math.max(...s.j)).toBeLessThan(JOINTS + 2);
      expect([...s.g].includes(KIND.HEAD)).toBe(false);
      expect(s.m).toEqual([]);
      expect(s.t.length % 3).toBe(0);
    }
    // Detailed close up (the user, 2026-11-15: more polygons), still under the man.
    // Its own surface, not the spine and pipes baked in with it.
    expect(beast(3).v.length - backOf(3).baked.v.length).toBeLessThan(body(3).v.length * 0.75);
  });

  it('carries a long curved dome past the back of the head, and none on the own first-person body', () => {
    const zs = (lod: number) => {
      const s = beast(lod);
      return Array.from({ length: s.v.length / 6 }, (_, i) => s.v.slice(i * 6, i * 6 + 3));
    };
    const head = zs(3).filter(([, y]) => y > 1.58);
    expect(Math.max(...head.map(p => p[2]))).toBeGreaterThan(0.3);
    // Its dome stops at the brow: the face in front is skull()'s.
    expect(Math.min(...head.map(p => p[2]))).toBeLessThan(-0.05);
    expect(Math.max(...zs(2).map(p => p[1]))).toBeLessThan(1.5);
  });
});

describe('its pieces', () => {
  const S = solve(rest());
  it('runs one chain of vertebrae from the base of the skull down the back into the tail, which the sting arches over the head', () => {
    const draw = (lash: Lash) => {
      const v: number[] = [];
      tail(v, S, 0, 0, lash, [1, 0, 0], 3);
      expect(v.every(Number.isFinite)).toBe(true);
      return points(v);
    };
    const { ticks, strike: at } = TAILS[STING.LASH];
    const [still, strike] = [
      draw(HOOKED),
      draw(lashOf({ cut: STING.LASH, swing: ticks - at, down: 0 })),
    ];
    // The back's half is the skin's (backOf()), at rest here: up to the skull's base, behind the
    // head joint; down the back, behind the chest.
    const s = beast(3);
    const back = Array.from({ length: s.v.length / 6 }, (_, i) => s.v.slice(i * 6, i * 6 + 3));
    expect(back.some(([x, y, z]) => Math.abs(x) < 0.03 && y > 1.6 && z > 0.08)).toBe(true);
    expect(back.some(([, y, z]) => Math.abs(y - S.pos[J.CHEST][1]) < 0.05 && z > 0.12)).toBe(true);
    // The stinger's point is the last vertex: behind at rest, hooked up; a lash brings it over the
    // head and down in front of it.
    const [rest0, hit] = [still.at(-1)!, strike.at(-1)!];
    expect(rest0[2]).toBeGreaterThan(1);
    expect(rest0[1]).toBeGreaterThan(S.pos[J.PELVIS][1]);
    expect(hit[2]).toBeLessThan(-0.3);
    expect(Math.max(...strike.map(p => p[1]))).toBeGreaterThan(1.8);
    // Pinched at each joint: the vertebrae are beads, not a smooth tube.
    expect(still.length).toBeGreaterThan((34 - backOf(3).n) * 6 * 12 * 6);
    // The pipes up the neck are the skin's too, in their own colour; none far.
    const pipes = (lod: number) => [...beast(lod).c].filter(c => c == REGION.STRIPE).length;
    expect(pipes(1)).toBeGreaterThan(0);
    expect(pipes(0)).toBe(0);
  });

  it('goes on from the skin’s spine into the tail with no crack, however the body bends', () => {
    const book = new Map();
    const p = at({ vx: 6, mode: MODE.GROUND });
    for (let k = 0; k < 40; k++) {
      animate(
        book,
        [p],
        1 / 60,
        undefined,
        undefined,
        undefined,
        undefined,
        new Map([[1, { role: ROLE.XENO }]]),
      );
    }
    const { s } = stance(book.get(1));
    for (const lod of [0, 1, 3]) {
      const sk: number[] = [];
      skin(
        sk,
        beast(lod),
        s,
        Array.from({ length: 32 }, () => [0, 0, 0]),
      );
      const t: number[] = [];
      tail(t, s, 0.3, 0.7, [0.4, 0, 0, 0.1, 0.5, 0], [1, 0, 0], lod);
      // The tail's first triangles stand on the ring the skin's last bead ends on.
      const first = points(t).slice(0, 6);
      const posed = points(sk);
      for (const q of first) {
        const d = Math.min(...posed.map(v => Math.hypot(v[0] - q[0], v[1] - q[1], v[2] - q[2])));
        if (d > 1e-5) {
          // Not on the joint's ring: on the next one, a vertebra's length on.
          expect(d).toBeGreaterThan(0.004);
        }
      }
      expect(
        first.filter(q => posed.some(v => Math.hypot(v[0] - q[0], v[1] - q[1], v[2] - q[2]) < 1e-5))
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it('puts three clawed toes ahead of each foot, tendons and spurs, a rib cage round the chest and glowing eyes on the head', () => {
    const out = (f: (o: number[]) => void) => {
      const v: number[] = [];
      f(v);
      return points(v);
    };
    const t = out(o => toes(o, O, ID, 1));
    expect(Math.min(...t.map(p => p[2]))).toBeLessThan(-0.18);
    expect(t.every(p => p[1] > -0.04)).toBe(true);
    expect(out(o => sinews(o, O, ID, 1)).every(p => p[1] < -0.05)).toBe(true);
    // The foot's long bone reaches FOOT_TIP, past the rig's foot (0.137 m).
    expect(Math.min(...out(o => metatarsal(o, O, ID, 1)).map(p => p[2]))).toBeLessThan(
      FOOT_TIP[2] + 0.03,
    );
    expect(-FOOT_TIP[2]).toBeGreaterThan(0.2);
    // The ribs round the chest's sides and front, the spurs out of the backs of the joints.
    const r = out(o => ribs(o, O, ID, 1));
    expect(Math.min(...r.map(p => p[2]))).toBeLessThan(-0.14);
    expect(Math.max(...r.map(p => Math.abs(p[0])))).toBeGreaterThan(0.15);
    expect(Math.max(...out(o => elbow(o, O, ID, 1)).map(p => p[2]))).toBeGreaterThan(0.1);
    expect(Math.max(...out(o => heel(o, O, ID, 1)).map(p => p[2]))).toBeGreaterThan(0.1);
    // A human skull's face in front, in the dome's colour, the mouth dark between steel teeth,
    // tendons in a lighter chitin beside it.
    const sk: number[] = [];
    skull(sk, O, ID, 3);
    teeth(sk, O, ID, 3);
    const f = points(sk);
    expect(Math.min(...f.map(p => p[2]))).toBeLessThan(-0.11);
    const reds = new Set(Array.from({ length: sk.length / 10 }, (_, i) => sk[i * 10 + 6]));
    expect([...reds].sort((a, b) => a - b)).toEqual([0.02, HEAD[0], HEAD[0] * 1.45, 0.66]);
    const lit: number[] = [];
    eyes(lit, O, ID, [1, 0, 0]);
    expect(lit.filter((_, i) => i % 10 == 8).every(l => l == -2)).toBe(true);
  });
});

describe('its pose', () => {
  it('stands on its toes: the knee ahead, the ankle a foot’s length over the ball, the toes on the floor ahead', () => {
    const run = (role: number) => {
      const book = new Map();
      const p = at();
      for (let k = 0; k < 60; k++) {
        animate(
          book,
          [p],
          1 / 60,
          undefined,
          undefined,
          undefined,
          undefined,
          new Map([[1, { role }]]),
        );
      }
      return stance(book.get(1)).s;
    };
    const [xs, ms] = [run(ROLE.XENO), run(ROLE.MARINE)];
    const [x, m] = [xs.pos, ms.pos];
    // The end of its long foot (FOOT_TIP), on the floor.
    const tip = turn(xs.rot[J.FOOT_R], FOOT_TIP).map((v, i) => v + x[J.FOOT_R][i]);
    // Forward is -z.
    expect(x[J.SHIN_R][2]).toBeLessThan(x[J.FOOT_R][2]);
    // The foot's long bone near upright: the ankle a foot's length over the ball.
    expect(x[J.FOOT_R][1] - tip[1]).toBeGreaterThan(0.18);
    expect(tip[1]).toBeLessThan(0.06);
    expect(tip[2]).toBeLessThan(x[J.FOOT_R][2]);
    // Longer legs: the hips no lower than the man's.
    expect(x[J.PELVIS][1]).toBeGreaterThan(m[J.PELVIS][1]);
  });

  it('faces the wall it clings to, the hands up on it and the feet under them', () => {
    expect(MOVES[MOVE.CLING]).toHaveLength(MOVES[MOVE.HANG].length);
    const g = createGait(0);
    // Looking away along x, on a wall toward -z (SIDE 4).
    const p = at({ yaw: Math.PI / 2, mode: MODE.CLING, wall: 4, vy: 2, ground: false });
    for (let k = 0; k < 90; k++) {
      g.update(p, 1 / 60);
    }
    const pose = g.pose();
    expect(Math.abs(Math.sin(pose.yaw))).toBeLessThan(0.1);
    const s = solve(pose);
    for (const h of [J.HAND_L, J.HAND_R]) {
      expect(s.pos[h][1]).toBeGreaterThan(s.pos[J.CHEST][1]);
      expect(s.pos[h][2]).toBeLessThan(-0.2);
    }
    for (const f of [J.FOOT_L, J.FOOT_R]) {
      expect(s.pos[f][1]).toBeLessThan(s.pos[J.PELVIS][1] - 0.3);
    }
  });
});

describe('its blows on the arms', () => {
  it('swipes the left claws with the left arm and the right with the right, the tail with neither', async () => {
    const { BLOW, STING } = await import('../shared/constants');
    const { SIDE, TAIL_BLOW, blowOf, thrown } = await import('./gait');
    expect([SIDE[BLOW.CLAW_L], SIDE[BLOW.CLAW_R], SIDE[TAIL_BLOW]]).toEqual([-1, 1, 0]);
    // A tail's strike shares its cut with a fist's blow: the xenomorph's is the tail's.
    const p = { ...at({}), ammo: -1, swing: 12, cut: STING.STAB };
    expect([blowOf(p), blowOf(p, true)]).toEqual([BLOW.JAB, TAIL_BLOW]);
    expect(thrown(p)).toBeGreaterThan(0);
    expect(thrown(p, true)).toBe(0);
  });
});

describe('its claws', () => {
  it('ends each finger and the thumb in a claw reaching past the bare hand’s fingertips, with no glove’s parts', async () => {
    const { hand } = await import('./body');
    const draw = (claws: boolean) => {
      const v: number[] = [];
      // At the origin, fingers along -y, half open.
      hand(
        v,
        [0, 0, 0],
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, -1],
        0.35,
        [0, 0, 0],
        0,
        0,
        undefined,
        [0, 0, 0],
        0,
        false,
        false,
        claws,
      );
      return points(v);
    };
    const [plain, clawed] = [draw(false), draw(true)];
    // Hooked toward the palm from the fingertips: past the bare hand on its palm's side (-x here).
    const reach = (ps: number[][]) => Math.min(...ps.map(p => p[0]));
    expect(reach(clawed)).toBeLessThan(reach(plain) - 0.01);
  });
});

describe('its face on the HUD', () => {
  it('has a head of its own in every frame, its eyes glowing but dead, and acid for its worst wounds', async () => {
    const { DEAD, FRAMES, LOOK, PALETTE, frame, sprite } = await import('./face');
    const has = (n: number, c: number) => sprite(n, LOOK.XENO).includes(PALETTE.indexOf(c));
    const [EYE, ACID] = [0xff3246ff, 0xff28e696];
    for (let n = 0; n < FRAMES; n++) {
      expect(sprite(n, LOOK.XENO)).not.toEqual(sprite(n, LOOK.MAN));
    }
    expect(has(frame(0, 0), EYE)).toBe(true);
    expect(has(DEAD, EYE)).toBe(false);
    expect(has(frame(0, 0), ACID)).toBe(false);
    expect(has(frame(4, 0), ACID)).toBe(true);
  });
});

describe('its picture in the menu', () => {
  it('threatens: the claws brought forward ahead of the chest, the head pushed forward', () => {
    const pose = (menace: boolean) => {
      const r = createRunner(at(), undefined, 0, { role: ROLE.XENO }, true);
      r.menace = menace;
      return stance(r).s.pos;
    };
    const [calm, mean] = [pose(false), pose(true)];
    // Forward is -z.
    for (const h of [J.HAND_L, J.HAND_R]) {
      expect(mean[h][2]).toBeLessThan(calm[h][2] - 0.15);
      expect(mean[h][2]).toBeLessThan(mean[J.CHEST][2]);
    }
    expect(mean[J.HEAD][2]).toBeLessThan(calm[J.HEAD][2]);
  });
});
