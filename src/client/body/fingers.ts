import { CUTS } from '../../shared/constants';
import { TAU } from '../../shared/physics';
import type { PlayerState } from '../../shared/types';
import { ease, span } from '../gun';
import { add, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, rest, solve } from '../rig';

import { X } from './constants';
import { along } from './reach';

/** The unit vector toward a wall on each SIDE, on the floor plane. */
export const TOWARD = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Finger thicknesses against FINGER_R, index to little: the little finger is thinner. */
export const THICK = [1, 1.02, 0.95, 0.82];
/** The xenomorph's, as the fingers were before the man's were reworked (2026-11-17): its hand was tuned on them. */
export const THICK_X = [1, 1, 0.96, 0.86];
export const LENGTH_X = [1, 1.1, 1, 0.82];
/** Finger lengths against 4 cm, index to little. */
export const LENGTH = [0.92, 1.08, 1, 0.8];
/** The thumb's two segments when the palm carries the rifle's handguard: closed on its near side, along it (the user, 2026-11-10). */
export const CUP: Vec3[] = [unit([0.7, -0.7, 0]), unit([0.9, -0.4, 0.1])];
/** The thumb's two segments open and in a fist, as directions in the hand (x toward the thumb). */
/** The thumb's two bones swung out from the palm, in the hand's space: a hand spread wide (shape()'s `spread`). */
export const THUMB_WIDE: Vec3[] = [
  [1, -0.05, 0.08],
  [0.8, -0.4, 0.4],
];
export const THUMB: [Vec3, Vec3][] = [
  [
    [0.55, -0.2, 0.8],
    [0.2, -0.75, 0.6],
  ],
  [
    [0.4, -0.1, 0.9],
    [-0.55, -0.5, 0.65],
  ],
];
/** The woman's hand to the man's, about the wrist (SCALE in skin.ts has her glove's). */
export const HAND_F = 0.92;
/** The xenomorph's hands against the man's, about the wrist. */
export const CLAW_HAND = 1.3;

/** Sides around a finger (6 until the user, 2026-11-09: more detail on the hands). */
export const FINGER_SIDES = 10;
/** The wrist joint at rest: the cuff's ring is placed from it. */
export const WRIST = solve(rest()).pos[J.HAND_R];

/** A ring of a tube: its centre and its two half axes. */
export type Ring = [c: Vec3, x: Vec3, y: Vec3];

export const cross = ([a, b, c]: Vec3, [d, e, f]: Vec3): Vec3 => [
  b * f - c * e,
  c * d - a * f,
  a * e - b * d,
];

/**
 * Appends, through `put(position, normal)`, the tube through `rings`: `sides` around, the normals
 * smooth along it and around it (from the rings either side), a ring of no extent a point that
 * closes the tube. The first ring's normals are its radial ones with `lean` along the tube, to meet
 * the surface it grows out of.
 */
export const tube = (
  rings: Ring[],
  sides: number,
  put: (p: Vec3, n: Vec3, r: number) => void,
  lean?: number,
) => {
  const P = rings.map(([c, x, y]) =>
    x.some(Boolean)
      ? Array.from({ length: sides }, (_, i) => {
          const [s, k] = [Math.sin((i * TAU) / sides), Math.cos((i * TAU) / sides)];
          return [0, 1, 2].map(d => c[d] + x[d] * k + y[d] * s) as Vec3;
        })
      : [c],
  );
  /** Vertex i of ring r in a grid, the rings clamped and a point the same for every i. */
  const at = (G: Vec3[][], r: number, i: number) => {
    const row = G[Math.min(Math.max(r, 0), G.length - 1)];
    return row[(i + row.length) % row.length];
  };
  const N = P.map((row, r) =>
    row.map((_, i): Vec3 => {
      if (lean != null && !r) {
        const a = (i * TAU) / sides;
        return unit([Math.cos(a), Math.sin(a), lean]);
      }
      // A point has no ring to go round: its normal is the way the tube runs into it.
      if (row.length < 2) {
        return unit(sub(row[0], rings[r - 1][0]));
      }
      return unit(
        cross(sub(at(P, r, i + 1), at(P, r, i - 1)), sub(at(P, r + 1, i), at(P, r - 1, i))),
      );
    }),
  );
  for (let r = 1; r < P.length; r++) {
    for (let i = 0; i < sides; i++) {
      const [p, q, a, b] = [
        [r - 1, i],
        [r - 1, i + 1],
        [r, i + 1],
        [r, i],
      ];
      for (const t of P[r].length > 1
        ? [
            [p, q, a],
            [p, a, b],
          ]
        : [[p, q, a]]) {
        for (const [j, k] of t) {
          put(at(P, j, k), at(N, j, k), j);
        }
      }
    }
  }
};

