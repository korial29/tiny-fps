import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  AMMO_PACK,
  DASH_COOLDOWN,
  DASH_TICKS,
  DOWN_TICKS,
  PLAYER_H,
  STEP_H,
  TICK_HZ,
} from '../shared/constants';
import { STRIKE, step } from '../shared/gun';
import { ROOFTOPS } from '../shared/map';
import { move, spawn, stumble } from '../shared/physics';
import { decodeSnapshot, encodeInput, onWire } from '../shared/protocol';
import { kitOf } from '../shared/kit';
import { Room } from '../shared/room';
import { EV, KEY, MODE } from '../shared/types';
import type { Conn, Input, PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import * as lines from '../../test/lines';
import { Sim } from '../../test/pilot';
import { createPredictor } from './predict';

const STEP = 1000 / TICK_HZ;
const world = build(ROOFTOPS);

/** What an ammo pack does on the host: 20 shots more up to the full gun, for a gun that is there. */
const grant = (p: PlayerState): boolean => {
  const had = p.ammo;
  p.ammo = p.ammo < 0 ? p.ammo : Math.min(AMMO_MAX, p.ammo + AMMO_PACK);
  return p.ammo !== had;
};
/** What a hit on the host does to a player who has run out of health (harm() in room.ts): the charge's byte carries his fall then. */
const fell = (p: PlayerState) =>
  Object.assign(p, {
    hp: 0,
    down: DOWN_TICKS,
    ammo: -1,
    cool: 0,
    charge: 0,
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
     * the map the room and the predictor play, ROOFTOPS unless told; `role` the player's class (ROLE).
     */
    {
      grants = [],
      def = ROOFTOPS,
      role,
    }: { grants?: number[]; def?: WorldDef; role?: number } = {},
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
      room.receive(c, JSON.stringify({ t: 'join', name, ...(name == 'me' ? { role } : {}) }));
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
    pred.you(team, team, role);
    const kit = kitOf(role, def);
    // As the room puts him in: with his class's health.
    const ref: PlayerState = { ...spawn(team, world, 0, team), hp: kit.hp };
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
      const fired = step(ref, input, map, team, true, [], kit);
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
