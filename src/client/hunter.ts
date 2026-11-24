// Hunter design study. Parts share the runner's metre scale, -z facing and mesh vertex format.
import {
  GILT,
  GLOSS,
  SHINE,
  STRIDE,
  TWILL,
  WEAVE,
  aim,
  mix,
  place,
  capsule,
  dress,
  segment,
  solid,
  sub,
  unit,
} from './mesh';
import type { Vec3 } from './mesh';
import type { PlayerState } from '../shared/types';

import { body } from './skin';
import { LINK, TUBE, loft, panel, rod } from './rover';
import { glow } from './flag';
import { wristBlade, wristEnds } from './katana';
import { hands, HUNTER_HAND } from './body';
import { KIND } from './features';
import { JOINT as J, JOINTS, PARENT, axis, rest, solve, turn } from './rig';
import { Verts, room } from './verts';
import type { Out } from './verts';
import { mesh } from './store';
import type { Pieces } from './store';
import type { Quat } from './rig';

const hide: Vec3 = [0.39, 0.42, 0.28];
const leather: Vec3 = [0.15, 0.12, 0.105];
/** His hide: its olive, the green beige of the pecs and the abs, and its dark green spots. */
const HIDE: Vec3 = [0.43, 0.36, 0.25];
const HIDE_LIGHT: Vec3 = [0.66, 0.6, 0.43];
const HIDE_SPOT: Vec3 = [0.08, 0.15, 0.08];
const graphite: Vec3 = [0.18, 0.22, 0.23];
const silver: Vec3 = [0.57, 0.66, 0.66];
const bronze: Vec3 = [0.59, 0.37, 0.19];
const light: Vec3 = [1, 0.24, 0.065];

const stature = 1.2;
/** The helmet's width against its first build (the user, 2026-11-24: narrower). */
const HELM_WIDTH = 0.88;
/** The wrist blades and their housing stand off the back of the hand and sit up the forearm (the user, 2026-11-24: they cut into the hand), in the runner's metres. */
const WRIST_LIFT = 0.022;
const WRIST_UP = 0.02;
/** Where the sleeves' net ends on the arm: its share from the shoulder to the wrist. */
const NET_SLEEVE = 0.55;
/** The armpit's cut (the user, 2026-11-24): how far the flank draws in under it, and the width of the upper arm's inside. */
const PIT = 0.11;
const PIT_ARM = 0.85;
/** The hide's round spots to a square metre of its most spotted skin. */
const SPOTS = 430;
/** How much thinner the chest is from the side than the runner's (the user, 2026-11-24: too thick in profile). */
const CHEST_THIN = 0.1;
/** What the finished model is scaled by from the sculpt, off the head (hunter()'s last pass). */
const sized = ([x, y, z]: Vec3): Vec3 => [x * stature * 0.9, y * stature, z * stature * 0.92];
/** The top of the shoulder cannon's post, sculpted (CANNON_HINGE in the finished model). */
const HINGE: Vec3 = [-0.221, 1.637, 0.06];
/** The foot of the cannon's post, sculpted (CANNON_POST in the finished model). */
const POST: Vec3 = [-0.233, 1.54, 0.082];
const bell = (x: number) => Math.exp(-x * x);
const built: Partial<Record<0 | 1 | 2, Record<string, number[]>>> = {};