/** The xenomorph's fingers against a man's: long (the user's picture, 2026-11-17). */
export const LANK = 1.28;
/** The curl the xenomorph's fingers close to at most. */
export const RAKE = 0.35;
/** How far each of the xenomorph's claws reaches past the root of its last phalanx, metres. */
export const CLAW_L = 0.042;
export const HUNTER_HAND: Vec3 = [0.36, 0.31, 0.21];
/** Where the back of the Hunter's right wrist faces, in the view, with the blades out: up and well over to the right. */
export const CLAW_ROLL: Vec3 = [0.8, 0.45, -0.4];

/**
 * A claw's rake in the own view, by its share of the swing: the striking hand (x out on its own
 * side, y up, z ahead, metres from the eye) raised high and out, then slashed down and across to
 * the other side, low and further out: up over the swing's first fifth, across by two fifths.
 */
export const [RAKE_UP, RAKE_DOWN]: Vec3[] = [
  [0.38, 0.12, 0.4],
  [-0.2, -0.2, 0.58],
];

/** The Hunter's left hand in its guard while the blades are out (view space, mirrored): low left, ahead. */
export const GUARD: Vec3 = [0.3, -0.24, 0.44];
/**
 * The Hunter's left wrist with the shoulder cannon out (view space, mirrored): low on the left,
 * close, the arm bent toward the eye, the computer on the forearm facing up, the view above it
 * clear (the user, 2026-11-24, after a reference shot).
 */
export const COMPUTER: Vec3 = [0.065, -0.195, 0.435];
/** The right forearm and hand's line to the key (view space): in from the right, nearly level, a little ahead. */
export const POKE: Vec3 = [-0.95, 0.15, 0.25];
/** How much of a stride's sway the trunk and the shoulders lose with the cannon out. */
export const CANNON_STEADY = 0.8;
/** Where its elbow goes then (view space, mirrored): out to the left, down and back. */
export const COMPUTER_POLE: Vec3 = [1, -0.5, -0.6];
/** How closed that guard hand is: open, the fingers a little bent. */
export const GUARD_CURL = 0.15;
/** The guard hand thrown out ahead through a cut's wind-up, and pulled in to the belly on its strike. */
export const LUNGE_L: Vec3 = [0.36, -0.1, 0.62];
export const TUCK: Vec3 = [0.1, -0.24, 0.4];
/**
 * How far the Hunter's left hand is out ahead (LUNGE_L) and in at the belly (TUCK), 0 to 1 each, at
 * `prog` of his cut (-1: none): out through the wind-up to the strike, then in within a tenth of
 * the cut, held, and back to the guard over its last quarter.
 */
export const counter = (p: Pick<PlayerState, 'cut'>, prog: number): [number, number] => {
  if (prog < 0) {
    return [0, 0];
  }
  const c = CUTS[p.cut ?? 0] ?? CUTS[0];
  const st = c.strike / c.ticks;
  const snap = ease(span(prog, st, st + 0.1));
  const back = 1 - ease(span(prog, 0.75, 1));
  return [ease(span(prog, 0, st)) * (1 - snap), snap * back];
};
export const HUNTER_CLAW: Vec3 = [0.7, 0.61, 0.44];
export type Claws = boolean | 'short';
/** A finger's half thickness at its root (11.2 mm until the fingers closed round a grip, 2026-11-09). */
export const FINGER_R = 0.01;
/** The lengths of a finger's three phalanges against `l`, the root one first. */
export const BONES = [1, 0.62, 0.42];
/** The ring of a finger from which on it is bare: the glove's fingers end 60 % along the middle phalanx. */
export const BARE = 10;
/** The rings of a finger a near runner's hand keeps past its root (hand()'s `lite`): the knuckle's bend, the glove's edge, the last bend, the tip. */
export const LITE = [7, 10, 14];

