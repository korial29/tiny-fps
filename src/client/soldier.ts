// The other players' model: a runner's skin (skin.ts) posed by its gait (gait.ts), in the
// renderer's vertex format. A runner is the last PlayerState seen and the gait that eases the body
// toward it; the dash streaks are the only thing drawn here that the gait does not pose. A
// player's (x, y, z) is the bottom of the feet. No DOM.
import { DOWN_TICKS, HEAT_MAX, RUN_SPEED, STEP_H, TICK_HZ } from '../shared/constants';
import { TAU, floored } from '../shared/physics';
import { LIMB, MODE } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { FIST, KATANA_LEFT, KATANA_TILT, clasp, inv, reach, shrug, stowed, wield } from './body';
import { JAB, armOf, createGait, frame, thrown } from './gait';
import type { Floor, Gait, Seat } from './gait';
import {
  ARC,
  RIFLE_HOLD,
  RIFLE_TILT,
  BROUGHT,
  TILT,
  aimed,
  axes,
  cellsOf,
  focus,
  foregrip,
  grip,
  held,
  kindOf,
  loadFrame,
  shouldered,
  span,
  tip,
  swapOf,
} from './gun';
import { helmet } from './helmet';
import { armor } from './armor';
import { crotch, hose, pack, shoulders } from './pack';
import { fetched, pouch, pouchAt } from './pouch';
import type { Tracer } from './beams';
import {
  BEHIND,
  BOW,
  SWAY,
  bent,
  cutting,
  ends,
  held as sword,
  locked,
  poised,
  progress,
} from './katana';
import { ground, piece, track } from './limbs';
import type { Piece } from './limbs';
import { STRIDE, add, basis, dot, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, PARENT, axis, mul, slerp, solve, turn } from './rig';
import type { Pose, Quat } from './rig';
import { beardOf, body, capped, cut, eyesOf, hairOf, palette, shaved, skin } from './skin';
import { createFace, dashing, felled, strain } from './expression';
import type { Face } from './expression';
import { CH, toneOf } from './features';
import { createTrail } from './trail';
import type { Trail } from './trail';

/** How fast the dash streaks grow and fade, 1 / s. */
const DASH_RATE = 14;

/** A point 30 m along the look of `p`, for a runner that has not shot yet. */
const far = (p: PlayerState): Vec3 => {
  const f = basis(p.yaw, p.pitch)[2];
  return [p.x + f[0] * 30, p.y + 1.6 + f[1] * 30, p.z + f[2] * 30];
};

/** What a runner keeps between frames. */
export interface Runner {
  /** The player as last seen. */
  p: PlayerState;
  gait: Gait;
  /** How much of a dash it is in, eased from 0 to 1: the length of the streaks. */
  dash: number;
  /** Seconds since its last shot, and how far its gun arm is raised to aim, eased from 0 to 1. */
  since: number;
  aim: number;
  /** Where its last shot went, which its gun points at. */
  focus: Vec3;
  /** How far through its katana cut it is, -1 when it is not cutting, the light the blade leaves and the clock of its crackle. */
  prog: number;
  trail: Trail;
  t: number;
  /** The limb a katana's cut took off, while he is down (see limbs.ts). */
  cut?: Piece;
  /** Seconds left of the grimace a hit puts on his face, and of the grin of a capture or of a foe put down. */
  hurt: number;
  grin: number;
  /** How far out the fist of a punch is, 0 to 1, eased. */
  jab: number;
  /** His face (expression.ts), and the seconds it has yet to live through: soldier() moves it once drawn, where the head's turn is known. */
  face: Face;
  dt: number;
  /** The seat he rides in, when he does and his rover is known. */
  seat?: Seat;
  /** The muzzle of the long gun in his hands as last drawn, from his feet: where its shots are seen to leave (combat.ts). */
  tip?: Vec3;
}

/**
 * The seat of a player who rides: the rover whose `driver` or `rider` he is. Nothing for one on
 * foot, or whose rover is not among `rovers`.
 */
