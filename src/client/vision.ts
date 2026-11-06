// Runner vision: what a runner can use, picked out of the brushes alone and laid over the map as red
// geometry a centimetre proud of the surface. A ledge or box edge he can grab or climb gets a band
// along its lip, a pipe or a beam is red all over, a long free-standing wall gets a stripe at hand
// height. No DOM, no GL.
import { GRAB_MAX, STEP_H } from '../shared/constants';
import type { Brush, WorldDef } from '../shared/world';
import { teamRgb } from './flag';
import type { Vec3 } from './mesh';

/** A lip stands out when the top is more than a step above what lies beside it, and at most within a grab. */
const LIP_MIN = STEP_H;
const LIP_MAX = GRAB_MAX + 0.05;
/** A lip shorter than this is a corner, not a ledge to grab: the side of a step stays plain. */
const LIP_LONG = 1.5;
/** A brush whose two smaller sides are both at most this wide, and whose long one is twice as much, is a pipe or a beam. */
const BEAM = 0.6;
/** A wall to run along: free-standing, at least this long and high, at most this thick. */
const WALL_LONG = 8;
const WALL_HIGH = 2.5;
const WALL_THICK = 3;
/** Where beside an edge the neighbouring ground is read, metres. */
const BESIDE = 0.4;
/** How far the red stands off the surface, how wide a lip band is, and the stripe's height range above the foot of a wall. */
const OFF = 0.012;
const BAND = 0.2;
const HAND: [number, number] = [1.2, 1.45];

/** Unlit red (the shader brightens an unlit colour by 1.4, so these bloom), the faint stripe, and the lit red of a pipe. */
const LIP = [1.6, 0.12, 0.08];
const STRIPE = [0.9, 0.07, 0.05];
const PIPE = [0.85, 0.07, 0.05];

/** A side of a brush: its axis (0 x, 2 z) and 1 for its max, 0 for its min. */
export type Side = [axis: number, up: number];

export interface Use {
  /** The whole brush is red. */
  beam: boolean;
  /** Top edges to band. */
  lips: Side[];
  /** Faces to stripe at hand height. */
  stripes: Side[];
}

/** How far the top of `b` stands over what is at (x, z) but for itself: Infinity where a taller brush blocks, or nothing is below. */
const drop = (brushes: Brush[], b: Brush, x: number, z: number) => {
  let ground = -Infinity;
  for (const c of brushes) {
    if (c != b && c.min[0] <= x && x <= c.max[0] && c.min[2] <= z && z <= c.max[2]) {
      if (c.max[1] > b.max[1] + 1e-3) {
        if (c.min[1] < b.max[1]) {
          return Infinity;
        }
      } else {
        ground = Math.max(ground, c.max[1]);
      }
    }
  }
  return b.max[1] - ground;
};

/** What a runner can use on brush `b` of the world `def`. */
export const uses = ({ brushes, floor }: WorldDef, b: Brush): Use => {
  const size = b.max.map((m, i) => m - b.min[i]);
  const sorted = [...size].sort((p, q) => p - q);
  const use: Use = { beam: sorted[1] <= BEAM && sorted[2] >= 2 * BEAM, lips: [], stripes: [] };
  if (use.beam) {
    return use;
  }
  for (const axis of [0, 2]) {
    const along = 2 - axis;
    for (const up of [0, 1]) {
      const at = [b.min[0], 0, b.min[2]];
      at[axis] = (up ? b.max : b.min)[axis] + (up ? BESIDE : -BESIDE);
      at[along] = (b.min[along] + b.max[along]) / 2;
      const d = drop(brushes, b, at[0], at[2]);
      if (d > LIP_MIN && d <= LIP_MAX && size[along] >= LIP_LONG) {
        use.lips.push([axis, up]);
      }
    }
    // The faces across the thin side of a long wall.
    if (
      b.min[1] > floor &&
      size[1] >= WALL_HIGH &&
      size[along] >= WALL_LONG &&
      size[axis] <= WALL_THICK
    ) {
      use.stripes.push([axis, 0], [axis, 1]);
    }
  }
  return use;
};

