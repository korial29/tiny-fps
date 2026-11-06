import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  DASH_COOLDOWN,
  DASH_TICKS,
  DOWN_TICKS,
  GUN_COOLDOWN,
  HP_MAX,
  INTERP_DELAY,
  PLAYER_H,
  RUN_SPEED,
  STEP_H,
  TICK_HZ,
} from '../shared/constants';
import { step } from '../shared/gun';
import { ROOFTOPS } from '../shared/map';
import { STILL, move, spawn, stumble } from '../shared/physics';
import { decodeInput, decodeSnapshot, encodeInput, onWire } from '../shared/protocol';
import { Room } from '../shared/room';
import { EV, KEY, MODE } from '../shared/types';
import type { Conn, Input, PlayerState, SnapPlayer, Snapshot } from '../shared/types';
import { build } from '../shared/world';
import * as lines from '../../test/lines';
import { Sim } from '../../test/pilot';
import { createPredictor } from './predict';
import { IDLE } from '../../test/teams';

const STEP = 1000 / TICK_HZ;
const world = build(ROOFTOPS);

/** A player on the start roof, running north at RUN_SPEED: a forward step is 0.1 m. */
const snapPlayer = (id: number, over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  id,
  x: 8,
  y: 10,
  z: 70,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ack: 0xffff,
  by: 0,
  ...STILL,
  vz: -RUN_SPEED,
  ...over,
});
const snapshot = (tick: number, ...players: SnapPlayer[]): Snapshot => ({
  tick,
  players,
  ...IDLE,
});
const fwd = { keys: KEY.FORWARD, yaw: 0, pitch: 0 };
/** What a hit on the host does to a player who has run out of health. */
const fell = (p: PlayerState) => Object.assign(p, { hp: 0, down: DOWN_TICKS, ammo: -1, cool: 0 });
/** The way a tackler of these tests goes: north-east. */
const TACKLE_WAY = [0.6, -0.8];

