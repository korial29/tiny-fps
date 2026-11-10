import { describe, expect, it } from 'vitest';
import { MOON, ZED } from '../shared/moon';
import { TEAM_TINT } from '../shared/map';
import { BASE, HALL, HEAD, KIT, MODULES, MOUTHS, TUBES } from '../shared/moonbase';
import { TEX } from '../shared/types';
import { build } from '../shared/world';
import { STRIDE } from './mesh';
import { GAPS, INDOORS, LINTELS, furnishing, moonbase } from './moonbase';
import { PORTHOLES, SEAM, TIP, hull } from './moonhull';
import { moonscape } from './moonscape';
import { palette, scenery } from './render';
import { uses } from './vision';

const v = moonscape(MOON);
const verts = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, (i + 1) * STRIDE),
);
/** The drawn dome: its radius at a height. */
const shell = (y: number) => (y < 5 ? 22.4 : 22.4 * Math.sqrt(1 - ((y - 5) / 12) ** 2));
/** What is drawn indoors: it carries the indoor normal, mirrored in blue's half. */
const indoors = (p: number[]) =>
  p[3] === INDOORS[0] && p[4] === INDOORS[1] && Math.abs(p[5]) === INDOORS[2];

describe('moonbase', () => {
  it('stands a dome of radius 22 and about 16 m on each half, a glowing band at its foot', () => {
    for (const z of [236, 44]) {
      // The shell, by its paint: an aerial stands on its top (moonhull.ts).
      const near = verts.filter(
        p => Math.hypot(p[0] - 80, p[2] - z) < 1.5 && p[6] === 0.8 && p[7] === 0.82,
      );
      expect(Math.max(...near.map(p => p[1]))).toBeGreaterThan(15.9);
      expect(Math.max(...near.map(p => p[1]))).toBeLessThan(18);
      const at = (r: number) =>
        verts.filter(p => Math.abs(Math.hypot(p[0] - 80, p[2] - z) - r) < 0.01);
      expect(at(22.46).some(p => p[8] === -2 && p[1] > 1 && p[1] < 4)).toBe(true);
      expect(at(22.4).some(p => p[8] === -1 && p[1] < 0.01)).toBe(true);
    }
  });

  it('draws the hall in each dome: a floor, white walls up to 8 m, the shell from inside and a lamp under its top', () => {
    for (const z of [236, 44]) {
      const r = (p: number[]) => Math.hypot(p[0] - 80, p[2] - z);
      const mine = verts.filter(p => indoors(p) && r(p) < 22.2);
      // The floor, a finger over the regolith, out to the walls of the hall.
      const floor = mine.filter(p => p[8] === TEX.CONCRETE && p[1] === 0.02);
      expect(Math.max(...floor.map(p => Math.abs(p[0] - 80)))).toBeCloseTo(HALL[0][0], 9);
      expect(Math.max(...floor.map(p => Math.abs(p[2] - z)))).toBeCloseTo(HALL[0][0], 9);
      // The walls, from the floor to 8 m, on the hall's sides.
      const walls = mine.filter(p => p[8] === TEX.PAINT && r(p) > 17);
      expect(Math.min(...walls.map(p => p[1]))).toBe(0);
      expect(Math.max(...walls.map(p => p[1]))).toBe(8);
      expect(walls.some(p => Math.abs(Math.abs(p[0] - 80) - HALL[0][0]) < 1e-9 && p[1] === 8)).toBe(
        true,
      );
      // The shell: 6 rings of 32 panels from 8 m up, inside the outer one, and a lamp of 16 sides.
      const inner = mine.filter(p => p[8] === -2 && p[1] > 7.99 && p[1] !== 16.2);
      expect(inner).toHaveLength(6 * 32 * 6);
      expect(Math.max(...inner.map(p => p[1]))).toBeGreaterThan(16.5);
      expect(inner.every(p => r(p) < shell(p[1]) - 0.2 || p[1] > 16.5)).toBe(true);
      // And it clears the hall's walls where they end: a ledge joins the two.
      expect(Math.min(...inner.filter(p => p[1] < 8.01).map(r))).toBeGreaterThan(
        Math.max(...HALL.map(([a, b]) => Math.hypot(a, b))),
      );
      expect(mine.filter(p => p[1] === 16.2 && r(p) < 3.01)).toHaveLength(16 * 3);
    }
  });

  it('lights nothing indoors with the sun: every surface drawn there faces up and away from it, off every axis', () => {
    const inside = verts.filter(indoors);
    expect(inside.length).toBeGreaterThan(7000);
    expect(Math.hypot(...INDOORS)).toBeCloseTo(1, 3);
    expect(Math.min(...INDOORS.map(Math.abs))).toBeGreaterThan(0.5);
    const [x, y, z] = MOON.sun.dir;
    for (const s of [1, -1]) {
      expect(INDOORS[0] * x + INDOORS[1] * y + s * INDOORS[2] * z).toBeLessThan(-0.1);
    }
  });

  it('opens the drum at the door and at the tubes: no pane of its 70 windows stands there', () => {
    const [, mz, w] = MOUTHS[0];
    for (const [z, s] of [
      [236, 1],
      [44, -1],
    ]) {
      const panes = verts.filter(
        p => p[8] === -2 && Math.abs(Math.hypot(p[0] - 80, p[2] - z) - 22.47) < 0.02,
      );
      // 2 at the door and 3 at the tubes are gone.
      expect(panes).toHaveLength(65 * 6);
      expect(panes.some(p => Math.abs(p[0] - 80) < w + 0.2 && s * (p[2] - z) < mz)).toBe(false);
    }
  });

  it('stays within its vertices: under 5000 more a half than the closed base', () => {
    const o: number[] = [];
    moonbase(o);
    expect(o.length % (3 * STRIDE)).toBe(0);
    expect(o.length / STRIDE).toBeGreaterThan(4704 + 3000);
    expect(o.length / STRIDE).toBeLessThan(4704 + 5000);
  });

  it("gets none of the runner's red on the walls of the modules and the tubes: only on the crates and where a module roof stands over a tube", () => {
    const solid = BASE.filter(b => !b.ghost);
    const thin = solid.filter(
      b => Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]) < 0.41 && b.max[1] - b.min[1] > 2,
    );
    expect(thin.length).toBe(18);
    for (const b of solid) {
      const { beam, lips, stripes } = uses(MOON, b);
      expect(beam).toBe(false);
      expect(stripes).toEqual([]);
      expect(lips.length === 0 || !!b.tint || b.max[1] === 5, `${b.min} to ${b.max}`).toBe(true);
    }
  });
});

