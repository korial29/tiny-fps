// Landfall's scenery (docs/BEACH.md): the sand, the sea and the horizon, drawn once. The sand is
// the map's relief, triangle for triangle, carried on past its lattice in every direction; the sea
// is a level sheet over it whose vertices know how deep the bed is under them, and the shader does
// the rest (SKY, WATER, GRAIN, WET below, compiled only into Landfall's program). No DOM.
import { FRAME, HULL, ZED } from '../shared/beach';
import { ground, hash, noise, raise } from '../shared/relief';
import type { World, WorldDef } from '../shared/world';
import { basis, dress, place, smooth, unit } from './mesh';

/** The sand's layer: lit paint (its colour in c.x, c.y, c.w) that the shader grains, ripples and wets. No other material's band holds it. */
export const SAND = -1.09;
/** The sea's layer: under -2.5 it casts no shadow, and the shader draws all of it. c.x is the water's depth there, metres. */
export const SEA = -5;
/**
 * How far over FRAME.water the sea's sheet is drawn, metres. The shader moves the waterline between
 * that and as much under the level (SWASH), so the sea runs up the sand and back around the level
 * the map knows.
 */
export const LIFT = 0.05;

/** Past the lattice on each side, metres: lines ever further apart, out to the far clip. */
const RINGS = [16, 48, 120, 280, 600, 1100];
/** The seabed past the lattice falls this much a metre toward the open sea, down to DEEP. */
const [FALL, DEEP] = [0.08, -40];
/** Dry sand, and the litter it turns to under the trees. */
const [PALE, LITTER] = [
  [0.64, 0.59, 0.48],
  [0.3, 0.25, 0.15],
];
/** The far island's haze-green. */
const ISLE = [0.1, 0.2, 0.12];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** An island far out to sea, a ridge the haze turns blue: one sheet from the water up to its crest, facing the beach. */
const isle = (o: number[]) => {
  const [n, x, z, w] = [28, FRAME.sea - 840, ZED / 2, 560];
  const top = (k: number) => {
    const u = k / n;
    return 70 * (4 * u * (1 - u)) ** 0.7 * (0.45 + 0.75 * noise(u * 5, 3, 9));
  };
  const at = (m: number, up: number) => [
    x - 60 * up,
    up ? top(m) : FRAME.water - 1,
    z + (m / n - 0.5) * w,
    0.6,
    0.8,
    0,
    ISLE[0],
    ISLE[1],
    -1,
    ISLE[2],
  ];
  for (let k = 0; k < n; k++) {
    o.push(
      ...at(k, 0),
      ...at(k + 1, 0),
      ...at(k + 1, 1),
      ...at(k, 0),
      ...at(k + 1, 1),
      ...at(k, 1),
    );
  }
};

/** A charred lump, to be squashed: what the fire left of the ship's skin and of the driftwood, strewn along the track. */
const LUMP = dress(
  smooth(
    [
      [0, -1],
      [1, 0],
      [0, 1],
    ],
    4,
  ),
  [1, 1, 1],
);
/** How many lumps, and how far from the centre line the furthest lie, metres. */
export const [LUMPS, STREWN] = [72, 17];
/**
 * The lumps on the ground `gy`: from the waterline to the nose's end, most of them near the line,
 * none under a section of the hull.
 */
const lumps = (o: number[], gy: (x: number, z: number) => number) => {
  const [x0, x1] = [FRAME.shore + 4, HULL.sections[2][1]];
  for (let i = 0; i < LUMPS; i++) {
    const h = (k: number) => hash(i, k, 31);
    const [x, d] = [x0 + (x1 - x0) * h(1), 3 + (STREWN - 3) * h(2) * h(2)];
    if (d < HULL.r + 1.5 && HULL.sections.some(([a, b]) => x > a && x < b)) {
      continue;
    }
    const [z, w, t] = [
      ZED / 2 + (h(3) < 0.5 ? d : -d),
      0.12 + 0.3 * h(4) * h(4),
      0.03 + 0.04 * h(5),
    ];
    place(
      o,
      LUMP,
      [x, gy(x, z) + 0.2 * w, z],
      basis(7 * h(5), 0),
      [0, 0, 0],
      [w * (0.6 + h(6)), 0.7 * w, w],
      [t, t, t],
    );
  }
};

