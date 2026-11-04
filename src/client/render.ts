// WebGL2 drawing: one program, one buffer. The map is built once; the other players are boxes
// rewritten each frame into the tail of the same buffer. No DOM beyond the canvas.
import { MAX_PLAYERS, PLAYER_H, PLAYER_R } from '../shared/constants';
import { forward } from '../shared/physics';
import type { Box, MapDef, PlayerState } from '../shared/types';

/** Sky colour: the clear colour, and what distance fog fades to. */
const SKY = [0.56, 0.71, 0.87];
/** Floats per vertex: position, normal, colour + texture strength. */
const STRIDE = 10;
/** Vertices of a box: 6 faces of 2 triangles. */
const BOX = 36;
/** Boxes per player: body, head, visor. */
const PER_PLAYER = 3;
/** How far the floor goes past the map, so the horizon fades into the fog. */
const BEYOND = 100;

const VERT = `#version 300 es
layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec4 c;
uniform mat4 m;out vec3 P,N;out vec4 C;
void main(){P=p;N=n;C=c;gl_Position=m*vec4(p,1);}`;

// C.a is how much floor/wall texture shows: a checker and 1 m grid lines drawn from the world
// position on the face's own plane (q drops the axis of the normal), faded out where a pixel
// spans more than a few tens of centimetres.
const FRAG = `#version 300 es
precision highp float;
in vec3 P,N;in vec4 C;uniform vec3 E;out vec4 o;
void main(){
vec3 n=normalize(N),q=P*(1.-abs(n)),f=fract(q),g=(min(f,1.-f)+abs(n))/(fwidth(q)+1e-4);
float t=C.a*(1.-smoothstep(.15,.6,length(fwidth(q))));
vec3 c=C.rgb*(1.-t*(.12*mod(floor(q.x)+floor(q.y)+floor(q.z),2.)+.3*max(1.-min(g.x,min(g.y,g.z)),0.)));
c*=.45+.55*max(dot(n,normalize(vec3(.4,.8,.3))),0.);
o=vec4(mix(c,vec3(${SKY}),1.-exp(-.022*length(P-E))),1);}`;

type Vec3 = [number, number, number];

/**
 * Column-major view-projection matrix: camera at eye looking along (-sin yaw cos pitch, sin pitch,
 * -cos yaw cos pitch), y up, 70° vertical field of view.
 */
export const viewProj = (eye: Vec3, yaw: number, pitch: number, aspect: number) => {
  const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  const [N, F, t] = [0.1, 200, Math.tan((70 * Math.PI) / 360)];
  const r = [cy, 0, -sy];
  const u = [sy * sp, cp, cy * sp];
  const f = [-sy * cp, sp, -cy * cp];
  const k = (F + N) / (F - N);
  const rows = [r.map(v => v / (t * aspect)), u.map(v => v / t), f.map(v => v * k), f].map(v => [
    ...v,
    -v[0] * eye[0] - v[1] * eye[1] - v[2] * eye[2],
  ]);
  rows[2][3] -= (2 * F * N) / (F - N);
  return Float32Array.from({ length: 16 }, (_, i) => rows[i & 3][i >> 2]);
};

/** A world point on screen, in [0, 1] from the top left; undefined behind the camera. */
export const project = (
  m: Float32Array,
  x: number,
  y: number,
  z: number,
): [number, number] | undefined => {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (w <= 0) {
    return undefined;
  }
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  return [0.5 + cx / (2 * w), 0.5 - cy / (2 * w)];
};

/**
 * Appends the 36 vertices of a box centred on (cx, cy, cz) with half sizes (hx, hy, hz), turned
 * by yaw about its own vertical axis (local forward, -z, ends up along forward(yaw)).
 */
export const pushBox = (
  out: number[],
  [cx, cy, cz]: Vec3,
  [hx, hy, hz]: Vec3,
  yaw: number,
  color: number[],
) => {
  const [s, k] = [Math.sin(yaw), Math.cos(yaw)];
  const turn = (x: number, z: number) => [x * k + z * s, -x * s + z * k];
  for (let a = 0; a < 3; a++) {
    for (const side of [-1, 1]) {
      const [b, d] = [(a + 1) % 3, (a + 2) % 3];
      const n: Vec3 = [0, 0, 0];
      n[a] = side;
      const [nx, nz] = turn(n[0], n[2]);
      for (const [i, j] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const l: Vec3 = [0, 0, 0];
        [l[a], l[b], l[d]] = [side, i, j];
        const [x, z] = turn(l[0] * hx, l[2] * hz);
        out.push(cx + x, cy + l[1] * hy, cz + z, nx, n[1], nz, ...color);
      }
    }
  }
};