// Sculpt the Marine's rest skin, including the shared shoulder and crotch vertices.
// Bone weights distinguish the inside of an arm from the adjacent chest wall.
function marineBuild(
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
      [0.19, 0.19],
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
function net(
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
const yokeLine = (x: number) => 1.455 + 0.04 * Math.min(1, Math.abs(x) / 0.3) ** 2;
// The yoke (the user, 2026-11-24): black leather as the belt's strips, over the base of the neck
// and the collarbones from one shoulder plate to the other. It is the skin's own triangles above
// yokeLine(), lifted off it, the lift easing to nothing at the edge.
function yoke(skin: number[], faces: number[]): number[] {
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
function spots(skin: number[], faces: [number, number][]): number[] {
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

export function hunter(lod: 0 | 1 | 2) {
  if (built[lod]) {
    return built[lod]!;
  }
  const parts: Record<string, number[]> = {};
  let out: number[] = [];
  const part = (name: string) => {
    out = parts[name] = [];
  };
  function limb(
    a: Vec3,
    b: Vec3,
    radii: number[],
    color: Vec3,
    depth = 1,
    layer = -1,
    rounded = false,
  ) {
    const start = out.length;
    const length = Math.hypot(...sub(b, a));
    const side: Vec3 = Math.abs(b[0] - a[0]) > length * 0.9 ? [0, 1, 0] : [1, 0, 0];
    const rings = rounded ? (lod === 2 ? 6 : 3) : 0;
    const profile = radii.flatMap((radius, i) => {
      if (i === radii.length - 1 || lod === 0) {
        return [radius];
      }
      const mid = (radius + radii[i + 1]) / 2;
      const bend =
        (radius +
          radii[i + 1] -
          radii[Math.max(0, i - 1)] -
          radii[Math.min(radii.length - 1, i + 2)]) /
        16;
      return [radius, mid + bend];
    });
    const mesh =
      lod === 0
        ? solid(0, length, radii, rounded ? [1, 1] : [0, 0])
        : dress(capsule(length, profile, lod === 2 ? 24 : 12, [rings, rings]), [1, 1, 1]);
    segment(out, mesh, a, b, side, length, [1, depth], color);
    for (let i = start + 8; i < out.length; i += STRIDE) {
      out[i] = layer;
    }
  }
  // Round the outline with a quadratic Bezier at each corner, then loft the shell
  // through shrinking copies of the outline to the crown. Shared normals cross each seam.
  function plate(edge: Vec3[], peak: Vec3, color: Vec3, sharp = false, layer = TWILL) {
    const outline: Vec3[] = [];
    const corners = [1, 3, 6][lod];
    const blend = sharp ? 0.05 : 0.34;
    const area = edge.reduce((sum, p, i) => {
      const q = edge[(i + 1) % edge.length];
      return sum + p[0] * q[1] - p[1] * q[0];
    }, 0);
    if (area > 0) {
      edge.reverse();
    }
    edge.forEach((p, i) => {
      const prev = edge[(i + edge.length - 1) % edge.length];
      const next = edge[(i + 1) % edge.length];
      for (let j = 0; j <= corners; j++) {
        const t = j / corners;
        outline.push(
          p.map(
            (v, k) => v + blend * ((1 - t) ** 2 * (prev[k] - v) + t ** 2 * (next[k] - v)),
          ) as Vec3,
        );
      }
    });
    const steps = [2, 4, 7][lod];
    const points: Vec3[] = [];
    const faces: number[][] = [];
    const count = outline.length;
    for (let row = 0; row < steps; row++) {
      const angle = (Math.PI * row) / (2 * steps);
      const width = sharp ? 1 - row / steps : Math.cos(angle);
      const height = sharp ? row / steps : Math.sin(angle);
      outline.forEach((q, i) => {
        points.push([
          peak[0] + width * (q[0] - peak[0]),
          peak[1] + width * (q[1] - peak[1]),
          q[2] + height * (peak[2] - q[2]),
        ]);
        const a = row * count + i,
          b = row * count + ((i + 1) % count);
        if (row === steps - 1) {
          faces.push([a, b, steps * count]);
        } else {
          faces.push([a, b, b + count], [a, b + count, a + count]);
        }
      });
    }
    points.push(peak);
    const normals: Vec3[] = points.map(() => [0, 0, 0]);
    function normal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
      const u = sub(b, a),
        v = sub(c, a);
      return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    }
    const vertex = (p: Vec3, n: Vec3) => out.push(...p, ...n, color[0], color[1], layer, color[2]);
    for (const [a, b, c] of faces) {
      const n = normal(points[a], points[b], points[c]);
      for (const i of [a, b, c]) {
        for (let k = 0; k < 3; k++) {
          normals[i][k] += n[k];
        }
      }
    }
    const smooth = normals.map(unit);
    for (const face of faces) {
      for (const i of face) {
        vertex(points[i], smooth[i]);
      }
    }
    const back: Vec3 = [peak[0], peak[1], Math.max(...edge.map(p => p[2])) + 0.014];
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % count],
        n = unit(normal(b, a, back));
      for (const p of [b, a, back]) {
        vertex(p, n);
      }
    });
  }

  const chestFaces: number[] = [];
  const swordArm: number[] = [];
  const armFaces: number[] = [];
  const spotFaces: [number, number][] = [];
  parts['Marine anatomy'] = marineBuild(lod, chestFaces, swordArm, armFaces, spotFaces);
  part('Mask lining');
  limb([0, 1.51, 0], [0, 1.68, 0], [0.085, 0.077, 0.097], [0.35, 0.25, 0.18], 0.97);
  const lining = out.length;
  limb([0, 1.59, 0], [0, 1.86, 0.01], [0.084, 0.112, 0.144, 0.13, 0.058], graphite, 1, TWILL);
  for (let i = lining; i < out.length; i += STRIDE) {
    out[i] *= HELM_WIDTH;
  }
  // A tube swept along a path, its section carried from point to point without twist, with shared
  // normals round it and a fan closing its last ring.
  function sweep(path: Vec3[], radii: number[], sides: number, color: Vec3, layer = -1) {
    const rings: [Vec3, Vec3][][] = [];
    let side: Vec3 = [0, 0, 1];
    path.forEach((p, i) => {
      const along = unit(sub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]));
      // A path along the section's own axis takes another to start from.
      if (Math.abs(side[0] * along[0] + side[1] * along[1] + side[2] * along[2]) > 0.99) {
        side = [1, 0, 0];
      }
      const k = side[0] * along[0] + side[1] * along[1] + side[2] * along[2];
      side = unit([side[0] - k * along[0], side[1] - k * along[1], side[2] - k * along[2]]);
      const up: Vec3 = [
        along[1] * side[2] - along[2] * side[1],
        along[2] * side[0] - along[0] * side[2],
        along[0] * side[1] - along[1] * side[0],
      ];
      rings.push(
        Array.from({ length: sides }, (_, j): [Vec3, Vec3] => {
          const a = (2 * Math.PI * j) / sides,
            c = Math.cos(a),
            d = Math.sin(a);
          const n: Vec3 = [
            c * side[0] + d * up[0],
            c * side[1] + d * up[1],
            c * side[2] + d * up[2],
          ];
          return [[p[0] + radii[i] * n[0], p[1] + radii[i] * n[1], p[2] + radii[i] * n[2]], n];
        }),
      );
    });
    const vertex = ([p, n]: [Vec3, Vec3]) =>
      out.push(...p, ...n, color[0], color[1], layer, color[2]);
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let j = 0; j < sides; j++) {
        const k = (j + 1) % sides;
        [
          rings[i][j],
          rings[i][k],
          rings[i + 1][k],
          rings[i][j],
          rings[i + 1][k],
          rings[i + 1][j],
        ].forEach(vertex);
      }
    }
    const last = rings.length - 1,
      end = path[last],
      along = unit(sub(end, path[last - 1]));
    for (let j = 0; j < sides; j++) {
      [rings[last][j], rings[last][(j + 1) % sides], [end, along] as [Vec3, Vec3]].forEach(vertex);
    }
  }
  // The dreadlocks (the user, 2026-11-24, after a reference picture): separate locks rooted under
  // the shell's rim from each temple round to the nape, each falling on its own, of its own
  // length, with bronze rings. [degrees round the head from the side to the back, length, reach
  // out of the head, rings along it, and for those that fall over the chest, how far from the
  // middle they end].
  const DREADS: [number, number, number, number[], number?][] = [
    [-10, 0.44, 0.07, [0.4, 0.52], 0.16],
    [5, 0.37, 0.08, [0.5], 0.125],
    [20, 0.47, 0.085, [0.33, 0.45, 0.72], 0.2],
    [34, 0.43, 0.09, [0.3, 0.42, 0.7]],
    [48, 0.36, 0.085, [0.5]],
    [60, 0.48, 0.07, [0.28, 0.4]],
    [71, 0.39, 0.08, [0.55, 0.68]],
    [81, 0.5, 0.06, [0.3]],
  ];
  for (const s of [-1, 1]) {
    part('Dreads' + s);
    const steps = lod === 2 ? 7 : 4,
      sides = lod === 2 ? 8 : 5;
    DREADS.forEach(([degrees, length, reach, bands, chest], j) => {
      const a = (degrees * Math.PI) / 180,
        dx = s * Math.cos(a),
        dz = Math.sin(a);
      const root: Vec3 = [0.13 * HELM_WIDTH * dx, 1.795, 0.035 + 0.165 * dz];
      // The left ones stay inside the shoulder cannon's post.
      const out = s < 0 && degrees < 40 ? Math.min(reach, 0.045) : reach;
      const sway = j % 2 ? 0.02 : -0.015;
      // Out from under the rim, over, then straight down: a cubic Bezier.
      const knots: Vec3[] = chest
        ? [
            root,
            [root[0] + out * dx, root[1] + 0.012, root[2] + out * dz - 0.03],
            [s * (chest + 0.03), root[1] - 0.14, -0.2],
            [s * chest, root[1] - length, -0.29],
          ]
        : [
            root,
            [root[0] + out * dx, root[1] + 0.012, root[2] + out * dz],
            [root[0] + 1.25 * out * dx, root[1] - 0.35 * length, root[2] + 1.25 * out * dz],
            [root[0] + 1.35 * out * dx, root[1] - length, root[2] + 1.35 * out * dz + sway],
          ];
      const at = (t: number): Vec3 =>
        knots[0].map(
          (_, k) =>
            (1 - t) ** 3 * knots[0][k] +
            3 * (1 - t) ** 2 * t * knots[1][k] +
            3 * (1 - t) * t ** 2 * knots[2][k] +
            t ** 3 * knots[3][k],
        ) as Vec3;
      const thick = (t: number) => 0.022 - 0.008 * t - 0.009 * Math.max(0, (t - 0.85) / 0.15);
      const ts = Array.from({ length: steps + 1 }, (_, i) => (i / steps) ** 0.8);
      sweep(ts.map(at), ts.map(thick), sides, j % 2 ? graphite : leather);
      for (const t of bands) {
        const w = 0.012 / length;
        sweep(
          [t - 2 * w, t - w, t + w, t + 2 * w].map(at),
          [0, 0.005, 0.005, 0].map(r => thick(t) + r - (r ? 0 : 0.002)),
          sides,
          bronze,
          SHINE,
        );
      }
    });
  }
  part('Harpoon harness');
  // The single docking shoe remains on the back when the rifle is drawn.
  limb([0, 1.34, 0.115], [0, 1.34, 0.211], [0.058, 0.05], graphite, 0.75, TWILL);
  // Cut the cuffs from the forearm surface. Only the dorsal ridge stands
  // proud; the sides and palm side keep the arm's natural taper.
  const forearms = parts['Marine anatomy'];
  for (const side of [1, -1]) {
    part(side > 0 ? 'Blade cuff' : 'Left bracer');
    for (let i = 0; i < forearms.length; i += 3 * STRIDE) {
      const y0 = forearms[i + 1],
        y1 = forearms[i + STRIDE + 1],
        y2 = forearms[i + 2 * STRIDE + 1];
      if (
        side * forearms[i] < 0.28 ||
        Math.max(y0, y1, y2) < 0.884 ||
        Math.min(y0, y1, y2) > 1.093
      ) {
        continue;
      }
      let face = [0, 1, 2].map(k => forearms.slice(i + k * STRIDE, i + k * STRIDE + 6));
      for (const bound of [0.884, 1.093]) {
        const polygon: number[][] = [];
        for (let j = 0; j < face.length; j++) {
          const a = face[j],
            b = face[(j + 1) % face.length];
          if (bound === 0.884 ? a[1] >= bound : a[1] <= bound) {
            polygon.push(a);
          }
          if ((a[1] - bound) * (b[1] - bound) < 0) {
            const t = (bound - a[1]) / (b[1] - a[1]);
            polygon.push(a.map((v, k) => v + t * (b[k] - v)));
          }
        }
        face = polygon;
      }
      for (let j = 2; j < face.length; j++) {
        for (const v of [face[0], face[j - 1], face[j]]) {
          const n = unit([v[3], v[4], v[5]]);
          const dorsal = Math.max(0, side * n[0]) ** 4;
          const offset = 0.0025 + (side > 0 ? 0.014 + WRIST_LIFT : 0.014) * dorsal;
          out.push(
            v[0] + n[0] * offset,
            v[1] + n[1] * offset,
            v[2] + n[2] * offset,
            ...n,
            silver[0],
            silver[1],
            TWILL,
            silver[2],
          );
        }
      }
    }
  }
  part('Laser saddle');
  limb([-0.228, 1.48, 0.079], [-0.233, 1.552, 0.082], [0.045, 0.049, 0.029], graphite, 1.05, TWILL);
  const alloy: Vec3 = [0.42, 0.425, 0.405];
  const rim: Vec3 = [0.36, 0.365, 0.35];
  // Angles run from the wearer's left to right across the face. Each panel
  // has its own edge normals so the lip of the visor catches a separate highlight.
  type Surface = (u: number, v: number) => Vec3;
  function panel(
    surface: Surface,
    cols: number,
    rows: number,
    tint: Vec3,
    reverse = false,
    layer = TWILL,
  ) {
    const verts: number[][] = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = i / cols,
          v = j / rows;
        const du = sub(surface(Math.min(1, u + 0.001), v), surface(Math.max(0, u - 0.001), v));
        const dv = sub(surface(u, Math.min(1, v + 0.001)), surface(u, Math.max(0, v - 0.001)));
        const n = unit([
          dv[1] * du[2] - dv[2] * du[1],
          dv[2] * du[0] - dv[0] * du[2],
          dv[0] * du[1] - dv[1] * du[0],
        ]);
        verts.push([
          ...surface(u, v),
          ...n.map(c => (reverse ? -c : c)),
          tint[0],
          tint[1],
          layer,
          tint[2],
        ]);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i,
          b = a + 1,
          c = a + cols + 1,
          d = c + 1;
        for (const k of reverse ? [a, b, c, b, d, c] : [a, c, b, b, c, d]) {
          out.push(...verts[k]);
        }
      }
    }
  }

  // One smooth normal field per plate; separate calls keep the overlapping lips distinct.
  function armor(surface: Surface, cols: number, rows: number, tint: Vec3) {
    panel(surface, cols, rows, tint);
  }

  // Fit the kit to cross-sections of the actual leg at this level of detail.
  // Each ray meets the skin before the ankle straps or the cords stand off it.
  const legSkin = parts['Marine anatomy'];
  const low = 0.083,
    step = 0.022,
    levels = 37,
    sectors = [12, 24, 36][lod];
  const bootCentres: Record<number, number> = {};
  for (const side of [-1, 1]) {
    const centres: number[] = [];
    const radii: number[][] = [];
    const slices: number[][] = Array.from({ length: levels }, () => []);
    for (let i = 0; i < legSkin.length; i += 3 * STRIDE) {
      if (side * legSkin[i] < -0.005 || side * legSkin[i] > 0.31) {
        continue;
      }
      const a = legSkin[i + 1],
        b = legSkin[i + STRIDE + 1],
        c = legSkin[i + 2 * STRIDE + 1];
      const first = Math.max(0, Math.ceil((Math.min(a, b, c) - low) / step));
      const last = Math.min(levels - 1, Math.ceil((Math.max(a, b, c) - low) / step) - 1);
      for (let row = first; row <= last; row++) {
        slices[row].push(i);
      }
    }
    for (let row = 0; row < levels; row++) {
      const y = low + row * step;
      const edges: number[][] = [];
      let xmin = Infinity,
        xmax = -Infinity;
      for (const i of slices[row]) {
        const hits: number[] = [];
        for (let j = 0; j < 3; j++) {
          const a = i + j * STRIDE,
            b = i + ((j + 1) % 3) * STRIDE;
          if (legSkin[a + 1] > y === legSkin[b + 1] > y) {
            continue;
          }
          const t = (y - legSkin[a + 1]) / (legSkin[b + 1] - legSkin[a + 1]);
          hits.push(
            legSkin[a] + t * (legSkin[b] - legSkin[a]),
            legSkin[a + 2] + t * (legSkin[b + 2] - legSkin[a + 2]),
          );
        }
        if (hits.length !== 4) {
          continue;
        }
        edges.push(hits);
        xmin = Math.min(xmin, hits[0], hits[2]);
        xmax = Math.max(xmax, hits[0], hits[2]);
      }
      const cx = (xmin + xmax) / 2;
      centres.push(cx);
      radii.push(
        Array.from({ length: sectors }, (_, k) => {
          const angle = (2 * Math.PI * k) / sectors,
            dx = Math.sin(angle),
            dz = -Math.cos(angle);
          let radius = Infinity;
          for (const [x, z, bx, bz] of edges) {
            const ex = bx - x,
              ez = bz - z,
              det = dx * ez - dz * ex;
            if (Math.abs(det) < 1e-10) {
              continue;
            }
            const r = ((x - cx) * ez - z * ex) / det,
              t = ((x - cx) * dz - z * dx) / det;
            if (r > 0 && t >= 0 && t <= 1) {
              radius = Math.min(radius, r);
            }
          }
          return radius;
        }),
      );
    }
    bootCentres[side] = centres[0];
    function wrap(angle: number, y: number, gap: number): Vec3 {
      const h = Math.min(levels - 1, Math.max(0, (y - low) / step)),
        a = Math.floor(h),
        b = Math.min(levels - 1, a + 1);
      const turn = ((((angle / (2 * Math.PI)) % 1) + 1) % 1) * sectors,
        k = Math.floor(turn),
        next = (k + 1) % sectors;
      const radius = (row: number) =>
        radii[row][k] + (radii[row][next] - radii[row][k]) * (turn - k);
      const r = radius(a) + (radius(b) - radius(a)) * (h - a) + gap;
      return [
        centres[a] + (centres[b] - centres[a]) * (h - a) + r * Math.sin(angle),
        y,
        -r * Math.cos(angle),
      ];
    }

    if (lod) {
      part('Thigh net ' + side);
      const cords = lod === 2 ? 11 : 8;
      for (const direction of [-1, 1]) {
        for (let i = 0; i < cords; i++) {
          panel(
            (u, v) =>
              wrap(
                (2 * Math.PI * i) / cords + direction * 3.75 * v + (u - 0.5) * 0.044,
                0.535 + 0.337 * v,
                0.007 + 0.0006 * (1 - direction),
              ),
            1,
            lod === 2 ? 24 : 14,
            leather,
            false,
            WEAVE,
          );
        }
      }
    }
    part('Leg straps ' + side);
    for (const [base, width] of [
      [0.087, 0.029],
      [0.319, 0.026],
      [0.511, 0.021],
      [0.837, 0.034],
    ]) {
      panel(
        (u, v) => wrap(2 * Math.PI * u, base + width * v, 0.009 + 0.003 * Math.sin(Math.PI * v)),
        lod ? sectors : 8,
        lod ? 3 : 1,
        leather,
        false,
        TWILL,
      );
    }
    // Keep the lames and their raised seams on the same slim shell.
    const greave = (angle: number, y: number, relief: number) =>
      wrap(angle, y, 0.003 + 0.48 * relief);
    part('Shin plates ' + side);
    for (let course = 0; course < 5; course++) {
      const base = 0.143 + 0.062 * course;
      const jointClearance = course === 0 ? 0.018 : course === 4 ? 0.013 : 0;
      armor(
        (u, v) => {
          const angle = (u - 0.5) * (2.52 + 0.28 * v);
          const centre = 1 - 2 * Math.abs(u - 0.5);
          const fold = Math.max(0, 1 - Math.abs(u - 0.5) * 5);
          return greave(
            angle,
            base + 0.077 * v - 0.041 * centre,
            0.012 + jointClearance + 0.014 * (1 - v) + 0.021 * fold + 0.004 * centre,
          );
        },
        lod === 0 ? 6 : lod === 1 ? 10 : 12,
        lod === 0 ? 2 : 3,
        course % 2 ? [0.38, 0.42, 0.41] : [0.45, 0.49, 0.47],
      );
    }
    part('Shin seams ' + side);
    for (let course = 0; lod && course < 5; course++) {
      const base = 0.143 + 0.062 * course;
      const jointClearance = course === 0 ? 0.018 : course === 4 ? 0.013 : 0;
      armor(
        (u, v) => {
          const centre = 1 - 2 * Math.abs(u - 0.5);
          const fold = Math.max(0, 1 - Math.abs(u - 0.5) * 5);
          return greave(
            (u - 0.5) * 2.53,
            base - 0.041 * centre + 0.005 * v,
            0.029 + jointClearance + 0.023 * fold + 0.005 * centre,
          );
        },
        8,
        1,
        [0.18, 0.22, 0.22],
      );
    }
    part('Ankle cuff ' + side);
    armor(
      (u, v) => greave((u - 0.5) * 2.65, 0.078 + 0.082 * v, 0.037 - 0.026 * v),
      8,
      2,
      [0.29, 0.33, 0.33],
    );
    // Fit the instep plates to transverse slices of the boot, from the
    // rounded toe up to the ankle. Their edges turn down with the leather.
    const footFaces: number[] = [];
    for (let i = 0; i < legSkin.length; i += 3 * STRIDE) {
      if (
        [0, 1, 2].every(
          k => side * legSkin[i + k * STRIDE] > 0 && legSkin[i + k * STRIDE + 1] < 0.19,
        )
      ) {
        footFaces.push(i);
      }
    }
    const footPoint = (angle: number, z: number): Vec3 => {
      const dx = Math.sin(angle),
        dy = Math.cos(angle);
      const cx = bootCentres[side],
        cy = 0.025;
      let radius = 0;
      for (const i of footFaces) {
        const za = legSkin[i + 2],
          zb = legSkin[i + STRIDE + 2],
          zc = legSkin[i + 2 * STRIDE + 2];
        if (z < Math.min(za, zb, zc) || z > Math.max(za, zb, zc)) {
          continue;
        }
        // In the plane normal to the ray, the sample lies at (0,z).
        const projected = [0, 1, 2].map(k => {
          const j = i + k * STRIDE;
          const x = legSkin[j] - cx,
            y = legSkin[j + 1] - cy;
          return [dy * x - dx * y, legSkin[j + 2] - z, dx * x + dy * y];
        });
        const [a, b, c] = projected;
        const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        if (Math.abs(det) < 1e-10) {
          continue;
        }
        const u = (b[0] * c[1] - b[1] * c[0]) / det,
          v = (c[0] * a[1] - c[1] * a[0]) / det;
        if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) {
          radius = Math.max(radius, u * a[2] + v * b[2] + (1 - u - v) * c[2]);
        }
      }
      return [cx + dx * (radius + 0.0035), cy + dy * (radius + 0.0035), z];
    };
    part('Boot lames ' + side);
    for (let j = 0; j < 2; j++) {
      panel(
        (u, v) => {
          const across = 2 * u - 1;
          return footPoint(across * 1.29, -0.227 + j * 0.09 + v * 0.083 + 0.022 * across ** 2);
        },
        lod === 0 ? 6 : 12,
        lod === 0 ? 2 : 4,
        j ? rim : alloy,
      );
    }
    part('Boot side ' + side);
    for (const edge of [-1, 1]) {
      panel(
        (u, v) => footPoint(edge * (1.46 - 0.5 * v), -0.035 + 0.102 * u),
        lod === 0 ? 3 : 6,
        2,
        graphite,
        edge < 0,
      );
    }
    part('Patella ' + side);
    const cap: Surface = (u, v) => {
      const angle = (u - 0.5) * (2.38 + 0.3 * v);
      const fold = Math.max(0, 1 - Math.abs(u - 0.5) * 4);
      const chevron = 1 - 2 * Math.abs(u - 0.5);
      return greave(
        angle,
        0.426 + 0.125 * v - 0.022 * chevron * (1 - v),
        0.039 + 0.031 * fold * Math.sin(Math.PI * v) + 0.011 * chevron,
      );
    };
    armor(cap, lod === 0 ? 6 : lod === 1 ? 10 : 12, lod === 0 ? 2 : 4, [0.49, 0.52, 0.5]);
    part('Patella crest ' + side);
    armor(
      (u, v) => {
        const centre = 1 - 2 * Math.abs(u - 0.5);
        return greave((u - 0.5) * (1.4 + 0.2 * v), 0.453 + 0.085 * v - 0.027 * centre, 0.088);
      },
      4,
      2,
      [0.54, 0.58, 0.56],
    );
  }

  const slices = [16, 36, 72][lod];
  const rings = [5, 10, 18][lod];
  // The shell's lower edge dips to the bridge of the nose and climbs to the temples.
  const brow = (a: number) =>
    1.731 + (0.116 * (1 - Math.cos(a))) / 2 + 0.022 * (1 - Math.exp(-((a / 0.55) ** 2)));
  // The eyes: two slots close to the bridge, a slit beyond them.
  const aperture = (a: number) => 0.005 + 0.031 * Math.exp(-((Math.abs(a) - 0.5) ** 2) / 0.05);
  const polar = (a: number, w: number, depth: number, y: number, z = 0): Vec3 => [
    HELM_WIDTH * w * Math.sin(a),
    y,
    z - depth * Math.cos(a),
  ];

  part('Cranial shell');
  const dome: Surface = (u, v) => {
    const a = (u - 0.5) * 2 * Math.PI,
      t = v * Math.PI * 0.4999;
    return polar(
      a,
      0.153 * Math.cos(t),
      0.181 * Math.cos(t),
      brow(a) + (2.01 - brow(a)) * Math.sin(t),
      0.132 * Math.sin(t) ** 1.35 + ((0.039 * (1 - Math.cos(a))) / 2) * Math.sin(2 * t),
    );
  };
  panel(dome, slices, rings, alloy);
  panel(
    (u, v) => {
      const a = (u - 0.5) * 2 * Math.PI;
      return polar(a, 0.147 + v * 0.006, 0.174 + v * 0.007, brow(a) - 0.003 * (1 - v));
    },
    slices,
    2,
    rim,
  );

  part('Visor grille');
  const visor: Surface = (u, v) => {
    const a = (u - 0.5) * 3.36;
    // Set back inside the shell and the jaw, its top under the brow's rim: no two faces share a place.
    return polar(a, 0.1455, 0.1705, brow(a) + 0.004 - (aperture(a) + 0.006) * (1 - v));
  };
  // The eyes are glossy black lenses: a highlight, but no sky in them, which would turn them blue.
  panel(visor, slices, 2, [0.012, 0.012, 0.014], false, GLOSS);

  // A bevel around the mouth and two dished cheeks are sculpted into one shell.
  const smoothStep = (lo: number, hi: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };
  part('Mandible shell');
  panel(
    (u, v) => {
      const a = (u - 0.5) * (3.76 - 0.48 * v),
        side = Math.abs(Math.sin(a));
      const bottom = 1.574 + 0.052 * side ** 2 + 0.016 * (1 - Math.cos(a));
      const top = brow(a) - aperture(a) - 0.0015;
      const bulge = Math.sin(Math.PI * v);
      const p = polar(
        a,
        0.127 + 0.023 * v + 0.016 * bulge + 0.014 * side ** 2 * bulge,
        0.159 + 0.019 * v + 0.021 * bulge,
        bottom + (top - bottom) * v,
        -0.012 * (1 - v),
      );
      const x = Math.abs(p[0]);
      const cheek =
        Math.exp(-(((Math.abs(a) - 0.91) / 0.48) ** 2) - ((v - 0.36 - 0.29 * side) / 0.225) ** 2) *
        bulge;
      p[0] *= 1 - 0.19 * cheek;
      p[2] += 0.037 * cheek;

      // The top edge fits below the narrow central bridge of the grille.
      const width = 0.058 - 0.022 * v;
      const bevel = 1 - smoothStep(width - 0.008, width + 0.009, x);
      const mouth = bevel * smoothStep(0, 0.1, v) * (1 - smoothStep(0.83, 0.99, v));
      const faceDepth = -0.213 - 0.007 * v + 0.004 * (x / width) ** 2;
      p[2] += (faceDepth - p[2]) * mouth;
      return p;
    },
    slices * 2,
    rings * 2,
    alloy,
  );

  for (const sign of [-1, 1]) {
    part('Swept temple rail' + sign);
    const rail: Surface = (u, v) => {
      const a = sign * u * 2.27;
      const taper = Math.sin(Math.PI * (0.16 + 0.84 * u)) ** 0.64;
      const sweep = Math.max(0, (u - 0.66) / 0.34) ** 2;
      return polar(
        a,
        0.154 + 0.006 * taper + 0.011 * Math.sin(Math.PI * v) * taper,
        0.183 + 0.008 * Math.sin(Math.PI * v) * taper,
        brow(a) + 0.001 + 0.111 * u * u + v * 0.082 * taper,
        0.107 * sweep,
      );
    };
    // Close the swept tip on the inner face where it lifts clear of the shell: its back half only.
    // Over the brow the inner face would lie in the outer one and show through it as a grey patch.
    panel(rail, slices / 2, 5, rim, sign < 0);
    panel(
      (h, v) => {
        const u = 0.5 + 0.5 * h;
        const p = rail(u, v);
        p[0] -=
          sign *
          0.012 *
          Math.sin(Math.PI * h) ** 0.5 *
          Math.sin(Math.PI * u) *
          Math.sin(Math.PI * v);
        return p;
      },
      slices / 4,
      5,
      rim,
      sign > 0,
    );
  }
  // A flush three-port optical cluster sits just above the outer eye.
  part('Temple optics');
  const opticNormal = unit([0.91, 0.02, -0.42]);
  const socket: Vec3 = [0.146 * HELM_WIDTH, 1.797, -0.072];
  function port(base: Vec3, length: number, radii: number[], tint: Vec3) {
    const end = base.map((c, k) => c + length * opticNormal[k]) as Vec3;
    limb(base, end, radii, tint, 1, TWILL);
    return end;
  }
  const cap = port(socket, 0.012, [0.022, 0.023, 0.021], rim);
  const lens = port(cap, 0.001, [0.018, 0.018], graphite);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3,
      dx = 0.008 * Math.cos(a);
    const base: Vec3 = [lens[0] + 0.42 * dx, lens[1] + 0.008 * Math.sin(a), lens[2] + 0.91 * dx];
    const lip = port(base, 0.0014, [0.0058, 0.0057], alloy);
    port(lip, 0.0004, [0.0038, 0.0038], [0.055, 0.063, 0.06]);
  }
  part('Rangefinder');
  limb([-0.221, 1.704, 0.064], [-0.231, 1.691, -0.052], [0.011, 0.015, 0.012], graphite, 1, TWILL);
  limb([-0.231, 1.691, -0.052], [-0.231, 1.691, -0.054], [0.006, 0.006], light, 1, -2);
  const skin = parts['Marine anatomy'];
  part('Shoulder plates');
  const torsoFaces = new Set(chestFaces);
  const ribGuard: number[] = [];
  // Fit the shell directly to the sculpted deltoid and clavicle. Its front
  // edge sweeps inward across the pec, and its outer skirt sits on the arm.
  for (let i = 0; i < skin.length; i += 3 * STRIDE) {
    const corners = [0, 1, 2].map(k => i + k * STRIDE);
    if (corners.every(k => skin[k + 1] < 1.02 || Math.abs(skin[k]) < 0.035)) {
      continue;
    }
    const rib = torsoFaces.has(i) && corners.some(k => skin[k] < -0.045 && skin[k + 1] < 1.49);
    for (let course = lod ? -2 : 0; course <= (rib ? 3 : 0); course++) {
      if (!lod && course > 0 && course !== 2) {
        continue;
      }
      const triangle = corners.map(k => {
        const x = Math.abs(skin[k]),
          y = skin[k + 1],
          z = skin[k + 2];
        const front = Math.max(0, Math.min(1, -z / 0.16));
        const inside = 0.18 - 0.08 * front + 0.026 * bell((y - 1.53) / 0.042);
        const lower =
          1.342 + 0.09 * Math.exp(-(((x - 0.17) / 0.115) ** 2)) + 0.032 * Math.max(0, z / 0.16);
        // Three long flutes run around the ribs under the armpit. Their
        // tips converge at the belt while the upper ends tuck under the pauldron.
        const t = Math.min(1, Math.max(0, (y - 1.035) / 0.425));
        const fullness = Math.sin(Math.PI * t);
        const width = 0.2 + 0.21 * t + 0.25 * fullness;
        const azimuth = Math.atan2(-skin[k], -z);
        const centre = 1.3 - 0.25 * t + 0.08 * fullness;
        const flute = centre + (course - 2) * width * 0.57;
        const ribEdge = Math.min(
          (width * (lod ? 0.43 : 0.95) - Math.abs(azimuth - flute)) * 0.23,
          y - 1.035 - 0.018 * Math.abs(course - 2),
          1.425 - y - 0.008 * Math.abs(course - 2),
        );
        return {
          p: skin.slice(k, k + 3) as Vec3,
          n:
            course > 0
              ? (skin.slice(k + 3, k + 6) as Vec3)
              : unit([
                  Math.sign(skin[k]) * Math.max(0.015, x - 0.205),
                  (y - 1.325) * 0.72,
                  z * 1.35,
                ]),
          edge:
            course > 0
              ? ribEdge
              : Math.min(
                  x - inside,
                  y - lower,
                  course === 0
                    ? 1
                    : y - lower + course * 0.043 - 0.023 * Math.min(1, Math.abs(z) / 0.16),
                ),
        };
      });
      // Bevel the cut edge into a dark welt under the brushed metal face.
      const bevels = [
        [0, 0.005, 0.003, 0.005, graphite],
        [0.005, 0.014, 0.008, 0.006, rim],
        [0.014, 1, 0.014, 0, alloy],
      ] as const;
      const distant = [[0, 1, 0.009, 0, alloy]] as const;
      for (const [lo, hi, base, rise, tint] of lod ? bevels : distant) {
        let polygon = triangle;
        for (const bound of [lo, hi]) {
          const kept: typeof triangle = [];
          for (let j = 0; j < polygon.length; j++) {
            const a = polygon[j],
              b = polygon[(j + 1) % polygon.length];
            const keep = bound === lo ? a.edge >= bound : a.edge <= bound;
            if (keep) {
              kept.push(a);
            }
            const crosses = (a.edge - bound) * (b.edge - bound) < 0;
            if (!crosses) {
              continue;
            }
            const t = (bound - a.edge) / (b.edge - a.edge);
            kept.push({
              p: a.p.map((v, k) => v + t * (b.p[k] - v)) as Vec3,
              n: a.n.map((v, k) => v + t * (b.n[k] - v)) as Vec3,
              edge: bound,
            });
          }
          polygon = kept;
        }
        for (let j = 2; j < polygon.length; j++) {
          for (const v of [polygon[0], polygon[j - 1], polygon[j]]) {
            const n = unit(v.n);
            const bevel = base + (rise * (v.edge - lo)) / (hi - lo);
            const lift =
              course > 0 ? 0.002 + 0.55 * bevel + 0.0015 * (3 - course) : bevel - course * 0.007;
            const color = course > 0 ? (lo === 0 ? leather : lo < 0.014 ? rim : graphite) : tint;
            const target = course > 0 ? ribGuard : out;
            target.push(
              v.p[0] + lift * n[0],
              v.p[1] + lift * n[1],
              v.p[2] + lift * n[2],
              ...n,
              color[0],
              color[1],
              TWILL,
              color[2],
            );
          }
        }
      }
    }
  }
  parts['Rib guard'] = ribGuard;
  part('Belt');
  limb([0, 0.973, 0], [0, 1.045, 0], [0.198, 0.206, 0.191], graphite, 0.86, WEAVE);
  // A layered clasp and narrow pouches break up the broad belt.
  plate(
    [
      [-0.052, 1.027, -0.202],
      [0.052, 1.027, -0.202],
      [0.054, 0.987, -0.211],
      [0.044, 0.963, -0.214],
      [-0.044, 0.963, -0.214],
      [-0.054, 0.987, -0.211],
    ],
    [0, 0.995, -0.223],
    alloy,
  );
  for (const side of [-1, 1]) {
    // Low profile pouches sit beside the buckle.
    limb(
      [side * 0.137, 0.966, -0.159],
      [side * 0.137, 1.035, -0.15],
      [0.034, 0.036, 0.031],
      leather,
      0.9,
      TWILL,
    );
  }
  // Each tasset folds along its spine. The turned lower lip casts a dark V
  // over the next lame, and the exposed leather traces the silhouette.
  for (let index = 0; index < 4; index++) {
    const angle = (index * Math.PI) / 2;
    const side = index % 2 === 1;
    const length = side ? 0.29 : 0.315;
    const count = [2, 5, 7][lod];
    function tasset(across: number, down: number, lift: number, border = 0): Vec3 {
      const width = (side ? 0.074 : 0.065) * (1 - 0.24 * down - 0.3 * down ** 4) + border;
      const spine = 1 - Math.abs(across);
      const radius =
        (side ? 0.217 : index === 0 ? 0.205 : 0.196) +
        (side ? 0.047 : 0.042) * (1 - (1 - down) ** 3) +
        0.015 * spine +
        lift;
      const x = across * width;
      return [
        x * Math.cos(angle) + radius * Math.sin(angle),
        0.984 - length * down - (0.019 + 0.022 * down) * spine,
        x * Math.sin(angle) - radius * Math.cos(angle),
      ];
    }
    for (const half of [-1, 1]) {
      const face = (u: number) => (half < 0 ? u - 1 : u);
      panel((u, v) => tasset(face(u), v, 0, 0.006), 1, 3, leather, true, WEAVE);
      for (let row = 0; row < count; row++) {
        const end = (row + 1) / count;
        panel(
          (u, v) => tasset(face(u), (row + 0.94 * v) / count, 0.003 + 0.009 * v),
          1,
          1,
          alloy,
          true,
          SHINE,
        );
        panel(
          (u, v) => tasset(face(u), end - (0.06 * (1 - v)) / count, 0.012 - 0.009 * v),
          1,
          1,
          rim,
          true,
          TWILL,
        );
      }
    }
  }
  // A ring of folded black strips sits under the tassets, flaring over the thigh net.
  const strips = 16;
  for (let i = 0; i < strips; i++) {
    panel(
      (u, v) => {
        const angle = ((i + (u - 0.5) * (1.04 - 0.08 * v)) * 2 * Math.PI) / strips;
        const flare = 1 - (1 - v) ** 3;
        const hip = Math.sin(2 * angle) ** 2;
        const fold = 0.006 * Math.sin(Math.PI * u) + 0.004 * u;
        return [
          (0.193 + 0.055 * flare + 0.027 * hip + fold) * Math.sin(angle),
          0.987 - v * (0.26 + 0.016 * (i % 2) + 0.023 * Math.sin(Math.PI * u)),
          -(0.166 + 0.041 * flare + 0.058 * hip + fold) * Math.cos(angle),
        ];
      },
      lod ? 4 : 2,
      3,
      [0.056, 0.051, 0.046],
      true,
      WEAVE,
    );
  }
  part('Wrist blade');
  const twin = wristBlade(lod);
  for (let i = 0; i < twin.length; i += STRIDE) {
    out.push(
      0.392 + WRIST_LIFT + twin[i] * 0.86,
      0.884 + WRIST_UP + twin[i + 1] * 0.86,
      twin[i + 2] * 0.86,
      twin[i + 3],
      twin[i + 4],
      twin[i + 5],
      ...twin.slice(i + 6, i + STRIDE),
    );
  }
  part('Laser mount');
  limb(POST, HINGE, [0.027, 0.021, 0.031], alloy, 0.88, TWILL);
  // The cannon itself, drawn deployed: it turns about the top of its post (CANNON_HINGE).
  part('Shoulder laser');
  limb(HINGE, [-0.219, 1.66, 0.1], [0.024, 0.022], alloy, 0.9, TWILL);
  // The short shroud rides above the pivot; the stepped muzzle shows a dark bore.
  const breech: Vec3 = [-0.219, 1.673, 0.118];
  const muzzle: Vec3 = [-0.242, 1.644, -0.14];
  const barrel = (t: number): Vec3 => breech.map((x, k) => x + (muzzle[k] - x) * t) as Vec3;
  limb(breech, barrel(0.68), [0.028, 0.045, 0.047, 0.034], alloy, 0.9, TWILL);
  for (const side of [-1, 1]) {
    const rail = (t: number, offset: number): Vec3 => {
      const [x, y, z] = barrel(t);
      return [x + side * offset, y + 0.016, z];
    };
    limb(rail(0.1, 0.027), rail(0.64, 0.035), [0.007, 0.013, 0.006], graphite, 0.76, TWILL);
  }
  limb(barrel(0.62), muzzle, [0.032, 0.034, 0.026], graphite, 1, TWILL);
  for (const t of lod ? [0.28, 0.53, 0.86] : [0.86]) {
    const r = t < 0.6 ? 0.047 : 0.031;
    limb(barrel(t), barrel(t + 0.046), [r, r], rim, 0.95, TWILL);
  }
  limb(barrel(0.98), barrel(1.015), [0.028, 0.026], silver, 1, TWILL);
  limb(barrel(1.015), barrel(1.019), [0.021, 0.021], [0.049, 0.055, 0.053], 1);
  part('Harpoon');
  drawHarpoon(out, lod, [-0.066, 1.17, 0.224], aim(unit([0.58, 0.81, 0]), [0, 0, 1]), 0.93, 0);
  part('Flying disc');
  // The throwing disc sits face out on the hip. Six swept blades grow
  // from separate bronze collars around a recessed steel boss.
  const discPoint = (r: number, angle: number, height: number): Vec3 => {
    const x = r * Math.cos(angle);
    return [
      -0.176 + 0.89 * x - 0.456 * height,
      0.988 + r * Math.sin(angle),
      -0.222 - 0.456 * x - 0.89 * height,
    ];
  };
  // The belt clip holds the hub clear of the hanging strips.
  limb([-0.15, 0.995, -0.143], discPoint(0, 0, -0.008), [0.022, 0.025], graphite, 1, TWILL);
  const discSides = [12, 24, 36][lod];
  function discRing(inner: number, outer: number, low: number, high: number, tint: Vec3) {
    panel(
      (u, v) => discPoint(inner + (outer - inner) * v, 2 * Math.PI * u, low + (high - low) * v),
      discSides,
      1,
      tint,
      outer > inner,
      TWILL,
    );
  }
  discRing(0.047, 0.049, -0.009, 0.003, graphite);
  discRing(0.049, 0.039, 0.003, 0.011, alloy);
  discRing(0.039, 0.031, 0.011, 0.01, bronze);
  discRing(0.031, 0.025, 0.01, 0.004, graphite);
  discRing(0.025, 0.001, 0.004, 0.012, alloy);
  for (let j = 0; j < 6; j++) {
    const spoke = (j * Math.PI) / 3;
    function blade(u: number, across: number, height: number): Vec3 {
      const r = 0.042 + 0.103 * u;
      const width = 0.015 * (1 - u) ** 0.85 + 0.00035;
      const a = spoke + 0.12 + 1.03 * u ** 1.6 + (width * across) / r;
      return discPoint(r, a, height * (1 - u) + 0.003 * Math.sin(Math.PI * u));
    }
    const steps = [3, 6, 10][lod];
    panel((u, v) => blade(u, -1 + 1.38 * v, 0.001 + 0.008 * v), steps, 1, alloy, false, TWILL);
    panel((u, v) => blade(u, 0.38 + 0.62 * v, 0.009 - 0.009 * v), steps, 1, silver, false, SHINE);
    panel((u, v) => blade(u, 1 - 2 * v, -0.002), steps, 1, rim, false, TWILL);
    panel(
      (u, v) =>
        discPoint(
          0.043 + 0.014 * u,
          spoke + 0.12 + (v - 0.5) * 0.62,
          0.009 + 0.004 * Math.sin(Math.PI * u),
        ),
      2,
      2,
      bronze,
      false,
      TWILL,
    );
  }
  // Lift the knee and pelvis from a planted foot; ease the rise out under the ribs.
  // The derivative of the same curve transforms the normals of the fitted kit.
  function legRise(y: number): [number, number] {
    if (y <= 0.085 || y >= 1.4) {
      return [0, 0];
    }
    if (y < 0.94) {
      const t = (y - 0.085) / 0.855;
      return [0.08 * t, 0.08 / 0.855];
    }
    if (y <= 1.04) {
      return [0.08, 0];
    }
    const t = (y - 1.04) / 0.36;
    return [0.08 * (1 - t * t * (3 - 2 * t)), (-0.08 * 6 * t * (1 - t)) / 0.36];
  }
  for (const [name, mesh] of Object.entries(parts)) {
    const head =
      ['Mandible shell', 'Visor grille', 'Cranial shell', 'Temple optics', 'Mask lining'].includes(
        name,
      ) ||
      name.startsWith('Dreads') ||
      name.startsWith('Swept temple rail');
    const anatomy = name === 'Marine anatomy';
    const trunkFit = anatomy || name === 'Rib guard';
    const legKit =
      /^(Thigh net|Leg straps|Shin plates|Shin seams|Ankle cuff|Patella|Boot lames|Boot side) /.test(
        name,
      );
    const bootKit = /^(Boot lames|Boot side) /.test(name);
    const beltKit = name === 'Belt' || name === 'Flying disc';
    for (let i = 0; i < mesh.length; i += STRIDE) {
      if (beltKit) {
        mesh[i + 1] += 0.08;
      }
      if (trunkFit || legKit) {
        const x = mesh[i],
          y = mesh[i + 1];
        // The relaxed arms hang alongside the trunk at the height of the belt.
        const t = trunkFit ? Math.min(1, Math.max(0, (0.31 - Math.abs(x)) / 0.055)) : 1;
        if (t > 0 && y > 0.085 && y < 1.4) {
          const [rise, slope] = legRise(y);
          const weight = t * t * (3 - 2 * t);
          const dyDx = trunkFit ? (-Math.sign(x) * rise * 6 * t * (1 - t)) / 0.055 : 0;
          const ny = mesh[i + 4] / (1 + weight * slope);
          // Taper the upper thighs and their fitted net together under the straight belt strips.
          const thigh = bell((y - 0.78) / 0.17);
          const width = 1 - 0.155 * thigh * weight;
          mesh[i] *= width;
          const n = unit([mesh[i + 3] / width - ny * dyDx, ny, mesh[i + 5]]);
          mesh[i + 1] += weight * rise;
          mesh[i + 3] = n[0];
          mesh[i + 4] = n[1];
          mesh[i + 5] = n[2];
        }
      }
      if (bootKit || (anatomy && mesh[i + 1] < 0.135 && Math.abs(mesh[i]) < 0.31)) {
        const y = mesh[i + 1];
        const fit = Math.min(1, Math.max(0, (0.135 - y) / 0.055));
        const side = mesh[i] < 0 ? -1 : 1;
        const centre = bootCentres[side];
        const z = mesh[i + 2];
        const waist = bell((z + 0.048) / 0.056);
        const toe = Math.min(1, Math.max(0, (-z - 0.15) / 0.12));
        const width = 1 - fit * (0.11 + 0.19 * waist + 0.16 * toe);
        const height = 1 - fit * (0.03 + 0.12 * toe);
        const inner = Math.max(0, Math.min(1, (-side * (mesh[i] - centre)) / 0.06));
        const arch = 0.014 * waist * inner * fit;
        mesh[i] = centre + (mesh[i] - centre) * width - side * 0.009 * toe * fit;
        mesh[i + 1] = y * height + arch;
        const n = unit([mesh[i + 3] / width, mesh[i + 4] / height, mesh[i + 5]]);
        mesh[i + 3] = n[0];
        mesh[i + 4] = n[1];
        mesh[i + 5] = n[2];
      }
      if (head) {
        // Seat the mask over the neck, keeping the shell, optics and dreadlocks together.
        mesh[i + 1] += (stature - 1) * 1.55 - 0.065;
      } else {
        mesh[i] *= stature * 0.9;
        mesh[i + 1] *= stature;
        mesh[i + 2] *= stature * 0.92;
        const n = unit([mesh[i + 3] / 0.9, mesh[i + 4], mesh[i + 5] / 0.92]);
        mesh[i + 3] = n[0];
        mesh[i + 4] = n[1];
        mesh[i + 5] = n[2];
      }
    }
  }
  if (lod) {
    parts['Yoke'] = yoke(skin, chestFaces.concat(armFaces));
    parts['Spots'] = spots(skin, spotFaces);
    // A tribal necklace (the user, 2026-11-24): a cord from the neck down to the breastbone,
    // strung with small rodent skulls and fangs, a round jewel at its lowest. It lies on the
    // chest: `front` is where the skin's front is at a place across it.
    part('Necklace');
    const breast: Vec3[] = chestFaces.flatMap(start =>
      [0, 1, 2].map((k): Vec3 => {
        const i = start + k * STRIDE;
        return [skin[i], skin[i + 1], skin[i + 2]];
      }),
    );
    const front = (x: number, y: number) => {
      let z = 0;
      for (let i = 0; i < breast.length; i += 3) {
        const [a, b, c] = [breast[i], breast[i + 1], breast[i + 2]];
        const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d,
          v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
        if (u >= 0 && v >= 0 && u + v <= 1) {
          z = Math.min(z, u * a[2] + v * b[2] + (1 - u - v) * c[2]);
        }
      }
      return z;
    };
    const cordAt = (t: number, off = 0.011): Vec3 => {
      const a = (t * Math.PI) / 2,
        x = 0.125 * Math.sin(a),
        y = 1.87 - 0.215 * Math.cos(a) ** 1.3;
      return [x, y, front(x, y) - off];
    };
    const beads = lod === 2 ? 8 : 6;
    const cord = Array.from({ length: 25 }, (_, i) => cordAt(i / 12 - 1));
    sweep(
      cord,
      cord.map(() => 0.0035),
      lod === 2 ? 6 : 4,
      [0.056, 0.051, 0.046],
      WEAVE,
    );
    const bone: Vec3 = [0.74, 0.69, 0.56],
      ivory: Vec3 = [0.78, 0.6, 0.34],
      socket: Vec3 = [0.03, 0.028, 0.025];
    // A rodent's skull hung by its crown: the round brain case, the long narrowing snout, two
    // sockets and the pair of long incisors.
    for (const t of [-0.56, -0.27, 0.27, 0.56]) {
      const [x, y, z] = cordAt(t, 0.02);
      sweep(
        [0, -0.007, -0.016, -0.026, -0.036, -0.041].map((d, i): Vec3 => [x, y + d, z - 0.0012 * i]),
        [0.001, 0.0105, 0.0115, 0.0065, 0.004, 0.003],
        beads,
        bone,
      );
      for (const side of [-1, 1]) {
        sweep(
          [0, -0.004, -0.008].map((d): Vec3 => [x + side * 0.0058, y - 0.019, z - 0.004 + d]),
          [0.001, 0.0036, 0.001],
          6,
          socket,
        );
        sweep(
          [0, -0.005, -0.01].map((d): Vec3 => [x + side * 0.0016, y - 0.04 + d, z - 0.008]),
          [0.0016, 0.0012, 0.0003],
          4,
          ivory,
        );
      }
    }
    // Fangs between the skulls.
    for (const t of [-0.78, -0.42, -0.13, 0.13, 0.42, 0.78]) {
      const [x, y, z] = cordAt(t, 0.014);
      sweep(
        [0, -0.008, -0.018, -0.027].map((d, i): Vec3 => [x - 0.0015 * i * Math.sign(t), y + d, z]),
        [0.0025, 0.0036, 0.0026, 0.0003],
        6,
        bone,
      );
    }
    // The jewel: a bronze ring round a red stone, hung under the cord's lowest point.
    const [, low, lie] = cordAt(0, 0.016);
    const hub: Vec3 = [0, low - 0.034, lie];
    sweep(
      Array.from({ length: 2 * beads + 1 }, (_, i): Vec3 => {
        const a = (Math.PI * i) / beads;
        return [hub[0] + 0.026 * Math.sin(a), hub[1] + 0.026 * Math.cos(a), hub[2]];
      }),
      Array.from({ length: 2 * beads + 1 }, () => 0.0055),
      beads,
      bronze,
      SHINE,
    );
    sweep(
      [0.004, 0, -0.005, -0.008].map((d): Vec3 => [hub[0], hub[1], hub[2] + d]),
      [0.022, 0.0215, 0.014, 0.001],
      2 * beads,
      [0.42, 0.05, 0.04],
      GLOSS,
    );
    // From the waist up to the yoke.
    parts['Chest net'] = net(
      skin,
      chestFaces,
      ([x, y, z]) => ({
        angle: Math.atan2(x, -z) / (2 * Math.PI),
        y: y / stature,
        collar: yokeLine(x) + 0.01 - y / stature,
        low: y / stature - 1.105,
      }),
      28,
      18,
    );
    // The sleeves: round each arm's line from the shoulder to the wrist, down to the bracer.
    parts['Arm net'] = net(
      skin,
      armFaces,
      p => {
        const side = p[0] < 0 ? 0 : 1;
        const from = HUNTER_REST[[J.ARM_L, J.ARM_R][side]],
          to = HUNTER_REST[[J.HAND_L, J.HAND_R][side]];
        const line = sub(to, from),
          length = Math.hypot(...line),
          u = unit(line),
          d = sub(p, from);
        const t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
        // Round the line, from two axes across it.
        const ax = unit([u[1], -u[0], 0]),
          az: Vec3 = [
            u[1] * ax[2] - u[2] * ax[1],
            u[2] * ax[0] - u[0] * ax[2],
            u[0] * ax[1] - u[1] * ax[0],
          ];
        return {
          angle:
            Math.atan2(
              d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2],
              d[0] * az[0] + d[1] * az[1] + d[2] * az[2],
            ) /
            (2 * Math.PI),
          y: t,
          collar: length * NET_SLEEVE - t,
          low: 1,
        };
      },
      10,
      16,
    );
  }
  // Split at the upper arm ring hidden under the pauldron. All fitting and
  // shading used the joined skin, so the rest pose retains the same surface.
  const arm: number[] = [];
  let read = 0,
    kept = 0;
  for (const start of swordArm) {
    if (start > read) {
      skin.copyWithin(kept, read, start);
      kept += start - read;
    }
    read = start + 3 * STRIDE;
    for (let i = start; i < read; i++) {
      arm.push(skin[i]);
    }
  }
  skin.copyWithin(kept, read);
  skin.length = kept + skin.length - read;
  parts['Right arm'] = arm;
  return (built[lod] = parts);
}

