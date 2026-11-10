// The other players' model: a runner's skin (skin.ts) posed by its gait (gait.ts), in the
// renderer's vertex format. A runner is the last PlayerState seen and the gait that eases the body
// toward it; the dash streaks are the only thing drawn here that the gait does not pose. A
// player's (x, y, z) is the bottom of the feet. No DOM.
import {
  DASH_COOLDOWN,
  DASH_TICKS,
  DOWN_TICKS,
  HEAT_MAX,
  STEP_H,
  TICK_HZ,
} from '../shared/constants';
import { TAU, floored } from '../shared/physics';
import { LIMB, MODE } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import { KATANA_LEFT, KATANA_TILT, clasp, inv, reach, shrug, stowed, wield } from './body';
import { createGait, frame } from './gait';
import type { Floor, Gait, Seat } from './gait';
import {
  ARC,
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
  span,
  swapOf,
} from './gun';
import { helmet } from './helmet';
import { armor } from './armor';
import { hose, pack, shoulders } from './pack';
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
import { STRIDE, add, basis, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, axis, mul, slerp, solve } from './rig';
import type { Pose, Quat } from './rig';
import { body, cut, eyesOf, hairOf, palette, skin } from './skin';
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
  /** Seconds left of the grimace a hit puts on his face. */
  hurt: number;
  /** The seat he rides in, when he does and his rover is known. */
  seat?: Seat;
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

const dashing = (p: PlayerState) => p.dash > DASH_COOLDOWN - DASH_TICKS;

/** A runner as first seen: in the pose its state asks for, no ease. */
export const createRunner = (p: PlayerState, seat?: Seat): Runner => {
  const gait = createGait();
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
      r.hurt = p.hp < r.p.hp ? 0.4 : Math.max(r.hurt - dt, 0);
      r.p = { ...p };
    } else {
      book.set(p.id, createRunner(p, seat));
    }
    track(book.get(p.id)!, dt, ground(world, p.y), !r, tracer);
  }
};

/** The pose with the right arm `k` of the way to holding the gun out along the look of `p`. */
const lifted = (
  pose: Pose,
  s: ReturnType<typeof solve>,
  p: PlayerState,
  focused: Vec3,
  k: number,
): Pose => {
  // Seated, the eye the gun is held out from is lower.
  const [grip, ax] = aimed(p.mode == MODE.RIDE ? { ...p, y: p.y - SEATED } : p, focused);
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

/** How far a runner's rail gun is up toward his look when he is not firing it. */
const READY = 0.6;

/** The katana carried in both hands, upright before the right shoulder, the edge forward: the guard's numbers (see katana.ts) from the eye. */
const CARRY = [0.08, -0.28, 0.25, 0.27, 0.94, 0.21];
const ease = (v: number) => (v = Math.min(Math.max(v, 0), 1)) * v * (3 - 2 * v);

/**
 * The pose with the katana in both hands: carried, or in a cut, which is the first person's cut
 * seen from the runner's eye (the share `e` of it, so that it is drawn from the carry and back to
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
  let s = solve(pose);
  // Down or floored, the weapon stays in the hand as it falls. At the wheel both hands are on the yoke.
  const lying = !!p.down || floored(p) || driving(r);
  if (p.wield && !lying) {
    pose = brandish(pose, p, r.prog, r.gait.phase, r.t);
    s = solve(pose);
  } else if ((p.railed || p.rifled) && !lying) {
    // The rail gun or the rifle in both hands, at the ready when not firing: the left on its front grip, the
    // elbow down and out. On a wall it is put away, unless its bolt is going out (stowed()).
    if (p.railed && stowed(p)) {
      return { s, sink, yaw: pose.yaw };
    }
    pose = lifted(pose, s, p, r.focus, Math.max(r.aim, READY));
    s = solve(pose);
    const [at, g, up] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R], kindOf(p));
    const [x, u, f] = basis(p.yaw, 0);
    if (up) {
      shrug(pose, s, J.ARM_L, at);
    }
    wield(
      pose,
      s,
      J.ARM_L,
      at,
      g,
      [0, 1, 2].map(i => -0.5 * x[i] - u[i] - 0.35 * f[i]) as Vec3,
      up,
    );
    s = solve(pose);
  } else if (r.aim > 0.01 && p.ammo >= 0) {
    pose = lifted(pose, s, p, r.focus, r.aim);
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
export const soldier = (out: number[], r: Runner, color: number[], lod = 1, helmets = false) => {
  const { p } = r;
  const k = fried(p);
  if (k >= 1) {
    return;
  }
  const colors = palette(color, hairOf(p.id), eyesOf(p.id), helmets);
  const { s, sink, yaw, carry } = stance(r);
  const blade = p.wield && !p.down && !driving(r);
  if (r.cut) {
    skin(out, cut(lod, r.cut.limb)[0], s, colors, 1, 0.3);
    // The stump's face is the last vertex drawn.
    r.cut.at = out.slice(out.length - STRIDE, out.length - STRIDE + 3) as Vec3;
    piece(out, r.cut, colors, lod, sink);
  } else {
    const from = out.length;
    // His face: the eyes shut down, in a grimace and in a blink every few seconds; the mouth open
    // in a cut's shout, a dash's breath, a grimace, slack down.
    const down = p.down > 0;
    skin(
      out,
      body(lod),
      s,
      colors,
      +(down || r.hurt > 0 || (r.t + p.id * 0.7) % 3.7 < 0.13),
      r.prog >= 0 ? 1 : r.hurt > 0 ? 0.6 : down ? 0.3 : r.dash * 0.5,
    );
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
    armor(out, s.pos, s.rot, lod);
    shoulders(
      out,
      [J.ARM_L, J.ARM_R].map(j => [s.pos[j], s.rot[j]] as [Vec3, Quat]),
      lod,
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
  }
  if (r.dash > 0.15) {
    const [s, c] = [Math.sin(yaw), Math.cos(yaw)];
    const { x, y, z } = r.p;
    streaks(out, r, color, ([a, u, f]) => [x + a * c - f * s, y + u, z - a * s - f * c]);
  }
  return s;
};
