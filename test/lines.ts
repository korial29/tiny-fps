// Test helper: the lines of ROOFTOPS, each flown with the real physics by a small pilot. A line
// starts where the one before it ends (or anywhere on its roof) and ends standing on its target.
import { KEY } from '../src/shared/types';
import { EAST, NORTH, SOUTH } from './pilot';
import type { Sim } from './pilot';

const { FORWARD, JUMP, SPRINT, DASH, CROUCH } = KEY;

/** A to B: the 4.2 m gap at the start, by a run and a jump from the edge. */
export const gapAB = (s: Sim): void => {
  s.goTo(16, 66);
  s.goTo(16, 57.5);
  s.step(FORWARD | JUMP, NORTH);
  s.until(p => p.ground, FORWARD, NORTH, 120);
};

/** B to C: a run and a jump at the 2.4 m face of C, caught by the hands and climbed. */
export const ledgeBC = (s: Sim): void => {
  s.goTo(22, 41);
  s.goTo(22, 37.2);
  s.step(FORWARD | JUMP, NORTH);
  s.until(p => p.ground && p.y > 12, FORWARD, NORTH, 200);
};

/**
 * C to F, 13 m of nothing, or F to C: a sprint, a jump from the edge and a dash late in the
 * flight (`dash` steps after the jump), or a double jump there instead.
 */
export const chasm = (
  s: Sim,
  to: 'F' | 'C',
  how: { dash?: number; double?: number; sprint?: boolean } = { dash: 40, sprint: true },
): void => {
  const north = to === 'F';
  const yaw = north ? NORTH : SOUTH;
  const sprint = how.sprint ?? true;
  const keys = FORWARD | (sprint ? SPRINT : 0);
  const [x, from, edge] = north ? [22, 35, 20.3] : [22, -3, 6.7];
  s.goTo(x, from, { sprint: false });
  s.until(p => (north ? p.z <= edge : p.z >= edge), keys, yaw, 200);
  let k = -1;
  s.until(
    p => p.ground && (north ? p.z < 8 : p.z > 19) && p.y > 12,
    () => {
      if (k < 0) {
        k = 0;
        return keys | JUMP;
      }
      k++;
      return keys | (k === how.dash ? DASH : 0) | (k === how.double ? JUMP : 0);
    },
    yaw,
    200,
  );
};

/** C to E: a jump east across the 3 m alley, to the roof 4.4 m down. */
export const alleyCE = (s: Sim): void => {
  s.goTo(16, 24.5);
  s.goTo(23.6, 24.5);
  s.step(FORWARD | JUMP, EAST);
  s.until(p => p.ground, FORWARD, EAST, 200);
};

/** E: the 2.0 m ledge box, from its north face, caught and climbed. */
export const ledgeE = (s: Sim): void => {
  s.goTo(32, 25);
  s.goTo(32, 26.5);
  s.step(FORWARD | JUMP, SOUTH);
  s.until(p => p.ground && p.y > 9.5, FORWARD, SOUTH, 200);
};

/**
 * E: along the 26 m wall, northward, in the lane west of it: a sprint, a jump that becomes a
 * wall-run, and a kick-off after 0.75 s.
 */
export const wallrunE = (s: Sim): void => {
  s.goTo(35.55, 33);
  s.goTo(35.55, 48);
  let jumped = false;
  let kicked = false;
  s.until(
    p => kicked && p.ground,
    p => {
      let keys = FORWARD | SPRINT;
      if (!jumped && p.vz < -8.5) {
        keys |= JUMP;
        jumped = true;
      } else if (jumped && !kicked && p.mode === 2 && p.t >= 45) {
        keys |= JUMP;
        kicked = true;
      }
      return keys;
    },
    NORTH,
    400,
  );
};

/** E: a sprint south along the west lane and a slide under the lintel, standing again beyond it. */
export const slideE = (s: Sim): void => {
  s.goTo(28.8, 22);
  let sliding = false;
  s.until(
    p => p.z > 47.6 && p.mode === 0,
    p => {
      sliding ||= p.z > 38.5;
      return FORWARD | SPRINT | (sliding && p.z < 46.6 ? CROUCH : 0);
    },
    SOUTH,
    400,
  );
};

/** E to G: over the 0.5 m beam, walking, to the far roof. */
export const beamEG = (s: Sim): void => {
  s.goTo(41.75, 49.2);
  s.goTo(41.75, 62);
  s.settle();
};
