import { DASH_COOLDOWN, DASH_TICKS, DOWN_TICKS, TICK_HZ } from '../../shared/constants';
import { TOWARD, floored } from '../../shared/physics';
import { FALL, MODE } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import type { Vec3 } from '../mesh';
import { JOINT as J, PARENT, RESTS, axis, mul, rest, slerp, solve, turn } from '../rig';
import type { Quat } from '../rig';
import { grips } from '../rover';
import { damp, sway } from '../spring';
import type { Floor, Foot, Gait, Seat } from './types';
import {
  ARM_M,
  FORE_M,
  LEG,
  SOLE,
  TAU,
  X,
  Y,
  Z,
  arc,
  clamp,
  cross,
  ease,
  frame,
  inv,
  limb,
  lin,
  low,
  perp,
  rnd,
  roll,
  unit,
} from './maths';
import type { Key } from './moves';
import {
  FALLS,
  FK,
  GAITS,
  IDENT,
  MOVE,
  MOVES,
  SIT,
  SPEEDS,
  SWIM_PITCH,
  THROW,
  fk,
  keyed,
  stroke,
  strokeRate,
  strokeShare,
  tipped,
} from './moves';
import {
  BANK,
  BOW,
  BREATH,
  DIP,
  FISTS,
  GIVE,
  HIP,
  HY,
  KA,
  KAMAE,
  KR,
  LEAN,
  LOW,
  LOW_GUARD,
  STEP,
  TELEPORT,
  UP,
  VX,
  VZ,
  W,
  WIDE,
  YAW,
} from './constants';

