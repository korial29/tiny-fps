// WebGL2 drawing: one scene program, one buffer. The brushes are built once; the other players are
// boxes rewritten each frame into the tail of the same buffer. The sky is a fullscreen triangle at
// depth 1, the sun a directional light with an orthographic shadow map that follows the eye (layer 0
// of the shadow array), and lights.ts adds spots and points on top (the first MAX_SHADOWS shadowed
// spots get the layers after it). Everything is drawn in the one program, the depth passes with
// colour writes off. The scene goes into an offscreen target, then a second, small program (POST)
// turns it into the picture on the canvas. No DOM beyond the canvas.
import { TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import type { World, WorldDef } from '../shared/world';
import type { Body } from './body';
import type { Tracer } from './beams';
import type { Effects } from './effects';
import { base, flag, teamRgb } from './flag';
import type { CtfScene } from './flag';
import { SHINE, STRIDE, basis } from './mesh';
import { LIGHT, MAX_LIGHTS, MAX_SHADOWS } from './lights';
import { moonscape } from './moonscape';
import type { Light } from './lights';
import type { Vec3 } from './mesh';
import { battery, cell, kit, racks } from './props';
import { JOINT } from './rig';
import type { Quat } from './rig';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import { skyline, trees } from './skyline';
import { deepen, street } from './street';
import { LAYERS, SIZE, textures } from './textures';
import { drawDrops, fall } from './drops';
import { traffic } from './traffic';
import { vision, zones } from './vision';

/** Tints a world can use at once, white included (see palette). */
export const MAX_TINTS = 16;
/** Bytes the dynamic tail starts with; it grows when a frame needs more. */
const TAIL = 1 << 19;
/** Metres one texture covers. */
const TILE = 2;
/** Shadow map side in texels. */
export const SHADOW = 1024;
/** Metres the sun's shadow window spans on a side, centred on the eye: 6 cm a texel. */
export const SUN_AREA = 64;
/** Half the depth range of the sun's window, metres: what stands this far from the eye along the sun's direction still casts. */
export const SUN_DEPTH = 100;
/** How far the fog colour is pulled toward the sky's horizon, 0 to 1: a fog unlike the horizon draws an edge against the sky. */
export const HAZE = 0.6;
/**
 * The height fog: besides the haze at the density of the world's fog, a layer of FOG_LAYER times that
 * density at the lowest roof, which grows by e every 1 / FOG_RISE metres down: 2 % more at the roofs,
 * about three times the haze on the street 94 m under them.
 */
export const FOG_LAYER = 0.02;
export const FOG_RISE = 0.05;
/** The vertical field of view at rest, degrees, and the tangent of its half. */
export const FOV_DEG = 70;
export const FOV = Math.tan((FOV_DEG * Math.PI) / 360);
/** Metres within which another player is drawn with the near level of detail (see DETAIL), and within which with the close one (see body()). */
const [NEAR, CLOSE] = [10, 4];
/** Samples of the scene target: the canvas' own antialiasing no longer reaches it. */
const SAMPLES = 4;

// Y > 0 is the sky: a fullscreen triangle from gl_VertexID at depth 1, whose varying P is the view
// ray (J: the camera's right and up scaled by the field of view, then forward).
const VERT = `#version 300 es
layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec4 c;
uniform mat4 m;uniform float Y;uniform vec3 J[3];out vec3 P,N;out vec4 C;
void main(){
if(Y>.5){vec2 q=vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.;gl_Position=vec4(q,1,1);P=J[0]*q.x+J[1]*q.y+J[2];N=vec3(0);C=vec4(0);return;}
P=p;N=n;C=c;gl_Position=m*vec4(p,1);}`;

// A fullscreen triangle from gl_VertexID, no buffer.
const POST_VERT = `#version 300 es
out vec2 U;void main(){U=vec2(gl_VertexID&1,gl_VertexID>>1)*2.;gl_Position=vec4(U*2.-1.,0,1);}`;

// The post program, one pass per Y.z (a uniform: the branches are coherent). Y.xy: the step
// between taps, Y.w: the clock. 0: a bright pass of the scene (S[0]) at a quarter of its pixels,
// four taps each thresholded alone so a single hot pixel survives the averaging. 1: a 9-tap
// gaussian along Y.xy in 5 taps (the weights and offsets fold the bilinear filter in). 2: the
// scene plus the three blurs (S[1..3]) on the canvas. Tone: linear up to .6, then a shoulder
// toward 1.
const POST_FRAG = `#version 300 es
precision highp float;uniform sampler2D S[4];uniform vec4 Y;uniform float L;in vec2 U;out vec4 o;
vec3 b(vec2 x){vec3 c=texture(S[0],x).rgb;return c*smoothstep(.9,2.,max(c.r,max(c.g,c.b)));}
#define T(k)texture(S[0],U+Y.xy*(k)).rgb
void main(){
vec3 c;
if(Y.z<1.)c=(b(U+Y.xy)+b(U-Y.xy)+b(U+Y.xy*vec2(1,-1))+b(U-Y.xy*vec2(1,-1)))/4.;
else if(Y.z<2.)c=T(0.)*.227+(T(1.3846)+T(-1.3846))*.3162+(T(3.2308)+T(-3.2308))*.0703;
else{
c=texture(S[0],U).rgb+texture(S[1],U).rgb*1.3+texture(S[2],U).rgb*1.+texture(S[3],U).rgb*.7;
vec2 q=U-.5;
c=min(c,.6)+.4*(1.-exp(-max(c-.6,0.)/.4));
float a=atan(q.y,q.x)*24.,h=fract(sin(floor(a)*12.9898)*43758.5453);
c+=L*step(.85-.5*L,h)*sin(fract(a)*3.1416)*smoothstep(.2,.6,length(q))*fract(length(q)*3.-Y.w*.002+h*9.)*.22;
c*=1.-(.7+.3*L)*dot(q,q);
c=pow(c*vec3(.97,1.,1.03),vec3(.92))+(fract(sin(dot(gl_FragCoord.xy+Y.w,vec2(12.9898,78.233)))*43758.5453)-.5)*.03;}
o=vec4(c,1);}`;

/**
 * Blinn-Phong strength and exponent: a row per TEX id in order (brick, tile, lava, stone, metal, wood,
 * moss, grate, concrete, glass, steel, paint), then the flat bodies, then polished metal (SHINE). Lava
 * and glows never get here: they light themselves.
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
  [0.06, 14],
  [1.5, 110],
  [0.9, 60],
  [0.25, 30],
  [0.1, 24],
  [1.4, 90],
];
/** Metres a height of 1 in a texture's alpha stands for. */
const RELIEF = 0.06;

// s: 1 on a texture, 0 on a flat colour. g: lava (which also drifts)
// and layers -2 and -3, which glow: no light, no shade. Layer -3 is smoke: grey C.x (and C.w for
// blue), its opacity C.y, fading where it is seen edge-on (z), alpha to coverage; it casts no shadow. The texture's alpha is a height: its screen-space derivatives tilt the normal
// (bump mapping without tangents), faded out as a pixel covers more than a texel or two so the
// mipmapped relief does not shimmer. n is the surface normal, m the bumped one. y: the brush tint,
// which colours the daylight (ambient and sun) but not the highlights. l: the light, the hemisphere
// ambient (H[0..2]: from the sky above, from the sides, bounced from below) plus the sun (O toward
// it, X its colour, W the matrix of its shadow layer 0) plus every other light, then eased toward 2
// (e) so many beams on one wall do not burn it white; sp: the specular sum, added after the colour
// is lit. A: position and range, B: direction and cone (-9 on a point: no cone), K: colour and
// shadow slot (-1: none; slot k is layer k + 1), M: the slots' matrices. Z < 0 is the depth pass:
// no colour. Y > 0 is the sky, from the colours in H[3] (zenith) and H[4] (horizon): a gradient, a
// haze band, the sun's disc and glow, bright enough to bloom (K0, the sky along a direction; the glow
// scattered by the air, so it fades with a dark horizon: the moon keeps a tenth of it). The
// glass layer adds K0 along the reflected view r, strong at a grazing angle (Fresnel, fr), after the
// lighting. Polished metal (SHINE) turns partly into that reflection (k), tinted by its colour and
// dark where r looks down at the ground, with a sharp bright streak where it mirrors just above the
// horizon. On a texture C.w is 2 * the brush's tint index + its light (see level); G is the
// palette. On stone (the regolith) the texture is mixed with itself 3.7 times larger and turned,
// and lit up or darkened by its own 58 m mip (mk), so it shows no 2 m grid. F: fog colour and
// density, U the height the fog layer is anchored at: the density is
// F.a * (1 + FOG_LAYER * exp(FOG_RISE * (U - y))) at height y, integrated along the view ray in closed
// form (x is the climb along it, times FOG_RISE; the branch is its limit at 0).
const FRAG = `#version 300 es
precision highp float;precision highp sampler2DArray;precision highp sampler2DArrayShadow;
in vec3 P,N;in vec4 C;uniform vec3 E;uniform float T,Z,Y;uniform int Q;
uniform vec4 A[${MAX_LIGHTS}],B[${MAX_LIGHTS}],K[${MAX_LIGHTS}],F;uniform float U;uniform vec3 G[${MAX_TINTS}],H[5],O,X;uniform mat4 M[${MAX_SHADOWS}],W;
uniform sampler2DArray S;uniform sampler2DArrayShadow D;out vec4 o;
const vec2 SP[${SPEC.length}]=vec2[](${SPEC.map(([a, b]) => `vec2(${a},${b})`)});
vec3 e(vec3 x){return 2.*(1.-exp(-.5*x));}
vec3 K0(vec3 d){
float h=d.y,k=max(dot(d,O),0.);
vec3 c=mix(H[4],H[3],pow(clamp(h,0.,1.),.5));
c=mix(c,H[4]*1.08,exp(-abs(h)*7.));
return c+X*((.1+.9*clamp(H[4].g*1.2,0.,1.))*(.2*pow(k,24.)+.05*pow(k,4.))+2.*smoothstep(.9993,.9997,k));}
void main(){
if(Z<0.){if(C.z<-2.5)discard;return;}
if(Y>.5){o=vec4(K0(normalize(P)),1);return;}
float L=C.z,s=step(0.,L),I=floor(C.w*.5),g=step(abs(L-${TEX.LAVA}.),.5)+step(L,-1.5);
vec4 t=texture(S,vec3(C.xy/${TILE}.+vec2(g*T*.01,0),max(L,0.)));
vec3 t2=texture(S,vec3(mat2(.8,-.6,.6,.8)*C.xy*.135,L)).rgb;float ks=step(abs(L-${TEX.STONE}.),.5),mk=textureLod(S,vec3(C.xy*.017,L),5.).g-textureLod(S,vec3(0,0,L),9.).g;t.rgb=mix(t.rgb,mix(t.rgb,t2,.45)*(1.+6.*mk),ks);
vec3 c=mix(vec3(C.xy,C.w),t.rgb,s);
vec3 n=normalize(N),dx=dFdx(P),dy=dFdy(P),a=cross(dy,n),b=cross(n,dx);
float h=t.a*s*${RELIEF},det=dot(dx,a);
float f=1.-smoothstep(.6,2.5,${SIZE / TILE}.*max(length(dFdx(C.xy)),length(dFdy(C.xy))));
vec3 m=normalize(abs(det)*n-sign(det)*f*(dFdx(h)*a+dFdy(h)*b)+n*1e-9);
vec2 R=SP[int(s>0.?L+.5:L<-1.1?${LAYERS + 1}.:${LAYERS}.)];
vec3 y=mix(vec3(1),G[int(min(I,${MAX_TINTS - 1}.))]*(C.w-2.*I),s),V=normalize(E-P),w=normalize(n+m);
float sd=max(dot(m,O),0.)*smoothstep(0.,.1,dot(n,O)),sv=1.;
if(sd>0.&&g<1.){
vec4 q=W*vec4(P+n*.08,1);q.xyz=q.xyz*.5+.5;
float v=0.;
for(int j=0;j<4;j++)v+=texture(D,vec4(q.xy+(vec2(j&1,j>>1)*2.-1.)*${0.75 / SHADOW},0,q.z-.0004));
sv=mix(v/4.,1.,smoothstep(.8,1.,max(abs(q.x-.5),abs(q.y-.5))*2.));}
vec3 l=y*(mix(mix(H[1],H[0],max(w.y,0.)),H[2],max(-w.y,0.))+X*sd*sv),sp=X*sv*sd*pow(max(dot(m,normalize(O+V)),0.),R.y);
for(int i=0;i<${MAX_LIGHTS};i++){
if(i>=Q||g>0.)break;
vec3 d=A[i].xyz-P;float r=length(d),k=K[i].w,u=B[i].w;
d/=r;
float w=max(1.-r*r/(A[i].w*A[i].w),0.);
w*=w*smoothstep(u,u+(1.-u)*.4,-dot(d,B[i].xyz))*max(dot(m,d),0.);
if(w>0.&&k>=0.){
vec4 q=M[int(k)]*vec4(P+n*.03,1);q.xyz=q.xyz/q.w*.5+.5;
float v=0.;
for(int j=0;j<4;j++)v+=texture(D,vec4(q.xy+(vec2(j&1,j>>1)*2.-1.)*${0.75 / SHADOW},k+1.,q.z-.0005));
w*=v/4.;}
l+=K[i].rgb*w;
sp+=K[i].rgb*w*pow(max(dot(m,normalize(d+V)),0.),R.y);}
c=c*mix(e(l),vec3(1.4),g)+e(sp*R.x*(.4+.6*mix(1.,t.a,s)));
vec3 r=reflect(-V,m),k=K0(r);float fr=pow(1.-max(dot(m,V),0.),4.);
c+=step(abs(L-${TEX.GLASS}.),.5)*k*(.1+.9*fr);
c=mix(c,k*(.4+c)*(.2+.8*smoothstep(-.1,.25,r.y)+1.6*exp(-abs(r.y-.12)*18.)),step(abs(L-(${SHINE})),.1)*(.35+.4*fr));
float D=length(P-E),x=${FOG_RISE}*(P.y-E.y),z=step(L,-2.5);
c.g=mix(c.g,c.r,z);
o=vec4(mix(c,F.rgb,1.-exp(-F.a*D*(1.+${FOG_LAYER}*exp(${FOG_RISE}*(U-E.y))*(abs(x)<1e-3?1.-x*.5:(1.-exp(-x))/x)))),mix(1.,C.y*pow(abs(dot(n,V)),2.),z));}`;

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
  t = FOV,
  [N, F] = [0.1, 900],
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

/**
 * The view-projection of the sun's shadow map: an orthographic window of `area` metres a side
 * looking along -dir (dir points toward the sun), centred on the eye and clipped `depth` metres
 * either side of it. The centre is snapped to the map's texels along the window's own axes, so a
 * shadow edge keeps its texels as the eye moves instead of crawling.
 */
export const sunProj = (dir: Vec3, eye: Vec3, area = SUN_AREA, depth = SUN_DEPTH) => {
  const f = dir.map(v => -v) as Vec3;
  const k = Math.hypot(f[0], f[2]);
  const r: Vec3 = k > 1e-3 ? [-f[2] / k, 0, f[0] / k] : [1, 0, 0];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const [h, texel] = [area / 2, area / SHADOW];
  const rows = [r, u].map(v => [
    ...v.map(c => c / h),
    -(Math.round(dot(v, eye) / texel) * texel) / h,
  ]);
  rows.push([...f.map(c => c / depth), -dot(f, eye) / depth], [0, 0, 0, 1]);
  return Float32Array.from({ length: 16 }, (_, i) => rows[i & 3][i >> 2]);
};

/** The tints of a world's brushes, white first and each once: the shader's palette, MAX_TINTS at most. */
export const palette = ({ def }: World): Vec3[] =>
  [
    ...new Map<string, Vec3>([
      ['1,1,1', [1, 1, 1]],
      ...def.brushes.flatMap(({ tint }): [string, Vec3][] => (tint ? [[`${tint}`, tint]] : [])),
    ]).values(),
  ].slice(0, MAX_TINTS);

/** The corners of a face's two triangles, as [along p, along q] picks of its min or max. */
const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
  [1, 1],
  [0, 1],
];

