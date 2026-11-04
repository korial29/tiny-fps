import { describe, expect, it } from 'vitest';
import { compile, inside } from '../shared/level';
import { HALL } from '../shared/map';
import { forward } from '../shared/physics';
import { TEX } from '../shared/types';
import { basis, pushBox } from './mesh';
import { LIGHT, MAX_LIGHTS, MAX_SHADOWS } from './lights';
import type { Light } from './lights';
import {
  MAX_PIXELS,
  SPEC,
  backing,
  levelVerts,
  lightProj,
  pack,
  project,
  spans,
  viewProj,
} from './render';
import { LAYERS } from './textures';

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

describe('SPEC', () => {
  it('has a row per texture layer and one for the flat bodies', () => {
    expect(SPEC).toHaveLength(LAYERS + 1);
  });

  it('makes metal and grating shinier than brick and wood, and sharper', () => {
    for (const shiny of [TEX.METAL, TEX.GRATE]) {
      for (const dull of [TEX.BRICK, TEX.WOOD]) {
        expect(SPEC[shiny][0]).toBeGreaterThan(SPEC[dull][0] * 5);
        expect(SPEC[shiny][1]).toBeGreaterThan(SPEC[dull][1]);
      }
    }
    expect(SPEC[LAYERS][0]).toBeGreaterThan(0);
    expect(SPEC[LAYERS][0]).toBeLessThan(SPEC[TEX.METAL][0] / 4);
  });
});

describe('roll', () => {
  const rolled = (roll: number, x: number, y: number) =>
    project(viewProj([0, 0, 0], 0, 0, 1, roll), x, y, -5)!;

  it('is the same view at 0, and by default', () => {
    expect(viewProj([1, 2, 3], 0.4, 0.2, 1.5, 0)).toEqual(viewProj([1, 2, 3], 0.4, 0.2, 1.5));
  });

  it('keeps the axis of sight', () => {
    const [x, y] = rolled(0.3, 0, 0);
    expect([x, y]).toEqual([0.5, 0.5]);
  });

  it('tilts the up vector toward the right when leaning right', () => {
    const [r, u, f] = basis(0, 0, 0.3);
    expect(u[0]).toBeCloseTo(Math.sin(0.3));
    expect(u[1]).toBeCloseTo(Math.cos(0.3));
    expect(r[0]).toBeCloseTo(Math.cos(0.3));
    expect(r[1]).toBeCloseTo(-Math.sin(0.3));
    expect(f).toEqual([-0, 0, -1]);
  });

  it('moves a point above the sight line to the left of the screen when leaning right', () => {
    expect(rolled(0, 0, 3)[0]).toBeCloseTo(0.5);
    expect(rolled(0.3, 0, 3)[0]).toBeLessThan(0.5);
    expect(rolled(-0.3, 0, 3)[0]).toBeGreaterThan(0.5);
  });
});

