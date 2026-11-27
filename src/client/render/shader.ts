import { ORBIT } from '../../shared/constants';
import { ROLE, rolesOf } from '../../shared/kit';
import { TEX } from '../../shared/types';
import type { Brush, WorldDef } from '../../shared/world';
import {
  CARD_BASE,
  CARD_STEP,
  CHITIN,
  TUBE,
  GILT,
  GLOSS,
  HAIR_ROOT,
  HAIR_SPAN,
  SHINE,
  HAND_GRAIN,
  HAND_MARK,
  SKIN_LAYER,
  WEAVE,
  TWILL,
} from '../mesh';
import { MAX_LIGHTS, MAX_SHADOWS } from '../lights';
import { GRAIN, SAND, SKY, WATER, WET } from '../shore';
import { N as PRINT_TEXELS, SPAN } from '../prints';
import { FRAME } from '../../shared/beach';
import { PLUME, SMOKE } from '../smoke';
import { CANOPY, CANOPY_GLSL, DULL, GLOSS as SHEEN, HULL, PANEL, TARP, TARP_GLSL } from '../paint';
import { JOINTS } from '../rig';
import { BARE_REGIONS, COLOURS, REGION, TOP, UNLIT } from '../skin';
import { CLOTH } from '../mask';
import { CHANNELS } from '../features';
import { PLATE, VERT as VERT_TEXELS } from '../flesh';
import { OWN, SCRATCHED } from '../armor';
import { LAYERS, PLATES, SIZE } from '../textures';

import {
  BOOT_LAYER,
  FOG_CLIMB,
  FOG_FAR,
  FOG_LAYER,
  FOG_RISE,
  MAX_TINTS,
  MOON_R,
  SHADOW,
  SUIT,
  TILE,
} from './constants';

// Y > 0 is the sky: a fullscreen triangle from gl_VertexID at depth 1, whose varying P is the view
// ray (J: the camera's right and up scaled by the field of view, then forward). R places a piece of
// the store (store.ts): turned by the quaternion R[0] as turn() does, scaled by R[1].w and moved to
// R[1].xyz; the frame's own vertices go with no turn, a scale of 1, at the origin (STILL).
// Sm 1 and 2 pose a runner's skin and armour from the texels of Sg (flesh.ts), with no vertex
// array: Sb the texels of the skin's vertices, of what is drawn and of the skin's corners, and
// whether the plates take Sc[0] (Sc[1] the accent); Sq the joints' dual quaternions, Sp the
// palette, Sw the face's weights. k() is skin() for one vertex (and hb the ninja's hood over it,
// dress()), the rest armor() for one corner.
export const VERT = `#version 300 es
layout(location=0)in vec3 p;layout(location=1)in vec3 n;layout(location=2)in vec4 c;
uniform mat4 m,Hh[2];uniform float Y;uniform vec3 J[3];uniform vec4 R[2];
uniform highp sampler2D Sg;uniform int Sm;uniform ivec4 Sb;uniform vec4 Sq[${2 * (JOINTS + 2)}],Sw[${Math.ceil(CHANNELS / 4)}];uniform vec3 Sp[${COLOURS}],Sc[2],Hc;uniform float Ak;uniform vec4 Hs;
out vec3 P,N,Rp;out vec4 C;out float Wa;
vec3 r(vec3 v){vec3 t=2.*cross(R[0].xyz,v);return v+R[0].w*t+cross(R[0].xyz,t);}
vec4 g(int i){return texelFetch(Sg,ivec2(i&2047,i>>11),0);}
float sh,ry;vec2 hb;vec3 kr;
void k(int i,out vec3 x,out vec3 y){
int b=Sb.x+i*${VERT_TEXELS};vec4 a=g(b),e=g(b+1),f=g(b+2);x=a.xyz;kr=x;Rp=x;ry=x.y;y=e.xyz;sh=e.w;hb=g(b+3).xy;bool z=false;
for(int j=0;j<int(f.w);j++){int q=Sb.x+int(f.z)+j*2;vec4 h=g(q);int w=int(h.w);float fw=Sw[w>>2][w&3];if(fw!=0.){x+=fw*h.xyz;y+=fw*g(q+1).xyz;z=true;}}
if(z)y=normalize(y);
int u=int(f.x)*2,v=int(f.y)*2;float l=a.w,s=dot(Sq[u],Sq[v])<0.?-l:l;
vec4 E=(1.-l)*Sq[u]+s*Sq[v],F=(1.-l)*Sq[u+1]+s*Sq[v+1];float L=length(E);E/=L;F/=L;
vec3 t=cross(E.xyz,x);x+=2.*(E.w*t+cross(E.xyz,t)+E.w*F.xyz-F.w*E.xyz-cross(F.xyz,E.xyz));
t=cross(E.xyz,y);y+=2.*(E.w*t+cross(E.xyz,t));}
void main(){
Rp=vec3(0);Wa=0.;
if(Y>.5){vec2 q=vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.;gl_Position=vec4(q,1,1);P=J[0]*q.x+J[1]*q.y+J[2];N=vec3(0);C=vec4(0);return;}
if(Sm==1){vec4 h=g(Sb.y+gl_VertexID);k(int(h.x),P,N);int a=int(h.y);vec3 l=Sp[a];l+=(Sp[int(h.z)]-l)*h.w;l*=sh;
if(hb.x>=0.&&(hb.y>.5||a==${REGION.FLESH}))l=vec3(${CLOTH})+(l-vec3(${CLOTH}))*hb.x;
float hw=0.;for(int i=0;i<3;i++){vec4 o=g(Sb.y+gl_VertexID/3*3+i);hw+=int(o.y)==${REGION.HAIR}?1.-(int(o.z)!=${REGION.HAIR}?o.w:0.):int(o.z)==${REGION.HAIR}?o.w:0.;}hw/=3.;
float bw=float(${BARE_REGIONS.map(r => `a==${r}`).join('||')})*(hb.x<0.?1.:hb.x);
float cw=Sb.w!=3?0.:${SUIT.map(r => `a==${r}`).join('||')}?1.:a==${REGION.FLESH}&&hb.x>=0.?1.-hb.x:0.;
C=vec4(l.xy,a==${UNLIT[0]}||a==${UNLIT[1]}?-2.:Sb.w==2&&a!=${REGION.BELT}?a==${REGION.HAIR}?${GLOSS}:${CHITIN}:hw>.5&&hb.x<0.?${HAIR_ROOT}-${HAIR_SPAN}*clamp((${TOP}-ry)/.3,0.,1.):-1.+(${SKIN_LAYER}+1.)*bw+(${WEAVE}+1.)*cw+(Sb.w==3&&a==${REGION.UPPER}?${BOOT_LAYER - WEAVE}:0.),l.z);gl_Position=m*vec4(P,1);return;}
if(Sm==2){int b=Sb.y+gl_VertexID*${PLATE},j,K,t;vec4 h=g(b),G4=g(b+4),R4=g(b+5);j=int(h.y);K=int(h.z);t=int(h.x)*3;
vec3 X[3],Z[3],W3[3],M3[3],XR[3],RR[3];
for(int i=0;i<3;i++){k(int(g(Sb.z+t+i).x),X[i],Z[i]);XR[i]=kr;}
for(int i=0;i<3;i++){vec4 w=g(b+1+i);float m0=(K&2)!=0?-w.x:w.x,m1=(K&4)!=0?-w.y:w.y,m2=(K&8)!=0?-w.z:w.z;
vec3 q=vec3(Z[0].x*m0+Z[1].x*m1+Z[2].x*m2,Z[0].y*max(m0,0.)+Z[1].y*max(m1,0.)+Z[2].y*max(m2,0.),Z[0].z*m0+Z[1].z*m1+Z[2].z*m2);
float l=length(q);q/=l>0.?l:1.;W3[i]=X[0]*w.x+X[1]*w.y+X[2]*w.z+q*w.w;M3[i]=q;RR[i]=XR[0]*w.x+XR[1]*w.y+XR[2]*w.z;}
P=W3[j];Rp=RR[j];vec3 q=M3[j];
if((K&1)!=0){vec3 f=cross(W3[1]-W3[0],W3[2]-W3[0]);float l=length(f);q=l<1e-12?vec3(0,1,0):f/l;}
else if(G4.xyz!=vec3(0)){float l=length(R4.xyz);vec3 o=R4.xyz/(l>0.?l:1.),e=cross(o,q),s=G4.xyz;float sn=length(e);
if(sn>1e-6){float cs=dot(o,q);vec3 u=e/sn;s=s*cs+cross(u,s)*sn+u*dot(u,s)*(1.-cs);}
q-=s;l=length(q);q/=l>0.?l:1.;}
vec3 l=g(b+6).xyz;bool pl=Sb.w!=0;
if(l.x<0.)l=Sc[1];else if((K&${OWN})!=0){}else if(pl&&abs(h.w-(${GLOSS}))<.01)l=Sc[0];else if(pl&&(K&1)!=0)l=Sc[0]*.75;else if(pl&&G4.w>0.)l=l.x>.55?vec3(${SCRATCHED[1]}):vec3(${SCRATCHED[0]});
Wa=(Ak>0.?((K&1)!=0?2.:1.):0.)+(Sb.w==4?4.:0.);N=q;C=vec4(l.xy,h.w,l.z);gl_Position=m*vec4(P,1);return;}
if(Sm==3){float f=c.y,ph=c.w<0.?-1.:floor((${CARD_BASE}-c.z)*${(1 / CARD_STEP).toFixed(1)})*1.7,T=Hs.w,fo=f*step(0.,ph),o2=fo*(.002+.0015*sin(T*2.7+ph));
vec3 d=.6*f*Hs.xyz+fo*vec3(.005*sin(T*2.3+ph)+.003*sin(T*5.1+ph*1.7),.002*sin(T*3.1+ph*.7),.004*sin(T*1.9+ph*1.3)+.003)+n*o2;
P=R[1].xyz+r(p+d);N=r(n);C=vec4(Hc.rg*c.x,c.z,Hc.b*c.x);Rp=vec3(c.w<0.?-1.-c.w:c.w,step(c.w,0.),0);Wa=-1.;gl_Position=m*vec4(P,1);return;}
P=R[1].xyz+r(p*R[1].w);Rp=p*R[1].w;Wa=Ak;N=r(n);C=c;gl_Position=m*vec4(P,1);
if(c.z<-1.03&&c.z>-1.08&&R[1]==vec4(0,0,0,1)){vec3 a=(Hh[0]*vec4(P,1)).xyz,b=(Hh[1]*vec4(P,1)).xyz;Rp=(dot(a,a)<dot(b,b)?a:b)+vec3(${HAND_MARK}.,0,0);}}`;

