import { describe, expect, it } from 'vitest';
import { box, land } from '../../test/slope';
import { KILLCAM, createKillCam, sees } from './killcam';
import type { Kill, KillCam } from './killcam';
import type { Vec3 } from './mesh';

const DT = 1 / 60;
const EYE: Vec3 = [0, 1.6, 0];
/** The xenomorph at the origin looking along -z (yaw 0), its prey a metre ahead. */
const PAIR: [Vec3, Vec3] = [
  [0, 0, 0],
  [0, 0, -1],
];
const run = (c: KillCam, pair: [Vec3, Vec3] | undefined, n: number, yaw = 0): Kill => {
  let s!: Kill;
  for (let i = 0; i < n; i++) {
    s = c.frame(pair, yaw, EYE, DT);
  }
  return s;
};
const pivot = (p: [Vec3, Vec3]): Vec3 => [
  (p[0][0] + p[1][0]) / 2,
  (p[0][1] + p[1][1]) / 2 + KILLCAM.UP,
  (p[0][2] + p[1][2]) / 2,
];
/** The point `at` looks at along yaw and pitch, d metres on. */
const ahead = (s: Kill, d: number): Vec3 => [
  s.at[0] - Math.sin(s.yaw) * Math.cos(s.pitch) * d,
  s.at[1] + Math.sin(s.pitch) * d,
  s.at[2] - Math.cos(s.yaw) * Math.cos(s.pitch) * d,
];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the glory kill camera', () => {
  it('stays in the eye with no kill', () => {
    const s = run(createKillCam(land()), undefined, 30);
    expect(s).toMatchObject({ at: EYE, k: 0 });
  });

  it('leaves the eye over BLEND for the side of the two, looking at them', () => {
    const c = createKillCam(land());
    const half = run(c, PAIR, Math.round(KILLCAM.BLEND / DT / 2));
    expect(half.k).toBeGreaterThan(0.3);
    expect(half.k).toBeLessThan(0.7);
    const s = run(c, PAIR, 30);
    expect(s.k).toBe(1);
    const p = pivot(PAIR);
    const d = dist(s.at, p);
    expect(d).toBeCloseTo(Math.hypot(KILLCAM.BACK, KILLCAM.RISE), 1);
    expect(dist(ahead(s, d), p)).toBeLessThan(1e-6);
    // Out to the side, a little behind the killer: neither in front nor straight behind.
    expect(Math.abs(s.at[0])).toBeGreaterThan(2);
    expect(s.at[1]).toBeGreaterThan(p[1]);
  });

  it('turns round the two over SPAN, then holds still', () => {
    const c = createKillCam(land());
    const a = run(c, PAIR, 1);
    const b = run(c, PAIR, Math.round(KILLCAM.SPAN / DT));
    const turn = Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
    expect(turn).toBeCloseTo(KILLCAM.SWEEP, 1);
    expect(run(c, PAIR, 30).yaw).toBeCloseTo(b.yaw, 6);
  });

  it('keeps its angle from the killer’s look at the start, whatever the look does after', () => {
    const c = createKillCam(land());
    const a = run(c, PAIR, Math.round(KILLCAM.SPAN / DT) + 10, 0);
    const b = run(c, PAIR, 10, 2);
    expect(b.yaw).toBeCloseTo(a.yaw, 6);
  });

  it('watches from the side with room, and stops short of a wall', () => {
    // A wall 2 m to the killer's right (+x): the camera goes left, or comes in front of the wall.
    const right = land(() => 0, [box([2, 0, -10], [3, 6, 10])]);
    const s = run(createKillCam(right), PAIR, 60);
    expect(s.at[0]).toBeLessThan(0);
    const left = land(() => 0, [box([-3, 0, -10], [-2, 6, 10])]);
    expect(run(createKillCam(left), PAIR, 60).at[0]).toBeGreaterThan(0);
    // Walls both sides: in front of one, PAD off it.
    const both = land(() => 0, [box([2, 0, -10], [3, 6, 10]), box([-3, 0, -10], [-2, 6, 10])]);
    const t = run(createKillCam(both), PAIR, 60);
    expect(Math.abs(t.at[0])).toBeLessThanOrEqual(2 - KILLCAM.PAD + 1e-3);
  });

  it('backs off as the katana’s foe flies away, keeping both in the shot', () => {
    const c = createKillCam(land());
    run(c, PAIR, 30);
    const far: [Vec3, Vec3] = [
      [0, 0, 0],
      [0, 0, -6],
    ];
    const s = run(c, far, 1);
    expect(dist(s.at, pivot(far))).toBeGreaterThan(6);
  });

  it('comes back to the eye over BLEND after the kill, and starts afresh on the next', () => {
    const c = createKillCam(land());
    run(c, PAIR, Math.round(KILLCAM.SPAN / DT));
    const back = run(c, undefined, Math.ceil(KILLCAM.BLEND / DT) + 1);
    expect(back).toMatchObject({ at: EYE, k: 0 });
    const first = run(createKillCam(land()), PAIR, 30);
    expect(run(c, PAIR, 30).yaw).toBeCloseTo(first.yaw, 6);
  });

  it('takes the xenomorph out of its vision: the prey in his own colours from halfway out', () => {
    expect([0, 0.49, 0.5, 1].map(k => sees(true, k))).toEqual([true, true, false, false]);
    expect(sees(false, 0)).toBe(false);
  });
});
