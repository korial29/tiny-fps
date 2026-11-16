import { describe, expect, it } from 'vitest';
import { HP_MAX, INTERP_DELAY, RUN_SPEED } from '../shared/constants';
import { STILL } from '../shared/physics';
import { decodeSnapshot, encodeInput } from '../shared/protocol';
import { Room } from '../shared/room';
import { ROVER, park, seat } from '../shared/rover';
import { KEY, MODE, NOBODY } from '../shared/types';
import type { Conn, PlayerState, Rover, SnapPlayer, Snapshot } from '../shared/types';
import { build } from '../shared/world';
import { loaded } from '../../test/loaded';
import * as ride from '../../test/ride';
import { land, ramp } from '../../test/slope';
import { ROVER_BLEND, createPredictor } from './predict';
import { IDLE, duo } from '../../test/teams';

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
