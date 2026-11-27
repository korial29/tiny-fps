// Landfall's forest as the shader knows it (docs/BEACH.md): lit paint on layers of its own. Leaves
// are plain paint (the user, 2026-11-27: no texture on the plants, a frame rate first); their layers
// tell the shader to spare them work. A palm's bark has fibres near the eye (palms/glsl.ts). Burnt earth has a texture of noise. Each layer sits between the runners' bands (from -1.08) and the gloss's
// (-1.1), clear of SAND's (±0.005 round -1.09) and TARP's (±0.001 round -1.098).

/** Leaves: the palms' fronds, the broadleaves' crowns, the undergrowth and the forest's mass. */
export const LEAF = -1.082;
/** Bark, and charred wood. */
export const BARK = -1.084;
/** Burnt earth: the forest's mass where it burnt down to the ground round the nose. */
export const EARTH = -1.0965;

/**
 * Burnt earth's pixel: grey-black ash mottled by noise a metre and a hand across, pale where it
 * lies thickest, small dark clods, and a few embers that pulse slowly.
 */
const EARTH_PIXEL = `{float f=1.-smoothstep(.02,.08,pw),a=vn3(P*.9),b=vn3(P*4.+3.),d=vn3(P*12.+9.);
c=mix(vec3(.025,.022,.02),vec3(.11,.105,.1),smoothstep(.3,.8,a+.3*(b-.5)))*(1.-.5*f*smoothstep(.55,.75,d));
c+=vec3(1.6,.3,.03)*f*smoothstep(.82,.9,vn3(P*1.7+T*.05))*smoothstep(.6,.8,b);h+=f*(.04*b+.015*d);}`;

/** The vertices `v` (the renderer's format, 10 floats each) put on the layer `l`, in place. */
export const onLayer = (v: number[], l: number) => {
  for (let i = 8; i < v.length; i += 10) {
    v[i] = l;
  }
  return v;
};

/** Whether a pixel is foliage (leaves or bark): GLSL, of the layer `L`. */
const LEAFY = `(abs(L-(${LEAF}))<.0008||abs(L-(${BARK}))<.0008)`;
/**
 * The sun's shadow on foliage from one tap of the map, not four (the hardware filters 2 by 2):
 * the fronds' own pattern hides the difference, and a leafy forest is many layers of them. GLSL
 * spliced before the four taps, which it skips; `BEACH` only, as the layers are.
 */
export const FOLIAGE_SHADOW = `
#ifdef BEACH
if(${LEAFY}){v=4.*texture(D,vec4(q.xy,0,q.z-.0004));}else
#endif
`;

/** What Landfall's chunk splices into the beach's program (Decor.forest): the burnt earth's pixel on its layer. */
export const FOREST_GLSL = `if(abs(L-(${EARTH}))<.0008)${EARTH_PIXEL}`;
