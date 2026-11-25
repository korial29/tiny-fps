import { describe, expect, it } from 'vitest';
import { BEACH, HOLD, HULL, LAYOUT, RINGS, ZED } from '../shared/beach';
import { TEAM_TINT } from '../shared/map';
import { TEX } from '../shared/types';
import { hulk, parts } from './hulk';
import { STRIDE } from './mesh';

const MID = ZED / 2;
const made = parts(BEACH);
const count = (v: number[]) => v.length / STRIDE;
/** A part's vertices, one array each. */
const verts = (v: number[]) =>
  Array.from({ length: count(v) }, (_, i) => v.slice(i * STRIDE, (i + 1) * STRIDE));
const of = (kind: string) => LAYOUT.pieces.filter(p => p.kind === kind);

/** How far a point is from the surface of the nearest of `boxes`, inside or out. */
const gap = (p: number[], boxes: { min: number[]; max: number[] }[]) =>
  Math.min(
    ...boxes.map(({ min, max }) => {
      const d = [0, 1, 2].map(i => Math.max(min[i] - p[i], p[i] - max[i]));
      const out = Math.hypot(...d.map(v => Math.max(v, 0)));
      return out > 0 ? out : -Math.max(...d);
    }),
  );

describe('hulk', () => {
  it('is the same every time: whole triangles of finite numbers, their normals unit', () => {
    const v = hulk(BEACH);
    expect(v).toEqual(hulk(BEACH));
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < v.length; i += STRIDE) {
      expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 5);
    }
    expect(v.length).toBe(Object.values(made).reduce((n, p) => n + p.length, 0));
  });

  it('keeps each part within its share: under 80,000 vertices in all', () => {
    expect(count(made.hull)).toBeLessThan(26_000);
    expect(count(made.hold)).toBeLessThan(3_000);
    expect(count(made.wings)).toBeLessThan(3_000);
    expect(count(made.debris)).toBeLessThan(16_000);
    expect(count(made.camps)).toBeLessThan(8_000);
    expect(count(hulk(BEACH))).toBeLessThan(80_000);
  });

  it('draws on boxes the level leaves out: every piece of the map is a ghost', () => {
    for (const p of LAYOUT.pieces) {
      const b = BEACH.brushes.find(e =>
        e.min.every((v, i) => v === p.min[i] && e.max[i] === p.max[i]),
      );
      expect(b?.ghost, `${p.kind} at ${p.min}`).toBe(true);
    }
  });

  it('keeps the hull’s painted skin within 0.3 m of the boxes a body touches, clear of its ends', () => {
    const boxes = [...of('hull'), ...of('hold')];
    let worst = 0;
    for (const [x0, x1] of HULL.sections) {
      const skin = verts(made.hull).filter(
        v =>
          v[8] === TEX.PAINT && v[0] > x0 + 0.01 && v[0] < x1 - 0.01 && Math.abs(v[2] - MID) < 6.6,
      );
      expect(skin.length).toBeGreaterThan(2_000);
      for (const v of skin) {
        worst = Math.max(worst, Math.abs(gap(v, boxes)));
      }
    }
    expect(worst).toBeLessThan(0.3);
  });

  it('draws the walked back of each section where its flat top is, facing up', () => {
    HULL.sections.forEach(([x0, x1], n) => {
      const y = HULL.axis[n] + HULL.r;
      const back = verts(made.hull).filter(
        v =>
          v[8] === TEX.PAINT &&
          v[4] > 0.99 &&
          Math.abs(v[1] - y) < 1e-9 &&
          v[0] >= x0 &&
          v[0] <= x1,
      );
      const xs = back.map(v => v[0]);
      const zs = back.map(v => v[2] - MID);
      expect([Math.min(...xs), Math.max(...xs)]).toEqual([x0, x1]);
      // 0.3 m short of the back's edge on each side, where its corner is cut.
      expect(Math.min(...zs)).toBeCloseTo(-RINGS[3][1] + 0.3, 9);
      expect(Math.max(...zs)).toBeCloseTo(RINGS[3][1] - 0.3, 9);
    });
  });

  it('leaves the hold’s side doors open in the skin and floors the hold', () => {
    const { door, floor, lintel, half } = HOLD;
    const skin = verts(made.hull);
    /** The skin's triangles on a flank between the floor and the lintel whose middle is between two x. */
    const flank = (x0: number, x1: number) =>
      skin.filter((v, i) => {
        const t = skin.slice(i - (i % 3), i - (i % 3) + 3);
        const at = [0, 1, 2].map(k => (t[0][k] + t[1][k] + t[2][k]) / 3);
        return (
          i % 3 === 0 &&
          v[8] === TEX.PAINT &&
          Math.abs(Math.abs(at[2] - MID) - RINGS[0][1]) < 1e-9 &&
          at[0] > x0 &&
          at[0] < x1 &&
          at[1] > floor &&
          at[1] < floor + lintel
        );
      }).length;
    expect(flank(door[0], door[1])).toBe(0);
    expect(flank(door[0] - 1.5, door[0])).toBe(4);
    expect(flank(door[1], door[1] + 1.5)).toBe(4);
    const shut = verts(made.hull).filter(
      v => v[8] === TEX.PAINT && v[1] === floor && (v[0] === door[0] || v[0] === door[1]),
    );
    expect(shut.length).toBeGreaterThan(0);
    const grate = verts(made.hold).filter(v => v[8] === TEX.GRATE && v[1] === floor);
    expect(Math.max(...grate.map(v => Math.abs(v[2] - MID)))).toBeCloseTo(RINGS[0][1], 9);
    expect(grate.some(v => Math.abs(v[2] - MID) === half)).toBe(true);
  });

  it('lays each wing’s top on the line of its steps’ upper edges: a foot sinks a step at most and never floats', () => {
    for (const red of [true, false]) {
      const steps = of('wing').filter(p => p.min[2] > MID === red);
      const top = verts(made.wings).filter(
        v =>
          v[8] === TEX.PAINT && v[4] > 0.9 && v[2] > MID === red && v[1] > steps[0].max[1] - 1e-9,
      );
      expect(top.length).toBeGreaterThanOrEqual(6 * steps.length);
      const rise = steps[1].max[1] - steps[0].max[1];
      expect(rise).toBeCloseTo(0.466, 2);
      /** The drawn top's height where it crosses z: between the two edges it runs straight. */
      const drawn = (z: number) => {
        const d = (v: number[]) => Math.abs(v[2] - z);
        return top.reduce((a, v) => (d(v) < d(a) ? v : a))[1];
      };
      for (const p of steps) {
        const [near, far] = red ? [p.max[2], p.min[2]] : [p.min[2], p.max[2]];
        expect(drawn(near)).toBeCloseTo(p.max[1], 9);
        expect(drawn(far) - p.max[1]).toBeGreaterThan(-1e-9);
        expect(drawn(far) - p.max[1]).toBeLessThan(rise + 1e-9);
      }
    }
  });

  it('draws every piece of debris and of the camps on its box, twins alike', () => {
    const all = [...verts(made.debris), ...verts(made.camps)];
    const kinds = [
      'heap',
      'frame',
      'raft',
      'engine',
      'float',
      'pod',
      'dais',
      'crate',
      'panel',
      'container',
      'gear',
      'shelter',
    ];
    for (const kind of kinds) {
      const n = of(kind).map(
        ({ min, max }) =>
          all.filter(v => [0, 1, 2].every(i => v[i] > min[i] - 0.06 && v[i] < max[i] + 0.06))
            .length,
      );
      expect(Math.min(...n), kind).toBeGreaterThanOrEqual(24);
    }
    // Red's and blue's are twins: as many vertices on each side of the line.
    for (const part of [made.camps, made.wings]) {
      const red = verts(part).filter(v => v[2] > MID).length;
      expect(red * 2).toBe(count(part));
    }
  });

  it('paints each camp in its team’s colour: the flag’s step, the tarpaulins, the pod’s band', () => {
    TEAM_TINT.forEach((tint, k) => {
      const mine = verts(made.camps).filter(v => v[8] === -1 && v[2] > MID === !k);
      const hue = (v: number[]) => [v[6], v[7], v[9]].map(c => c / Math.max(v[6], v[7], v[9]));
      const want = tint.map(c => c / Math.max(...tint));
      const team = mine.filter(v => hue(v).every((c, i) => Math.abs(c - want[i]) < 1e-6));
      // Two tarpaulins of 288 vertices, the step's top twice, the band of eight faces, two lids.
      expect(team.length).toBeGreaterThanOrEqual(2 * 288 + 12 + 48 + 12);
    });
  });
});