/** Model-space cut trail on the same scaled mount as the baked blades. */
export const hunterWristEnds = () =>
  wristEnds([0, 0, 0], [0, 0, 0, 1]).map(
    ([x, y, z]) =>
      [
        (0.392 + WRIST_LIFT + x * 0.86) * stature * 0.9,
        (0.884 + WRIST_UP + y * 0.86) * stature,
        z * 0.86 * stature * 0.92,
      ] as Vec3,
  );

/** The Hunter's foldable, long-bolt rifle in right-hand grip space (muzzle points along -z). */
const harpoons: { body: number[]; slide: number[]; stock: number[]; bolt: number[] }[] = [];
const harpoonParts = (lod: 0 | 1 | 2) => {
  if (harpoons[lod]) {
    return harpoons[lod];
  }
  const body: number[] = [],
    slide: number[] = [],
    stock: number[] = [],
    bolt: number[] = [];
  const part = (out: number[], a: Vec3, b: Vec3, radii: number[], color: Vec3, aspect = 1) => {
    const length = Math.hypot(...sub(b, a));
    segment(out, solid(lod, length, radii, [0, 0]), a, b, [1, 0, 0], length, [1, aspect], color);
  };
  // Very dark green plates, their ridges a worn, lighter green, the grooves near black (the user,
  // 2026-11-24).
  const shell: Vec3 = [0.035, 0.07, 0.042];
  const ridge: Vec3 = [0.085, 0.15, 0.09];
  const iron: Vec3 = [0.018, 0.028, 0.021];
  const ivory: Vec3 = [0.72, 0.63, 0.72];
  // The open rear cradle receives the hollow sleeve as the rifle folds.
  // Its outer face is banded in `bands` alternating plates whose seams lead at the top and bottom,
  // the chevrons of the sleeve; the ends stay square to meet the cradle and the sleeve.
  const tube = (
    out: number[],
    rear: number,
    front: number,
    r: number,
    closed: boolean,
    bands = 1,
  ) => {
    const facets = lod > 1 ? 16 : lod ? 8 : 4;
    const point = (i: number, radius: number, j: number): Vec3 => {
      const angle = (Math.PI * i) / facets;
      const lead = j % bands ? 0.03 * Math.abs(Math.sin(angle)) : 0;
      const z = rear + ((front - rear) * j) / bands - lead;
      return [radius * Math.cos(angle), 0.09 - radius * Math.sin(angle), z];
    };
    const last = closed ? 2 * facets : facets;
    for (let i = 0; i < last; i++) {
      const away: Vec3 = sub(point(i + 0.5, r, 0), [0, 0.09, rear]);
      const inward: Vec3 = [-away[0], -away[1], 0];
      for (let j = 0; j < bands; j++) {
        const face = [
          point(i, r, j),
          point(i + 1, r, j),
          point(i + 1, r, j + 1),
          point(i, r, j + 1),
        ];
        panel(out, face, j % 2 ? ridge : shell, away);
      }
      const q = r - 0.006;
      panel(
        out,
        [point(i, q, 0), point(i + 1, q, 0), point(i + 1, q, bands), point(i, q, bands)],
        iron,
        inward,
      );
      for (const j of [0, bands]) {
        const end = [point(i, r, j), point(i + 1, r, j), point(i + 1, q, j), point(i, q, j)];
        panel(out, end, ridge, [0, 0, j ? front - rear : rear - front]);
      }
      if (!closed && (i === 0 || i === last - 1)) {
        const k = i && i + 1;
        const side = [point(k, r, 0), point(k, q, 0), point(k, q, bands), point(k, r, bands)];
        panel(out, side, ridge, [0, 1, 0]);
      }
    }
  };
  tube(slide, -0.52, -1.08, 0.038, true);

  // Smooth ribbed plating: P(a, s) at the angle a round the axis and s along it, normals by
  // differences, away from the row's centre (toward it for sign -1). A rib is graded from a dark
  // groove to a bright brass crest, so the relief reads without flat colour bands.
  const groove: Vec3 = [0.012, 0.026, 0.016];
  const skin = (
    out: number[],
    P: (a: number, s: number) => Vec3,
    angles: number[],
    along: number[],
    crest: (s: number) => number,
    sign = 1,
  ) => {
    const h = 1e-4;
    const wrap = angles[angles.length - 1] - angles[0] < 6;
    const rows = along.map(s => {
      const ring = angles.map(a => P(a, s));
      const mid = ring.reduce((m, p) => m.map((v, k) => v + p[k] / ring.length) as Vec3, [0, 0, 0]);
      const t = crest(s);
      const rgb = t < 0.5 ? mix(groove, shell, 2 * t) : mix(shell, ridge, 2 * t - 1);
      return angles.map((a, i): [Vec3, number[]] => {
        const u = sub(P(a + h, s), P(a - h, s));
        const v = sub(P(a, s + h), P(a, s - h));
        let m = unit([
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ]);
        const o = sub(ring[i], mid);
        if (sign * (m[0] * o[0] + m[1] * o[1] + m[2] * o[2]) < 0) {
          m = [-m[0], -m[1], -m[2]];
        }
        return [ring[i], [...m, ...rgb]];
      });
    });
    const vertex = ([p, m]: [Vec3, number[]]) =>
      out.push(...p, m[0], m[1], m[2], m[3], m[4], -1, m[5]);
    const tri = (a: [Vec3, number[]], b: [Vec3, number[]], c: [Vec3, number[]]) => {
      const u = sub(b[0], a[0]);
      const v = sub(c[0], a[0]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const m = a[1];
      for (const q of n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0 ? [a, c, b] : [a, b, c]) {
        vertex(q);
      }
    };
    for (let r = 1; r < rows.length; r++) {
      for (let i = 0; i < angles.length - (wrap ? 0 : 1); i++) {
        const j = (i + 1) % angles.length;
        const [a, b, c, d] = [rows[r - 1][i], rows[r - 1][j], rows[r][i], rows[r][j]];
        tri(a, c, d);
        tri(a, d, b);
      }
    }
  };
  // Overlapping chevron plates every `period` from `from` toward -z: each rises from its front to a
  // sharp lip at its rear, then drops to the next. Rows sit just inside each plate's two ends, so
  // the drop is one thin, steep band graded from the bright lip to the dark groove.
  const period = 0.06;
  const rib = (s: number, from: number) => {
    const phase = ((from - s) / period) % 1;
    return (1 - phase) ** 0.7;
  };
  const rows = (from: number, to: number) =>
    Array.from({ length: Math.round((from - to) / period) }, (_, k) =>
      (lod > 1 ? [0.02, 0.25, 0.5, 0.75, 0.98] : lod ? [0.02, 0.5, 0.98] : [0.02, 0.98]).map(
        p => from - (k + p) * period,
      ),
    ).flat();
  const around = (n: number, half = false) =>
    Array.from({ length: half ? n + 1 : n }, (_, i) => ((half ? 1 : 2) * Math.PI * i) / n);
  /** Facets round the receiver and the sleeve, and round the receiver's open half. */
  const [ring, halfRing] = lod > 1 ? [20, 10] : lod ? [10, 5] : [6, 3];
  // The chevrons: each rib's top and bottom lead its flanks, fading out at the ribbed span's ends.
  const lead = (a: number, s: number, from: number, to: number) =>
    0.045 * Math.sin(a) ** 2 * Math.min(1, (from - s) / 0.04, (s - to) / 0.04);

  // The receiver: a fairing sloping down to the stock's neck, then a ribbed tube whose front half
  // is an open cradle showing the bolt.
  const receiver = (a: number, s: number): Vec3 => {
    const k = Math.min(1, Math.max(0, (s - 0.06) / 0.13));
    const f = k * k * (3 - 2 * k);
    const ribbed = s < 0.06 ? rib(s, 0.06) : 0;
    const r = 0.042 - 0.016 * f + 0.008 * ribbed;
    return [
      r * Math.cos(a),
      0.09 - 0.02 * f - r * Math.sin(a),
      s - (s < 0.06 ? lead(a, s, 0.06, -0.6) : 0),
    ];
  };
  const receiverCrest = (s: number) => (s < 0.06 ? rib(s, 0.06) : 0.5);
  const fairing = [0.19, 0.16, 0.13, 0.1, 0.08];
  skin(body, receiver, around(ring), [...fairing, ...rows(0.06, -0.12)], receiverCrest);
  skin(body, receiver, around(halfRing, true), rows(-0.12, -0.6), receiverCrest);
  const inner = (a: number, s: number): Vec3 => [
    0.039 * Math.cos(a),
    0.09 - 0.039 * Math.sin(a),
    s,
  ];
  skin(body, inner, around(halfRing, true), [-0.12, -0.6], () => 0, -1);
  // The fairing's end, a dark ring round the stock's neck.
  panel(
    body,
    [
      [-0.026, 0.07, 0.19],
      [0, 0.044, 0.19],
      [0.026, 0.07, 0.19],
      [0, 0.096, 0.19],
    ],
    iron,
    [0, 0, 1],
  );

  // The sleeve over the slide: a wide, ribbed lozenge swelling past the receiver and narrowing to
  // the muzzle, where the bolt leaves it.
  const sleeve = (a: number, s: number): Vec3 => {
    const t = (-0.6 - s) / 0.54;
    const swell = 0.04 + 0.04 * Math.sin(Math.PI * Math.min(1, Math.max(0, 1.3 * t))) ** 0.5;
    const r = swell + 0.012 * rib(s, -0.6);
    return [1.25 * r * Math.cos(a), 0.09 - 0.85 * r * Math.sin(a), s - lead(a, s, -0.6, -1.14)];
  };
  const sleeveRows = rows(-0.6, -1.14);
  skin(slide, sleeve, around(ring), sleeveRows, s => rib(s, -0.6));
  for (const z of [sleeveRows[0], sleeveRows[sleeveRows.length - 1]]) {
    const rim = around(ring).map(a => sleeve(a, z));
    for (let i = 0; i < rim.length; i++) {
      panel(slide, [rim[i], rim[(i + 1) % rim.length], [0, 0.09, z]], iron, [
        0,
        0,
        z < -1 ? -1 : 1,
      ]);
    }
  }
  // Raked dorsal spines along the sleeve, a triangle on each side of a thin keel.
  const spine = (out: number[], base: Vec3, length: number, color: Vec3) => {
    const [x, y, z] = base;
    const tip: Vec3 = [x, y + length, z + 0.6 * length];
    for (const side of [-1, 1]) {
      panel(out, [[x, y, z - 0.03], [x, y, z + 0.035], tip], color, [side, 0, 0]);
    }
  };
  // Each rooted on the sleeve's crest where it stands (it narrows toward the muzzle).
  for (let i = 0; i < (lod ? 4 : 2); i++) {
    const z = -0.7 - 0.11 * i;
    spine(slide, [0, sleeve((3 * Math.PI) / 2, z)[1] - 0.006, z], 0.07 - 0.008 * i, iron);
  }
  // Twin forked prongs flank the muzzle, each a flat blade ending in a hollow square socket.
  for (const side of [-1, 1]) {
    const blade = (z: number, x: number, w: number, h: number): Vec3[] => [
      [side * x, 0.09 + h, z],
      [side * (x + w), 0.09, z],
      [side * x, 0.09 - h, z],
      [side * (x - w), 0.09, z],
    ];
    const root = blade(-0.84, 0.07, 0.022, 0.04);
    const neck = blade(-1.2, 0.108, 0.014, 0.024);
    loft(slide, root, neck, [ridge], iron);
    const box = (z: number, s: number): Vec3[] => [
      [side * 0.108 - s, 0.09 + s, z],
      [side * 0.108 + s, 0.09 + s, z],
      [side * 0.108 + s, 0.09 - s, z],
      [side * 0.108 - s, 0.09 - s, z],
    ];
    loft(slide, box(-1.2, 0.024), box(-1.29, 0.02), [ridge], ridge, iron);
  }
  // An open lattice cage guards the bolt head: corner rails and square hoops of thin bars.
  const corners: [number, number][] = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  const cage = (x: number, y: number, z: number): Vec3 => [0.042 * x, 0.095 + 0.042 * y, z];
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i];
    rod(slide, lod > 1 ? TUBE : LINK, cage(x, y, -1.06), cage(x, y, -1.31), 0.006, ridge);
    for (const z of lod ? [-1.16, -1.24, -1.31] : [-1.31]) {
      const [u, v] = corners[(i + 1) % 4];
      rod(slide, lod > 1 ? TUBE : LINK, cage(x, y, z), cage(u, v, z), 0.005, ridge);
    }
  }
  // Offset the compact optic so the exposed bolt remains visible beside it. It rides high on a
  // tall post over the receiver's closed tube, behind the open cradle (the user, 2026-11-24: not
  // over the bolt), a dark green lens at each end.
  // Nearer (lod 1 and 2, the own view) it is turned round instead, below (harpoonFine()).
  const glass: Vec3 = [0.02, 0.12, 0.05];
  if (!lod) {
    part(body, [0.03, 0.075, -0.05], [0.076, 0.18, -0.05], [0.018, 0.016], iron);
    part(body, [0.076, 0.19, 0.085], [0.076, 0.19, -0.2], [0.035, 0.023, 0.023, 0.037], shell);
    part(body, [0.076, 0.19, 0.086], [0.076, 0.19, 0.09], [0.028, 0.027], glass);
    part(body, [0.076, 0.19, -0.201], [0.076, 0.19, -0.205], [0.031, 0.03], glass);
  }
  // A narrow sliding neck opens into the cheek rest and the broad shoulder pad.
  const stockSection = (z: number, top: number, bottom: number, w: number): Vec3[] => [
    [-w * 0.65, top, z],
    [w * 0.65, top, z],
    [w, top - 0.012, z],
    [w * 0.8, bottom + 0.01, z],
    [w * 0.5, bottom, z],
    [-w * 0.5, bottom, z],
    [-w * 0.8, bottom + 0.01, z],
    [-w, top - 0.012, z],
  ];
  const neck = stockSection(0.055, 0.087, 0.046, 0.022);
  const cheek = stockSection(0.235, 0.107, 0.044, 0.033);
  const heel = stockSection(0.39, 0.095, -0.049, 0.039);
  loft(stock, neck, cheek, [iron], iron);
  loft(stock, cheek, heel, [shell]);
  loft(stock, heel, stockSection(0.412, 0.097, -0.052, 0.04), [iron], undefined, iron);
  // Raised chevrons along each side of the stock between the cheek rest and the heel, pointing
  // toward the muzzle like the sleeve's (the user, 2026-11-24): each arm a strip standing out of
  // the side's slope, with its two walls.
  /** A point on the stock's side `side`, `t` from the cheek (0) to the heel (1), `v` from its top (0) to its bottom (1), `h` out of it. */
  const flank = (side: number, t: number, v: number, h: number): Vec3 => {
    const w = 0.033 + 0.006 * t;
    const top = 0.107 - 0.012 * t - 0.012;
    const bottom = 0.044 - 0.093 * t + 0.01;
    return [side * (w - 0.2 * w * v + h), top + (bottom - top) * v, 0.235 + 0.155 * t];
  };
  for (const side of [-1, 1]) {
    for (const apex of lod ? [0.18, 0.42, 0.66] : [0.3, 0.6]) {
      for (const [v0, v1] of [
        [0.12, 0.5],
        [0.5, 0.88],
      ]) {
        // The arm runs from the apex (v 0.5, t apex) back to the edge (t apex + 0.2).
        const tAt = (v: number) => apex + 0.2 * (Math.abs(v - 0.5) / 0.38);
        const [ta, tb] = [tAt(v0), tAt(v1)];
        const band = 0.07;
        const h = 0.0035;
        const out: Vec3 = [side, 0, 0];
        panel(
          stock,
          [
            flank(side, ta, v0, h),
            flank(side, tb, v1, h),
            flank(side, tb + band, v1, h),
            flank(side, ta + band, v0, h),
          ],
          ridge,
          out,
        );
        if (lod) {
          for (const [edge, to] of [
            [0, -1],
            [band, 1],
          ] as const) {
            panel(
              stock,
              [
                flank(side, ta + edge, v0, 0),
                flank(side, tb + edge, v1, 0),
                flank(side, tb + edge, v1, h),
                flank(side, ta + edge, v0, h),
              ],
              iron,
              [side * 0.3, 0, to],
            );
          }
        }
      }
    }
  }
  part(bolt, [0, 0.095, -0.1], [0, 0.095, -1.09], [0.015, 0.016, 0.014], ivory);
  part(bolt, [0, 0.095, -1.07], [0, 0.095, -1.24], [0.018, 0.024, 0.001], silver, 0.6);
  // Two swept barbs behind the point, flat in the horizontal plane and seen from both faces.
  for (const side of [-1, 1]) {
    for (const up of [-1, 1]) {
      panel(
        bolt,
        [
          [0, 0.095, -1.2],
          [side * 0.045, 0.095, -1.08],
          [side * 0.012, 0.095, -1.11],
        ],
        silver,
        [0, up, 0],
      );
    }
  }
  // Lift the action as one piece above the thumb, including the stock throughout its travel.
  // Brushed, scratched bronze like the armour (TWILL), the ivory bolt plain gilt: the shell is kept
  // on the GPU in first person, so its brushing holds still on it (drawHarpoon()).
  const actionRise = 0.05;
  for (const piece of [body, slide, bolt, stock]) {
    for (let i = 0; i < piece.length; i += STRIDE) {
      piece[i + 1] += actionRise;
      piece[i + 8] = piece === bolt ? GILT : TWILL;
    }
  }
  // The pistol grip stays in the right palm beneath the raised shell.
  part(body, [0, -0.05, 0.022], [0, 0.04 + actionRise, -0.026], [0.016, 0.019, 0.02], leather);
  if (lod) {
    body.push(...harpoonFine(shell, ridge, iron, actionRise, lod > 1));
  }
  return (harpoons[lod] = { body, slide, stock, bolt });
};

