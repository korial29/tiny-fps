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
  /** Hold to fire the gun: one shot every GUN_COOLDOWN ticks while there is ammo. */
  FIRE: 256,
} as const;

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
  /** KEY.JUMP and KEY.DASH as held in the last step, to tell a press from a hold. */
  held: number;
  /** Health, 0 to HP_MAX. */
  hp: number;
  /** Shots left in the gun; -1 without the gun (taken at the team's rack, lost on death). */
  ammo: number;
  /** Ticks to the next shot. */
  cool: number;
  /** Standing inside the circle of the team's rack as of the last step: the gun is filled on arrival only. Absent reads false. */
  rack?: boolean;
  /** Ticks left lying down after the health ran out; at 0 the player is back at a spawn. 0 when up. */
  down: number;
  /** Shots fired and hits landed, u8 counters that wrap: the clients draw a beam and play the hit sound on each change. */
  shots: number;
  hits: number;
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
} as const;

/** One player in a snapshot: the state (its ev and fall read 0) and the ack. */
export interface SnapPlayer extends PlayerState {
  /** Seq of the last input of this player the host applied: the client replays the ones after. */
  ack: number;
  /** While `stun` runs: the id of the player who tackled this one (4 bits), else 0. Not part of the movement. */
  by: number;
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
   * packs of WorldDef.ammo (bit packs.length + n). Absent: none.
   */
  packs?: number;
}

/** Room rules, set by the host. Defaults in constants.ts (RULES). */
export interface Rules {
  maxPlayers: number;
  /** Captures that end the match at once. */
  scoreLimit: number;
  /** Seconds a match lasts: the team with more captures wins, a tie is a draw. */
  timeLimit: number;
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
