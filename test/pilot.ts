// Test helper: a player driven step by step through the real physics, the inputs kept so the
// same run can be replayed through the room and the predictor.
import { move, spawn } from '../src/shared/physics';
import { onWire } from '../src/shared/protocol';
import { KEY } from '../src/shared/types';
import type { Input, PlayerState } from '../src/shared/types';
import type { World } from '../src/shared/world';

export type Step = Omit<Input, 'seq'>;

/** Yaw that faces from (x0, z0) toward (x1, z1): yaw 0 looks toward -z. */
export const toward = (x0: number, z0: number, x1: number, z1: number): number =>
  Math.atan2(-(x1 - x0), -(z1 - z0));

// Yaws: forward(yaw) = (-sin, -cos), so these face -z, +x, +z and -x.
export const NORTH = 0;
export const EAST = (3 * Math.PI) / 2;
export const SOUTH = Math.PI;
export const WEST = Math.PI / 2;

export class Sim {
  /** What was sent, rounded to the wire as the host and the predictor read it. */
  public readonly inputs: Step[] = [];
  /** Every EV bit seen, every mode, and the lowest the feet have been. */
  public ev = 0;
  public modes = new Set<number>();
  public low = Infinity;

  public p: PlayerState;
  public w: World;

  public constructor(p: PlayerState, w: World) {
    this.p = p;
    this.w = w;
  }

  /** A player of this world on its spawn n. */
  public static at(w: World, n = 0): Sim {
    return new Sim(spawn(0, w, n), w);
  }

  /** Puts the player at a place, standing still, as if it stood there. */
  public put(x: number, y: number, z: number, yaw = this.p.yaw): this {
    Object.assign(this.p, spawn(0, this.w, 0), { x, y, z, yaw });
    return this;
  }

  /** One step. */
  public step(keys: number, yaw = this.p.yaw, pitch = 0): PlayerState {
    const i = onWire({ keys, yaw, pitch, seq: 0 });
    this.inputs.push({ keys: i.keys, yaw: i.yaw, pitch: i.pitch });
    move(this.p, i, this.w);
    this.ev |= this.p.ev;
    this.modes.add(this.p.mode);
    this.low = Math.min(this.low, this.p.y);
    return this.p;
  }

  /** n steps of the same keys. */
  public run(n: number, keys: number, yaw = this.p.yaw): this {
    for (let k = 0; k < n; k++) {
      this.step(keys, yaw);
    }
    return this;
  }

  /**
   * Steps until `done` holds (checked before each step), at most `max`. `keys` and `yaw` may be
   * functions of the state and the step. Returns the steps taken, or -1 when `max` ran out.
   */
  public until(
    done: (p: PlayerState) => boolean,
    keys: number | ((p: PlayerState, k: number) => number),
    yaw: number | ((p: PlayerState, k: number) => number) = this.p.yaw,
    max = 600,
  ): number {
    for (let k = 0; k < max; k++) {
      if (done(this.p)) {
        return k;
      }
      this.step(
        typeof keys === 'number' ? keys : keys(this.p, k),
        typeof yaw === 'number' ? yaw : yaw(this.p, k),
      );
    }
    return done(this.p) ? max : -1;
  }

  /** Runs at (x, z) with FORWARD (and SPRINT) until within `r` of it, jumping on the floor if `hop`. */
  public goTo(
    x: number,
    z: number,
    opts: { sprint?: boolean; r?: number; max?: number } = {},
  ): number {
    const { sprint = false, r = 0.15, max = 600 } = opts;
    return this.until(
      p => Math.hypot(x - p.x, z - p.z) < r,
      KEY.FORWARD | (sprint ? KEY.SPRINT : 0),
      p => toward(p.x, p.z, x, z),
      max,
    );
  }

  /** Steps with no keys until on a floor again, at most `max`. */
  public settle(max = 240): this {
    this.until(p => p.ground, 0, this.p.yaw, max);
    return this;
  }
}