/**
 * The rings of a finger, in the hand's space: from `p` along `d1`, `d2` then `d3`, its three
 * phalanges (BONES of `l`), `r` thick at the root, the first ring across `t`. Each bend is a curve
 * through the joint, not a corner, so that a fist keeps a round knuckle. The glove ends at ring
 * BARE in a rolled edge; the skin goes on to the tip.
 */
/** How far a joint's curve reaches along each bone (finger()'s `knee`): a wide, soft knuckle. */
export const KNEE = 0.6;
/** A spread hand's (the Hunter's disc, the user 2026-11-23): sharper joints. */
export const KNEE_SHARP = 0.25;

/** How much of a finger's half thickness a fist presses out of the inside of each of its joints. */
export const CREASE = 0.6;
/** A man's finger of FINGER_R, metres: the flesh under a phalanx, the head of a joint on its back, and what a joint adds to its half width. */
export const [FLESH, JOINT_HEAD, JOINT_WIDE] = [0.0014, 0.0011, 0.0007];
/** How far the head of a knuckle stands out of the back of the hand, metres: on a straight finger, and what a bend adds for each unit of 1 - cos of half of it. */
export const KNUCKLE = [0.001, 0.003];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const finger = (
  p: Vec3,
  d1: Vec3,
  d2: Vec3,
  d3: Vec3,
  l: number,
  r: number,
  t: Vec3,
  /** 0 to 1: a skeleton's finger (the xenomorph's), thin bones between swollen knuckles, a fine tip. */
  bony = 0,
  /** How far each joint's curve reaches along the bones, a share of them: less, a sharper joint. */
  knee = KNEE,
  /** 0 to 1: a fist's finger, the flesh inside each joint pressed flat (CREASE) where a sharp bend would fold the skin through itself. */
  crease = 0,
): Ring[] => {
  const [l1, l2, l3] = BONES.map(k => k * l);
  const shaft = 1 - 0.34 * bony;
  const oval = 0.93 + 0.07 * bony;
  const taper = 1 - bony;
  const j1 = along(p, d1, l1);
  const j2 = along(j1, d2, l2);
  /** A ring at `c` across `d`, `k` thick, `h` of that from the palm side to the back. */
  const ring = (c: Vec3, d: Vec3, k: number, h = 1, rise = 0, pad = 0, w = 1): Ring => {
    const [t, y] = [unit(d), unit(cross(d, X))];
    // A man's finger is a little wider than it is deep (the user, 2026-11-17: more real hands).
    // `rise` lifts its back alone, the palm side where it was: the head of a knuckle. `pad` swells
    // its palm side alone: the flesh under a phalanx. `w` widens it alone.
    return [
      add(c, y.map(v => (v * (rise - pad)) / 2) as Vec3),
      cross(y, t).map(v => v * r * k * w) as Vec3,
      y.map(v => v * (r * k * h * oval + (rise + pad) / 2)) as Vec3,
    ];
  };
  // A man's finger (the user, 2026-11-26: a more real hand): flesh under each phalanx, and at each
  // joint a head on the back, a crease under it and more width. The xenomorph's bones have none.
  const [PAD, KNOB, WIDE] = [FLESH * (1 - 0.7 * crease), JOINT_HEAD, JOINT_WIDE].map(
    v => v * taper * (r / FINGER_R),
  );
  /**
   * The bend from `a` to `b` round the joint `j`, a curve on it (its ends along the two bones, no
   * kink where it meets them): four rings, `k0` to `k1` thick.
   */
  const bend = (a: Vec3, j: Vec3, b: Vec3, k0: number, k1: number, flat = 0, head = 1) => {
    const c = j;
    return [1 / 5, 2 / 5, 3 / 5, 4 / 5].map(k =>
      ring(
        mix(mix(a, c, k), mix(c, b, k), k),
        add(mix(sub(c, a), [0, 0, 0], k), mix(sub(b, c), [0, 0, 0], 1 - k)),
        // A knuckle swells a little over its joint; a skeleton's, a lot.
        (k0 + (k1 - k0) * k) * (shaft + (0.06 + 0.18 * bony) * Math.sin(Math.PI * k)),
        // Flatter across the joint, most at its middle: the inside of the bend does not fold.
        1 - flat * Math.sin(Math.PI * k),
        KNOB * head * Math.sin(Math.PI * k),
        -CREASE * crease * r * Math.sin(Math.PI * k),
        1 + (WIDE / r) * head * Math.sin(Math.PI * k),
      ),
    );
  };
  // The first bend from 60 % back along the first bone to 60 % along the second: a wide knuckle,
  // its inside not folded.
  const [a1, mid, b2] = [
    along(j1, d1, -knee * l1),
    along(j1, d2, knee * l2),
    along(j2, d3, Math.min(knee, 0.5) * l3),
  ];
  // The second bend starts past the glove's edge, or closer to its joint on a sharp one.
  const s2 = along(j1, d2, Math.max(knee * l2 + 0.003, (1 - knee) * l2));
  // The root sunk 12 mm in the palm and flared, a fillet that leaves it at a slant with no seam
  // (the user, 2026-11-09).
  // The knuckle (the user, 2026-11-26: a more real hand): the first bone turns out of the palm
  // round its joint over two rings between the root and the bone, and the head of the joint stands
  // out of the back of the hand, further the more the finger is bent (KNUCKLE).
  const rise = KNUCKLE[0] + KNUCKLE[1] * (1 - dot3(unit(d1), unit(t)));
  return [
    // The xenomorph's thin finger leaves the palm thinner too: no step down just past its root.
    ring(along(p, unit(t), -0.012), t, 1.35 * (1 - 0.2 * bony)),
    ring(p, t, 1.1 * (1 - 0.2 * bony), 1, rise),
    ...[
      [0.3, 0.7, 1.06, 0.8],
      [0.68, 2.6, 1.01, 0.4],
    ].map(([f, turn, k, up]) =>
      ring(
        along(p, d1, f * (1 - knee) * l1),
        add(unit(t), unit(d1).map(v => v * turn) as Vec3),
        k * (1 - 0.2 * bony),
        1,
        rise * up,
      ),
    ),
    // It tapers from its root to its tip (the user, 2026-11-17: they were tubes), a human one.
    ring(a1, d1, shaft * (1 - 0.04 * taper), 1, 0, PAD),
    ...bend(a1, j1, mid, 0.98 - 0.02 * taper, 0.95 - 0.05 * taper, 0.22),
    // The glove's edge, rolled, then the bare finger a hair beyond it.
    ring(mid, d2, (0.95 - 0.05 * taper) * shaft, 1, 0, PAD * 0.8),
    ring(along(mid, d2, 0.003), d2, (0.88 - 0.05 * taper) * shaft, 1, 0, PAD * 0.8),
    ...bend(s2, j2, b2, 0.86 - 0.04 * taper, 0.84 - 0.07 * taper, 0, 0.6),
    // The xenomorph's last phalanx as wide as its claw's root, which goes on from it.
    ring(b2, d3, (0.82 - 0.06 * taper) * (1 - 0.24 * bony), 1, 0, PAD),
    // Its tip thinner inside the claw, which sheathes it: none of it through the claw.
    // A round tip: the pad of the finger, not a cone.
    ...(bony
      ? [ring(along(j2, d3, l3 - 0.001), d3, 0.7 * (1 - 0.4 * bony))]
      : [
          ring(along(j2, d3, l3 - 0.003), d3, 0.72, 1, 0, PAD * 0.8),
          ring(along(j2, d3, l3 + 0.003), d3, 0.46),
        ]),
    ring(along(j2, d3, l3 + 0.006), d3, 0),
  ];
};

