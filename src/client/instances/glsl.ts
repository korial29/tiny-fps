// Things drawn by instance in the scene's shaders (render/shader.ts VERT and FRAG), under
// INSTANCES (a map whose decor has some): the copies' attributes, VERT's instance mode (Sm 4) into
// which the map's own code (Decor.instanced) is spliced at //INSTANCE, and the dither that fades a
// copy from one mesh to the other, and the frame's own vertices out by distance (Pf, dz()). The
// dither's discard is in the FADE program only (render.ts `faded`), which only those draws use;
// the map's own pixel code for them (Decor.fade) is spliced at //FADE.

/** The copies' attributes (Pa to Pd, types.ts INST) and what VERT hands FRAG for them. */
export const INST_VERT_HEAD = `#ifdef INSTANCES
layout(location=3)in vec4 Pa;layout(location=4)in vec4 Pb;layout(location=5)in vec4 Pc;layout(location=6)in vec4 Pd;uniform float T;
// Pf: the share of the pixels kept (FRAG's dz()); Gf: where the frame's own vertices fade out, from and to (metres from E), 0 for none.
out float Pf;uniform vec3 E;uniform vec2 Gf;
// Lb: a triangle's corner as barycentrics, which the map's code may set otherwise; Lp: a point in the copy's own frame.
out vec3 Lb,Lp;
#endif
`;

/** Every vertex keeps all its pixels (Pf 1) unless a branch below says otherwise. */
export const INST_VERT_INIT = `#ifdef INSTANCES
Pf=1.;Lp=vec3(0);{int cv=gl_VertexID%3;Lb=vec3(cv==0,cv==1,cv==2);}
#endif
`;

/** Sm 4: a copy, by the map's code, which sets P, N, C, Rp and Wa from p, n, c and Pa to Pc; its fade code passed on. */
export const INST_VERT = `#ifdef INSTANCES
if(Sm==4){
//INSTANCE
Pf=Pd.x;gl_Position=m*vec4(P,1);return;}
#endif
`;

/** The frame's own vertices faded out by distance (Gf). */
export const DIST_FADE_VERT = `#ifdef INSTANCES
if(Gf.y>0.)Pf=clamp((Gf.y-length(P-E))/(Gf.y-Gf.x),0.,1.);
#endif
`;

/** FRAG's side: the fade code and dz(), whether a pixel is dropped by it. */
export const FADE_FRAG_HEAD = `#ifdef INSTANCES
// The share of the pixels kept (VERT's Pf): k in [0, 1] keeps that share, 2 + k the others, by a fixed noise of the pixel (interleaved gradient noise).
in float Pf;in vec3 Lb,Lp;bool dz(){float h=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));return Pf>1.5?h<Pf-2.:h>=Pf;}
#endif
`;

/** The shadow maps' pixel: a copy's shadow fades out with its near mesh. */
export const FADE_DEPTH = `#ifdef INSTANCES
if(dz())discard;
#endif
`;

/** The land's pixel under FADE: the dither, then the map's own (Decor.fade). */
export const FADE_PIXEL = `#ifdef FADE
if(dz())discard;
//FADE
#endif
`;
