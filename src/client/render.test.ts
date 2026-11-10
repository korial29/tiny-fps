import { describe, expect, it } from 'vitest';
import { HIGHLINE, ROOFTOPS } from '../shared/map';
import { forward } from '../shared/physics';
import { ROVER } from '../shared/rover';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import type { Brush, WorldDef } from '../shared/world';
import { STRIDE, basis } from './mesh';
import { LIGHT, MAX_LIGHTS, MAX_SHADOWS } from './lights';
import type { Light } from './lights';
import {
  FAR,
  HAZE,
  MAX_PIXELS,
  MAX_TINTS,
  SHADOW,
  SPEC,
  SUN_AHEAD,
  SUN_AREA,
  SUN_DEPTH,
  backing,
  daylight,
  FOG_LAYER,
  FOG_RISE,
  fogDepth,
  fogOf,
  fogRef,
  level,
  lightProj,
  pack,
  palette,
  project,
  scenery,
  city,
  sunAt,
  sunProj,
  viewProj,
  FRAG,
} from './render';
import { trees } from './skyline';
import { STREET, street } from './street';
import { LAYERS } from './textures';
import { vision, zones } from './vision';
import { duo } from '../../test/teams';

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

  it('draws out to FAR, 1200 m, and clips what is past it', () => {
    expect(FAR).toBe(1200);
    const m = viewProj([0, 0, 0], 0, 0, 1);
    // Depth over w straight ahead: 1 on the far plane, -1 on the near one.
    const depth = (d: number) => (m[10] * -d + m[14]) / (m[11] * -d + m[15]);
    expect(depth(FAR * 0.9)).toBeLessThan(1);
    expect(depth(FAR * 1.1)).toBeGreaterThan(1);
    expect(depth(0.11)).toBeGreaterThan(-1);
    expect(depth(0.09)).toBeLessThan(-1);
  });
});

