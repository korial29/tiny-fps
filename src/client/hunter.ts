// Hunter design study. Parts share the runner's metre scale, -z facing and mesh vertex format.
import { SHINE, STRIDE, TWILL, WEAVE, capsule, dress, segment, solid, sub, unit } from './mesh';
import type { Vec3 } from './mesh';

import { body } from './skin';
import { wristBlade } from './katana';
import { hands, HUNTER_HAND } from './body';
import { KIND } from './features';
import { JOINT as J, JOINTS, rest, solve } from './rig';
import { Verts } from './verts';

const hide: Vec3 = [0.39, 0.42, 0.28];
const leather: Vec3 = [0.15, 0.12, 0.105];
const graphite: Vec3 = [0.18, 0.22, 0.23];
const silver: Vec3 = [0.57, 0.66, 0.66];
const bronze: Vec3 = [0.59, 0.37, 0.19];
const light: Vec3 = [1, 0.24, 0.065];

const stature = 1.2;
const bell = (x: number) => Math.exp(-x * x);
const built: Partial<Record<0 | 1 | 2, Record<string, number[]>>> = {};

// Sculpt the Marine's rest skin, including the shared shoulder and crotch vertices.
// Bone weights distinguish the inside of an arm from the adjacent chest wall.
function marineBuild(lod: 0 | 1 | 2, chestFaces: number[]): number[] {
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
  function shape([x, y, z]: Vec3, armWeight: number, legWeight: number): Vec3 {
    // Fade into the shared shoulder ring before the sleeve joins the trunk.
    armWeight *= Math.min(1, Math.max(0, (1.41 - y) / 0.105));
    const ax = Math.abs(x),
      sign = Math.sign(x),
      torso = 1 - armWeight - legWeight;
    const chest = bell((y - 1.405) / 0.15);
    const armMass = 0.45 * bell((y - 1.319) / 0.084) + 0.36 * bell((y - 1.098) / 0.073);
    const legMass = 0.26 * bell((y - 0.745) / 0.15) + 0.22 * bell((y - 0.35) / 0.095);
    const shoulder = 0.05 + 0.17 * Math.max(0, 1.45 - y) - 0.024 * bell((y - 1.37) / 0.14);
    const armX = 0.205;
    const deltoid = bell((y - 1.446) / 0.072) * bell((ax - 0.222) / 0.057);
    // Fill the lower rib cage and waist progressively; the shoulder cap tapers separately.
    const ribWidth = 1.09 + 0.22 * chest + 0.2 * bell((y - 1.178) / 0.16);
    const wide =
      ax * ribWidth * torso +
      0.008 * deltoid +
      (armX + shoulder + (ax - armX) * (1.18 + armMass)) * armWeight +
      (0.125 + (ax - 0.1) * (1.1 + legMass)) * legWeight;
    let depth = z * (1.18 + 0.23 * chest * torso + armMass * armWeight + legMass * legWeight);
    depth += z * 0.22 * deltoid;
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
    const ribs = 0.172 * Math.sqrt(Math.max(0.02, 1 - (x / 0.365) ** 2));
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
    if (face.every(k => arm[k] < 0.5) && face.some(k => points[k][1] > 0.98)) {
      chestFaces.push(result.length);
    }
    for (const k of face) {
      const y = points[k][1];
      const tint = y < 0.145 ? graphite : hide;
      const [px, py, pz] = vertices[k];
      const coverage =
        tint === hide ? Math.min(1, Math.max(0, (y - 0.15) / 0.07) + arm[k] + leg[k]) : 0;
      // Pigment follows the flanks and shoulders, with broken mottling over the lighter chest.
      const flanks = Math.min(1, Math.abs(px) / 0.33);
      const pigment =
        0.5 +
        0.5 *
          Math.sin(91 * px + 29 * py + 1.7 * Math.sin(43 * pz - 52 * py)) *
          Math.cos(63 * py - 51 * pz + 0.9 * Math.sin(66 * px));
      const pecLight = 0.086 * bell((Math.abs(px) - 0.13) / 0.09) * bell((py - 1.383) / 0.083);
      const midline = 0.087 * bell(px / 0.018) * bell((py - 1.32) / 0.18);
      const shade =
        0.91 -
        0.34 * flanks -
        (0.09 + 0.14 * flanks) * pigment +
        0.14 * Math.max(0, -smooth[k][2]) +
        pecLight -
        midline;
      const warm = [0.57 * shade, 0.4 * shade, 0.285 * shade];
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
function chestNet(skin: number[], faces: number[]): number[] {
  const mesh: number[] = [];
  type Corner = { p: Vec3; angle: number; y: number; collar: number };
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
      });
    }
    return kept;
  }
  for (const start of faces) {
    const tri = [0, 1, 2].map(k => {
      const i = start + k * STRIDE;
      const angle = Math.atan2(skin[i], -skin[i + 2]) / (2 * Math.PI);
      const y = skin[i + 1] / stature;
      return {
        p: [0, 1, 2].map(axis => skin[i + axis] + 0.0015 * skin[i + 3 + axis]) as Vec3,
        angle,
        y,
        collar: 1.48 - 0.11 * Math.sin(2 * Math.PI * angle) ** 4 - y,
      };
    });
    for (const v of tri) {
      v.angle -= Math.round(v.angle - tri[0].angle);
    }
    const patch = clip(
      clip(tri, v => v.y - 1.105),
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
      const phase = (v: Corner) => 28 * v.angle + direction * 18 * v.y;
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
  parts['Marine anatomy'] = marineBuild(lod, chestFaces);
  part('Mask lining');
  limb([0, 1.51, 0], [0, 1.68, 0], [0.085, 0.077, 0.097], [0.35, 0.25, 0.18], 0.97);
  limb([0, 1.59, 0], [0, 1.86, 0.01], [0.084, 0.112, 0.144, 0.13, 0.058], graphite, 1, TWILL);
  for (const s of [-1, 1]) {
    part('Quills' + s);
    const count = [3, 5, 7][lod];
    for (let j = 0; j < count; j++) {
      const t = j / (count - 1),
        x = s * (0.13 - 0.104 * t);
      const a: Vec3 = [x, 1.784, 0.009 + 0.123 * t],
        b: Vec3 = [s * (0.182 - 0.117 * t), 1.635, 0.073 + 0.111 * t];
      const c: Vec3 = [s * (0.205 - 0.134 * t), 1.5 - 0.127 * t, 0.128 + 0.135 * t];
      limb(a, b, [0.018, 0.024, 0.019], leather);
      const tip: Vec3 = [c[0] - s * 0.018, c[1] - 0.055 - 0.026 * t, c[2] + 0.027];
      limb(b, c, [0.02, 0.019, 0.014], graphite);
      limb(c, tip, [0.014, 0.009, 0.002], graphite);
      limb(b, [b[0], b[1] - 0.018, b[2] + 0.005], [0.022, 0.021], bronze, 1, SHINE);
    }
  }
  part('Harpoon harness');
  limb([-0.15, 1.05, 0.118], [0.155, 1.487, 0.131], [0.045, 0.045], leather, 0.64, WEAVE);
  for (const y of [1.17, 1.41]) {
    const x = (y - 1.07) * 0.485;
    limb(
      [x - 0.079, y, 0.128],
      [x + 0.019, y + 0.049, 0.164],
      [0.032, 0.038, 0.031],
      graphite,
      1,
      TWILL,
    );
  }
  part('Blade cuff');
  for (const side of [1, -1]) {
    if (side < 0) {
      part('Left bracer');
    }
    limb(
      [side * 0.362, 1.093, -0.006],
      [side * 0.392, 0.884, -0.002],
      [side > 0 ? 0.093 : 0.088, 0.084, 0.061, 0.048],
      silver,
      1.08,
      TWILL,
    );
    limb(
      [side * 0.39, 0.908, -0.002],
      [side * 0.392, 0.895, -0.002],
      [0.046, 0.044],
      graphite,
      1,
      TWILL,
    );
  }
  part('Laser saddle');
  limb([-0.228, 1.48, 0.079], [-0.233, 1.552, 0.082], [0.045, 0.049, 0.029], graphite, 1.05, TWILL);
  const alloy: Vec3 = [0.42, 0.425, 0.405];
  const rim: Vec3 = [0.36, 0.365, 0.35];
  const gauze: Vec3 = [0.19, 0.205, 0.2];
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
  const brow = (a: number) => 1.739 + (0.116 * (1 - Math.cos(a))) / 2;
  const aperture = (a: number) => 0.008 + 0.025 * Math.exp(-((Math.abs(a) - 0.82) ** 2) / 0.18);
  const polar = (a: number, w: number, depth: number, y: number, z = 0): Vec3 => [
    w * Math.sin(a),
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
    return polar(a, 0.149, 0.174, brow(a) - aperture(a) * (1 - v));
  };
  panel(visor, slices, 2, gauze, false, -1);
  if (lod) {
    // Stagger recessed dark cells on the curved band. Use physical pitch across
    // the eye so the centre bridge contains fewer rows than the wider temples.
    const columns = lod === 2 ? 64 : 36;
    const pitch = 0.54 / columns;
    for (let i = 0; i < columns; i++) {
      const u = (i + 0.5) / columns,
        a = (u - 0.5) * 3.36,
        h = aperture(a);
      for (let y = pitch * (i % 2 ? 0.62 : 1.09); y < h - pitch * 0.35; y += pitch * 0.94) {
        const cell: Surface = (s, t) => {
          const angle = 2 * Math.PI * s;
          const p = visor(
            u + Math.cos(angle) * (0.43 / columns) * t,
            (y + pitch * 0.41 * Math.sin(angle) * t) / h,
          );
          return [p[0] * 1.003, p[1], p[2] * 1.003];
        };
        // A small planar hexagon, with the normal of the underlying curved grille.
        const center = cell(0, 0),
          n: Vec3 = [Math.sin(a), 0, -Math.cos(a)];
        for (let k = 0; k < 6; k++) {
          for (const p of [center, cell((k + 1) / 6, 1), cell(k / 6, 1)]) {
            out.push(...p, ...n, 0.044, 0.049, -1, 0.048);
          }
        }
      }
    }
  }

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
      const a = sign * (0.32 + u * 1.95);
      const taper = Math.sin(Math.PI * u) ** 0.64;
      const sweep = Math.max(0, (u - 0.66) / 0.34) ** 2;
      return polar(
        a,
        0.154 + 0.008 * taper + 0.013 * Math.sin(Math.PI * v) * taper,
        0.183 + 0.006 * Math.sin(Math.PI * v) * taper,
        brow(a) + 0.001 + 0.111 * u * u + v * 0.047 * taper,
        0.107 * sweep,
      );
    };
    // Close the swept tip on the inner face where it lifts clear of the shell.
    panel(rail, slices / 2, 5, rim, sign < 0);
    panel(
      (u, v) => {
        const p = rail(u, v);
        p[0] -= sign * 0.012 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        return p;
      },
      slices / 2,
      5,
      rim,
      sign > 0,
    );
  }
  // A flush three-port optical cluster sits just above the outer eye.
  part('Temple optics');
  const opticNormal = unit([0.91, 0.02, -0.42]);
  const socket: Vec3 = [0.146, 1.797, -0.072];
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
        (side ? 0.198 : index === 0 ? 0.184 : 0.165) +
        (side ? 0.094 : 0.051) * Math.sin((down * Math.PI) / 2) +
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
  // Soft black tabs hang between the metal tassets and move clear of the thighs.
  for (const side of [-1, 1]) {
    for (const back of [-1, 1]) {
      panel(
        (u, v) => {
          const angle = side * (0.56 + 0.47 * u + 0.08 * v);
          const radius = 0.202 + 0.049 * v + 0.007 * Math.sin(Math.PI * u * 2);
          return [
            radius * Math.sin(angle),
            0.981 - v * (0.23 + 0.052 * Math.sin(Math.PI * u)),
            back * radius * Math.cos(angle),
          ];
        },
        lod ? 5 : 2,
        2,
        [0.056, 0.051, 0.046],
        side * back < 0,
        WEAVE,
      );
    }
  }
  part('Wrist blade');
  const twin = wristBlade(lod);
  for (let i = 0; i < twin.length; i += STRIDE) {
    out.push(
      0.392 + twin[i] * 0.86,
      0.884 + twin[i + 1] * 0.86,
      twin[i + 2] * 0.86,
      twin[i + 3],
      twin[i + 4],
      twin[i + 5],
      ...twin.slice(i + 6, i + STRIDE),
    );
  }
  part('Shoulder laser');
  limb([-0.233, 1.54, 0.082], [-0.221, 1.637, 0.06], [0.027, 0.021, 0.031], alloy, 0.88, TWILL);
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
  // A folding bolt rifle rides diagonally across the back: long barrel, receiver, stock and folded legs.
  limb([-0.31, 1.15, 0.19], [0.25, 1.73, 0.19], [0.035, 0.032, 0.028], graphite, 0.72, TWILL);
  limb([-0.08, 1.39, 0.145], [0.11, 1.59, 0.145], [0.062, 0.068, 0.054], bronze, 0.9, SHINE);
  limb([-0.25, 1.2, 0.16], [-0.08, 1.37, 0.16], [0.041, 0.043, 0.038], leather, 0.78, TWILL);
  limb([0.08, 1.57, 0.15], [0.28, 1.77, 0.15], [0.046, 0.046, 0.04], graphite, 0.74, TWILL);
  limb([-0.12, 1.33, 0.104], [-0.21, 1.27, 0.103], [0.012, 0.013], silver, 1, SHINE);
  limb([0.13, 1.63, 0.104], [0.04, 1.57, 0.103], [0.012, 0.013], silver, 1, SHINE);
  limb([-0.018, 1.475, 0.087], [-0.018, 1.51, 0.087], [0.018, 0.013], silver, 1, SHINE);
  part('Flying disc');
  // The throwing disc sits face out on the hip. Six swept blades grow
  // from separate bronze collars around a recessed steel boss.
  const discPoint = (r: number, angle: number, height: number): Vec3 => {
    const x = r * Math.cos(angle);
    return [
      -0.205 + 0.89 * x - 0.456 * height,
      0.955 + r * Math.sin(angle),
      -0.178 - 0.456 * x - 0.89 * height,
    ];
  };
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
      name.startsWith('Quills') ||
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
          const n = unit([mesh[i + 3] - ny * dyDx, ny, mesh[i + 5]]);
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
        // Seat the mask over the neck, keeping the shell, optics and quills together.
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
    parts['Chest net'] = chestNet(skin, chestFaces);
  }
  return (built[lod] = parts);
}

