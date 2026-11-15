import { describe, expect, it } from 'vitest';
import { MOON } from './moon';
import { STILL } from './physics';
import { encodeInput } from './protocol';
import { Room } from './room';
import { SHIP } from './ship';
import { SORTIE, approach, steer } from './sortie';
import { PHASE, STATION, inside } from './station';
import { KEY, MODE, NOBODY } from './types';
import type { Conn, PlayerState, Rover } from './types';

const DEF = MOON.station!;

/** A room on the moon with one person (red, standing still) and `bots` less one bot (blue), run a tick at a time. */
const match = (bots = 2) => {
  const room = new Room({ map: 'tranquility', bots });
  const c: Conn = { send: () => {} };
  room.connect(c);
  room.receive(c, JSON.stringify({ t: 'join', name: 'me' }));
  const r = room as unknown as {
    peers: Map<
      Conn,
      { info: { id: number; team: number }; state: PlayerState; bot?: unknown } | null
    >;
    rovers: Rover[];
    station: { phase: number; team: number; ticks: number };
    ticks: number;
  };
  let seq = 0;
  const players = () => [...r.peers.values()].filter(p => p !== null);
  const me = () => players().find(p => !p.bot)!;
  const bot = () => players().find(p => p.bot)!;
  const tick = (keys = 0) => {
    room.receive(c, encodeInput({ seq: seq++ & 0xffff, keys, yaw: 0, pitch: 0, view: r.ticks }));
    room.tick();
  };
  return { r, me, bot, tick };
};

describe('a bot at the orbital station', () => {
  it('flies its ship up, presses the button, guards it, and flies home to its pad once it has struck', () => {
    const { r, me, bot, tick } = match();
    expect([me().info.team, bot().info.team]).toEqual([0, 1]);
    const ship = r.rovers.find(v => v.ship && v.z < 140)!;
    let [armed, struck, home] = [-1, -1, -1];
    for (let k = 0; k < 150 * 60 && home < 0; k++) {
      tick();
      if (armed < 0 && r.station.phase === PHASE.ARMED) {
        armed = k;
        expect(r.station.team).toBe(1);
        expect(inside(DEF, bot().state.x, bot().state.y, bot().state.z)).toBe(true);
      }
      if (struck < 0 && r.station.phase === PHASE.STRUCK) {
        struck = k;
        expect(me().state.down).toBeGreaterThan(0);
        // It stood guard at the post all through the countdown.
        expect(bot().state.x).toBeGreaterThan(DEF.post[0][0] - 2);
      }
      if (struck > 0 && ship.driver === NOBODY && ship.y < 2 && bot().state.mode !== MODE.RIDE) {
        home = k;
      }
    }
    expect(armed / 60).toBeLessThan(45);
    expect(Math.abs(struck - armed - STATION.ARM)).toBeLessThanOrEqual(1);
    expect(home / 60).toBeLessThan(140);
    expect(Math.hypot(ship.x - MOON.ships![1][0], ship.z - MOON.ships![1][2])).toBeLessThan(3);
  });

  it("cancels the other team's strike in time from its own base", () => {
    const { r, me, bot, tick } = match();
    tick();
    Object.assign(me().state, STILL, {
      x: DEF.post[0][0] - 0.6,
      y: DEF.post[0][1],
      z: 140,
      mode: MODE.GROUND,
    });
    tick(KEY.USE);
    expect(r.station).toMatchObject({ phase: PHASE.ARMED, team: 0 });
    for (let k = 0; k < STATION.ARM && r.station.phase === PHASE.ARMED; k++) {
      tick();
    }
    expect(r.station.phase).toBe(PHASE.COOL);
    expect(bot().state.down).toBe(0);
  });

  it('flies a ship to a point and stops there', () => {
    const r = {
      x: 0,
      y: 600,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      wy: 0,
      wp: 0,
      wr: 0,
      steer: 0,
      driver: 0,
      rider: NOBODY,
      ship: true,
    } as Rover;
    const to: [number, number, number] = [0, 610, -60];
    expect(steer(r, to, true).keys & KEY.FORWARD).toBeTruthy();
    expect(steer(r, to, true).keys & KEY.JUMP).toBeTruthy();
    expect(steer({ ...r, vz: -40 }, [0, 600, -10], true).keys & KEY.BACK).toBeTruthy();
    // The way in for each team: in front of its own mouth, then down on the deck by its circle.
    const [a, b] = approach(DEF, 0);
    expect(a[2]).toBeGreaterThan(184);
    expect(b).toEqual([80 + SORTIE.EAST, 600 + SHIP.DROP + 0.3, 140 + SORTIE.LAND]);
    expect(approach(DEF, 1)[1][2]).toBe(140 - SORTIE.LAND);
  });
});

describe('a ship left in the station', () => {
  it('goes home once nobody has been in the station for 20 s', () => {
    const { r, me, tick } = match(0);
    const ship = r.rovers.find(v => v.ship && v.z > 140)!;
    Object.assign(ship, { x: 86, y: 601.3, z: 150 });
    Object.assign(me().state, STILL, { x: 80, y: 600, z: 130, mode: MODE.GROUND });
    for (let k = 0; k < STATION.RECALL + 10; k++) {
      tick();
    }
    expect(ship.y).toBeGreaterThan(590);
    me().state.y = 0;
    Object.assign(me().state, { x: 30, z: 240 });
    for (let k = 0; k < STATION.RECALL + 2; k++) {
      tick();
    }
    expect(ship.y).toBeLessThan(2);
  });
});