const made = new WeakMap<WorldDef, [number[], number[]]>();

/**
 * The sand's and the sea's vertices. The lines of the relief's lattice go on past it as RINGS, so
 * one grid carries both with no seam: inside the lattice each square is split as ground() splits
 * it, on the nodes' own heights, so feet neither sink nor float. Past it the edge's heights go on,
 * falling toward the open sea. Without a relief the map's slab is the beach: the sand is a level
 * sheet just under its top, to the same distance, and the bed a guess from FRAME.
 */
const build = (def: WorldDef): [number[], number[]] => {
  const old = made.get(def);
  if (old) {
    return old;
  }
  const r = def.relief && raise(def.relief);
  const [x0, z0, cell, nx, nz] = r
    ? [r.x0, r.z0, r.cell, r.nx, r.nz]
    : [FRAME.sea, 0, 10, (FRAME.east - FRAME.sea) / 10 + 1, ZED / 10 + 1];
  const K = RINGS.length;
  const lines = (o: number, n: number) => [
    ...RINGS.map(d => o - d).reverse(),
    ...Array.from({ length: n }, (_, i) => o + i * cell),
    ...RINGS.map(d => o + (n - 1) * cell + d),
  ];
  const [xs, zs] = [lines(x0, nx), lines(z0, nz)];
  const [NX, NZ] = [xs.length, zs.length];
  /** The bed at each crossing of the lines. */
  const bed = new Float64Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const [a, b] = [clamp(i - K, 0, nx - 1), clamp(j - K, 0, nz - 1)];
      const edge = r ? r.h[a + b * nx] : FRAME.water + (x0 + a * cell - FRAME.shore) * 0.1;
      bed[i + j * NX] = Math.max(edge - FALL * Math.max(x0 - xs[i], 0), DEEP);
    }
  }
  const at = (i: number, j: number) => bed[clamp(i, 0, NX - 1) + clamp(j, 0, NZ - 1) * NX];
  /** The sand's vertex at each crossing, and the sea's. */
  const sand: number[][] = [];
  const sea: number[][] = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const [x, z, h] = [xs[i], zs[j], at(i, j)];
      const [i0, i1] = [Math.max(i - 1, 0), Math.min(i + 1, NX - 1)];
      const [j0, j1] = [Math.max(j - 1, 0), Math.min(j + 1, NZ - 1)];
      const n = r
        ? unit([
            (at(i0, j) - at(i1, j)) / (xs[i1] - xs[i0]),
            1,
            (at(i, j0) - at(i, j1)) / (zs[j1] - zs[j0]),
          ])
        : [0, 1, 0];
      // Paler and darker in patches of ten metres; litter from the first trees on.
      const k = 0.92 + 0.16 * noise(x / 11, z / 11, 5);
      const t = clamp((x - FRAME.trees - 2) / 14, 0, 1);
      const c = PALE.map((v, m) => (v + (LITTER[m] - v) * t) * k);
      sand.push([x, r ? h : FRAME.water - 0.02, z, ...n, c[0], c[1], SAND, c[2]]);
      sea.push([x, FRAME.water + LIFT, z, 0, 1, 0, FRAME.water + LIFT - h, 0, SEA, 0]);
    }
  }
  const out: [number[], number[]] = [[], []];
  const hole = r?.hole ?? [0, 0, 0, 0];
  for (let j = 0; j < NZ - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const [p, q, s, t] = [i + j * NX, i + 1 + j * NX, i + 1 + (j + 1) * NX, i + (j + 1) * NX];
      // Not in the relief's hole: the brushes are the floor there.
      if (!(xs[i] >= hole[0] && xs[i + 1] <= hole[2] && zs[j] >= hole[1] && zs[j + 1] <= hole[3])) {
        out[0].push(...sand[p], ...sand[s], ...sand[q], ...sand[p], ...sand[t], ...sand[s]);
      }
      // The sea wherever a corner of the bed is under its sheet.
      if (Math.min(bed[p], bed[q], bed[s], bed[t]) < FRAME.water + LIFT) {
        out[1].push(...sea[p], ...sea[s], ...sea[q], ...sea[p], ...sea[t], ...sea[s]);
      }
    }
  }
  isle(out[0]);
  if (r) {
    const w = { relief: r } as World;
    lumps(out[0], (x, z) => ground(w, x, z));
  }
  made.set(def, out);
  return out;
};

