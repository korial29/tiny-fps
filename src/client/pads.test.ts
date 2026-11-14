import { describe, expect, it } from 'vitest';
import { STRIDE } from './mesh';
import { AFT, BAND, BELL, COLLAR_CLOTH, CROWN, FORE, GOLD, LAME_QUADS, LAMES, pads } from './pads';
import { JOINT as J, rest, solve } from './rig';
import { body, palette, skin } from './skin';

describe("pads, the ninja's shoulder pads and collar", () => {
  const pose = solve(rest());
  const out: number[] = [];
  pads(out, pose, 0, [0.9, 0.1, 0.1]);
  const pts = Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, i * STRIDE + STRIDE),
  );
  const [arm, neck] = [pose.pos[J.ARM_R], pose.pos[J.NECK]];

  it('is whole triangles of finite points and unit normals, wound the way they face', () => {
    expect(pts.length % 3).toBe(0);
    for (let i = 0; i < pts.length; i += 3) {
      const [a, b, c] = [pts[i], pts[i + 1], pts[i + 2]];
      expect([...a, ...b, ...c].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(a[3], a[4], a[5])).toBeCloseTo(1, 3);
      const [e, f] = [b.map((v, j) => v - a[j]), c.map((v, j) => v - a[j])];
      const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
      // Its corners turn about its normal: a piece mirrored without its order swapped would fail.
      expect(n[0] * a[3] + n[1] * a[4] + n[2] * a[5]).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('is the same on both shoulders, its points out past the arms and over their joints', () => {
    const xs = pts.map(p => p[0]);
    expect(Math.max(...xs)).toBeCloseTo(-Math.min(...xs), 6);
    expect(Math.max(...xs)).toBeGreaterThan(arm[0] + 0.07);
    const tip = pts.find(p => p[0] == Math.max(...xs))!;
    expect(tip[1]).toBeGreaterThan(arm[1]);
  });

  it('wraps the front of the shoulder and, since, the back too (the user, 2026-11-13)', () => {
    expect(FORE.wide).toBeGreaterThan(1.3);
    expect(AFT.wide).toBeGreaterThan(1.3);
    // Round over the shoulder, and not plunging as steeply (the user, 2026-11-13).
    expect(CROWN).toBeGreaterThanOrEqual(2);
    expect(FORE.fall).toBeLessThan(1.6);
    // The right pad's edges fore and aft of its arm's joint, the collar left out: both reach well
    // past the joint, the front hanging lower over the chest.
    const pad = pts.filter(p => Math.abs(p[0] - arm[0]) < 0.06 && Math.abs(p[0]) > 0.13);
    const [fore, aft] = [
      pad.filter(p => p[2] < arm[2] - 0.08),
      pad.filter(p => p[2] > arm[2] + 0.08),
    ];
    const reach = (ps: number[][]) => Math.max(...ps.map(p => Math.abs(p[2] - arm[2])));
    const low = (ps: number[][]) => Math.min(...ps.map(p => p[1]));
    expect(reach(fore)).toBeGreaterThan(0.13);
    expect(reach(aft)).toBeGreaterThan(0.13);
    expect(low(fore)).toBeLessThan(low(aft));
  });

  it("makes the collar of brown cloth, matte, whatever the pads' colour (the user, 2026-11-13)", () => {
    const gold: number[] = [];
    pads(gold, pose, 0, GOLD);
    // The collar comes after both pads.
    const from = 2 * LAMES.length * LAME_QUADS * 6 * STRIDE;
    expect(gold.length).toBeGreaterThan(from);
    for (let i = from; i < gold.length; i += STRIDE) {
      expect(gold[i + 8]).toBe(-1);
      const k = gold[i + 6] / COLLAR_CLOTH[0];
      expect(gold[i + 7]).toBeCloseTo(COLLAR_CLOTH[1] * k, 6);
      expect(gold[i + 9]).toBeCloseTo(COLLAR_CLOTH[2] * k, 6);
    }
    // The pads' tops in the colour given, glossy.
    expect(gold.slice(0, from).some((_, i) => i % STRIDE == 6 && gold[i] == GOLD[0])).toBe(true);
  });

  it('stands a collar round the back of the neck, open in front', () => {
    const near = pts.filter(p => Math.hypot(p[0], p[2] - neck[2]) < 0.13 && p[1] > neck[1] + 0.03);
    expect(Math.max(...near.map(p => p[2]))).toBeGreaterThan(neck[2] + 0.09);
    // Nothing of it before the throat.
    expect(near.some(p => Math.abs(p[0]) < 0.04 && p[2] < neck[2])).toBe(false);
  });

  it('stands clear of the shoulder under it, on him and on her (the user, 2026-11-13: it went into the shoulder)', () => {
    for (const build of [0, 1]) {
      const at = solve(rest([0, 0, 0], 0, build));
      const [worn, bare]: number[][] = [[], []];
      pads(worn, at, build);
      skin(bare, body(1, build), at, palette([1, 1, 1]));
      const joint = at.pos[J.ARM_R];
      // The skin's top round the joint, in cells of 1 cm.
      const top = new Map<string, number>();
      for (let i = 0; i < bare.length; i += 3 * STRIDE) {
        for (let u = 0; u <= 8; u++) {
          for (let w = 0; w <= 8 - u; w++) {
            const c = [u / 8, w / 8, 1 - (u + w) / 8];
            const p = [0, 1, 2].map(j =>
              c.reduce((sum, f, q) => sum + bare[i + q * STRIDE + j] * f, 0),
            );
            const key = `${Math.round(p[0] * 100)},${Math.round(p[2] * 100)}`;
            top.set(key, Math.max(top.get(key) ?? -9, p[1]));
          }
        }
      }
      let under = 0;
      // The right pad's lames, drawn first.
      for (let i = 0; i < LAMES.length * LAME_QUADS * 6 * STRIDE; i += STRIDE) {
        const [x, y, z] = [worn[i], worn[i + 1], worn[i + 2]];
        if (Math.abs(x - joint[0]) < 0.12) {
          under += +(y < (top.get(`${Math.round(x * 100)},${Math.round(z * 100)}`) ?? -9) + 0.002);
        }
      }
      expect(under).toBe(0);
    }
  });
});

describe("the marine's shoulder bells (the user, 2026-11-13, on a picture of a trooper's armour)", () => {
  it('is a round shell over each shoulder, hanging over the top of the arm, clear of its skin', () => {
    const pose = solve(rest());
    const v: number[] = [];
    pads(v, pose, 0, [0.9, 0.9, 0.9], true);
    expect(v.length % (3 * STRIDE)).toBe(0);
    const skinV: number[] = [];
    skin(skinV, body(1), pose, palette([1, 0, 0]));
    for (const side of [1, -1]) {
      const at = pose.pos[side > 0 ? J.ARM_R : J.ARM_L];
      const mine: number[][] = [];
      for (let i = 0; i < v.length; i += STRIDE) {
        expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 4);
        if (v[i] * side > 0) {
          mine.push([v[i] - at[0], v[i + 1] - at[1], v[i + 2] - at[2]]);
        }
      }
      // Over the joint, down the arm by BELL.len, out past the arm.
      expect(Math.max(...mine.map(p => p[1]))).toBeCloseTo(BELL.top, 3);
      expect(Math.min(...mine.map(p => p[1]))).toBeCloseTo(BELL.top - BELL.len, 3);
      expect(Math.max(...mine.map(p => p[0] * side))).toBeGreaterThan(0.08);
      // No skin of the arm comes through its outer half.
      for (let i = 0; i < skinV.length; i += STRIDE) {
        const [x, y, z] = [(skinV[i] - at[0]) * side, skinV[i + 1] - at[1], skinV[i + 2] - at[2]];
        if (x > 0.02 && y > BELL.top - BELL.len + 0.03 && y < BELL.top) {
          expect(((x - BELL.x) / BELL.r[0]) ** 2 + (z / BELL.r[1]) ** 2).toBeLessThan(1);
        }
      }
    }
  });
  it("has a band round each bell in its own colour: the astronaut's team colour on his white (the user, 2026-11-13)", () => {
    const v: number[] = [];
    pads(v, solve(rest()), 0, [0.85, 0.86, 0.88], true, [0.1, 0.9, 0.2]);
    const band = [];
    for (let i = 0; i < v.length; i += STRIDE) {
      if (v[i + 6] == 0.1 && v[i + 7] == 0.9) {
        band.push(v[i]);
      }
    }
    expect(BAND.rows.length).toBeGreaterThan(0);
    expect(band.some(x => x > 0)).toBe(true);
    expect(band.some(x => x < 0)).toBe(true);
    // Without a band colour of its own, the bell is all one colour.
    const plain: number[] = [];
    pads(plain, solve(rest()), 0, [0.9, 0.2, 0.1], true);
    for (let i = 0; i < plain.length; i += STRIDE) {
      expect(plain[i + 7] == 0.9).toBe(false);
    }
  });
});

