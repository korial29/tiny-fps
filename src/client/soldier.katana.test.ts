import { describe, expect, it } from 'vitest';
import { CUTS } from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { grip } from './gun';
import { BEHIND, axes } from './katana';
import { KATANA_LEFT } from './body';
import { STRIDE, add } from './mesh';
import { JOINT as J, solve, turn } from './rig';
import { animate, brandish, createRunner, soldier, stance } from './soldier';
import type { Runner } from './soldier';

const DT = 1 / 60;
const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 5,
  y: 1,
  z: -3,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});

/** Vertices of a model, as [x, y, z, layer, r, g, b] after the position and normal. */
const rows = (v: number[]) =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const k = i * STRIDE;
    return [v[k], v[k + 1], v[k + 2], v[k + 8], v[k + 6], v[k + 7], v[k + 9]];
  });

/** A runner that has held the state `o` for `n` frames, run along -z when it has a speed, ending at z = -3. */
const hold = (o: Partial<PlayerState>, n = 90) => {
  const book = new Map<number, Runner>();
  let p = man({ ...o, z: -3 - (o.vz ?? 0) * DT * (n - 1) });
  for (let i = 0; i < n; i++) {
    animate(book, [p], DT);
    p = man({ ...o, z: p.z + (o.vz ?? 0) * DT });
  }
  return book.get(1)!;
};

