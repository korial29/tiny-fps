/** The two teams: an index into WorldDef.teams, TEAM_NAME and TEAM_COLOR. */
export const TEAM = { RED: 0, BLUE: 1 } as const;

/** Where a team's flag is: at its base, on a carrier's back, or on the ground where it was dropped. */
export const FLAG = { HOME: 0, CARRIED: 1, DROPPED: 2 } as const;

export interface PlayerInfo {
  id: number;
  name: string;
  /** TEAM, set when the player joins and kept for the room's life. */
  team: number;
  /** CSS colour: the team's (TEAM_COLOR). */
  color: string;
}

/** Bits of Input.keys. Keys are read by KeyboardEvent.code, so WASD is ZQSD on AZERTY. */
export const KEY = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  /** Hold to sprint (with forward). */
  SPRINT: 32,
  /** Press to dash. */
  DASH: 64,
  /** Hold to crouch, or to slide when fast. */
  CROUCH: 128,
  /** Hold to charge the gun, let go to fire (see CHARGE_TICKS); with the katana in hand, a cut (see CUT). */
  FIRE: 256,
  /**
   * Set while the player wants the katana in hand (the client's choice: 1, 2 or the wheel), clear
   * for the gun. Ignored without the katana; without the gun the katana is in hand whatever it says.
   */
  BLADE: 512,
  /**
   * Set with FIRE by a double click (the client's choice): the katana's special cut, the special
   * of the cut the keys give (see CUT). Set alone by G with the laser rifle in hand: a grenade from
   * its launcher. Ignored with the other guns.
   */
  SPECIAL: 1024,
  /**
   * Set while the player wants the rail gun in hand (the client's choice: 3 or the wheel), with
   * KEY.BLADE clear. Ignored without the rail gun.
   */
  RAIL: 2048,
  /** Press to swap the battery or the capsule of the gun in hand (see GUN_MAG). */
  RELOAD: 4096,
  /** Set while the player wants the laser rifle in hand (4 or the wheel), with BLADE and RAIL clear. Ignored without it. */
  RIFLE: 8192,
  /** Press to get into the rover at hand, or out of the one he rides. */
  USE: 16384,
} as const;

/**
 * The katana's cuts (PlayerState.cut, constants CUTS), chosen by the keys held when FIRE starts
 * one: LEFT or RIGHT (one of them) cuts across from that side, else FORWARD thrusts, else (back or
 * no key) it slashes down from above. With SPECIAL (a double click) each has its special, the cut
 * plus SPECIAL_CUT: the thrust a LUNGE (a dash forward on the point), a cut across an ARC (a heavy
 * cut down across the body that throws an arc of energy ahead, see wave(), plasma.ts), the slash a
 * LEAP (a jump and a blow down on landing).
 */
export const CUT = {
  THRUST: 0,
  LEFT: 1,
  RIGHT: 2,
  SLASH: 3,
  LUNGE: 4,
  ARC_L: 5,
  ARC_R: 6,
  LEAP: 7,
} as const;
/** A cut plus this is its special; a cut's base cut is the cut less it. */
export const SPECIAL_CUT = 4;

/**
 * The limb a katana's cut takes off when it puts a player down (PlayerState.lost), by where the
 * blade crosses the body (see limbOf(), blade.ts). Sides are the victim's own.
 */
export const LIMB = { NONE: 0, HEAD: 1, ARM_L: 2, ARM_R: 3, LEG_L: 4, LEG_R: 5 } as const;

/** The movement state of a player: what the body is doing, one of these. */
export const MODE = {
  /** Standing or running on a floor. */
  GROUND: 0,
  /** Off the floor: a jump, a fall, a dash. */
  AIR: 1,
  /** Running along a wall. */
  WALLRUN: 2,
  /** Hanging from a ledge. */
  HANG: 3,
  /** Pulling up onto a ledge. */
  CLIMB: 4,
  /** Sliding on the ground, low. */
  SLIDE: 5,
  /** Walking low. */
  CROUCH: 6,
  /** Seated in a rover (rover.ts): the body follows the seat, move() leaves it there. */
  RIDE: 7,
} as const;

/**
 * Which side of the player a wall or a ledge is on (PlayerState.wall). In the air it is the side
 * of the last wall-run or hang, which does not catch the player again until he lands.
 */
