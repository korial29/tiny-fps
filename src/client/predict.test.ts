import { describe, expect, it } from 'vitest';
import { INTERP_DELAY, PLAYER_H, TICK_HZ } from '../shared/constants';
import { compile, sectorAt } from '../shared/level';
import { HALL } from '../shared/map';
import { move, spawn } from '../shared/physics';
import { decodeSnapshot, encodeInput, onWire } from '../shared/protocol';
import { Room } from '../shared/room';
import { KEY } from '../shared/types';
import type { Conn, Input, PlayerState, SnapPlayer, Snapshot } from '../shared/types';
import { createPredictor } from './predict';

const STEP = 1000 / TICK_HZ;
const lvl = compile(HALL);

const snapPlayer = (id: number, over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  id,
  x: 8,
  y: 1,
  z: 14,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ack: 0xffff,
  ...over,
});
const snapshot = (tick: number, ...players: SnapPlayer[]): Snapshot => ({ tick, players });
const fwd = { keys: KEY.FORWARD, yaw: 0, pitch: 0 };

describe('prediction against the room', () => {
  /**
   * A route through HALL, steered on a copy of the physics: the corridor with head bumps, the
   * west hall, into the lava pit and against its wall, a jump out, the stairs up to the balcony
   * and against its wall, and back down hopping. Keys wobble (strafing, small yaw noise) so the
   * inputs are not tidy. Each leg ends at its target or after `max` steps (a target inside a wall
   * is a press against it).
   */
  const route: { to: [number, number]; max: number; jump?: boolean }[] = [
    { to: [17, 3], max: 150 },
    { to: [15, 8], max: 60 },
    { to: [19.5, 8], max: 70, jump: true },
    { to: [17, 8], max: 50, jump: true },
    { to: [23, 8], max: 60 },
    { to: [28, 8], max: 60 },
    { to: [31, 8], max: 40 },
    { to: [33, 8], max: 50, jump: true },
    { to: [33, 13], max: 60 },
    { to: [30, 14], max: 40 },
    { to: [30, 22], max: 100 },
    { to: [37, 22], max: 80 },
    { to: [30, 22], max: 70 },
    { to: [30, 15], max: 100, jump: true },
    { to: [22, 14], max: 90 },
  ];
  const script = (seed = 12345): Omit<Input, 'seq'>[] => {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const out: Omit<Input, 'seq'>[] = [];
    const sim = spawn(0, lvl, 0);
    for (const { to, max, jump } of route) {
      let keys = 0;
      for (let k = 0; k < max; k++) {
        const [dx, dz] = [to[0] - sim.x, to[1] - sim.z];
        if (Math.hypot(dx, dz) < 0.3) {
          break;
        }
        if (k % 12 === 0) {
          keys = KEY.FORWARD | (rnd() < 0.2 ? KEY.LEFT : 0) | (rnd() < 0.2 ? KEY.RIGHT : 0);
        }
        const i = {
          keys: keys | (jump ? KEY.JUMP : 0),
          yaw: Math.atan2(-dx, -dz) + (rnd() - 0.5) * 0.1,
          pitch: Math.sin(out.length / 20) * 0.5,
        };
        out.push(i);
        move(sim, { ...i, seq: 0 }, lvl);
      }
    }
    return out;
  };
  const SCRIPT = script();
  /** Seeds of the route noise for the sweep: different wobbles hit different thresholds. */
  const SEEDS = Array.from({ length: 24 }, (_, k) => 1000 + k * 977);
  /** The three lag scenarios of the tests below, as steps of delay per input. */
  const LAGS: [string, (k: number) => number][] = [
    ['jittery', k => 2 + (k % 7 === 0 ? 3 : 0) + (k % 50 < 5 ? 4 : 0)],
    ['none', () => 0],
    ['long', () => 8],
  ];

  /**
   * Runs the script through a room (inputs and snapshots delayed, in order, by `lag(k)` steps)
   * and a predictor fed with the decoded snapshots. Returns the worst gap between the
   * predictor's own player right after each snapshot and a reference stepped on the same inputs
   * with no network at all, the worst gap to the host's own snapshot at the end, and how far the
   * raw host state was behind the prediction (what the replay had to make up).
   */
  const race = (lag: (k: number) => number, steps = SCRIPT) => {
    const n = steps.length;
    const room = new Room();
    const sent: ArrayBuffer[] = [];
    const conn: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && conn.bins.push(d),
    };
    room.connect(conn);
    room.receive(conn, JSON.stringify({ t: 'join', name: 'me' }));
    // Another player, so the snapshot carries two and the right one is picked.
    const other: Conn = { send: () => {} };
    room.connect(other);
    room.receive(other, JSON.stringify({ t: 'join', name: 'other' }));

    const pred = createPredictor(lvl);
    pred.you(0);
    const ref: PlayerState = spawn(0, lvl, 0);
    const inputs: { at: number; data: ArrayBuffer }[] = [];
    const snaps: { at: number; data: ArrayBuffer }[] = [];
    let seen = 0;
    let worst = 0;
    let behind = 0;

    const gap = (a: PlayerState, b: PlayerState) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const flush = (k: number, snapAt: (k: number) => number) => {
      while (inputs.length && inputs[0].at <= k) {
        room.receive(conn, inputs.shift()!.data);
      }
      room.tick();
      for (; seen < conn.bins.length; seen++) {
        snaps.push({ at: snapAt(k), data: conn.bins[seen] });
      }
      while (snaps.length && snaps[0].at <= k) {
        const s = decodeSnapshot(snaps.shift()!.data)!;
        pred.snapshot(s, k * STEP);
        worst = Math.max(worst, gap(pred.me(1)!, ref));
        behind = Math.max(
          behind,
          gap(
            s.players.find(p => p.id === 0)!,
            ref,
          ),
        );
      }
    };

    let last = 0;
    steps.forEach((i, k) => {
      const input = pred.step(i);
      move(ref, input, lvl);
      sent.push(encodeInput(input));
      // In order: never delivered before the previous one.
      last = Math.max(last, k + lag(k));
      inputs.push({ at: last, data: sent[k] });
      flush(k, k => k + lag(k));
    });
    // Let everything arrive, with no new input.
    for (let k = n; inputs.length || snaps.length || k < n + 10; k++) {
      flush(k, () => k);
    }
    const final = decodeSnapshot(conn.bins.at(-1)!)!.players.find(p => p.id === 0)!;
    return { worst, behind, final: gap(final, pred.me(1)!), end: gap(final, ref) };
  };

  // Host, client replay and reference all run move() on float32 state with the wire-rounded input,
  // and the snapshot carries that state exactly: the gaps are 0, not "small". The one thing left
  // that could differ is Math.sin / Math.cos across JS engines, and these all run on one.
  it('agrees with the host exactly, inputs and snapshots in flight', () => {
    const r = race(LAGS[0][1]);
    expect(r.worst).toBe(0);
    // The replay was needed: the host state alone was well behind the predicted one.
    expect(r.behind).toBeGreaterThan(0.1);
    expect(r.end).toBe(0);
    expect(r.final).toBe(0);
  });

  it('agrees with the host exactly when nothing is delayed', () => {
    const r = race(LAGS[1][1]);
    expect(r.worst).toBe(0);
    expect(r.end).toBe(0);
  });

  it('agrees with the host exactly with a long lag (many unacked inputs)', () => {
    const r = race(LAGS[2][1]);
    expect(r.worst).toBe(0);
    expect(r.behind).toBeGreaterThan(0.3);
    expect(r.end).toBe(0);
  });

  it('agrees exactly over many seeds of route noise, under every lag', () => {
    // Stops at the first seed and lag that disagree, naming it, so a regression fails fast.
    let bad = '';
    for (const seed of SEEDS) {
      const steps = script(seed);
      for (const [name, lag] of LAGS) {
        const r = race(lag, steps);
        if (r.worst || r.end || r.final) {
          bad = `seed ${seed}, ${name} lag: ${JSON.stringify(r)}`;
          break;
        }
      }
      if (bad) {
        break;
      }
    }
    expect(bad).toBe('');
  }, 60_000);

  /** What a run goes through: sectors visited, lowest and highest feet, head bumps, wall presses. */
  const cover = (steps: Omit<Input, 'seq'>[]) => {
    const p = spawn(0, lvl, 0);
    const seen = new Set<number>();
    let [low, high, bump] = [Infinity, 0, 0];
    let walls = 0;
    steps.forEach((step, k) => {
      const i = onWire({ ...step, seq: k });
      const [x, z] = [p.x, p.z];
      move(p, i, lvl);
      seen.add(sectorAt(lvl, p.x, p.z));
      low = Math.min(low, p.y);
      high = Math.max(high, p.y);
      // Head against the corridor ceiling.
      bump += +(sectorAt(lvl, p.x, p.z) === 1 && p.y > 3.5 - PLAYER_H - 1e-6);
      // Pushed: asked for (nearly) a full step and moved much less.
      walls += +(i.keys & KEY.FORWARD && Math.hypot(p.x - x, p.z - z) < 0.05 && p.ground);
    });
    return { seen, low, high, bump, walls };
  };

  it('makes every predicted run actually take the stairs, the pit, the walls and the jumps', () => {
    // Guards the scripts: a run that never left spawn would agree trivially.
    for (const seed of [12345, ...SEEDS]) {
      const { seen, low, high, bump, walls } = cover(script(seed));
      for (const s of [0, 1, 3, 6, 7, 8, 9, 10]) {
        expect(seen.has(s), `seed ${seed}, sector ${s}`).toBe(true);
      }
      expect(low).toBe(0);
      expect(high).toBeGreaterThan(2.6);
      expect(bump).toBeGreaterThanOrEqual(2);
      expect(walls).toBeGreaterThan(20);
    }
  });
});

