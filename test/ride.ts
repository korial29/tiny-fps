// Test helper: a client at the wheel of a rover through a real room, its predictor fed the room's
// snapshots late. What the predictor holds after each snapshot is checked against what the host
// holds once it has applied the same inputs: the same player and the same rover, to the bit.
import { createPredictor } from '../src/client/predict';
import type { Predictor } from '../src/client/predict';
import { TICK_HZ } from '../src/shared/constants';
import { decodeSnapshot, encodeInput } from '../src/shared/protocol';
import { Room } from '../src/shared/room';
import { wheels } from '../src/shared/rover';
import { KEY, MODE } from '../src/shared/types';
import type { Conn, Input, PlayerState, Rover } from '../src/shared/types';
import { build } from '../src/shared/world';
import type { World } from '../src/shared/world';
import type { ReliefDef } from '../src/shared/relief';
import { land } from './slope';
import { duo } from './teams';

export const STEP = 1000 / TICK_HZ;
export const EAST = (3 * Math.PI) / 2;
export type Keys = Omit<Input, 'seq' | 'view'>;

/**
 * A land (slope.ts) with red's spawn and base at the origin, blue's 60 m south of it (a red player
 * at his spawn is not on the blue flag), and a rover 2.5 m east of red's spawn, its nose to the east.
 */
export const lot = (at?: ReliefDef['at']): World =>
  build({
    ...land(at, [], 0.5, [[2.5, 0, 0, EAST]]).def,
    teams: duo([[0, 0, 0, 0]], [[0, 0, 60, 0]]),
  });

/** The lags of the tests, as steps of delay per input and per snapshot. */
export const LAGS: [string, (k: number) => number][] = [
  ['none', () => 0],
  ['jittery', k => 2 + (k % 7 === 0 ? 3 : 0) + (k % 50 < 5 ? 4 : 0)],
  ['long', () => 8],
];

/** What a step leaves for the host to read, the eased angles, and the counter a run-over bumps on the host alone. */
const SKIP = ['ev', 'fall', 'power', 'yaw', 'pitch', 'hits'];

/**
 * A script: he waits, gets in (a press of USE held 3 steps), then drives east `n` steps with the
 * look wobbling, a tap of the handbrake and a lift of the throttle now and then.
 */
export const trip = (n: number, seed = 7, calm = false): Keys[] => {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: Keys[] = [];
  for (let k = 0; k < 5; k++) {
    out.push({ keys: 0, yaw: EAST, pitch: 0 });
  }
  for (let k = 0; k < 3; k++) {
    out.push({ keys: KEY.USE, yaw: EAST, pitch: 0 });
  }
  let keys: number = KEY.FORWARD;
  let yaw = EAST;
  for (let k = 0; k < n; k++) {
    if (k % 20 === 0 && !calm) {
      const c = rnd();
      keys = c < 0.75 ? KEY.FORWARD : c < 0.85 ? KEY.FORWARD | KEY.JUMP : c < 0.95 ? 0 : KEY.BACK;
      yaw = EAST + (rnd() - 0.5) * 1.2;
    }
    out.push({ keys, yaw, pitch: Math.sin(k / 20) * 0.3 });
  }
  return out;
};

/**
 * Runs `steps` through a room of world `w` and a predictor, inputs and snapshots late by `lag(k)`
 * steps. The player under test is red, id 0; `setup` gets the room and the blue player (id 1)
 * before the first step, `each` the predictor and the frame time after every step.
 */