describe('prediction against the room', () => {
  /**
   * A route through ROOFTOPS, steered on a copy of the physics: the jump from the start roof to the
   * next, the stair, the platform and a head bump under it, the jump to the high roof, the 8 m gap
   * that is a fall to the kill floor and a respawn at the start, then against a pole, the face of
   * the high roof and its ledge, hopping. Keys wobble (strafing, small yaw noise) so the inputs
   * are not tidy. Each leg ends at its target or after `max` steps (a target inside a wall is a
   * press against it).
   */
  const route: { to: [number, number]; max: number; jump?: boolean; calm?: boolean }[] = [
    { to: [16, 57.5], max: 220, calm: true },
    { to: [16, 50], max: 80, jump: true, calm: true },
    { to: [13, 53.2], max: 60, calm: true },
    { to: [13, 39.3], max: 150, calm: true },
    { to: [13, 32], max: 80, jump: true, calm: true },
    { to: [14, 21], max: 200 },
    // From the edge of the high roof to the north roof, 8 m away: a fall, a respawn at the start.
    { to: [14, 8], max: 150, jump: true },
    { to: [16, 57.5], max: 220, calm: true },
    { to: [16, 50], max: 80, jump: true, calm: true },
    // Under the platform, hopping into its underside.
    { to: [16, 44], max: 80 },
    { to: [16, 40.5], max: 60, jump: true },
    { to: [16, 44], max: 60, jump: true },
    { to: [16, 40.5], max: 60, jump: true },
    { to: [16, 44], max: 60, jump: true },
    { to: [16, 40.5], max: 60, jump: true },
    // A pole, the high roof's face 2.4 m above this roof, hopping against it.
    { to: [5.2, 42.2], max: 110 },
    { to: [16, 34], max: 230 },
    { to: [16, 34], max: 60, jump: true },
  ];
  const script = (seed = 12345): Omit<Input, 'seq'>[] => {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const out: Omit<Input, 'seq'>[] = [];
    const sim = spawn(0, world, 0);
    for (const { to, max, jump, calm } of route) {
      let keys = 0;
      for (let k = 0; k < max; k++) {
        const [dx, dz] = [to[0] - sim.x, to[1] - sim.z];
        if (Math.hypot(dx, dz) < 0.3) {
          break;
        }
        if (k % 12 === 0) {
          keys =
            KEY.FORWARD |
            (rnd() < 0.2 && !calm ? KEY.LEFT : 0) |
            (rnd() < 0.2 && !calm ? KEY.RIGHT : 0);
        }
        const i = {
          // A tap on every step that starts on a floor: a hop.
          keys: keys | (jump && sim.ground ? KEY.JUMP : 0),
          yaw: Math.atan2(-dx, -dz) + (rnd() - 0.5) * 0.1,
          pitch: Math.sin(out.length / 20) * 0.5,
        };
        out.push(i);
        move(sim, onWire({ ...i, seq: 0 }), world);
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
  const race = (
    lag: (k: number) => number,
    steps = SCRIPT,
    team = 0,
    tackles: number[] = [],
    /** Inputs after which the host puts the player down, as a hit would; and whether he is alone in the room. */
    downs: number[] = [],
    alone = false,
  ) => {
    const n = steps.length;
    const room = new Room({}, ROOFTOPS);
    const sent: ArrayBuffer[] = [];
    const conn: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && conn.bins.push(d),
    };
    // Another player, so the snapshot carries two and the right one is picked. The first to join
    // is red, the second blue: `team` says which of them is the player under test.
    const other: Conn = { send: () => {} };
    const join = (c: Conn, name: string) => {
      room.connect(c);
      room.receive(c, JSON.stringify({ t: 'join', name }));
    };
    if (team) {
      join(other, 'other');
    }
    join(conn, 'me');
    if (!team) {
      join(other, 'other');
    }
    if (alone) {
      // Nobody to shoot, nobody to shoot him: the counters of hits stay his own.
      room.disconnect(other);
    }

    const pred = createPredictor(world);
    pred.you(team, team);
    const ref: PlayerState = spawn(team, world, 0, team);
    const inputs: { at: number; data: ArrayBuffer }[] = [];
    const snaps: { at: number; data: ArrayBuffer }[] = [];
    let seen = 0;
    let applied = 0;
    let stunned = 0;
    let checked = 0;
    let shots = 0;
    let fills = 0;
    let respawns = 0;
    let gun = -1;
    let lying = 0;
    let worst = 0;
    let behind = 0;
    /** Fields of the own player, after a snapshot, that differ from the reference. */
    const differing = new Set<string>();

    const gap = (a: PlayerState, b: PlayerState) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const flush = (k: number, snapAt: (k: number) => number) => {
      while (inputs.length && inputs[0].at <= k) {
        room.receive(conn, inputs.shift()!.data);
        // A tackle or a hit lands on the host between two inputs, after the n-th it applied.
        const n = applied++;
        if (tackles.includes(n)) {
          stumble(room['peers'].get(conn)!.state, TACKLE_WAY[0], TACKLE_WAY[1]);
        }
        if (downs.includes(n)) {
          fell(room['peers'].get(conn)!.state);
        }
      }
      room.tick();
      for (; seen < conn.bins.length; seen++) {
        snaps.push({ at: snapAt(k), data: conn.bins[seen] });
      }
      while (snaps.length && snaps[0].at <= k) {
        const s = decodeSnapshot(snaps.shift()!.data)!;
        const own = s.players.find(p => p.id === team)!;
        stunned += +(own.stun > 0);
        lying += +(own.down > 0);
        pred.snapshot(s, k * STEP);
        // A tackle the host has applied and this snapshot does not carry yet (after the ack, up to
        // the steps taken) is not predictable: the replay cannot know it, the reference does.
        const ack = own.ack === 0xffff ? -1 : own.ack;
        if ([...tackles, ...downs].some(t => t > ack && t <= k)) {
          continue;
        }
        checked++;
        worst = Math.max(worst, gap(pred.me(1)!, ref));
        // Every field the move continues from, not only the place: speed, mode, timers. Not the
        // look angles (me() eases them along the shortest arc, a rounding apart) nor the events.
        const me = pred.me(1)!;
        const skip = ['ev', 'fall', 'yaw', 'pitch'];
        for (const key of Object.keys(ref) as (keyof PlayerState)[]) {
          if (!skip.includes(key) && me[key] !== ref[key]) {
            differing.add(key);
          }
        }
        behind = Math.max(behind, gap(own, ref));
      }
    };

    let last = 0;
    steps.forEach((i, k) => {
      const input = pred.step(i, k * STEP);
      const had = ref.ammo;
      const fired = step(ref, input, world, team);
      shots += +fired;
      fills += +(ref.ammo > had);
      respawns += +((ref.ev & EV.RESPAWN) !== 0);
      gun = Math.max(gun, ref.ammo);
      if (tackles.includes(k)) {
        stumble(ref, TACKLE_WAY[0], TACKLE_WAY[1]);
      }
      if (downs.includes(k)) {
        fell(ref);
      }
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
    const final = decodeSnapshot(conn.bins.at(-1)!)!.players.find(p => p.id === team)!;
    return {
      worst,
      behind,
      final: gap(final, pred.me(1)!),
      end: gap(final, ref),
      differing: [...differing],
      /** Own snapshots that showed a stumble, the ones compared, and where the reference ended. */
      stunned,
      checked,
      /** Shots the reference fired, respawns it went through, the fullest its gun was, and own snapshots that showed him down. */
      shots,
      fills,
      /** Times the reference's gun was filled, and the ammo it ends with. */
      ammo: ref.ammo,
      respawns,
      gun,
      lying,
      at: [ref.x, ref.y, ref.z],
    };
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

  it('agrees with the host exactly for a blue player, who falls off the far roof and respawns at a blue spawn', () => {
    for (const [name, lag] of LAGS) {
      const r = race(lag, SCRIPT, 1);
      expect(r.worst, `${name} lag`).toBe(0);
      expect(r.end, `${name} lag`).toBe(0);
      expect(r.final, `${name} lag`).toBe(0);
      expect(r.differing, `${name} lag`).toEqual([]);
    }
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

  /**
   * The whole of ROOFTOPS in one run (see test/lines.ts): a gap by a jump, a ledge grabbed and
   * climbed, a sprint, a dash and a double jump across the chasm and back, a jump across the alley,
   * a ledge, a wall-run and a kick-off, a slide under the lintel and a beam. Flown on the real
   * physics with the wire-rounded inputs, so what the room and the predictor replay is it.
   */
  const COURSE = (() => {
    const s = Sim.at(world, 0);
    lines.gapAB(s);
    lines.ledgeBC(s);
    lines.chasm(s, 'F');
    lines.chasm(s, 'C', { sprint: true, double: 40 });
    lines.alleyCE(s);
    lines.ledgeE(s);
    lines.wallrunE(s);
    lines.slideE(s);
    lines.beamEG(s);
    return s;
  })();

  it('flies a course that uses every move: a guard, so the run below is not a trivial one', () => {
    expect([...COURSE.modes].sort()).toEqual(Object.values(MODE).sort());
    expect(COURSE.ev).toBe(Object.values(EV).reduce((a, b) => a | b, 0) & ~EV.RESPAWN);
    expect(COURSE.low).toBeGreaterThan(7.9);
    expect(COURSE.inputs.length).toBeGreaterThan(2000);
  });

  it('agrees with the host exactly on a run of every move, under every lag', () => {
    for (const [name, lag] of LAGS) {
      const r = race(lag, COURSE.inputs);
      expect(r.worst, `${name} lag`).toBe(0);
      expect(r.end, `${name} lag`).toBe(0);
      expect(r.final, `${name} lag`).toBe(0);
      // Speed, mode, time in it, the jumps and dash left, the ledge, the timers: all of them.
      expect(r.differing, `${name} lag`).toEqual([]);
      // With a lag the replay had work to do: the host state was behind the predicted one.
      expect(r.behind, `${name} lag`).toBeGreaterThanOrEqual(name === 'none' ? 0 : 0.1);
    }
  }, 60_000);

  /**
   * The input of the course at which each kind of moment first comes (20 steps apart or more): running fast
   * on the ground, in the air, on a wall, hanging, climbing, sliding and in the burst of a dash.
   */
  const MOMENTS = (() => {
    const p = spawn(0, world, 0);
    const kinds: ((q: PlayerState) => boolean)[] = [
      q => q.mode === MODE.GROUND && Math.hypot(q.vx, q.vz) > 7,
      q => q.mode === MODE.AIR && q.vy < -2,
      q => q.mode === MODE.WALLRUN,
      q => q.mode === MODE.HANG,
      q => q.mode === MODE.CLIMB,
      q => q.mode === MODE.SLIDE,
      q => q.dash > DASH_COOLDOWN - DASH_TICKS,
    ];
    const first = kinds.map(() => -1);
    COURSE.inputs.forEach((step, k) => {
      move(p, onWire({ ...step, seq: k }), world);
      kinds.forEach((is, n) => {
        first[n] = first[n] < 0 && is(p) ? k : first[n];
      });
    });
    const out: number[] = [];
    for (const k of first.sort((x, y) => x - y)) {
      if (k >= 0 && k > (out.at(-1) ?? -20) + 20) {
        out.push(k);
      }
    }
    return out;
  })();

  it('finds a tackle moment of each kind in the course', () => {
    expect(MOMENTS.length).toBeGreaterThanOrEqual(6);
  });

  it('agrees with the host exactly when a tackle lands, in every move, under every lag', () => {
    const free = race(LAGS[1][1], COURSE.inputs);
    for (const [name, lag] of LAGS) {
      const r = race(lag, COURSE.inputs, 0, MOMENTS);
      expect(r.worst, `${name} lag`).toBe(0);
      expect(r.end, `${name} lag`).toBe(0);
      expect(r.final, `${name} lag`).toBe(0);
      // The stumble itself, the timer and the knocked speed included, and the snapshots showed it.
      expect(r.differing, `${name} lag`).toEqual([]);
      expect(r.stunned, `${name} lag`).toBeGreaterThan(MOMENTS.length * 10);
      // Most snapshots were compared, the ones just before a tackle's own apart.
      expect(r.checked, `${name} lag`).toBeGreaterThan(500);
      // A guard: the tackles did change the run.
      expect(r.at, `${name} lag`).not.toEqual(free.at);
    }
  }, 60_000);

  it('agrees exactly when a tackle lands, for a blue player and many seeds', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const steps = script(seed);
      const at = [60, 200, 330, 460].filter(k => k < steps.length);
      for (const [name, lag] of LAGS) {
        const r = race(lag, steps, seed % 2, at);
        expect([r.worst, r.end, r.final, r.differing], `seed ${seed}, ${name} lag`).toEqual([
          0,
          0,
          0,
          [],
        ]);
      }
    }
  }, 60_000);

  /**
   * Random play with the trigger: from the start roof to the rack, then keys at random in bursts
   * (a run, a sprint, hops, a crouch, a dash), the look wandering, FIRE held half the time. Some
   * runs fall off the roof and come back without the gun, and fetch it again.
   */
  const play = (seed: number, team = 0, n = 1800): Omit<Input, 'seq'>[] => {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const rack = ROOFTOPS.teams[team].rack!;
    const from = ROOFTOPS.teams[team].spawns[0];
    const out: Omit<Input, 'seq'>[] = [];
    // Toward the rack, at a run.
    const yaw0 = Math.atan2(-(rack[0] - from[0]), -(rack[2] - from[2]));
    const walk = Math.ceil(Math.hypot(rack[0] - from[0], rack[2] - from[2]) * 10) + 20;
    for (let k = 0; k < walk; k++) {
      out.push({ keys: KEY.FORWARD | (k > 20 ? KEY.FIRE : 0), yaw: yaw0, pitch: 0 });
    }
    let keys = 0;
    let yaw = yaw0;
    let turn = 0;
    for (let k = out.length; k < n; k++) {
      if (k % 9 === 0) {
        keys =
          (rnd() < 0.8 ? KEY.FORWARD : 0) |
          (rnd() < 0.3 ? KEY.SPRINT : 0) |
          (rnd() < 0.2 ? KEY.JUMP : 0) |
          (rnd() < 0.1 ? KEY.CROUCH : 0) |
          (rnd() < 0.05 ? KEY.DASH : 0) |
          (rnd() < 0.5 ? KEY.FIRE : 0);
        turn = (rnd() - 0.5) * 0.1;
      }
      yaw += turn;
      out.push({ keys, yaw: ((yaw % 6.2832) + 6.2832) % 6.2832, pitch: Math.sin(k / 30) * 0.6 });
    }
    return out;
  };

  it('agrees with the host exactly on a run of random fire: ammo, cool and shots, under every lag', () => {
    for (const team of [0, 1]) {
      for (const seed of [7, 99, 2024]) {
        const steps = play(seed, team);
        for (const [name, lag] of LAGS) {
          const r = race(lag, steps, team, [], [], true);
          const label = `team ${team}, seed ${seed}, ${name} lag`;
          expect([r.worst, r.end, r.final, r.differing], label).toEqual([0, 0, 0, []]);
          // The guards: the gun was fetched at the rack and fired, many times, and went on after a fall.
          // Filled on arrival, and the step it arrives on may already fire.
          expect(r.gun, label).toBeGreaterThanOrEqual(AMMO_MAX - 1);
          expect(r.shots, label).toBeGreaterThan(10);
          expect(r.checked, label).toBeGreaterThan(500);
        }
      }
    }
  }, 60_000);

  it('agrees with the host exactly through the arrival at the rack, a long stay firing, a leave and a return', () => {
    const rack = ROOFTOPS.teams[0].rack!;
    const from = ROOFTOPS.teams[0].spawns[0];
    const yaw = Math.atan2(-(rack[0] - from[0]), -(rack[2] - from[2]));
    const d = Math.hypot(rack[0] - from[0], rack[2] - from[2]);
    const put = (n: number, keys: number) =>
      Array.from({ length: n }, () => ({ keys, yaw, pitch: 0 }));
    // In to half a metre of the rack, 200 steps standing on it with FIRE held, 40 back out of the
    // circle, 40 in again, and still.
    const steps = [
      ...put(Math.round((d - 0.5) * 10) + 3, KEY.FORWARD),
      ...put(200, KEY.FIRE),
      ...put(40, KEY.BACK),
      ...put(40, KEY.FORWARD),
      ...put(30, 0),
    ];
    for (const [name, lag] of LAGS) {
      const r = race(lag, steps, 0, [], [], true);
      expect([r.worst, r.end, r.final, r.differing], `${name} lag`).toEqual([0, 0, 0, []]);
      // Filled on arrival and on the return, and not in between: 200 steps of fire emptied it.
      expect(r.fills, `${name} lag`).toBe(2);
      expect(r.ammo, `${name} lag`).toBe(AMMO_MAX);
      expect(r.shots, `${name} lag`).toBeGreaterThan(25);
    }
  }, 60_000);

  it('agrees with the host exactly through down and respawn, under every lag: no move, no shot, then the spawn', () => {
    for (const team of [0, 1]) {
      for (const seed of [7, 99]) {
        const steps = play(seed, team);
        // Hit while firing and running, twice close together (the second lands on a body that is down) and later.
        const downs = [150, 160, 700, 701 + DOWN_TICKS, 1300];
        for (const [name, lag] of LAGS) {
          const r = race(lag, steps, team, [], downs, true);
          const label = `team ${team}, seed ${seed}, ${name} lag`;
          expect([r.worst, r.end, r.final, r.differing], label).toEqual([0, 0, 0, []]);
          // He lay down in the snapshots, and got up again at a spawn each time.
          expect(r.lying, label).toBeGreaterThan(DOWN_TICKS / 2);
          expect(r.respawns, label).toBeGreaterThanOrEqual(downs.length - 1);
          expect(r.checked, label).toBeGreaterThan(300);
        }
      }
    }
  }, 60_000);

  it('agrees with the host exactly on the course of every move with fire held and hits taken on it', () => {
    const steps = COURSE.inputs.map((i, k) => ({
      ...i,
      keys: i.keys | (k % 40 < 25 ? KEY.FIRE : 0),
    }));
    const downs = [MOMENTS[1], MOMENTS[3], MOMENTS[5]];
    for (const [name, lag] of LAGS) {
      const r = race(lag, steps, 0, [], downs, true);
      expect([r.worst, r.end, r.final, r.differing], `${name} lag`).toEqual([0, 0, 0, []]);
      expect(r.lying, `${name} lag`).toBeGreaterThan(DOWN_TICKS);
    }
  }, 60_000);

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

  /**
   * What a run goes through: the highest feet on the platform and on the high roof, the head bumps
   * under the platform, the respawns, the lowest feet, wall presses and steps up.
   */
  const cover = (steps: Omit<Input, 'seq'>[]) => {
    const p = spawn(0, world, 0);
    const c = { platform: 0, high: 0, bump: 0, respawns: 0, low: Infinity, walls: 0, stairs: 0 };
    steps.forEach((step, k) => {
      const i = onWire({ ...step, seq: k });
      const before = { ...p };
      move(p, i, world);
      c.low = Math.min(c.low, p.y);
      c.respawns += +(p.y > before.y + 5);
      if (p.ground && p.x > 9 && p.x < 19 && p.z > 39 && p.z < 47) {
        c.platform = Math.max(c.platform, p.y);
      }
      if (p.ground && p.z < 36 && p.z > 20 && p.y > 12) {
        c.high = Math.max(c.high, p.y);
      }
      // Head against the underside of the platform (feet at 12.2 - PLAYER_H on the roof below).
      c.bump += +(
        p.x > 9 &&
        p.x < 19 &&
        p.z > 39 &&
        p.z < 47 &&
        p.y > 12.2 - PLAYER_H - 1e-6 &&
        p.y < 11
      );
      // Pushed: asked for (nearly) a full step and moved much less.
      c.walls += +(
        i.keys & KEY.FORWARD &&
        Math.hypot(p.x - before.x, p.z - before.z) < 0.05 &&
        p.ground
      );
      // A step up of 0.4 m on the stair.
      c.stairs += +(p.ground && before.ground && p.y - before.y > 0.3 && p.y - before.y <= STEP_H);
    });
    return c;
  };

  it('makes every predicted run actually jump, climb, bump, fall, respawn and press on walls', () => {
    // Guards the scripts: a run that never left spawn would agree trivially.
    for (const seed of [12345, ...SEEDS]) {
      const c = cover(script(seed));
      expect(c.platform, `seed ${seed}, platform`).toBe(Math.fround(12.6));
      // 12.4 m is the roof, 12.85 m the pipe lying on it.
      expect(c.high, `seed ${seed}, high roof`).toBeGreaterThanOrEqual(Math.fround(12.4));
      expect(c.stairs, `seed ${seed}, stairs`).toBeGreaterThanOrEqual(6);
      expect(c.respawns, `seed ${seed}, respawns`).toBeGreaterThanOrEqual(1);
      expect(c.low, `seed ${seed}, low`).toBeLessThan(ROOFTOPS.floor + 5);
      expect(c.bump, `seed ${seed}, bumps`).toBeGreaterThanOrEqual(2);
      expect(c.walls, `seed ${seed}, walls`).toBeGreaterThan(10);
    }
  });
});

describe('the gun, predicted', () => {
  const FIRE = { keys: KEY.FIRE, yaw: 0, pitch: 0 };
  /** A snapshot of the own player (id 0) standing on the start roof, with the gun fields over. */
  const shown = (over: Partial<SnapPlayer>, ack = 0xffff, over2: Partial<Snapshot> = {}) => ({
    ...snapshot(1, snapPlayer(0, { vz: 0, ack, ...over })),
    ...over2,
  });

  it('fires at once on a held FIRE, every GUN_COOLDOWN steps, and shows it in the own state', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(shown({ ammo: 10, shots: 254 }), 0);
    const seen: number[] = [];
    for (let k = 0; k < 15; k++) {
      pred.step(FIRE);
      seen.push(pred.me(1)!.shots);
    }
    // Shots 254 -> 255 -> 0 -> 1, on steps 0, 7 and 14.
    expect(seen.filter((v, k) => v !== (seen[k - 1] ?? 254))).toEqual([255, 0, 1]);
    expect(pred.me(1)).toMatchObject({ ammo: 7, cool: GUN_COOLDOWN, shots: 1 });
  });

  it('resets to the host ammo and counters on a snapshot and replays the unacked fire on them', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(shown({ ammo: 10, shots: 0 }), 0);
    for (let k = 0; k < 20; k++) {
      pred.step(FIRE);
    }
    expect(pred.me(1)).toMatchObject({ ammo: 7, shots: 3 });
    // The host applied the first 8 inputs (ack 7): two shots, the second on the last of them. 12
    // are left to replay: a shot on the 15th and the cooldown 5 steps into its run.
    pred.snapshot(shown({ ammo: 8, shots: 2, cool: GUN_COOLDOWN }, 7), 50);
    expect(pred.me(1)).toMatchObject({ ammo: 7, shots: 3, cool: GUN_COOLDOWN - 5 });
    // The host and the shots it did not predict: a snapshot with fewer shots wins.
    pred.snapshot(shown({ ammo: 8, shots: 2, cool: GUN_COOLDOWN - 1 }, 19), 100);
    expect(pred.me(1)).toMatchObject({ ammo: 8, shots: 2 });
  });

  it('does not fire without a gun, and keeps its hands off hp, which is the host’s', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(shown({ ammo: -1, hp: 2 }), 0);
    for (let k = 0; k < 20; k++) {
      pred.step(FIRE);
    }
    expect(pred.me(1)).toMatchObject({ ammo: -1, shots: 0, hp: 2 });
  });

  it('does not fire while the match is over, and takes the gun again when a new one starts', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(shown({ ammo: 10 }, 0xffff, { over: true }), 0);
    pred.step(FIRE);
    expect(pred.me(1)).toMatchObject({ ammo: 10, shots: 0 });
    pred.snapshot(shown({ ammo: 10 }, 0xffff, { over: false }), 30);
    pred.step(FIRE);
    expect(pred.me(1)).toMatchObject({ ammo: 9, shots: 1 });
  });

  it('plays a player who is down with no keys, and puts him at his spawn when he gets up', () => {
    const pred = createPredictor(world);
    pred.you(0, 0);
    pred.snapshot(shown({ hp: 0, down: 3, ammo: -1, vz: 0 }), 0);
    const down = { keys: KEY.FORWARD | KEY.FIRE | KEY.JUMP, yaw: 0, pitch: 0 };
    pred.step(down);
    pred.step(down);
    expect(pred.me(1)).toMatchObject({ x: 8, y: 10, z: 70, down: 1, hp: 0, shots: 0 });
    pred.step(down);
    const [sx, sy, sz] = ROOFTOPS.teams[0].spawns[0];
    expect(pred.me(1)).toMatchObject({ x: sx, y: sy, z: sz, down: 0, hp: HP_MAX, ammo: -1 });
    expect(pred.events().ev & EV.RESPAWN).toBe(EV.RESPAWN);
  });

  it('keeps the ammo of the own state when others fire: the others’ shots are only counters', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0), snapPlayer(1, { shots: 3, ammo: 20, hp: 4 })), 0);
    pred.snapshot(snapshot(3, snapPlayer(0), snapPlayer(1, { shots: 4, ammo: 19, hp: 3 })), 66);
    expect(pred.others(66 + INTERP_DELAY)[0]).toMatchObject({ id: 1, shots: 4, ammo: 19, hp: 3 });
    // Between two snapshots the gun fields are the newer one's, like the other discrete fields.
    expect(pred.others(33 + INTERP_DELAY)[0]).toMatchObject({ shots: 4, hp: 3 });
    expect(AMMO_MAX).toBe(60);
  });
});

