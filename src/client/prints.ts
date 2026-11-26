import { ground } from '../shared/relief';
import type { World } from '../shared/world';

/**
 * Footprints in soft ground (Landfall's sand, the moon's regolith): a deformation map around the
 * eye that the land shader reads to bend the ground's bump and darken it (PRINTS in render.ts).
 * The ground stays flat: no vertex moves.
 *
 * The map is an RGBA8 texture of N² texels over SPAN metres, addressed toroidally (REPEAT): world
 * texel i lives at texel i mod N, so when the eye moves only the strips that enter the window are
 * cleared. R is the soil left (1 untouched, 0 pressed to the bottom), kept by MIN blending; A is the
 * rim pushed up around a print, kept by MAX blending. G and B stay 1. On the beach a refill pass
 * raises R and lowers A by one step of 1/255 every FILL / 255 seconds; the moon has no wind and
 * keeps its prints until they leave the window.
 */

/**
 * Texels a side: 2048 over SPAN 24 m is 1.2 cm a texel, fine enough for a sole's edge and lugs
 * (16 MB). At 1024 the texels showed as steps in a print up close.
 */
export const N = 2048;
/** Metres the map covers a side, centred on the eye. Its last 3 m fade out in the shader. */
export const SPAN = 24;
const TEXEL = SPAN / N;
/** Seconds for a print to fill back in on the beach. */
const FILL = 150;
/** Prints a frame at most; more wait for the next one. */
const MAX = 64;
/** Metres a planted foot may stand above or below the relief and still mark it. */
const ON_GROUND = 0.12;

/** A gait's last footfall, as Gait.plant gives it. */
export interface Plant {
  /** Footfalls so far: a new one is a new print. */
  readonly n: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The foot's yaw: it points to (-sin yaw, -cos yaw). */
  readonly yaw: number;
  /** 1 for the right foot, -1 for the left. */
  readonly side: number;
}

export interface Prints {
  /** Queues a print for each new footfall of `plant`, if the foot stands on the relief. */
  feed(plant: Plant): void;
  /**
   * Moves the window to (cx, cz), fills old prints back and stamps the queued ones. Leaves its own
   * framebuffer, program and VAO bound, blending and scissor off: the caller binds its next target.
   */
  pass(dt: number, cx: number, cz: number): void;
  /** The texture, sampled by the land shader with REPEAT at world (x, z) / SPAN. */
  readonly map: WebGLTexture;
  /** The window's centre in world x and z, on the texel grid. */
  readonly cx: number;
  readonly cz: number;
}

const program = (gl: WebGL2RenderingContext, vs: string, fs: string) => {
  const p = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, `#version 300 es\nprecision highp float;\n${src}`);
    gl.compileShader(s);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return p;
};

// One instanced draw stamps the frame's prints, each four times shifted by a whole map on x and
// z, so a print across the texture's edge lands on both sides. inst: x, z, yaw, side.
const STAMP_VERT = `layout(location=0) in vec2 k;layout(location=1) in vec4 i;out vec2 l;flat out float s;
void main(){l=k*vec2(.14,.2);vec2 f=vec2(-sin(i.z),-cos(i.z)),r=vec2(cos(i.z),-sin(i.z)),c=fract(i.xy/${SPAN}.)*2.-1.,p=c+(r*l.x+f*l.y)*${2 / SPAN};
int n=gl_InstanceID%4;if((n&1)!=0)p.x+=c.x>0.?-2.:2.;if((n&2)!=0)p.y+=c.y>0.?-2.:2.;s=i.w;gl_Position=vec4(p,0,1);}`;
// A boot's sole: heel and ball as two ellipses in a smooth union (metres, < 0 inside), lugs across
// it, and a rim of pushed soil within 5 cm of its edge.
const STAMP_FRAG = `in vec2 l;flat in float s;out vec4 o;
float e(vec2 p,vec2 r){return(length(p/r)-1.)*min(r.x,r.y);}
void main(){vec2 p=vec2(l.x*s,l.y);float a=e(p-vec2(0,-.085),vec2(.041,.05)),b=e(p-vec2(.008,.045),vec2(.049,.08)),h=clamp(.5+.5*(b-a)/.03,0.,1.),d=mix(b,a,h)-.03*h*(1.-h);
float k=1.-smoothstep(-.012,.004,d),g=step(.45,fract(p.y*26.))*(1.-smoothstep(-.03,-.01,abs(p.y+.02)-.03));
o=vec4(1.-k*(.78+.22*g),1,1,.85*smoothstep(.05,0.,d)*smoothstep(-.012,.006,d));}`;
const FILL_VERT = `void main(){gl_Position=vec4(vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.,0,1);}`;
const FILL_FRAG = `uniform float k;out vec4 o;void main(){o=vec4(k,0,0,k);}`;

