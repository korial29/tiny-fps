// Hunter design study. Parts share the runner's metre scale, -z facing and mesh vertex format.
import { SHINE, STRIDE, TWILL, WEAVE, capsule, dress, segment, solid, sub, unit } from './mesh';
import type { Vec3 } from './mesh';

import { body } from './skin';
import { hands } from './body';
import { KIND } from './features';
import { JOINT as J, JOINTS, rest, solve } from './rig';

const hide: Vec3 = [0.39, 0.42, 0.28];
const leather: Vec3 = [0.15, 0.12, 0.105];
const graphite: Vec3 = [0.18, 0.22, 0.23];
const silver: Vec3 = [0.57, 0.66, 0.66];
const bronze: Vec3 = [0.59, 0.37, 0.19];
const light: Vec3 = [1, 0.24, 0.065];

const stature = 1.2;
const bell = (x: number) => Math.exp(-x * x);

// Sculpt the Marine's rest skin, including the shared shoulder and crotch vertices.
// Bone weights distinguish the inside of an arm from the adjacent chest wall.
function marineBuild(lod: 0 | 1 | 2): number[] {
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
    const armMass = 0.68 * bell((y - 1.319) / 0.084) + 0.49 * bell((y - 1.098) / 0.073);
    const legMass = 0.32 * bell((y - 0.745) / 0.15) + 0.28 * bell((y - 0.35) / 0.095);
    const shoulder = 0.061 + 0.19 * Math.max(0, 1.45 - y) - 0.024 * bell((y - 1.37) / 0.14);
    const armX = 0.212;
    const deltoid = bell((y - 1.446) / 0.072) * bell((ax - 0.222) / 0.057);
    // Fill the lower rib cage and waist progressively; the shoulder cap tapers separately.
    const ribWidth = 1.09 + 0.245 * chest + 0.2 * bell((y - 1.178) / 0.16);
    const wide =
      ax * ribWidth * torso +
      0.012 * deltoid +
      (armX + shoulder + (ax - armX) * (1.18 + armMass)) * armWeight +
      (0.125 + (ax - 0.1) * (1.1 + legMass)) * legWeight;
    let depth = z * (1.18 + 0.23 * chest * torso + armMass * armWeight + legMass * legWeight);
    depth += z * 0.22 * deltoid;
    const front = Math.min(1, Math.max(0, -z / 0.074));
    // Broad paired pecs narrowing into the sternum, then three shorter abdominal pairs.
    const pec = 0.067 * bell(((ax - 0.09) / 0.086) ** 2) * bell((y - 1.392 - 0.1 * ax) / 0.067);
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
    const belly = 0.074 * bell((ax - 0.129) / 0.135) * bell((y - 1.398 - 0.087 * ax) / 0.073);
    const sternum = 0.004 * bell(x / 0.04) * bell((y - 1.4) / 0.097);
    return -ribs - belly + sternum + 0.023 * ((y - 1.398) / 0.143) ** 2;
  };
  const influence = vertices.map(
    ([x, y, z]) =>
      fade((y - 1.295) / 0.055) *
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
    for (const k of face) {
      const [x, y] = points[k];
      const pelvic = y < 0.987 && y > 0.865 && Math.abs(x) < 0.158 && arm[k] < 0.2;
      const tint = y < 0.145 ? graphite : pelvic ? leather : hide;
      const [px, py, pz] = vertices[k];
      const coverage =
        tint === hide ? Math.min(1, Math.max(0, (y - 0.99) / 0.07) + arm[k] + leg[k]) : 0;
      // Pigment follows the flanks and shoulders, with broken mottling over the lighter chest.
      const flanks = Math.min(1, Math.abs(px) / 0.33);
      const pigment =
        0.5 +
        0.5 *
          Math.sin(91 * px + 29 * py + 1.7 * Math.sin(43 * pz - 52 * py)) *
          Math.cos(63 * py - 51 * pz + 0.9 * Math.sin(66 * px));
      const pecLight = 0.086 * bell((Math.abs(px) - 0.13) / 0.09) * bell((py - 1.408) / 0.057);
      const midline = 0.087 * bell(px / 0.018) * bell((py - 1.32) / 0.18);
      const shade =
        0.91 -
        0.34 * flanks -
        (0.09 + 0.14 * flanks) * pigment +
        0.14 * Math.max(0, -smooth[k][2]) +
        pecLight -
        midline;
      const warm = [0.57 * shade, 0.4 * shade, 0.285 * shade];
      result.push(
        ...vertices[k],
        ...smooth[k],
        tint[0] + coverage * (warm[0] - tint[0]),
        tint[1] + coverage * (warm[1] - tint[1]),
        -1,
        tint[2] + coverage * (warm[2] - tint[2]),
      );
    }
  }
  if (lod) {
    const gloves: number[] = [];
    hands(gloves, solve(rest()), 0, [0.24, 0.24], graphite, hide, {}, lod === 1);
    for (let i = 0; i < gloves.length; i += STRIDE) {
      const p = shape([gloves[i], gloves[i + 1], gloves[i + 2]], 1, 0);
      result.push(...p, ...gloves.slice(i + 3, i + STRIDE));
    }
  }
  return result;
}

