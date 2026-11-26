import { describe, expect, it } from 'vitest';
import { encodeInput } from './protocol';
import { Room } from './room';
import type { Conn, PlayerState, Rover } from './types';

/** A tranquility room with a human standing still and `bots` bots, run a tick at a time. */
const match = (n: number) => {
  const room = new Room({ map: 'tranquility', bots: n });
  const c: Conn = { send: () => {} };
  room.connect(c);
  room.receive(c, JSON.stringify({ t: 'join', name: 'me' }));
  const r = room as unknown as {
    peers: Map<Conn, { info: { id: number }; state: PlayerState; bot?: unknown } | null>;
    rovers: Rover[];
    ticks: number;
  };
  let seq = 0;
  const tick = () => {
    room.receive(c, encodeInput({ seq: seq++ & 0xffff, keys: 0, yaw: 0, pitch: 0, view: r.ticks }));
    room.tick();
  };
  const bots = () => [...r.peers.values()].filter(p => p && p.bot);
  return { r, tick, bots };
};

describe('a bot and a rover', () => {
  it('drives one now and then on a long way, but not every bot every time', () => {
    const { r, tick, bots } = match(8);
    const drivers = new Set<number>();
    for (let k = 0; k < 60 * 120; k++) {
      tick();
      for (const v of r.rovers) {
        if (!v.ship && v.driver !== 255) {
          drivers.add(v.driver);
        }
      }
    }
    expect(drivers.size).toBeGreaterThan(0);
    expect(drivers.size).toBeLessThan(bots().length);
  });
});