export const seatOf = (p: PlayerState, rovers?: Rover[]): Seat | undefined => {
  const r =
    p.mode == MODE.RIDE ? rovers?.find(r => r.driver == p.id || r.rider == p.id) : undefined;
  return r && { yaw: r.yaw, pitch: r.pitch, roll: r.roll, steer: r.steer, s: +(r.driver != p.id) };
};

/** How far under a standing eye a seated one is: his gun is held out from there. */
const SEATED = 0.62;

/** Seconds after a shot that the gun stays up. */
const AIMING = 0.5;
/** Seconds a hit's wince lasts, and the grin of a capture or of a foe put down. */
export const [HURT, GRIN] = [0.4, 1.6];

/** A runner as first seen: in the pose its state asks for, no ease. */
export const createRunner = (p: PlayerState, seat?: Seat): Runner => {
  const gait = createGait();
  const face = createFace(p.id);
  face.w[CH.HAIR] *= +!shaved(p.id);
  gait.update(p, 0, undefined, seat);
  return {
    seat,
    p: { ...p },
    gait,
    dash: +dashing(p),
    since: 1e3,
    aim: 0,
    focus: far(p),
    prog: -1,
    trail: createTrail(),
    t: 0,
    hurt: 0,
    grin: 0,
    jab: 0,
    face,
    dt: 0,
  };
};

/** The floor under a player standing at height `y`: the first top within a step above or below it. */
const floorOf =
  (world: World, y: number): Floor =>
  (x, z) => {
    const d = ray(world, [x, y + STEP_H, z], [0, -1, 0], 2 * STEP_H);
    return d > 0 && d < 2 * STEP_H ? y + STEP_H - d : y;
  };

/**
 * Moves each runner of `book` to its player in `others` after dt seconds: a new player gets a
 * runner already in pose, one that left loses it. With a `world` the feet stand on the brushes
 * under them. The `tracer` gets the sparks of a limb cut off.
 */
export const animate = (
  book: Map<number, Runner>,
  others: PlayerState[],
  dt: number,
  world?: World,
  tracer?: Pick<Tracer, 'shock' | 'spit'>,
  rovers?: Rover[],
) => {
  for (const id of book.keys()) {
    if (!others.some(p => p.id == id)) {
      book.delete(id);
    }
  }
  for (const p of others) {
    const r = book.get(p.id);
    const seat = seatOf(p, rovers);
    if (r) {
      r.seat = seat;
      r.gait.update(p, dt, world && floorOf(world, p.y), seat);
      r.dash += (+dashing(p) - r.dash) * (1 - Math.exp(-dt * DASH_RATE));
      r.since = p.shots == r.p.shots && !p.zapping ? r.since + dt : 0;
      // A shot raises the gun at once, so that it points at the shot when the beam is drawn.
      r.aim = r.since == 0 ? 1 : r.aim + (+(r.since < AIMING) - r.aim) * (1 - Math.exp(-dt * 12));
      r.focus = r.since < AIMING ? (world ? focus(p, world)[0] : far(p)) : r.focus;
      r.prog = progress(r.prog, p, dt);
      // Put down by the bolt: a burst of sparks, then more as he comes apart.
      const k = fried(p);
      if (k > 0 && k < 1) {
        if (!r.p.fried) {
          tracer?.shock([p.x, p.y + 1, p.z]);
        }
        for (let i = 0; i < 3; i++) {
          const h = (r.t * 7.3 + i * 0.37) % 1;
          tracer?.spit([p.x + Math.sin(h * 40) * 0.3, p.y + 1.8 * h, p.z + Math.cos(h * 40) * 0.3]);
        }
      }
      r.trail.update(dt);
      r.t += dt;
      r.hurt = p.hp < r.p.hp ? HURT : Math.max(r.hurt - dt, 0);
      r.grin = felled(r.p, p, id => book.get(id)?.p, others) ? GRIN : Math.max(r.grin - dt, 0);
      r.dt += dt;
      r.jab += (thrown(p) - r.jab) * (1 - Math.exp(-dt * 45));
      r.p = { ...p };
    } else {
      book.set(p.id, createRunner(p, seat));
    }
    track(book.get(p.id)!, dt, ground(world, p.y), !r, tracer);
  }
};

