// The frame's vertices (docs/PERFORMANCE.md): a typed buffer kept from frame to frame, written
// where a plain array was. A JS array that grows to millions of numbers a frame is copied into ever
// larger stores: some 4 ns a number, more than most models take to compute it.

/** Where the vertices go: a plain array (the tests, the meshes built once) or the frame's Verts. */
export type Out = number[] | Verts;

/** Numbers written and read by index: a plain array or a Verts' store. */
export interface Floats {
  [i: number]: number;
}

/**
 * The frame's vertices in a store that only grows. Doubles, as a plain array holds them: what is
 * read back (the armour off the skin) comes out the same, and the upload rounds them to floats.
 */
export class Verts {
  a = new Float64Array(1 << 16);
  /** The numbers written: the next goes there. Set it lower to drop the last ones. */
  length = 0;

  /** Makes room for `n` numbers more and returns the store to write them in. */
  room(n: number): Float64Array {
    const need = this.length + n;
    if (need > this.a.length) {
      const a = new Float64Array(Math.max(need, this.a.length * 2));
      a.set(this.a);
      this.a = a;
    }
    return this.a;
  }

  push(...v: number[]) {
    const a = this.room(v.length);
    for (let i = 0; i < v.length; i++) {
      a[this.length++] = v[i];
    }
  }

  /** The numbers from `from` to `to` (at most the length), as an array. */
  slice(from: number, to: number): number[] {
    return Array.from(this.a.subarray(from, to));
  }
}

/**
 * Makes room in `out` for `n` numbers more and returns where to write them by index, from
 * `out.length` on. Set `out.length` to the end of what was written afterwards: a Verts does not
 * count by itself (a plain array does, and the assignment is then a no-op).
 */
export const room = (out: Out, n: number): Floats => (Array.isArray(out) ? out : out.room(n));
