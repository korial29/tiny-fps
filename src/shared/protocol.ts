// Wire format.
// Text frames carry rare JSON messages (join, roster, full).
// Binary frames carry the hot path: inputs (client → host) and snapshots (host → client).
//
// Input, 11 bytes: [type u8 = MSG_INPUT][seq u16][keys u8][yaw u16][pitch i16][view u16][frac u8]
//   yaw in 65536ths of a turn, decoded in [0, 2π); pitch in 1/10000 rad; view is the host tick
//   the others were drawn at, in 1/256 tick: integer part u16, then frac u8 (0 when absent).
//   keys is a u8: KEY bits 0 to 7 (forward, back, left, right, jump, sprint, dash, crouch).
// Snapshot: [type u8 = MSG_SNAPSHOT][tick u16][count u8], then count × 39 bytes:
//   [id u8][x f32][y f32][z f32][vx f32][vy f32][vz f32][edge f32]
//   [yaw u16][pitch i16][ack u16][mode u8][t u8][dash u8][timers u8]
//   mode: bits 0-2 MODE, bits 3-5 wall (SIDE), bit 6 jumps left, bit 7 air dashes left
//   timers: bits 0-2 coyote ticks, bits 3-5 jump buffer ticks, bit 6 jump held, bit 7 dash held
//   The floats are the host's float32 state, exact (see move in physics.ts), and with the rest
//   they are all a move needs to continue from. ground comes from the mode; ev and fall (what the
//   animation reads) are not sent, they read 0.
// Every multi-byte field is big-endian (DataView's default).
import { KEY, MODE } from './types';
import type { Input, PlayerInfo, Snapshot } from './types';

export type ClientText = { t: 'join'; name: string };

export type ServerText = { t: 'roster'; you: number; players: PlayerInfo[] } | { t: 'full' };

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export const INPUT_BYTES = 11;
export const SNAP_HEAD = 4;
export const SNAP_PLAYER = 39;

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
  const v = new DataView(new ArrayBuffer(SNAP_HEAD + SNAP_PLAYER * s.players.length));
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint16(1, s.tick & 0xffff);
  v.setUint8(3, s.players.length);
  s.players.forEach((p, i) => {
    const o = SNAP_HEAD + i * SNAP_PLAYER;
    v.setUint8(o, p.id);
    v.setFloat32(o + 1, p.x);
    v.setFloat32(o + 5, p.y);
    v.setFloat32(o + 9, p.z);
    v.setFloat32(o + 13, p.vx);
    v.setFloat32(o + 17, p.vy);
    v.setFloat32(o + 21, p.vz);
    v.setFloat32(o + 25, p.edge);
    v.setUint16(o + 29, toTurn(p.yaw));
    v.setInt16(o + 31, toPitch(p.pitch));
    v.setUint16(o + 33, p.ack & 0xffff);
    v.setUint8(o + 35, (p.mode & 7) | ((p.wall & 7) << 3) | ((p.jumps & 1) << 6) | (p.dashes << 7));
    v.setUint8(o + 36, p.t);
    v.setUint8(o + 37, p.dash);
    v.setUint8(
      o + 38,
      (p.coyote & 7) |
        ((p.buffer & 7) << 3) |
        (p.held & KEY.JUMP ? 64 : 0) |
        (p.held & KEY.DASH ? 128 : 0),
    );
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
    const mode = v.getUint8(o + 35);
    const timers = v.getUint8(o + 38);
    const m = mode & 7;
    players.push({
      id: v.getUint8(o),
      x: v.getFloat32(o + 1),
      y: v.getFloat32(o + 5),
      z: v.getFloat32(o + 9),
      vx: v.getFloat32(o + 13),
      vy: v.getFloat32(o + 17),
      vz: v.getFloat32(o + 21),
      edge: v.getFloat32(o + 25),
      yaw: fromTurn(v.getUint16(o + 29)),
      pitch: fromPitch(v.getInt16(o + 31)),
      ack: v.getUint16(o + 33),
      ground: m === MODE.GROUND || m === MODE.SLIDE || m === MODE.CROUCH,
      mode: m,
      wall: (mode >> 3) & 7,
      jumps: (mode >> 6) & 1,
      dashes: mode >> 7,
      t: v.getUint8(o + 36),
      dash: v.getUint8(o + 37),
      coyote: timers & 7,
      buffer: (timers >> 3) & 7,
      held: (timers & 64 ? KEY.JUMP : 0) | (timers & 128 ? KEY.DASH : 0),
      ev: 0,
      fall: 0,
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
