// Things drawn by instance on the GL (types.ts): the meshes' buffer, made once, and the copies of
// each pass written into their own part of one buffer, then one instanced draw a mesh.
import { binner } from './cull';
import { INST } from './types';
import type { Instances } from './types';

/** Passes a frame draws copies in (the sun's and each light's map, the scene): each its own part of the copies' buffer. */
const PASSES = 8;

export type InstanceDraw = {
  /** Makes the vertex array and its buffers on a new context; `layout` points attributes 0 to 2 at the bound buffer. */
  setup: (layout: () => void) => void;
  /**
   * Draws the copies in the frustum of `m` (cull.ts bin()), the vertex shader's instance mode set
   * by `mode`. Leaves its vertex array bound: the caller binds its own again.
   */
  draw: (
    m: Float32Array,
    at: ArrayLike<number>,
    near: number,
    far: number,
    shadow: boolean,
    mode: (sm: number) => void,
  ) => void;
};

export const instanceDraw = (gl: WebGL2RenderingContext, t: Instances): InstanceDraw => {
  const b = binner(t);
  let [vao, buf, ring] = [null as WebGLVertexArrayObject | null, null as WebGLBuffer | null, 0];
  const setup = (layout: () => void) => {
    gl.bindVertexArray((vao = gl.createVertexArray()));
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(t.mesh), gl.STATIC_DRAW);
    layout();
    gl.bindBuffer(gl.ARRAY_BUFFER, (buf = gl.createBuffer()));
    gl.bufferData(gl.ARRAY_BUFFER, b.out.byteLength * PASSES, gl.DYNAMIC_DRAW);
    // Attributes 3 to 6: VERT's Pa to Pd, one set a copy.
    for (let i = 3; i < 7; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribDivisor(i, 1);
    }
  };
  const draw: InstanceDraw['draw'] = (m, at, near, far, shadow, mode) => {
    const n = b.bin(m, at, near, far, shadow);
    if (!n) {
      return;
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const base = ring * b.out.length;
    ring = (ring + 1) % PASSES;
    gl.bufferSubData(gl.ARRAY_BUFFER, base * 4, b.out, 0, n * INST);
    mode(4);
    for (let j = 0; j < t.order.length; j++) {
      const mi = t.order[j];
      const c = b.count[mi];
      if (c) {
        const off = (base + b.start[mi] * INST) * 4;
        for (let k = 0; k < 4; k++) {
          gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, INST * 4, off + k * 16);
        }
        gl.drawArraysInstanced(gl.TRIANGLES, t.ranges[mi * 2], t.ranges[mi * 2 + 1], c);
      }
    }
    mode(0);
  };
  return { setup, draw };
};
