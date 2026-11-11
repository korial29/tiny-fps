// The automatic doors as drawn and heard (shared/doors.ts moves them on the host): each frame two
// panels in a blast door's frame, slid apart into the wall by how far the snapshot says the door is
// open, a strip of light on each, red when shut and green otherwise; a hiss when one starts to open
// or to shut. No GL.
import type { Door, World } from '../shared/world';
import type { Vec3 } from './mesh';
import { box, face, lit } from './moonbase';
import { SOUND } from './sfx';

const FRAME = [0.16, 0.17, 0.2];
const PANEL = [0.44, 0.46, 0.5];
const GROOVE = [0.09, 0.09, 0.11];
/** The strip of light: shut, then opening or open. */
export const LIGHT = [
  [1, 0.07, 0.05],
  [0.1, 1, 0.3],
];
/** Beyond this from the eye a door is not drawn, metres. */
const FAR = 220;

/** Eased: the panels start and stop gently. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The vertices of the door `d`, `open` from 0 to 1: a frame just inside the doorway (two posts and
 * a header, proud of the panels on both faces), and the two panels, each slid `open` of its width
 * into the wall beside it.
 */
export const panels = (o: number[], { min, max }: Door, open: number): void => {
  // The panels slide along k and are thin along j.
  const k = max[0] - min[0] > max[2] - min[2] ? 0 : 2;
  const j = 2 - k;
  const [mid, half] = [(min[k] + max[k]) / 2, (max[k] - min[k]) / 2];
  /** A corner: along the slide, up, and across the door. */
  const at = (a: number, y: number, b: number): Vec3 => {
    const v: Vec3 = [0, y, 0];
    [v[k], v[j]] = [a, b];
    return v;
  };
  const [j0, j1] = [min[j], max[j]];
  for (const [a0, a1, y0] of [
    [min[k], min[k] + 0.1, 0],
    [max[k] - 0.1, max[k], 0],
    [min[k], max[k], max[1] - 0.1],
  ]) {
    box(o, at(a0, min[1] + y0, j0 - 0.08), at(a1, max[1], j1 + 0.08), FRAME);
  }
  const slide = ease(open) * half;
  for (const s of [-1, 1]) {
    // From the seam out to the panel's far edge, in the wall once it is open.
    const [seam, edge] = [mid + s * slide, mid + s * (half + slide)];
    const [a0, a1] = [Math.min(seam, edge), Math.max(seam, edge)];
    box(o, at(a0, min[1], j0), at(a1, max[1] - 0.1, j1), PANEL);
    for (const [b, away] of [
      [j0 - 0.01, j1],
      [j1 + 0.01, j0],
    ]) {
      /** A band on this face, from u to v of the panel's width off the seam, between two heights. */
      const band = (u: number, v: number, y0: number, y1: number, rgb: number[], glow = 0) => {
        const q = [
          at(seam + s * u * half, y0, b),
          at(seam + s * v * half, y0, b),
          at(seam + s * v * half, y1, b),
          at(seam + s * u * half, y1, b),
        ];
        const make = () => face(o, q, rgb, at(mid, 1, away));
        if (glow) {
          lit(o, glow, make);
        } else {
          make();
        }
      };
      const h = max[1] - 0.1 - min[1];
      // The seam's edge, two grooves across, and the strip of light by the seam.
      band(0, 0.03, min[1], min[1] + h, GROOVE);
      band(0.03, 1, min[1] + 0.3 * h, min[1] + 0.3 * h + 0.05, GROOVE);
      band(0.03, 1, min[1] + 0.72 * h, min[1] + 0.72 * h + 0.05, GROOVE);
      band(0.1, 0.16, min[1] + 0.36 * h, min[1] + 0.66 * h, LIGHT[+(open > 0)], 1.6);
    }
  }
};

export interface Doors {
  /**
   * The doors of a snapshot (Snapshot.doors): kept for the drawing and for the world's ray(), so an
   * own shot stops where the host's does. Returns the sounds of those that start to move.
   */
  snapshot(open?: number[]): { id: number; at: Vec3 }[];
  /** The doors near `eye`, `dt` seconds after the last frame: each follows its snapshot's state. */
  draw(o: number[], eye: Vec3, dt: number): void;
  /** How far each is drawn open. */
  shown(): number[];
}

export const createDoors = (world: World): Doors => {
  const defs = world.def.doors ?? [];
  const shown = defs.map(() => 0);
  /** The way each last moved: 1 opening, -1 shutting. */
  const way = defs.map(() => -1);
  const centre = ({ min, max }: Door): Vec3 => [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  return {
    snapshot(open = []) {
      const out: { id: number; at: Vec3 }[] = [];
      world.doors?.forEach((s, i) => {
        const to = open[i] ?? 0;
        const turn = Math.sign(to - s.open);
        if (turn && turn !== way[i]) {
          way[i] = turn;
          out.push({ id: turn > 0 ? SOUND.DOOR : SOUND.SHUT, at: centre(defs[i]) });
        }
        s.open = to;
      });
      return out;
    },
    draw(o, eye, dt) {
      defs.forEach((d, i) => {
        // A snapshot's state is in fifteenths: the panels glide to it, no faster than they open.
        const to = world.doors![i].open;
        shown[i] += Math.max(-dt / 0.3, Math.min(dt / 0.3, to - shown[i]));
        const c = centre(d);
        if (Math.hypot(c[0] - eye[0], c[2] - eye[2]) < FAR) {
          panels(o, d, shown[i]);
        }
      });
    },
    shown: () => shown,
  };
};