describe('moonhull, the outside of the base', () => {
  const h: number[] = [];
  hull(h);
  const pts = Array.from({ length: h.length / STRIDE }, (_, i) =>
    h.slice(i * STRIDE, (i + 1) * STRIDE),
  );
  const dist = (p: number[], c: number[]) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
  const r = (p: number[], z = 236) => Math.hypot(p[0] - 80, p[2] - z);

  it('lays seams up the dome, rings and meridians, each just proud of the shell as drawn', () => {
    const o: number[] = [];
    moonbase(o);
    /** The shell's triangles, by its paint. */
    const skin: number[][][] = [];
    for (let i = 0; i < o.length; i += 3 * STRIDE) {
      const t = [0, 1, 2].map(k => o.slice(i + k * STRIDE, i + (k + 1) * STRIDE));
      if (t.every(p => p[8] === -1 && p[6] === 0.8 && p[7] === 0.82 && r(p) < 22.5)) {
        skin.push(t);
      }
    }
    const seams = pts.filter(
      p => p[8] === -1 && p[6] === SEAM[0] && p[9] === SEAM[2] && p[1] > 5.3 && r(p) < 22.5,
    );
    expect(seams.length).toBeGreaterThan(3000);
    // How far along the line from the dome's middle a seam's corner is past the shell.
    const c = [80, 5, 236];
    const proud = (p: number[]) => {
      const d = [0, 1, 2].map(k => p[k] - c[k]);
      let best = Infinity;
      for (const [a, b, e] of skin) {
        const [u, v] = [b, e].map(q => [0, 1, 2].map(k => q[k] - a[k]));
        const x = [d[1] * v[2] - d[2] * v[1], d[2] * v[0] - d[0] * v[2], d[0] * v[1] - d[1] * v[0]];
        const det = u[0] * x[0] + u[1] * x[1] + u[2] * x[2];
        const s = [0, 1, 2].map(k => c[k] - a[k]);
        const f = (s[0] * x[0] + s[1] * x[1] + s[2] * x[2]) / det;
        const g = [s[1] * u[2] - s[2] * u[1], s[2] * u[0] - s[0] * u[2], s[0] * u[1] - s[1] * u[0]];
        const w = (d[0] * g[0] + d[1] * g[1] + d[2] * g[2]) / det;
        const t = (v[0] * g[0] + v[1] * g[1] + v[2] * g[2]) / det;
        if (f >= -1e-9 && w >= -1e-9 && f + w <= 1 + 1e-9 && t > 0) {
          best = Math.min(best, (1 - t) * Math.hypot(...d));
        }
      }
      return best;
    };
    const out = seams.filter((_, i) => i % 7 === 0).map(proud);
    expect(Math.min(...out)).toBeGreaterThan(0.008);
    expect(Math.max(...out)).toBeLessThan(0.06);
    // Eight rings round the shell, and meridians from one to the next.
    for (let j = 1; j < 9; j++) {
      const y = 5 + 12 * Math.sin((j * Math.PI) / 20);
      expect(seams.filter(p => Math.abs(p[1] - y) < 0.2).length, `${j}`).toBeGreaterThan(280);
    }
    let up = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const t = pts.slice(i, i + 3);
      const ys = t.map(p => p[1]);
      up += +(t.every(p => seams.includes(p)) && Math.max(...ys) - Math.min(...ys) > 0.8);
    }
    expect(up).toBeGreaterThan(250);
  });

  it('cuts round portholes that glow warm in dark frames, on the drum and the modules, none across a doorway, an airlock or a tube', () => {
    expect(PORTHOLES.filter(p => !p[6]).length).toBeGreaterThan(28);
    expect(PORTHOLES.filter(p => p[6])).toHaveLength(7);
    for (const [x, y, z, nx, nz, rad, deep] of PORTHOLES) {
      const c = [x + 0.015 * nx, y, z + 0.015 * nz];
      const glass = pts.filter(p => p[8] === -2 && dist(p, c) < rad + 0.05);
      // A fan of 12 sides, every corner on the circle.
      expect(glass).toHaveLength(30);
      expect(glass.every(p => Math.abs(dist(p, c) - rad) < 1e-9)).toBe(true);
      expect(
        new Set(
          glass.map(p =>
            p
              .slice(0, 3)
              .map(v => v.toFixed(6))
              .join(),
          ),
        ).size,
      ).toBe(12);
      expect(glass.every(p => p[6] > 0.5 && p[6] > 1.5 * p[9])).toBe(true);
      const frame = pts.filter(
        p => p[8] === -1 && Math.abs(dist(p, [x, y, z]) - rad - 0.1) < 1e-9 && p[6] < 0.2,
      );
      expect(frame).toHaveLength(30);
      // In blue's half too.
      expect(
        verts.filter(p => p[8] === -2 && dist(p, [c[0], y, ZED - c[2]]) < rad + 0.05),
      ).toHaveLength(30);
      const m = rad + 0.1;
      if (deep) {
        // Over a head, off every doorway of the modules and off the tubes; a pane inside as well.
        expect(y - m).toBeGreaterThan(HEAD);
        for (const { min, max } of [...LINTELS, ...TUBES]) {
          expect(
            x > min[0] - m && x < max[0] + m && z > min[2] - m && z < max[2] + m,
            `${x}, ${z}`,
          ).toBe(false);
        }
        expect(
          pts.filter(p => indoors(p) && dist(p, [x - 0.5 * nx, y, z]) < rad + 0.01),
        ).toHaveLength(30);
      } else {
        // Over the door and the tubes' mouth, and to their side.
        const t = Math.atan2(z - 236, x - 80);
        expect(y - m).toBeGreaterThan(Math.max(...MOUTHS.map(q => q[3])));
        for (const [g0, g1] of GAPS) {
          expect(t + m / 22.4 < g0 || t - m / 22.4 > g1, `${t}`).toBe(true);
        }
      }
    }
  });

  it('stands an aerial on the top of each dome: a mast, cross-bars, a red beacon that glows', () => {
    for (const z of [236, 44]) {
      const mast = verts.filter(p => r(p, z) < 0.12 && p[1] > 17.5 && p[8] === -1);
      expect(Math.min(...mast.map(p => p[1]))).toBeLessThan(18);
      expect(Math.max(...mast.map(p => p[1]))).toBeGreaterThan(TIP - 0.5);
      for (const y of [20, 21.6, 23.2]) {
        const bar = verts.filter(p => Math.abs(p[1] - y) < 0.07 && r(p, z) < 2);
        expect(Math.max(...bar.map(p => r(p, z)))).toBeGreaterThan(1);
      }
      const beacon = verts.filter(p => p[8] === -2 && dist(p, [80, TIP, z]) < 0.4);
      expect(beacon.length).toBeGreaterThanOrEqual(36);
      expect(beacon.every(p => p[6] > 1 && p[6] > 4 * p[7])).toBe(true);
    }
  });

  it("rings each dome's foot with a strip of light, open at the door and the tubes, and frames the door with another", () => {
    for (const [z, s] of [
      [236, 1],
      [44, -1],
    ]) {
      const strip = verts.filter(
        p => p[8] === -2 && p[1] > 0.1 && p[1] < 0.35 && Math.abs(r(p, z) - 22.4) < 0.06,
      );
      const at = (p: number[]) => Math.atan2(s * (p[2] - z), p[0] - 80);
      // All round: some of it in every 10 degrees.
      expect(
        new Set(strip.map(p => Math.floor((at(p) + Math.PI) / (Math.PI / 18)) % 36)).size,
      ).toBe(36);
      for (const [g0, g1] of GAPS) {
        expect(strip.some(p => at(p) > g0 && at(p) < g1)).toBe(false);
      }
      // Amber, on the portal's outer posts and beam: up both sides and across the top.
      const frame = verts.filter(
        p =>
          p[8] === -2 &&
          p[6] > 2 * p[9] &&
          Math.abs(s * (p[2] - z) + 22.655) < 0.01 &&
          Math.abs(p[0] - 80) < 2.7,
      );
      for (const side of [-1, 1]) {
        const post = frame.filter(p => side * (p[0] - 80) > 2.3);
        expect(Math.min(...post.map(p => p[1]))).toBeLessThan(0.2);
        expect(Math.max(...post.map(p => p[1]))).toBeGreaterThan(3.5);
      }
      expect(frame.some(p => Math.abs(p[0] - 80) < 2.3)).toBe(false);
      const top = frame.filter(p => p[1] > 3.3);
      expect(Math.min(...top.map(p => p[0]))).toBeLessThan(78);
      expect(Math.max(...top.map(p => p[0]))).toBeGreaterThan(82);
    }
  });

  it('keeps out of where a player goes: the door, the airlocks, the tube tops, the middle of the module roofs', () => {
    const ways = [
      [78, 0.05, 211, 82, 3, 217],
      [116.8, 0.05, 227, 119.2, HEAD, 233],
      [101.8, 0.05, 193, 104.2, HEAD, 199],
      ...TUBES.map(({ min, max }) => [
        min[0] + 0.3,
        3.56,
        min[2] + 0.3,
        max[0] - 0.3,
        7,
        max[2] - 0.3,
        // Up to the dome's wall, which the second tube's box runs into.
        22.6,
      ]),
      ...MODULES.map(({ min, max }) => [
        min[0] + 2.5,
        5.05,
        min[2] + 2.5,
        max[0] - 2.5,
        9,
        max[2] - 2.5,
      ]),
    ];
    // Every corner of every triangle, the middle of its sides and its own.
    const probes = [];
    for (let i = 0; i < pts.length; i += 3) {
      const [a, b, c] = pts.slice(i, i + 3);
      const mid = (...l: number[][]) =>
        [0, 1, 2].map(k => l.reduce((n, p) => n + p[k], 0) / l.length);
      probes.push(a, b, c, mid(a, b), mid(b, c), mid(c, a), mid(a, b, c));
    }
    expect(probes.length).toBeGreaterThan(20000);
    for (const [x0, y0, z0, x1, y1, z1, wall = 0] of ways) {
      expect(
        probes.filter(
          p =>
            p[0] > x0 &&
            p[0] < x1 &&
            p[1] > y0 &&
            p[1] < y1 &&
            p[2] > z0 &&
            p[2] < z1 &&
            r(p) > wall,
        ),
        `${x0}, ${y0}, ${z0}`,
      ).toHaveLength(0);
    }
    // The probe finds what does stand by: the hoops on a tube's top, the dish at a roof's corner.
    expect(probes.some(p => p[0] > 103 && p[0] < 110 && p[1] > 3.5 && p[1] < 3.56)).toBe(true);
    expect(probes.some(p => p[0] > 122.5 && p[1] > 6 && p[2] < 225)).toBe(true);
  });

  it('stays within its vertices: under 10,700 a half, whole triangles of finite numbers', () => {
    expect(h.length % (3 * STRIDE)).toBe(0);
    expect(h.every(Number.isFinite)).toBe(true);
    expect(pts.length).toBeGreaterThan(8000);
    expect(pts.length).toBeLessThan(10700);
  });
});

