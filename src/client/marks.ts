// The HUD's markers toward the flags, and toward the own base while its flag is being carried
// home: where on the screen each one goes. A target in view gets its mark over it; one off screen
// or behind gets an arrow on the edge of the screen, pointing the way to turn. Pure, no DOM.
import { FLAG } from '../shared/types';
import type { FlagState } from '../shared/types';
import type { Vec3 } from './mesh';

export interface Mark {
  /** The team whose flag or base it is: its colour. */
  team: number;
  kind: 'flag' | 'base';
  /** Where it is on the screen, in [0, 1] from the top left. */
  x: number;
  y: number;
  /** Radians clockwise from straight up that the arrow points at; absent when the mark is over its target. */
  arrow?: number;
  /** The label: the distance in metres. */
  text: string;
}

/** The screen area a mark stays in: the middle of the screen, clear of the score at the top. */
const BOX = { x0: 0.05, x1: 0.95, y0: 0.15, y1: 0.92 };

/**
 * The angle to the right of straight ahead, in radians (0 ahead, π/2 to the right, ±π behind), at
 * which the point (x, z) is seen from the eye (ex, ez) looking along `yaw`.
 */
export const bearing = (ex: number, ez: number, yaw: number, x: number, z: number): number => {
  const [dx, dz] = [x - ex, z - ez];
  // forward(yaw) is (-sin, -cos), the right of it (cos, -sin).
  return Math.atan2(
    dx * Math.cos(yaw) - dz * Math.sin(yaw),
    -dx * Math.sin(yaw) - dz * Math.cos(yaw),
  );
};

/** The point of the screen's box the direction `angle` (see bearing) leaves it by, from its centre. */
export const edge = (angle: number): [number, number] => {
  const [ux, uy] = [Math.sin(angle), -Math.cos(angle)];
  const [cx, cy] = [(BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2];
  const [hx, hy] = [(BOX.x1 - BOX.x0) / 2, (BOX.y1 - BOX.y0) / 2];
  const k = Math.min(hx / (Math.abs(ux) || 1e-9), hy / (Math.abs(uy) || 1e-9));
  return [cx + ux * k, cy + uy * k];
};

/** What the markers read. */
export interface MarkScene {
  /** The own player: eye position and id, and the camera yaw. */
  eye: Vec3;
  id: number;
  team: number;
  yaw: number;
  flags: readonly FlagState[];
  bases: readonly Vec3[];
  /** Where a player is (his feet), for the carrier of a flag. */
  where(id: number): Vec3 | undefined;
  /** A world point on the screen as of the last frame, or undefined behind the camera. */
  project(x: number, y: number, z: number): [number, number] | undefined;
}

/** Height above a flag's foot the mark aims at: the top of the pole. */
const TIP = 2.6;

/** The markers of a frame: each flag but one the player carries, and the own base while he carries. */
export const marks = (s: MarkScene): Mark[] => {
  const out: Mark[] = [];
  const one = (team: number, kind: Mark['kind'], [x, y, z]: Vec3) => {
    const d = Math.round(Math.hypot(x - s.eye[0], y + TIP - s.eye[1], z - s.eye[2]));
    const on = s.project(x, y + TIP, z);
    const ok = on && on[0] >= BOX.x0 && on[0] <= BOX.x1 && on[1] >= BOX.y0 && on[1] <= BOX.y1;
    const text = `${d} m`;
    if (ok) {
      out.push({ team, kind, x: on[0], y: on[1], text });
    } else {
      const a = bearing(s.eye[0], s.eye[2], s.yaw, x, z);
      const [px, py] = edge(a);
      out.push({ team, kind, x: px, y: py, arrow: a, text });
    }
  };
  s.flags.forEach((f, team) => {
    if (f.state === FLAG.CARRIED && f.by === s.id) {
      // Carried by the player: he knows where it is. His base is where to go.
      one(s.team, 'base', s.bases[s.team]);
      return;
    }
    const at =
      f.state === FLAG.HOME
        ? s.bases[team]
        : f.state === FLAG.DROPPED
          ? ([f.x, f.y, f.z] as Vec3)
          : s.where(f.by);
    if (at) {
      one(team, 'flag', at);
    }
  });
  return out;
};