describe('own player', () => {
  it('is unknown until a snapshot shows it, but numbers and keeps the inputs meanwhile', () => {
    const pred = createPredictor(world);
    pred.you(3);
    expect(pred.me(0)).toBeUndefined();
    expect(pred.step(fwd)).toEqual({ ...fwd, seq: 0 });
    expect(pred.step(fwd).seq).toBe(1);
    pred.snapshot(snapshot(1, snapPlayer(9)), 0);
    expect(pred.me(0)).toBeUndefined();

    // The first snapshot with the own player replays what it has not acked.
    pred.snapshot(snapshot(2, snapPlayer(3, { ack: 0 })), 10);
    expect(pred.me(1)).toMatchObject({ id: 3, x: 8, z: Math.fround(70 - 0.1) });
  });

  it('reports what happened in its live steps once: the events or-ed, the fastest landing', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0, { vz: 0 })), 0);
    expect(pred.events()).toEqual({ ev: 0, fall: 0 });
    // A jump, then a fall back to the roof: JUMP, then LAND with the speed it came down at.
    pred.step({ keys: KEY.JUMP, yaw: 0, pitch: 0 });
    expect(pred.events()).toEqual({ ev: EV.JUMP, fall: 0 });
    expect(pred.events()).toEqual({ ev: 0, fall: 0 });
    let all = 0;
    let fall = 0;
    for (let k = 0; k < 60; k++) {
      pred.step({ keys: 0, yaw: 0, pitch: 0 });
      const e = pred.events();
      all |= e.ev;
      fall = Math.max(fall, e.fall);
    }
    expect(all).toBe(EV.LAND);
    expect(fall).toBeGreaterThan(6);
    // A snapshot replays the steps it has not acked: that is not a second jump.
    pred.step({ keys: KEY.JUMP, yaw: 0, pitch: 0 });
    pred.events();
    pred.snapshot(snapshot(2, snapPlayer(0, { vz: 0 })), 100);
    expect(pred.events()).toEqual({ ev: 0, fall: 0 });
    expect(pred.me(1)!.ground).toBe(false);
  });

  it('eases between the state before and after the last step', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    expect(pred.me(0)!.z).toBe(70);
    pred.step(fwd);
    expect(pred.me(0)!.z).toBeCloseTo(70);
    expect(pred.me(0.5)!.z).toBeCloseTo(69.95);
    expect(pred.me(1)!.z).toBeCloseTo(69.9);
    // alpha is clamped.
    expect(pred.me(-1)!.z).toBeCloseTo(70);
    expect(pred.me(3)!.z).toBeCloseTo(69.9);
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
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    for (let k = 0; k < 10; k++) {
      pred.step(fwd);
    }
    expect(pred.me(1)!.z).toBeCloseTo(69);
    // The host applied seqs 0..5 and is where 6 steps put it: 4 are replayed on top of it.
    pred.snapshot(snapshot(2, snapPlayer(0, { z: 69.4, ack: 5 })), 50);
    expect(pred.me(1)!.z).toBeCloseTo(69);
    // A host that disagrees wins: it is somewhere else and the replay starts from there.
    pred.snapshot(snapshot(3, snapPlayer(0, { z: 64, ack: 5 })), 60);
    expect(pred.me(1)!.z).toBeCloseTo(63.6);
    // Everything acked: nothing left to replay.
    pred.snapshot(snapshot(4, snapPlayer(0, { z: 64, ack: 9 })), 70);
    expect(pred.me(1)!.z).toBeCloseTo(64);
    expect(pred.me(0)!.z).toBeCloseTo(64);
  });

  it('keeps the ack and the tackler out of the states it hands out, own and others', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(
      snapshot(1, snapPlayer(0, { stun: 30, by: 3, ack: 5 }), snapPlayer(1, { stun: 20, by: 2 })),
      0,
    );
    const [mine] = [pred.me(1)!];
    expect(mine.stun).toBe(30);
    expect(mine).not.toHaveProperty('by');
    expect(mine).not.toHaveProperty('ack');
    const [other] = pred.others(0);
    expect(other.stun).toBe(20);
    expect(other).not.toHaveProperty('by');
  });

  it('counts acks round the u16 wrap', () => {
    const pred = createPredictor(world);
    pred.you(0);
    // Inputs numbered before the own player is known: only the last 120 are kept.
    for (let k = 0; k < 65534; k++) {
      pred.step(fwd);
    }
    pred.snapshot(snapshot(1, snapPlayer(0, { ack: 65530 })), 0);
    // 65531, 65532 and 65533 are unacked.
    expect(pred.me(1)!.z).toBeCloseTo(70 - 0.3);
    const wrap = [pred.step(fwd).seq, pred.step(fwd).seq, pred.step(fwd).seq, pred.step(fwd).seq];
    expect(wrap).toEqual([65534, 65535, 0, 1]);
    // The host is at 65535: 0 and 1 come after it, across the wrap.
    pred.snapshot(snapshot(2, snapPlayer(0, { z: 64, ack: 65535 })), 10);
    expect(pred.me(1)!.z).toBeCloseTo(64 - 0.2);
    pred.snapshot(snapshot(3, snapPlayer(0, { z: 64, ack: 0 })), 20);
    expect(pred.me(1)!.z).toBeCloseTo(64 - 0.1);
    pred.snapshot(snapshot(4, snapPlayer(0, { z: 64, ack: 1 })), 30);
    expect(pred.me(1)!.z).toBeCloseTo(64);
  });

  it('starts from the initial ack: the host has applied nothing, input 0 is still pending', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    pred.step(fwd);
    pred.snapshot(snapshot(2, snapPlayer(0, { ack: 0xffff })), 10);
    expect(pred.me(1)!.z).toBeCloseTo(69.9);
  });

  it('keeps the pending list bounded', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(snapshot(1, snapPlayer(0)), 0);
    for (let k = 0; k < 500; k++) {
      pred.step({ ...fwd, keys: 0 });
    }
    // Nothing acked since: only the newest 120 are replayed (12 m).
    pred.snapshot(snapshot(2, snapPlayer(0, { vz: 0 })), 10);
    expect(pred.me(1)!.z).toBe(70);
    for (let k = 0; k < 500; k++) {
      pred.step(fwd);
    }
    pred.snapshot(snapshot(3, snapPlayer(0, { vz: 0 })), 20);
    expect(pred.me(1)!.z).toBeCloseTo(70 - 12, 0);
  });
});

