import { TAU } from '../../shared/physics';
import { STRIDE, add, mix, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { CUFF, CUFF_NEAR, CUFF_SIDES } from '../skin';
import { CLAW } from '../xeno';
import { room } from '../verts';
import type { Out } from '../verts';
import { X } from './constants';
import {
  BARE,
  BONES,
  CLAW_L,
  CUP,
  FINGER_R,
  FINGER_SIDES,
  HUNTER_CLAW,
  KNEE,
  KNEE_FIST,
  KNEE_SHARP,
  LANK,
  LENGTH,
  LENGTH_X,
  LITE,
  THICK,
  THICK_X,
  THUMB,
  THUMB_WIDE,
  WRIST,
  clench,
  cross,
  finger,
  phalanges,
  tube,
} from './fingers';
import type { Claws, Ring } from './fingers';
import { PALM_END, palmAt, palmNormal, palmSkin } from './palm';
import { gear, sinews } from './gear';
import { HAND_SKIN, HIDE_TO, hideAt } from './hide';
import { THENAR, mound } from './mound';
import { along } from './reach';
import { HAND_SPOT, handSpots } from './spots';
import { webs } from './webs';
import { weld } from './weld';
import type { Root } from './weld';

/**
 * A gloved hand at the wrist `end`: the fingers along `f`, the back of the hand along `u`, the thumb
 * toward `th` (unit vectors). `curl` runs from 0, a flat open hand with the fingers spread, to 1, a
 * fist. The palm is one tube that starts as the sleeve's cuff ends and spreads to the knuckles,
 * and each finger and the thumb one tube from there, bent at its joints: no solid meets another
 * in a line, and the normals are smooth all over. A tactical glove (the user, 2026-11-09: more
 * detail): fingerless from halfway along the middle phalanx, the bare tips in `bare` with a nail
 * each; a hard shell over the knuckles, a padded plate on the back, a strap round the wrist.
 */
export const hand = (
  out: Out,
  end: Vec3,
  f: Vec3,
  u: Vec3,
  th: Vec3,
  curl: number,
  tint: number[],
  point = 0,
  push = 0,
  to?: Vec3,
  bare = tint,
  /** 0 to 1: the thumb out of the fist to CUP, up the side of what the palm carries. */
  cup = 0,
  /** A near runner's hand: fewer sides, on the near sleeve's cuff, and none of the glove's small parts. */
  lite = false,
  /** The marine's: lit buttons on the strap round the wrist (WRIST_LIGHTS). */
  lights = false,
  /** The xenomorph's claws on the fingertips (Grip). */
  claws: Claws = false,
  /** Its size: the xenomorph's grows from the wrist over 4 cm, hers is smaller (hands()). */
  grow = 1,
  /** How far the fingers fan out, times an open hand's (phalanges()). */
  spread = 1,
  /** How far the fingers' last bones bend further, radians (phalanges()). */
  hook = 0,
) => {
  // A hand is built in its own space, the same as long as nothing it is made of changes (a grip
  // held, the hand at rest): some ten thousand vertices that are then only carried to the wrist.
  // Its numbers to a billionth: a grip's curl eased onto its 0.9 wanders in its last bits frame
  // to frame, and every frame built the hand again.
  [curl, point, push, cup] = [curl, point, push, cup].map(tidy);
  to &&= to.map(tidy) as Vec3;
  const key = `${claws} ${+lite} ${+lights} ${curl} ${point} ${push} ${to} ${cup} ${tint} ${bare} ${+(bare === tint)} ${grow} ${spread} ${hook}`;
  let m = BUILT.get(key);
  if (!m) {
    if (BUILT.size >= KEPT) {
      BUILT.clear();
    }
    BUILT.set(
      key,
      (m = shape(curl, tint, point, push, to, bare, cup, lite, lights, claws, spread, hook)),
    );
    // Grown about the wrist, the origin here: the claws' from the wrist's cuff on.
    for (let i = 0; grow != 1 && i < m.length; i += 10) {
      const t = claws ? Math.min(Math.hypot(m[i], m[i + 1], m[i + 2]) / 0.04, 1) : 1;
      const g = 1 + (grow - 1) * t * t * (3 - 2 * t);
      m[i] *= g;
      m[i + 1] *= g;
      m[i + 2] *= g;
    }
  }
  // Hand space (x toward the thumb, y the back, z toward the fingers), a point and a direction, to the world.
  let o = out.length;
  const dst = room(out, (m.length / 10) * STRIDE);
  for (let i = 0; i < m.length; i += 10, o += STRIDE) {
    const x = m[i];
    const y = m[i + 1];
    const z = m[i + 2];
    const a = m[i + 3];
    const b = m[i + 4];
    const c = m[i + 5];
    dst[o] = end[0] + th[0] * x + u[0] * y + f[0] * z;
    dst[o + 1] = end[1] + th[1] * x + u[1] * y + f[1] * z;
    dst[o + 2] = end[2] + th[2] * x + u[2] * y + f[2] * z;
    dst[o + 3] = th[0] * a + u[0] * b + f[0] * c;
    dst[o + 4] = th[1] * a + u[1] * b + f[1] * c;
    dst[o + 5] = th[2] * a + u[2] * b + f[2] * c;
    dst[o + 6] = m[i + 6];
    dst[o + 7] = m[i + 7];
    dst[o + 8] = m[i + 9];
    dst[o + 9] = m[i + 8];
  }
  out.length = o;
};

/** A number to a billionth. */
const tidy = (x: number) => Math.round(x * 1e9) / 1e9;

/** The hands built in their own space, by what they are made of; forgotten all at once past KEPT (a grip closing makes a new one a frame). */
const BUILT = new Map<string, number[]>();
const KEPT = 128;
/** The Hunter's nail: the share of the last phalanx its bed covers, how far it goes on past the fingertip (metres) and how much of that it curves toward the palm. */
const NAIL = { bed: 0.62, free: 0.02, curve: 0.22, sides: 6 };
/** Where the four fingers leave the palm, index to little: across the hand, and how far along it, metres. */
const ROOT_X = [0, 1, 2, 3].map(i => 0.034 - 0.0225 * i);
const KNUCKLES = 0.092;
/** A tendon on the back of a bare hand: how far it stands out at the knuckles and its half width, metres. */
const TENDON = [0.002, 0.0048];
/** How far the tendon to the finger rooted at `at` across the hand stands out of its back at (x, z): a line from the middle of the wrist, fanning out to the knuckle and rising toward it. */
const tendon = (x: number, z: number, at: number) => {
  const u = Math.min(Math.max(z / KNUCKLES, 0), 1);
  return (
    TENDON[0] * (0.2 + 0.8 * u) * Math.exp(-0.5 * ((x - at * (0.3 + 0.7 * u)) / TENDON[1]) ** 2)
  );
};

/** hand()'s vertices in the hand's own space: position, normal, colour and layer, ten numbers each. */
const shape = (
  curl: number,
  tint: number[],
  point: number,
  push: number,
  to: Vec3 | undefined,
  bare: number[],
  cup: number,
  lite: boolean,
  lights: boolean,
  clawStyle: Claws = false,
  spread = 1,
  hook = 0,
): number[] => {
  const claws = clawStyle === true;
  const shortClaws = clawStyle === 'short';
  // A spread hand's joints bend sharply (the user, 2026-11-23), the others' softly.
  // A fist's too, the more the further past a grip it closes.
  const knee = spread > 1 ? KNEE_SHARP : KNEE + (KNEE_FIST - KNEE) * clench(curl);
  // A fist's joints are pressed flat inside (finger()'s `crease`).
  const fold = spread > 1 ? 0 : clench(curl);
  /** How spread the hand is, 0 to 1 (fully by a spread of 5): its thumb, mound and index follow. */
  const wide = Math.min(1, Math.max(0, (spread - 1) / 4));
  const out: number[] = [];
  const [FS, CS] = lite ? [4, CUFF_NEAR] : [FINGER_SIDES, CUFF_SIDES];
  let paint = (_: number) => tint;
  let layer = -1;
  const hide = clawStyle === 'short' && !lite;
  /** A point and a direction in hand space, in `paint` of its ring. */
  /** hideAt()'s two numbers for each vertex of the Hunter's skin: worked out once a vertex, not once a corner of each triangle round it (its sines were half of the hand's build). */
  const dyed = new Map<Vec3, number[]>();
  const put = (p: Vec3, [m, n, w]: Vec3, r = 0) => {
    const x = p[0];
    const y = p[1];
    const z = p[2];
    const c = paint(r);
    // The Hunter's bare skin takes his hide's gradient and grain (hideAt()), and the shader's skin
    // pass (HAND_SKIN): pores and a fine grain, on its place in the hand. His nails and spots keep
    // their own colour.
    if (hide && c === tint) {
      let dye = dyed.get(p);
      if (!dye) {
        dye = [0, 1];
        hideAt(dye, x, y, z);
        dyed.set(p, dye);
      }
      const l = dye[0];
      const k = dye[1];
      out.push(
        x,
        y,
        z,
        m,
        n,
        w,
        (c[0] + (HIDE_TO[0] - c[0]) * l) * k,
        (c[1] + (HIDE_TO[1] - c[1]) * l) * k,
        (c[2] + (HIDE_TO[2] - c[2]) * l) * k,
        HAND_SKIN,
      );
      return;
    }
    out.push(x, y, z, m, n, w, c[0], c[1], c[2], layer);
  };
  // The palm starts as the sleeve's cuff does, vertex for vertex, its normals leaning to the fingers.
  const PALM = [
    [WRIST[1] - CUFF[0], CUFF[1] - WRIST[0], CUFF[3], CUFF[4]],
    // The heel of the hand narrower than the knuckles and thick, the palm thinner toward the fingers
    // (the user, 2026-11-17: it was a mitt, as wide at the wrist as at the knuckles).
    ...(claws
      ? [
          [0.025, 0, 0.043, 0.024],
          [0.06, -0.002, 0.046, 0.019],
        ]
      : [
          // The back of the hand runs down to the level of the fingers' backs at the knuckles (the
          // user, 2026-11-26): a fist's back, knuckle and first phalanx make a square corner, with
          // no step down from the hand to the finger. The palm's side is where it was.
          [0.025, -0.00225, 0.038, 0.02125],
          [0.06, -0.0049, 0.045, 0.0144],
        ]),
    claws ? [0.092, -0.004, 0.046, 0.0125] : [0.092, -0.00485, 0.046, 0.01165],
    [0.104, -0.004, 0, 0],
  ];
  const palm = ([z, y, a, b]: number[], k = 1): Ring => [
    [0, y, z],
    [a * k, 0, 0],
    [0, b * k, 0],
  ];
  // The palm up to WELD; from there a skin welds it to the four fingers' roots (weld(), below).
  // A whole hand's palm has a man's flesh on it (palmSkin()), a near runner's is a plain tube.
  // The xenomorph's keeps half of it: a lean hand.
  const FLESH_K = claws ? 0.5 : 1;
  // The Hunter's bare hand shows its tendons on its back (TENDON), in a skin twice as fine round.
  const tendons = shortClaws
    ? (x: number, z: number) =>
        Math.max(
          tendon(x, z, ROOT_X[0]),
          tendon(x, z, ROOT_X[1]),
          tendon(x, z, ROOT_X[2]),
          tendon(x, z, ROOT_X[3]),
        ) -
        TENDON[0] * 0.35
    : undefined;
  const skin = lite ? [] : palmSkin(PALM, CS, put, 0.75, FLESH_K, tendons);
  if (lite) {
    tube(
      [PALM[0], PALM[2]].map(r => palm(r)),
      CS,
      put,
      0.75,
    );
  }
  // A whole glove (`bare` the glove's own colour, a space suit's) has no nails showing.
  const nail = bare === tint ? tint : mix(bare as Vec3, [0.98, 0.74, 0.7], 0.4);
  /** A finger's tube, its glove to ring BARE and bare beyond, and the nail on its tip. */
  const digit = (
    p: Vec3,
    ds: [Vec3, Vec3, Vec3],
    l: number,
    r: number,
    t: Vec3,
    from = 1,
    /** Its claw's length against CLAW_L, how hard it hooks down and its root's width (the thumb's: short, curled, fine). */
    [reach, hook, slim] = [1, 1, 1],
  ) => {
    paint = k => (k < BARE ? tint : bare);
    // From where it leaves the palm, ring `from`: a weld skins its root.
    // The thumb's joints are not a fist's: no crease pressed in them.
    const all = finger(p, ...ds, l, r, t, +claws, knee, from == 1 ? fold : 0);
    const ks = lite
      ? [from, ...LITE.filter(k => k > from), all.length - 1]
      : all.map((_, k) => k).slice(from);
    tube(
      ks.map(k => all[k]),
      FS,
      (q, n, k) => put(q, n, ks[k]),
    );
    const d = ds[2];
    const j2 = along(along(p, ds[0], BONES[0] * l), ds[1], BONES[1] * l);
    const y = unit(cross(d, X));
    const x = cross(y, d);
    if (shortClaws) {
      // The Hunter's nails (the user, 2026-11-26: nails, long and pointed, not cones): a thin
      // plate arched across the finger, out of the skin on the back of the last phalanx, along it
      // to the tip, then free past it and drawn to a point, curving a little toward the palm.
      paint = () => HUNTER_CLAW;
      const l3 = BONES[2] * l;
      const [bed, free] = [NAIL.bed * l3, NAIL.free * reach];
      const ring = (k: number, wide: number, thick: number): Ring => {
        // `k` runs 0 to 1 over the nail's bed, the finger's own taper under it, then 1 to 2 past the tip.
        const out = Math.max(k - 1, 0);
        const c = add(
          along(j2, d, l3 - bed + bed * Math.min(k, 1) + free * out),
          y.map(
            v => v * (r * (0.5 - 0.1 * Math.min(k, 1)) - free * NAIL.curve * hook * out * out),
          ) as Vec3,
        );
        const t = unit(add(d, y.map(v => -v * 2 * NAIL.curve * hook * out) as Vec3));
        const b = unit(cross(t, x));
        return [
          c,
          x.map(v => v * r * wide * slim) as Vec3,
          b.map(v => v * r * thick * slim) as Vec3,
        ];
      };
      tube(
        // Its first ring under the skin: no open rim behind the nail to see into.
        [
          ring(0, 0.3, 0.1),
          ring(0.12, 0.52, 0.3),
          ring(0.5, 0.58, 0.34),
          ring(1, 0.52, 0.3),
          ring(1.3, 0.42, 0.24),
          ring(1.6, 0.27, 0.16),
          ring(1.85, 0.12, 0.08),
          ring(2, 0, 0),
        ],
        // A thin plate: six sides are enough round it.
        lite ? 4 : NAIL.sides,
        (q, n) => put(q, n),
      );
      return;
    }
    if (clawStyle) {
      // A claw for the nail: from the back of the last phalanx, out past the tip and hooked down
      // toward the palm, tapering to a point.
      const length = (shortClaws ? 0.022 : CLAW_L) * reach;
      paint = () => (shortClaws ? HUNTER_CLAW : CLAW);
      const ring = (k: number, w: number): Ring => {
        const c = add(
          // On the finger's own axis, from just before its tip: one line from the finger into the claw.
          along(j2, d, BONES[2] * l * 0.68 + length * k * (1 - 0.25 * (hook - 1) * k)),
          y.map(v => v * (r * (shortClaws ? 0.38 : 0.04) - length * 0.45 * hook * k * k)) as Vec3,
        );
        const t = unit(add(d, y.map(v => -v * 0.9 * hook * k) as Vec3));
        const b = unit(cross(t, x));
        return [c, x.map(v => v * r * w * slim) as Vec3, b.map(v => v * r * w * slim) as Vec3];
      };
      // Flush on the finger at its root, then swelling clear of the fingertip inside it.
      tube(
        // Its first ring inside the finger: no open rim behind the claw to see into.
        [
          ring(0, 0.35),
          ring(0.04, 0.66),
          ring(0.16, 0.74),
          ring(0.4, 0.56),
          ring(0.7, 0.3),
          ring(1, 0),
        ],
        lite ? 4 : FS,
        (q, n) => put(q, n),
      );
      return;
    }
    if (lite) {
      return;
    }
    paint = () => nail;
    // The nail: an oval on the back of the last phalanx, toward its tip, a hair out of it.
    const c = add(along(j2, d, BONES[2] * l * 0.6), y.map(v => v * (r * 0.79 + 0.0003)) as Vec3);
    const rim = (k: number): Vec3 =>
      add(
        c,
        add(
          x.map(v => v * r * 0.42 * Math.cos((k * TAU) / 8)) as Vec3,
          d.map(v => v * 0.005 * Math.sin((k * TAU) / 8)) as Vec3,
        ),
      );
    for (let k = 0; k < 8; k++) {
      for (const q of [c, rim(k), rim(k + 1)]) {
        put(q, y);
      }
    }
  };
  /** Each finger's ring where it leaves the palm: its middle and its vertices, as finger() places them. */
  const roots: Root[] = [];
  const nexts: Ring[] = [];
  /** Each finger's rings as drawn (finger()). */
  const drawn: Ring[][] = [];
  for (let i = 0; i < 4; i++) {
    // `point` straightens the index out of the fist, to press a button.
    const ds = phalanges(i ? curl : curl * (1 - point), i, spread, hook);
    const at: Vec3 = [ROOT_X[i], -0.004, KNUCKLES];
    // A spread hand's lifted first bones leave the palm along it, not tilted with them: no dip
    // behind their root (the user, 2026-11-23).
    const t = unit(add(ds[0], [0, 0, 1 + 3 * wide]));
    // The xenomorph's long and lean (the user's picture, 2026-11-17: a skeleton's hand).
    const [fl, fr] = claws
      ? [0.04 * LENGTH_X[i] * LANK, FINGER_R * THICK_X[i]]
      : [0.04 * LENGTH[i], FINGER_R * THICK[i]];
    digit(at, ds, fl, fr, t);
    const rings = finger(at, ...ds, fl, fr, t, +claws, knee, fold);
    drawn.push(rings);
    // The root ring's own middle: its knuckle lifts it off `at`.
    const [c1, x, y] = rings[1];
    // The finger's next ring as it is drawn (digit()), for its root's normals (seamless, below).
    nexts.push(rings[lite ? LITE[0] : 2]);
    roots.push([
      c1,

      Array.from({ length: FS }, (_, k) => {
        const a = (k * TAU) / FS;
        return [0, 1, 2].map(d => c1[d] + x[d] * Math.cos(a) + y[d] * Math.sin(a)) as Vec3;
      }),
      unit(y),
      t,
    ]);
  }
  // The weld (the user, 2026-11-09: one piece, no joint): the palm's last ring zipped to the outline
  // of the four roots (their vertices that are not inside a neighbour), by angle round the palm's
  // axis; between two fingers it dips into a web.
  paint = () => tint;
  weld(put, lite, CS, FS, PALM, skin, roots, nexts, drawn);
  if (!lite) {
    webs(drawn, FS, put);
  }
  // The Hunter's hide goes on over his bare hands: its spots, along their edges.
  if (shortClaws && !lite) {
    paint = () => HAND_SPOT;
    handSpots(
      (a, z) => [palmAt(PALM, a, z, FLESH_K, tendons), palmNormal(PALM, a, z, FLESH_K, tendons)],
      [PALM[0][0], PALM_END],
      drawn,
      put,
    );
    paint = () => tint;
  }
  // `push` (0 to 1) reaches the thumb's tip out along `to`, onto the katana's button.
  // A spread hand (`spread` past 1, the Hunter's disc) swings its thumb out to the side as well,
  // fully by a spread of 5 (`wide`).
  const [d1, d2] = THUMB.map(([open, fist], k) => {
    const d = unit(mix(unit(mix(unit(mix(open, fist, curl)), CUP[k], cup)), THUMB_WIDE[k], wide));
    return k && to ? unit(mix(d, to, push)) : d;
  });
  const tp: Vec3 = [0.032, -0.01, 0.025];
  // The thumb's thickness, the spread of its foot on the palm and its mound's height: the
  // xenomorph's as they were.
  // A spread hand's thumb (the Hunter's on his disc, the user 2026-11-23) is shorter, thicker at
  // its foot, on a fuller mound.
  const [tr, SPREAD, ball] = claws ? [0.0124, 1.7, 0.003] : [0.0116, 2, 0.0065];
  const [TL, TR, MOUND] = [
    0.037 * (1 - 0.12 * wide),
    tr * (1 + 0.1 * wide),
    ball * (1 + 0.5 * wide),
  ];
  digit(tp, [d1, d2, d2], TL, TR, d1, THENAR, [0.6, 2.2, 0.7]);
  // The thumb's mound (the user, 2026-11-09: the thumb shows the most, holding a gun): from a
  // footprint on the palm round its root, its ring there pushed out onto the palm's surface, a
  // skin swells into the thumb halfway along its first bone. One piece with the palm.
  paint = () => tint;
  mound(put, {
    // As the thumb is drawn (digit()): the xenomorph's thin bone, or the mound ended in a step.
    rings: finger(tp, d1, d2, d2, TL, TR, d1, +claws, knee),
    tp,
    spread: SPREAD,
    swell: MOUND,
    wide,
    lite,
    sides: FS,
    palm: PALM,
    flesh: FLESH_K,
    tendons,
  });
  // The xenomorph's tendons over the back of its hand: each from the wrist straight to its
  // finger's root and on along the finger's first bone (the user, 2026-11-17: in line with it).
  if (claws && !lite) {
    paint = () => tint.map(c => c * 1.5);
    sinews(
      put,
      PALM,
      roots,
      (f: number) => phalanges(f ? curl : curl * (1 - point), f, spread, hook)[0],
    );
  }
  // No glove's shell, plate or strap on a near hand, nor on the xenomorph's bare one.
  if (lite || clawStyle) {
    return out;
  }
  gear(
    put,
    PALM,
    palm,
    tint,
    lights,
    CS,
    f => (paint = f),
    l => (layer = l),
  );
  return out;
};
