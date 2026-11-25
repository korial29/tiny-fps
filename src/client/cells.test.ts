import { describe, expect, it } from 'vitest';
import { MAPS } from '../shared/maps';
import { build } from '../shared/world';
import { spawn } from '../shared/physics';
import type { Vec3 } from './mesh';
import { CELL, cells, seen } from './cells';
import { STRIDE } from './mesh';
import { scenery, sunAt, sunProj, viewProj } from './render';

const def = MAPS.highline;
const world = build(def);
const ground = scenery(world);
const end = ground.length / STRIDE;
const runs = cells(ground, end);
const sun = def.sun.dir.map(v => v / Math.hypot(...def.sun.dir)) as Vec3;
/** The view and the sun's window from each team's spawns, looking out and across. */
const passes = [0, 1, 2, 3].flatMap(s => {
  const p = spawn(1, world, s, s % 2);
  return [p.yaw, p.yaw + Math.PI / 2].flatMap(yaw => {
    const eye: Vec3 = [p.x, p.y + 1.6, p.z];
    return [viewProj(eye, yaw, -0.08, 16 / 9), sunProj(sun, sunAt(eye, yaw))];
  });
});
/** Whether every corner of triangle `t` is outside one same plane of the clip volume of `m`. */
const outside = (m: Float32Array, t: number) => {
  const clip = [0, 1, 2].map(k => {
    const o = (t * 3 + k) * STRIDE;
    const [x, y, z] = [ground[o], ground[o + 1], ground[o + 2]];
    return [0, 1, 2, 3].map(r => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
  });
  return [0, 1, 2].some(i => clip.every(c => c[i] > c[3]) || clip.every(c => c[i] < -c[3]));
};
/** The triangles the draws of `m` leave out. */
const left = (m: Float32Array) => {
  const out = new Int32Array(runs.n * 2);
  const n = seen(runs, m, out);
  const drawn = new Uint8Array(end / 3);
  for (let i = 0; i < n; i++) {
    drawn.fill(1, out[i * 2] / 3, (out[i * 2] + out[i * 2 + 1]) / 3);
  }
  return { n, out, drawn };
};

describe('cells', () => {
  it('cuts the map into runs of whole triangles, in their order, each within its bounds', () => {
    expect(runs.n).toBeGreaterThan(100);
    let at = 0;
    for (let r = 0; r < runs.n; r++) {
      expect(runs.first[r]).toBe(at);
      expect(runs.count[r] % 3).toBe(0);
      at += runs.count[r];
      for (let v = runs.first[r]; v < at; v++) {
        for (let a = 0; a < 3; a++) {
          const x = ground[v * STRIDE + a];
          expect(x).toBeGreaterThanOrEqual(runs.box[r * 6 + a]);
          expect(x).toBeLessThanOrEqual(runs.box[r * 6 + 3 + a]);
        }
      }
    }
    expect(at).toBe(end);
  });

  it('keeps a run within a cell unless one of its triangles is bigger', () => {
    for (let r = 0; r < runs.n; r++) {
      const b = runs.box.subarray(r * 6, r * 6 + 6);
      const span = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) - 0.02;
      if (span > CELL) {
        // Its biggest triangle spans most of it.
        let big = 0;
        for (let t = runs.first[r] / 3; t < (runs.first[r] + runs.count[r]) / 3; t++) {
          const xs = [0, 1, 2].map(k => (t * 3 + k) * STRIDE);
          const ext = [0, 1, 2].map(
            a => Math.max(...xs.map(o => ground[o + a])) - Math.min(...xs.map(o => ground[o + a])),
          );
          big = Math.max(big, ...ext);
        }
        expect(span).toBeLessThanOrEqual(big * 1.25 + 1e-3);
      }
    }
  });

  it('leaves out only triangles wholly outside the frustum: what is drawn is the same', () => {
    for (const m of passes) {
      const { drawn } = left(m);
      for (let t = 0; t < end / 3; t++) {
        if (!drawn[t]) {
          expect(outside(m, t)).toBe(true);
        }
      }
    }
  });

  it('draws a small share of the map into the sun’s window, and less than all of it in view', () => {
    const share = (m: Float32Array) => {
      const { drawn } = left(m);
      return drawn.reduce((s, d) => s + d, 0) / drawn.length;
    };
    for (let i = 0; i < passes.length; i += 2) {
      expect(share(passes[i])).toBeLessThan(0.8);
      expect(share(passes[i + 1])).toBeLessThan(0.1);
    }
  });

  it('draws through short gaps between the runs seen, in few draws', () => {
    for (const m of passes) {
      const { n, out } = left(m);
      expect(n).toBeLessThan(30);
      for (let i = 1; i < n; i++) {
        expect(out[i * 2]).toBeGreaterThan(out[i * 2 - 2] + out[i * 2 - 1] + 3000);
      }
    }
  });

  it('counts a face lying on a frustum plane as in it', () => {
    // A floor at y = 0 seen by an orthographic window whose bottom plane is y = 0.
    const tri = [0, 0, 0, 1, 0, 0, 0, 0, 1].flatMap((x, i) =>
      i % 3 == 2 ? [x, 0, 0, 0, 0, 0, 0, 0] : [x],
    );
    const c = cells(tri, 3);
    const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1]);
    const out = new Int32Array(2);
    expect(seen(c, m, out)).toBe(1);
  });
});
