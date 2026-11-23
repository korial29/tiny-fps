import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  ARMOR_MAX,
  GUN_MAG,
  DOWN_TICKS,
  GUN_COOLDOWN,
  GUN_RELOAD,
  HP_MAX,
  MAX_PITCH,
  RAIL_CAP,
  RAIL_MAX,
  RAIL_RELOAD,
  RIFLE_CLIP,
  RIFLE_RELOAD,
} from './constants';
import { swingOf } from './blade';
import { STRIKE, step } from './gun';
import { ROOFTOPS } from './map';
import { spawn } from './physics';
import { decodeSnapshot, encodeSnapshot, onWire } from './protocol';
import { KEY } from './types';
import type { PlayerState } from './types';
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

describe('random fire on ROOFTOPS', () => {
  it('keeps the gun fields in range and on the wire, whatever is pressed, hit or not', () => {
    // Every key at random, FIRE and BLADE included, held a few steps; the host's hits dropped in at
    // random (health down, down for DOWN_TICKS, the weapons gone), and a gun and a katana handed
    // back now and then.
    let shots = 0;
    let rails = 0;
    let rings = 0;
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
          // G less often: each rail gun's ring overheats it for 2 s, and its bolt would seldom go out.
          keys &= rnd() < 0.15 ? ~0 : ~KEY.SPECIAL;
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
        // A plasma shot, a laser shot and the rail gun's ring count a shot; its bolt is a step spent zapping.
        expect(
          struck === STRIKE.SHOT ||
            struck === STRIKE.LASER ||
            struck === STRIKE.NADE ||
            struck === STRIKE.RING,
          label,
        ).toBe(((p.shots - before) & 255) === 1);
        expect(struck !== STRIKE.RING || !!p.railed, label).toBe(true);
        expect((struck !== STRIKE.LASER && struck !== STRIKE.NADE) || !!p.rifled, label).toBe(true);
        expect(struck === STRIKE.RAIL, label).toBe(!!p.zapping);
        expect(!p.zapping || !!p.railed, label).toBe(true);
        shots += +(struck === STRIKE.SHOT);
        rails += +(struck === STRIKE.RAIL);
        rings += +(struck === STRIKE.RING);
        cuts += +(struck === STRIKE.CUT);
        wielded += +!!p.wield;
        // In hand: the katana in mid swing, else the weapon wanted (BLADE, RAIL, RIFLE, or none for
        // the gun) when he has it, else the first he has of the gun, the katana, the rail gun and
        // the rifle; one at most.
        const has = [p.ammo >= 0, !!p.blade, (p.rail ?? -1) >= 0, (p.rifle ?? -1) >= 0];
        const want = keys & KEY.BLADE ? 1 : keys & KEY.RAIL ? 2 : keys & KEY.RIFLE ? 3 : 0;
        const hand = p.swing && p.blade ? 1 : has[want] ? want : has.indexOf(true);
        if (!p.down && !p.lock) {
          expect([!!p.wield, !!p.railed, !!p.rifled], label).toEqual([
            hand == 1,
            hand == 2,
            hand == 3,
          ]);
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
            mag: 0,
            cap: 0,
            reload: 0,
            rifle: -1,
            clip: 0,
            rifled: false,
            nades: 0,
            lob: 0,
          });
        } else if (!p.down && p.hp > 1 && rnd() < 0.01) {
          p.hp--;
          // Some armour now and then, as an armour pickup gives it: on the wire with the health.
          p.armor = Math.floor(rnd() * (ARMOR_MAX + 1));
        }
        // With no weapon at all as the step left him: a swing is then a punch.
        const bare = p.ammo < 0 && !p.blade && (p.rail ?? -1) < 0 && (p.rifle ?? -1) < 0;
        // A rack is far off on these roofs: the gun comes back at random now and then.
        if (!p.down && p.ammo <= 0 && rnd() < 0.02) {
          [p.ammo, p.mag] = [AMMO_MAX, GUN_MAG];
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
        // Twice the cooldown after the pistol's burst, within the 4 bits `cool` has on the wire.
        expect(p.cool, label).toBeLessThanOrEqual(2 * GUN_COOLDOWN);
        expect(p.down, label).toBeLessThanOrEqual(DOWN_TICKS);
        expect(p.down > 0, label).toBe(p.hp === 0);
        expect(p.down > 0 ? p.ammo : -1, label).toBe(-1);
        // The battery holds no more than the gun has, nor the capsule than the rail gun.
        expect(p.mag, label).toBeLessThanOrEqual(Math.min(GUN_MAG, Math.max(p.ammo, 0)));
        expect(p.cap ?? 0, label).toBeLessThanOrEqual(
          Math.min(RAIL_CAP, Math.max(p.rail ?? -1, 0)),
        );
        expect(p.reload, label).toBeLessThanOrEqual(
          Math.max(GUN_RELOAD, RAIL_RELOAD, RIFLE_RELOAD),
        );
        expect(p.clip ?? 0, label).toBeLessThanOrEqual(
          Math.min(RIFLE_CLIP, Math.max(p.rifle ?? -1, 0)),
        );
        expect(p.shots & 255, label).toBe(p.shots);
        // The katana: the swing runs in the katana's ticks, only with the katana in hand, and
        // only a katana that is there is in hand.
        expect(p.swing, label).toBeGreaterThanOrEqual(0);
        expect(p.swing, label).toBeLessThanOrEqual(swingOf(p).ticks);
        expect(!p.wield || p.blade, label).toBe(true);
        // Or a punch, with no weapon at all.
        expect(!p.swing || p.wield || bare, label).toBe(true);
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
            armor: p.armor ?? 0,
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
    expect(rings).toBeGreaterThan(5);
    expect(cuts).toBeGreaterThan(300);
    expect(wielded).toBeGreaterThan(5000);
    expect(downs).toBeGreaterThan(20);
  }, 60_000);
});
