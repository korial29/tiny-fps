// The swing trail: a ribbon of cyan light left behind a cutting blade, from its point to a third of
// the way down it, fading in LIFE seconds. One per sword, the samples taken as it is drawn. Nothing
// is blended, so a ribbon fades by narrowing toward the point's path and dimming. No DOM, no GL.
import type { Vec3 } from './mesh';
import type { Out } from './verts';

/** Seconds a sample of the trail lasts. */
export const LIFE = 0.15;
/** Samples kept at most: the oldest goes. */
const MAX = 24;
/** The glow of the ribbon: unlit and above 1, so that the bloom picks it up. */
const GLOW = [0.5, 1.9, 2.3];

/** The blade at one frame: the point `b`, the place a third down the blade `a`, how old it is, and whether the ribbon begins here. */
interface Sample {
  a: Vec3;
  b: Vec3;
  age: number;
  start: boolean;
}

export interface Trail {
  /** The blade as drawn: its root and its point; `on` while it cuts, which leaves a ribbon. */
  mark(base: Vec3, tip: Vec3, on: boolean): void;
  /** Ages the samples by dt seconds and drops the ones that are over. */
  update(dt: number): void;
  /** Appends the ribbon, in the vertex format of mesh.ts. */
  draw(out: Out): void;
  /** The samples alive now. */
  readonly count: number;
}

export const createTrail = (): Trail => {
  const samples: Sample[] = [];
  let live = false;
  return {
    mark(base, tip, on) {
      if (on) {
        samples.push({
          a: tip.map((v, i) => v + (base[i] - v) / 3) as Vec3,
          b: tip,
          age: 0,
          start: !live,
        });
        if (samples.length > MAX) {
          samples.shift();
        }
      }
      live = on;
    },
    update(dt) {
      samples.forEach(s => (s.age += dt));
      while (samples[0] && samples[0].age >= LIFE) {
        samples.shift();
      }
    },
    draw(out) {
      samples.forEach((s, i) => {
        const o = samples[i - 1];
        if (!o || s.start) {
          return;
        }
        // The width and the light go with the age: the older end of a piece is the narrower.
        const [k0, k1] = [o, s].map(x => 1 - x.age / LIFE);
        const w = (x: Sample, k: number) => x.b.map((v, j) => v + (x.a[j] - v) * k) as Vec3;
        const c = GLOW.map(v => v * (0.4 + 0.6 * (k0 + k1) * 0.5));
        const [p, q, r, t] = [o.b, s.b, w(s, k1), w(o, k0)];
        for (const v of [p, q, r, p, r, t]) {
          out.push(...v, 0, 1, 0, c[0], c[1], -2, c[2]);
        }
      });
    },
    get count() {
      return samples.length;
    },
  };
};
