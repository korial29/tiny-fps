// WebGL2 drawing: one program, one buffer. The level is built once; the other players are boxes
// rewritten each frame into the tail of the same buffer. No DOM beyond the canvas.
import { MAX_PLAYERS, PLAYER_H, PLAYER_R } from '../shared/constants';
import { forward } from '../shared/physics';
import { TEX } from '../shared/types';
import type { Edge, Level, PlayerState } from '../shared/types';
import { LAYERS, SIZE, textures } from './textures';

/** Clear colour and what distance fog fades to: dark, the map is indoors. */
const FOG = [0.05, 0.045, 0.05];
/**
 * Floats per vertex: position, normal, then c. A map vertex has c = (u, v, texture layer, light),
 * u and v in metres. A player vertex has layer -1 and its flat colour in c.x, c.y, c.w.
 */
const STRIDE = 10;
/** Vertices of a box: 6 faces of 2 triangles. */
const BOX = 36;
/** Boxes per player: body, head, visor. */
const PER_PLAYER = 3;
/** Metres one texture covers. */
const TILE = 2;

const VERT = `#version 300 es
layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec4 c;
uniform mat4 m;out vec3 P,N;out vec4 C;
void main(){P=p;N=n;C=c;gl_Position=m*vec4(p,1);}`;

// s: 1 on a texture, 0 on a flat colour. g: lava, which glows (no light, no shade) and drifts.
const FRAG = `#version 300 es
precision highp float;precision highp sampler2DArray;
in vec3 P,N;in vec4 C;uniform vec3 E;uniform float T;uniform sampler2DArray S;out vec4 o;
void main(){
float L=C.z,s=step(0.,L),g=step(abs(L-${TEX.LAVA}.),.5);
vec3 c=mix(vec3(C.xy,C.w),texture(S,vec3(C.xy/${TILE}.+vec2(g*T*.01,0),max(L,0.))).rgb,s);
c*=mix(mix(1.,C.w,s)*(.45+.55*max(dot(normalize(N),normalize(vec3(.4,.8,.3))),0.)),1.4,g);
o=vec4(mix(c,vec3(${FOG}),1.-exp(-.02*length(P-E))),1);}`;

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
        out.push(cx + x, cy + l[1] * hy, cz + z, nx, n[1], nz, color[0], color[1], -1, color[2]);
      }
    }
  }
};

/** Vertical spans [y0, y1] an edge draws on its own side: the wall, or the steps of a portal. */
export const spans = ({ map }: Level, { front, back }: Edge): [number, number][] => {
  const f = map.sectors[front];
  if (back < 0) {
    return [[f.floor, f.ceil]];
  }
  const k = map.sectors[back];
  return (
    [
      [f.floor, k.floor],
      [k.ceil, f.ceil],
    ] as [number, number][]
  ).filter(([a, b]) => b > a);
};

/** Floors and ceilings as fans, then every edge's walls as quads, in the vertex format above. */
export const levelVerts = (lvl: Level): number[] => {
  const out: number[] = [];
  for (const { pts, floor, ceil, ft, ct, light = 1 } of lvl.map.sectors) {
    for (const [y, ny, t] of [
      [floor, 1, ft],
      [ceil, -1, ct],
    ]) {
      for (let i = 1; i < pts.length - 1; i++) {
        for (const [x, z] of [pts[0], pts[i], pts[i + 1]]) {
          out.push(x, y, z, 0, ny, 0, x, z, t, light);
        }
      }
    }
  }
  for (const e of lvl.edges) {
    const { ax, az, bx, bz, front } = e;
    const { wt, light = 1 } = lvl.map.sectors[front];
    const len = Math.hypot(bx - ax, bz - az);
    // The normal points into the sector (left of a counter-clockwise edge). u runs along the edge
    // from the viewer's left to right, in world metres, so collinear walls line up.
    const [dx, dz] = [(bx - ax) / len, (bz - az) / len];
    for (const [y0, y1] of spans(lvl, e)) {
      for (const [x, z, y] of [
        [ax, az, y0],
        [bx, bz, y0],
        [bx, bz, y1],
        [ax, az, y0],
        [bx, bz, y1],
        [ax, az, y1],
      ]) {
        out.push(x, y, z, -dz, 0, dx, x * dx + z * dz, y, wt, light);
      }
    }
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
export const createRenderer = (canvas: HTMLCanvasElement, lvl: Level): Renderer => {
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

  const ground = levelVerts(lvl);
  const pixels = textures();
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
    uniforms = ['m', 'E', 'T'].map(n => gl.getUniformLocation(prog, n)!);
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
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, gl.createTexture());
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA8,
      SIZE,
      SIZE,
      LAYERS,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
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
        ]);
        const head: Vec3 = [p.x, p.y + PLAYER_H - 0.17, p.z];
        pushBox(v, head, [0.17, 0.17, 0.17], p.yaw, [0.95, 0.8, 0.65]);
        pushBox(
          v,
          [head[0] + fx * 0.17, head[1] + 0.03, head[2] + fz * 0.17],
          [0.13, 0.05, 0.03],
          p.yaw,
          [0.1, 0.1, 0.12],
        );
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, tail, new Float32Array(v));
      gl.uniformMatrix4fv(uniforms[0], false, vp);
      gl.uniform3fv(uniforms[1], eye);
      gl.uniform1f(uniforms[2], performance.now() / 1000);
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