/** The Hunter's foldable, long-bolt rifle in right-hand grip space (muzzle points along -z). */
const harpoons: number[][] = [];
export const hunterHarpoon = (lod: 0 | 1 | 2): number[] => {
  if (harpoons[lod]) {
    return harpoons[lod];
  }
  const out: number[] = [];
  const steel = [0.56, 0.61, 0.59];
  const dark = [0.13, 0.16, 0.17];
  const bronze = [0.54, 0.34, 0.16];
  const part = (a: Vec3, b: Vec3, radius: number, tint: number[], width = radius) => {
    const length = Math.hypot(...sub(b, a));
    segment(
      out,
      solid(lod, length, [radius, radius * 0.92, radius * 0.65]),
      a,
      b,
      [1, 0, 0],
      length,
      [1, width / radius],
      tint,
    );
  };
  // Long telescoping barrel and a stepped receiver, sized around the hand's grip at the origin.
  part([0, 0.018, -0.12], [0, 0.018, -0.69], 0.031, steel);
  part([0, 0.018, -0.66], [0, 0.018, -0.78], 0.043, bronze, 1.2);
  part([0, 0, -0.4], [0, 0.035, -0.14], 0.075, dark, 1.25);
  part([0, -0.025, -0.18], [0, -0.16, -0.04], 0.046, bronze, 0.85);
  part([0, 0.012, -0.08], [0, 0.02, 0.23], 0.038, dark);
  // Fold-out support struts, sight rail and the bronze locking bands on the barrel.
  part([-0.06, -0.105, -0.31], [-0.075, -0.23, -0.66], 0.012, steel);
  part([0.06, -0.105, -0.31], [0.075, -0.23, -0.66], 0.012, steel);
  part([-0.042, 0.079, -0.42], [0.042, 0.079, -0.42], 0.012, bronze);
  part([-0.042, 0.079, -0.25], [0.042, 0.079, -0.25], 0.012, bronze);
  part([0, 0.09, -0.37], [0, 0.16, -0.32], 0.024, dark, 1.15);
  part([0, 0.16, -0.32], [0, 0.16, -0.26], 0.012, steel);
  return (harpoons[lod] = out);
};
