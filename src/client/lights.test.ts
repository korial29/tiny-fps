import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import type { FlagDraw } from './flag';
import { LIGHT, MAX_LIGHTS, gather } from './lights';
import type { Scene } from './lights';
import type { Vec3 } from './mesh';

const player = (id: number, x: number, yaw = 0): PlayerState => ({
  id,
  x,
  y: 0,
  z: 8,
  vy: 0,
  yaw,
  pitch: 0,
  ground: true,
  ...STILL,
});
const scene = (over: Partial<Scene> = {}): Scene => ({
  eye: [8, 1.6, 8],
  yaw: 0,
  pitch: 0,
  others: [],
  t: 0,
  ...over,
});

describe('gather', () => {
  it('lights nothing besides the sun and the sky in a bare scene: no flashlight of the own player', () => {
    expect(gather(scene())).toEqual([]);
    expect(gather(scene({ yaw: 1, pitch: 0.4 }))).toEqual([]);
  });

  it('gives the other players no flashlight either, however many', () => {
    const others = Array.from({ length: 20 }, (_, i) => player(i + 1, 2 + i, i));
    expect(gather(scene({ others }))).toEqual([]);
  });

  it('makes no light at any time: no pulsing lava or flash', () => {
    for (const t of [0, 1.3, 99]) {
      expect(gather(scene({ t }))).toEqual([]);
    }
  });
});

describe('gather, with the match', () => {
  const bases: Vec3[] = [
    [4, 10, 60],
    [14, 12.4, 2],
  ];
  const ctf = (flags: FlagDraw[] = []) => ({ bases, flags });

  it('lights each base in its team colour, at hand height over the ring, with no shadow', () => {
    const lights = gather(scene({ ctf: ctf(), t: 0 }));
    expect(lights).toHaveLength(2);
    for (const [i, l] of lights.entries()) {
      expect(l.kind).toBe(LIGHT.POINT);
      expect(l.shadow).toBe(false);
      expect(l.p[0]).toBe(bases[i][0]);
      expect(l.p[1]).toBeCloseTo(bases[i][1] + 1.2, 9);
      expect(l.p[2]).toBe(bases[i][2]);
      expect(l.range).toBeGreaterThan(5);
    }
    // Red lights red, blue lights blue.
    expect(lights[0].color[0]).toBeGreaterThan(lights[0].color[2] * 2);
    expect(lights[1].color[2]).toBeGreaterThan(lights[1].color[0] * 1.5);
  });

  it('breathes with the clock, and is never dark', () => {
    const level = (t: number) => gather(scene({ ctf: ctf(), t }))[0].color[0];
    const levels = [0, 0.4, 0.8, 1.2, 1.6].map(level);
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels) * 1.3);
    expect(Math.min(...levels)).toBeGreaterThan(0.5);
  });

  it('adds a light on a flag that lies on the ground, none on a flag at home or carried', () => {
    const none = gather(
      scene({
        ctf: ctf([
          { team: 0, at: bases[0] },
          { team: 1, at: [3, 3, 3], by: { id: 1, yaw: 0, vx: 0, vz: 0 } },
        ]),
      }),
    );
    expect(none).toHaveLength(2);
    const lying = gather(scene({ ctf: ctf([{ team: 1, at: [20, 12.4, 9], dropped: true }]) }));
    expect(lying).toHaveLength(3);
    expect(lying[2].p[0]).toBe(20);
    expect(lying[2].p[1]).toBeCloseTo(13.2, 9);
    expect(lying[2].p[2]).toBe(9);
    expect(lying[2].color[2]).toBeGreaterThan(lying[2].color[0]);
  });

  it('stays within the lights the renderer takes', () => {
    const flags: FlagDraw[] = Array.from({ length: 4 }, (_, i) => ({
      team: i & 1,
      at: [i, 0, 0],
      dropped: true,
    }));
    expect(gather(scene({ ctf: ctf(flags) })).length).toBeLessThanOrEqual(MAX_LIGHTS);
  });
});