// A fullscreen triangle from gl_VertexID, no buffer.
export const POST_VERT = `#version 300 es
out vec2 U;void main(){U=vec2(gl_VertexID&1,gl_VertexID>>1)*2.;gl_Position=vec4(U*2.-1.,0,1);}`;

// The post program, one pass per Y.z (a uniform: the branches are coherent). Y.xy: the step
// between taps, Y.w: the clock. 0: a bright pass of the scene (S[0]) at a quarter of its pixels,
// four taps each thresholded alone so a single hot pixel survives the averaging. 1: a 9-tap
// gaussian along Y.xy in 5 taps (the weights and offsets fold the bilinear filter in). 2: the
// scene plus the three blurs (S[1..3]) on the canvas. Tone: linear up to .6, then a shoulder
// toward 1. A NaN in the scene is dropped from the bright pass and replaced on the canvas by the
// pixel two rows down: the blurs spread one into a flat grey square, and the GPU's fast maths
// still let a few through on the moon's ground at the ring where it fades into the globe, seen
// from orbit (the user, 2026-11-27). isnan() here costs a test per tap, not the scene's fast maths.
export const POST_FRAG = `#version 300 es
precision highp float;uniform sampler2D S[4];uniform vec4 Y;uniform float L,Dp;in vec2 U;out vec4 o;
vec3 b(vec2 x){vec3 c=texture(S[0],x).rgb;if(any(isnan(c)))return vec3(0);return c*smoothstep(.9,2.,max(c.r,max(c.g,c.b)));}
#define T(k)texture(S[0],U+Y.xy*(k)).rgb
void main(){
vec3 c;
if(Y.z<1.)c=(b(U+Y.xy)+b(U-Y.xy)+b(U+Y.xy*vec2(1,-1))+b(U-Y.xy*vec2(1,-1)))/4.;
else if(Y.z<2.)c=T(0.)*.227+(T(1.3846)+T(-1.3846))*.3162+(T(3.2308)+T(-3.2308))*.0703;
else{
vec3 s=texture(S[0],U).rgb;
if(any(isnan(s))){s=textureOffset(S[0],U,ivec2(0,-2)).rgb;if(any(isnan(s)))s=vec3(0);}
if(Dp>0.){vec2 e=Y.xy*3.,f=e*.7;s=mix(s,(s+texture(S[0],U+e*vec2(1,0)).rgb+texture(S[0],U-e*vec2(1,0)).rgb+texture(S[0],U+e*vec2(0,1)).rgb+texture(S[0],U-e*vec2(0,1)).rgb+texture(S[0],U+f).rgb+texture(S[0],U-f).rgb+texture(S[0],U+f*vec2(1,-1)).rgb+texture(S[0],U-f*vec2(1,-1)).rgb)/9.,Dp);}
c=s+texture(S[1],U).rgb*1.3+texture(S[2],U).rgb*1.+texture(S[3],U).rgb*.7;
vec2 q=U-.5;
c=min(c,.6)+.4*(1.-exp(-max(c-.6,0.)/.4));
c=mix(c,c*vec3(.3,.7,.95)+vec3(0,.025,.045),Dp*.85);
float a=atan(q.y,q.x)*24.,h=fract(sin(floor(a)*12.9898)*43758.5453);
c+=L*step(.85-.5*L,h)*sin(fract(a)*3.1416)*smoothstep(.2,.6,length(q))*fract(length(q)*3.-Y.w*.002+h*9.)*.22;
c*=1.-(.7+.3*L+.4*Dp)*dot(q,q);
c=pow(max(c*vec3(.97,1.,1.03),0.),vec3(.92))+(fract(sin(dot(gl_FragCoord.xy+Y.w,vec2(12.9898,78.233)))*43758.5453)-.5)*.03;}
o=vec4(c,1);}`;

