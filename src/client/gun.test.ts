import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { MUZZLE, TILT, aimed, grip, gun, held, tip } from './gun';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { axis, turn } from './rig';
import type { Quat } from './rig';

interface Vertex {
  p: Vec3;
  n: Vec3;
  c: number[];
  layer: number;
}
const verts = (v: number[]): Vertex[] =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const r = v.slice(i * STRIDE, (i + 1) * STRIDE);
    return {
      p: r.slice(0, 3) as Vec3,
      n: r.slice(3, 6) as Vec3,
      c: [r[6], r[7], r[9]],
      layer: r[8],
    };
  });
const near = verts(gun(1));
const far = verts(gun(0));
const IDENT: Quat = [0, 0, 0, 1];

describe('the gun model', () => {
  it('stays within the budget: a gun near is a few hundred triangles, one far about half of that', () => {
    expect(near.length).toBeGreaterThan(400);
    expect(near.length).toBeLessThan(2600);
    expect(near.length % 3).toBe(0);
    expect(far.length).toBeGreaterThan(300);
    expect(far.length).toBeLessThan(near.length * 0.75);
  });

  it('is built once per level', () => {
    expect(gun(1)).toBe(gun(1));
    expect(gun(0)).not.toBe(gun(1));
  });

  it('is finite, with unit normals', () => {
    for (const v of [...near, ...far]) {
      expect([...v.p, ...v.n, ...v.c].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...v.n)).toBeCloseTo(1, 3);
    }
  });

  it('has its normals on the outside of every triangle: lit from its faces, not its insides', () => {
    for (let i = 0; i < near.length; i += 3) {
      const [a, b, c] = [near[i], near[i + 1], near[i + 2]];
      const [u, w] = [0, 1, 2].map(k => [b.p[k] - a.p[k], c.p[k] - a.p[k]]);
      const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const area = Math.hypot(...f);
      if (area > 1e-7) {
        // The mean of the vertex normals agrees with the face the triangle is wound to.
        const n = [0, 1, 2].map(k => a.n[k] + b.n[k] + c.n[k]);
        expect(f[0] * n[0] + f[1] * n[1] + f[2] * n[2]).toBeGreaterThan(0);
      }
    }
  });

  it('is violet metal with cyan glow: unlit parts above 1 for the bloom, lit parts below it', () => {
    const glow = near.filter(v => v.layer == -2);
    const metal = near.filter(v => v.layer == -1);
    expect(glow.length).toBeGreaterThan(60);
    expect(metal.length + glow.length).toBe(near.length);
    for (const v of glow) {
      // Cyan: green and blue over red.
      expect(v.c[1]).toBeGreaterThan(1);
      expect(v.c[2]).toBeGreaterThan(v.c[0] * 2);
    }
    for (const v of metal) {
      expect(Math.max(...v.c)).toBeLessThanOrEqual(1);
    }
    // Most of the metal is violet: more blue than red, and red over green.
    const violet = metal.filter(v => v.c[2] > v.c[0] && v.c[0] > v.c[1]);
    expect(violet.length).toBeGreaterThan(metal.length * 0.7);
    // The finish is iridescent: the metal is not one colour.
    const reds = metal.map(v => v.c[0]);
    expect(Math.max(...reds) - Math.min(...reds)).toBeGreaterThan(0.1);
  });

  it('is about a hand and a half long, with the muzzle at the front between two jaws', () => {
    const [x, y, z] = [0, 1, 2].map(k => [
      Math.min(...near.map(v => v.p[k])),
      Math.max(...near.map(v => v.p[k])),
    ]);
    expect(z[1] - z[0]).toBeGreaterThan(0.22);
    expect(z[1] - z[0]).toBeLessThan(0.35);
    expect(y[1] - y[0]).toBeGreaterThan(0.15);
    expect(y[1] - y[0]).toBeLessThan(0.3);
    expect(x[1] - x[0]).toBeLessThan(0.12);
    // The muzzle is ahead of everything but the jaw tips, and the middle of the grip is the origin.
    expect(z[0]).toBeLessThan(MUZZLE[2]);
    expect(
      Math.min(
        ...near.map(v => Math.hypot(v.p[0] - MUZZLE[0], v.p[1] - MUZZLE[1], v.p[2] - MUZZLE[2])),
      ),
    ).toBeLessThan(0.03);
    // A jaw each side: the prongs are apart where the emitter sits.
    const front = near.filter(v => v.p[2] < -0.17 && v.layer == -1);
    expect(Math.min(...front.map(v => v.p[0]))).toBeLessThan(-0.008);
    expect(Math.max(...front.map(v => v.p[0]))).toBeGreaterThan(0.008);
  });
});

