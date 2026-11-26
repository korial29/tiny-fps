import { TAU } from '../../shared/physics';
import { add, dot, mix, sub, unit } from '../mesh';
import type { Vec3 } from '../mesh';

import { dist } from './constants';
import { FINGER_R, cross } from './fingers';
import type { Ring } from './fingers';
import { PALM_END, rowAt } from './palm';
import type { Row } from './palm';
import { WELD_SIDES, saddle } from './webs';

/** A finger's root: its ring's middle and vertices, its back's direction and the way it leaves the palm. */
export type Root = [Vec3, Vec3[], Vec3, Vec3];

/**
 * The weld of a hand (hand()): the palm's last ring zipped to the outline of the four fingers'
 * `roots`, through `put`. `PALM` is the palm's rows and `skin` a whole hand's palm's last ring
 * (palmSkin()); `nexts` each finger's next ring as drawn and `drawn` all of its rings; `CS` and
 * `FS` the sides of the palm and of a finger.
 */
export const weld = (
  put: (p: Vec3, n: Vec3) => void,
  lite: boolean,
  CS: number,
  FS: number,
  PALM: Row[],
  skin: [Vec3, Vec3][],
  roots: Root[],
  nexts: Ring[],
  drawn: Ring[][],
) => {
  // A whole hand's weld starts where its palm's skin ends (PALM_END), a near one's on PALM[2].
  const [wz, y0, a0, b0] = lite ? PALM[2] : rowAt(PALM, PALM_END);
  type W = [Vec3, Vec3];
  const palmLoop = lite
    ? Array.from({ length: CS }, (_, k): W => {
        const a = (k * TAU) / CS;
        return [
          [a0 * Math.cos(a), y0 + b0 * Math.sin(a), wz],
          unit([Math.cos(a) / a0, Math.sin(a) / b0, 0]),
        ];
      })
    : skin;
  /** A finger's root vertices that are not inside a neighbour, on the back (`top`) or the palm side, round it the way the palm's loop goes. */
  const arc = (i: number, top: boolean): W[] => {
    const [c, ring] = roots[i];
    return ring
      .map((p, k): [Vec3, number] => [p, k])
      .filter(([p, k]) => {
        const a = (k * TAU) / FS;
        const side = i == 3 ? a <= Math.PI + 1e-6 : a < Math.PI - 1e-6;
        // A whole hand's webs (webs()) cover the sides of a root that face a neighbour: the weld
        // stops where they start.
        const h = FS / 2;
        const webbed =
          lite ||
          ((i == 3 || (top ? k <= WELD_SIDES[0] : k >= WELD_SIDES[1])) &&
            (i == 0 || (top ? k >= h - WELD_SIDES[0] : k <= 3 * h - WELD_SIDES[1] || !k)));
        return (
          webbed &&
          (top ? side : !side) &&
          roots.every(([o], j) => j == i || dist(p, o) > FINGER_R * 1.1)
        );
      })
      .map(([p]): W => [p, unit(sub(p, c))]);
  };
  /** The web's low point between fingers `i` and `i + 1`, on the back or the palm side: where their roots cross, a little back toward the palm. */
  const web = (i: number, s: number): W => {
    const [[c0, , y0r, t0], [c1, , y1r, t1]] = [roots[i], roots[i + 1]];
    // A whole hand's: where its web starts (webs()), so the weld and the web share the point.
    if (!lite) {
      return [saddle(drawn[i], drawn[i + 1], FS, s > 0), [0, 0, 0]];
    }
    const up = unit(add(y0r, y1r));
    const back = unit(add(t0, t1));
    return [
      add(
        mix(c0, c1, 0.5),
        add(up.map(c => c * s * 0.005) as Vec3, back.map(c => c * -0.003) as Vec3),
      ),
      [0, 0, 0],
    ];
  };
  // The outline in order, from the index's outer side over the back to the little finger and
  // round under the palm back to the index, the way the palm's loop goes (the user, 2026-11-09).
  const outline: W[] = [
    ...[0, 1, 2, 3].flatMap(i => (i ? [web(i - 1, 1), ...arc(i, true)] : arc(i, true))),
    ...[3, 2, 1, 0].flatMap(i => (i < 3 ? [web(i, -1), ...arc(i, false)] : arc(i, false))),
  ];
  /** Each vertex of a closed loop with how far round it it is, 0 to 1, by length. */
  const round = (l: W[]): [W, number][] => {
    const d = l.map((w, k) => dist(w[0], l[(k + 1) % l.length][0]));
    const all = d.reduce((a, b) => a + b, 0);
    let run = 0;
    return l.map((w, k) => {
      const t = run / all;
      run += d[k];
      return [w, t];
    });
  };
  const [A, B] = [round(palmLoop), round(outline)];
  let [i, j] = [0, 0];
  const v = (l: [W, number][], k: number): [W, number] =>
    k >= l.length ? [l[k % l.length][0], l[k % l.length][1] + 1] : l[k];
  const tris: W[][] = [];
  while (i < A.length || j < B.length) {
    // Advance on the loop whose next vertex comes first round it.
    const ta = i < A.length ? v(A, i + 1)[1] : Infinity;
    const tb = j < B.length ? v(B, j + 1)[1] : Infinity;
    tris.push(
      ta < tb ? [v(A, i)[0], v(A, i + 1)[0], v(B, j)[0]] : [v(A, i)[0], v(B, j + 1)[0], v(B, j)[0]],
    );
    if (ta < tb) {
      i++;
    } else {
      j++;
    }
  }
  // Each vertex's normal: its own surface's, and the weld's faces round it, outward, as much.
  const sum = new Map<Vec3, Vec3>();
  for (const t of tris) {
    const [p, q, w] = t.map(x => x[0]);
    let n = unit(cross(sub(q, p), sub(w, p)));
    if (dot(n, [p[0], p[1] - y0, 0]) < 0) {
      n = n.map(c => -c) as Vec3;
    }
    for (const [x] of t) {
      sum.set(x, add(sum.get(x) ?? [0, 0, 0], n));
    }
  }
  // The xenomorph's (the user, 2026-11-17: a seam where its fingers leave the palm): a root's
  // vertex takes the very normal its finger's tube gives it (tube()), so the light does not break
  // across the joint.
  // A spread hand's too (the user, 2026-11-23: a sharp line across the index's root): its
  // fingers fan out most from the weld, and the light broke there.
  const seamless = new Map<Vec3, Vec3>();
  // The palm's last ring too: the normal its skin gives it (palmSkin()), so no line shows across
  // the hand where the weld starts.
  for (const [p, n] of skin) {
    seamless.set(p, n);
  }
  {
    roots.forEach(([, ring], f) => {
      const [c, x, y] = nexts[f];
      ring.forEach((v, k) => {
        const a = (k * TAU) / FS;
        const on = [0, 1, 2].map(d => c[d] + x[d] * Math.cos(a) + y[d] * Math.sin(a)) as Vec3;
        seamless.set(v, unit(cross(sub(ring[(k + 1) % FS], ring[(k + FS - 1) % FS]), sub(on, v))));
      });
    });
  }
  for (const t of tris) {
    for (const [p, n] of t) {
      put(p, seamless.get(p) ?? unit(add(n, unit(sum.get(p)!))));
    }
  }
};