/** The pose with the right arm `k` of the way to holding the gun's grip at `grip`, its axes `ax` (aimed(), shouldered()). */
const lifted = (
  pose: Pose,
  s: ReturnType<typeof solve>,
  [grip, ax]: [Vec3, Vec3[]],
  k: number,
): Pose => {
  const rot = pose.rot.slice();
  const q = { ...pose, rot };
  const [uh, fh] = [ax[0], ax[2].map((v, i) => v * TILT[1] - ax[1][i] * TILT[0]) as Vec3];
  const wrist = grip.map((v, i) => v - 0.078 * fh[i] + 0.022 * uh[i]) as Vec3;
  const pole: Vec3 = [uh[0] * 0.7, -1, uh[2] * 0.7];
  reach(
    q,
    s,
    J.ARM_R,
    wrist.map((v, i) => s.pos[J.HAND_R][i] + (v - s.pos[J.HAND_R][i]) * k) as Vec3,
    pole,
  );
  rot[J.HAND_R] = slerp(rot[J.HAND_R], mul(inv(solve(q).rot[J.FOREARM_R]), frame(uh, fh)), k);
  return q;
};

/**
 * A long gun's butt plate in the hollow of the right shoulder: from the shoulder joint, in the
 * chest's frame (to its right, up, back). The gun goes from there along the look, so it is
 * shouldered whatever the pitch (the user, 2026-11-10: it hung across the belly).
 */
export const POCKET: Vec3 = [-0.025, -0.01, -0.13];
/** How much further ahead the butt is when the gun points straight up or down the chest: its plate, on end, clear of it. */
const TIPPED = 0.05;
/**
 * How far the chest turns to the right behind a shouldered gun, the left shoulder toward its front
 * grip, at least and at most: a rifleman's bladed stance, radians.
 */
const BLADED = [0.5, 1.25];
/** The share of the barrel's pitch the trunk leans with. */
const LEAN = 0.6;
/**
 * How far the left wrist is from its shoulder at most, which the trunk turns for: the elbow bent
 * under 120 degrees under the gun, the shoulder left where it is (the user, 2026-11-10: the arm
 * stretched and pulled the shoulder out to reach the grip).
 */
const BENT = 0.47;
/** The low ready of a sprint: the barrel this far under the horizon and to the left of the look, the butt still in the shoulder. */
const LOW = [0.6, 0.35];
const ease = (v: number) => (v = Math.min(Math.max(v, 0), 1)) * v * (3 - 2 * v);
/** How far a runner has his long gun down to the low ready, 0 to 1: in a sprint, when he is not firing. */
export const lowered = (r: Runner): number =>
  ease((Math.hypot(r.p.vx, r.p.vz) - RUN_SPEED - 0.5) / 1.5) * (1 - r.aim);

/**
 * The pose `from` (solved: `s0`) with the runner's long gun in both hands: the butt in the right
 * shoulder, the barrel along the look (at the shot while it fires) or down and across at the low
 * ready of a sprint, the left hand on its front grip. The trunk turns about the vertical behind
 * the gun until the left arm reaches its grip bent (BENT), and leans with the barrel's pitch; the
 * head stays on the look.
 */