/**
 * Blinn-Phong strength and exponent: a row per TEX id in order (brick, tile, lava, stone, metal, wood,
 * moss, grate, concrete, glass, steel, paint, rock), then the flat bodies, then polished metal (SHINE),
 * then a glossy shell (GLOSS: broader, so it shows on the armour). Lava and glows never get here: they
 * light themselves.
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
  [0.12, 16],
  [0.1, 24],
  [1.4, 90],
  [1.1, 34],
];
/** Bands a metre up the ninja's bracers and shin guards: leather straps one over the next, 4.5 cm each. */
export const BANDS = 22;
/** Diamonds a metre of the quilting on the trunk of the ninja's armour, along each diagonal: 2.5 cm each. */
export const QUILT = 40;
/** Folds a metre up the ninja's sash (the user, 2026-11-24: a big cloth belt with folds): 2.6 cm each, wavering round the waist. */
export const PLEATS = 38;
/** Threads a metre of the woven cloth (WEAVE): 1.6 mm each, coarse enough to show on a runner a few metres off. */
export const PITCH = 620;
/** Metres a height of 1 in a texture's alpha stands for. */
export const RELIEF = 0.06;
/** Landfall's floors' grating stands out this much more than RELIEF (the user, 2026-11-26: a bump map on it); no other map's GRATE changes. */
export const GRATE_RELIEF = 4;
/** Landfall's steel and plates, shiny (the user, 2026-11-26): their Blinn-Phong strength and exponent, sharper than SPEC's; they mirror the sky more too, in shade as in the sun. */
export const BRIGHT_METAL = [3, 200];
/** Landfall's floors' grating, lightly shiny (the user, 2026-11-26): a highlight between SPEC's and BRIGHT_METAL's, and a little of the sky on its bars, none in its gaps. */
export const BRIGHT_GRATE = [3, 180];
/** Landfall's dull steel (paint.ts DULL): a soft highlight and a quarter of the sky the shiny steel mirrors. */
export const DULL_METAL = [0.5, 60];

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
// shadow slot (-1: none; slot k is layer k + 1), M: the slots' matrices. DEPTH (fragOf()) is the depth passes' own
// program: no colour, only the smoke and the layers that cast no shadow discarded. Y > 0 is the sky, from the colours in H[3] (zenith) and H[4] (horizon): a gradient, a
// haze band, the sun's disc and glow, bright enough to bloom (K0, the sky along a direction; the glow
// scattered by the air, so it fades with a dark horizon: the moon keeps a tenth of it). The
// glass layer adds K0 along the reflected view r, strong at a grazing angle (Fresnel, fr), after the
// lighting. A glossy shell (GLOSS) gets a clear coat: a pale sheen at a grazing angle and where it
// faces up, less in the sun's shadow. Gold (GILT) turns partly into the sky's brightness along r times its colour. Polished metal (SHINE) turns partly into that reflection (k), tinted by its colour and
// dark where r looks down at the ground, with a sharp bright streak where it mirrors just above the
// horizon. On a texture C.w is 2 * the brush's tint index + its light (see level); G is the
// palette. On stone (the regolith) the tile is fetched twice at offsets drawn from a 9 m value noise
// (vn) and blended by it, so no two patches repeat, darkened on slopes; its tone then varies by noise
// computed here at 11, 4, 1.6 and 77 m (no second fetch of the tile, whose period showed on far
// hills), and with distance it fades to the tile's mean colour and a flat height, so the horizon
// carries shading and no pattern. Where a texel spans more than a pixel the two fetches turn bicubic
// (bc(): a B-spline in four bilinear taps, bqw() its weights), as does every read of the footprints'
// map (bp()): LINEAR's slope steps at each texel, and the bump lit each one as a square (the user,
// 2026-11-26). There three octaves of value noise at 2.7, 1.2 and 0.55 cm add the grain the tile is
// too coarse to hold, each faded out before its cells shrink under 3 pixels. No NaN may leave it: the bloom's blurs spread one into a flat grey
// rectangle (the user, 2026-11-12). So every pow() has a base in [0, 1] (two unit vectors' dot can
// round past 1 where a face looks straight at the eye) and nz() normalises the half vectors, which
// can vanish. F: fog colour and
// density, U the height the fog layer is anchored at: the density is
// F.a * (1 + FOG_LAYER * exp(FOG_RISE * (U - y))) at height y, integrated along the view ray in closed
// form (x is the climb along it, times FOG_RISE; the branch is its limit at 0). D and x are bounded
// (FOG_FAR, FOG_CLIMB): where a thin face only grazes a pixel's samples, P is extrapolated to the
// pixel's centre, kilometres off, and exp(-x) overflowed to infinity; times the moon's density of 0
// that is NaN (a grey rectangle over its horizon for a frame, the user 2026-11-13). Vn switches on
// the xenomorph's vision: the world and the sky grey-blue (xv), the fog 60 %
// thinner; the Vn - 1 enemies in Ve (feet and height) glow orange and take no fog (ht), on what lies
// inside their cylinder: their bodies. Through a wall (the user, 2026-11-16) one whose chest and
// head a brush hides (a negative Ve.w, hidden() on the CPU) glows as a soft orange column (xr) on
// what hides him: the view ray through the pixel, on past it, passes within his cylinder. One in
// sight gets no through-wall glow. Gp pulses over the full geometry of a glory kill target.
/** Metres from the eye where the mirrors begin to fade to the sky, and where they end. */
export const MIRROR_NEAR = [30, 55];

