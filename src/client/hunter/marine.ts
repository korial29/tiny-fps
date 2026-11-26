import { STRIDE, WEAVE, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { body } from '../skin';
import { hands, HUNTER_HAND } from '../body';
import { KIND } from '../features';
import { JOINT as J, JOINTS, rest, solve } from '../rig';
import { Verts } from '../verts';
import {
  CHEST_THIN,
  HIDE,
  HIDE_LIGHT,
  HIDE_SPOT,
  HUNTER_FIST,
  PIT,
  PIT_ARM,
  SPOTS,
  graphite,
  hide,
  stature,
} from './constants';

export const bell = (x: number) => Math.exp(-x * x);
export const built: Partial<Record<0 | 1 | 2, Record<string, number[]>>> = {};

// Sculpt the Marine's rest skin, including the shared shoulder and crotch vertices.
// Bone weights distinguish the inside of an arm from the adjacent chest wall.
export function marineBuild(
  lod: 0 | 1 | 2,
  chestFaces: number[],
  swordArm: number[],
  armFaces: number[],
  spotFaces: [number, number][],
): number[] {
  const base = body([0, 1, 3][lod]);
  const points: Vec3[] = [];
  const arm: number[] = [],
    leg: number[] = [];
  const faces: number[][] = [];
  const share = (joint: number, limb: 'arm' | 'leg') =>
    Number(
      limb === 'arm'
        ? (joint >= J.ARM_L && joint <= J.HAND_L) ||
            (joint >= J.ARM_R && joint <= J.HAND_R) ||
            joint >= JOINTS
        : joint >= J.THIGH_L && joint < JOINTS,
    );
  for (let i = 0; i < base.w.length; i++) {
    points.push([base.v[6 * i], base.v[6 * i + 1], base.v[6 * i + 2]]);
    const a = base.j[2 * i],
      b = base.j[2 * i + 1],
      w = base.w[i];
    arm.push((1 - w) * share(a, 'arm') + w * share(b, 'arm'));
    leg.push((1 - w) * share(a, 'leg') + w * share(b, 'leg'));
  }
  const splits = new Map<number, number>();
  function mid(a: number, b: number) {
    const key = Math.min(a, b) * 1048576 + Math.max(a, b);
    const found = splits.get(key);
    if (found !== undefined) {
      return found;
    }
    const i = points.length;
    points.push(points[a].map((v, k) => (v + points[b][k]) / 2) as Vec3);
    arm.push((arm[a] + arm[b]) / 2);
    leg.push((leg[a] + leg[b]) / 2);
    splits.set(key, i);
    return i;
  }
  for (let i = 0; i < base.t.length; i += 3) {
    const [a, b, c] = base.t.subarray(i, i + 3);
    if ([a, b, c].some(k => base.g[k] !== KIND.BODY || points[k][1] > 1.558)) {
      continue;
    }
    if (lod === 2) {
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      faces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    } else {
      faces.push([a, b, c]);
    }
  }

  if (lod === 2) {
    // Add intermediate samples for the shallow relief across the Marine's broad torso rings.
    const coarse = faces.splice(0);
    for (const [a, b, c] of coarse) {
      if ([a, b, c].every(k => points[k][1] > 1.02 && points[k][1] < 1.52 && arm[k] < 0.5)) {
        const ab = mid(a, b),
          bc = mid(b, c),
          ca = mid(c, a);
        faces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      } else {
        faces.push([a, b, c]);
      }
    }
  }
  const fadeIn = (v: number) => Math.min(1, Math.max(0, v));
  function shape([x, y, z]: Vec3, armWeight: number, legWeight: number): Vec3 {
    // Fade into the shared shoulder ring before the sleeve joins the trunk.
    armWeight *= Math.min(1, Math.max(0, (1.41 - y) / 0.105));
    const ax = Math.abs(x),
      sign = Math.sign(x),
      torso = 1 - armWeight - legWeight;
    const chest = bell((y - 1.405) / 0.15);
    // The upper arm's swell (the user, 2026-11-24: leaner, a man's proportions) and the forearm's.
    const armMass = 0.2 * bell((y - 1.319) / 0.084) + 0.36 * bell((y - 1.098) / 0.073);
    const legMass = 0.26 * bell((y - 0.745) / 0.15) + 0.22 * bell((y - 0.35) / 0.095);
    const shoulder = 0.036 + 0.17 * Math.max(0, 1.45 - y) - 0.024 * bell((y - 1.37) / 0.14);
    const armX = 0.205;
    const deltoid = bell((y - 1.446) / 0.072) * bell((ax - 0.222) / 0.057);
    // Fill the lower rib cage and waist progressively; the shoulder cap tapers separately.
    // Under the armpit the flank draws in, so the arm stands clear of it up to the shoulder.
    const ribWidth =
      1.09 + 0.13 * chest + 0.11 * bell((y - 1.178) / 0.16) - PIT * bell((y - 1.33) / 0.075);
    const wide =
      ax * ribWidth * torso +
      0.008 * deltoid +
      // The inside of the upper arm is flatter than its outside: it does not sink into the chest.
      (armX +
        shoulder +
        (ax - armX) *
          (1.18 +
            armMass -
            (ax < armX ? (1.18 + armMass - PIT_ARM) * fadeIn((y - 1.2) / 0.1) : 0))) *
        armWeight +
      (0.125 + (ax - 0.1) * (1.1 + legMass)) * legWeight;
    let depth = z * (1.18 - CHEST_THIN * chest * torso + armMass * armWeight + legMass * legWeight);
    depth += z * 0.1 * deltoid;
    const front = Math.min(1, Math.max(0, -z / 0.074));
    // Broad paired pecs narrowing into the sternum, then three shorter abdominal pairs.
    const pec = 0.067 * bell(((ax - 0.09) / 0.086) ** 2) * bell((y - 1.371 - 0.12 * ax) / 0.096);
    // The oblique slips fan up from the central abdominal tendon.
    let abs = 0;
    for (const height of [1.065, 1.125, 1.187, 1.25]) {
      const rise = 0.56 * ax + 1.9 * ax * ax;
      abs += 0.023 * bell((y - height - rise) / 0.031) * bell((ax - 0.073) / 0.075);
    }
    const oblique = 0.013 * bell((ax - 0.123) / 0.032) * bell((y - 1.2 - 0.32 * ax) / 0.12);
    depth -= torso * front * (pec + abs + oblique);
    depth +=
      torso *
      Math.max(0, Math.min(1, z / 0.085)) *
      0.042 *
      bell((ax - 0.083) / 0.056) *
      bell((y - 1.37) / 0.14);
    depth -=
      front *
      (armWeight * (0.043 * bell((y - 1.307) / 0.071) + 0.021 * bell((y - 1.098) / 0.08)) +
        legWeight *
          (0.047 * bell((ax - 0.12 - 0.2 * (y - 0.72)) / 0.041) * bell((y - 0.726) / 0.133) +
            0.028 * bell((ax - 0.067) / 0.029) * bell((y - 0.59) / 0.065)));
    const reach = Math.max(0, 1.46 - y) * armWeight;
    depth += armWeight * Math.max(0, z / 0.07) * 0.036 * bell((y - 1.336) / 0.098);
    const stance = 0.042 * Math.min(1, Math.max(0, (0.955 - y) / 0.51)) * legWeight;
    return [sign * (wide + stance + 0.073 * reach), y - 0.115 * reach + 0.009 * deltoid, depth];
  }
  const vertices = points.map((p, i) => shape(p, arm[i], leg[i]));
  // Both Marine rings at the armpit share a height. Fit the front of their
  // junction to the same chest surface, with a rounded belly and a shallow sternum.
  const fade = (v: number) => {
    const t = Math.min(1, Math.max(0, v));
    return t * t * (3 - 2 * t);
  };
  const pecSurface = (x: number, y: number) => {
    const ax = Math.sqrt(x * x + 0.0004);
    const ribs = (0.172 - 0.2 * CHEST_THIN) * Math.sqrt(Math.max(0.02, 1 - (x / 0.365) ** 2));
    const belly = 0.074 * bell((ax - 0.129) / 0.135) * bell((y - 1.371 - 0.12 * ax) / 0.1);
    const sternum = 0.004 * bell(x / 0.04) * bell((y - 1.4) / 0.097);
    return -ribs - belly + sternum + 0.023 * ((y - 1.398) / 0.143) ** 2;
  };
  const influence = vertices.map(
    ([x, y, z]) =>
      fade((y - 1.246) / 0.075) *
      fade((1.526 - y) / 0.07) *
      fade((0.324 - Math.abs(x)) / 0.074) *
      fade((-z - 0.036) / 0.052),
  );
  vertices.forEach((p, i) => {
    if (influence[i]) {
      p[2] += (pecSurface(p[0], p[1]) - p[2]) * influence[i];
    }
  });
  const normals: Vec3[] = points.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const u = sub(vertices[b], vertices[a]),
      v = sub(vertices[c], vertices[a]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const k of [a, b, c]) {
      for (let d = 0; d < 3; d++) {
        normals[k][d] += n[d];
      }
    }
  }
  const smooth = normals.map((n, i) => {
      const w = influence[i],
        original = unit(n);
      if (!w) {
        return original;
      }
      const [x, y] = vertices[i],
        h = 0.0001;
      const surfaceNormal = unit([
        pecSurface(x + h, y) - pecSurface(x - h, y),
        pecSurface(x, y + h) - pecSurface(x, y - h),
        -2 * h,
      ]);
      return unit(original.map((v, k) => v + (surfaceNormal[k] - v) * w) as Vec3);
    }),
    result: number[] = [];
  // The clavicles rise outwards from the sternum, then flatten at the acromion.
  // Move the skin in depth and transform its normals with the same displacement.
  function collarDepth(x: number, y: number, z: number) {
    const ax = Math.abs(x);
    const span = fade((ax - 0.007) / 0.03) * fade((0.279 - ax) / 0.067);
    const line =
      1.485 + 0.025 * Math.sin(Math.PI * Math.min(1, ax / 0.25)) + 0.011 * Math.min(1, ax / 0.25);
    const ridge = 0.02 * bell((y - line) / 0.013);
    const hollow = 0.006 * bell((y - line - 0.019) / 0.019);
    return span * fade((-z - 0.03) / 0.06) * (hollow - ridge);
  }
  vertices.forEach((p, i) => {
    const [x, y, z] = p;
    if (y < 1.44 || y > 1.555 || z >= -0.03 || Math.abs(x) >= 0.279) {
      return;
    }
    const h = 0.0001;
    const dx = (collarDepth(x + h, y, z) - collarDepth(x - h, y, z)) / (2 * h);
    const dy = (collarDepth(x, y + h, z) - collarDepth(x, y - h, z)) / (2 * h);
    const dz = (collarDepth(x, y, z + h) - collarDepth(x, y, z - h)) / (2 * h);
    const [nx, ny, nz] = smooth[i];
    const depthNormal = nz / (1 + dz);
    smooth[i] = unit([nx - depthNormal * dx, ny - depthNormal * dy, depthNormal]);
    p[2] += collarDepth(x, y, z);
  });
  for (const face of faces) {
    if (face.every(k => points[k][0] > 0 && arm[k] > 0.3 && points[k][1] <= 1.361)) {
      swordArm.push(result.length);
    }
    if (face.every(k => arm[k] < 0.5) && face.some(k => points[k][1] > 0.98)) {
      chestFaces.push(result.length);
    } else if (face.some(k => arm[k] >= 0.5) && face.every(k => points[k][1] > 0.9)) {
      armFaces.push(result.length);
    }
    // The faces that take the hide's round spots, and how thickly: the trunk, the arms down to
    // the bracers and the legs down to the greaves.
    const spotted =
      face.every(k => points[k][1] > (arm[k] >= 0.5 ? 0.9 : 0.45)) &&
      spotFaces.push([result.length, 0]);
    for (const k of face) {
      const y = points[k][1];
      const tint = y < 0.145 ? graphite : hide;
      const [px, py, pz] = vertices[k];
      const coverage =
        tint === hide ? Math.min(1, Math.max(0, (y - 0.15) / 0.07) + arm[k] + leg[k]) : 0;
      // His hide (the user, 2026-11-24): olive, lightened to a green beige over the pecs and the
      // abs, and broken by dark green spots that gather on the flanks, the back and the limbs.
      const flanks = Math.min(1, Math.abs(px) / 0.33);
      const front = Math.max(0, -smooth[k][2]);
      // The same on his two sides.
      const mx = Math.abs(px);
      const pigment =
        0.5 +
        0.5 *
          Math.sin(47 * mx + 17 * py + 1.7 * Math.sin(23 * pz - 27 * py)) *
          Math.cos(33 * py - 29 * pz + 0.9 * Math.sin(35 * mx));
      const fine =
        0.5 +
        0.5 *
          Math.sin(173 * mx - 131 * py + 2.1 * Math.sin(97 * pz + 61 * mx)) *
          Math.cos(149 * pz + 113 * py);
      const belly =
        front *
        (1 - arm[k]) *
        (1 - leg[k]) *
        bell(px / 0.21) *
        fade((py - 1.0) / 0.08) *
        fade((1.47 - py) / 0.07);
      const midline = 0.087 * bell(px / 0.018) * bell((py - 1.32) / 0.18);
      const dark = Math.max(
        flanks,
        arm[k],
        0.8 * leg[k],
        Math.min(1, Math.max(0, smooth[k][2]) * 1.4),
      );
      const spots =
        fade((pigment - 0.42) / 0.2) *
        (0.25 + 0.75 * dark) *
        (1 - 0.75 * belly) *
        (0.6 + 0.4 * fine);
      if (spotted) {
        spotFaces[spotted - 1][1] += ((0.12 + 0.88 * dark) * (1 - 0.85 * belly)) / 3;
      }
      const shade = 0.95 - 0.16 * flanks + 0.1 * front - midline;
      const warm = mix(mix(HIDE, HIDE_LIGHT, belly), HIDE_SPOT, 0.55 * spots).map(c => c * shade);
      const wristBlend = arm[k] * fade((1.015 - y) / 0.09);
      result.push(
        ...vertices[k],
        ...smooth[k],
        (1 - wristBlend) * (tint[0] + coverage * (warm[0] - tint[0])) + wristBlend * HUNTER_HAND[0],
        (1 - wristBlend) * (tint[1] + coverage * (warm[1] - tint[1])) + wristBlend * HUNTER_HAND[1],
        -1,
        (1 - wristBlend) * (tint[2] + coverage * (warm[2] - tint[2])) + wristBlend * HUNTER_HAND[2],
      );
    }
  }
  if (lod) {
    // Use the same buffer type as the hands drawn every frame.
    const fingers = new Verts();
    const skeleton = solve(rest());
    hands(
      fingers,
      skeleton,
      0,
      // The left hand half open, the right one a fist round the claw's grip (the user, 2026-11-24).
      [0.19, HUNTER_FIST],
      HUNTER_HAND,
      HUNTER_HAND,
      { claws: 'short' },
      lod === 1,
    );
    const v = fingers.a;
    for (let i = 0; i < fingers.length; i += STRIDE) {
      if (i % (3 * STRIDE) === 0 && v[i] > 0) {
        swordArm.push(result.length);
      }
      const wrist = skeleton.pos[v[i] < 0 ? J.HAND_L : J.HAND_R];
      const reach = fade((wrist[1] - v[i + 1]) / 0.09);
      const p = shape(
        [
          wrist[0] + (v[i] - wrist[0]) * (1 + 0.24 * reach),
          wrist[1] + (v[i + 1] - wrist[1]) * (1 + 0.18 * reach),
          wrist[2] + (v[i + 2] - wrist[2]) * (1 + 0.2 * reach),
        ],
        1,
        0,
      );
      result.push(...p, ...v.subarray(i + 3, i + STRIDE));
    }
  }
  return result;
}

