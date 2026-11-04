// WebGL2 drawing: one program, one buffer. The level is built once; the other players are boxes
// rewritten each frame into the tail of the same buffer. Lights come from lights.ts: the shader adds
// them to a dim ambient, and each shadowed spot first draws the level and the bodies into its layer
// of a depth texture array. No DOM beyond the canvas.
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import { forward } from '../shared/physics';
import { MONSTER, TEX } from '../shared/types';
import type { Bullet, Edge, Item, Level, Monster, PlayerState, Sector } from '../shared/types';
import { BLAST, glow } from './effects';
import type { Effects } from './effects';
import { MUZZLE, chaingun } from './gun';
import { props } from './items';
import { STRIDE, basis, dress, place, pushBox } from './mesh';
import { LIGHT, MAX_LIGHTS, MAX_SHADOWS } from './lights';
import type { Light } from './lights';
import type { Vec3 } from './mesh';
import { SWING, bullet, flyer, walker } from './monsters';
import { LAYERS, SIZE, textures } from './textures';

/** MapDef.fog when a map sets none: the clear colour and what distance fog fades to, then its density. Dark, the map is indoors. */
export const FOG = [0.05, 0.045, 0.05, 0.02];
/** Tints a level can use at once, white included (see palette). */
export const MAX_TINTS = 16;
/** Bytes the dynamic tail starts with; it grows when a frame needs more. */
const TAIL = 1 << 18;
/** Metres one texture covers. */
const TILE = 2;
/** Shadow map side in texels. */
const SHADOW = 512;
/** What the sector light is scaled to: lit by nothing else, a room is this bright. The flashlight must matter. */
const AMBIENT = 0.3;
/** The view model's floor, in place of AMBIENT: it never goes black. */
const GUN = 0.55;

const VERT = `#version 300 es
layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec4 c;
uniform mat4 m;out vec3 P,N;out vec4 C;
void main(){P=p;N=n;C=c;gl_Position=m*vec4(p,1);}`;

/**
 * Blinn-Phong strength and exponent: a row per TEX id in order (brick, tile, lava, stone, metal, wood,
 * moss, grate), then the flat bodies. Lava and glows never get here: they light themselves.
 */
export const SPEC = [
  [0.04, 8],
  [0.25, 30],
  [0, 1],
  [0.08, 10],
  [0.8, 48],
  [0.06, 12],
  [0.3, 20],
  [0.7, 40],
  [0.1, 24],
];
/** Metres a height of 1 in a texture's alpha stands for. */
const RELIEF = 0.06;

