// Landfall's palms and ferns in the scene's shaders, brought by its chunk (Decor.instanced,
// Decor.fade, Decor.forest) and spliced into the generic code of instances/glsl.ts.
import { BARK, LEAF } from '../foliage/layers';
import { DRY } from '../jungle/constants';

/**
 * VERT's instance mode for a palm (//INSTANCE): its variant's trunk stretched to its height and
 * its crown scaled on top, turned, leant by its top as palm() leans it, swayed by the wind, singed
 * as singe() would (jungle/constants.ts); its point in its own frame for the bark (Lp).
 */
export const PALM_INSTANCE = `bool tk=abs(c.z-(${BARK}))<.0008;float hv=Pc.w,H=hv*Pb.x;vec3 q=p;
if(tk){q.xz*=Pc.x;q.y*=Pb.x;}else{q.y-=hv;q*=Pb.w;q.y+=H;}
float cs=cos(Pa.w),sn=sin(Pa.w);q.xz=vec2(cs*q.x-sn*q.z,sn*q.x+cs*q.z);
float t=tk?clamp(q.y/H,0.,1.):1.,ph=Pc.z;
q.xz+=(Pb.yz+vec2(sin(T*.8+ph),sin(T*.63+ph*1.3))*.012*H)*t*t;
if(!tk){float e=length(p-vec3(0,hv,0));q.y+=.05*e*sin(T*2.3+ph+e);}
P=Pa.xyz+q;N=vec3(cs*n.x-sn*n.z,n.y,sn*n.x+cs*n.z);Rp=P;Wa=0.;C=c;
float b=Pc.y;if(b>0.){float k=min(2.*b,1.),f=1.-max(2.*b-1.2,0.),g=4.*c.y;C.xyw=(c.xyw+(vec3(${DRY.join(',')})*g-c.xyw)*k)*f;}
Lb=vec3(-1);Lp=p+vec3(0,2.*ph,0);`;

/**
 * FADE's pixel (//FADE): a fern's leaflet is a triangle (frond(): rib's foot, rib's end, tip, VERT's
 * Lb); only a blade is kept in it, an ellipse rounded on both sides that the triangle's sides
 * sharpen to a point at the tip, narrow at the rib (no vertex more); within 12 m, past which a
 * triangle reads as one. Not on a palm (Lb -1).
 */
export const FERN_BLADE = `if(Lb.x>=0.&&abs(C.z-(${LEAF}))<.0008&&dot(P-E,P-E)<144.){float t=Lb.z,s=Lb.x+Lb.y,x=s>1e-4?(Lb.y-Lb.x)/s*(1.-t):0.,y=t-.38;if(x*x*4.+y*y*2.6>1.)discard;}`;

/**
 * The land's per-layer paint (//FOREST), under FADE: a palm's bark, fibres along its trunk in its
 * own frame (VERT's Lp), one 2D noise stretched up it and fine streaks bent by it, fading out from
 * 6 to 12 m (two 3D noises cost 1.2 ms on trunks filling the view).
 */
export const BARK_PIXEL = `
#ifdef FADE
if(abs(L-(${BARK}))<.0008){float k=1.-smoothstep(6.,12.,length(P-E));if(k>0.){float a=vn(vec2((Lp.x+Lp.z)*18.,Lp.y*.6)),b=.5+.5*sin((Lp.x*.8-Lp.z)*110.+a*6.),fb=.6*a+.4*b;c*=mix(1.,.7+.6*fb,k);h+=k*.015*fb;}}
#endif
`;
