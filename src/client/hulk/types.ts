export type V = number[];
/** A material: a texture (`l` its layer, c[0] its light, `s` its tiles a metre) or a flat paint (`l` under 0, `c` its colour). */
export interface Mat {
  l: number;
  c: V;
  s: number;
}