// s: 1 on a texture, 0 on a flat colour. g: lava (which also drifts) and layer -2, which glow: no
// light, no shade. The texture's alpha is a height: its screen-space derivatives tilt the normal
// (bump mapping without tangents), faded out as a pixel covers more than a texel or two so the
// mipmapped relief does not shimmer. n is the surface normal, m the bumped one. l: the ambient
// term (Z, times the sector light on a texture) with the directional shade, plus every light, then
// eased toward 2 (e) so many beams on one wall do not burn it white; sp: the specular sum, added
// after the colour is lit. A: position and range, B: direction and cone (-9 on a point: no cone),
// K: colour and shadow slot (-1: none), M: the slots' matrices. Z < 0 is the depth pass: no colour.
// On a texture C.w is 2 * the sector's tint index + its light (see levelVerts); G is the palette.
// F: fog colour and density.
const FRAG = `#version 300 es
precision highp float;precision highp sampler2DArray;precision highp sampler2DArrayShadow;
in vec3 P,N;in vec4 C;uniform vec3 E;uniform float T,Z;uniform int Q;
uniform vec4 A[${MAX_LIGHTS}],B[${MAX_LIGHTS}],K[${MAX_LIGHTS}],F;uniform vec3 G[${MAX_TINTS}];uniform mat4 M[${MAX_SHADOWS}];
uniform sampler2DArray S;uniform sampler2DArrayShadow D;out vec4 o;
const vec2 SP[${SPEC.length}]=vec2[](${SPEC.map(([a, b]) => `vec2(${a},${b})`)});
vec3 e(vec3 x){return 2.*(1.-exp(-.5*x));}
void main(){
if(Z<0.)return;
float L=C.z,s=step(0.,L),I=floor(C.w*.5),g=step(abs(L-${TEX.LAVA}.),.5)+step(L,-1.5);
vec4 t=texture(S,vec3(C.xy/${TILE}.+vec2(g*T*.01,0),max(L,0.)));
vec3 c=mix(vec3(C.xy,C.w),t.rgb,s);
vec3 n=normalize(N),dx=dFdx(P),dy=dFdy(P),a=cross(dy,n),b=cross(n,dx);
float h=t.a*s*${RELIEF},det=dot(dx,a);
float f=1.-smoothstep(.6,2.5,${SIZE / TILE}.*max(length(dFdx(C.xy)),length(dFdy(C.xy))));
vec3 m=normalize(abs(det)*n-sign(det)*f*(dFdx(h)*a+dFdy(h)*b)+n*1e-9);
vec2 R=SP[int(s>0.?L+.5:${LAYERS}.)];
vec3 l=mix(vec3(1),G[int(min(I,${MAX_TINTS - 1}.))]*(C.w-2.*I),s)*Z*(.45+.55*max(dot(normalize(n+m),normalize(vec3(.4,.8,.3))),0.)),sp=vec3(0),V=normalize(E-P);
for(int i=0;i<${MAX_LIGHTS};i++){
if(i>=Q||g>0.)break;
vec3 d=A[i].xyz-P;float r=length(d),k=K[i].w,u=B[i].w;
d/=r;
float w=max(1.-r*r/(A[i].w*A[i].w),0.);
w*=w*smoothstep(u,u+(1.-u)*.4,-dot(d,B[i].xyz))*max(dot(m,d),0.);
if(w>0.&&k>=0.){
vec4 q=M[int(k)]*vec4(P+n*.03,1);q.xyz=q.xyz/q.w*.5+.5;
float v=0.;
for(int j=0;j<4;j++)v+=texture(D,vec4(q.xy+(vec2(j&1,j>>1)*2.-1.)*${0.75 / SHADOW},k,q.z-.0005));
w*=v/4.;}
l+=K[i].rgb*w;
sp+=K[i].rgb*w*pow(max(dot(m,normalize(d+V)),0.),R.y);}
c=c*mix(e(l),vec3(1.4),g)+e(sp*R.x*(.4+.6*mix(1.,t.a,s)));
o=vec4(mix(c,F.rgb,1.-exp(-F.a*length(P-E))),1);}`;

/**
 * Column-major view-projection matrix of basis(yaw, pitch, roll) at eye. t is the tangent of half the
 * vertical field of view (70° by default), [N, F] the near and far clip distances.
 */
