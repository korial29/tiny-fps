// Landfall's volcano (docs/BEACH.md): a tall cone in the island's middle, behind the forest, drawn
// only. Its foot is under the far canopy's hills; its crater stands some 400 m over the sea, where
// the haze, which thins with height, leaves its upper slopes clear against the sky.
import { ZED } from '../../shared/beach';
import { TAU } from '../../shared/physics';
import { noise } from '../../shared/relief';

/** Its crater's axis (x, z), its rim's mean height and radius, metres. */
export const VOLCANO = { x: 700, z: ZED / 2, top: 400, rim: 75 };

/**
 * The rings' radii: the crater's floor and wall, then the flanks, closer near the rim where the
 * slope turns. Past the rim they are stretched round the cone so that the last one is its foot
 * (footOf()), wherever that is.
 */
const RADII = [
  0, 20, 38, 52, 62, 70, 75, 81, 90, 102, 117, 134, 154, 176, 200, 226, 255, 286, 320, 356, 394,
  434, 476, 520, 566, 614, 664, 716, 770,
];
/** Points round each ring. */
const AROUND = 96;

const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};

/** The ribs between the gullies, 0 in a gully's bed to 1 on a crest: ridged noise round the cone, stretched down its slope. */
const ribs = (c: number, s: number, r: number) => {
  const f = (k: number, seed: number) =>
    1 - Math.abs(2 * noise(c * k + r / 500, s * k + r / 700, seed) - 1);
  return Math.min((0.65 * f(11, 31) + 0.35 * f(27, 32)) ** 1.5 * 1.25, 1);
};

/** A smooth value round the circle at angle a, 0 to 1: a few broad swells, the same at 0 and TAU. */
const swell = (a: number, seed: number) =>
  noise(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, seed);
/** How deep the crater's breach cuts at angle a, 0 to 1: one side of the cone fell away. */
const breach = (a: number) =>
  Math.exp(-((Math.atan2(Math.sin(a - BREACH), Math.cos(a - BREACH)) / 0.38) ** 2));
/** The breach's direction: toward the beach and +z, so it is seen from it. */
const BREACH = 2.25;
/** An older cone on the flank toward -z, worn lower: its foot's centre (x, z), its height and radius. */
const SHOULDER = { x: VOLCANO.x - 170, z: VOLCANO.z - 300, top: 220, foot: 300 };

/** Toward the older cone, from the crater. */
const TOWARD = Math.atan2(SHOULDER.z - VOLCANO.z, SHOULDER.x - VOLCANO.x);
/** The foot comes no nearer the sea than this x, metres: under the canopy's hills (jungle/canopy.ts). */
const SHORE = 160;
/**
 * How far out the foot is at angle a: 560 to 800 m, past the older cone toward it, but never
 * past SHORE on the beach's side.
 */
const footOf = (a: number) => {
  const f = 560 + 240 * swell(a, 41) + 160 * Math.max(Math.cos(a - TOWARD), 0) ** 2;
  const c = Math.cos(a);
  return c < 0 ? Math.min(f, (VOLCANO.x - SHORE) / -c) : f;
};

/**
 * Its height at radius r and angle a: a concave cone whose foot, rim and slope differ round it,
 * its rim broken on one side, an older cone on its flank, ribbed by gullies running down from the rim.
 */