/** One face of the box min..max (flat on `axis` when min and max agree there) as two triangles, pushed in the map's vertex format. */
export const face = (
  out: number[],
  min: Vec3,
  max: Vec3,
  axis: number,
  up: number,
  layer: number,
  rgb: number[],
) => {
  const [p, q] = [(axis + 1) % 3, (axis + 2) % 3];
  const n = [0, 0, 0];
  n[axis] = up ? 1 : -1;
  for (const [i, j] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
    [1, 1],
    [0, 1],
  ]) {
    const v = [0, 0, 0];
    [v[axis], v[p], v[q]] = [(up ? max : min)[axis], (i ? max : min)[p], (j ? max : min)[q]];
    out.push(...v, ...n, rgb[0], rgb[1], layer, rgb[2]);
  }
};

/** The red of every use in the world, in the map's vertex format (layer -2 glows, -1 is lit). */
export const vision = (def: WorldDef): number[] => {
  const out: number[] = [];
  for (const b of def.brushes) {
    const { beam, lips, stripes } = uses(def, b);
    const [lo, hi] = [b.min.map(v => v - OFF) as Vec3, b.max.map(v => v + OFF) as Vec3];
    if (beam) {
      for (let axis = 0; axis < 3; axis++) {
        for (const up of [0, 1]) {
          if (axis != 1 || up) {
            face(out, lo, hi, axis, up, -1, PIPE);
          }
        }
      }
    }
    for (const [axis, up] of lips) {
      const dir = up ? 1 : -1;
      const edge = (up ? b.max : b.min)[axis];
      // The band on the top, and the one down the face under it.
      const top = [b.min[0], b.max[1] + OFF, b.min[2]] as Vec3;
      const end = [b.max[0], b.max[1] + OFF, b.max[2]] as Vec3;
      [top[axis], end[axis]] = up ? [edge - BAND, edge] : [edge, edge + BAND];
      face(out, top, end, 1, 1, -2, LIP);
      const [a, c] = [top.slice() as Vec3, end.slice() as Vec3];
      [a[1], c[1]] = [b.max[1] - BAND, b.max[1]];
      [a[axis], c[axis]] = [edge + dir * OFF, edge + dir * OFF];
      face(out, a, c, axis, up, -2, LIP);
    }
    for (const [axis, up] of stripes) {
      const along = 2 - axis;
      const [a, c] = [[...b.min] as Vec3, [...b.max] as Vec3];
      [a[1], c[1]] = [b.min[1] + HAND[0], b.min[1] + HAND[1]];
      [a[along], c[along]] = [b.min[along] + 0.3, b.max[along] - 0.3];
      a[axis] = c[axis] = (up ? b.max : b.min)[axis] + (up ? OFF : -OFF);
      face(out, a, c, axis, up, -2, STRIPE);
    }
  }
  return out;
};

/** Half the side of the square painted under a base, and the width of its frame. */
const ZONE = 4.2;
const FRAME = 0.35;

/** A square on each team's roof around its base, lit paint of the team's colour: pale inside, a strong frame. */
export const zones = ({ teams }: WorldDef): number[] => {
  const out: number[] = [];
  teams.forEach(({ base: [x, y, z] }, team) => {
    const rgb = teamRgb(team);
    const pale = rgb.map(c => 0.25 + 0.45 * c);
    const quad = (x0: number, z0: number, x1: number, z1: number, c: number[], lift: number) =>
      face(out, [x + x0, y + lift, z + z0], [x + x1, y + lift, z + z1], 1, 1, -1, c);
    quad(-ZONE, -ZONE, ZONE, ZONE, pale, 0.02);
    for (const [x0, z0, x1, z1] of [
      [-ZONE, -ZONE, ZONE, -ZONE + FRAME],
      [-ZONE, ZONE - FRAME, ZONE, ZONE],
      [-ZONE, -ZONE, -ZONE + FRAME, ZONE],
      [ZONE - FRAME, -ZONE, ZONE, ZONE],
    ]) {
      quad(
        x0,
        z0,
        x1,
        z1,
        rgb.map(c => c * 0.8),
        0.03,
      );
    }
  });
  return out;
};
