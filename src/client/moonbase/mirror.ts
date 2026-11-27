// The reflections in the base's windows seen from inside (the user, 2026-11-27: "ray tracing on the
// windows"), a fragment of the map's shader that comes with Tranquility's chunk (Decor.glaze), which
// render.ts splices into the map's program (fragOf()) after the light: not in the main bundle.
import { DOME, HALL, MODULES, ROOM, WALL } from '../../shared/moonbase';
import { ZED } from '../../shared/moon';
import { HALL_GLASS, ROOM_GLASS, TOP } from './constants';

const f = (n: number) => (Number.isInteger(n) ? `${n}.` : `${n}`);
const v3 = (a: number[]) => `vec3(${a.map(f)})`;
/** A module's room inside its walls, from its floor to its ceiling: low and high corners. */
const room = ({ min, max }: { min: number[]; max: number[] }) => [
  [min[0] + WALL, 0, min[2] + WALL],
  [max[0] - WALL, ROOM, max[2] - WALL],
];
const [[l0, h0], [l1, h1]] = MODULES.map(room);
const [CX, CZ] = DOME;
/** The hall's plan from its centre: its rectangles and the same turned a quarter (shared/moonbase.ts). */
const RECTS = [...HALL, ...HALL.map(([a, b]) => [b, a])];

/**
 * Over the glass of a window (ROOM_GLASS, HALL_GLASS: glows with their true normal m), the view
 * reflected (r, from the light's code) is traced through the room it looks into, from the pane to
 * what it meets first, and the colour drawn there is mirrored in it, more at a grazing angle (fr).
 * The room is red's or its twin across ZED. A module is a box (slabs): its ceiling with its three
 * lamps, its floor in panels, its walls with their row of windows. The hall is the union of its four
 * rectangles, crossed slab by slab twice over (a ray that leaves one goes on in the next), then the
 * floor: the concrete with its seams, the walls with their skirting, two rows of windows and the
 * strip of light under the ledge at TOP, and the dark dome over them.
 */
export const GLAZE = `if(L<${(ROOM_GLASS + 0.05).toFixed(2)}&&L>${(HALL_GLASS - 0.05).toFixed(2)}){
bool rd=P.z>${f(ZED / 2)};vec3 id=1./(r+step(abs(r),vec3(1e-5))*1e-5),h,e,W=vec3(.55,.56,.58);float t=0.;
if(L<${((ROOM_GLASS + HALL_GLASS) / 2).toFixed(3)}){vec2 o=P.xz-vec2(${f(CX)},rd?${f(CZ)}:${f(ZED - CZ)}),E[4]=vec2[](${RECTS.map(([a, b]) => `vec2(${f(a)},${f(b)})`)});float ax=0.;
for(int n=0;n<2;n++)for(int i=0;i<4;i++){vec2 a=(-E[i]-o)*id.xz,b=(E[i]-o)*id.xz,lo=min(a,b),hi=max(a,b);float t1=min(hi.x,hi.y);
if(max(lo.x,lo.y)<=t+.01&&t1>t){t=t1;ax=hi.x<hi.y?0.:1.;}}
float tf=r.y<0.?-P.y*id.y:1e3;bool fl=tf<t;t=min(t,tf);h=P+r*t;float u=fract((ax<.5?h.z:h.x)/2.4);
e=fl?vec3(.42,.43,.45)*(min(fract(h.x),fract(h.z))<.03?.7:1.):h.y>${f(TOP)}?vec3(.03,.03,.04):h.y>${f(TOP - 0.6)}&&h.y<${f(TOP - 0.4)}?vec3(1.3):h.y<.25?vec3(.04):
((h.y>1.7&&h.y<2.9)||(h.y>5.1&&h.y<6.3))&&u>.25&&u<.75?vec3(.56,.48,.28):W;}
else{bool m0=P.x>${f((h1[0] + l0[0]) / 2)};vec3 lo=m0?${v3(l0)}:${v3(l1)},hi=m0?${v3(h0)}:${v3(h1)};
if(!rd){float z=lo.z;lo.z=${f(ZED)}-hi.z;hi.z=${f(ZED)}-z;}
vec3 x=max((lo-P)*id,(hi-P)*id);t=min(x.x,min(x.y,x.z));h=P+r*t;float s=(hi.x-lo.x)/3.,lx=abs(fract((h.x-lo.x)/s)-.5)*s,wx=abs(fract((h.x-lo.x-${f(1 - WALL)})*.5+.5)-.5)*2.;
e=t==x.y?(r.y>0.?(lx<1.2&&abs(h.z-(lo.z+hi.z)*.5)<.3?vec3(1.6):vec3(.5)):vec3(.4,.41,.44)):
t==x.z&&h.y>2.7&&h.y<3.7&&wx<.46?vec3(.22,.24,.26):W;}
vec3 dv=normalize(P-E),w;if(dv.y>0.)w=K0(dv,.0015);else{float tg=-P.y/dv.y;vec2 g=P.xz+dv.xz*tg;
w=vec3(.5,.49,.47)*(.7+.45*vn(g*.12))*(.75+.35*vn(g*1.7))*(.25+.75*max(O.y,0.));}
c=mix(w,e,.08+.6*fr);}`;
