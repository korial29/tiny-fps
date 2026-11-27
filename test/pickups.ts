// Test helper: what a map must get right about its gun and katana racks and its packs.
import {
  EYE,
  FLAG_REACH,
  PACK_BITS,
  PACK_R,
  PICK_H,
  PLAYER_H,
  PLAYER_R,
  RACK_R,
} from '../src/shared/constants';
import { ground } from '../src/shared/relief';
import { build, hidden } from '../src/shared/world';
import type { WorldDef } from '../src/shared/world';

type Vec3 = [number, number, number];

/** Metres of roof a pick-up keeps to the edge of the top it stands on: nobody has to hang off it. */
const EDGE = 1;
/** The highest top above a spawn a rack may stand on: a standing jump lands on 1.7 m. */
const JUMP_UP = 1.7;

/**
 * What is wrong with the racks and packs of a map, one line each; nothing when all is right. Each
 * stands on a top, at least EDGE from its edge, with room for a body above it and not inside a
 * brush; packs are separated, and the gun rack is near a spawn but off the flag base.
 */
export const problems = (def: WorldDef): string[] => {
  const out: string[] = [];
  const { brushes } = def;
  const w = build(def);
  const stands = (name: string, [x, y, z]: Vec3, r: number) => {
    if (
      // On a relief map a pick-up may stand on the ground itself, clear of any brush.
      !(def.relief && y === ground(w, x, z)) &&
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
  });
  def.ammo?.forEach((p, k) => stands(`ammo pack ${k}`, p, PACK_R));
  def.cells?.forEach((p, k) => stands(`rail cell ${k}`, p, PACK_R));
  def.vests?.forEach((p, k) => stands(`armour ${k}`, p, PACK_R));
  // Every pack, health, ammo, rail cell and armour, is clear of the others, of the racks and of the flag bases.
  const kinds: [string, Vec3[]][] = [
    ['pack', def.packs ?? []],
    ['ammo pack', def.ammo ?? []],
    ['rail cell', def.cells ?? []],
    ['armour', def.vests ?? []],
  ];
  const all = kinds.flatMap(([, l]) => l);
  const names = kinds.flatMap(([name, l]) => l.map((_, k) => `${name} ${k}`));
  all.forEach((p, k) => {
    all.forEach((q, j) => {
      if (j > k && Math.hypot(p[0] - q[0], p[2] - q[2]) < 4 * PACK_R) {
        out.push(`${names[k]} and ${names[j]} are too close`);
      }
    });
    for (const [t, { base, rack, blade, rail, rifle }] of def.teams.entries()) {
      for (const [what, at] of [
        ['base', base],
        ['rack', rack],
        ['katana rack', blade],
        ['rail rack', rail],
        ['rifle rack', rifle],
      ] as const) {
        if (at && Math.hypot(p[0] - at[0], p[2] - at[2]) < 4 * PACK_R) {
          out.push(`${names[k]} is by the ${what} of team ${t}`);
        }
      }
    }
  });
  if (all.length > PACK_BITS) {
    out.push(`more than ${PACK_BITS} packs`);
  }
  def.teams.forEach(({ base, spawns, rack, blade, rail, rifle }, team) => {
    if (rail) {
      stands(`rail rack ${team}`, rail, RACK_R);
    }
    if (rifle) {
      stands(`rifle rack ${team}`, rifle, RACK_R);
    }
    if (!rack) {
      out.push(`team ${team}: no rack`);
      return;
    }
    stands(`rack ${team}`, rack, RACK_R);
    if (!blade) {
      out.push(`team ${team}: no katana rack`);
    } else {
      stands(`katana rack ${team}`, blade, RACK_R);
      for (const [x, y, z] of spawns) {
        if (y === blade[1] && Math.hypot(x - blade[0], z - blade[2]) < RACK_R) {
          out.push(`katana rack ${team}: a spawn stands in its circle`);
        }
      }
    }
    if (Math.hypot(rack[0] - base[0], rack[2] - base[2]) < FLAG_REACH + RACK_R + 1) {
      out.push(`rack ${team}: on the flag base`);
    }
    const near = spawns.filter(
      ([x, y, z]) =>
        rack[1] >= y && rack[1] - y <= JUMP_UP && Math.hypot(x - rack[0], z - rack[2]) < 20,
    );
    if (!near.length) {
      out.push(`rack ${team}: not within 20 m of a spawn and a jump above it`);
    }
    for (const [x, y, z] of near) {
      if (Math.hypot(x - rack[0], z - rack[2]) < RACK_R) {
        out.push(`rack ${team}: a spawn stands in its circle`);
      }
      if (hidden(w, [x, y + EYE, z], [rack[0], rack[1] + 1, rack[2]])) {
        out.push(`rack ${team}: not in sight of the spawn at ${x}, ${z}`);
      }
    }
  });
  return out;
};
