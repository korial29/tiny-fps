import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  GUN_MAG,
  AMMO_PACK,
  DASH_COOLDOWN,
  DASH_TICKS,
  DOWN_TICKS,
  TICK_HZ,
  NADE_MAX,
  BLOW,
  STING,
} from '../shared/constants';
import { STRIKE, step } from '../shared/gun';
import { ROOFTOPS } from '../shared/map';
import { move, spawn, stumble } from '../shared/physics';
import { decodeSnapshot, encodeInput, onWire } from '../shared/protocol';
import { ROLE, kitOf } from '../shared/kit';
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
      arm,
    }: {
      grants?: number[];
      def?: WorldDef;
      role?: number;
      /** Weapons the host gives him before the first input, as racks would. */
      arm?: Partial<PlayerState>;
    } = {},
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
    const ref: PlayerState = { ...spawn(team, world, 0, team), hp: kit.hp, ...arm };
    if (arm) {
      Object.assign(room['peers'].get(conn)!.state, arm);
    }
    const inputs: { at: number; data: ArrayBuffer }[] = [];
    const snaps: { at: number; data: ArrayBuffer }[] = [];
    let seen = 0;
    let applied = 0;
    let stunned = 0;
    let checked = 0;
    let shots = 0;
    let cuts = 0;
    let lobs = 0;
    let rings = 0;
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
      rings += +(fired === STRIKE.RING);
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
      rings,
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

  it('agrees with the host exactly on a brawl with bare fists: chains, hooks and lunges, marine and ninja, under every lag', () => {
    let s = 4242;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const steps: Omit<Input, 'seq'>[] = [];
    let [keys, every, yaw, turn] = [0, 5, ROOFTOPS.teams[0].spawns[0][3], 0];
    for (let k = 0; k < 1500; k++) {
      if (k % 30 === 0) {
        keys =
          (rnd() < 0.7 ? KEY.FORWARD : 0) |
          (rnd() < 0.5 ? KEY.SPRINT : 0) |
          (rnd() < 0.1 ? KEY.JUMP : 0) |
          (rnd() < 0.1 ? KEY.CROUCH : 0) |
          (rnd() < 0.15 ? KEY.DASH : 0);
        // Presses this many steps apart: some in a blow's recovery, some after it.
        every = [3, 5, 8, 12, 21][Math.floor(rnd() * 5)];
        turn = (rnd() - 0.5) * 0.08;
      }
      yaw += turn;
      steps.push({
        keys: KEY.FISTS | keys | (k % every === 0 ? KEY.FIRE : 0),
        yaw: ((yaw % 6.2832) + 6.2832) % 6.2832,
        pitch: 0,
      });
    }
    for (const role of [ROLE.MARINE, ROLE.NINJA]) {
      // The guard: the blows the fists threw, stepped with no network.
      const p = spawn(0, world, 0);
      const blows = new Set<number>();
      steps.forEach((i, k) => {
        step(p, onWire({ ...i, seq: k }), world, 0, true, [], kitOf(role, ROOFTOPS));
        if (p.swing && p.fists) {
          blows.add(p.cut ?? 0);
        }
      });
      expect([...blows].sort(), `role ${role}`).toEqual([
        BLOW.JAB,
        BLOW.CROSS,
        BLOW.HOOK,
        BLOW.LUNGE,
      ]);
      for (const [name, lag] of LAGS) {
        const r = race(lag, steps, 0, [], [], true, { role });
        expect([r.worst, r.end, r.final, r.differing], `role ${role}, ${name} lag`).toEqual([
          0,
          0,
          0,
          [],
        ]);
      }
    }
  }, 60_000);

  it('agrees with the host exactly for a xenomorph: walls climbed, dashes chained, claws and tail, under every lag', () => {
    let s = 1337;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    // First up the wall north of the start, and onto the roof above it; then at random.
    const steps: Omit<Input, 'seq'>[] = Array.from({ length: 300 }, () => ({
      keys: KEY.FORWARD | KEY.SPRINT,
      yaw: 0,
      pitch: 0,
    }));
    let [keys, yaw, turn, pitch] = [0, 0, 0, 0];
    for (let k = 0; k < 3000; k++) {
      if (k % 25 === 0) {
        keys =
          (rnd() < 0.8 ? KEY.FORWARD : rnd() < 0.3 ? KEY.BACK : 0) |
          (rnd() < 0.5 ? KEY.SPRINT : 0) |
          (rnd() < 0.15 ? KEY.BLADE : 0) |
          (rnd() < 0.2 ? KEY.LEFT : rnd() < 0.2 ? KEY.RIGHT : 0) |
          (rnd() < 0.15 ? KEY.JUMP : 0) |
          (rnd() < 0.08 ? KEY.CROUCH : 0) |
          (rnd() < 0.3 ? KEY.DASH : 0) |
          (rnd() < 0.3 ? KEY.FIRE : 0) |
          (rnd() < 0.1 ? KEY.SPECIAL : 0);
        turn = (rnd() - 0.5) * 0.1;
        pitch = (rnd() - 0.3) * 0.8;
      }
      // DASH pressed afresh every few steps, so dashes chain.
      const held = k % 4 ? keys & ~KEY.DASH : keys;
      yaw += turn;
      steps.push({ keys: held, yaw: ((yaw % 6.2832) + 6.2832) % 6.2832, pitch });
    }
    // The guard: what it did, stepped with no network.
    const p = spawn(0, world, 0);
    const [modes, blows] = [new Set<number>(), new Set<number>()];
    let [dashes, chained] = [0, 0];
    steps.forEach((i, k) => {
      const ready = p.dash === 0;
      step(p, onWire({ ...i, seq: k }), world, 0, true, [], kitOf(ROLE.XENO, ROOFTOPS));
      modes.add(p.mode);
      dashes += +!!(p.ev & EV.DASH);
      chained += +(!ready && !!(p.ev & EV.DASH));
      if (p.swing) {
        blows.add(p.cut ?? 0);
      }
    });
    expect([...modes]).toEqual(expect.arrayContaining([MODE.CLING, MODE.CLIMB, MODE.AIR]));
    expect([...blows]).toEqual(expect.arrayContaining([BLOW.CLAW_L, BLOW.CLAW_R, STING.LEAP]));
    expect([...blows].some(b => b < BLOW.CLAW_L)).toBe(true);
    expect(dashes).toBeGreaterThan(20);
    expect(chained).toBeGreaterThan(5);
    for (const [name, lag] of LAGS) {
      const r = race(lag, steps, 0, [], [], true, { role: ROLE.XENO });
      expect([r.worst, r.end, r.final, r.differing], `${name} lag`).toEqual([0, 0, 0, []]);
    }
  }, 60_000);

  it('agrees with the host exactly for a Hunter with all five weapons: blades, pistol, harpoon, cannon and disc, under every lag (the user, 2026-11-26)', () => {
    let s = 4242;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    // Each of his keys in turn and at random, fired, charged, burst and reloaded.
    const picks = [KEY.BLADE, KEY.FISTS, 0, KEY.RAIL, KEY.RIFLE];
    const steps: Omit<Input, 'seq'>[] = [];
    let [pick, keys, yaw] = [0, 0, 0];
    for (let k = 0; k < 2400; k++) {
      if (k % 30 === 0) {
        pick = k < 300 ? picks[(k / 30) % 5] : picks[Math.floor(rnd() * 5)];
        keys =
          (rnd() < 0.5 ? KEY.FORWARD : 0) |
          (rnd() < 0.3 ? KEY.SPRINT : 0) |
          (rnd() < 0.1 ? KEY.JUMP : 0) |
          (rnd() < 0.15 ? KEY.SPECIAL : 0) |
          (rnd() < 0.08 ? KEY.RELOAD : 0);
        yaw += (rnd() - 0.5) * 2;
      }
      // The disc is picked but never thrown: its catch is the host's alone (Room.fly() zeroes `clip`),
      // a correction no prediction foresees.
      const fire =
        pick === KEY.RIFLE ? 0 : k % 30 < 12 || (k % 7 === 0 && rnd() < 0.5) ? KEY.FIRE : 0;
      steps.push({ keys: pick | keys | fire, yaw: ((yaw % 6.2832) + 6.2832) % 6.2832, pitch: 0 });
    }
    const arm = {
      ammo: 12,
      mag: 1,
      rail: 0,
      cap: 15,
      rifle: 0,
      clip: 0,
      side: 60,
      sideMag: 15,
    };
    // The guard: every weapon came to hand and fired.
    const p = { ...spawn(0, world, 0, 0, kitOf(ROLE.HUNTER, ROOFTOPS)), ...arm };
    const hands = new Set<string>();
    const strikes = new Set<number>();
    let pistol = 0;
    steps.forEach((i, k) => {
      const struck = step(
        p,
        onWire({ ...i, seq: k }),
        world,
        0,
        true,
        [],
        kitOf(ROLE.HUNTER, ROOFTOPS),
      );
      strikes.add(struck);
      pistol += +(!!p.sided && struck === STRIKE.SHOT);
      hands.add(
        p.sided
          ? 'pistol'
          : p.wield
            ? 'blades'
            : p.railed
              ? 'cannon'
              : p.rifled
                ? 'disc'
                : 'harpoon',
      );
    });
    expect([...hands].sort()).toEqual(['blades', 'cannon', 'disc', 'harpoon', 'pistol']);
    expect([...strikes]).toEqual(expect.arrayContaining([STRIKE.SHOT, STRIKE.RAIL]));
    expect(pistol).toBeGreaterThan(2);
    for (const [name, lag] of LAGS) {
      const r = race(lag, steps, 0, [], [], true, { role: ROLE.HUNTER, arm });
      expect([r.worst, r.end, r.final, r.differing], `${name} lag`).toEqual([0, 0, 0, []]);
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

  it('agrees with the host exactly on the secondary fire: the pistol’s bursts and the rail gun’s rings, under every lag', () => {
    const from = ROOFTOPS.teams[0].spawns[0];
    const to = (rack: readonly number[]) => ({
      yaw: Math.atan2(-(rack[0] - from[0]), -(rack[2] - from[2])),
      n: Math.round((Math.hypot(rack[0] - from[0], rack[2] - from[2]) - 0.5) * 10) + 3,
    });
    for (const [rack, hand] of [
      [ROOFTOPS.teams[0].rack!, 0],
      [ROOFTOPS.teams[0].rail!, KEY.RAIL],
    ] as const) {
      const { yaw, n } = to(rack);
      // To the rack, then 300 steps: G every 11 steps (some inside a burst or an overheat), FIRE
      // held in stretches between.
      const steps = [
        ...Array.from({ length: n }, () => ({ keys: KEY.FORWARD, yaw, pitch: 0 })),
        ...Array.from({ length: 300 }, (_, k) => ({
          keys: hand | (k % 11 === 3 ? KEY.SPECIAL : 0) | (k % 60 > 40 ? KEY.FIRE : 0),
          yaw,
          pitch: 0,
        })),
      ];
      for (const [name, lag] of LAGS) {
        const r = race(lag, steps, 0, [], [], true);
        expect([r.worst, r.end, r.final, r.differing], `${hand} ${name} lag`).toEqual([
          0,
          0,
          0,
          [],
        ]);
        expect(hand ? r.rings : r.shots, `${hand} ${name} lag`).toBeGreaterThan(hand ? 2 : 20);
      }
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
});