/**
 * The faces of every brush as triangles in the vertex format of mesh.ts: the top gets the brush's
 * top texture, every other face its side texture. Texture coordinates are world metres on the face
 * (x, z on horizontal faces; z, y on faces facing x; x, y on faces facing z), so a texture runs on
 * across neighbouring brushes. A face another brush covers flush is not built, nor is the bottom
 * of a brush at or under the kill floor: nothing is seen from there. A brush's light is packed
 * with its palette index as 2 * index + 1: the light is 1 (the daylight is in the shader), and
 * the shader takes the index from floor(w / 2).
 */
export const level = (world: World): number[] => {
  const { brushes, floor } = world.def;
  const out: number[] = [];
  const keys = palette(world).map(String);
  brushes.forEach((b, bi) => {
    if (b.ghost) {
      return;
    }
    const light = 1 + 2 * Math.max(0, keys.indexOf(`${b.tint}`));
    for (let a = 0; a < 3; a++) {
      const [p, q] = [(a + 1) % 3, (a + 2) % 3];
      const [du, dv] = a == 0 ? [2, 1] : a == 1 ? [0, 2] : [0, 1];
      for (const up of [0, 1]) {
        const at = up ? b.max[a] : b.min[a];
        const covered = brushes.some(
          (c, j) =>
            j != bi &&
            !c.ghost &&
            (up ? c.min[a] : c.max[a]) == at &&
            c.min[p] <= b.min[p] &&
            c.max[p] >= b.max[p] &&
            c.min[q] <= b.min[q] &&
            c.max[q] >= b.max[q],
        );
        if (covered || (a == 1 && !up && b.min[1] <= floor)) {
          continue;
        }
        const n: Vec3 = [0, 0, 0];
        n[a] = up ? 1 : -1;
        for (const [i, j] of CORNERS) {
          const v: Vec3 = [0, 0, 0];
          [v[a], v[p], v[q]] = [at, (i ? b.max : b.min)[p], (j ? b.max : b.min)[q]];
          out.push(...v, ...n, v[du], v[dv], a == 1 && up ? b.top : b.side, light);
        }
      }
    }
  });
  return out;
};