describe('furnishing', () => {
  const world = build(MOON);
  const keys = palette(world).map(String);
  const f = furnishing(MOON, keys);
  const pts = Array.from({ length: f.length / STRIDE }, (_, i) =>
    f.slice(i * STRIDE, (i + 1) * STRIDE),
  );

  it('is all indoors, mirrored: the indoor normal on every vertex, as many in each half', () => {
    expect(f.length % (3 * STRIDE)).toBe(0);
    expect(f.every(Number.isFinite)).toBe(true);
    expect(pts.every(indoors)).toBe(true);
    const red = pts.filter(p => p[2] > ZED / 2).length;
    expect(red).toBe(pts.length / 2);
    expect(red).toBeGreaterThan(3000);
  });

  it("draws each flag's dais in its team's tint, textured as the hall's fittings", () => {
    for (const [team, { base }] of MOON.teams.entries()) {
      const tint = 2 * keys.indexOf(`${TEAM_TINT[team]}`);
      expect(tint).toBeGreaterThan(0);
      const top = pts.filter(
        p => p[1] === base[1] && Math.hypot(p[0] - base[0], p[2] - base[2]) < 6.1 && p[8] >= 0,
      );
      // The dais's top and the upper edges of its four sides, 4.25 m out each way.
      expect(top).toHaveLength(18);
      expect(top.every(p => Math.floor(p[9] / 2) * 2 === tint)).toBe(true);
    }
  });

  it('draws every piece of the lab kit on its box, in both halves, with lights on it', () => {
    for (const [, x0, z0, x1, z1, y0, y1] of KIT) {
      for (const m of [(z: number) => z, (z: number) => ZED - z]) {
        const [za, zb] = [m(z0), m(z1)].sort((a, b) => a - b);
        const near = pts.filter(
          p =>
            p[0] > x0 - 0.3 &&
            p[0] < x1 + 0.3 &&
            p[2] > za - 0.3 &&
            p[2] < zb + 0.3 &&
            p[1] >= y0 - 0.01 &&
            p[1] < y1 + 2,
        );
        expect(near.length, `${x0}, ${z0}`).toBeGreaterThan(30);
        expect(near.some(p => p[8] === -2)).toBe(true);
      }
    }
  });
});

