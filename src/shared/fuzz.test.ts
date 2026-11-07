import { describe, expect, it } from 'vitest';
import { Sim } from '../../test/pilot';
import {
  AIR_JUMPS,
  AMMO_MAX,
  DASH_COOLDOWN,
  DOWN_TICKS,
  GUN_COOLDOWN,
  HP_MAX,
  MAX_PITCH,
  RAIL_MAX,
} from './constants';
import { swingOf } from './blade';
import { STRIKE, step } from './gun';
import { ROOFTOPS } from './map';
import { spawn } from './physics';
import { decodeSnapshot, encodeSnapshot, onWire } from './protocol';
import { EV, KEY, MODE } from './types';
import type { PlayerState, SnapPlayer } from './types';
import { build } from './world';
import { IDLE } from '../../test/teams';

const world = build(ROOFTOPS);

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

describe('random play on ROOFTOPS', () => {
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
            encodeSnapshot({ tick: 0, players: [{ ...p, ack: 0 } as SnapPlayer], ...IDLE }),
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

describe('random fire on ROOFTOPS', () => {
  it('keeps the gun fields in range and on the wire, whatever is pressed, hit or not', () => {
    // Every key at random, FIRE and BLADE included, held a few steps; the host's hits dropped in at
    // random (health down, down for DOWN_TICKS, the weapons gone), and a gun and a katana handed
    // back now and then.
    let shots = 0;
    let rails = 0;
    let cuts = 0;
    let wielded = 0;
    let downs = 0;
    let wasDown = false;
    for (const [seed, team] of [
      [11, 0],
      [12, 1],
      [13, 0],
      [14, 1],
    ]) {
      let s = seed;
      const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const p = spawn(0, world, 0, team);
      let keys = 0;
      let yaw = p.yaw;
      for (let k = 0; k < 20000; k++) {
        if (k % 6 === 0) {
          keys = (rnd() < 0.8 ? KEY.FORWARD : 0) | (Math.floor(rnd() * 0x1000) & ~KEY.FORWARD);
          yaw += (rnd() - 0.5) * 1.5;
        }
        const before = p.shots;
        const struck = step(
          p,
          onWire({ seq: 0, keys, yaw, pitch: Math.sin(k / 40) * MAX_PITCH }),
          world,
          team,
        );
        const label = `seed ${seed}, step ${k}`;
        // A plasma shot counts a shot; the rail gun's bolt is a step spent zapping.
        expect(struck === STRIKE.SHOT, label).toBe(((p.shots - before) & 255) === 1);
        expect(struck === STRIKE.RAIL, label).toBe(!!p.zapping);
        expect(!p.zapping || !!p.railed, label).toBe(true);
        shots += +(struck === STRIKE.SHOT);
        rails += +(struck === STRIKE.RAIL);
        cuts += +(struck === STRIKE.CUT);
        wielded += +!!p.wield;
        // In hand: the katana with it, wanted (BLADE) or in mid swing, or with no gun and the
        // rail gun not wanted; the rail gun wanted (RAIL, not BLADE), or what is left.
        const rail = (p.rail ?? -1) >= 0;
        const railWanted = (keys & KEY.RAIL) !== 0 && (keys & KEY.BLADE) === 0;
        if (!p.down && !p.lock) {
          expect(!!p.wield, label).toBe(
            !!p.blade &&
              (!!p.swing || (keys & KEY.BLADE) !== 0 || (p.ammo < 0 && !(railWanted && rail))),
          );
          expect(!!p.railed, label).toBe(rail && !p.wield && (railWanted || p.ammo < 0));
        }
        if (!p.down && rnd() < 0.002) {
          Object.assign(p, {
            hp: 0,
            down: DOWN_TICKS,
            ammo: -1,
            cool: 0,
            blade: false,
            wield: false,
            swing: 0,
            rail: -1,
            railed: false,
          });
        } else if (!p.down && p.hp > 1 && rnd() < 0.01) {
          p.hp--;
        }
        // A rack is far off on these roofs: the gun comes back at random now and then.
        if (!p.down && p.ammo <= 0 && rnd() < 0.02) {
          p.ammo = AMMO_MAX;
        }
        if (!p.down && !p.blade && rnd() < 0.01) {
          p.blade = true;
        }
        if (!p.down && (p.rail ?? -1) <= 0 && rnd() < 0.01) {
          p.rail = RAIL_MAX;
        }
        downs += +(p.down > 0 && !wasDown);
        wasDown = p.down > 0;
        for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) {
          expect(Number.isFinite(v), label).toBe(true);
        }
        expect(inside(p), label).toBe(false);
        expect(p.y, label).toBeGreaterThan(ROOFTOPS.floor - 3);
        expect(p.hp, label).toBeGreaterThanOrEqual(0);
        expect(p.hp, label).toBeLessThanOrEqual(HP_MAX);
        expect(p.ammo, label).toBeGreaterThanOrEqual(-1);
        expect(p.ammo, label).toBeLessThanOrEqual(AMMO_MAX);
        expect(p.cool, label).toBeLessThanOrEqual(GUN_COOLDOWN);
        expect(p.down, label).toBeLessThanOrEqual(DOWN_TICKS);
        expect(p.down > 0, label).toBe(p.hp === 0);
        expect(p.down > 0 ? p.ammo : -1, label).toBe(-1);
        expect(p.shots & 255, label).toBe(p.shots);
        // The katana: the swing runs in the katana's ticks, only with the katana in hand, and
        // only a katana that is there is in hand.
        expect(p.swing, label).toBeGreaterThanOrEqual(0);
        expect(p.swing, label).toBeLessThanOrEqual(swingOf(p).ticks);
        expect(!p.wield || p.blade, label).toBe(true);
        expect(!p.swing || p.wield, label).toBe(true);
        expect(!p.down || (!p.blade && !p.wield && !p.swing), label).toBe(true);
        expect(p.rail ?? -1, label).toBeGreaterThanOrEqual(-1);
        expect(p.rail ?? -1, label).toBeLessThanOrEqual(RAIL_MAX);
        expect(!p.railed || (p.rail ?? -1) >= 0, label).toBe(true);
        if (k % 5 === 0) {
          const [back] = decodeSnapshot(
            encodeSnapshot({ tick: 0, players: [{ ...p, ack: 0, by: 0 }], ...IDLE }),
          )!.players;
          expect(back, label).toMatchObject({
            hp: p.hp,
            ammo: p.ammo,
            cool: p.cool,
            down: p.down,
            shots: p.shots,
            hits: p.hits,
            blade: !!p.blade,
            wield: !!p.wield,
            swing: p.swing ?? 0,
            cut: p.cut ?? 0,
            zap: !!p.zap,
            rail: p.rail ?? -1,
            railed: !!p.railed,
            zapping: !!p.zapping,
          });
        }
      }
    }
    // The run fired and went down and got up many times: or it proves little.
    expect(shots).toBeGreaterThan(300);
    expect(rails).toBeGreaterThan(100);
    expect(cuts).toBeGreaterThan(300);
    expect(wielded).toBeGreaterThan(5000);
    expect(downs).toBeGreaterThan(20);
  }, 60_000);
});