/**
 * What the daylight of a world lights its surfaces with, linear RGB, as the shader's H uniform:
 * the ambient from the sky above, from the sides and bounced up from below, then the sky's zenith
 * and horizon colours. The ambient is the sky's own colour, washed toward white so a shadow is
 * blue-grey and not blue, and dimmer on the sides and below.
 */
export const daylight = ({ sky: [zenith, horizon] }: WorldDef): Vec3[] => [
  zenith.map(v => (v * 0.45 + 0.55) * 0.74) as Vec3,
  horizon.map(v => (v * 0.7 + 0.3) * 0.58) as Vec3,
  horizon.map((v, i) => v * [1, 0.92, 0.8][i] * 0.34) as Vec3,
  zenith,
  horizon,
];

/** The world as it is drawn: its buildings down to the street, and a city around them. The physics knows only `world`. */
export const city = (world: World): World => ({
  ...world,
  def: { ...world.def, brushes: [...deepen(world.def), ...skyline(world.def)] },
});

/** All the map's vertices, drawn once: the city (on the moon, its scenery instead), the brushes, the street under them, the parks' trees, the runner's red and the team zones. */
export const scenery = (world: World): number[] =>
  world.def.scenery === 'moon'
    ? [...level(world), ...moonscape(world.def), ...vision(world.def), ...zones(world.def)]
    : [
        ...level(city(world)),
        ...street(world.def),
        ...trees(world.def),
        ...vision(world.def),
        ...zones(world.def),
      ];