const carried = (from: Pose, s0: ReturnType<typeof solve>, r: Runner): Pose => {
  const { p } = r;
  const kind = kindOf(p);
  const low = lowered(r);
  const [side, top, look] = basis(p.yaw, p.pitch);
  const [x, u, f] = basis(p.yaw, 0);
  const d = basis(p.yaw + LOW[1], -LOW[0])[2];
  const way = unit([0, 1, 2].map(i => look[i] + (d[i] - look[i]) * low) as Vec3);
  const riding = p.mode == MODE.RIDE;
  const lean = axis(x, riding ? 0 : (LEAN * Math.asin(way[1])) / 2);
  const ahead = far(p);
  const pole = [0, 1, 2].map(i => -0.4 * x[i] - u[i] - 0.2 * f[i]) as Vec3;
  /** The trunk turned by `turned`, the gun shouldered in the right hand; the left hand's place on it, and how far its wrist is from its shoulder. */
  const hold = (turned: number) => {
    const pose = { ...from, rot: from.rot.slice() };
    for (const [j, k] of [
      [J.SPINE, 0.4],
      [J.CHEST, 0.6],
    ]) {
      const up = solve(pose).rot[PARENT[j]];
      pose.rot[j] = mul(
        inv(up),
        mul(mul(lean, axis([0, 1, 0], -k * turned)), mul(up, pose.rot[j])),
      );
    }
    let s = solve(pose);
    pose.rot[J.NECK] = mul(inv(s.rot[J.CHEST]), s0.rot[J.NECK]);
    const spine = turn(s.rot[J.CHEST], [0, 1, 0]);
    const tipped = Math.abs(way[0] * spine[0] + way[1] * spine[1] + way[2] * spine[2]);
    const butt = add(
      s.pos[J.ARM_R],
      turn(s.rot[J.CHEST], [POCKET[0], POCKET[1], POCKET[2] - TIPPED * tipped]),
    );
    const to = [0, 1, 2].map(
      i => (ahead[i] + (r.focus[i] - ahead[i]) * r.aim) * (1 - low) + (butt[i] + 30 * d[i]) * low,
    ) as Vec3;
    const [at, ax] = shouldered(butt, to, side, top, kind);
    const q = lifted(pose, s, [at, ax], 1);
    s = solve(q);
    const [fore, g, up] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R], kind);
    const [len, palm] = up ? RIFLE_HOLD : FIST;
    const sh = s.pos[J.ARM_L];
    // The rail gun's grip is taken from the shoulder's side and a little from over the elbow, as
    // a free hand takes a handle (wield()), the shoulder left where it is.
    const near = unit(sub(fore, sh));
    const over = unit(sub(pole, g.map(v => v * dot(pole, g)) as Vec3));
    wield(
      q,
      s,
      J.ARM_L,
      fore,
      g,
      pole,
      up ?? (near.map((v, i) => v - 0.3 * over[i]) as Vec3),
      [len, palm],
      up ? RIFLE_TILT : undefined,
    );
    // The elbow down under the gun, the hand as it holds: not out along the fingers.
    const held = solve(q);
    const hand = held.rot[J.HAND_L];
    reach(q, held, J.ARM_L, held.pos[J.HAND_L], pole);
    q.rot[J.HAND_L] = mul(inv(solve(q).rot[J.FOREARM_L]), hand);
    // Where the hand's turn puts the wrist, in reach or not, from the shoulder.
    const [fing, back] = [turn(hand, [0, -1, 0]), turn(hand, [1, 0, 0])];
    return {
      q,
      far: Math.hypot(...fore.map((v, i) => v - fing[i] * len - back[i] * palm - sh[i])),
    };
  };
  // The least turn that bends the left arm enough, by the secant. Seated, the trunk is square
  // to the seat unless the arm needs it.
  const least = riding ? 0 : BLADED[0];
  let [t0, h0] = [0, hold(least)];
  let [t, h] = [least, h0];
  for (let i = 0; i < 4 && (i ? Math.abs(h.far - BENT) > 2e-3 : h.far > BENT); i++) {
    const slope = i ? (h.far - h0.far) / (t - t0 || 1) : -0.3;
    [t0, h0] = [t, h];
    t = Math.min(Math.max(t + (BENT - h.far) / Math.min(slope, -0.05), least), BLADED[1]);
    h = hold(t);
  }
  return h.q;
};

