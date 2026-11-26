// The animation of the hands on the gun: reload, swap, button presses, the grip and the fingers.
import { GUN_RELOAD, RAIL_MAX, RAIL_RELOAD, RIFLE_RELOAD } from '../../shared/constants';
import type { PlayerState } from '../../shared/types';
import { glow as lit } from '../flag';
import { add, aim, dress, place, smooth, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { axis, turn } from '../rig';
import type { Quat } from '../rig';
import type { Out } from '../verts';
import { holdOf, kindOf, tiltOf } from './kinds';
import { clamp, tube } from './loft';
import type { Station } from './loft';
import { arcing } from './paint';
import { FOREGRIP, RAIL_MUZZLE, SLOTS, SPREAD } from './railgun';
import { RIFLE_GRIP, RIFLE_RISE } from './rifle';

/** Where the battery's foot sits seated, forward and up of the grip, and the way it goes up the grip (unit, forward and up). */
const SEAT = [-0.0434, -0.0868];
const UP_GRIP = [0.447, 0.894];
/** The rifle's cell: its foot under the body behind the grip, and the way it goes up into it. */
const WELL = [-0.13, -0.075];
const UP_WELL = [-0.1, 0.995];

export const ease = (t: number) => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};
/** `t` from `a` to `b` as 0 to 1. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/** How far through the swap of the gun in hand `p` is, 0 to 1; -1 when it is not swapping. */
export const swapOf = (p: Pick<PlayerState, 'reload' | 'railed' | 'rifled'>): number =>
  p.reload ? 1 - p.reload / [GUN_RELOAD, 0, RAIL_RELOAD, RIFLE_RELOAD][kindOf(p)] : -1;

/**
 * The glow of a weapon `t` seconds after it came to hand: dark as it rises, then flickering up to
 * full at `end` (0.6 s; the gun's 1.4 s).
 */
export const power = (t: number, end = 0.6): number =>
  t >= end ? 1 : clamp((t - end / 4) / (end * 0.75)) * (0.65 + 0.35 * Math.sin(t * 95) ** 2);

/** The gun's boot `t` seconds after its button is pressed (PRESS): its light up by `lit`, its counter fading in from `from` to `up`, with the BOOT sound's whine, full at its beep (the user, 2026-11-09); the rifle's digits show at `digits`. */
export const GUN_ON = { lit: 0.95, from: 0.05, up: 0.45, digits: 1.05 };

/**
 * Seconds after a weapon comes to hand, or a swap puts its new battery in, that its button is
 * pressed, by the left index on a gun's left flank, by the right thumb on the katana's grip: it
 * powers on then, light and sound (the user, 2026-11-09). The rail gun's boot plays 1.4 times as
 * fast (combat.ts), so its press comes sooner.
 */
export const PRESS = 0.45;
export const pressAt = (kind: number) => (kind == 2 ? PRESS / 1.4 : PRESS);
/**
 * The selected weapon slot, or -1 when bare-handed or down: 0 the gun, which is also the Hunter's
 * pistol (`sided`) beside his harpoon.
 */
export const handOf = (
  p: Pick<PlayerState, 'down' | 'fists' | 'wield' | 'rifled' | 'railed' | 'ammo' | 'sided'>,
): number =>
  p.down || p.fists
    ? -1
    : p.wield
      ? 1
      : p.rifled
        ? 3
        : p.railed
          ? 2
          : p.sided || p.ammo >= 0
            ? 0
            : -1;

/**
 * A tracker of the weapons each player has had in hand since taking them: true when the weapon in
 * `p`'s hand comes to it for the first time, the only time it is switched on (the user,
 * 2026-11-09). A weapon the player no longer carries (lost going down) is forgotten.
 */
export const firsts = () => {
  const had = new Map<number, Set<number>>();
  return (
    p: Pick<
      PlayerState,
      'id' | 'ammo' | 'fists' | 'blade' | 'rail' | 'rifle' | 'down' | 'wield' | 'rifled' | 'railed'
    >,
  ) => {
    const h = had.get(p.id) ?? new Set<number>();
    had.set(p.id, h);
    [p.ammo >= 0, p.blade, (p.rail ?? -1) >= 0, (p.rifle ?? -1) >= 0].forEach(
      (o, k) => o || h.delete(k),
    );
    const k = handOf(p);
    return k >= 0 && !h.has(k) && !!h.add(k);
  };
};
/**
 * The rail gun's capsule `t` after the gun came to hand, the left hand on it at `at`: turned a
 * quarter of a turn to tune it on (the user, 2026-11-09), radians, as the screw turns it.
 */
