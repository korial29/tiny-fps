// Wire format.
// Text frames carry rare JSON messages (join, roster, full).
// Binary frames carry the hot path: inputs (client → host) and snapshots (host → client).
//
// Input, 8 bytes: [type u8 = MSG_INPUT][seq u16][keys u8][yaw u16][pitch i16]
//   yaw in 65536ths of a turn, decoded in [0, 2π); pitch in 1/10000 rad.
// Snapshot: [type u8 = MSG_SNAPSHOT][tick u16][count u8] then count × 16 bytes:
//   [id u8][x u16][y u16][z u16][vy i16][yaw u16][pitch i16][ack u16][flags u8, bit 0 = ground]
//   x, y, z fixed point (SCALE), clamped to [0, 65535]; vy × VY_SCALE, clamped to the Int16.
// Every multi-byte field is big-endian (DataView's default).
import type { Input, PlayerInfo, Snapshot } from './types';

export type ClientText = { t: 'join'; name: string };

export type ServerText = { t: 'roster'; you: number; players: PlayerInfo[] } | { t: 'full' };

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export const INPUT_BYTES = 8;
export const SNAP_HEAD = 4;
export const SNAP_PLAYER = 16;

export const encodeInput = (_i: Input): ArrayBuffer => {
  throw new Error('todo');
};

/** Null on anything that is not a well-formed input frame. */
export const decodeInput = (_buf: ArrayBuffer): Input | null => {
  throw new Error('todo');
};

export const encodeSnapshot = (_s: Snapshot): ArrayBuffer => {
  throw new Error('todo');
};

/** Null on anything that is not a well-formed snapshot frame. */
export const decodeSnapshot = (_buf: ArrayBuffer): Snapshot | null => {
  throw new Error('todo');
};

/** Returns null on anything that is not a known text message. */
export const parseText = <T extends ClientText | ServerText>(raw: string): T | null => {
  try {
    const msg = JSON.parse(raw);
    return msg && typeof msg.t === 'string' ? msg : null;
  } catch {
    return null;
  }
};