// The mirrors in FRAG (MIRROR): Bx holds the map's boxes near the eye, one a row, three texels each (min, max,
// albedo), and rt() finds the nearest box on a ray: its distance (1e4: none), its row and the face's normal.
// mw is what the reflection weighs on a pixel: the glass 30 to 100 %, the steel 20 to 70 %, more at a grazing
// angle. mf keeps it near the eye, fading out by MIRROR_NEAR[1] m: the skyline's glass is far and flat, and would
// trace a ray a pixel for nothing.
/** Landfall's haze over a pixel `ds` metres from the eye, for what its own code draws (the sea, the smoke). */
export const MIST = `1.-exp(-F.a*ds*(1.+${FOG_LAYER}*exp(${FOG_RISE}*(U-E.y))))`;
export const FRAG = `#version 300 es
precision highp float;precision highp sampler2DArray;precision highp sampler2DArrayShadow;
in vec3 P,N,Rp;in vec4 C;in float Wa;uniform vec3 E;uniform float T,Z,Y,Ss;uniform int Q;
uniform vec4 A[${MAX_LIGHTS}],B[${MAX_LIGHTS}],K[${MAX_LIGHTS}],F,Ob,Cb;uniform float U;uniform float Sn;uniform vec3 G[${MAX_TINTS}],H[5],O,X;uniform mat4 M[${MAX_SHADOWS}],W;
uniform sampler2DArray S;uniform sampler2DArrayShadow D;uniform highp sampler3D Pl;uniform vec4 Ve[16];uniform int Vn;uniform int Hv;uniform float Gp;uniform sampler2D Og;out vec4 o;
#ifdef PRINTS
uniform sampler2D Fp;uniform vec2 Fc;
#endif
#ifdef MIRROR
uniform highp sampler2D Bx;uniform int Bn;
float rt(vec3 o,vec3 d,out int i,out vec3 n){vec3 q=1./d;float b=1e4;i=-1;n=vec3(0);for(int j=0;j<Bn;j++){vec3 a=(texelFetch(Bx,ivec2(0,j),0).xyz-o)*q,e=(texelFetch(Bx,ivec2(1,j),0).xyz-o)*q,u=min(a,e),v=max(a,e);float s=max(max(u.x,u.y),u.z);if(s>0.&&s<b&&min(min(v.x,v.y),v.z)>=s){b=s;i=j;n=-sign(d)*step(u.yzx,u.xyz)*step(u.zxy,u.xyz);}}return b;}
#endif
#ifdef DEPTH
void main(){if(C.z<-2.5||(C.z<-1.3595&&C.z>-1.3895))discard;}
#else
#ifdef FLESH
#define FL(x) x
#else
#define FL(x) 0.
#endif
#ifdef LAND
#define LD(x) x
#else
#define LD(x) 0.
#endif
vec3 xv(vec3 c){return dot(c,vec3(.3,.59,.11))*vec3(.55,.8,1.2);}
vec3 tv(vec3 c){float l=dot(c,vec3(.3,.59,.11));return vec3(.02,.06,.22)+min(l,1.5)*vec3(.06,.2,.5);}
vec3 av(vec3 c){float l=dot(c,vec3(.3,.59,.11));return vec3(.25,.08,.01)+min(l,1.5)*vec3(1.1,.5,.12);}
vec3 hv(vec3 c){return Hv==1?tv(c):Hv==2?av(c):xv(c);}
vec3 hpal(float t){return t<.33?mix(vec3(.1,1.3,.25),vec3(1.8,1.7,.15),t*3.):t<.66?mix(vec3(1.8,1.7,.15),vec3(2.1,.75,.06),t*3.-1.):mix(vec3(2.1,.75,.06),vec3(2.3,.12,.06),t*3.-2.);}
const vec2 SP[${SPEC.length}]=vec2[](${SPEC.map(([a, b]) => `vec2(${a},${b})`)});
vec3 e(vec3 x){return 2.*(1.-exp(-.5*x));}
vec3 nz(vec3 v){return v*inversesqrt(max(dot(v,v),1e-12));}
vec3 hs(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float n3(vec3 p){vec3 i=floor(p),f=p-i;f=f*f*(3.-2.*f);
return mix(mix(mix(hs(i).x,hs(i+vec3(1,0,0)).x,f.x),mix(hs(i+vec3(0,1,0)).x,hs(i+vec3(1,1,0)).x,f.x),f.y),mix(mix(hs(i+vec3(0,0,1)).x,hs(i+vec3(1,0,1)).x,f.x),mix(hs(i+vec3(0,1,1)).x,hs(i+vec3(1,1,1)).x,f.x),f.y),f.z);}
float cp(float d){return 1.4*d*exp(-2.*d*d)-1.3*(d-1.)*exp(-8.*(d-1.)*(d-1.));}
float ca(float d){return 1.-.18*exp(-2.*d*d)+.12*exp(-8.*(d-1.)*(d-1.));}
#ifdef MOON
vec3 ct(vec2 q,float s){q/=s;vec2 i=floor(q),b=i-step(q-i,vec2(.5));vec3 o=vec3(0,0,1);
for(int j=0;j<4;j++){vec2 c=b+vec2(j&1,j>>1);vec3 h=hs(vec3(c,s));if(h.z>.55)continue;
vec2 v=(q-c-.2-.6*h.xy)/(.1+.6*h.z);float d=length(v);if(d>1.6)continue;
o.xy+=v/max(d,1e-3)*cp(d);o.z*=ca(d);}
return o;}
vec3 cs(vec2 q,float D){vec3 a=vec3(0,0,1);for(int i=0;i<3;i++){float s=6.*exp(1.28*float(i)),w=1.-smoothstep(s*12.,s*35.,D);if(w>0.){vec3 c=ct(q,s);a.xy+=c.xy*w/(1.+float(i));a.z*=mix(1.,c.z,w);}}return a;}
vec4 cr(vec3 p,float s){vec3 q=p*s,i=floor(q),b=i-step(q-i,vec3(.5));vec4 o=vec4(0,0,0,1);
for(int j=0;j<8;j++){vec3 c=b+vec3(j&1,(j>>1)&1,j>>2),h=hs(c+s);if(h.x>.5)continue;
float r=.06+.37*h.y*h.y*h.y;vec3 v=(q-c-.2-.6*h)/r;float d=length(v);if(d>1.6)continue;
o.xyz+=v/max(d,1e-3)*cp(d);o.w*=ca(d);
if(h.z>.95)o.w*=1.+.3*exp(-1.2*max(d-1.,0.))*hs(floor(vec3(v*4.))).x;}
return o;}
bool gh(vec3 d,out vec3 p){vec3 o=vec3(0,1.+Ob.x,0);float b=dot(o,d),q=b*b-dot(o,o)+1.;p=normalize(o+d*(-b-sqrt(max(q,0.))));return q>0.&&b<0.;}
vec3 mg(vec3 d,float px,out bool t){vec3 p;t=gh(d,p);if(!t)return vec3(0);
float T=length(p-vec3(0,1.+Ob.x,0)),fp=px*T,ma=smoothstep(.42,.6,n3(p*3.)+.5*n3(p*9.)-.25);
float al=mix(1.9,.9,ma)*(.8+.4*n3(p*60.))*(.85+.3*n3(p*4e3));vec3 g=vec3(0),G=g;
for(int i=0;i<8;i++){float s=12.*exp(1.22*float(i));if(s*fp>.4)break;if(s*T<.05)continue;vec4 c=cr(p,s);float w=1.-smoothstep(.15,.4,s*fp);g+=c.xyz*w*(.3+.14*float(i));al*=mix(1.,c.w,w);}
float m=T*${MOON_R}.;if(m<6e3){vec3 c=cs((E+d*m).xz,m);G=vec3(c.x,0,c.y);al*=c.z;}
vec3 n=normalize(p-(g-p*dot(g,p))-G);
return textureLod(S,vec3(.5,.5,${TEX.STONE}.),12.).rgb*al*(e(X*max(dot(n,O),0.))+.04)*smoothstep(-.05,.1,dot(p,O));}
vec3 sk(vec3 d,float px){vec3 c=vec3(0);
for(int l=0;l<2;l++){float s=l>0?150.:60.;vec3 i=floor(d*s),h=hs(i+s*.1);if(h.x>(l>0?.04:.09))continue;
vec3 a=normalize(i+.2+.6*h);if(floor(a*s)!=i)continue;float b=l>0?.25+.4*h.y:.5+2.2*h.y*h.y*h.y,w=max(px,.0011);
float r=length(d-a)/w;c+=b*exp(-r*r*1.4)*vec3(1.-.25*h.z,.9+.05*h.z,.75+.25*h.z);}
return c;}
#endif
#ifdef BEACH
float vn(vec2 p);
#endif
vec3 K1(vec3 d,float px);
vec3 K0(vec3 d,float px){
vec3 s=K1(d,px);
#ifdef MOON
if(Ob.x>0.){vec4 m=texture(Og,gl_FragCoord.xy*.5/vec2(textureSize(Og,0)));s=s*(1.-Ob.z*m.a)+Ob.z*m.rgb;}
#endif
#ifdef BEACH
${SKY}
#endif
return s;}
vec3 K1(vec3 d,float px){
float h=d.y,k=max(dot(d,O),0.);
vec3 c=mix(H[4],H[3],pow(clamp(h,0.,1.),.5));
c=mix(c,H[4]*1.08,exp(-abs(h)*7.));
#ifdef MOON
if(px>0.)c+=Sn*sk(d,px);
#endif
return c+X*((.1+.9*clamp(H[4].g*1.2,0.,1.))*(.2*pow(k,24.)+.05*pow(k,4.))+2.*smoothstep(.9993,.9997,k));}
float vh(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float h3(vec3 q){uvec3 u=uvec3(ivec3(floor(q)));uint h=u.x*1597334673u^u.y*3812015801u^u.z*2798796415u;h^=h>>15;h*=2246822519u;h^=h>>13;return float(h)*2.3283064e-10;}
float vn3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(vh(i),vh(i+vec2(1,0)),f.x),mix(vh(i+vec2(0,1)),vh(i+vec2(1,1)),f.x),f.y);}
void bqw(vec2 u,float n,out vec2 g0,out vec2 a,out vec2 b){vec2 p=u*n-.5,i=floor(p),f=p-i,f2=f*f,f3=f2*f,w0=(1.-3.*f+3.*f2-f3)/6.,w1=(4.-6.*f2+3.*f3)/6.,w2=(1.+3.*f+3.*f2-3.*f3)/6.;g0=w0+w1;a=(i-.5+w1/g0)/n;b=(i+1.5+(f3/6.)/(1.-g0))/n;}
vec4 bc(sampler2DArray s,vec2 u,float l,float n){vec2 g,a,b;bqw(u,n,g,a,b);return mix(mix(textureLod(s,vec3(b,l),0.),textureLod(s,vec3(a.x,b.y,l),0.),g.x),mix(textureLod(s,vec3(b.x,a.y,l),0.),textureLod(s,vec3(a,l),0.),g.x),g.y);}
#ifdef PRINTS
vec4 bp(vec2 u){vec2 g,a,b;bqw(u,${PRINT_TEXELS}.,g,a,b);return mix(mix(textureLod(Fp,b,0.),textureLod(Fp,vec2(a.x,b.y),0.),g.x),mix(textureLod(Fp,vec2(b.x,a.y),0.),textureLod(Fp,a,0.),g.x),g.y);}
#endif
void main(){
#ifdef ORB
vec3 d=normalize(P);bool t;o=vec4(mg(d,length(fwidth(d))*.5,t),t);
#else
vec3 kd=Y>.5?normalize(P):-normalize(E-P);float kp=length(fwidth(kd)),fa=Y;
#ifdef MOON
if(Y<.5){fa=Ob.w>.5?0.:max(Ob.y*smoothstep(120.,260.,length(P-E))*step(P.y,${ORBIT.SEAM}.),Ob.z*smoothstep(1.25,1.6,length((P.xz-Cb.xy)*Cb.zw)));
if(Ob.w>.5&&Ob.x>0.){vec3 p;if(gh(normalize(P-E),p))discard;}}
#endif
vec3 gk=fa>.002?K0(kd,kp):vec3(0);
if(Y>.5){o=vec4(gk,1);
#ifdef VISION
if(Vn>0)o.rgb=hv(o.rgb);
#endif
return;}
if(fa>=1.&&C.z>-1.3){o=vec4(gk,1);return;}
float L=C.z,s=step(0.,L),I=floor(C.w*.5),g=step(abs(L-${TEX.LAVA}.),.5)+step(L,-1.5);
#ifdef BEACH
if(L<${CANOPY + 0.5})${CANOPY_GLSL(MIST)}
if(L<${SMOKE + 0.5})${PLUME(MIST)}
if(L<-4.5)${WATER(MIST)}
#endif
vec4 t=texture(S,vec3(C.xy/${TILE}.+vec2(g*T*.01,0),max(L,0.)));
#ifdef PRINTS
vec2 pro=abs(P.xz-Fc.xy);float prw=1.-smoothstep(${SPAN / 2 - 3}.,${SPAN / 2 - 0.5},max(pro.x,pro.y)),prk=0.,prh=0.;
if(prw>0.){vec4 prm=bp(P.xz/${SPAN}.);prk=(1.-prm.r)*prw;prh=((prm.r-1.)*.05+prm.a*.02*prm.r)*prw;}
#endif
float ks=LD(step(abs(L-${TEX.STONE}.),.5));vec3 cg=vec3(0);
if(ks>.5){
vec2 uv=C.xy/${TILE}.,gx=dFdx(uv),gy=dFdy(uv);float q=vn(C.xy*.11)*8.,iq=floor(q),mg=1.-smoothstep(.6,1.,${SIZE}.*max(length(gx),length(gy)));
vec2 ua=uv+sin(vec2(3,7)*iq),ub=uv+sin(vec2(3,7)*(iq+1.));vec4 ta=vec4(0),tb=vec4(0);
if(mg<1.){ta=textureGrad(S,vec3(ua,L),gx,gy);tb=textureGrad(S,vec3(ub,L),gx,gy);}
if(mg>0.){ta=mix(ta,bc(S,ua,L,${SIZE}.),mg);tb=mix(tb,bc(S,ub,L,${SIZE}.),mg);}
t=mix(ta,tb,smoothstep(.2,.8,q-iq-.1*dot(ta.rgb-tb.rgb,vec3(1))));
if(mg>0.){float px=${TILE}.*max(length(gx),length(gy));vec2 r=C.xy;mat2 m=mat2(.8,-.6,.6,.8);
float d0=(vn(r*37.)-.5)*smoothstep(3.,6.,.027/px);r=m*r;float d1=(vn(r*83.+3.)-.5)*smoothstep(3.,6.,.012/px);r=m*r;float d2=(vn(r*181.+7.)-.5)*smoothstep(3.,6.,.0055/px);
t.a+=mg*(.027*d0+.012*d1+.0055*d2)*${(0.25 / RELIEF).toFixed(3)};t.rgb*=1.+mg*(.16*d0+.12*d1+.1*d2);}
float fd=smoothstep(25.,140.,length(P-E)),n1=(vn(C.xy*.09)+.5*vn(C.xy*.23+7.)+.25*vn(C.xy*.61+3.))/1.75-.5,n2=vn(C.xy*.013+11.)-.5;
t.rgb=mix(t.rgb,textureLod(S,vec3(0,0,L),9.).rgb,.2+.8*fd)*(1.+.42*n1+.5*n2);
t.a=mix(t.a,.5,fd);
t.rgb*=mix(.6,1.,smoothstep(.72,.97,normalize(N).y));
#ifdef MOON
if(Sn>0.){vec3 cq=cs(P.xz,length(P-E));float uw=smoothstep(.7,.95,normalize(N).y);t.rgb*=mix(1.,cq.z,uw);cg=-uw*vec3(cq.x,0,cq.y);}
#ifdef PRINTS
t.rgb*=1.-.3*prk;
#endif
#endif
}
#ifdef BEACH
//ROCK
#endif
vec3 c=mix(vec3(C.xy,C.w),t.rgb,s);
vec3 n=normalize(normalize(N)+cg),dx=dFdx(P),dy=dFdy(P),a=cross(dy,n),b=cross(n,dx);
float kb=FL(clamp(-(L+1.)/.06,0.,1.)*step(-1.08,L)*step(L,-.5)),pw=max(length(dx),length(dy));
float f1=kb*(1.-smoothstep(.35,1.,pw*1500.)),f2=kb*(1.-smoothstep(.35,1.,pw*600.)),f3=kb*(1.-smoothstep(.35,1.,pw*180.));
float pore=0.,n6=0.,n18=0.,n9=0.;
if(kb>0.){pore=smoothstep(.62,.86,n3(Rp*1500.));float ma=n3(Rp*65.)-.5,mb=n3(Rp*24.+7.)-.5,md=.09*ma+.07*mb;
c*=1.+kb*(md*vec3(1,1.15,1.2)+max(-mb,0.)*vec3(.035,-.02,-.025))+f2*.07*(n3(Rp*600.+5.)-.5)-f1*.05*pore;n6=n3(Rp*600.);n18=n3(Rp*180.+3.);n9=n3(Rp*90.);
if(Rp.x>${HAND_MARK - 10}.)c*=1.+kb*(${HAND_GRAIN[0]}*(n6-.5)+${HAND_GRAIN[1]}*(n18-.5)-${HAND_GRAIN[2]}*pore);}
float sr=0.;
if(kb>0.){vec3 q=Rp,z=vec3(Ss*.731,Ss*1.37,Ss*.291);float fm=1.-smoothstep(.4,1.,pw*500.),hd=smoothstep(1.53,1.58,q.y),fa=smoothstep(.02,-.04,q.z)*hd;
vec3 mc=floor(q*28.),mh=hs(mc+z);float mo=fm*step(mh.x,.07)*smoothstep(.0011+.0011*mh.y,.0005,length(q-(mc+.25+.5*mh)/28.));
vec3 bc=floor(q*50.),bh=hs(bc+z*1.7);float bl=fm*fa*step(bh.x,.05)*smoothstep(.0018,.0003,length(q-(bc+.25+.5*bh)/50.));
vec3 fc=floor(q*170.),fh=hs(fc+z*1.3);float fk=fm*fa*smoothstep(.62,.8,hs(vec3(Ss,3.,7.)).x)*step(fh.x,.4)*smoothstep(.0012,.0004,length(q-(fc+.25+.5*fh)/170.));
vec2 u=vec2(atan(q.x,.005-q.z)*.085,q.y);
for(int i=0;i<2;i++){vec3 g=hs(vec3(Ss,float(i)*7.+1.,5.)),g2=hs(vec3(Ss,float(i)*7.+2.,9.));if(g.x>(i==0?.45:.15))continue;
vec2 o=vec2((g.y-.5)*.17,1.6+.1*g.z),e=vec2(cos(g2.x*6.28),sin(g2.x*6.28))*(.008+.012*g2.y),w=u-o;float t=clamp(dot(w,e)/dot(e,e),-1.,1.),d=length(w-e*t),wd=.0007+.0006*g2.z;
float k=hd*smoothstep(wd,wd*.3,d)*(1.-smoothstep(.85,1.,abs(t)))+hd*step(g2.y,.5)*step(fract(t*4.+.5),.18)*smoothstep(.003,.002,d)*smoothstep(.0012,.0006,d-.0012)*(1.-smoothstep(.7,.9,abs(t)));
sr=max(sr,k);}
c=mix(c,c*vec3(.45,.33,.28),mo*.85);c=mix(c,c*vec3(1.05,.72,.7),bl*.6);c=mix(c,c*vec3(.74,.58,.48),fk*.75);c=mix(c,c*vec3(1.18,.98,.98)+.025,sr*.8);}
float h=t.a*s*${RELIEF}+f1*-.00004*pore*(1.-sr)+f2*.00007*n6+f3*.0002*n18+.00012*sr,det=dot(dx,a);
#if defined(PRINTS)&&defined(MOON)
h+=ks*prh;
#endif
float Wq=step(3.5,Wa),Wb=Wa-4.*Wq;
#ifdef NINJA
float nk=Wq*step(abs(L-(${GLOSS})),.02)*step(Wb,1.5),lz=nk*max(step(Rp.y,.6),step(.155,abs(Rp.x))*step(Rp.y,1.19)),qz=nk*(1.-lz)*smoothstep(1.,1.03,Rp.y);
if(lz>0.){float t=fract(Rp.y*${BANDS}.),fl=lz*(1.-smoothstep(.2,.6,max(length(dFdx(Rp)),length(dFdy(Rp)))*${BANDS}.));
c*=1.+fl*(.2*(1.-t)-.1-.5*smoothstep(.1,0.,t))+lz*.14*(n3(Rp*300.)-.5);h+=fl*.002*(1.-t)+lz*.00006*n3(Rp*500.);}
if(qz>0.){vec3 gx=dFdx(Rp),gy=dFdy(Rp),w3=abs(cross(gx,gy));vec2 q=(w3.x>max(w3.y,w3.z)?Rp.zy:w3.y>w3.z?Rp.xz:Rp.xy)*${QUILT}.,f=(fract(vec2(q.x+q.y,q.x-q.y))-.5)*3.1416;
float pz=cos(f.x)*cos(f.y),fq=qz*(1.-smoothstep(.2,.6,max(length(gx),length(gy))*${QUILT}.));
c*=1.+fq*(.3*pz-.15-.35*smoothstep(.1,0.,pz));h+=fq*.0014*pz;}
if(abs(L-(${TWILL}))<.004){vec3 q=Rp,q1=vec3(.8*q.x-.6*q.y,.6*q.x+.8*q.y,q.z),q2=vec3(.5*q.x+.87*q.y,q.z,-.87*q.x+.5*q.y);
float pw=max(length(dFdx(q)),length(dFdy(q))),fa=1.-smoothstep(.3,1.,pw*1400.),fb=1.-smoothstep(.3,1.,pw*500.);
float br=n3(q*vec3(45,1400,45))-.5,s1=smoothstep(.8,.86,n3(q1*vec3(18,520,18))),s2=smoothstep(.83,.88,n3(q2*vec3(520,16,16)+7.)),sc=max(s1,s2)*fb;
c*=1.+fa*.45*br+.2*(n3(q*30.)-.5);c=mix(c,c*2.1+.06,sc*.75);h+=fa*.00004*br-.00012*sc;}
#endif
float wa=FL(min(Wb,1.)*(step(abs(L-(${GLOSS})),.02)+step(abs(L-(${GILT})),.02))),ch=0.,gr=.5,sm=1.;
if(wa>0.){vec3 q=Rp*(1.+.8*step(2.5,Wb));float pw=max(length(dx),length(dy)),lowy=smoothstep(1.1,.25,q.y);
gr=n3(q*9.)*.6+n3(q*23.+3.)*.4;sm=.55+.9*n3(q*31.+9.);
float cv=max(clamp(length(fwidth(N))/max(pw,1e-5)*.02,0.,1.),step(1.5,Wb)*step(Wb,2.5)),ce=n3(q*140.)*.65+n3(q*420.+7.)*.35;
float zn=smoothstep(.35,.75,n3(q*5.+2.));ch=smoothstep(.87-.14*zn-.2*cv,.9-.14*zn-.2*cv,ce)*(1.-.85*smoothstep(.0006,.0025,pw));
vec3 cl=floor(q*45.),hh=hs(cl+.5),d=normalize(hs(cl+3.7)-.5),e=q-(cl+.2+.6*hh)/45.;float al=dot(e,d);
float sc=step(abs(al),.006+.007*hh.z)*step(hh.x,.4)*smoothstep(.0007,.0002,length(e-d*al))*(1.-smoothstep(.3,1.,pw*2500.));
c=mix(c,vec3(dot(c,vec3(.3,.5,.2)))*vec3(.8,.68,.55)*(.55+.2*gr),(.3+.5*lowy)*smoothstep(.35,.75,gr));
c=mix(c,vec3(.07,.075,.08),ch);c=mix(c,vec3(.7,.7,.72),sc*(1.-ch)*.9);
h+=.00004*n3(q*900.)*(1.-smoothstep(.4,1.,pw*900.))-.00012*ch;}
float kt=FL(step(abs(L-(${CHITIN})),.005)),kg=1.;
if(kt>0.){vec3 q=Rp;float pw=max(max(length(dx),length(dy)),max(length(dFdx(Rp)),length(dFdy(Rp))));float kp=(1.-smoothstep(.04,.075,abs(Rp.y-1.37)))*smoothstep(.1,.12,abs(Rp.x))*(1.-smoothstep(.21,.24,abs(Rp.x))),fa=(1.-smoothstep(.35,1.,pw*160.))*(1.-kp),fb=(1.-smoothstep(.35,1.,pw*400.))*(1.-kp),fc=1.-smoothstep(.35,1.,pw*25.);
float ed=texture(Pl,mat3(.8,.36,-.48,-.6,.48,-.64,0.,.8,.6)*q*${(80 / PLATES).toFixed(4)}).r,gv=(1.-smoothstep(.02,.16,ed))*fa,gn=n3(q*380.)-.5,mo=n3(q*7.)*.6+n3(q*19.+5.)*.4;
c*=(1.+.3*(mo-.5)*fc)*(1.-.18*gv)*(1.+.1*gn*fb);
h+=fa*.00022*smoothstep(0.,.45,ed)+fb*.00005*gn;
kg=(1.-.5*gv)*(.5+mo);}
float kr=FL(step(abs(L-(${TUBE})),.005)),rr=0.;
if(kr>0.){float u=C.x*200.,fr=1.-smoothstep(.15,.4,fwidth(u));rr=smoothstep(.15,.6,abs(fract(u)-.5)*2.);
c=vec3(.3,.305,.315)*mix(.8,.5+.75*rr,fr)*C.y;h+=fr*.0005*rr;rr=mix(.6,rr,fr);}
#ifdef NINJA
float kw=clamp((L+1.)/(${WEAVE}+1.),0.,1.)*step(-1.,L)*step(L,-.5);
if(kw>0.){vec3 gx=dFdx(Rp),gy=dFdy(Rp),w3=abs(cross(gx,gy));vec2 q=(w3.x>max(w3.y,w3.z)?Rp.zy:w3.y>w3.z?Rp.xz:Rp.xy)*${PITCH}.,i=floor(q),f=(q-i-.5)*3.1416;float fw=1.-smoothstep(.35,1.,max(length(gx),length(gy))*${PITCH}.),v=step(.5,mod(i.x+i.y,2.)),th=mix(cos(f.y)*(.55+.45*cos(f.x)),cos(f.x)*(.55+.45*cos(f.y)),v);
c*=1.+kw*(fw*(.9*th-.35+.25*(v-.5))+.3*(n3(Rp*35.)-.5));h+=kw*fw*.00035*th;}
if(Wq*step(abs(L-(${WEAVE})),.004)>0.){float an=atan(Rp.x,-Rp.z),y=Rp.y+.005*sin(an*3.+1.)+.003*sin(an*7.+2.)+.012*(n3(vec3(Rp.xz*9.,Rp.y*7.))-.5),t=fract(y*${PLEATS}.),fl=1.-smoothstep(.2,.6,max(length(dFdx(Rp)),length(dFdy(Rp)))*${PLEATS}.),r=sin(t*3.1416);
c*=1.+fl*(.4*r-.22-.4*smoothstep(.14,0.,t));h+=fl*.004*r;}
float bz=step(${BOOT_LAYER - 0.025},L)*step(L,${BOOT_LAYER + 0.02});
if(bz>0.){float y=Rp.y,an=atan(Rp.z,abs(Rp.x)-.1),wz=smoothstep(.085,.1,y)*(1.-smoothstep(.2,.215,y)),t=fract(y*34.+an*.3183),fb=1.-smoothstep(.3,.8,max(length(dFdx(Rp)),length(dFdy(Rp)))*34.);
c*=1.+wz*fb*(.5*(1.-t)-.2-.6*smoothstep(.12,0.,t));h+=wz*fb*.0012*(1.-t);
float tie=smoothstep(.383,.387,y)*(1.-smoothstep(.399,.403,y)),sp=smoothstep(.0035,.001,abs(abs(Rp.x)-.089))*step(Rp.z,-.125)*step(y,.075);
c=mix(c,vec3(.2,.19,.18),tie*.8)*(1.-.8*sp);h+=tie*.0015-.001*sp;}
#endif
float ah=1.,kh=FL(step(-1.497,L)*step(L,-1.443)*smoothstep(.02,.12,(-1.45-L)/.04)),hp=max(length(dx),length(dy)),st=0.,st2=0.;
vec3 Tn=-nz((dFdx(L)*a+dFdy(L)*b)*sign(det));Tn=nz(Tn-n*dot(Tn,n));
if(kh>0.){for(int i=-3;i<=3;i++){vec3 q=P+Tn*float(i)*.011;st+=vn3(q*650.);st2+=vn3(q*200.+4.);}
st=clamp(.5+(st/7.-.5)*1.7,0.,1.);st2=clamp(.5+(st2/7.-.5)*2.6,0.,1.);
float hf=1.-smoothstep(.4,1.,hp*650.);st=mix(.5,st,hf);st2=mix(.5,st2,1.-smoothstep(.4,1.,hp*200.));
c*=.9+.16*st+.16*(st2-.5);
if(Wa<-.5&&Rp.y>.5)ah=1.-smoothstep(.94,1.,Rp.x+.08*(st-.5));}
float kc=FL(step(-1.3895,L)*step(L,-1.3595)),ac=1.,kx=max(kh,kc);
if(kc>0.){float cu=(${CARD_BASE}-L)*${(1 / CARD_STEP).toFixed(1)},ci=floor(cu),uu=(cu-ci-.02)/.96,kd=step(100.,ci)+step(200.,ci),x=uu*(kd<.5?10.:kd<1.5?7.:2.),ix=floor(x);
Tn=nz(cross(Tn,n));vec3 hq=hs(vec3(ci,ix,7.));
float d=abs(fract(x)-.5)*2.,wd=kd<.5?.65+.3*hq.x:kd<1.5?.2+.4*hq.x:.3+.3*hq.x,fw=max(fwidth(x)*2.,1e-3);
float vh=step(Wa,-.5),al=Rp.x,ln=1.-(kd<.5?.08:.2)*hs(vec3(ci,ix,3.)).x;wd*=1.-.8*vh*smoothstep(ln-.3,ln,al);
ac=clamp((wd-d)/fw+.5,0.,1.)*min(1.,max(wd/fw,kd>1.5?.45:0.))*(kd<.5?1.:step(.12,hq.y))*(kd<.5?.98:.92);
ac*=max(1.-vh*(smoothstep(ln-.03,ln,al)+step(1.5,kd)*(1.-smoothstep(0.,.1,al))),0.);c*=mix(1.,.84+.16*sin(3.1416*uu),step(.5,kd));
c*=.8+.4*hq.z;st=hq.z;st2=hq.y;}
float f=1.-smoothstep(.6,2.5,${SIZE / TILE}.*max(length(dFdx(C.xy)),length(dFdy(C.xy))));
#ifdef BEACH
float bw=0.,hk=0.;bool bs=abs(L-(${SAND}))<.005;if(bs)${GRAIN}
if(abs(L-(${TARP}))<.001)${TARP_GLSL}
if(abs(L-${TEX.GRATE}.)<.5)h*=${GRATE_RELIEF}.;
#ifdef PRINTS
if(bs){float pr=smoothstep(.1,.45,P.y-${FRAME.water}.);h+=prh*pr;c*=1.-.38*prk*pr;}
#endif
if(abs(L-(${HULL}))<.005)${PANEL}
#endif
vec3 m=normalize(abs(det)*n-sign(det)*f*(dFdx(h)*a+dFdy(h)*b)+n*1e-9);
float dm=step(abs(L-${TEX.STEEL + DULL}),.01);
vec2 R=SP[int(s>0.?L+.5:L<-1.2?${LAYERS + 1}.:L<-1.1?${LAYERS + 2}.:${LAYERS}.)];if(kt>0.)R=vec2(.22*kg,40.);if(kr>0.)R=vec2(.5*(.3+.7*rr),36.);
#ifdef BEACH
if(bs)R=mix(vec2(.05,10.),vec2(.8,140.),bw);
if(hk>0.)R=vec2(.7*hk,260.);
if(abs(L-${TEX.STEEL}.)<.5||abs(L-${TEX.METAL}.)<.5)R=vec2(${BRIGHT_METAL});
if(abs(L-${TEX.GRATE}.)<.5)R=vec2(${BRIGHT_GRATE});
if(dm>0.)R=vec2(${DULL_METAL});
#endif
vec3 y=mix(vec3(1),G[int(min(I,${MAX_TINTS - 1}.))]*(C.w-2.*I),s),V=normalize(E-P),w=nz(n+m);
float sd=max(dot(m,O),0.)*smoothstep(0.,.1,dot(n,O)),sv=1.;
sd=mix(sd,.5*sqrt(max(1.-dot(Tn,O)*dot(Tn,O),0.))*smoothstep(-.3,.4,dot(n,O)),kx*.6);
vec3 wr=vec3(.38,.16,.1),sw=clamp((dot(m,O)+wr)/(1.+wr),0.,1.)*smoothstep(-.35,.1,dot(n,O));
if(sd>0.&&g<1.){
vec4 q=W*vec4(P+n*.08,1);q.xyz=q.xyz*.5+.5;
float v=0.;
for(int j=0;j<4;j++)v+=texture(D,vec4(q.xy+(vec2(j&1,j>>1)*2.-1.)*${0.75 / SHADOW},0,q.z-.0004));
sv=mix(v/4.,1.,smoothstep(.8,1.,max(max(abs(q.x-.5),abs(q.y-.5)),abs(q.z-.5))*2.));}
vec3 l=y*(mix(mix(H[1],H[0],max(w.y,0.)),H[2],max(-w.y,0.))+X*mix(vec3(sd),sw,kb)*sv),sp=X*sv*sd*pow(max(dot(m,nz(O+V)),0.),R.y);
vec3 Hh=nz(O+V),T1=nz(Tn+m*(-.1+.12*(st-.5))),T2=nz(Tn+m*(.15+.12*(st-.5)));float d1=dot(T1,Hh),d2=dot(T2,Hh);
vec3 hl=kx*X*sv*smoothstep(-.15,.35,dot(n,O))*(.08*pow(max(1.-d1*d1,0.),80.)*(.5+st)+.06*c/(dot(c,vec3(.3,.5,.2))+.02)*pow(max(1.-d2*d2,0.),14.)*(.3+1.4*st2*st));
vec3 skp=kb*X*sv*sd*pow(max(dot(m,nz(O+V)),0.),90.)*(.07+.4*pow(clamp(1.-dot(n,V),0.,1.),5.))*(.6+.8*n9);
for(int i=0;i<${MAX_LIGHTS};i++){
if(i>=Q||g>0.)break;
vec3 d=A[i].xyz-P;float dd=dot(d,d),rr=A[i].w*A[i].w;
if(dd>=rr)continue;
float k=K[i].w,u=B[i].w;
d/=max(sqrt(dd),1e-4);
float nd=max(dot(m,d),0.);
if(nd<=0.)continue;
float w=1.-dd/rr;
w*=w*smoothstep(u,u+(1.-u)*.4,-dot(d,B[i].xyz))*nd;
if(w>0.&&k>=0.){
vec4 q=M[int(k)]*vec4(P+n*.03,1);q.xyz=q.xyz/q.w*.5+.5;
float v=0.;
for(int j=0;j<4;j++)v+=texture(D,vec4(q.xy+(vec2(j&1,j>>1)*2.-1.)*${0.75 / SHADOW},k+1.,q.z-.0005));
w*=v/4.;}
l+=K[i].rgb*w;
sp+=K[i].rgb*w*pow(max(dot(m,nz(d+V)),0.),R.y);}
c=c*mix(e(l),vec3(1.4),g)+e(sp*R.x*(1.-kx)*(1.-.75*kb)*(.4+.6*mix(1.,t.a,s))+hl+skp);
vec3 r=reflect(-V,m),k=K1(r,0.);float fr=pow(clamp(1.-dot(m,V),0.,1.),4.);
c+=kb*k*(.01+.08*fr)*(.4+.6*sv);
#ifdef BEACH
${WET}
${SHEEN}
c+=(step(abs(L-${TEX.STEEL}.),.5)*(1.-.75*dm)+step(abs(L-${TEX.METAL}.),.5))*k*(.25+.6*fr)*(.15+.85*sv);
c+=step(abs(L-${TEX.GRATE}.),.5)*step(.3,t.a)*k*(.15+.5*fr)*(.15+.85*sv);
#endif
#ifdef MIRROR
vec3 kk=k;
float mw=step(abs(L-${TEX.GLASS}.),.5)*(.3+.7*fr)+step(abs(L-${TEX.STEEL}.),.5)*(1.-.75*dm)*(.2+.5*fr);
float mf=(1.-smoothstep(${MIRROR_NEAR[0]}.,${MIRROR_NEAR[1]}.,length(P-E)))*smoothstep(.05,.15,mw);
if(mf>0.&&Bn>0){int bi;vec3 bn;rt(P+m*.03,r,bi,bn);if(bi>=0)kk=mix(k,texelFetch(Bx,ivec2(2,bi),0).rgb*(K1(bn,0.)*.4+X*max(dot(bn,O),0.)*.8),mf);}
c+=kk*mw;
#else
c+=step(abs(L-${TEX.GLASS}.),.5)*k*(.1+.9*fr);
#endif
c=mix(c,k*(.4+c)*(.2+.8*smoothstep(-.1,.25,r.y)+1.6*exp(-abs(r.y-.12)*18.)),step(abs(L-(${SHINE})),.1)*(.35+.4*fr)*(1.-.85*kr));
c+=step(abs(L-(${GLOSS})),.02)*(.3*fr+.1*smoothstep(.2,.9,r.y))*(.3+.7*sv)*mix(1.,sm*(1.-ch),wa);
c+=wa*ch*X*sv*sd*pow(max(dot(m,nz(O+V)),0.),60.)*.5;
c=mix(c,c*(.5+2.2*dot(k,vec3(.3,.4,.3)))*(.3+.7*smoothstep(-.1,.25,r.y)+1.5*exp(-abs(r.y-.12)*18.)),step(abs(L-(${GILT})),.02)*(.45+.45*fr));
float D=min(length(P-E),${FOG_FAR}.),x=clamp(${FOG_RISE}*(P.y-E.y),-${FOG_CLIMB}.,${FOG_CLIMB}.),z=step(L,-2.5),ht=0.;
c.g=mix(c.g,c.r,z);
float xr=0.;vec3 fc=F.rgb;
#ifdef VISION
if(Vn>0){
vec3 xd=P-E;float xa=max(dot(xd.xz,xd.xz),1e-4);
float hh=0.,hc=0.;for(int i=0;i<Vn-1;i++){vec4 e=Ve[i];float cw=step(50.,abs(e.w)),eh=abs(e.w)-100.*cw;vec2 dq=P.xz-e.xz;float reach=Hv==2||cw>.5?1.4:.5;float hi=step(dot(dq,dq),reach)*step(e.y+.03,P.y)*step(P.y,e.y+eh);hc=max(hc,hi*cw);hi*=1.-cw;ht=max(ht,hi);float hf=(P.y-e.y)/eh;float rd=length(dq),vo=exp(-(hf-.56)*(hf-.56)*25.)*(1.-smoothstep(.24,.44,rd)),hbd=max(1.-abs(hf-.68)*1.6+1.1*vo,step(.85,hf)*mix(.8,.45,smoothstep(.9,1.,hf)));float hb=mix(mix(hbd,.42,smoothstep(.76,.85,hf)),mix(.15,.45,smoothstep(.45,.75,hf)),smoothstep(.19,.26,rd));hh=max(hh,hi*clamp(hb*(.7+.3*abs(dot(n,V))),0.,1.));
if(e.w>0.||cw>.5)continue;float xs=max(dot(e.xz-E.xz,xd.xz)/xa,0.);vec3 xp=E+xd*xs;float xh=eh*.5;float halo=Hv==2?.9:.34;xr=max(xr,(1.-smoothstep(halo*.35,halo,length(xp.xz-e.xz)))*(1.-smoothstep(.8,1.,abs(xp.y-e.y-xh)/xh)));}
c=mix(hv(c),Hv==2?vec3(.15,2.,1.8)*(.7+.5*abs(dot(n,V))):Hv==1?hpal(hh):vec3(2.4,1.,.3)*(.45+.55*abs(dot(n,V))),ht);c=mix(c,Hv==2?vec3(.1,1.8,2.):Hv==1?vec3(2.,.75,.06):vec3(2.,.75,.2),xr*(.6+.15*sin(T*7.)));c=mix(c,vec3(.03,.1,.55)*(.6+.4*abs(dot(n,V))),hc);fc=hv(fc);}
#endif
c=mix(c,vec3(2.,.45,.03),Gp*(.55+.45*sin(T*14.)));
o=vec4(mix(c,fc,1.-exp(-F.a*(1.-.6*step(1.,float(Vn)))*(1.-max(ht,xr))*D*(1.+${FOG_LAYER}*exp(${FOG_RISE}*(U-E.y))*(abs(x)<1e-3?1.-x*.5:(1.-exp(-x))/x)))),mix(1.,C.y*pow(abs(dot(n,V)),2.),z)*mix(1.,ac,kc)*ah);
#ifdef MOON
if(fa>.002)o.rgb=mix(o.rgb,gk,fa);
#endif
#endif
}
#endif`;