describe('the hand that holds it', () => {
  const hand = (q: Quat) => {
    const out: number[] = [];
    held(out, [1, 2, 3], q, 1);
    return verts(out);
  };

  it('puts the middle of the grip 8 cm along the fingers and 2 cm to the palm from the wrist', () => {
    // A hand turned by nothing: fingers down (-y), the back of the hand to the right (+x).
    expect(grip([1, 2, 3], IDENT)).toEqual(
      [1 - 0.022, 2 - 0.078, 3].map(v => expect.closeTo(v, 6)),
    );
  });

  it('carries the model there: its vertices are the model, turned and moved', () => {
    const at = grip([1, 2, 3], IDENT);
    const vs = hand(IDENT);
    expect(vs).toHaveLength(near.length);
    vs.forEach((v, i) => {
      // Distances from the grip are kept.
      expect(Math.hypot(...v.p.map((x, k) => x - at[k]))).toBeCloseTo(Math.hypot(...near[i].p), 4);
    });
  });

  it('holds the gun level when the hand is turned as the body does for it: the fingers along the gun, tilted', () => {
    // The gun's up is the thumb tipped back by the grip's rake; its forward the other way.
    const [s, c] = TILT;
    const q = axis([1, 0, 0], 0.7);
    const [th, fing] = [turn(q, [0, 0, -1]), turn(q, [0, -1, 0])];
    const out: number[] = [];
    held(out, [0, 0, 0], q, 1);
    const at = grip([0, 0, 0], q);
    // The muzzle vertex of the model, carried by the hand, is where tip() says on the gun's axes.
    const forward = th.map((v, i) => s * v + c * fing[i]);
    const up = th.map((v, i) => c * v - s * fing[i]);
    const want = [0, 1, 2].map(i => at[i] + up[i] * MUZZLE[1] - forward[i] * MUZZLE[2]);
    const vs = verts(out);
    const nearest = Math.min(...vs.map(v => Math.hypot(...v.p.map((x, k) => x - want[k]))));
    expect(nearest).toBeLessThan(0.03);
  });

  it('has its muzzle ahead of the grip along the gun', () => {
    const ax: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
    expect(tip([0, 0, 0], ax)).toEqual([0, MUZZLE[1], MUZZLE[2]].map(v => expect.closeTo(v, 6)));
  });

  it('shrinks about the grip: scaled by 0 it is a point there', () => {
    const out: number[] = [];
    held(out, [1, 2, 3], IDENT, 1, 0);
    const at = grip([1, 2, 3], IDENT);
    for (const v of verts(out)) {
      expect(v.p.every((x, k) => Math.abs(x - at[k]) < 1e-9)).toBe(true);
    }
  });
});

describe('aimed', () => {
  const p = (o: Partial<PlayerState> = {}): PlayerState => ({
    id: 1,
    x: 4,
    y: 2,
    z: -6,
    vy: 0,
    yaw: 0,
    pitch: 0,
    ground: true,
    ...STILL,
    ...o,
  });

  it('holds the gun out ahead of the eye, a little right and below, along the look', () => {
    const [at, [r, u, f]] = aimed(p());
    expect(at[0]).toBeCloseTo(4.2, 6);
    expect(at[1]).toBeCloseTo(2 + 1.6 - 0.17, 6);
    expect(at[2]).toBeCloseTo(-6.42, 6);
    expect(f).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6), expect.closeTo(-1, 6)]);
    expect(r[0]).toBeCloseTo(1, 6);
    expect(u[1]).toBeCloseTo(1, 6);
  });

  it('follows the pitch: looking up raises the muzzle', () => {
    const [a] = aimed(p());
    const [b, ax] = aimed(p({ pitch: 0.6 }));
    expect(b[1]).toBeGreaterThan(a[1] - 0.2);
    expect(tip(b, ax)[1]).toBeGreaterThan(tip(a, aimed(p())[1])[1] + 0.1);
  });
});
