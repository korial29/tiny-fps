// Landfall's granite, a fragment of the map's shader (docs/BEACH.md), loaded with Landfall's chunk.
// No DOM.

/**
 * The headlands' granite, in main(), over the texture `t` of TEX.ROCK, which on the beach only
 * jungle.ts's rocks wear (Tranquility's basalt is another program). It comes with Landfall's chunk
 * (Decor.rock), which render.ts splices into the map's program (fragOf()): not in the main bundle.
 * From the largest scale down: the tone of the stone, warmer and cooler over metres (what is still
 * seen from afar); dark weathering streaks down the steep faces and lichen, pale or dark, in
 * patches on those that face up; cracks, dark and thin, and a few pale veins along one noise; then
 * the crystals of about 6 cm (a Voronoi of eight cells: white and pinkish feldspar, grey and smoky
 * quartz, black mica in uneven clusters) and laths of pink feldspar up to 10 cm. The mica and the
 * cracks lie low. The wet foot is the vertices' shade.
 *
 * Every pixel of rock pays for it (docs/PERFORMANCE.md, rule 12): a scale a pixel no longer holds
 * is not faded but skipped (`if`), the streaks only on steep faces, the lichen only on those facing
 * up, and the noises are shared: eight vn3() at most up close, four far off. The first version, all of it on
 * every pixel, cost 8 ms of GPU with a boulder filling half the screen at 1600 x 900.
 */
export const GRANITE = `{vec3 gn=normalize(N);float gp=max(length(dFdx(P)),length(dFdy(P)));
float g1=vn3(P*.13),g2=vn3(P*.5+3.),gu=0.;
vec3 gb=vec3(.6,.585,.56)*(.62+.52*g1+.2*g2)*mix(vec3(.97,.99,1.03),vec3(1.05,1.,.93),g2),gc=gb;
float f0=1.-smoothstep(.15,.6,gp*17.),gf=1.-smoothstep(.15,.6,gp*5.),gd=smoothstep(.2,.8,g2);
if(f0>0.){gd=smoothstep(.2,.8,vn3(P*1.8+11.));vec3 q0=P*17.,b0=floor(q0-.5),bi=b0;float bd=9.;
for(int a=0;a<8;a++){vec3 c=b0+vec3(a&1,(a>>1)&1,a>>2),e=q0-c-.15-.7*hs(c+.5);float d=dot(e,e);if(d<bd){bd=d;bi=c;}}
vec3 h0=hs(bi+2.3);bool mi=h0.z<.04+.18*(1.-gd);
gc=mix(gb,mi?vec3(.07,.07,.08):(h0.x<.45?vec3(.8,.78,.74):h0.x<.62?vec3(.74,.6,.54):h0.x<.85?vec3(.6,.6,.59):vec3(.44,.45,.47))*(.9+.2*h0.y)*(.78+.36*g1),f0*.75);gu-=mi?f0:0.;}
if(gf>0.){vec3 q=mat3(.8,.36,-.48,-.6,.48,-.64,0.,.8,.6)*P*5.,ci=floor(q),gh=hs(ci+.5),gj=hs(ci+3.7);
vec3 d=abs(fract(q)-.5-.3*(gj-.5))/vec3(.26+.12*gh.y,.12+.06*gj.z,.18+.1*gh.z);
float k=gf*step(gh.x,.2+.55*gd)*(1.-smoothstep(.8,1.,max(max(d.x,d.y),d.z)));
gc=mix(gc,vec3(.8,.53,.43)*(.9+.2*gj.y)*(.85+.3*g1),k);gu+=.5*k;}
float ck=0.,cw=max(.012,gp*.6);
if(cw<.08){float n=vn3(P*.45+21.),cr=abs(n-.5)*2.+(gp<.03?.15*abs(vn3(P*2.+5.)-.5):0.),vr=abs(n-.12)*4.,a=min(.012/cw,1.);
ck=(1.-smoothstep(cw*.4,cw,cr))*a*step(.35,g1);gc=mix(gc,vec3(.86,.84,.8),(1.-smoothstep(cw*.3,cw*.8,vr))*a*step(.62,g2)*.8);}
if(gn.y<.8)gc*=mix(vec3(1),vec3(.55,.52,.47),smoothstep(.5,.8,vn3(vec3(P.x*2.2,P.y*.12,P.z*2.2)+1.))*(1.-smoothstep(.3,.8,gn.y))*.8);
float lc=0.;
if(gn.y>.15){lc=smoothstep(.52,.6,vn3(P*1.3+13.)+.45*g2+(gp<.05?.2*vn3(P*8.)-.1:0.)-.24)*smoothstep(.15,.6,gn.y);
gc=mix(gc,g1>.45?vec3(.76,.74,.58)*(.85+.3*g2):vec3(.2,.21,.17),lc*.8);}
gc=mix(gc,vec3(.12,.11,.1),ck*.9);
t.rgb=gc;t.a=.5+.25*(g2-.5)+.08*gu-.3*ck+.05*lc;}`;