/** Whether the segment from a to b crosses a box (slab test): a name tag behind one is hidden. */
export const blocked = (boxes: Box[], a: Vec3, b: Vec3) =>
  boxes.some(({ x0, y0, z0, x1, y1, z1 }) => {
    let [t0, t1] = [0, 1];
    for (const [i, lo, hi] of [
      [0, x0, x1],
      [1, y0, y1],
      [2, z0, z1],
    ]) {
      const d = b[i] - a[i];
      if (d == 0) {
        if (a[i] < lo || a[i] > hi) {
          return false;
        }
      } else {
        const [u, v] = [(lo - a[i]) / d, (hi - a[i]) / d];
        [t0, t1] = [Math.max(t0, Math.min(u, v)), Math.min(t1, Math.max(u, v))];
      }
    }
    return t0 <= t1;
  });

/** The floor (a box whose top is y 0, reaching BEYOND past the map) and every map box. */
export const mapVerts = (map: MapDef, rgb: (css: string) => number[]): number[] => {
  const out: number[] = [];
  const h = BEYOND + 1;
  pushBox(out, [map.w / 2, -0.5, map.d / 2], [map.w / 2 + h, 0.5, map.d / 2 + h], 0, [
    ...rgb('#556655'),
    1,
  ]);
  for (const b of map.boxes) {
    pushBox(
      out,
      [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2],
      [(b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, (b.z1 - b.z0) / 2],
      0,
      [...rgb(b.color ?? '#888888'), 0.7],
    );
  }
  return out;
};

export interface Renderer {
  /** Draws one frame: the map and the others as seen from eye. colors maps player id to CSS. */
  frame(
    eye: Vec3,
    yaw: number,
    pitch: number,
    others: PlayerState[],
    colors: ReadonlyMap<number, string>,
  ): void;
  /** A world point on screen as of the last frame, in [0, 1] from the top left. */
  project(x: number, y: number, z: number): [number, number] | undefined;
  destroy(): void;
}

/** Throws when the browser has no WebGL2. */
export const createRenderer = (canvas: HTMLCanvasElement, map: MapDef): Renderer => {
  const gl = canvas.getContext('webgl2', { antialias: true });
  if (!gl) {
    throw new Error('WebGL2 is not available');
  }
  const pen = document.createElement('canvas').getContext('2d')!;
  const known = new Map<string, number[]>();
  /** Any CSS colour to [r, g, b] in 0..1, gray when the browser does not know it. */
  const rgb = (css: string) => {
    let c = known.get(css);
    if (!c) {
      pen.fillStyle = '#888';
      pen.fillStyle = css;
      const v = parseInt(pen.fillStyle.slice(1), 16);
      const n = v >= 0 ? v : 0x888888;
      known.set(css, (c = [n >> 16, (n >> 8) & 255, n & 255].map(x => x / 255)));
    }
    return c;
  };

  const ground = mapVerts(map, rgb);
  const tail = ground.length * 4;
  let uniforms: WebGLUniformLocation[] = [];
  let lost = false;
  let vp = new Float32Array(16);

  // Everything GL owns goes with a lost context: set it all up again on restore.
  const setup = () => {
    const prog = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, FRAG],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    uniforms = ['m', 'E'].map(n => gl.getUniformLocation(prog, n)!);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      tail + MAX_PLAYERS * PER_PLAYER * BOX * STRIDE * 4,
      gl.DYNAMIC_DRAW,
    );
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(ground));
    [3, 3, 4].reduce((at, size, i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE * 4, at * 4);
      return at + size;
    }, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
  };
  setup();

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    setup();
    lost = false;
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    frame(eye, yaw, pitch, others, colors) {
      const dpr = Math.min(devicePixelRatio, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (lost || !w || !h) {
        return;
      }
      if (canvas.width != w || canvas.height != h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      vp = viewProj(eye, yaw, pitch, w / h);
      const v: number[] = [];
      for (const p of others.slice(0, MAX_PLAYERS)) {
        const [fx, fz] = forward(p.yaw);
        const hw = PLAYER_R * 0.8;
        const shoulders = PLAYER_H - 0.35;
        pushBox(v, [p.x, p.y + shoulders / 2, p.z], [hw, shoulders / 2, hw], p.yaw, [
          ...rgb(colors.get(p.id) ?? '#888'),
          0,
        ]);
        const head: Vec3 = [p.x, p.y + PLAYER_H - 0.17, p.z];
        pushBox(v, head, [0.17, 0.17, 0.17], p.yaw, [0.95, 0.8, 0.65, 0]);
        pushBox(
          v,
          [head[0] + fx * 0.17, head[1] + 0.03, head[2] + fz * 0.17],
          [0.13, 0.05, 0.03],
          p.yaw,
          [0.1, 0.1, 0.12, 0],
        );
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, tail, new Float32Array(v));
      gl.uniformMatrix4fv(uniforms[0], false, vp);
      gl.uniform3fv(uniforms[1], eye);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, ground.length / STRIDE + v.length / STRIDE);
    },
    project: (x, y, z) => project(vp, x, y, z),
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
};