/** `bow` is the guard's lean forward: none for the eye's own body, whose arms hold to the view and which stands in no sword guard. */
export const createGait = (bow = BOW, kind = 0): Gait => {
  const out = rest([0, 0, 0], 0, kind);
  /** The build's arm: the woman's is shorter (RESTS in rig.ts). */
  const REST = RESTS[kind];
  const [ARM, FORE] = kind
    ? [Math.hypot(...REST[J.FOREARM_R]), Math.hypot(...REST[J.HAND_R])]
    : [ARM_M, FORE_M];
  const P = {} as Record<Key, number>;
  /** After the moves' springs, the sword guard's. */
  const KEN = W + 2 * MOVES.length;
  /** After it, the bare fists' guard's. */
  const BARE = KEN + 2;
  /** After it, how far the hips trail the look (radians). */
  const TRAIL = BARE + 2;
  const sp = new Array<number>(TRAIL + 2).fill(0);
  const plant = { n: 0, x: 0, y: 0, z: 0, yaw: 0, side: 1 };
  const feet: Foot[] = [0, 1].map(() => ({
    x: 0,
    y: 0,
    z: 0,
    px: 0,
    pz: 0,
    gy: 0,
    lx: 0,
    ly: 0,
    lz: 0,
    dl: 0,
    tg: 0,
    u: 0,
    x0: 0,
    w: 0,
    th: 0,
    tw: 1,
    fy: 0,
    la: 0,
    lt: 0,
    k: -1,
    on: true,
  }));
  /** The state of the last frame, once there is one. */
  const q = {} as PlayerState;
  let known = false;
  let [ph, steps, time, v, yaw, wall] = [0, 0, 0, 0, 0, 0];
  let [kick, fall, flip, duty, gate] = [0, 0, 0, 0.6, 0];
  let [grounded, fresh, dirty, built] = [false, true, true, -1];
  /** Standing last frame; how much of the travel is not ahead (0 forward, 1 sideways or back) and how much to the right; how much of the hips' trail shows. */
  let [still, odd, strafe, loose] = [true, 0, 0, 0];
  /** Strides a second of a step taken standing. */
  let pace = 1;
  /** The way the body faced last frame. */
  let faced = 0;
  /** Per player: cadence, arm swing of each side, mean tilt, toe-out, the phase of a hang's sway. */
  let who = [1, 1, 1, 0, 0.06, 0];
  let [look, pitch, at] = [0, 0, [0, 0, 0]];
  /** The wall of a wall-run: its side of the runner (-1 left, 1 right) and its normal. The ledge held: where the hands took it, the normal and the height of its top. */
  let [side, wn, lip, held] = [1, [1, 0], [0, 0, 0, -1, 0], false];
  /** On a wall (MODE.CLING): the normal toward it, and the phase of the climb, which goes with the speed. */
  let [cn, cph] = [[0, -1], 0];
  /** Swimming: the phase of the stroke (0 to 1) and its pose. */
  let swimPh = 0;
  const swimRow = MOVES[MOVE.SWIM].slice();
  /** The seat he rides in, and whether a weapon keeps his right hand. */
  let sat: Seat | undefined;
  let armed = false;
  /**
   * Down shot or struck: the FALL (0 otherwise), the seconds since, its side (shot: 1 thrown face
   * first, -1 on his back; struck: 1 over to his right), the metres of throw the floor allows, the
   * yaw he went down at and the one he lands at.
   */
  let [how, dead, lay, far, y0, y1] = [0, 0, 1, 1, 0, 0];

  const update = (p: PlayerState, dt: number, floor?: Floor, seat?: Seat) => {
    dt = clamp(dt, 0, 0.1);
    fresh = !known || Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > TELEPORT;
    const walks = p.mode == MODE.GROUND || p.mode == MODE.CROUCH;
    const air = p.mode == MODE.AIR;
    // The stride sees the velocity a moment late, so that a stop or a turn moves the feet smoothly.
    const set = (i: number, to: number, w: number) => {
      if (fresh) {
        [sp[i], sp[i + 1]] = [to, 0];
      } else {
        damp(sp, i, to, w, dt);
      }
    };
    set(VX, p.vx, 12);
    set(VZ, p.vz, 12);
    const [vx, vz] = [sp[VX], sp[VZ]];
    v = Math.sqrt(vx * vx + vz * vz);
    const way = v > 1 ? Math.atan2(-vx, -vz) : p.yaw;
    if (fresh) {
      const id = p.id;
      who = [
        1 + 0.08 * (rnd(id, 0) - 0.5),
        1 + 0.16 * (rnd(id, 1) - 0.5),
        1 + 0.16 * (rnd(id, 2) - 0.5),
        0.03 * (rnd(id, 3) - 0.5),
        0.05 + 0.04 * rnd(id, 4),
        rnd(id, 6),
      ];
      ph = v > 0.25 ? rnd(id, 5) : rnd(id, 5) < 0.5 ? 0.05 : 0.55;
      [steps, time, flip, kick, fall, grounded, built] = [0, 0, 0, 0, 0, false, -1];
      wall = p.yaw;
    } else {
      if (air && q.mode == MODE.AIR && p.jumps < q.jumps && p.vy > q.vy) {
        flip = 1e-3;
      }
      if (air) {
        fall = Math.min(fall, p.vy);
      } else {
        if (q.mode == MODE.AIR && (walks || p.mode == MODE.SLIDE) && fall < -3) {
          kick = clamp(-fall / 12, 0.3);
        }
        fall = 0;
      }
      if (flip) {
        flip += dt * (air ? 2.2 : 8);
        flip = flip >= 1 ? 0 : flip;
      }
    }
    time += dt;
    kick *= Math.exp(-dt * 7);

    // The moves other than the stride.
    const dir = TOWARD[p.wall];
    const wr = p.mode == MODE.WALLRUN;
    const hold = p.mode == MODE.HANG || p.mode == MODE.CLIMB;
    if (wr) {
      [side, wn] = [dir[0] * Math.cos(way) - dir[1] * Math.sin(way) < 0 ? -1 : 1, dir];
    }
    if (hold && p.wall) {
      wall = Math.atan2(-dir[0], -dir[1]);
      if (p.mode == MODE.HANG || !held) {
        lip = [p.x, p.z, dir[0], dir[1], 0];
      }
      lip[4] = p.edge;
    }
    held = hold;
    const cling = p.mode == MODE.CLING;
    if (cling && p.wall) {
      [wall, cn] = [Math.atan2(-dir[0], -dir[1]), dir];
      cph = (cph + dt * 1.6 * (Math.abs(p.vy) + Math.hypot(p.vx, p.vz))) % 1;
    }
    if (p.mode == MODE.SWIM) {
      swimPh = (swimPh + dt * strokeRate(v)) % 1;
      stroke(swimRow, swimPh, strokeShare(v));
    }
    [
      air,
      air && p.vy > 0.5,
      p.dash > DASH_COOLDOWN - DASH_TICKS,
      wr && side < 0,
      wr && side > 0,
      p.mode == MODE.HANG,
      p.mode == MODE.CLIMB,
      p.mode == MODE.SLIDE,
      p.stun > 0,
      flip && Math.sqrt(Math.sin(Math.PI * flip)),
    ].forEach((g, i) => set(W + 2 * i, +g, 12));
    // Floored by an arc, he lies as one down, falling faster.
    set(W + 2 * MOVE.DOWN, +(p.down > 0 || floored(p)), floored(p) ? 9 : 5);
    const rides = p.mode == MODE.RIDE;
    set(W + 2 * MOVE.RIDE, +rides, 14);
    set(W + 2 * MOVE.CLING, +cling, 12);
    set(W + 2 * MOVE.SWIM, +(p.mode == MODE.SWIM), 8);
    sat = rides ? (seat ?? { yaw: p.yaw, pitch: 0, roll: 0, steer: 0, s: 1 }) : sat;
    armed = !p.fists && (p.ammo >= 0 || !!p.railed || !!p.rifled || !!p.wield);
    set(KEN, +(!!p.wield && bow > 0), 10);
    set(BARE, +(!armed && bow > 0 && !p.down), 8);
    set(LOW, +(p.mode == MODE.CROUCH), 12);
    set(UP, hold ? clamp((1.7 - lip[4] + p.y) / 1.2) : 0, 14);
    set(DIP, kick, 26);

    // Lean with speed and acceleration, bank with the turn of the heading.
    // The body leans into its acceleration, whichever way it goes: forward as it starts, back as it
    // brakes, to the side into a turn, a sidestep or a change of direction. The acceleration is the
    // slope of the eased velocity, and the lean passes its mark and settles (sway).
    const [ys, yc] = [Math.sin(yaw), Math.cos(yaw)];
    const [ax, az] = fresh ? [0, 0] : [sp[VX + 1], sp[VZ + 1]];
    const ahead = -(vx * ys + vz * yc);
    const right = vx * yc - vz * ys;
    const run = Math.sign(ahead) * clamp((Math.abs(ahead) - 1.5) * 0.028, 0, 0.22);
    // A stumble throws the trunk itself (KA, KR).
    const firm = 1 - sp[W + 2 * MOVE.STUN];
    const lean =
      (ahead > 0 ? run : run / 2) + firm * clamp(-(ax * ys + az * yc) * 0.014, -0.3, 0.3);
    const bank = firm * clamp(0.3 * Math.atan((az * ys - ax * yc) / 9.8), -0.4, 0.4);
    if (fresh) {
      [sp[LEAN], sp[LEAN + 1], sp[BANK], sp[BANK + 1]] = [lean, 0, bank, 0];
    } else {
      sway(sp, LEAN, lean, 8, dt);
      sway(sp, BANK, bank, 9, dt);
    }
    const going = clamp(v / 2);
    // Measured from the look: the hips already turn toward the travel.
    odd = going * clamp(1 + (vx * Math.sin(p.yaw) + vz * Math.cos(p.yaw)) / Math.max(v, 1e-3));
    strafe = (going * right) / Math.max(v, 1e-3);
    // Not one who is thrown: he does not run that way.
    set(YAW, 0.7 * Math.sin(arc(p.yaw, way)) * going * firm, 10);
    // The hips trail a turn of the look and catch up; the trunk twists to keep the chest on it.
    sp[TRAIL] = fresh || !bow ? 0 : clamp(sp[TRAIL] + arc(p.yaw, q.yaw), -0.9, 0.9);
    set(TRAIL, 0, 10);
    const sw = (k: number) => sp[W + 2 * k];
    const turned = clamp(sw(MOVE.DASH) + sw(MOVE.WALL_L) + sw(MOVE.WALL_R) + sw(MOVE.SLIDE));
    const face = p.yaw + arc(p.yaw, way) * turned;
    const hung = clamp(sw(MOVE.HANG) + sw(MOVE.CLIMB) + sw(MOVE.CLING));
    yaw = face + arc(face, wall) * hung;
    // On the move the hips go the way of the travel (YAW): they trail the look standing only, and not one who is down.
    loose = (1 - turned) * (1 - hung) * (1 - clamp(sw(MOVE.RIDE))) * (1 - going) * +!p.down;
    yaw += sp[YAW] * (1 - turned) + sp[TRAIL] * loose;
    if (p.down > 0 && p.fell) {
      if (!(q.down > 0) || fresh) {
        const a = ((p.fell & 31) * Math.PI) / 16;
        const r = arc(yaw, a);
        const shot = (how = p.fell >> 5) == FALL.SHOT;
        dead = (DOWN_TICKS - p.down) / TICK_HZ;
        // Shot: thrown face first or on his back, whichever the body turns the less for, as far as
        // the floor goes on at his height. Struck: over to the side the blow pushes.
        lay = (shot ? Math.cos(r) : -Math.sin(r)) < 0 ? -1 : 1;
        [y0, y1] = [yaw, shot ? a + (lay < 0 ? Math.PI : 0) : yaw];
        far = 0;
        while (
          far < THROW &&
          Math.abs(
            (floor?.(p.x - Math.sin(a) * (far + 0.4), p.z - Math.cos(a) * (far + 0.4)) ?? p.y) -
              p.y,
          ) < 0.3
        ) {
          far += 0.4;
        }
      }
      dead += dt;
      yaw = y0 + arc(y0, y1) * ease(dead / 0.2);
    } else {
      how = 0;
    }
    // Seated, the body faces the rover's nose.
    if (sat) {
      yaw += arc(yaw, sat.yaw) * clamp(sw(MOVE.RIDE));
    }
    // The push of a tackle in the body's frame, taken off the velocity as it lands and eased out as it slides away.
    const [kc, ks] = [Math.cos(yaw), Math.sin(yaw)];
    set(KA, p.stun > 0 ? clamp(-(p.vx * ks + p.vz * kc) / 4.2, -1, 1) : 0, 18);
    set(KR, p.stun > 0 ? clamp((p.vx * kc - p.vz * ks) / 4.2, -1, 1) : 0, 18);
    [look, pitch, at] = [p.yaw, p.pitch, [p.x, p.y, p.z]];

    // The stride's numbers at this speed.
    const i = v < SPEEDS[1] ? 0 : 1;
    const t = clamp((v - SPEEDS[i]) / (SPEEDS[i + 1] - SPEEDS[i]));
    for (const k in GAITS) {
      const r = GAITS[k as Key];
      P[k as Key] = r[i] + (r[i + 1] - r[i]) * t;
    }
    gate = ease((v - 0.2) / 1.2);
    // Sideways and backward nobody strides out: quicker, shorter, lower steps, the arms quieter.
    P.s *= 1 - 0.2 * odd;
    P.lift *= 1 - 0.2 * odd;
    P.aa *= 1 - 0.5 * odd;
    // A stumble takes quick catching steps.
    const cadence =
      P.f * who[0] * (0.35 + 0.65 * clamp(v / 1.4)) * (1 + 0.5 * sw(MOVE.STUN)) * (1 + 0.3 * odd);
    duty = clamp((P.s * cadence) / Math.max(v, 0.1), 0.2, 0.62);
    const [rx, rz] = [Math.cos(yaw), -Math.sin(yaw)];
    const ground = (x: number, z: number) => {
      const g = floor ? floor(x, z) : p.y;
      return Math.abs(g - p.y) < 0.6 ? g : p.y;
    };
    // Stopped for good while the eased velocity still runs down: the feet come in at once.
    const idle = v <= 0.25 || (v < 2 && p.vx * p.vx + p.vz * p.vz < 0.01);
    const settled = Math.abs(arc(yaw, faced)) < 1e-4;
    faced = yaw;
    const both = grounded && walks && feet[0].on && feet[1].on;
    /** Where a foot stands at rest and on the move, and the way it points. */
    const home = (n: number) => {
      const s = n ? 1 : -1;
      const [wide, fore] = idle
        ? [
            WIDE + LOW_GUARD[0] * sp[BARE],
            s * (STEP + KAMAE[0] * sp[KEN] + LOW_GUARD[1] * sp[BARE]),
          ]
        : [HIP, 0];
      return [
        p.x + rx * s * wide - Math.sin(yaw) * fore,
        p.z + rz * s * wide - Math.cos(yaw) * fore,
        yaw - s * who[4],
      ];
    };
    let [step, hurry] = [-1, 0];
    if (both && idle) {
      // Standing, a foot that is no longer under the body steps there, one at a time: a turn of the
      // look turns the body over planted feet, which never spin on the floor.
      const off = feet.map((f, n) => {
        const [hx, hz, hy] = home(n);
        return Math.hypot(f.px - hx, f.pz - hz) + 0.25 * Math.abs(arc(f.fy, hy));
      });
      step = +(off[1] > off[0]);
      // Feet left far apart by a stop come in fast.
      hurry = off[step];
      step = hurry > 0.1 ? step : -1;
    } else if (both && still && gate < 0.2) {
      // Setting off, the foot behind leaves at once.
      const back = feet.map(f => (f.px - p.x) * vx + (f.pz - p.z) * vz);
      step = +(back[1] < back[0]);
    }
    if (step >= 0 && !idle) {
      ph = (1 + duty - step / 2) % 1;
    }
    still = idle;
    pace = step < 0 ? pace : 3.5 + 12 * Math.min(hurry, 0.6);
    const advance = walks && !idle;
    if (advance || wr) {
      const h = Math.floor(ph * 2);
      ph = (ph + cadence * dt) % 1;
      // Along a wall the feet plant nowhere: a step each half of the stride, as they swing.
      steps += +(wr && Math.floor(ph * 2) != h);
    }
    feet.forEach((f, n) => {
      const s = n ? 1 : -1;
      const u = (ph + n / 2) % 1;
      const [hx, hz, hy] = home(n);
      if (!walks) {
        f.fy = hy;
        // Off the ground the foot rides with the body and eases to hanging under the hip.
        const k = fresh ? 0 : Math.exp(-10 * dt);
        const o = fresh ? [0, 0, 0] : [f.x - q.x, f.y - q.y, f.z - q.z];
        f.x = p.x + o[0] * k + (hx - p.x) * (1 - k);
        f.y = p.y + o[1] * k + SOLE * (1 - k);
        f.z = p.z + o[2] * k + (hz - p.z) * (1 - k);
        [f.th, f.tw, f.w, f.on, f.u, f.k] = [f.th * k, f.tw * k, 0, false, u, -1];
        return;
      }
      if (!grounded) {
        [f.px, f.pz, f.gy, f.on, f.fy] = [hx, hz, ground(hx, hz), true, hy];
        if (fresh) {
          [f.x, f.y, f.z, f.th, f.tw] = [hx, f.gy + SOLE, hz, 0, 1];
        }
      }
      if (
        f.on &&
        (step == n ||
          (advance &&
            (u >= duty || Math.hypot(f.x - hx, f.z - hz) > 0.56 + 0.12 * Math.abs(strafe))))
      ) {
        [f.on, f.lx, f.ly, f.lz, f.dl, f.la] = [false, f.x - p.x, f.y, f.z - p.z, u, f.fy];
        [f.k, f.lt] = [idle ? 0 : -1, f.th];
      } else if (!f.on && f.k < 0 == idle) {
        // A swing goes on from where the foot is when the body stops, or sets off, under it.
        [f.lx, f.ly, f.lz, f.dl, f.la, f.k] = [f.x - p.x, f.y, f.z - p.z, u, f.fy, idle ? 0 : -1];
        [pace, f.lt] = [5, f.th];
      } else if (!f.on && (idle ? f.k >= 1 : u < f.u)) {
        const [fx, fz] = [-Math.sin(f.fy), -Math.cos(f.fy)];
        const [df] = roll(P.td * gate);
        [f.on, f.px, f.pz, f.gy, f.k] = [true, f.x - fx * df, f.z - fz * df, f.tg, -1];
        steps++;
        [plant.x, plant.y, plant.z, plant.yaw, plant.side] = [f.px, f.gy, f.pz, f.fy, n ? 1 : -1];
        plant.n++;
      }
      f.u = u;
      if (f.on) {
        if (idle && feet[0].on && feet[1].on && settled) {
          // The last centimetres, too little for a step: a guard that widens, not a body that turns.
          const k = 1 - Math.exp(-4 * dt);
          f.px += (hx - f.px) * k;
          f.pz += (hz - f.pz) * k;
          f.gy += (ground(hx, hz) - f.gy) * k;
          f.fy += arc(f.fy, hy) * k;
        }
        const [fx, fz] = [-Math.sin(f.fy), -Math.cos(f.fy)];
        f.x0 = clamp(u / duty);
        // In the sword guard the left heel is off the floor.
        f.th =
          gate * (P.td * (1 - ease(f.x0 / 0.25)) + P.to * ease((f.x0 - 0.55) / 0.45)) -
          (n ? 0 : KAMAE[1] * sp[KEN] * (1 - gate));
        const [df, dy] = roll(f.th);
        [f.x, f.y, f.z] = [f.px + fx * df, f.gy + SOLE + dy, f.pz + fz * df];
        // A foot left far behind by a change of direction carries no weight: the body does not sink to it.
        f.w =
          (1 - gate * (1 - ease(Math.min(f.x0, 1 - f.x0) / 0.12))) *
          (1 - ease((Math.hypot(f.x - hx, f.z - hz) - 0.47) / 0.15));
        f.tw = ease(f.x0 * 10);
      } else {
        // Fly from where the foot left to where it will land, both measured from the pelvis: the
        // foot rides with the body and swings forward once the heel is up.
        f.k = idle ? Math.min(f.k + pace * dt, 1) : -1;
        const sw = idle ? f.k : clamp((u - f.dl) / (1 - f.dl + 1e-6));
        const [ax, az] = [(P.k * duty) / cadence, (1 - u) / cadence + (P.k * duty) / cadence];
        // Sideways the legs pass one before the other, not through each other.
        const gap = 0.12 * s * strafe;
        const [tx, tz] = idle
          ? [hx - p.x, hz - p.z]
          : [
              vx * ax + rx * s * P.lat + Math.sin(yaw) * gap,
              vz * ax + rz * s * P.lat + Math.cos(yaw) * gap,
            ];
        f.tg = idle
          ? ground(hx, hz)
          : ground(p.x + vx * az + rx * s * P.lat, p.z + vz * az + rz * s * P.lat);
        const [td, to] = [P.td * gate, P.to * gate];
        const e = ease((sw - 0.12) / 0.78);
        f.x = p.x + f.lx + (tx - f.lx) * e;
        f.z = p.z + f.lz + (tz - f.lz) * e;
        f.y =
          f.ly +
          (f.tg + SOLE + roll(td)[1] - f.ly) * ease(sw * 1.5) +
          P.lift * (idle ? 0.6 : 1) * Math.sin(Math.PI * Math.pow(sw, 0.6));
        f.fy = f.la + arc(f.la, hy) * e;
        // The toes push off from the pitch the foot left with: no jump as it leaves.
        const off = f.lt + (to - f.lt) * ease(sw * 6);
        f.th = off + (td - off) * ease(sw) + 0.15 * Math.sin(Math.PI * sw);
        f.tw = 1 - ease(sw * 4);
        f.w = 0;
      }
    });
    grounded = walks;
    dirty = true;
    Object.assign(q, p);
    known = true;
  };

  /**
   * Places the hands and feet that touch the world, by two-bone IK over the pose built so far, as
   * much as their move has blended in: the hands on a ledge, a foot over its lip, the sole and the
   * hand on a wall, the lead foot and a hand of a slide. Elbows point back and out, knees ahead.
   */
  const reach = () => {
    const sw = (k: number) => sp[W + 2 * k];
    const { rot } = out;
    const [cs, sn] = [Math.cos(yaw), Math.sin(yaw)];
    /** The point `x` right, `z` back of `b` (the feet origin), at the height `y`. */
    const R = (x: number, y: number, z: number, b = at): Vec3 => [
      b[0] + x * cs + z * sn,
      y,
      b[2] + z * cs - x * sn,
    ];
    /** A direction: the same, from nowhere. */
    const D = (x: number, y: number, z: number) => R(x, y, z, [0, 0, 0]);
    const goals: [number, number, Vec3, Vec3, Quat][] = [];
    const { pos, rot: wr } = solve(out);
    const pel = pos[J.PELVIS];
    const hand = (s: number) => (s < 0 ? J.HAND_L : J.HAND_R);
    const foot = (s: number) => (s < 0 ? J.FOOT_L : J.FOOT_R);
    const flat = mul(axis(Y, yaw), axis(X, -0.2));
    const hang = clamp(sw(MOVE.HANG) + sw(MOVE.CLIMB));
    if (hang > 0.002) {
      const [gx, gz, nx, nz, e] = lip;
      const d = 0.4 + 0.14 * sp[UP];
      // The hands stay on the lip and, once the shoulders pass over it, slide in under them. The
      // body rises no higher than the arms let it: it is held there, the arms straight, until the
      // climb is over, then stands up fast.
      const ends = [-1, 1].map(s => {
        const a = pos[hand(s) - 2];
        const k = Math.max(d, (a[0] - gx) * nx + (a[2] - gz) * nz);
        const t: Vec3 = [gx + nx * k - nz * s * 0.21, e + 0.03, gz + nz * k + nx * s * 0.21];
        const h = (a[0] - t[0]) ** 2 + (a[2] - t[2]) ** 2;
        return [t, a[1] - t[1] - Math.sqrt(Math.max(((ARM + FORE) * 0.97) ** 2 - h, 0))] as const;
      });
      const drop = hang ** 4 * clamp(Math.max(...ends.map(c => c[1]))); // a metre at most
      out.at[1] -= drop;
      pos.forEach(q => (q[1] -= drop));
      [-1, 1].forEach((s, i) =>
        goals.push([hand(s), hang, ends[i][0], D(s * 0.8, 0, 0.6), frame([0, s, 0], [nx, 0, nz])]),
      );
      // The feet come up on the ledge, the left one when the hips are over its lip, and ahead of them as they go in.
      const pa = (pel[0] - gx) * nx + (pel[2] - gz) * nz;
      const f = Math.max(0.58, pa + 0.45);
      [-1, 1].forEach(s =>
        goals.push([
          foot(s),
          sw(MOVE.CLIMB) * (s < 0 ? clamp((pa - 0.25) * 4) : clamp(sp[UP] * 2 - 0.4)),
          [gx + nx * f - nz * s * 0.1, e + SOLE, gz + nz * f + nx * s * 0.1],
          [nx, 0.5, nz],
          frame([-nz, 0, nx], [0, -1, 0]),
        ]),
      );
    }
    const cl = sw(MOVE.CLING);
    if (cl > 0.002) {
      // On the wall's face, a body's radius ahead: the hands high and the feet low, each pair
      // reaching in turn as it climbs.
      const [nx, nz] = cn;
      const on = (s: number, y: number, w: number): Vec3 => [
        at[0] + nx * 0.32 - nz * s * w,
        y,
        at[2] + nz * 0.32 + nx * s * w,
      ];
      [-1, 1].forEach(s => {
        const v = Math.sin(TAU * (cph + (s > 0 ? 0.5 : 0)));
        goals.push([
          hand(s),
          cl,
          on(s, pel[1] + 0.72 + 0.14 * v, 0.24),
          D(s * 0.8, 0, 0.6),
          frame([0, s, 0], [nx, 0, nz]),
        ]);
        goals.push([
          foot(s),
          cl,
          on(s, pel[1] - 0.62 - 0.12 * v, 0.15),
          [nx, 0.5, nz],
          frame([-nz, 0, nx], [0, -1, 0]),
        ]);
      });
    }
    [-1, 1].forEach(s => {
      const w = sw(s < 0 ? MOVE.WALL_L : MOVE.WALL_R);
      if (w > 0.002) {
        const [wx, wz] = wn;
        // Each foot on the wall in its stance, flat against it, and off it in the swing, the body
        // leaning out over them (the user, 2026-11-09); the far hand free.
        [s, -s].forEach((k, i) => {
          const u = (ph + 0.5 * i) % 1;
          const down = u < 0.55;
          const t = down ? u / 0.55 : (u - 0.55) / 0.45;
          const lift = down ? 0 : Math.sin(Math.PI * t);
          const z = (down ? 2 * t - 1 : 1 - 2 * ease(t)) * (i ? 0.4 : 0.3);
          goals.push([
            foot(k),
            w,
            R(s * (0.34 - 0.2 * lift), pel[1] - (i ? 0.62 : 0.52) + 0.3 * lift, z),
            D(-s * 0.7, 1, -1),
            slerp(flat, frame(cross([wx, 0, wz], D(0, 0, -1)), [wx, 0, wz]), 1 - lift),
          ]);
          const v = Math.cos(TAU * (ph + 0.5 * (1 - i)));
          goals.push([
            hand(k),
            w,
            i
              ? R(-s * 0.5, pel[1] + 0.3 + 0.12 * v, 0.2 * v)
              : R(s * 0.37, pel[1] + 0.3 + 0.05 * v, 0.1 * v),
            D(i ? -s * 0.7 : 0, i ? 0 : -0.5, 0.7),
            i ? frame([0, k, 0], D(0, 0, -1)) : frame([-k * wx, 0, -k * wz], D(0, 0, -1)),
          ]);
        });
      }
    });
    const slide = sw(MOVE.SLIDE);
    if (slide > 0.002) {
      // On the back hip: the right leg out ahead, the left foot flat by the hip, the left hand down behind.
      const y = at[1];
      goals.push(
        [J.FOOT_R, slide, R(0.12, y + SOLE + 0.14, -0.85, pel), D(0.1, 1, -0.3), flat],
        [J.FOOT_L, slide, R(-0.2, y + SOLE, -0.3, pel), D(-0.4, 1, -0.1), flat],
        [
          J.HAND_L,
          slide,
          R(-0.4, y + 0.03, 0.4, pel),
          D(-0.7, 0, 0.7),
          frame([0, -1, 0], D(-1, 0, 0)),
        ],
      );
    }
    const ride = clamp(sw(MOVE.RIDE));
    if (ride > 0.002 && sat) {
      // The feet in the footwell, the knees up; the driver's hands on the yoke, which turns with
      // the wheels.
      const q = mul(axis(Y, yaw), tipped(sat, ride));
      const S = (x: number, y: number, a: number): Vec3 =>
        lin(at as Vec3, 1, turn(q, [x, y, -a]), 1);
      const V = (x: number, y: number, a: number) => turn(q, [x, y, -a]);
      const flat = mul(q, axis(X, SIT.toes));
      [-1, 1].forEach(s =>
        goals.push([
          foot(s),
          ride,
          S(s * SIT.wide, SIT.ankle, SIT.ahead),
          V(s * 0.25, 1, 0.4),
          flat,
        ]),
      );
      const grip = frame(V(1, 0, 0), V(0, 0.35, 0.94));
      if (!sat.s) {
        grips(sat.steer).forEach(([x, y, a], i) =>
          goals.push([
            hand(i ? 1 : -1),
            ride,
            S(x, y, a - 0.075),
            V(i ? 0.7 : -0.7, -1, -0.2),
            grip,
          ]),
        );
      } else {
        // A rider's left hand lies on his thigh; the right one too with a weapon in it, its barrel
        // ahead, and holds the rail beside him without.
        const lap = frame(V(1, 0, 0), V(0, -0.25, 0.97));
        goals.push([J.HAND_L, ride, S(-0.13, 0.4, 0.2), V(-0.8, -0.4, -1), lap]);
        goals.push(
          armed
            ? [J.HAND_R, ride, S(0.15, 0.42, 0.22), V(0.8, -0.4, -1), lap]
            : [
                J.HAND_R,
                ride,
                S(0.27, 0.4, 0.22),
                V(0.6, -0.5, -1),
                frame(V(0, 0.3, 1), V(0.35, -0.5, 0.8)),
              ],
        );
      }
    }
    goals.forEach(([j, k, t, h, o]) => {
      const [a, arm, w] = [j - 2, j < J.THIGH_L, k * k];
      // The end and the bend of the limb as the pose built so far has them, moved toward the goal.
      const bend = lin(lin(pos[a + 1], 1, pos[a], -1), 1, turn(wr[a], [0, 0, arm ? 1 : -1]), 0.05);
      const [e, u] = [lin(pos[j], 1 - w, t, w), (v: Vec3) => unit(lin(v, 1, pos[a], -1))];
      const f = lin(unit(perp(bend, u(pos[j]))), 1 - w, unit(perp(h, u(t))), w);
      const [qa, qb] = arm ? limb(pos[a], e, f, ARM, FORE, -1) : limb(pos[a], e, f);
      // The upper arm's rest bone leans 0.1 rad off the vertical: turn it back before aiming.
      const ua = arm ? mul(qa, axis(Z, a == J.ARM_L ? 0.1 : -0.1)) : qa;
      rot[a] = mul(inv(wr[PARENT[a]]), ua);
      rot[a + 1] = mul(inv(ua), qb);
      rot[j] = slerp(rot[j], mul(inv(qb), o), w);
    });
  };

  const build = () => {
    const { rot } = out;
    const g = gate;
    const sw = (k: number) => sp[W + 2 * k];
    const [lean, bank, yo, dip, crouch] = [sp[LEAN], sp[BANK], sp[YAW], sp[DIP], sp[LOW]];
    const [c1, c2] = [Math.cos(TAU * ph), Math.cos(2 * TAU * ph)];
    // Positive turns about z lean to the left; negative about x lean forward.
    const side = Math.cos(TAU * (ph - (1 + duty) / 2));
    const obl = P.po * g * side;
    const tilt = P.pt + who[3] + P.pa * g * c2;
    const turn_ = (P.cc + P.pr) * g * c1;
    const idle = 1 - g;
    // In faster than out: a second harmonic leans the wave.
    const wave = TAU * BREATH[0] * time + who[1] * 5;
    const air = idle * (Math.sin(wave) + 0.25 * Math.sin(2 * wave));
    const breath = air * BREATH[1];
    const shift = idle * 0.012 * Math.sin(TAU * 0.17 * time + who[1] * 9);
    const ken = sp[KEN];
    const guard = idle * (bow * (1 - (1 - KAMAE[2]) * ken) + LOW_GUARD[2] * sp[BARE]);
    const hipX = P.sw * g * side + shift;
    // The chest of a guard leans forward and the hips go back under it: the weight stays over the feet.
    const sit = 0.3 * guard;
    /** The trunk's twist back onto the look, over hips that trail it. */
    const tw = sp[TRAIL] * loose;
    // Each footfall goes up the trunk a moment late: the chest nods and the shoulders drop after it.
    const nod = P.pa * g * Math.cos(2 * TAU * (ph - 0.09));
    out.at[0] = at[0];
    out.at[1] = at[1];
    out.at[2] = at[2];
    out.yaw = yaw;

    rot[J.PELVIS] = mul(
      mul(axis(Y, -P.pr * g * c1), axis(Z, obl + 0.4 * bank)),
      axis(X, -(tilt + 0.25 * (lean + guard) + 0.3 * crouch + 0.5 * dip)),
    );
    const body = tilt - 0.75 * (lean + guard) - 0.7 * crouch - 0.8 * dip;
    rot[J.SPINE] = mul(
      mul(
        axis(Y, 0.4 * turn_ - 0.3 * yo - 0.45 * tw),
        axis(Z, 0.25 * bank - 0.8 * obl + 0.5 * shift),
      ),
      axis(X, 0.45 * body + breath * 0.5),
    );
    rot[J.CHEST] = mul(
      mul(
        axis(Y, 0.6 * turn_ - 0.3 * yo - 0.55 * tw),
        axis(Z, 0.25 * bank - 0.8 * obl - 0.5 * shift),
      ),
      axis(X, 0.55 * body + breath - 0.5 * nod),
    );
    const bare = idle * sp[BARE];
    [-1, 1].forEach(s => {
      const at_ = ph - (s < 0 ? 0.5 : 0);
      const k = Math.cos(TAU * at_);
      // The forearm and the hand come after the upper arm, as a whip's end after its handle.
      const [kf, kh] = [Math.cos(TAU * (at_ - 0.07)), Math.cos(TAU * (at_ - 0.16))];
      const a = who[s < 0 ? 1 : 2];
      // The fists' guard, breathing with the chest: the elbows open a little as it fills.
      const [lift, out2, inward, bend] = FISTS[s < 0 ? 1 : 0].map(v => v * bare);
      // The shoulders rise with the breath.
      // Not with a weapon in hand: a long gun's butt stays in the shoulder.
      // On the move the shoulder goes forward with its arm, and drops as the foot lands. Not with
      // a weapon: its hold starts from shoulders that are where the rig has them.
      const free = +!armed;
      rot[s < 0 ? J.CLAVICLE_L : J.CLAVICLE_R] = mul(
        axis(Y, s * 0.12 * P.aa * a * k * g * free),
        axis(Z, s * (air * BREATH[2] * sp[BARE] - 0.6 * nod * free)),
      );
      rot[s < 0 ? J.ARM_L : J.ARM_R] = mul(
        mul(
          axis(Z, s * (0.06 + P.ab * g + 0.5 * dip + out2 + 0.3 * breath)),
          axis(
            X,
            (P.am + P.aa * a * k) * g +
              0.05 * idle * s * Math.sin(time * 1.3) * (1 - sp[BARE]) +
              dip +
              0.5 * crouch +
              lift,
          ),
        ),
        // The hand swings across the body as it comes forward.
        axis(Y, s * (inward + 0.12 * P.aa * g * (0.5 + 0.5 * k))),
      );
      rot[s < 0 ? J.FOREARM_L : J.FOREARM_R] = axis(
        X,
        0.15 * idle + g * (P.em + P.ea * kf) + dip + 0.5 * crouch + bend - 0.8 * breath * sp[BARE],
      );
      rot[s < 0 ? J.HAND_L : J.HAND_R] = axis(X, 0.2 * P.aa * g * kh * free);
    });

    // Pelvis: as high as the stance legs allow, then the legs by IK.
    const R = axis(Y, yaw);
    const pw = mul(R, rot[J.PELVIS]);
    const [rx, rz] = [Math.cos(yaw), -Math.sin(yaw)];
    const base: Vec3 = [at[0] + rx * hipX, 0, at[2] + rz * hipX];
    const off = [J.THIGH_L, J.THIGH_R].map(j => turn(pw, REST[j]));
    const stand =
      1 -
      0.25 * crouch -
      0.7 * dip -
      (GIVE + KAMAE[3] * ken + LOW_GUARD[3] * sp[BARE]) * idle -
      0.03 * odd * g +
      (air * BREATH[3]) / LEG;
    const flight =
      at[1] +
      0.05 +
      SOLE +
      LEG * (stand - P.d0 - 0.6 * P.d1 * g) +
      P.hop * g * (0.5 - 0.5 * Math.cos(2 * TAU * ph - (2 * TAU * duty) / 2));
    const cand = feet.map((f, n) => {
      const [dx, dz] = [f.x - base[0] - off[n][0], f.z - base[2] - off[n][2]];
      const deficit = P.d0 + P.d1 * g * Math.sin(Math.PI * f.x0) + 1 - stand;
      const reach = Math.min(LEG * (1 - deficit), LEG * 0.99);
      const hip = f.y + Math.sqrt(Math.max(reach * reach - dx * dx - dz * dz, 0.04));
      return flight + (hip - off[n][1] - flight) * f.w;
    });
    // A pelvis that must drop does at once; one that rises is held back a moment, so that a foot
    // set free does not throw it up.
    const top = low(cand[0], cand[1], 0.05);
    const gap = time - built;
    built = time;
    if (gap > 0.1) {
      [sp[HY], sp[HY + 1]] = [top, 0];
    } else {
      damp(sp, HY, top, 30, gap);
    }
    base[1] = Math.min(top, sp[HY]);
    out.hips = [hipX, base[1] - at[1] - REST[0][1], sit];
    base[0] += Math.sin(yaw) * sit;
    base[2] += Math.cos(yaw) * sit;
    feet.forEach((f, n) => {
      const hip: Vec3 = [base[0] + off[n][0], base[1] + off[n][1], base[2] + off[n][2]];
      const fy = f.fy;
      const [a, b] = limb(hip, [f.x, f.y, f.z], [-Math.sin(fy), 0, -Math.cos(fy)]);
      const j = n ? J.THIGH_R : J.THIGH_L;
      rot[j] = mul(inv(pw), a);
      rot[j + 1] = mul(inv(a), b);
      rot[j + 2] = mul(inv(b), mul(axis(Y, fy), axis(X, f.th)));
      rot[j + 3] = axis(X, f.th < 0 ? -f.th * f.tw : 0);
    });

    // The other moves, laid over the stride.
    MOVES.forEach((row, k) => {
      const c = k == MOVE.SWIM ? swimRow : row;
      const w = sw(k);
      if (w > 0.002) {
        // Along a wall the body leans well out (the user, 2026-11-09), less with the rail gun's bolt
        // going out, so that both hands keep it.
        const out2 = (k == MOVE.WALL_L || k == MOVE.WALL_R) && q.railed && q.zapping;
        const to = fk(out2 ? c.map((v, i) => (i == 2 ? v * 0.6 : v)) : c);
        const arms = k == MOVE.STUN;
        FK.slice(arms ? 3 : 0, arms ? 7 : 15).forEach(j => (rot[j] = slerp(rot[j], to[j], w)));
        if (!arms) {
          [c[13], c[0], c[12]].forEach((v, i) => (out.hips[i] += (v - out.hips[i]) * w));
        }
      }
    });
    const swimming = clamp(sw(MOVE.SWIM));
    if (swimming > 0.002) {
      // The body follows the look: more prone in a dive, more upright looking up.
      rot[J.PELVIS] = mul(
        axis(X, -(SWIM_PITCH - 0.8 * clamp(q.pitch, -1.2, 1.2)) * swimming),
        rot[J.PELVIS],
      );
    }
    const ride = clamp(sw(MOVE.RIDE));
    if (ride > 0.002 && sat) {
      // The seat leans with the rover: the pelvis, and all it carries, about the seat point.
      const tilt = tipped(sat, ride);
      rot[J.PELVIS] = mul(tilt, rot[J.PELVIS]);
      const d = sat.s ? 0 : ride;
      const h = turn(tilt, [out.hips[0], out.hips[1] + REST[0][1], out.hips[2] - SIT.reach * d]);
      out.hips = [h[0], h[1] - REST[0][1], h[2]];
      // The driver bends to the yoke; a rider turns his shoulders part of the way to where he looks.
      if (d) {
        [J.SPINE, J.CHEST].forEach(j => (rot[j] = mul(rot[j], axis(X, (-SIT.hunch * d) / 2))));
      } else if (sat.s) {
        const t = 0.3 * ride * clamp(arc(yaw, look), -1.3, 1.3);
        [J.SPINE, J.CHEST].forEach(j => (rot[j] = mul(rot[j], axis(Y, t))));
      }
    }
    const hang = sw(MOVE.HANG);
    if (hang > 0.002) {
      // A hang sways: the body swings about the hands, a metre above the pelvis, the legs a little more. The hands go back on the lip in `reach`.
      const [a, b] = [
        0.01 * Math.sin(TAU * (0.3 * time + who[5])),
        0.006 * Math.sin(TAU * (0.2 * time + 3 * who[5])),
      ].map(v => v * hang);
      rot[J.PELVIS] = mul(mul(axis(Z, b), axis(X, a)), rot[J.PELVIS]);
      [J.THIGH_L, J.THIGH_R].forEach(j => (rot[j] = mul(rot[j], axis(X, a))));
      out.hips[0] += b;
      out.hips[2] -= a;
    }
    const stun = sw(MOVE.STUN);
    if (stun) {
      // Reeling: the trunk is thrown the way the knock goes. The arms flail against each other, the shoulders sway.
      [J.SPINE, J.CHEST].forEach((j, i) => {
        const a = 0.3 + 0.1 * i;
        rot[j] = mul(rot[j], mul(axis(Z, -a * sp[KR]), axis(X, -a * sp[KA])));
      });
      const k = Math.sin(time * 13);
      [J.ARM_L, J.ARM_R].forEach((j, i) => (rot[j] = mul(rot[j], axis(X, stun * (i ? k : -k)))));
      rot[J.CHEST] = mul(rot[J.CHEST], axis(Y, 0.3 * stun * Math.sin(time * 8)));
    }
    reach();
    // Down, shot or struck: the fall's keys over the pose, eased in over its first tenth of a second.
    if (how) {
      const [, tip, roll, hy, go, hip, knee, lift, wide, bend, slump] = keyed(FALLS[how - 1], dead);
      const [f, s, h] = how == FALL.SHOT ? [lay, 0, -lay] : [1, lay, 1];
      const k = clamp(dead / 0.1);
      const to: Quat[] = [];
      to[J.PELVIS] = mul(axis(Z, -s * roll), axis(X, -f * tip));
      to[J.SPINE] = to[J.CHEST] = axis(X, -slump);
      [0, 4].forEach((j, n) => {
        to[J.THIGH_L + j] = axis(X, h * hip);
        to[J.SHIN_L + j] = to[J.FOOT_L + j] = axis(X, -knee);
        to[J.TOE_L + j] = IDENT;
        to[J.ARM_L + j] = mul(axis(Z, (n * 2 - 1) * wide), axis(X, lift));
        to[J.FOREARM_L + j] = axis(X, bend);
      });
      to.forEach((q, j) => (rot[j] = slerp(rot[j], q, k)));
      [s * 0.4 * Math.sin(roll), hy - REST[0][1], -f * Math.min(go, far)].forEach(
        (v, i) => (out.hips[i] += (v - out.hips[i]) * k),
      );
    }
    // Down otherwise: the knees buckle, then the body goes over about the pelvis onto the floor.
    const lie = how ? 0 : ease((sw(MOVE.DOWN) - 0.35) / 0.65);
    if (lie) {
      rot[J.PELVIS] = mul(axis(X, -1.45 * lie), rot[J.PELVIS]);
      out.hips[1] += (0.21 - REST[0][1] - out.hips[1]) * lie;
      // The hips straighten as the body goes over, so that the legs trail behind it.
      [J.THIGH_L, J.THIGH_R].forEach(j => (rot[j] = mul(rot[j], axis(X, -1.25 * lie))));
      [J.ARM_L, J.ARM_R].forEach(j => (rot[j] = mul(rot[j], axis(X, -0.5 * lie))));
    }

    // The head holds the way the player looks, whatever the trunk does.
    const chest = mul(mul(R, rot[J.PELVIS]), mul(rot[J.SPINE], rot[J.CHEST]));
    // A neck turns so far: seated, the trunk does not follow the look.
    const aim = mul(
      axis(Y, ride > 0.5 ? yaw + clamp(arc(yaw, look), -1.3, 1.3) : look),
      axis(X, clamp(pitch, -1, 1) * 0.9),
    );
    const rel = mul(
      inv(chest),
      slerp(chest, aim, 0.85 * (1 - sw(MOVE.TUCK)) * (1 - 0.5 * stun) * (1 - sw(MOVE.DOWN))),
    );
    rot[J.NECK] = slerp([0, 0, 0, 1], rel, 0.4);
    rot[J.HEAD] = mul(inv(rot[J.NECK]), rel);
    dirty = false;
    return out;
  };

  return {
    update,
    pose: () => (dirty ? build() : out),
    get phase() {
      return ph;
    },
    get steps() {
      return steps;
    },
    plant,
  };
};
