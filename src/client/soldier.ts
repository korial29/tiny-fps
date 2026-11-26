// The other players' model: a runner's skin (skin.ts) posed by its gait (gait.ts), in the
// renderer's vertex format. A runner is the last PlayerState seen and the gait that eases the body
// toward it; the dash streaks are the only thing drawn here that the gait does not pose. A
// player's (x, y, z) is the bottom of the feet. No DOM.
import { sabering } from '../shared/gun';
import {
  BLOW,
  DOWN_TICKS,
  EXEC,
  EYE,
  HEAT_MAX,
  RUN_SPEED,
  STEP_H,
  TICK_HZ,
} from '../shared/constants';
import { strike } from '../shared/blade';
import { TAU, floored } from '../shared/physics';
import { CUT, LIMB, MODE } from '../shared/types';
import type { Choice, PlayerState, Rover } from '../shared/types';
import { ray } from '../shared/world';
import type { World } from '../shared/world';
import {
  KATANA_LEFT,
  KATANA_TILT,
  RAKE,
  arc,
  clasp,
  devour,
  hands,
  inv,
  reach,
  shrug,
  stowed,
  wield,
} from './body';
import {
  HOOK,
  JAB,
  LUNGE,
  SIDE,
  TAIL_BLOW,
  armOf,
  bare,
  blowOf,
  blowing,
  createGait,
  frame,
  thrown,
} from './gait';
import type { Floor, Gait, Seat } from './gait';
import { FOOT_UP, createFours } from './fours';
import type { Fours } from './fours';
import {
  ARC,
  RIFLE_HOLD,
  RIFLE_TILT,
  holdOf,
  LONG_CURL,
  LONG_HOLD,
  tiltOf,
  BROUGHT,
  RIFLE_CURL,
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
  handOf,
} from './gun';
import { helm } from './helm';
import { helmet } from './helmet';
import {
  CANNON_FOLD,
  CANNON_HINGE,
  CANNON_MUZZLE,
  HUNTER_REST,
  blendHunter,
  DISC_HOLD,
  DISC_HOOK,
  DISC_SPREAD,
  drawDisc,
  drawHarpoon,
  harpoonFeed,
  folded,
  hunterPose,
  hunterRig,
  handsFree,
  hunterWristEnds,
  stripSwing,
  unfold,
} from './hunter';
import type { HunterPiece } from './hunter';
import { HEAD_SCALE, STYLE, hair, styleOf, sway } from './hair';
import { ID, ORIGIN, mesh } from './store';
import { flesh } from './flesh';
import type { Pieces } from './store';
import { CLOTH, dress, mask } from './mask';
import { cigar } from './cigar';
import { pads } from './pads';
import { KITS, ROLE } from '../shared/kit';
import { SASH, armor } from './armor';
import { CUP_F, crotch, hose, pack } from './pack';
import { fetched, pouch, pouchAt } from './pouch';
import { blades, drape } from './sash';
import type { Tracer } from './beams';
import {
  BEHIND,
  BOW,
  SWAY,
  bent,
  cutting,
  ends as swordEnds,
  held as sword,
  DEFLECT_LOW,
  PARRY_IN,
  deflect,
  locked,
  parrying,
  poised,
  progress,
  SLASH_TOP,
} from './katana';
import { ground, piece, track } from './limbs';
import type { Piece } from './limbs';
import { CHITIN, STRIDE, TWILL, WEAVE, add, basis, dot, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, PARENT, REST, RESTS, axis, mul, rest, slerp, solve, turn } from './rig';
import type { Pose, Quat } from './rig';
import {
  REGION,
  beardOf,
  beast,
  body,
  capOf,
  cut,
  eyesOf,
  hairOf,
  palette,
  shaved,
  skin,
  swing,
  tressOf,
} from './skin';
import type { Skin } from './skin';
import { CHITIN_X, FOOT_TIP, HEAD, PART, PIPE, SHELL, lashOf, partsOf, tail } from './xeno';
import type { Part } from './xeno';
import { createFace, dashing, felled, strain } from './expression';
import { footing } from './footing';
import {
  EXECUTE,
  FEAST,
  PUMMEL,
  chew,
  clutched,
  crouch,
  eating,
  intent,
  kneel,
  lunge,
  mounted,
  pummel,
  pummeling,
  seize,
  raised,
  swaying,
  topple,
} from './feast';
import type { Face } from './expression';
import type { Prey } from './feast';
import { CH, toneFor } from './features';
import { createTrail } from './trail';
import type { Trail } from './trail';
import { room } from './verts';
import type { Out } from './verts';

