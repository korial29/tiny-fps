// Wire format.
// Text frames carry rare JSON messages (join, roster, full).
// Binary frames carry the hot path: inputs (client → host) and snapshots (host → client).
//
// Input, 11 bytes: [type u8 = MSG_INPUT][seq u16][keys u8][yaw u16][pitch i16][view u16][frac u8]
//   yaw in 65536ths of a turn, decoded in [0, 2π); pitch in 1/10000 rad; view is the host tick
//   the others were drawn at, in 1/256 tick: integer part u16, then frac u8 (0 when absent).
// Snapshot: [type u8 = MSG_SNAPSHOT][tick u16][count u8][flags u8][keys u8]
//   flags: bit 0 = phase (0 hunt, 1 return); keys: the team's key bits (1 << ITEM.KEY_*)
//   then count × 25 bytes:
//   [id u8][x f32][y f32][z f32][vy f32][yaw u16][pitch i16][ack u16][flags u8][hp u8]
//   flags: bit 0 = ground, bits 1-7 = cool (the chaingun cooldown, in steps)
//   x, y, z, vy are the host's float32 state, exact (see move in physics.ts).
//   then [shots u8] and shots × 14 bytes: [id u8][x f32][y f32][z f32][hit u8, 255 = nobody]
//   then [items u8] and items × 14 bytes: [id u8][kind u8][x f32][y f32][z f32]
// Every multi-byte field is big-endian (DataView's default).
import type { Input, PlayerInfo, Snapshot } from './types';

export type ClientText = { t: 'join'; name: string };

export type ServerText = { t: 'roster'; you: number; players: PlayerInfo[] } | { t: 'full' };

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export const INPUT_BYTES = 11;
export const SNAP_HEAD = 6;
export const SNAP_PLAYER = 25;
export const SNAP_SHOT = 14;
export const SNAP_ITEM = 14;

const TURN = 65536 / (2 * Math.PI);
/** Radians to 65536ths of a turn; the mask also folds negative and ≥ 2π angles into one turn. */
const toTurn = (yaw: number): number => Math.round(yaw * TURN) & 0xffff;
const clamp16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));
/** Pitch in 1/10000 rad, and back. */
const toPitch = (pitch: number): number => clamp16(pitch * 10000);
const fromPitch = (w: number): number => w / 10000;
const fromTurn = (w: number): number => w / TURN;
/** A view tick in 1/256 tick, modulo the u16 tick circle (24 bits); absent is 0. */
const toView = (view = 0): number => Math.round(view * 256) & 0xffffff;

/**
 * The input as the host will read it after encodeInput and decodeInput: yaw, pitch and view
 * rounded to the wire (an absent view stays absent here, and reads 0 on the host). The client
 * predicts with this, so both sides move with the same values.
 */
export const onWire = (i: Input): Input => ({
  ...i,
  yaw: fromTurn(toTurn(i.yaw)),
  pitch: fromPitch(toPitch(i.pitch)),
  ...(i.view !== undefined && { view: toView(i.view) / 256 }),
});

export const encodeInput = (i: Input): ArrayBuffer => {
  const v = new DataView(new ArrayBuffer(INPUT_BYTES));
  v.setUint8(0, MSG_INPUT);
  v.setUint16(1, i.seq & 0xffff);
  v.setUint8(3, i.keys & 0xff);
  v.setUint16(4, toTurn(i.yaw));
  v.setInt16(6, toPitch(i.pitch));
  const view = toView(i.view);
  v.setUint16(8, view >> 8);
  v.setUint8(10, view & 0xff);
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
    yaw: fromTurn(v.getUint16(4)),
    pitch: fromPitch(v.getInt16(6)),
    view: (v.getUint16(8) * 256 + v.getUint8(10)) / 256,
  };
};

