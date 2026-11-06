// Test helper: what a map must get right about its gun racks and health packs.
import { FLAG_REACH, PACK_R, PICK_H, PLAYER_H, PLAYER_R, RACK_R } from '../src/shared/constants';
import { build, hidden } from '../src/shared/world';
import type { WorldDef } from '../src/shared/world';

type Vec3 = [number, number, number];

/** Metres of roof a pick-up keeps to the edge of the top it stands on: nobody has to hang off it. */
const EDGE = 1;

/**
 * What is wrong with the racks and packs of a map, one line each; nothing when all is right. Each
 * stands on a top, at least EDGE from its edge, with room for a body above it and not inside a
 * brush; packs are 2 PACK_R apart and a rack is off its team's flag base and within 8 m of a spawn
 * it can walk to in a straight line on the spawn's roof, without being at one.
 */
export const problems = (def: WorldDef): string[] => {
  const out: string[] = [];
  const { brushes } = def;
  const w = build(def);
  const stands = (name: string, [x, y, z]: Vec3, r: number) => {
    if (
      !brushes.some(
        b =>
          b.max[1] === y &&
          b.min[0] + EDGE <= x &&
          x <= b.max[0] - EDGE &&
          b.min[2] + EDGE <= z &&
          z <= b.max[2] - EDGE,
      )
    ) {
      out.push(`${name}: no top at ${y} under it, ${EDGE} m from the edge`);
    }
    // The body that takes it stands there: a cylinder from the feet to the head, clear of brushes.
    if (
      brushes.some(
        b =>
          b.min[0] < x + PLAYER_R &&
          b.max[0] > x - PLAYER_R &&
          b.min[2] < z + PLAYER_R &&
          b.max[2] > z - PLAYER_R &&
          b.min[1] < y + PLAYER_H &&
          b.max[1] > y + 1e-6,
      )
    ) {
      out.push(`${name}: no room for a body`);
    }
    // Nothing a player could take it from at another height: no top within PICK_H of it but its own.
    if (
      brushes.some(
        b =>
          b.min[0] < x + r &&
          b.max[0] > x - r &&
          b.min[2] < z + r &&
          b.max[2] > z - r &&
          b.max[1] !== y &&
          Math.abs(b.max[1] - y) < PICK_H &&
          b.max[1] > y - PICK_H,
      )
    ) {
      out.push(`${name}: a step or a ledge within its circle`);
    }
  };
  def.packs?.forEach((p, k) => {
    stands(`pack ${k}`, p, PACK_R);
    def.packs?.forEach((q, j) => {
      if (j > k && Math.hypot(p[0] - q[0], p[2] - q[2]) < 4 * PACK_R) {
        out.push(`packs ${k} and ${j} are too close`);
      }
    });
  });
  if ((def.packs?.length ?? 0) > 32) {
    out.push('more than 32 packs');
  }
  def.teams.forEach(({ base, spawns, rack }, team) => {
    if (!rack) {
      out.push(`team ${team}: no rack`);
      return;
    }
    stands(`rack ${team}`, rack, RACK_R);
    if (Math.hypot(rack[0] - base[0], rack[2] - base[2]) < FLAG_REACH + RACK_R + 1) {
      out.push(`rack ${team}: on the flag base`);
    }
    const near = spawns.filter(
      ([x, y, z]) => y === rack[1] && Math.hypot(x - rack[0], z - rack[2]) < 8,
    );
    if (!near.length) {
      out.push(`rack ${team}: not on the spawn roof, within 8 m of a spawn`);
    }
    for (const [x, y, z] of near) {
      if (Math.hypot(x - rack[0], z - rack[2]) < RACK_R) {
        out.push(`rack ${team}: a spawn stands in its circle`);
      }
      if (hidden(w, [x, y + 1, z], [rack[0], rack[1] + 1, rack[2]])) {
        out.push(`rack ${team}: not in sight of the spawn at ${x}, ${z}`);
      }
    }
  });
  return out;
};
