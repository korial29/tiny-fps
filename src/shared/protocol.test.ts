import { describe, expect, it } from 'vitest';
import {
  INPUT_BYTES,
  MSG_INPUT,
  MSG_SNAPSHOT,
  SNAP_HEAD,
  SNAP_MATCH,
  SNAP_PLAYER,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  onWire,
  parseText,
} from './protocol';
import type { ServerText } from './protocol';
import {
  AIR_JUMPS,
  COYOTE_TICKS,
  DASH_COOLDOWN,
  JUMP_BUFFER_TICKS,
  SLIDE_TICKS,
} from './constants';
import { STILL } from './physics';
import { FLAG, KEY, MODE, SIDE } from './types';
import type { FlagState, SnapPlayer, Snapshot } from './types';
import { IDLE } from '../../test/teams';

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
  ...STILL,
  mode: MODE.AIR,
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
      const back = decodeInput(encodeInput({ seq: 65535, keys: 255, yaw, pitch: 1.55 }))!;
      expect(back.seq).toBe(65535);
      expect(back.keys).toBe(255);
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
        keys: k & 255,
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
  it('has a 4-byte head, 39 bytes per player, then the match: 4 bytes and a byte per flag at home', () => {
    const buf = encodeSnapshot({
      tick: 0x1234,
      players: [
        player(7, {
          x: 1,
          y: 2,
          z: 3,
          vx: -2,
          vy: -1,
          vz: 0.5,
          edge: 12.5,
          yaw: Math.PI,
          pitch: 0.5,
          mode: MODE.WALLRUN,
          wall: SIDE.WEST,
          jumps: 1,
          dashes: 0,
          t: 200,
          dash: 33,
          coyote: 5,
          buffer: 3,
          held: KEY.JUMP,
          // What the animation reads is not sent.
          ev: 0xffff,
          fall: 9,
        }),
      ],
      ...IDLE,
    });
    expect([SNAP_HEAD, SNAP_PLAYER, SNAP_MATCH]).toEqual([4, 39, 4]);
    expect(buf.byteLength).toBe(SNAP_HEAD + SNAP_PLAYER + SNAP_MATCH + 2);
    expect(bytes(buf)).toEqual([
      ...[MSG_SNAPSHOT, 0x12, 0x34, 1],
      7,
      // Big-endian float32: 1, 2, 3, then vx -2, vy -1, vz 0.5 and the edge 12.5.
      ...[0x3f, 0x80, 0, 0],
      ...[0x40, 0, 0, 0],
      ...[0x40, 0x40, 0, 0],
      ...[0xc0, 0, 0, 0],
      ...[0xbf, 0x80, 0, 0],
      ...[0x3f, 0, 0, 0],
      ...[0x41, 0x48, 0, 0],
      0x80,
      0x00, // yaw
      0x13,
      0x88, // pitch 5000
      0x04,
      0xd2, // ack 1234
      0b01010010, // mode 2, wall 2 << 3, jumps 1 << 6, no air dash
      200, // t
      33, // dash
      0b01011101, // coyote 5, buffer 3 << 3, jump held << 6
      ...[0, 0, 0x01, 0xe0], // red 0, blue 0, clock 480 s, not over
      ...[0, 0], // both flags at home
    ]);
  });

  describe('the match and the flags', () => {
    const match = (over: Partial<Snapshot> = {}): Snapshot => ({
      tick: 9,
      players: [],
      ...IDLE,
      ...over,
    });
    const flag = (f: Partial<FlagState>): FlagState => ({ ...IDLE.flags[0], ...f });
    const trip = (m: Snapshot): Snapshot => decodeSnapshot(encodeSnapshot(m))!;

    it('writes the captures, the clock with the over bit, and a flag by its state', () => {
      const buf = encodeSnapshot(
        match({
          score: [2, 3],
          clock: 0x123,
          over: true,
          flags: [
            flag({ state: FLAG.CARRIED, by: 5 }),
            flag({ state: FLAG.DROPPED, x: 1.5, y: -2, z: 100.0625, left: 7 }),
          ],
        }),
      );
      expect(bytes(buf).slice(SNAP_HEAD)).toEqual([
        ...[2, 3, 0x81, 0x23],
        ...[FLAG.CARRIED, 5],
        ...[FLAG.DROPPED, 0, 24, 0xff, 0xe0, 0x06, 0x41, 7],
      ]);
    });

    it('is 6 bytes over the players with both flags home, 16 with both dropped', () => {
      expect(encodeSnapshot(match()).byteLength).toBe(SNAP_HEAD + SNAP_MATCH + 2);
      const lying = flag({ state: FLAG.DROPPED, x: 1, y: 2, z: 3, left: 4 });
      expect(encodeSnapshot(match({ flags: [lying, lying] })).byteLength).toBe(
        SNAP_HEAD + SNAP_MATCH + 16,
      );
    });

    it('round-trips every state, the score, the clock and the over bit', () => {
      const states = [
        flag({}),
        flag({ state: FLAG.CARRIED, by: 255 }),
        flag({ state: FLAG.DROPPED, x: -12.3125, y: 14.5, z: 76.0625, left: 10 }),
      ];
      for (const a of states) {
        for (const b of states) {
          for (const over of [false, true]) {
            const m = match({ score: [3, 255], clock: over ? 10 : 32767, over, flags: [a, b] });
            expect(trip(m)).toEqual(m);
          }
        }
      }
    });

    it('rounds a lying flag to 1/16 m and clamps it to the i16 range and its timer to a byte', () => {
      const { flags } = trip(
        match({
          flags: [
            flag({ state: FLAG.DROPPED, x: 1 / 3, y: 5000, z: -5000, left: 300 }),
            flag({ state: FLAG.DROPPED, x: 0.04, left: 3 }),
          ],
        }),
      );
      expect(flags[0].x).toBeCloseTo(1 / 3, 1);
      expect(Math.abs(flags[0].x - 1 / 3)).toBeLessThanOrEqual(1 / 32);
      expect([flags[0].y, flags[0].z, flags[0].left]).toEqual([32767 / 16, -2048, 255]);
      expect(flags[1].x).toBe(0.0625);
    });

    it('rejects a frame cut in a flag, with a flag of no known state, or padded', () => {
      const ok = encodeSnapshot(
        match({ flags: [flag({ state: FLAG.DROPPED, left: 1 }), flag({ state: FLAG.CARRIED })] }),
      );
      expect(decodeSnapshot(ok)).not.toBeNull();
      for (let n = SNAP_HEAD; n < ok.byteLength; n++) {
        expect(decodeSnapshot(ok.slice(0, n)), `cut at ${n}`).toBeNull();
      }
      expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
      const bad = new Uint8Array(ok.slice(0));
      bad[SNAP_HEAD + SNAP_MATCH] = 3;
      expect(decodeSnapshot(bad.buffer)).toBeNull();
    });
  });

  it('derives ground from the mode: ground, slide and crouch stand on a floor', () => {
    for (const mode of Object.values(MODE)) {
      const buf = encodeSnapshot({
        tick: 0,
        players: [player(1, { mode, ground: false })],
        ...IDLE,
      });
      const stands = mode === MODE.GROUND || mode === MODE.SLIDE || mode === MODE.CROUCH;
      expect([mode, decodeSnapshot(buf)!.players[0].ground]).toEqual([mode, stands]);
    }
  });

  it('round-trips every movement field, and reads the animation fields as 0', () => {
    const f = Math.fround;
    let n = 0;
    for (const mode of Object.values(MODE)) {
      for (const wall of Object.values(SIDE)) {
        const p = player(n % 256, {
          mode,
          wall,
          jumps: n & 1,
          dashes: (n >> 1) & 1,
          t: (n * 37) & 255,
          dash: n % (DASH_COOLDOWN + 1),
          coyote: n % (COYOTE_TICKS + 1),
          buffer: (n * 3) % (JUMP_BUFFER_TICKS + 1),
          held: [0, KEY.JUMP, KEY.DASH, KEY.JUMP | KEY.DASH][n & 3],
          x: f(n * 1.1),
          vx: f(-n * 0.7),
          vz: f(n * 0.3),
          edge: n % 3 ? 0 : f(12.4),
          ev: 77,
          fall: 5,
        });
        n++;
        const [b] = decodeSnapshot(encodeSnapshot({ tick: 0, players: [p], ...IDLE }))!.players;
        const { ev, fall, ground, ...rest } = b;
        expect([ev, fall]).toEqual([0, 0]);
        expect(ground).toBe(mode === MODE.GROUND || mode === MODE.SLIDE || mode === MODE.CROUCH);
        expect(rest).toMatchObject({
          mode,
          wall,
          jumps: p.jumps,
          dashes: p.dashes,
          t: p.t,
          dash: p.dash,
          coyote: p.coyote,
          buffer: p.buffer,
          held: p.held,
          x: p.x,
          vx: p.vx,
          vz: p.vz,
          edge: p.edge,
        });
      }
    }
  });

  it('keeps every timer within the bits it has on the wire', () => {
    // 3 bits for the coyote and buffer ticks, 1 for the jumps, 8 for the dash and the time in mode.
    expect(COYOTE_TICKS).toBeLessThanOrEqual(7);
    expect(JUMP_BUFFER_TICKS + 1).toBeLessThanOrEqual(7);
    expect(AIR_JUMPS).toBeLessThanOrEqual(1);
    expect(DASH_COOLDOWN).toBeLessThanOrEqual(255);
    expect(Object.keys(MODE).length).toBeLessThanOrEqual(8);
    expect(Object.keys(SIDE).length).toBeLessThanOrEqual(8);
    // A slide, a wall-run and a climb end long before t saturates, and the key bits are a byte.
    expect(SLIDE_TICKS).toBeLessThan(255);
    expect(Math.max(...Object.values(KEY))).toBeLessThanOrEqual(255);
  });

  it('round-trips the float32 state exactly, and yaw, pitch within the wire', () => {
    const f = Math.fround;
    const players = [
      player(0, { x: f(12.3), y: f(0.8), z: f(31.7), vy: f(-3.21) }),
      player(3, {
        x: f(12.3),
        y: f(0.8),
        z: f(31.7),
        mode: MODE.GROUND,
        ground: true,
        vy: 0,
        ack: 65535,
        yaw: 0,
        pitch: 1.55,
      }),
      player(255, { x: 0, y: -2.5, z: 300.125, vy: f(9.99) }),
    ];
    const back = decodeSnapshot(encodeSnapshot({ tick: 70000, players, ...IDLE }))!;
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
      encodeSnapshot({ tick: 0, players: [player(1, { x: 1 / 3, z: -1e-3, vy: 1e9 })], ...IDLE }),
    )!.players;
    expect(p.x).toBe(Math.fround(1 / 3));
    expect(p.z).toBe(Math.fround(-1e-3));
    expect(p.vy).toBe(Math.fround(1e9));
  });

  it('takes an empty snapshot', () => {
    expect(decodeSnapshot(encodeSnapshot({ tick: 5, players: [], ...IDLE }))).toEqual({
      tick: 5,
      players: [],
      ...IDLE,
    });
  });

  it('rejects a wrong type, a truncated or a padded frame, and a wrong count', () => {
    const ok = encodeSnapshot({ tick: 1, players: [player(1), player(2)], ...IDLE });
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
    expect(decodeInput(encodeSnapshot({ tick: 0, players: [], ...IDLE }))).toBeNull();
  });
});

describe('the end of a match', () => {
  it('is a text message with the score and what each player did', () => {
    const end: ServerText = {
      t: 'end',
      score: [3, 1],
      players: [{ id: 2, name: 'Ann', team: 0, caps: 3, returns: 1 }],
    };
    expect(parseText<ServerText>(JSON.stringify(end))).toEqual(end);
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
