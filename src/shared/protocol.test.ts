import { describe, expect, it } from 'vitest';
import { SCALE } from './constants';
import {
  INPUT_BYTES,
  MSG_INPUT,
  MSG_SNAPSHOT,
  SNAP_HEAD,
  SNAP_PLAYER,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  parseText,
} from './protocol';
import type { SnapPlayer } from './types';

const player = (id: number, over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  id,
  x: 12.3,
  y: 0.8,
  z: 31.7,
  vy: -3.21,
  yaw: 4.2,
  pitch: -0.7,
  ground: false,
  ack: 1234,
  ...over,
});

const bytes = (buf: ArrayBuffer): number[] => [...new Uint8Array(buf)];

describe('input frame', () => {
  it('is 8 bytes: type, seq, keys, yaw in 65536ths of a turn, pitch in 1/10000 rad', () => {
    const buf = encodeInput({ seq: 0x0102, keys: 0b10101, yaw: Math.PI, pitch: -0.5 });
    expect(buf.byteLength).toBe(INPUT_BYTES);
    // Half a turn is 0x8000; -0.5 rad is -5000 = 0xec78.
    expect(bytes(buf)).toEqual([MSG_INPUT, 0x01, 0x02, 0b10101, 0x80, 0x00, 0xec, 0x78]);
  });

  it('round-trips within the fixed point', () => {
    for (const yaw of [0, 0.001, 1, Math.PI, 5, 6.28]) {
      const back = decodeInput(encodeInput({ seq: 65535, keys: 31, yaw, pitch: 1.55 }))!;
      expect(back.seq).toBe(65535);
      expect(back.keys).toBe(31);
      expect(Math.abs(back.yaw - yaw)).toBeLessThanOrEqual(Math.PI / 65536 + 1e-12);
      expect(back.pitch).toBeCloseTo(1.55, 4);
    }
  });

  it('folds yaw into [0, 2π), negative ones included', () => {
    for (const yaw of [-0.5, -7, 2 * Math.PI, 9, -1e-9]) {
      const back = decodeInput(encodeInput({ seq: 0, keys: 0, yaw, pitch: 0 }))!;
      expect(back.yaw).toBeGreaterThanOrEqual(0);
      expect(back.yaw).toBeLessThan(2 * Math.PI);
      const turns = (back.yaw - yaw) / (2 * Math.PI);
      expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-4);
    }
  });

  it('wraps seq at 65536 and clamps pitch to the Int16', () => {
    expect(decodeInput(encodeInput({ seq: 65536 + 5, keys: 0, yaw: 0, pitch: 0 }))!.seq).toBe(5);
    expect(decodeInput(encodeInput({ seq: 0, keys: 0, yaw: 0, pitch: 99 }))!.pitch).toBeCloseTo(
      3.2767,
    );
    expect(decodeInput(encodeInput({ seq: 0, keys: 0, yaw: 0, pitch: -99 }))!.pitch).toBeCloseTo(
      -3.2768,
    );
  });

  it('rejects a wrong length or type', () => {
    const ok = encodeInput({ seq: 1, keys: 1, yaw: 1, pitch: 1 });
    expect(decodeInput(ok)).not.toBeNull();
    expect(decodeInput(new ArrayBuffer(0))).toBeNull();
    expect(decodeInput(ok.slice(0, INPUT_BYTES - 1))).toBeNull();
    expect(decodeInput(new ArrayBuffer(INPUT_BYTES + 1))).toBeNull();
    const bad = new Uint8Array(ok.slice(0));
    bad[0] = MSG_SNAPSHOT;
    expect(decodeInput(bad.buffer)).toBeNull();
    bad[0] = 0;
    expect(decodeInput(bad.buffer)).toBeNull();
  });
});

