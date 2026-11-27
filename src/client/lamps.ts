// The orbital station's lamps, lit each frame: apart from its meshes (satellite.ts), which load
// with Tranquility's chunk.
import type { StationDef } from '../shared/station';
import { LIGHT } from './lights';
import type { Light } from './lights';
import type { Vec3 } from './mesh';

/** Metres from the station within which its lamps light anything. */
const NEAR = 160;

/**
 * The station's lamps as lights, while the eye is near it: three under the hangar's roof and one high in
 * the command room, cold white; red and pulsing while a strike counts down (`alarm`).
 */
export const lamps = (
  { hull: [cx, , cz], deck: Y }: StationDef,
  eye: Vec3,
  alarm: boolean,
  t: number,
): Light[] => {
  if (Math.hypot(eye[0] - cx, eye[1] - Y, eye[2] - cz) > NEAR) {
    return [];
  }
  const k = alarm ? 0.6 + 0.4 * Math.sin(t * 6) : 1;
  const color = (alarm ? [2.4, 0.25, 0.15] : [1.5, 1.55, 1.7]).map(c => c * k) as Vec3;
  const at = (x: number, y: number, z: number, range: number): Light => ({
    kind: LIGHT.POINT,
    p: [x, y, z],
    d: [0, -1, 0],
    cone: 0,
    range,
    color,
    shadow: false,
  });
  // While a strike counts down, two red beams sweep round the command room from under its ceiling.
  const sweep = (k: number): Light[] => {
    if (!alarm) {
      return [];
    }
    const a = t * 2.5 + k * Math.PI;
    const d: Vec3 = [Math.cos(a) * 0.8, -0.6, Math.sin(a) * 0.8];
    return [
      {
        kind: LIGHT.SPOT,
        p: [cx + 33, Y + 24, cz],
        d,
        cone: 0.85,
        range: 40,
        color: [3, 0.2, 0.1],
        shadow: false,
      },
    ];
  };
  return [
    ...sweep(0),
    ...sweep(1),
    ...[-28, 0, 28].map(dz => at(cx, Y + 12.5, cz + dz, 30)),
    at(cx + 33, Y + 20, cz, 34),
  ];
};