// Cut each diagonal ribbon on the finished skin triangles. Interpolating at
// their shared edges keeps the diamonds continuous over the pecs and flanks.
export function net(
  skin: number[],
  faces: number[],
  // Where a point of the skin is on the net: its turn round the body or the limb, how far along,
  // and its distance inside the net's two ends (cut where one is negative).
  at: (p: Vec3) => { angle: number; y: number; collar: number; low: number },
  // The strands round the body and per unit along it.
  around: number,
  along: number,
): number[] {
  const mesh: number[] = [];
  type Corner = { p: Vec3; angle: number; y: number; collar: number; low: number };
  function clip(polygon: Corner[], distance: (v: Corner) => number): Corner[] {
    const kept: Corner[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = distance(a),
        db = distance(b);
      if (da >= 0) {
        kept.push(a);
      }
      if (da >= 0 === db >= 0) {
        continue;
      }
      const t = da / (da - db);
      kept.push({
        p: a.p.map((x, k) => x + (b.p[k] - x) * t) as Vec3,
        angle: a.angle + (b.angle - a.angle) * t,
        y: a.y + (b.y - a.y) * t,
        collar: a.collar + (b.collar - a.collar) * t,
        low: a.low + (b.low - a.low) * t,
      });
    }
    return kept;
  }
  for (const start of faces) {
    const tri = [0, 1, 2].map(k => {
      const i = start + k * STRIDE;
      // A hair over the skin: it follows the same bones (BENDY), so it never sinks in.
      const p = [0, 1, 2].map(axis => skin[i + axis] + 0.003 * skin[i + 3 + axis]) as Vec3;
      return { p, ...at([skin[i], skin[i + 1], skin[i + 2]]) };
    });
    for (const v of tri) {
      v.angle -= Math.round(v.angle - tri[0].angle);
    }
    const patch = clip(
      clip(tri, v => v.low),
      v => v.collar,
    );
    if (patch.length < 3) {
      continue;
    }
    const [a, b, c] = tri.map(v => v.p);
    const ab = sub(b, a),
      ac = sub(c, a);
    const n = unit([
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ]);
    for (const direction of [-1, 1]) {
      const phase = (v: Corner) => around * v.angle + direction * along * v.y;
      const phases = patch.map(phase);
      for (
        let strand = Math.ceil(Math.min(...phases) - 0.035);
        strand <= Math.max(...phases) + 0.035;
        strand++
      ) {
        const band = clip(
          clip(patch, v => phase(v) - strand + 0.035),
          v => strand + 0.035 - phase(v),
        );
        for (let k = 2; k < band.length; k++) {
          for (const v of [band[0], band[k - 1], band[k]]) {
            mesh.push(...v.p, ...n, 0.07, 0.063, WEAVE, 0.055);
          }
        }
      }
    }
  }
  return mesh;
}

