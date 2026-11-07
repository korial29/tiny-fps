import { describe, expect, it } from 'vitest';
import { CUTS } from '../shared/constants';
import { CUT, SPECIAL_CUT } from '../shared/types';
import { grip } from './gun';
import {
  BASE,
  BEHIND,
  GUARD,
  TIP,
  arcs,
  axes,
  cutting,
  ends,
  fingers,
  held,
  katana,
  progress,
  stroke,
  trunk,
  sword,
  whirl,
} from './katana';
import { STRIDE, dot, unit } from './mesh';
import type { Vec3 } from './mesh';
import { axis, mul, turn } from './rig';
import type { Quat } from './rig';

interface Vert {
  p: Vec3;
  n: Vec3;
  c: number[];
  layer: number;
}
const verts = (v: number[]): Vert[] =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const k = i * STRIDE;
    return {
      p: [v[k], v[k + 1], v[k + 2]],
      n: [v[k + 3], v[k + 4], v[k + 5]],
      c: [v[k + 6], v[k + 7], v[k + 9]],
      layer: v[k + 8],
    };
  });
const [near, far] = [verts(katana(1)), verts(katana(0))];
const range = (v: Vert[], k: number) => [
  Math.min(...v.map(x => x.p[k])),
  Math.max(...v.map(x => x.p[k])),
];
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const away = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The place `t` of the way from the blade's root to its point, where the model has a ring. */
const along = (t: number) => BASE + (TIP - BASE) * t;
/** A hand turned by a quaternion that is not the identity, at a place. */
const Q: Quat = mul(axis([0, 1, 0], 0.7), axis([1, 0, 0], -0.4));

