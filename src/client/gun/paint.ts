// The colours and materials the gun models are painted with.
import { SHINE } from '../mesh';
import { clamp, mix } from './loft';
import type { Paint } from './loft';

const VIOLET = [0.34, 0.12, 0.62];
const SHEEN = [0.72, 0.46, 1];
const TEAL = [0.1, 0.38, 0.72];
const DEEP = [0.16, 0.06, 0.34];
/** Cyan that blooms: unlit (layer -2) and brighter than 1. */
export const GLOW = [0.5, 1.9, 2.3];

/**
 * Violet metal that is lit by its normal: light where it faces up, dark where it faces down, and
 * shifting toward blue along the way to the muzzle, as an iridescent finish does. Returns [r, g, layer, b].
 */
export const metal =
  (dark = 0): Paint =>
  (p, n) => {
    const c = mix(
      mix(VIOLET, TEAL, clamp(-p[2] * 5 - 0.3) * 0.8),
      SHEEN,
      Math.max(n[1], 0) ** 1.5 * 0.7,
    );
    const [r, g, , b] = mix(
      [...c.slice(0, 2), 0, c[2]],
      [...DEEP.slice(0, 2), 0, DEEP[2]],
      clamp(-n[1] * 0.5 + dark),
    );
    return [r, g, SHINE, b];
  };
export const DARK = [0.035, 0.025, 0.08];
export const glow: Paint = () => [GLOW[0], GLOW[1], -2, GLOW[2]];

/** The violet white of a Tesla arc, which blooms. */
export const ARC = [1.1, 0.85, 2.6];
export const arcing: Paint = () => [ARC[0], ARC[1], -2, ARC[2]];
export const dim: Paint = () => [ARC[0] * 0.3, ARC[1] * 0.3, -2, ARC[2] * 0.3];
/** The capsule's core of lightning: violet, less than a spark. */
export const core: Paint = () => [ARC[0] * 0.45, ARC[1] * 0.3, -2, ARC[2] * 0.6];
/** Paint lit by its normal, from `lo` facing down to `hi` facing up. */
export const shade =
  (lo: number[], hi: number[]): Paint =>
  (_, n) => {
    const [r, g, b] = mix(lo, hi, Math.max(n[1], 0) ** 1.5 * 0.8);
    return [r, g, SHINE, b];
  };
/** Polished grey metal, for the rifle's housing. */
export const chrome = shade([0.16, 0.17, 0.18], [0.66, 0.68, 0.72]);
/** Dark gunmetal, and the copper of the coils. */
export const steel = shade([0.07, 0.075, 0.09], [0.42, 0.45, 0.52]);
export const copper = shade([0.3, 0.12, 0.05], [1, 0.58, 0.32]);
/** The rail gun's olive drab receiver, its wooden stock, its red cables and its ceramic insulators. */
export const drab = shade([0.1, 0.1, 0.05], [0.5, 0.48, 0.26]);
export const wood = shade([0.15, 0.07, 0.03], [0.55, 0.32, 0.15]);
export const cable = shade([0.18, 0.02, 0.02], [0.75, 0.12, 0.08]);
export const CERAMIC = [
  [0.16, 0.19, 0.17],
  [0.62, 0.68, 0.62],
];
/** The glowing orange red of a hot insulator. */
export const EMBER = [1.2, 0.32, 0.06];