/** How fast the dash streaks grow and fade, 1 / s. */
const DASH_RATE = 14;
/** The neck a xenomorph bit the head off (LIMB.EATEN): raw, dark red where a katana's cut glows. */
const RAW = [0.32, 0.02, 0.02];

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
  /** The xenomorph's gait on all fours (fours.ts): none for the others. */
  fours?: Fours;
  /** Posed to threaten, the xenomorph of the menu's picture (menace()). */
  menace?: boolean;
  /** How much of a dash it is in, eased from 0 to 1: the length of the streaks. */
  dash: number;
  /** Seconds since its last shot, and how far its gun arm is raised to aim, eased from 0 to 1. */
  since: number;
  aim: number;
  /** Where its last shot went, which its gun points at. */
  focus: Vec3;
  /** How far through its katana cut it is, -1 when it is not cutting, the light the blade leaves and the clock of its crackle. */
  prog: number;
  /** Seconds since his katana struck a ball back (DEFLECT, katana.ts), from below 0 when it is yet to be drawn. */
  parry: number;
  trail: Trail;
  t: number;
  /** How far the Hunter's shoulder cannon is folded out, 0 stowed to 1 along his look. */
  cannon: number;
  /** The limb a katana's cut took off, while he is down (see limbs.ts). */
  cut?: Piece;
  /** Seconds left of the grimace a hit puts on his face, and of the grin of a capture or of a foe put down. */
  hurt: number;
  grin: number;
  /** Seconds left of his anger: a hit, a tackle or a punch from a foe. */
  mad: number;
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
  /**
   * A xenomorph's glory kill (feast.ts): the id of the other one, how far the xenomorph is on its
   * prey (mounted(), then down to 0 over FEAST.DROP once it has fed), and the other's feet.
   */
  mate?: number;
  mount?: number;
  /** The size of its prey's body to a man's (Kit size), for the xenomorph's holds on him. */
  size?: number;
  with?: Vec3;
  /** The xenomorph's belly as last drawn, for its prey's hands; the seconds it eats on after the kill. */
  bust?: Vec3;
  feed?: number;
  /** Where its prey's feet were as it last held him (FEAST.FEED); the seconds left of its head coming up after (FEAST.LOW). */
  fedOn?: Vec3;
  low?: number;
  /** The share of a drop of blood owed to the next frame (FEAST.GORE, EXECUTE.BLEED), the same from its prey's thighs (FEAST.GRIP), and the drops so far. */
  gore?: number;
  grip?: number;
  drops?: number;
  /** Seconds left of the blood from the neck of one the katana's execution beheaded. */
  bleed?: number;
  /** The execution's victim: the swordsman's feet while he kneels; once beheaded, them and the seconds since. */
  killer?: Vec3;
  slain?: { at: Vec3; t: number; pivot?: number };
  /** The execution's victim's pose as he last knelt, or the xenomorph's prey's as it last held him: the dead body tips over from it. */
  knelt?: Pose;
  /**
   * The fists' execution (feast.ts pummel()): its killer's ticks into the lock, smoothed between
   * snapshots and running on past it after the kill, and his victim as last drawn; its victim's
   * `fist`, set while he kneels to fists rather than a katana.
   */
  pum?: number;
  prey?: Prey;
  /** The katana's execution (feast.ts lunge()): its swordsman's ticks into the lock, smoothed as `pum`, running on past it for his recovery. */
  exe?: number;
  fist?: boolean;
  /** The skeleton as last drawn: a limb cut off leaves from it (limbs.ts track()). */
  s?: ReturnType<typeof solve>;
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
/** Seconds the anger of a hit, a tackle or a punch lasts; it fades over the second half. */
export const MAD = 4;

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
  const fours = look?.role === ROLE.XENO ? createFours() : undefined;
  fours?.update(p, 0);
  return {
    seat,
    p: { ...p },
    gait,
    fours,
    dash: +dashing(p),
    since: 1e3,
    aim: 0,
    focus: far(p),
    prog: -1,
    parry: Infinity,
    trail: createTrail(),
    t: 0,
    cannon: 0,
    hurt: 0,
    grin: 0,
    mad: 0,
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
  tracer?: Pick<Tracer, 'shock' | 'spit'> & Partial<Pick<Tracer, 'gore'>>,
  rovers?: Rover[],
  builds?: ReadonlyMap<number, number>,
  looks?: ReadonlyMap<number, Choice>,
) => {
  for (const id of book.keys()) {
    if (!others.some(p => p.id == id)) {
      book.delete(id);
    }
  }
  for (const shown of others) {
    // The Hunter's shoulder cannon leaves his hands free: his arms move as with no weapon.
    const p = looks?.get(shown.id)?.role === ROLE.HUNTER ? handsFree(shown) : shown;
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
      const floor = world && floorOf(world, p.y);
      r.gait.update(p, dt, floor, seat);
      r.fours?.update(p, dt, floor);
      r.dash += (+dashing(p) - r.dash) * (1 - Math.exp(-dt * DASH_RATE));
      r.since = p.shots == r.p.shots && !p.zapping ? r.since + dt : 0;
      // A shot raises the gun at once, so that it points at the shot when the beam is drawn.
      r.aim = r.since == 0 ? 1 : r.aim + (+(r.since < AIMING) - r.aim) * (1 - Math.exp(-dt * 12));
      r.focus = r.since < AIMING ? (world ? focus(p, world)[0] : far(p)) : r.focus;
      r.prog = progress(r.prog, p, dt);
      r.parry += dt;
      r.cannon = unfold(r.cannon, !!shown.railed && !p.down, dt);
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
      r.mad = p.hp < r.p.hp || p.stun > r.p.stun ? MAD : Math.max(r.mad - dt, 0);
      r.grin = felled(r.p, p, id => book.get(id)?.p, others) ? GRIN : Math.max(r.grin - dt, 0);
      r.dt += dt;
      const xeno = r.look?.role === ROLE.XENO;
      r.jab += (thrown(p, xeno) - r.jab) * (1 - Math.exp(-dt * 45));
      const g = grasp(p, r.seat, r.look?.role === ROLE.HUNTER);
      r.curls = r.curls.map((c, i) => c + (g[i] - c) * (1 - Math.exp(-dt * CLOSE)));
      r.blow = thrown(p, xeno) > 0 ? blowOf(p, xeno) : r.blow;
      r.flinch = Math.max(r.flinch - dt / FLINCH[0], 0);
      // A glory kill: the two locked, a xenomorph and its prey; after it, it slides off him. Or the
      // katana's execution (exec): the other one is where the victim faces.
      const foe = p.lock && p.foe !== undefined ? others.find(q => q.id == p.foe) : undefined;
      const mate = foe && !p.exec && xeno != (book.get(foe.id)?.look?.role === ROLE.XENO);
      if (mate) {
        [r.mate, r.mount] = [foe.id, mounted(p.lock!)];
        r.size = KITS[book.get(foe.id)?.look?.role ?? ROLE.MARINE].size;
      } else {
        r.mount = Math.max((r.mount ?? 0) - dt / FEAST.DROP, 0);
      }
      const on = r.mount ? others.find(q => q.id == r.mate) : p.exec ? foe : undefined;
      r.with = on && [on.x, on.y, on.z];
      // Its prey's hands go on its belly as it was last drawn; it eats on a while after the kill.
      r.bust = !xeno && r.mount ? book.get(r.mate!)?.s?.pos[J.SPINE] : undefined;
      const fed = r.feed;
      r.feed =
        xeno && r.p.lock && !p.lock && r.mount ? FEAST.FEED[0] : Math.max((r.feed ?? 0) - dt, 0);
      // Done eating, its head comes up the rest of the way slowly (FEAST.LOW).
      r.low = fed && !r.feed ? FEAST.LOW[1] : Math.max((r.low ?? 0) - dt, 0);
      // Where its prey was as it last held him: it stays turned to him while it eats on.
      r.fedOn = xeno && r.with ? r.with : r.feed ? r.fedOn : undefined;
      // The execution's blood: a spurt on the cut down, a burst as his head goes, then the neck.
      // His body tips over from his knee, before the swordsman he knelt to (r.slain).
      const victim = (q: PlayerState) => q.exec === EXEC.VICTIM && !!q.lock;
      r.slain = p.down && r.slain ? { ...r.slain, t: r.slain.t + dt } : undefined;
      if (victim(r.p) && p.down && r.killer) {
        r.slain = { at: r.killer, t: 0 };
      }
      // The xenomorph's prey, let go of as his head goes: he falls on his side from where it
      // held him, about his right foot.
      if (!xeno && r.p.lock && !r.p.exec && p.down && r.mount && r.with) {
        r.slain = { at: r.with, t: 0, pivot: J.FOOT_R };
      }
      r.killer = victim(p) ? r.with : undefined;
      // Kneeling to fists (a killer with no katana in hand): blood and no sparks, his head burst.
      r.fist = victim(p) ? !!foe && !foe.wield : !!r.fist && !!p.down;
      if (victim(p) && victim(r.p)) {
        const was = EXEC.TICKS - r.p.lock! < EXECUTE.KNEEL[0];
        if (was && EXEC.TICKS - p.lock! >= EXECUTE.KNEEL[0]) {
          const chest: Vec3 = [p.x, p.y + (r.fist ? 1.05 : 1.25), p.z];
          tracer?.gore?.(chest, r.fist ? PUMMEL.SPURT[0] : EXECUTE.WOUND, 2.5);
          if (r.fist) {
            tracer?.gore?.([p.x, p.y + 1.5, p.z], PUMMEL.SPURT[1], 1.5);
          } else {
            tracer?.shock(chest);
          }
        }
      }
      if (victim(r.p) && p.down) {
        const head = r.s?.pos[J.HEAD];
        const neck: Vec3 =
          r.fist && head ? [head[0], head[1] + 0.1, head[2]] : [p.x, p.y + 1.05, p.z];
        if (r.fist) {
          tracer?.gore?.(neck, PUMMEL.BURST[0], PUMMEL.BURST[1]);
        } else {
          tracer?.gore?.(neck, EXECUTE.NECK, 3.5);
          tracer?.shock(neck);
        }
        r.bleed = EXECUTE.BLEEDING;
      }
      // The katana's execution's swordsman: his ticks into it, smoothed, and on past the kill.
      if (p.exec === EXEC.KILLER && p.lock && p.wield && !p.down) {
        const e = EXEC.TICKS - p.lock;
        const was = r.exe ?? -Infinity;
        r.exe = Math.abs(was - e) > 6 ? e : Math.min(Math.max(was + dt * TICK_HZ, e - 1), e + 1);
      } else if (r.exe !== undefined) {
        const off = r.exe < EXEC.TICKS - 3 || p.down || r.exe > EXEC.TICKS + 40;
        r.exe = off ? undefined : r.exe + dt * TICK_HZ;
      }
      // The fists' execution's killer: his ticks into it, smoothed, his victim's belly and head as
      // last drawn; after the kill they run on for the follow-through, kept where they were.
      if (pummeling(p) && foe && !p.down) {
        const e = EXEC.TICKS - p.lock!;
        const was = r.pum ?? -Infinity;
        r.pum = Math.abs(was - e) > 6 ? e : Math.min(Math.max(was + dt * TICK_HZ, e - 1), e + 1);
        const v = book.get(foe.id)?.s?.pos;
        const copy = (j: number): Vec3 | undefined => v && [v[j][0], v[j][1], v[j][2]];
        r.prey = { feet: [foe.x, foe.y, foe.z], belly: copy(J.SPINE), head: copy(J.HEAD) };
      } else if (r.pum !== undefined) {
        // Cut short (either went down first): no blow at the air.
        const on = r.pum >= EXEC.TICKS - 3 && !p.down;
        r.pum = on ? r.pum + dt * TICK_HZ : undefined;
        r.pum = r.pum! > EXEC.TICKS + PUMMEL.AFTER[0] + PUMMEL.AFTER[1] ? undefined : r.pum;
      }
      if (r.bleed && r.cut?.at) {
        r.bleed = Math.max(r.bleed - dt, 0);
        r.gore = (r.gore ?? 0) + EXECUTE.BLEED * dt;
        tracer?.gore?.(r.cut.at, Math.floor(r.gore), 1.5);
        r.gore %= 1;
      }
      // Its prey's blood as it eats: spurting from his head, a burst as it goes.
      if (xeno && on) {
        const head: Vec3 = [on.x, on.y + 1.55, on.z];
        if (r.p.lock && !p.lock) {
          tracer?.gore?.(head, FEAST.GORE[1], 3.5);
        }
        r.gore = (r.gore ?? 0) + eating(p.lock ?? 0, r.mount) * FEAST.GORE[0] * dt;
        tracer?.gore?.(head, Math.floor(r.gore), 2.5);
        r.gore %= 1;
        // And from his thighs, where its feet grip them, a leg at a time, dripping down.
        if (p.lock) {
          const [rate, across, up] = FEAST.GRIP;
          const [dx, dz] = [on.x - p.x, on.z - p.z];
          const d = Math.hypot(dx, dz) || 1;
          r.grip = (r.grip ?? 0) + rate * r.mount * dt;
          for (; r.grip >= 1; r.grip--) {
            const side = (r.drops = (r.drops ?? 0) + 1) % 2 ? across : -across;
            tracer?.gore?.([on.x - (dz / d) * side, on.y + up, on.z + (dx / d) * side], 1, 0.5);
          }
        }
      }
      // A blow of his fists the host counted: the nearest he reaches, in his arc, flinches.
      const hit = world && bare(p) && p.hits != r.p.hits && p.swing;
      if (hit) {
        const near = strike(
          world,
          p,
          others.filter(q => q.id != p.id),
          blowing(p, xeno),
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
  kind = 0,
): Pose => {
  const rot = pose.rot.slice();
  const q = { ...pose, rot };
  // The grip's tilt and place in the hand, as the weapon's kind has them (tiltOf(), holdOf()).
  const [tilt, [far, palm]] = [tiltOf(kind), holdOf(kind)];
  const [uh, fh] = [ax[0], ax[2].map((v, i) => v * tilt[1] - ax[1][i] * tilt[0]) as Vec3];
  const wrist = grip.map((v, i) => v - far * fh[i] + palm * uh[i]) as Vec3;
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
    const q = lifted(pose, s, [at, ax], 1, kind);
    s = solve(q);
    const [fore, g, up] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R], kind);
    // The rail gun's front grip, as thin as its rear one, in the same open hold.
    const [len, palm] = up ? RIFLE_HOLD : LONG_HOLD;
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
/** How far left of the right hand the Hunter's left one is in his guard (brandish()), metres. */
const OFF_HAND = 0.26;
/**
 * The Hunter's guard, as CARRY: the claw higher and further ahead than a katana's grip, a
 * predator's (the user, 2026-11-24: more aggressive), its blades rising toward a foe.
 */
const HUNT = [0, -0.36, 0.42, 0, 0.6, 0.8];
/** How far the Hunter's trunk bends forward over his guard, radians (none through a cut). */
const HUNCH = 0.2;

/**
 * The pose with the katana in both hands: in the guard, or in a cut, which is the first person's cut
 * seen from the runner's eye (the share `e` of it, so that it is drawn from the guard and back to
 * it), and the trunk twisting, bending and leaning through it (trunk()).
 */
export const brandish = (
  from: Pose,
  p: PlayerState,
  prog: number,
  ph: number,
  t = 0,
  parry = Infinity,
  oneHand = false,
): Pose => {
  // In a saber lock the blade crosses the foe's, shaking, and the trunk leans into him.
  const lk = sabering(p);
  const e = lk ? 1 : prog < 0 ? 0 : ease(prog * 6) * ease((1 - prog) * 5);
  const k = lk ? locked(t) : poised(p, Math.max(prog, 0), t);
  // A parry snaps the blade across from whatever hold it is in, and holds its line (clasp()).
  const pe = parrying(parry);
  const base = oneHand ? HUNT : CARRY;
  const g = deflect(
    base.map((v, i) => v + (k[i] - v) * e),
    pe,
    DEFLECT_LOW,
  );
  g[1] += 0.02 * Math.sin(TAU * ph) * (1 - e);
  // A cut turns the whole body on its feet with a share of the trunk's twist.
  const [tw, sweep, ln] = lk ? [0, 0.15, 0] : prog < 0 ? [0, 0, 0] : bent(p, prog).map(v => v * e);
  // The Hunter hunched over his guard.
  const bd = sweep + (oneHand ? HUNCH * (1 - e) : 0);
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
  const poles: [Vec3, Vec3] = [turn([0.5, -1, -0.35]), turn([-0.5, -1, -0.35])];
  if (oneHand) {
    // The claw rides the forearm: each fist straight in line with its arm (the user, 2026-11-24),
    // the wrist left as the pose has it rather than turned onto a handle as wield() does. The
    // left hand up in the guard too, at the right one's height beside it, held there through a cut.
    reach(q, solve(q), J.ARM_R, at, poles[0]);
    const left = add(eye, turn([HUNT[0] - OFF_HAND, HUNT[1], HUNT[2]]));
    shrug(q, s, J.ARM_L, left);
    reach(q, solve(q), J.ARM_L, left, poles[1]);
    return q;
  }
  shrug(q, s, J.ARM_L, add(at, dir.map(v => -BEHIND * v) as Vec3));
  const [grip, d, right, left] = clasp(solve(q), at, dir, poles, 0.1 * (1 - 0.98 * pe));
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
export const grasp = (p: PlayerState, seat?: Seat, hunter = false): number[] => {
  if (p.down || floored(p)) {
    return [0.3, 0.3];
  }
  if (driving({ p, seat })) {
    return [0.9, 0.9];
  }
  // The fists' execution: both fists, the left hand opening on his head (feast.ts PUMMEL.GRAB).
  if (pummeling(p)) {
    return [EXEC.TICKS - p.lock! > PUMMEL.GRAB[0] ? 0.45 : 1, 1];
  }
  const armed = handOf(p) >= 0;
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
    // A long gun's grips in an opener hand (LONG_CURL); not the Hunter's, whose disc and cannon
    // only borrow these flags.
    const round = hunter ? 0.9 : LONG_CURL;
    return [p.rifled ? RIFLE_CURL : round, round];
  }
  // In a swap the left hand brings the new battery up from the pouch.
  return [
    p.ammo >= 0 && !p.fists && !p.railed && swapOf(p) >= 0 ? 0.7 : free,
    (p.railed ? !stowed(p) : p.ammo >= 0 && !p.fists) ? 0.9 : free,
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
/**
 * The xenomorph's crouch over the gait's pose: the back bent forward and the head held up level, and
 * on a floor the hips lower with the heels lifted off it, the balls of the feet where they were:
 * the legs read as an animal's: the hips a little higher, the foot's long bone near upright over its
 * ball, the bones straight (the user, 2026-11-15: a deeper crouch bowed the legs into an arc).
 */
/** Where the ankle stands over the ball once the foot is tipped FOOT_UP: up, and behind it. */
const ANKLE = [
  -(FOOT_TIP[1] * Math.cos(FOOT_UP) + FOOT_TIP[2] * Math.sin(FOOT_UP)),
  FOOT_TIP[1] * Math.sin(FOOT_UP) - FOOT_TIP[2] * Math.cos(FOOT_UP),
];

const prowl = (pose: Pose, s: ReturnType<typeof solve>, p: PlayerState): Pose => {
  const rot = pose.rot.slice();
  const X: Vec3 = [1, 0, 0];
  // Bent, but not squat (the user, 2026-11-15): the neck clear. The head a little lower than the
  // look, the face tipped down at the foe (the user, 2026-11-25: held too high, it lacked menace).
  rot[J.SPINE] = mul(rot[J.SPINE], axis(X, -0.2));
  rot[J.CHEST] = mul(rot[J.CHEST], axis(X, -0.16));
  rot[J.NECK] = mul(rot[J.NECK], axis(X, 0.06));
  rot[J.HEAD] = mul(rot[J.HEAD], axis(X, -0.16));
  // Out of a blow, the upper arms hang lower than the runner's guard, the elbows still bent so the
  // claws point ahead: raised forward, the shoulder's skin pinched into a fold (the user, 2026-11-15).
  // A swing of the bone the shortest way toward hanging, its twist about itself kept: a blend of the
  // whole turn toward rest undid the twist too, and wrung the arm at the shoulder.
  if (!p.swing) {
    for (const a of [J.ARM_L, J.ARM_R]) {
      const bone = REST[a + 1];
      const now = turn(rot[a], bone);
      const k = 0.45;
      const want: Vec3 = [0, 1, 2].map(i => now[i] * (1 - k) + bone[i] * k) as Vec3;
      rot[a] = mul(arc(now, want), rot[a]);
    }
  }
  const q: Pose = { ...pose, rot };
  if (p.mode != MODE.GROUND && p.mode != MODE.CROUCH) {
    return q;
  }
  q.hips = [pose.hips[0], pose.hips[1] + 0.06, pose.hips[2]];
  const t = solve(q);
  const [fx, , fz] = basis(pose.yaw, 0)[2];
  for (const [thigh, foot, toe] of [
    [J.THIGH_L, J.FOOT_L, J.TOE_L],
    [J.THIGH_R, J.FOOT_R, J.TOE_R],
  ]) {
    // The long bone of the foot near upright over the ball, which stays where the gait put it: a third
    // segment to the leg (the user, 2026-11-15: longer legs); the toes flat on the floor ahead.
    const b = s.pos[toe];
    reach(
      q,
      t,
      thigh,
      [b[0] - fx * ANKLE[1], b[1] + ANKLE[0], b[2] - fz * ANKLE[1]],
      [fx, 0, fz],
      true,
    );
    q.rot[foot] = mul(q.rot[foot], axis(X, -FOOT_UP));
    q.rot[toe] = mul(q.rot[toe], axis(X, FOOT_UP));
  }
  return q;
};

/**
 * The xenomorph threatening, for the menu's picture (the user, 2026-11-16: an offensive posture):
 * bent lower over the prowl, the head pushed forward at the camera, the arms raised forward, the
 * elbows bent so the claws open ahead of the chest.
 */
const menace = (pose: Pose, bite = 0): Pose => {
  const X: Vec3 = [1, 0, 0];
  const rot = pose.rot.slice();
  // The spine, the chest, the neck and the head, joints in a row; a glory kill's bite (devour())
  // draws the neck and the head back, then drives them down into the prey.
  [-0.12, -0.1 - 0.3 * Math.abs(bite), 0.18 + bite, 0.08 + 0.6 * bite].forEach(
    (v, i) => (rot[J.SPINE + i] = mul(rot[J.SPINE + i], axis(X, v))),
  );
  // About x alone, in the parent's frame: the two arms' frames are mirrored, so a turn about
  // another axis sent one out and the other in.
  for (const a of [J.ARM_L, J.ARM_R]) {
    rot[a] = mul(axis(X, 0.68), rot[a]);
    rot[a + 1] = mul(rot[a + 1], axis(X, 1.05));
  }
  return { ...pose, rot };
};

/** The runner's pose this frame, solved: the gait, the fall and sink of one down, and the weapon's hold; and the way the body faces. */
/** A pose with nothing in it, for one wholly laid over: shared, so frozen. */
const BARE: Pose = Object.freeze({ ...rest(), rot: Object.freeze(rest().rot) as Quat[] });

export const stance = (r: Runner) => {
  const { p } = r;
  // Down or floored, the weapon stays in the hand as it falls. At the wheel both hands are on the yoke.
  const lying = !!p.down || floored(p) || driving(r);
  // In a glory kill (feast.ts) the arms are the kill's: no weapon is held up.
  const mate = (r.mount ?? 0) > 0 ? r.with : undefined;
  const busy = lying || !!mate || (p.exec === EXEC.VICTIM && !!p.lock) || r.pum !== undefined;
  // All on fours (fours.ts) the gait's pose is wholly laid over: it is not built.
  const fours = !lying && (r.fours?.weight ?? 0) > 0.998;
  let pose = fours
    ? { ...BARE, at: [p.x, p.y, p.z] as Vec3, yaw: p.yaw, rest: RESTS[r.build ?? 0] }
    : r.gait.pose();
  // Lying down, it sinks into the roof for the last half second.
  const sink = p.down ? 0.5 * Math.min(Math.max(1 - p.down / 30, 0), 1) : 0;
  if (p.down) {
    pose = {
      ...pose,
      at: [pose.at[0], pose.at[1] - sink, pose.at[2]],
    };
  }
  if (r.jab > 0.002 && !lying && r.blow != TAIL_BLOW) {
    // A punch: the striking fist out (the blow's), the other back to the hip, the chest behind it.
    // The xenomorph's sting is its tail's (xeno.ts), not an arm's.
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
  if (r.look?.role === ROLE.XENO && !lying) {
    // On all fours in a sprint and on a wall, which leaves nothing of the prowl once it is all in.
    if (!fours) {
      pose = prowl(pose, solve(pose), p);
    }
    // Its head still down at his a while after the kill (FEAST.FEED), lifted slowly at the end;
    // turned to him all along, whatever the player looks at.
    const fed = ease((r.feed ?? 0) / FEAST.FEED[1]);
    const prey = mate ?? (fed ? r.fedOn : undefined);
    if (prey) {
      pose = intent(pose, prey, Math.max(r.mount ?? 0, fed));
    }
    // Lifting, it keeps its head low (FEAST.LOW), then lets it come up slowly: not too high at once.
    const [held, slow] = FEAST.LOW;
    if (r.menace || p.lock || mate || fed) {
      const bite = r.feed ? held + (devour(0) - held) * fed : 0;
      pose = menace(pose, p.lock ? devour(p.lock) : bite);
    } else if (r.low) {
      // The whole of its menace let go of together, as its head comes up.
      const k = ease(r.low / slow);
      const m = menace(pose, held);
      pose = { ...pose, rot: pose.rot.map((q, j) => slerp(q, m.rot[j], k)) };
    }
    pose = r.fours?.apply(pose) ?? pose;
    if (mate) {
      // After the kill it hops back off him on an arc (FEAST.HOP), its head still at his.
      const hop = p.lock ? 0 : Math.sin(Math.PI * (1 - r.mount!));
      pose = seize(pose, mate, r.mount!, p.lock ? swaying(p.lock, r.mount!) : 0, hop, r.size);
    }
    // Chewing as it bites, and on after the kill, dying out as its head lifts.
    pose = chew(pose, p.lock ? eating(p.lock, r.mount ?? 0) : fed, r.t);
    // Standing as it eats; down in a low hunting crouch only at the end, as its head comes up
    // (FEAST.CROUCH, the user 2026-11-17), then back to its prowl slowly.
    pose = crouch(pose, r.feed ? 1 - fed : ease((r.low ?? 0) / slow));
  } else if (mate && !lying) {
    const sway = p.lock ? swaying(p.lock, r.mount!) : 0;
    pose = r.knelt = clutched(pose, mate, r.mount!, r.t, r.bust, sway);
  } else if (p.exec === EXEC.VICTIM && p.lock && r.with && !lying) {
    pose = r.knelt = kneel(pose, r.with, p.lock, r.t);
  }
  // The fists' execution's blows, and their follow-through after the kill.
  if (r.pum !== undefined && r.prey && !lying) {
    pose = pummel(pose, r.pum, r.prey);
  }
  // Beheaded on his knee: the same kneel, tipping over, not another fall.
  if (r.slain && p.down && r.knelt) {
    pose = topple({ ...r.knelt, at: [p.x, p.y - sink, p.z] }, r.slain.t, r.slain.pivot);
  }
  // Down, kneeling or held by the xenomorph, nothing goes through the floor (it still sinks into
  // it at the end).
  const held = !!mate && r.look?.role !== ROLE.XENO;
  if (p.down || (p.exec === EXEC.VICTIM && p.lock) || held) {
    pose = footing(pose, p.y - sink);
  }
  let s = solve(pose);
  if (p.wield && !busy) {
    // The execution's last cut: the blade raised back over the head, held, then down on his neck.
    const up =
      p.exec === EXEC.KILLER && p.lock
        ? raised(EXEC.TICKS - (r.exe ?? EXEC.TICKS - p.lock), r.prog, SLASH_TOP)
        : -1;
    // His legs go with his blade.
    pose = r.exe === undefined ? pose : lunge(pose, r.exe);
    pose = brandish(
      pose,
      up < 0 ? p : { ...p, cut: CUT.SLASH },
      up < 0 ? r.prog : up,
      r.gait.phase,
      r.t,
      r.parry,
      r.look?.role === ROLE.HUNTER,
    );
    s = solve(pose);
  } else if ((p.railed || (p.rifled && r.look?.role !== ROLE.HUNTER)) && !busy) {
    // The rail gun or the rifle in both hands, at the ready when not firing: the left on its front grip, the
    // elbow down and out. On a wall it is put away, unless its bolt is going out (stowed()).
    if (p.railed && stowed(p)) {
      return { s, sink, yaw: pose.yaw };
    }
    pose = carried(pose, s, r);
    s = solve(pose);
  } else if (r.aim > 0.01 && p.ammo >= 0 && !p.fists && !busy) {
    // Seated, the eye the gun is held out from is lower.
    pose = lifted(
      pose,
      s,
      aimed(p.mode == MODE.RIDE ? { ...p, y: p.y - SEATED } : p, r.focus),
      r.aim,
      r.look?.role === ROLE.HUNTER ? 0 : kindOf(p),
    );
    s = solve(pose);
  }
  // In a swap of the gun or the rifle the left hand fetches the new battery from the pouch on the
  // hip and brings it up under the grip (pouch.ts, the user, 2026-11-09).
  const sp = swapOf(p);
  const w =
    busy || p.wield || p.railed || sp < 0
      ? 0
      : ease(span(sp, 0.12, 0.2)) * (1 - ease(span(sp, BROUGHT - 0.03, BROUGHT)));
  let carry: [Vec3, Vec3[]] | undefined;
  if (w > 0.002) {
    const q = s.rot[J.HAND_R];
    const f = fetched(
      sp,
      pouchAt(s.pos[J.PELVIS], s.rot[J.PELVIS]),
      loadFrame(grip(s.pos[J.HAND_R], q, kindOf(p)), axes(q, kindOf(p)), kindOf(p), BROUGHT),
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
  lights = false,
  claws = false,
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
    claws ? r.curls.map(c => Math.min(c, RAKE)) : r.curls,
    glove,
    suit ? glove : colors[REGION.FLESH],
    // The left thumb up the rifle's handguard; the marine's lit buttons on the wrists.
    {
      // The Hunter's disc (`rifled`) is in one hand: no left hand on a handguard.
      cup: +(!!p.rifled && r.look?.role !== ROLE.HUNTER && !p.down && !floored(p) && !driving(r)),
      lights,
      claws,
      spread: p.rifled && r.look?.role === ROLE.HUNTER ? DISC_SPREAD : 1,
      hook: p.rifled && r.look?.role === ROLE.HUNTER ? DISC_HOOK : 0,
    },
    lod < 3,
    limb == LIMB.ARM_L ? J.HAND_L : limb == LIMB.ARM_R ? J.HAND_R : -1,
  );
};

/** The xenomorph's legs and arms (partsOf()): the shin, foot, toe and upper arm joints, left then right. */
const LIMBS_X = [
  [J.SHIN_L, J.FOOT_L, J.TOE_L, J.ARM_L],
  [J.SHIN_R, J.FOOT_R, J.TOE_R, J.ARM_R],
];

/** The ninja's boots: black cloth, a shade lighter than his suit so they show on it. */
const BOOT = [0.06, 0.06, 0.066];
type HunterLod = 0 | 1;
const hunterTrail = hunterWristEnds().map(p => sub(p, HUNTER_REST[J.FOREARM_R]));
/** The far level leaves out the dreadlocks and the visor grille. */
const hunterPieces = (lod: HunterLod) =>
  hunterRig(lod, name => lod === 0 && (name.startsWith('Dreads') || name === 'Visor grille'));
/** Each piece's key in the store, made once: a Hunter has some forty pieces a frame. */
const hunterKeys = new WeakMap<HunterPiece, string>();
const hunterKey = (lod: HunterLod, piece: HunterPiece) => {
  let key = hunterKeys.get(piece);
  if (!key) {
    hunterKeys.set(
      piece,
      (key = `hunter ${lod} ${piece.joint} ${+piece.thin} ${+piece.harpoon} ${+piece.cannon} ${+piece.disc} ${piece.strip?.i ?? ''}`),
    );
  }
  return key;
};
/**
 * The shoulder cannon's hinge and turn on a Hunter whose chest is at `chest` turned by `q`: stowed
 * (k 0) it lies back along the shoulder, CANNON_FOLD about the hinge from the chest's frame; out
 * (k 1) it points along his look.
 */
export const cannonOf = (
  chest: Vec3,
  q: Quat,
  p: Pick<PlayerState, 'yaw' | 'pitch'>,
  k: number,
): [Vec3, Quat] => {
  const hinge = add(chest, turn(q, sub(CANNON_HINGE, HUNTER_REST[J.CHEST])));
  const stowed = mul(q, axis([1, 0, 0], CANNON_FOLD));
  const look = mul(axis([0, 1, 0], p.yaw), axis([1, 0, 0], p.pitch));
  return [hinge, slerp(stowed, look, folded(k))];
};
/** The Hunter's joints this frame (hunterPose()), reused. */
const hunterAt: Vec3[] = [];

let hunterWarmed = false;

/** Build and index the Hunter models before they can be drawn during a match. */
export const warmHunter = () => hunterSteps().forEach(step => step());

/** warmHunter() a level at a time, a step each (render.ts warmSteps()): some 150 ms each on an M2. */
export const hunterSteps = (): (() => void)[] =>
  hunterWarmed
    ? []
    : [
        ...([0, 1] as const).map(lod => () => {
          for (const piece of hunterPieces(lod).pieces) {
            mesh(hunterKey(lod, piece), o => placeHunterPart(o, piece.vertices, ORIGIN, ID));
          }
        }),
        () => {
          hunterWarmed = true;
        },
      ];

/** Places a part of the Hunter's complete rest-pose model at the player's feet and heading. */
const placeHunterPart = (out: Out, vertices: number[], at: Vec3, q: Quat): void => {
  const dst = room(out, vertices.length);
  let w = out.length;
  const [qx, qy, qz, qw] = q;
  const [ax, ay, az] = at;
  for (let i = 0; i < vertices.length; i += STRIDE) {
    const x = vertices[i],
      y = vertices[i + 1],
      z = vertices[i + 2],
      tx = 2 * (qy * z - qz * y),
      ty = 2 * (qz * x - qx * z),
      tz = 2 * (qx * y - qy * x);
    dst[w++] = ax + x + qw * tx + qy * tz - qz * ty;
    dst[w++] = ay + y + qw * ty + qz * tx - qx * tz;
    dst[w++] = az + z + qw * tz + qx * ty - qy * tx;
    const nx = vertices[i + 3],
      ny = vertices[i + 4],
      nz = vertices[i + 5],
      ntx = 2 * (qy * nz - qz * ny),
      nty = 2 * (qz * nx - qx * nz),
      ntz = 2 * (qx * ny - qy * nx);
    dst[w++] = nx + qw * ntx + qy * ntz - qz * nty;
    dst[w++] = ny + qw * nty + qz * ntx - qx * ntz;
    dst[w++] = nz + qw * ntz + qx * nty - qy * ntx;
    dst[w++] = vertices[i + 6];
    dst[w++] = vertices[i + 7];
    dst[w++] = vertices[i + 8];
    dst[w++] = vertices[i + 9];
  }
  out.length = w;
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
    /** Armour: worn (Draw.w). */
    w = false,
    /** Too fine for a shadow (Draw.s). */
    thin = false,
  ) =>
    gpu
      ? gpu.push({ m: mesh(key, o => make(o, ORIGIN, ID)), q, t: at, k: scale, w, s: thin })
      : make(out, at, q);
  r.tip = undefined;
  const [build, picked] = [r.build ?? 0, r.look];
  // The ninja (the user, 2026-11-12): a tight black suit, his team's colour on its side stripes and
  // its belt, a hood and a guard over the mouth; an armour of his own (2026-11-13): armor.ts's
  // `alone` plates, and the shoulder pads and collar of pads.ts.
  const ninja = picked?.role === ROLE.NINJA;
  const isHunter = picked?.role === ROLE.HUNTER;
  // The xenomorph: a body of its own (beast() in skin.ts, xeno.ts) in black chitin, a glowing line
  // down its spine in the team's colour; no armour, hair or helmet.
  const xeno = picked?.role === ROLE.XENO;
  helmets &&= !xeno && !isHunter;
  const plated = armored && !xeno && !isHunter;
  armored &&= !ninja && !xeno && !isHunter;
  const colors = palette(
    ninja || xeno ? CLOTH : color,
    xeno ? CHITIN_X : build ? tressOf(p.id, picked) : hairOf(p.id, picked),
    eyesOf(p.id, picked),
    armored,
    xeno ? CHITIN_X : toneFor(p.id, picked),
    build || xeno ? 0 : beardOf(p.id),
    !!build,
  );
  if (xeno) {
    const { PANTS, UPPER, GLOVE, JACKET, TRIM, SOLE, FLESH, CAP, STRIPE, BELT, HAIR } = REGION;
    // HAIR: its carapace, the dome (CREST in skin.ts), glossy black.
    colors[HAIR] = SHELL;
    // BELT: its spine up the back, the tail's smooth black (backOf() in xeno.ts).
    for (const k of [PANTS, UPPER, GLOVE, JACKET, SOLE, BELT]) {
      colors[k] = CHITIN_X;
    }
    // The pipes up its neck are its skin's (backOf() in xeno.ts).
    [colors[TRIM], colors[FLESH], colors[CAP], colors[STRIPE]] = [
      HEAD,
      CHITIN_X.map(v => v * 0.6),
      color,
      PIPE,
    ];
  }
  if (ninja) {
    const { PANTS, UPPER, GLOVE, STRIPE, STRIPE_LOW, BELT } = REGION;
    [colors[PANTS], colors[UPPER], colors[GLOVE]] = [CLOTH, CLOTH, BOOT];
    // His boots: black cloth a shade over the suit's (the user, 2026-11-17), the sole darker.
    [colors[UPPER], colors[REGION.SOLE]] = [BOOT, BOOT.map(c => c * 0.25)];
    // His belt is cut in a V by armor() (BELT in armor.ts), the skin's under it black.
    [colors[STRIPE], colors[STRIPE_LOW], colors[BELT]] = [color, color, CLOTH];
  }
  if (build && styleOf(p.id, picked) == STYLE.UNDERCUT) {
    // A shaved side: the scalp's hair is stubble, the skin showing through it.
    colors[4] = colors[4].map((v, i) => v * 0.5 + colors[3][i] * 0.42);
  }
  // The armour: white in space, else in the team's colour.
  const plate = helmets ? undefined : color;
  const marine = plated && !ninja && !!plate;
  const { s, sink, yaw, carry } = stance(r);
  r.s = s;
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
    shout: +(r.prog >= 0 || dashing(p) || !!r.mount),
    grin: +(r.grin > 0),
    anger: Math.min((2 * r.mad) / MAD, 1),
    gx: Math.atan2(look[0], -look[2]),
    gy: Math.atan2(look[1], Math.hypot(look[0], look[2])),
  });
  r.dt = 0;
  const blade = p.wield && !p.down && !driving(r);
  /**
   * The skin `sk` in the pose `at` with the face `face`, the armour cut out of it and the ninja's
   * hood of the build `hood`: posed by the shader (flesh.ts), or drawn into `out`.
   */
  const clad = (
    sk: Skin,
    face?: ArrayLike<number>,
    hood?: number,
    at = s,
    armour = plated || ninja,
  ) => {
    const [from, n0] = [out.length, gpu?.length ?? 0];
    if (gpu) {
      flesh(
        gpu,
        sk,
        at,
        colors,
        face,
        armour ? { fine: lod > 2, plate, accent: color, ninja, bare: !plated } : undefined,
        hood,
        p.id,
        xeno,
        ninja,
      );
      // The armour's plates are worn.
      gpu.forEach((d, i) => i >= n0 && d.f?.kind == 2 && (d.w = true));
      return;
    }
    skin(out, sk, at, colors, face);
    if (hood !== undefined) {
      // The hood painted on the head, the face under the guard pressed in.
      dress(out, from, sk, s.pos[J.HEAD], s.rot[J.HEAD], hood);
    }
    // The armour, cut out of the skin just drawn.
    if (armour) {
      armor(out, from, sk, lod > 2, plate, ninja, color, !plated);
    }
  };
  if (r.cut && !xeno) {
    const cs = cut(lod, r.cut.limb, build)[0];
    if (r.cut.eaten) {
      colors[REGION.CAP] = RAW;
    }
    // Posed by the shader as the whole body is: on the CPU, the skin of a body lying cut close by
    // took some 20 ms a frame.
    clad(cs, r.face.w);
    r.cut.at = capOf(cs, s);
    if (ninja) {
      rigid(`blades ${build}`, s.pos[J.PELVIS], s.rot[J.PELVIS], (o, a, q) =>
        blades(o, a, q, build),
      );
      drape(out, s, build, r.t, Math.hypot(p.vx, p.vz), color, lod);
    }
    if (!r.cut.eaten) {
      piece(
        out,
        r.cut,
        colors,
        lod,
        sink,
        r.face.w,
        armored,
        gpu && ((sk, at) => clad(sk, r.face.w, undefined, at, false)),
      );
    }
    gloves(out, r, s, colors, lod, armored, r.cut.limb, marine);
  } else {
    const from = out.length;
    if (isHunter) {
      // His own bones carried by the runner's animated skeleton (hunterPose()), one rigid piece
      // on each: the gait, the blade's cuts and the falls move him as they move the marine.
      const detail = Math.min(lod, 1) as HunterLod;
      const joints = hunterPose(s.pos, s.rot, [p.x, p.y, p.z], yaw, hunterAt);
      const rig = hunterPieces(detail);
      for (const band of rig.bands) {
        blendHunter(out, band, joints, s.rot);
      }
      for (const piece of rig.pieces) {
        if (
          (piece.harpoon && handOf(p) === 0 && !p.sided) ||
          (piece.disc && (p.rifled || !!p.clip))
        ) {
          continue;
        }
        if (piece.cannon) {
          const [hinge, q] = cannonOf(joints[J.CHEST], s.rot[J.CHEST], p, r.cannon);
          rigid(
            hunterKey(detail, piece),
            hinge,
            q,
            (o, position, rotation) => placeHunterPart(o, piece.vertices, position, rotation),
            1,
            true,
          );
          // Its shots are seen to leave from its muzzle (combat.ts gun()).
          if (r.cannon > 0) {
            const m = add(hinge, turn(q, CANNON_MUZZLE));
            r.tip = [m[0] - p.x, m[1] - p.y, m[2] - p.z];
          }
          continue;
        }
        // A strip under the belt hangs on its hinge, swung out of a thigh's way (stripSwing()).
        const [at, q] = piece.strip
          ? stripSwing(piece.strip, joints[J.PELVIS], s.rot[J.PELVIS], joints)
          : [joints[piece.joint], s.rot[piece.joint]];
        rigid(
          hunterKey(detail, piece),
          at,
          q,
          (o, position, rotation) => placeHunterPart(o, piece.vertices, position, rotation),
          1,
          true,
          piece.thin,
        );
      }
      if (blade) {
        const [elbow, q] = [joints[J.FOREARM_R], s.rot[J.FOREARM_R]];
        const [base, tip] = hunterTrail.map(p => add(elbow, turn(q, p)));
        r.trail.mark(base, tip, cutting(r.prog) || (r.parry >= 0 && r.parry < 2 * PARRY_IN));
      }
    } else {
      const bs = xeno ? beast(lod) : body(lod, build);
      // Under a helmet's dark visor no face shows: its channels are not worth their time.
      const face = helmets || xeno ? undefined : r.face.w;
      clad(bs, face, ninja && !helmets ? build : undefined);
    }
    if (xeno) {
      tail(
        out,
        s,
        r.t,
        Math.min(Math.hypot(p.vx, p.vz) / 18, 1),
        lashOf(p, r.t),
        color,
        lod,
        r.fours?.weight,
        p,
      );
      const part = partsOf(lod);
      const put = ({ key, make, thin }: Part, at: Vec3, q: Quat) =>
        rigid(key, at, q, make, 1, false, thin);
      for (const [shin, foot, toe, arm] of LIMBS_X) {
        put(part[PART.SHIN], s.pos[shin], s.rot[shin]);
        put(part[PART.FOOT], s.pos[foot], s.rot[foot]);
        // The toes at the foot's end, turned as the toe joint: level on a floor (prowl()).
        put(part[PART.TOES], add(s.pos[foot], turn(s.rot[foot], FOOT_TIP)), s.rot[toe]);
        put(part[PART.ELBOW], s.pos[arm + 1], s.rot[arm + 1]);
        if (lod) {
          // The windows in its thigh, on the joint over the shin's.
          put(
            part[shin == J.SHIN_L ? PART.THIGH_L : PART.THIGH_R],
            s.pos[shin - 1],
            s.rot[shin - 1],
          );
          // The disc where the shoulder ends and the arm begins.
          put(part[arm == J.ARM_L ? PART.CUFF_L : PART.CUFF_R], s.pos[arm], swing(s.rot, arm));
          // The window down the outside of its forearm.
          put(
            part[arm == J.ARM_L ? PART.FOREARM_L : PART.FOREARM_R],
            s.pos[arm + 1],
            s.rot[arm + 1],
          );
        }
      }
      put(part[PART.CHEST], s.pos[J.CHEST], s.rot[J.CHEST]);
      put(part[PART.SPINE], s.pos[J.SPINE], s.rot[J.SPINE]);
      if (lod) {
        put(part[PART.HIPS], s.pos[J.PELVIS], s.rot[J.PELVIS]);
      }
      put(part[PART.HEAD], s.pos[J.HEAD], s.rot[J.HEAD]);
      if (lod) {
        put(part[PART.FINE], s.pos[J.HEAD], s.rot[J.HEAD]);
      }
    } else if (!isHunter) {
      rigid('pouch', s.pos[J.PELVIS], s.rot[J.PELVIS], pouch);
    }
    if (ninja) {
      rigid(`blades ${build}`, s.pos[J.PELVIS], s.rot[J.PELVIS], (o, a, q) =>
        blades(o, a, q, build),
      );
      drape(out, s, build, r.t, Math.hypot(p.vx, p.vz), color, lod);
    }
    if (xeno && lod) {
      // Its hands in its chitin (the user, 2026-11-17: the skin's texture on them): each a rigid
      // piece on its wrist, so the texture lies on the hand's own rest place and does not swim;
      // one a step of the fingers' curl, not one a frame.
      const glove = colors[REGION.GLOVE];
      for (const j of [J.HAND_L, J.HAND_R]) {
        const i = +(j == J.HAND_R);
        const curl = Math.round(Math.min(r.curls[i], RAKE) * 20) / 20;
        rigid(`xeno hand ${lod < 3} ${i} ${curl}`, s.pos[j], s.rot[j], (o, a, q) => {
          const at: ReturnType<typeof solve> = { ...s, pos: [], rot: [] };
          [at.pos[j], at.rot[j]] = [a, q];
          const from = o.length;
          hands(
            o,
            at,
            0,
            [curl, curl],
            glove,
            // Its fingertips in the same chitin, up to the claws.
            glove,
            { claws: true },
            lod < 3,
            j == J.HAND_R ? J.HAND_L : J.HAND_R,
          );
          const v = room(o, 0);
          for (let n = from; n < o.length; n += STRIDE) {
            if (v[n + 8] == -1 && v[n + 6] == glove[0] && v[n + 9] == glove[2]) {
              v[n + 8] = CHITIN;
            }
          }
        });
      }
    } else if (ninja && lod) {
      // His hands as the xenomorph's, rigid pieces a step of the curl (the user, 2026-11-17: improve
      // the hands), so the shader's textures lie on them: the glove woven as his suit, and the
      // plate on the back of the hand and the knuckles' shell in the guard's brushed metal.
      const glove = colors[REGION.GLOVE];
      const cup = +(!!p.rifled && !p.down && !floored(p) && !driving(r));
      for (const j of [J.HAND_L, J.HAND_R]) {
        const i = +(j == J.HAND_R);
        const curl = Math.round(r.curls[i] * 20) / 20;
        rigid(
          `ninja hand ${lod < 3} ${i} ${curl} ${cup} ${build}`,
          s.pos[j],
          s.rot[j],
          (o, a, q) => {
            const at: ReturnType<typeof solve> = { ...s, pos: [], rot: [] };
            [at.pos[j], at.rot[j]] = [a, q];
            const from = o.length;
            hands(
              o,
              at,
              build,
              [curl, curl],
              glove,
              glove,
              { cup },
              lod < 3,
              j == J.HAND_R ? J.HAND_L : J.HAND_R,
            );
            const v = room(o, 0);
            for (let n = from; n < o.length; n += STRIDE) {
              if (v[n + 8] != -1) {
                continue;
              }
              const k = v[n + 6] / glove[0];
              if (Math.abs(k - 1) < 1e-6) {
                v[n + 8] = WEAVE;
              } else if (Math.abs(k - 0.72) < 1e-6 || v[n + 6] == 0.09) {
                // The plate (0.72 of the glove's colour in hand()) and the shell (its SHELL).
                [v[n + 6], v[n + 7], v[n + 9], v[n + 8]] = [SASH[0], SASH[1], SASH[2], TWILL];
              }
            }
          },
        );
      }
    } else if (!isHunter) {
      gloves(out, r, s, colors, lod, armored, LIMB.NONE, marine, xeno);
    }
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // Her hair, on her head while it is on her; tucked in under a helmet or the ninja's hood.
  if (build && !helmets && !ninja && !xeno && !isHunter && r.cut?.limb !== LIMB.HEAD) {
    const from = out.length;
    hair(
      out,
      s.pos[J.HEAD],
      s.rot[J.HEAD],
      styleOf(p.id, picked),
      tressOf(p.id, picked),
      lod,
      sway(r.gait.phase, Math.hypot(p.vx, p.vz), r.t),
      r.t,
      gpu,
    );
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The man's cigar, not on a far runner: not under a helmet or the ninja's guard, and it drops
  // when he goes down (lying face down, it would go through the roof).
  if (lod && !build && !helmets && !ninja && !xeno && !isHunter && !p.down) {
    const from = out.length;
    const fine = lod > 2;
    rigid(`cigar ${fine}`, s.pos[J.HEAD], s.rot[J.HEAD], (o, a, q) => cigar(o, a, q, fine));
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The ninja's pads and collar; the marine's shoulder bells.
  if (plated) {
    const from = out.length;
    const n0 = gpu?.length ?? 0;
    pads(out, s, build, ninja ? SASH : (plate ?? [0.85, 0.86, 0.88]), !ninja, color, !lod, gpu);
    // And so are the bells and the pads.
    gpu?.forEach((d, i) => i >= n0 && (d.w = true));
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
        (o, a, q) => mask(o, a, q, 0, color, !lod, SASH),
        build ? HEAD_SCALE : 1,
      );
    } else {
      mask(out, s.pos[J.HEAD], s.rot[J.HEAD], build, color, !lod, SASH);
    }
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The helmet is on the head: not on one a katana cut has taken off.
  if (helmets && r.cut?.limb !== LIMB.HEAD) {
    if (build) {
      // Hers is another helmet, with no hose: told from his at a glance.
      rigid(
        `helm ${color} ${lod}`,
        s.pos[J.HEAD],
        s.rot[J.HEAD],
        (o, a, q) => helm(o, a, q, color, lod),
        1,
        true,
      );
    } else {
      rigid(
        `helmet ${color} ${lod}`,
        s.pos[J.HEAD],
        s.rot[J.HEAD],
        (o, a, q) => helmet(o, a, q, color, lod),
        1,
        true,
      );
      hose(out, s.pos[J.HEAD], s.rot[J.HEAD], s.pos[J.CHEST], s.rot[J.CHEST], lod);
    }
  }
  // The life support pack on the back of a space suit.
  if (helmets) {
    rigid(
      `pack ${color} ${lod}`,
      s.pos[J.CHEST],
      s.rot[J.CHEST],
      (o, a, q) => pack(o, a, q, color, lod),
      1,
      true,
    );
  }
  if (armored) {
    rigid(
      `crotch ${plate} ${build}`,
      s.pos[J.PELVIS],
      s.rot[J.PELVIS],
      (o, a, q) => crotch(o, a, q, plate, build ? CUP_F : 1),
      1,
      true,
    );
  }
  if (blade) {
    if (!isHunter) {
      sword(out, s.pos[J.HAND_R], s.rot[J.HAND_R], Math.min(lod, 1), r.t, 1, 1, 0, gpu);
      const [base, tip] = swordEnds(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      r.trail.mark(base, tip, cutting(r.prog) || (r.parry >= 0 && r.parry < 2 * PARRY_IN));
    }
  } else if (
    !p.fists &&
    (p.railed ? !stowed(p) : p.ammo >= 0 || p.rifled) &&
    !p.down &&
    !driving(r) &&
    r.pum === undefined
  ) {
    // A swap shows: the battery or the capsule out and in, the glow off until it is.
    const sp = swapOf(p);
    if (isHunter && p.rifled && p.clip) {
      // His disc is out: the hand is empty until it comes back (gun.ts DISK_LOST).
    } else if (isHunter && p.rifled) {
      // The disc held by its hub (the user, 2026-11-23): the palm on the hub, the disc beyond the
      // palm, its face along the back of the hand (axes()' right).
      const q = s.rot[J.HAND_R];
      const [ax, up, fwd] = axes(q);
      const at = grip(s.pos[J.HAND_R], q);
      const hold = [0, 1, 2].map(i => fwd[i] * DISC_HOLD[0] - ax[i] * DISC_HOLD[1]) as Vec3;
      drawDisc(out, add(at, hold), fwd, up, ax);
    } else if (isHunter && handOf(p) === 0 && !p.sided) {
      const q = s.rot[J.HAND_R];
      drawHarpoon(
        out,
        Math.min(lod, 1) as HunterLod,
        grip(s.pos[J.HAND_R], q),
        axes(q),
        0.82,
        1,
        !!p.mag || sp >= 0,
        harpoonFeed(sp),
        gpu,
      );
    } else {
      held(
        out,
        s.pos[J.HAND_R],
        s.rot[J.HAND_R],
        Math.min(lod, 1),
        1,
        undefined,
        0,
        kindOf(p),
        r.t,
        {
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
          skin: isHunter && !!p.sided,
        },
      );
    }
    if (p.railed || p.rifled) {
      const q = s.rot[J.HAND_R];
      const m = tip(grip(s.pos[J.HAND_R], q, kindOf(p)), axes(q, kindOf(p)), kindOf(p));
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
