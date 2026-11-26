import { describe, expect, it } from 'vitest';
import { GUN_MAG } from '../shared/constants';
import { BACK, BACK_N, MUZZLE, readout } from './gun';
import { GLOSS, STRIDE } from './mesh';
import { WINDOW, hunterPistol } from './pistol';

/** The vertices of `v`: position, normal, colour and layer. */
const verts = (v: number[]) =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const o = i * STRIDE;
    return {
      p: v.slice(o, o + 3),
      n: v.slice(o + 3, o + 6),
      rgb: [v[o + 6], v[o + 7], v[o + 9]],
      layer: v[o + 8],
    };
  });

describe('the Hunter’s pistol (the user, 2026-11-26)', () => {
  it('stays within its vertex budget at each level of detail, lighter than the plasma gun near', () => {
    expect(hunterPistol(1).length / STRIDE).toBeLessThan(3222);
    expect(hunterPistol(0).length / STRIDE).toBeLessThan(hunterPistol(1).length / STRIDE);
    expect(hunterPistol(1)).toBe(hunterPistol(1));
  });

  it('ends at the gun’s muzzle in an ember glow, so the shot leaves where it always did', () => {
    const glow = verts(hunterPistol(1)).filter(x => x.layer == -2);
    expect(glow.length).toBeGreaterThan(0);
    const front = Math.min(...glow.map(x => x.p[2]));
    expect(front).toBeCloseTo(MUZZLE[2], 3);
    for (const x of glow) {
      expect(x.rgb[0]).toBeGreaterThan(3 * x.rgb[2]);
    }
  });

  it('is worn metal (GLOSS) but for its glow and the screen’s black glass, lit by unit normals', () => {
    const all = verts(hunterPistol(1));
    expect(new Set(all.map(x => x.layer))).toEqual(new Set([GLOSS, -2, -1]));
    const glass = all.filter(x => x.layer == -1);
    expect(glass.length).toBeGreaterThan(0);
    for (const x of glass) {
      expect(Math.max(...x.rgb)).toBeLessThan(0.05);
    }
    for (const x of all) {
      expect(Math.hypot(...x.n)).toBeCloseTo(1, 5);
    }
  });

  it('sets its screen in the back face, inside a bezel, round the readout’s window', () => {
    const up = [0, BACK_N[2], -BACK_N[1]];
    const glass = verts(hunterPistol(1)).filter(x => x.layer == -1);
    for (const { p } of glass) {
      const d = p.map((c, k) => c - BACK[k]);
      // On the face, a hair out of it, within the window.
      expect(Math.abs(d[0] * BACK_N[0] + d[1] * BACK_N[1] + d[2] * BACK_N[2])).toBeLessThan(0.001);
      expect(Math.abs(d[0])).toBeLessThanOrEqual(WINDOW[0] + 1e-6);
      const b = d[1] * up[1] + d[2] * up[2] - WINDOW[2];
      expect(Math.abs(b)).toBeLessThanOrEqual(WINDOW[1] + 1e-6);
    }
  });
});

describe('the Hunter’s pistol’s count, in his wrist computer’s glyphs', () => {
  it('lights two dashes a shot in ember, no cyan, no lit frame, and keeps its size as it runs down', () => {
    const lit = (n: number) =>
      verts(readout(n, 0, true, true)).filter(x => x.rgb[0] > 0.5 && x.rgb[1] < 0.5).length;
    expect(readout(GUN_MAG, 0, true, true).length).toBe(readout(3, 0, true, true).length);
    // Two triangles a dash, two dashes a shot.
    expect(lit(GUN_MAG) - lit(GUN_MAG - 1)).toBe(2 * 2 * 3);
    for (const x of verts(readout(GUN_MAG, 0, true, true))) {
      expect(x.rgb[2]).toBeLessThan(x.rgb[0] + 1e-9);
    }
    // The digits' readout carries its frame of light round the screen; the glyphs' does not.
    expect(readout(9, 0, true, true).length).toBeLessThan(readout(9).length);
  });
});