/**
 * The katana in a swordsman's middle guard (the user, 2026-11-10: stand like a samurai): both
 * hands on the grip a fist before the navel, on the body's middle, the blade rising ahead toward a
 * foe's throat. The guard's numbers (see katana.ts) from the eye.
 */
const CARRY = [-0.02, -0.5, 0.26, 0, 0.45, 0.89];

/**
 * The pose with the katana in both hands: in the guard, or in a cut, which is the first person's cut
 * seen from the runner's eye (the share `e` of it, so that it is drawn from the guard and back to
 * it), and the trunk twisting, bending and leaning through it (trunk()).
 */
export const brandish = (from: Pose, p: PlayerState, prog: number, ph: number, t = 0): Pose => {
  // In a saber lock the blade crosses the foe's, shaking, and the trunk leans into him.
  const e = p.lock ? 1 : prog < 0 ? 0 : ease(prog * 6) * ease((1 - prog) * 5);
  const k = p.lock ? locked(t) : poised(p, Math.max(prog, 0), t);
  const g = CARRY.map((v, i) => v + (k[i] - v) * e);
  g[1] += 0.02 * Math.sin(TAU * ph) * (1 - e);
  // A cut turns the whole body on its feet with a share of the trunk's twist.
  const [tw, bd, ln] = p.lock ? [0, 0.15, 0] : prog < 0 ? [0, 0, 0] : bent(p, prog).map(v => v * e);
  const spin = prog < 0 ? 0 : SWAY * tw;
  const pose = { ...from, yaw: from.yaw + spin };
  // The hands go round with the chest's whole twist and down and up with its bend.
  const [r, u, f] = basis(p.yaw + spin + (1 - SWAY) * tw, Math.max(p.pitch, -BOW) * e - 0.6 * bd);
  /** The camera's space at the eye (right, up, forward) to the world. */
  const turn = ([a, b, c]: number[]): Vec3 => [
    r[0] * a + u[0] * b + f[0] * c,
    r[1] * a + u[1] * b + f[1] * c,
    r[2] * a + u[2] * b + f[2] * c,
  ];
  const rot = pose.rot.slice();
  const q = { ...pose, rot };
  // The trunk twists, bends and leans through the cut (trunk()), the chest more than the waist.
  for (const [j, k] of [
    [J.SPINE, 0.4],
    [J.CHEST, 0.6],
  ]) {
    rot[j] = mul(
      rot[j],
      mul(mul(axis([0, 1, 0], tw * k), axis([1, 0, 0], -bd * k)), axis([0, 0, 1], ln * k)),
    );
  }
  const s = solve(q);
  // The eye of the head, which a run leans forward and the trunk carries: the hands go with it.
  const eye = s.pos[J.HEAD];
  // Both hands round the grip, the left one BEHIND the right, the elbows down and out, the wrists
  // straight: the katana and the fists go as one piece where the arms hold it (clasp()).
  const at = add(eye, turn(g.slice(0, 3)));
  const dir = unit(turn(g.slice(3, 6)));
  shrug(q, s, J.ARM_R, at);
  shrug(q, s, J.ARM_L, add(at, dir.map(v => -BEHIND * v) as Vec3));
  const poles: [Vec3, Vec3] = [turn([0.5, -1, -0.35]), turn([-0.5, -1, -0.35])];
  const [grip, d, right, left] = clasp(solve(q), at, dir, poles);
  wield(q, s, J.ARM_R, grip, d, poles[0], right);
  wield(
    q,
    s,
    J.ARM_L,
    add(grip, d.map(v => -BEHIND * v) as Vec3),
    d,
    poles[1],
    left,
    KATANA_LEFT,
    KATANA_TILT,
    true,
  );
  return q;
};

