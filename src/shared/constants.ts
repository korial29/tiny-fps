import type { Rules } from './types';

// World units are metres. y is up; yaw 0 looks toward -z (see forward in physics.ts).

/** Physics steps per second: one client input per step, the host steps a player per input. */
export const TICK_HZ = 60;
/** A snapshot goes out every SNAP_EVERY host ticks: 60 / 2 = 30 Hz. */
export const SNAP_EVERY = 2;
/**
 * Render delay of the other players, interpolated between snapshots, in ms: about three snapshot
 * intervals, so one lost or late snapshot does not freeze them. The own player is predicted.
 */
export const INTERP_DELAY = 100;

/** Player cylinder. */
export const PLAYER_R = 0.4;
export const PLAYER_H = 1.8;
/** Camera height above the feet. */
export const EYE = 1.6;

/** Metres per second. */
export const RUN_SPEED = 6;
export const JUMP_SPEED = 7;
/** Metres per second squared. */
export const GRAVITY = 20;
/** Pitch is clamped to ±MAX_PITCH radians, just short of straight up or down. */
export const MAX_PITCH = 1.55;
/** A floor at most this much higher is walked onto; a higher one needs a jump. */
export const STEP_H = 0.5;

// Movement (physics.ts). Speeds in m/s, rates in m/s², durations in ticks of 1 / TICK_HZ s. The
// timers go on the wire in 3, 6 or 8 bits (protocol.ts): keep the coyote and buffer windows within 7,
// DASH_COOLDOWN and STUMBLE_TICKS within 63, the other times within 255.

/** Ground acceleration toward the wished direction: from standing to RUN_SPEED in 0.12 s. */
export const ACCEL = 50;
/** Ground deceleration with no direction held: strong, a stop takes about 0.15 s. */
export const FRICTION = 45;
/**
 * How fast the speed across the wished direction is killed on the ground. A gentle turn keeps
 * nearly all the speed, a turn of 90 degrees loses it all and starts again from RUN_SPEED.
 */
export const GRIP = 45;
/** How fast a speed above the current top speed falls back to it (sprint released, dash over). */
export const DECAY = 12;
/** Acceleration in the air toward the wished direction. The speed never grows from it, see AIR_SPEED. */
export const AIR_ACCEL = 14;
/** The speed air control may build up to; a faster player keeps his speed and only turns. */
export const AIR_SPEED = RUN_SPEED;

/** Top speed after about a second of sprinting forward (Shift held, forward held). */
export const SPRINT_SPEED = 9;
/** Acceleration from RUN_SPEED to SPRINT_SPEED: 3 m/s over 1 s. */
export const SPRINT_ACCEL = 3;

/** Dash: a burst of this speed in the wished direction (forward without a key), no gravity. */
export const DASH_SPEED = 16;
/** Ticks the burst lasts (0.17 s, about 2.7 m). */
export const DASH_TICKS = 10;
/** The speed left after the burst; it then falls to the top speed at DECAY. */
export const DASH_EXIT_SPEED = 10;
/** Ticks from one dash to the next dash, burst included (1 s). */
export const DASH_COOLDOWN = 60;

/** The extra jump in the air: weaker than the first one, so a walk and a double jump stay short. */
export const DOUBLE_JUMP_SPEED = 6;
/** Air jumps that landing, a wall-run and a ledge grab give back. */
export const AIR_JUMPS = 1;
/** Ticks after walking off an edge in which a jump still works (0.1 s). */
export const COYOTE_TICKS = 6;
/**
 * Ticks a jump press is remembered after its own (0.1 s): pressed this close to the ground, it
 * goes off on landing. The state counts it as JUMP_BUFFER_TICKS + 1, which must fit 3 bits.
 */
export const JUMP_BUFFER_TICKS = 6;

/** Height of the cylinder when sliding or crouching, and the eye in it. */
export const LOW_H = 0.9;
export const LOW_EYE = 0.7;
/** Speed from which a crouch is a slide (above RUN_SPEED: only a sprint slides). */
export const SLIDE_MIN_SPEED = 7.5;
/** A slide bleeds speed at this rate (a sprint of 9 m/s is down to 5 after a second)... */
export const SLIDE_DECEL = 4;
/** ...and ends under this speed, or after this many ticks (1 s), into a crouch or a stand. */
export const SLIDE_END_SPEED = 4.5;
export const SLIDE_TICKS = 60;
/** Top speed of a crouch walk. */
export const CROUCH_SPEED = 3;