const height = (r: number, a: number) => {
  const { top, rim } = VOLCANO;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  // Not a cone: the rim higher on one side, the foot further out and the flank gentler on others.
  const br = breach(a);
  const crest = top + 70 * (swell(a, 42) - 0.5) - 95 * br;
  const foot = footOf(a);
  const expo = 1.5 + 0.9 * swell(a, 43);
  const floor = top - 85;
  let h: number;
  if (r <= rim) {
    // The crater: a floor under the lowest rim, a steep wall up to a sharp rim.
    h = floor + (Math.max(crest, floor + 4) - floor) * sm((r - 30) / (rim - 30));
  } else {
    const u = Math.max((foot - r) / (foot - rim), 0);
    // The breach goes on down the flank as a broad valley, fading out half-way.
    const fall = 95 * br * (1 - sm((r - rim) / 260));
    const base = (crest + fall) * u ** expo - fall * u;
    // Gullies: radial ribs (the noise round the ring, stretched down the slope), deepest mid-flank.
    const rib = ribs(c, s, r);
    h =
      base * (1 + 0.16 * (rib - 0.5) * sm((r - rim) / 40) * (1 - 0.6 * sm((r - 420) / 200))) +
      14 *
        (noise((VOLCANO.x + c * r) / 90, (VOLCANO.z + s * r) / 90, 33) - 0.5) *
        sm(1 - u) *
        sm(6 * u);
  }
  // The older cone, blended in by a soft maximum.
  const [x, z] = [VOLCANO.x + c * r, VOLCANO.z + s * r];
  const d = Math.hypot(x - SHOULDER.x, z - SHOULDER.z) / SHOULDER.foot;
  const old =
    SHOULDER.top * Math.max(1 - d, 0) ** 1.6 * (0.9 + 0.2 * noise(x / 60, z / 60, 44)) -
    25 * Math.exp(-((d / 0.12) ** 2));
  // Its width shrinks to nothing where either is down at the foot, so the foot stays on the ground.
  const k = Math.max(Math.min(30, h, old), 1e-3);
  const e = Math.max(k - Math.abs(h - old), 0) / k;
  return Math.max(h, old) + (e * e * k) / 4;
};

/** Its colour at a point h metres up: forest on the foot, scrub, then bare ash and rock, scorched at the rim. */
const tint = (x: number, z: number, h: number, rib: number): number[] => {
  const t = h / VOLCANO.top;
  const n = noise(x / 40, z / 40, 34);
  const g = t + 0.12 * (n - 0.5);
  const forest = [0.025, 0.07, 0.03];
  const scrub = [0.09, 0.1, 0.05];
  const ash = [0.075, 0.065, 0.06];
  const burnt = [0.06, 0.035, 0.03];
  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
  let c = mix(forest, scrub, sm((g - 0.28) / 0.14));
  // The green climbs the ribs higher than the gullies, down which the ash runs.
  c = mix(c, ash, sm((g - 0.42 - 0.12 * rib) / 0.1));
  c = mix(c, burnt, sm((g - 0.9) / 0.08));
  // Darker in the gullies, paler on the ribs between them.
  const k = 0.45 + 0.9 * rib + 0.2 * (n - 0.5);
  return c.map(v => v * k);
};

/** The cone, in the renderer's format: lit paint (layer -1), 6 vertices a quad. */
export const volcano = (): number[] => {
  const m = RADII.length;
  const p = new Float64Array(m * AROUND * 4);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < AROUND; i++) {
      const a = (i / AROUND) * TAU;
      const [rim, last] = [VOLCANO.rim, RADII[m - 1]];
      const r =
        RADII[j] <= rim ? RADII[j] : rim + ((footOf(a) - rim) * (RADII[j] - rim)) / (last - rim);
      const q = (j * AROUND + i) * 4;
      p[q] = VOLCANO.x + Math.cos(a) * r;
      p[q + 1] = height(r, a);
      p[q + 2] = VOLCANO.z + Math.sin(a) * r;
      p[q + 3] = ribs(Math.cos(a), Math.sin(a), r);
    }
  }
  /** A point's normal, from its neighbours round the ring and down the slope. */
  const at = (j: number, i: number) => ((j * AROUND + ((i + AROUND) % AROUND)) * 4) as number;
  const normal = (j: number, i: number) => {
    const [a, b] = [at(j, i - 1), at(j, i + 1)];
    const [c, d] = [at(Math.max(j - 1, 0), i), at(Math.min(j + 1, m - 1), i)];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[d] - p[c], p[d + 1] - p[c + 1], p[d + 2] - p[c + 2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[1] < 0) {
      n = n.map(e => -e);
    }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return j ? n.map(e => e / l) : [0, 1, 0];
  };
  const vert = (o: number[], j: number, i: number) => {
    const q = at(j, i);
    const [x, y, z] = [p[q], p[q + 1], p[q + 2]];
    const c = tint(x, z, y, p[q + 3]);
    o.push(x, y, z, ...normal(j, i), c[0], c[1], -1, c[2]);
  };
  const o: number[] = [];
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < AROUND; i++) {
      // Wound so that the faces look up and out, as the land's.
      vert(o, j, i);
      vert(o, j + 1, i);
      vert(o, j + 1, i + 1);
      vert(o, j, i);
      vert(o, j + 1, i + 1);
      vert(o, j, i + 1);
    }
  }
  return o;
};
