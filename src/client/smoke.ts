// Landfall's smoke and fire (docs/BEACH.md): a column of dark smoke over each torn engine and each
// broken end of the hull, small fires at their feet. Built once: every column is a stack of soft
// balls that never move, and the shader makes them smoke (PLUME below, compiled only into
// Landfall's program): a noise that climbs through them by the time alone. No DOM.
import { ENGINES, HULL, ZED } from '../shared/beach';
import type { WorldDef } from '../shared/world';

/**
 * The smoke's layer: under -2.5 it casts no shadow, and the shader draws all of it. c.x is how far
 * up its column a point is (0 its foot, 1 its top; up its flame for a fire), c.y a number of its
 * column's own, c.w 1 on a flame.
 */
export const SMOKE = -6;

/** A ball's bands and slices: its outline fades to nothing in the shader, so few are enough. */
export const [BANDS, SLICES] = [4, 5];
/** Metres the top of a column has drifted inland for each metre it rose: the sea breeze. */
const LEAN = 0.45;

/**
 * Where it burns: the foot of each column (x, y, z), how high it rises, and its radius at the
 * foot and at the top. On the rear of each nacelle's back and on the far end of each engine in
 * the lagoon, both halves; and high against each of the hull's four broken ends, thinner, so the way
 * through the gaps and over the back stays in sight.
 */
export const FIRES: number[][] = [
  ...[
    [ENGINES[0][0], 5.3, ENGINES[0][1] + 3],
    [ENGINES[1][0] - 1.2, 1.3, ENGINES[1][1] - 3],
  ].flatMap(([x, y, z]) => [
    [x, y, z, 42, 1.3, 7],
    [x, y, ZED - z, 42, 1.3, 7],
  ]),
  ...HULL.sections.flatMap(([x0, x1], n) =>
    [n && x0 - 0.6, n < 2 && x1 + 0.6]
      .filter(x => x)
      .map(x => [+x, HULL.axis[n] + 3, ZED / 2, 28, 0.9, 4]),
  ),
];

/** A ball of radii `rx`, `ry` round `c`, as SMOKE: `at` gives c.x from a vertex's height, `id` is c.y, `w` c.w. */
const ball = (
  o: number[],
  [cx, cy, cz]: number[],
  rx: number,
  ry: number,
  at: (y: number) => number,
  id: number,
  w: number,
) => {
  const p = (i: number, j: number) => {
    const [a, b] = [(Math.PI * i) / BANDS, (2 * Math.PI * j) / SLICES];
    const [nx, ny, nz] = [Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)];
    const y = cy + ry * ny;
    return [cx + rx * nx, y, cz + rx * nz, nx, ny, nz, at(y), id, SMOKE, w];
  };
  for (let i = 0; i < BANDS; i++) {
    for (let j = 0; j < SLICES; j++) {
      if (i) {
        o.push(...p(i, j), ...p(i, j + 1), ...p(i + 1, j));
      }
      if (i < BANDS - 1) {
        o.push(...p(i, j + 1), ...p(i + 1, j + 1), ...p(i + 1, j));
      }
    }
  }
};

const made = new WeakMap<WorldDef, number[]>();

/**
 * The smoke's and the fires' vertices, in the renderer's format: drawn after the sky, blended
 * (render.ts). A column's balls grow as they rise and lean inland, each overlapping the last;
 * three flames stand round its foot.
 */
export const plumes = (def: WorldDef): number[] => {
  let o = made.get(def);
  if (!o) {
    made.set(def, (o = []));
    FIRES.forEach(([x, y, z, tall, r0, r1], id) => {
      for (let h = 0; h < tall;) {
        const t = h / tall;
        const r = r0 + (r1 - r0) * t ** 0.8;
        // Off the line by a little, each its own way: a column, not a pipe.
        const [dx, dz] = [Math.sin(id + h * 1.7), Math.cos(id * 2 + h * 2.3)];
        ball(
          o!,
          [x + LEAN * tall * t ** 1.6 + 0.2 * r * dx, y + h, z + 0.2 * r * dz],
          r,
          r,
          v => Math.min(Math.max((v - y) / tall, 0), 1),
          id,
          0,
        );
        h += 0.8 * r;
      }
      for (let k = 0; k < 3; k++) {
        const [a, tip] = [id + k * 2.1, 1.6 + 0.5 * k];
        ball(
          o!,
          [x + 0.6 * r0 * Math.cos(a), y + 0.4 * tip, z + 0.6 * r0 * Math.sin(a)],
          0.55,
          0.5 * tip,
          v => (v - y) / tip + 0.1,
          id,
          1,
        );
      }
    });
  }
  return o;
};

/**
 * The smoke's and the flames' pixel, in main(), given `fog` as the sea's: the share of haze over
 * it, an expression of `ds`. Blended with its colour times its alpha: a flame has none and only
 * adds its light. A ball is see-through at its outline (`a`), so no edge of it shows; what shows
 * is a noise in the world, the same through every ball, that climbs and drifts with the wind. The
 * smoke thins as it rises, is lit on the sun's side and from under by its fire, and fades out
 * within three metres of the eye. A flame is the same noise, faster, cut ever narrower up its
 * height (C.x), white-yellow at its heart and bright enough to bloom.
 */
export const PLUME = (fog: string) => `{vec3 V=E-P,n=normalize(N),q=P*.27-T*vec3(.2,.45,0);
float ds=length(V),a=abs(dot(n,V/ds)),h=C.x,l=.5+.5*dot(n,O),f;
if(C.w>.5){q=P*vec3(1.6,.7,1.6)-vec3(0,T*2.6,0);f=a*a*smoothstep(h,h+.5,vn3(q+C.y)+.5*vn3(q*2.1)-.1);
o=vec4(mix(vec3(2.4,.4,.04),vec3(3.4,2.2,.7),f*(1.-h))*f*(1.-(${fog})),0);return;}
f=vn3(q+C.y)+.5*vn3(q*2.4+7.);
a*=a*smoothstep(.3-.3*exp(-h*9.),.95,f)*(1.-h)*smoothstep(.5,3.,ds);
vec3 c=mix(vec3(.012,.011,.01),vec3(.09,.085,.08)+.2*h,l*l*(.5+.5*f))*(H[0]+X)
+vec3(1.6,.45,.05)*exp(-h*22.)*f;
c=mix(c,F.rgb,${fog});if(Vn>0)c=hv(c);o=vec4(c*a,a);return;}`;
