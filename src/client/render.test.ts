import { describe, expect, it } from 'vitest';
import { YARD } from '../shared/map';
import { forward } from '../shared/physics';
import { blocked, mapVerts, project, pushBox, viewProj } from './render';

const at = (yaw: number, pitch: number, x: number, y: number, z: number) =>
  project(viewProj([0, 0, 0], yaw, pitch, 1), x, y, z);

describe('viewProj and project', () => {
  it('puts what is straight ahead in the middle of the screen', () => {
    const [x, y] = at(0, 0, 0, 0, -5)!;
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(0.5);
  });

  it('follows forward(yaw) for any yaw', () => {
    for (const yaw of [0.7, 2, 4.5]) {
      const [fx, fz] = forward(yaw);
      const [x, y] = at(yaw, 0, fx * 8, 0, fz * 8)!;
      expect(x).toBeCloseTo(0.5);
      expect(y).toBeCloseTo(0.5);
    }
  });

  it('puts the right on the right, up on top, and drops what is behind', () => {
    expect(at(0, 0, 3, 0, -5)![0]).toBeGreaterThan(0.5);
    expect(at(0, 0, -3, 0, -5)![0]).toBeLessThan(0.5);
    expect(at(0, 0, 0, 3, -5)![1]).toBeLessThan(0.5);
    expect(at(0, 0, 0, 0, 5)).toBeUndefined();
  });

  it('looks up with a positive pitch', () => {
    const y = at(0, 0.3, 0, Math.tan(0.3) * 5, -5)![1];
    expect(y).toBeCloseTo(0.5);
  });

  it('moves with the eye', () => {
    const m = viewProj([10, 2, 10], 0, 0, 1);
    expect(project(m, 10, 2, 5)![0]).toBeCloseTo(0.5);
  });
});

describe('pushBox and mapVerts', () => {
  it('writes 36 vertices of 10 floats a box', () => {
    const out: number[] = [];
    pushBox(out, [0, 0, 0], [1, 1, 1], 0, [1, 0, 0, 0]);
    expect(out).toHaveLength(36 * 10);
  });

  it('turns the -z face toward forward(yaw)', () => {
    const yaw = 1.1;
    const out: number[] = [];
    pushBox(out, [0, 0, 0], [1, 1, 1], yaw, [1, 1, 1, 0]);
    const [fx, fz] = forward(yaw);
    let faces = 0;
    for (let v = 0; v < 36; v++) {
      const [nx, ny, nz] = out.slice(v * 10 + 3, v * 10 + 6);
      faces += +(Math.abs(nx - fx) < 1e-9 && ny == 0 && Math.abs(nz - fz) < 1e-9);
    }
    expect(faces).toBe(6);
  });

  it('keeps every vertex on the face its normal points to', () => {
    const out: number[] = [];
    pushBox(out, [5, 2, 3], [1, 2, 3], 0, [1, 1, 1, 0]);
    for (let v = 0; v < 36; v++) {
      const [x, y, z, nx, ny, nz] = out.slice(v * 10, v * 10 + 6);
      expect(nx * (x - 5) + ny * (y - 2) + nz * (z - 3)).toBeCloseTo(
        Math.abs(nx) * 1 + Math.abs(ny) * 2 + Math.abs(nz) * 3,
      );
    }
  });

  it('builds the floor and one box a map box', () => {
    const verts = mapVerts(YARD, () => [1, 1, 1]);
    expect(verts).toHaveLength((YARD.boxes.length + 1) * 36 * 10);
  });
});

describe('blocked', () => {
  const pillar = YARD.boxes[4]; // x, z in [10, 12], 3 m high
  it('sees through open air and is stopped by a box', () => {
    expect(blocked(YARD.boxes, [5, 1.6, 5], [20, 2, 5])).toBe(false);
    expect(blocked([pillar], [5, 1.6, 11], [20, 2, 11])).toBe(true);
  });

  it('sees over a box and stops at a segment that ends before it', () => {
    expect(blocked([pillar], [5, 4, 11], [20, 4, 11])).toBe(false);
    expect(blocked([pillar], [5, 1.6, 11], [9, 1.6, 11])).toBe(false);
  });

  it('handles a segment parallel to a face', () => {
    expect(blocked([pillar], [5, 1.6, 9], [20, 1.6, 9])).toBe(false);
    expect(blocked([pillar], [11, 1.6, 5], [11, 1.6, 20])).toBe(true);
  });
});
