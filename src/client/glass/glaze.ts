// Lit glass that mirrors what is round it (Tranquility's portholes and windows, docs/MOON.md).
import { PANE, STRIDE, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import { room } from '../verts';
import type { Out } from '../verts';

/**
 * Turns the vertices of `o` from `from` on into a pane on the PANE layer, facing `out`, its middle
 * at `mid`: each normal leans out from the middle by `bulge` at `r` metres, so the glass looks domed
 * and the sky and the sun in it move across it. Keeps the glow's colour (glow() first).
 */
export const glaze = (dst: Out, from: number, mid: Vec3, out: Vec3, r: number, bulge: number) => {
  const o = room(dst, 0);
  for (let i = from; i < dst.length; i += STRIDE) {
    const d = [0, 1, 2].map(k => o[i + k] - mid[k]);
    const along = d[0] * out[0] + d[1] * out[1] + d[2] * out[2];
    [o[i + 3], o[i + 4], o[i + 5]] = unit(
      [0, 1, 2].map(k => out[k] + (bulge * (d[k] - along * out[k])) / r) as Vec3,
    );
    o[i + 8] = PANE;
  }
};
