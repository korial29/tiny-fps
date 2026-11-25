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
 * longer holds them. `hk` is its gloss.
 */
export const PANEL = `{vec2 q=vec2(P.x,abs(n.y)>.7?P.z:P.y*1.3)*.5,d=abs(fract(q)-.5);hk=smoothstep(.25,.55,C.x);
c*=1.-.4*hk*smoothstep(.006+pw,.006,min(d.x,d.y))*(1.-smoothstep(.02,.09,pw));}`;
/** Its mirror, in main(), after the light: `k` the sky its normal `m` reflects (the lit sand under the horizon), `fr` the fresnel term; and the sand's light thrown back up under it. */
export const GLOSS = `c+=hk*(mix(vec3(.8,.72,.56),k,smoothstep(-.3,.05,r.y))*(.15+.6*fr)+vec3(.3,.27,.21)*clamp(.5-m.y,0.,1.));`;
