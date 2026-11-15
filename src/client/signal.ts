// The radio screen's picture as a scrambled transmission with bad reception (the user, 2026-11-15):
// the face torn into bands slid sideways, some in the cipher's blocks, some lost to static, the red
// beside the rest, grain and scanlines. How bad it is follows the signal: it locks on, wavers,
// drops out now and then, and is lost after the line. No DOM.

/** Seconds the signal takes to lock on, and a dropout's chance each second. */
const LOCK = 0.3;
const DROPS = 1.4;

/**
 * The signal of a line of `len` s, stepped each frame by `dt` s: its loss, 0 clear to 1 lost.
 * It locks on from static, wavers about a fifth, drops out for a tenth of a second now and then,
 * and goes over the `tail` s after the line.
 */
export const createSignal = (len: number, tail: number) => {
  let [t, drop] = [0, 0];
  return (dt: number, rand = Math.random): number => {
    t += dt;
    drop = rand() < dt * DROPS ? 0.05 + 0.1 * rand() : drop - dt;
    return Math.min(
      1,
      Math.max(0.2 + 0.08 * Math.sin(t * 9), 1 - t / LOCK, (t - len) / tail, drop > 0 ? 0.85 : 0),
    );
  };
};

/**
 * Picture `src` (RGBA, `w` by `h`) into `dst` as received with loss `k` (0 to 1): bands of rows
 * torn sideways, in blocks or lost to static, more and wider as `k` grows, the red a few pixels
 * off, grain and a scanline every third row.
 */
export const scramble = (
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
  rand = Math.random,
): void => {
  const split = 1 + Math.round(3 * k);
  for (let y = 0; y < h;) {
    const end = Math.min(h, y + 2 + Math.floor(rand() * (6 + 30 * (1 - k))));
    const tear = rand() < 0.3 + 0.6 * k ? Math.round((rand() * 2 - 1) * w * 0.25 * k) : 0;
    const block = rand() < 0.6 * k ? 4 + Math.floor(rand() * 12) : 1;
    const lost = rand() < 0.5 * k * k;
    for (let r = y; r < end; r++) {
      const dim = r % 3 ? 1 : 0.7;
      const by = r - ((r - y) % block);
      for (let x = 0; x < w; x++) {
        const o = (r * w + x) * 4;
        dst[o + 3] = 255;
        if (lost) {
          dst[o] = dst[o + 1] = dst[o + 2] = rand() * 255 * dim;
          continue;
        }
        const sx = x - (x % block) - tear;
        const i = (by * w + (((sx % w) + w) % w)) * 4;
        const red = (by * w + ((((sx + split) % w) + w) % w)) * 4;
        const grain = (rand() - 0.5) * (30 + 120 * k);
        dst[o] = (src[red] + grain) * dim;
        dst[o + 1] = (src[i + 1] + grain) * dim;
        dst[o + 2] = (src[i + 2] + grain) * dim;
      }
    }
    y = end;
  }
};