export const encodeSnapshot = (s: Snapshot): ArrayBuffer => {
  const shots = SNAP_HEAD + SNAP_PLAYER * s.players.length;
  const items = shots + 1 + SNAP_SHOT * s.shots.length;
  const v = new DataView(new ArrayBuffer(items + 1 + SNAP_ITEM * s.items.length));
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint16(1, s.tick & 0xffff);
  v.setUint8(3, s.players.length);
  v.setUint8(4, s.phase & 1);
  v.setUint8(5, s.keys);
  s.players.forEach((p, i) => {
    const o = SNAP_HEAD + i * SNAP_PLAYER;
    v.setUint8(o, p.id);
    v.setFloat32(o + 1, p.x);
    v.setFloat32(o + 5, p.y);
    v.setFloat32(o + 9, p.z);
    v.setFloat32(o + 13, p.vy);
    v.setUint16(o + 17, toTurn(p.yaw));
    v.setInt16(o + 19, toPitch(p.pitch));
    v.setUint16(o + 21, p.ack & 0xffff);
    v.setUint8(o + 23, +p.ground | (p.cool << 1));
    v.setUint8(o + 24, p.hp);
  });
  v.setUint8(shots, s.shots.length);
  s.shots.forEach((h, i) => {
    const o = shots + 1 + i * SNAP_SHOT;
    v.setUint8(o, h.id);
    v.setFloat32(o + 1, h.x);
    v.setFloat32(o + 5, h.y);
    v.setFloat32(o + 9, h.z);
    v.setUint8(o + 13, h.hit & 0xff);
  });
  v.setUint8(items, s.items.length);
  s.items.forEach((t, i) => {
    const o = items + 1 + i * SNAP_ITEM;
    v.setUint8(o, t.id);
    v.setUint8(o + 1, t.kind);
    v.setFloat32(o + 2, t.x);
    v.setFloat32(o + 6, t.y);
    v.setFloat32(o + 10, t.z);
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
  if (v.getUint8(0) !== MSG_SNAPSHOT) {
    return null;
  }
  // Start of each section: its u8 count, then count records. Null when the frame ends early.
  let at = SNAP_HEAD + SNAP_PLAYER * count;
  const section = (size: number): [start: number, n: number] | null => {
    if (buf.byteLength <= at) {
      return null;
    }
    const n = v.getUint8(at);
    const start = at + 1;
    at = start + size * n;
    return [start, n];
  };
  const [shots, items] = [SNAP_SHOT, SNAP_ITEM].map(section);
  if (!shots || !items || buf.byteLength !== at) {
    return null;
  }
  const each = <T>([start, n]: [number, number], size: number, f: (o: number) => T): T[] =>
    Array.from({ length: n }, (_, i) => f(start + i * size));
  const players = [];
  for (let i = 0; i < count; i++) {
    const o = SNAP_HEAD + i * SNAP_PLAYER;
    players.push({
      id: v.getUint8(o),
      x: v.getFloat32(o + 1),
      y: v.getFloat32(o + 5),
      z: v.getFloat32(o + 9),
      vy: v.getFloat32(o + 13),
      yaw: fromTurn(v.getUint16(o + 17)),
      pitch: fromPitch(v.getInt16(o + 19)),
      ack: v.getUint16(o + 21),
      cool: v.getUint8(o + 23) >> 1,
      ground: (v.getUint8(o + 23) & 1) === 1,
      hp: v.getUint8(o + 24),
    });
  }
  return {
    tick: v.getUint16(1),
    players,
    shots: each(shots, SNAP_SHOT, o => ({
      id: v.getUint8(o),
      x: v.getFloat32(o + 1),
      y: v.getFloat32(o + 5),
      z: v.getFloat32(o + 9),
      hit: v.getUint8(o + 13) === 255 ? -1 : v.getUint8(o + 13),
    })),
    phase: v.getUint8(4) & 1,
    keys: v.getUint8(5),
    items: each(items, SNAP_ITEM, o => ({
      id: v.getUint8(o),
      kind: v.getUint8(o + 1),
      x: v.getFloat32(o + 2),
      y: v.getFloat32(o + 6),
      z: v.getFloat32(o + 10),
    })),
  };
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
