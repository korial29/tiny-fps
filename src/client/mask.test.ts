import { describe, expect, it } from 'vitest';
import { STRIDE } from './mesh';
import { CLOTH, dress, mask } from './mask';
import { JOINT as J, rest, solve } from './rig';
import { bindOf, body, palette, skin } from './skin';

describe('mask, the ninja hood and face guard', () => {
  // On the head joint at rest, unturned: where it was fitted.
  const RED = [0.9, 0.1, 0.1];
  const out: number[] = [];
  mask(out, bindOf(0)[J.HEAD], [0, 0, 0, 1], 0, RED);
  const pts = Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, i * STRIDE + STRIDE),
  );
  const s = body(3, 0);
  const pose = solve(rest());
  const face: number[] = [];
  skin(face, s, pose, palette([1, 1, 1]));
  const before = face.slice();
  dress(face, 0, s, pose.pos[J.HEAD], pose.rot[J.HEAD]);
  /** The corners of the head's skin at rest: where they were, where they are, and their colour after. */
  const corners = Array.from({ length: face.length / STRIDE }, (_, i) => ({
    at: before.slice(i * STRIDE, i * STRIDE + 3),
    now: face.slice(i * STRIDE, i * STRIDE + 3),
    rgb: [face[i * STRIDE + 6], face[i * STRIDE + 7], face[i * STRIDE + 9]],
  }));
  const black = (rgb: number[]) => rgb.every((c, i) => Math.abs(c - CLOTH[i]) < 1e-6);
  const where = (f: (p: number[]) => boolean) => corners.filter(c => f(c.at));

  it('is whole triangles of finite points and unit normals', () => {
    expect(pts.length % 3).toBe(0);
    for (const p of pts) {
      expect(p.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(p[3], p[4], p[5])).toBeCloseTo(1, 3);
    }
  });

  it('is in the team colour in front of the mouth, below the eyes, with an ideogram on each side', () => {
    const red = pts.filter(p => p[6] == RED[0] && p[7] == RED[1] && p[9] == RED[2]);
    expect(red.some(p => Math.abs(p[0]) < 0.01 && p[1] > 1.6 && p[1] < 1.65)).toBe(true);
    // Its arrow up the nose stops under the eye line, and nothing covers the eyes.
    expect(Math.max(...pts.filter(p => Math.abs(p[0]) < 0.04).map(p => p[1]))).toBeLessThan(1.69);
    expect(
      Math.max(...pts.filter(p => Math.abs(p[0]) > 0.022 && Math.abs(p[0]) < 0.045).map(p => p[1])),
    ).toBeLessThan(1.68);
    const high = red.filter(p => p[1] > 1.72);
    expect(high.length).toBeGreaterThan(30);
    expect(high.filter(p => p[0] > 0).length).toBe(high.filter(p => p[0] < 0).length);
  });

  it('comes down under the chin and over the jaw, close to the face (the user, 2026-11-13)', () => {
    const red = pts.filter(p => p[6] == RED[0] && p[7] == RED[1] && p[9] == RED[2] && p[1] < 1.7);
    const band = (x: number) => red.filter(p => Math.abs(p[0]) >= x && Math.abs(p[0]) < x + 0.01);
    const low = (x: number) => Math.min(...band(x).map(p => p[1]));
    // Its middle under the chin, its sides low over the jaw, still rising round to the cheeks.
    expect(low(0)).toBeLessThan(1.58);
    expect(low(0.06)).toBeLessThan(1.6);
    expect(low(0.07)).toBeGreaterThan(low(0) + 0.02);
    // Its front stood out too much: 13 cm before the head's joint, now under 12.
    expect(Math.min(...band(0).map(p => p[2]))).toBeGreaterThan(-0.12);
  });

  it('paints the hood on the head, but round the eyes', () => {
    // The crown and the back of the head: black.
    expect(where(([, y]) => y > 1.78).every(c => black(c.rgb))).toBe(true);
    expect(
      where(([x, y, z]) => Math.abs(x) < 0.02 && y > 1.6 && y < 1.7 && z > 0.06).every(c =>
        black(c.rgb),
      ),
    ).toBe(true);
    // The eyes and the skin between them: as they were.
    const eyes = where(([x, y, z]) => Math.abs(x) < 0.02 && y > 1.685 && y < 1.7 && z < 0);
    expect(eyes.length).toBeGreaterThan(0);
    expect(eyes.some(c => black(c.rgb))).toBe(false);
  });

  it("paints all of the face under the guard's top black: no skin beside it (the user, 2026-11-13)", () => {
    const low = where(([, y]) => y > 1.56 && y < 1.655);
    expect(low.length).toBeGreaterThan(50);
    expect(low.every(c => black(c.rgb))).toBe(true);
  });

  it('keeps the face behind the guard, and moves nothing else', () => {
    const moved = corners.filter(c => Math.hypot(...c.now.map((v, i) => v - c.at[i])) > 1e-6);
    expect(moved.every(c => c.at[1] > 1.57 && c.at[1] < 1.71)).toBe(true);
    // The tip of the nose, pressed in, is behind the guard's front.
    const nose = Math.min(
      ...corners
        .filter(c => Math.abs(c.now[0]) < 0.01 && c.now[1] > 1.6 && c.now[1] < 1.65)
        .map(c => c.now[2]),
    );
    const guard = Math.min(
      ...pts.filter(p => Math.abs(p[0]) < 0.01 && p[1] > 1.6 && p[1] < 1.65).map(p => p[2]),
    );
    expect(nose).toBeGreaterThan(guard);
  });
});
