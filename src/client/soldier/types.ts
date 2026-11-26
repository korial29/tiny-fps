import type { Choice, PlayerState } from '../../shared/types';
import type { Face } from '../expression';
import type { Prey } from '../feast';
import type { Fours } from '../fours';
import type { Gait, Seat } from '../gait';
import type { Piece } from '../limbs';
import type { Vec3 } from '../mesh';
import type { solve } from '../rig';
import type { Pose } from '../rig';
import type { Trail } from '../trail';

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