export const SIDE = { NONE: 0, EAST: 1, WEST: 2, SOUTH: 3, NORTH: 4 } as const;

/** Bits of PlayerState.ev: what happened in the last step. */
export const EV = {
  JUMP: 1,
  /** The extra jump in the air. */
  DOUBLE: 2,
  DASH: 4,
  /** Back on a floor: PlayerState.fall is the speed it came down at. */
  LAND: 8,
  GRAB: 16,
  /** The climb ended standing on the top. */
  CLIMB: 32,
  WALLRUN_START: 64,
  WALLRUN_END: 128,
  SLIDE_START: 256,
  SLIDE_END: 512,
  /** Fell under the kill floor and was put back at a spawn: the host drops a carried flag. */
  RESPAWN: 1024,
} as const;

/** One client step: what the player held during 1 / TICK_HZ s, and where they looked. */
export interface Input {
  /** Client step counter, u16, wraps. The host acks the last one it applied. */
  seq: number;
  /** KEY bits. */
  keys: number;
  /** Radians, [0, 2π). */
  yaw: number;
  /** Radians, [-MAX_PITCH, MAX_PITCH]. */
  pitch: number;
  /**
   * Host tick the client drew the others at when it sent this input, fractional (interpolation
   * between two snapshots), in [0, 65536): the host rewinds the other players to it (lag
   * compensation). The wire keeps 1/256 tick. Absent (no snapshot seen yet) goes out as 0: the host
   * clamps it to the oldest tick it keeps.
   */
  view?: number;
}

/**
 * One player, float32 where it is a number with a fraction. All of it but the last two fields goes
 * on the wire (see protocol.ts) and is what move() needs to continue from.
 */