export const tune = (t: number, at = PRESS) => -(Math.PI / 2) * ease(span(t, at - 0.03, at + 0.08));
/** The pressing finger `t` after a weapon came to hand, its press at `at`: where it was (0), on the button (1) by `at`, then back. */
export const poke = (t: number, at = PRESS) =>
  t < at ? ease(span(t, at - 0.16, at)) : 1 - ease(span(t, at + 0.08, at + 0.24));

/**
 * Each weapon's button by kind (the gun, the katana, the rail gun, the rifle), in its model space,
 * on its left flank, in sight, for the left index: its foot, the way it faces, how far it stands
 * out. The katana's on the top of its grip, under the right thumb.
 */
export const BUTTONS: [Vec3, Vec3, number][] = [
  [[-0.0405, 0.08, -0.02], unit([-0.86, -0.5, 0]), 0.002],
  [[-0.0036, 0.013, -0.02], unit([-0.3, 0.95, 0]), 0.003],
  [[-0.0313, 0.08, -0.01], unit([-0.98, -0.2, 0]), 0.002],
  [[-0.0271, 0.08, -0.02], unit([-0.89, 0.45, 0]), 0.002],
];
/** The right thumb's middle joint in a weapon's model space, the hand round its grip. */
const KNUCKLE: Vec3 = [-0.0148, 0.0463, -0.0198];
const [TS, TC] = [Math.sin(0.55), Math.cos(0.55)];
/** The way, in the hand (x toward the thumb, y its back, z the fingers), from the right thumb's middle joint to weapon `kind`'s button: the katana's. */
export const thumbTo = (kind: number): Vec3 => {
  const [foot, n, len] = BUTTONS[kind];
  const [x, y, z] = unit(sub(add(foot, n.map(v => v * len) as Vec3), KNUCKLE));
  return unit([y * TS - z * TC, x, -y * TC - z * TS]);
};
/** Weapon `kind`'s button for a model at `at` with axes [right, up, forward] (model -z forward): its top, and the way it faces. */
export const buttonAt = (kind: number, at: Vec3, [r, u, f]: Vec3[]): Vec3[] => {
  const [foot, n, len] = BUTTONS[kind];
  const w = (p: Vec3, o: Vec3) =>
    [0, 1, 2].map(i => o[i] + r[i] * p[0] + u[i] * p[1] - f[i] * p[2]) as Vec3;
  const top = add(foot, n.map(v => v * len) as Vec3);
  return [w(top, at), unit(w(n, [0, 0, 0]))];
};
const KNOB = dress(
  smooth(
    [
      [0.0035, 0],
      [0.0035, 1],
      [0, 1],
    ],
    8,
  ),
  [1, 1, 1],
);
/** Appends weapon `kind`'s button in model space, pushed in by `push` (0 to 1) of 1.5 mm, its glow `rgb` lit by `light`. */
export const button = (out: Out, kind: number, push: number, light: number, rgb: number[]) => {
  const [foot, n, len] = BUTTONS[kind];
  const from = out.length;
  place(
    out,
    KNOB,
    sub(foot, n.map(v => v * push * 0.0015) as Vec3),
    aim(n, [0, 1, 0]),
    [0, 0, 0],
    [1, 1, len],
    rgb.map(c => c * (0.15 + 0.85 * light)),
  );
  lit(out, from, 1);
};

/** When, in the swap of the gun or the rifle, the palm slaps the new battery home: it clicks then. */
export const TAP = 0.76;
/**
 * The swap's moments (the user, 2026-11-09: let the battery fall to the floor, take a new one out
 * of a pouch on the belt and put it in): the old battery or cell let go and thrown out (the rail
 * gun's capsule, off its socket); the left hand at the pouch, holding the new one, and with it
 * under the grip, where it goes in.
 */
export const [RELEASE, RAIL_RELEASE, AT_POUCH, TAKEN, BROUGHT] = [0.18, 0.28, 0.28, 0.34, 0.5];
/** What each player's gun was last drawn at in its swap: the drop is thrown as it passes RELEASE. */
export const swaps = new Map<number, number>();