/**
 * A surface of revolution about `d` (unit) through `at`: `prof` its rows, each how far along `d`,
 * its radius and the colour of the band from the row before. `e` is a unit across `d`. Normals
 * are smooth round it, outward; no row may share the one before's `s` (a step is a slope).
 */
const lathe = (
  out: number[],
  at: Vec3,
  d: Vec3,
  e: Vec3,
  prof: [number, number, Vec3?][],
  n: number,
) => {
  const f: Vec3 = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]];
  const point = (a: number, s: number, r: number): Vec3 => {
    const [c, w] = [Math.cos(a) * r, Math.sin(a) * r];
    return [0, 1, 2].map(k => at[k] + d[k] * s + e[k] * c + f[k] * w) as Vec3;
  };
  for (let k = 1; k < prof.length; k++) {
    const [s0, r0] = prof[k - 1];
    const [s1, r1, rgb = [0, 0, 0]] = prof[k];
    const [ds, dr] = [Math.abs(s1 - s0), (r1 - r0) * Math.sign(s1 - s0)];
    const normal = (a: number) =>
      unit([0, 1, 2].map(j => (e[j] * Math.cos(a) + f[j] * Math.sin(a)) * ds - d[j] * dr) as Vec3);
    for (let i = 0; i < n; i++) {
      const [a0, a1] = [(2 * Math.PI * i) / n, (2 * Math.PI * (i + 1)) / n];
      const corners: [Vec3, Vec3][] = [
        [point(a0, s0, r0), normal(a0)],
        [point(a1, s0, r0), normal(a1)],
        [point(a1, s1, r1), normal(a1)],
        [point(a0, s1, r1), normal(a0)],
      ];
      for (const [x, y, z] of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const [p, q, r] = [corners[x], corners[y], corners[z]];
        const [u, v] = [sub(q[0], p[0]), sub(r[0], p[0])];
        const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const m = p[1];
        for (const [c, nm] of g[0] * m[0] + g[1] * m[1] + g[2] * m[2] < 0 ? [p, r, q] : [p, q, r]) {
          out.push(...c, ...nm, rgb[0], rgb[1], -1, rgb[2]);
        }
      }
    }
  }
};

