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
import { SCALE, VY_SCALE } from './constants';
import type { Input, PlayerInfo, Snapshot } from './types';

export type ClientText = { t: 'join'; name: string };

export type ServerText = { t: 'roster'; you: number; players: PlayerInfo[] } | { t: 'full' };

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export const INPUT_BYTES = 8;
export const SNAP_HEAD = 4;
export const SNAP_PLAYER = 16;

const toWire = (v: number): number => Math.max(0, Math.min(65535, Math.round(v * SCALE)));
const fromWire = (v: number): number => v / SCALE;
const TURN = 65536 / (2 * Math.PI);
/** Radians to 65536ths of a turn; the mask also folds negative and ≥ 2π angles into one turn. */
const toTurn = (yaw: number): number => Math.round(yaw * TURN) & 0xffff;
const clamp16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));

export const encodeInput = (i: Input): ArrayBuffer => {
  const v = new DataView(new ArrayBuffer(INPUT_BYTES));
  v.setUint8(0, MSG_INPUT);
  v.setUint16(1, i.seq & 0xffff);
  v.setUint8(3, i.keys & 0xff);
  v.setUint16(4, toTurn(i.yaw));
  v.setInt16(6, clamp16(i.pitch * 10000));
  return v.buffer;
};

/** Null on anything that is not a well-formed input frame. */
export const decodeInput = (buf: ArrayBuffer): Input | null => {
  if (buf.byteLength !== INPUT_BYTES) {
    return null;
  }
  const v = new DataView(buf);
  if (v.getUint8(0) !== MSG_INPUT) {
    return null;
  }
  return {
    seq: v.getUint16(1),
    keys: v.getUint8(3),
    yaw: v.getUint16(4) / TURN,
    pitch: v.getInt16(6) / 10000,
  };
};

export const encodeSnapshot = (s: Snapshot): ArrayBuffer => {
  const v = new DataView(new ArrayBuffer(SNAP_HEAD + SNAP_PLAYER * s.players.length));
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint16(1, s.tick & 0xffff);
  v.setUint8(3, s.players.length);
  s.players.forEach((p, i) => {
    const o = SNAP_HEAD + i * SNAP_PLAYER;
    v.setUint8(o, p.id);
    v.setUint16(o + 1, toWire(p.x));
    v.setUint16(o + 3, toWire(p.y));
    v.setUint16(o + 5, toWire(p.z));
    v.setInt16(o + 7, clamp16(p.vy * VY_SCALE));
    v.setUint16(o + 9, toTurn(p.yaw));
    v.setInt16(o + 11, clamp16(p.pitch * 10000));
    v.setUint16(o + 13, p.ack & 0xffff);
    v.setUint8(o + 15, +p.ground);
  });
  return v.buffer;
};

/** Null on anything that is not a well-formed snapshot frame. */
export const decodeSnapshot = (buf: ArrayBuffer): Snapshot | null => {
  if (buf.byteLength < SNAP_HEAD) {
    return null;
  }
  const v = new DataView(buf);
  const count = v.getUint8(3);
  if (v.getUint8(0) !== MSG_SNAPSHOT || buf.byteLength !== SNAP_HEAD + SNAP_PLAYER * count) {
    return null;
  }
  const players = [];
  for (let i = 0; i < count; i++) {
    const o = SNAP_HEAD + i * SNAP_PLAYER;
    players.push({
      id: v.getUint8(o),
      x: fromWire(v.getUint16(o + 1)),
      y: fromWire(v.getUint16(o + 3)),
      z: fromWire(v.getUint16(o + 5)),
      vy: v.getInt16(o + 7) / VY_SCALE,
      yaw: v.getUint16(o + 9) / TURN,
      pitch: v.getInt16(o + 11) / 10000,
      ack: v.getUint16(o + 13),
      ground: (v.getUint8(o + 15) & 1) === 1,
    });
  }
  return { tick: v.getUint16(1), players };
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