/**
 * Wall-run: in the air with forward held, running at least WALLRUN_MIN_SPEED (m/s, a normal run is
 * 6) toward or along a wall within reach starts it; under WALLRUN_KEEP_SPEED it ends.
 */
export const WALLRUN_MIN_SPEED = 4.5;
export const WALLRUN_KEEP_SPEED = 3.5;
/** Speed lost along the wall, m/s². */
export const WALLRUN_DRAG = 1.5;
/** Longest run, in ticks (1 s). */
export const WALLRUN_TICKS = 60;
/**
 * Gravity during the run, as a share of GRAVITY. The start lifts the rise to at least
 * WALLRUN_LIFT and holds it to at most WALLRUN_VY_MAX (m/s).
 */
export const WALLRUN_GRAVITY = 0.15;
export const WALLRUN_LIFT = 2;
export const WALLRUN_VY_MAX = 3;
/** How far from the cylinder a wall still counts as next to it (m). */
export const WALL_REACH = 0.5;
/**
 * The share of the speed that may point into the wall for a run to start (0.75 is 49 degrees off
 * the wall), and the share that may point away from it. A run starting at an angle is turned
 * along the wall and keeps WALL_TURN_KEEP of its speed (a parallel one keeps all of it).
 */
export const WALL_PARALLEL = 0.75;
export const WALL_AWAY = 0.2;
export const WALL_TURN_KEEP = 0.9;
/** Speed at which a run draws the body in to the wall when it starts up to WALL_REACH away (m/s). */
export const WALL_PULL = 4;
/** A kick-off from the wall: speed away from it and upward (m/s). */
export const WALL_KICK_SPEED = 5;
export const WALL_KICK_UP = 6.5;

/** Ledge grab: a top this far above the feet (m) can be caught, if the player faces it (cosine). */
export const GRAB_MIN = 1.2;
export const GRAB_MAX = 2.4;
export const GRAB_FACING = 0.5;
/** A hand's reach beyond the cylinder (m), and the gap left between the hanging body and the wall. */
export const GRAB_REACH = 0.2;
export const GRAB_GAP = 0.03;
/** Feet this far under the ledge (m) when hanging, and how fast the body settles there (m/s). */
export const HANG_H = 2;
export const HANG_SNAP = 8;
/** A forward press climbs from this tick of the hang (0.1 s); with nothing held the hand slips at HANG_SLIDE. */
export const HANG_MIN_TICKS = 6;
export const HANG_SLIDE_TICKS = 30;
/** Climb: the body rises to the top at this speed (m/s), then moves CLIMB_INSET in from the edge. */
export const CLIMB_RISE = 8;
export const CLIMB_INSET = 0.2;
export const CLIMB_FWD_SPEED = 5.5;
/** Safety: a climb that has not ended after this many ticks ends where it is. */
export const CLIMB_MAX_TICKS = 40;
/** Speed forward when the climb ends (m/s). */
export const CLIMB_EXIT_SPEED = 3;
/** Jumping off a ledge facing away from it: speed away and upward (m/s). */
export const VAULT_SPEED = 4;
export const VAULT_UP = 6;

/**
 * The tackle (tackle.ts, room.ts): a dash or a slide into an enemy carrier. The tackler's body
 * reaches TACKLE_REACH metres past touching the carrier's, as the tackler drew him.
 */
export const TACKLE_REACH = 0.3;
/** Ticks before a tackler may tackle again (0.5 s): one dash that carries through two carriers tackles one. */
export const TACKLE_COOLDOWN = 30;
/**
 * The stumble a tackle leaves (physics.ts, `stumble()`): the carrier cannot sprint, dash or jump
 * for STUMBLE_TICKS (0.8 s), walks at STUMBLE_SPEED at most, and is thrown STUMBLE_KNOCK m/s along
 * the tackler's way, a speed that slides out at STUMBLE_DRAG m/s² (about a metre).
 */
export const STUMBLE_TICKS = 48;
export const STUMBLE_SPEED = 2.5;
export const STUMBLE_KNOCK = 6;
export const STUMBLE_DRAG = 12;