/** The yoke's lower edge at `x` across the shoulders, in the runner's metres. */
export const yokeLine = (x: number) => 1.455 + 0.04 * Math.min(1, Math.abs(x) / 0.3) ** 2;
// The yoke (the user, 2026-11-24): black leather as the belt's strips, over the base of the neck
// and the collarbones from one shoulder plate to the other. It is the skin's own triangles above
// yokeLine(), lifted off it, the lift easing to nothing at the edge.
export function yoke(skin: number[], faces: number[]): number[] {
  const mesh: number[] = [];
  type Corner = { p: Vec3; n: Vec3; h: number };
  for (const start of faces) {
    const tri = [0, 1, 2].map((k): Corner => {
      const i = start + k * STRIDE;
      return {
        p: [skin[i], skin[i + 1], skin[i + 2]],
        n: [skin[i + 3], skin[i + 4], skin[i + 5]],
        h: skin[i + 1] / stature - yokeLine(skin[i]),
      };
    });
    const kept: Corner[] = [];
    tri.forEach((a, i) => {
      const b = tri[(i + 1) % 3];
      if (a.h >= 0) {
        kept.push(a);
      }
      if (a.h >= 0 !== b.h >= 0) {
        const t = a.h / (a.h - b.h);
        kept.push({ p: mix(a.p, b.p, t), n: unit(mix(a.n, b.n, t)), h: 0 });
      }
    });
    for (let k = 2; k < kept.length; k++) {
      for (const v of [kept[0], kept[k - 1], kept[k]]) {
        const lift = 0.002 + 0.006 * Math.min(1, v.h / 0.012);
        mesh.push(
          ...v.p.map((c, axis) => c + lift * v.n[axis]),
          ...v.n,
          0.056,
          0.051,
          WEAVE,
          0.046,
        );
      }
    }
  }
  return mesh;
}

