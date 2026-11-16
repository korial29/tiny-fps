// The xenomorph on all fours (the user, 2026-11-16, after the gait of running animals): a gallop
// on a floor once it runs past a run, a lizard's crawl on a wall it clings to. The body is laid out
// in the frame of the surface it is on (ahead along it, to its right, out of it), so a floor and a
// wall are the same sum: the trunk along the surface, each paw planted on it until its stride lifts
// it, the limbs by two-bone IK. stance() in soldier.ts lays it over the runner's pose. No DOM.
import { BLOW, PLAYER_R } from '../shared/constants';
import { TAU, TOWARD } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { inv, reach } from './body';
import { frame } from './gait';
import type { Floor } from './gait';
import { dot, unit } from './mesh';
import type { Vec3 } from './mesh';
import { cross } from './helmet';
import { JOINT as J, JOINTS, RESTS, axis, mul, slerp, solve, turn } from './rig';
import type { Pose, Quat } from './rig';
import { damp } from './spring';
import { FOOT_TIP } from './xeno';

/** How far the xenomorph's foot is tipped down from flat on its ball, radians: steep, the arch of its sole showing. */
export const FOOT_UP = 1.0;

/** Floor speeds, m/s: past the first it drops on all fours (a sprint: its run is 6.6), under the second it stands again. */
export const [DROP, RISE] = [7.2, 6.2];

/**
 * The gaits, per paw (hind left, hind right, fore left, fore right): where in the stride it touches
 * down and the share of the stride it stays down. GALLOP is a cheetah's rotary gallop: the hind
 * pair a beat apart and the fore pair the other way round, a flight between them with the back
 * stretched out and one after with it gathered, the fore paws down for less time. CRAWL is a
 * lizard's trot: the diagonal pairs together, the body bending side to side between them.
 */
export const GALLOP = { at: [0, 0.1, 0.6, 0.5], duty: [0.3, 0.3, 0.22, 0.22] };
export const CRAWL = { at: [0.5, 0, 0, 0.5], duty: [0.55, 0.55, 0.55, 0.55] };

/**
 * Where each paw stands from the middle of the body, ahead and to the right (metres), on a floor
 * then on a wall, the hind legs stretched flat behind there (the user, 2026-11-16); the left ones mirrored.
 */
const HOME = [
  [
    [-0.3, 0.13],
    [0.22, 0.16],
  ],
  [
    [-0.68, 0.15],
    [0.22, 0.16],
  ],
];
/** The pelvis's place behind the middle of the body: the shoulders end up as far ahead of it. */
const HALF = 0.26;
/** The pelvis's height off the surface. */
const HIGH = 0.64;
/** On a wall: the pelvis's distance from it, low so the hind legs lie flat behind, and how far the long foot is tipped off it. */
const [FLAT, ARCH] = [0.4, 0.35];
/** The trunk's tilt on a floor, its front down: the hind legs are the longer. */
const TILT = 0.3;
/** How high a swinging paw rises, on a floor and on a wall, metres. */
const LIFT = [0.22, 0.1];
/** The longest a stance is, metres: the arms reach no further. */
const STANCE = 0.75;
/** The middle of the body over the feet on a wall: the cylinder's. */
const MID = 0.9;
/** A paw that strays this far from its home is lifted. */
const STRAY = 0.35;

const [X, Y, Z]: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const ease = (v: number) => (v = clamp(v)) * v * (3 - 2 * v);
const arc = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
/** a + p b + q c + r d. */
const sum = (a: Vec3, b: Vec3, p: number, c: Vec3 = X, q = 0, d: Vec3 = X, r = 0): Vec3 =>
  a.map((v, i) => v + b[i] * p + c[i] * q + d[i] * r) as Vec3;
/** p a + q b + r c. */
const of = (a: Vec3, p: number, b: Vec3 = X, q = 0, c: Vec3 = X, r = 0): Vec3 =>
  sum([0, 0, 0], a, p, b, q, c, r);
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];

interface Paw {
  on: boolean;
  /** Planted: the point of the world it stands on. */
  at: Vec3;
  /** Lifted: where it left from, in the surface's frame from the middle of the body (ahead, right, out), and the stride's phase then. */
  from: Vec3;
  dl: number;
  /** The phase last frame, the paw's place now in the world, and how far through a swing it is (0 down, 1 at its top). */
  u: number;
  now: Vec3;
  k: number;
}

