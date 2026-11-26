// What the tests of the combat share: a player, a small world, a view and a combat on spies.
import { vi } from 'vitest';
import { STILL } from '../../shared/physics';
import type { PlayerState } from '../../shared/types';
import { build } from '../../shared/world';
import { createBalls } from '../balls';
import { createTracer } from '../beams';
import type { Orb } from '../beams';
import { createCombat } from './create';
import type { Vec3 } from '../mesh';
import type { View } from './types';

export const player = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ammo: 30,
  ...o,
});
/** A roof 10 m long along z, and a wall at z = -20. */
export const WORLD = build({
  brushes: [
    { min: [-50, -30, -10], max: [50, 0, 10], top: 0, side: 0 },
    { min: [-50, 0, -21], max: [50, 8, -20], top: 0, side: 0 },
  ],
  teams: [
    { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
    { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
  ],
  floor: -25,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
export const mk = (o: Partial<Pick<View, 'yaw' | 'cam' | 'drawn' | 'pitch'>> = {}): View => {
  const v = {
    eye: [0, 1.6, 0] as Vec3,
    cam: [0, 1.6, 0] as Vec3,
    yaw: 0,
    pitch: 0,
    drawn: 0,
    ...o,
  };
  return { ...v, muzzle: [0.2, -0.1, 0.6] };
};
export const VIEW = mk();

export const setup = () => {
  const audio = { play: vi.fn() };
  const hud = { vitals: vi.fn(), hit: vi.fn(), down: vi.fn() };
  const fx = {
    fire: vi.fn(),
    cut: vi.fn(),
    wound: vi.fn(),
    quake: vi.fn(),
    lie: 0,
    blow: vi.fn(),
    punch: vi.fn(),
  };
  const tracer = createTracer();
  const ctl = { pitch: 0 };
  const balls = createBalls(WORLD);
  const combat = createCombat(WORLD, audio, hud, fx, tracer, ctl, balls);
  const ids = () => audio.play.mock.calls.map(c => c[0]);
  /** The time of the frames, ms: each one 1/60 s on. */
  let now = 1000;
  const frame = (
    me: PlayerState | undefined,
    others: PlayerState[] = [],
    keys = 0,
    v: View | undefined = me && VIEW,
  ) => combat.frame(v, me, others, keys, 1 / 60, (now += 1000 / 60));
  /** What the tracer is given and does: the flashes, the bursts and the balls of the last frame. */
  const flashes: [Vec3, boolean | undefined][] = [];
  const bursts: Vec3[] = [];
  /** Which of them were red. */
  const reds: boolean[] = [];
  let orbs: Orb[] = [];
  const [flash, burst, list] = [tracer.flash, tracer.burst, tracer.orbs];
  tracer.flash = (a, own) => (flashes.push([a, own]), flash(a, own));
  tracer.burst = (at, red) => (bursts.push(at), reds.push(!!red), burst(at, red));
  tracer.orbs = l => ((orbs = l), list(l));
  return {
    audio,
    hud,
    fx,
    tracer,
    ctl,
    balls,
    combat,
    ids,
    frame,
    flashes,
    bursts,
    reds,
    orbs: () => orbs,
    at: () => now,
  };
};

/** The own player in the katana's swing: `swing` ticks left of `cut`. */
export const cutting = (cut: number, swing: number, o: Partial<PlayerState> = {}) =>
  player({ blade: true, wield: true, cut, swing, ...o });
