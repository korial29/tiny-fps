import { describe, expect, it } from 'vitest';
import { compile, inside } from '../shared/level';
import { HALL } from '../shared/map';
import { forward } from '../shared/physics';
import { TEX } from '../shared/types';
import { levelVerts, project, pushBox, spans, viewProj } from './render';

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

describe('pushBox', () => {
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
});

const lvl = compile(HALL);
const edge = (front: number, back: number) =>
  lvl.edges.find(e => e.front === front && e.back === back)!;

describe('spans', () => {
  it('gives a solid wall one full-height span', () => {
    expect(spans(lvl, edge(0, -1))).toEqual([[1, 5]]);
  });

  it('draws a step on the lower side only, up to the higher floor', () => {
    const [low, high] = [edge(7, 8), edge(8, 7)];
    expect(spans(lvl, low)).toEqual([[1.4, 1.8]]);
    expect(spans(lvl, high)).toEqual([]);
  });

  it('draws the upper wall on the side with the higher ceiling', () => {
    expect(spans(lvl, edge(0, 1))).toEqual([[3.5, 5]]);
    expect(spans(lvl, edge(1, 0))).toEqual([]);
  });

  it('draws nothing across a flat opening, and the pit rim from the hall side', () => {
    expect(spans(lvl, edge(2, 3))).toEqual([]);
    expect(spans(lvl, edge(2, 6))).toEqual([]);
    expect(spans(lvl, edge(6, 2))).toEqual([[0, 1]]);
  });
});

describe('levelVerts', () => {
  const verts = levelVerts(lvl);
  const count = HALL.sectors.reduce((n, { pts }) => n + 2 * (pts.length - 2) * 3, 0);
  const quads = lvl.edges.reduce((n, e) => n + spans(lvl, e).length, 0);

  it('builds a fan per floor and ceiling and a quad per span', () => {
    expect(verts).toHaveLength((count + quads * 6) * 10);
  });

  it('points every wall normal into its own sector', () => {
    let at = count * 10;
    for (const e of lvl.edges) {
      for (let q = 0; q < spans(lvl, e).length; q++, at += 60) {
        const [x, , z, nx, ny, nz] = verts.slice(at, at + 6);
        expect(ny).toBe(0);
        expect(inside(HALL.sectors[e.front], x + nx * 0.01, z + nz * 0.01)).toBe(true);
        expect(inside(HALL.sectors[e.front], x - nx * 0.01, z - nz * 0.01)).toBe(false);
      }
    }
    expect(at).toBe(verts.length);
  });

  it('gives floors x, z texture coordinates and the sector light', () => {
    // Sector 0's floor fan has 4 triangles; sector 1 follows with its floor, light 0.6.
    const at = (HALL.sectors[0].pts.length - 2) * 6 * 10;
    expect(verts.slice(at, at + 10)).toEqual([16, 1, 6, 0, 1, 0, 16, 6, TEX.TILE, 0.6]);
  });
});
