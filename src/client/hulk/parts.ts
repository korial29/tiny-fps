import { LAYOUT, SHIP } from '../../shared/beach';
import { ground, raise } from '../../shared/relief';
import type { World, WorldDef } from '../../shared/world';
import { MID, drift, o, setGy, setO } from './common';
import { skin, tail, tip, fairings } from './hull';
import { inside } from './inside';
import { cabin } from './cabin';
import { wing } from './wings';
import { KIND, CAMP, BARE } from './debris';

/**
 * The wreck by part, each its vertices in the renderer's format: the hull's skin and fairings,
 * the tail's and the nose's ends, what is inside the hull, the two wings, the debris (the engines, the rails), the camps. Read from the map at the call.
 */
export const parts = (def: WorldDef) => {
  const w = def.relief && ({ relief: raise(def.relief) } as World);
  setGy((x, z) => {
    const g = w ? ground(w, x, z) : 0;
    return g > -1e9 ? g : 0;
  });
  const made = (f: () => void) => {
    setO([]);
    f();
    return o;
  };
  const scrap = (camp: boolean) => () => {
    for (const p of LAYOUT.pieces) {
      // The crates inside the hull are the wreck's.
      const home = CAMP.includes(p.kind) && Math.abs((p.min[2] + p.max[2]) / 2 - MID) > 1;
      if (KIND[p.kind] && home == camp) {
        const b = def.brushes.find(e =>
          e.min.every((v, i) => v == p.min[i] && e.max[i] == p.max[i]),
        );
        KIND[p.kind](p, b?.tint, (p.min[2] + p.max[2]) / 2 < MID ? -1 : 1);
        if (!BARE.includes(p.kind)) {
          drift(p);
        }
      }
    }
  };
  return {
    // First: drawn before the skin and the linings, what they hide from inside is not shaded twice.
    cabin: made(cabin),
    hull: made(() => {
      SHIP.forEach((_, n) => skin(n));
      fairings();
    }),
    ends: made(() => {
      tail();
      tip();
    }),
    inside: made(() => SHIP.forEach((_, n) => inside(n))),
    wings: made(() => [1, -1].forEach(wing)),
    debris: made(scrap(false)),
    camps: made(scrap(true)),
  };
};

/** Its vertices, in the renderer's format. */
export const hulk = (def: WorldDef): number[] => Object.values(parts(def)).flat();