export interface PlayerState {
  id: number;
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  /** Speed, m/s. */
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  /** On a floor, derived from mode (ground, slide, crouch): not sent. */
  ground: boolean;
  /** MODE, and the ticks spent in it (saturates at 255). */
  mode: number;
  t: number;
  /** SIDE of the wall being run on, the ledge hung from, or the last one (see SIDE). */
  wall: number;
  /** Height of the ledge top being hung from or climbed, else 0. */
  edge: number;
  /** Extra jumps and air dashes left: refilled on landing, a wall-run and a ledge grab. */
  jumps: number;
  dashes: number;
  /** Ticks to the next dash; the first DASH_TICKS of DASH_COOLDOWN are the burst. */
  dash: number;
  /** Ticks of stumble left after a tackle (STUMBLE_TICKS at the start): no sprint, dash or jump, and slow. */
  stun: number;
  /** Ticks left in which a jump still works after walking off an edge, and in which a press is kept. */
  coyote: number;
  buffer: number;
  /** KEY.JUMP, KEY.DASH and KEY.USE as held in the last step, to tell a press from a hold. */
  held: number;
  /** Health, 0 to HP_MAX. */
  hp: number;
  /** Shots left in the gun; -1 without the gun (taken at the team's rack, lost on death). */
  ammo: number;
  /** Ticks to the next shot. */
  cool: number;
  /** Shots in the gun's battery, of `ammo` (GUN_MAG at most). Absent reads 0. */
  mag?: number;
  /** Ticks of lightning in the rail gun's capsule, of `rail` (RAIL_CAP at most). Absent reads 0. */
  cap?: number;
  /** Ticks left swapping the battery or the capsule of the gun in hand, 0 when not. Absent reads 0. */
  reload?: number;
  /** Rounds left in the laser rifle; absent or -1 without it (taken at the team's fourth rack, lost on going down). */
  rifle?: number;
  /** Rounds in the laser rifle's power cell, of `rifle` (RIFLE_CLIP at most). Absent reads 0. */
  clip?: number;
  /** Grenades left in the laser rifle's launcher (NADE_MAX at its rack, none without the rifle). Absent reads 0. */
  nades?: number;
  /** Ticks before the launcher fires again (NADE_COOL after a grenade). Absent reads 0. */
  lob?: number;
  /** The laser rifle is in hand (see KEY.RIFLE). Absent reads false. */
  rifled?: boolean;
  /** Standing inside the circle of the team's rifle rack as of the last step. Absent reads false. */
  inRifle?: boolean;
  /** Ticks FIRE has been held with the gun, up to CHARGE_TICKS, 0 when not charging. Absent reads 0. */
  charge?: number;
  /** The strength of the last shot, 1 to CHARGE_MAX: the shots it spent and the health it takes. Set by the step that fires; not on the wire. */
  power?: number;
  /** Standing inside the circle of the team's rack as of the last step: the gun is filled on arrival only. Absent reads false. */
  rack?: boolean;
  /** Ticks left lying down after the health ran out; at 0 the player is back at a spawn. 0 when up. */
  down: number;
  /** Shots fired and hits landed (a plasma ball or a cut), u8 counters that wrap: the clients flash the muzzle and play the hit sound on each change. */
  shots: number;
  hits: number;
  /** Has the katana (taken at the team's katana rack, lost on going down). Absent reads false. */
  blade?: boolean;
  /** The katana is in hand rather than the gun (see KEY.BLADE). Absent reads false. */
  wield?: boolean;
  /** Ticks left in the katana's swing, CUTS[cut].ticks at its start, 0 when ready. Absent reads 0. */
  swing?: number;
  /** CUT of the running or last swing. Absent reads 0. */
  cut?: number;
  /** The running stumble (`stun`) is a katana's shock, not a tackle. Absent reads false. */
  zap?: boolean;
  /**
   * Ticks left in a saber lock (LOCK_TICKS at its start, held at 1 until the host parts it), 0 when
   * not locked; while locked the keys do not move him, FIRE presses push (`pushes`) and a side or back
   * key held counts `away`. `foe` is the id of the one he is locked with, and `pressed` whether FIRE
   * was held at the last step, to tell a press. All absent read 0 or false.
   */
  lock?: number;
  foe?: number;
  pushes?: number;
  pressed?: boolean;
  away?: number;
  /** Ticks of lightning left in the rail gun; absent or -1 without it (taken at the team's rail rack, lost on going down). */
  rail?: number;
  /** The rail gun is in hand (see KEY.RAIL). Absent reads false. */
  railed?: boolean;
  /** Standing inside the circle of the team's rail rack as of the last step: it fills on arrival only. Absent reads false. */
  inRail?: boolean;
  /** The rail gun's bolt went out on the last step. Absent reads false. */
  zapping?: boolean;
  /** The rail gun's heat, 0 to HEAT_MAX, and whether it overheated and cannot fire until it cools (gun.ts). Absent reads 0. */
  heat?: number;
  hot?: boolean;
  /** Ticks left drained by the bolt: slowed under SLOW_SPEED, and the host takes 1 hp each RAIL_DRAIN. Absent reads 0. */
  slow?: number;
  /** While down: the bolt's drain put him down, and he is disintegrated. Absent reads false. */
  fried?: boolean;
  /** The katana's cut is a charged one let go (see HEAVY): its swing is the heavy release's. Absent reads false. */
  heavy?: boolean;
  /** While down after a katana's cut put him down: the LIMB it took off, for the clients to draw. NONE once up. Absent reads NONE. */
  lost?: number;
  /** For the animation, not sent: the EV bits of the last step, and the speed of a landing. */
  ev: number;
  fall: number;
}

/** Procedural textures, generated by the client. A brush names one for its top and one for its sides. */
export const TEX = {
  BRICK: 0,
  TILE: 1,
  LAVA: 2,
  STONE: 3,
  /** Riveted metal plates. */
  METAL: 4,
  /** Planks, the grain running along u. */
  WOOD: 5,
  /** Stone blocks with moss in the joints. */
  MOSS: 6,
  /** Metal floor grating over darkness. */
  GRATE: 7,
  /** White precast concrete in 1 m panels: the roofs and walls. */
  CONCRETE: 8,
  /** Dark blue glass in steel frames; the shader adds the sky's reflection. */
  GLASS: 9,
  /** Brushed steel. */
  STEEL: 10,
  /** A near white painted panel: the brush tint is its colour. */
  PAINT: 11,
  /** Dark basalt: mottled, speckled with pits and light flecks, a few fine cracks. The moon's boulders. */
  ROCK: 12,
} as const;

/** One player in a snapshot: the state (its ev and fall read 0) and the ack. */
export interface SnapPlayer extends PlayerState {
  /** Seq of the last input of this player the host applied: the client replays the ones after. */
  ack: number;
  /** While `stun` runs: the id of the player who tackled this one (4 bits), else 0. Not part of the movement. */
  by: number;
}