/** The scene's uniforms. */
export const UNIFORMS = [
  'Hh',
  'Bx',
  'Bn',
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
  'R',
  'Sg',
  'Sm',
  'Ak',
  'Gp',
  'Hc',
  'Hs',
  'Ss',
  'Sb',
  'Sq',
  'Sp',
  'Sw',
  'Sc',
  'Ob',
  'Cb',
  'Sn',
  'Ve',
  'Vn',
  'Hv',
  'Pl',
  'Og',
  'Fp',
  'Fc',
];
/** The vertex shader's uniforms (VERT): all the depth passes' program reads. */
export const DEPTH_UNIFORMS = [
  'm',
  'Y',
  'J',
  'R',
  'Sg',
  'Sm',
  'Sb',
  'Sq',
  'Sw',
  'Sp',
  'Sc',
  'Hc',
  'Ak',
  'Hs',
];

/** A scene program (fragOf()): its uniforms' places and the arguments last sent to each. */
export interface Variant {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation>;
  sent: Map<string, unknown[]>;
  /** The kind it was made for (fragOf()), to make its twin with the vision's code. */
  kind: string;
  /** For a program with the vision's code (VISION): the one without it that it stands in for. */
  base?: Variant;
}
export type Setter = Extract<keyof WebGL2RenderingContext, `uniform${string}`>;

