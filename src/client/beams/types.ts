// What the tracer draws and its interface.
import type { Light } from '../lights';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';

/** A ball as drawn this frame: its centre, its unit direction, and the metres of trail behind it. */
export interface Orb {
  p: Vec3;
  d: Vec3;
  tail: number;
  /** Its strength, 1 to CHARGE_MAX: a charged ball is bigger. Absent reads 1. */
  power?: number;
  /** An arc of energy, not a ball: the CUT that threw it (Ball.arc). */
  arc?: number;
}

export interface Spark {
  p: Vec3;
  v: Vec3;
  age: number;
  /** A laser rifle's: red. */
  red?: boolean;
  /** A grenade's ember: orange, and it lasts EMBER. */
  hot?: boolean;
  /** A drop of blood: dark red, bigger, and it lasts GORE. */
  blood?: boolean;
  /** A spark of steel off a harpoon's impact: white-hot cooling to orange. */
  steel?: boolean;
}
/** A flash at a muzzle or a splash at a burst: where, how old, and which. */
export interface Glow {
  p: Vec3;
  age: number;
  /** The own muzzle's: it follows the muzzle. */
  own?: boolean;
  splash?: boolean;
  /** A pistol's or a rifle's splash: SPLASH_WIDE of the old size. */
  fine?: boolean;
  /** How charged the shot was, 0 to 1: orange and bigger as it goes up. */
  hot?: number;
  /** A grenade's fireball: it lasts BOOM. Its puffs: where each sits, in radii from the centre. */
  boom?: boolean;
  puffs?: Vec3[];
  /** A fireball's size, in grenades' (1 when absent); a shock wave's widest radius, metres. */
  size?: number;
  /** A shock wave: a ring flat on the ground that widens to `size` and fades, in BOOM. */
  ring?: boolean;
  /** The rail gun's ring: lightning round a circle that widens to `size`, in TESLA. */
  tesla?: boolean;
  /** A harpoon's impact: a white-hot flash, then its `puffs` of dust swelling, in IMPACT. */
  impact?: boolean;
}
/** A jagged bolt: two segments, a to m to b. */
export interface Bolt {
  a: Vec3;
  m: Vec3;
  b: Vec3;
  age: number;
  /** Times the katana's width, for a hull's arcs: they are seen from further, and grow with the distance. */
  wide?: number;
}

export interface Tracer {
  /** A shot's flash at the muzzle `a`; `own` for the player's, which stays on its muzzle; `hot` how charged it was, 0 to 1. */
  flash(a: Vec3, own?: boolean, hot?: number): void;
  /** The muzzles charging this frame and how far, 0 to 1: an orange light swelling at each. */
  charging(list: { p: Vec3; k: number }[]): void;
  /** The rail guns' bolts this frame, each from its muzzle `a` to where it ends `b`: jagged, with a branch, sparks at the end. */
  lightning(list: { a: Vec3; b: Vec3 }[]): void;
  /** The Hunter's shoulder cannon's shot from `a` to `b`: a red ball like the pistol's flying there, bursting at `b`. */
  laser(a: Vec3, b: Vec3): void;
  /**
   * A pistol's (blue) or a laser rifle's (`red`) ball burst at `at`: a small splash of light and a
   * few sparks, and on the `face` it hit (surface() in melt/), if any, a mark of molten metal that
   * cools away. `big`: the old wide red splash and its spray (the station's strike on a player).
   */
  burst(at: Vec3, red?: boolean, big?: boolean, face?: { p: Vec3; n: Vec3 }): void;
  /** A harpoon bolt's impact at `at`: a brief white-hot flash, steel sparks and a puff of dust. */
  impact(at: Vec3): void;
  /** A grenade burst at `at`: a white-hot fireball in orange puffs that swells and shrinks away, a shower of embers, a strong light. `size` times as wide for a vehicle blowing up. */
  blast(at: Vec3, size?: number): void;
  /** A shock wave from `at`: a ring of fire flat on the ground, out to `r` metres as it fades. */
  ring(at: Vec3, r: number): void;
  /** The rail gun's discharge round `at` (the feet): a loop of lightning out to `r` metres and bolts out to it, flickering as it fades. */
  tesla(at: Vec3, r: number): void;
  /**
   * A short jagged bolt from `a` to `b` with a fork off its kink, gone in a twentieth of a second:
   * an arc on a damaged hull, `wide` times as thick as the katana's bolts.
   */
  arc(a: Vec3, b: Vec3, wide?: number): void;
  /** The balls to draw this frame. */
  orbs(list: Orb[]): void;
  /** The katana's shock at `at`: a burst of sparks and bolts. */
  shock(at: Vec3): void;
  /** One frame of the crackle around a shocked runner whose middle is `at`: a few bolts, flickering. */
  crackle(at: Vec3): void;
  /**
   * The orbital station's strike on a player at `at` (his feet): red lasers onto him for RAY
   * seconds from round `from`, the station cannon's muzzle (straight down from the sky without).
   */
  strike(at: Vec3, from?: Vec3): void;
  /** One spark out of `at`, up and a little aside: a cut limb's stump spitting. */
  spit(at: Vec3): void;
  /** `n` drops of blood out of `at`, flung at `speed` m/s each way and up, falling. */
  gore(at: Vec3, n: number, speed?: number): void;
  /** Where the own muzzle is now: its flash stays there, so that a kick of the view does not leave it behind. */
  mount(a: Vec3): void;
  /** Ages everything by dt seconds and drops what is over. */
  update(dt: number): void;
  /** Appends the thrown discs' metal, lit and casting shadows like the bodies: before draw()'s glow. */
  solids(out: Out): void;
  /** Appends the balls, the flashes, the bolts and the sparks, turned to the camera at `eye`. */
  draw(out: Out, eye: Vec3): void;
  /** The lights of the flashes, the splashes, the bolts and the nearest balls, for gather(). */
  lights(): Light[];
}
