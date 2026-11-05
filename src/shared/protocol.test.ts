import { describe, expect, it } from 'vitest';
import {
  INPUT_BYTES,
  MSG_INPUT,
  MSG_SNAPSHOT,
  SNAP_HEAD,
  SNAP_ITEM,
  SNAP_PLAYER,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  onWire,
  parseText,
} from './protocol';
import { ITEM, PHASE } from './types';
import type { Item, SnapPlayer, Snapshot } from './types';

const player = (id: number, over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  id,
  x: 12.3,
  y: 0.8,
  z: 31.7,
  vy: -3.21,
  yaw: 4.2,
  pitch: -0.7,
  ground: false,
  hp: 9,
  ack: 1234,
  ...over,
});

const bytes = (buf: ArrayBuffer): number[] => [...new Uint8Array(buf)];

describe('input frame', () => {
  it('is 11 bytes: type, seq, keys, yaw in turns, pitch in 1/10000 rad, view in 1/256 tick', () => {
    const buf = encodeInput({
      seq: 0x0102,
      keys: 0b110101,
      yaw: Math.PI,
      pitch: -0.5,
      view: 0x1234 + 0.5,
    });
    expect(buf.byteLength).toBe(INPUT_BYTES);
    // Half a turn is 0x8000; -0.5 rad is -5000 = 0xec78; the view is 0x1234, then 128/256.
    expect(bytes(buf)).toEqual([
      ...[MSG_INPUT, 0x01, 0x02, 0b110101, 0x80, 0x00, 0xec, 0x78],
      ...[0x12, 0x34, 0x80],
    ]);
  });

  it('encodes an absent view as 0, and round-trips the view to 1/256 tick', () => {
    const none = decodeInput(encodeInput({ seq: 1, keys: 0, yaw: 0, pitch: 0 }))!;
    expect(none.view).toBe(0);
    expect(bytes(encodeInput({ seq: 1, keys: 0, yaw: 0, pitch: 0 })).slice(8)).toEqual([0, 0, 0]);
    for (const view of [0, 1, 255.25, 1000.3333, 65535.5, 65535.99]) {
      const back = decodeInput(encodeInput({ seq: 1, keys: 0, yaw: 0, pitch: 0, view }))!.view!;
      expect(Math.abs(back - view)).toBeLessThanOrEqual(1 / 512 + 1e-9);
      expect(back).toBeGreaterThanOrEqual(0);
      expect(back).toBeLessThan(65536);
    }
    // Rounding up to 65536 wraps to 0: the tick circle.
    expect(
      decodeInput(encodeInput({ seq: 1, keys: 0, yaw: 0, pitch: 0, view: 65535.999 }))!.view,
    ).toBe(0);
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

  it('onWire gives exactly what the host reads back from the frame', () => {
    let s = 7;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 2000; k++) {
      const i = {
        seq: k,
        keys: k & 63,
        yaw: (rnd() - 0.3) * 20,
        pitch: (rnd() - 0.5) * 8,
        view: rnd() * 65535,
      };
      expect(onWire(i)).toEqual(decodeInput(encodeInput(i)));
    }
    // Idempotent: a value already on the wire stays put.
    const w = onWire({ seq: 1, keys: 2, yaw: 1.234567, pitch: 0.7654321, view: 77.77777 });
    expect(onWire(w)).toEqual(w);
    // An absent view stays absent (the host reads 0).
    expect(onWire({ seq: 1, keys: 2, yaw: 1, pitch: 0 }).view).toBeUndefined();
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
  it('has a 6-byte head, 25 bytes per player, then the items', () => {
    const buf = encodeSnapshot({
      tick: 0x1234,
      players: [
        player(7, { x: 1, y: 2, z: 3, vy: -1, yaw: Math.PI, pitch: 0.5, ground: true, hp: 6 }),
      ],
      phase: PHASE.RETURN,
      keys: 0b1010,
      items: [],
    });
    expect([SNAP_HEAD, SNAP_PLAYER]).toEqual([6, 25]);
    expect(buf.byteLength).toBe(SNAP_HEAD + SNAP_PLAYER + 1);
    expect(bytes(buf)).toEqual([
      ...[MSG_SNAPSHOT, 0x12, 0x34, 1],
      // Phase, keys.
      ...[1, 0b1010],
      7,
      // Big-endian float32: 1, 2, 3 and -1.
      ...[0x3f, 0x80, 0, 0],
      ...[0x40, 0, 0, 0],
      ...[0x40, 0x40, 0, 0],
      ...[0xbf, 0x80, 0, 0],
      0x80,
      0x00, // yaw
      0x13,
      0x88, // pitch 5000
      0x04,
      0xd2, // ack 1234
      1, // ground
      6, // hp
      0, // no items
    ]);
  });

  const f32 = Math.fround;
  const snap = (over: Partial<Snapshot>): Snapshot => ({
    tick: 0,
    players: [],
    phase: 0,
    keys: 0,
    items: [],
    ...over,
  });
  const item = (id: number, kind: number, over: Partial<Item> = {}): Item => ({
    id,
    kind,
    x: 1,
    y: 2,
    z: 3,
    ...over,
  });

  it('round-trips the phase, the keys and every health', () => {
    const back = (over: Partial<Snapshot>) => decodeSnapshot(encodeSnapshot(snap(over)))!;
    for (const [phase, keys] of [
      [PHASE.HUNT, 0],
      [PHASE.HUNT, 0b1110],
      [PHASE.RETURN, 0b0010],
      [PHASE.RETURN, 255],
    ] as const) {
      const s = back({ phase, keys });
      expect([s.phase, s.keys]).toEqual([phase, keys]);
    }
    const hp = back({ players: [0, 1, 5, 9].map((h, i) => player(i, { hp: h })) }).players;
    expect(hp.map(p => p.hp)).toEqual([0, 1, 5, 9]);
  });

  it('keeps the ground bit in the flags', () => {
    const round = (ground: boolean) => {
      const buf = encodeSnapshot({
        tick: 0,
        players: [player(1, { ground })],
        phase: 0,
        keys: 0,
        items: [],
      });
      return [bytes(buf)[SNAP_HEAD + 23], decodeSnapshot(buf)!.players[0].ground];
    };
    expect(round(false)).toEqual([0, false]);
    expect(round(true)).toEqual([1, true]);
  });

  it('lays out items after the players: 14 bytes each', () => {
    const buf = encodeSnapshot(
      snap({
        items: [item(3, ITEM.KEY_BLUE, { x: 1.5, y: -2.25, z: 30.125 }), item(255, ITEM.HEALTH)],
      }),
    );
    expect(SNAP_ITEM).toBe(14);
    expect(buf.byteLength).toBe(SNAP_HEAD + 1 + 2 * SNAP_ITEM);
    expect(bytes(buf).slice(SNAP_HEAD)).toEqual([
      2,
      // Id 3, kind KEY_BLUE, x 1.5, y -2.25, z 30.125.
      ...[3, ITEM.KEY_BLUE, 0x3f, 0xc0, 0, 0, 0xc0, 0x10, 0, 0, 0x41, 0xf1, 0x00, 0],
      // Id 255, kind HEALTH, x 1, y 2, z 3.
      ...[255, ITEM.HEALTH, 0x3f, 0x80, 0, 0, 0x40, 0, 0, 0, 0x40, 0x40, 0, 0],
    ]);
  });

  it('round-trips items, float32 exact, in order', () => {
    const items = [
      item(0, ITEM.HEALTH, { x: f32(0.1), y: f32(2.6), z: f32(-3.3) }),
      item(1, ITEM.KEY_RED),
      item(2, ITEM.KEY_YELLOW, { x: -0.5 }),
    ];
    const back = decodeSnapshot(encodeSnapshot(snap({ players: [player(1)], items })))!;
    expect(back.items).toEqual(items);
    expect(decodeSnapshot(encodeSnapshot(snap({})))!.items).toEqual([]);
  });

  it('rejects a frame cut or padded in the item section, or counted wrong', () => {
    const ok = encodeSnapshot(snap({ players: [player(1)], items: [item(1, ITEM.KEY_RED)] }));
    expect(decodeSnapshot(ok)).not.toBeNull();
    for (let cut = 1; cut <= SNAP_ITEM; cut++) {
      expect(decodeSnapshot(ok.slice(0, ok.byteLength - cut))).toBeNull();
    }
    expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
    // The count byte, set to a number the bytes do not hold.
    for (const n of [0, 2, 255]) {
      const bad = new Uint8Array(ok.slice(0));
      bad[SNAP_HEAD + SNAP_PLAYER] = n;
      expect(decodeSnapshot(bad.buffer)).toBeNull();
    }
  });

  it('round-trips the float32 state exactly, and yaw, pitch within the wire', () => {
    const f = Math.fround;
    const players = [
      player(0, { x: f(12.3), y: f(0.8), z: f(31.7), vy: f(-3.21) }),
      player(3, {
        x: f(12.3),
        y: f(0.8),
        z: f(31.7),
        ground: true,
        vy: 0,
        ack: 65535,
        yaw: 0,
        pitch: 1.55,
      }),
      player(255, { x: 0, y: -2.5, z: 300.125, vy: f(9.99) }),
    ];
    const back = decodeSnapshot(
      encodeSnapshot({
        tick: 70000,
        players,
        phase: 0,
        keys: 0,
        items: [],
      }),
    )!;
    expect(back.tick).toBe(70000 & 0xffff);
    expect(back.players).toHaveLength(3);
    back.players.forEach((b, i) => {
      const p = players[i];
      expect([b.id, b.ground, b.ack]).toEqual([p.id, p.ground, p.ack]);
      // Exact, not close: the predictor resets to these values.
      expect([b.x, b.y, b.z, b.vy]).toEqual([p.x, p.y, p.z, p.vy]);
      expect(Math.abs(b.yaw - p.yaw)).toBeLessThanOrEqual(Math.PI / 65536 + 1e-12);
      expect(Math.abs(b.pitch - p.pitch)).toBeLessThanOrEqual(0.00005 + 1e-12);
    });
  });

  it('rounds a float64 value to the nearest float32, not further', () => {
    const [p] = decodeSnapshot(
      encodeSnapshot({
        tick: 0,
        players: [player(1, { x: 1 / 3, z: -1e-3, vy: 1e9 })],
        phase: 0,
        keys: 0,
        items: [],
      }),
    )!.players;
    expect(p.x).toBe(Math.fround(1 / 3));
    expect(p.z).toBe(Math.fround(-1e-3));
    expect(p.vy).toBe(Math.fround(1e9));
  });

  it('takes an empty snapshot', () => {
    expect(
      decodeSnapshot(
        encodeSnapshot({
          tick: 5,
          players: [],
          phase: 0,
          keys: 0,
          items: [],
        }),
      ),
    ).toEqual({
      tick: 5,
      players: [],
      phase: 0,
      keys: 0,
      items: [],
    });
  });

  it('rejects a wrong type, a truncated or a padded frame, and a wrong count', () => {
    const ok = encodeSnapshot({
      tick: 1,
      players: [player(1), player(2)],
      phase: 0,
      keys: 0,
      items: [],
    });
    expect(decodeSnapshot(ok)).not.toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(0))).toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(SNAP_HEAD - 1))).toBeNull();
    expect(decodeSnapshot(ok.slice(0, ok.byteLength - 1))).toBeNull();
    expect(decodeSnapshot(ok.slice(0, SNAP_HEAD + SNAP_PLAYER))).toBeNull();
    // No item count at all: the frame stops after the players.
    expect(decodeSnapshot(ok.slice(0, SNAP_HEAD + SNAP_PLAYER * 2))).toBeNull();
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
    expect(
      decodeInput(
        encodeSnapshot({
          tick: 0,
          players: [],
          phase: 0,
          keys: 0,
          items: [],
        }),
      ),
    ).toBeNull();
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