describe('the katana model', () => {
  it('is built once per level of detail, in whole triangles with finite unit normals', () => {
    expect(katana(1)).toBe(katana(1));
    for (const v of [near, far]) {
      expect(v.length % 3).toBe(0);
      for (const x of v) {
        expect([...x.p, ...x.n, ...x.c].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...x.n)).toBeCloseTo(1);
      }
    }
    expect(far.length).toBeLessThan(near.length * 0.7);
    expect(near.length).toBeLessThan(5000);
  });

  it('is a metre from the guard to the point, 1.3 m from the pommel, pointing to -z', () => {
    const [back, front] = range(near, 2);
    expect(back).toBeCloseTo(-TIP, 2);
    // The guard's face is 6.3 cm ahead of the right hand.
    expect(TIP - 0.063).toBeGreaterThan(0.98);
    expect(TIP - 0.063).toBeLessThan(1.03);
    expect(front - back).toBeGreaterThan(1.25);
    expect(front - back).toBeLessThan(1.35);
    // Two hands of grip behind the guard, with a gap between them.
    expect(front).toBeGreaterThan(BEHIND + 0.08);
    expect(front).toBeLessThan(0.25);
  });

  it('has a slightly curved blade as a katana is: the point rises toward the spine, the edge on the outside of the curve', () => {
    const blade = near.filter(v => v.layer == -1 && v.p[2] < -BASE - 0.01);
    const [a, b, c] = [0.07, 0.44, 0.9].map(along);
    const at = (z: number) => blade.filter(v => Math.abs(v.p[2] + z) < 0.005);
    const [root, mid, point] = [a, b, c].map(z => mean(at(z).map(v => v.p[1])));
    // A few centimetres of bend, not a bow.
    expect(point - root).toBeGreaterThan(0.015);
    expect(point - root).toBeLessThan(0.05);
    // The middle is below the chord from the root to the point: the curve is convex on the edge side.
    expect(mid).toBeLessThan(root + ((point - root) * (b - a)) / (c - a) - 0.003);
  });

  it('is a flat blade nearly 4 cm tall, under a centimetre thick, and tapers to a point', () => {
    const blade = near.filter(v => v.layer == -1 && v.p[2] < -BASE - 0.01);
    const section = (z: number) => {
      const v = blade.filter(x => Math.abs(x.p[2] + z) < 0.005);
      return [range(v, 0), range(v, 1)].map(([a, b]) => b - a);
    };
    const [wide, tall] = section(along(0.17));
    expect(wide).toBeGreaterThan(0.007);
    expect(wide).toBeLessThan(0.01);
    expect(tall).toBeGreaterThan(0.035);
    expect(tall).toBeLessThan(0.045);
    // Narrower toward the point, which is one place.
    expect(section(along(0.96))[1]).toBeLessThan(tall * 0.8);
    const tip = blade.filter(v => v.p[2] < -TIP + 1e-6);
    expect(tip.length).toBeGreaterThan(0);
    for (const v of tip) {
      expect(away(v.p, tip[0].p)).toBeLessThan(1e-6);
    }
  });

  it('has a ridge: the faces of a blade section are not all one way', () => {
    const blade = near.filter(v => v.layer == -1 && Math.abs(v.p[2] + along(0.44)) < 0.005);
    const sides = blade.filter(v => Math.abs(v.n[0]) > 0.9);
    // The lower face of a side leans down, the upper one up: the ridge between them.
    const lean = sides.map(v => v.n[1]);
    expect(Math.max(...lean)).toBeGreaterThan(0.05);
    expect(Math.min(...lean)).toBeLessThan(-0.1);
  });

  it('glows cyan along its edge: unlit, above 1 for the bloom, just under the blade', () => {
    const glow = near.filter(v => v.layer == -2);
    expect(glow.length).toBeGreaterThan(300);
    const edge = glow.filter(v => v.p[2] < -BASE - 0.05);
    expect(edge.length).toBeGreaterThan(200);
    for (const v of glow) {
      expect(v.c[1]).toBeGreaterThan(1);
      expect(v.c[2]).toBeGreaterThan(v.c[0] * 2);
    }
    // The lit metal never reaches 1: it does not bloom.
    for (const v of near.filter(x => x.layer == -1)) {
      expect(Math.max(...v.c)).toBeLessThanOrEqual(1);
    }
    // Along the blade the glow is under the steel at the same place.
    const at = (v: Vert[], z: number) =>
      mean(v.filter(x => Math.abs(x.p[2] + z) < 0.01).map(x => x.p[1]));
    const steel = near.filter(v => v.layer == -1 && v.p[2] < -BASE - 0.01);
    expect(at(edge, along(0.44))).toBeLessThan(at(steel, along(0.44)));
  });

  it('has a rounded guard across the blade, a wrapped grip for two hands and a pommel cap', () => {
    const guard = near.filter(
      v => v.p[2] < -0.045 && v.p[2] > -0.07 && Math.hypot(v.p[0], v.p[1]) > 0.025,
    );
    expect(guard.length).toBeGreaterThan(20);
    // Round or rounded square: about 7 cm across, equally wide each way.
    const [x, y] = [range(guard, 0), range(guard, 1)];
    expect(x[1] - x[0]).toBeGreaterThan(0.06);
    expect(x[1] - x[0]).toBeLessThan(0.085);
    expect((y[1] - y[0]) / (x[1] - x[0])).toBeGreaterThan(0.85);
    expect((y[1] - y[0]) / (x[1] - x[0])).toBeLessThan(1.15);
    // The grip: a few centimetres thick, over 25 cm long, in two colours.
    const handle = near.filter(v => v.layer == -1 && v.p[2] > -0.05 && v.p[2] < 0.2);
    expect(range(handle, 2)[1] - range(handle, 2)[0]).toBeGreaterThan(0.24);
    expect(Math.max(...handle.map(v => Math.hypot(v.p[0], v.p[1])))).toBeLessThan(0.03);
    expect(new Set(handle.map(v => v.c.join())).size).toBeGreaterThanOrEqual(2);
    // The pommel is past the second hand.
    expect(range(near, 2)[1]).toBeGreaterThan(BEHIND + 0.08);
  });

  it('has its normals outward on the blade and the grip, wound the way they say', () => {
    const lit = near.filter(v => v.layer == -1);
    let checked = 0;
    for (let i = 0; i < near.length; i += 3) {
      const [a, b, c] = [near[i], near[i + 1], near[i + 2]];
      if (a.layer != -1 || a.p[2] < -along(0.95) || a.p[2] > 0.2) {
        continue;
      }
      const [u, w] = [b, c].map(q => [0, 1, 2].map(k => q.p[k] - a.p[k]));
      const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      expect(f[0] * a.n[0] + f[1] * a.n[1] + f[2] * a.n[2]).toBeGreaterThan(0);
      // Away from the axis of its ring: the mean of the vertices of the part at that place.
      const ring = lit.filter(v => Math.abs(v.p[2] - a.p[2]) < 0.004);
      const centre = [mean(ring.map(v => v.p[0])), mean(ring.map(v => v.p[1]))];
      const mid = [0, 1].map(k => (a.p[k] + b.p[k] + c.p[k]) / 3 - centre[k]);
      expect(a.n[0] * mid[0] + a.n[1] * mid[1]).toBeGreaterThanOrEqual(-1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe('the crackle', () => {
  const at: Vec3 = [1, 2, 3];
  const ax: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ];
  const drawn = (t: number, lod = 1) => {
    const out: number[] = [];
    arcs(out, at, ax, t, lod);
    return verts(out);
  };

  it('is cyan light, unlit, above 1, in a handful of thin zigzags along the blade', () => {
    let most = 0;
    for (let t = 0; t < 2; t += 0.07) {
      const v = drawn(t);
      expect(v.length % 3).toBe(0);
      expect(v.length).toBeLessThanOrEqual(4 * 4 * 12);
      most = Math.max(most, v.length);
      for (const x of v) {
        expect(x.layer).toBe(-2);
        expect(x.c[1]).toBeGreaterThan(1);
        // Along the blade: in front of the grip, within 5 cm of its line (z is forward here).
        expect(-(x.p[2] - at[2])).toBeGreaterThan(0.05);
        expect(-(x.p[2] - at[2])).toBeLessThan(TIP);
        expect(Math.hypot(x.p[0] - at[0], x.p[1] - at[1])).toBeLessThan(0.06);
      }
    }
    expect(most).toBeGreaterThan(48);
    expect(drawn(0.4, 0).length).toBeLessThan(drawn(0.4, 1).length + 1);
  });

  it('flickers with the clock and repeats for the same one', () => {
    expect(drawn(0.5)).toEqual(drawn(0.5));
    // Within a 70 ms step it holds still; across steps it is another shape.
    expect(drawn(0.5)).toEqual(drawn(0.52));
    const shapes = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(drawn(i * 0.075))));
    expect(shapes.size).toBeGreaterThan(10);
  });

  it('is part of the sword when it is given a clock, and not when it is not', () => {
    const [still, live] = [0, 1].map(i => {
      const out: number[] = [];
      sword(out, at, ax, 1, i ? 0.4 : undefined);
      return out.length;
    });
    expect(live).toBeGreaterThan(still);
    expect(still).toBe(katana(1).length);
  });
});

describe('the sword in a hand', () => {
  const pos: Vec3 = [0.3, 1.2, -0.5];

  it('has the grip in the hand, the back of the hand to its right', () => {
    const [r, u, f] = axes(Q);
    expect(away(r, turn(Q, [1, 0, 0]))).toBeLessThan(1e-9);
    for (const a of [r, u, f]) {
      expect(Math.hypot(...a)).toBeCloseTo(1);
    }
    expect(dot(r, u)).toBeCloseTo(0);
    expect(dot(u, f)).toBeCloseTo(0);
    // Right handed, as place() wants: up is right cross forward.
    const x = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    expect(away(x as Vec3, u)).toBeLessThan(1e-9);
    // The handle where the right hand puts the grip: the vertices of the handle near the origin are centred on it.
    const out: number[] = [];
    held(out, pos, Q, 1);
    const handle = verts(out).filter(v => {
      const d = [0, 1, 2].map(k => v.p[k] - grip(pos, Q)[k]);
      const along = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
      return Math.abs(along) < 0.03 && v.layer == -1;
    });
    expect(handle.length).toBeGreaterThan(20);
    const c = [0, 1, 2].map(k => mean(handle.map(v => v.p[k]))) as Vec3;
    expect(away(c, grip(pos, Q))).toBeLessThan(0.006);
    // The fingers point where the sword's inverse says.
    expect(away(fingers(axes(Q)), turn(Q, [0, -1, 0]))).toBeLessThan(1e-9);
  });

  it('puts the blade in front of the hand: the root and the point on its forward axis', () => {
    const [base, tip] = ends(pos, Q);
    const [, u, f] = axes(Q);
    const at = grip(pos, Q);
    expect(away(base, at.map((v, i) => v + f[i] * BASE) as Vec3)).toBeLessThan(1e-9);
    const d = tip.map((v, i) => v - at[i]);
    expect(Math.hypot(...d)).toBeGreaterThan(TIP - 0.02);
    expect(Math.hypot(...d)).toBeLessThan(TIP + 0.01);
    // It is the model's point: the model's last vertex, carried to the world.
    const out: number[] = [];
    held(out, pos, Q, 1);
    const far = verts(out).reduce((m, v) => (away(v.p, at) > away(m.p, at) ? v : m));
    expect(away(far.p, tip)).toBeLessThan(0.003);
    // The bend takes the point a little toward the spine, above the line of the blade.
    expect(dot(d as Vec3, u)).toBeGreaterThan(0);
  });

  it('scales about the grip', () => {
    const [a, b] = [1, 0.5].map(k => {
      const out: number[] = [];
      held(out, pos, Q, 1, undefined, k);
      return verts(out);
    });
    const at = grip(pos, Q);
    expect(away(b[100].p, at)).toBeCloseTo(away(a[100].p, at) / 2, 6);
  });
});

/** The point of the sword in camera space for a stroke at p: the grip and 81 cm along the blade. */
const tipAt = (cut: number, p: number): Vec3 => {
  const k = stroke(cut, p);
  const l = Math.hypot(k[3], k[4], k[5]);
  return [0, 1, 2].map(i => k[i] + (TIP * k[3 + i]) / l) as Vec3;
};
const strikeOf = (cut: number) => CUTS[cut].strike / CUTS[cut].ticks;
const steps = (a: number, b: number, n = 40) =>
  Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

describe('the cuts', () => {
  it('start and end in the guard, the same for all of them, the blade rising ahead from the bottom of the view', () => {
    for (const cut of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH]) {
      for (const p of [0, 1]) {
        stroke(cut, p)
          .slice(0, 6)
          .forEach((v, i) => expect(v).toBeCloseTo(GUARD[i], 9));
      }
    }
    const tip = tipAt(CUT.THRUST, 0);
    expect(Math.abs(tip[0])).toBeLessThan(0.4);
    expect(tip[1]).toBeGreaterThan(0.45);
    expect(tip[2]).toBeGreaterThan(1);
    // The hands low, a quarter of a metre under the eye.
    expect(GUARD[1]).toBeLessThan(-0.2);
  });

  it('swings the whole arms: the hands go round a wide arc, within the reach of both arms', () => {
    // The shoulders in the keys' space, which turns with the chest (trunk(), body.ts): they stay
    // where they are in it. And the reach of an arm to the grip.
    const [right, left]: Vec3[] = [
      [0.19, -0.17, -0.08],
      [-0.19, -0.17, -0.08],
    ];
    for (const cut of Object.values(CUT)) {
      const path = steps(0, 1).map(p => stroke(cut, p).slice());
      for (const k of path) {
        const g = unit([k[3], k[4], k[5]]);
        const l: Vec3 = [k[0] - BEHIND * g[0], k[1] - BEHIND * g[1], k[2] - BEHIND * g[2]];
        // An arm and a fist, and the shoulder coming forward and the trunk bending toward a long
        // reach (wield(), trunk()): roughly here, exactly in body.test's grip through every cut.
        expect(away([k[0], k[1], k[2]], right)).toBeLessThan(0.7);
        expect(away(l, left)).toBeLessThan(0.7);
        expect(k[2]).toBeGreaterThan(0.08);
      }
      // How far the hands travel in each direction over the cut.
      const span = [0, 1, 2].map(
        i => Math.max(...path.map(k => k[i])) - Math.min(...path.map(k => k[i])),
      );
      const base = cut % SPECIAL_CUT;
      if (base === CUT.LEFT || base === CUT.RIGHT) {
        expect(span[0]).toBeGreaterThan(0.45);
      } else if (base === CUT.SLASH) {
        expect(span[1]).toBeGreaterThan(0.38);
      } else {
        expect(span[2]).toBeGreaterThan(0.15);
      }
    }
    // Up over the shoulder the cut comes from, and out low at the other side.
    expect(stroke(CUT.LEFT, 0.24)[0]).toBeLessThan(-0.15);
    expect(stroke(CUT.LEFT, 0.5)[0]).toBeGreaterThan(0.2);
    expect(stroke(CUT.RIGHT, 0.24)[0]).toBeGreaterThan(0.2);
    expect(stroke(CUT.RIGHT, 0.5)[0]).toBeLessThan(-0.05);
    expect(stroke(CUT.SLASH, 0.28)[1]).toBeGreaterThan(0);
  });

  it('aims at the middle of the view at the strike: high and to the left, which the straight wrists bring onto the crosshair', () => {
    // The point the keys aim at; where it goes is body.test's: the arms' grip (lock()) lowers it.
    for (const cut of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH]) {
      const [x, y, z] = tipAt(cut, strikeOf(cut));
      expect(Math.abs(x)).toBeLessThan(0.35);
      expect(Math.abs(y)).toBeLessThan(0.3);
      expect(z).toBeGreaterThan(1.1);
    }
  });

  it('thrusts straight forward: the hands come back, the point lunges out to its longest at the strike and holds there', () => {
    const s = strikeOf(CUT.THRUST);
    const z = (p: number) => tipAt(CUT.THRUST, p)[2];
    // Pulled back: the grip comes 15 cm toward the body.
    expect(stroke(CUT.THRUST, 0.3)[2]).toBeLessThan(GUARD[2] - 0.15 + 1e-9);
    // Out: forward all the way from the pull to the strike.
    steps(0.3, s)
      .slice(1)
      .forEach((p, i, all) => expect(z(p)).toBeGreaterThan(z(all[i - 1] ?? 0.3) - 1e-9));
    // (by 6 cm in the keys: the arms carry the point on further, see body.test)
    expect(z(s) - z(0.3)).toBeGreaterThan(0.06);
    const longest = Math.max(...steps(0, 1, 200).map(z));
    expect(z(s)).toBeGreaterThan(longest - 0.05);
    // Further out than the guard, and held a beat: the point stays within 7 cm for a fifth of the swing.
    expect(z(s)).toBeGreaterThan(z(0) + 0.05);
    for (const p of steps(s, s + 0.2, 10)) {
      expect(away(tipAt(CUT.THRUST, p), tipAt(CUT.THRUST, s))).toBeLessThan(0.07);
    }
    // The point stays near the line of the look all through the lunge.
    for (const p of steps(0.3, s + 0.2)) {
      expect(Math.abs(tipAt(CUT.THRUST, p)[0])).toBeLessThan(0.2);
    }
  });

  it('cuts across from out at one side to out at the other', () => {
    for (const [cut, sign] of [
      [CUT.LEFT, 1],
      [CUT.RIGHT, -1],
    ]) {
      const s = strikeOf(cut);
      const at = (p: number) => tipAt(cut, p);
      const x = (p: number) => sign * at(p)[0];
      // Wound up out at the side it comes from, level with the hands, not ahead of them.
      expect(x(0.24)).toBeLessThan(-0.8);
      expect(at(0.24)[2]).toBeLessThan(0.4);
      // The follow-through out at the other side and a little low, out to the side and not round
      // behind, where the straight wrists cannot hold it.
      expect(x(0.5)).toBeGreaterThan(0.8);
      expect(at(0.62)[1]).toBeLessThan(-0.3);
      // Across, in one go: never back, from the widest of the wind-up to the farthest across.
      const path = steps(s - 0.07, 0.5).map(x);
      path.forEach((v, i) => i && expect(v).toBeGreaterThanOrEqual(path[i - 1] - 1e-6));
      expect(x(s - 0.05)).toBeLessThan(x(s));
      expect(x(s)).toBeLessThan(x(s + 0.05));
    }
  });

  it('slashes down from above the head through the middle of the view: from high to low', () => {
    const s = strikeOf(CUT.SLASH);
    const y = (p: number) => tipAt(CUT.SLASH, p)[1];
    // Raised over the head: the point high and behind the eye, the hands up at its height.
    expect(y(0.28)).toBeGreaterThan(0.5);
    expect(tipAt(CUT.SLASH, 0.28)[2]).toBeLessThan(-0.4);
    expect(stroke(CUT.SLASH, 0.28)[1]).toBeGreaterThan(0);
    // Then down, never back up, to far below the view.
    expect(y(0.6)).toBeLessThan(-0.9);
    const path = steps(0.34, 0.55).map(y);
    path.forEach((v, i) => i && expect(v).toBeLessThanOrEqual(path[i - 1] + 1e-6));
    expect(y(s - 0.04)).toBeGreaterThan(0.1);
    expect(y(s + 0.04)).toBeLessThan(-0.1);
    // Down the middle, not across (the strike aimed a little left, for the straight wrists).
    for (const p of steps(0.13, 0.66)) {
      expect(Math.abs(tipAt(CUT.SLASH, p)[0])).toBeLessThan(0.35);
    }
  });

  it('winds up before the strike, goes fastest through it and recovers after', () => {
    for (const cut of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH]) {
      const { ticks, strike } = CUTS[cut];
      const pts = Array.from({ length: ticks + 1 }, (_, i) => tipAt(cut, i / ticks));
      const speed = pts.slice(1).map((q, i) => away(q, pts[i]));
      // The fastest tick is within four of the strike: the swing is quickest there.
      const fastest = speed.indexOf(Math.max(...speed)) + 0.5;
      expect(Math.abs(fastest - strike)).toBeLessThanOrEqual(4);
      // The recovery, the last third, is slow.
      const end = speed.slice(-Math.floor(ticks / 3));
      expect(end.reduce((a, b) => a + b, 0) / end.length).toBeLessThan(Math.max(...speed) * 0.5);
      expect(speed.at(-1)!).toBeLessThan(Math.max(...speed) * 0.2);
      // More of the swing is after the strike than before: it recovers.
      expect(ticks - strike).toBeGreaterThan(strike);
    }
  });

  it('never has a blade direction near zero, and every number is finite', () => {
    for (const cut of [0, 1, 2, 3]) {
      for (const p of steps(0, 1, 60)) {
        const k = stroke(cut, p);
        expect(k.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(k[3], k[4], k[5])).toBeGreaterThan(0.35);
        expect(Math.hypot(k[3], k[4], k[5])).toBeLessThan(1.2);
      }
    }
  });

  it('turns the blade smoothly, even in the widest swings', () => {
    for (const cut of [0, 1, 2, 3]) {
      let was: Vec3 | undefined;
      for (const p of steps(0, 1, 400)) {
        const k = stroke(cut, p);
        const l = Math.hypot(k[3], k[4], k[5]);
        const d = [k[3] / l, k[4] / l, k[5] / l] as Vec3;
        if (was) {
          expect(Math.acos(Math.min(dot(was, d), 1))).toBeLessThan(0.15);
        }
        was = d;
      }
    }
  });

  it('cuts from the right the other way round, its blade pointing the other way', () => {
    const [l, r] = [CUT.LEFT, CUT.RIGHT].map(c => stroke(c, 0.3).slice());
    expect(r[0]).toBeGreaterThan(GUARD[0]);
    expect(l[0]).toBeLessThan(GUARD[0]);
    expect(r[3]).toBeCloseTo(-l[3], 1);
    expect(r[5]).toBeCloseTo(l[5], 1);
  });
});