/**
 * Host ticks the history of the players goes back (0.5 s): the host rewinds the others to the
 * view tick of an input, clamped to this.
 */
export const MAX_REWIND = 30;

/**
 * Host-side speed-hack guard: each player earns one input per host tick and may bank up to
 * INPUT_BURST of them; inputs beyond the bank are dropped (and not acked).
 */
export const INPUT_BURST = 10;

/** At most 16: the id of a tackler goes on the wire in 4 bits (protocol.ts). */
export const MAX_PLAYERS = 16;

/** Team names and colours (CSS), red then blue: the runners, the flags, the bases and the HUD wear them. */
export const TEAM_NAME = ['Red', 'Blue'];
export const TEAM_COLOR = ['#ff3d4f', '#2f80ff'];

/** Capture the flag. Reach: horizontal metres from a flag stand or a lying flag within which the player touches it. */
export const FLAG_REACH = 1.5;
/** A flag is as tall as this above its foot: a body touches it only if it overlaps that height. */
export const FLAG_H = 2.2;
/** Seconds a dropped flag lies before it goes home by itself. */
export const FLAG_RETURN = 10;
// The gun (gun.ts) and health. Ticks of 1 / TICK_HZ s. On the wire (protocol.ts) HP_MAX and
// GUN_COOLDOWN take 3 bits, AMMO_MAX 7 bits less the no-gun value, DOWN_TICKS 7 bits.

/** Health of a player; a hit takes 1, so HP_MAX hits put him down. */
export const HP_MAX = 5;
/** Shots the rack loads. */
export const AMMO_MAX = 60;
/**
 * The magazines (the user, 2026-11-08): the gun fires from a battery in its grip, GUN_MAG shots,
 * the rail gun from a capsule on its top, RAIL_CAP ticks of lightning (a third of a load). An empty
 * one, or KEY.RELOAD, swaps it from what the player carries (`ammo`, `rail`): GUN_RELOAD and
 * RAIL_RELOAD ticks without firing. u8 each on the wire.
 */
export const GUN_MAG = 15;
export const GUN_RELOAD = 54;
export const RAIL_CAP = 80;
export const RAIL_RELOAD = 90;
/** Ticks between two shots while the trigger is held: 8.6 shots a second. */
export const GUN_COOLDOWN = 7;
/**
 * The charged shot (the user, 2026-11-07): FIRE held with the gun charges it, and letting go fires
 * one ball. Let go before CHARGE_TAP ticks it is a plain shot; held on, it grows to CHARGE_MAX
 * shots' worth at CHARGE_TICKS (1 s), spends that many and takes that much health, so a full one
 * (HP_MAX) puts any foe down. The charge holds at the top until let go. u8 on the wire.
 */
export const CHARGE_TAP = 10;
export const CHARGE_TICKS = 60;
export const CHARGE_MAX = 5;
/** Metres a shot reaches: a plasma ball that has flown this far is gone. */
export const GUN_RANGE = 80;
/**
 * A shot is a plasma ball (the user, 2026-11-06, Doom-like): it leaves the eye along the look at
 * PLASMA_SPEED m/s, is a sphere of PLASMA_R metres, and bursts on the first brush or enemy body it
 * touches (teammates and the shooter let it through). It lives GUN_RANGE / PLASMA_SPEED s.
 */
export const PLASMA_SPEED = 40;
export const PLASMA_R = 0.12;
/** Plasma balls in flight in a room at most: past it the oldest bursts. They go on the wire. */
export const PLASMA_MAX = 64;
/** Radians the view kicks up per shot (client side: the kick is in the pitch the inputs carry). */
export const RECOIL = 0.012;
/** Ticks a player lies down after the health ran out, then he is back at a spawn of his team. */
export const DOWN_TICKS = 120;
/** Health a pack gives, up to HP_MAX, and seconds before a taken pack is back. */
export const PACK_HP = 2;
export const PACK_BACK = 20;
/** Shots an ammo pack gives, up to AMMO_MAX, and seconds before a taken one is back. */
export const AMMO_PACK = 20;
export const AMMO_BACK = 10;
/** Health packs, ammo packs and rail cells a map has at most: the bits of Snapshot.packs. */
export const PACK_BITS = 48;
/** Metres from a pack or a rack, feet to point on the floor plane, that take it. */
export const PACK_R = 0.9;
export const RACK_R = 1.2;
/** Metres the feet may be above or below a pack or a rack to take it. */
export const PICK_H = 1;

