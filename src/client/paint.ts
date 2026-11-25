// The paint of Landfall's hull as the scene shader draws it (render.ts): its layer and its GLSL,
// apart from the hull's meshes (hulk.ts), which load with Landfall's chunk.

/**
 * The hull paint's layer: lit paint (its colour in c.x, c.y, c.w) that the shader rules with panel
 * lines and mirrors the sky in, the more the brighter its red is: soot is matt. No other
 * material's band holds it.
 */
export const HULL = -1.05;
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
export const GLOSS = `c+=hk*(mix(vec3(.8,.72,.56),k,smoothstep(-.3,.05,r.y))*(.15+.6*fr)+vec3(.3,.27,.21)*clamp(.5-m.y,0.,1.));`;
