import { describe, expect, it } from 'vitest';
import { BEACH, ENGINES, FRAME, HULL, ZED } from '../shared/beach';
import { HIGHLINE } from '../shared/map';
import { MAPS } from '../shared/maps';
import { STRIDE } from './mesh';
import { FRAG, fragOf } from './render';
import { SEA } from './shore';
import { BANDS, FIRES, PLUME, SLICES, SMOKE, plumes } from './smoke';

const v = plumes(BEACH);
/** Each vertex: x, y, z, the normal, c.x, c.y, the layer, c.w. */
const verts = Array.from({ length: v.length / STRIDE }, (_, i) =>
  v.slice(i * STRIDE, (i + 1) * STRIDE),
);
/** The smoke's vertices of column `id`, or its flames'. */
/** The vertices of a ball. */
const PER = SLICES * (2 * BANDS - 2) * 3;
const of = (id: number, flame: number) => verts.filter(p => p[7] === id && p[9] === flame);

describe('the fires', () => {
  it('burn on each torn engine in both halves and at the hull’s four broken ends', () => {
    expect(FIRES).toHaveLength(8);
    for (const [x, z] of ENGINES) {
      for (const side of [z, ZED - z]) {
        expect(FIRES.some(f => Math.hypot(f[0] - x, f[2] - side) < 5.5)).toBe(true);
      }
    }
    const ends = HULL.sections.flat().slice(1, -1);
    expect(
      FIRES.filter(f => f[2] === ZED / 2)
        .map(f => f[0])
        .sort((a, b) => a - b)
        .map(Math.round),
    ).toEqual(ends.map((x, i) => Math.round(x + (i % 2 ? -0.6 : 0.6))));
  });

  it('are the same in both halves: each has its twin across the centre line', () => {
    for (const [x, y, z, ...rest] of FIRES) {
      expect(FIRES).toContainEqual([x, y, ZED - z, ...rest]);
    }
  });

  it('leave the hull’s smoke thinner and lower than the engines’', () => {
    const [engine, end] = [FIRES[0], FIRES.at(-1)!];
    expect(end[3]).toBeLessThan(engine[3]);
    expect(end[5]).toBeLessThan(engine[5]);
    // Over the heads of those who cross a gap on foot.
    expect(end[1]).toBeGreaterThan(5);
  });
});

describe('plumes', () => {
  it('are whole triangles on the smoke’s layer, built once', () => {
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(verts.every(p => p[8] === SMOKE)).toBe(true);
    expect(v.every(Number.isFinite)).toBe(true);
    expect(plumes(BEACH)).toBe(v);
  });

  it('cost under 15,000 vertices', () => {
    expect(PER).toBe(90);
    expect(verts.length).toBeLessThan(15000);
    expect(verts.length).toBeGreaterThan(5000);
  });

  it('give every vertex a unit normal, how far up its column it is and its column', () => {
    for (const p of verts) {
      expect(Math.hypot(p[3], p[4], p[5])).toBeCloseTo(1, 6);
      expect(p[6]).toBeGreaterThanOrEqual(-1e-9);
      expect(p[6]).toBeLessThanOrEqual(1.3);
      expect(FIRES[p[7]]).toBeDefined();
    }
  });

  it('rise from each fire’s foot to its height, wider as they go, leaning inland', () => {
    FIRES.forEach(([x, y, , tall, r0, r1], id) => {
      const s = of(id, 0);
      const ys = s.map(p => p[1]);
      expect(Math.min(...ys)).toBeGreaterThan(y - r0 - 0.01);
      expect(Math.max(...ys)).toBeGreaterThan(y + tall * 0.9);
      expect(Math.max(...ys)).toBeLessThan(y + tall + r1);
      const [low, high] = [s.filter(p => p[6] < 0.1), s.filter(p => p[6] > 0.9)];
      const span = (ps: number[][]) =>
        Math.max(...ps.map(p => p[0])) - Math.min(...ps.map(p => p[0]));
      const mid = (ps: number[][]) => ps.reduce((sum, p) => sum + p[0], 0) / ps.length;
      expect(span(high)).toBeGreaterThan(span(low) * 2);
      expect(mid(high)).toBeGreaterThan(x + 10);
      expect(Math.abs(mid(low) - x)).toBeLessThan(2);
    });
  });

  it('overlap: no ball of a column is clear of the one under it', () => {
    FIRES.forEach((f, id) => {
      // A ball's vertices come together: its lowest point is under the top of the one before.
      const s = of(id, 0);
      const per = PER;
      expect(s.length % per).toBe(0);
      expect(s.length / per).toBeGreaterThan(f[3] / 6);
      for (let b = 1; b < s.length / per; b++) {
        const top = Math.max(...s.slice((b - 1) * per, b * per).map(p => p[1]));
        const foot = Math.min(...s.slice(b * per, (b + 1) * per).map(p => p[1]));
        expect(foot).toBeLessThan(top);
      }
    });
  });

  it('stand three small flames at each foot, under 3 m tall', () => {
    FIRES.forEach(([x, y, z], id) => {
      const s = of(id, 1);
      expect(s).toHaveLength(3 * PER);
      for (const p of s) {
        expect(Math.hypot(p[0] - x, p[2] - z)).toBeLessThan(2);
        expect(p[1]).toBeGreaterThan(y - 0.3);
        expect(p[1]).toBeLessThan(y + 3);
      }
    });
  });

  it('stay clear of the camps and inside the map’s frame at their feet', () => {
    for (const [x, , z] of FIRES) {
      expect(x).toBeGreaterThan(FRAME.sea);
      expect(x).toBeLessThan(FRAME.east);
      expect(Math.abs(z - ZED / 2)).toBeLessThan(50);
    }
  });
});

describe('what the smoke costs a pixel', () => {
  it('is compiled into Landfall’s land only', () => {
    const code = PLUME('0.');
    expect(FRAG).toContain(code.slice(0, 40));
    expect(fragOf(MAPS.landfall, 'LAND')).toContain('#define BEACH');
    for (const def of [HIGHLINE, MAPS.tranquility]) {
      expect(fragOf(def, 'LAND')).not.toContain('#define BEACH');
    }
    expect(fragOf(MAPS.landfall, 'FLESH')).not.toContain('#define BEACH');
    // Every line of it lies between the scene's `#ifdef BEACH` and its `#endif`.
    const at = FRAG.indexOf(code.slice(0, 40));
    const before = FRAG.slice(0, at);
    expect(before.lastIndexOf('#ifdef BEACH')).toBeGreaterThan(before.lastIndexOf('#endif'));
  });

  it('is told from the sea by its layer, under it, and casts no shadow', () => {
    expect(SMOKE).toBeLessThan(SEA - 0.5);
    expect(FRAG).toContain(`if(L<${SMOKE + 0.5}){`);
    expect(FRAG.indexOf(`if(L<${SMOKE + 0.5}){`)).toBeLessThan(FRAG.indexOf('if(L<-4.5){'));
    expect(SMOKE).toBeLessThan(-2.5);
  });

  it('moves by the time alone and lets no NaN out: no pow(), no division but by the distance to the eye', () => {
    const code = PLUME('0.');
    expect(code).toContain('T*');
    expect(code).not.toContain('pow(');
    expect(code.match(/\//g)).toHaveLength(1);
    expect(code).toContain('V/ds');
  });
});