describe('whirl', () => {
  it('turns the body a full turn over a spin, right for the spin from the left, left for the other', () => {
    expect(whirl(CUT.SPIN_L, 0)).toBeCloseTo(0, 9);
    expect(whirl(CUT.SPIN_L, 1)).toBeCloseTo(-2 * Math.PI, 9);
    expect(whirl(CUT.SPIN_R, 1)).toBeCloseTo(2 * Math.PI, 9);
    expect(whirl(CUT.SPIN_L, 0.5)).toBeLessThan(-1);
    // Smoothly, never back, and still while the blade winds up and follows through.
    const path = steps(0, 1).map(p => whirl(CUT.SPIN_L, p));
    path.forEach((v, i) => i && expect(v).toBeLessThanOrEqual(path[i - 1] + 1e-9));
    expect(whirl(CUT.SPIN_L, 0.25)).toBeCloseTo(0, 9);
    expect(whirl(CUT.SPIN_L, 0.8)).toBeCloseTo(-2 * Math.PI, 9);
  });

  it('does not turn any other cut', () => {
    for (const cut of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH, CUT.LUNGE, CUT.LEAP]) {
      for (const p of steps(0, 1, 10)) {
        expect(whirl(cut, p)).toBe(0);
      }
    }
  });
});

describe('the trunk through a cut', () => {
  const ALL = Object.values(CUT);

  it('is still in the guard, at the start and the end of every cut', () => {
    for (const cut of ALL) {
      for (const p of [0, 1]) {
        trunk(cut, p).forEach(v => expect(v).toBeCloseTo(0, 9));
      }
    }
  });

  it('coils the way a cut across winds up, then unwinds hard through the strike', () => {
    // From the left: turned left over the wind-up, right through the follow-through.
    expect(trunk(CUT.LEFT, 0.24)[0]).toBeGreaterThan(0.4);
    expect(trunk(CUT.LEFT, 0.6)[0]).toBeLessThan(-0.4);
    // From the right: the other way round.
    expect(trunk(CUT.RIGHT, 0.24)[0]).toBeLessThan(-0.4);
    expect(trunk(CUT.RIGHT, 0.6)[0]).toBeGreaterThan(0.4);
    // The chest leans after the blade.
    expect(trunk(CUT.LEFT, 0.6)[2]).toBeLessThan(0);
  });

  it('arches back over a slash and folds over after it', () => {
    expect(trunk(CUT.SLASH, 0.28)[1]).toBeLessThan(-0.2);
    expect(trunk(CUT.SLASH, 0.6)[1]).toBeGreaterThan(0.35);
    expect(trunk(CUT.LEAP, 0.85)[1]).toBeGreaterThan(0.35);
  });

  it('draws the right shoulder back for a thrust, then drives it out with a lean into the point', () => {
    for (const cut of [CUT.THRUST, CUT.LUNGE]) {
      const s = CUTS[cut].strike / CUTS[cut].ticks;
      expect(trunk(cut, s * 0.7)[0]).toBeLessThan(0);
      expect(trunk(cut, s)[0]).toBeGreaterThan(0.3);
      expect(trunk(cut, s)[1]).toBeGreaterThan(0.15);
    }
  });
});