export const viewProj = (
  eye: Vec3,
  yaw: number,
  pitch: number,
  aspect: number,
  roll = 0,
  t = Math.tan((70 * Math.PI) / 360),
  [N, F] = [0.1, 200],
) => {
  const [r, u, f] = basis(yaw, pitch, roll);
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
 * The view-projection of a spot's shadow map: from its position along its axis, a square window
 * just wide enough for the cone, clipped from 0.3 m (a flashlight sits inside its player's head)
 * to its range.
 */
export const lightProj = ({ p, d, cone, range }: Light) =>
  viewProj(
    p,
    Math.atan2(-d[0], -d[2]),
    Math.atan2(d[1], Math.hypot(d[0], d[2])),
    1,
    0,
    Math.min(Math.tan(Math.acos(cone)), 5.7),
    [0.3, range],
  );

/**
 * The lights as the shader's uniform arrays (see FRAG): at most MAX_LIGHTS of them, and the first
 * MAX_SHADOWS shadowed spots get a slot, whose matrix goes in m at 16 floats a slot.
 */
export const pack = (lights: Light[]) => {
  const [a, b, k] = [0, 0, 0].map(() => new Float32Array(MAX_LIGHTS * 4));
  const m = new Float32Array(MAX_SHADOWS * 16);
  let maps = 0;
  const list = lights.slice(0, MAX_LIGHTS);
  list.forEach((l, i) => {
    const slot = l.shadow && l.kind == LIGHT.SPOT && maps < MAX_SHADOWS ? maps++ : -1;
    a.set([...l.p, l.range], i * 4);
    b.set([...l.d, l.kind == LIGHT.POINT ? -9 : l.cone], i * 4);
    k.set([...l.color, slot], i * 4);
    if (slot >= 0) {
      m.set(lightProj(l), slot * 16);
    }
  });
  return { n: list.length, maps, a, b, k, m };
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

/** The tints of a level's sectors, white first and each once: the shader's palette, MAX_TINTS at most. */
export const palette = ({ map }: Level): Vec3[] =>
  [
    ...new Map<string, Vec3>([
      ['1,1,1', [1, 1, 1]],
      ...map.sectors.flatMap(({ tint }): [string, Vec3][] => (tint ? [[`${tint}`, tint]] : [])),
    ]).values(),
  ].slice(0, MAX_TINTS);

/**
 * Floors and ceilings as fans, then every edge's walls as quads, in the vertex format above. A
 * sector's light is packed with its palette index as 2 * index + light: light is at most 1, so
 * the shader takes the index from floor(w / 2) and keeps the vertex at 10 floats.
 */
export const levelVerts = (lvl: Level): number[] => {
  const out: number[] = [];
  const keys = palette(lvl).map(String);
  const pack = ({ light = 1, tint }: Sector) => light + 2 * Math.max(0, keys.indexOf(`${tint}`));
  for (const sector of lvl.map.sectors) {
    const { pts, floor, ceil, ft, ct } = sector;
    const light = pack(sector);
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
    const { wt } = lvl.map.sectors[front];
    const light = pack(lvl.map.sectors[front]);
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
  /**
   * Draws one frame: the map, its gates, goal and items, the others, the monsters, their bullets
   * and the effects as seen from eye, with the view model on top (not while fx.dead). colors maps
   * player id to CSS.
   */
  frame(
    eye: Vec3,
    yaw: number,
    pitch: number,
    others: PlayerState[],
    colors: ReadonlyMap<number, string>,
    fx: Effects,
    monsters: Monster[],
    bullets: Bullet[],
    items: Item[],
    /** gather() in lights.ts: at most MAX_LIGHTS, the first MAX_SHADOWS shadowed spots mapped. */
    lights: Light[],
  ): void;
  /** Builds the geometry of another level, drawn from the next frame on. */
  level(lvl: Level): void;
  /** A world point on screen as of the last frame, in [0, 1] from the top left. */
  project(x: number, y: number, z: number): [number, number] | undefined;
  destroy(): void;
}

/** Pixels drawn at most (1080p): every one is lit per light and shadow map, so a 4K screen at a pixel ratio of 2 would pay for 8 million. */
export const MAX_PIXELS = 1920 * 1080;

/** The canvas size in device pixels: the CSS size times the pixel ratio (2 at most), scaled down to MAX_PIXELS. */
export const backing = (cw: number, ch: number, dpr: number): [number, number] => {
  const k = Math.min(dpr, 2, Math.sqrt(MAX_PIXELS / (cw * ch || 1)));
  return [Math.round(cw * k), Math.round(ch * k)];
};

/** Throws when the browser has no WebGL2. */
export const createRenderer = (canvas: HTMLCanvasElement, first: Level): Renderer => {
  let lvl = first;
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

  let ground = levelVerts(lvl);
  const pixels = textures();
  let tail = ground.length * 4;
  let cap = tail + TAIL;
  const [steel, iron] = [
    [0.55, 0.55, 0.6],
    [0.2, 0.2, 0.23],
  ];
  const near = {
    barrels: dress(chaingun(10).barrels, steel),
    body: dress(chaingun(10).body, iron),
  };
  const far = { barrels: dress(chaingun(5).barrels, steel), body: dress(chaingun(5).body, iron) };
  const flare: number[] = [];
  /** The others' flash, three times as wide: at a few metres the own one is a dot. */
  const wide: number[] = [];
  for (const h of [
    [0.1, 0.01, 0.03],
    [0.01, 0.1, 0.03],
    [0.03, 0.03, 0.05],
  ] as Vec3[]) {
    pushBox(flare, [0, 0, -MUZZLE - 0.04], h, 0, [1, 0.85, 0.4], -2);
    pushBox(wide, [0, 0, -MUZZLE - 0.12], h.map(x => x * 3) as Vec3, 0, [1, 0.85, 0.4], -2);
  }
  let u: Record<string, WebGLUniformLocation> = {};
  let shadows: WebGLTexture;
  let depth: WebGLFramebuffer;
  let lost = false;
  let vp = new Float32Array(16);

  /** (Re)allocates the buffer at cap bytes and puts the level back at its head. */
  const alloc = () => {
    gl.bufferData(gl.ARRAY_BUFFER, cap, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(ground));
  };

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
    u = Object.fromEntries(
      ['m', 'E', 'T', 'Z', 'Q', 'A', 'B', 'K', 'M', 'D', 'F', 'G'].map(n => [
        n,
        gl.getUniformLocation(prog, n)!,
      ]),
    );
    gl.uniform1i(u.D, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    alloc();
    [3, 3, 4].reduce((at, size, i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE * 4, at * 4);
      return at + size;
    }, 0);
    // Unit 1: one depth layer per shadowed light, compared in the shader (linear: a 2x2 PCF per tap).
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, (shadows = gl.createTexture()));
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, MAX_SHADOWS);
    for (const [name, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE],
    ]) {
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, name, value);
    }
    // No colour attachment: the depth passes write nothing but depth.
    gl.bindFramebuffer(gl.FRAMEBUFFER, (depth = gl.createFramebuffer()));
    gl.drawBuffers([gl.NONE]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.polygonOffset(2, 4);
    gl.activeTexture(gl.TEXTURE0);
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
    climate();
  };

  /** The level's fog (and clear colour) and tint palette, into the program. */
  const climate = () => {
    const fog = lvl.map.fog ?? FOG;
    const tints = palette(lvl);
    gl.uniform4fv(u.F, fog);
    gl.uniform3fv(
      u.G,
      Float32Array.from({ length: MAX_TINTS * 3 }, (_, i) => tints[(i / 3) | 0]?.[i % 3] ?? 1),
    );
    gl.clearColor(fog[0], fog[1], fog[2], 1);
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
    level(next) {
      lvl = next;
      ground = levelVerts(lvl);
      tail = ground.length * 4;
      cap = tail + TAIL;
      if (!lost) {
        alloc();
        climate();
      }
    },
    frame(eye, yaw, pitch, others, colors, fx, monsters, bullets, items, lights) {
      const [w, h] = backing(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
      if (lost || !w || !h) {
        return;
      }
      if (canvas.width != w || canvas.height != h) {
        canvas.width = w;
        canvas.height = h;
      }
      vp = viewProj(eye, yaw, pitch, w / h, fx.roll);
      const v: number[] = [];
      for (const p of others) {
        const [fx_, fz] = forward(p.yaw);
        const hw = PLAYER_R * 0.8;
        const shoulders = PLAYER_H - 0.35;
        pushBox(v, [p.x, p.y + shoulders / 2, p.z], [hw, shoulders / 2, hw], p.yaw, [
          ...rgb(colors.get(p.id) ?? '#888'),
        ]);
        const head: Vec3 = [p.x, p.y + PLAYER_H - 0.17, p.z];
        pushBox(v, head, [0.17, 0.17, 0.17], p.yaw, [0.95, 0.8, 0.65]);
        pushBox(
          v,
          [head[0] + fx_ * 0.17, head[1] + 0.03, head[2] + fz * 0.17],
          [0.13, 0.05, 0.03],
          p.yaw,
          [0.1, 0.1, 0.12],
        );
        const hand: Vec3 = [p.x, p.y + 1.25, p.z];
        const axes = basis(p.yaw, p.pitch);
        for (const part of [far.barrels, far.body, fx.flashes.has(p.id) ? wide : []]) {
          place(v, part, hand, axes, [0.36, -0.12, 0.3], 0.8);
        }
      }
      const now = performance.now() / 1000;
      for (const m of monsters) {
        if (m.kind == MONSTER.FLYER) {
          flyer(v, m, now);
        } else {
          const left = fx.swings.get(m.id);
          walker(v, m, fx.herd.get(m.id)?.walked ?? 0, left ? 1 - left / SWING : 0);
        }
      }
      props(v, lvl, items, now);
      for (const { p, yaw, size, c, life } of fx.gibs) {
        const k = size * Math.min(1, life * 2);
        pushBox(v, p, [k, k, k], yaw, c);
      }
      // What the shadow maps hold ends here: the unlit effects after it cast nothing.
      const bodies = v.length;
      for (const b of bullets) {
        bullet(v, b, fx.aim.get(b.id));
      }
      for (const { p, c } of fx.sparks) {
        pushBox(v, p, [0.025, 0.025, 0.025], 0, c ?? [1, 0.8, 0.3], -2);
      }
      for (const b of fx.blasts) {
        // Bright at the start, red and shrinking at the end: no blending to fade it with.
        const [k, u] = [glow(b), b.t / BLAST];
        const c = [1, 0.9 - u * 0.7, 0.5 - u * 0.45];
        for (const yaw of [0, Math.PI / 4]) {
          pushBox(v, b.p, [k, k, k], yaw, c, -2);
        }
      }
      const world = v.length;
      // Last, over a cleared depth: the gun never sinks into a wall.
      const axes = basis(yaw, pitch, fx.roll);
      const off: Vec3 = [0.26, -0.24 + fx.kick * 0.01, 0.6 - fx.kick * 0.06];
      if (!fx.dead) {
        place(v, near.body, eye, axes, off, 0.8);
        place(v, near.barrels, eye, axes, off, 0.8, fx.spin);
        if (fx.flash > 0) {
          place(v, flare, eye, axes, off, 0.8, fx.spin * 3);
        }
      }
      if (tail + v.length * 4 > cap) {
        cap = tail + v.length * 8;
        alloc();
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, tail, new Float32Array(v));
      const pk = pack(lights);
      const first = ground.length / STRIDE;
      if (pk.maps) {
        gl.uniform1f(u.Z, -1);
        // Unit 1 is unbound meanwhile: sampling a map the framebuffer writes is a feedback loop.
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, depth);
        gl.viewport(0, 0, SHADOW, SHADOW);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        for (let i = 0; i < pk.maps; i++) {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, shadows, 0, i);
          gl.uniformMatrix4fv(u.m, false, pk.m.subarray(i * 16, i * 16 + 16));
          gl.clear(gl.DEPTH_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, first + bodies / STRIDE);
        }
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, shadows);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.viewport(0, 0, w, h);
      gl.uniformMatrix4fv(u.m, false, vp);
      gl.uniform3fv(u.E, eye);
      gl.uniform1f(u.T, performance.now() / 1000);
      gl.uniform1f(u.Z, AMBIENT);
      gl.uniform1i(u.Q, pk.n);
      gl.uniform4fv(u.A, pk.a);
      gl.uniform4fv(u.B, pk.b);
      gl.uniform4fv(u.K, pk.k);
      gl.uniformMatrix4fv(u.M, false, pk.m);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, first + world / STRIDE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(u.Z, GUN);
      gl.drawArrays(gl.TRIANGLES, first + world / STRIDE, (v.length - world) / STRIDE);
    },
    project: (x, y, z) => project(vp, x, y, z),
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
};
