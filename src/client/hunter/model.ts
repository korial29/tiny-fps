import {
  GLOSS,
  SHINE,
  STRIDE,
  TWILL,
  WEAVE,
  aim,
  mix,
  capsule,
  dress,
  segment,
  solid,
  sub,
  unit,
} from '../mesh';
import type { Vec3 } from '../mesh';

import { wristBlade, wristEnds } from '../katana';
import { JOINT as J } from '../rig';
import {
  ELBOW,
  HELM_WIDTH,
  HINGE,
  NET_SLEEVE,
  POST,
  STRIP,
  WRIST_LIFT,
  WRIST_UP,
  bronze,
  graphite,
  leather,
  light,
  silver,
  stature,
} from './constants';
import { drawHarpoon } from './harpoon';
import { bell, built, marineBuild, net, spots, yoke, yokeLine } from './marine';
import { HUNTER_REST } from './rest';

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
    for (let course = lod ? -2 : 0; course <= (rib ? 6 : 0); course++) {
      if (!lod && course > 0 && course !== 2 && course !== 4) {
        continue;
      }
      const corner = ([px, py, pz]: Vec3, pn: Vec3) => {
        const x = Math.abs(px),
          y = py,
          z = pz;
        const front = Math.max(0, Math.min(1, -z / 0.16));
        const inside = 0.18 - 0.08 * front + 0.026 * bell((y - 1.53) / 0.042);
        const lower =
          1.342 + 0.09 * Math.exp(-(((x - 0.17) / 0.115) ** 2)) + 0.032 * Math.max(0, z / 0.16);
        // Three long flutes run around the ribs under the armpit. Their
        // tips converge at the belt while the upper ends tuck under the pauldron.
        const t = Math.min(1, Math.max(0, (y - 1.035) / 0.425));
        const fullness = Math.sin(Math.PI * t);
        const width = 0.2 + 0.21 * t + 0.25 * fullness;
        const azimuth = Math.atan2(-px, -z);
        const centre = 1.3 - 0.25 * t + 0.08 * fullness;
        const flute = centre + (course - 2) * width * 0.57;
        const ribEdge = Math.min(
          (width * (lod ? 0.43 : 0.95) - Math.abs(azimuth - flute)) * 0.23,
          y - 1.035 - 0.018 * Math.abs(course - 2),
          1.425 - y - 0.008 * Math.abs(course - 2),
        );
        // The side armour (the user, 2026-11-24, after a reference picture): a plate over his left
        // pec (course 4), from beside the breastbone to the flank and up under the yoke, its lower
        // edge drawn to a point, and two lames under it over the side of the abs (5 and 6), each
        // tucked under the one above and narrower.
        const left = -px;
        const flank = (0.02 - z) * 0.6;
        const top = 1.31 - 0.13 * (course - 5);
        // It goes under the shoulder plate: it ends a little way inside that plate's edge, and
        // sinks to the skin as it nears it (`tuck`, 1 clear of the shoulder plate).
        const shoulder = Math.min(x - inside, y - lower);
        const plateEdge =
          course === 4
            ? Math.min(
                left - 0.022,
                1.478 - y,
                y - 1.3 + 0.035 * bell((left - 0.12) / 0.07),
                flank,
                0.016 - shoulder,
              )
            : Math.min(
                left - 0.065 - 0.05 * (course - 5) - 0.42 * (top - y),
                top - y,
                y - top + 0.15,
                flank,
              );
        return {
          tuck: Math.min(1, Math.max(0, (0.004 - shoulder) / 0.05)),
          p: [px, py, pz] as Vec3,
          n:
            course > 0
              ? pn
              : unit([Math.sign(px) * Math.max(0.015, x - 0.205), (y - 1.325) * 0.72, z * 1.35]),
          edge:
            course > 3
              ? plateEdge
              : course > 0
                ? ribEdge
                : Math.min(
                    x - inside,
                    y - lower,
                    course === 0
                      ? 1
                      : y - lower + course * 0.043 - 0.023 * Math.min(1, Math.abs(z) / 0.16),
                  ),
        };
      };
      // The side armour's edges are cut in each face's sixteenths: the near level's faces are too
      // large to carry its outline.
      type Sample = [Vec3, Vec3];
      const quarter = (faces: Sample[][]) =>
        faces.flatMap(([a, b, c]) => {
          const mid = (u: Sample, v: Sample): Sample => [
            mix(u[0], v[0], 0.5),
            mix(u[1], v[1], 0.5),
          ];
          const [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)];
          return [
            [a, ab, ca],
            [ab, b, bc],
            [ca, bc, c],
            [ab, bc, ca],
          ];
        });
      const whole = corners.map((k): Sample => [
        skin.slice(k, k + 3) as Vec3,
        skin.slice(k + 3, k + 6) as Vec3,
      ]);
      const triangles = (course > 3 && lod ? quarter(quarter([whole])) : [whole]).map(face =>
        face.map(([at, normal]) => corner(at, normal)),
      );
      // Bevel the cut edge into a dark welt under the brushed metal face.
      const bevels = [
        [0, 0.005, 0.003, 0.005, graphite],
        [0.005, 0.014, 0.008, 0.006, rim],
        [0.014, 1, 0.014, 0, alloy],
      ] as const;
      const distant = [[0, 1, 0.009, 0, alloy]] as const;
      for (const triangle of triangles) {
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
                tuck: a.tuck + t * (b.tuck - a.tuck),
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
                course > 3
                  ? (bevel + 0.004 * (7 - course)) * (0.12 + 0.88 * v.tuck)
                  : course > 0
                    ? 0.002 + 0.55 * bevel + 0.0015 * (3 - course)
                    : bevel - course * 0.007;
              const color =
                course > 3 || course <= 0 ? tint : lo === 0 ? leather : lo < 0.014 ? rim : graphite;
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
    // Hung on a hinge as the strips under it are (stripSwing()), numbered after them.
    part(STRIP + (16 + index));
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
  /** How far the front strips' ends stand out over the thighs, metres. */
  const OVER_THIGH = 0.11;
  for (let i = 0; i < strips; i++) {
    // Each a part of its own: it hangs from the belt on a hinge (stripSwing()).
    part(STRIP + i);
    panel(
      (u, v) => {
        const angle = ((i + (u - 0.5) * (1.04 - 0.08 * v)) * 2 * Math.PI) / strips;
        const flare = 1 - (1 - v) ** 3;
        const hip = Math.sin(2 * angle) ** 2;
        const fold = 0.006 * Math.sin(Math.PI * u) + 0.004 * u;
        // Further out over the thighs in front, more the lower: standing, the thighs came
        // through the front strips from halfway down (the user, 2026-11-25).
        const over = OVER_THIGH * flare * hip * Math.max(0, Math.cos(angle)) ** 0.5;
        return [
          (0.193 + 0.055 * flare + 0.027 * hip + fold + 0.6 * over) * Math.sin(angle),
          0.987 - v * (0.26 + 0.016 * (i % 2) + 0.023 * Math.sin(Math.PI * u)),
          -(0.166 + 0.041 * flare + 0.058 * hip + fold + over) * Math.cos(angle),
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
  // The shoulder cannon, after the user's reference (2026-11-24) and no bigger than the one it
  // replaces: a slab-sided receiver with a short fat barrel and a drum on its side at the back,
  // on a jointed arm over a wedge of a saddle.
  /** `surface` as a panel whose faces look away from `core`. */
  function facing(surface: Surface, cols: number, rows: number, tint: Vec3, core: Vec3) {
    const du = sub(surface(0.501, 0.5), surface(0.499, 0.5));
    const dv = sub(surface(0.5, 0.501), surface(0.5, 0.499));
    const d = sub(surface(0.5, 0.5), core);
    const side =
      (dv[1] * du[2] - dv[2] * du[1]) * d[0] +
      (dv[2] * du[0] - dv[0] * du[2]) * d[1] +
      (dv[0] * du[1] - dv[1] * du[0]) * d[2];
    panel(surface, cols, rows, tint, side < 0, TWILL);
  }
  const blend = (p: Vec3, q: Vec3, t: number): Vec3 => p.map((x, k) => x + (q[k] - x) * t) as Vec3;
  /** A flat-sided block through two rectangles, each four corners in the same order around. */
  function block(a: Vec3[], b: Vec3[], tint: Vec3) {
    const core = [0, 1, 2].map(k => [...a, ...b].reduce((sum, p) => sum + p[k], 0) / 8) as Vec3;
    const face = (p: Vec3, q: Vec3, r: Vec3, s: Vec3) =>
      facing((u, v) => blend(blend(p, q, u), blend(r, s, u), v), 1, 1, tint, core);
    face(a[0], a[1], a[3], a[2]);
    face(b[0], b[1], b[3], b[2]);
    for (let i = 0; i < 4; i++) {
      face(a[i], a[(i + 1) % 4], b[i], b[(i + 1) % 4]);
    }
  }
  type Frame = (t: number, side: number, rise: number) => Vec3;
  const cross = (p: Vec3, q: Vec3): Vec3 => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
  /** Points from `a` (t = 0) to `b` (t = 1), offset to the side (along × `ref`) and up from it. */
  const frame = (a: Vec3, b: Vec3, ref: Vec3): Frame => {
    const along = unit(sub(b, a));
    const right = unit(cross(along, ref));
    const above = cross(right, along);
    return (t, side, rise) =>
      blend(a, b, t).map((x, k) => x + side * right[k] + rise * above[k]) as Vec3;
  };
  /**
   * A shell lofted through chamfered sections of `at`, each [t, half width, low, high, chamfer]:
   * flat facets, so every chamfer catches its own light.
   */
  function hull(at: Frame, stations: number[][], tint: Vec3) {
    const rings = stations.map(([t, w, lo, hi, c]): Vec3[] => [
      at(t, c - w, lo),
      at(t, w - c, lo),
      at(t, w, lo + c),
      at(t, w, hi - c),
      at(t, w - c, hi),
      at(t, c - w, hi),
      at(t, -w, hi - c),
      at(t, -w, lo + c),
    ]);
    const middle = (points: Vec3[]) =>
      [0, 1, 2].map(k => points.reduce((sum, p) => sum + p[k], 0) / points.length) as Vec3;
    const face = (p: Vec3, q: Vec3, r: Vec3, s: Vec3, core: Vec3) =>
      facing((u, v) => blend(blend(p, q, u), blend(r, s, u), v), 1, 1, tint, core);
    const all = middle(rings.flat());
    for (const r of [rings[0], rings[rings.length - 1]]) {
      face(r[0], r[1], r[3], r[2], all);
      face(r[0], r[3], r[7], r[4], all);
      face(r[7], r[4], r[6], r[5], all);
    }
    for (let j = 1; j < rings.length; j++) {
      const [a, b] = [rings[j - 1], rings[j]];
      const core = middle([...a, ...b]);
      for (let i = 0; i < 8; i++) {
        face(a[i], a[(i + 1) % 8], b[i], b[(i + 1) % 8], core);
      }
    }
  }
  /**
   * A drum about the axis `across` through `centre`: its wall, stepped rings on both faces,
   * `treads` raised bars across the wall and `bolts` round each face at `ring` from the axis.
   */
  function drum(
    centre: Vec3,
    across: Vec3,
    fore: Vec3,
    up: Vec3,
    radius: number,
    half: number,
    faces: [number, number, number, number, Vec3][],
    treads = 0,
    bolts = 0,
    ring = 0,
  ) {
    const sides = [8, 16, 24][lod];
    const at = (r: number, angle: number, s: number): Vec3 =>
      centre.map(
        (x, k) => x + s * across[k] + r * (Math.cos(angle) * fore[k] + Math.sin(angle) * up[k]),
      ) as Vec3;
    facing((u, v) => at(radius, 2 * Math.PI * u, half * (2 * v - 1)), sides, 1, alloy, centre);
    for (const s of [-1, 1]) {
      const behind = centre.map((x, k) => x - s * across[k]) as Vec3;
      for (const [r0, r1, s0, s1, tint] of faces) {
        facing(
          (u, v) => at(r0 + (r1 - r0) * v, 2 * Math.PI * u, s * (s0 + (s1 - s0) * v)),
          sides,
          1,
          tint,
          behind,
        );
      }
      for (let i = 0; i < bolts; i++) {
        const a = (2 * Math.PI * (i + 0.5)) / bolts;
        const z = radius * 0.075;
        const flat = faces[1][2];
        const square = (grow: number, out: number): Vec3[] =>
          [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([i, j]) => at(ring + i * z * grow, a + (j * z * grow) / ring, s * (flat + out)));
        block(square(1, -z), square(0.6, z), silver);
      }
    }
    for (let i = 0; i < treads; i++) {
      const a = (2 * Math.PI * i) / treads;
      const bar = (r: number, wide: number, reach: number): Vec3[] => [
        at(r, a - wide, -reach),
        at(r, a + wide, -reach),
        at(r, a + wide, reach),
        at(r, a - wide, reach),
      ];
      const wide = (0.42 * Math.PI) / treads;
      block(bar(radius * 0.9, wide, half * 0.82), bar(radius * 1.07, wide * 0.7, half * 0.7), rim);
    }
  }
  const X: Vec3 = [1, 0, 0];
  // The saddle is a boss raised out of the left shoulder plate: its skirt follows the plate's
  // own surface and swells to a round turret the arm stands in (the user, 2026-11-24: no square
  // base on the plate).
  const pauldron: Vec3[] = [];
  const shell = parts['Shoulder plates'];
  for (let i = 0; i < shell.length; i += STRIDE) {
    if (shell[i] < -0.1 && shell[i + 1] > 1.4 && shell[i + 4] > 0.2) {
      pauldron.push([shell[i], shell[i + 1], shell[i + 2]]);
    }
  }
  /** The height of the shoulder plate's top under (x, z): its nearest vertices, blended. */
  const plateTop = (x: number, z: number) => {
    let sum = 0,
      weight = 0;
    for (const [px, py, pz] of pauldron) {
      const w = 1 / ((px - x) ** 2 + (pz - z) ** 2 + 0.0001) ** 2;
      sum += w * py;
      weight += w;
    }
    return weight ? sum / weight : POST[1] - 0.03;
  };
  part('Laser saddle');
  const ease = (t: number) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  /** The boss at `r` (0 its middle, 1 its rim) round `angle`, `lift` above the plate at its skirt. */
  const boss = (r: number, angle: number, lift: number, top = POST[1] - 0.004): Vec3 => {
    const x = POST[0] + 0.052 * r * Math.cos(angle);
    const z = POST[2] + 0.068 * r * Math.sin(angle);
    const lip = lift - 0.014 * Math.max(0, (r - 0.84) / 0.16) ** 2;
    const skirt = plateTop(x, z) + lip;
    return [x, skirt + (Math.max(top, skirt) - skirt) * ease((0.84 - r) / 0.5), z];
  };
  const under: Vec3 = [POST[0], 1.3, POST[2]];
  facing(
    (u, v) => boss(Math.max(0.01, v), 2 * Math.PI * u, 0.007),
    [8, 16, 28][lod],
    [2, 4, 8][lod],
    alloy,
    under,
  );
  if (lod > 1) {
    // A dark gasket round the swell, and six studs on the skirt.
    facing(
      (u, v) => boss(0.6 + 0.1 * v, 2 * Math.PI * u, 0.007 + 0.004 * Math.sin(Math.PI * v)),
      28,
      2,
      graphite,
      under,
    );
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * (i + 0.5)) / 3;
      const stud = (grow: number, lift: number): Vec3[] =>
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([p, q]) => boss(0.8 + 0.045 * grow * p, a + 0.07 * grow * q, lift));
      block(stud(1, 0.002), stud(0.6, 0.012), silver);
    }
  }
  // The turret the arm's foot turns in, toothed from close.
  if (lod) {
    drum(
      [POST[0], POST[1] - 0.001, POST[2]],
      [0, 1, 0],
      [0, 0, -1],
      X,
      0.027,
      0.007,
      [
        [0.027, 0.023, 0.007, 0.01, rim],
        [0.023, 0.001, 0.01, 0.01, graphite],
      ],
      lod > 1 ? 10 : 0,
    );
  }
  part('Laser mount');
  // The arm, jointed at ELBOW behind the line from its foot to its top: two chamfered struts,
  // the upper one collared.
  const lower = frame(POST, ELBOW, [0, 0, 1]);
  const upper = frame(ELBOW, HINGE, [0, 0, 1]);
  hull(
    lower,
    [
      [0, 0.019, -0.015, 0.015, 0.006],
      [1, 0.016, -0.013, 0.013, 0.005],
    ],
    alloy,
  );
  hull(
    upper,
    [
      [0, 0.015, -0.012, 0.012, 0.005],
      [1, 0.013, -0.01, 0.01, 0.004],
    ],
    alloy,
  );
  if (lod) {
    hull(
      upper,
      [
        [0.5, 0.017, -0.014, 0.014, 0.005],
        [0.68, 0.017, -0.014, 0.014, 0.005],
      ],
      graphite,
    );
  }
  part('Laser knuckle');
  if (lod) {
    drum(
      ELBOW,
      X,
      [0, 0, -1],
      [0, 1, 0],
      0.021,
      0.017,
      [
        [0.021, 0.017, 0.017, 0.02, rim],
        [0.017, 0.011, 0.02, 0.02, graphite],
        [0.011, 0.001, 0.02, 0.023, alloy],
      ],
      lod > 1 ? 10 : 6,
    );
  }
  // The cannon itself, drawn deployed: it turns about the top of its arm (CANNON_HINGE).
  part('Shoulder laser');
  const breech: Vec3 = [-0.219, 1.673, 0.118];
  const muzzle: Vec3 = [-0.242, 1.644, -0.14];
  const barrel = (t: number): Vec3 => blend(breech, muzzle, t);
  // The barrel's frame: along it, to the wearer's right of it, and up from it.
  const gun = frame(breech, muzzle, [0, 1, 0]);
  const along = unit(sub(muzzle, breech));
  const right = sub(gun(0, 1, 0), breech);
  const above = sub(gun(0, 0, 1), breech);
  // The pivot under the receiver.
  limb(
    [HINGE[0] - 0.02, HINGE[1], HINGE[2]],
    [HINGE[0] + 0.02, HINGE[1], HINGE[2]],
    [0.013, 0.013],
    graphite,
    1,
    TWILL,
  );
  // The receiver: chamfered, its tail rising under the drum and its nose closing round the barrel.
  hull(
    gun,
    [
      [0.05, 0.022, -0.014, 0.012, 0.007],
      [0.16, 0.029, -0.028, 0.02, 0.008],
      [0.48, 0.03, -0.03, 0.022, 0.008],
      [0.58, 0.028, -0.026, 0.024, 0.009],
      [0.69, 0.024, -0.016, 0.0255, 0.01],
    ],
    alloy,
  );
  if (lod) {
    // The housing stepped up along its top, and the fore-end under the barrel.
    hull(
      gun,
      [
        [0.27, 0.012, 0.018, 0.025, 0.003],
        [0.33, 0.016, 0.018, 0.035, 0.006],
        [0.6, 0.015, 0.018, 0.034, 0.006],
        [0.73, 0.011, 0.018, 0.027, 0.004],
      ],
      rim,
    );
    hull(
      gun,
      [
        [0.58, 0.02, -0.035, -0.006, 0.007],
        [0.8, 0.018, -0.031, -0.006, 0.007],
        [0.93, 0.013, -0.022, -0.008, 0.005],
      ],
      rim,
    );
  }
  // The barrel to a collar round a dark bore.
  limb(barrel(0.6), barrel(0.97), [0.024, 0.024], graphite, 1, TWILL);
  limb(barrel(0.92), barrel(1.015), [0.03, 0.03], silver, 1, TWILL);
  limb(barrel(1.015), barrel(1.019), [0.023, 0.023], [0.049, 0.055, 0.053], 1);
  if (lod) {
    // Cooling fins along the barrel, where the fore-end leaves it bare.
    for (let i = 0; i < 6; i++) {
      const a = -0.35 + (i * (Math.PI + 0.7)) / 5;
      const fin = (t: number, r: number, h: number): Vec3 =>
        barrel(t).map(
          (x, k) =>
            x +
            (r * Math.cos(a) - h * Math.sin(a)) * right[k] +
            (r * Math.sin(a) + h * Math.cos(a)) * above[k],
        ) as Vec3;
      const cut = (t: number, grow: number): Vec3[] => [
        fin(t, 0.022, -0.004),
        fin(t, 0.022, 0.004),
        fin(t, 0.022 + 0.0075 * grow, 0.0025),
        fin(t, 0.022 + 0.0075 * grow, -0.0025),
      ];
      block(cut(0.7, 1), cut(0.91, 0.75), rim);
    }
    // Three rivets and a knob through the receiver, from flank to flank: square pegs, a
    // rounded one costing six times the vertices for a few millimetres.
    const peg = (t: number, reach: number, rise: number, half: number, tint: Vec3) => {
      const end = (side: number): Vec3[] =>
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([i, j]) => gun(t + (i * half) / 0.26, side, rise + j * half));
      block(end(-reach), end(reach), tint);
    };
    for (const t of [0.2, 0.26, 0.32]) {
      peg(t, 0.0325, 0.007, 0.003, silver);
    }
    peg(0.345, 0.034, -0.014, 0.005, graphite);
    for (const s of [-1, 1]) {
      const mark = (corners: [number, number][], tint: Vec3) => {
        const [p, q, r, e] = corners.map(([t, rise]) => gun(t, s * 0.0306, rise));
        facing(
          (u, v) => blend(blend(p, q, u), blend(r, e, u), v),
          1,
          1,
          tint,
          barrel(corners[0][0]),
        );
      };
      // A dark grille low on the flank at the back, and four raked vents ahead of the knob.
      mark(
        [
          [0.17, -0.019],
          [0.31, -0.019],
          [0.17, -0.008],
          [0.31, -0.008],
        ],
        [0.07, 0.08, 0.08],
      );
      for (let i = 0; i < 4; i++) {
        const t = 0.375 + i * 0.026;
        mark(
          [
            [t, -0.019],
            [t + 0.013, -0.019],
            [t + 0.009, -0.003],
            [t + 0.022, -0.003],
          ],
          [0.07, 0.08, 0.08],
        );
      }
      // A bolt housing on the flank, a rod from it forward along the nose.
      const flank = (side: number, t0: number, t1: number, low: number, high: number): Vec3[] => [
        gun(t0, s * side, low),
        gun(t1, s * side, low),
        gun(t1, s * side, high),
        gun(t0, s * side, high),
      ];
      block(flank(0.027, 0.49, 0.63, -0.006, 0.016), flank(0.037, 0.52, 0.6, 0, 0.011), graphite);
      const rod = (t: number, side: number): Vec3[] =>
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([i, j]) => gun(t, s * (side + i * 0.004), 0.005 + j * 0.004));
      block(rod(0.58, 0.033), rod(0.74, 0.028), silver);
    }
  }
  // The drum on its side over the back of the receiver: treads round it, bolts round its faces.
  drum(
    gun(0.13, 0, 0.033),
    right,
    along,
    above,
    0.042,
    0.025,
    lod
      ? [
          [0.042, 0.037, 0.025, 0.029, alloy],
          [0.037, 0.028, 0.029, 0.029, rim],
          [0.028, 0.024, 0.029, 0.024, graphite],
          [0.024, 0.012, 0.024, 0.026, alloy],
          [0.012, 0.001, 0.026, 0.03, graphite],
        ]
      : [[0.042, 0.001, 0.025, 0.03, rim]],
    [0, 8, 12][lod],
    [0, 6, 8][lod],
    0.0325,
  );
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
    const beltKit = name.startsWith('Belt') || name === 'Flying disc';
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
    // chest: `front` is where the skin's front, or the armour's, is at a place across it.
    part('Necklace');
    const breast: Vec3[] = chestFaces.flatMap(start =>
      [0, 1, 2].map((k): Vec3 => {
        const i = start + k * STRIDE;
        return [skin[i], skin[i + 1], skin[i + 2]];
      }),
    );
    // It lies over the side armour too.
    const guard = parts['Rib guard'];
    for (let i = 0; i < guard.length; i += STRIDE) {
      breast.push([guard[i], guard[i + 1], guard[i + 2]]);
    }
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