describe('own player', () => {
  it('is unknown until a snapshot shows it, but numbers and keeps the inputs meanwhile', () => {
    const pred = createPredictor(lvl);
    pred.you(3);
    expect(pred.me(0)).toBeUndefined();
    expect(pred.step(fwd)).toEqual({ ...fwd, seq: 0 });
    expect(pred.step(fwd).seq).toBe(1);
    pred.snapshot(snapshot(1, snapPlayer(9)), 0);
    expect(pred.me(0)).toBeUndefined();

    // The first snapshot with the own player replays what it has not acked.
    pred.snapshot(snapshot(2, snapPlayer(3, { ack: 0 })), 10);
    expect(pred.me(1)).toMatchObject({ id: 3, x: 8, z: Math.fround(14 - 0.1) });
  });

  it('eases between the state before and after the last step', () => {
    const pred = createPredictor(lvl);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    expect(pred.me(0)!.z).toBe(14);
    pred.step(fwd);
    expect(pred.me(0)!.z).toBeCloseTo(14);
    expect(pred.me(0.5)!.z).toBeCloseTo(13.95);
    expect(pred.me(1)!.z).toBeCloseTo(13.9);
    // alpha is clamped.
    expect(pred.me(-1)!.z).toBeCloseTo(14);
    expect(pred.me(3)!.z).toBeCloseTo(13.9);
    // Yaw goes the short way round, and stays in [0, 2π).
    pred.snapshot(snapshot(2, snapPlayer(0, { yaw: 6.2, ack: 0 })), 20);
    pred.step({ keys: 0, yaw: 0.1, pitch: 0.2 });
    const yaw = pred.me(0.5)!.yaw;
    expect(yaw).toBeCloseTo(0.0084, 3);
    expect(yaw).toBeGreaterThanOrEqual(0);
    expect(yaw).toBeLessThan(2 * Math.PI);
    expect(pred.me(0.5)!.pitch).toBeCloseTo(0.1);
  });

  it('resets to the host state and replays only what is unacked', () => {
    const pred = createPredictor(lvl);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    for (let k = 0; k < 10; k++) {
      pred.step(fwd);
    }
    expect(pred.me(1)!.z).toBeCloseTo(13);
    // The host applied seqs 0..5 and is where 6 steps put it: 4 are replayed on top of it.
    pred.snapshot(snapshot(2, snapPlayer(0, { z: 13.4, ack: 5 })), 50);
    expect(pred.me(1)!.z).toBeCloseTo(13.0);
    // A host that disagrees wins: it is somewhere else and the replay starts from there.
    pred.snapshot(snapshot(3, snapPlayer(0, { z: 8, ack: 5 })), 60);
    expect(pred.me(1)!.z).toBeCloseTo(7.6);
    // Everything acked: nothing left to replay.
    pred.snapshot(snapshot(4, snapPlayer(0, { z: 8, ack: 9 })), 70);
    expect(pred.me(1)!.z).toBeCloseTo(8);
    expect(pred.me(0)!.z).toBeCloseTo(8);
  });

  it('counts acks round the u16 wrap', () => {
    const pred = createPredictor(lvl);
    pred.you(0);
    // Inputs numbered before the own player is known: only the last 120 are kept.
    for (let k = 0; k < 65534; k++) {
      pred.step(fwd);
    }
    pred.snapshot(snapshot(1, snapPlayer(0, { ack: 65530 })), 0);
    // 65531, 65532 and 65533 are unacked.
    expect(pred.me(1)!.z).toBeCloseTo(14 - 0.3);
    const wrap = [pred.step(fwd).seq, pred.step(fwd).seq, pred.step(fwd).seq, pred.step(fwd).seq];
    expect(wrap).toEqual([65534, 65535, 0, 1]);
    // The host is at 65535: 0 and 1 come after it, across the wrap.
    pred.snapshot(snapshot(2, snapPlayer(0, { z: 8, ack: 65535 })), 10);
    expect(pred.me(1)!.z).toBeCloseTo(8 - 0.2);
    pred.snapshot(snapshot(3, snapPlayer(0, { z: 8, ack: 0 })), 20);
    expect(pred.me(1)!.z).toBeCloseTo(8 - 0.1);
    pred.snapshot(snapshot(4, snapPlayer(0, { z: 8, ack: 1 })), 30);
    expect(pred.me(1)!.z).toBeCloseTo(8);
  });

  it('starts from the initial ack: the host has applied nothing, input 0 is still pending', () => {
    const pred = createPredictor(lvl);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    pred.step(fwd);
    pred.snapshot(snapshot(2, snapPlayer(0, { ack: 0xffff })), 10);
    expect(pred.me(1)!.z).toBeCloseTo(13.9);
  });

  it('keeps the pending list bounded', () => {
    const pred = createPredictor(lvl);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    for (let k = 0; k < 500; k++) {
      pred.step({ ...fwd, keys: 0 });
    }
    // Nothing acked since: only the newest 120 are replayed (12 m).
    pred.snapshot(snapshot(2, snapPlayer(0)), 10);
    expect(pred.me(1)!.z).toBe(14);
    for (let k = 0; k < 500; k++) {
      pred.step(fwd);
    }
    pred.snapshot(snapshot(3, snapPlayer(0)), 20);
    expect(pred.me(1)!.z).toBeCloseTo(14 - 12);
  });
});