/** A flat disc of radius `r` facing `d` (unit) at `at`, `e` a unit across it. */
const disc = (out: number[], at: Vec3, d: Vec3, e: Vec3, r: number, n: number, rgb: Vec3) => {
  const f: Vec3 = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]];
  const rim = (a: number) =>
    [0, 1, 2].map(k => at[k] + (e[k] * Math.cos(a) + f[k] * Math.sin(a)) * r) as Vec3;
  for (let i = 0; i < n; i++) {
    const [p, q] = [rim((2 * Math.PI * i) / n), rim((2 * Math.PI * (i + 1)) / n)];
    const [u, v] = [sub(p, at), sub(q, at)];
    const g = u[1] * v[2] - u[2] * v[1];
    const h = u[2] * v[0] - u[0] * v[2];
    const l = u[0] * v[1] - u[1] * v[0];
    const tri = g * d[0] + h * d[1] + l * d[2] < 0 ? [at, q, p] : [at, p, q];
    for (const c of tri) {
      out.push(...c, ...d, rgb[0], rgb[1], -1, rgb[2]);
    }
  }
};

/**
 * The harpoon's close-up finish (lod 2, the own view; the user, 2026-11-24: rounder, more
 * detailed, lit buttons): a round scope on two ring mounts, its rubber eyecup toward the eye, a
 * flared objective and a sunshade, an elevation turret and a lit illumination knob, a red reticle
 * ring glowing in the eyepiece, and on the receiver's left side, toward the eye, a panel of three
 * lit buttons. Raised by `rise` with the rest of the action; made once.
 */
