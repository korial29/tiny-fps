import { describe, expect, it } from 'vitest';
import { IDLE } from '../../test/teams';
import { DOWN_TICKS, ORBIT, STEP_H, TICK_HZ } from './constants';
import { MOON, ZED } from './moon';
import { STILL, floorAt } from './physics';
import { decodeSnapshot, encodeInput, encodeSnapshot } from './protocol';
import { Room } from './room';
import { SHIP } from './ship';
import { COMMAND, PHASE, STATION, Station, inside, reaches, station } from './station';
import { KEY, MODE } from './types';
import type { Conn, PlayerState, Snapshot } from './types';
import { build, ray } from './world';

const DEF = MOON.station!;
const [LO, HI] = DEF.post;
const Y = LO[1];
const DECK = DEF.deck;

describe('the station, its rules', () => {
  it('arms for the team that presses, strikes after 30 s, holds the struck 15 s, recharges 90 s from the strike', () => {
    const s = new Station();
    expect(s.wire()).toEqual({ phase: PHASE.READY, team: 0, left: 0 });
    expect(s.press(1)).toBe('armed');
    expect(s.wire()).toEqual({ phase: PHASE.ARMED, team: 1, left: 30 });
    // A teammate's press changes nothing.
    expect(s.press(1)).toBeUndefined();
    for (let k = 1; k < STATION.ARM; k++) {
      expect(s.tick()).toBeUndefined();
    }
    expect(s.tick()).toBe('strike');
    expect(s.wire()).toEqual({ phase: PHASE.STRUCK, team: 1, left: 15 });
    for (let k = 0; k < STATION.OUT; k++) {
      s.tick();
    }
    expect(s.wire()).toEqual({ phase: PHASE.COOL, team: 1, left: 75 });
    expect(s.press(0)).toBeUndefined();
    for (let k = 0; k < STATION.COOL - STATION.OUT; k++) {
      s.tick();
    }
    expect(s.phase).toBe(PHASE.READY);
  });

  it('is cancelled by an enemy press during the countdown, and recharges 90 s from it', () => {
    const s = new Station();
    s.press(0);
    for (let k = 0; k < 20 * TICK_HZ; k++) {
      s.tick();
    }
    expect(s.press(1)).toBe('cancelled');
    expect(s.wire()).toMatchObject({ phase: PHASE.COOL, left: 90 });
    for (let k = 0; k < STATION.COOL; k++) {
      expect(s.tick()).toBeUndefined();
    }
    expect(s.phase).toBe(PHASE.READY);
  });
});

