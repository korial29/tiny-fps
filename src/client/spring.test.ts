import { describe, expect, it } from 'vitest';
import { damp } from './spring';

describe('damp', () => {
  const settle = (dt: number, secs: number, w = 10) => {
    const s = [0, 0];
    const path: number[] = [];
    for (let t = 0; t < secs; t += dt) {
      path.push(damp(s, 0, 1, w, dt));
    }
    return path;
  };

  it('reaches the target without overshooting it', () => {
    const path = settle(1 / 60, 2);
    expect(Math.max(...path)).toBeLessThanOrEqual(1);
    expect(path[path.length - 1]).toBeCloseTo(1, 6);
    // Monotonic from rest.
    path.forEach((v, i) => i && expect(v).toBeGreaterThanOrEqual(path[i - 1]));
  });

  it('starts without a jump: its speed begins at zero', () => {
    const [first] = settle(1 / 240, 1);
    expect(first).toBeLessThan(1e-3);
  });

  it('gives the same answer in one step or many', () => {
    const a = [0, 0];
    const b = [0, 0];
    damp(a, 0, 1, 12, 0.3);
    for (let i = 0; i < 30; i++) {
      damp(b, 0, 1, 12, 0.01);
    }
    expect(a[0]).toBeCloseTo(b[0], 9);
    expect(a[1]).toBeCloseTo(b[1], 9);
  });

  it('stays put on its target and holds the speed it was given', () => {
    const s = [1, 0];
    expect(damp(s, 0, 1, 10, 1 / 60)).toBe(1);
    const moving = [0, 2];
    damp(moving, 0, 0, 10, 1 / 60);
    expect(moving[0]).toBeGreaterThan(0);
  });

  it('is stable for a long step', () => {
    const s = [5, 3];
    expect(damp(s, 0, 1, 30, 10)).toBeCloseTo(1, 9);
  });
});
