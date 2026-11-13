import { describe, expect, it } from 'vitest';
import {
  INPUT_BYTES,
  MAX_ROVERS,
  MSG_INPUT,
  MSG_SNAPSHOT,
  SNAP_BALL,
  SNAP_HEAD,
  SNAP_MATCH,
  SNAP_PLAYER,
  SNAP_ROVER,
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
  CUTS,
  AMMO_MAX,
  COYOTE_TICKS,
  DASH_COOLDOWN,
  DOWN_TICKS,
  GUN_COOLDOWN,
  HP_MAX,
  JUMP_BUFFER_TICKS,
  GUN_MAG,
  GUN_RELOAD,
  MAX_PLAYERS,
  NADE,
  PACK_BITS,
  RAIL_CAP,
  RAIL_MAX,
  RAIL_RELOAD,
  RIFLE_CLIP,
  RIFLE_COOL,
  RIFLE_MAX,
  RIFLE_RELOAD,
  RAIL_TICKS,
  SHOCK_TICKS,
  SLIDE_TICKS,
  STUMBLE_TICKS,
  VEHICLE,
} from './constants';
import { MAPS } from './maps';
import { STILL } from './physics';
import { CUT, FALL, FLAG, KEY, LIMB, MODE, NOBODY, SIDE } from './types';
import { felled } from './gun';
import type { Ball, FlagState, Rover, SnapPlayer, Snapshot } from './types';
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
  by: 0,
  ...STILL,
  mode: MODE.AIR,
  ...over,
});

const bytes = (buf: ArrayBuffer): number[] => [...new Uint8Array(buf)];

/** The floats of a rover, in wire order. */
const ROVER_F = [
  ...(['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw'] as const),
  ...(['pitch', 'roll', 'wy', 'wp', 'wr', 'steer'] as const),
];

/** A rover whose thirteen floats are all different and need every bit of a float32. */
const rover = (k = 0, over: Partial<Rover> = {}): Rover => ({
  ...(Object.fromEntries(
    ROVER_F.map((f, j) => [
      f,
      Math.fround((j % 2 ? -1 : 1) * (0.123456 + j * 1.7654321 + k * 31.3)),
    ]),
  ) as Record<(typeof ROVER_F)[number], number>),
  driver: NOBODY,
  rider: NOBODY,
  hp: VEHICLE.HP,
  wreck: 0,
  ...over,
});

