// The other players' model: a runner's skin (skin.ts) posed by its gait (gait.ts), in the
// renderer's vertex format. A runner is the last PlayerState seen and the gait that eases the body
// toward it; the dash streaks are the only thing drawn here that the gait does not pose. A
// player's (x, y, z) is the bottom of the feet. No DOM.
import {
  BLOW,
  DOWN_TICKS,
  EYE,
  HEAT_MAX,
  PUNCHES,
  RUN_SPEED,
  STEP_H,
  TICK_HZ,
} from '../shared/constants';
import { strike } from '../shared/blade';
import { TAU, floored } from '../shared/physics';
import { LIMB, MODE } from '../shared/types';
import type { Choice, PlayerState, Rover } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import {
  FIST,
  KATANA_LEFT,
  KATANA_TILT,
  clasp,
  hands,
  inv,
  reach,
  shrug,
  stowed,
  wield,
} from './body';
import { HOOK, JAB, LUNGE, SIDE, armOf, bare, blowOf, createGait, frame, thrown } from './gait';
import type { Floor, Gait, Seat } from './gait';
import {
  ARC,
  RIFLE_HOLD,
  RIFLE_TILT,
  BROUGHT,
  RIFLE_CURL,
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
import { helm } from './helm';
import { helmet } from './helmet';
import { HEAD_SCALE, STYLE, hair, styleOf, sway } from './hair';
import { ID, ORIGIN, mesh } from './store';
import { flesh } from './flesh';
import type { Pieces } from './store';
import { CLOTH, dress, mask } from './mask';
import { GOLD, pads } from './pads';
import { ROLE } from '../shared/kit';
import { armor } from './armor';
import { CUP_F, crotch, hose, pack } from './pack';
import { fetched, pouch, pouchAt } from './pouch';
import { buckle } from './buckle';
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
import { REGION, beardOf, body, cut, eyesOf, hairOf, palette, shaved, skin, tressOf } from './skin';
import { createFace, dashing, felled, strain } from './expression';
import type { Face } from './expression';
import { CH, toneFor } from './features';
import { createTrail } from './trail';
import type { Trail } from './trail';
import { room } from './verts';
import type { Out } from './verts';

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
  /** How far out the fist of a punch is, 0 to 1, eased, and its blow (BLOW). */
  jab: number;
  /** How closed his hands are, left then right, eased toward grasp(). */
  curls: number[];
  blow: number;
  /** How far his head is still thrown back by a blow he took, 1 to 0. */
  flinch: number;
  /** His face (expression.ts), and the seconds it has yet to live through: soldier() moves it once drawn, where the head's turn is known. */
  face: Face;
  dt: number;
  /** The seat he rides in, when he does and his rover is known. */
  seat?: Seat;
  /** The head of the runner he looks at (watched()), and how far his own is turned to it, eased: to his right and up, radians. */
  watch?: Vec3;
  /** The id of the runner he looks at, kept while he can be followed. */
  watching?: number;
  gaze?: number[];
  /** The muzzle of the long gun in his hands as last drawn, from his feet: where its shots are seen to leave (combat.ts). */
  tip?: Vec3;
  /** The BUILD of the body (rig.ts, PlayerInfo.body): the man's when absent. */
  build?: number;
  /** The skin and haircut the player picked (PlayerInfo.tone and hair): his id's when absent. */
  look?: Choice;
}

/** A man's haircuts (look.ts's HAIR_NAMES[0]): how long the hair stands off the scalp, the first one shaved. */
export const LENGTHS = [0, 0.18, 0.55, 1];

/** Whether two looks draw the same runner. */
const same = (a?: Choice, b?: Choice) =>
  a?.tone === b?.tone && a?.hair === b?.hair && a?.role === b?.role;

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

/**
 * A woman's traits on the face of her id: never the heavy brow ridge, the wide jaw or the long
 * lower face of the draw, fuller lips, and the scalp's hair flat under her style (hair.ts).
 */
