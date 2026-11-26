import { describe, expect, it } from 'vitest';
import { MUZZLE, gun } from '../gun';
import { SHINE, dot, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { near, verts } from './testing';
import type { Vertex } from './testing';

const far = verts(gun(0));

describe('the gun model', () => {
  it('stays within the budget: a gun near is a few hundred triangles, one far about half of that', () => {
    expect(near.length).toBeGreaterThan(400);
    // 2600 until the printed circuit on its flanks (the user, 2026-11-09).
    expect(near.length).toBeLessThan(3400);
    expect(near.length % 3).toBe(0);
    expect(far.length).toBeGreaterThan(300);
    expect(far.length).toBeLessThan(near.length * 0.75);
  });

  it('prints a dark violet circuit on both flanks and the top near, none far', () => {
    const traced = (v: Vertex[]) =>
      v.filter(x => x.c[2] > x.c[0] * 2 && x.c[2] < 0.5 && x.c[1] < 0.08 && x.layer == SHINE);
    const t = traced(near);
    expect(t.length).toBeGreaterThan(400);
    // Far, only a few corners of the body's darkest metal are as dark.
    expect(traced(far).length).toBeLessThan(12);
    // Both sides, the top, clear of the cut back (z 0.04 up to 0.03 at the top).
    expect(t.some(x => x.p[0] > 0.02) && t.some(x => x.p[0] < -0.02)).toBe(true);
    expect(t.some(x => x.p[1] > 0.13)).toBe(true);
    expect(Math.max(...t.map(x => x.p[2]))).toBeLessThan(0.012);
    // On the body's surface, a hair out of it: inside its widest half width.
    expect(Math.max(...t.map(x => Math.abs(x.p[0])))).toBeLessThan(0.049);
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
    const metal = near.filter(v => v.layer == SHINE);
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
    const ring = near.filter(v => Math.abs(v.p[2] - 0.005) < 1e-9 && v.layer == SHINE);
    expect(ring.length).toBeGreaterThanOrEqual(12);
    // No sharp edge on top: the normals of the top vertices all face up.
    // (The back rounds over onto the counter's flat, behind 2 cm.)
    const crest = near.filter(v => v.p[1] > 0.132 && v.p[2] < 0.02 && v.layer == SHINE);
    expect(crest.length).toBeGreaterThan(20);
    for (const v of crest) {
      expect(v.n[1]).toBeGreaterThan(0.7);
    }
  });

  it('cuts its top with a straight glossy black face leaning toward the player', () => {
    // The face: through (0, 0.125, 0.04), facing back and up.
    const n = unit([0, 0.469, 0.883]);
    const out = (p: Vec3) => (p[1] - 0.125) * n[1] + (p[2] - 0.04) * n[2];
    // Nothing of the body behind it.
    // Nothing of the body behind it but its smooth outline, 0.2 mm out.
    expect(Math.max(...near.map(v => out(v.p)))).toBeLessThan(0.0002 + 1e-9);
    // On it, glossy black facing out of it.
    const face = near.filter(
      v => Math.abs(out(v.p)) < 1e-9 && v.layer == SHINE && Math.max(...v.c) < 0.03,
    );
    expect(face.length).toBeGreaterThan(40);
    // A straight cut: flat, facing straight out of it (its edge, shared with the body's metal,
    // keeps the body's normals there).
    expect(face.filter(v => dot(v.n, n) > 0.999).length).toBeGreaterThan(face.length / 2);
  });

  it('lays a smooth outline over its cut, holding all of it, so its polygon’s corners don’t show', () => {
    const n = unit([0, 0.469, 0.883]);
    const up = [0, n[2], -n[1]];
    const out = (p: Vec3) => (p[1] - 0.125) * n[1] + (p[2] - 0.04) * n[2];
    const b = (p: Vec3) => (p[1] - 0.125) * up[1] + (p[2] - 0.04) * up[2];
    const outline = near.filter(v => Math.abs(out(v.p) - 0.0002) < 1e-9);
    expect(outline).toHaveLength(32 * 3);
    // The superellipse of the body's rings: |x / 4.4 cm|^2.5 + |b / 3.34 cm|^2.5 <= 1 round 1.45 cm down the face.
    const inside = (p: Vec3) =>
      Math.abs(p[0] / 0.044) ** 2.5 + Math.abs((b(p) + 0.0145) / 0.0334) ** 2.5 <= 1 + 1e-6;
    const cut = near.filter(v => Math.abs(out(v.p)) < 1e-9);
    expect(cut.length).toBeGreaterThan(40);
    for (const v of cut) {
      expect(inside(v.p)).toBe(true);
    }
  });

  it('is about a hand and a half long, with the muzzle on the tip of its nose', () => {
    const [x, y, z] = [0, 1, 2].map(k => [
      Math.min(...near.map(v => v.p[k])),
      Math.max(...near.map(v => v.p[k])),
    ]);
    expect(z[1] - z[0]).toBeGreaterThan(0.22);
    expect(z[1] - z[0]).toBeLessThan(0.35);
    expect(y[1] - y[0]).toBeGreaterThan(0.15);
    expect(y[1] - y[0]).toBeLessThan(0.3);
    expect(x[1] - x[0]).toBeLessThan(0.12);
    // The middle of the grip is the origin; the emitter glows on the muzzle.
    expect(
      Math.min(
        ...near
          .filter(v => v.layer == -2)
          .map(v => Math.hypot(v.p[0] - MUZZLE[0], v.p[1] - MUZZLE[1], v.p[2] - MUZZLE[2])),
      ),
    ).toBeLessThan(0.01);
  });

  it('has a smooth top: from the counter, its highest point, the top only falls toward the muzzle, with no prongs', () => {
    // The highest metal at each ring of the bulb, from the counter's edge to the nose (the user,
    // 2026-11-09: no dip toward the counter).
    const top = (f: number) =>
      Math.max(
        ...near.filter(v => v.layer == SHINE && Math.abs(v.p[2] + f) < 0.004).map(v => v.p[1]),
      );
    const rings = [-0.028, -0.005, 0.035, 0.08, 0.12, 0.16, 0.19, 0.205].map(top);
    rings.slice(1).forEach((h, i) => expect(h).toBeLessThan(rings[i]));
    // Nothing of the body sticks out ahead of the muzzle above the hull's tip.
    expect(near.filter(v => v.p[2] < MUZZLE[2] - 0.005 && v.p[1] > 0.07)).toHaveLength(0);
  });
});