/**
 * Where the battery or the capsule is at `s` of a swap (0 to 1; -1 none): how far out of its seat
 * along its axis (metres), how far round its axis (radians, the capsule's screw), and how far it
 * tumbles (radians). The old one comes out and goes, the new one comes in, the left hand bringing it.
 */
export const swapped = (s: number, kind: boolean | number): number[] => {
  if (s < 0) {
    return [0, 0, 0];
  }
  if (kindOf(kind) != 2) {
    // Slid 10 cm out down the grip and let go at RELEASE (drops.ts has it then); the new one, from
    // the hand, up into it from 5 cm by 0.54, 12 mm short of home, held there, then slapped home by
    // the palm at TAP, a jump in the last instant (the user, 2026-11-09).
    return s < RELEASE
      ? [0.1 * ease(span(s, 0.1, RELEASE)), 0, 0]
      : [
          0.012 * (1 - span(s, TAP - 0.012, TAP)) + 0.038 * (1 - ease(span(s, BROUGHT, 0.54))),
          0,
          0,
        ];
  }
  // It unscrews itself a turn and a half and jumps up spinning; then the hand brings a new one
  // down onto the socket and screws it in, three turns of the wrist.
  return s < 0.42
    ? [
        0.02 * ease(span(s, 0.1, 0.28)) + 0.35 * span(s, 0.28, 0.42) ** 1.5,
        -3 * Math.PI * ease(span(s, 0.1, 0.28)) - 9 * span(s, 0.28, 0.42),
        2.5 * span(s, 0.28, 0.42),
      ]
    : [0.09 * (1 - ease(span(s, 0.42, 0.58))) + 0.03 * (1 - span(s, 0.58, 0.88)), screwed(s)[0], 0];
};

/** The sixth of a turn of each of the three turns of the wrist that screw the capsule in. */
const STROKE = Math.PI / 3;

/**
 * The screwing of a new capsule at `s` of a swap: how far round it still is (radians, to 0 when it
 * is in), and how far the wrist has turned from where it took hold: with it through each stroke,
 * then back while the fingers let go.
 */
export const screwed = (s: number): number[] => {
  const u = span(s, 0.58, 0.88);
  const k = Math.min(Math.floor(u * 3), 2);
  const f = u * 3 - k;
  const turn = ease(f / 0.6);
  return [STROKE * (3 - k - turn), -STROKE * (f < 0.6 ? turn : 1 - ease((f - 0.6) / 0.4))];
};

/** The moments of a swap that sound, as shares of it: the battery let go and clicked home; the capsule jumping off and each turn of the screw. */
export const CUES = [
  [0.1, TAP],
  [0.28, 0.58, 0.68, 0.78],
];

/**
 * The frame of the battery (the capsule when `rail`) of a gun whose grip is at `at` and whose axes
 * are `ax`, `k` times its size, at `s` of a swap: its foot (base) and its axes, its forward along
 * the grip (up).
 */
export const loadFrame = (
  at: Vec3,
  ax: Vec3[],
  kind: boolean | number,
  s = -1,
  k = 1,
  i = 0,
  tuned = 0,
): [Vec3, Vec3[]] => {
  const [r, u, f] = ax;
  const w = kindOf(kind);
  const rail = w == 2;
  const [c, sn] = rail ? [0, 1] : w == 3 ? UP_WELL : UP_GRIP;
  const [fo, up, xo = 0, back = 0, side = 0] = rail ? SLOTS[i] : w == 3 ? WELL : SEAT;
  const [out, screw, tumble] = swapped(s, w);
  const twist = screw + tuned;
  // Forward up the grip (up), up across it: a turn about the gun's right.
  const fw = [0, 1, 2].map(i => f[i] * c + u[i] * sn) as Vec3;
  let uw = [0, 1, 2].map(i => u[i] * c - f[i] * sn) as Vec3;
  let rw = r;
  // The screw turns it about its own axis, the throw tips it over about the gun's right.
  const [tc, ts] = [Math.cos(twist), Math.sin(twist)];
  [rw, uw] = [
    rw.map((v, i) => v * tc + uw[i] * ts) as Vec3,
    uw.map((v, i) => v * tc - rw[i] * ts) as Vec3,
  ];
  const [bc, bs] = [Math.cos(tumble), Math.sin(tumble)];
  const fw2 = fw.map((v, i) => v * bc + uw[i] * bs) as Vec3;
  uw = uw.map((v, i) => v * bc - fw[i] * bs) as Vec3;
  const foot = [0, 1, 2].map(
    i => at[i] + k * (r[i] * xo + f[i] * fo + u[i] * up + fw[i] * (rail ? out : -out)),
  ) as Vec3;
  // A flank cell lies along the gun: turned about the gun's right, then about its forward.
  const [qb, qs] = [axis(r, back), axis(f, side)];
  return [foot, [rw, uw, fw2].map(v => turn(qs, turn(qb, v)))];
};

