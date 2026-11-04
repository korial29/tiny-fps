export interface PlayerInfo {
  id: number;
  name: string;
  /** CSS colour, unique within the room. */
  color: string;
}

/** Bits of Input.keys. Keys are read by KeyboardEvent.code, so WASD is ZQSD on AZERTY. */
export const KEY = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
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
}

export interface PlayerState {
  id: number;
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  /** Vertical speed, m/s. */
  vy: number;
  yaw: number;
  pitch: number;
  /** Standing on the floor or on a box: a jump is allowed. */
  ground: boolean;
}

/** Axis-aligned solid box, in metres. */
export interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** CSS colour for the renderer; physics ignores it. */
  color?: string;
}

export interface MapDef {
  /** Floor extent: x in [0, w], z in [0, d], floor at y 0. The outer walls are boxes. */
  w: number;
  d: number;
  boxes: Box[];
  /** Spawn points: feet x, z and the yaw to face. */
  spawns: [x: number, z: number, yaw: number][];
}

/** One player in a snapshot. */
export interface SnapPlayer {
  id: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  pitch: number;
  ground: boolean;
  /** Seq of the last input of this player the host applied: the client replays the ones after. */
  ack: number;
}

export interface Snapshot {
  /** Host tick, u16, wraps. */
  tick: number;
  players: SnapPlayer[];
}

/** Room rules, set by the host. Defaults in constants.ts (RULES). */
export interface Rules {
  maxPlayers: number;
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
