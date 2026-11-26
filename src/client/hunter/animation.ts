import { STRIDE, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import type { PlayerState } from '../../shared/types';

import { JOINT as J, JOINTS, PARENT, axis, mul, rest, solve, turn } from '../rig';
import { room } from '../verts';
import type { Out } from '../verts';
import type { Quat } from '../rig';
import { CANNON_HINGE, CANNON_SWING, STRIP, stature } from './constants';
import { hunter } from './model';
import { HUNTER_REST } from './rest';

/** The shoulder cannon's fold `k`, moved toward out (`out`) or stowed by `dt` seconds. */
export const unfold = (k: number, out: boolean, dt: number): number =>
  Math.min(1, Math.max(0, k + ((out ? 1 : -1) * dt) / CANNON_SWING));
/**
 * The Hunter as his arms are posed: with the shoulder cannon in use his hands hold nothing, so he
 * is drawn as with no weapon in hand (not the rail gun's hold, nor the harpoon's).
 */
export const handsFree = <P extends Pick<PlayerState, 'railed' | 'ammo' | 'zapping'>>(p: P): P =>
  p.railed ? { ...p, railed: false, ammo: -1, zapping: false } : p;
/** How far along its swing a cannon folded out by `k` is: a smooth start and stop. */
export const folded = (k: number): number => k * k * (3 - 2 * k);

/** Where each bone of HUNTER_REST ends: its first child (the spine, the neck), or a stub past a leaf. */
export const boneEnd = (j: number): Vec3 => {
  const tip: Record<number, Vec3> = {
    [J.HEAD]: [0, 0.25, 0],
    [J.HAND_L]: [-0.02, -0.2, 0],
    [J.HAND_R]: [0.02, -0.2, 0],
    [J.TOE_L]: [0, 0, -0.08],
    [J.TOE_R]: [0, 0, -0.08],
  };
  const r = HUNTER_REST[j];
  return tip[j] ? (r.map((v, k) => v + tip[j][k]) as Vec3) : HUNTER_REST[PARENT.indexOf(j)];
};

export const toBone = (p: Vec3, j: number) => {
  const a = HUNTER_REST[j],
    b = boneEnd(j);
  const d = sub(b, a),
    e = sub(p, a);
  const t = Math.min(
    1,
    Math.max(0, (e[0] * d[0] + e[1] * d[1] + e[2] * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2)),
  );
  return Math.hypot(e[0] - t * d[0], e[1] - t * d[1], e[2] - t * d[2]);
};

export const LEGS = [
  [J.THIGH_L, J.SHIN_L, J.FOOT_L, J.TOE_L],
  [J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R],
];
export const HEAD_PARTS =
  /^(Mask lining|Dreads|Cranial shell|Visor grille|Mandible shell|Swept temple rail|Temple optics|Rangefinder)/;
export const TRUNK_PARTS = new Set([
  'Harpoon harness',
  'Laser saddle',
  'Laser mount',
  'Laser knuckle',
  'Shoulder laser',
  'Harpoon',
  'Rib guard',
  'Necklace',
]);
// The skin leaves the collarbones out, the chest carrying the shoulder (BENDS), and the neck and
// head: the neck's stump stays on the chest inside the mask's lining, which turns over it.
export const ALL = Array.from({ length: JOINTS }, (_, j) => j).filter(
  j => ![J.CLAVICLE_L, J.CLAVICLE_R, J.NECK, J.HEAD].includes(j as never),
);
export const ARMS: number[] = [J.ARM_L, J.FOREARM_L, J.HAND_L, J.ARM_R, J.FOREARM_R, J.HAND_R];
export const TRUNK = ALL.filter(j => !ARMS.includes(j));

/** The joints a part's triangles may follow (the nearest bone wins), by the part's name. */
export const followed = (name: string, [x, y]: Vec3): number[] => {
  if (HEAD_PARTS.test(name)) {
    return [J.HEAD];
  }
  if (name.startsWith('Belt') || name === 'Flying disc') {
    return [J.PELVIS];
  }
  if (TRUNK_PARTS.has(name)) {
    return [J.CHEST];
  }
  if (name === 'Shoulder plates') {
    return [x < 0 ? J.CLAVICLE_L : J.CLAVICLE_R];
  }
  if (name === 'Blade cuff' || name === 'Wrist blade') {
    return [J.FOREARM_R];
  }
  if (name === 'Left bracer') {
    return [J.FOREARM_L];
  }
  const leg = / (-?1)$/.exec(name);
  if (leg) {
    const bones = LEGS[+(leg[1] === '1')];
    // The knee cap stays whole on the shin.
    return name.startsWith('Patella') ? [bones[1]] : bones;
  }
  // The arms hang against the flanks: the trunk's skin is never theirs.
  return Math.abs(x) < 0.25 && y < 1.5 ? TRUNK : ALL;
};

/** A rigid Hunter piece: the vertices that follow `joint`, in that joint's rest frame. */
export interface HunterPiece {
  joint: number;
  /** Too fine for a shadow (the temple optics and the rangefinder). */
  thin: boolean;
  /** The harpoon on his back, left out while it is in his hand. */
  harpoon: boolean;
  /** The shoulder cannon, from its hinge (CANNON_HINGE) rather than the joint: it folds about it. */
  cannon: boolean;
  /** The disc on his hip, left out while it is in his hand. */
  disc: boolean;
  /** A strip under the belt, from its hinge rather than the joint (stripSwing()). */
  strip?: HunterStrip;
  vertices: number[];
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/**
 * A strip under the belt, hung on a hinge at the middle of its top edge: its number, the hinge
 * from the pelvis at rest, the hinge's axis (about which a positive turn swings the strip out of
 * the body) and where its foot hangs from the hinge.
 */
export interface HunterStrip {
  i: number;
  at: Vec3;
  axis: Vec3;
  end: Vec3;
}
/**
 * The hinge of the strip `i` whose vertices are `v`, in model space: over the strip's middle, at
 * its top, the strip's line straight down from it to its foot.
 */
export const hingeOf = (i: number, v: number[]): HunterStrip => {
  let [x, z, top, foot] = [0, 0, -Infinity, Infinity];
  for (let k = 0; k < v.length; k += STRIDE) {
    x += (v[k] * STRIDE) / v.length;
    z += (v[k + 2] * STRIDE) / v.length;
    top = Math.max(top, v[k + 1]);
    foot = Math.min(foot, v[k + 1]);
  }
  // Out of the body: level, away from its axis. A turn about the hinge's axis, level and square
  // to it, swings the strip's foot that way.
  const [ox, , oz] = unit([x, 0, z]);
  return {
    i,
    at: sub([x, top, z], HUNTER_REST[J.PELVIS]),
    axis: [-oz, 0, ox],
    end: [0, foot - top, 0],
  };
};
/** How far a strip's line keeps from a thigh's bone, metres, and the step and the most it swings out, radians. */
export const [STRIP_CLEAR, STRIP_STEP, STRIP_MOST] = [0.115, 0.2, 1.8];
/**
 * Where a strip under the belt hangs on a posed Hunter (the user, 2026-11-25: strips that follow
 * the thighs): its hinge and its turn, the pelvis at `pelvis` turned by `q` and his joints at
 * `joints` (hunterPose()). It hangs as it is modelled unless a thigh comes within STRIP_CLEAR of
 * its line: then it swings out about its hinge, by the least turn that clears both thighs. One
 * turn a strip, its vertices placed as a rigid piece's are: none is worked out here.
 */
export const stripSwing = (
  strip: HunterStrip,
  pelvis: Vec3,
  q: Quat,
  joints: Vec3[],
): [Vec3, Quat] => {
  const hinge = add(pelvis, turn(q, strip.at));
  /** Whether the strip swung out by `phi` is clear of both thighs. */
  const clear = (phi: number) => {
    const d = turn(q, turn(axis(strip.axis, phi), strip.end));
    for (const f of [0.4, 0.7, 1]) {
      for (const hip of [J.THIGH_L, J.THIGH_R]) {
        const [a, b] = [joints[hip], joints[hip + 1]];
        const [bx, by, bz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const [px, py, pz] = [
          hinge[0] + d[0] * f - a[0],
          hinge[1] + d[1] * f - a[1],
          hinge[2] + d[2] * f - a[2],
        ];
        const t = Math.min(
          1,
          Math.max(0, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)),
        );
        if (Math.hypot(px - bx * t, py - by * t, pz - bz * t) < STRIP_CLEAR) {
          return false;
        }
      }
    }
    return true;
  };
  let [lo, hi] = [0, 0];
  if (!clear(0)) {
    hi = STRIP_STEP;
    while (hi < STRIP_MOST && !clear(hi)) {
      hi += STRIP_STEP;
    }
    lo = hi - STRIP_STEP;
    for (let n = 0; n < 3; n++) {
      const mid = (lo + hi) / 2;
      if (clear(mid)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
  }
  return [hinge, mul(q, axis(strip.axis, hi))];
};

/**
 * The triangles around a bending joint, blended between the parent bone `a` and the child `b`
 * (`w`: each vertex's share of `b`) so the knee, ankle, hip and elbow do not open as they bend.
 * Vertices in model space at rest.
 */
export interface HunterBand {
  a: number;
  b: number;
  vertices: Float32Array;
  w: Float32Array;
}

/** The Hunter's rigid pieces and, near, his blended joint bands. */
export interface HunterRig {
  pieces: HunterPiece[];
  bands: HunterBand[];
}

/**
 * The bending joints: parent, child, whether the band runs along the child's bone (the hip,
 * whose parent bone points up the spine), the band's centre past the joint along that bone and
 * its half width, and for the shoulder the height under which the sleeve (out of the trunk) is wholly the arm's. The ankle's centre is up the shin, so the whole boot stays on the foot.
 */
export type Bend = [number, number, boolean, number, number, number?];
export const BENDS: Bend[] = (
  [
    // The trunk twists and bends along the spine.
    [J.PELVIS, J.SPINE, false, 0, 0.1],
    [J.SPINE, J.CHEST, false, 0, 0.1],
  ] as Bend[]
).concat(
  [-1, 1].flatMap(side => {
    const [arm, fore, thigh, shin, foot, toe] =
      side < 0
        ? [J.ARM_L, J.FOREARM_L, J.THIGH_L, J.SHIN_L, J.FOOT_L, J.TOE_L]
        : [J.ARM_R, J.FOREARM_R, J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R];
    return [
      // Across the shoulder ring, from the chest (the collarbone shrugs with the stride and
      // would tear the flank); below the armpit the sleeve is all arm.
      [J.CHEST, arm, false, 0, 0.07, 1.45],
      [J.PELVIS, thigh, true, 0, 0.08],
      [thigh, shin, false, 0, 0.07],
      [shin, foot, false, -0.12, 0.06],
      // The boot bends at the ball of the foot, its lames with it.
      [foot, toe, false, 0, 0.05],
      [arm, fore, false, 0, 0.06],
    ] as Bend[];
  }),
);

/** The child's share of a vertex at `p` across the bend `k` of BENDS. */
export const shareOf = (p: Vec3, k: number) => {
  const [a, b, child, centre, half, armpit = -Infinity] = BENDS[k];
  if (p[1] < armpit && Math.abs(p[0]) > 0.25) {
    return 1;
  }
  const [from, to] = child ? [b, PARENT.indexOf(b)] : [a, b];
  const u = unit(sub(HUNTER_REST[to], HUNTER_REST[from]));
  const d = sub(p, HUNTER_REST[b]);
  const t = Math.min(
    1,
    Math.max(0, (d[0] * u[0] + d[1] * u[1] + d[2] * u[2] - centre + half) / (2 * half)),
  );
  return t * t * (3 - 2 * t);
};

/** Whether a part's skin bends at its joints: the anatomy and the soft leg kit, not the knee cap. */
export const BENDY =
  /^(Marine anatomy|Right arm|Chest net|Arm net|Yoke|Thigh net|Leg straps|Shin plates|Shin seams|Ankle cuff|Boot lames|Boot side)/;
export const rigs: Partial<Record<0 | 1 | 2, HunterRig>> = {};

/**
 * The Hunter cut into rigid pieces, one per joint (and shadow flag, and the stowed harpoon), so the runner's animated
 * skeleton can carry him: each triangle goes to the nearest bone its part may follow. Above the
 * far level, the triangles across a bend go to a blended band instead (BENDS).
 * `skip` leaves out parts (the far level's dreadlocks and grille).
 */
export const hunterRig = (
  lod: 0 | 1 | 2,
  skip: (name: string) => boolean = () => false,
): HunterRig => {
  if (rigs[lod]) {
    return rigs[lod]!;
  }
  const pieces = new Map<number, HunterPiece>();
  const bands = BENDS.map(() => ({ vertices: [] as number[], w: [] as number[] }));
  for (const [name, v] of Object.entries(hunter(lod))) {
    if (skip(name)) {
      continue;
    }
    const thin = name.startsWith('Temple') || name === 'Rangefinder';
    const bendy = lod > 0 && BENDY.test(name);
    // Far, the strips are one with the belt, rigid on the pelvis.
    const strip =
      lod > 0 && name.startsWith(STRIP) ? hingeOf(+name.slice(STRIP.length), v) : undefined;
    for (let i = 0; i < v.length; i += 3 * STRIDE) {
      const corners = [0, 1, 2].map(
        k => [v[i + k * STRIDE], v[i + k * STRIDE + 1], v[i + k * STRIDE + 2]] as Vec3,
      );
      // A spot goes whole to one bone, by the corner its four triangles share: split between two,
      // it would open as they part.
      const c: Vec3 =
        name === 'Spots'
          ? corners[0]
          : ([0, 1, 2].map(k => (corners[0][k] + corners[1][k] + corners[2][k]) / 3) as Vec3);
      const allowed = followed(name, c);
      let joint = -1,
        best = Infinity;
      for (const j of allowed) {
        // The boot under the ankle stays on the foot, however far the bent shin's end is.
        if (
          (j == J.SHIN_L || j == J.SHIN_R) &&
          Math.min(corners[0][1], corners[1][1], corners[2][1]) < HUNTER_REST[j + 1][1] + 0.06
        ) {
          continue;
        }
        const d = toBone(c, j);
        if (d < best) {
          [joint, best] = [j, d];
        }
      }
      if (bendy) {
        let band = -1;
        for (let e = 0; e < BENDS.length && band < 0; e++) {
          const [a, b] = BENDS[e];
          if (
            (joint != a && joint != b) ||
            !allowed.includes(a) ||
            !allowed.includes(b) ||
            (HUNTER_REST[b][0] != 0 && Math.sign(c[0]) != Math.sign(HUNTER_REST[b][0]))
          ) {
            continue;
          }
          const ws = corners.map(p => shareOf(p, e));
          if (ws.some(w => w > 0 && w < 1) || ws.some(w => w != ws[0])) {
            band = e;
          } else {
            // Wholly on one side of the bend: that bone's, so its corners meet the band's.
            joint = ws[0] ? b : a;
          }
        }
        if (band >= 0) {
          for (let n = 0; n < 3; n++) {
            bands[band].vertices.push(...v.slice(i + n * STRIDE, i + (n + 1) * STRIDE));
            bands[band].w.push(shareOf(corners[n], band));
          }
          continue;
        }
      }
      const harpoon = name === 'Harpoon';
      const cannon = name === 'Shoulder laser';
      const disc = name === 'Flying disc';
      const key =
        joint * 16 +
        +thin +
        2 * +harpoon +
        4 * +cannon +
        8 * +disc +
        (strip ? 1000 * (strip.i + 1) : 0);
      let piece = pieces.get(key);
      if (!piece) {
        pieces.set(key, (piece = { joint, thin, harpoon, cannon, disc, strip, vertices: [] }));
      }
      const o = cannon
        ? CANNON_HINGE
        : strip
          ? add(strip.at, HUNTER_REST[J.PELVIS])
          : HUNTER_REST[joint];
      for (let k = i; k < i + 3 * STRIDE; k += STRIDE) {
        piece.vertices.push(
          v[k] - o[0],
          v[k + 1] - o[1],
          v[k + 2] - o[2],
          ...v.slice(k + 3, k + STRIDE),
        );
      }
    }
  }
  return (rigs[lod] = {
    pieces: [...pieces.keys()].sort((a, b) => a - b).map(k => pieces.get(k)!),
    bands: bands
      .map((band, k) => ({
        a: BENDS[k][0],
        b: BENDS[k][1],
        vertices: Float32Array.from(band.vertices),
        w: Float32Array.from(band.w),
      }))
      .filter(band => band.w.length > 0),
  });
};

/**
 * Where the Hunter's joints stand in the posed runner `pos`/`rot` (solve()): his own bones
 * (HUNTER_REST) turned as the runner's, from a pelvis that moves as the runner's scaled to his
 * stature. `at` is the runner's feet and `yaw` his heading.
 */
export const hunterPose = (
  pos: Vec3[],
  rot: [number, number, number, number][],
  at: Vec3,
  yaw: number,
  out: Vec3[] = [],
): Vec3[] => {
  const bind = HUNTER_BIND;
  const off = turn(
    axis([0, 1, 0], yaw),
    sub(HUNTER_REST[J.PELVIS], bind.map(v => v * stature) as Vec3),
  );
  out[J.PELVIS] = [0, 1, 2].map(k => at[k] + stature * (pos[J.PELVIS][k] - at[k]) + off[k]) as Vec3;
  for (let j = 1; j < JOINTS; j++) {
    const p = PARENT[j];
    const [qx, qy, qz, qw] = rot[p];
    const [x, y, z] = sub(HUNTER_REST[j], HUNTER_REST[p]);
    const tx = 2 * (qy * z - qz * y),
      ty = 2 * (qz * x - qx * z),
      tz = 2 * (qx * y - qy * x);
    out[j] = [
      out[p][0] + x + qw * tx + qy * tz - qz * ty,
      out[p][1] + y + qw * ty + qz * tx - qx * tz,
      out[p][2] + z + qw * tz + qx * ty - qy * tx,
    ];
  }
  return out;
};
export const HUNTER_BIND = solve(rest()).pos[J.PELVIS];

/**
 * Draws a blended band (HunterBand) on the Hunter's posed joints (hunterPose()) and the runner's
 * rotations: each vertex placed by both bones and mixed by its share, its normal likewise.
 */
export const blendHunter = (
  out: Out,
  band: HunterBand,
  joints: Vec3[],
  rot: [number, number, number, number][],
): void => {
  const { a, b, vertices: v, w } = band;
  const [ra, rb, pa, pb] = [HUNTER_REST[a], HUNTER_REST[b], joints[a], joints[b]];
  const [ax, ay, az, aw] = rot[a];
  const [bx, by, bz, bw] = rot[b];
  const start = out.length;
  const dst = room(out, v.length);
  for (let i = 0, n = 0; i < v.length; i += STRIDE, n++) {
    const k = w[n],
      h = 1 - k;
    // The place from each bone's rest frame, turned and moved by it.
    let x = v[i] - ra[0],
      y = v[i + 1] - ra[1],
      z = v[i + 2] - ra[2];
    let tx = 2 * (ay * z - az * y),
      ty = 2 * (az * x - ax * z),
      tz = 2 * (ax * y - ay * x);
    const px = pa[0] + x + aw * tx + ay * tz - az * ty,
      py = pa[1] + y + aw * ty + az * tx - ax * tz,
      pz = pa[2] + z + aw * tz + ax * ty - ay * tx;
    x = v[i] - rb[0];
    y = v[i + 1] - rb[1];
    z = v[i + 2] - rb[2];
    tx = 2 * (by * z - bz * y);
    ty = 2 * (bz * x - bx * z);
    tz = 2 * (bx * y - by * x);
    const o = start + i;
    dst[o] = h * px + k * (pb[0] + x + bw * tx + by * tz - bz * ty);
    dst[o + 1] = h * py + k * (pb[1] + y + bw * ty + bz * tx - bx * tz);
    dst[o + 2] = h * pz + k * (pb[2] + z + bw * tz + bx * ty - by * tx);
    x = v[i + 3];
    y = v[i + 4];
    z = v[i + 5];
    tx = 2 * (ay * z - az * y);
    ty = 2 * (az * x - ax * z);
    tz = 2 * (ax * y - ay * x);
    const nx = x + aw * tx + ay * tz - az * ty,
      ny = y + aw * ty + az * tx - ax * tz,
      nz = z + aw * tz + ax * ty - ay * tx;
    tx = 2 * (by * z - bz * y);
    ty = 2 * (bz * x - bx * z);
    tz = 2 * (bx * y - by * x);
    const mx = h * nx + k * (x + bw * tx + by * tz - bz * ty),
      my = h * ny + k * (y + bw * ty + bz * tx - bx * tz),
      mz = h * nz + k * (z + bw * tz + bx * ty - by * tx);
    // Math.hypot() is many times slower than the square root here.
    const l = 1 / (Math.sqrt(mx * mx + my * my + mz * mz) || 1);
    dst[o + 3] = mx * l;
    dst[o + 4] = my * l;
    dst[o + 5] = mz * l;
    dst[o + 6] = v[i + 6];
    dst[o + 7] = v[i + 7];
    dst[o + 8] = v[i + 8];
    dst[o + 9] = v[i + 9];
  }
  out.length = start + v.length;
};
