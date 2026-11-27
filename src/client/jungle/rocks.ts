// Landfall's headlands (docs/BEACH.md): the rocks of ROCKS and those drawn only past them, in granite.
import { FRAME, ROCKS, ZED, blockOf } from '../../shared/beach';
import { rockMid } from '../../shared/moon';
import { hash, noise } from '../../shared/relief';
import { STRIDE } from '../mesh';
import { stone } from '../stone';
import { sm } from './constants';
import type { Ground } from './constants';

/**
 * A block of shared/beach.ts's kind (x, z, radius, height, seed, and how far over the ground it is
 * set: one stacked on another), blockOf()'s form: granite (granite.ts GRANITE), darker where the sea
 * wets it.
 */
export const rock = (o: number[], gy: Ground, [x, z, R, H, s, lift = 0]: number[], lod: number) => {
  const { reach } = blockOf(s, R, H);
  const g = gy(x, z) + lift;
  const mid = g + rockMid(H);
  const from = o.length;
  stone(
    o,
    lod,
    u => {
      const d = reach(u);
      return [x + u[0] * d, mid + u[1] * d, z + u[2] * d];
    },
    g,
    g + H,
    s,
    // Granite is pale: a shade near full, where Tranquility's basalt has half.
    0.72 + 0.14 * hash(s, 5, 41),
    lift ? undefined : gy,
  );
  for (let i = from; i < o.length; i += STRIDE) {
    const wet = FRAME.water + 0.4 + 1.2 * noise(0.4 * o[i], 0.4 * o[i + 2], 9);
    o[i + 9] *= 0.4 + 0.6 * sm((o[i + 1] - wet) / 1.5);
  }
  facet(o, from);
};

/** Each triangle's normals turned a quarter of the way to its face's: a block of granite shows a little of its facets, not a smooth mass. */
export const facet = (o: number[], from: number) => {
  for (let t = from; t < o.length; t += 3 * STRIDE) {
    const [a, b, c] = [t, t + STRIDE, t + 2 * STRIDE];
    const [ux, uy, uz] = [o[b] - o[a], o[b + 1] - o[a + 1], o[b + 2] - o[a + 2]];
    const [vx, vy, vz] = [o[c] - o[a], o[c + 1] - o[a + 1], o[c + 2] - o[a + 2]];
    const [fx, fy, fz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const l = Math.hypot(fx, fy, fz) || 1;
    for (const i of [a, b, c]) {
      const [nx, ny, nz] = [
        0.75 * o[i + 3] + (0.25 * fx) / l,
        0.75 * o[i + 4] + (0.25 * fy) / l,
        0.75 * o[i + 5] + (0.25 * fz) / l,
      ];
      const m = Math.hypot(nx, ny, nz) || 1;
      [o[i + 3], o[i + 4], o[i + 5]] = [nx / m, ny / m, nz / m];
    }
  }
};

/**
 * Red's headland: the rocks of ROCKS, then what is only drawn, all past the headland's wall: low
 * blocks scattered on the sand that runs on; the mass on the trees' side, tors of two or three
 * blocks stacked, rising inland; stacks standing in the sea off the strand; and a reef running out
 * past x = FRAME.sea, lower and lower. Between them the sand and the sea go on. `k` is 0 for red
 * and 1 for blue, whose jumble is its own. The rocks of ROCKS stand on `red`, red's ground, for
 * both: the map's boxes for blue's are the twins of red's, and the lattice's triangles are not
 * mirrored.
 */
export const cape = (gy: Ground, k: number, red: Ground): number[] => {
  const o: number[] = [];
  const h = (i: number, j: number) => hash(i, j, 90 + k);
  const seed = (i: number) => 100 + i + 50 * k;
  ROCKS.forEach(r => rock(o, red, r, 4));
  // Low blocks on the sand past the wall, thinning out toward the sea.
  for (let i = 0; i < 7; i++) {
    const at = [34 + 8 * i + 5 * h(i, 1), ZED + 16 + 26 * h(i, 2)];
    rock(o, gy, [...at, 2.5 + 2.5 * h(i, 3), 1.8 + 2.4 * h(i, 4), seed(i)], 3);
  }
  // The mass on the trees' side: tors, a block or two set on a wide one, stepping up inland.
  for (let i = 0; i < 6; i++) {
    const [x, z] = [94 + 7 * i + 4 * h(i, 5), ZED + 14 + 9 * (i % 3) + 6 * h(i, 6)];
    const [R, H] = [7 + 3 * h(i, 7), 7 + 5 * h(i, 8) + 2 * i];
    rock(o, gy, [x, z, R, H, seed(10 + i)], 4);
    const up = [x + 1.5 * h(i, 9) - 0.75, z + 1.5 * h(i, 10) - 0.75, 0.6 * R, 0.55 * H];
    rock(o, gy, [...up, seed(20 + i), 0.8 * H], 3);
    if (h(i, 11) < 0.5) {
      rock(o, gy, [up[0] + 0.5, up[1] - 0.4, 0.35 * R, 0.4 * H, seed(30 + i), 1.3 * H], 2);
    }
  }
  // Stacks in the sea off the strand, past the wall.
  for (let i = 0; i < 5; i++) {
    const at = [12 - 9 * i + 4 * h(i, 12), ZED + 14 + 9 * i + 6 * h(i, 13)];
    rock(o, gy, [...at, 2.5 + 2 * h(i, 14), 4 + 5 * h(i, 15), seed(40 + i)], 3);
  }
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const at = [FRAME.sea - 12 - 62 * t + 6 * h(i, 13), ZED + 36 - 14 * t * t + 8 * h(i, 14)];
    rock(o, gy, [...at, 7 - 4.5 * t, 6 - 4 * t, 140 + i + 50 * k], 2);
  }
  return o;
};

/** Blue's half from red's: z becomes ZED - z, the normals follow, the triangles keep their front. */
export const mirror = (v: number[]) => {
  const o = v.slice();
  for (let t = 0; t < v.length; t += 3 * STRIDE) {
    for (let k = 0; k < 3; k++) {
      const [i, j] = [t + k * STRIDE, t + ((3 - k) % 3) * STRIDE];
      for (let c = 0; c < STRIDE; c++) {
        o[i + c] = v[j + c];
      }
      o[i + 2] = ZED - o[i + 2];
      o[i + 5] = -o[i + 5];
    }
  }
  return o;
};