/** A dash trails three streaks: thin glowing (layer -2) spikes, a pair of crossed triangles each. */
const streaks = (out: number[], r: Runner, color: number[], at: (v: Vec3) => Vec3) => {
  const back = unit([-r.p.vx, 0, -r.p.vz]);
  const [cr, cg, cb] = color.map(v => 0.6 + 0.6 * v);
  [
    [0.5, 0.12, 1.3],
    [0.9, -0.16, 1.7],
    [1.25, 0.14, 1.2],
  ].forEach(([u, x, len], i) => {
    const a = at([x, u, -0.2 - 0.1 * i]);
    const tip = a.map((v, k) => v + back[k] * len * r.dash);
    for (const d of [
      [-back[2] * 0.03, 0, back[0] * 0.03],
      [0, 0.03, 0],
    ]) {
      for (const p of [a.map((v, k) => v + d[k]), a.map((v, k) => v - d[k]), tip]) {
        out.push(...p, 0, 1, 0, cr, cg, -2, cb);
      }
    }
  });
};

/** Whether the runner is at a rover's wheel: unarmed, his weapons put away. */
const driving = (r: Runner) => r.p.mode == MODE.RIDE && r.seat?.s === 0;

/** Seconds a runner the rail gun's bolt put down takes to come apart. */
export const FRY = 0.9;

/** How far a runner has come apart, 0 (whole, or not fried) to 1 (gone). */
export const fried = (p: PlayerState): number =>
  p.fried && p.down ? Math.min((DOWN_TICKS - p.down) / TICK_HZ / FRY, 1) : 0;

/**
 * The triangles of `out` from `from` coming apart `k` of the way (0 to 1): they glow violet white
 * at once, each drifts up and out on its own, and goes when `k` passes its own share, so the body
 * thins to nothing.
 */
export const dissolve = (out: number[], from: number, k: number) => {
  const T = 3 * STRIDE;
  let w = from;
  for (let o = from, i = 0; o < out.length; o += T, i++) {
    const h = ((Math.imul(i + 1, 0x9e3779b1) >>> 0) % 1000) / 1000;
    if (h < k) {
      continue;
    }
    const lift = [Math.sin(i) * 0.3, 1.2 * h, Math.cos(i) * 0.3].map(v => v * k * k);
    const glow = Math.min(1, k * 4);
    for (let v = 0; v < T; v += STRIDE) {
      for (let j = 0; j < STRIDE; j++) {
        out[w + v + j] = out[o + v + j] + (j < 3 ? lift[j] : 0);
      }
      [6, 7, 9].forEach((j, c) => (out[w + v + j] += (ARC[c] * (1 - k) - out[w + v + j]) * glow));
      out[w + v + 8] = glow > 0.5 ? -2 : out[w + v + 8];
    }
    w += T;
  }
  out.length = w;
};

/**
 * Appends a runner at level of detail `lod` (see body(): 0 far, 1 near, 3 close; its weapon is near
 * when the runner is close): the jacket in `color` (r, g, b), dark
 * trousers, skin, hair in his own colour (hairOf()) and light shoes, posed by its gait. A dash trails a few glowing streaks.
 */