describe('other players', () => {
  const at = (id: number, x: number, over: Partial<SnapPlayer> = {}) =>
    snapPlayer(id, { x, ...over });

  const fed = () => {
    const pred = createPredictor(world);
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
    const pred = createPredictor(world);
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
    const pred = createPredictor(world);
    expect(pred.others(0)).toEqual([]);
    for (let k = 0; k < 200; k++) {
      pred.snapshot(snapshot(k, at(1, k)), k * 33);
    }
    expect(x(pred.others(199 * 33 + INTERP_DELAY - 33), 1)).toBeCloseTo(198);
    // Interpolating inside the kept history still works.
    expect(x(pred.others(199 * 33 + INTERP_DELAY - 16.5), 1)).toBeCloseTo(198.5);
  });
});

describe('view tick', () => {
  const pred = () => {
    const p = createPredictor(world);
    p.you(0);
    return p;
  };
  const idle = { keys: 0, yaw: 0, pitch: 0 };

  it('is the snapshot tick the others are drawn at, interpolated like their positions', () => {
    const p = pred();
    p.snapshot(snapshot(10, snapPlayer(0)), 1000);
    p.snapshot(snapshot(14, snapPlayer(0)), 1100);
    expect(p.step(idle, 1050 + INTERP_DELAY).view).toBe(12);
    expect(p.step(idle, 1025 + INTERP_DELAY).view).toBe(11);
    // Clamped to the first and the newest snapshot, like the others.
    expect(p.step(idle, 0).view).toBe(10);
    expect(p.step(idle, 9000).view).toBe(14);
  });

  it('goes the short way round the u16 tick circle, and stays in [0, 65536)', () => {
    const p = pred();
    p.snapshot(snapshot(65534, snapPlayer(0)), 1000);
    p.snapshot(snapshot(2, snapPlayer(0)), 1100);
    expect(p.step(idle, 1000 + INTERP_DELAY).view).toBe(65534);
    expect(p.step(idle, 1025 + INTERP_DELAY).view).toBe(65535);
    expect(p.step(idle, 1050 + INTERP_DELAY).view).toBe(0);
    expect(p.step(idle, 1075 + INTERP_DELAY).view).toBe(1);
    expect(p.step(idle, 1100 + INTERP_DELAY).view).toBe(2);
  });

  it('is rounded to the wire, and absent without a clock or a snapshot', () => {
    const p = pred();
    expect(p.step(idle, 5000).view).toBeUndefined();
    p.snapshot(snapshot(10, snapPlayer(0)), 1000);
    p.snapshot(snapshot(13, snapPlayer(0)), 1100);
    const i = p.step(idle, 1033 + INTERP_DELAY);
    expect(i.view).not.toBe(10 + 3 * 0.33);
    expect(i.view).toBe(Math.round(i.view! * 256) / 256);
    expect(i.view).toBeCloseTo(10.99, 1);
    expect(decodeInput(encodeInput(i))!.view).toBe(i.view);
    expect(p.step(idle).view).toBeUndefined();
  });
});