/** The height the fog layer is anchored at: the lowest top of the world, so that at a roof the layer is a few percent of the haze at most. */
export const fogRef = ({ brushes }: WorldDef) => Math.min(...brushes.map(b => b.max[1]));

/**
 * The fog's optical depth from `eye` to `p`, what the shader integrates: the haze plus the layer,
 * for a world whose fog density is `density` and whose layer sits at `ref`.
 */
export const fogDepth = (density: number, ref: number, eye: Vec3, p: Vec3) => {
  const x = FOG_RISE * (p[1] - eye[1]);
  const climb = Math.abs(x) < 1e-3 ? 1 - x / 2 : (1 - Math.exp(-x)) / x;
  return (
    density *
    Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) *
    (1 + FOG_LAYER * Math.exp(FOG_RISE * (ref - eye[1])) * climb)
  );
};

/** The shader's fog uniform: the world's fog colour pulled toward its horizon by HAZE, and its density; none when the world has no fog. */
export const fogOf = ({ fog, sky }: WorldDef): [number, number, number, number] =>
  fog
    ? [...([0, 1, 2].map(i => fog[i] + (sky[1][i] - fog[i]) * HAZE) as Vec3), fog[3]]
    : [...sky[1], 0];

/** A texture and the framebuffer that draws into it. */
interface Target {
  t: WebGLTexture;
  f: WebGLFramebuffer;
  w: number;
  h: number;
}