/** The runner's pose this frame, solved: the gait, the fall and sink of one down, and the weapon's hold; and the way the body faces. */
export const stance = (r: Runner) => {
  let pose = r.gait.pose();
  const { p } = r;
  // Lying down, it sinks into the roof for the last half second.
  const sink = p.down ? 0.5 * Math.min(Math.max(1 - p.down / 30, 0), 1) : 0;
  if (p.down) {
    pose = {
      ...pose,
      at: [pose.at[0], pose.at[1] - sink, pose.at[2]],
    };
  }
  // Down or floored, the weapon stays in the hand as it falls. At the wheel both hands are on the yoke.
  const lying = !!p.down || floored(p) || driving(r);
  if (r.jab > 0.002 && !lying) {
    // A punch: the rear fist out, the lead one back to the hip, the chest behind it.
    const rot = pose.rot.slice();
    const [out, back] = [armOf(-1, JAB.out), armOf(1, JAB.back)];
    rot[J.ARM_L] = slerp(rot[J.ARM_L], out[0], r.jab);
    rot[J.FOREARM_L] = slerp(rot[J.FOREARM_L], out[1], r.jab);
    rot[J.ARM_R] = slerp(rot[J.ARM_R], back[0], r.jab);
    rot[J.FOREARM_R] = slerp(rot[J.FOREARM_R], back[1], r.jab);
    rot[J.CHEST] = mul(axis([0, 1, 0], -JAB.twist * r.jab), rot[J.CHEST]);
    pose = { ...pose, rot };
  }
  let s = solve(pose);
  if (p.wield && !lying) {
    pose = brandish(pose, p, r.prog, r.gait.phase, r.t);
    s = solve(pose);
  } else if ((p.railed || p.rifled) && !lying) {
    // The rail gun or the rifle in both hands, at the ready when not firing: the left on its front grip, the
    // elbow down and out. On a wall it is put away, unless its bolt is going out (stowed()).
    if (p.railed && stowed(p)) {
      return { s, sink, yaw: pose.yaw };
    }
    pose = carried(pose, s, r);
    s = solve(pose);
  } else if (r.aim > 0.01 && p.ammo >= 0) {
    // Seated, the eye the gun is held out from is lower.
    pose = lifted(
      pose,
      s,
      aimed(p.mode == MODE.RIDE ? { ...p, y: p.y - SEATED } : p, r.focus),
      r.aim,
    );
    s = solve(pose);
  }
  // In a swap of the gun or the rifle the left hand fetches the new battery from the pouch on the
  // hip and brings it up under the grip (pouch.ts, the user, 2026-11-09).
  const sp = swapOf(p);
  const w =
    lying || p.wield || p.railed || sp < 0
      ? 0
      : ease(span(sp, 0.12, 0.2)) * (1 - ease(span(sp, BROUGHT - 0.03, BROUGHT)));
  let carry: [Vec3, Vec3[]] | undefined;
  if (w > 0.002) {
    const q = s.rot[J.HAND_R];
    const f = fetched(
      sp,
      pouchAt(s.pos[J.PELVIS], s.rot[J.PELVIS]),
      loadFrame(grip(s.pos[J.HAND_R], q), axes(q), kindOf(p), BROUGHT),
      s.pos[J.HAND_L],
    );
    carry = f.carry;
    const [x, u, fw] = basis(p.yaw, 0);
    const arm = { ...pose, rot: pose.rot.slice() };
    wield(
      arm,
      s,
      J.ARM_L,
      f.at,
      f.g,
      [0, 1, 2].map(i => -0.5 * x[i] - u[i] - 0.35 * fw[i]) as Vec3,
    );
    for (const k of [J.ARM_L - 1, J.ARM_L, J.FOREARM_L, J.HAND_L]) {
      pose.rot[k] = slerp(pose.rot[k], arm.rot[k], w);
    }
    s = solve(pose);
  }
  return { s, sink, yaw: pose.yaw, carry };
};