/**
 * The directions of the three phalanges of the finger i (index to little) at `curl`, in the hand's
 * space. At 0.9, the curl of every grip, they go round a handle 2.5 cm thick 7.8 cm along the
 * fingers from the wrist and 2.2 cm toward the palm, their tips back at the heel of the palm (the
 * user, 2026-11-09: the fingers stood off the katana's grip).
 */
/**
 * The share of phalanges()' `hook` each joint takes: the knuckle (below 0, the first bone lifts,
 * the user 2026-11-23), the middle joint, the last.
 */
const HOOK = [-0.04, 0.6, 0.44];
/** The share of phalanges()' extra `spread` each bone turns by: the first less, so its root does not kink. */
const FAN = [0.35, 1, 1.1];
/** A spread hand's little finger fanned out only this share as far as the rule would: it went off too far to the right. */
const LITTLE_IN = 0.55;
/** A spread hand's thumb mound, from its foot on the palm to the thumb's root, in this many steps (others 2). */
export const MOUND_RINGS = 4;

/** A fist's joints, radians: the first bone off the line of the hand, the middle joint's bend and the last's. */
export const FIST_JOINTS = [1.62, 1.72, 1.3];
/** How far past a grip's curl toward a fist `curl` is, 0 to 1. */
export const clench = (curl: number) => Math.min(Math.max((curl - 0.9) / 0.1, 0), 1);
/** How far a fist's joints' curves reach along the bones (finger()'s `knee`): its phalanges straight, its corners square. */
export const KNEE_FIST = 0.5;

