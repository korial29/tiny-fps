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

/**
 * One step of an underdamped spring (damping ratio `z` under 1): it passes `to` a little and comes
 * back, the follow-through of a body that has weight. Exact for any dt.
 */
export const sway = (
  s: number[],
  i: number,
  to: number,
  w: number,
  dt: number,
  z = 0.6,
): number => {
  const [x, v, a] = [s[i] - to, s[i + 1], z * w];
  const d = w * Math.sqrt(1 - z * z);
  const b = (v + a * x) / d;
  const [e, c, n] = [Math.exp(-a * dt), Math.cos(d * dt), Math.sin(d * dt)];
  s[i] = to + e * (x * c + b * n);
  s[i + 1] = e * (v * c - (x * d + a * b) * n);
  return s[i];
};