describe('SPEC', () => {
  it('has a row per texture layer, one for the flat bodies and one for polished metal', () => {
    expect(SPEC).toHaveLength(LAYERS + 2);
  });

  it('gives polished metal a stronger, sharper highlight than the flat bodies and any texture but glass', () => {
    const [k, e] = SPEC[LAYERS + 1];
    expect(k).toBeGreaterThan(SPEC[TEX.METAL][0]);
    expect(e).toBeGreaterThan(SPEC[TEX.STEEL][1]);
    expect(k).toBeGreaterThan(SPEC[LAYERS][0] * 10);
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

  it('makes glass the shiniest and sharpest of all, then steel, and concrete a dull stone', () => {
    const rows = SPEC.slice(0, LAYERS);
    expect(SPEC[TEX.GLASS][0]).toBe(Math.max(...rows.map(r => r[0])));
    expect(SPEC[TEX.GLASS][1]).toBe(Math.max(...rows.map(r => r[1])));
    expect(SPEC[TEX.GLASS][0]).toBeGreaterThan(1);
    expect(SPEC[TEX.STEEL][0]).toBeGreaterThan(SPEC[TEX.PAINT][0] * 2);
    expect(SPEC[TEX.CONCRETE][0]).toBeLessThan(SPEC[TEX.STEEL][0] / 5);
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

const SKY: WorldDef['sky'] = [
  [0.2, 0.4, 0.9],
  [0.7, 0.8, 0.9],
];
const brush = (min: number[], max: number[], over: Partial<Brush> = {}): Brush =>
  ({ min, max, top: TEX.TILE, side: TEX.BRICK, ...over }) as Brush;
const worldOf = (brushes: Brush[], over: Partial<WorldDef> = {}) =>
  build({
    brushes,
    teams: duo([[0, 0, 0, 0]]),
    floor: -20,
    sun: { dir: [0.6, 0.6, 0.53], color: [2.5, 2.3, 2] },
    sky: SKY,
    ...over,
  });

/** The vertices of a built world, one { p, n, uv, layer, light } each. */
const verts = (w: ReturnType<typeof worldOf>) => {
  const v = level(w);
  return Array.from({ length: v.length / STRIDE }, (_, i) => {
    const o = v.slice(i * STRIDE, (i + 1) * STRIDE);
    return { p: o.slice(0, 3), n: o.slice(3, 6), uv: o.slice(6, 8), layer: o[8], light: o[9] };
  });
};
/** The vertices of the faces whose normal is n. */
const facing = (vs: ReturnType<typeof verts>, ...n: number[]) =>
  vs.filter(v => v.n.every((c, i) => c == n[i]));

describe('level', () => {
  const box = worldOf([brush([2, -6, 3], [6, 1, 9], { top: TEX.STONE, side: TEX.WOOD })]);
  const vs = verts(box);

  it('builds six faces of two triangles for a lone brush', () => {
    expect(level(box)).toHaveLength(6 * 6 * STRIDE);
    for (const n of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      expect(facing(vs, ...n)).toHaveLength(6);
    }
  });

  it('keeps every vertex on its face, on the brush', () => {
    for (const { p, n } of vs) {
      const [min, max] = [
        [2, -6, 3],
        [6, 1, 9],
      ];
      p.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(min[i]));
      p.forEach((c, i) => expect(c).toBeLessThanOrEqual(max[i]));
      n.forEach((c, i) => {
        if (c) {
          expect(p[i]).toBe(c > 0 ? max[i] : min[i]);
        }
      });
    }
  });

  it('puts the top texture on the top face and the side texture on the five others', () => {
    for (const v of vs) {
      expect(v.layer).toBe(v.n[1] == 1 ? TEX.STONE : TEX.WOOD);
    }
  });

  it('draws both triangles of a face over its whole rectangle', () => {
    const top = facing(vs, 0, 1, 0);
    expect(new Set(top.map(v => `${v.p}`))).toEqual(new Set(['2,1,3', '6,1,3', '6,1,9', '2,1,9']));
  });

  it('gives faces world-space texture coordinates: x, z on the horizontal ones, z, y facing x, x, y facing z', () => {
    for (const v of vs) {
      const [x, y, z] = v.p;
      const [u, w] = v.n[0] ? [z, y] : v.n[1] ? [x, z] : [x, y];
      expect(v.uv).toEqual([u, w]);
    }
  });

  it('lines textures up across brushes: the same world point has the same coordinates', () => {
    const two = verts(worldOf([brush([0, -5, 0], [4, 0, 4]), brush([4, -5, 0], [8, 0, 4])]));
    const tops = facing(two, 0, 1, 0).filter(v => v.p[0] == 4);
    expect(tops.length).toBeGreaterThan(2);
    for (const v of tops) {
      expect(v.uv).toEqual([4, v.p[2]]);
    }
  });

  it('skips the faces two brushes share flush, on both sides', () => {
    const stack = worldOf([brush([0, -5, 0], [4, 0, 4]), brush([0, 0, 0], [4, 3, 4])]);
    expect(level(stack)).toHaveLength(10 * 6 * STRIDE);
    const vs = verts(stack);
    expect(facing(vs, 0, 1, 0).every(v => v.p[1] == 3)).toBe(true);
    expect(facing(vs, 0, -1, 0).every(v => v.p[1] == -5)).toBe(true);
  });

  it('skips the face of a small brush a big one covers, not the big one under it', () => {
    const crate = worldOf([brush([0, -5, 0], [10, 0, 10]), brush([2, 0, 2], [4, 1, 4])]);
    const vs = verts(crate);
    // The crate's bottom is hidden; the roof's top, which it only half covers, stays.
    expect(facing(vs, 0, -1, 0).map(v => v.p[1])).toEqual(Array(6).fill(-5));
    expect(facing(vs, 0, 1, 0).filter(v => v.p[1] == 0)).toHaveLength(6);
  });

  it('keeps a face another brush only touches in part, or does not touch flush', () => {
    const [a, b] = [brush([0, -5, 0], [4, 0, 4]), brush([2, 0, 2], [8, 1, 8])];
    expect(level(worldOf([a, b]))).toHaveLength(12 * 6 * STRIDE);
    const gap = worldOf([a, brush([0, 0.1, 0], [4, 1, 4])]);
    expect(level(gap)).toHaveLength(12 * 6 * STRIDE);
  });

  it('skips the bottom of a brush at or under the kill floor: nobody sees it', () => {
    const [low, high] = [
      worldOf([brush([0, -20, 0], [4, 0, 4])]),
      worldOf([brush([0, -19, 0], [4, 0, 4])]),
    ];
    expect(level(low)).toHaveLength(5 * 6 * STRIDE);
    expect(level(high)).toHaveLength(6 * 6 * STRIDE);
    // A floating platform shows its underside.
    const platform = verts(worldOf([brush([0, 4, 0], [4, 4.4, 4])]));
    expect(facing(platform, 0, -1, 0)).toHaveLength(6);
  });

  it('builds nothing for no brushes', () => {
    expect(level(worldOf([]))).toEqual([]);
  });
});

describe('palette and tint packing', () => {
  const [warm, cold]: [number, number, number][] = [
    [1, 0.5, 0.25],
    [0.25, 0.5, 1],
  ];
  const tinted = (...tints: (typeof warm | undefined)[]) =>
    worldOf(tints.map((tint, i) => brush([4 * i, -5, 0], [4 * i + 3, 0, 3], { tint })));
  const w = tinted(warm, undefined, cold, warm);
  /** The shader's unpacking: the index is floor(w / 2), the light what is left. */
  const unpack = (v: number): [number, number] => [
    Math.floor(v * 0.5),
    v - 2 * Math.floor(v * 0.5),
  ];
  /** The packed light of the first vertex of each brush (a lone brush has 36). */
  const lights = (world: ReturnType<typeof worldOf>) =>
    level(world).filter((_, i) => i % (36 * STRIDE) == 9);

  it('lists white first, then each tint once', () => {
    expect(palette(w)).toEqual([[1, 1, 1], warm, cold]);
    expect(palette(worldOf([brush([0, 0, 0], [1, 1, 1])]))).toEqual([[1, 1, 1]]);
    expect(palette(tinted([1, 1, 1]))).toEqual([[1, 1, 1]]);
  });

  it('round-trips the palette index through the vertex, with a light of 1', () => {
    const pal = palette(w);
    const got = lights(w).map(unpack);
    expect(got.map(([i]) => pal[i])).toEqual([warm, [1, 1, 1], cold, warm]);
    expect(got.map(([, l]) => l)).toEqual([1, 1, 1, 1]);
  });

  it('leaves an untinted brush as the bare light, index 0', () => {
    expect(lights(tinted(undefined, undefined))).toEqual([1, 1]);
  });

  it('stamps every face of a brush with its tint', () => {
    const lone = tinted(cold);
    for (const v of verts(lone)) {
      expect(palette(lone)[unpack(v.light)[0]]).toEqual(cold);
    }
  });

  it('keeps at most MAX_TINTS, the rest falling back to white', () => {
    const many = worldOf(
      Array.from({ length: MAX_TINTS + 4 }, (_, i) =>
        brush([4 * i, -5, 0], [4 * i + 3, 0, 3], { tint: [i / 100, 0.5, 0.5] }),
      ),
    );
    expect(palette(many)).toHaveLength(MAX_TINTS);
    const last = unpack(level(many)[(MAX_TINTS + 3) * 36 * STRIDE + 9]);
    expect(last[0]).toBe(0);
  });
});

describe('sunProj', () => {
  const dir = [0.6, 0.6, 0.529] as [number, number, number];
  const eye = [10.3, 1.6, -4.1] as [number, number, number];
  const apply = (m: Float32Array, [x, y, z]: number[]) =>
    [0, 1, 2].map(r => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
  /** The sun's axes in the matrix rows: right, up, and the direction it looks along. */
  const rows = (m: Float32Array) => [0, 1, 2].map(r => [m[r], m[4 + r], m[8 + r]]);
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

  it('looks along the direction away from the sun, orthogonally, with unit axes', () => {
    const m = sunProj(dir, eye);
    const [r, u, f] = rows(m).map((v, i) =>
      v.map(c => c * [SUN_AREA / 2, SUN_AREA / 2, SUN_DEPTH][i]),
    );
    expect(f.map(c => -c)).toEqual(dir.map(c => expect.closeTo(c, 5)));
    expect(dot(r, u)).toBeCloseTo(0);
    expect(dot(r, f)).toBeCloseTo(0);
    expect(dot(u, f)).toBeCloseTo(0);
    expect(Math.hypot(...r)).toBeCloseTo(1);
    expect(Math.hypot(...u)).toBeCloseTo(1);
    // Right is horizontal, up leans toward the sky.
    expect(r[1]).toBeCloseTo(0);
    expect(u[1]).toBeGreaterThan(0);
  });

  it('covers SUN_AREA metres around the eye, to SUN_DEPTH either side of it', () => {
    const m = sunProj(dir, eye);
    const [r, u, f] = rows(m).map(v => v.map(c => c / Math.hypot(...v)));
    const edge = (axis: number[], k: number) => eye.map((c, i) => c + axis[i] * k);
    const [rx] = apply(m, edge(r, SUN_AREA / 2));
    const [lx] = apply(m, edge(r, -SUN_AREA / 2));
    const [, uy] = apply(m, edge(u, SUN_AREA / 2));
    const [, , nz] = apply(m, edge(f, -SUN_DEPTH));
    const [, , fz] = apply(m, edge(f, SUN_DEPTH));
    // The eye is within a texel of the middle, the edges within a texel of +-1.
    const texel = 2 / SHADOW;
    expect(Math.abs(rx - 1)).toBeLessThanOrEqual(texel * 1.01);
    expect(Math.abs(lx + 1)).toBeLessThanOrEqual(texel * 1.01);
    expect(Math.abs(uy - 1)).toBeLessThanOrEqual(texel * 1.01);
    expect(nz).toBeCloseTo(-1);
    expect(fz).toBeCloseTo(1);
    const [cx, cy, cz] = apply(m, eye);
    expect(Math.abs(cx)).toBeLessThanOrEqual(texel);
    expect(Math.abs(cy)).toBeLessThanOrEqual(texel);
    expect(cz).toBeCloseTo(0);
  });

  it('is orthographic: w stays 1, so a point far off to the side keeps its scale', () => {
    const m = sunProj(dir, eye);
    expect([m[3], m[7], m[11], m[15]]).toEqual([0, 0, 0, 1]);
  });

  it('snaps its window to the texels of the map along its own axes', () => {
    const [r, u] = rows(sunProj(dir, eye)).map(v => v.map(c => c / Math.hypot(...v)));
    const texel = SUN_AREA / SHADOW;
    // The window's centre, in the sun's right and up axes, is a whole number of texels.
    for (const e of [eye, [0, 0, 0], [-33.7, 9, 120.2]] as (typeof eye)[]) {
      const m = sunProj(dir, e);
      for (const [axis, at] of [
        [r, 12],
        [u, 13],
      ] as const) {
        const centre = (-m[at] * SUN_AREA) / 2;
        expect(centre / texel).toBeCloseTo(Math.round(centre / texel), 3);
        expect(Math.abs(centre - dot(axis, e))).toBeLessThanOrEqual(texel / 2 + 1e-4);
      }
    }
  });

  it('holds still while the eye moves less than a texel, and steps a whole texel at a time', () => {
    const texel = SUN_AREA / SHADOW;
    const [r] = rows(sunProj(dir, eye)).map(v => v.map(c => c / Math.hypot(...v)));
    // From the middle of a texel.
    const off = (Math.round(dot(r, eye) / texel) + 0.1) * texel - dot(r, eye);
    const mid = eye.map((c, i) => c + r[i] * off) as typeof eye;
    const base = sunProj(dir, mid);
    // Sliding the eye along the window's right axis by a quarter texel changes nothing...
    const near = mid.map((c, i) => c + r[i] * texel * 0.2) as typeof eye;
    expect(Array.from(sunProj(dir, near))).toEqual(Array.from(base));
    // ... and by two texels moves the window by exactly two texels.
    const far = mid.map((c, i) => c + r[i] * texel * 2) as typeof eye;
    const moved = sunProj(dir, far);
    expect((base[12] - moved[12]) / (2 / SHADOW)).toBeCloseTo(2, 2);
  });

  it('handles a sun straight overhead', () => {
    const m = sunProj([0, 1, 0], eye);
    expect(Array.from(m).every(Number.isFinite)).toBe(true);
    expect(rows(m)[2].map(c => Math.round(c * SUN_DEPTH) + 0)).toEqual([0, -1, 0]);
  });
});

describe('daylight', () => {
  const def = worldOf([]).def;
  const [up, side, down, zenith, horizon] = daylight(def);

  it('ends with the sky colours the shader paints', () => {
    expect([zenith, horizon]).toEqual(SKY);
  });

  it('lights the sides and the sky above well, and what bounces up from below least', () => {
    const lum = (c: number[]) => c[0] + c[1] + c[2];
    expect(lum(up)).toBeGreaterThan(lum(down));
    expect(lum(side)).toBeGreaterThan(lum(down));
    expect(lum(down)).toBeGreaterThan(0);
  });

  it('takes its colour from the sky: bluer above than below', () => {
    expect(up[2]).toBeGreaterThan(up[0]);
    expect(up[2] / up[0]).toBeGreaterThan(down[2] / down[0]);
  });

  it('leans blue in the shade: the sky above lights the roofs bluer than grey, and not as dark as a night', () => {
    const [r, g, b] = daylight(ROOFTOPS)[0];
    expect(b / r).toBeGreaterThan(1.3);
    expect(b).toBeGreaterThan(g);
    expect(b).toBeGreaterThan(0.45);
  });

  it('keeps a shadow well under the sun but well above black', () => {
    const lum = (c: number[]) => (c[0] + c[1] + c[2]) / 3;
    expect(lum(up)).toBeGreaterThan(0.3);
    expect(lum(up)).toBeLessThan(1);
  });
});

describe('scenery', () => {
  const w = build(ROOFTOPS);
  const v = scenery(w);

  it('draws the brushes, a distant city, its trees, the runner red and the team zones, in whole triangles', () => {
    expect(v.length % (3 * STRIDE)).toBe(0);
    const [brushes, tower, road, wood, vis, zone] = [
      level(w),
      level(city(w)),
      street(w.def),
      trees(w.def),
      vision(w.def),
      zones(w.def),
    ].map(a => a.length);
    expect(tower).toBeGreaterThan(brushes);
    expect(road).toBeGreaterThan(0);
    expect(wood).toBeGreaterThan(0);
    expect(vis).toBeGreaterThan(0);
    expect(v).toHaveLength(tower + road + wood + vis + zone);
  });

  it('puts the map first and the red last, so the red is never hidden by the city', () => {
    expect(v.slice(0, 20)).toEqual(level(city(w)).slice(0, 20));
    expect(v.slice(-STRIDE)).toEqual(zones(w.def).slice(-STRIDE));
  });

  it('keeps the world the physics reads as it was', () => {
    expect(w.def.brushes).toBe(ROOFTOPS.brushes);
    expect(city(w).grid).toBe(w.grid);
  });
});

describe('the height fog', () => {
  const eye = (y: number): [number, number, number] => [0, y, 0];
  const today = (density: number, d: number) => density * d;

  it('is the world fog plus the layer: at the roof level it matches the fog of before within a few percent', () => {
    for (const def of [HIGHLINE, ROOFTOPS]) {
      const [density, ref] = [def.fog![3], fogRef(def)];
      // On any roof, from the lowest to 12 m above, across 200 m: never thinner, at most 4 % thicker.
      for (const y of [ref, ref + 6, ref + 12]) {
        const k = fogDepth(density, ref, eye(y), [200, y, 0]) / today(density, 200);
        expect(k).toBeGreaterThanOrEqual(1);
        expect(k).toBeLessThan(1.04);
      }
    }
  });

  it('thickens toward the street: down 100 m it is several times as dense as across, and it is monotonic', () => {
    const [density, ref] = [HIGHLINE.fog![3], fogRef(HIGHLINE)];
    const across = fogDepth(density, ref, eye(ref + 10), [100, ref + 10, 0]);
    const down = fogDepth(density, ref, eye(ref + 10), [0, ref - 90, 0]);
    // The whole way down is a third thicker than the same 100 m across, and the air on the street,
    // 94 m under the lowest roof, is over three times as dense as the air at the roof.
    expect(down / today(density, 100)).toBeGreaterThan(1.3);
    expect(down).toBeGreaterThan(across);
    const local = (y: number) =>
      (fogDepth(density, ref, eye(y + 1), [0, y, 0]) +
        fogDepth(density, ref, eye(y), [0, y - 1, 0])) /
      2 /
      density;
    expect(local(STREET) / local(ref)).toBeGreaterThan(3);
    // Per metre of view, a ray down is thicker than a level one, and a ray up is thinner.
    const per = (dy: number) =>
      fogDepth(density, ref, eye(ref + 10), [60, ref + 10 + dy, 0]) /
      today(density, Math.hypot(60, dy));
    expect(per(-60)).toBeGreaterThan(per(0));
    expect(per(0)).toBeGreaterThan(per(60));
    let last = 0;
    for (let drop = 0; drop <= 100; drop += 10) {
      const d = per(-drop);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
  });

  it('lets the street and the cars through: at the street 100 m under a roof the view is hazy, not blind', () => {
    const [density, ref] = [HIGHLINE.fog![3], fogRef(HIGHLINE)];
    const seen = Math.exp(-fogDepth(density, ref, eye(ref + 10), [0, ref - 90, 0]));
    expect(seen).toBeGreaterThan(0.25);
    expect(seen).toBeLessThan(0.8);
  });

  it('has no seam where the closed form changes branch, and none on the level or straight down', () => {
    const [density, ref] = [HIGHLINE.fog![3], fogRef(HIGHLINE)];
    const y = 30;
    const [a, b] = [0.99, 1.01].map(k => (1e-3 / FOG_RISE) * k);
    const [fa, fb] = [a, b].map(climb => fogDepth(density, ref, eye(y), [100, y + climb, 0]));
    expect(Math.abs(fa - fb) / fa).toBeLessThan(1e-4);
    for (const p of [
      [100, y, 0],
      [0, y - 100, 0],
      [0, y + 100, 0],
      [0, y, 0],
    ] as const) {
      const d = fogDepth(density, ref, eye(y), [...p]);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
    expect(FOG_LAYER).toBeGreaterThan(0);
  });

  it('is anchored at the lowest top of the world', () => {
    expect(fogRef(HIGHLINE)).toBe(Math.min(...HIGHLINE.brushes.map(b => b.max[1])));
    expect(fogRef(ROOFTOPS)).toBe(Math.min(...ROOFTOPS.brushes.map(b => b.max[1])));
  });
});

describe('fogOf', () => {
  const def = (fog?: WorldDef['fog']) => worldOf([], { fog }).def;

  it('is none, with the horizon as colour, when the world has no fog', () => {
    expect(fogOf(def())).toEqual([...SKY[1], 0]);
  });

  it('keeps the density and pulls the colour toward the horizon', () => {
    const [r, g, b, d] = fogOf(def([0, 0.5, 1, 0.02]));
    expect(d).toBe(0.02);
    expect([r, g, b]).toEqual([
      expect.closeTo(0.7 * HAZE),
      expect.closeTo(0.5 + (0.8 - 0.5) * HAZE),
      expect.closeTo(1 + (0.9 - 1) * HAZE),
    ]);
  });

  it('is exactly the fog when the fog is the horizon already', () => {
    expect(fogOf(def([...SKY[1], 0.01]))).toEqual([...SKY[1], 0.01].map(c => expect.closeTo(c)));
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

describe('ghost brushes', () => {
  it('are collided with but not drawn, and hide no face of another brush', () => {
    const base = build({ ...ROOFTOPS, brushes: [ROOFTOPS.brushes[0]] });
    const ghosted = build({
      ...ROOFTOPS,
      brushes: [ROOFTOPS.brushes[0], { ...ROOFTOPS.brushes[0], ghost: true }],
    });
    expect(level(ghosted)).toEqual(level(base));
  });
});

describe('sunAt', () => {
  it('puts the middle of the shadow window SUN_AHEAD metres ahead of the eye on the ground, the way it looks', () => {
    for (const yaw of [0, 0.7, -2, Math.PI]) {
      const [x, y, z] = sunAt([10, 3, -4], yaw);
      const [fx, fz] = forward(yaw);
      expect(y).toBe(3);
      expect(x - 10).toBeCloseTo(fx * SUN_AHEAD, 9);
      expect(z + 4).toBeCloseTo(fz * SUN_AHEAD, 9);
    }
  });

  it('keeps the eye well inside the window, with four seconds of a rover at full speed ahead of it', () => {
    expect(SUN_AHEAD).toBeLessThan(SUN_AREA / 2 - 10);
    expect(SUN_AHEAD + SUN_AREA / 2).toBeGreaterThan(3.3 * ROVER.VMAX);
    // No coarser than 10 cm a texel.
    expect(SUN_AREA / SHADOW).toBeLessThan(0.1);
  });
});

describe('the regolith in the shader', () => {
  it('fetches the stone tile twice at offsets drawn from a value noise, and darkens it on slopes', () => {
    expect(FRAG).toContain('float vn(vec2 p)');
    expect(FRAG).toMatch(/if\(ks>\.5\)\{[^}]*textureGrad\([^}]*textureGrad\(/s);
    expect(FRAG).toMatch(/t\.rgb\*=mix\(\.6,1\.,smoothstep\(\.72,\.97,normalize\(N\)\.y\)\)/);
  });
});