describe('lag compensation through the room', () => {
  const STEP = 1000 / TICK_HZ;
  /** Steps an input takes to reach the host. */
  const LATENCY = 4;
  const PROBE_AT = 60;

  /**
   * B runs sideways at 6 m/s while A's client draws it INTERP_DELAY late. At step `PROBE_AT` A's
   * input (with its view tick) is sent, and when it reaches the host the room rewinds B to it.
   */
  const play = () => {
    const room = new Room({}, ROOFTOPS);
    const peers = ['A', 'B'].map(name => {
      const c: Conn & { bins: ArrayBuffer[] } = {
        bins: [],
        send: d => typeof d !== 'string' && c.bins.push(d),
      };
      room.connect(c);
      room.receive(c, JSON.stringify({ t: 'join', name }));
      return c;
    });
    const [a, b] = peers;
    const pred = createPredictor(world);
    pred.you(0);
    // B at spawn 1 runs sideways, +x, 6 m/s. The reference is what the host holds for it.
    const bHost = spawn(1, world, 0, 1);
    const inFlight: { at: number; data: ArrayBuffer }[] = [];
    let seen = 0;
    let sent: Input | undefined;
    let drawn: PlayerState | undefined;
    let arrival: PlayerState | undefined;
    let rewound: PlayerState | undefined;

    for (let k = 0; k < PROBE_AT + 20; k++) {
      const now = k * STEP;
      const bIn = { seq: k, keys: KEY.RIGHT, yaw: 0, pitch: 0 };
      room.receive(b, encodeInput(bIn));
      move(bHost, bIn, world);
      while (inFlight.length && inFlight[0].at <= k) {
        const { data } = inFlight.shift()!;
        // B as the host holds it, and as it rewinds it, when the probe input arrives.
        if (sent && decodeInput(data)!.seq === sent.seq) {
          arrival = { ...bHost };
          rewound = room.rewind(0, decodeInput(data)!.view).find(p => p.id === 1);
        }
        room.receive(a, data);
      }
      room.tick();
      for (; seen < a.bins.length; seen++) {
        pred.snapshot(decodeSnapshot(a.bins[seen])!, now);
      }
      const input = pred.step({ keys: 0, yaw: 0, pitch: 0 }, now);
      if (k === PROBE_AT) {
        // B as the client draws it at this step.
        [sent, drawn] = [input, pred.others(now).find(p => p.id === 1)];
      }
      inFlight.push({ at: k + LATENCY, data: encodeInput(input) });
    }
    return { sent: sent!, drawn: drawn!, arrival: arrival!, rewound: rewound! };
  };

  it('rewinds B to where the client drew it, which is no longer where B is', () => {
    const r = play();
    // B has run on: at the host it is well clear of where it was drawn (about 100 ms plus the
    // latency back, at 6 m/s).
    expect(r.arrival.x - r.drawn.x).toBeGreaterThan(0.9);
    // The rewind puts it where the client drew it.
    expect(r.rewound.x).toBeCloseTo(r.drawn.x, 2);
    expect(r.rewound.y).toBeCloseTo(r.drawn.y, 2);
    expect(r.rewound.z).toBeCloseTo(r.drawn.z, 2);
  });

  it('carries a view tick on the input that is behind the host tick by the interpolation delay', () => {
    const r = play();
    const ticksBack = PROBE_AT + 1 + LATENCY - r.sent.view!;
    // 100 ms is 6 ticks; the delivery of the snapshots adds up to a snapshot interval.
    expect(ticksBack).toBeGreaterThan((INTERP_DELAY * TICK_HZ) / 1000 + LATENCY - 2);
    expect(ticksBack).toBeLessThan((INTERP_DELAY * TICK_HZ) / 1000 + LATENCY + 4);
  });
});
