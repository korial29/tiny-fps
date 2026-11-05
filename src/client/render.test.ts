import { describe, expect, it } from 'vitest';
import { compile, inside } from '../shared/level';
import { LEVELS } from '../shared/levels';
import { HALL } from '../shared/map';
import { forward } from '../shared/physics';
import { TEX } from '../shared/types';
import type { Level, MapDef, Sector } from '../shared/types';
import { METAL, axesAlong, basis, dress, pushBox, pushFrame } from './mesh';
import { LIGHT, MAX_LIGHTS, MAX_SHADOWS } from './lights';
import type { Light } from './lights';
import {
  MAX_PIXELS,
  MAX_TINTS,
  SPEC,
  backing,
  levelVerts,
  lightProj,
  pack,
  palette,
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
  it('has a row per texture layer, one for the flat bodies and one for flat metal', () => {
    expect(SPEC).toHaveLength(LAYERS + 2);
  });

  it('makes flat metal shine more than a flat body, and less than the metal texture', () => {
    expect(SPEC[LAYERS + 1][0]).toBeGreaterThan(SPEC[LAYERS][0]);
    expect(SPEC[LAYERS + 1][0]).toBeLessThan(SPEC[TEX.METAL][0]);
    expect(SPEC[LAYERS + 1][1]).toBeGreaterThan(SPEC[LAYERS][1]);
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

describe('axesAlong', () => {
  it('gives unit axes at right angles, the first one along d', () => {
    for (const d of [
      [0, 0, -1],
      [0, 1, 0],
      [0.6, 0, -0.8],
      [0.48, 0.64, 0.6],
    ] as [number, number, number][]) {
      const [a, b, c] = axesAlong(d);
      expect(a).toEqual(d);
      for (const [u, v, dot] of [
        [a, a, 1],
        [b, b, 1],
        [c, c, 1],
        [a, b, 0],
        [a, c, 0],
        [b, c, 0],
      ] as const) {
        expect(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]).toBeCloseTo(dot);
      }
    }
  });
});

describe('pushFrame', () => {
  const axes = axesAlong([0.6, 0, -0.8]);

  it('writes 36 vertices on the faces of a box turned to its axes', () => {
    const out: number[] = [];
    pushFrame(out, [5, 2, 3], axes, [1, 2, 3], [1, 1, 1]);
    expect(out).toHaveLength(36 * 10);
    for (let v = 0; v < 36; v++) {
      const [x, y, z, nx, ny, nz] = out.slice(v * 10, v * 10 + 6);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
      // Along its normal the vertex is on the face: one half size from the centre.
      const half = [1, 2, 3][
        axes.findIndex(a => Math.abs(a[0] * nx + a[1] * ny + a[2] * nz) > 0.99)
      ];
      expect(nx * (x - 5) + ny * (y - 2) + nz * (z - 3)).toBeCloseTo(half);
    }
  });

  it('writes the same vertices as pushBox when the axes are the world ones', () => {
    const [a, b]: number[][] = [[], []];
    pushFrame(
      a,
      [1, 2, 3],
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [1, 2, 3],
      [0.5, 0.25, 0.1],
      -2,
    );
    pushBox(b, [1, 2, 3], [1, 2, 3], 0, [0.5, 0.25, 0.1], -2);
    const rows = (v: number[]) =>
      Array.from({ length: 36 }, (_, i) =>
        v
          .slice(i * 10, i * 10 + 10)
          .map(x => x + 0)
          .join(),
      ).sort();
    expect(rows(a)).toEqual(rows(b));
  });

  it('colours the +x end with `end`, and the rest with the colour: a gradient along the first axis', () => {
    const out: number[] = [];
    pushFrame(out, [0, 0, 0], axes, [2, 1, 1], [0.1, 0.1, 0.1], -2, [1, 0.5, 0.2]);
    for (let v = 0; v < 36; v++) {
      const [x, y, z] = out.slice(v * 10, v * 10 + 3);
      const along = x * axes[0][0] + y * axes[0][1] + z * axes[0][2];
      const c = [out[v * 10 + 6], out[v * 10 + 7], out[v * 10 + 9]];
      expect(c).toEqual(along > 0 ? [1, 0.5, 0.2] : [0.1, 0.1, 0.1]);
    }
  });
});

describe('dress', () => {
  it('writes the layer it is given: flat by default, shiny metal for the gun', () => {
    const v = [0, 0, 0, 0, 1, 0];
    expect([dress(v, [1, 1, 1])[8], dress(v, [1, 1, 1], METAL)[8]]).toEqual([-1, METAL]);
    expect(METAL).toBeGreaterThan(-1);
    expect(METAL).toBeLessThan(0);
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

/** Squares side by side, one sector each, with the given tint and light. */
const tinted = (...cells: Pick<Sector, 'tint' | 'light'>[]) =>
  compile({
    sectors: cells.map((c, i) => ({
      pts: [
        [4 * i, 0],
        [4 * i + 4, 0],
        [4 * i + 4, 4],
        [4 * i, 4],
      ],
      floor: 0,
      ceil: 3,
      ft: TEX.TILE,
      wt: TEX.BRICK,
      ct: TEX.STONE,
      ...c,
    })),
    spawns: [[1, 1, 0]],
  } as MapDef);

describe('palette and tint packing', () => {
  const [warm, cold]: [number, number, number][] = [
    [1, 0.5, 0.25],
    [0.25, 0.5, 1],
  ];
  const lvl = tinted({ tint: warm, light: 0.6 }, {}, { tint: cold }, { tint: warm, light: 0.3 });
  /** The shader's unpacking: the index is floor(w / 2), the light what is left. */
  const unpack = (w: number): [number, number] => [
    Math.floor(w * 0.5),
    w - 2 * Math.floor(w * 0.5),
  ];
  /** The light of the first vertex of each sector's floor (a 4-point fan is 6 vertices, plus 6 of ceiling). */
  const lights = (l: Level) =>
    levelVerts(l)
      .filter((_, i) => i % 120 == 9)
      .slice(0, l.map.sectors.length);

  it('lists white first, then each tint once', () => {
    expect(palette(lvl)).toEqual([[1, 1, 1], warm, cold]);
    expect(palette(compile(HALL))).toEqual([[1, 1, 1]]);
    expect(palette(tinted({ tint: [1, 1, 1] }))).toEqual([[1, 1, 1]]);
  });

  it('round-trips the palette index and the light through the vertex', () => {
    const pal = palette(lvl);
    const got = lights(lvl).map(unpack);
    expect(got.map(([i]) => pal[i])).toEqual([warm, [1, 1, 1], cold, warm]);
    expect(got.map(([, l]) => l)).toEqual([
      expect.closeTo(0.6),
      expect.closeTo(1),
      expect.closeTo(1),
      expect.closeTo(0.3),
    ]);
  });

  it('leaves an untinted sector as the bare light, as before', () => {
    expect(lights(tinted({ light: 0.4 }, {}))).toEqual([0.4, 1]);
  });

  it('stamps walls with the tint of the sector they belong to', () => {
    const v = levelVerts(lvl);
    // After the 4 sectors' fans (48 vertices), each edge's quad: the first edge is sector 0's.
    const [i] = unpack(v[48 * 10 + 9]);
    expect(palette(lvl)[i]).toEqual(warm);
  });

  it('keeps at most MAX_TINTS, the rest falling back to white', () => {
    const many = tinted(
      ...Array.from({ length: MAX_TINTS + 4 }, (_, i): Pick<Sector, 'tint'> => ({
        tint: [i / 100, 0.5, 0.5],
      })),
    );
    expect(palette(many)).toHaveLength(MAX_TINTS);
    const last = unpack(levelVerts(many)[(MAX_TINTS + 3) * 12 * 10 + 9]);
    expect(last[0]).toBe(0);
  });

  it('fits the palette of every level', () => {
    for (const map of LEVELS) {
      const lv = compile(map);
      expect(palette(lv).length).toBeLessThan(MAX_TINTS);
      expect(palette(lv).length).toBe(
        1 + new Set(map.sectors.flatMap(s => (s.tint ? [`${s.tint}`] : []))).size,
      );
    }
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