/** The most boxes the mirrors are tested against: a reflected pixel loops over all of them. */
export const MIRROR_BOXES = 256;

/** Metres round the eye whose boxes the mirrors reflect, and how far the eye goes before they are chosen again. */
export const MIRROR_REACH = 90;
export const MIRROR_STEP = 10;

/** The boxes the glass and the steel reflect near (x, z): the map's solid brushes within MIRROR_REACH of it, in the plan. */
export const mirrorBoxes = (brushes: readonly Brush[] = [], x: number, z: number): Brush[] =>
  brushes
    .filter(
      b =>
        !b.ghost &&
        Math.hypot(
          Math.max(b.min[0] - x, 0, x - b.max[0]),
          Math.max(b.min[2] - z, 0, z - b.max[2]),
        ) < MIRROR_REACH,
    )
    .slice(0, MIRROR_BOXES);

/** A map that has glass or steel, so a program that mirrors the boxes (MIRROR). */
export const mirrors = (brushes: readonly Brush[] = []): boolean =>
  brushes.some(b => [b.top, b.side].some(t => t === TEX.GLASS || t === TEX.STEEL));

/**
 * The scene's fragment shader for a map and for what it draws: the moon's globe, stars, craters and
 * orbit fade only where the map has them, the ninja's quilting, cloth, boots and brushed metal only
 * where he is offered (rolesOf()). `LAND` is the map and the sky
 * (the regolith, no skin, armour, hair or chitin), `FLESH` the runners, the vehicles and the
 * effects (no regolith), `ORB` the globe alone, `DEPTH` the shadow maps' depth (a few lines: the
 * colour's registers kept every shadow map's pixels from running as many at once); with none, all of it. Left in where it never runs,
 * code still costs every pixel through the shader's registers: the moon 2.4 ms of GPU a frame on
 * Highline, the ninja's 1.9 ms on three astronauts at 3 m on the moon. `rock` is the GLSL of the
 * map's rocks under BEACH (Decor.rock: Landfall's granite, from its chunk). `sight` adds the
 * vision's filter and its glowing prey (VISION), for a frame in a xenomorph's or the Hunter's
 * vision: its loop and palettes were 4.6 ms a frame on Highline with none ever drawn, 1.4 on
 * Tranquility and none on Landfall, through the registers they take from every pixel.
 */