describe('snapshot frame', () => {
  it('has a 4-byte head and 16 bytes per player', () => {
    const buf = encodeSnapshot({
      tick: 0x1234,
      players: [player(7, { x: 1, y: 2, z: 3, vy: -1, yaw: Math.PI, pitch: 0.5, ground: true })],
    });
    expect(buf.byteLength).toBe(SNAP_HEAD + SNAP_PLAYER);
    expect(bytes(buf)).toEqual([
      MSG_SNAPSHOT,
      0x12,
      0x34,
      1,
      7,
      ...[1, 2, 3].flatMap(v => [(v * SCALE) >> 8, (v * SCALE) & 255]),
      0xff,
      0x9c, // vy -1 m/s = -100
      0x80,
      0x00, // yaw
      0x13,
      0x88, // pitch 5000
      0x04,
      0xd2, // ack 1234
      1,
    ]);
  });

  it('round-trips several players within the fixed point', () => {
    const players = [
      player(0),
      player(3, { ground: true, vy: 0, ack: 65535, yaw: 0, pitch: 1.55 }),
      player(255, { x: 0, y: 0, z: 127, vy: 9.99 }),
    ];
    const back = decodeSnapshot(encodeSnapshot({ tick: 70000, players }))!;
    expect(back.tick).toBe(70000 & 0xffff);
    expect(back.players).toHaveLength(3);
    back.players.forEach((b, i) => {
      const p = players[i];
      expect([b.id, b.ground, b.ack]).toEqual([p.id, p.ground, p.ack]);
      expect(Math.abs(b.x - p.x)).toBeLessThanOrEqual(0.5 / SCALE + 1e-12);
      expect(Math.abs(b.y - p.y)).toBeLessThanOrEqual(0.5 / SCALE + 1e-12);
      expect(Math.abs(b.z - p.z)).toBeLessThanOrEqual(0.5 / SCALE + 1e-12);
      expect(Math.abs(b.vy - p.vy)).toBeLessThanOrEqual(0.005 + 1e-12);
      expect(Math.abs(b.yaw - p.yaw)).toBeLessThanOrEqual(Math.PI / 65536 + 1e-12);
      expect(Math.abs(b.pitch - p.pitch)).toBeLessThanOrEqual(0.00005 + 1e-12);
    });
  });

  it('clamps out-of-range values instead of wrapping them', () => {
    const [p] = decodeSnapshot(
      encodeSnapshot({ tick: 0, players: [player(1, { x: -3, y: 500, z: 128, vy: -9999 })] }),
    )!.players;
    expect(p.x).toBe(0);
    expect(p.y).toBe(65535 / SCALE);
    expect(p.z).toBe(65535 / SCALE);
    expect(p.vy).toBe(-327.68);
  });

  it('takes an empty snapshot', () => {
    expect(decodeSnapshot(encodeSnapshot({ tick: 5, players: [] }))).toEqual({
      tick: 5,
      players: [],
    });
  });

  it('rejects a wrong type, a truncated or a padded frame, and a wrong count', () => {
    const ok = encodeSnapshot({ tick: 1, players: [player(1), player(2)] });
    expect(decodeSnapshot(ok)).not.toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(0))).toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(SNAP_HEAD - 1))).toBeNull();
    expect(decodeSnapshot(ok.slice(0, ok.byteLength - 1))).toBeNull();
    expect(decodeSnapshot(ok.slice(0, SNAP_HEAD + SNAP_PLAYER))).toBeNull();
    expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
    const bad = new Uint8Array(ok.slice(0));
    bad[0] = MSG_INPUT;
    expect(decodeSnapshot(bad.buffer)).toBeNull();
    bad[0] = MSG_SNAPSHOT;
    bad[3] = 3;
    expect(decodeSnapshot(bad.buffer)).toBeNull();
  });

  it('does not take an input frame for a snapshot, nor the reverse', () => {
    expect(decodeSnapshot(encodeInput({ seq: 0, keys: 0, yaw: 0, pitch: 0 }))).toBeNull();
    expect(decodeInput(encodeSnapshot({ tick: 0, players: [] }))).toBeNull();
  });
});

describe('parseText', () => {
  it('parses a typed message and rejects the rest', () => {
    expect(parseText('{"t":"join","name":"a"}')).toEqual({ t: 'join', name: 'a' });
    expect(parseText('nope')).toBeNull();
    expect(parseText('null')).toBeNull();
    expect(parseText('{"t":1}')).toBeNull();
  });
});