export interface Renderer {
  /**
   * Draws one frame: the sky, the brushes and the others as seen from eye, then the own `body` over
   * a cleared depth, lit but casting no shadow. colors maps player id to CSS.
   */
  frame(
    eye: Vec3,
    yaw: number,
    pitch: number,
    others: PlayerState[],
    colors: ReadonlyMap<number, string>,
    fx: Effects,
    /** gather() in lights.ts: at most MAX_LIGHTS, the first MAX_SHADOWS shadowed spots mapped, besides the sun. */
    lights: Light[],
    body?: Body,
    /** The bases, the flags, the racks and the health packs: drawn lit, casting shadows, with the other players. */
    ctf?: CtfScene,
    /** The plasma balls, the flashes and the sparks: they glow and cast no shadow. */
    tracer?: Tracer,
  ): void;
  /** A world point on screen as of the last frame, in [0, 1] from the top left. */
  project(x: number, y: number, z: number): [number, number] | undefined;
  /** The footsteps of the player `id`'s runner so far (Gait.steps), undefined before it is drawn. */
  steps(id: number): number | undefined;
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
export const createRenderer = (canvas: HTMLCanvasElement, world: World): Renderer => {
  /** The animation state of each runner drawn. */
  const runners = new Map<number, Runner>();
  let clock = performance.now() / 1000;
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false });
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

  const size = () => backing(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
  // What is drawn is the world plus a city, a street and the runner's red; the physics knows only `world`.
  const ground = scenery(world);
  // The moon has no traffic.
  const drive = world.def.scenery === 'moon' ? () => {} : traffic(world.def);
  const { sun, sky } = world.def;
  const sunDir = sun.dir.map(v => v / Math.hypot(...sun.dir)) as Vec3;
  const pixels = textures();
  const tail = ground.length * 4;
  let cap = tail + TAIL;
  let u: Record<string, WebGLUniformLocation> = {};
  let shadows: WebGLTexture;
  let depth: WebGLFramebuffer;
  let scene: WebGLProgram;
  let post: WebGLProgram;
  let pu: Record<string, WebGLUniformLocation> = {};
  let fmt: number;
  // The multisampled target the scene draws into, and the texture it is resolved to.
  let msaa: WebGLFramebuffer;
  let hdr: Target;
  /** The bloom's blur levels, from half the frame down: each a pair, the second one the scratch. */
  let bloom: [Target, Target][];
  /** The frame size the targets were built for, [0, 0] before the first. */
  let made = [0, 0];
  /** Deletes what targets() built. */
  const owned: (() => void)[] = [];
  let lost = false;
  let vp = new Float32Array(16);

  /** (Re)allocates the buffer at cap bytes and puts the level back at its head. */
  const alloc = () => {
    gl.bufferData(gl.ARRAY_BUFFER, cap, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(ground));
  };

  const link = (vert: string, frag: string, names: string[]) => {
    const prog = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vert],
      [gl.FRAGMENT_SHADER, frag],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    return [
      prog,
      Object.fromEntries(names.map(n => [n, gl.getUniformLocation(prog, n)!])),
    ] as const;
  };

  /** A w x h texture with a framebuffer to draw into it. */
  const target = (w: number, h: number): Target => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    owned.push(
      () => gl.deleteTexture(t),
      () => gl.deleteFramebuffer(f),
    );
    return { t, f, w, h };
  };

  /** (Re)builds the offscreen targets for a w x h frame. */
  const targets = (w: number, h: number) => {
    owned.splice(0).forEach(free => free());
    made = [w, h];
    hdr = target(w, h);
    bloom = [1, 2, 3].map(i => [0, 1].map(() => target(w >> i || 1, h >> i || 1))) as typeof bloom;
    const rb = (format: number) => {
      const r = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, format, w, h);
      owned.push(() => gl.deleteRenderbuffer(r));
      return r;
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, (msaa = gl.createFramebuffer()));
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb(fmt));
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      rb(gl.DEPTH_COMPONENT24),
    );
    owned.push(() => gl.deleteFramebuffer(msaa));
  };

  /**
   * One pass of the post program: mode z and tap step (x, y), reading the sources on units 0 up and
   * drawing into `to` (the canvas when undefined).
   */
  const pass = (to: Target | undefined, z: number, x: number, y: number, ...from: Target[]) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, to?.f ?? null);
    gl.viewport(0, 0, to?.w ?? made[0], to?.h ?? made[1]);
    from.forEach((src, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, src.t);
    });
    gl.uniform4f(pu.Y, x, y, z, performance.now() % 1e4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Everything GL owns goes with a lost context: set it all up again on restore.
  const setup = () => {
    // Without it the scene can only be 8-bit: lights above 1 clip instead of reaching the post pass.
    fmt = gl.getExtension('EXT_color_buffer_float') ? gl.RGBA16F : gl.RGBA8;
    owned.length = 0;
    made = [0, 0];
    [post, pu] = link(POST_VERT, POST_FRAG, ['S', 'Y', 'L']);
    gl.uniform1iv(pu.S, [0, 1, 2, 3]);
    [scene, u] = link(VERT, FRAG, [
      'm',
      'E',
      'T',
      'Z',
      'Q',
      'A',
      'B',
      'K',
      'M',
      'D',
      'F',
      'U',
      'G',
      'W',
      'H',
      'O',
      'X',
      'Y',
      'J',
    ]);
    gl.uniform1i(u.D, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    alloc();
    [3, 3, 4].reduce((at, size, i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE * 4, at * 4);
      return at + size;
    }, 0);
    // Unit 1: the sun's depth layer, then one per shadowed light, compared in the shader (linear: a 2x2 PCF per tap).
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, (shadows = gl.createTexture()));
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, MAX_SHADOWS + 1);
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
    // The sky sits at depth 1, the clear value.
    gl.depthFunc(gl.LEQUAL);
    climate();
    const [w, h] = size();
    if (w && h) {
      targets(w, h);
    }
  };

  /** The world's fog, daylight, sun and tint palette, and the clear colour (the horizon's), into the program. */
  const climate = () => {
    const tints = palette(city(world));
    gl.uniform4fv(u.F, fogOf(world.def));
    gl.uniform1f(u.U, fogRef(world.def));
    gl.uniform3fv(u.H, daylight(world.def).flat());
    gl.uniform3fv(u.O, sunDir);
    gl.uniform3fv(u.X, sun.color);
    gl.uniform3fv(
      u.G,
      Float32Array.from({ length: MAX_TINTS * 3 }, (_, i) => tints[(i / 3) | 0]?.[i % 3] ?? 1),
    );
    gl.clearColor(...sky[1], 1);
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
    frame(eye, yaw, pitch, others, colors, fx, lights, body, ctf, tracer) {
      const [w, h] = size();
      if (lost || !w || !h) {
        return;
      }
      if (canvas.width != w || canvas.height != h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (made[0] != w || made[1] != h) {
        targets(w, h);
      }
      const tan = Math.tan(((FOV_DEG + fx.fov) * Math.PI) / 360);
      vp = viewProj(eye, yaw, pitch, w / h, fx.roll, tan);
      const v: number[] = [];
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - clock);
      clock = now;
      animate(runners, others, dt, world, tracer);
      const [right, up, fwd] = basis(yaw, pitch, fx.roll);
      drive(v, eye, fwd, Date.now() / 1000);
      // The spent batteries and capsules falling to the floor.
      fall(dt);
      drawDrops(v);
      ctf?.bases.forEach((at, team) => base(v, at, teamRgb(team), now));
      racks(v, ctf?.racks, ctf?.blades, now, ctf?.rails, ctf?.rifles);
      ctf?.packs?.forEach(at => kit(v, at, now));
      ctf?.ammo?.forEach(at => cell(v, at, now));
      ctf?.cells?.forEach(at => battery(v, at, now));
      // A carried flag is strapped to its carrier's chest.
      const chests = new Map<number, [Vec3, Quat]>();
      for (const p of others) {
        const d = Math.hypot(p.x - eye[0], p.z - eye[2]);
        const s = soldier(
          v,
          runners.get(p.id)!,
          rgb(colors.get(p.id) ?? '#888'),
          d < CLOSE ? 3 : +(d < NEAR),
          world.def.helmets,
        );
        if (s) {
          chests.set(p.id, [s.pos[JOINT.CHEST], s.rot[JOINT.CHEST]]);
        }
      }
      ctf?.flags.forEach(f => flag(v, f, teamRgb(f.team), now, f.by && chests.get(f.by.id)));
      // What glows casts nothing: it comes after the last thing that casts a shadow.
      const beamAt = v.length;
      tracer?.draw(v, eye);
      for (const p of others) {
        runners.get(p.id)?.trail.draw(v);
      }
      const bodyAt = v.length;
      body?.draw(v, eye, yaw, pitch, fx.roll, rgb(colors.get(body.id) ?? '#888'));
      if (tail + v.length * 4 > cap) {
        cap = tail + v.length * 8;
        alloc();
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, tail, new Float32Array(v));
      const pk = pack(lights);
      const first = ground.length / STRIDE;
      const sunM = sunProj(sunDir, eye);
      // Layer 0: the sun, once; then one layer per mapped light.
      gl.uniform1f(u.Z, -1);
      // Unit 1 is unbound meanwhile: sampling a map the framebuffer writes is a feedback loop.
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, depth);
      gl.viewport(0, 0, SHADOW, SHADOW);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      for (let i = 0; i <= pk.maps; i++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, shadows, 0, i);
        gl.uniformMatrix4fv(u.m, false, i ? pk.m.subarray(i * 16 - 16, i * 16) : sunM);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, first + beamAt / STRIDE);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, shadows);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
      gl.viewport(0, 0, w, h);
      gl.uniformMatrix4fv(u.m, false, vp);
      gl.uniformMatrix4fv(u.W, false, sunM);
      gl.uniform3fv(u.E, eye);
      gl.uniform1f(u.T, performance.now() / 1000);
      gl.uniform1f(u.Z, 1);
      gl.uniform1i(u.Q, pk.n);
      gl.uniform4fv(u.A, pk.a);
      gl.uniform4fv(u.B, pk.b);
      gl.uniform4fv(u.K, pk.k);
      gl.uniformMatrix4fv(u.M, false, pk.m);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // Smoke (layer -3) is see-through: its alpha covers that share of the samples.
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      // The sky first, at depth 1: the view ray of each pixel from the camera's axes.
      gl.uniform3fv(u.J, [right.map(c => c * tan * (w / h)), up.map(c => c * tan), fwd].flat());
      gl.uniform1f(u.Y, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.uniform1f(u.Y, 0);
      gl.drawArrays(gl.TRIANGLES, 0, first + bodyAt / STRIDE);
      if (v.length > bodyAt) {
        // Last, over a cleared depth: the body never sinks into a wall.
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, first + bodyAt / STRIDE, (v.length - bodyAt) / STRIDE);
      }
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaa);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, hdr.f);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.useProgram(post);
      // The bright parts at half size, then each level blurred along x into its scratch and back
      // along y; the next level reads the last one, so each is blurrier and half the size.
      pass(bloom[0][0], 0, 1 / w, 1 / h, hdr);
      bloom.forEach(([a, b], i) => {
        pass(b, 1, 1 / b.w, 0, bloom[i && i - 1][0]);
        pass(a, 1, 0, 1 / a.h, b);
      });
      gl.uniform1f(pu.L, fx.lines);
      pass(undefined, 2, 0, 0, hdr, ...bloom.map(l => l[0]));
      // Units 1 to 3 hold the blurs, which the next frame draws into.
      for (let i = 3; i > 0; i--) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.useProgram(scene);
    },
    project: (x, y, z) => project(vp, x, y, z),
    steps: id => runners.get(id)?.gait.steps,
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
};