const harpoonFine = (
  shell: Vec3,
  ridge: Vec3,
  iron: Vec3,
  rise: number,
  /** The own view's facets; fewer on a runner near by (lod 1). */
  close: boolean,
): number[] => {
  const metal: number[] = [];
  const glass: number[] = [];
  const lights: number[] = [];
  const Z: Vec3 = [0, 0, -1];
  const [X, Y]: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
  ];
  const n = close ? 24 : 12;
  const small = close ? 16 : 8;
  // The scope's axis, along -z from the eyepiece; rows by distance from it. The eyepiece is
  // `back` behind the receiver's front, so both mounts stand on its closed tube (z above -0.12),
  // not over the open cradle and the bolt.
  const back = 0.12;
  const axis: Vec3 = [0.076, 0.19, back];
  lathe(
    metal,
    axis,
    Z,
    X,
    [
      [0.024, 0.021],
      [0.022, 0.03, iron],
      [0.026, 0.033, iron],
      [0.05, 0.033, iron],
      [0.054, 0.027, iron],
      [0.056, 0.028, ridge],
      [0.064, 0.028, ridge],
      [0.066, 0.023, ridge],
      [0.236, 0.023, shell],
      [0.268, 0.035, shell],
      [0.27, 0.037, ridge],
      [0.28, 0.037, ridge],
      [0.282, 0.035, ridge],
      [0.316, 0.035, shell],
      [0.318, 0.037, iron],
      [0.334, 0.037, iron],
      [0.337, 0.031, iron],
    ],
    n,
  );
  // The ring mounts: a clamp round the tube on a post down to the receiver's top.
  for (const z of [0.105, 0.205]) {
    lathe(
      metal,
      axis,
      Z,
      X,
      [
        [z - 0.008, 0.023],
        [z - 0.006, 0.026, ridge],
        [z + 0.006, 0.026, ridge],
        [z + 0.008, 0.023, ridge],
      ],
      n,
    );
    const foot: Vec3 = [0.022, 0.118, back - z];
    const top: Vec3 = [0.07, 0.17, back - z];
    const along = unit(sub(top, foot));
    lathe(
      metal,
      foot,
      along,
      Z,
      [
        [0, 0.008],
        [Math.hypot(...sub(top, foot)), 0.006, iron],
      ],
      close ? 10 : 6,
    );
  }
  // The elevation turret on top, ribbed, and the illumination knob on the left, toward the eye.
  const turret: Vec3 = [0.076, 0.19 + 0.02, back - 0.155];
  lathe(
    metal,
    turret,
    Y,
    X,
    [
      [0, 0.012],
      [0.004, 0.012, iron],
      [0.005, 0.014, ridge],
      [0.009, 0.014, ridge],
      [0.01, 0.013, iron],
      [0.016, 0.013, iron],
      [0.0175, 0.011, ridge],
    ],
    small,
  );
  disc(metal, [turret[0], turret[1] + 0.0175, turret[2]], Y, X, 0.011, small, ridge);
  const knob: Vec3 = [0.076 - 0.02, 0.19, back - 0.155];
  const L: Vec3 = [-1, 0, 0];
  lathe(
    metal,
    knob,
    L,
    Y,
    [
      [0, 0.011],
      [0.008, 0.011, iron],
      [0.009, 0.012, ridge],
      [0.014, 0.012, ridge],
      [0.015, 0.0095, ridge],
    ],
    small,
  );
  // The receiver's button panel on its left side: a dark plate with a bevelled edge.
  const [px, py0, py1, pz0, pz1] = [-0.056, 0.072, 0.11, -0.028, -0.132];
  const b = 0.004;
  const front: Vec3[] = [
    [px, py0 + b, pz0],
    [px, py1 - b, pz0],
    [px, py1 - b, pz1],
    [px, py0 + b, pz1],
  ];
  panel(metal, front, iron, L);
  for (const [y, u] of [
    [py1, 1],
    [py0, -1],
  ] as const) {
    panel(
      metal,
      [
        [px, y - u * b, pz0],
        [px + 0.012, y, pz0],
        [px + 0.012, y, pz1],
        [px, y - u * b, pz1],
      ],
      ridge,
      [-1, u, 0],
    );
  }
  for (const z of [pz0, pz1]) {
    panel(
      metal,
      [
        [px, py0 + b, z],
        [px, py1 - b, z],
        [px + 0.012, py1, z],
        [px + 0.012, py0, z],
      ],
      ridge,
      [0, 0, z === pz0 ? 1 : -1],
    );
  }
  // Each button in a raised bezel.
  const buttons: [number, Vec3][] = [
    [-0.052, [1, 0.1, 0.04]],
    [-0.08, [1, 0.1, 0.04]],
    [-0.108, [1, 0.45, 0.06]],
  ];
  for (const [z] of buttons) {
    lathe(
      metal,
      [px, 0.091, z],
      L,
      Y,
      [
        [0, 0.0085],
        [0.002, 0.0085, ridge],
        [0.0028, 0.0068, ridge],
      ],
      small,
    );
  }
  for (let i = 0; i < metal.length; i += STRIDE) {
    metal[i + 8] = TWILL;
  }
  // The lenses, dark green glass, polished.
  disc(glass, [axis[0], axis[1], back - 0.0235], [0, 0, 1], X, 0.021, n, [0.012, 0.05, 0.04]);
  disc(glass, [axis[0], axis[1], back - 0.336], Z, X, 0.031, n, [0.015, 0.07, 0.05]);
  for (let i = 0; i < glass.length; i += STRIDE) {
    glass[i + 8] = SHINE;
  }
  // The lights: the reticle's ring in the eyepiece, the illumination knob's cap, the buttons.
  const reticle = (r: number, w: number, rgb: Vec3) => {
    for (let i = 0; i < n; i++) {
      const [a0, a1] = [(2 * Math.PI * i) / n, (2 * Math.PI * (i + 1)) / n];
      const at = (a: number, q: number): Vec3 => [
        axis[0] + q * Math.cos(a),
        axis[1] + q * Math.sin(a),
        back - 0.023,
      ];
      panel(lights, [at(a0, r), at(a1, r), at(a1, r + w), at(a0, r + w)], rgb, [0, 0, 1]);
    }
  };
  reticle(0.009, 0.0016, [1, 0.12, 0.05]);
  disc(lights, [axis[0], axis[1], back - 0.023], [0, 0, 1], X, 0.0018, 6, [1, 0.12, 0.05]);
  disc(lights, [knob[0] - 0.0152, knob[1], knob[2]], L, Y, 0.0055, small, [1, 0.12, 0.05]);
  for (const [z, rgb] of buttons) {
    disc(lights, [px - 0.0029, 0.091, z], L, Y, 0.0062, small, rgb);
  }
  glow(lights, 0, 1.8);
  const out = [...metal, ...glass, ...lights];
  for (let i = 1; i < out.length; i += STRIDE) {
    out[i] += rise;
  }
  return out;
};