describe('the station, its place', () => {
  it('floats over the rille between the edge of space and the ceiling, the same seen from either base', () => {
    expect(Y).toBeGreaterThan(ORBIT.SEAM + 100);
    expect(DEF.hall[1][1]).toBeLessThan(SHIP.CEIL - 100);
    const [brushes] = station(80, 600, ZED / 2);
    expect(MOON.brushes.slice(-brushes.length)).toEqual(brushes);
    for (const b of brushes) {
      const twin = brushes.find(
        o =>
          o.min[0] === b.min[0] &&
          o.max[0] === b.max[0] &&
          Math.abs(o.min[2] - (ZED - b.max[2])) < 1e-9 &&
          Math.abs(o.max[2] - (ZED - b.min[2])) < 1e-9,
      );
      expect(twin).toBeDefined();
    }
  });

  it('has a hangar a ship flies into from either end, its deck under the console', () => {
    const w = build(MOON);
    // The mouths: 32 m between the walls, 11 m from the deck to the lintel.
    for (const z of [ZED / 2 - 35, ZED / 2 + 35]) {
      for (let x = 60.5; x < 100; x += 1) {
        expect(floorAt(w, x, z, DECK + 10.5)).toBe(DECK);
      }
    }
    // The console on the dais, up a flight of steps no higher than a stride from the doorway.
    expect(Y - DECK).toBe(COMMAND.DAIS);
    expect(floorAt(w, LO[0] - 0.5, ZED / 2, Y + 0.5)).toBe(Y);
    let last = DECK;
    for (let x = DEF.hull[0] + COMMAND.X0 + 0.2; x < LO[0]; x += 0.1) {
      const f = floorAt(w, x, ZED / 2, last + STEP_H);
      expect(f - last).toBeLessThanOrEqual(STEP_H);
      last = f;
    }
    expect(HI[1] - Y).toBeCloseTo(1.1, 9);
  });

  it('is solid inside its cylinder but for the hangar: a ship stops on the body it sees, flies in at the mouths', () => {
    const w = build(MOON);
    const [cx, y0, cz, y1] = DEF.hull;
    expect(y1 - y0).toBe(170);
    // From the east and the west at the wings' height, from above and below: the wall within a slice.
    expect(ray(w, [cx + 400, Y + 60, cz + 5], [-1, 0, 0], 800)).toBeCloseTo(400 - 44, -1);
    expect(ray(w, [cx - 400, Y + 6, cz + 5], [1, 0, 0], 800)).toBeCloseTo(400 - 44, -1);
    // A wing, out past the body, from either side; the cannon's barrel under it.
    // Over each mouth, so the command room's window looks out between them.
    for (const s of [-1, 1]) {
      expect(ray(w, [cx - 50, DECK + 50, cz + s * 100], [1, 0, 0], 100)).toBeCloseTo(49.6, 6);
      expect(ray(w, [cx - 50, DECK + 20, cz + s * 100], [1, 0, 0], 100)).toBe(100);
    }
    expect(ray(w, [cx, DEF.gun[1] + 2, cz - 100], [0, 0, 1], 200)).toBeCloseTo(100 - 33, -1);
    expect(ray(w, [cx, y1 + 100, cz], [0, -1, 0], 400)).toBeCloseTo(95, 6);
    expect(ray(w, [cx, y0 - 100, cz], [0, 1, 0], 400)).toBeCloseTo(100 - 44, 6);
    // Down the hangar from end to end, through both mouths, nothing.
    expect(ray(w, [cx, Y + 6, cz - 200], [0, 0, 1], 400)).toBe(400);
  });

  it('lets the feet at the console reach its button, not those a step back or on the ground below', () => {
    const at = (x: number, y: number, z: number) => ({ ...STILL, x, y, z }) as PlayerState;
    expect(reaches(DEF, at(LO[0] - 0.9, Y, ZED / 2))).toBe(true);
    expect(reaches(DEF, at(HI[0] + 0.5, Y, HI[2] + 0.5))).toBe(true);
    expect(reaches(DEF, at(LO[0] - 1.5, Y, ZED / 2))).toBe(false);
    expect(reaches(DEF, at(LO[0] - 0.5, 0, ZED / 2))).toBe(false);
    expect(inside(DEF, 80, Y, ZED / 2)).toBe(true);
    expect(inside(DEF, 80, 0, ZED / 2)).toBe(false);
  });
});

describe('the station on the wire', () => {
  const base: Snapshot = { tick: 7, players: [], ...IDLE };
  it('takes two bytes after the doors, with or without doors and balls', () => {
    const station = { phase: PHASE.STRUCK, team: 1, left: 13 };
    for (const doors of [undefined, [0, 1, 0.4]]) {
      for (const balls of [
        undefined,
        [{ id: 3, by: 1, x: 1, y: 600, z: 2, dx: 0, dy: 0, dz: -1, power: 1, burst: false }],
      ]) {
        const s = { ...base, doors, balls, station };
        const plain = encodeSnapshot({ ...s, station: undefined }).byteLength;
        const buf = encodeSnapshot(s);
        expect(buf.byteLength).toBe(plain + (doors ? 2 : balls ? 3 : 4));
        const back = decodeSnapshot(buf)!;
        expect(back.station).toEqual(station);
        expect(back.doors?.length).toBe(doors?.length);
        expect(back.balls?.length).toBe(balls?.length);
      }
    }
    expect(decodeSnapshot(encodeSnapshot(base))!.station).toBeUndefined();
    expect(
      decodeSnapshot(encodeSnapshot({ ...base, station: { phase: 1, team: 0, left: 300 } }))!
        .station!.left,
    ).toBe(127);
  });
});

