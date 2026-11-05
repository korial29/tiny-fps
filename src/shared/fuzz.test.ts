import { describe, expect, it } from 'vitest';
import { Sim } from '../../test/pilot';
import { AIR_JUMPS, DASH_COOLDOWN, MAX_PITCH } from './constants';
import { ROOFTOPS } from './map';
import { decodeSnapshot, encodeSnapshot } from './protocol';
import { EV, MODE } from './types';
import type { PlayerState, SnapPlayer } from './types';
import { build } from './world';

const world = build(ROOFTOPS);

describe('random play on ROOFTOPS', () => {
  const inside = (p: PlayerState) =>
    world.def.brushes.some(
      b =>
        p.x > b.min[0] + 1e-3 &&
        p.x < b.max[0] - 1e-3 &&
        p.z > b.min[2] + 1e-3 &&
        p.z < b.max[2] - 1e-3 &&
        p.y > b.min[1] + 1e-3 &&
        p.y < b.max[1] - 1e-3,
    );

  it('keeps the state valid and on the wire after every step, whatever is pressed', () => {
    // Every key bit at random, held for a few steps, a yaw that wanders and now and then turns hard.
    const seen = new Set<number>();
    let events = 0;
    for (const [seed, spawn] of [
      [1, 0],
      [2, 3],
      [3, 6],
      [4, 1],
    ]) {
      let s = seed;
      const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const sim = Sim.at(world, spawn);
      let keys = 0;
      let yaw = sim.p.yaw;
      let turn = 0;
      for (let k = 0; k < 20000; k++) {
        if (k % 8 === 0) {
          // Forward most of the time, the rest at random, and an 80 % chance each of the others.
          keys =
            (rnd() < 0.85 ? 1 : 0) | (Math.floor(rnd() * 256) & ~1 & (rnd() < 0.5 ? 0xff : 0x1c));
          turn = (rnd() - 0.5) * 0.15;
          if (rnd() < 0.05) {
            yaw += (rnd() - 0.5) * 6;
          }
        }
        yaw += turn;
        const p = sim.step(keys, yaw, Math.sin(k / 50) * MAX_PITCH);
        seen.add(p.mode);
        events |= p.ev;
        const label = `seed ${seed}, step ${k}`;
        for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.edge]) {
          expect(Number.isFinite(v), label).toBe(true);
          expect(v, label).toBe(Math.fround(v));
        }
        expect(inside(p), label).toBe(false);
        expect(p.y, label).toBeGreaterThan(ROOFTOPS.floor - 3);
        // The ranges the wire gives each field.
        expect(Object.values(MODE), label).toContain(p.mode);
        expect(p.ground, label).toBe(
          p.mode === MODE.GROUND || p.mode === MODE.SLIDE || p.mode === MODE.CROUCH,
        );
        expect(p.t, label).toBeLessThanOrEqual(255);
        expect(p.wall, label).toBeLessThanOrEqual(4);
        expect(
          [p.jumps, p.dashes].every(v => v === 0 || v === 1),
          label,
        ).toBe(true);
        expect(p.jumps, label).toBeLessThanOrEqual(AIR_JUMPS);
        expect(p.dash, label).toBeLessThanOrEqual(DASH_COOLDOWN);
        expect(p.coyote, label).toBeLessThanOrEqual(7);
        expect(p.buffer, label).toBeLessThanOrEqual(7);
        // Hanging and climbing have a ledge; nothing else does.
        expect(p.edge > 0, label).toBe(p.mode === MODE.HANG || p.mode === MODE.CLIMB);
        // What the snapshot carries is the state, exactly: a host and a client that start from
        // it carry on the same.
        if (k % 7 === 0) {
          const [back] = decodeSnapshot(
            encodeSnapshot({ tick: 0, players: [{ ...p, ack: 0 } as SnapPlayer] }),
          )!.players;
          const { ack, ...rest } = back;
          expect(ack).toBe(0);
          expect(rest, label).toMatchObject({
            ...p,
            yaw: rest.yaw,
            pitch: rest.pitch,
            ev: 0,
            fall: 0,
          });
        }
      }
    }
    // The run went through every mode and every event, or it proves little.
    expect([...seen].sort()).toEqual(Object.values(MODE).sort());
    expect(events).toBe(Object.values(EV).reduce((a, b) => a | b, 0));
  }, 60_000);
});
