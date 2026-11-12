import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  GUN_MAG,
  AMMO_PACK,
  CHARGE_MAX,
  CHARGE_TICKS,
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
  NADE_MAX,
} from '../shared/constants';
import { STRIKE, step } from '../shared/gun';
import { ROOFTOPS } from '../shared/map';
import { STILL, move, spawn, stumble } from '../shared/physics';
import { decodeInput, decodeSnapshot, encodeInput, onWire } from '../shared/protocol';
import { Room } from '../shared/room';
import { ROVER, park, seat } from '../shared/rover';
import { EV, KEY, MODE, NOBODY } from '../shared/types';
import type { Conn, Input, PlayerState, Rover, SnapPlayer, Snapshot } from '../shared/types';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import * as lines from '../../test/lines';
import { loaded } from '../../test/loaded';
import { Sim } from '../../test/pilot';
import * as ride from '../../test/ride';
import { land, ramp } from '../../test/slope';
import { ROVER_BLEND, createPredictor } from './predict';
import { IDLE, duo } from '../../test/teams';

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
/** What an ammo pack does on the host: 20 shots more up to the full gun, for a gun that is there. */
const grant = (p: PlayerState): boolean => {
  const had = p.ammo;
  p.ammo = p.ammo < 0 ? p.ammo : Math.min(AMMO_MAX, p.ammo + AMMO_PACK);
  return p.ammo !== had;
};
/** What a hit on the host does to a player who has run out of health. */
const fell = (p: PlayerState) =>
  Object.assign(p, {
    hp: 0,
    down: DOWN_TICKS,
    ammo: -1,
    cool: 0,
    blade: false,
    wield: false,
    swing: 0,
  });
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
    /**
     * `grants`: inputs after which the host adds an ammo pack to his gun, as it does at one; `def`:
     * the map the room and the predictor play, ROOFTOPS unless told.
     */
    { grants = [], def = ROOFTOPS }: { grants?: number[]; def?: WorldDef } = {},
  ) => {
    const n = steps.length;
    const map = def === ROOFTOPS ? world : build(def);
    const room = new Room({}, def);
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

    const pred = createPredictor(map);
    pred.you(team, team);
    const ref: PlayerState = spawn(team, world, 0, team);
    const inputs: { at: number; data: ArrayBuffer }[] = [];
    const snaps: { at: number; data: ArrayBuffer }[] = [];
    let seen = 0;
    let applied = 0;
    let stunned = 0;
    let checked = 0;
    let shots = 0;
    let cuts = 0;
    let lobs = 0;
    let wielded = 0;
    let fills = 0;
    let granted = 0;
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
        if (grants.includes(n)) {
          grant(room['peers'].get(conn)!.state);
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
        if ([...tackles, ...downs, ...grants].some(t => t > ack && t <= k)) {
          continue;
        }
        checked++;
        worst = Math.max(worst, gap(pred.me(1)!, ref));
        // Every field the move continues from, not only the place: speed, mode, timers. Not the
        // look angles (me() eases them along the shortest arc, a rounding apart) nor what a step
        // leaves for the host to read (the events, the fall, the last shot's power).
        const me = pred.me(1)!;
        const skip = ['ev', 'fall', 'power', 'yaw', 'pitch'];
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
      const fired = step(ref, input, map, team);
      shots += +(fired === STRIKE.SHOT);
      cuts += +(fired === STRIKE.CUT);
      lobs += +(fired === STRIKE.NADE);
      wielded += +!!ref.wield;
      fills += +(ref.ammo > had);
      respawns += +((ref.ev & EV.RESPAWN) !== 0);
      gun = Math.max(gun, ref.ammo);
      if (tackles.includes(k)) {
        stumble(ref, TACKLE_WAY[0], TACKLE_WAY[1]);
      }
      if (downs.includes(k)) {
        fell(ref);
      }
      if (grants.includes(k)) {
        granted += +grant(ref);
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
      /** Cuts that struck, and the steps the reference had the katana in hand. */
      cuts,
      /** Grenades the reference launched. */
      lobs,
      wielded,
      fills,
      /** Ammo packs the reference took, and the fields of the host's last snapshot that the prediction does not match. */
      granted,
      hostAmmo: final.ammo,
      lastDiffering: (Object.keys(ref) as (keyof PlayerState)[]).filter(
        key =>
          !['ev', 'fall', 'power', 'yaw', 'pitch'].includes(key) && final[key] !== pred.me(1)![key],
      ),
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
    // Every mode a runner gets into on foot: RIDE is a rover's seat.
    expect([...COURSE.modes].sort()).toEqual(
      Object.values(MODE)
        .filter(m => m !== MODE.RIDE)
        .sort(),
    );
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
   * (a run, a sprint, hops, a crouch, a dash), the look wandering, FIRE tapped in a third of them
   * and held (a charge, let go at the burst's end) in a third. Some runs fall off the roof and come
   * back without the gun, and fetch it again.
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
      out.push({ keys: KEY.FORWARD | (k > 20 && k % 2 ? KEY.FIRE : 0), yaw: yaw0, pitch: 0 });
    }
    let keys = 0;
    let fire = 0;
    let yaw = yaw0;
    let turn = 0;
    for (let k = out.length; k < n; k++) {
      if (k % 9 === 0) {
        keys =
          (rnd() < 0.8 ? KEY.FORWARD : 0) |
          (rnd() < 0.3 ? KEY.SPRINT : 0) |
          (rnd() < 0.2 ? KEY.JUMP : 0) |
          (rnd() < 0.1 ? KEY.CROUCH : 0) |
          (rnd() < 0.05 ? KEY.DASH : 0);
        fire = Math.floor(rnd() * 3);
        turn = (rnd() - 0.5) * 0.1;
      }
      yaw += turn;
      // Tapped, or held to the burst's last step.
      const held = fire === 1 ? k % 2 === 0 : fire === 2 && k % 9 < 8;
      out.push({
        keys: keys | (held ? KEY.FIRE : 0),
        yaw: ((yaw % 6.2832) + 6.2832) % 6.2832,
        pitch: Math.sin(k / 30) * 0.6,
      });
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

  it('agrees with the host exactly with the rifle’s launcher: the rack, the grenades, their cooldown and the rounds between, under every lag', () => {
    const rack = ROOFTOPS.teams[0].rifle!;
    const from = ROOFTOPS.teams[0].spawns[0];
    const yaw = Math.atan2(-(rack[0] - from[0]), -(rack[2] - from[2]));
    const d = Math.hypot(rack[0] - from[0], rack[2] - from[2]);
    const put = (n: number, keys: (k: number) => number) =>
      Array.from({ length: n }, (_, k) => ({ keys: keys(k), yaw, pitch: 0.4 }));
    // To the rifle's rack, then 300 steps with it in hand: FIRE held in bursts, a double click
    // every 37 steps (some inside the cooldown, more than the launcher holds).
    const steps = [
      ...put(Math.round((d - 0.5) * 10) + 3, () => KEY.FORWARD),
      ...put(
        300,
        k => KEY.RIFLE | (k % 50 < 30 ? KEY.FIRE : 0) | (k % 37 === 5 ? KEY.FIRE | KEY.SPECIAL : 0),
      ),
    ];
    for (const [name, lag] of LAGS) {
      const r = race(lag, steps, 0, [], [], true);
      expect([r.worst, r.end, r.final, r.differing], `${name} lag`).toEqual([0, 0, 0, []]);
      expect(r.lastDiffering, `${name} lag`).toEqual([]);
      expect(r.lobs, `${name} lag`).toBe(NADE_MAX);
    }
  }, 60_000);

  it('agrees with the host exactly through the arrival at the rack, a long stay firing, a leave and a return', () => {
    const rack = ROOFTOPS.teams[0].rack!;
    const from = ROOFTOPS.teams[0].spawns[0];
    const yaw = Math.atan2(-(rack[0] - from[0]), -(rack[2] - from[2]));
    const d = Math.hypot(rack[0] - from[0], rack[2] - from[2]);
    const put = (n: number, keys: number) =>
      Array.from({ length: n }, (_, k) => ({
        keys: keys & (k % 2 ? ~KEY.FIRE : ~0),
        yaw,
        pitch: 0,
      }));
    // In to half a metre of the rack, 240 steps standing on it tapping FIRE (a battery, its 1.3 s
    // swap and on), 40 back out of the circle, 40 in again, and still.
    const steps = [
      ...put(Math.round((d - 0.5) * 10) + 3, KEY.FORWARD),
      ...put(240, KEY.FIRE),
      ...put(40, KEY.BACK),
      ...put(40, KEY.FORWARD),
      ...put(30, 0),
    ];
    for (const [name, lag] of LAGS) {
      const r = race(lag, steps, 0, [], [], true);
      expect([r.worst, r.end, r.final, r.differing], `${name} lag`).toEqual([0, 0, 0, []]);
      // Filled on arrival and on the return, and not in between: 240 steps of taps spent a
      // battery, swapped it and went on.
      expect(r.fills, `${name} lag`).toBe(2);
      expect(r.ammo, `${name} lag`).toBe(AMMO_MAX);
      expect(r.shots, `${name} lag`).toBeGreaterThanOrEqual(GUN_MAG + 3);
    }
  }, 60_000);

  it('agrees with the host exactly when an ammo pack lands between two inputs, under every lag', () => {
    // The pick-up is the host's, like a hit: the snapshot carries the new ammo and the replay of the
    // unacked inputs goes on from it. Here it lands at known inputs, the reference with it.
    for (const team of [0, 1]) {
      for (const seed of [7, 99]) {
        const steps = play(seed, team);
        for (const [name, lag] of LAGS) {
          const r = race(lag, steps, team, [], [], true, { grants: [300, 301, 700, 1100] });
          const label = `team ${team}, seed ${seed}, ${name} lag`;
          expect([r.worst, r.end, r.final, r.differing], label).toEqual([0, 0, 0, []]);
          expect(r.granted, label).toBeGreaterThanOrEqual(1);
          expect(r.checked, label).toBeGreaterThan(500);
        }
      }
    }
  }, 60_000);

  it('agrees with the host in the end when a real ammo pack on the start roof is run over with the gun half empty', () => {
    const rack = ROOFTOPS.teams[0].rack!;
    const pack: [number, number, number] = [14, 10, 66];
    const from = ROOFTOPS.teams[0].spawns[0];
    const to = (a: number[], b: number[]) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    const d = Math.hypot(rack[0] - from[0], rack[2] - from[2]);
    const put = (n: number, keys: number, yaw: number) =>
      Array.from({ length: n }, (_, k) => ({
        keys: keys & (k % 2 ? ~KEY.FIRE : ~0),
        yaw,
        pitch: 0,
      }));
    // To the rack, 200 steps of taps on it, then over the pack tapping on, and still.
    const steps = [
      ...put(Math.round((d - 0.5) * 10) + 3, KEY.FORWARD, to(from, rack)),
      ...put(200, KEY.FIRE, to(from, rack)),
      ...put(60, KEY.FORWARD | KEY.FIRE, to(rack, pack)),
      ...put(60, KEY.FIRE, to(rack, pack)),
    ];
    for (const [name, lag] of LAGS) {
      const r = race(lag, steps, 0, [], [], true, { def: { ...ROOFTOPS, ammo: [pack] } });
      // The reference has no pack: the host's gun is fuller, and the prediction matches the host.
      expect(r.hostAmmo, `${name} lag`).toBeGreaterThan(r.ammo);
      expect(r.lastDiffering, `${name} lag`).toEqual([]);
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

  /**
   * Random play with both weapons: from the spawn to the gun rack, then to the katana rack beside
   * it, then keys at random in bursts (a walk, a hop, a side step, FIRE half of the time, BLADE
   * half of the time), the look wandering over the roof.
   */
  const fence = (seed: number, team = 0, n = 1800): Omit<Input, 'seq'>[] => {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const { rack, blade, spawns } = ROOFTOPS.teams[team];
    const to = (a: number[], b: number[]) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    const out: Omit<Input, 'seq'>[] = [];
    const walk = (a: number[], b: number[], keep: number) => {
      const yaw = to(a, b);
      const steps = Math.ceil((Math.hypot(b[0] - a[0], b[2] - a[2]) - keep) * 10) + 3;
      for (let k = 0; k < steps; k++) {
        out.push({ keys: KEY.FORWARD, yaw, pitch: 0 });
      }
    };
    walk(spawns[0], rack!, 0.5);
    walk(rack!, blade!, 0.5);
    let keys = 0;
    let yaw = to(rack!, blade!);
    let turn = 0;
    for (let k = out.length; k < n; k++) {
      if (k % 9 === 0) {
        keys =
          (rnd() < 0.3 ? KEY.FORWARD : 0) |
          (rnd() < 0.15 ? KEY.BACK : 0) |
          (rnd() < 0.25 ? KEY.LEFT : 0) |
          (rnd() < 0.25 ? KEY.RIGHT : 0) |
          (rnd() < 0.05 ? KEY.JUMP : 0) |
          (rnd() < 0.05 ? KEY.CROUCH : 0) |
          (rnd() < 0.7 ? KEY.FIRE : 0) |
          (rnd() < 0.5 ? KEY.BLADE : 0);
        turn = (rnd() - 0.5) * 0.08;
      }
      yaw += turn;
      // FIRE tapped: a swing starts on a press, and the gun fires on a release.
      out.push({
        keys: keys & (k % 2 ? ~KEY.FIRE : ~0),
        yaw: ((yaw % 6.2832) + 6.2832) % 6.2832,
        pitch: Math.sin(k / 30) * 0.3,
      });
    }
    return out;
  };

  it('agrees with the host exactly with the katana: the rack, the weapon in hand, the swing and its strike, under every lag', () => {
    for (const team of [0, 1]) {
      for (const seed of [7, 99, 2024]) {
        const steps = fence(seed, team);
        for (const [name, lag] of LAGS) {
          const r = race(lag, steps, team, [], [], true);
          const label = `team ${team}, seed ${seed}, ${name} lag`;
          expect([r.worst, r.end, r.final, r.differing], label).toEqual([0, 0, 0, []]);
          // The guards: he took the katana and swung it, struck many times, and fired the gun too.
          expect(r.cuts, label).toBeGreaterThan(8);
          expect(r.wielded, label).toBeGreaterThan(300);
          expect(r.shots, label).toBeGreaterThan(6);
          expect(r.checked, label).toBeGreaterThan(500);
        }
      }
    }
  }, 60_000);

  it('agrees with the host exactly when he goes down with the katana in hand and swinging, and gets up without it', () => {
    for (const team of [0, 1]) {
      const steps = fence(31, team);
      const downs = [400, 401, 800, 801 + DOWN_TICKS, 1300];
      for (const [name, lag] of LAGS) {
        const r = race(lag, steps, team, [], downs, true);
        const label = `team ${team}, ${name} lag`;
        expect([r.worst, r.end, r.final, r.differing], label).toEqual([0, 0, 0, []]);
        expect(r.respawns, label).toBeGreaterThanOrEqual(downs.length - 1);
        expect(r.cuts, label).toBeGreaterThan(5);
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
  const LET_GO = { keys: 0, yaw: 0, pitch: 0 };
  /** FIRE pressed on even steps and let go on odd ones: a tap fires on its release. */
  const tapping = (k: number) => (k % 2 ? LET_GO : FIRE);
  /** A snapshot of the own player (id 0) standing on the start roof, with the gun fields over. */
  const shown = (over: Partial<SnapPlayer>, ack = 0xffff, over2: Partial<Snapshot> = {}) => ({
    ...snapshot(1, snapPlayer(0, loaded({ vz: 0, ack, ...over }))),
    ...over2,
  });

  it('fires a tap on its release, the next after the cooldown, and shows it in the own state', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(shown({ ammo: 10, shots: 254 }), 0);
    const seen: number[] = [];
    for (let k = 0; k < 18; k++) {
      pred.step(tapping(k));
      seen.push(pred.me(1)!.shots);
    }
    // Shots 254 -> 255 -> 0 -> 1, on the releases of steps 1, 9 and 17.
    expect(seen.flatMap((v, k) => (v !== (seen[k - 1] ?? 254) ? [k] : []))).toEqual([1, 9, 17]);
    expect(pred.me(1)).toMatchObject({ ammo: 7, cool: GUN_COOLDOWN, shots: 1 });
  });

  it('charges on a held FIRE, shows the charge in the own state, and fires it whole when let go', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(shown({ ammo: 10 }), 0);
    for (let k = 0; k < CHARGE_TICKS; k++) {
      pred.step(FIRE);
    }
    expect(pred.me(1)).toMatchObject({ ammo: 10, shots: 0, charge: CHARGE_TICKS });
    pred.step(LET_GO);
    expect(pred.me(1)).toMatchObject({ ammo: 10 - CHARGE_MAX, shots: 1, charge: 0 });
  });

  it('resets to the host ammo and counters on a snapshot and replays the unacked fire on them', () => {
    const pred = createPredictor(world);
    pred.you(0);
    pred.snapshot(shown({ ammo: 10, shots: 0 }), 0);
    for (let k = 0; k < 20; k++) {
      pred.step(tapping(k));
    }
    expect(pred.me(1)).toMatchObject({ ammo: 7, shots: 3 });
    // The host applied the first 8 inputs (ack 7): one shot, on the release of step 1, and the
    // cooldown down to 1. 12 are left to replay: shots on steps 9 and 17, and the cooldown 2 steps
    // into its run.
    pred.snapshot(shown({ ammo: 9, shots: 1, cool: 1 }, 7), 50);
    expect(pred.me(1)).toMatchObject({ ammo: 7, shots: 3, cool: GUN_COOLDOWN - 2 });
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
    pred.step(LET_GO);
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

describe('the rover, predicted against the room', () => {
  const { EAST, STEP: DT } = ride;
  /** The player's spawn at the origin, a rover 2.5 m east of it with its nose to the east. */
  const flat = ride.lot();
  /** The same with a 20 degree ramp across the way, from x = 40 to x = 60, and its drop. */
  const jump = ride.lot(ramp(20));

  it('agrees with the host while driving, under every lag', () => {
    for (const [name, lag] of ride.LAGS) {
      for (const seed of [7, 99]) {
        const r = ride.drive(flat, ride.trip(420, seed), lag);
        expect([name, r.differing]).toEqual([name, []]);
        expect([name, r.final]).toEqual([name, []]);
        expect(r.checked).toBeGreaterThan(100);
        expect(r.driving).toBeGreaterThan(400);
        expect(r.pred.riding()).toEqual({ rover: 0, seat: 0 });
        expect(r.pred.rovers(1e9, 1)[0]).toEqual(r.car);
        // He went somewhere, and his body is on the driver's seat.
        expect(Math.hypot(r.car.x - 2.5, r.car.z)).toBeGreaterThan(30);
        const sat = { ...r.host };
        seat(sat, r.car, 0);
        expect(r.pred.me(1)).toMatchObject({ x: sat.x, y: sat.y, z: sat.z, mode: MODE.RIDE });
      }
    }
  });

  it('agrees with the host through a jump and a landing', () => {
    for (const [name, lag] of ride.LAGS) {
      const r = ride.drive(jump, ride.trip(480, 7, true), lag);
      expect([name, r.differing]).toEqual([name, []]);
      expect([name, r.final]).toEqual([name, []]);
      expect(r.flew).toBeGreaterThan(30);
      expect(r.landed).toBeGreaterThan(60);
      expect(r.car.x).toBeGreaterThan(70);
      expect(r.pred.rovers(1e9, 1)[0]).toEqual(r.car);
    }
  });

  it('agrees with the host through an enemy run over', () => {
    for (const [name, lag] of ride.LAGS) {
      const r = ride.drive(flat, ride.trip(240, 7, true), lag, {
        setup: (_, foe) => Object.assign(foe, { x: 32, z: 0 }),
      });
      expect(r.foe.down).toBeGreaterThan(0);
      expect(r.host.hits).toBe(1);
      expect([name, r.differing]).toEqual([name, []]);
      expect([name, r.final]).toEqual([name, []]);
      expect(r.pred.rovers(1e9, 1)[0]).toEqual(r.car);
    }
  });

  it('agrees with the host when the driver gets out at speed, and walks on', () => {
    const out: ride.Keys[] = [
      ...ride.trip(150, 7, true),
      { keys: KEY.USE | KEY.FORWARD, yaw: EAST, pitch: 0 },
      ...Array.from({ length: 240 }, (_, k) => ({
        keys: KEY.FORWARD | (k % 30 === 10 ? KEY.JUMP : 0),
        yaw: EAST + 0.4,
        pitch: 0,
      })),
    ];
    const exit = out.findIndex((i, k) => k > 10 && i.keys & KEY.USE);
    for (const [name, lag] of ride.LAGS) {
      /** The rover as drawn on each frame, and whether he was in it. */
      const drawn: { x: number; in: boolean }[] = [];
      const r = ride.drive(flat, out, lag, {
        each: (pred, now) =>
          drawn.push({ x: pred.rovers(now, 1)[0]?.x ?? 2.5, in: !!pred.riding() }),
      });
      expect([name, r.differing]).toEqual([name, []]);
      expect([name, r.final]).toEqual([name, []]);
      expect(r.checked).toBeGreaterThan(60);
      // Out on the very step of the press, with no word from the host; then on his feet.
      expect(drawn[exit - 1].in).toBe(true);
      expect(drawn[exit].in).toBe(false);
      expect(r.pred.riding()).toBeUndefined();
      expect(r.host.mode).not.toBe(MODE.RIDE);
      expect(r.car.driver).toBe(NOBODY);
      // He left it doing more than 10 m/s; the rover he sees rolls on and never jumps back to
      // where the snapshots have it: no frame moves it more than a step and a half at that speed.
      const speed = (drawn[exit].x - drawn[exit - 1].x) / (DT / 1000);
      expect(speed).toBeGreaterThan(10);
      for (let k = exit; k < drawn.length - 1; k++) {
        const d = drawn[k + 1].x - drawn[k].x;
        expect(d).toBeGreaterThan(-0.05);
        expect(d).toBeLessThan((speed * 1.5 * DT) / 1000);
      }
      // It comes to rest where the host's does.
      expect(r.car.vx).toBe(0);
      expect(drawn.at(-1)!.x).toBeCloseTo(r.car.x, 3);
    }
  });

  /**
   * The blue player 80 m east on the rover's way, facing it, the gun in hand: he taps FIRE along
   * the road, a little down, onto the hull that comes at him, while `go` says so and until it
   * blows up.
   */
  const underFire = (ammo: number, hp: number, go: (k: number) => boolean) => {
    const WEST = Math.PI / 2;
    let room: Room;
    let seq = 0;
    let done = false;
    return {
      setup: (r: Room, foe: PlayerState) => {
        room = r;
        Object.assign(foe, { x: 80, z: 0, yaw: WEST }, loaded({ ammo }));
        r['rovers'][0].hp = hp;
      },
      each: (_: unknown, __: number, k: number) => {
        const conn = [...room['peers']].find(([, p]) => p?.info.id === 1)![0];
        done ||= !!room['rovers'][0].wreck;
        const keys = !done && go(k) && k % 2 ? KEY.FIRE : 0;
        room.receive(conn, encodeInput({ seq: seq++, keys, yaw: WEST, pitch: -0.012 }));
      },
    };
  };

  it('agrees with the host while driving under fire: the hull’s health is the snapshot’s, the drive his own', () => {
    for (const [name, lag] of ride.LAGS) {
      const r = ride.drive(
        flat,
        ride.trip(240, 7, true),
        lag,
        underFire(4, 10, () => true),
      );
      expect([name, r.differing]).toEqual([name, []]);
      expect([name, r.final]).toEqual([name, []]);
      expect(r.checked).toBeGreaterThan(60);
      // Four balls on the hull, and he drives on.
      expect([name, r.car.hp, r.car.wreck]).toEqual([name, 6, 0]);
      expect(r.car.x).toBeGreaterThan(30);
      expect(r.pred.riding()).toEqual({ rover: 0, seat: 0 });
      expect(r.pred.rovers(1e9, 1)[0]).toEqual(r.car);
    }
  });

  it('stops predicting the rover the moment the host says it blew up, and draws the wreck where the host has it', () => {
    for (const [name, lag] of ride.LAGS) {
      /** The rover as drawn on each frame, and whether he was in it. */
      const drawn: { r: Rover; in: boolean }[] = [];
      const fire = underFire(20, 3, k => k > 60);
      const r = ride.drive(flat, ride.trip(300, 7, true), lag, {
        setup: fire.setup,
        each: (pred, now, k) => {
          fire.each(pred, now, k);
          const car = pred.rovers(now, 1)[0];
          if (car) {
            drawn.push({ r: car, in: !!pred.riding() });
          }
        },
      });
      expect([name, r.differing]).toEqual([name, []]);
      expect([name, r.final]).toEqual([name, []]);
      // He was driving at speed when it went; he went down with it, off the wheel on the frame
      // of the snapshot that says so. The rover he drew is shown blown up when the snapshots
      // drawn (INTERP_DELAY in the past) get there: a few frames later.
      const out = drawn.findIndex((d, k) => k > 0 && drawn[k - 1].in && !d.in);
      const boom = drawn.findIndex(d => d.r.wreck);
      expect([name, out > 0, boom >= out, boom - out <= 8]).toEqual([name, true, true, true]);
      expect(drawn[out - 1].r.vx).toBeGreaterThan(10);
      expect(r.foe.hits).toBeGreaterThanOrEqual(3);
      expect(r.host.hp).toBe(HP_MAX);
      for (const d of drawn.slice(out)) {
        expect(d.in).toBe(false);
      }
      for (const d of drawn.slice(boom)) {
        expect(d.r.driver).toBe(NOBODY);
      }
      // What he sees skids to a stop and is eased onto the host's wreck, which lies behind what
      // he predicted by his lag: no frame moves it more than a step at speed, either way.
      const wrecked = drawn.slice(out - 1).filter((d, k) => k < boom - out + 1 || d.r.wreck);
      expect(wrecked.length).toBeGreaterThan(30);
      for (let k = 1; k < wrecked.length; k++) {
        const d = wrecked[k].r.x - wrecked[k - 1].r.x;
        expect([name, k, d > -0.3, d < 0.8]).toEqual([name, k, true, true]);
      }
      expect(wrecked.at(-1)!.r.x - wrecked[0].r.x).toBeLessThan(10);
      expect(r.pred.riding()).toBeUndefined();
      // In the end it is the host's wreck, its time as the wire counts it (in fours, rounded up).
      const last = r.pred.rovers(1e9, 1)[0];
      expect(r.car.wreck).toBeGreaterThan(0);
      expect(last).toMatchObject({ x: r.car.x, y: r.car.y, z: r.car.z, yaw: r.car.yaw, hp: 0 });
      expect([last.vx, last.driver]).toEqual([0, NOBODY]);
      expect(last.wreck! - r.car.wreck!).toBeGreaterThanOrEqual(0);
      expect(last.wreck! - r.car.wreck!).toBeLessThan(4 + 2);
    }
  });

  it('agrees with the host when he walks into the rover, jumps onto it and off it', () => {
    // East into its tail, then round it to its left side, onto its top and off its right.
    const walk: ride.Keys[] = [
      ...Array.from({ length: 40 }, () => ({ keys: KEY.FORWARD, yaw: EAST, pitch: 0 })),
      ...Array.from({ length: 30 }, () => ({ keys: KEY.FORWARD, yaw: 0, pitch: 0 })),
      ...Array.from({ length: 20 }, () => ({ keys: KEY.FORWARD, yaw: EAST, pitch: 0 })),
      ...Array.from({ length: 160 }, (_, k) => ({
        keys: (k < 31 || k > 90 ? KEY.FORWARD : 0) | (k === 31 ? KEY.JUMP : 0),
        yaw: Math.PI,
        pitch: 0,
      })),
    ];
    for (const [name, lag] of ride.LAGS) {
      let top = 0;
      const r = ride.drive(flat, walk, lag, {
        each: pred => {
          const me = pred.me(1);
          top = me?.mode === MODE.GROUND ? Math.max(top, me.y) : top;
        },
      });
      expect([name, r.differing]).toEqual([name, []]);
      expect([name, r.final]).toEqual([name, []]);
      expect(r.checked).toBeGreaterThan(30);
      // He stood on it and got off the far side.
      expect(top).toBeGreaterThan(ROVER.BODY_H - 0.2);
      expect(r.host.mode).toBe(MODE.GROUND);
      expect(r.host.y).toBe(0);
      expect(r.host.z).toBeGreaterThan(ROVER.RB);
      expect(r.car).toMatchObject({ x: 2.5, z: 0, driver: NOBODY });
    }
  });

  it('agrees with the host when he drives into a parked rover', () => {
    const pair = build({
      ...land(undefined, [], 0.5, [
        [2.5, 0, 0, EAST],
        [30, 0, 0, 0],
      ]).def,
      teams: duo([[0, 0, 0, 0]], [[0, 0, 60, 0]]),
    });
    for (const [name, lag] of ride.LAGS) {
      const r = ride.drive(pair, ride.trip(300, 7, true), lag);
      expect([name, r.differing]).toEqual([name, []]);
      expect([name, r.final]).toEqual([name, []]);
      expect(r.checked).toBeGreaterThan(60);
      // Against the side of the parked one, 30 m east, which stayed put.
      expect(r.car.x).toBeLessThan(30 - ROVER.BODY[0] - ROVER.RB * 2 + 0.01);
      expect(r.car.x).toBeGreaterThan(20);
      expect(r.pred.rovers(1e9, 1)[1]).toMatchObject({ x: 30, z: 0 });
    }
  });

  it('waits for the host to seat him', () => {
    const room = new Room({}, flat.def);
    const conn: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && conn.bins.push(d),
    };
    room.connect(conn);
    room.receive(conn, JSON.stringify({ t: 'join', name: 'me' }));
    const pred = createPredictor(flat);
    pred.you(0, 0);
    room.tick();
    room.tick();
    pred.snapshot(decodeSnapshot(conn.bins.at(-1)!)!, 0);
    // The press, predicted: still on foot, the rover not his.
    const press = pred.step({ keys: KEY.USE, yaw: EAST, pitch: 0 }, 0);
    const next = pred.step({ keys: KEY.FORWARD, yaw: EAST, pitch: 0 }, DT);
    expect(pred.riding()).toBeUndefined();
    expect(pred.me(1)!.mode).toBe(MODE.GROUND);
    expect(pred.rovers(DT, 1)[0]).toMatchObject({ driver: NOBODY, vx: 0 });
    // The host seats him; its snapshot does, and the input after the press is replayed at the wheel.
    room.receive(conn, encodeInput(press));
    room.tick();
    room.tick();
    pred.snapshot(decodeSnapshot(conn.bins.at(-1)!)!, 2 * DT);
    expect(pred.riding()).toEqual({ rover: 0, seat: 0 });
    expect(pred.me(1)!.mode).toBe(MODE.RIDE);
    room.receive(conn, encodeInput(next));
    expect(pred.rovers(2 * DT, 1)[0]).toEqual(room['rovers'][0]);
    expect(pred.rovers(2 * DT, 1)[0].vx).toBeGreaterThan(0);
  });

  it('draws a rider on the rover it draws', () => {
    const room = new Room({}, flat.def);
    const peers = ['driver', 'me'].map(name => {
      const c: Conn & { bins: ArrayBuffer[] } = {
        bins: [],
        send: d => typeof d !== 'string' && c.bins.push(d),
      };
      room.connect(c);
      room.receive(c, JSON.stringify({ t: 'join', name }));
      return c;
    });
    const [driver, me] = peers;
    // The own player, blue, stands by the rover at red's spawn.
    Object.assign(room['peers'].get(me)!.state, { x: 2.5, z: 2 });
    const pred = createPredictor(flat);
    pred.you(1, 1);
    let seen = 0;
    let rode = 0;
    let moved = 0;
    for (let k = 0; k < 260; k++) {
      const now = k * DT;
      // The other takes the wheel first and drives off east; the own player gets in after him,
      // and out at the end.
      room.receive(
        driver,
        encodeInput({
          seq: k,
          keys: k < 3 ? KEY.USE : k > 20 ? KEY.FORWARD : 0,
          yaw: EAST,
          pitch: 0,
        }),
      );
      const keys = (k >= 10 && k < 13) || k >= 240 ? KEY.USE : KEY.LEFT;
      room.receive(me, encodeInput(pred.step({ keys, yaw: 1, pitch: 0 }, now)));
      room.tick();
      for (; seen < me.bins.length; seen++) {
        pred.snapshot(decodeSnapshot(me.bins[seen])!, now);
      }
      const at = pred.riding();
      if (k > 20 && k < 240) {
        expect(at).toEqual({ rover: 0, seat: 1 });
        // Half a step after the last one: his body is on the rider's seat of the rover drawn then.
        const alpha = 0.5;
        const body = pred.me(alpha)!;
        const r = pred.rovers(now + alpha * DT, alpha)[0];
        const sat = { ...body };
        seat(sat, r, 1);
        expect([body.x, body.y, body.z]).toEqual([sat.x, sat.y, sat.z]);
        // His own look, and the rover drawn in the past, behind the host's.
        expect(body.yaw).toBeCloseTo(1, 3);
        expect(body.mode).toBe(MODE.RIDE);
        rode++;
        moved = Math.max(moved, room['rovers'][0].x - r.x);
      }
    }
    expect(rode).toBeGreaterThan(200);
    expect(moved).toBeGreaterThan(1);
    // Out: the host's call, seen in a snapshot.
    expect(pred.riding()).toBeUndefined();
    expect(pred.me(1)!.mode).not.toBe(MODE.RIDE);
  });

  it('interpolates the rovers it does not drive', () => {
    const [parked] = park(flat);
    const car = (over: Partial<Rover>): Rover => ({ ...parked, ...over });
    const snap = (tick: number, ...rovers: Rover[]): Snapshot => ({
      ...snapshot(tick, snapPlayer(0)),
      rovers,
    });
    const p = createPredictor(flat);
    p.you(0);
    expect(p.rovers(0, 0)).toEqual([]);
    p.snapshot(snap(0, car({ x: 10, yaw: 6.2, pitch: 0.1, driver: 1 }), car({ z: 50 })), 1000);
    p.snapshot(snap(2, car({ x: 12, yaw: 0.1, pitch: 0.3, rider: 1 }), car({ z: 50 })), 1100);
    // Halfway between the two, INTERP_DELAY back.
    const [a, b] = p.rovers(1050 + INTERP_DELAY, 0.7);
    expect(a.x).toBeCloseTo(11, 6);
    expect(a.pitch).toBeCloseTo(0.2, 6);
    // The short way round, through 0.
    expect(a.yaw).toBeCloseTo((6.2 + 0.1 + 2 * Math.PI) / 2 - 2 * Math.PI, 6);
    // The seats of the newer one.
    expect(a).toMatchObject({ driver: NOBODY, rider: 1 });
    expect(b).toEqual(car({ z: 50 }));
    // Clamped to the first and to the newest; nobody's seat is the own player's.
    expect(p.rovers(0, 0)[0].x).toBe(10);
    expect(p.rovers(9999, 0)[0].x).toBe(12);
    expect(p.riding()).toBeUndefined();
    // A map without rovers has none.
    p.snapshot(snapshot(4, snapPlayer(0)), 1200);
    expect(p.rovers(1300, 0)).toEqual([]);
    expect(ROVER_BLEND).toBeGreaterThan(0);
    expect(ROVER.ENTER_R).toBeGreaterThan(2.5);
  });
});
