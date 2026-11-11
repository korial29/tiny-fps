// A face's life: what the runner is doing (a Mood) to the weights of the face's channels
// (features.ts), eased, with blinks at irregular intervals, a gaze that follows the aim and darts
// about a little. Seeded by the player's id: the same face for everyone who sees him.
import { DASH_COOLDOWN, DASH_TICKS, RUN_SPEED, SPRINT_SPEED } from '../shared/constants';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { CH, CHANNELS, TRAITS, lookIn, lookOf } from './features';

/** What a face answers to, each 0 to 1 but the gaze. */
export interface Mood {
  /** Down: a grimace, the eyes shut. */
  down: boolean;
  /** Just hit: a wince, 1 at the hit. */
  hurt: number;
  /** Sprinting, climbing, hanging, on a wall. */
  effort: number;
  /** Aiming. */
  focus: number;
  /** Cutting with the katana, dashing. */
  shout: number;
  /** A capture, a foe put down. */
  grin: number;
  /** Where he aims from where his head points: radians to his right, and up. */
  gx: number;
  gy: number;
}

export const CALM: Mood = {
  down: false,
  hurt: 0,
  effort: 0,
  focus: 0,
  shout: 0,
  grin: 0,
  gx: 0,
  gy: 0,
};

/** The expressions, each the weights of the channels it moves. */
export const POSE = {
  /** At rest: a soldier's face, the brows a touch low, the mouth set. */
  NEUTRAL: [
    [CH.BROW_DOWN, 0.3],
    [CH.SQUINT, 0.1],
    [CH.SMILE, 0.1],
  ],
  EFFORT: [
    [CH.BROW_DOWN, 0.5],
    [CH.SQUINT, 0.35],
    [CH.JAW, 0.3],
    [CH.GRIT, 0.25],
  ],
  FOCUS: [
    [CH.BROW_DOWN, 0.6],
    [CH.SQUINT, 0.6],
    [CH.FROWN, 0.25],
    [CH.PUCKER, 0.2],
  ],
  GRIN: [
    [CH.SMILE, 1],
    [CH.SQUINT, 0.4],
    [CH.BROW_UP, 0.35],
    [CH.GRIT, 0.6],
    [CH.JAW, 0.12],
  ],
  SHOUT: [
    [CH.JAW, 1],
    [CH.BROW_DOWN, 1],
    [CH.SQUINT, 0.5],
    [CH.GRIT, 0.5],
  ],
  WINCE: [
    [CH.BLINK, 0.85],
    [CH.SQUINT, 1],
    [CH.BROW_DOWN, 0.7],
    [CH.BROW_PAIN, 0.6],
    [CH.GRIT, 0.9],
    [CH.FROWN, 0.5],
    [CH.JAW, 0.1],
  ],
  DOWN: [
    [CH.BLINK, 1],
    [CH.SQUINT, 0.5],
    [CH.BROW_PAIN, 0.9],
    [CH.GRIT, 0.6],
    [CH.FROWN, 0.7],
    [CH.JAW, 0.3],
  ],
} satisfies Record<string, number[][]>;

/** How fast each expression comes and goes, per second, in the order they are laid over one another: the last wins. */
const LAYERS: [keyof Mood, number[][], number, number][] = [
  ['effort', POSE.EFFORT, 5, 1.6],
  ['focus', POSE.FOCUS, 9, 3],
  ['grin', POSE.GRIN, 10, 2.5],
  ['shout', POSE.SHOUT, 30, 6],
  ['hurt', POSE.WINCE, 60, 6],
  ['down', POSE.DOWN, 12, 5],
];

/** How far the eyes turn in their sockets, radians, for the full travel of the iris. */
export const [REACH_X, REACH_Y] = [0.6, 0.4];
/** A blink: seconds shutting, shut, opening. */
const [SHUT, HELD, OPEN] = [0.06, 0.03, 0.13];
export const BLINK = SHUT + HELD + OPEN;

/** How shut a blink `t` seconds old is. */
export const blink = (t: number) =>
  t < 0 || t > BLINK
    ? 0
    : t < SHUT
      ? t / SHUT
      : t < SHUT + HELD
        ? 1
        : 1 - ((t - SHUT - HELD) / OPEN) ** 2 * (3 - (2 * (t - SHUT - HELD)) / OPEN);

/** The face's channels for an expression alone, on the face of `id` (or on the plain one). */
export const expression = (pose: number[][], id?: number): Float32Array => {
  const w = id === undefined ? new Float32Array(CHANNELS) : lookOf(id);
  for (const [ch, k] of pose) {
    w[ch] = k;
  }
  w[CH.BLINK_MID] = 4 * w[CH.BLINK] * (1 - w[CH.BLINK]);
  return w;
};