describe('pushBox', () => {
  it('writes the layer it is given, flat by default', () => {
    const [a, b]: number[][] = [[], []];
    pushBox(a, [0, 0, 0], [1, 1, 1], 0, [1, 1, 1]);
    pushBox(b, [0, 0, 0], [1, 1, 1], 0, [1, 1, 1], -2);
    expect([a[8], b[8]]).toEqual([-1, -2]);
  });

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

const spot = (over: Partial<Light> = {}): Light => ({
  kind: LIGHT.SPOT,
  p: [2, 1.6, 3],
  d: [0, 0, -1],
  cone: Math.cos(0.4),
  range: 12,
  color: [1, 0.9, 0.7],
  shadow: true,
  ...over,
});

describe('lightProj', () => {
  const at = (l: Light, x: number, y: number, z: number) => project(lightProj(l), x, y, z);

  it('puts a point on the axis in the middle of the map', () => {
    const l = spot({ d: [0.6, -0.48, -0.64] });
    const [x, y] = at(l, 2 + 0.6 * 5, 1.6 - 0.48 * 5, 3 - 0.64 * 5)!;
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(0.5);
  });

  it('handles a light pointing straight up or down', () => {
    for (const d of [-1, 1]) {
      const [x, y] = at(spot({ d: [0, d, 0] }), 2, 1.6 + d * 4, 3)!;
      expect([x, y].map(v => Math.round(v * 1e4) / 1e4)).toEqual([0.5, 0.5]);
    }
  });

  it('puts the edge of the cone on the edge of the map', () => {
    const l = spot();
    // 0.4 rad off the axis, in the right-hand plane: x is the map's right edge.
    const [x, y] = at(l, 2 + Math.tan(0.4) * 5, 1.6, 3 - 5)!;
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0.5);
  });

  it('puts a point outside the cone outside the map', () => {
    const l = spot();
    for (const [x, y, z] of [
      [2 + 3, 1.6, 3 - 5],
      [2, 1.6 + 3, 3 - 5],
    ]) {
      const [u, v] = at(l, x, y, z)!;
      expect(u < 0 || u > 1 || v < 0 || v > 1).toBe(true);
    }
    // Behind the light there is no map position at all.
    expect(at(l, 2, 1.6, 8)).toBeUndefined();
  });

  it('clips at the range', () => {
    const m = lightProj(spot({ range: 12 }));
    const depth = (z: number) => {
      const w = m[3] * 2 + m[7] * 1.6 + m[11] * z + m[15];
      return (m[2] * 2 + m[6] * 1.6 + m[10] * z + m[14]) / w;
    };
    expect(depth(3 - 12)).toBeCloseTo(1);
    expect(depth(3 - 0.3)).toBeCloseTo(-1);
  });
});

describe('pack', () => {
  it('keeps the first MAX_LIGHTS lights', () => {
    const many = Array.from({ length: MAX_LIGHTS + 5 }, (_, i) =>
      spot({ shadow: false, range: i + 1 }),
    );
    const pk = pack(many);
    expect(pk.n).toBe(MAX_LIGHTS);
    expect(pk.a[(MAX_LIGHTS - 1) * 4 + 3]).toBe(MAX_LIGHTS);
    expect(pk.maps).toBe(0);
    expect(pack([]).n).toBe(0);
  });

  it('writes position and range, direction and cone, colour and slot', () => {
    const pk = pack([spot({ p: [1, 2, 3], d: [0, 1, 0], cone: 0.5, range: 9, color: [4, 5, 6] })]);
    expect([...pk.a.slice(0, 4)]).toEqual([1, 2, 3, 9]);
    expect([...pk.b.slice(0, 4)]).toEqual([0, 1, 0, 0.5]);
    expect([...pk.k.slice(0, 4)]).toEqual([4, 5, 6, 0]);
  });

  it('gives slots to the first MAX_SHADOWS shadowed spots only', () => {
    const lights = [
      spot({ shadow: false }),
      ...Array.from({ length: MAX_SHADOWS + 2 }, () => spot()),
    ];
    const pk = pack(lights);
    const slots = lights.map((_, i) => pk.k[i * 4 + 3]);
    expect(slots).toEqual([-1, 0, 1, 2, 3, -1, -1]);
    expect(pk.maps).toBe(MAX_SHADOWS);
  });

  it('gives none to a point, even with shadow set, and no cone', () => {
    const pk = pack([spot({ kind: LIGHT.POINT, cone: 0.3 }), spot()]);
    expect(pk.k[3]).toBe(-1);
    expect(pk.b[3]).toBeLessThan(-1);
    expect(pk.k[7]).toBe(0);
    expect(pk.maps).toBe(1);
  });

  it('stores each slot matrix at 16 floats a slot', () => {
    const [a, b] = [spot({ p: [1, 1, 1] }), spot({ p: [5, 1, 5], d: [1, 0, 0] })];
    const pk = pack([a, b]);
    expect([...pk.m.slice(0, 16)]).toEqual([...lightProj(a)]);
    expect([...pk.m.slice(16, 32)]).toEqual([...lightProj(b)]);
  });
});

describe('backing', () => {
  it('keeps the pixel ratio, up to 2, on a small canvas', () => {
    expect(backing(800, 600, 1)).toEqual([800, 600]);
    expect(backing(640, 480, 2)).toEqual([1280, 960]);
    expect(backing(400, 300, 3)).toEqual([800, 600]);
  });

  it('scales a big canvas down to MAX_PIXELS, keeping its ratio', () => {
    const [w, h] = backing(1024, 768, 2);
    expect(w * h).toBeLessThanOrEqual(MAX_PIXELS * 1.01);
    expect(w / h).toBeCloseTo(1024 / 768, 2);
    expect(backing(1920, 1080, 1)).toEqual([1920, 1080]);
    expect(backing(2560, 1440, 2)[0]).toBeLessThan(2560);
  });
});
