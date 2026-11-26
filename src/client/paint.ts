// The paint of Landfall's hull as the scene shader draws it (render.ts): its layer and its GLSL,
// apart from the hull's meshes (hulk.ts), which load with Landfall's chunk.
import { AWNING } from '../shared/beach';

/**
 * The hull paint's layer: lit paint (its colour in c.x, c.y, c.w) that the shader rules with panel
 * lines and mirrors the sky in, the more the brighter its red is: soot is matt. No other
 * material's band holds it.
 */
export const HULL = -1.05;
/** Added to STEEL's layer, the same texture barely shiny on Landfall (the user, 2026-11-26: the steel cases): the shader's DULL_METAL. */
export const DULL = 0.25;
/**
 * The hull paint's pixel, in main(), before the light: `c` its colour, `n` its normal, `pw` the
 * pixel's size on it. Panel lines every 2 m along the hull and round it, gone where a pixel no
 * longer holds them. `hk` is its gloss. Its inner face (the nose's, under the canopy, seen from
 * the flight deck) is dark and matt.
 */
export const PANEL = `{vec2 q=vec2(P.x,abs(n.y)>.7?P.z:P.y*1.3)*.5,d=abs(fract(q)-.5);hk=smoothstep(.25,.55,C.x);
c*=1.-.4*hk*smoothstep(.006+pw,.006,min(d.x,d.y))*(1.-smoothstep(.02,.09,pw));if(dot(n,E-P)<0.){c*=.18;hk=0.;}}`;
/**
 * The canopy's glass layer (hulk.ts canopy()): drawn apart, after what is opaque, in the sea's two
 * blended passes and writing no depth, so the flight deck shows through it. Under SMOKE's and the
 * sea's layers: CANOPY_GLSL goes before theirs.
 */
export const CANOPY = -7;
/**
 * Its pixel, `fog` the haze over it: with Z over 1.5 what it lets through, multiplied into the
 * frame (a dark blue-green tint, less at a grazing angle), else the light it adds: the sky it
 * mirrors by a fresnel term and the sun's glint. Seen from either side.
 */
export const CANOPY_GLSL = (fog: string) =>
  `{float ds=length(P-E),fz=${fog};vec3 V=(E-P)/ds,n=normalize(N)*sign(dot(N,V));float fr=.07+.8*pow(max(1.-abs(dot(n,V)),0.),4.);
if(Z>1.5){o=vec4(vec3(.56,.7,.68)*(1.-fr)*(1.-fz),1);return;}
vec3 c=(K1(reflect(-V,n),0.)+X*3.*pow(max(dot(n,nz(O+V)),0.),300.))*fr;c=mix(c,F.rgb,fz);if(Vn>0)c=hv(c);o=vec4(c,1);return;}`;
/** Its mirror, in main(), after the light: `k` the sky its normal `m` reflects (the lit sand under the horizon), `fr` the fresnel term; and the sand's light thrown back up under it. */
export const GLOSS = `c+=hk*(mix(vec3(.8,.72,.56),k,smoothstep(-.3,.05,r.y))*(.06+.35*fr)+vec3(.15,.135,.105)*clamp(.5-m.y,0.,1.));`;
/**
 * The camps' tarpaulins (debris.ts shelter()): lit cloth in the team's colour (c.x, c.y, c.w), matt.
 * Between SAND's band and -1.1, where the GLOSS spec starts, and under -1.08, where the runners'
 * own layers end.
 */
export const TARP = -1.098;
/** Metres of hem drawn down each long edge of a tarpaulin: the shader frays it shorter. */
export const HEM = 1;
/**
 * Its pixel, in main(), before the light: a canvas weave of 4 mm threads that fades before it
 * aliases, slow blotches of sun-bleach and dirt. Torn (the user, 2026-11-26: tears less angular):
 * holes through the roof where a slow noise peaks, their edges frayed by finer ones and scorched
 * dark; the hems, hanging from AWNING, cut to tatters of their own lengths, slit up from the foot.
 * By world position, so the roof's two faces tear alike.
 */
export const TARP_GLSL = `{bool rf=abs(n.y)>.5;vec2 q=rf?P.xz:vec2(P.x+P.z,P.y);float f=1.-smoothstep(.002,.008,pw),w=sin(q.x*785.)*sin(q.y*785.),te;
if(rf)te=vn(q*.45+3.)+.35*vn(q*.9+17.)-.08*vn(q*6.)-.04*vn(q*19.)-.88;
else{float d=${AWNING.toFixed(3)}-P.y,l=.25+.5*vn(vec2(q.x*2.2,1.))+.12*vn(vec2(q.x*9.,2.))+.05*vn(vec2(q.x*31.,3.));te=max(d-l,(vn(vec2(q.x*7.,d*1.2))-.72)*smoothstep(l-.6,l,d))*2.;}
if(te>0.)discard;
h+=f*.004*w+.02*(vn(q*2.5)-.5);c*=(1.+.18*f*w)*(.78+.34*vn(q*1.3+4.))*mix(1.,.62,smoothstep(.5,.8,vn(q*.7+11.)))*mix(.45,1.,smoothstep(0.,.06,-te));}`;
