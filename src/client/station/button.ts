// The command room's red button and its beacons, drawn each frame (the user, 2026-11-27): a round
// cap with rounded edges on the computer's desk (computer.ts), glowing while the station waits; once
// pressed it sinks into its seat and dims until the station is READY again. While a strike counts
// down, red beacons on the room's side walls flash (lamps.ts sweeps red light round the room).
import { COMMAND, PHASE, knob } from '../../shared/station';
import type { StationDef } from '../../shared/station';
import { box, face, lit } from '../brick';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';

/** Beyond this from the eye the button and the beacons are not drawn, metres. */
const FAR = 160;
const SIDES = 20;
const RED = [1, 0.08, 0.05];
const DIM = [0.45, 0.03, 0.02];
const BASE = [0.1, 0.1, 0.12];
/** The cap's radius, its height up and pressed (m), and the seconds it takes to go down or up. */
const CAP = { R: 0.2, UP: 0.13, DOWN: 0.04, MOVE: 0.15 };

/**
 * The cap's profile from its foot to its middle, [radius, height] at `h` high: straight sides,
 * then a rounded edge onto a top that swells a little.
 */
const profile = (h: number): [number, number][] => [
  [CAP.R, 0],
  [CAP.R, h - 0.04],
  [CAP.R - 0.006, h - 0.02],
  [CAP.R - 0.02, h - 0.006],
  [CAP.R - 0.045, h],
  [0, h + 0.01],
];

/** The cap at `at` (its foot), `h` high, onto o. */
export const cap = (o: Out, at: Vec3, h: number, rgb: number[]) => {
  const ring = profile(h);
  const inner: Vec3 = [at[0], at[1] + 0.005, at[2]];
  for (let i = 0; i < SIDES; i++) {
    const [a, b] = [(i * 2 * Math.PI) / SIDES, ((i + 1) * 2 * Math.PI) / SIDES];
    const p = (t: number, [r, y]: [number, number]): Vec3 => [
      at[0] + r * Math.cos(t),
      at[1] + y,
      at[2] + r * Math.sin(t),
    ];
    for (let k = 0; k + 1 < ring.length; k++) {
      const [u, v] = [ring[k], ring[k + 1]];
      face(
        o,
        v[0] > 0 ? [p(a, u), p(b, u), p(b, v), p(a, v)] : [p(a, u), p(b, u), p(a, v)],
        rgb,
        inner,
      );
    }
  }
};

export interface Button {
  /** The button and the beacons near `eye`, the station in `phase`, `t` s, `dt` s since the last. */
  draw(o: Out, eye: Vec3, phase: number, t: number, dt: number): void;
}

export const createButton = (def: StationDef): Button => {
  const at = knob(def);
  const foot: Vec3 = [at[0], at[1] + 0.035, at[2]];
  const {
    hull: [cx, , cz],
    deck: Y,
  } = def;
  /** How far down the cap is drawn, 0 up to 1 pressed. */
  let down = 0;
  return {
    draw(o, eye, phase, t, dt) {
      const to = phase === PHASE.READY ? 0 : 1;
      down += Math.max(-dt / CAP.MOVE, Math.min(dt / CAP.MOVE, to - down));
      if (Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]) > FAR) {
        return;
      }
      const h = CAP.UP + (CAP.DOWN - CAP.UP) * down;
      if (phase === PHASE.READY) {
        lit(o, 1.1 + 0.4 * Math.sin(t * 3), () => cap(o, foot, h, RED));
      } else {
        cap(o, foot, h, DIM);
      }
      // The beacons: two on each side wall, flashing while the strike counts down.
      const alarm = phase === PHASE.ARMED;
      for (const x of [cx + 29.5, cx + 38.5]) {
        for (const s of [-1, 1]) {
          const z = cz + s * (COMMAND.Z - 0.3);
          const y = Y + 17;
          box(o, [x - 0.3, y - 0.1, z - 0.3], [x + 0.3, y, z + 0.3], BASE);
          const dome = () => box(o, [x - 0.2, y, z - 0.2], [x + 0.2, y + 0.35, z + 0.2], RED);
          if (alarm) {
            lit(o, 0.6 + 1.6 * Math.max(0, Math.sin(t * 8 + x)), dome);
          } else {
            box(o, [x - 0.2, y, z - 0.2], [x + 0.2, y + 0.35, z + 0.2], DIM);
          }
        }
      }
    },
  };
};