export const drive = (
  w: World,
  steps: Keys[],
  lag: (k: number) => number,
  {
    setup,
    each,
  }: {
    setup?: (room: Room, foe: PlayerState) => void;
    each?: (pred: Predictor, now: number, k: number) => void;
  } = {},
) => {
  const room = new Room({}, w.def);
  const conn: Conn & { bins: ArrayBuffer[] } = {
    bins: [],
    send: d => typeof d !== 'string' && conn.bins.push(d),
  };
  const other: Conn = { send: () => {} };
  for (const c of [conn, other]) {
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'p' }));
  }
  const host = (): PlayerState => room['peers'].get(conn)!.state;
  const foe = (): PlayerState => room['peers'].get(other)!.state;
  const car = (): Rover => room['rovers'][0];
  setup?.(room, foe());

  const pred = createPredictor(w);
  pred.you(0, 0);
  const inputs: { at: number; data: ArrayBuffer; seq: number }[] = [];
  const snaps: { at: number; data: ArrayBuffer }[] = [];
  /** The host's player and rover after it applied each seq, and whether that input seated him. */
  const after = new Map<number, { p: PlayerState; r: Rover; boarded: boolean }>();
  /** The predictor's, after a snapshot, for the last seq it had stepped. */
  const held: { seq: number; ack: number; p: PlayerState; r: Rover }[] = [];
  let seen = 0;
  let sent = -1;
  let [driving, flew, landed] = [0, 0, 0];

  const flush = (k: number, snapAt: number) => {
    while (inputs.length && inputs[0].at <= k) {
      const { data, seq } = inputs.shift()!;
      const was = host().mode;
      room.receive(conn, data);
      after.set(seq, {
        p: { ...host() },
        r: { ...car() },
        boarded: was !== MODE.RIDE && host().mode === MODE.RIDE,
      });
      if (car().driver === 0) {
        const air = wheels(car(), w).every(c => c[3] === 0);
        driving++;
        landed += +(flew > 0 && !air);
        flew += +air;
      }
    }
    room.tick();
    for (; seen < conn.bins.length; seen++) {
      snaps.push({ at: snapAt, data: conn.bins[seen] });
    }
    while (snaps.length && snaps[0].at <= k) {
      const s = decodeSnapshot(snaps.shift()!.data)!;
      pred.snapshot(s, k * STEP);
      const me = pred.me(1);
      const ack = s.players.find(p => p.id === 0)!.ack;
      if (me && sent >= 0) {
        held.push({
          seq: sent,
          ack: ack === 0xffff ? -1 : ack,
          p: me,
          r: pred.rovers(k * STEP, 1)[0],
        });
      }
    }
  };

  let last = 0;
  steps.forEach((i, k) => {
    const input = pred.step(i, k * STEP);
    sent = input.seq;
    last = Math.max(last, k + lag(k));
    inputs.push({ at: last, data: encodeInput(input), seq: input.seq });
    flush(k, k + lag(k));
    each?.(pred, k * STEP, k);
  });
  for (let k = steps.length; inputs.length || snaps.length || k < steps.length + 10; k++) {
    flush(k, k);
  }

  // Getting in is the host's alone: a replay that runs over that input before the snapshot shows
  // the seat cannot know it.
  const boards = [...after].filter(([, a]) => a.boarded).map(([seq]) => seq);
  const differing = new Set<string>();
  let checked = 0;
  for (const h of held) {
    const a = after.get(h.seq)!;
    if (boards.some(b => b > h.ack && b <= h.seq)) {
      continue;
    }
    checked++;
    for (const key of Object.keys(a.p) as (keyof PlayerState)[]) {
      if (!SKIP.includes(key) && h.p[key] !== a.p[key]) {
        differing.add(key);
      }
    }
    // The rover is compared while he drives it; the others are drawn in the past.
    if (a.r.driver === 0) {
      for (const key of Object.keys(a.r) as (keyof Rover)[]) {
        if (h.r[key] !== a.r[key]) {
          differing.add(`rover.${key}`);
        }
      }
    }
  }
  const end = pred.me(1)!;
  return {
    differing: [...differing],
    checked,
    /** The fields of the player that differ from the host's at the very end, everything arrived. */
    final: (Object.keys(host()) as (keyof PlayerState)[]).filter(
      key => !SKIP.includes(key) && end[key] !== host()[key],
    ),
    /** Inputs the host applied with him at the wheel, the ones with no wheel on the ground, and the ones on the ground after that. */
    driving,
    flew,
    landed,
    pred,
    room,
    host: host(),
    foe: foe(),
    car: car(),
  };
};