export interface Face {
  /** The channels' weights now (CH): what skin() takes. */
  w: Float32Array;
  /** How far each expression of LAYERS is in, 0 to 1, in their order. */
  k: number[];
  update(dt: number, mood: Mood): void;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

export const createFace = (id: number): Face => {
  const w = lookOf(id);
  const k = LAYERS.map(() => 0);
  const goal = new Float32Array(TRAITS);
  // A small generator of its own: the blinks and the glances of a face are its own, and the same on every screen.
  let seed = (Math.imul(id + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  // Seconds to the next blink and into the running one; to the next glance, and the glance.
  let [wait, age, dart, sx, sy] = [0.5 + 3 * rand(), 1, 0.4 + 2 * rand(), 0, 0];
  let [lx, ly, t, lids] = [0, 0, 0, 0];
  return {
    w,
    k,
    update(dt, mood) {
      t += dt;
      goal.fill(0);
      for (const [ch, v] of POSE.NEUTRAL) {
        goal[ch] = v;
      }
      LAYERS.forEach(([key, pose, up, down], i) => {
        const to = +mood[key];
        k[i] += (to - k[i]) * (1 - Math.exp(-dt * (to > k[i] ? up : down)));
        if (k[i] > 0.001) {
          for (let ch = 0; ch < TRAITS; ch++) {
            goal[ch] *= 1 - k[i];
          }
          for (const [ch, v] of pose) {
            goal[ch] += v * k[i];
          }
        }
      });
      // Out of breath, the mouth opens and shuts with it.
      goal[CH.JAW] += 0.12 * k[0] * Math.max(Math.sin(t * 9), 0);
      // A blink every 2 to 6 s, now and then two in a row; fewer aiming.
      age += dt;
      wait -= dt * (1 - 0.6 * k[1]);
      if (wait <= 0) {
        age = 0;
        wait = rand() < 0.15 ? 0.3 : 2 + 4 * rand();
      }
      // The gaze: on the aim as far as the eyes turn, and a glance aside now and then; a wide one blinks.
      if ((dart -= dt) <= 0) {
        dart = 0.5 + 2.4 * rand();
        const [nx, ny] = rand() < 0.3 ? [0, 0] : [0.7 * rand() - 0.35, 0.4 * rand() - 0.2];
        if (Math.abs(nx - sx) > 0.3 && age > BLINK) {
          age = 0;
        }
        [sx, sy] = [nx, ny];
      }
      const still = mood.down ? 0 : 1 - 0.8 * k[1];
      const snap = 1 - Math.exp(-dt * 28);
      lx += (clamp(mood.gx / REACH_X, -1, 1) * +!mood.down + sx * still - lx) * snap;
      ly += (clamp(mood.gy / REACH_Y, -1, 1) * +!mood.down + sy * still - ly) * snap;
      // The upper lids go with the gaze, up and down.
      goal[CH.WIDE] += 0.3 * Math.max(ly, 0);
      const ease = 1 - Math.exp(-dt * 20);
      lids += (goal[CH.BLINK] - lids) * ease;
      for (let ch = 0; ch < TRAITS; ch++) {
        w[ch] += (goal[ch] - w[ch]) * ease;
      }
      // Within the travel's circle: in a corner the iris would leave the ball.
      const far = Math.max(Math.hypot(lx, ly), 1);
      w[CH.LOOK_X] = lx / far;
      w[CH.LOOK_Y] = ly / far;
      w[CH.LOOK_IN] = lookIn(w[CH.LOOK_X], w[CH.LOOK_Y]);
      const shut = clamp(Math.max(lids, blink(age)) + 0.3 * Math.max(-ly, 0));
      w[CH.BLINK] = shut;
      w[CH.BLINK_MID] = 4 * shut * (1 - shut);
    },
  };
};

/** Whether the player is in the burst of a dash. */
export const dashing = (p: PlayerState) => p.dash > DASH_COOLDOWN - DASH_TICKS;

/** How hard the player is working, 0 to 1: a sprint, a climb, a hang, a run along a wall, a stumble. */
export const strain = (p: PlayerState): number =>
  p.down
    ? 0
    : p.mode == MODE.CLIMB || p.mode == MODE.HANG || p.mode == MODE.WALLRUN
      ? 1
      : p.stun
        ? 0.6
        : p.mode == MODE.GROUND
          ? clamp((Math.hypot(p.vx, p.vz) - RUN_SPEED - 0.5) / (SPRINT_SPEED - RUN_SPEED - 1))
          : 0;

/**
 * Whether `p` just put a foe down: his hit counter went on from `was` in the frame one of the
 * `others` went down (the snapshot says no more).
 */
export const felled = (
  was: Pick<PlayerState, 'hits'>,
  p: PlayerState,
  before: (id: number) => Pick<PlayerState, 'down'> | undefined,
  others: PlayerState[],
): boolean =>
  p.hits != was.hits &&
  others.some(o => o.id != p.id && o.down > 0 && before(o.id) && !before(o.id)!.down);