// The hide's spots (the user, 2026-11-24, after a reference picture): small round dark green dots,
// the same on his two sides, thick on the flanks, the back and the limbs and thinning out over the
// chest. Each is a flat hexagon laid on a triangle of his right side's skin, a hair over it, and
// its mirror on his left. `faces` gives each triangle's place in `skin` and how thickly it is
// spotted (0 to 1).
export function spots(skin: number[], faces: [number, number][]): number[] {
  const mesh: number[] = [];
  // A fixed sequence (mulberry32): the same spots at every build.
  let seed = 0x2f6e2b1;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (const [start, thick] of faces) {
    const [a, b, c] = [0, 1, 2].map(
      k => skin.slice(start + k * STRIDE, start + k * STRIDE + 6) as number[],
    );
    if (a[0] + b[0] + c[0] < 0.012) {
      continue;
    }
    const ab = sub(b as never, a as never),
      ac = sub(c as never, a as never);
    const area =
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) / 2;
    for (let n = Math.floor(SPOTS * thick * area + random()); n > 0; n--) {
      let u = random(),
        v = random();
      if (u + v > 1) {
        [u, v] = [1 - u, 1 - v];
      }
      const at = a.map((x, k) => x + u * (b[k] - x) + v * (c[k] - x));
      const normal = unit([at[3], at[4], at[5]]);
      const side = unit(
        Math.abs(normal[1]) < 0.9 ? [normal[2], 0, -normal[0]] : [0, normal[2], -normal[1]],
      );
      const up: Vec3 = [
        normal[1] * side[2] - normal[2] * side[1],
        normal[2] * side[0] - normal[0] * side[2],
        normal[0] * side[1] - normal[1] * side[0],
      ];
      const radius = 0.0035 + 0.0065 * random() ** 2;
      const corner = (i: number): Vec3 => {
        const turn = (Math.PI * i) / 3,
          x = radius * Math.cos(turn),
          y = radius * Math.sin(turn);
        return [0, 1, 2].map(k => at[k] + 0.002 * normal[k] + x * side[k] + y * up[k]) as Vec3;
      };
      // Four triangles from one corner: a third fewer vertices than a fan round the middle.
      for (let i = 1; i < 5; i++) {
        const fan = [corner(0), corner(i), corner(i + 1)];
        for (const mirror of [1, -1]) {
          // The mirrored triangle is wound the other way round, to face out as well.
          for (const p of mirror > 0 ? fan : [fan[0], fan[2], fan[1]]) {
            mesh.push(
              mirror * p[0],
              p[1],
              p[2],
              mirror * normal[0],
              normal[1],
              normal[2],
              HIDE_SPOT[0],
              HIDE_SPOT[1],
              -1,
              HIDE_SPOT[2],
            );
          }
        }
      }
    }
  }
  return mesh;
}
