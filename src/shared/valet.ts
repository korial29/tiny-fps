// A bot's ride in a rover (the user, 2026-11-26: the bots never used the car on Tranquility): on a
// long way, with a free rover close by, a bot of a driving mind walks to it, gets in, drives along
// its own way (the nodes of its path, up to the first leg of a jump) and gets out where the way
// turns to a leg, ends, or is blocked. It never drives for the sake of it: the way is the flag's.
// Pure, no DOM, no Node API.
import { forward, floorAt, norm } from './physics';
import { nearby } from './rover';
import { KEY, MODE } from './types';
import type { PlayerState, Rover } from './types';
import type { World } from './world';

type Vec3 = [number, number, number];
export type Intent = { keys: number; yaw: number; pitch: number };

const { FORWARD, BACK, USE } = KEY;

/** The ride's numbers: metres. */
export const RIDE = {
  /** The shortest way worth a car, and the farthest car it walks to. */
  LONG: 70,
  NEAR: 25,
  /** The point of its way it steers for is at least this far ahead; it gets out this close to the end of the way. */
  LOOK: 15,
  END: 8,
  /** Metres ahead it looks for a drop, and the fall that stops it. */
  AHEAD: 14,
  DROP: 2.5,
  /** Ticks it walks to a car before it gives up, drives at the longest, and stands still before it gets out. */
  WALK: 300,
  DRIVE: 900,
  STUCK: 40,
  /** Ticks before it thinks of a car again after it got out or gave up. */
  PAUSE: 600,
};

const flat = (ax: number, az: number, bx: number, bz: number) => Math.hypot(bx - ax, bz - az);
const toward = (x0: number, z0: number, x1: number, z1: number) =>
  norm(Math.atan2(-(x1 - x0), -(z1 - z0)));

/** The bot's memory of a ride. */
export class Valet {
  /** Where it walks to on the ground to board, for its own way finding; none when it is not boarding. */
  public board: Vec3 | undefined;
  private since = 0;
  private idle = 0;
  private index = 0;
  private asleep = -RIDE.PAUSE;
  private walked = 0;

  /**
   * Whether it wants this car now, on foot: it has a long way to go, the car is close and free, and
   * it is of a driving mind this once (`take` the share of the cars it takes, `rnd` its dice).
   * Decided once a PAUSE, then kept for the walk to the car.
   */
  public wants(
    p: PlayerState,
    car: Rover | undefined,
    goal: Vec3,
    t: number,
    take: number,
    rnd: () => number,
  ): boolean {
    if (this.board) {
      if (car && t - this.walked < RIDE.WALK) {
        return true;
      }
      [this.board, this.asleep] = [undefined, t];
      return false;
    }
    if (!car || !p.ground || t - this.asleep < RIDE.PAUSE) {
      return false;
    }
    this.asleep = t;
    const far = flat(p.x, p.z, goal[0], goal[2]);
    const close = flat(p.x, p.z, car.x, car.z);
    if (far < RIDE.LONG || close > far * 0.5 || rnd() >= take) {
      return false;
    }
    this.walked = t;
    this.board = [car.x, car.y, car.z];
    return true;
  }

  /** On foot toward the car `car`: walks to it, then presses USE beside it. */
  public approach(p: PlayerState, car: Rover, t: number): Intent | undefined {
    if (nearby(car, p)) {
      return { keys: t & 1 ? USE : 0, yaw: toward(p.x, p.z, car.x, car.z), pitch: 0 };
    }
    this.board = [car.x, car.y, car.z];
    return undefined;
  }

  /** Called when it sits at the wheel: the ride begins. */
  public start(t: number): void {
    [this.since, this.idle, this.index, this.board] = [t, 0, 0, undefined];
  }

  /**
   * One tick at the wheel of `car` on its `way` (the points of its path before the first leg; the
   * goal when none): the keys and look, or a press of USE to get out.
   */
  public drive(car: Rover, way: readonly Vec3[], w: World, t: number): Intent {
    const out = (): Intent => {
      this.asleep = t;
      return { keys: t & 1 ? USE : 0, yaw: car.yaw, pitch: 0 };
    };
    const speed = Math.hypot(car.vx, car.vz);
    this.idle = speed < 1.5 && t - this.since > RIDE.STUCK ? this.idle + 1 : 0;
    // Past the nodes it has come up to.
    while (
      this.index < way.length - 1 &&
      flat(car.x, car.z, way[this.index][0], way[this.index][2]) < RIDE.LOOK
    ) {
      this.index++;
    }
    const end = way.at(-1);
    const to = way[this.index] ?? end;
    if (
      !to ||
      !end ||
      t - this.since > RIDE.DRIVE ||
      this.idle > RIDE.STUCK ||
      flat(car.x, car.z, end[0], end[2]) < RIDE.END
    ) {
      return out();
    }
    const yaw = toward(car.x, car.z, to[0], to[2]);
    const err = Math.abs(norm(yaw - car.yaw + Math.PI) - Math.PI);
    // A drop ahead: brake, and out once it has stopped.
    const [fx, fz] = forward(car.yaw);
    const ahead = floorAt(w, car.x + fx * RIDE.AHEAD, car.z + fz * RIDE.AHEAD, car.y);
    if (ahead < car.y - RIDE.DROP) {
      return speed < 3 ? out() : { keys: BACK, yaw, pitch: 0 };
    }
    // Slows toward the end of its way, so it gets out at a walking pace.
    const left = flat(car.x, car.z, end[0], end[2]) - RIDE.END;
    if (left < 40 && speed > 5 + left * 0.5) {
      return { keys: BACK, yaw, pitch: 0 };
    }
    // Eases off for a sharp turn, so it does not slide past the point.
    const slow = err > 0.9 || (err > 0.4 && speed > 14);
    return { keys: slow ? (speed > 8 ? BACK : 0) : FORWARD, yaw, pitch: 0 };
  }
}

/** Whether `p` is seated at the wheel of `car`. */
export const driver = (p: PlayerState, car: Rover | undefined, id: number): car is Rover =>
  p.mode === MODE.RIDE && !!car && car.driver === id;