/** Slide and stock travel in opposite directions as the compact back-mounted rifle opens. */
/** The turn that carries the model's x, y and z onto `right`, `up` and backward (-`forward`). */
const quatOf = ([r, u, f]: Vec3[]): Quat => {
  // The turn's matrix by columns: right, up and back.
  const [m00, m10, m20] = r;
  const [m01, m11, m21] = u;
  const [m02, m12, m22] = [-f[0], -f[1], -f[2]];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
};

/**
 * Slide and stock travel in opposite directions as the compact back-mounted rifle opens. With
 * `pieces`, its shell, slide and stock are kept on the GPU (store.ts) and only placed, so their
 * brushed metal lies on their rest place; the bolt, shortened as it folds, stays in `out`.
 */
export const drawHarpoon = (
  out: Out,
  lod: 0 | 1 | 2,
  at: Vec3,
  axes: Vec3[],
  scale: number,
  open: number,
  loaded = true,
  /** 0 as the reload starts to 1: the next bolt slides forward from behind the stock into its seat. */
  feed = 1,
  pieces?: Pieces,
  /** How far (m, unscaled) the bolt just fired has flown out of the muzzle; drawn under HARPOON_GONE. */
  fired = HARPOON_GONE,
) => {
  const parts = harpoonParts(lod);
  const retracted = (1 - open) * scale;
  const q = pieces && quatOf(axes);
  const put = (name: 'body' | 'stock' | 'slide', forward: number) => {
    if (pieces && q) {
      const m = mesh(`harpoon ${lod} ${name}`, o => o.push(...parts[name]));
      const t = at.map((v, i) => v + axes[2][i] * forward) as Vec3;
      pieces.push({ m, q, t, k: scale });
    } else {
      place(out, parts[name], at, axes, [0, 0, forward], scale);
    }
  };
  put('body', 0);
  put('stock', 0.13 * retracted);
  put('slide', -0.4 * retracted);
  if (loaded && feed > 0) {
    // The next bolt comes in from behind the stock, most of a bolt's length back, and seats.
    const back = HARPOON_BACK * (1 - feed) ** 2 * scale;
    place(out, parts.bolt, at, axes, [0, 0, -back], [scale, scale, scale - retracted / 3]);
  }
  if (fired < HARPOON_GONE) {
    // The bolt just fired, seen to leave the tube forward before the ball takes over.
    place(out, parts.bolt, at, axes, [0, 0, fired * scale], scale);
  }
};
/**
 * Seconds the harpoon takes to unfold as it comes to hand (drawHarpoon()'s `open`, eased): slow
 * enough to be seen (the user, 2026-11-24), SOUND.HARPOON_OPEN timed on it.
 */