export const phalanges = (curl: number, i: number, spread = 1, hook = 0): [Vec3, Vec3, Vec3] => {
  // `spread` times the open hand's fan: wider apart, as on the Hunter's disc. What it adds turns
  // the first bone only partly, the rest further out (FAN), so the finger leaves the knuckle
  // without a kink.
  const base = -(i - 1.5) * 0.08 * (1 - curl);
  // A spread hand's little finger turns in toward the ring finger (LITTLE_IN, the user 2026-11-23).
  const little = spread > 1 && i === 3 ? LITTLE_IN : 1;
  const splays = FAN.map(f => base * little * (1 + (spread - 1) * f));
  // Past a grip's curl the joints bend no more (tighter, a bend folds into itself): the finger
  // turns at its root.
  const k = Math.min(curl, 0.9);
  // Past it, a fist (the user, 2026-11-26): the first bone comes back square to the back of the
  // hand while the two joints beyond close further (FIST_JOINTS), the tips into the palm. Until then
  // the finger turned on at its root alone, and a fist was a grip with no handle in it.
  const fist = clench(curl);
  const a = 0.1 + 1.81 * k + (FIST_JOINTS[0] - (0.1 + 1.81 * 0.9)) * fist;
  const b = a + 0.08 + 1.74 * k + (FIST_JOINTS[1] - (0.08 + 1.74 * 0.9)) * fist;
  // `hook` (radians) bends the finger further as a hand gripping an edge does, over its three
  // joints: the first bone lifted a little at the knuckle, most of the bend at the middle joint,
  // the rest at the last (HOOK, each joint's share).
  const [x, y, z] = [
    a + HOOK[0] * hook,
    b + (HOOK[0] + HOOK[1]) * hook,
    b + 0.06 + 0.99 * k + (FIST_JOINTS[2] - (0.06 + 0.99 * 0.9)) * fist + hook,
  ].map((n, j) => unit([splays[j], -Math.sin(n), Math.cos(n)]));
  return [x, y, z];
};

/** The knuckles' shell and the strap's buckle: near-black hard plastic. */
export const SHELL = [0.09, 0.09, 0.1];
/** The strap round the wrist (the user, 2026-11-14: finer): its width, and how far it stands out of the palm's ring. */
export const STRAP = { w: 0.009, k: 1.045 };
/** The marine's lit buttons on it, in place of the buckle (the user, 2026-11-14: no black box): across (toward the thumb), and colour. */
export const WRIST_LIGHTS: [number, number[]][] = [
  [0.0048, [0.25, 1, 0.4]],
  [0, [1, 0.65, 0.1]],
  [-0.0048, [0.2, 0.8, 1]],
];