/** A plasma ball as a snapshot carries it (plasma.ts). */
export interface Ball {
  /** The shooter's `shots` count after the shot that fired it, u8: with `by`, it names the ball. */
  id: number;
  /** The shooter's player id. */
  by: number;
  /** Its centre, metres (the wire keeps 1/32 m), and its unit direction of flight. */
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  /** It burst where it is: the last snapshot that carries it. */
  burst: boolean;
  /** Its strength, 1 to CHARGE_MAX: the health it takes. Absent reads 1. 0 is a laser rifle's, BOLT a rover's, NADE a grenade. */
  power?: number;
  /** A grenade's speed along its direction, m/s (the wire keeps whole m/s, 63 at most). Absent for the rest. */
  v?: number;
  /** An arc of energy, not a ball: the CUT that threw it (ARC_L or ARC_R). Absent for a ball. */
  arc?: number;
}

/** The flag of a team as a snapshot carries it: only the fields of its state are meaningful, the rest read 0. */
export interface FlagState {
  /** FLAG. */
  state: number;
  /** CARRIED: the carrier's player id. */
  by: number;
  /** DROPPED: where it lies, metres (the wire keeps 1/16 m), and the whole seconds left before it goes home. */
  x: number;
  y: number;
  z: number;
  left: number;
}

/** A seat nobody is in (Rover.driver, Rover.rider). */
export const NOBODY = 255;

/**
 * A rover (rover.ts): thirteen float32 and its two seats, all a drive() needs to carry on from, so
 * a snapshot is enough and the driver's replay is exact. Nothing is kept per wheel.
 */
export interface Rover {
  /** The body's centre at hub height: metres. */
  x: number;
  y: number;
  z: number;
  /** m/s. */
  vx: number;
  vy: number;
  vz: number;
  /** Where the nose points, as a player's yaw, radians in [0, 2π). */
  yaw: number;
  /** Nose up is positive, radians. */
  pitch: number;
  /** Right side down is positive, radians. */
  roll: number;
  /** The rates of yaw, pitch and roll, rad/s. */
  wy: number;
  wp: number;
  wr: number;
  /** The front wheels' angle, radians, positive to the right. */
  steer: number;
  /** The player ids at the wheel and beside it, or NOBODY. */
  driver: number;
  rider: number;
}

export interface Snapshot {
  /** Host tick, u16, wraps. */
  tick: number;
  players: SnapPlayer[];
  /** Captures per team, red then blue (u8). */
  score: [number, number];
  /** Whole seconds to the end of the match, or, once it is over, to the next one (15 bits). */
  clock: number;
  /** The match is over: the end screen shows until the clock runs out. */
  over: boolean;
  /** The flag of each team, red then blue. */
  flags: [FlagState, FlagState];
  /**
   * Bit n set: pack n is there to take, the health packs of WorldDef.packs first, then the ammo
   * packs of WorldDef.ammo (bit packs.length + n), then the rail cells of WorldDef.cells (after
   * both). PACK_BITS bits, past the 32 of the bitwise operators: read a bit with arithmetic.
   * Absent: none.
   */
  packs?: number;
  /** The plasma balls in flight, and those that burst since the last snapshot. Absent: none. */
  balls?: Ball[];
  /** The map's rovers, in the order of WorldDef.rovers. Absent: none. */
  rovers?: Rover[];
}

/** Room rules, set by the host. Defaults in constants.ts (RULES). */
export interface Rules {
  maxPlayers: number;
  /** Captures that end the match at once. */
  scoreLimit: number;
  /** Seconds a match lasts: the team with more captures wins, a tie is a draw. */
  timeLimit: number;
  /** The map's key in MAPS (maps.ts); an unknown one plays 'highline'. */
  map?: string;
}

/**
 * The subset of WebSocket the client relies on. A real WebSocket (with
 * binaryType 'arraybuffer') and the local BroadcastChannel socket both fit.
 */
export interface SocketLike {
  binaryType: string;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

/** Calls cb every ms milliseconds until the returned function is called. */
export type Every = (cb: () => void, ms: number) => () => void;

/** One connected peer, as the room sees it. Transport-agnostic. */
export interface Conn {
  send(data: string | ArrayBuffer): void;
}