export const HARPOON_DRAW = 1.1;
/** Metres a fired bolt is drawn leaving the muzzle; past this the flying ball alone shows it. */
export const HARPOON_GONE = 1.2;
/** Metres behind its seat the next bolt starts as it feeds in. */
export const HARPOON_BACK = 0.9;
/** The share of the harpoon's reload (swapOf()) at which the next bolt starts in, and its sound. */
export const HARPOON_RACK = 0.35;
/** Seconds the fired bolt takes to leave the drawn tube (HARPOON_GONE). */
export const HARPOON_OUT = 0.09;
/**
 * The next bolt's slide into its seat at `swap` of the harpoon's reload (swapOf(), 0 to 1; -1 none):
 * absent for the first 35 % (the tube empty after the shot), then eased in by 85 %, seated after.
 */
export const harpoonFeed = (swap: number): number => {
  if (swap < 0) {
    return 1;
  }
  const t = Math.min(1, Math.max(0, (swap - HARPOON_RACK) / 0.5));
  return t * t * (3 - 2 * t);
};

export const hunterHarpoon = (lod: 0 | 1 | 2): number[] => {
  const { body, stock, slide, bolt } = harpoonParts(lod);
  return body.concat(stock, slide, bolt);
};

/**
 * The Hunter's own rest skeleton in model space: the rig's joints on his 1.2 m stature, the arms
 * where the sculpted sleeves hang (wider than the rig's) and the neck under the lowered mask.
 * Rest rotations are the identity, so a joint's rest frame is this point alone.
 */
/**
 * The top of the shoulder cannon's post, in the rest model: the hinge it folds about. The model
 * draws it deployed, along the look; stowed it lies back along the top of the shoulder.
 */
export const CANNON_HINGE: Vec3 = sized(HINGE);
/** The foot of the cannon's post, on its saddle on the left shoulder. */
export const CANNON_POST: Vec3 = sized(POST);
/** Radians the stowed cannon is turned about its hinge's right axis from the deployed one: muzzle back. */
export const CANNON_FOLD = 2.9;
/** The cannon's muzzle, from its hinge, deployed (the stepped muzzle's face). */
export const CANNON_MUZZLE: Vec3 = sized([-0.021, 0.006, -0.205]);
/** Seconds the cannon takes to fold out, or back. */
export const CANNON_SWING = 0.35;
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

export const HUNTER_REST: Vec3[] = (() => {
  const bind = solve(rest()).pos;
  const at: Vec3[] = bind.map(([x, y, z]) => [x * stature * 0.9, y * stature, z * stature * 0.92]);
  for (const side of [-1, 1]) {
    const [arm, fore, hand, thigh, shin, foot, toe] =
      side < 0
        ? [J.ARM_L, J.FOREARM_L, J.HAND_L, J.THIGH_L, J.SHIN_L, J.FOOT_L, J.TOE_L]
        : [J.ARM_R, J.FOREARM_R, J.HAND_R, J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R];
    // The shoulder ring, the elbow over the bracer's top and the bracer's lower rim.
    at[arm] = [side * 0.28, 1.629, -0.016];
    at[fore] = [side * 0.37, 1.36, 0];
    at[hand] = [side * 0.392 * stature * 0.9, 0.884 * stature, 0];
    at[thigh] = [side * 0.14, 1.1, 0];
    at[shin] = [side * 0.178, 0.59, 0];
    at[foot] = [side * 0.178, 0.072, 0];
    at[toe] = [side * 0.178, 0.024, -0.144];
  }
  at[J.NECK] = [0, 1.7, 0];
  at[J.HEAD] = [0, 1.8, 0];
  return at;
})();

/** Where each bone of HUNTER_REST ends: its first child (the spine, the neck), or a stub past a leaf. */
const boneEnd = (j: number): Vec3 => {
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

const toBone = (p: Vec3, j: number) => {
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

const LEGS = [
  [J.THIGH_L, J.SHIN_L, J.FOOT_L, J.TOE_L],
  [J.THIGH_R, J.SHIN_R, J.FOOT_R, J.TOE_R],
];
const HEAD_PARTS =
  /^(Mask lining|Dreads|Cranial shell|Visor grille|Mandible shell|Swept temple rail|Temple optics|Rangefinder)/;
const TRUNK_PARTS = new Set([
  'Harpoon harness',
  'Laser saddle',
  'Laser mount',
  'Shoulder laser',
  'Harpoon',
  'Rib guard',
  'Necklace',
]);
// The skin leaves the collarbones out, the chest carrying the shoulder (BENDS), and the neck and
// head: the neck's stump stays on the chest inside the mask's lining, which turns over it.
const ALL = Array.from({ length: JOINTS }, (_, j) => j).filter(
  j => ![J.CLAVICLE_L, J.CLAVICLE_R, J.NECK, J.HEAD].includes(j as never),
);
const ARMS: number[] = [J.ARM_L, J.FOREARM_L, J.HAND_L, J.ARM_R, J.FOREARM_R, J.HAND_R];
const TRUNK = ALL.filter(j => !ARMS.includes(j));

/** The joints a part's triangles may follow (the nearest bone wins), by the part's name. */
const followed = (name: string, [x, y]: Vec3): number[] => {
  if (HEAD_PARTS.test(name)) {
    return [J.HEAD];
  }
  if (name === 'Belt' || name === 'Flying disc') {
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
  vertices: number[];
}

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
type Bend = [number, number, boolean, number, number, number?];
const BENDS: Bend[] = (
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
const shareOf = (p: Vec3, k: number) => {
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
const BENDY =
  /^(Marine anatomy|Right arm|Chest net|Arm net|Yoke|Thigh net|Leg straps|Shin plates|Shin seams|Ankle cuff|Boot lames|Boot side)/;
const rigs: Record<string, HunterRig> = {};

/**
 * The Hunter cut into rigid pieces, one per joint (and shadow flag, and the stowed harpoon), so the runner's animated
 * skeleton can carry him: each triangle goes to the nearest bone its part may follow. Above the
 * far level, the triangles across a bend go to a blended band instead (BENDS).
 * `skip` leaves out parts (the far level's dreadlocks and grille). `stiff` keeps the chest's and the
 * arms' nets off the bands, each triangle whole on its nearest bone: the bands are blended on the
 * CPU each frame and the nets are most of them (11 700 vertices a Hunter), so only one seen close
 * pays for nets that bend with the skin.
 */
export const hunterRig = (
  lod: 0 | 1 | 2,
  skip: (name: string) => boolean = () => false,
  stiff = false,
): HunterRig => {
  const cached = `${lod} ${stiff}`;
  if (rigs[cached]) {
    return rigs[cached];
  }
  const pieces = new Map<number, HunterPiece>();
  const bands = BENDS.map(() => ({ vertices: [] as number[], w: [] as number[] }));
  for (const [name, v] of Object.entries(hunter(lod))) {
    if (skip(name)) {
      continue;
    }
    const thin = name.startsWith('Temple') || name === 'Rangefinder';
    const bendy = lod > 0 && BENDY.test(name) && !(stiff && /^(Chest|Arm) net/.test(name));
    for (let i = 0; i < v.length; i += 3 * STRIDE) {
      const corners = [0, 1, 2].map(
        k => [v[i + k * STRIDE], v[i + k * STRIDE + 1], v[i + k * STRIDE + 2]] as Vec3,
      );
      const c: Vec3 = [0, 1, 2].map(
        k => (corners[0][k] + corners[1][k] + corners[2][k]) / 3,
      ) as Vec3;
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
      const key = joint * 16 + +thin + 2 * +harpoon + 4 * +cannon + 8 * +disc;
      let piece = pieces.get(key);
      if (!piece) {
        pieces.set(key, (piece = { joint, thin, harpoon, cannon, disc, vertices: [] }));
      }
      const o = cannon ? CANNON_HINGE : HUNTER_REST[joint];
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
  return (rigs[cached] = {
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
const HUNTER_BIND = solve(rest()).pos[J.PELVIS];

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

/** The thrown disc and the disc in hand, times the hip's (the user, 2026-11-23: bigger). */
export const DISC_SCALE = 1.5;
/** The throwing disc in its own frame, per level of detail: discVertices(). */
const cross = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const discBuilt: Partial<Record<0 | 1 | 2, number[]>> = {};

/**
 * The hip's throwing disc (the model's 'Flying disc' without its belt clip) in its own frame: the
 * hub at the origin, the disc in the x-y plane and its face along +z, DISC_SCALE times as big. The thrown disc and the disc
 * in hand are drawn with it (the user, 2026-11-23: the armour's disc).
 */
export const discVertices = (lod: 0 | 1 | 2): number[] => {
  const cached = discBuilt[lod];
  if (cached) {
    return cached;
  }
  const src = hunter(lod)['Flying disc'];
  // The sculpted disc's axes (discPoint()), through the model's stretch, made orthonormal.
  const a = unit(sized([0.89, 0, -0.456]));
  const n0 = sized([-0.456, 0, -0.89]);
  const b = unit(cross(n0, a));
  const n = unit(cross(a, b));
  const mean = (list: number[]) => {
    const c = [0, 0, 0];
    for (let i = 0; i < list.length; i += STRIDE) {
      [0, 1, 2].forEach(k => (c[k] += list[i + k] * (STRIDE / list.length)));
    }
    return c;
  };
  const off = (c: number[], i: number) =>
    Math.abs((src[i] - c[0]) * n[0] + (src[i + 1] - c[1]) * n[1] + (src[i + 2] - c[2]) * n[2]);
  // The clip reaches off the disc's plane: every triangle that does is dropped.
  const rough = mean(src);
  const kept: number[] = [];
  for (let t = 0; t < src.length; t += 3 * STRIDE) {
    if ([0, 1, 2].every(k => off(rough, t + k * STRIDE) < 0.03)) {
      kept.push(...src.slice(t, t + 3 * STRIDE));
    }
  }
  const c = mean(kept);
  const out: number[] = [];
  const dot = (v: number[], w: number[]) => v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  for (let i = 0; i < kept.length; i += STRIDE) {
    const p = [0, 1, 2].map(k => kept[i + k] - c[k]);
    const m = kept.slice(i + 3, i + 6);
    out.push(...[a, b, n].map(w => dot(p, w) * DISC_SCALE), dot(m, a), dot(m, b), dot(m, n));
    out.push(...kept.slice(i + 6, i + STRIDE));
  }
  return (discBuilt[lod] = out);
};

/**
 * The disc's hub from the hand's grip (gun.ts grip()), metres: forward along the fingers, and down
 * under the palm (against gun.ts axes()' right, the back of the hand).
 */
export const DISC_HOLD: readonly [number, number] = [-0.005, 0.022];
/** The own hand holding the disc, moved from the gun's place in camera space (right, up, ahead), metres. */
export const DISC_RAISE: Vec3 = [-0.03, 0.06, 0.06];
/** The own hand holding the disc: how far its fingers lean ahead of straight up (a slope). */
export const DISC_TILT = 2;
/** The fingers on the disc fanned out this many times an open hand's (the user, 2026-11-23). */
export const DISC_SPREAD = 5.5;
/** How far the fingers bend over the disc's edge in all, radians, over their three joints (the user, 2026-11-23). */
export const DISC_HOOK = 1.4;
/** How far the fingers close over the disc (hand()'s curl): little, long over its hub (the user, 2026-11-23). */
export const DISC_CURL = 0.05;

/**
 * The armour's disc in a hand (the user, 2026-11-23: the disc in hand is the one on his hip):
 * centred `at`, its plane along `x` and `y` and its face along `n`, all unit.
 */
export const drawDisc = (out: Out, at: Vec3, x: Vec3, y: Vec3, n: Vec3, lod: 0 | 1 | 2 = 1) => {
  const v = discVertices(lod);
  for (let i = 0; i < v.length; i += STRIDE) {
    for (const [o, w] of [
      [i, 1],
      [i + 3, 0],
    ]) {
      out.push(...[0, 1, 2].map(k => w * at[k] + v[o] * x[k] + v[o + 1] * y[k] + v[o + 2] * n[k]));
    }
    out.push(...v.slice(i + 6, i + STRIDE));
  }
};
