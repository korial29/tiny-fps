// The moon's space helmet, after the marine helmets of 90s shooters, not copied: a rounded hard
// shell over the whole head, a dark visor bubble across the face, a pod on each ear, a crest on top
// in the team's colour and a ring at the neck. A pure function of the head joint's place: no state,
// no DOM. Built once per level of detail from mesh.ts's shapes, in the head's own frame (the head
// joint's rest pose, metres, -z the front) and appended where the head is.
import { TAU } from '../shared/physics';
import { GLOW, glow } from './flag';
import { SHINE, aim, dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/**
 * The shell, an ellipsoid in the head joint's frame: its centre and half width, height and depth.
 * The head of the skin (skin.ts, 1.555 to 1.803 m, the head joint at 1.62) lies inside it from the
 * jaw up; its rim is where the shell is cut, under the chin.
 */
export const SHELL = { c: [0, 0.04, 0] as Vec3, r: [0.115, 0.17, 0.14] as Vec3, rim: -0.07 };

/** How far the visor bubble reaches forward of the head's centre, metres: past the nose. */
export const VISOR = { c: [0, 0.03, -0.015] as Vec3, r: [0.1, 0.085, 0.13] as Vec3 };

/**
 * Sides around and steps up each part has, far, near, close: the shell, the visor, the crest, the
 * ear pods and the collar. The far one is about 140 vertices, the near one 550, the close one 850.
 */
const DETAIL = [
  { shell: [8, 2], visor: [5, 2], crest: [4, 2], pod: [0, 0], collar: [0, 0] },
  { shell: [10, 4], visor: [8, 2], crest: [6, 2], pod: [6, 2], collar: [8, 2] },
  { shell: [12, 5], visor: [12, 3], crest: [6, 2], pod: [8, 2], collar: [12, 2] },
];

const WHITE = [0.88, 0.89, 0.92];
const GREY = [0.5, 0.52, 0.56];
const IRON = [0.25, 0.27, 0.3];
const TINT = [0.02, 0.03, 0.06];

/** The profile of a unit dome from the angle a0 to the pole: radius and length along the axis. */
const dome = (a0: number, steps: number): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((TAU / 4 - a0) * i) / steps;
    // The pole is on the axis exactly, not a rounding off it.
    return i == steps ? [0, 1] : [Math.cos(a), Math.sin(a)];
  });

interface Kit {
  shell: number[];
  visor: number[];
  crest: number[];
  pod: number[];
  bead: number[];
  collar: number[];
}

const kits = new Map<number, Kit>();

const kit = (lod: number): Kit => {
  const level = Math.min(lod, 2);
  let k = kits.get(level);
  if (!k) {
    const D = DETAIL[level];
    const white = (p: [number, number][], [n]: number[]) => dress(smooth(p, n), [1, 1, 1]);
    const visor = white(dome(0, D.visor[1]), D.visor);
    // The visor reflects the sky: polished, not flat.
    for (let i = 8; i < visor.length; i += 10) {
      visor[i] = SHINE;
    }
    const tube: [number, number][] = [
      [0.92, 0],
      [1, 0.5],
      [0.92, 1],
    ];
    k = {
      // Below the equator down to the rim, then up over the crown.
      shell: white(dome(Math.asin((SHELL.rim - SHELL.c[1]) / SHELL.r[1]), D.shell[1]), D.shell),
      visor,
      // A spindle laid along the head: a fin.
      crest: white(
        [
          [0, 0],
          [1, 0.5],
          [0, 1],
        ],
        D.crest,
      ),
      pod: white(dome(0, D.pod[1]), D.pod),
      bead: white(dome(0, 1), [5]),
      collar: white(tube, D.collar),
    };
    kits.set(level, k);
  }
  return k;
};

/**
 * Appends the helmet at level of detail `lod` (0 far, 1 near, 2 and up close) on the head joint at
 * `at` turned by `q` (see solve() in rig.ts), in `rgb`, the team's colour (0 to 1): its crest and
 * the beads on the ear pods, which glow. The far helmet is the shell, the visor and the crest.
 */
export const helmet = (out: number[], at: Vec3, q: Quat, rgb: number[], lod: number) => {
  const k = kit(lod);
  const head = (v: Vec3) => turn(q, v);
  /** Places `src` scaled by `s` at `p` in the head's frame, its axis along `to`, its x as near `side` as it can be. */
  const part = (src: number[], p: Vec3, to: Vec3, side: Vec3, s: Vec3, tint?: number[]) => {
    const [r, u, f] = aim(to, side);
    const o = head(p);
    place(
      out,
      src,
      [at[0] + o[0], at[1] + o[1], at[2] + o[2]],
      [head(r), head(u), head(f)],
      [0, 0, 0],
      s,
      tint,
    );
  };
  const [c, [a, b, d]] = [SHELL.c, SHELL.r];
  // The shell: revolved about the head's vertical (the axis along up), wider than deep.
  part(k.shell, c, [0, 1, 0], [1, 0, 0], [a, d, b], WHITE);
  part(k.visor, VISOR.c, [0, 0, -1], [1, 0, 0], VISOR.r, TINT);
  part(k.crest, [0, 0.208, 0.055], [0, 0, -1], [1, 0, 0], [0.014, 0.02, 0.11], rgb);
  if (!lod) {
    return;
  }
  part(k.collar, [0, SHELL.rim - 0.005, 0], [0, 1, 0], [1, 0, 0], [0.098, 0.11, 0.03], IRON);
  for (const x of [-1, 1]) {
    part(k.pod, [0.105 * x, 0.025, 0.012], [x, 0, 0], [0, 1, 0], [0.05, 0.05, 0.03], GREY);
    const from = out.length;
    part(k.bead, [0.129 * x, 0.025, 0.012], [x, 0, 0], [0, 1, 0], [0.016, 0.016, 0.01], rgb);
    glow(out, from, GLOW);
  }
};
