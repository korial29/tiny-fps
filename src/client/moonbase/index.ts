// What is drawn of the moon base (docs/MOON.md), red's half: the dome and its windows, the hall in
// it, the tubes, the modules' windows and what lights their insides, on the boxes of
// shared/moonbase.ts. moonscape.ts calls moonbase() and mirrors it for blue.
import { MODULES, TUBES } from '../../shared/moonbase';
import { ZED } from '../../shared/moon';
import { STRIDE } from '../mesh';
import type { WorldDef } from '../../shared/world';
import type { Out } from '../verts';
import { LINTELS, HULL } from './constants';
import { frame, panel } from './kit';
import { dressing } from './props';
import { dais } from './dais';
import { eagles } from './eagle';
import { rams } from './ram';
import { eagleBanners, ramBanners } from './banner';
import { TEAM_TINT } from '../../shared/map';
import { dome, modules, tubes } from './shell';
import { hall } from './hall';

/** Red's half of the base: the dome, its hall, the tubes and the modules, a metal floor in the last two, a lit frame in each of their doorways. */
export const moonbase = (o: Out): void => {
  dome(o);
  hall(o);
  tubes(o);
  modules(o);
  for (const { min, max } of [...MODULES, ...TUBES]) {
    panel(o, 1, 0.02, min, max, HULL, 1.99);
  }
  for (const { min, max } of LINTELS) {
    const k = max[0] - min[0] < 1 ? 0 : 2;
    for (const at of [min[k] - 0.02, max[k] + 0.02]) {
      frame(o, k, at, min[2 - k], max[2 - k], min[1]);
    }
  }
};

/** Pushes onto o the mirror of red's vertices for blue: z becomes ZED - z, the normals follow, the triangles keep their front. */
const mirror = (red: number[], o: number[]) => {
  for (let t = 0; t < red.length; t += 3 * STRIDE) {
    for (const k of [0, 2, 1]) {
      const i = t + k * STRIDE;
      o.push(
        red[i],
        red[i + 1],
        ZED - red[i + 2],
        red[i + 3],
        red[i + 4],
        -red[i + 5],
        ...red.slice(i + 6, i + 10),
      );
    }
  }
};

/**
 * The base's furnishing, both halves, which render.ts draws beside the scenery: the flags' daises
 * (on the ghosts with a team tint, shared/moon.ts) with their team's lights, the dressing of red's
 * half and its mirror for blue, then each team's statues on the plinths by its door: red's rams,
 * and blue's eagles, drawn in red's frame and mirrored; and outdoors, the banners with each team's
 * emblem by its main door (banner.ts).
 */
export const furnishing = ({ teams }: WorldDef): number[] => {
  const o: number[] = [];
  teams.forEach(({ base }, k) => dais(o, base, TEAM_TINT[k]));
  const red: number[] = [];
  dressing(red);
  for (const v of red) {
    o.push(v);
  }
  mirror(red, o);
  rams(o);
  ramBanners(o);
  const eagle: number[] = [];
  eagles(eagle);
  eagleBanners(eagle);
  mirror(eagle, o);
  return o;
};
