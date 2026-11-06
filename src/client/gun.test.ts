import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { GUN_RANGE } from '../shared/constants';
import { build } from '../shared/world';
import { MUZZLE, REAR, TILT, aimed, focus, grip, gun, held, pointed, readout, tip } from './gun';
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

  it('has a smooth top: no ridge, plate or fin over the body, and rings enough round it', () => {
    // The highest point is the body's own top; every vertex above the grip stays within 4 mm of it.
    const topY = Math.max(...near.map(v => v.p[1]));
    expect(topY).toBeLessThan(0.15);
    // Round the body there are at least 12 sides: its widest ring has 12 vertices at one place.
    const ring = near.filter(v => Math.abs(v.p[2] - 0.005) < 1e-9 && v.layer == -1);
    expect(ring.length).toBeGreaterThanOrEqual(12);
    // No sharp edge on top: the normals of the top vertices all face up.
    const crest = near.filter(v => v.p[1] > 0.135 && v.layer == -1);
    expect(crest.length).toBeGreaterThan(20);
    for (const v of crest) {
      expect(v.n[1]).toBeGreaterThan(0.7);
    }
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

describe('the long axis', () => {
  /** The model's back of the body and emitter carried by axes `ax` at the grip `at`: the gun's long axis in the world. */
  const axis = (at: Vec3, ax: Vec3[]): { from: Vec3; dir: Vec3 } => {
    const [, u, f] = ax;
    const rear = [0, 1, 2].map(i => at[i] + u[i] * REAR[1] - f[i] * REAR[2]);
    const e = tip(at, ax);
    return { from: e, dir: [e[0] - rear[0], e[1] - rear[1], e[2] - rear[2]] };
  };
  const angle = (a: number[], b: number[]) =>
    (Math.acos(
      Math.min(
        1,
        (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)),
      ),
    ) *
      180) /
    Math.PI;

  it.each([[[0, 0, 4]], [[0, 0, 80]], [[3, 1, 6]], [[-5, -2, 30]], [[0, 9, 10]]] as [Vec3][])(
    'points from the back of the body through the emitter at the target %j, wherever the grip is',
    to => {
      for (const at of [
        [0.3, -0.2, 0.45],
        [0.2, -0.17, 0.42],
        [-0.3, -0.1, 0.5],
      ] as Vec3[]) {
        const ax = pointed(at, to, [1, 0, 0], [0, 1, 0]);
        const { from, dir } = axis(at, ax);
        expect(
          angle(
            dir,
            to.map((v, i) => v - from[i]),
          ),
        ).toBeLessThan(0.1);
        // An orthonormal frame, up still up and right still right.
        for (const a of ax) {
          expect(Math.hypot(...a)).toBeCloseTo(1, 6);
        }
        expect(ax[0][0] * ax[1][0] + ax[0][1] * ax[1][1] + ax[0][2] * ax[1][2]).toBeCloseTo(0, 6);
        expect(ax[1][1]).toBeGreaterThan(0.6);
        expect(ax[0][0]).toBeGreaterThan(0.85);
      }
    },
  );

  it('does not depend on the handedness of the space: the camera space (a mirror of the world) gives the same angle', () => {
    const ax = pointed([0.27, -0.22, 0.42], [0, 0, 5], [1, 0, 0], [0, 1, 0]);
    expect(ax[1][1]).toBeGreaterThan(0.9);
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
  const far: Vec3 = [4, 3.6, -86];

  it('holds the gun out ahead of the eye, a little right and below it', () => {
    const [at] = aimed(p(), far);
    expect(at[0]).toBeCloseTo(4.2, 6);
    expect(at[1]).toBeCloseTo(2 + 1.6 - 0.17, 6);
    expect(at[2]).toBeCloseTo(-6.42, 6);
  });

  it('points the gun at the target, near or far: the beam from its emitter to it is along its long axis', () => {
    for (const to of [far, [6, 3, -9], [1, 3.6, -3.5], [4, 20, -20]] as Vec3[]) {
      const [at, ax] = aimed(p({ yaw: 0.4, pitch: 0.1 }), to);
      const e = tip(at, ax);
      const rear = [0, 1, 2].map(i => at[i] + ax[1][i] * REAR[1] - ax[2][i] * REAR[2]);
      const [a, b] = [[0, 1, 2].map(i => e[i] - rear[i]), [0, 1, 2].map(i => to[i] - e[i])];
      expect(
        (Math.acos(
          (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)),
        ) *
          180) /
          Math.PI,
      ).toBeLessThan(0.1);
    }
  });

  it('follows the pitch: looking up raises the muzzle', () => {
    const [a, ax] = aimed(p(), far);
    const to: Vec3 = [4, 40, -80];
    const [b, bx] = aimed(p({ pitch: 0.5 }), to);
    expect(tip(b, bx)[1]).toBeGreaterThan(tip(a, ax)[1] + 0.1);
  });
});

describe('focus', () => {
  const world = build({
    brushes: [{ min: [-10, -5, -30], max: [10, 10, -20], top: 0, side: 0 }],
    teams: [
      { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
      { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
    ],
    floor: -25,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  });
  const man = (o: Partial<PlayerState>): PlayerState => ({
    id: 1,
    x: 0,
    y: 0,
    z: 0,
    vy: 0,
    yaw: 0,
    pitch: 0,
    ground: true,
    ...STILL,
    ...o,
  });

  it('is the first wall along the look from the eye, or the range in the open', () => {
    const [near, hit] = focus(man({}), world);
    expect(hit).toBe(true);
    expect(near[2]).toBeCloseTo(-20, 3);
    const [open, out] = focus(man({ yaw: Math.PI }), world);
    expect(out).toBe(false);
    expect(open[2]).toBeCloseTo(GUN_RANGE, 3);
  });
});

describe('the readout on the back of the gun', () => {
  const v = (n: number) => verts(readout(n));
  const SEGS = [6, 2, 5, 5, 4, 5, 6, 3, 7, 6];

  it('is two digits of thin glowing quads, a pair of triangles to a segment', () => {
    for (const n of [0, 7, 40, 59, 60, 99]) {
      const [a, b] = `${n}`.padStart(2, '0');
      expect(v(n)).toHaveLength((SEGS[+a] + SEGS[+b]) * 6);
    }
  });

  it('is unlit and glowing (layer -2, above 1 for the bloom), cyan above ten and red at ten and under', () => {
    for (const x of v(40)) {
      expect(x.layer).toBe(-2);
      expect(x.c[2]).toBeGreaterThan(x.c[0] * 2);
      expect(Math.max(...x.c)).toBeGreaterThan(1);
    }
    for (const n of [10, 5, 0]) {
      for (const x of v(n)) {
        expect(x.layer).toBe(-2);
        expect(x.c[0]).toBeGreaterThan(x.c[1] * 3);
      }
    }
    expect(v(11)[0].c[0]).toBeLessThan(v(11)[0].c[2]);
  });

  it('lies on the back of the top of the body, within its width, facing up and back toward the player', () => {
    for (const x of v(88)) {
      expect(Math.abs(x.p[0])).toBeLessThan(0.03);
      expect(x.p[2]).toBeGreaterThan(0);
      expect(x.p[2]).toBeLessThan(0.06);
      expect(x.p[1]).toBeGreaterThan(0.115);
      expect(x.p[1]).toBeLessThan(0.15);
      expect(x.n[1]).toBeGreaterThan(0.3);
      // The back of the gun is +z.
      expect(x.n[2]).toBeGreaterThan(0);
    }
  });

  it('shows a different number differently, and the same number the same', () => {
    expect(readout(12)).toBe(readout(12));
    expect(readout(12)).not.toEqual(readout(21));
    expect(readout(12)).not.toEqual(readout(13));
  });

  it('reads left to right as the player sees it from behind: the tens on the left', () => {
    const x = (n: number) => v(n).map(q => q.p[0]);
    expect(Math.min(...x(10))).toBeLessThan(-0.009);
    // 1 is two bars on the right of its digit: all of the left digit's marks are left of the right one's.
    const left = v(10).filter(q => q.p[0] < -0.001);
    expect(left.length).toBeGreaterThan(0);
    expect(Math.max(...left.map(q => q.p[0]))).toBeLessThan(0.002);
    expect(Math.max(...x(10))).toBeGreaterThan(0.01);
  });

  it('is clamped to two digits and to zero', () => {
    expect(readout(250)).toBe(readout(99));
    expect(readout(-3)).toBe(readout(0));
  });

  it('is drawn with the gun when given the ammo, and not without', () => {
    const [a, b, c] = [0, 1, 2].map(() => [] as number[]);
    held(a, [0, 0, 0], IDENT, 1);
    held(b, [0, 0, 0], IDENT, 1, 1, 30);
    held(c, [0, 0, 0], IDENT, 0, 1, 30);
    expect(b.length).toBe(a.length + readout(30).length);
    expect(c.length).toBeGreaterThan(readout(30).length);
  });
});