describe('moonbase, the doorways as drawn', () => {
  const all = scenery(build(MOON));
  type P = [number, number, number];
  /** The triangles round each base: three corners each. */
  const tris: P[][] = [];
  for (let i = 0; i < all.length; i += 3 * STRIDE) {
    const t = [0, 1, 2].map((k): P => {
      const j = i + k * STRIDE;
      return [all[j], all[j + 1], all[j + 2]];
    });
    if (t.every(p => p[0] > 55 && p[0] < 128 && Math.abs(Math.abs(p[2] - ZED / 2) - 87) < 37)) {
      tris.push(t);
    }
  }
  const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: P, b: P): P => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  /** Whether a triangle crosses the segment from a to b (Möller and Trumbore). */
  const crossed = (a: P, b: P) => {
    const d = sub(b, a);
    return tris.some(([p, q, r]) => {
      const [e, f] = [sub(q, p), sub(r, p)];
      const h = cross(d, f);
      const det = dot(e, h);
      if (Math.abs(det) < 1e-12) {
        return false;
      }
      const s = sub(a, p);
      const u = dot(s, h) / det;
      const g = cross(s, e);
      const w = dot(d, g) / det;
      const t = dot(f, g) / det;
      return u >= 0 && w >= 0 && u + w <= 1 && t >= 0 && t <= 1;
    });
  };
  /** Lines of sight in red's base, each (x, y, z) to (x, y, z), tried in blue's too. */
  const clear = (lines: number[][]) => {
    for (const [x0, y0, z0, x1, y1, z1] of lines) {
      for (const m of [(z: number) => z, (z: number) => ZED - z]) {
        expect(crossed([x0, y0, m(z0)], [x1, y1, m(z1)]), `${x0}, ${y0}, ${z0}`).toBe(false);
      }
    }
  };
  const HEIGHTS = [0.4, 1.3, 2.2];

  it('keeps enough of the scene to mean it: a line through the wall of the dome is crossed', () => {
    expect(tris.length).toBeGreaterThan(5000);
    expect(crossed([70, 1.5, 211.5], [70, 1.5, 219])).toBe(true);
    expect(crossed([80, 3.2, 211.5], [80, 3.2, 219])).toBe(true);
    expect(crossed([70, 1.5, ZED - 211.5], [70, 1.5, ZED - 219])).toBe(true);
  });

  it('draws no wall across the door of the dome, from the flag pad to the hall', () => {
    clear([78.6, 80, 81.4].flatMap(x => HEIGHTS.map(y => [x, y, 211.5, x, y, 219])));
  });

  it("draws no wall across the tubes' mouth, the first tube and the door of its module, from the hall to the module", () => {
    clear([224.2, 225.2, 226.2].flatMap(z => HEIGHTS.map(y => [94.5, y, z, 113, y, z])));
  });

  it('draws no wall across the second tube and the door of its module, from where the tubes meet to the module', () => {
    clear([99, 100, 101].flatMap(x => HEIGHTS.map(y => [x, y, 225, x, y, 202])));
  });

  it('draws no wall across the airlocks', () => {
    clear([
      ...[117.2, 118, 118.8].flatMap(x => HEIGHTS.map(y => [x, y, 228, x, y, 232])),
      ...[102.2, 103, 103.8].flatMap(x => HEIGHTS.map(y => [x, y, 198, x, y, 194])),
    ]);
  });

  it("keeps the tubes' round and their ribs out of the corridors: nothing from wall to wall near the floor", () => {
    clear([
      ...[104, 107.15].flatMap(x => [0.3, 0.7].map(y => [x, y, 223.8, x, y, 226.6])),
      ...[210, 214.15].flatMap(z => [0.3, 0.7].map(y => [98.6, y, z, 101.4, y, z])),
    ]);
  });
});
