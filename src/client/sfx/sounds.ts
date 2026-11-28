/** The ids of the sounds: an index into LAYERS. LOOPED lists the loops. */
export const SOUND = {
  STEP: 0,
  /** The lighter tap of a step on a wall. */
  WALLSTEP: 1,
  JUMP: 2,
  DOUBLE: 3,
  DASH: 4,
  LAND: 5,
  GRAB: 6,
  SCUFF: 7,
  WIND: 8,
  SCRAPE: 9,
  /** Capture the flag: a flag taken, dropped, returned home, and a capture. */
  TAKE: 10,
  DROP: 11,
  RETURN: 12,
  CAPTURE: 13,
  /** A tackle: the impact, and the grunt of the one tackled. */
  TACKLE: 14,
  GRUNT: 15,
  /** The gun: a shot, the shooter's hit sound, hurt, going down, taking the gun or a refill, a health pack, an empty click. */
  LASER: 16,
  HIT: 17,
  HURT: 18,
  DOWN: 19,
  GUN: 20,
  PACK: 21,
  DRY: 22,
  /** The katana: the shing of drawing or sheathing it, the swish of a cut (played faster for a thrust, slower for a slash), the electric zap of a hit. */
  SHING: 23,
  SWISH: 24,
  ZAP: 25,
  /** A plasma ball bursting on a wall or a body. */
  SPLASH: 26,
  /** A charged shot, under the plain one: a long deep blast. */
  BLAST: 27,
  /** A crackle of the rail gun's bolt, played again and again while it is held. */
  RAIL: 28,
  /** The rail gun in hand: a soft electric hum, looped, louder while its bolt goes out. */
  HUM: 29,
  /** The rail gun's bolt as its holder hears it: an electric buzz, looped, its pitch swung up and down by the player. */
  BUZZ: 30,
  /**
   * The swaps (gun.ts CUES): the gun's battery let go and sliding out, the new one clicked home;
   * the rail gun's capsule jumping off, a turn of the screw on the new one; and a gun powering up.
   */
  EJECT: 31,
  CLICK: 32,
  POP: 33,
  SCREW: 34,
  BOOT: 35,
  /** The laser rifle's shot: a punch in the bass and the middle, short enough for 20 a second. */
  LASE: 36,
  /** The rail gun overheating: a burst of steam hissing out and a whistle falling under it. */
  HISS: 37,
  /** The katana coming on: its button clicked, then its edge's current crackling and buzzing. */
  IGNITE: 38,
  /** The plasma gun charging, held: a whine played higher as the charge grows (combat.ts), looped. */
  CHARGE: 39,
  /** The rover's electric turbine, looped: played higher as it goes faster. */
  ENGINE: 40,
  /** The rover's suspension taking a landing. */
  THUD: 41,
  /** The rover's tyres sliding sideways over the dust, looped: louder as it drifts wider. */
  SKID: 42,
  /** Breathing in a space helmet (the user, 2026-11-10), in then out: air drawn through the regulator, and let out with its valve's hiss. */
  INHALE: 43,
  EXHALE: 44,
  /** An automatic door (doors.ts) sliding open: its seals let go with a hiss and its servo whirs up. */
  DOOR: 45,
  /** And sliding shut: the servo whirs down and the panels meet with a thump. */
  SHUT: 46,
  /** A vehicle's damage (wreck.ts): a shot on its hull, a crackle of its arcs, its explosion, its wreck falling apart. */
  HULL: 47,
  ARC: 48,
  WRECK: 49,
  CRUMBLE: 50,
  /** A vehicle's laser bolt (the user, 2026-11-12: a blaster of the films): a bright zing diving fast, metallic. */
  BLASTER: 51,
  /** The combat ship's engines, looped: a turbine's whine over a jet's roar, played higher and louder with the thrust. */
  JET: 52,
  /** The ship crashing into a wall, the ground or another vehicle: a crunch of metal over a deep thump. */
  CRASH: 53,
  /**
   * A voice in pain (the user, 2026-11-13): a short "ugh" when hurt, a falling cry when put down.
   * A saw and its 3rd and 5th harmonics sliding together (the vowel), over a breath.
   */
  PAIN: 54,
  DEATH: 55,
  /**
   * The pickups' own sounds (the user, 2026-11-14: one for each), PACK being the health's: an ammo
   * pack's clack of a magazine and a blip up a fifth; an armour's rising hum under a ringing chord.
   */
  AMMO: 56,
  ARMOR: 57,
  /** The orbital station's mission: the alarm of a strike armed, and the strike's lasers from the sky. */
  ALARM: 58,
  STRIKE: 59,
  /**
   * The xenomorph's own (the user, 2026-11-16: not a runner's): a hiss with a growl under it as it
   * charges its tail, a shriek as it dashes, its claws' swipe and the whip of its tail, a screech of
   * pain and a big roar going down, its footfall (claws, wet pad, weight) at each step, the sizzle of
   * its acid blood, a roar after a kill, and the heavier footfall of a landing.
   */
  XENO_HISS: 60,
  SHRIEK: 61,
  CLAW: 62,
  STING: 63,
  XENO_PAIN: 64,
  XENO_DEATH: 65,
  CHITIN: 66,
  ACID: 67,
  ROAR: 68,
  XENO_LAND: 69,
  /** A fist bursting a head (the fists' glory kill): a deep thump, bone cracking, a wet splatter. */
  SMASH: 70,
  /**
   * The death cries (scream(), the user 2026-11-17: a synth's, not the players' voices): DEATH his
   * brief cry of pain and HER_DEATH hers, for a dreadful death (a limb cut off, a hard fall, a heavy
   * hit); GROAN and HER_GROAN cut off in the throat, for the others. Hers are her own, not his
   * played faster: that raised the vowel with the pitch into a cartoon's.
   */
  HER_DEATH: 71,
  GROAN: 72,
  HER_GROAN: 73,
  /** A Hunter harpoon: a tight mechanical release, then a quick metallic flight zing. */
  HARPOON: 74,
  /** Original Hunter voice: a pain rasp, a fatal throat shriek and the short radio click-call. */
  HUNTER_PAIN: 75,
  HUNTER_DEATH: 76,
  HUNTER_TAUNT: 77,
  /** Original wrist-blade mechanisms: an upward deployment and a lower, locking retraction. */
  HUNTER_BLADE_DRAW: 78,
  HUNTER_BLADE_SHEATHE: 79,
  /** The Hunter's paired blades: a rasping sweep and a bright metal impact. */
  HUNTER_BLADE_SWISH: 80,
  HUNTER_BLADE_HIT: 81,
  /** A spinning disc launch, its return whistle, and the catch against the wrist bracer. */
  HUNTER_DISC_THROW: 82,
  HUNTER_DISC_RETURN: 83,
  HUNTER_DISC_CATCH: 84,
  /** A rising three-step target lock and a heavy shoulder-mounted laser discharge. */
  HUNTER_LOCK: 85,
  HUNTER_LASER: 86,
  /** The harpoon's next bolt racked in from behind: steel sliding along steel, then the lock home. */
  HARPOON_RELOAD: 87,
  /**
   * The Hunter's views (the user, 2026-11-23): the flash of a view switched with V, then, while a
   * special one is on, a heart beating and a radio that barely holds its station, both looped.
   */
  HUNTER_FLASH: 88,
  HEARTBEAT: 89,
  STATIC: 90,
  /**
   * The shoulder cannon taking a foe in its sight, after the Predator's (the user, 2026-11-23; the
   * first 5 s of "Predator Target lock and Plasma weapon sound FX", analysed): three dry clicks round
   * 700 Hz 75 ms apart and a breath of noise, then HUNTER_SEEK, looped until the lock: a steady
   * electronic hum at 1.5 kHz over a fainter 1.2 kHz, each buzzing at 65 Hz.
   */
  HUNTER_TRACK: 91,
  HUNTER_SEEK: 92,
  /** A harpoon bolt striking (the user, 2026-11-24: a shock, not a laser's splash). */
  HARPOON_HIT: 93,
  /**
   * The harpoon unfolding as it comes to hand (HARPOON_DRAW, 1.1 s): a catch let go, the slide and
   * the stock grinding out, a ratchet over them, and a heavy lock as they reach their stops.
   */
  HARPOON_OPEN: 94,
  /**
   * The Hunter's radio (the user, 2026-11-24: sounds and radio voices of his own): CLICKS his
   * rattle, a trill of throat clicks over a low gurgle; GROWL a deep rolling roar.
   */
  HUNTER_CLICKS: 95,
  HUNTER_GROWL: 96,
  /** A step in shallow water: a splash with spray and a bubble rising; also a body entering the water, lower. */
  WADE: 97,
  /** A swimmer's stroke through the water, looped: a low wash with a rustle over it, louder with his speed. */
  SWIM: 98,
  /**
   * A melee hit's own sounds (the user, 2026-11-28: the most feedback): SLICE the katana through
   * flesh, a wet tearing hiss over a thump with the blade's crackle in it; REND the claws, three
   * quick tears; KILL the blow that puts him down, a deep boom with a ring; SEVER a limb taken off,
   * a wet crunch.
   */
  SLICE: 99,
  REND: 100,
  KILL: 101,
  SEVER: 102,
} as const;