/** The sand and the far island, in the renderer's format. */
export const shore = (def: WorldDef): number[] => build(def)[0];

/** The sea, in the renderer's format: drawn after everything that stands in it, blended (render.ts). */
export const lagoon = (def: WorldDef): number[] => build(def)[1];

/** How far under its sheet the waterline is at a point `q` of the plan, in GLSL: it comes and goes between 0 and 2 LIFT. */
const SWASH = `${LIFT}+${LIFT}*sin(T*.55+q.y*.13+4.*vn(q*.05))`;

/**
 * The sky's low clouds, in K0(): `s` the sky's colour in the direction `d`. A layer seen from
 * under, kept to a band over the horizon, drifting.
 */
export const SKY = `if(d.y>0.){vec2 q=d.xz/(d.y+.1)*2.+T*.003;float f=vn(q)+.5*vn(q*2.3+5.)+.25*vn(q*5.1);
f=smoothstep(1.05,1.4,f)*smoothstep(0.,.05,d.y)*(1.-smoothstep(.12,.4,d.y));
s=mix(s,vec3(1.22,1.2,1.17)*(.8+.3*max(dot(d,O),0.)),f*.9);}`;

/**
 * The sea's pixel, in main(), given `fog`: the share of haze over it, an expression of `ds`, the
 * distance to the eye. It is drawn twice, blended: with Z at 2 what the water lets through of
 * what is under it (red goes first, so pale sand turns turquoise, then blue), and with Z at 1 the
 * light it adds: what the water scatters, the sky mirrored on its waves (more at a grazing angle),
 * the sun's glitter, the foam along the sand and the haze. Within 18 m of the eye four short waves
 * (13 to 57 cm) add a chop to the normal, fading out from 6 m; past 18 m they are not computed.
 */
