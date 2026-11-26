import {
  BLOW,
  CHARGE_TAP,
  CHARGE_TICKS,
  DASH_COOLDOWN,
  DASH_TICKS,
  GRAB_GAP,
  PLAYER_R,
  HEAT_MAX,
  PUNCHES,
  HUNTER_CELLS,
} from '../../shared/constants';
import { powerOf, sabering } from '../../shared/gun';
import { TAU, eyeHeight, speedOf, sprinting } from '../../shared/physics';
import { MODE } from '../../shared/types';
import { strokeRate, strokeShare } from '../gait';
import type { PlayerState } from '../../shared/types';
import type { World } from '../../shared/world';
import { SIDE, blowOf, createGait, frame, thrown } from '../gait';
import { FIRE_KEY, wristComputer } from '../computer';
import { fetched, pouch, pouchAt } from '../pouch';
import { blades, drape } from '../sash';
import { createFours } from '../fours';
import {
  GUN_ON,
  axes as gunAxes,
  RIFLE_CURL,
  RIFLE_HOLD,
  RIFLE_TILT,
  tiltOf,
  holdOf,
  LONG_CURL,
  LONG_HOLD,
  grip as gunGrip,
  pressAt,
  buttonAt,
  firsts,
  poke,
  thumbTo,
  tune,
  REAR,
  TILT,
  charge,
  ease,
  fore,
  kindOf,
  held,
  loadFrame,
  TAP,
  BROUGHT,
  screwed,
  pointed,
  power,
  span,
  swapOf,
  tip,
  cellsOf,
  handOf,
} from '../gun';
import {
  BASE,
  BOW,
  C,
  S,
  SWAY,
  bent,
  cutting,
  ends,
  held as sword,
  PARRY_IN,
  deflect,
  locked,
  parrying,
  poised,
  progress,
  BLADE_EXTEND,
  wristBlades,
  wristHousing,
  wristEnds,
  BEHIND as BACK,
} from '../katana';
import { add, basis, dot, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { JOINT as J, axis, mul, slerp, solve, turn as spin } from '../rig';
import type { Pose, Quat } from '../rig';
import { armor } from '../armor';
import {
  CANNON_MUZZLE,
  DISC_CURL,
  DISC_HOLD,
  DISC_HOOK,
  DISC_RAISE,
  DISC_SPREAD,
  DISC_TILT,
  drawDisc,
  drawHarpoon,
  harpoonFeed,
  HARPOON_DRAW,
  HARPOON_GONE,
  HARPOON_OUT,
  folded,
  handsFree,
  unfold,
} from '../hunter';

import { REGION, beast, body, palette, skin } from '../skin';
import { CHITIN_X, FOOT_TIP, HOOKED, PART, lashOf, partsOf, tail } from '../xeno';
import { CLOTH } from '../mask';
import { createTrail } from '../trail';
import { ID, expand, mesh } from '../store';
import {
  AWAY,
  BEHIND,
  DROP,
  FEET,
  POLE,
  THROW,
  X,
  Y,
  Z,
  clamp,
  dist,
  inv,
  made,
  throwOf,
} from './constants';
import {
  CANNON_STEADY,
  CLAW_ROLL,
  COMPUTER,
  COMPUTER_POLE,
  GUARD,
  GUARD_CURL,
  HUNTER_HAND,
  LUNGE_L,
  POKE,
  RAKE,
  RAKE_DOWN,
  RAKE_UP,
  TOWARD,
  TUCK,
  counter,
} from './fingers';
import { hands, palmsOf } from './hands';
import {
  armTurn,
  cannonInView,
  cannonVertices,
  drawHunterPart,
  hunterView,
  model,
  postVertices,
} from './hunter';
import { CURLS, RATES, ROLLS, devour, floorOf, loop, stowed, strokeHand } from './motion';
import {
  CAPSULE_CURL,
  CAPSULE_HOLD,
  CAPSULE_UP,
  FIST,
  HANDS,
  KATANA_LEFT,
  KATANA_TILT,
  across,
  along,
  outOf,
  placeRigid,
  reach,
  shrug,
} from './reach';
import type { Body } from './types';
import { clasp, rotate, wield } from './wield';

export const createBody = (world?: World): Body => {
  let gait = createGait(0);
  /** Where the two hands were at the last draw() (Body.palms). */
  const palms = new Float32Array(32);
  let build = 0;
  let tone: number[] | undefined;
  /** The ninja's black suit, with no armour (soldier.ts). */
  let ninja = false;
  /** The xenomorph: its own body (beast()) in chitin, claws on its fingertips (hand()). */
  let xeno = false;
  /** The Hunter's wrist blades use the same deterministic cut timing as the shared blade. */
  let hunter = false;
  /** The own player as last seen. */
  let me: PlayerState | undefined;
  /**
   * The xenomorph on a wall: on all fours over it as the others see it (fours.ts), heading where it
   * looks, so the body turns with the mouse (the user, 2026-11-16); and until that has blended out.
   */
  const fours = createFours();
  let clung = false;
  const w = {
    amp: 0,
    sprint: 0,
    air: 0,
    rise: 0,
    dash: 0,
    plant: 0,
    wall: 0,
    slide: 0,
    stun: 0,
    gun: 0,
    blade: 0,
    feast: 0,
    swim: 0,
  };
  /** The kick of the last shot, 0 to 1, and how much of the right hand's pose the gun and the katana take, as of the last pose(). */
  let [kick, hold, grasp, wide] = [0, 0, 0, 1.6];
  /** How far through its cut the katana is, -1 when it is not cutting; and the light it leaves. */
  let prog = -1;
  /** In a saber lock: the presses seen so far, and the jolt of the last one (1, easing to 0). */
  let [pushes, jolt] = [0, 0];
  const trail = createTrail();
  /** Where the gun points, in the camera's space. */
  let target: Vec3 = [0, 0, 8];
  /** How far the gun is pushed out of the trunk, in the camera's space, as of the last pose(). */
  let lift: Vec3 = [0, 0, 0];
  /** Seconds, for the flailing of a stumble; and since the last parry. */
  let [clock, parry] = [0, Infinity];
  /** Swimming: the phase of the stroke (0 to 1), the same rhythm as gait.ts's. */
  let swimPh = 0;
  /** How far into the parry the katana is (parrying()). */
  let braced = 0;
  /** Which hand the wall is on: -1 left, 1 right, eased. */
  let side = 0;
  /** The ledge the hands are on: the body's x and z, the height of its top, and the way the wall faces. */
  let grip: { x: number; y: number; z: number; dx: number; dz: number } | undefined;
  /** How closed each hand is, left then right, as of the last pose(); how far the left index is out, pressing a button. */
  const curls = [0, 0];
  let pointing = 0;
  /** How far the right index is out, on the wrist computer's fire key, as of the last pose(). */
  let poking = 0;
  /** How much the left hand cups the rifle's handguard, 0 to 1, as of the last pose(). */
  let cupping = 0;
  /** The new battery in the left hand as it brings it from the pouch, in the world; undefined when it is not carrying one. */
  let carried: [Vec3, Vec3[]] | undefined;
  /**
   * The weapon in hand as last seen (0 the gun, 1 the katana, 2 the rail gun, -1 none), and the
   * seconds since it came to hand or a swap put its new battery in: it lights up over them (power()).
   */
  let drawn = -1;
  let harpoonDraw = 0;
  /** Seconds since the harpoon's last shot: its bolt is drawn leaving the tube (HARPOON_OUT). */
  let harpoonShot = Infinity;
  /** Seconds since the own Hunter threw his disc, and since he caught it back; whether it is out (`clip`, gun.ts). */
  let [discThrow, discBack, discOut] = [Infinity, Infinity, false];
  /** Whether the disc is drawn in his hand: not out, or still in it before the release of a throw. */
  const discIn = () => !discOut || discThrow < THROW.release;
  /** How far the Hunter's own shoulder cannon is folded out: 0 stowed, 1 out (unfold()). */
  let cannon = 0;
  /** Whether the Hunter's own shoulder cannon is in use (the state drawn has it masked). */
  let railed = false;
  let since = 9;
  /** Whether the weapon in hand came to it for the first time (firsts()): only then is it switched on, by hand (the user, 2026-11-09). */
  const fresh = firsts();
  let first = false;
  /** When the weapon of `kind` in hand is switched on, seconds after it came; -1, at once, when it is not new. */
  const pressOf = (kind: number) => (first ? pressAt(kind) : -1);

  const update: Body['update'] = (p, dt, k = 0, aspect = 1.6) => {
    // A fresh kick is the harpoon's shot: its bolt leaves the tube; the reload feeds the next.
    harpoonShot = k > kick + 0.5 ? 0 : harpoonShot + dt;
    kick = k;
    wide = aspect;
    if (!p) {
      me = undefined;
      return;
    }
    cannon = hunter ? unfold(cannon, !!p.railed && !p.down, dt) : 0;
    // The shoulder cannon leaves his hands free: they move as with no weapon (handsFree()).
    railed = hunter && !!p.railed;
    if (railed) {
      p = handsFree(p);
    }
    const floor = world && floorOf(world, p.y);
    gait.update(p, dt, floor);
    if (xeno) {
      fours.update(p, dt, floor);
      clung = p.mode == MODE.CLING || (clung && fours.weight > 0.002);
    }
    // A new shot with the disc in hand is a throw (gun.ts STRIKE.DISK): the arm sweeps it out.
    discThrow = hunter && p.rifled && me && p.shots !== me.shots ? 0 : discThrow + dt;
    const out = hunter && !!p.clip;
    discBack = discOut && !out ? 0 : discBack + dt;
    discOut = out;
    const now = handOf(p);
    // His pistol (`sided`) is held in the right hand alone, as the marine's: no harpoon pose.
    harpoonDraw =
      hunter && now === 0 && !p.sided ? Math.min(1, harpoonDraw + dt / HARPOON_DRAW) : 0;
    const f = fresh(p);
    first = now !== drawn ? f : first && !(me?.reload && !p.reload);
    since = now !== drawn || (me?.reload && !p.reload) ? 0 : since + dt;
    drawn = now;
    me = { ...p };
    clock += dt;
    swimPh = p.mode == MODE.SWIM ? (swimPh + dt * strokeRate(speedOf(p))) % 1 : swimPh;
    parry += dt;
    braced = parrying(parry);
    prog = progress(prog, p, dt);
    jolt = (p.pushes ?? 0) !== pushes && sabering(p) ? 1 : jolt * Math.exp(-dt * 12);
    pushes = p.pushes ?? 0;
    trail.update(dt);
    const walks = p.mode == MODE.GROUND || p.mode == MODE.CROUCH || p.mode == MODE.WALLRUN;
    const dash = p.dash > DASH_COOLDOWN - DASH_TICKS;
    const air = p.mode == MODE.AIR && !dash;
    const to = {
      amp: walks ? clamp(speedOf(p) / 9) : 0,
      sprint: +sprinting(p),
      air: +air,
      rise: +(air && p.vy > 0.5),
      dash: +dash,
      plant: +(p.mode == MODE.HANG || p.mode == MODE.CLIMB),
      wall: +(p.mode == MODE.WALLRUN),
      slide: +(p.mode == MODE.SLIDE),
      stun: +(p.stun > 0),
      // Weapons are put away on a wall unless the rail gun's bolt is going out: a hand on the
      // wall, the other swinging with the stride. This also keeps the rifle's left hand from
      // staying locked to its handguard while wall-running.
      // By the weapon in hand (handOf()), not the one carried: none with the fists chosen, though
      // the pistol is still in the bag.
      gun: +(!stowed(p) && (now === 0 || now === 2 || now === 3)),
      blade: +(!!p.wield && !p.down && p.mode != MODE.SWIM),
      // A glory kill's hold (room.ts feast()): the xenomorph's, with no blade in it.
      feast: +(xeno && !!p.lock && !p.down),
      swim: +(p.mode == MODE.SWIM),
    };
    for (const n of Object.keys(RATES) as (keyof typeof RATES)[]) {
      w[n] += (to[n] - w[n]) * (1 - Math.exp(-dt * RATES[n]));
    }
    const [tx, tz] = TOWARD[p.wall];
    // Right of a body that faces `yaw` is (cos, -sin): the wall's side is its dot with it.
    side +=
      (clamp(tx * Math.cos(p.yaw) - tz * Math.sin(p.yaw), -1, 1) - side) * (1 - Math.exp(-dt * 10));
    if (to.plant && p.edge) {
      grip = { x: p.x, y: p.edge, z: p.z, dx: tx, dz: tz };
    }
  };

  /** The rail gun's grip against the gun's: the share of the way in toward the middle, and the metres back. */
  const RIFLE = [0.45, 0.14];

  /**
   * The gun in camera space: where its grip is (lower right, rising from below as it is taken, kicked
   * back by a shot, swaying with the run, shaking with a charge) and its axes, pointing at `target`.
   */
  const holster = (): [Vec3, Vec3[]] => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    // A charge past a tap shakes the gun like the rail gun's bolt (the user, 2026-11-09): 1.5 mm
    // at once, 6 mm at the full charge, and kicks it 8 times a second, harder as it grows.
    // The rail gun's bolt kicks it at each pulse of the arc, 7 a second, and shakes it, harder as
    // it heats; overheated it trembles (the user, 2026-11-08).
    const zap = +!!me?.zapping;
    const heat = (me?.heat ?? 0) / HEAT_MAX;
    const held =
      me && !me.wield && (me.charge ?? 0) >= CHARGE_TAP
        ? Math.min(1, (me.charge! - CHARGE_TAP) / (CHARGE_TICKS - CHARGE_TAP))
        : -1;
    const kicked =
      kick +
      0.6 * zap * Math.max(0, Math.sin(clock * TAU * 7)) ** 6 +
      0.35 * Math.max(held, 0) * Math.max(0, Math.sin(clock * TAU * 8)) ** 6;
    const shake =
      (held < 0 ? 0 : 0.0015 + 0.0045 * held) +
      zap * (0.0012 + 0.004 * heat) +
      (me?.hot ? 0.002 : 0);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    // The rail gun is held in both hands like a rifle: nearer the middle and the chest, so that
    // the left hand reaches its front grip.
    // The Hunter's disc (`rifled`) is held in one hand, not shouldered as the rifle.
    const rifle = !!me?.rifled && !hunter;
    const r = me?.railed || rifle || harpoonDraw ? 1 : 0;
    // A swap tips the gun over to show the battery under it, or the capsule on its top, and back.
    // The harpoon stays in aim: its next bolt feeds in on its own (drawHarpoon()).
    const sp = me && !harpoonDraw ? swapOf(me) : -1;
    // Tipped over from the start, and back into aim after the slap (the user, 2026-11-09).
    const tipped = sp < 0 ? 0 : ease(span(sp, 0, 0.12)) * (1 - ease(span(sp, 0.8, 1)));
    const drawTilt = harpoonDraw ? 1 - ease(harpoonDraw) : 0;
    const disc = hunter && !!me?.rifled;
    const roll = tipped * (rifle ? -1.1 : r ? 0.35 : -1.25) - 0.78 * drawTilt;
    const at: Vec3 = [
      Math.min(0.22, 0.18 * wide) * (1 - RIFLE[0] * r) +
        0.012 * a * s +
        lift[0] +
        shake * Math.sin(clock * 53),
      -0.25 + 0.018 * a * c - 0.3 * (1 - w.gun) + lift[1] + shake * Math.sin(clock * 61 + 1),
      0.4 - RIFLE[1] * r - 0.05 * kicked + lift[2],
    ];
    // The rifle sits further out and higher than the rail gun, its counter in the lower view.
    const rf = rifle || harpoonDraw ? 1 : 0;
    at[0] += 0.02 * rf + 0.085 * drawTilt;
    at[1] += 0.045 * rf - 0.045 * drawTilt;
    at[2] += 0.02 * rf;
    at[0] -= (rf ? 0.1 : r ? 0.04 : 0.12) * tipped;
    at[1] += 0.03 * rf * tipped;
    at[2] += 0.1 * rf * tipped;
    at[1] += (r ? 0.03 : 0.17) * tipped;
    // The disc is held up into the lower right of the view, so that it shows whole.
    if (disc) {
      at[0] += DISC_RAISE[0];
      at[1] += DISC_RAISE[1];
      at[2] += DISC_RAISE[2];
    }
    // The slap home jolts the gun or the rifle: up 1.5 cm and back 1 cm, the nose kicked up, and
    // it settles (the user, 2026-11-09: a slight shock).
    const jolt = sp >= 0 && !me?.railed ? Math.max(0, 1 - Math.abs(sp - TAP - 0.02) / 0.04) : 0;
    at[1] += 0.015 * jolt;
    at[2] += 0.01 * jolt;
    // A shot kicks the nose up; a swap lifts it too, the rail gun's down.
    const l = Math.hypot(...target);
    const to: Vec3 = [
      target[0],
      target[1] + (0.1 * kicked + (r ? 0 : 0.2) * tipped + 0.06 * jolt) * l,
      target[2],
    ];
    if (disc) {
      // The disc as in the user's picture (2026-11-23): the back of the hand to the eye, the
      // fingers up and leaning ahead by DISC_TILT, the palm flat on the hub of the disc standing
      // behind it, the fingers over its face between the blades.
      const hold = pointed(at, add(at, [0, 1, DISC_TILT]), [0, 0, -1], [-1, 0, 0]);
      // Empty, the hand sinks a little; the disc caught back knocks it back and down.
      const empty = discIn() ? 0 : 1;
      const caught = Math.max(0, 1 - discBack / 0.25) ** 2;
      at[1] -= 0.035 * empty + 0.03 * caught;
      at[2] -= 0.05 * caught;
      const [k, phi] = throwOf(discThrow);
      if (k <= 0) {
        return [at, hold];
      }
      // The throw (the user, 2026-11-24): a flat backhand, the disc lying under the palm. The hand
      // swings on an arc round the chest from across it on the left out to the right, the fingers
      // along the arc's radius, and comes back to the hold.
      const [s, c] = [Math.sin(phi), Math.cos(phi)];
      const [side, up, fingers]: Vec3[] = [
        [0, 1, 0],
        [-c, 0, s],
        [s, -0.15, c],
      ];
      const to: Vec3 = [
        THROW.centre[0] + THROW.radius * s,
        THROW.centre[1],
        THROW.centre[2] + THROW.radius * c,
      ];
      const p = mix(at, to, k);
      return [
        p,
        pointed(p, add(p, mix(hold[2], fingers, k)), mix(hold[0], side, k), mix(hold[1], up, k)),
      ];
    }
    const [rc, rs] = [Math.cos(roll), Math.sin(roll)];
    return [at, pointed(at, to, [rc, rs, 0], [-rs, rc, 0])];
  };

  /**
   * The katana in camera space, in the guard (rising from below as it is drawn, swaying with the
   * run) or in the cut: where the right hand holds its grip and the way the blade points.
   */
  const blade = () => {
    const a = w.amp * (1 + 0.5 * w.sprint);
    const [s, c] = [Math.sin(TAU * gait.phase), Math.cos(TAU * gait.phase)];
    // In a saber lock the blade crosses the foe's, shaking, and each press drives it on.
    const k = deflect(
      me && sabering(me) ? locked(clock, jolt) : poised(me ?? {}, Math.max(prog, 0), clock),
      braced,
    );
    const at: Vec3 = [k[0] + 0.012 * a * s, k[1] + 0.018 * a * c - 0.35 * (1 - w.blade), k[2]];
    return { at, g: unit([k[3], k[4], k[5]]) };
  };

  const pose: Body['pose'] = (eye, yaw, pitch, roll = 0) => {
    if (!me || me.down || dist(eye, [me.x, me.y + eyeHeight(me), me.z]) > AWAY) {
      return undefined;
    }
    const wf = xeno && clung ? fours.weight : 0;
    const g = wf ? fours.apply(gait.pose()) : gait.pose();
    const q: Pose = {
      at: [...g.at],
      yaw: g.yaw,
      hips: [...g.hips],
      rot: g.rot.map(r => [...r] as Quat),
      rest: g.rest,
    };
    const pawed = g.rot;
    // With the shoulder cannon out the trunk and the shoulders keep still through a stride (the
    // user, 2026-11-25: less arm movement walking and running with the cannon): they carry the
    // wrist computer and the hand on its key.
    const steady = railed ? CANNON_STEADY * ease(cannon) : 0;
    if (steady) {
      // The chest is squared to the hips' heading rather than each joint stilled: the gait turns
      // the chest against the pelvis, and stilling the one alone left the other's sway whole.
      const below = mul(q.rot[J.PELVIS], q.rot[J.SPINE]);
      q.rot[J.CHEST] = mul(inv(below), slerp(mul(below, q.rot[J.CHEST]), ID, steady));
      for (const j of [J.CLAVICLE_L, J.CLAVICLE_R]) {
        q.rot[j] = slerp(q.rot[j], ID, steady);
      }
    }
    const [r, u, f] = basis(yaw, pitch, roll);
    /** Camera space (right, up, forward) as a direction in the world, and a world direction in it. */
    const turn = ([a, b, c]: Vec3): Vec3 => [
      r[0] * a + u[0] * b + f[0] * c,
      r[1] * a + u[1] * b + f[1] * c,
      r[2] * a + u[2] * b + f[2] * c,
    ];
    const view = (v: Vec3): Vec3 => [dot(v, r), dot(v, u), dot(v, f)];
    // The trunk follows the look a little, and moves through the katana's cut (trunk()): it
    // twists, bends and leans, the chest more than the waist, so the shoulders carry the arms.
    const sw = w.blade > 0.002 ? blade() : undefined;
    // Locked, the trunk leans into the foe.
    const [tw, bd, ln] =
      sw && sabering(me)
        ? [0, 0.15 * w.blade, 0]
        : sw && prog >= 0
          ? bent(me, prog).map(v => v * w.blade)
          : [0, 0, 0];
    // The body turns on its feet as the view does: a share of the twist.
    q.yaw += sw && prog >= 0 ? SWAY * tw : 0;
    // The katana's space: the camera's, tipped down BOW at most, so the guard stays upright, and
    // carried round by the chest: the view turns SWAY of its twist and the hands HANDS of it on
    // top (any more and they leave the view in a wind-up). The bend is the trunk's alone, so the
    // strike stays on the crosshair.
    const [kr, ku, kf] = basis(yaw + HANDS * tw, Math.max(pitch, -BOW), roll);
    const keep = ([a, b, c]: Vec3): Vec3 => [
      kr[0] * a + ku[0] * b + kf[0] * c,
      kr[1] * a + ku[1] * b + kf[1] * c,
      kr[2] * a + ku[2] * b + kf[2] * c,
    ];
    for (const [j, k] of [
      [J.SPINE, 0.4],
      [J.CHEST, 0.6],
    ]) {
      q.rot[j] = mul(
        q.rot[j],
        mul(
          mul(axis(Y, tw * k), axis(X, 0.12 * clamp(pitch, -1.3, 1.3) - bd * k)),
          axis(Z, ln * k),
        ),
      );
    }
    // The head goes to the camera, the planted feet stay where they are.
    const s0 = solve(q);
    const ahead: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const nose = add(s0.pos[J.HEAD], spin(s0.rot[J.HEAD], [0, 0.02, -0.08]));
    const shift = sub(eye, along(nose, [-ahead[0] * BEHIND, -DROP, -ahead[2] * BEHIND], w.plant));
    q.at = add(q.at, shift);
    const s = solve(q);
    const fwd: Vec3 = [-Math.sin(q.yaw), 0, -Math.cos(q.yaw)];
    for (const j of [J.THIGH_L, J.THIGH_R]) {
      // On all fours the paws go with the body, which is laid out round its head.
      reach(q, s, j, along(s0.pos[j + 2], shift, wf), fwd, true);
    }
    // The weapons stay out of the trunk and in sight: looking down, their grips would sink into the
    // chest or under it, so they go forward until they are clear. The katana's two grips and its
    // guard go together.
    const out = (pts: Vec3[], to = turn) =>
      along([0, 0, 0], fwd, Math.max(...pts.map(p => outOf(s, q.yaw, eye, add(eye, to(p))))));
    lift = [0, 0, 0];
    const [g0, gx] = holster();
    // The gun's grip, the back of its body and the top of its counter, which lie toward the chest.
    const on = ([x, y, z]: Vec3): Vec3 =>
      [0, 1, 2].map(i => g0[i] + gx[0][i] * x + gx[1][i] * y - gx[2][i] * z) as Vec3;
    lift = view(out([g0, on(REAR), on([0, 0.146, 0.038])]));
    const clear = sw
      ? out([sw.at, along(sw.at, sw.g, -BACK), along(sw.at, sw.g, BASE)], keep)
      : lift;
    // The gun hand's wrist: the grip is 8 cm along the fingers from it and 2 cm toward the palm.
    const [gp, ga] = holster();
    /** The weapon in hand by kind, for its button: the gun, the katana, the rail gun, the rifle. */
    const pk = me?.wield ? 1 : me ? kindOf(me) : 0;
    // The grip's tilt in the hand: a long gun's is its own (tiltOf()), but not the Hunter's, whose
    // cannon and disc only borrow the rail gun's and the rifle's flags.
    const tilt = hunter ? TILT : tiltOf(pk);
    const fh = [0, 1, 2].map(i => tilt[1] * ga[2][i] - tilt[0] * ga[1][i]) as Vec3;
    const [far, palm] = holdOf(hunter ? 0 : pk);
    const wrist = [0, 1, 2].map(i => gp[i] - far * fh[i] + palm * ga[0][i]) as Vec3;
    // The rail gun's front grip, for the left hand.
    // Cup the fixed lower shell with the thumb along the tube as the sleeve extends.
    const [fc, fd, fu] = harpoonDraw
      ? [along(along(gp, ga[2], 0.19), ga[1], 0.091), ga[2], ga[0]]
      : fore(gp, ga, me ? kindOf(me) : 2);
    // The katana and both fists as one piece, the wrists straight, the shoulders gone with the
    // hands (clasp()).
    const kq = { ...q, rot: q.rot.slice() };
    let [grip0, blade0, fingR, fingL]: Vec3[] = [eye, Y, Y, Y];
    if (sw && !hunter) {
      // In the guard 6 cm toward the middle of the body and 5 cm up, back in a cut: the left arm
      // crosses less before the chest, the right fist stays in sight (the user, 2026-11-09).
      const [at, g] = [
        add(
          add(
            eye,
            keep(
              add(
                sw.at,
                mix(
                  [0, 0, 0],
                  [-0.05, 0.05, 0],
                  prog < 0 ? 1 : (1 - Math.sin(Math.PI * clamp(prog))) ** 2,
                ),
              ),
            ),
          ),
          clear,
        ),
        keep(sw.g),
      ];
      shrug(kq, s, J.ARM_R, at);
      shrug(kq, s, J.ARM_L, along(at, g, -BACK));
      [grip0, blade0, fingR, fingL] = clasp(
        solve(kq),
        at,
        g,
        [keep([0.5, -1, -0.35]), keep([-0.5, -1, -0.35])],
        0.1 * (1 - 0.98 * braced),
      );
    }
    /** The left hand's slap of the gun's battery: its weight and how far off the battery it is. */
    let [slapW, slapTap] = [0, 0];
    /** The wrist computer's fire key in the world and how far up it is read, once the left arm is posed. */
    let [key, keyW]: [Vec3, number] = [eye, 0];
    for (const sd of [-1, 1]) {
      const k = Math.cos(TAU * gait.phase) * sd;
      // The numbers are for the right hand, mirrored below. The arms hang along the body, out of
      // view; in a stride each swings like a pendulum, up into the lower view ahead and out of it
      // behind, more with speed and highest in a sprint.
      const g = clamp(w.amp * 1.8) + 0.2 * w.sprint;
      let h: Vec3 = [0.24 - 0.05 * g, -0.66 + 0.46 * g * ((k + 1) / 2) ** 1.2, 0.1 + 0.26 * g * k];
      h = mix(h, [0.38, -0.2, 0.34], w.air);
      h = mix(h, [0.3, 0.02, 0.45], w.rise);
      h = mix(h, [0.14, -0.1, 0.5], w.dash);
      // Firing the rail gun on a wall takes both hands off it.
      const toWall = w.wall * clamp(side * sd) * (me?.railed ? 1 - w.gun : 1);
      h = mix(h, [0.42, -0.16, 0.42], toWall);
      h = mix(h, sd > 0 ? [0.36, -0.26, 0.38] : [0.28, -0.1, 0.42], w.slide);
      h = mix(h, strokeHand(swimPh, sd, strokeShare(me ? speedOf(me) : 0)), w.swim);
      // Reeling from a tackle: the hands thrown out and up, flailing against each other.
      const flail = Math.sin(clock * 12 + (sd > 0 ? Math.PI : 0));
      // A punch (no weapon at all, FIRE) drives the striking fist of its blow (SIDE) up to the
      // middle of the view and brings the other into its lower corner, drawn back. A hook comes
      // round from the side, a lunge goes further out.
      const jab = me ? thrown(me, xeno) : 0;
      const blow = me ? blowOf(me, xeno) : 0;
      const strikes = sd == SIDE[blow];
      const fist: Vec3 =
        blow == BLOW.HOOK
          ? [0.04 + 0.5 * Math.sin(Math.PI * jab), -0.06, 0.52]
          : blow == BLOW.LUNGE
            ? [0.02, -0.12, 0.78]
            : [0.02, -0.13, 0.66];
      // The xenomorph's claws rake (the user, 2026-11-23: a richer swipe than a punch): the
      // striking hand flies up and out on its side, claws spread, slashes down and across the view
      // through the strike, then comes back; the other is drawn back as a punch's. `rake`: the
      // share of a claw's swing (-1 for none), `clutch` how much the striking hand follows it.
      const rake =
        me?.swing && strikes && (blow == BLOW.CLAW_L || blow == BLOW.CLAW_R)
          ? 1 - me.swing / PUNCHES[blow].ticks
          : -1;
      const clutch = rake < 0 ? 0 : Math.min(1, 2.5 * (1 - rake));
      h = mix(
        h,
        rake < 0
          ? strikes
            ? fist
            : [0.26, -0.36, 0.26]
          : mix(mix(h, RAKE_UP, ease(span(rake, 0, 0.2))), RAKE_DOWN, ease(span(rake, 0.2, 0.4))),
        rake < 0 ? jab : clutch,
      );
      h = mix(h, [0.46, 0.05 + 0.2 * flail, 0.4 + 0.1 * flail], w.stun);
      // A glory kill: both claws up in the view holding the prey, torn apart as the bite goes in.
      const bite = me?.lock ? Math.max(devour(me.lock), 0) : 0;
      h = mix(h, [0.17 + 0.16 * bite, -0.02 - 0.1 * bite, 0.46 - 0.06 * bite], w.feast);
      if (grip) {
        // On the ledge's lip, a hand-width apart along the wall, the right hand on the right.
        let [tx, tz] = [-grip.dz, grip.dx];
        if (dot([tx, 0, tz], r) < 0) {
          [tx, tz] = [-tx, -tz];
        }
        // The wrist a hand's length short of the lip, the fingers over it.
        const lip = PLAYER_R + GRAB_GAP - 0.08;
        const at: Vec3 = [
          grip.x + grip.dx * lip + tx * 0.12 * sd,
          grip.y + 0.03,
          grip.z + grip.dz * lip + tz * 0.12 * sd,
        ];
        // Rising past it the hands push down on it and stay in the lower view.
        const [px, py, pz] = view(sub(at, eye));
        h = mix(h, [px * sd, Math.max(py, -0.28), Math.max(pz, 0.4)], w.plant);
      }
      // The weapons take the hand unless it is on a ledge or a wall or reeling. The katana takes
      // both hands.
      const free = 1 - clamp(w.plant + toWall + w.stun);
      const onSword = sw ? w.blade * free * (hunter && sd < 0 ? 0 : 1) : 0;
      // With his wrist blades out the Hunter's left arm comes up into view in a guard, balanced
      // against the right, its hand open, ready to fight (the user, 2026-11-23).
      const guard = hunter && sd < 0 && sw ? w.blade * free : 0;
      // In a cut it fights too (the user, 2026-11-23): it reaches out ahead through the wind-up,
      // the swing's momentum, then snaps back in tight to the belly on the strike, and returns.
      const [reached, tucked] = guard > 0 && me ? counter(me, prog) : [0, 0];
      h = mix(h, mix(mix(GUARD, LUNGE_L, reached), TUCK, tucked), guard);
      h[1] += 0.012 * k * guard * (1 - reached - tucked);
      // With the shoulder cannon out, the left forearm comes up across the view, the computer on
      // the bracer turned to the eye, as the cannon unfolds (handsFree() took `railed` off `me`).
      const reading = hunter && sd < 0 && railed ? ease(cannon) * free : 0;
      h = mix(h, COMPUTER, reading);
      let taken = onSword;
      if (sd > 0) {
        hold = w.gun * free;
        h = mix(h, wrist, hold);
        grasp = onSword;
        taken = Math.max(hold, grasp);
      }
      // A loose fist, tighter as the pace goes up; open to catch the air, flat on a ledge, a wall or the floor.
      let curl = 0.75 + 0.25 * w.sprint;
      for (const [open, t] of [
        [0.25, w.air],
        [0.1, w.rise],
        [1, w.dash],
        [0.1, toWall],
        [0.1, w.slide],
        [loop(CURLS, swimPh), w.swim],
        [0.1, w.plant],
        [0.2, w.stun],
        [0.5, w.feast],
      ]) {
        curl += (open - curl) * t;
      }
      // Raking, the striking hand's claws spread wide up to the strike, then hook in as it tears
      // through.
      curl += (0.45 * +(rake > 0.4) - curl) * clutch;
      // The Hunter's blades come out of the bracer over a clenched fist (the user, 2026-11-23).
      curls[(sd + 1) / 2] =
        curl +
        ((hunter && onSword
          ? 1
          : hunter && me?.rifled && sd > 0
            ? discIn()
              ? DISC_CURL
              : 0.3
            : !hunter && pk >= 2 && sd > 0
              ? LONG_CURL
              : 0.9) -
          curl) *
          taken +
        (GUARD_CURL + 0.5 * tucked - curl) * guard +
        (0.55 - curl) * reading;
      let to = add(eye, turn([h[0] * sd, h[1], h[2]]));
      // The right hand over the wrist computer, its fingers on the fire key: pressed in the first
      // 4 ticks of the cannon's 15 between shots (`cool`), let go over the next 6, else hovering
      // 3 cm off it.
      const typing = sd > 0 ? keyW * free : 0;
      /** Where the index's tip goes: on the fire key, or hovering off it. */
      let tip = key;
      if (sd > 0) {
        poking = typing;
        // The other fingers loosely bent under the index.
        curls[1] += (0.45 - curls[1]) * typing;
      }
      if (typing > 0.002) {
        const press = ease(clamp(((me?.cool ?? 0) - 5) / 6));
        const off = add(key, along([0, 0, 0], unit(sub(eye, key)), 0.03 * (1 - press) + 0.004));
        // The forearm comes into the view from its lower right corner, running ahead, the hand on
        // its line (the user's reference, 2026-11-23): the wrist the index's length back from its
        // tip on the key, along POKE.
        tip = off;
        to = mix(to, along(off, unit(turn(POKE)), -0.165), typing);
      }
      const arm = sd < 0 ? J.ARM_L : J.ARM_R;
      const pole = mix(POLE, COMPUTER_POLE, reading);
      let bend = turn([pole[0] * sd, pole[1], pole[2]]);
      if (typing > 0.002) {
        // The elbow where the forearm runs along POKE into the wrist: the arm bends toward it.
        const fore = dist(s.pos[J.FOREARM_R], s.pos[J.HAND_R]);
        const elbow = along(to, unit(turn(POKE)), -fore);
        bend = mix(bend, unit(sub(elbow, mix(s.pos[J.ARM_R], to, 0.5))), typing);
      }
      reach(q, s, arm, to, bend);
      if (typing > 0.002) {
        // The index lies on the forearm's line, which the shoulder's place bends off POKE as he
        // runs: its tip went past the key and into the computer (the user, 2026-11-25). The wrist
        // set again the index's length back along the forearm as it is solved, twice.
        for (let n = 0; n < 2; n++) {
          const solved = solve(q);
          const fore = unit(sub(solved.pos[J.HAND_R], solved.pos[J.FOREARM_R]));
          reach(q, s, arm, mix(to, along(tip, fore, -0.165), typing), bend);
        }
      }
      // The palm turns down, the back of the hand to the view, flat on a ledge or the floor;
      // raking, it turns to face the way of the slash.
      q.rot[arm + 2] = axis(
        Y,
        sd * (1 + 0.5 * (w.plant + w.slide) + 0.9 * clutch + w.swim * loop(ROLLS, swimPh)),
      );
      if (typing > 0.002) {
        // The back of the right wrist up (its forearm's local +x, as with the blades), the hand
        // straight on the forearm's line (the user, 2026-11-24).
        const held = { ...q, rot: q.rot.slice() };
        const solved = solve(held);
        const forearm = unit(sub(solved.pos[J.HAND_R], solved.pos[J.FOREARM_R]));
        held.rot[J.FOREARM_R] = mul(inv(solved.rot[arm]), frame(unit(across(Y, forearm)), forearm));
        held.rot[J.HAND_R] = ID;
        for (const k of [arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], typing);
        }
      }
      if (sd > 0 && hold > 0.002) {
        // The back of the hand along the gun's right, the fingers around the grip.
        const rot = frame(turn(ga[0]), turn(fh));
        q.rot[arm + 2] = slerp(q.rot[arm + 2], mul(inv(solve(q).rot[J.FOREARM_R]), rot), hold);
      }
      if (reading > 0.002) {
        // The forearm rolled so that the bracer's back, its local -x, faces up and toward the eye,
        // halfway (the user, 2026-11-23: less turned to the view); the hand straight on it.
        const held = { ...q, rot: q.rot.slice() };
        const solved = solve(held);
        const forearm = unit(sub(solved.pos[J.HAND_L], solved.pos[J.FOREARM_L]));
        const look = unit(sub(solved.pos[J.HAND_L], eye));
        const x = unit(across(add(look, [0, -2, 0]), forearm));
        held.rot[J.FOREARM_L] = mul(inv(solved.rot[J.ARM_L]), frame(x, forearm));
        held.rot[J.HAND_L] = ID;
        for (const k of [arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], reading);
        }
        const posed = solve(q);
        // The right hand's finger presses its fire key at each shot (the user, 2026-11-23).
        key = add(posed.pos[J.HAND_L], spin(posed.rot[J.FOREARM_L], FIRE_KEY));
        keyW = reading;
      }
      if (hunter && sw && onSword > 0.002) {
        // Lead with the wrist. The elbow stays wide so the two blades cross into view.
        const at = add(eye, add(keep(add(sw.at, [0.1, 0.12, -0.14])), clear));
        const held = { ...q, rot: q.rot.slice() };
        reach(held, s, arm, at, keep([1, -0.8, 0.25]));
        const solved = solve(held);
        const forearm = unit(sub(solved.pos[J.HAND_R], solved.pos[J.FOREARM_R]));
        // The back of the wrist rolled well over to the right: the blades lean on their side (the
        // user, 2026-11-23).
        const dorsal = unit(across(keep(CLAW_ROLL), forearm));
        held.rot[J.FOREARM_R] = mul(inv(solved.rot[arm]), frame(dorsal, forearm));
        held.rot[J.HAND_R] = ID;
        for (const k of [arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onSword);
        }
      } else if (sw && onSword > 0.002) {
        // Both hands round the grip, the left one BACK behind the right, the wrists straight.
        const at = along(grip0, blade0, sd > 0 ? 0 : -BACK);
        const held = { ...q, rot: q.rot.slice() };
        held.rot[arm - 1] = kq.rot[arm - 1];
        wield(
          held,
          s,
          arm,
          at,
          blade0,
          keep([0.5 * sd, -1, -0.35]),
          sd > 0 ? fingR : fingL,
          sd > 0 ? FIST : KATANA_LEFT,
          sd > 0 ? [S, C] : KATANA_TILT,
          sd < 0,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onSword);
        }
      }
      // The rail gun takes the left hand too, on its front grip, the elbow down and out; the
      // rifle's handguard lies in its palm, a cup (RIFLE_HOLD).
      const two =
        sd < 0 && ((me?.railed && !hunter) || (me?.rifled && !hunter) || harpoonDraw)
          ? w.gun * free
          : 0;
      if (two > 0.002) {
        const held = { ...q, rot: q.rot.slice() };
        if (fu) {
          shrug(held, s, arm, add(eye, turn(fc)));
        }
        wield(
          held,
          s,
          arm,
          add(eye, turn(fc)),
          unit(turn(fd)),
          turn([-0.5, -1, -0.35]),
          fu && turn(fu),
          // The Hunter's harpoon keeps the fist it had.
          fu ? RIFLE_HOLD : hunter ? FIST : LONG_HOLD,
          fu ? RIFLE_TILT : undefined,
          false,
          !!fu,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], two);
        }
        curls[0] += ((fu ? RIFLE_CURL : hunter ? 0.9 : LONG_CURL) - curls[0]) * two;
      }
      if (sd < 0) {
        cupping = fu ? two : 0;
      }
      // In a swap the left hand brings the new battery up under the grip, or takes the capsule
      // off the top and screws the new one on.
      const sp = me ? swapOf(me) : -1;
      const rail = !!me?.railed;
      const onLoad =
        sd < 0 && !harpoonDraw && sp >= 0
          ? w.gun *
            free *
            (rail
              ? ease(span(sp, 0.34, 0.46)) * (1 - ease(span(sp, 0.88, 0.96)))
              : ease(span(sp, BROUGHT - 0.03, BROUGHT)) * (1 - ease(span(sp, TAP + 0.03, 0.9))))
          : 0;
      // The gun's or the rifle's new battery from the pouch on the left hip (the user, 2026-11-09):
      // the hand off the gun down to it, into it and the battery out, then up with it under the
      // grip, where the gun takes it (above BROUGHT). The battery is drawn in the hand (carried).
      const fetch =
        sd < 0 && !harpoonDraw && sp >= 0 && !rail
          ? w.gun * free * ease(span(sp, 0.12, 0.2)) * (1 - ease(span(sp, BROUGHT - 0.03, BROUGHT)))
          : 0;
      if (sd < 0) {
        carried = undefined;
      }
      if (fetch > 0.002 && me) {
        const [foot, ax] = loadFrame(gp, ga, kindOf(me), BROUGHT);
        const f = fetched(
          sp,
          pouchAt(s.pos[J.PELVIS], s.rot[J.PELVIS]),
          [add(eye, turn(foot)), ax.map(turn)],
          add(eye, turn(along(gp, ga[1], -0.12))),
        );
        carried = f.carry;
        const held = { ...q, rot: q.rot.slice() };
        wield(held, s, arm, f.at, f.g, turn([-0.5, -1, -0.35]));
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], fetch);
        }
        curls[0] += (f.curl - curls[0]) * fetch;
        cupping *= 1 - fetch;
      }
      if (onLoad > 0.002) {
        // On the new battery or capsule, which comes with the hand. The capsule is held round its
        // side, the wrist turning about it as it screws it in.
        const [foot, [, , up]] = loadFrame(
          gp,
          ga,
          me ? kindOf(me) : 0,
          Math.max(sp, rail ? 0.42 : 0.4),
        );
        // The battery in but for its last 12 mm, held there a moment; then the palm drops 12 cm off
        // it and slaps it home at TAP, faster and faster (the user, 2026-11-09).
        const tap =
          0.12 *
          (sp < TAP - 0.04 ? ease(span(sp, 0.64, TAP - 0.04)) : 1 - span(sp, TAP - 0.04, TAP) ** 3);
        const mid = [0, 1, 2].map(i => foot[i] + up[i] * (rail ? CAPSULE_UP : -0.01 - tap)) as Vec3;
        let fing: Vec3 | undefined;
        if (rail) {
          // From the capsule's axis out to its left, turned with the wrist.
          const o = rotate(mix([0, 0, 0], ga[0], -1), mix([0, 0, 0], up, screwed(sp)[1]));
          fing = turn(mix([0, 0, 0], o, -1));
        }
        const held = { ...q, rot: q.rot.slice() };
        if (fing) {
          shrug(held, s, arm, add(eye, turn(mid)));
        }
        wield(
          held,
          s,
          arm,
          add(eye, turn(mid)),
          unit(turn(up)),
          turn([-0.5, -1, -0.35]),
          fing,
          rail ? CAPSULE_HOLD : FIST,
          undefined,
          false,
          rail,
        );
        // The battery in, the hand lets go of it and opens flat, the palm up to its foot, the
        // fingers along the gun, to slap it home with the palm (the user, 2026-11-09).
        // The battery in, the hand lets go of it and opens flat to slap it home (below).
        const flat = rail ? 0 : ease(span(sp, 0.6, 0.64));
        [slapW, slapTap] = [onLoad * flat, tap];
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], onLoad);
        }
        curls[0] += ((rail ? CAPSULE_CURL : 0.9) - 0.85 * flat - curls[0]) * onLoad;
        cupping *= 1 - onLoad;
      }
      // Each weapon comes on its own way (the user, 2026-11-09): the left index presses the laser
      // rifle's button, the hand off its front grip, flat, the index out, and back; the right thumb
      // presses the plasma gun's and the katana's (draw()); the left hand turns the rail gun's
      // capsule (below).
      const pw = sd < 0 && me && sp < 0 && pk == 3 ? poke(since, pressOf(pk)) * w.gun * free : 0;
      // The rail gun's capsule: the left hand off the front grip onto its side, turning it a
      // quarter of a turn with the wrist, as it screws a new one in, and back.
      const tw = sd < 0 && me && sp < 0 && pk == 2 ? poke(since, pressOf(2)) * w.gun * free : 0;
      if (tw > 0.002) {
        const th = tune(since, pressOf(2));
        const [foot, [, , up]] = loadFrame(gp, ga, 2, -1, 1, 0, th);
        const mid = [0, 1, 2].map(i => foot[i] + up[i] * CAPSULE_UP) as Vec3;
        const o = rotate(mix([0, 0, 0], ga[0], -1), mix([0, 0, 0], up, th));
        const held = { ...q, rot: q.rot.slice() };
        shrug(held, s, arm, add(eye, turn(mid)));
        wield(
          held,
          s,
          arm,
          add(eye, turn(mid)),
          unit(turn(up)),
          turn([-0.5, -1, -0.35]),
          turn(mix([0, 0, 0], o, -1)),
          CAPSULE_HOLD,
          undefined,
          false,
          true,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], tw);
        }
        curls[0] += (CAPSULE_CURL - curls[0]) * tw;
      }
      if (sd < 0) {
        pointing = pw;
        cupping *= 1 - pw;
      }
      if (pw > 0.002) {
        // The gun's model frame in the world, from the holster.
        const [bat, bax]: [Vec3, Vec3[]] = [add(eye, turn(gp)), ga.map(turn)];
        const [b, n] = buttonAt(pk, bat, bax);
        // The index level with the gun, into the button, the thumb back toward the player: the hand
        // flat, its back up (the user, 2026-11-09).
        const into = unit(across(mix([0, 0, 0], n, -1), bax[1]));
        const g = unit(across(mix([0, 0, 0], bax[2], -1), into));
        const sid = unit(along(into, g, -S));
        const fing = along(mix([0, 0, 0], g, S), sid, C);
        const th = along(mix([0, 0, 0], g, C), sid, -S);
        const held = { ...q, rot: q.rot.slice() };
        wield(
          held,
          s,
          arm,
          along(along(b, fing, -0.1), th, -0.034),
          g,
          turn([-0.5, -1, -0.35]),
          into,
        );
        for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
          q.rot[k] = slerp(q.rot[k], held.rot[k], pw);
        }
      }
      // On a wall the fore paws stay on it (fours.ts).
      for (const k of [arm - 1, arm, arm + 1, arm + 2]) {
        q.rot[k] = slerp(q.rot[k], pawed[k], wf);
      }
    }
    // The slap, once the right hand has the gun (the user, 2026-11-09: the hand flat, the palm
    // striking the battery): on the battery as drawn, the palm's middle 5 cm along the fingers from
    // the wrist and its skin on the foot at TAP; the left hand's x, its palm side, up the battery.
    if (slapW > 0.002 && me) {
      const r = solve(q);
      const ax = gunAxes(r.rot[J.HAND_R], hunter ? 0 : kindOf(me));
      const [foot, [, , up]] = loadFrame(
        gunGrip(r.pos[J.HAND_R], r.rot[J.HAND_R], hunter ? 0 : kindOf(me)),
        ax,
        kindOf(me),
        Math.max(swapOf(me), 0.4),
      );
      // The hand straight on the forearm (the user, 2026-11-09): the fingers carry on its line, the
      // palm turned up the battery as far as that allows; the wrist set again from the forearm.
      const slap = { ...q, rot: q.rot.slice() };
      let d = unit(across(ax[0], up));
      let x = up;
      for (let k = 0; k < 3; k++) {
        const palm = along(along(foot, up, -slapTap), d, -0.05);
        reach(slap, r, J.ARM_L, along(palm, x, -0.012), turn([-0.5, -1, -0.35]));
        const t = solve(slap);
        d = unit(sub(t.pos[J.HAND_L], t.pos[J.FOREARM_L]));
        x = unit(across(up, d));
      }
      // The wrist bent a little, half the way to the fingers square to the battery, so that the
      // palm meets it flat and the hand still reads along the arm (the user, 2026-11-09).
      const f = unit(mix(d, unit(across(d, up)), 0.5));
      const xf = unit(across(up, f));
      reach(
        slap,
        r,
        J.ARM_L,
        along(along(along(foot, up, -slapTap), f, -0.05), xf, -0.012),
        turn([-0.5, -1, -0.35]),
      );
      slap.rot[J.HAND_L] = mul(inv(solve(slap).rot[J.FOREARM_L]), frame(xf, f));
      for (const k of [J.ARM_L - 1, J.ARM_L, J.FOREARM_L, J.HAND_L]) {
        q.rot[k] = slerp(q.rot[k], slap.rot[k], slapW);
      }
    }
    return solve(q);
  };

  return {
    get id() {
      return me?.id ?? -1;
    },
    update,
    pose,
    wear(b, t, n = false, x = false, h = false) {
      [tone, ninja, xeno] = [x ? CHITIN_X : t, n, x];
      hunter = h;
      if (b != build) {
        // Her own skeleton: a gait of its own, in the pose of the player at once.
        [build, gait] = [b, createGait(0, b)];
        if (me) {
          gait.update(me, 0, world && floorOf(world, me.y));
        }
      }
    },
    draw(out, eye, yaw, pitch, roll = 0, color = [0.7, 0.7, 0.7], pieces) {
      const s = pose(eye, yaw, pitch, roll);
      if (s) {
        palmsOf(s, palms);
        // An armoured suit (see palette()): its gloves cover the fingers too; white armour in space,
        // else in the team's colour.
        const suit = !!world?.def.armor && !ninja && !xeno && !hunter;
        const plate = world?.def.helmets ? undefined : color;
        const colors = palette(
          hunter ? [0.34, 0.25, 0.17] : ninja || xeno ? CLOTH : color,
          undefined,
          undefined,
          suit,
          hunter ? [0.42, 0.29, 0.19] : tone,
        );
        if (hunter) {
          colors[REGION.PANTS] = HUNTER_HAND;
          colors[REGION.UPPER] = [0.38, 0.27, 0.17];
          colors[REGION.GLOVE] = HUNTER_HAND;
          colors[REGION.BELT] = [0.19, 0.15, 0.11];
        }
        if (ninja || xeno) {
          const { PANTS, UPPER, GLOVE, BELT } = REGION;
          // His belt is cut in a V by armor(), as on the others (soldier.ts).
          [colors[PANTS], colors[UPPER], colors[GLOVE], colors[BELT]] = [
            CLOTH,
            CLOTH,
            CLOTH,
            CLOTH,
          ];
        }
        const from = out.length;
        if (xeno) {
          const { PANTS, UPPER, GLOVE, JACKET, TRIM, SOLE, BELT } = REGION;
          for (const k of [PANTS, UPPER, GLOVE, JACKET, TRIM, SOLE, BELT]) {
            colors[k] = CHITIN_X;
          }
        }
        skin(out, xeno ? beast(2) : body(2, build), s, colors);
        if (xeno) {
          // Its feet, the skin's legs ending at the ankles (soldier.ts draws them on the others).
          // The runners' close ones (partsOf()), made once, carried here.
          const [foot, toes] = [partsOf(3)[PART.FOOT], partsOf(3)[PART.TOES]];
          for (const [f, t] of FEET) {
            expand(out, { m: mesh(foot.key, made(foot)), q: s.rot[f], t: s.pos[f], k: 1 });
            const at = add(s.pos[f], spin(s.rot[f], FOOT_TIP));
            expand(out, { m: mesh(toes.key, made(toes)), q: s.rot[t], t: at, k: 1 });
          }
          // Its tail (the user, 2026-11-16: seen in the own view as the katana is), only while it
          // strikes: round the hip or over the shoulder, into the view.
          const lash = me ? lashOf(me, clock) : HOOKED;
          if (lash != HOOKED) {
            tail(out, s, clock, 0, lash, color, 2, 0, me);
          }
        }
        // The ninja's own plates in his team's colour (soldier.ts).
        if ((world?.def.armor && !xeno && !hunter) || ninja) {
          armor(out, from, body(2, build), true, plate, ninja, color, !world?.def.armor);
        }
        if (hunter) {
          for (const part of hunterView(build)) {
            // The hip's disc is in his hand while it is the weapon, and not on him until he finds
            // it on a rack (the user, 2026-11-26).
            const noDisc = !!me?.rifled || (!!me && (me.rifle ?? -1) < 0);
            if (!(noDisc && part.key.endsWith('Flying disc'))) {
              drawHunterPart(out, part, s, pieces);
            }
          }
          // The wrist computer on the left bracer, its glyphs the cannon's shots left. Not drawn
          // while the left hand is on the harpoon: the forearm rolls as it comes up to the grip,
          // and the computer would be seen on it at first and then turn out of sight (the user,
          // 2026-11-24).
          if (!harpoonDraw) {
            const shots = me?.cap ?? HUNTER_CELLS;
            placeRigid(
              out,
              `wrist computer ${shots}`,
              wristComputer(shots),
              s.rot[J.FOREARM_L],
              s.pos[J.HAND_L],
              pieces,
            );
          }
          // The shoulder cannon, from the camera: stowed, it is out of sight and not drawn.
          if (cannon > 0) {
            const [hinge, q] = cannonInView(cannon, target);
            const view = mul(
              mul(axis([0, 1, 0], yaw), axis([1, 0, 0], pitch)),
              axis([0, 0, 1], -roll),
            );
            const [r, u, f] = basis(yaw, pitch, roll);
            const at = [0, 1, 2].map(
              i => eye[i] + r[i] * hinge[0] + u[i] * hinge[1] + f[i] * hinge[2],
            ) as Vec3;
            placeRigid(out, 'hunter view cannon', cannonVertices(), mul(view, q), at, pieces);
            // Its post, from the shoulder up to the hinge.
            placeRigid(
              out,
              'hunter view post',
              postVertices(),
              mul(view, armTurn(folded(cannon))),
              at,
              pieces,
            );
          }
        }
        pouch(out, s.pos[J.PELVIS], s.rot[J.PELVIS]);
        if (ninja) {
          blades(out, s.pos[J.PELVIS], s.rot[J.PELVIS], build);
          drape(out, s, build, clock, me ? Math.hypot(me.vx, me.vz) : 0, color, 1);
        }
        // The right thumb presses the button of the katana or the plasma gun as it comes on.
        const tk = me?.wield ? 1 : me ? kindOf(me) : -1;
        const push =
          me &&
          !harpoonDraw &&
          swapOf(me) < 0 &&
          ((tk == 1 && grasp > 0.2) || (tk == 0 && hold > 0.2))
            ? poke(since, pressOf(tk))
            : 0;
        // Her hand: the same one, smaller about the wrist, so it closes on the same grips.
        // The xenomorph's hands stay half open, its claws out: it rakes, it does not punch.
        hands(
          out,
          s,
          build,
          xeno ? curls.map(c => Math.min(c, RAKE)) : curls,
          hunter ? HUNTER_HAND : colors[7],
          hunter ? HUNTER_HAND : suit ? colors[7] : colors[3],
          {
            point: pointing,
            poke: poking,
            push,
            to: thumbTo(Math.max(tk, 0)),
            cup: cupping,
            lights: suit && !!plate,
            claws: hunter ? 'short' : xeno,
            // The fingers fanned out over the disc's hub (the user, 2026-11-23).
            spread: hunter && me?.rifled && discIn() ? DISC_SPREAD : 1,
            hook: hunter && me?.rifled && discIn() ? DISC_HOOK : 0,
          },
        );
        if (hold > 0.2) {
          // The gauge lights once a press is more than a tap: the strength the shot would have.
          // The Hunter's pistol keeps its battery apart from his harpoon's (`sideMag`).
          const mag = me?.sided ? me.sideMag : me?.mag;
          const level =
            me && (me.charge ?? 0) >= CHARGE_TAP ? Math.min(powerOf(me.charge!), mag ?? 0) : 0;
          const kind = me ? kindOf(me) : 0;
          const rail = kind == 2;
          const sp = me ? swapOf(me) : -1;
          const on = since - Math.max(pressOf(kind), 0);
          if (hunter && kind === 0 && !me?.sided) {
            // In close detail (lod 2): the round scope and the lit buttons (harpoonFine()).
            drawHarpoon(
              out,
              2,
              gunGrip(s.pos[J.HAND_R], s.rot[J.HAND_R]),
              gunAxes(s.rot[J.HAND_R]),
              0.82,
              ease(harpoonDraw),
              !!me?.mag || sp >= 0,
              harpoonFeed(sp),
              pieces,
              (HARPOON_GONE * harpoonShot) / HARPOON_OUT,
            );
          } else if (hunter && kind === 3 && !discIn()) {
            // Thrown: the hand is empty until it comes back.
          } else if (hunter && kind === 3) {
            // The armour's disc held by its hub (the user, 2026-11-23): the palm on the hub, the
            // fingers over its face between the blades; its face along the back of the hand
            // (gunAxes()' right), the disc beyond the palm.
            const q = s.rot[J.HAND_R];
            const [ax, up, fwd] = gunAxes(q);
            const at = gunGrip(s.pos[J.HAND_R], q).map(
              (c, i) => c + fwd[i] * DISC_HOLD[0] - ax[i] * DISC_HOLD[1],
            ) as Vec3;
            drawDisc(out, at, fwd, up, ax);
          } else if (!(hunter && rail)) {
            held(
              out,
              s.pos[J.HAND_R],
              s.rot[J.HAND_R],
              1,
              clamp(hold * 1.5 - 0.5),
              kind == 3 ? me!.clip : rail ? charge(me!.cap ?? 0) : mag,
              level,
              kind,
              clock,
              {
                // Dark from when the old one comes out until the new one is in, the gun's counter
                // dark with it; then the thumb presses the button on its side and the gun boots: the
                // light comes on, and the counter fades in with the boot's whine.
                light:
                  sp < 0 ? power(on, kind ? undefined : GUN_ON.lit) : 1 - ease(span(sp, 0.1, 0.2)),
                swap: sp,
                empty: !(kind == 3 ? me?.clip : rail ? me?.cap : mag),
                screen: sp < 0 ? span(on, GUN_ON.from, GUN_ON.up) : 1 - ease(span(sp, 0.1, 0.2)),
                digits: sp < 0 && on >= GUN_ON.digits,
                press: sp < 0 && kind != 2 ? span(poke(since, pressOf(kind)), 0.8, 1) : 0,
                tune: rail && sp < 0 ? tune(since, pressOf(2)) : 0,
                nades: kind == 3 ? (me?.nades ?? 0) : undefined,
                id: me?.id,
                floor: me?.ground ? me.y : undefined,
                vel: me && [me.vx, me.vy, me.vz],
                carry: carried,
                cells: me && cellsOf(me),
                heat: (me?.heat ?? 0) / HEAT_MAX,
                hot: me?.hot,
                skin: hunter && !!me?.sided,
                // The Hunter's pistol is drawn from the store, worn (its scuffs on its own frame).
                list: hunter && me?.sided ? pieces : undefined,
              },
            );
          }
        }
        if (hunter) {
          // The housing stays on the bracer; the blades slide out of it each time they are taken
          // (the user, 2026-11-24: not only the first), once the arm is up, in time with their
          // sound (combat.ts, shing()), and back in.
          wristHousing(out, s.pos[J.HAND_R], s.rot[J.FOREARM_R], 1, pieces);
          const extended = me?.wield
            ? ease(clamp((since - pressAt(1)) / BLADE_EXTEND))
            : clamp(grasp * 1.5 - 0.5);
          if (extended > 0.01) {
            wristBlades(out, s.pos[J.HAND_R], s.rot[J.FOREARM_R], 1, extended, pieces);
          }
        }
        if (grasp > 0.2) {
          if (!hunter) {
            sword(
              out,
              s.pos[J.HAND_R],
              s.rot[J.HAND_R],
              1,
              clock,
              clamp(grasp * 1.5 - 0.5),
              // The thumb presses the button on the hilt and the blade lights up, all of it: it is no
              // light saber (the user, 2026-11-09).
              power(since - Math.max(pressOf(1), 0), 0.3),
              span(poke(since, pressOf(1)), 0.8, 1),
            );
          }
        }
        const [base, point] = hunter
          ? wristEnds(s.pos[J.HAND_R], s.rot[J.FOREARM_R])
          : ends(s.pos[J.HAND_R], s.rot[J.HAND_R]);
        // The parry's sweep leaves a streak like a cut's.
        trail.mark(base, point, grasp > 0.5 && (cutting(prog) || parry < 2 * PARRY_IN));
        trail.draw(out);
      }
    },
    aim(t) {
      const l = Math.hypot(...t);
      target = l < 3 ? (l ? (t.map(v => (v * 3) / l) as Vec3) : [0, 0, 3]) : t;
    },
    muzzle: () => {
      if (railed) {
        // The shoulder cannon's muzzle, where its shots are seen to leave.
        const [hinge, q] = cannonInView(cannon, target);
        return add(hinge, model(spin(q, CANNON_MUZZLE)));
      }
      return tip(...holster(), me ? kindOf(me) : 0);
    },
    spun: () => (me && prog >= 0 ? SWAY * bent(me, prog)[0] * w.blade : 0),
    parried: () => (parry = 0),
    palms,
    get steps() {
      return gait.steps;
    },
    get plant() {
      return gait.plant;
    },
    get phase() {
      return gait.phase;
    },
  };
};