export interface Fours {
  /** Moves to the state `p` after dt seconds; `floor` is the height of the ground under a point. */
  update(p: PlayerState, dt: number, floor?: Floor): void;
  /** `pose` with the body on all fours laid over it, as far as it has blended in. */
  apply(pose: Pose): Pose;
  /** How far on all fours, 0 to 1. */
  readonly weight: number;
  /** The stride's phase, in cycles. */
  readonly phase: number;
}

export const createFours = (): Fours => {
  /** Springs, a value and its speed each: on all fours, in the air. */
  const sp = [0, 0, 0, 0];
  const paws: Paw[] = [0, 1, 2, 3].map(() => ({
    on: false,
    at: [0, 0, 0],
    from: [0, 0, 0],
    dl: 0,
    u: 0,
    now: [0, 0, 0],
    k: 0,
  }));
  /** The surface's frame (x right, y out of it, -z ahead) and the middle of the body's foot on it, from the player. */
  let S: Quat = [0, 0, 0, 1];
  let off: Vec3 = [0, 0, 0];
  let [ph, heading, climb, fast, live, wall, known] = [0, 0, 0, false, false, false, false];
  let last: Vec3 = [0, 0, 0];
  let at: Vec3 = [0, 0, 0];
  let [look, pitch] = [0, 0];
  /** The body: the pelvis's height off the surface, the back's bend (1 gathered, -1 stretched), its sway to the side. */
  let [high, flex, bend] = [HIGH, 0, 0];

  const update = (p: PlayerState, dt: number, floor?: Floor) => {
    dt = clamp(dt, 0, 0.1);
    const fresh = !known || Math.hypot(p.x - last[0], p.y - last[1], p.z - last[2]) > 5;
    [last, known, at, look, pitch] = [[p.x, p.y, p.z], true, [p.x, p.y, p.z], p.yaw, p.pitch];
    const walks = p.mode == MODE.GROUND || p.mode == MODE.CROUCH;
    const air = p.mode == MODE.AIR;
    const cling = p.mode == MODE.CLING && p.wall > 0;
    const speed = Math.hypot(p.vx, p.vz);
    // A leap keeps it on all fours, off a gallop or off a wall.
    fast = walks ? speed > (fast ? RISE : DROP) : air && (fast || (wall && speed > DROP));
    // Its claws strike reared up; its tail's sting does not need it to.
    const claws = !!p.swing && p.cut != BLOW.TAIL;
    const want = (cling || fast) && !p.down && !p.stun && !claws;
    if (fresh) {
      [sp[0], sp[1], sp[2], sp[3]] = [+want, 0, +air, 0];
    } else {
      damp(sp, 0, +want, 9, dt);
      damp(sp, 2, +air, 10, dt);
    }
    const reset = !live || fresh || cling != wall;
    live = want || sp[0] > 0.002;
    if (!live) {
      return;
    }
    const ground = (x: number, z: number) => {
      const g = floor ? floor(x, z) : p.y;
      return Math.abs(g - p.y) < 0.6 ? g : p.y;
    };

    // The surface: a floor under it, or the wall it clings to, the body heading up it, along it
    // or down it as it goes.
    let [St, to]: [Quat, Vec3] = [S, off];
    if (cling) {
      const [nx, nz] = TOWARD[p.wall];
      const N: Vec3 = [-nx, 0, -nz];
      const side: Vec3 = [-nz, 0, nx];
      const [vu, vs] = [p.vy, p.vx * side[0] + p.vz * side[2]];
      if (vu * vu + vs * vs > 0.25) {
        const way = Math.atan2(vs, vu);
        climb = reset ? way : climb + arc(climb, way) * (1 - Math.exp(-8 * dt));
      } else if (reset) {
        climb = 0;
      }
      const F = of(Y, Math.cos(climb), side, Math.sin(climb));
      St = frame(cross(F, N), neg(N));
      to = [nx * PLAYER_R, MID, nz * PLAYER_R];
    } else {
      heading = speed > 1 ? Math.atan2(-p.vx, -p.vz) : reset ? p.yaw : heading;
      St = axis(Y, heading);
      to = [0, walks ? ground(p.x, p.z) - p.y : 0, 0];
    }
    if (fresh || (reset && sp[0] < 0.05)) {
      [S, off] = [St, to];
    } else {
      const k = 1 - Math.exp(-12 * dt);
      S = slerp(S, St, k);
      off = sum(off, sum(to, off, -1), k);
    }
    wall = cling;
    const [R, N, F] = [turn(S, X), turn(S, Y), turn(S, neg(Z))];
    const O = sum(at, off, 1);
    const world = ([f, r, n]: Vec3): Vec3 => sum(O, F, f, R, r, N, n);
    const rel = (w: Vec3): Vec3 => {
      const d = sum(w, O, -1);
      return [dot(d, F), dot(d, R), dot(d, N)];
    };

    // The stride: its rate and how far each stance carries the body, by the speed along the surface.
    const v3: Vec3 = [p.vx, p.vy, p.vz];
    const v = Math.hypot(...sum(v3, N, -dot(v3, N)));
    const ahead = dot(v3, F);
    const G = cling ? CRAWL : GALLOP;
    const rate = cling ? 1.2 + 0.6 * v : 2 + 0.08 * v;
    const moving = v > 0.3;
    if (moving || paws.some(w => !w.on)) {
      ph = (ph + (moving ? rate : 2.5) * dt) % 1;
    }
    const fly = sp[2];
    const g = clamp(v / (cling ? 2 : 6));
    paws.forEach((w, i) => {
      const s = i % 2 ? 1 : -1;
      const fore = i > 1;
      const [f0, r0] = HOME[+cling][+fore];
      const u = (ph - G.at[i] + 1) % 1;
      const duty = G.duty[i];
      const half = Math.min((v * duty) / rate, STANCE) / 2;
      const swing = (): Vec3 => {
        const t = clamp((u - w.dl) / (1 - w.dl + 1e-6));
        const e = ease(t);
        w.k = Math.sin(Math.PI * t);
        // Through the world it eases out and in (a smootherstep, flat at both ends), while the body
        // goes on under it: the paw leaves the ground and lands on it still, not skating.
        const go = (ahead * (1 - w.dl)) / rate;
        const E = t * t * t * (t * (6 * t - 15) + 10);
        return [
          w.from[0] + (f0 + half - w.from[0] + go) * E - go * t,
          w.from[1] + (s * r0 - w.from[1]) * e,
          w.from[2] * (1 - e) + LIFT[+cling] * w.k,
        ];
      };
      if (reset) {
        [w.on, w.from, w.dl] = [false, [f0, s * r0, 0.05], u];
      }
      if (air) {
        // In a leap the body stretches out: the fore paws reach ahead, the hind ones trail.
        const pos = w.on ? rel(w.at) : swing();
        [w.on, w.from, w.dl] = [false, pos, u];
      } else if (w.on) {
        const [f, r, n] = rel(w.at);
        if (
          u >= duty ||
          u < w.u ||
          Math.abs(f - f0) > half + STRAY ||
          Math.abs(r - s * r0) > STRAY ||
          Math.abs(n) > STRAY
        ) {
          [w.on, w.from, w.dl] = [false, [f, r, n], u];
        }
      } else if (u < w.u) {
        // Down where the swing ended, the body gone on since by `u` of a stride: on the floor
        // under it, or on the wall's face.
        const t = world([f0 + half - (ahead * u) / rate, s * r0, 0]);
        w.at = cling ? t : [t[0], ground(t[0], t[2]), t[2]];
        w.on = true;
      }
      w.u = u;
      let pos = w.on ? rel(w.at) : swing();
      w.k = w.on ? 0 : w.k;
      if (fly > 0.002) {
        const reach: Vec3 = fore ? [f0 + 0.3, s * r0, 0.25] : [f0 - 0.35, s * r0, 0.3];
        pos = sum(pos, sum(reach, pos, -1), fly);
        w.k += (0.7 - w.k) * fly;
      }
      w.now = world(pos);
    });
    // The back gathers as the hind paws come through and stretches as the fore ones reach out; the
    // pelvis rises in the two flights. On a wall the trunk sways to the side with the stride instead.
    flex = cling ? 0 : g * Math.cos(TAU * (ph - 0.93)) * (1 - fly) - 0.6 * fly;
    bend = cling ? 0.2 * g * Math.cos(TAU * ph) : 0;
    high = cling ? FLAT : HIGH + 0.05 * g * Math.cos(2 * TAU * (ph - 0.44));
  };

  const apply = (pose: Pose): Pose => {
    const w = sp[0];
    if (w < 0.002 || !live) {
      return pose;
    }
    const q: Pose = { ...pose, hips: [...pose.hips], rot: pose.rot.map(r => [...r] as Quat) };
    const { rot } = q;
    const REST = pose.rest ?? RESTS[0];
    const [R, N, F] = [turn(S, X), turn(S, Y), turn(S, neg(Z))];
    const O = sum(at, off, 1);
    const root = axis(Y, pose.yaw);
    const tilt = TILT;
    // The trunk along the surface, its belly to it: up the spine ahead, its front toward the surface.
    const trunk = frame(R, neg(F));
    rot[J.PELVIS] = mul(inv(root), mul(trunk, mul(axis(X, -tilt + 0.22 * flex), axis(Z, bend))));
    rot[J.SPINE] = mul(axis(X, -0.15 * flex), axis(Z, -bend));
    rot[J.CHEST] = mul(axis(X, -0.12 * flex), axis(Z, -bend));
    const hip = sum(sum(O, N, high, F, -HALF), at, -1);
    q.hips = sum(turn(inv(root), hip), REST[0], -1);
    for (let j = J.CLAVICLE_L; j < JOINTS; j++) {
      rot[j] = [0, 0, 0, 1];
    }
    const s0 = solve(q);
    // A wall is posed as a floor (the user, 2026-11-16): the knees ahead, the elbows back.
    const arch = wall ? ARCH : FOOT_UP;
    const foot = (p: Paw) => mul(S, axis(X, -(arch + 0.5 * p.k)));
    paws.forEach((p, i) => {
      const s = i % 2 ? 1 : -1;
      if (i > 1) {
        // The palm on the surface, the claws ahead; folded back in a swing.
        const b = 1.1 * p.k;
        const d = of(F, Math.cos(b), N, -Math.sin(b));
        reach(
          q,
          s0,
          s < 0 ? J.ARM_L : J.ARM_R,
          sum(p.now, d, -0.06, N, 0.035),
          unit(of(F, -1, R, 0.35 * s, N, 0.1)),
        );
      } else {
        // The ball of the foot on the surface and the long foot near upright over it.
        reach(
          q,
          s0,
          s < 0 ? J.THIGH_L : J.THIGH_R,
          sum(sum(p.now, N, 0.02), turn(foot(p), FOOT_TIP), -1),
          unit(of(F, 1, R, 0.2 * s)),
        );
      }
    });
    const s1 = solve(q);
    paws.forEach((p, i) => {
      const s = i % 2 ? 1 : -1;
      if (i > 1) {
        const [b, a] = [1.1 * p.k, F];
        const hand = s < 0 ? J.HAND_L : J.HAND_R;
        const palm = frame(
          of(N, s * Math.cos(b), a, s * Math.sin(b)),
          of(a, Math.cos(b), N, -Math.sin(b)),
        );
        rot[hand] = mul(inv(s1.rot[hand - 1]), palm);
      } else {
        const j = s < 0 ? J.FOOT_L : J.FOOT_R;
        rot[j] = mul(inv(s1.rot[j - 1]), foot(p));
        rot[j + 1] = axis(X, (arch + 0.5 * p.k) * (1 - p.k));
      }
    });
    // The head up off the trunk, ahead: on a floor most of the way to the look, on a wall ahead up it
    // and a little out, turned only a little to the look.
    const s2 = solve(q);
    const aim = mul(axis(Y, look), axis(X, clamp(pitch, -1, 1) * 0.9));
    let head: Quat;
    if (wall) {
      const [d, u] = [unit(sum(F, N, 0.45)), unit(sum(N, F, -0.45))];
      head = slerp(frame(cross(d, u), neg(u)), aim, 0.25);
    } else {
      head = slerp(mul(axis(Y, heading), axis(X, 0.1)), aim, 0.7);
    }
    const rel = mul(inv(s2.rot[J.CHEST]), head);
    rot[J.NECK] = slerp([0, 0, 0, 1], rel, 0.4);
    rot[J.HEAD] = mul(inv(rot[J.NECK]), rel);
    // As far as it has blended in.
    return {
      ...pose,
      hips: pose.hips.map((v, i) => v + (q.hips[i] - v) * w) as Vec3,
      rot: pose.rot.map((r, j) => slerp(r, rot[j], w)),
    };
  };

  return {
    update,
    apply,
    get weight() {
      return live ? clamp(sp[0]) : 0;
    },
    get phase() {
      return ph;
    },
  };
};
