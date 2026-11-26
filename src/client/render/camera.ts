import { basis } from '../mesh';
import { LIGHT, MAX_LIGHTS, MAX_SHADOWS } from '../lights';
import type { Light } from '../lights';
import type { Vec3 } from '../mesh';

import { FAR, FOV, SHADOW, SUN_AHEAD, SUN_AREA, SUN_DEPTH } from './constants';

/**
 * Column-major view-projection matrix of basis(yaw, pitch, roll) at eye. t is the tangent of half the
 * vertical field of view (70° by default), [N, F] the near and far clip distances.
 */
export const viewProj = (
  eye: Vec3,
  yaw: number,
  pitch: number,
  aspect: number,
  roll = 0,
  t = FOV,
  [N, F] = [0.1, FAR],
) => {
  const [r, u, f] = basis(yaw, pitch, roll);
  const k = (F + N) / (F - N);
  const rows = [r.map(v => v / (t * aspect)), u.map(v => v / t), f.map(v => v * k), f].map(v => [
    ...v,
    -v[0] * eye[0] - v[1] * eye[1] - v[2] * eye[2],
  ]);
  rows[2][3] -= (2 * F * N) / (F - N);
  return Float32Array.from({ length: 16 }, (_, i) => rows[i & 3][i >> 2]);
};

/** A world point on screen, in [0, 1] from the top left; undefined behind the camera. */
export const project = (
  m: Float32Array,
  x: number,
  y: number,
  z: number,
): [number, number] | undefined => {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (w <= 0) {
    return undefined;
  }
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  return [0.5 + cx / (2 * w), 0.5 - cy / (2 * w)];
};

/**
 * Whether a sphere reaches into the view of `m`, by its left, right, bottom, top and near planes (the
 * last row plus or minus another). A point light out of it lights no pixel drawn, and the GPU pays
 * for every light on every fragment, hidden ones too.
 */
export const inView = (m: Float32Array, p: Vec3, r: number): boolean =>
  [1, -1, 1, -1, 1].every((s, k) => {
    const n = [0, 4, 8, 12].map(j => m[j + 3] + s * m[j + (k >> 1)]);
    return n[0] * p[0] + n[1] * p[1] + n[2] * p[2] + n[3] >= -r * Math.hypot(n[0], n[1], n[2]);
  });

/**
 * The pixels [x, y, width, height] (from the bottom left) the quads cover on a `w` by `h` target seen
 * through `m`, cut at the near plane, a pixel wider each side; undefined when none. Each quad's box
 * is clamped alone: two mouths off either side of the view are none.
 */
export const cover = (
  m: Float32Array,
  quads: Vec3[][],
  w: number,
  h: number,
): [number, number, number, number] | undefined => {
  let [l, b, r, t] = [w, h, 0, 0];
  for (const q of quads) {
    const c = q.map(p =>
      [0, 1, 3].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]),
    );
    // The corners ahead of the near plane, and where the edges cross it, on the target.
    const s = c.flatMap((a, i) => {
      const e = c[(i + 1) % 4];
      return [a[2] > 1e-3 ? 0 : -1, a[2] > 1e-3 != e[2] > 1e-3 ? (1e-3 - a[2]) / (e[2] - a[2]) : -1]
        .filter(k => k >= 0)
        .map(k => a.map((v, j) => v + (e[j] - v) * k))
        .map(([x, y, z]) => [(x / z / 2 + 0.5) * w, (y / z / 2 + 0.5) * h]);
    });
    const [x0, y0] = [0, 1].map(j => Math.max(0, Math.floor(Math.min(...s.map(p => p[j]))) - 1));
    const [x1, y1] = [w, h].map((n, j) =>
      Math.min(n, Math.ceil(Math.max(...s.map(p => p[j]))) + 1),
    );
    if (x1 > x0 && y1 > y0) {
      [l, b, r, t] = [Math.min(l, x0), Math.min(b, y0), Math.max(r, x1), Math.max(t, y1)];
    }
  }
  return r > l && t > b ? [l, b, r - l, t - b] : undefined;
};

