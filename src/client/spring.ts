/**
 * One step of a critically damped spring: `s[i]` is the value, `s[i + 1]` its speed, `w` the
 * stiffness (1 / s). Exact for any dt and never overshoots `to`. Returns the new value.
 */
export const damp = (s: number[], i: number, to: number, w: number, dt: number): number => {
  const x = s[i] - to;
  const k = s[i + 1] + w * x;
  const e = Math.exp(-w * dt);
  s[i] = to + (x + k * dt) * e;
  s[i + 1] = (s[i + 1] - w * k * dt) * e;
  return s[i];
};