export const WATER = (fog: string) => `{vec2 q=P.xz;float d=C.x-(${SWASH});if(d<0.)discard;
float ds=length(P-E),pf=length(fwidth(q)),fz=${fog},fo;vec3 V=(E-P)/ds;
vec2 w=q+1.5*vn(q*.09+T*.04),gd=vec2(0);
for(int i=0;i<5;i++){float k=.6*exp(.66*float(i)),a=(float(i)-2.)*.8;vec2 dr=vec2(cos(a),sin(a));
gd+=dr*cos(k*dot(dr,w)-T*sqrt(k)*1.3+a*5.)*(1.-smoothstep(.15,.6,k*pf))*.055;}
if(ds<18.){float nf=1.-smoothstep(6.,18.,ds);for(int i=0;i<4;i++){float k=11.*exp(.5*float(i)),a=float(i)*2.1+.7;vec2 dr=vec2(cos(a),sin(a));
gd+=dr*cos(k*dot(dr,w)-T*sqrt(k)*1.6+a*3.)*(1.-smoothstep(.15,.6,k*pf))*nf*.035;}}
gd*=.35+.65*smoothstep(0.,.6,d);
vec3 n=normalize(vec3(-gd.x,1,-gd.y));float fr=.02+.6*pow(clamp(1.-dot(n,V),0.,1.),5.);
float fn=vn(q*1.7+vec2(T*.12,0))*vn(q*5.-vec2(T*.2,T*.07));
fo=smoothstep(.03+.06*fn,0.,d)+smoothstep(.3,.55,fn+.3*sin(d*14.+T*.8+3.*vn(q*.3)))*(1.-smoothstep(.05,.4,d));
fo=min(fo,1.)*(1.-smoothstep(.3,1.2,pf)*.5);
vec3 tr=exp(-vec3(.42,.07,.055)*d*2.4);
if(Z>1.5){o=vec4(tr*(1.-fr)*(1.-fo)*(1.-fz),1);return;}
vec4 sq=W*vec4(P,1);sq.xyz=sq.xyz*.5+.5;
float sv=mix(texture(D,vec4(sq.xy,0,sq.z-.0004)),1.,smoothstep(.8,1.,max(max(abs(sq.x-.5),abs(sq.y-.5)),abs(sq.z-.5))*2.));
vec3 lw=e(X*max(O.y,0.)*sv+H[0]),r=reflect(-V,n);r.y=abs(r.y)+.25;r=normalize(r);
vec3 sc=mix(vec3(.02,.42,.5),vec3(.004,.09,.3),1.-exp(-d*.18))*lw*(1.-tr.g*tr.g);
vec3 c=(sc*(1.-fr)+(K1(r,0.)+sv*X*2.*pow(max(dot(n,nz(O+V)),0.),600.))*fr)*(1.-fo)+fo*.9*lw;
c=mix(c,F.rgb,fz);if(Vn>0)c=hv(c);o=vec4(c,1);return;}`;

/** The middle of the hull's middle section and the nose's end, where the fire was hottest: x, metres. */
const HOT = [(HULL.sections[1][0] + HULL.sections[1][1]) / 2, HULL.sections[2][1] - 2];
/**
 * The track of the landing, at the end of GRAIN: the furrow's floor and the inner slopes of its
 * banks are no longer sand but burnt earth, a crust of grey-black ash cracked into plates as dried
 * lava is; scorched sand over the banks' outer slopes, clean sand past them. `wd` is the distance
 * from the line, pulled about by noise: shortest at HOT, where it burnt hardest, so the track is
 * widest there; gone out to sea some 15 m behind the waterline (the bed is dark through the
 * shallows) and past the nose, where it opens into the fan the forest burnt in (jungle.ts).
 *
 * The plates are the cells of points scattered one a square (`u`, warped so their sizes differ):
 * `ck` is 0 in the crack between the two nearest and 1 on a plate, `id` the plate's own number. A
 * plate is ash or sand whole, so the crust's edge is broken along cracks, and the scorched sand
 * by it is cracked too, less and less out to where `wd` ends the piece. The ash replaces the
 * sand's colour and bump, ripples and grain with them: matt, paler where ash dusts the plates'
 * tops, black and sunk in the cracks (`h`, on a wider slope than the black: one a pixel wide glints), which glow a dull orange under the hull at HOT. It
 * takes the wet sand's mirror away (`bw`) but for a few patches melted to glass, which are
 * flat.
 */