/** Draws the runner and gives back its solved skeleton, or nothing once a bolt has burnt it away. */
export const soldier = (
  out: number[],
  r: Runner,
  color: number[],
  lod = 1,
  helmets = false,
  armored = helmets,
) => {
  const { p } = r;
  const k = fried(p);
  if (k >= 1) {
    return;
  }
  r.tip = undefined;
  const colors = palette(color, hairOf(p.id), eyesOf(p.id), armored, toneOf(p.id), beardOf(p.id));
  // The armour: white in space, else in the team's colour.
  const plate = helmets ? undefined : color;
  const { s, sink, yaw, carry } = stance(r);
  // His face: a wince when hit, a grimace down, a shout in a cut or a dash, effort in a sprint or a
  // climb, focus aiming, a grin; the eyes on his aim from where the head points.
  const look = turn(inv(s.rot[J.HEAD]), basis(p.yaw, p.pitch)[2]);
  r.face.update(r.dt, {
    down: p.down > 0,
    hurt: r.hurt / HURT,
    effort: strain(p),
    focus: Math.max(r.aim, +!!p.charge),
    shout: +(r.prog >= 0 || dashing(p)),
    grin: +(r.grin > 0),
    gx: Math.atan2(look[0], -look[2]),
    gy: Math.atan2(look[1], Math.hypot(look[0], look[2])),
  });
  r.dt = 0;
  const blade = p.wield && !p.down && !driving(r);
  if (r.cut) {
    const cs = cut(lod, r.cut.limb)[0];
    const at = out.length;
    skin(out, cs, s, colors, r.face.w);
    // The stump's face is the last vertex drawn.
    r.cut.at = out.slice(out.length - STRIDE, out.length - STRIDE + 3) as Vec3;
    if (armored) {
      armor(out, at, cs, lod > 2, plate);
    }
    piece(out, r.cut, colors, lod, sink, r.face.w);
  } else {
    const from = out.length;
    const bs = body(lod);
    // Under a helmet's dark visor no face shows: its channels are not worth their time.
    skin(out, bs, s, colors, helmets ? undefined : r.face.w);
    // The armour, cut out of the skin just drawn.
    if (armored) {
      armor(out, from, bs, lod > 2, plate);
    }
    pouch(out, s.pos[J.PELVIS], s.rot[J.PELVIS]);
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The helmet is on the head: not on one a katana cut has taken off.
  if (helmets && r.cut?.limb !== LIMB.HEAD) {
    helmet(out, s.pos[J.HEAD], s.rot[J.HEAD], color, lod);
    hose(out, s.pos[J.HEAD], s.rot[J.HEAD], s.pos[J.CHEST], s.rot[J.CHEST], lod);
  }
  // The life support pack on the back of a space suit.
  if (helmets) {
    pack(out, s.pos[J.CHEST], s.rot[J.CHEST], color, lod);
  }
  if (armored) {
    crotch(out, s.pos[J.PELVIS], s.rot[J.PELVIS], lod, plate);
    shoulders(
      out,
      [J.ARM_L, J.ARM_R].map(j => [s.pos[j], capped(s.rot, j)] as [Vec3, Quat]),
      lod,
      plate,
    );
  }
  if (blade) {
    sword(out, s.pos[J.HAND_R], s.rot[J.HAND_R], Math.min(lod, 1), r.t);
    r.trail.mark(...(ends(s.pos[J.HAND_R], s.rot[J.HAND_R]) as [Vec3, Vec3]), cutting(r.prog));
  } else if ((p.railed ? !stowed(p) : p.ammo >= 0 || p.rifled) && !p.down && !driving(r)) {
    // A swap shows: the battery or the capsule out and in, the glow off until it is.
    const sp = swapOf(p);
    held(out, s.pos[J.HAND_R], s.rot[J.HAND_R], Math.min(lod, 1), 1, undefined, 0, kindOf(p), r.t, {
      swap: sp,
      light: sp < 0 ? 1 : 1 - ease(span(sp, 0.1, 0.2)),
      cells: cellsOf(p),
      heat: (p.heat ?? 0) / HEAT_MAX,
      hot: p.hot,
      id: p.id,
      floor: p.ground ? p.y : undefined,
      vel: [p.vx, p.vy, p.vz],
      carry,
    });
    if (p.railed || p.rifled) {
      const q = s.rot[J.HAND_R];
      const m = tip(grip(s.pos[J.HAND_R], q), axes(q), kindOf(p));
      r.tip = [m[0] - p.x, m[1] - p.y, m[2] - p.z];
    }
  }
  if (r.dash > 0.15) {
    const [s, c] = [Math.sin(yaw), Math.cos(yaw)];
    const { x, y, z } = r.p;
    streaks(out, r, color, ([a, u, f]) => [x + a * c - f * s, y + u, z - a * s - f * c]);
  }
  return s;
};