describe('a runner with the katana', () => {
  const GREEN = [0.1, 0.8, 0.2];
  const blade = (o: Partial<PlayerState> = {}) =>
    man({ wield: true, blade: true, cut: CUT.THRUST, swing: 0, ...o });
  /** The vertices of the katana's light: bright cyan, unlit. */
  const light = (v: number[]) => rows(v).filter(p => p[3] == -2 && p[5] > 1.5 && p[6] > p[4] * 2);
  /** The runner, drawn at frame i of a swing of `cut` from a standing start (swing 0 when `tick` is below 0). */
  const frames = (cut: number, o: Partial<PlayerState> = {}, lod = 1) => {
    const book = new Map<number, Runner>();
    for (let i = 0; i < 40; i++) {
      animate(book, [blade({ ...o, cut })], DT);
    }
    const out: number[][] = [];
    for (let i = 0; i < CUTS[cut].ticks; i++) {
      animate(book, [blade({ ...o, cut, swing: CUTS[cut].ticks - i })], DT);
      const v: number[] = [];
      soldier(v, book.get(1)!, GREEN, lod);
      out.push(v);
    }
    return { book, out };
  };
  /** The point of the blade: the light farthest from the runner's eye. */
  const tipOf = (v: number[], p: Partial<PlayerState> = {}) => {
    const eye = [p.x ?? 5, (p.y ?? 1) + 1.6, p.z ?? -3];
    return light(v).reduce((m, q) =>
      Math.hypot(q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]) >
      Math.hypot(m[0] - eye[0], m[1] - eye[1], m[2] - eye[2])
        ? q
        : m,
    );
  };
  const still = (o: Partial<PlayerState> = {}) => {
    const out: number[] = [];
    soldier(out, hold(blade(o), 60), GREEN, 1);
    return out;
  };

  it('carries the katana in the right hand instead of the gun, in the same triangles', () => {
    expect(light(still()).length).toBeGreaterThan(200);
    // With the gun in the bag as well, it is the same picture.
    expect(still({ ammo: 30 })).toEqual(still());
    expect(light(still({ wield: false }))).toHaveLength(0);
    // Down, nothing in the hand.
    expect(light(still({ down: 40 }))).toHaveLength(0);
    // Far away it is the cheaper model.
    const [near, far] = [1, 0].map(lod => {
      const out: number[] = [];
      soldier(out, hold(blade(), 60), GREEN, lod);
      return out.length;
    });
    expect(far).toBeLessThan(near * 0.6);
  });

  describe('in the middle guard (the user, 2026-11-10: stand like a samurai)', () => {
    const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    /** The angle between two directions, degrees. */
    const off = (a: number[], b: number[]) =>
      (Math.acos(Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b))) * 180) / Math.PI;
    /** The runner in the guard and his stance; `at` puts a point in his own frame: to his right, up from his feet, ahead. */
    const guard = (o: Partial<PlayerState> = {}) => {
      const r = hold(blade(o), 90);
      const { s } = stance(r);
      const [c, sn] = [Math.cos(r.p.yaw), Math.sin(r.p.yaw)];
      const at = (v: number[]) => {
        const [x, y, z] = sub(v, [r.p.x, r.p.y, r.p.z]);
        return [x * c - z * sn, y, -x * sn - z * c];
      };
      const hilt = grip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      const way = axes(s.rot[J.HAND_R])[2];
      return { s, at, hilt, way, dir: sub(at(add(hilt, way)), at(hilt)) };
    };

    it('stands with the right foot forward and the left heel off the floor, the feet a shoulder apart, the knees soft', () => {
      for (const yaw of [0, 2.2]) {
        const { s, at } = guard({ yaw });
        const [left, right] = [at(s.pos[J.FOOT_L]), at(s.pos[J.FOOT_R])];
        // Shoulder width: the shoulder joints are 38 cm apart.
        expect(right[0] - left[0]).toBeGreaterThan(0.28);
        expect(right[0] - left[0]).toBeLessThan(0.42);
        // About a foot's length ahead.
        expect(right[2] - left[2]).toBeGreaterThan(0.22);
        expect(right[2] - left[2]).toBeLessThan(0.35);
        // The left heel up on the ball of the foot, the toes of both on the floor.
        expect(left[1] - right[1]).toBeGreaterThan(0.025);
        expect(Math.abs(at(s.pos[J.TOE_L])[1] - at(s.pos[J.TOE_R])[1])).toBeLessThan(0.005);
        for (const j of [J.THIGH_L, J.THIGH_R]) {
          const knee = off(sub(s.pos[j], s.pos[j + 1]), sub(s.pos[j + 2], s.pos[j + 1]));
          expect(knee).toBeGreaterThan(130);
          expect(knee).toBeLessThan(165);
        }
      }
    });

    it('stands square and straight: the hips and the shoulders face the foe, the back upright', () => {
      const { s } = guard();
      for (const j of [J.PELVIS, J.CHEST]) {
        expect(off(turn(s.rot[j], [0, 0, -1]), [0, 0, -1])).toBeLessThan(8);
      }
      expect(off(turn(s.rot[J.CHEST], [0, 1, 0]), [0, 1, 0])).toBeLessThan(7);
      // The shoulders level and as far ahead as each other.
      const across = sub(s.pos[J.ARM_R], s.pos[J.ARM_L]);
      expect(Math.abs(across[1])).toBeLessThan(0.03);
      expect(Math.abs(across[2])).toBeLessThan(0.03);
    });

    it('holds the grip before the navel on the middle of the body, the right hand at the guard and the left at the pommel', () => {
      for (const vz of [0, -3, -6]) {
        const { s, at, hilt, way } = guard({ vz });
        const [x, y, z] = sub(at(hilt), at(s.pos[J.PELVIS]));
        expect(Math.abs(x)).toBeLessThan(0.06);
        // The navel is a hand over the hips' joint; a fist or two ahead of the belly, 13 cm ahead of the joint.
        expect(y).toBeGreaterThan(0.03);
        expect(y).toBeLessThan(0.2);
        expect(z).toBeGreaterThan(0.3);
        expect(z).toBeLessThan(0.48);
        // The left hand's hold, BEHIND the right's down the grip, toward the pommel.
        const q = s.rot[J.HAND_L];
        const [fing, back] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
        const left = s.pos[J.HAND_L].map(
          (v, i) => v + fing[i] * KATANA_LEFT[0] + back[i] * KATANA_LEFT[1],
        );
        expect(dot(sub(hilt, left), way)).toBeCloseTo(BEHIND, 2);
        // Both elbows bent and down.
        for (const j of [J.ARM_L, J.ARM_R]) {
          const elbow = off(sub(s.pos[j], s.pos[j + 1]), sub(s.pos[j + 2], s.pos[j + 1]));
          expect(elbow).toBeGreaterThan(90);
          expect(elbow).toBeLessThan(140);
          expect(s.pos[j + 1][1]).toBeLessThan(s.pos[j][1] - 0.1);
        }
      }
    });

    it("points the blade ahead and up at a foe's throat, running or standing", () => {
      for (const vz of [0, -3, -6, -9]) {
        const { at, hilt, dir } = guard({ vz });
        // Some 28 degrees over the level, along the way he faces.
        const rise = (Math.atan2(dir[1], Math.hypot(dir[0], dir[2])) * 180) / Math.PI;
        expect(rise).toBeGreaterThan(20);
        expect(rise).toBeLessThan(35);
        expect(Math.abs(Math.atan2(dir[0], dir[2]))).toBeLessThan(0.1);
        // The point between a throat and the eyes of a man his height, a blade's length ahead.
        const out: number[] = [];
        const r = hold(blade({ vz }), 90);
        soldier(out, r, GREEN, 1);
        const point = tipOf(out, r.p);
        expect(point[1] - r.p.y).toBeGreaterThan(1.35);
        expect(point[1] - r.p.y).toBeLessThan(1.7);
        expect(r.p.z - point[2]).toBeGreaterThan(at(hilt)[2] + 0.8);
      }
    });
  });

  it('twists the chest through a cut across, so the shoulders carry the arms', () => {
    const facing = (prog: number) => {
      const p = blade({ cut: CUT.LEFT, swing: 1 });
      const r = createRunner(p);
      const s = solve(brandish(r.gait.pose(), p, prog, 0));
      const f = turn(s.rot[J.CHEST], [0, 0, -1]);
      return Math.atan2(-f[0], -f[2]);
    };
    // From turned left over the wind-up to turned right in the follow-through: 75 degrees and more.
    expect(facing(0.24) - facing(0.6)).toBeGreaterThan(1.2);
  });

  it('holds the grip in both hands in the carry and all through every cut, standing or running', () => {
    /** How far the left hand's grip is from its place on the handle, BEHIND the right hand's. */
    const apart = (r: Runner) => {
      const s = solve(brandish(r.gait.pose(), r.p, r.prog, r.gait.phase));
      const [at, ax] = [grip(s.pos[J.HAND_R], s.rot[J.HAND_R]), axes(s.rot[J.HAND_R])];
      const [fing, back] = [turn(s.rot[J.HAND_L], [0, -1, 0]), turn(s.rot[J.HAND_L], [1, 0, 0])];
      return Math.hypot(
        ...[0, 1, 2].map(
          i =>
            s.pos[J.HAND_L][i] +
            fing[i] * KATANA_LEFT[0] +
            back[i] * KATANA_LEFT[1] -
            (at[i] - BEHIND * ax[2][i]),
        ),
      );
    };
    for (const cut of [0, 1, 2, 3]) {
      for (const vz of [0, -6, -9]) {
        const book = new Map<number, Runner>();
        let z = -3;
        for (let i = 0; i < 60; i++) {
          animate(book, [blade({ cut, vz, z: (z += vz * DT) })], DT);
        }
        expect(apart(book.get(1)!)).toBeLessThan(0.005);
        for (let i = 0; i < CUTS[cut].ticks; i++) {
          animate(book, [blade({ cut, vz, z: (z += vz * DT), swing: CUTS[cut].ticks - i })], DT);
          // Within 3 cm: the arms run out of reach for a few frames of a sprint's follow-through.
          expect(apart(book.get(1)!)).toBeLessThan(0.03);
        }
      }
    }
  });

  it.each([
    [CUT.THRUST, 'thrusts: the point goes out ahead of it, toward -z'],
    [CUT.LEFT, 'cuts from its left to its right, toward +x'],
    [CUT.RIGHT, 'cuts from its right to its left, toward -x'],
    [CUT.SLASH, 'slashes down from over its head'],
  ])('does cut %i with the arms: %s', (cut, _name) => {
    const { out } = frames(cut);
    const { ticks, strike } = CUTS[cut];
    /** The frame at the share `k` of the swing. */
    const tick = (k: number) => Math.round(k * ticks);
    const path = out.map(v => tipOf(v));
    // A big move: over a metre and a half of the point, readable from far away.
    const total = path
      .slice(1)
      .reduce((n, q, i) => n + Math.hypot(...q.map((c, k) => c - path[i][k])), 0);
    expect(total).toBeGreaterThan(2);
    // Where it is at the strike: ahead of the runner (z = -3, ahead is -z), around the height of the eyes.
    expect(path[strike][2]).toBeLessThan(-3 - 0.7);
    if (cut == CUT.THRUST) {
      expect(path[strike][2]).toBeLessThan(path[tick(0.3)][2] - 0.2);
    } else if (cut == CUT.SLASH) {
      // Raised over the head and behind it, then down to below the hips.
      expect(path[tick(0.28)][1]).toBeGreaterThan(path[strike][1] + 0.5);
      expect(path[tick(0.28)][2]).toBeGreaterThan(-3);
      expect(path[strike][1]).toBeGreaterThan(path[tick(0.55)][1] + 0.8);
    } else {
      const s = cut == CUT.LEFT ? 1 : -1;
      expect(s * path[strike + 3][0]).toBeGreaterThan(s * path[strike - 4][0] + 0.8);
      // The runner faces -z: its right is +x. Wound up high on one side, finished low on the other.
      expect(s * (path[tick(0.24)][0] - 5)).toBeLessThan(-0.3);
      expect(s * (path[tick(0.6)][0] - 5)).toBeGreaterThan(0.3);
      expect(path[tick(0.6)][1]).toBeLessThan(path[tick(0.24)][1] - 0.5);
    }
    // The cut starts from the guard and ends in it, with no jump: the point at a throat's height, ahead.
    for (const q of [path[0], path.at(-1)!]) {
      expect(q[1]).toBeGreaterThan(1 + 1.35);
      expect(q[1]).toBeLessThan(1 + 1.7);
      expect(q[2]).toBeLessThan(-3 - 1.1);
    }
    // It eases out of the guard and back into it: the point goes centimetres a frame there.
    const step = (i: number) => Math.hypot(...path.at(i)!.map((c, k) => c - path.at(i - 1)![k]));
    [1, 2].forEach(i => expect(step(i)).toBeLessThan(0.3));
    [-1, -2, -3, -4, -5, -6].forEach(i => expect(step(i)).toBeLessThan(0.2));
  });

  it('turns the trunk into the cut: the shoulders go with the blade', () => {
    /** How far the right shoulder is ahead of the left (it faces -z): the chest turned to its left when positive. */
    const turned = (cut: number, k: number) => {
      const book = new Map<number, Runner>();
      animate(book, [blade({ cut })], DT);
      animate(book, [blade({ cut, swing: Math.round(CUTS[cut].ticks * (1 - k)) })], DT);
      const r = book.get(1)!;
      const s = solve(brandish(r.gait.pose(), r.p, r.prog, r.gait.phase));
      return s.pos[J.ARM_L][2] - s.pos[J.ARM_R][2];
    };
    // Wound up to the left, then through to the right, and the other way from the right.
    expect(turned(CUT.LEFT, 0.22)).toBeGreaterThan(0.04);
    expect(turned(CUT.LEFT, 0.6)).toBeLessThan(-0.06);
    expect(turned(CUT.RIGHT, 0.22)).toBeLessThan(-0.04);
    expect(turned(CUT.RIGHT, 0.6)).toBeGreaterThan(0.06);
  });

  it('leaves a ribbon of light behind the blade through the cut only, which fades after it', () => {
    const book = new Map<number, Runner>();
    animate(book, [blade({ cut: CUT.LEFT })], DT);
    const r = book.get(1)!;
    const marks: number[] = [];
    for (let i = 0; i < CUTS[CUT.LEFT].ticks; i++) {
      animate(book, [blade({ cut: CUT.LEFT, swing: CUTS[CUT.LEFT].ticks - i })], DT);
      soldier([], r, GREEN, 1);
      marks.push(r.trail.count);
    }
    expect(marks[1]).toBe(0);
    expect(marks[12]).toBeGreaterThan(3);
    // The cut is over at 0.6 of the swing (tick 20): the ribbon fades in about 0.15 s, and is gone.
    expect(marks[20]).toBeGreaterThan(0);
    expect(marks[31]).toBe(0);
    // A runner with the gun never makes one.
    const gunner = new Map<number, Runner>();
    animate(gunner, [man({ ammo: 30, swing: 5, cut: CUT.LEFT })], DT);
    soldier([], gunner.get(1)!, GREEN, 1);
    expect(gunner.get(1)!.trail.count).toBe(0);
  });

  it('eases the swing between the snapshots: it runs on with the time, never far ahead of the count', () => {
    const book = new Map<number, Runner>();
    const t = CUTS[CUT.SLASH].ticks;
    animate(book, [blade({ cut: CUT.SLASH })], DT);
    expect(book.get(1)!.prog).toBe(-1);
    animate(book, [blade({ cut: CUT.SLASH, swing: t - 6 })], DT);
    const r = book.get(1)!;
    expect(r.prog).toBeCloseTo(6 / t, 6);
    // Snapshots every second tick, frames at 144 Hz: it moves on between them, stays within two ticks of the count.
    for (let i = 0; i < 10; i++) {
      animate(book, [blade({ cut: CUT.SLASH, swing: t - 6 })], 1 / 144);
      expect(r.prog).toBeLessThanOrEqual(8 / t + 1e-9);
    }
    expect(r.prog).toBeGreaterThan(6 / t);
    animate(book, [blade({ cut: CUT.SLASH, swing: 0 })], DT);
    expect(r.prog).toBe(-1);
  });

  it('keeps the vertices finite and the unit normals in every cut, move and level', () => {
    for (const cut of [0, 1, 2, 3]) {
      for (const o of [{}, { vz: -9 }, { yaw: 2.2, pitch: 0.6 }, { mode: MODE.SLIDE, vz: -8 }]) {
        for (const lod of [0, 1]) {
          const { out } = frames(cut, o, lod);
          for (const v of [out[3], out[10], out[20]]) {
            expect(v.length % (3 * STRIDE)).toBe(0);
            for (let i = 0; i < v.length; i += STRIDE) {
              expect(v.slice(i, i + STRIDE).every(Number.isFinite)).toBe(true);
              expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1);
            }
          }
        }
      }
    }
    // 32 frames of skinning: past vitest's 5 s on a busy CI runner.
  }, 30_000);
});