const CHAR = `float cz=abs(q.y-${ZED / 2}.);if(cz<40.){
float ht=max(max(1.-abs(q.x-${HOT[0]}.)/26.,1.-abs(q.x-${HOT[1]}.)/14.),0.),
wd=cz/(1.+1.2*smoothstep(${HOT[1] - 14}.,${HOT[1] + 6}.,q.x))+6.*vn(vec2(q.x*.06,q.y*.15))+30.
-30.*smoothstep(8.,20.,q.x)*(1.-smoothstep(${HOT[1] + 8}.,${HOT[1] + 26}.,q.x))-3.*ht;
c*=mix(vec3(1),vec3(.13,.09,.07),(1.-smoothstep(18.,29.,wd))*(.7+.3*vn(q*.7)));
if(wd<19.){vec2 u=q*2.5+2.*vn(q*.3),ic=floor(u),fc=fract(u);float d1=9.,d2=9.,id=0.;
for(int j=0;j<9;j++){vec2 g=vec2(j%3,j/3)-1.,o=ic+g,pt=g+vec2(h3(vec3(o,1)),h3(vec3(o,2)))-fc;float d=dot(pt,pt);
if(d<d1){d2=d1;d1=d;id=h3(vec3(o,3));}else if(d<d2)d2=d;}
float fk=1.-smoothstep(.3,1.,pw*8.),e=sqrt(d2)-sqrt(d1),fe=fk*min(19.-wd,1.),ck=mix(1.,smoothstep(0.,.1,e),fe),cb=mix(1.,smoothstep(0.,.25,e),fe),a=step(wd+1.5*id,18.),gl=a*smoothstep(.8,.86,vn(q*.3));
h=cb*mix(h,.02+f2*.012*vn(q*5.),a)*(1.-gl);c*=.4+.6*ck;
c=mix(c,vec3(1,.94,.88)*(.03+.05*id+.2*ck*vn(q*2.5)*vn(q*9.))*ck*(1.-.7*gl)+vec3(2.,.4,.05)*(1.-ck)*fk*ht*step(.75,id)*smoothstep(9.,4.,cz),a);
bw=mix(bw,gl,a);}}`;

/**
 * The sand's pixel, in main(), before its normal is taken: `c` its colour, `h` its height for the
 * bump, `pw` the pixel's size on it. Dunes (ridges some 7 m apart and broad mounds, on the dry
 * sand only, from 0.4 m over the water), patches, dimples the size of a footprint, wind ripples and
 * grain down to some 3.5 cm, the small ones faded out where a pixel no longer holds them. `bw` is how wet it is: dark and smooth
 * up to where the sea last ran, with the light's net on the bed under the water.
 */
export const GRAIN = `{vec2 q=P.xz;float y=P.y-${FRAME.water}.,f1=1.-smoothstep(.3,1.,pw*9.),f2=1.-smoothstep(.3,1.,pw*2.5),f3=1.-smoothstep(.3,1.,pw*80.);
bw=1.-smoothstep(.08,.3+.12*vn(q*.4),y);
float rp=sin((dot(q,vec2(.95,.3))+1.2*vn(q*.3))*18.)*smoothstep(.3,.7,vn(q*.07+5.))*f1*(1.-.6*bw);
float dy=smoothstep(.4,1.6,y),dr=dot(q,vec2(.3,.95))*.9+2.5*vn(q*.04+2.),f4=1.-smoothstep(.3,1.,pw*40.);
h+=dy*(.24*(sin(dr)+.35*sin(2.*dr+1.))*smoothstep(.2,.7,vn(q*.025+7.))+.9*vn(q*.06+4.));
h+=.018*rp+f2*.04*(vn(q*2.2)-.5)+f1*.012*(vn(q*6.+3.)-.5)+f4*.006*(vn(q*28.+1.)-.5);
c*=(.88+.24*vn(q*.13+9.))*(1.+.05*rp+f3*.16*(vn(q*170.)-.5)+f1*.07*(vn(q*37.)-.5));
c*=mix(vec3(1),vec3(.52,.47,.4),bw);
if(y<0.){vec2 u=q*3.+vn(q*.8)*2.;float ca=vn(u+T*.3)-vn(u+7.-T*.25);c*=1.+.45*f2*pow(max(1.-abs(ca)*2.5,0.),6.)*smoothstep(0.,-.3,y);}
float wl=${LIFT}-(${SWASH});bw*=.35+.65*smoothstep(wl+.12,wl,y);${CHAR}}`;

/** The wet sand's mirror, in main(), after the light: `k` the sky its normal reflects, `fr` the fresnel term. */
export const WET = `c+=bw*k*(.02+.3*fr);`;