describe('the station in a room', () => {
  const peer = () => {
    const c: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && c.bins.push(d),
    };
    return c;
  };
  const setup = () => {
    const room = new Room({ map: 'tranquility' });
    const [red, blue, mate] = ['Ann', 'Bob', 'Cy'].map(name => {
      const c = peer();
      room.connect(c);
      room.receive(c, JSON.stringify({ t: 'join', name }));
      return c;
    });
    const seqs = new Map<Conn, number>();
    const state = (c: Conn): PlayerState => room['peers'].get(c)!.state;
    const send = (c: Conn, keys = 0) => {
      const seq = seqs.get(c) ?? 0;
      seqs.set(c, seq + 1);
      room.receive(c, encodeInput({ seq, keys, yaw: 0, pitch: 0, view: room['ticks'] }));
    };
    /** n ticks, everyone sending an empty input each. */
    const run = (n: number) => {
      for (let k = 0; k < n; k++) {
        [red, blue, mate].forEach(c => send(c));
        room.tick();
      }
    };
    const snap = (): Snapshot => decodeSnapshot(red.bins.at(-1)!)!;
    /** At the console's foot on the deck. */
    const post = (c: Conn) =>
      Object.assign(state(c), STILL, { x: LO[0] - 0.6, y: Y, z: ZED / 2, mode: MODE.GROUND });
    return { room, red, blue, mate, state, send, run, snap, post };
  };

  it('arms at a press of USE at the console, then disintegrates every enemy, who lie 15 s and come back', () => {
    const { red, blue, mate, state, send, run, snap, post } = setup();
    expect([red, blue, mate].map(c => state(c).hp > 0)).toEqual([true, true, true]);
    run(2);
    expect(snap().station).toEqual({ phase: PHASE.READY, team: 0, left: 0 });
    post(red);
    send(red, KEY.USE);
    run(2);
    expect(snap().station).toEqual({ phase: PHASE.ARMED, team: 0, left: 30 });
    run(STATION.ARM - 3);
    expect(state(blue).down).toBe(0);
    run(1);
    expect(snap().station).toMatchObject({ phase: PHASE.STRUCK, left: 15 });
    expect(state(blue).down).toBeGreaterThan(0);
    expect(state(blue).hp).toBe(0);
    // Red's own are spared, the one at the console too.
    expect([state(red).down, state(mate).down]).toEqual([0, 0]);
    // Down far past DOWN_TICKS, back within a tick or two of the 15 s.
    run(STATION.OUT - 3);
    expect(STATION.OUT - 3).toBeGreaterThan(DOWN_TICKS * 5);
    expect(state(blue).down).toBeGreaterThan(0);
    run(4);
    expect(state(blue).down).toBe(0);
    expect(state(blue).hp).toBeGreaterThan(0);
    expect(snap().station).toMatchObject({ phase: PHASE.COOL, left: 75 });
  });

  it('is cancelled when an enemy presses the button in time: nobody goes down', () => {
    const { blue, red, state, send, run, snap, post } = setup();
    post(red);
    send(red, KEY.USE);
    run(10 * TICK_HZ);
    // Red stepped away; blue comes to the console and presses.
    Object.assign(state(red), { x: 70 });
    post(blue);
    send(blue, KEY.USE);
    run(2);
    expect(snap().station).toMatchObject({ phase: PHASE.COOL, left: 90 });
    run(STATION.ARM);
    expect([state(red).down, state(blue).down]).toEqual([0, 0]);
  });

  it('does nothing at a press away from the console, nor in a room without a station', () => {
    const { red, send, run, snap } = setup();
    send(red, KEY.USE);
    run(2);
    expect(snap().station!.phase).toBe(PHASE.READY);
    const room = new Room();
    const c = peer();
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'a' }));
    room.tick();
    room.tick();
    expect(decodeSnapshot(c.bins.at(-1)!)!.station).toBeUndefined();
  });
});