export const femme = (w: Float32Array) => {
  w[CH.RIDGE] = Math.min(w[CH.RIDGE], 0) - 0.3;
  w[CH.JOWL] = Math.min(w[CH.JOWL] * 0.5, 0.1) - 0.2;
  w[CH.CHIN] = Math.min(w[CH.CHIN] * 0.6, 0.2);
  w[CH.NOSE_W] = Math.min(w[CH.NOSE_W], 0.3);
  w[CH.LIPS] = Math.max(w[CH.LIPS], 0) * 0.6 + 0.3;
  w[CH.LIDS] = Math.min(w[CH.LIDS], 0.3);
  w[CH.HAIR] = 0;
  w[CH.EARS] = Math.min(w[CH.EARS], 0) - 0.4;
};

/** A runner as first seen: in the pose its state asks for, no ease. */
/** `calm`: at ease, not in a fighter's guard (the menu's picture, the user 2026-11-12). */
export const createRunner = (
  p: PlayerState,
  seat?: Seat,
  build = 0,
  look?: Choice,
  calm = false,
): Runner => {
  const gait = createGait(calm ? 0 : undefined, build);
  const face = createFace(p.id);
  face.w[CH.HAIR] =
    !build && look?.hair !== undefined ? LENGTHS[look.hair] : face.w[CH.HAIR] * +!shaved(p.id);
  if (build) {
    femme(face.w);
  }
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
    curls: grasp(p),
    blow: 0,
    flinch: 0,
    face,
    dt: 0,
    build,
    look,
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
/**
 * The head turns to the runner one looks at (the user, 2026-11-12): the nearest within `far`
 * metres and `cone` radians of his aim. It turns no further than `turn` (to a side, up or down)
 * from where it points, the eyes going the rest of their travel; `rate` is how fast, per second.
 * The one looked at is followed as he goes by (the user, 2026-11-14): kept, over a nearer one,
 * until he is `hold` radians off the aim (the head's 80 degrees and the eyes' travel, REACH_X)
 * or `keep` metres away.
 */
export const WATCH = { far: 14, keep: 18, cone: 1.2, hold: 2, turn: [1.4, 0.5], rate: 7 };

/** The runner `p` looks at among `crowd`, and where his head is: none when he looks at no one, or is down. `held` is the one he looked at last. */
export const watched = (
  p: PlayerState,
  crowd: PlayerState[],
  held?: number,
): { id: number; at: Vec3 } | undefined => {
  if (p.down) {
    return;
  }
  const f = basis(p.yaw, p.pitch)[2];
  let best: PlayerState | undefined;
  let near = WATCH.far;
  for (const q of crowd) {
    const d = [q.x - p.x, q.y - p.y, q.z - p.z];
    const l = Math.hypot(...d);
    const kept = q.id == held;
    if (q.id == p.id || l >= (kept ? WATCH.keep : near) || l < 0.3 || fried(q) >= 1) {
      continue;
    }
    const off = Math.acos(Math.min(Math.max((d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / l, -1), 1));
    if (kept && off < WATCH.hold) {
      best = q;
      break;
    }
    if (off < WATCH.cone) {
      near = l;
      best = q;
    }
  }
  // A man down is looked at where he lies.
  return best && { id: best.id, at: [best.x, best.y + (best.down ? 0.3 : EYE + 0.06), best.z] };
};

/** A blow taken: seconds it lasts, and how far it throws the head and the chest back (radians). */
const FLINCH = [0.35, 0.45, 0.12];

export const animate = (
  book: Map<number, Runner>,
  others: PlayerState[],
  dt: number,
  world?: World,
  tracer?: Pick<Tracer, 'shock' | 'spit'>,
  rovers?: Rover[],
  builds?: ReadonlyMap<number, number>,
  looks?: ReadonlyMap<number, Choice>,
) => {
  for (const id of book.keys()) {
    if (!others.some(p => p.id == id)) {
      book.delete(id);
    }
  }
  for (const p of others) {
    const seen = book.get(p.id);
    if (seen) {
      const w = watched(p, others, seen.watching);
      seen.watch = w?.at;
      seen.watching = w?.id;
    }
    const build = builds?.get(p.id) ?? 0;
    const look = looks?.get(p.id);
    // A roster that says another body or look than the one drawn (it came after him): a new runner.
    const old = book.get(p.id);
    const r = old?.build == build && same(old.look, look) ? old : undefined;
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
      const g = grasp(p, r.seat);
      r.curls = r.curls.map((c, i) => c + (g[i] - c) * (1 - Math.exp(-dt * CLOSE)));
      r.blow = thrown(p) > 0 ? blowOf(p) : r.blow;
      r.flinch = Math.max(r.flinch - dt / FLINCH[0], 0);
      // A blow of his fists the host counted: the nearest he reaches, in his arc, flinches.
      const hit = world && bare(p) && p.hits != r.p.hits && p.swing;
      if (hit) {
        const near = strike(
          world,
          p,
          others.filter(q => q.id != p.id),
          PUNCHES[blowOf(p)],
        );
        const d = (q: PlayerState) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
        const foe = near.sort((a, b) => d(a) - d(b))[0];
        const fr = foe && book.get(foe.id);
        if (fr) {
          fr.flinch = 1;
        }
      }
      r.p = { ...p };
    } else {
      book.set(p.id, createRunner(p, seat, build, look));
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
const streaks = (out: Out, r: Runner, color: number[], at: (v: Vec3) => Vec3) => {
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
const driving = (r: Pick<Runner, 'p' | 'seat'>) => r.p.mode == MODE.RIDE && r.seat?.s === 0;

/** How fast a hand closes or opens, 1 / s. */
const CLOSE = 14;

/**
 * How closed the hands of `p` are, left then right (hand() in body.ts: 0 flat, 0.9 round a grip, 1
 * a fist), as the own body closes its own: round what they hold and on the wheel, fists with
 * nothing in them (the guard), a loose fist on a run, tighter at a sprint, open in the air, flat
 * on a ledge, a wall or the floor, limp lying down.
 */
export const grasp = (p: PlayerState, seat?: Seat): number[] => {
  if (p.down || floored(p)) {
    return [0.3, 0.3];
  }
  if (driving({ p, seat })) {
    return [0.9, 0.9];
  }
  const armed = p.ammo >= 0 || !!p.railed || !!p.rifled || !!p.wield;
  const pace = Math.min(Math.max((Math.hypot(p.vx, p.vz) - RUN_SPEED) / 3, 0), 1);
  const free = dashing(p)
    ? 1
    : p.mode == MODE.HANG || p.mode == MODE.CLIMB || p.mode == MODE.WALLRUN || p.mode == MODE.SLIDE
      ? 0.1
      : p.stun > 0
        ? 0.25
        : p.mode == MODE.AIR
          ? 0.35
          : armed
            ? 0.75 + 0.15 * pace
            : 1;
  if (p.wield) {
    return [0.9, 0.9];
  }
  if (p.rifled || (p.railed && !stowed(p))) {
    return [p.rifled ? RIFLE_CURL : 0.9, 0.9];
  }
  // In a swap the left hand brings the new battery up from the pouch.
  return [
    p.ammo >= 0 && !p.railed && swapOf(p) >= 0 ? 0.7 : free,
    (p.railed ? !stowed(p) : p.ammo >= 0) ? 0.9 : free,
  ];
};

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
export const dissolve = (out: Out, from: number, k: number) => {
  const T = 3 * STRIDE;
  let w = from;
  const a = room(out, 0);
  for (let o = from, i = 0; o < out.length; o += T, i++) {
    const h = ((Math.imul(i + 1, 0x9e3779b1) >>> 0) % 1000) / 1000;
    if (h < k) {
      continue;
    }
    const lift = [Math.sin(i) * 0.3, 1.2 * h, Math.cos(i) * 0.3].map(v => v * k * k);
    const glow = Math.min(1, k * 4);
    for (let v = 0; v < T; v += STRIDE) {
      for (let j = 0; j < STRIDE; j++) {
        a[w + v + j] = a[o + v + j] + (j < 3 ? lift[j] : 0);
      }
      [6, 7, 9].forEach((j, c) => (a[w + v + j] += (ARC[c] * (1 - k) - a[w + v + j]) * glow));
      a[w + v + 8] = glow > 0.5 ? -2 : a[w + v + 8];
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
    // A punch: the striking fist out (the blow's), the other back to the hip, the chest behind it.
    const rot = pose.rot.slice();
    const sd = SIDE[r.blow];
    const blow = r.blow == BLOW.HOOK ? HOOK : r.blow == BLOW.LUNGE ? LUNGE : JAB;
    const [out, back] = [armOf(sd, blow.out), armOf(-sd, JAB.back)];
    const [a, f, ba, bf] =
      sd < 0
        ? [J.ARM_L, J.FOREARM_L, J.ARM_R, J.FOREARM_R]
        : [J.ARM_R, J.FOREARM_R, J.ARM_L, J.FOREARM_L];
    rot[a] = slerp(rot[a], out[0], r.jab);
    rot[f] = slerp(rot[f], out[1], r.jab);
    rot[ba] = slerp(rot[ba], back[0], r.jab);
    rot[bf] = slerp(rot[bf], back[1], r.jab);
    rot[J.CHEST] = mul(axis([0, 1, 0], sd * blow.twist * r.jab), rot[J.CHEST]);
    pose = { ...pose, rot };
  }
  if (r.flinch > 0 && !lying) {
    // Hit by a fist: the head snapped back and the chest after it, springing back.
    const rot = pose.rot.slice();
    const t = 1 - r.flinch;
    const k = t < 0.2 ? t / 0.2 : (1 - t) / 0.8;
    rot[J.HEAD] = mul(rot[J.HEAD], axis([1, 0, 0], FLINCH[1] * k));
    rot[J.CHEST] = mul(rot[J.CHEST], axis([1, 0, 0], FLINCH[2] * k));
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

/**
 * The runner's hands on his wrists (hands() in body.ts), the fingers closed as r.curls says: none
 * far, where the skin's sleeves end in mittens; lighter near. A space suit's gloves cover the
 * fingertips. Not the hand of an arm a cut took off.
 */
const gloves = (
  out: Out,
  r: Runner,
  s: ReturnType<typeof solve>,
  colors: number[][],
  lod: number,
  suit: boolean,
  limb: number = LIMB.NONE,
) => {
  if (!lod) {
    return;
  }
  const { p } = r;
  const glove = colors[REGION.GLOVE];
  hands(
    out,
    s,
    r.build ?? 0,
    r.curls,
    glove,
    suit ? glove : colors[REGION.FLESH],
    // The left thumb up the rifle's handguard.
    { cup: +(!!p.rifled && !p.down && !floored(p) && !driving(r)) },
    lod < 3,
    limb == LIMB.ARM_L ? J.HAND_L : limb == LIMB.ARM_R ? J.HAND_R : -1,
  );
};

/** Draws the runner and gives back its solved skeleton, or nothing once a bolt has burnt it away. */
export const soldier = (
  out: Out,
  r: Runner,
  color: number[],
  lod = 1,
  helmets = false,
  armored = helmets,
  /** The frame's pieces of the store: the rigid ones go there (store.ts), but on one coming apart. */
  list?: Pieces,
) => {
  const { p } = r;
  const k = fried(p);
  if (k >= 1) {
    return;
  }
  const gpu = k > 0 ? undefined : list;
  /** A rigid piece on a joint: into `out`, or made once at the origin into the store and placed there, `scale` its size. */
  const rigid = (
    key: string,
    at: Vec3,
    q: Quat,
    make: (o: Out, at: Vec3, q: Quat) => void,
    scale = 1,
  ) =>
    gpu
      ? gpu.push({ m: mesh(key, o => make(o, ORIGIN, ID)), q, t: at, k: scale })
      : make(out, at, q);
  r.tip = undefined;
  const [build, picked] = [r.build ?? 0, r.look];
  // The ninja (the user, 2026-11-12): a tight black suit, his team's colour on its side stripes and
  // its belt, a hood and a guard over the mouth; an armour of his own (2026-11-13): armor.ts's
  // `alone` plates, and the shoulder pads and collar of pads.ts.
  const ninja = picked?.role === ROLE.NINJA;
  const plated = armored;
  armored &&= !ninja;
  const colors = palette(
    ninja ? CLOTH : color,
    build ? tressOf(p.id, picked) : hairOf(p.id, picked),
    eyesOf(p.id, picked),
    armored,
    toneFor(p.id, picked),
    build ? 0 : beardOf(p.id),
    !!build,
  );
  if (ninja) {
    const { PANTS, UPPER, GLOVE, STRIPE, STRIPE_LOW, BELT } = REGION;
    [colors[PANTS], colors[UPPER], colors[GLOVE]] = [CLOTH, CLOTH, CLOTH];
    // His belt is cut in a V by armor() (BELT in armor.ts), the skin's under it black.
    [colors[STRIPE], colors[STRIPE_LOW], colors[BELT]] = [color, color, CLOTH];
  }
  if (build && styleOf(p.id, picked) == STYLE.UNDERCUT) {
    // A shaved side: the scalp's hair is stubble, the skin showing through it.
    colors[4] = colors[4].map((v, i) => v * 0.5 + colors[3][i] * 0.42);
  }
  // The armour: white in space, else in the team's colour.
  const plate = helmets ? undefined : color;
  const { s, sink, yaw, carry } = stance(r);
  // His face: a wince when hit, a grimace down, a shout in a cut or a dash, effort in a sprint or a
  // climb, focus aiming, a grin; the eyes on his aim from where the head points.
  // The head on the runner he looks at, as far as it turns; the eyes on him, or on the aim.
  const [hx, hy, hz] = s.pos[J.HEAD];
  const to =
    r.watch && turn(inv(s.rot[J.HEAD]), [r.watch[0] - hx, r.watch[1] - hy, r.watch[2] - hz]);
  const want = to
    ? [Math.atan2(to[0], -to[2]), Math.atan2(to[1], Math.hypot(to[0], to[2]))].map((a, i) =>
        Math.min(Math.max(a, -WATCH.turn[i]), WATCH.turn[i]),
      )
    : [0, 0];
  const near = 1 - Math.exp(-r.dt * WATCH.rate);
  r.gaze = (r.gaze ?? [0, 0]).map((a, i) => a + (want[i] - a) * near);
  if (Math.hypot(...r.gaze) > 1e-4) {
    s.rot[J.HEAD] = mul(
      s.rot[J.HEAD],
      mul(axis([0, 1, 0], -r.gaze[0]), axis([1, 0, 0], r.gaze[1])),
    );
  }
  const look = turn(
    inv(s.rot[J.HEAD]),
    r.watch ? [r.watch[0] - hx, r.watch[1] - hy, r.watch[2] - hz] : basis(p.yaw, p.pitch)[2],
  );
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
    const cs = cut(lod, r.cut.limb, build)[0];
    const at = out.length;
    skin(out, cs, s, colors, r.face.w);
    // The stump's face is the last vertex drawn.
    r.cut.at = out.slice(out.length - STRIDE, out.length - STRIDE + 3) as Vec3;
    if (plated || ninja) {
      armor(out, at, cs, lod > 2, plate, ninja, color, !plated);
    }
    if (ninja) {
      rigid(`buckle ${build} ${color}`, s.pos[J.PELVIS], s.rot[J.PELVIS], (o, a, q) =>
        buckle(o, a, q, build, color),
      );
    }
    piece(out, r.cut, colors, lod, sink, r.face.w, armored);
    gloves(out, r, s, colors, lod, armored, r.cut.limb);
  } else {
    const from = out.length;
    const bs = body(lod, build);
    // Under a helmet's dark visor no face shows: its channels are not worth their time.
    const face = helmets ? undefined : r.face.w;
    if (gpu) {
      // Posed by the shader, the hood and the armour too (flesh.ts).
      flesh(
        gpu,
        bs,
        s,
        colors,
        face,
        plated || ninja ? { fine: lod > 2, plate, accent: color, ninja, bare: !plated } : undefined,
        ninja && !helmets ? build : undefined,
      );
    } else {
      skin(out, bs, s, colors, face);
      if (ninja && !helmets) {
        // The hood painted on the head, the face under the guard pressed in.
        dress(out, from, bs, s.pos[J.HEAD], s.rot[J.HEAD], build);
      }
      // The armour, cut out of the skin just drawn.
      if (plated || ninja) {
        armor(out, from, bs, lod > 2, plate, ninja, color, !plated);
      }
    }
    rigid('pouch', s.pos[J.PELVIS], s.rot[J.PELVIS], pouch);
    if (ninja) {
      rigid(`buckle ${build} ${color}`, s.pos[J.PELVIS], s.rot[J.PELVIS], (o, a, q) =>
        buckle(o, a, q, build, color),
      );
    }
    gloves(out, r, s, colors, lod, armored);
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // Her hair, on her head while it is on her; tucked in under a helmet or the ninja's hood.
  if (build && !helmets && !ninja && r.cut?.limb !== LIMB.HEAD) {
    const from = out.length;
    hair(
      out,
      s.pos[J.HEAD],
      s.rot[J.HEAD],
      styleOf(p.id, picked),
      tressOf(p.id, picked),
      lod,
      sway(r.gait.phase, Math.hypot(p.vx, p.vz), r.t),
    );
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The ninja's pads and collar; the marine's shoulder bells.
  if (plated) {
    const from = out.length;
    pads(out, s, build, ninja ? GOLD : (plate ?? [0.85, 0.86, 0.88]), !ninja, color, !lod, gpu);
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  if (ninja && !helmets && r.cut?.limb !== LIMB.HEAD) {
    const from = out.length;
    if (gpu) {
      // Hers is his, smaller.
      rigid(
        `mask ${color} ${!lod}`,
        s.pos[J.HEAD],
        s.rot[J.HEAD],
        (o, a, q) => mask(o, a, q, 0, color, !lod),
        build ? HEAD_SCALE : 1,
      );
    } else {
      mask(out, s.pos[J.HEAD], s.rot[J.HEAD], build, color, !lod);
    }
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The helmet is on the head: not on one a katana cut has taken off.
  if (helmets && r.cut?.limb !== LIMB.HEAD) {
    if (build) {
      // Hers is another helmet, with no hose: told from his at a glance.
      rigid(`helm ${color} ${lod}`, s.pos[J.HEAD], s.rot[J.HEAD], (o, a, q) =>
        helm(o, a, q, color, lod),
      );
    } else {
      rigid(`helmet ${color} ${lod}`, s.pos[J.HEAD], s.rot[J.HEAD], (o, a, q) =>
        helmet(o, a, q, color, lod),
      );
      hose(out, s.pos[J.HEAD], s.rot[J.HEAD], s.pos[J.CHEST], s.rot[J.CHEST], lod);
    }
  }
  // The life support pack on the back of a space suit.
  if (helmets) {
    rigid(`pack ${color} ${lod}`, s.pos[J.CHEST], s.rot[J.CHEST], (o, a, q) =>
      pack(o, a, q, color, lod),
    );
  }
  if (armored) {
    rigid(`crotch ${plate} ${build}`, s.pos[J.PELVIS], s.rot[J.PELVIS], (o, a, q) =>
      crotch(o, a, q, plate, build ? CUP_F : 1),
    );
  }
  if (blade) {
    sword(out, s.pos[J.HAND_R], s.rot[J.HAND_R], Math.min(lod, 1), r.t, 1, 1, 0, gpu);
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
      list: gpu,
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