describe('other players', () => {
  const at = (id: number, x: number, over: Partial<SnapPlayer> = {}) =>
    snapPlayer(id, { x, ...over });

  const fed = () => {
    const pred = createPredictor(lvl);
    pred.you(0);
    // Snapshots every 40 ms from t = 1000; player 1 runs along x, 2 leaves, 3 arrives.
    pred.snapshot(snapshot(1, at(0, 5), at(1, 10), at(2, 20)), 1000);
    pred.snapshot(snapshot(2, at(0, 5), at(1, 11), at(2, 20)), 1040);
    pred.snapshot(snapshot(3, at(0, 5), at(1, 12)), 1080);
    pred.snapshot(snapshot(4, at(0, 5), at(1, 13), at(3, 30)), 1120);
    return pred;
  };
  const x = (list: PlayerState[], id: number) => list.find(p => p.id === id)?.x;

  it('draws them INTERP_DELAY in the past, between the surrounding snapshots', () => {
    const pred = fed();
    // now - 100 = 1060: halfway between the snapshots at 1040 and 1080.
    expect(x(pred.others(1060 + INTERP_DELAY), 1)).toBeCloseTo(11.5);
    expect(x(pred.others(1040 + INTERP_DELAY), 1)).toBeCloseTo(11);
    expect(x(pred.others(1050 + INTERP_DELAY), 1)).toBeCloseTo(11.25);
  });

  it('clamps to the first and the newest snapshot', () => {
    const pred = fed();
    expect(x(pred.others(1000), 1)).toBe(10);
    expect(x(pred.others(5000), 1)).toBe(13);
    // Just past the newest: still the newest.
    expect(x(pred.others(1120 + INTERP_DELAY + 1), 1)).toBe(13);
  });

  it('leaves out the own player and the ones missing from the latest snapshot', () => {
    const pred = fed();
    const list = pred.others(1060 + INTERP_DELAY);
    expect(list.map(p => p.id).sort()).toEqual([1, 3]);
    // A newcomer is drawn where it stands, with nothing to interpolate from.
    expect(x(list, 3)).toBe(30);
    expect(pred.others(1000).map(p => p.id)).toEqual([1, 3]);
  });

  it('interpolates yaw along the shortest arc and keeps ground and vy of the newer one', () => {
    const pred = createPredictor(lvl);
    pred.you(0);
    pred.snapshot(snapshot(1, at(1, 10, { yaw: 6.2, ground: true, vy: 0 })), 1000);
    pred.snapshot(snapshot(2, at(1, 10, { yaw: 0.1, pitch: 0.4, ground: false, vy: 3 })), 1100);
    const [p] = pred.others(1050 + INTERP_DELAY);
    expect(p.yaw).toBeCloseTo(0.0084, 3);
    expect(p.pitch).toBeCloseTo(0.2);
    expect(p).toMatchObject({ ground: false, vy: 3 });
    expect(pred.others(1000 + INTERP_DELAY)[0].yaw).toBeCloseTo(6.2);
    expect(pred.others(1100 + INTERP_DELAY)[0].yaw).toBeCloseTo(0.1);
  });

  it('is empty before any snapshot, and bounds its history', () => {
    const pred = createPredictor(lvl);
    expect(pred.others(0)).toEqual([]);
    for (let k = 0; k < 200; k++) {
      pred.snapshot(snapshot(k, at(1, k)), k * 33);
    }
    expect(x(pred.others(199 * 33 + INTERP_DELAY - 33), 1)).toBeCloseTo(198);
    // Interpolating inside the kept history still works.
    expect(x(pred.others(199 * 33 + INTERP_DELAY - 16.5), 1)).toBeCloseTo(198.5);
  });
});