export function hunter(lod: 0 | 1 | 2) {
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
  function plate(edge: Vec3[], peak: Vec3, color: Vec3, layer = TWILL, sharp = false) {
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

  parts['Marine anatomy'] = marineBuild(lod);
  part('Mask lining');
  limb([0, 1.51, 0], [0, 1.68, 0], [0.085, 0.077, 0.097], [0.35, 0.25, 0.18], 0.97);
  limb([0, 1.59, 0], [0, 1.86, 0.01], [0.084, 0.112, 0.144, 0.13, 0.058], graphite, 1);
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
  limb([0.403, 0.983, -0.004], [0.424, 0.897, -0.005], [0.056, 0.061, 0.048], graphite, 1, TWILL);
  part('Laser saddle');
  limb([-0.245, 1.47, 0.063], [-0.257, 1.535, 0.058], [0.071, 0.082, 0.052], graphite, 1.24, TWILL);
  const alloy: Vec3 = [0.42, 0.425, 0.405];
  const rim: Vec3 = [0.36, 0.365, 0.35];
  const gauze: Vec3 = [0.19, 0.205, 0.2];
  // Angles run from the wearer's left to right across the face. Each panel
  // has its own edge normals so the lip of the visor catches a separate highlight.
  type Surface = (u: number, v: number) => Vec3;
  function panel(surface: Surface, cols: number, rows: number, tint: Vec3, reverse = false) {
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
          TWILL,
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

  // Fit the kit to cross-sections of the actual leg at this level of detail.
  // Each ray meets the skin before the ankle straps or the cords stand off it.
  const legSkin = parts['Marine anatomy'];
  const low = 0.083,
    step = 0.022,
    levels = 37,
    sectors = [12, 24, 36][lod];
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
        sectors,
        3,
        leather,
      );
    }
    part('Shin plates ' + side);
    for (let course = 0; course < 5; course++) {
      const base = 0.145 + 0.062 * course;
      panel(
        (u, v) => {
          const angle = (u - 0.5) * (2.88 + 0.32 * v);
          const ridge = Math.max(0, Math.cos(angle));
          return wrap(
            angle,
            base + 0.078 * v - 0.032 * ridge ** 4,
            0.009 + 0.01 * (1 - v) + 0.009 * ridge ** 6 + 0.003 * Math.sin(Math.PI * v),
          );
        },
        lod === 2 ? 16 : 8,
        4,
        course % 2 ? [0.31, 0.35, 0.35] : [0.36, 0.39, 0.385],
      );
    }
    part('Boot lames ' + side);
    for (let j = 0; j < 2; j++) {
      panel(
        (u, v) => {
          const a = (u - 0.5) * Math.PI,
            z = -0.191 + j * 0.076 + 0.08 * v;
          const arch = 0.037 + j * 0.014 + 0.018 * v;
          return [
            side * 0.167 + (0.059 + 0.004 * v) * Math.sin(a),
            0.023 + arch * Math.cos(a),
            z - 0.01 * Math.cos(a),
          ];
        },
        lod === 2 ? 16 : 8,
        4,
        j === 0 ? [0.26, 0.3, 0.3] : [0.32, 0.355, 0.35],
      );
    }
    part('Patella ' + side);
    const cap: Surface = (u, v) => {
      const angle = (u - 0.5) * (1.58 + 1.36 * Math.sin(Math.PI * v * 0.86));
      const ridge = Math.cos(angle);
      return wrap(
        angle,
        0.426 + 0.119 * v - 0.022 * ridge ** 4 * (1 - v),
        0.016 + 0.021 * ridge ** 3 * Math.sin(Math.PI * v) + 0.004 * ridge,
      );
    };
    panel(cap, lod === 2 ? 18 : 10, 7, [0.4, 0.43, 0.425]);
    if (lod) {
      for (const sign of [-1, 1]) {
        panel(
          (u, v) => {
            const p = cap(0.5 + sign * (0.095 + 0.3 * v) + (u - 0.5) * 0.025, 0.15 + 0.69 * v);
            p[2] -= 0.002;
            return p;
          },
          2,
          8,
          bronze,
        );
      }
    }
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
      brow(a) + (1.957 - brow(a)) * Math.sin(t),
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
  panel(visor, slices, 2, gauze);
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
  limb([-0.232, 1.704, -0.042], [-0.23, 1.705, -0.138], [0.018, 0.025, 0.02], bronze, 1, TWILL);
  limb([-0.23, 1.705, -0.138], [-0.23, 1.705, -0.14], [0.012, 0.012], light, 1, -2);
  part('Belt');
  limb([0, 0.973, 0], [0, 1.045, 0], [0.207, 0.215, 0.198], leather, 0.79, WEAVE);
  plate(
    [
      [-0.071, 1.028, -0.162],
      [0.071, 1.028, -0.162],
      [0.084, 0.924, -0.164],
      [0.018, 0.753, -0.18],
      [-0.069, 0.854, -0.173],
    ],
    [0, 0.918, -0.192],
    bronze,
  );
  part('Wrist blade');
  plate(
    [
      [0.355, 1.026, -0.177],
      [0.405, 1.051, -0.172],
      [0.434, 0.973, -0.185],
      [0.415, 0.685, -0.276],
      [0.376, 0.934, -0.215],
    ],
    [0.398, 0.949, -0.229],
    silver,
    SHINE,
    true,
  );
  part('Shoulder laser');
  limb([-0.245, 1.46, 0.08], [-0.28, 1.676, 0.066], [0.064, 0.042, 0.059], bronze, 1, TWILL);
  limb(
    [-0.28, 1.676, 0.156],
    [-0.28, 1.676, -0.164],
    [0.045, 0.067, 0.069, 0.049, 0.052],
    graphite,
    0.9,
    TWILL,
  );
  limb([-0.28, 1.676, -0.162], [-0.28, 1.676, -0.174], [0.05, 0.046], silver, 0.92, SHINE);
  limb([-0.28, 1.676, -0.175], [-0.28, 1.676, -0.177], [0.028, 0.028], light, 1, -2);
  part('Harpoon');
  limb([-0.34, 0.367, 0.108], [0.367, 1.823, 0.183], [0.015, 0.019, 0.016], bronze, 1, SHINE);
  plate(
    [
      [0.342, 1.817, 0.166],
      [0.359, 1.885, 0.16],
      [0.45, 1.985, 0.17],
      [0.413, 1.839, 0.156],
      [0.382, 1.844, 0.157],
      [0.372, 1.798, 0.16],
    ],
    [0.382, 1.857, 0.143],
    silver,
    SHINE,
    true,
  );
  part('Flying disc');
  const hub: Vec3 = [-0.206, 0.961, -0.163];
  const diskPoint = (r: number, a: number, z: number): Vec3 => [
    hub[0] + r * Math.cos(a) * 0.85,
    hub[1] + r * Math.sin(a),
    hub[2] + r * Math.cos(a) * 0.5 + z,
  ];
  for (let j = 0; j < 6; j++) {
    const a = (j * Math.PI) / 3;
    plate(
      [
        diskPoint(0.054, a - 0.32, 0),
        diskPoint(0.109, a - 0.41, 0),
        diskPoint(0.139, a + 0.27, 0),
        diskPoint(0.089, a + 0.22, 0),
        diskPoint(0.054, a + 0.66, 0),
      ],
      diskPoint(0.083, a, -0.019),
      silver,
      SHINE,
    );
  }
  limb(hub, [hub[0] + 0.013, hub[1], hub[2] - 0.026], [0.075, 0.061, 0.034], bronze, 1, TWILL);
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
    const legKit = /^(Thigh net|Leg straps|Shin plates|Patella|Boot lames) /.test(name);
    const beltKit = name === 'Belt' || name === 'Flying disc';
    for (let i = 0; i < mesh.length; i += STRIDE) {
      if (beltKit) {
        mesh[i + 1] += 0.08;
      }
      if (anatomy || legKit) {
        const x = mesh[i],
          y = mesh[i + 1];
        // The relaxed arms hang alongside the trunk at the height of the belt.
        const t = anatomy ? Math.min(1, Math.max(0, (0.31 - Math.abs(x)) / 0.055)) : 1;
        if (t > 0 && y > 0.085 && y < 1.4) {
          const [rise, slope] = legRise(y);
          const weight = t * t * (3 - 2 * t);
          const dyDx = anatomy ? (-Math.sign(x) * rise * 6 * t * (1 - t)) / 0.055 : 0;
          const ny = mesh[i + 4] / (1 + weight * slope);
          const n = unit([mesh[i + 3] - ny * dyDx, ny, mesh[i + 5]]);
          mesh[i + 1] += weight * rise;
          mesh[i + 3] = n[0];
          mesh[i + 4] = n[1];
          mesh[i + 5] = n[2];
        }
      }
      if (head) {
        mesh[i + 1] += (stature - 1) * 1.55;
      } else {
        if (name === 'Wrist blade') {
          mesh[i] += 0.013;
          mesh[i + 2] += 0.132;
          mesh[i + 1] -= 0.094;
        }
        mesh[i] *= stature;
        mesh[i + 1] *= stature;
        mesh[i + 2] *= stature;
      }
    }
  }
  return parts;
}