/**
 * The view-projection of a spot's shadow map: from its position along its axis, a square window
 * just wide enough for the cone, clipped from 0.3 m (a flashlight sits inside its player's head)
 * to its range.
 */
export const lightProj = ({ p, d, cone, range }: Light) =>
  viewProj(
    p,
    Math.atan2(-d[0], -d[2]),
    Math.atan2(d[1], Math.hypot(d[0], d[2])),
    1,
    0,
    Math.min(Math.tan(Math.acos(cone)), 5.7),
    [0.3, range],
  );

/** The lights of this frame that reach into the view, refilled every frame. */
export const lit: Light[] = [];
export const PACKED = {
  n: 0,
  maps: 0,
  a: new Float32Array(MAX_LIGHTS * 4),
  b: new Float32Array(MAX_LIGHTS * 4),
  k: new Float32Array(MAX_LIGHTS * 4),
  m: new Float32Array(MAX_SHADOWS * 16),
};

/**
 * The lights as the shader's uniform arrays (see FRAG): at most MAX_LIGHTS of them, and the first
 * MAX_SHADOWS shadowed spots get a slot, whose matrix goes in m at 16 floats a slot.
 */
export const pack = (lights: Light[]) => {
  // The same arrays every frame: the renderer uploads them at once, and nothing keeps them.
  const { a, b, k, m } = PACKED;
  a.fill(0);
  b.fill(0);
  k.fill(0);
  m.fill(0);
  const n = Math.min(lights.length, MAX_LIGHTS);
  let maps = 0;
  for (let i = 0; i < n; i++) {
    const l = lights[i];
    const slot = l.shadow && l.kind == LIGHT.SPOT && maps < MAX_SHADOWS ? maps++ : -1;
    const o = i * 4;
    a[o] = l.p[0];
    a[o + 1] = l.p[1];
    a[o + 2] = l.p[2];
    a[o + 3] = l.range;
    b[o] = l.d[0];
    b[o + 1] = l.d[1];
    b[o + 2] = l.d[2];
    b[o + 3] = l.kind == LIGHT.POINT ? -9 : l.cone;
    k[o] = l.color[0];
    k[o + 1] = l.color[1];
    k[o + 2] = l.color[2];
    k[o + 3] = slot;
    if (slot >= 0) {
      m.set(lightProj(l), slot * 16);
    }
  }
  PACKED.n = n;
  PACKED.maps = maps;
  return PACKED;
};

/**
 * The view-projection of the sun's shadow map: an orthographic window of `area` metres a side
 * looking along -dir (dir points toward the sun), centred on the eye and clipped `depth` metres
 * either side of it. The centre is snapped to the map's texels along the window's own axes, so a
 * shadow edge keeps its texels as the eye moves instead of crawling.
 */
export const sunProj = (dir: Vec3, eye: Vec3, area = SUN_AREA, depth = SUN_DEPTH) => {
  const f = dir.map(v => -v) as Vec3;
  const k = Math.hypot(f[0], f[2]);
  const r: Vec3 = k > 1e-3 ? [-f[2] / k, 0, f[0] / k] : [1, 0, 0];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const [h, texel] = [area / 2, area / SHADOW];
  const rows = [r, u].map(v => [
    ...v.map(c => c / h),
    -(Math.round(dot(v, eye) / texel) * texel) / h,
  ]);
  rows.push([...f.map(c => c / depth), -dot(f, eye) / depth], [0, 0, 0, 1]);
  return Float32Array.from({ length: 16 }, (_, i) => rows[i & 3][i >> 2]);
};

/** The middle of the sun's shadow window for an eye looking along `yaw`: SUN_AHEAD metres ahead of it on the ground. */
export const sunAt = (eye: Vec3, yaw: number): Vec3 => [
  eye[0] - Math.sin(yaw) * SUN_AHEAD,
  eye[1],
  eye[2] - Math.cos(yaw) * SUN_AHEAD,
];