export const fragOf = (
  def: Pick<WorldDef, 'scenery' | 'seam' | 'relief' | 'helmets'> &
    Partial<Pick<WorldDef, 'brushes'>>,
  kind = 'LAND\n#define FLESH',
  rock = '',
  sight = false,
) =>
  FRAG.replace(
    '\n',
    `\n#define ${kind}\n${moonly(def) ? '#define MOON\n' : ''}${def.scenery === 'beach' && kind.startsWith('LAND') ? '#define BEACH\n' : ''}${printed(def) && kind.startsWith('LAND') ? '#define PRINTS\n' : ''}${kind.startsWith('LAND') && mirrors(def.brushes) ? '#define MIRROR\n' : ''}${rolesOf(def).includes(ROLE.NINJA) && kind != 'LAND' ? '#define NINJA\n' : ''}${sight ? '#define VISION\n' : ''}`,
  ).replace('//ROCK', rock && `if(abs(L-${TEX.ROCK}.)<.5)${rock}`);

/** A map whose ground takes footprints (createPrints): Landfall's sand, the moon's regolith. */
export const printed = (def: Pick<WorldDef, 'scenery' | 'relief'>) =>
  !!def.relief && (def.scenery === 'beach' || def.scenery === 'moon');

/** A map with the moon's sky: its globe, stars and craters. Not the beach, whose sand is a relief too. */
export const moonly = (def: Pick<WorldDef, 'scenery' | 'seam' | 'relief'>) =>
  def.scenery === 'moon' || def.seam !== undefined || (!!def.relief && def.scenery !== 'beach');