// The electric katana (blade.ts). Ticks of 1 / TICK_HZ s; on the wire a swing's ticks take 6 bits.

/**
 * The cuts, by CUT. A swing lasts `ticks`, during which no other starts, and strikes once, `strike`
 * ticks after its start. `hold` is the top of its wind-up, where FIRE held keeps it (a charge; -1:
 * a special, which does not charge). It hits every enemy whose body comes within `reach` metres of the
 * attacker's (centre to centre less PLAYER_R, on the floor plane), within `arc` radians either side
 * of his look, at a height his body overlaps, with no brush between. A hit takes `hp`.
 */
export const CUTS = [
  /** THRUST: quick and the longest, a narrow line. */
  { ticks: 28, strike: 10, reach: 2.65, arc: 0.3, hp: 2, hold: 8 },
  /** LEFT, then RIGHT: across, a wide arc. */
  { ticks: 34, strike: 13, reach: 2.15, arc: 1.2, hp: 2, hold: 4 },
  { ticks: 34, strike: 13, reach: 2.15, arc: 1.2, hp: 2, hold: 4 },
  /** SLASH: down from above, the slowest and the hardest. */
  { ticks: 40, strike: 16, reach: 2.15, arc: 0.45, hp: 3, hold: 11 },
  /** LUNGE: thrown forward on the point (LUNGE_SPEED), the longest reach. */
  { ticks: 36, strike: 12, reach: 3.2, arc: 0.3, hp: 3, hold: -1 },
  /**
   * ARC_L, then ARC_R (the user, 2026-11-08): a heavy cut down across, from high on its side to low
   * on the other. It strikes no one itself: at its strike it throws an arc of energy (wave(),
   * plasma.ts) that takes `hp` and floors the foe it meets (FLOOR_TICKS). Its reach and arc count
   * only for a saber lock.
   */
  { ticks: 46, strike: 20, reach: 2.15, arc: 0.6, hp: 3, hold: -1 },
  { ticks: 46, strike: 20, reach: 2.15, arc: 0.6, hp: 3, hold: -1 },
  /** LEAP: up (LEAP_SPEED) and down on the foe as he lands, the hardest blow. */
  { ticks: 58, strike: 40, reach: 2.4, arc: 0.6, hp: 4, hold: -1 },
];
/**
 * The charged cut (the user, 2026-11-08): FIRE held on a cut keeps it at the top of its wind-up
 * (`hold`), counting `charge` up to HEAVY_MAX. Let go after HEAVY_TAP ticks, the rest of the cut is
 * heavy: HEAVY times as slow (its own swing timer), HEAVY_HP more health, HEAVY_REACH metres
 * further, an arc HEAVY_ARC times as wide, a shock HEAVY times as hard. Let go sooner, it goes on
 * as it was.
 */
export const [HEAVY, HEAVY_TAP, HEAVY_MAX] = [1.8, 15, 60];
export const [HEAVY_HP, HEAVY_REACH, HEAVY_ARC] = [2, 0.5, 1.4];
/**
 * The arc of energy an ARC cut throws: it leaves the eye along the look at ARC_SPEED m/s, flies
 * ARC_RANGE metres at most, stops on the first brush, and meets a body ARC_R metres off its line
 * (it is about 1.5 m wide). The foe it meets is floored: a stumble of FLOOR_TICKS (a second on the
 * ground, no move: floored(), physics.ts; the stun field holds 63 at most), thrown ARC_KNOCK m/s the way it flies, and he drops the flag.
 * ARC_RANGE / ARC_SPEED stays under an ARC cut's ticks: one arc is gone before the next is thrown.
 */
