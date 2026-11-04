import { describe, expect, it } from 'vitest';
import {
  INPUT_BYTES,
  MSG_INPUT,
  MSG_SNAPSHOT,
  SNAP_BULLET,
  SNAP_EVENT,
  SNAP_HEAD,
  SNAP_MONSTER,
  SNAP_PLAYER,
  SNAP_SHOT,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  onWire,
  parseText,
} from './protocol';
import { EVENT, MONSTER } from './types';
import type { Bullet, GameEvent, Monster, Shot, SnapPlayer, Snapshot } from './types';

const player = (id: number, over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  id,
  x: 12.3,
  y: 0.8,
  z: 31.7,
  vy: -3.21,
  yaw: 4.2,
  pitch: -0.7,
  ground: false,
  cool: 0,
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
  it('has a 4-byte head, 24 bytes per player, a shot list, then monsters, bullets and events', () => {
    const buf = encodeSnapshot({
      tick: 0x1234,
      players: [player(7, { x: 1, y: 2, z: 3, vy: -1, yaw: Math.PI, pitch: 0.5, ground: true })],
      shots: [],
      monsters: [],
      bullets: [],
      events: [],
      level: 0,
      hard: false,
      phase: 0,
      keys: 0,
      items: [],
    });
    expect(SNAP_PLAYER).toBe(24);
    expect(buf.byteLength).toBe(SNAP_HEAD + SNAP_PLAYER + 4);
    expect(bytes(buf)).toEqual([
      MSG_SNAPSHOT,
      0x12,
      0x34,
      1,
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
      ...[1, 0, 0, 0, 0], // no shots, monsters, bullets or events
    ]);
  });

  it('keeps the cooldown in bits 1-7 of the flags next to the ground bit', () => {
    const flags = (p: Partial<SnapPlayer>) =>
      bytes(
        encodeSnapshot({
          tick: 0,
          players: [player(1, p)],
          shots: [],
          monsters: [],
          bullets: [],
          events: [],
          level: 0,
          hard: false,
          phase: 0,
          keys: 0,
          items: [],
        }),
      )[SNAP_HEAD + 23];
    expect(flags({ ground: false, cool: 0 })).toBe(0);
    expect(flags({ ground: true, cool: 0 })).toBe(1);
    expect(flags({ ground: false, cool: 5 })).toBe(0b1010);
    expect(flags({ ground: true, cool: 5 })).toBe(0b1011);
    for (const [ground, cool] of [
      [false, 0],
      [true, 5],
      [false, 3],
      [true, 127],
    ] as const) {
      const [p] = decodeSnapshot(
        encodeSnapshot({
          tick: 0,
          players: [player(1, { ground, cool })],
          shots: [],
          monsters: [],
          bullets: [],
          events: [],
          level: 0,
          hard: false,
          phase: 0,
          keys: 0,
          items: [],
        }),
      )!.players;
      expect([p.ground, p.cool]).toEqual([ground, cool]);
    }
  });

  const shot = (id: number, hit: number, over: Partial<Shot> = {}): Shot => ({
    id,
    x: 1.5,
    y: -2.25,
    z: 30.125,
    hit,
    ...over,
  });

  it('carries shots after the players: 14 bytes each, 255 for nobody hit', () => {
    const buf = encodeSnapshot({
      tick: 0x0102,
      players: [player(7)],
      shots: [shot(7, 3), shot(2, -1, { x: 1, y: 2, z: 3 })],
      monsters: [],
      bullets: [],
      events: [],
      level: 0,
      hard: false,
      phase: 0,
      keys: 0,
      items: [],
    });
    const end = SNAP_HEAD + SNAP_PLAYER;
    expect(buf.byteLength).toBe(end + 1 + 2 * SNAP_SHOT + 3);
    expect(SNAP_SHOT).toBe(14);
    expect(bytes(buf).slice(end)).toEqual([
      2,
      // First shot: id 7, x 1.5, y -2.25, z 30.125, hit 3.
      ...[7, 0x3f, 0xc0, 0, 0, 0xc0, 0x10, 0, 0, 0x41, 0xf1, 0x00, 0, 3],
      // Second: id 2, x 1, y 2, z 3, nobody.
      ...[2, 0x3f, 0x80, 0, 0, 0x40, 0, 0, 0, 0x40, 0x40, 0, 0, 255],
      ...[0, 0, 0],
    ]);
  });

  const f32 = Math.fround;
  const monster = (id: number, over: Partial<Monster> = {}): Monster => ({
    id,
    kind: MONSTER.WALKER,
    x: 1,
    y: 2,
    z: 3,
    yaw: 0,
    chase: false,
    ...over,
  });
  const snap = (over: Partial<Snapshot>): Snapshot => ({
    tick: 0,
    players: [],
    shots: [],
    monsters: [],
    bullets: [],
    events: [],
    level: 0,
    hard: false,
    phase: 0,
    keys: 0,
    items: [],
    ...over,
  });

  it('lays out monsters: 16 bytes, kind in bit 0 and chase in bit 1 of the flags', () => {
    const buf = encodeSnapshot(
      snap({
        monsters: [
          monster(16, { x: 1.5, y: -2.25, z: 30.125, yaw: Math.PI }),
          monster(17, { kind: MONSTER.FLYER, chase: true }),
        ],
      }),
    );
    expect(SNAP_MONSTER).toBe(16);
    // Head, no players, no shots, then the monsters.
    expect(buf.byteLength).toBe(SNAP_HEAD + 1 + 1 + 2 * SNAP_MONSTER + 2);
    expect(bytes(buf).slice(SNAP_HEAD + 1)).toEqual([
      2,
      // Walker, patrolling: id 16, flags 0, x 1.5, y -2.25, z 30.125, yaw half a turn.
      ...[16, 0, 0x3f, 0xc0, 0, 0, 0xc0, 0x10, 0, 0, 0x41, 0xf1, 0x00, 0, 0x80, 0],
      // Flyer, chasing: flags 0b11, x 1, y 2, z 3, yaw 0.
      ...[17, 3, 0x3f, 0x80, 0, 0, 0x40, 0, 0, 0, 0x40, 0x40, 0, 0, 0, 0],
      ...[0, 0],
    ]);
    const kinds = (m: Monster[]) => m.map(({ kind, chase }) => [kind, chase]);
    expect(kinds(decodeSnapshot(buf)!.monsters)).toEqual([
      [MONSTER.WALKER, false],
      [MONSTER.FLYER, true],
    ]);
  });

  it('lays out bullets (13 bytes) and events (14 bytes) after the monsters', () => {
    const buf = encodeSnapshot(
      snap({
        bullets: [{ id: 255, x: 1, y: 2, z: 3 }],
        events: [{ type: EVENT.BOOM, id: 9, x: 1.5, y: -2.25, z: 30.125 }],
      }),
    );
    expect([SNAP_BULLET, SNAP_EVENT]).toEqual([13, 14]);
    expect(buf.byteLength).toBe(SNAP_HEAD + 3 + SNAP_BULLET + 1 + SNAP_EVENT);
    expect(bytes(buf).slice(SNAP_HEAD + 2)).toEqual([
      // One bullet: id 255, x 1, y 2, z 3.
      ...[1, 255, 0x3f, 0x80, 0, 0, 0x40, 0, 0, 0, 0x40, 0x40, 0, 0],
      // One event: BOOM, id 9, x 1.5, y -2.25, z 30.125.
      ...[1, EVENT.BOOM, 9, 0x3f, 0xc0, 0, 0, 0xc0, 0x10, 0, 0, 0x41, 0xf1, 0x00, 0],
    ]);
  });

  it('round-trips monsters, bullets and events with the players and shots around them', () => {
    const monsters = [
      monster(16, { x: f32(0.1), y: f32(1.7), z: f32(-3.3), chase: true }),
      monster(79, { kind: MONSTER.FLYER, x: 0, y: 0, z: 0 }),
    ];
    const bullets: Bullet[] = [
      { id: 0, x: f32(0.1), y: f32(5.5), z: f32(-9.9) },
      { id: 255, x: 1, y: 2, z: 3 },
    ];
    const events: GameEvent[] = [
      { type: EVENT.DIE, id: 16, x: f32(2.2), y: 1, z: 2 },
      { type: EVENT.HURT, id: 0, x: 1, y: 2, z: 3 },
      { type: EVENT.BOOM, id: 255, x: 4, y: 5, z: 6 },
      { type: EVENT.SWING, id: 79, x: 7, y: 8, z: 9 },
    ];
    const back = decodeSnapshot(
      encodeSnapshot(
        snap({ players: [player(1)], shots: [shot(1, 16)], monsters, bullets, events }),
      ),
    )!;
    expect(back.players).toHaveLength(1);
    expect(back.shots).toEqual([shot(1, 16)]);
    // Yaw goes through the wire's 65536ths of a turn, the rest is exact.
    expect(back.monsters.map(m => ({ ...m, yaw: 0 }))).toEqual(
      monsters.map(m => ({ ...m, yaw: 0 })),
    );
    expect(back.bullets).toEqual(bullets);
    expect(back.events).toEqual(events);
    const yawed = decodeSnapshot(encodeSnapshot(snap({ monsters: [monster(16, { yaw: 4.2 })] })))!;
    expect(Math.abs(yawed.monsters[0].yaw - 4.2)).toBeLessThanOrEqual(Math.PI / 65536 + 1e-12);
  });

  it('rejects a frame cut or padded in the monster, bullet or event sections, or counted wrong', () => {
    const ok = encodeSnapshot(
      snap({
        players: [player(1)],
        monsters: [monster(16), monster(17)],
        bullets: [{ id: 1, x: 1, y: 2, z: 3 }],
        events: [{ type: EVENT.SWING, id: 16, x: 1, y: 2, z: 3 }],
      }),
    );
    expect(decodeSnapshot(ok)).not.toBeNull();
    for (let cut = 1; cut < ok.byteLength - SNAP_HEAD - SNAP_PLAYER - 1; cut++) {
      expect(decodeSnapshot(ok.slice(0, ok.byteLength - cut))).toBeNull();
    }
    expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
    // Each section's count byte, set to a number the bytes do not hold.
    const monsters = SNAP_HEAD + SNAP_PLAYER + 1;
    const bullets = monsters + 1 + 2 * SNAP_MONSTER;
    const events = bullets + 1 + SNAP_BULLET;
    for (const at of [monsters, bullets, events]) {
      for (const n of [0, 5, 255]) {
        const bad = new Uint8Array(ok.slice(0));
        bad[at] = n;
        expect(decodeSnapshot(bad.buffer)).toBeNull();
      }
    }
  });

  it('round-trips shots in order, float32 exact, and -1 for the level', () => {
    const f = Math.fround;
    const shots = [shot(0, -1, { x: f(0.1), y: f(99.9), z: f(-3.3) }), shot(15, 14), shot(1, 0)];
    const back = decodeSnapshot(
      encodeSnapshot({
        tick: 9,
        players: [player(1), player(2)],
        shots,
        monsters: [],
        bullets: [],
        events: [],
        level: 0,
        hard: false,
        phase: 0,
        keys: 0,
        items: [],
      }),
    )!;
    expect(back.shots).toEqual(shots);
    expect(back.players).toHaveLength(2);
    // And with no players at all.
    expect(
      decodeSnapshot(
        encodeSnapshot({
          tick: 9,
          players: [],
          shots,
          monsters: [],
          bullets: [],
          events: [],
          level: 0,
          hard: false,
          phase: 0,
          keys: 0,
          items: [],
        }),
      )!.shots,
    ).toEqual(shots);
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
        shots: [],
        monsters: [],
        bullets: [],
        events: [],
        level: 0,
        hard: false,
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
        shots: [],
        monsters: [],
        bullets: [],
        events: [],
        level: 0,
        hard: false,
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
          shots: [],
          monsters: [],
          bullets: [],
          events: [],
          level: 0,
          hard: false,
          phase: 0,
          keys: 0,
          items: [],
        }),
      ),
    ).toEqual({
      tick: 5,
      players: [],
      shots: [],
      monsters: [],
      bullets: [],
      events: [],
      level: 0,
      hard: false,
      phase: 0,
      keys: 0,
      items: [],
    });
  });

  it('rejects a wrong type, a truncated or a padded frame, and a wrong count', () => {
    const ok = encodeSnapshot({
      tick: 1,
      players: [player(1), player(2)],
      shots: [],
      monsters: [],
      bullets: [],
      events: [],
      level: 0,
      hard: false,
      phase: 0,
      keys: 0,
      items: [],
    });
    expect(decodeSnapshot(ok)).not.toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(0))).toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(SNAP_HEAD - 1))).toBeNull();
    expect(decodeSnapshot(ok.slice(0, ok.byteLength - 1))).toBeNull();
    expect(decodeSnapshot(ok.slice(0, SNAP_HEAD + SNAP_PLAYER))).toBeNull();
    // No shot count at all: the frame stops after the players.
    expect(decodeSnapshot(ok.slice(0, SNAP_HEAD + SNAP_PLAYER * 2))).toBeNull();
    expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
    const bad = new Uint8Array(ok.slice(0));
    bad[0] = MSG_INPUT;
    expect(decodeSnapshot(bad.buffer)).toBeNull();
    bad[0] = MSG_SNAPSHOT;
    bad[3] = 3;
    expect(decodeSnapshot(bad.buffer)).toBeNull();
  });

  it('rejects a shot count that does not match the bytes', () => {
    const ok = encodeSnapshot({
      tick: 1,
      players: [player(1)],
      shots: [shot(1, 2), shot(1, 3)],
      monsters: [],
      bullets: [],
      events: [],
      level: 0,
      hard: false,
      phase: 0,
      keys: 0,
      items: [],
    });
    expect(decodeSnapshot(ok)).not.toBeNull();
    const end = SNAP_HEAD + SNAP_PLAYER;
    expect(decodeSnapshot(ok.slice(0, ok.byteLength - 1))).toBeNull();
    expect(decodeSnapshot(ok.slice(0, ok.byteLength - SNAP_SHOT))).toBeNull();
    expect(decodeSnapshot(new Uint8Array([...bytes(ok), 0]).buffer)).toBeNull();
    for (const n of [0, 1, 3, 255]) {
      const bad = new Uint8Array(ok.slice(0));
      bad[end] = n;
      expect(decodeSnapshot(bad.buffer)).toBeNull();
    }
  });

  it('does not take an input frame for a snapshot, nor the reverse', () => {
    expect(decodeSnapshot(encodeInput({ seq: 0, keys: 0, yaw: 0, pitch: 0 }))).toBeNull();
    expect(
      decodeInput(
        encodeSnapshot({
          tick: 0,
          players: [],
          shots: [],
          monsters: [],
          bullets: [],
          events: [],
          level: 0,
          hard: false,
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
