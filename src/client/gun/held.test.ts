import { describe, expect, it } from 'vitest';
import { STILL } from '../../shared/physics';
import type { PlayerState } from '../../shared/types';
import { GUN_RANGE } from '../../shared/constants';
import { build } from '../../shared/world';
import { MUZZLE, REAR, TILT, aimed, battery, focus, grip, held, pointed, tip } from '../gun';
import { STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import { axis, turn } from '../rig';
import type { Quat } from '../rig';
import { IDENT, knob, near, verts } from './testing';

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

  it('carries the model there, after its battery: its vertices are the model, turned and moved', () => {
    const at = grip([1, 2, 3], IDENT);
    const all = hand(IDENT);
    const vs = all.slice(battery(1).length / STRIDE, battery(1).length / STRIDE + near.length);
    // After the model, its button, and nothing else.
    expect(all).toHaveLength(battery(1).length / STRIDE + near.length + knob(0).length / STRIDE);
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