/**
 * The spark between the electrodes' tips at the time `t` (s), in model space: a thin glowing line
 * through four jagged points, a new shape 30 times a second.
 */
export const arc = (t: number): number[] => {
  let seed = (Math.floor(t * 30) % 9973) + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const f = -RAIL_MUZZLE[2];
  const out: number[] = [];
  const st = [-1, -0.5, 0, 0.5, 1].map((k, i): Station => {
    const j = i % 4 ? 0.014 : 0;
    return [f + rnd() * j, RAIL_MUZZLE[1] + k * SPREAD * 0.85, 0.0022, 0.0022, rnd() * j];
  });
  tube(out, st, 3, arcing);
  return out;
};

/**
 * Where the left hand holds a rail gun whose grip is at `at` and whose axes are [right, up,
 * forward]: the middle of its front grip, and the way the grip runs from its foot up to the barrel,
 * which the thumb points along (see wield() in body.ts). For the laser rifle (`kind` 3): under its
 * handguard, the thumb along it, and the way the hand goes, across under it to its right.
 */
export const fore = (
  at: Vec3,
  [r, u, f]: Vec3[],
  kind: boolean | number = 2,
): [Vec3, Vec3, Vec3?] => {
  const rifle = kindOf(kind) == 3;
  const g = rifle ? RIFLE_GRIP : FOREGRIP;
  const p = [0, 1, 2].map(i => at[i] + r[i] * g[0] + u[i] * g[1] - f[i] * g[2]) as Vec3;
  // The rifle's handguard is carried from under it, the palm up: the thumb along it on its left,
  // the hand square across under it and the fingers up its right side.
  return rifle
    ? [p, unit([0, 1, 2].map(i => f[i] + RIFLE_RISE * u[i]) as Vec3), r]
    : [p, unit([0, 1, 2].map(i => u[i] - 0.19 * f[i]) as Vec3)];
};

/** fore() for the hand at `pos` turned by `q`, which holds the grip. */
export const foregrip = (pos: Vec3, q: Quat, kind: boolean | number = 2) =>
  fore(grip(pos, q, kind), axes(q, kind), kind);

/** The rail gun's lightning left as the counters show it: 99 when full (of `max`, a load by default), 0 when spent. */
export const charge = (rail: number, max = RAIL_MAX): number =>
  Math.ceil((Math.max(rail, 0) * 99) / max);

/** The electrodes' tips of a gun whose grip is at `at` and whose axes are [right, up, forward]. */
export const electrodes = (at: Vec3, [, u, f]: Vec3[]): Vec3[] =>
  [-1, 1].map(
    s =>
      [0, 1, 2].map(
        i => at[i] + u[i] * (RAIL_MUZZLE[1] + s * SPREAD) - f[i] * RAIL_MUZZLE[2],
      ) as Vec3,
  );

/** The gun's axes [right, up, forward] for a hand turned by `q` (see body.ts: its thumb is the hand's -z, the back of the hand its x, its fingers its -y), the grip tilted in it as a weapon of `kind` is (tiltOf()). */
export const axes = (q: Quat, kind: boolean | number = 0): Vec3[] => {
  const [th, back, fing] = [turn(q, [0, 0, -1]), turn(q, [1, 0, 0]), turn(q, [0, -1, 0])];
  const [s, c] = tiltOf(kind);
  return [
    back,
    th.map((v, i) => c * v - s * fing[i]) as Vec3,
    th.map((v, i) => s * v + c * fing[i]) as Vec3,
  ];
};

/** The middle of the grip, for a wrist at `pos`: 8 cm along the fingers and 2 cm toward the palm, or as a weapon of `kind` is held (holdOf()). */
export const grip = (pos: Vec3, q: Quat, kind: boolean | number = 0): Vec3 => {
  const [fing, back] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
  const [reach, palm] = holdOf(kind);
  return pos.map((v, i) => v + fing[i] * reach - back[i] * palm) as Vec3;
};