describe('input frame', () => {
  it('is 12 bytes: type, seq, keys in 11 bits, yaw in turns, pitch in 1/10000 rad, view in 1/256 tick', () => {
    const buf = encodeInput({
      seq: 0x0102,
      keys: 0b111_0011_0101,
      yaw: Math.PI,
      pitch: -0.5,
      view: 0x1234 + 0.5,
    });
    expect(buf.byteLength).toBe(INPUT_BYTES);
    // Half a turn is 0x8000; -0.5 rad is -5000 = 0xec78; the view is 0x1234, then 128/256.
    expect(bytes(buf)).toEqual([
      ...[MSG_INPUT, 0x01, 0x02, 0x07, 0b00110101, 0x80, 0x00, 0xec, 0x78],
      ...[0x12, 0x34, 0x80],
    ]);
  });

  it('encodes an absent view as 0, and round-trips the view to 1/256 tick', () => {
    const none = decodeInput(encodeInput({ seq: 1, keys: 0, yaw: 0, pitch: 0 }))!;
    expect(none.view).toBe(0);
    expect(bytes(encodeInput({ seq: 1, keys: 0, yaw: 0, pitch: 0 })).slice(9)).toEqual([0, 0, 0]);
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
      const back = decodeInput(encodeInput({ seq: 65535, keys: 0x7ff, yaw, pitch: 1.55 }))!;
      expect(back.seq).toBe(65535);
      expect(back.keys).toBe(0x7ff);
      expect(Math.abs(back.yaw - yaw)).toBeLessThanOrEqual(Math.PI / 65536 + 1e-12);
      expect(back.pitch).toBeCloseTo(1.55, 4);
    }
  });

  it('carries USE in bit 14 and drops bit 15', () => {
    const back = decodeInput(encodeInput({ seq: 1, keys: 0xffff, yaw: 0, pitch: 0 }))!;
    expect(back.keys).toBe(0x7fff);
    expect(back.keys & KEY.USE).toBe(KEY.USE);
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
        keys: k & 0x3ff,
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
  it('has a 4-byte head, 62 bytes per player, then the match: 10 bytes and a byte per flag at home', () => {
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
          stun: 40,
          by: 0b1011,
          coyote: 5,
          buffer: 3,
          held: KEY.JUMP,
          hp: 3,
          cool: 6,
          ammo: 44,
          down: 99,
          shots: 250,
          hits: 7,
          blade: true,
          wield: false,
          zap: true,
          swing: 20,
          cut: CUT.RIGHT,
          lost: LIMB.LEG_L,
          // Down: his fall goes in the charge's byte.
          charge: 9,
          fell: 42,
          lock: 200,
          foe: 5,
          pressed: true,
          pushes: 17,
          away: 3,
          rail: 7,
          railed: true,
          zapping: true,
          fried: true,
          slow: 130,
          mag: 12,
          cap: 70,
          reload: 33,
          rifle: 99,
          clip: 21,
          rifled: true,
          heat: 97,
          hot: true,
          nades: 2,
          lob: 41,
          // What the animation reads is not sent, nor the last shot's power.
          power: 3,
          ev: 0xffff,
          fall: 9,
        }),
      ],
      ...IDLE,
      packs: 2 ** 47 + 0x8000_0005,
    });
    expect([SNAP_HEAD, SNAP_PLAYER, SNAP_MATCH]).toEqual([4, 62, 10]);
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
      0b10100001, // dash 33, the high bits of the tackler 10 << 6
      0b01011101, // coyote 5, buffer 3 << 3, jump held << 6
      0b11101000, // stun 40, the low bits of the tackler 11 << 6
      // hp 3, cool 6 << 3, ammo 44 << 6, down 99 << 13, blade 1 << 21, zap 1 << 23: 0xac6b33
      ...[0xac, 0x6b, 0x33],
      250, // shots
      7, // hits
      0b10010100, // swing 20, cut RIGHT (2) << 6
      4 | 16, // lost LEG_L, fried << 4
      42, // fell, as he is down (else charge)
      200, // lock
      5 | 128, // foe 5, FIRE held at the last step
      17, // pushes
      3, // away
      8, // rail: 7 ticks plus one
      1 | 4 | 8 | 32, // railed, zapping << 2, rifled << 3, hot << 5
      130, // slow
      12, // mag
      70, // cap
      33, // reload
      100, // rifle: 99 rounds plus one
      21, // clip
      97, // heat
      (2 << 6) | 41, // nade: 2 grenades, 41 ticks before the next
      ...[0, 0, 0x01, 0xe0], // red 0, blue 0, clock 480 s, not over
      ...[0x80, 0, 0x80, 0, 0, 5], // packs 0 and 2, 31 and 47
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
        ...[0, 0, 0, 0, 0, 0],
        ...[FLAG.CARRIED, 5],
        ...[FLAG.DROPPED, 0, 24, 0xff, 0xe0, 0x06, 0x41, 7],
      ]);
    });

    it('is 10 bytes over the players with both flags home, 20 with both dropped', () => {
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

  describe('the plasma balls', () => {
    const ball = (over: Partial<Ball> = {}): Ball => ({
      id: 200,
      by: 15,
      x: 12.5,
      y: -80.25,
      z: 231.96875,
      dx: 0,
      dy: 0,
      dz: -1,
      burst: false,
      ...over,
    });
    const snap = (balls: Ball[], players = 0): Snapshot => ({
      tick: 3,
      players: Array.from({ length: players }, (_, k) => player(k)),
      ...IDLE,
      balls,
    });

    it('come after the flags, a count and 11 bytes each, and only when there are any', () => {
      expect(SNAP_BALL).toBe(11);
      const none = SNAP_HEAD + SNAP_MATCH + 2;
      expect(encodeSnapshot(snap([])).byteLength).toBe(none);
      expect(encodeSnapshot(snap([ball()])).byteLength).toBe(none + 1 + SNAP_BALL);
      expect(encodeSnapshot(snap([ball(), ball(), ball()])).byteLength).toBe(none + 1 + 33);
      expect(
        bytes(encodeSnapshot(snap([ball({ burst: true, dz: 1, power: 4 })]))).slice(none),
      ).toEqual([...[1, 200, 15 | 128], ...[0x01, 0x90, 0xf5, 0xf8, 0x1c, 0xff], ...[128, 0], 4]);
      // No ball, no key in the snapshot read back.
      expect(decodeSnapshot(encodeSnapshot(snap([])))).not.toHaveProperty('balls');
    });

    it('round-trip the id, the shooter, the burst bit, the place to 1/32 m and the way to about a degree', () => {
      const ways: [number, number][] = [
        [0, 0],
        [1, 0.3],
        [3, -1.2],
        [5.9, 1.5],
        [Math.PI, -0.01],
      ];
      const sent = ways.map(([yaw, pitch], k) =>
        ball({
          id: k * 60,
          by: k * 3,
          burst: k % 2 === 1,
          x: -500 + k * 77.77,
          y: k * 3.3,
          z: 900 - k * 123.4,
          dx: -Math.sin(yaw) * Math.cos(pitch),
          dy: Math.sin(pitch),
          dz: -Math.cos(yaw) * Math.cos(pitch),
        }),
      );
      const got = decodeSnapshot(encodeSnapshot(snap(sent, 8)))!;
      expect(got.players).toHaveLength(8);
      expect(got.balls).toHaveLength(sent.length);
      got.balls!.forEach((b, k) => {
        const s = sent[k];
        expect([b.id, b.by, b.burst]).toEqual([s.id, s.by, s.burst]);
        for (const c of ['x', 'y', 'z'] as const) {
          expect(Math.abs(b[c] - s[c])).toBeLessThanOrEqual(1 / 64);
        }
        expect(Math.hypot(b.dx, b.dy, b.dz)).toBeCloseTo(1, 9);
        const cos = b.dx * s.dx + b.dy * s.dy + b.dz * s.dz;
        expect(Math.acos(Math.min(1, cos))).toBeLessThan(0.02);
      });
    });

    it('carry a grenade in the power byte: bit 6 and its speed in whole m/s, 63 at most', () => {
      const sent = [
        ball({ power: NADE, v: 36 }),
        ball({ id: 7, power: NADE, v: 80.4, burst: true }),
      ];
      const buf = encodeSnapshot(snap(sent));
      expect(bytes(buf).slice(-SNAP_BALL - 1)[0]).toBe(64 | 36);
      expect(bytes(buf).at(-1)).toBe(64 | 63);
      const got = decodeSnapshot(buf)!.balls!;
      expect(got.map(b => [b.power, b.v, b.arc, b.burst])).toEqual([
        [NADE, 36, undefined, false],
        [NADE, 63, undefined, true],
      ]);
    });

    it('carry the katana’s arcs of energy in the power byte: bit 7 and the cut that threw it', () => {
      const none = SNAP_HEAD + SNAP_MATCH + 2;
      const sent = [ball({ arc: CUT.ARC_L }), ball({ id: 7, arc: CUT.ARC_R }), ball({ power: 5 })];
      expect(bytes(encodeSnapshot(snap(sent))).at(none + SNAP_BALL)).toBe(128 | CUT.ARC_L);
      const got = decodeSnapshot(encodeSnapshot(snap(sent)))!.balls!;
      expect(got.map(b => [b.arc, b.power])).toEqual([
        [CUT.ARC_L, 1],
        [CUT.ARC_R, 1],
        [undefined, 5],
      ]);
    });

    it('clamps a place out of the i16 range, and rejects a cut, padded or zero-counted tail', () => {
      const [b] = decodeSnapshot(encodeSnapshot(snap([ball({ x: 5000, z: -5000 })])))!.balls!;
      expect([b.x, b.z]).toEqual([32767 / 32, -1024]);
      const ok = encodeSnapshot(snap([ball(), ball({ id: 1 })], 2));
      expect(decodeSnapshot(ok)!.balls).toHaveLength(2);
      // Cut before the count, it is a snapshot without balls; anywhere after it, nothing.
      for (let n = ok.byteLength - 2 * SNAP_BALL; n < ok.byteLength; n++) {
        expect(decodeSnapshot(ok.slice(0, n)), `cut at ${n}`).toBeNull();
      }
      expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
      const zero = new Uint8Array([...bytes(encodeSnapshot(snap([]))), 0]);
      expect(decodeSnapshot(zero.buffer)).toBeNull();
    });
  });

  describe('the rovers', () => {
    const snap = (rovers: Rover[] | undefined, players = 0, over: Partial<Snapshot> = {}) => ({
      tick: 3,
      players: Array.from({ length: players }, (_, k) => player(k)),
      ...IDLE,
      ...(rovers && { rovers }),
      ...over,
    });
    const ball: Ball = { id: 9, by: 2, x: 1, y: 2, z: 3, dx: 0, dy: 0, dz: -1, burst: false };
    const lying: FlagState = { state: FLAG.DROPPED, by: 0, x: 4, y: 5, z: 6, left: 7 };

    it('keeps a map without rovers byte for byte', () => {
      const rest = { balls: [ball], flags: [lying, IDLE.flags[1]] as Snapshot['flags'] };
      const none = encodeSnapshot(snap(undefined, 3, rest));
      // The frame of before the rovers: the bare player count, then the match right after the players.
      expect(none.byteLength).toBe(SNAP_HEAD + 3 * SNAP_PLAYER + SNAP_MATCH + 9 + 1 + SNAP_BALL);
      expect(bytes(none)[3]).toBe(3);
      expect(bytes(none)[SNAP_HEAD + 3 * SNAP_PLAYER + SNAP_MATCH]).toBe(FLAG.DROPPED);
      expect(bytes(encodeSnapshot(snap([], 3, rest)))).toEqual(bytes(none));
      expect(decodeSnapshot(none)).not.toHaveProperty('rovers');
      // A rover adds its count bit and its block after the players, and moves nothing else.
      const one = bytes(encodeSnapshot(snap([rover()], 3, rest)));
      expect(one.splice(SNAP_HEAD + 3 * SNAP_PLAYER, SNAP_ROVER)).toHaveLength(SNAP_ROVER);
      one[3] &= 31;
      expect(one).toEqual(bytes(none));
    });

    it('puts the rover count in the top three bits of the count byte, and the players in the low five', () => {
      expect([SNAP_ROVER, MAX_ROVERS]).toEqual([57, 7]);
      for (const players of [0, 1, 5, MAX_PLAYERS]) {
        for (let n = 0; n <= MAX_ROVERS; n++) {
          const sent = Array.from({ length: n }, (_, k) => rover(k));
          const buf = encodeSnapshot(snap(sent, players));
          expect(bytes(buf)[3]).toBe(players | (n << 5));
          expect(buf.byteLength).toBe(
            SNAP_HEAD + players * SNAP_PLAYER + n * SNAP_ROVER + SNAP_MATCH + 2,
          );
          const back = decodeSnapshot(buf)!;
          expect(back.players.map(p => p.id)).toEqual(Array.from({ length: players }, (_, k) => k));
          expect(back.rovers ?? []).toEqual(sent);
          expect('rovers' in back).toBe(n > 0);
        }
      }
      // The count has no fourth bit: an eighth rover is not sent, and the frame stays whole.
      const eight = Array.from({ length: 8 }, (_, k) => rover(k));
      const buf = encodeSnapshot(snap(eight, 2));
      expect(bytes(buf)[3]).toBe(2 | (7 << 5));
      expect(decodeSnapshot(buf)!.rovers).toEqual(eight.slice(0, 7));
    });

    it('round-trips a rover’s float32 state exactly, with both seats', () => {
      const f = Math.fround;
      const sent = [
        rover(0, { driver: 3, rider: 15 }),
        // Angles as they are, not in 65536ths of a turn: just under a turn, a hair, a negative one.
        rover(1, { yaw: f(2 * Math.PI - 1e-6), pitch: f(1e-7), roll: f(-1.2345678), rider: 0 }),
        rover(2, { x: f(-299.99), y: f(1e9), z: f(1e-30), vx: -0, steer: f(0.55), driver: 254 }),
      ];
      // No value survives the fixed points of the rest of the frame: 1/32 m, 1/10000 rad, a u16 turn.
      for (const k of ROVER_F) {
        for (const q of [32, 10000, 32768 / Math.PI]) {
          expect(Math.round(sent[0][k] * q) / q, k).not.toBe(sent[0][k]);
        }
      }
      const buf = encodeSnapshot(snap(sent, 2));
      const back = decodeSnapshot(buf)!.rovers!;
      expect(back).toEqual(sent);
      expect(Object.is(back[2].vx, -0)).toBe(true);
      // The block follows the players: thirteen big-endian float32 in order, then the two seats.
      const v = new DataView(buf);
      sent.forEach((r, i) => {
        const o = SNAP_HEAD + 2 * SNAP_PLAYER + i * SNAP_ROVER;
        expect(ROVER_F.map((_, j) => v.getFloat32(o + 4 * j))).toEqual(ROVER_F.map(k => r[k]));
        expect([v.getUint8(o + 52), v.getUint8(o + 53)]).toEqual([r.driver, r.rider]);
      });
      // The match comes after the last seat and the three bytes of the kind and health, the wreck
      // and the missiles (a whole rover's: its health, 0, 0): no captures, 480 s.
      const last = SNAP_HEAD + 2 * SNAP_PLAYER + 2 * SNAP_ROVER + 52;
      expect(bytes(buf).slice(last, last + 9)).toEqual([
        ...[254, NOBODY, VEHICLE.HP, 0, 0],
        ...[0, 0, 0x01, 0xe0],
      ]);
      // A float64 goes to its nearest float32, no further.
      const [r] = decodeSnapshot(
        encodeSnapshot(snap([rover(0, { yaw: 4.2, wy: 1 / 3 })])),
      )!.rovers!;
      expect([r.yaw, r.wy]).toEqual([f(4.2), f(1 / 3)]);
    });

    it('carries a ship: its kind and health, its wreck time in fours rounded up, its missiles', () => {
      const sent = [
        rover(0, { driver: 3, ship: true, hp: 7, wreck: 0, nades: 4 }),
        rover(1, { ship: true, hp: 0, wreck: 297, nades: 0 }),
        rover(2),
      ];
      const back = decodeSnapshot(encodeSnapshot(snap(sent, 2)))!.rovers!;
      expect(back[0]).toEqual(sent[0]);
      expect(back[1]).toEqual({ ...sent[1], wreck: 300 });
      expect(back[2].ship).toBeUndefined();
      const v = new DataView(encodeSnapshot(snap(sent, 2)));
      const o = SNAP_HEAD + 2 * SNAP_PLAYER;
      expect([v.getUint8(o + 54), v.getUint8(o + 55), v.getUint8(o + 56)]).toEqual([128 | 7, 0, 4]);
    });

    it('carries a rover’s health and its wreck’s time in the same two bytes, and adds none', () => {
      expect(SNAP_ROVER).toBe(57);
      const sent = [
        rover(0, { hp: 3 }),
        rover(1, { hp: 0, wreck: VEHICLE.WRECK }),
        rover(2, { hp: 0, wreck: 1 }),
      ];
      const buf = encodeSnapshot(snap(sent, 1));
      expect(buf.byteLength).toBe(SNAP_HEAD + SNAP_PLAYER + 3 * SNAP_ROVER + SNAP_MATCH + 2);
      const back = decodeSnapshot(buf)!.rovers!;
      expect(back.map(r => [r.hp, r.wreck, r.ship])).toEqual([
        [3, 0, undefined],
        [0, VEHICLE.WRECK, undefined],
        // The last ticks still read as a wreck: rounded up to the wire's four.
        [0, 4, undefined],
      ]);
      const v = new DataView(buf);
      const at = (i: number) => SNAP_HEAD + SNAP_PLAYER + i * SNAP_ROVER + 54;
      expect([0, 1, 2].map(i => [0, 1, 2].map(j => v.getUint8(at(i) + j)))).toEqual([
        [3, 0, 0],
        [0, VEHICLE.WRECK / 4, 0],
        [0, 1, 0],
      ]);
      // A state that says nothing of its health is whole.
      const bare = rover(0);
      delete bare.hp;
      delete bare.wreck;
      expect(decodeSnapshot(encodeSnapshot(snap([bare])))!.rovers![0]).toMatchObject({
        hp: VEHICLE.HP,
        wreck: 0,
      });
    });

    it('carries rovers, balls and sixteen players together', () => {
      const sent = snap(
        [0, 1, 2, 3].map(k => rover(k, { driver: k, rider: 15 - k })),
        16,
        {
          score: [2, 1],
          flags: [{ ...IDLE.flags[0], state: FLAG.CARRIED, by: 15 }, lying],
          balls: [ball, { ...ball, id: 10, burst: true }, { ...ball, id: 11, by: 15 }],
        },
      );
      const buf = encodeSnapshot(sent);
      expect(bytes(buf)[3]).toBe(16 | (4 << 5));
      expect(buf.byteLength).toBe(
        SNAP_HEAD + 16 * SNAP_PLAYER + 4 * SNAP_ROVER + SNAP_MATCH + 2 + 8 + 1 + 3 * SNAP_BALL,
      );
      const back = decodeSnapshot(buf)!;
      expect(back.players.map(p => p.id)).toEqual(sent.players.map(p => p.id));
      expect(back.players[15]).toMatchObject({ id: 15, x: Math.fround(12.3), ack: 1234 });
      expect(back.rovers).toEqual(sent.rovers);
      expect([back.score, back.flags]).toEqual([sent.score, sent.flags]);
      expect(back.balls!.map(b => [b.id, b.by, b.burst, b.x, b.dz])).toEqual(
        sent.balls!.map(b => [b.id, b.by, b.burst, b.x, b.dz]),
      );
    });

    it('rejects a frame cut in a rover, and a rover count that does not fit the length', () => {
      const ok = encodeSnapshot(snap([rover(0), rover(1)], 2));
      expect(decodeSnapshot(ok)!.rovers).toHaveLength(2);
      for (let n = SNAP_HEAD; n < ok.byteLength; n++) {
        expect(decodeSnapshot(ok.slice(0, n)), `cut at ${n}`).toBeNull();
      }
      expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
      // One rover more or fewer than the bytes hold, none at all, and a rover counted as a player.
      for (const count of [2 | (3 << 5), 2 | (1 << 5), 2, 3 | (1 << 5), 2 | (7 << 5)]) {
        const bad = new Uint8Array(ok.slice(0));
        bad[3] = count;
        expect(decodeSnapshot(bad.buffer), `count ${count}`).toBeNull();
      }
      // A rover's worth of bytes with no count for it.
      const bare = encodeSnapshot(snap(undefined, 2));
      const fat = new Uint8Array([...bytes(bare), ...new Array<number>(SNAP_ROVER).fill(1)]);
      expect(decodeSnapshot(fat.buffer)).toBeNull();
    });
  });

  it('carries USE held beside jump and dash', () => {
    const all = {
      railed: true,
      inRail: true,
      zapping: true,
      rifled: true,
      inRifle: true,
      hot: true,
    };
    for (let k = 0; k < 8; k++) {
      const held = (k & 1 && KEY.JUMP) | (k & 2 && KEY.DASH) | (k & 4 && KEY.USE);
      for (const flags of [{}, all]) {
        const p = player(k, { held, coyote: 7, buffer: 7, ...flags });
        const buf = encodeSnapshot({ tick: 0, players: [p, player(9)], ...IDLE });
        // Jump and dash in bits 6 and 7 of the timers, USE in bit 6 of the rail gun's flags.
        expect(bytes(buf)[SNAP_HEAD + 38]).toBe(63 | ((k & 3) << 6));
        expect(bytes(buf)[SNAP_HEAD + 53]).toBe((flags === all ? 63 : 0) | (k & 4 ? 64 : 0));
        const [a, b] = decodeSnapshot(buf)!.players;
        expect(a.held).toBe(held);
        expect(a).toMatchObject({ coyote: 7, buffer: 7, ...flags });
        expect([a.hot, a.inRifle]).toEqual([flags === all, flags === all]);
        expect(b.held).toBe(0);
      }
    }
  });

  it('carries the fall in the charge’s byte while he is down, and the charge while he is up', () => {
    const fell = felled(FALL.STRUCK, -1, 0.3);
    const buf = encodeSnapshot({
      tick: 0,
      players: [player(1, { down: 30, charge: 0, fell }), player(2, { charge: 17, fell })],
      ...IDLE,
    });
    expect(bytes(buf)[SNAP_HEAD + 47]).toBe(fell);
    const [a, b] = decodeSnapshot(buf)!.players;
    expect([a.fell, a.charge, b.fell, b.charge]).toEqual([fell, 0, 0, 17]);
    expect(fell >> 5).toBe(FALL.STRUCK);
  });

  it('round-trips MODE.RIDE', () => {
    // Seated, the USE that got him in still held, every neighbour of the mode's three bits set.
    const p = player(6, { mode: MODE.RIDE, wall: SIDE.NORTH, jumps: 1, dashes: 1, held: KEY.USE });
    const buf = encodeSnapshot({
      tick: 0,
      players: [p],
      ...IDLE,
      rovers: [rover(0, { rider: 6 })],
    });
    expect(bytes(buf)[SNAP_HEAD + 35]).toBe(MODE.RIDE | (SIDE.NORTH << 3) | 64 | 128);
    const back = decodeSnapshot(buf)!;
    expect(back.players[0]).toMatchObject({
      ...{ mode: MODE.RIDE, ground: false, wall: SIDE.NORTH, jumps: 1, dashes: 1 },
      held: KEY.USE,
    });
    expect(back.rovers![0].rider).toBe(back.players[0].id);
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
          stun: (n * 5) % (STUMBLE_TICKS + 1),
          by: n % MAX_PLAYERS,
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
          stun: p.stun,
          by: p.by,
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
    // 3 bits for the coyote and buffer ticks, 1 for the jumps, 6 for the dash and the stumble, 8 for the time in mode.
    expect(COYOTE_TICKS).toBeLessThanOrEqual(7);
    expect(JUMP_BUFFER_TICKS + 1).toBeLessThanOrEqual(7);
    expect(AIR_JUMPS).toBeLessThanOrEqual(1);
    expect(DASH_COOLDOWN).toBeLessThanOrEqual(63);
    expect(STUMBLE_TICKS).toBeLessThanOrEqual(63);
    // The id of a tackler is 4 bits.
    expect(MAX_PLAYERS).toBeLessThanOrEqual(16);
    // The count byte: 5 bits of players, 3 of rovers, and NOBODY is no player's id.
    expect(MAX_PLAYERS).toBeLessThanOrEqual(31);
    expect(MAX_ROVERS).toBe(7);
    for (const def of Object.values(MAPS)) {
      expect(def.rovers?.length ?? 0).toBeLessThanOrEqual(MAX_ROVERS);
    }
    expect(NOBODY).toBeGreaterThanOrEqual(MAX_PLAYERS);
    expect(NOBODY).toBeLessThanOrEqual(255);
    // The mode is 3 bits, RIDE the last value they hold.
    expect(Math.max(...Object.values(MODE))).toBe(MODE.RIDE);
    expect(MODE.RIDE).toBeLessThanOrEqual(7);
    expect(Object.keys(MODE).length).toBeLessThanOrEqual(8);
    expect(Object.keys(SIDE).length).toBeLessThanOrEqual(8);
    // A slide, a wall-run and a climb end long before t saturates, and the key bits are fifteen.
    expect(SLIDE_TICKS).toBeLessThan(255);
    expect(Math.max(...Object.values(KEY))).toBeLessThanOrEqual(0x4000);
    // The rifle's rounds plus one, its cell and its cooldown (the gun's 3 bits).
    expect(Math.max(RIFLE_MAX + 1, RIFLE_CLIP, RIFLE_RELOAD)).toBeLessThanOrEqual(255);
    expect(RIFLE_COOL).toBeLessThanOrEqual(7);
    // The battery, the capsule and the swap in a byte each.
    expect(Math.max(GUN_MAG, RAIL_CAP, GUN_RELOAD, RAIL_RELOAD)).toBeLessThanOrEqual(255);
    // The rail gun: its ticks plus one and its drain in a byte.
    expect(RAIL_MAX + 1).toBeLessThanOrEqual(255);
    expect(RAIL_TICKS).toBeLessThanOrEqual(255);
    // The gun: 3 bits for hp and cool, 7 for down, 7 for ammo with 127 for no gun, PACK_BITS packs.
    expect(HP_MAX).toBeLessThanOrEqual(7);
    expect(GUN_COOLDOWN).toBeLessThanOrEqual(7);
    expect(DOWN_TICKS).toBeLessThanOrEqual(127);
    expect(AMMO_MAX).toBeLessThan(127);
    // The katana: a swing's ticks in 6 bits, the cut in 3, a shock inside the stun's 6, the limb in 3.
    expect(Math.max(...Object.values(LIMB))).toBeLessThanOrEqual(7);
    expect(Math.max(...CUTS.map(c => c.ticks))).toBeLessThanOrEqual(63);
    expect(CUTS).toHaveLength(Object.keys(CUT).length);
    expect(Object.keys(CUT).length).toBeLessThanOrEqual(8);
    expect(SHOCK_TICKS).toBeLessThanOrEqual(63);
  });

  it('round-trips the gun fields: health, ammo or no gun, cool, down, the counters, the packs', () => {
    let s = 99;
    const rnd = (n: number) =>
      Math.floor(((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * n);
    for (let k = 0; k < 500; k++) {
      const p = player(k % 16, {
        hp: rnd(HP_MAX + 1),
        ammo: rnd(AMMO_MAX + 2) - 1,
        cool: rnd(GUN_COOLDOWN + 1),
        down: rnd(DOWN_TICKS + 1),
        rack: rnd(2) === 1,
        shots: rnd(256),
        hits: rnd(256),
        blade: rnd(2) === 1,
        wield: rnd(2) === 1,
        zap: rnd(2) === 1,
        swing: rnd(64),
        cut: rnd(8),
        lost: rnd(6),
        rail: rnd(RAIL_MAX + 2) - 1,
        railed: rnd(2) === 1,
        inRail: rnd(2) === 1,
        zapping: rnd(2) === 1,
        fried: rnd(2) === 1,
        slow: rnd(RAIL_TICKS + 1),
        // The gun bits sit among the movement ones: those must not move.
        mode: rnd(7),
        stun: rnd(STUMBLE_TICKS + 1),
        by: rnd(16),
        held: KEY.JUMP,
      });
      const packs =
        k < 5 ? [0, 1, 0x8000_0000, 0xffff_ffff, 2 ** PACK_BITS - 1][k] : rnd(2 ** PACK_BITS);
      const back = decodeSnapshot(
        encodeSnapshot({ tick: k, players: [p, player(15, { hp: 1, ammo: -1 })], ...IDLE, packs }),
      )!;
      const keys = [
        'hp',
        'ammo',
        'cool',
        'down',
        'rack',
        'shots',
        'hits',
        'blade',
        'wield',
        'zap',
        'swing',
        'cut',
        'lost',
        'rail',
        'railed',
        'inRail',
        'zapping',
        'fried',
        'slow',
        'mode',
        'stun',
        'by',
        'held',
      ] as const;
      expect(keys.map(f => back.players[0][f])).toEqual(keys.map(f => p[f]));
      expect([back.players[1].hp, back.players[1].ammo]).toEqual([1, -1]);
      expect(back.packs).toBe(packs);
    }
  });

  it('puts every extreme of the gun on the wire: no gun, a full gun, down, the highest counters', () => {
    for (const over of [
      { hp: 0, ammo: -1, cool: 0, down: DOWN_TICKS, rack: true, shots: 255, hits: 255 },
      { hp: HP_MAX, ammo: AMMO_MAX, cool: GUN_COOLDOWN, down: 0, rack: false, shots: 0, hits: 0 },
      { hp: 7, ammo: 126, cool: 7, down: 127, shots: 1, hits: 254 },
      // The katana's bits on their own, then all at their highest: none spills into its neighbour.
      { hp: 0, ammo: -1, cool: 0, down: 0, rack: false, blade: true, wield: false, zap: false },
      { hp: 0, ammo: -1, cool: 0, down: 0, rack: false, blade: false, wield: true, zap: false },
      { hp: 0, ammo: -1, cool: 0, down: 0, rack: false, blade: false, wield: false, zap: true },
      { hp: 7, ammo: 126, cool: 7, down: 127, rack: true, blade: true, wield: true, zap: true },
      { blade: true, wield: true, swing: 36, cut: CUT.SLASH },
      { blade: false, wield: false, zap: false, swing: 63, cut: CUT.THRUST },
      { swing: 63, cut: CUT.SLASH, lost: LIMB.LEG_R },
    ]) {
      const [b] = decodeSnapshot(
        encodeSnapshot({ tick: 0, players: [player(2, over)], ...IDLE }),
      )!.players;
      expect(b).toMatchObject(over);
    }
  });

  it('writes a state with no katana fields as no katana: not wielded, no swing, no shock, no limb lost', () => {
    const bare: SnapPlayer = player(1);
    for (const k of ['blade', 'wield', 'swing', 'cut', 'zap', 'lost'] as const) {
      delete bare[k];
    }
    const buf = encodeSnapshot({ tick: 0, players: [bare], ...IDLE });
    const [b] = decodeSnapshot(buf)!.players;
    expect(b).toMatchObject({ blade: false, wield: false, zap: false, swing: 0, cut: 0 });
    expect(b.lost).toBe(LIMB.NONE);
    expect(bytes(buf)[SNAP_HEAD + 46]).toBe(0);
  });

  it('round-trips every limb in byte 46 of the player, bits 0-2, the rest 0', () => {
    for (const lost of Object.values(LIMB)) {
      const buf = encodeSnapshot({
        tick: 0,
        players: [player(3, { lost, swing: 63, cut: CUT.SLASH }), player(4)],
        ...IDLE,
      });
      expect(bytes(buf)[SNAP_HEAD + 46], `limb ${lost}`).toBe(lost);
      const [a, b] = decodeSnapshot(buf)!.players;
      expect([a.lost, a.swing, a.cut, b.id, b.lost]).toEqual([lost, 63, CUT.SLASH, 4, LIMB.NONE]);
    }
  });

  it('reads the packs as 0 when the snapshot has none', () => {
    const { packs, ...bare } = IDLE;
    expect(packs).toBe(0);
    expect(decodeSnapshot(encodeSnapshot({ tick: 0, players: [], ...bare }))!.packs).toBe(0);
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
      players: [{ id: 2, name: 'Ann', team: 0, caps: 3, returns: 1, frags: 2 }],
    };
    expect(parseText<ServerText>(JSON.stringify(end))).toEqual(end);
  });
});

describe('the roster', () => {
  it('carries the key of the map, and parses without one', () => {
    const roster: ServerText = { t: 'roster', you: 0, players: [], map: 'tranquility' };
    expect(parseText<ServerText>(JSON.stringify(roster))).toEqual(roster);
    expect(parseText<ServerText>('{"t":"roster","you":0,"players":[]}')).toMatchObject({
      t: 'roster',
    });
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