describe('progress', () => {
  const p = (swing: number, cut: number = CUT.LEFT) => ({ swing, cut });

  it('is -1 when it is not cutting, 0 at the start and counts the ticks', () => {
    expect(progress(-1, p(0), 0.016)).toBe(-1);
    expect(progress(0.5, {}, 0.016)).toBe(-1);
    const t = CUTS[CUT.LEFT].ticks;
    expect(progress(-1, p(t), 0.016)).toBe(0);
    expect(progress(-1, p(t / 2), 0.016)).toBe(0.5);
  });

  it('runs on with the time between the ticks, never behind the count nor more than two ticks ahead of it', () => {
    const t = CUTS[CUT.LEFT].ticks;
    let was = progress(-1, p(t - 5), 0);
    for (let i = 0; i < 20; i++) {
      was = progress(was, p(t - 5), 1 / 240);
      const at = 5 / t;
      expect(was).toBeGreaterThanOrEqual(at - 1e-9);
      expect(was).toBeLessThanOrEqual(at + 2 / t + 1e-9);
    }
    // A slow frame still stops at two ticks.
    expect(progress(was, p(t - 5), 1)).toBeCloseTo(5 / t + 2 / t);
    // Never past the end.
    expect(progress(0.99, p(1), 1)).toBe(1);
    // Behind the count: it catches up at once.
    expect(progress(0.1, p(t - 15), 0.001)).toBeCloseTo(15 / t, 2);
  });

  it('starts again at once with a new swing', () => {
    const t = CUTS[CUT.SLASH].ticks;
    expect(progress(0.95, p(t, CUT.SLASH), 0.016)).toBeLessThan(2 / t + 1e-9);
  });

  it('draws the trail only through the cut, not the wind-up nor the recovery', () => {
    expect(cutting(0)).toBe(false);
    // Still winding up behind the shoulder or over the head.
    expect(cutting(0.2)).toBe(false);
    for (const c of [0, 1, 2, 3]) {
      expect(cutting(strikeOf(c))).toBe(true);
    }
    expect(cutting(0.55)).toBe(true);
    expect(cutting(0.9)).toBe(false);
  });
});
