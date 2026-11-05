import { describe, expect, it } from 'vitest';
import { forward } from '../shared/physics';
import { JOINT, JOINTS, PARENT, REST, axis, mul, rest, slerp, solve, turn } from './rig';

describe('rig', () => {
  it('lists parents before children', () => {
    expect(PARENT).toHaveLength(JOINTS);
    expect(REST).toHaveLength(JOINTS);
    PARENT.forEach((up, j) => expect(up).toBeLessThan(j));
  });

  it('stands a 1.8 m runner on the floor in the rest pose', () => {
    const { pos } = solve(rest());
    expect(pos[JOINT.HEAD][1]).toBeGreaterThan(1.55);
    expect(pos[JOINT.HEAD][1]).toBeLessThan(1.7);
    for (const j of [JOINT.FOOT_L, JOINT.FOOT_R, JOINT.TOE_L, JOINT.TOE_R]) {
      expect(pos[j][1]).toBeGreaterThanOrEqual(0);
      expect(pos[j][1]).toBeLessThan(0.1);
    }
    // +x is the right side, the toes point along -z.
    expect(pos[JOINT.HAND_R][0]).toBeGreaterThan(0);
    expect(pos[JOINT.HAND_L][0]).toBeLessThan(0);
    expect(pos[JOINT.TOE_R][2]).toBeLessThan(pos[JOINT.FOOT_R][2]);
  });

  it('faces the yaw the way the physics does', () => {
    const yaw = 1.1;
    const { pos } = solve(rest([2, 0, 3], yaw));
    const [fx, fz] = forward(yaw);
    const toe = pos[JOINT.TOE_R];
    const foot = pos[JOINT.FOOT_R];
    const d = [toe[0] - foot[0], toe[2] - foot[2]];
    const n = Math.hypot(d[0], d[1]);
    expect(d[0] / n).toBeCloseTo(fx, 5);
    expect(d[1] / n).toBeCloseTo(fz, 5);
  });

  it('bends a child with its parent', () => {
    const p = rest();
    p.rot[JOINT.THIGH_R] = axis([1, 0, 0], Math.PI / 2);
    const { pos } = solve(p);
    // The thigh lifted forward: the knee is ahead of the hip, at its height.
    expect(pos[JOINT.SHIN_R][2]).toBeLessThan(pos[JOINT.THIGH_R][2] - 0.4);
    expect(pos[JOINT.SHIN_R][1]).toBeCloseTo(pos[JOINT.THIGH_R][1], 5);
  });

  it('composes, turns and blends rotations', () => {
    const a = axis([0, 1, 0], 0.4);
    const b = axis([0, 1, 0], 0.6);
    const v = turn(mul(a, b), [1, 0, 0]);
    const w = turn(axis([0, 1, 0], 1), [1, 0, 0]);
    v.forEach((x, i) => expect(x).toBeCloseTo(w[i], 6));
    const h = slerp(a, b, 0.5);
    turn(h, [1, 0, 0]).forEach((x, i) =>
      expect(x).toBeCloseTo(turn(axis([0, 1, 0], 0.5), [1, 0, 0])[i], 6),
    );
  });
});