describe('pads on a far runner (the user, 2026-11-14: lags in a match)', () => {
  const pose = solve(rest());
  const draw = (marine: boolean, far: boolean) => {
    const v: number[] = [];
    pads(v, pose, 0, [0.9, 0.9, 0.9], marine, [0.1, 0.9, 0.2], far);
    return Array.from({ length: v.length / STRIDE }, (_, i) =>
      v.slice(i * STRIDE, i * STRIDE + STRIDE),
    );
  };
  const box = (ps: number[][]) =>
    [0, 1, 2].flatMap(d => [Math.min(...ps.map(p => p[d])), Math.max(...ps.map(p => p[d]))]);

  it('takes under a third of the vertices, in the same place, the band still round the bell', () => {
    for (const marine of [false, true]) {
      const [near, far] = [draw(marine, false), draw(marine, true)];
      expect(far.length * 3).toBeLessThan(near.length);
      expect(far.length % 3).toBe(0);
      box(far).forEach((b, i) => expect(Math.abs(b - box(near)[i])).toBeLessThan(0.01));
      const band = (ps: number[][]) => ps.filter(p => p[6] == 0.1 && p[7] == 0.9);
      if (marine) {
        expect(band(far).length).toBeGreaterThan(0);
        const ys = (ps: number[][]) => ps.map(p => p[1]);
        expect(Math.min(...ys(band(far)))).toBeCloseTo(Math.min(...ys(band(near))), 4);
        expect(Math.max(...ys(band(far)))).toBeCloseTo(Math.max(...ys(band(near))), 4);
      }
    }
  });
});