export const [ARC_SPEED, ARC_RANGE, ARC_R] = [24, 15, 0.6];
export const [FLOOR_TICKS, ARC_KNOCK] = [63, 7];
/** Ticks into a cut's swing in which a double click's second press still turns it into its special. */
export const SPECIAL_LATE = 18;
/** The lunge's throw along the look (m/s), held for the burst of a dash: it spends the dash. */
export const LUNGE_SPEED = 13;
/** The leap's jump (m/s up), from a floor only: 1.4 m up and down in 45 ticks, the blow (LEAP's strike) just before the landing. */
export const LEAP_SPEED = 7.5;
/**
 * Where a finishing cut crosses the body, as a share of its height from the feet, picks the limb
 * (limbOf(), blade.ts): above NECK the head, below HIPS a leg, between them an arm. A thrust or a
 * slash whose line passes within MIDLINE metres of the body's middle takes no arm: the slash takes
 * the head, the thrust nothing unless it is above NECK.
 */
export const [NECK, HIPS, MIDLINE] = [0.82, 0.45, 0.12];
/**
 * A cut that does not put the enemy down shocks him: a stumble (`stumble()`, physics.ts) of
 * SHOCK_TICKS (0.4 s), thrown SHOCK_KNOCK m/s the way the blade goes.
 */
export const SHOCK_TICKS = 24;
export const SHOCK_KNOCK = 4;

/**
 * The saber lock (the user, 2026-11-07, after Jedi Outcast): two foes whose cuts strike within
 * LOCK_WINDOW ticks (0.15 s) of each other, each in the other's reach and facing him (within
 * LOCK_FACING radians of his look), lock blades instead of cutting. Each FIRE press pushes, and the
 * first to lead by LOCK_WIN presses wins: the other takes LOCK_HP and the katana's shock. LOCK_TICKS
 * (4 s) without a winner part them, stumbling; LOCK_BREAK ticks (0.4 s) of a side or back key held
 * step one out and free both. Ticks and presses are u8 on the wire.
 */
export const LOCK_WINDOW = 9;
export const LOCK_FACING = 0.9;
export const LOCK_WIN = 8;
export const LOCK_HP = 3;
export const LOCK_TICKS = 240;
export const LOCK_BREAK = 24;

/**
 * The rail gun (rail.ts, the user, 2026-11-07), a Tesla gun: taken at the team's third rack with
 * RAIL_MAX ticks of lightning (4 s), it throws a bolt RAIL_RANGE metres to the first wall or enemy
 * on every step FIRE is held, one tick spent each. An enemy the bolt touches is drained while it
 * does and RAIL_TICKS (3 s) after: 1 hp at the first touch, then 1 more each RAIL_DRAIN ticks, his
 * speed on the floor plane held under SLOW_SPEED. Ticks are u8 on the wire.
 */
export const RAIL_MAX = 240;
/** Ticks of lightning a rail cell gives (WorldDef.cells), up to RAIL_MAX: a third of a load. */
export const RAIL_CELL = 80;
export const RAIL_RANGE = 30;
export const RAIL_TICKS = 180;
export const RAIL_DRAIN = 60;
export const SLOW_SPEED = 3;

/**
 * The laser rifle (the user, 2026-11-08), held in both hands, after Halo's assault rifle: taken at
 * the team's fourth rack with RIFLE_MAX rounds, it fires while FIRE is held, one round each
 * RIFLE_COOL ticks (20 a second) from a power cell of RIFLE_CLIP (RIFLE_RELOAD to swap). Each shot
 * is an instant beam RIFLE_RANGE metres along the look, drifted by up to RIFLE_DRIFT radians in a
 * pattern of the shot count; every RIFLE_HITS of them that enter an enemy take 1 hp from him.
 * Rounds and the cell are u8 on the wire.
 */
export const RIFLE_MAX = 240;
export const RIFLE_CLIP = 60;
export const RIFLE_RELOAD = 96;
export const RIFLE_COOL = 3;
export const RIFLE_RANGE = 60;
export const RIFLE_DRIFT = 0.012;
export const RIFLE_HITS = 2;

/** Seconds a carrier who is made to drop the flag cannot take it again: he would pick it up where he stands. */
export const FLAG_LOCK = 2;
/** Seconds the end screen of a match stays, then a new match starts. */
export const END_SCREEN = 10;

/** Longest player name, in characters (code points). */
export const MAX_NAME = 16;

export const RULES: Rules = {
  maxPlayers: MAX_PLAYERS,
  scoreLimit: 3,
  timeLimit: 480,
};