/** The prints of `world`, or undefined on a map without soft ground. Built again with a lost context's GL. */
export const createPrints = (gl: WebGL2RenderingContext, world: World): Prints | undefined => {
  const scenery = world.def.scenery;
  if (!world.relief || (scenery !== 'beach' && scenery !== 'moon')) {
    return undefined;
  }
  const fill = scenery === 'beach' ? FILL : Infinity;
  const map = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, map);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, N, N);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, map, 0);
  // Untouched soil. clearBufferfv leaves the renderer's clear colour (its sky) alone.
  const soil = new Float32Array([1, 1, 1, 0]);
  gl.clearBufferfv(gl.COLOR, 0, soil);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const stamp = program(gl, STAMP_VERT, STAMP_FRAG);
  const refill = program(gl, FILL_VERT, FILL_FRAG);
  const refillK = gl.getUniformLocation(refill, 'k');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const queue = new Float32Array(MAX * 4);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, queue.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  // Each print's numbers serve its four copies.
  gl.vertexAttribDivisor(1, 4);

  /** The footfall count each plant had when last seen: a plant is the gait's own object. */
  const seen = new WeakMap<Plant, number>();
  let queued = 0;
  let acc = 0;
  // World texel of the window's lower corner; NaN before the first pass.
  let ox = NaN;
  let oz = NaN;

  /** Clears world texel columns [a, b), or rows, to untouched soil. Scissor is on. */
  const strip = (a: number, b: number, rows: boolean) => {
    const n = Math.min(b - a, N);
    const s = ((a % N) + N) % N;
    const first = Math.min(n, N - s);
    for (const [at, len] of [
      [s, first],
      [0, n - first],
    ]) {
      if (len > 0) {
        if (rows) {
          gl.scissor(0, at, N, len);
        } else {
          gl.scissor(at, 0, len, N);
        }
        gl.clearBufferfv(gl.COLOR, 0, soil);
      }
    }
  };

  return {
    map,
    get cx() {
      return (ox + N / 2) * TEXEL;
    },
    get cz() {
      return (oz + N / 2) * TEXEL;
    },
    feed(p) {
      const last = seen.get(p);
      seen.set(p, p.n);
      if (last === undefined || last === p.n || queued === MAX) {
        return;
      }
      if (Math.abs(p.y - ground(world, p.x, p.z)) > ON_GROUND) {
        return;
      }
      const i = queued++ * 4;
      queue[i] = p.x;
      queue[i + 1] = p.z;
      queue[i + 2] = p.yaw;
      queue[i + 3] = p.side;
    },
    pass(dt, cx, cz) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, N, N);
      gl.bindVertexArray(vao);
      const nx = Math.floor(cx / TEXEL) - N / 2;
      const nz = Math.floor(cz / TEXEL) - N / 2;
      if (nx !== ox || nz !== oz) {
        gl.enable(gl.SCISSOR_TEST);
        if (Number.isNaN(ox)) {
          strip(0, N, false);
        } else {
          if (nx > ox) {
            strip(ox + N, nx + N, false);
          }
          if (nx < ox) {
            strip(nx, ox, false);
          }
          if (nz > oz) {
            strip(oz + N, nz + N, true);
          }
          if (nz < oz) {
            strip(nz, oz, true);
          }
        }
        gl.disable(gl.SCISSOR_TEST);
        [ox, oz] = [nx, nz];
      }
      // RGBA8 moves by 1/255: the refill waits until a whole step has built up.
      acc += dt / fill;
      const refilling = acc >= 1 / 255;
      if (!refilling && queued === 0) {
        return;
      }
      // Nothing to draw (the moon at rest): the GL's state is left alone.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      if (refilling) {
        const steps = Math.floor(acc * 255);
        acc -= steps / 255;
        gl.useProgram(refill);
        gl.uniform1f(refillK, steps / 255);
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_REVERSE_SUBTRACT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (queued > 0) {
        gl.useProgram(stamp);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, queue, 0, queued * 4);
        gl.blendEquationSeparate(gl.MIN, gl.MAX);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, queued * 4);
        queued = 0;
      }
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
    },
  };
};
