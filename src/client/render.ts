// WebGL2 drawing: one scene program, one buffer. The brushes are built once; the other players are
// boxes rewritten each frame into the tail of the same buffer. The sky is a fullscreen triangle at
// depth 1, the sun a directional light with an orthographic shadow map that follows the eye (layer 0
// of the shadow array), and lights.ts adds spots and points on top (the first MAX_SHADOWS shadowed
// spots get the layers after it). Everything is drawn in the one program, the depth passes with
// colour writes off. The scene goes into an offscreen target, then a second, small program (POST)
// turns it into the picture on the canvas. No DOM beyond the canvas.
import { GLORY_HP } from '../shared/constants';
import { ROLE } from '../shared/kit';
import { heightOf } from '../shared/physics';
import { altitude } from '../shared/ship';
import { MODE } from '../shared/types';
import type { Choice, PlayerState } from '../shared/types';
import { hidden } from '../shared/world';
import type { World } from '../shared/world';
import type { Effects } from './effects';
import { createDust } from './dust';
import { base, flag, teamRgb } from './flag';
import { STRIDE, basis } from './mesh';
import { MAX_SHADOWS, beams } from './lights';
import { mouths, rooms } from '../shared/station';
import { lagoon } from './shore';
import { createPrints } from './prints';
import type { Prints } from './prints';
import { plumes } from './smoke';
import type { Vec3 } from './mesh';
import { battery, cell, kit, racks, vest } from './props';
import { PACK } from './pack';
import { JOINT, turn } from './rig';
import { craft } from './craft';
import { rolled, rover } from './rover';
import type { Quat } from './rig';
import { GRIN, HUNTER_GEAR, animate, createRunner, soldier, warmHunter } from './soldier';
import { PARRY_IN } from './katana';
import { Verts } from './verts';
import { data, filled, stored, used } from './store';
import type { Pieces } from './store';
import type { Runner } from './soldier';
import { LAYERS, PLATES, PLATE_TEXELS, SIZE, plates, textures } from './textures';
import { drawDrops, fall } from './drops';
import { traffic } from './traffic';
import { cells, seen } from './cells';

import {
  CLOSE,
  FOV_DEG,
  GLOBE_FROM,
  GLOBE_IN,
  MAX_TINTS,
  MOON_R,
  NEAR,
  ORBIT_FADE,
  ROVER_MID,
  ROVER_NEAR,
  SAMPLES,
  SHADOW,
  SHIP_MID,
  SHIP_NEAR,
  STILL,
  TAIL,
  TEXELS,
  clamp01,
} from './render/constants';
import {
  DEPTH_UNIFORMS,
  MIRROR_STEP,
  POST_FRAG,
  POST_VERT,
  type Setter,
  UNIFORMS,
  VERT,
  type Variant,
  fragOf,
  mirrorBoxes,
  mirrors,
  moonly,
} from './render/shader';
import { cover, inView, lit, pack, project, sunAt, sunProj, viewProj } from './render/camera';
import { BARE, city, daylight, fogOf, fogRef, palette, scenery } from './render/scene';
import type { Renderer, Target, Targets } from './render/types';
import { PICTURE_MIN, PORTRAIT, backing, outfit, through, warmSteps } from './render/shots';

export * from './render/constants';
export * from './render/shader';
export * from './render/camera';
export * from './render/scene';
export * from './render/types';
export * from './render/shots';

/** `d` is the map's own scenery (decor()): without it, Tranquility and Landfall draw their brushes only. */
export const createRenderer = (canvas: HTMLCanvasElement, world: World, d = BARE): Renderer => {
  // Before the builds below: with no WebGL2 they would be seconds for nothing.
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false });
  if (!gl) {
    throw new Error('WebGL2 is not available');
  }
  /** The animation state of each runner drawn. */
  let runners = new Map<number, Runner>();
  let builds: ReadonlyMap<number, number> = new Map();
  let looks: ReadonlyMap<number, Choice> = new Map();
  // The runners' skins, armour, cuts, hair and the xenomorph, built now (warmSteps()): a frame of
  // the match would stall on them. Done already when play/entry.ts ran the steps one task each.
  warmSteps().forEach(through);
  /** Another build's skins and armour, as a runner of it comes (wear()). */
  const dressed = (build: number) => outfit(build).forEach(through);
  /** Each rover's wheels: the angle they have rolled to, and where the rover was last frame. */
  const spins: number[] = [];
  const was: [number, number][] = [];
  const dust = createDust();
  let clock: number | undefined;
  const pen = document.createElement('canvas').getContext('2d')!;
  const known = new Map<string, number[]>();
  /** Any CSS colour to [r, g, b] in 0..1, gray when the browser does not know it. */
  const rgb = (css: string) => {
    let c = known.get(css);
    if (!c) {
      pen.fillStyle = '#888';
      pen.fillStyle = css;
      const v = parseInt(pen.fillStyle.slice(1), 16);
      const n = v >= 0 ? v : 0x888888;
      known.set(css, (c = [n >> 16, (n >> 8) & 255, n & 255].map(x => x / 255)));
    }
    return c;
  };

  const size = () => backing(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
  // What is drawn is the world plus a city, a street and the runner's red; the physics knows only `world`.
  const ground = scenery(world, d);
  /** The Earth, the last of the ground's vertices (the stars are the sky's). */
  const heavensN = world.def.scenery === 'moon' ? d.sky.length / STRIDE : 0;
  /** Landfall's sea, the last of the ground's vertices: drawn apart, after what stands in it. */
  const seaN = world.def.scenery === 'beach' ? lagoon(world.def).length / STRIDE : 0;
  /** Its smoke and fires, the last before the sea: drawn apart too, after the sky they rise into. */
  const smokeN = seaN && plumes(world.def).length / STRIDE;
  /** Its canopy's glass, before the smoke: drawn apart, blended, after the sky seen through it. */
  const glassN = seaN && (d.glass?.length ?? 0) / STRIDE;
  /** The ground's opaque vertices, before the Earth, the glass, the smoke and the sea. */
  const opaque = ground.length / STRIDE - heavensN - glassN - smokeN - seaN;
  /** Those cut into runs, each pass drawing those in its view (cells.ts), and the draws of the last one. */
  const runs = cells(ground, opaque);
  const draws = new Int32Array(runs.n * 2);
  /** The glass, right after them, as one run: its two passes are skipped when it is out of view. */
  const panes = cells(ground.slice(opaque * STRIDE, (opaque + glassN) * STRIDE), glassN, 1e9);
  const paned = new Int32Array(2);
  /** Draws the ground's opaque runs in the frustum of `m`, the matrix the pass draws with. */
  const map = (m: Float32Array) => {
    const n = seen(runs, m, draws);
    for (let i = 0; i < n; i++) {
      gl.drawArrays(gl.TRIANGLES, draws[i * 2], draws[i * 2 + 1]);
    }
  };
  /** True while portrait() draws: its runner stands high over the map, never in orbit. */
  let posing = false;
  /** Seconds a posing frame moves its runner on: 0 but for a picture drawn again (see `posed`). */
  let poseDt = 0;
  /**
   * The runner each picture last showed, its look (`key`), where he stands and when it was drawn
   * (performance.now(), s): drawn again with the same look, the same runner moves on by the time
   * since, so the menu's character breathes and blinks on as in a match.
   */
  const posed = new WeakMap<
    HTMLCanvasElement,
    { key: string; r: Runner; model: PlayerState; at: number }
  >();
  // Only the city has traffic.
  const drive = world.def.scenery ? () => {} : traffic(world.def);
  const { sun, sky } = world.def;
  const sunDir = sun.dir.map(v => v / Math.hypot(...sun.dir)) as Vec3;
  const pixels = textures();
  const tail = ground.length * 4;
  let cap = tail + TAIL;
  let shadows: WebGLTexture;
  /** Footprints in the sand or the regolith, on unit 6; none on other maps. */
  let prints: Prints | undefined;
  let depth: WebGLFramebuffer;
  /** The scene's programs (fragOf()): the map and the sky, the bodies, the moon's globe. */
  let land: Variant;
  let bodies: Variant;
  let globed: Variant | undefined;
  /** The shadow maps' program: depth only. */
  let shade: Variant;
  /** The scene program in use, the values given to the scene's uniforms by name (setter, arguments). */
  let live: Variant | undefined;
  /**
   * A frame in a xenomorph's or the Hunter's vision: the map and the runners are drawn with the
   * programs that have its code (VISION), made the first time, and the rest of the time with the
   * ones that do not.
   */
  let vision = false;
  const sighted = new Map<Variant, Variant>();
  /** Makes a scene program of `kind` for this map: set with the programs, in createRenderer's setup. */
  let make: (kind: string, names?: string[], sight?: boolean) => Variant;
  /** The twin of `v` with the vision's code, linked the first time it is asked for. */
  const sightOf = (v: Variant) => {
    let w = sighted.get(v);
    if (!w) {
      w = { ...make(v.kind, UNIFORMS, true), base: v };
      sighted.set(v, w);
      // link() left the new program in use: back to the one the draws go on with.
      gl.useProgram(live?.p ?? null);
    }
    return w;
  };
  /** Switches to the programs of a vision frame (or back): the one in use is swapped at once. */
  const see = (on: boolean) => {
    if (on != vision) {
      vision = on;
      if (live) {
        const plain = live.base ?? live;
        live = undefined;
        use(plain);
      }
    }
  };
  // The mirrors' boxes (MIRROR): the texture, where the eye was when they were chosen, and whether the map has any.
  let mirrorTex: WebGLTexture | null = null;
  let mirrorAt: [number, number] | undefined;
  const mirrored = mirrors(world.def.brushes);
  /** Sends the boxes near (x, z) as three RGBA32F texels a row: min, max, albedo. */
  const mirrorUpload = (x: number, z: number) => {
    const boxes = mirrorBoxes(world.def.brushes, x, z);
    const rows = Math.max(1, boxes.length);
    const bd = new Float32Array(rows * 12);
    boxes.forEach((b, i) =>
      bd.set([...b.min, 0, ...b.max, 0, ...(b.tint ?? [0.72, 0.72, 0.7]), 0], i * 12),
    );
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, mirrorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 3, rows, 0, gl.RGBA, gl.FLOAT, bd);
    gl.activeTexture(gl.TEXTURE0);
    uni('uniform1i', 'Bn', boxes.length);
    mirrorAt = [x, z];
  };
  const given = new Map<string, [Setter, unknown[]]>();
  /** One uniform into its place in `v`, unless `v` already has these arguments. */
  const send = (v: Variant, n: string, f: Setter, a: unknown[]) => {
    if (v.sent.get(n) !== a && v.u[n]) {
      (gl[f] as (...x: unknown[]) => void)(v.u[n], ...a);
    }
    v.sent.set(n, a);
  };
  /** Sets a scene uniform: in the program in use now, and in each other one when it is next used. */
  const uni = (f: Setter, n: string, ...a: unknown[]) => {
    given.set(n, [f, a]);
    send(live!, n, f, a);
  };
  /**
   * The colour pass of what moves: smoke (layer -3) and hair are see-through, their alpha covers that
   * share of the samples. Not the map's: on with nothing to cover, it kept the GPU from skipping the
   * hidden pixels (an M2's hidden surface removal), 1.5 to 2.8 ms of a frame.
   */
  const moving = () => {
    use(bodies);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  };
  const still = () => {
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    use(land);
  };
  /** Draws with `v` from now on, given what the uniforms were set to meanwhile. */
  const use = (plain: Variant) => {
    const v = vision && plain.kind != 'DEPTH' && plain.kind != 'ORB' ? sightOf(plain) : plain;
    if (v != live) {
      gl.useProgram(v.p);
      live = v;
      given.forEach(([f, a], n) => send(v, n, f, a));
    }
  };
  let post: WebGLProgram;
  let pu: Record<string, WebGLUniformLocation> = {};
  /** 0 to 1: the eye under the water, which the post pass tints. */
  let under = 0;
  let fmt: number;
  /** The format of the small targets: the globe's, whose alpha is read, and the bloom's blurs. */
  let wide: number;
  // The multisampled target the scene draws into, and the texture it is resolved to.
  let msaa: WebGLFramebuffer;
  let hdr: Target;
  /** The moon's globe at half the frame's size, on a map that has it. */
  let orb: Target | undefined;
  /** The bloom's blur levels, from half the frame down: each a pair, the second one the scratch. */
  let bloom: [Target, Target][];
  /** The frame size the targets were built for, [0, 0] before the first. */
  let made = [0, 0];
  /** Deletes what targets() built. */
  let owned: (() => void)[] = [];
  /**
   * A picture's own targets (portrait()), one set for each size of picture: built at its card's
   * size, it costs a sixth of the screen's pixels. Swapped in for the frame's while it draws.
   */
  const asides = new Map<string, Targets>();
  /** Where portrait() draws: its size in pixels, which posing frames take instead of the screen's. */
  let poseAt: [number, number] | undefined;
  let lost = false;
  /** The xenomorph's vision is on (vision()). */
  let seeing = false;
  /** Hunter vision is local; only the caller supplies eligible enemies. */
  let hunterMode = 0;
  let hunterTargets: PlayerState[] = [];
  /** Who the thermal view shows cold, all in blue: the xenomorphs (the user, 2026-11-23). */
  let hunterCold: PlayerState[] = [];
  /** Whether weak enemies flash outside of portraits. */
  let keen = false;
  let vp = new Float32Array(16);
  /** The frame's vertices as written, and as the GPU takes them: both kept from frame to frame. */
  const v = new Verts();
  let floats = new Float32Array(0);
  /** The frame's pieces of the store (store.ts), drawn after its own vertices. */
  const pieces: Pieces = [];
  /** The own body's pieces of the store (the Hunter's armour and harpoon), drawn with the body. */
  const bodyPieces: Pieces = [];
  const glowPieces: boolean[] = [];
  const glowRanges: [number, number][] = [];
  /** The vertex arrays of the frame's buffer and of the store's, the two buffers, and the store's floats sent and room. */
  let [main, kept, frameBuf, held, none] = [{}, {}, {}, {}, {}] as [
    WebGLVertexArrayObject,
    WebGLVertexArrayObject,
    WebGLBuffer,
    WebGLBuffer,
    WebGLVertexArrayObject,
  ];
  let [sent, roomy] = [0, 0];
  /** The texture of the store's data (store.ts, unit 4), its rows, and the floats of `data` it holds. */
  let [flesh, rows, read] = [{} as WebGLTexture, 0, 0];
  /** The frame's pieces, drawn after the frame's own vertices in every pass; in a `depth` pass, not the thin ones. */
  const place = (depth = false) => {
    let glow = false;
    for (let i = 0; i < pieces.length; i++) {
      const { m, q, t, k, f, w, h, s } = pieces[i];
      if (!depth && glow !== !!glowPieces[i]) {
        glow = !glow;
        uni('uniform1f', 'Gp', +glow);
      }
      if (depth && s) {
        continue;
      }
      uni('uniform1f', 'Ak', +(w ?? 0));
      if (f) {
        // Posed by the shader from its texels: no vertex array.
        gl.bindVertexArray(none);
        uni('uniform1i', 'Sm', f.kind);
        uni('uniform1f', 'Ss', f.seed ?? 0);
        // The skin's last: 2 its chitin (CHITIN), 3 a woven suit (WEAVE), 4 the ninja's plated armour (quilted on the trunk, Wa + 4), else whether an armour is plated.
        uni('uniform4i', 'Sb', ...f.at, f.chitin ? 2 : f.woven ? 3 : f.quilt ? 4 : +!!f.plate);
        uni('uniform4fv', 'Sq', f.d);
        uni('uniform3fv', 'Sp', f.pal);
        uni('uniform4fv', 'Sw', f.face);
        uni('uniform3fv', 'Sc', [...(f.plate ?? [0, 0, 0]), ...(f.accent ?? [0, 0, 0])]);
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
        uni('uniform1i', 'Sm', 0);
      } else {
        gl.bindVertexArray(kept);
        uni('uniform4fv', 'R', [...q, ...t, k]);
        if (h) {
          // Close hair, coloured and swayed by the shader (mode 3, swayOf()).
          uni('uniform1i', 'Sm', 3);
          uni('uniform3fv', 'Hc', h.rgb);
          uni('uniform4f', 'Hs', ...h.sw, h.t);
        }
        gl.drawArrays(gl.TRIANGLES, m.first, m.count);
        if (h) {
          uni('uniform1i', 'Sm', 0);
        }
      }
    }
    if (glow) {
      uni('uniform1f', 'Gp', 0);
    }
    uni('uniform1f', 'Ak', 0);
    uni('uniform4fv', 'R', STILL);
    gl.bindVertexArray(main);
  };

  /** (Re)allocates the buffer at cap bytes and puts the level back at its head. */
  const alloc = () => {
    gl.bufferData(gl.ARRAY_BUFFER, cap, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(ground));
  };

  const link = (vert: string, frag: string, names: string[]) => {
    const prog = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vert],
      [gl.FRAGMENT_SHADER, frag],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    return [
      prog,
      Object.fromEntries(names.map(n => [n, gl.getUniformLocation(prog, n)!])),
    ] as const;
  };

  /** A w x h texture with a framebuffer to draw into it, in `format` (the scene's by default). */
  const target = (w: number, h: number, format = fmt): Target => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    owned.push(
      () => gl.deleteTexture(t),
      () => gl.deleteFramebuffer(f),
    );
    return { t, f, w, h };
  };

  /** (Re)builds the offscreen targets for a w x h frame. */
  const targets = (w: number, h: number) => {
    owned.splice(0).forEach(free => free());
    made = [w, h];
    hdr = target(w, h);
    // The globe keeps its alpha: the crater fades into it by that share (Og in FRAG).
    orb = !moonly(world.def) ? undefined : target((w + 1) >> 1, (h + 1) >> 1, wide);
    // The blurs keep 16-bit floats: at 11 and 10 bits their sums moved the halos by up to 15 levels.
    bloom = [1, 2, 3].map(i =>
      [0, 1].map(() => target(w >> i || 1, h >> i || 1, wide)),
    ) as typeof bloom;
    const rb = (format: number) => {
      const r = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, format, w, h);
      owned.push(() => gl.deleteRenderbuffer(r));
      return r;
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, (msaa = gl.createFramebuffer()));
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb(fmt));
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      rb(gl.DEPTH_COMPONENT24),
    );
    owned.push(() => gl.deleteFramebuffer(msaa));
  };

  /** Puts the targets `to` in place of the frame's, and returns the frame's: a new set has none built. */
  const swapTargets = (to?: Targets): Targets => {
    const was = { made, hdr, orb, bloom, msaa, owned };
    ({ made, hdr, orb, bloom, msaa, owned } = to ?? { ...was, made: [0, 0], owned: [] });
    return was;
  };

  /**
   * One pass of the post program: mode z and tap step (x, y), reading the sources on units 0 up and
   * drawing into `to` (the canvas when undefined).
   */
  const pass = (to: Target | undefined, z: number, x: number, y: number, ...from: Target[]) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, to?.f ?? null);
    gl.viewport(0, 0, to?.w ?? made[0], to?.h ?? made[1]);
    from.forEach((src, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, src.t);
    });
    gl.uniform4f(pu.Y, x, y, z, performance.now() % 1e4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Everything GL owns goes with a lost context: set it all up again on restore.
  const setup = () => {
    // Without it the scene can only be 8-bit: lights above 1 clip instead of reaching the post pass.
    // Three floats of 11, 11 and 10 bits, no alpha: half the bytes of RGBA16F for each of the 4
    // samples a pixel the scene writes, resolves and blurs. Nothing reads the scene's alpha back.
    const linear = !!gl.getExtension('EXT_color_buffer_float');
    fmt = linear ? gl.R11F_G11F_B10F : gl.RGBA8;
    wide = linear ? gl.RGBA16F : gl.RGBA8;
    owned.length = 0;
    made = [0, 0];
    asides.clear();
    [post, pu] = link(POST_VERT, POST_FRAG, ['S', 'Y', 'L', 'Dp']);
    gl.uniform1iv(pu.S, [0, 1, 2, 3]);
    sighted.forEach(v => gl.deleteProgram(v.p));
    sighted.clear();
    vision = false;
    make = (kind, names = UNIFORMS, sight = false) => {
      const [p, l] = link(VERT, fragOf(world.def, kind, d.rock, sight), names);
      return { p, u: l, sent: new Map(), kind };
    };
    const variant = (kind: string, names = UNIFORMS) => make(kind, names);
    [land, bodies, globed, shade] = [
      variant('LAND'),
      variant('FLESH'),
      moonly(world.def) ? variant('ORB') : undefined,
      // The vertex shader's uniforms alone: the depth's fragment shader reads none.
      variant('DEPTH', DEPTH_UNIFORMS),
    ];
    live = undefined;
    use(land);
    uni('uniform1i', 'D', 1);
    uni('uniform1i', 'Og', 2);
    uni('uniform1i', 'Pl', 5);
    uni('uniform1i', 'Fp', 6);
    // Unit 6: the footprints' map (prints.ts), bound for good.
    gl.activeTexture(gl.TEXTURE6);
    prints = createPrints(gl, world);
    uni('uniform1i', 'Bx', 7);
    // Unit 7: the boxes the glass and the steel mirror (mirrorUpload()), read by texelFetch. Empty until the first frame knows the eye.
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, (mirrorTex = gl.createTexture()));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
    uni('uniform1i', 'Bn', 0);
    mirrorAt = undefined;
    // Unit 5: the chitin's plates (plates()), read in the skin's rest space; it repeats (REPEAT, the default).
    const pn = PLATES * PLATE_TEXELS;
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_3D, gl.createTexture());
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, pn, pn, pn, 0, gl.RED, gl.UNSIGNED_BYTE, plates());
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    uni('uniform4fv', 'R', STILL);
    // The crater's bound: its centre and one over its half axes, for the relief's edge fading into the globe.
    const b = world.relief?.bound ?? [0, 0, 1, 1];
    uni('uniform4f', 'Cb', b[0], b[1], 1 / b[2], 1 / b[3]);
    // The moon's stars and craters, drawn by the shader.
    uni('uniform1f', 'Sn', +(world.def.scenery === 'moon'));
    uni('uniform1i', 'Sg', 4);
    // The store's data, read by texel: sent again whole on a new context.
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, (flesh = gl.createTexture()));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
    [rows, read] = [0, 0];
    none = gl.createVertexArray();
    const layout = () =>
      [3, 3, 4].reduce((at, size, i) => {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE * 4, at * 4);
        return at + size;
      }, 0);
    // The store's pieces: sent again whole on a new context.
    gl.bindVertexArray((kept = gl.createVertexArray()));
    gl.bindBuffer(gl.ARRAY_BUFFER, (held = gl.createBuffer()));
    layout();
    [sent, roomy] = [0, 0];
    gl.bindVertexArray((main = gl.createVertexArray()));
    gl.bindBuffer(gl.ARRAY_BUFFER, (frameBuf = gl.createBuffer()));
    alloc();
    layout();
    // Unit 1: the sun's depth layer, then one per shadowed light, compared in the shader (linear: a 2x2 PCF per tap).
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, (shadows = gl.createTexture()));
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, MAX_SHADOWS + 1);
    for (const [name, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE],
    ]) {
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, name, value);
    }
    // No colour attachment: the depth passes write nothing but depth.
    gl.bindFramebuffer(gl.FRAMEBUFFER, (depth = gl.createFramebuffer()));
    gl.drawBuffers([gl.NONE]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.polygonOffset(2, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, gl.createTexture());
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA8,
      SIZE,
      SIZE,
      LAYERS,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    }
    gl.enable(gl.DEPTH_TEST);
    // The sky sits at depth 1, the clear value.
    gl.depthFunc(gl.LEQUAL);
    climate();
    const [w, h] = size();
    if (w && h) {
      targets(w, h);
    }
  };

  /** The world's fog, daylight, sun and tint palette, and the clear colour (the horizon's), into the program. */
  const climate = () => {
    const tints = palette(city(world));
    uni('uniform4fv', 'F', fogOf(world.def));
    uni('uniform1f', 'U', fogRef(world.def));
    uni('uniform3fv', 'H', daylight(world.def).flat());
    uni('uniform3fv', 'O', sunDir);
    uni('uniform3fv', 'X', sun.color);
    uni(
      'uniform3fv',
      'G',
      Float32Array.from({ length: MAX_TINTS * 3 }, (_, i) => tints[(i / 3) | 0]?.[i % 3] ?? 1),
    );
    gl.clearColor(...sky[1], 1);
  };
  setup();

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    setup();
    lost = false;
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const api: Renderer = {
    frame(
      eye,
      yaw,
      pitch,
      others,
      colors,
      fx,
      lights,
      body,
      ctf,
      tracer,
      rovers = [],
      self,
      more,
      view,
    ) {
      const [w, h] =
        posing && poseAt
          ? poseAt
          : view
            ? backing(view.width, view.height, devicePixelRatio)
            : size();
      if (lost || !w || !h) {
        return false;
      }
      // A picture is drawn into a corner of the screen as it is (portrait()).
      if (!(posing && poseAt) && (canvas.width != w || canvas.height != h)) {
        canvas.width = w;
        canvas.height = h;
      }
      if (made[0] != w || made[1] != h) {
        targets(w, h);
      }
      const tan = Math.tan(((FOV_DEG + fx.fov) * Math.PI) / 360);
      vp = viewProj(eye, yaw, pitch, w / h, fx.roll, tan);
      // How far the eye is under the sea's sheet (the map's water, drawn a LIFT over it), over a hand's breadth.
      under =
        world.def.water === undefined
          ? 0
          : Math.min(Math.max((world.def.water + 0.05 - eye[1]) / 0.1, 0), 1);
      // The frame's vertices, into the store the last frame left.
      v.length = 0;
      pieces.length = 0;
      const now = (view?.now ?? performance.now()) / 1000;
      // Radio and menu portraits share the renderer, but have their own animation.
      const dt = posing ? 0 : Math.max(0, Math.min(0.1, now - (clock ?? now)));
      if (!posing) {
        clock = now;
      }
      // The own player, seen from outside his head, is one of the crowd.
      const crowd = self ? [...others, self] : others;
      // A picture's runner moves on by its own time (poseDt); the scene's drops and dust wait.
      animate(runners, crowd, posing ? poseDt : dt, world, tracer, rovers, builds, looks);
      // Each footfall since the last frame, of the others and of the own body, into the soil.
      if (prints && !posing) {
        for (const r of runners.values()) {
          prints.feed(r.gait.plant);
        }
        if (body) {
          prints.feed(body.plant);
        }
      }
      const [right, up, fwd] = basis(yaw, pitch, fx.roll);
      drive(v, eye, fwd, Date.now() / 1000, pieces);
      // The spent batteries and capsules falling to the floor.
      fall(dt);
      drawDrops(v);
      ctf?.bases.forEach((at, team) => base(v, at, teamRgb(team), now));
      racks(v, ctf?.racks, ctf?.blades, now, ctf?.rails, ctf?.rifles, pieces, ctf?.rackSet);
      ctf?.packs?.forEach(at => kit(v, at, now));
      ctf?.ammo?.forEach(at => cell(v, at, now));
      ctf?.cells?.forEach(at => battery(v, at, now));
      ctf?.vests?.forEach(at => vest(v, at, now, pieces));
      more?.(v);
      // The rovers, then the ships: of each kind the first half of the map's are red's, the others
      // blue's. The wheels turn by the way the rover went along its nose since the last frame.
      const cars = rovers.filter(r => !r.ship);
      const ships = rovers.filter(r => r.ship);
      cars.forEach((r, i) => {
        spins[i] = (spins[i] ?? 0) + (was[i] ? rolled(...was[i], r) : 0);
        was[i] = [r.x, r.z];
        const d = Math.hypot(r.x - eye[0], r.y - eye[1], r.z - eye[2]);
        rover(
          v,
          r,
          world,
          spins[i],
          teamRgb(+(i >= cars.length / 2)),
          d < ROVER_NEAR ? 2 : +(d < ROVER_MID),
          i,
        );
      });
      ships.forEach((r, i) => {
        const d = Math.hypot(r.x - eye[0], r.y - eye[1], r.z - eye[2]);
        craft(
          v,
          r,
          teamRgb(+(i >= ships.length / 2)),
          now,
          d < SHIP_NEAR ? 2 : +(d < SHIP_MID),
          cars.length + i,
        );
      });
      // The dust off their wheels is smoke: it casts nothing wherever it is in the list.
      dust.update(cars, world, dt, eye);
      dust.draw(v);
      // A carried flag is strapped to its carrier's chest.
      const chests = new Map<number, [Vec3, Quat]>();
      const own = colors.get(body?.id ?? self?.id ?? -1);
      glowRanges.length = 0;
      glowPieces.length = 0;
      for (const p of crowd) {
        const flash =
          !posing && keen && !p.down && !p.lock && p.hp <= GLORY_HP && colors.get(p.id) !== own;
        const start = v.length;
        const firstPiece = pieces.length;
        const d = Math.hypot(p.x - eye[0], p.z - eye[2]);
        const s = soldier(
          v,
          runners.get(p.id)!,
          rgb(colors.get(p.id) ?? '#888'),
          d < CLOSE ? 3 : +(d < NEAR),
          world.def.helmets,
          !!world.def.armor,
          pieces,
        );
        if (flash) {
          if (v.length > start) {
            glowRanges.push([start, v.length]);
          }
          for (let i = firstPiece; i < pieces.length; i++) {
            glowPieces[i] = true;
          }
        }
        if (s) {
          // A space suit's pack is on the back: the flag is strapped on the pack, further back.
          const [c, q] = [s.pos[JOINT.CHEST], s.rot[JOINT.CHEST]];
          const back = world.def.helmets ? turn(q, [0, 0, PACK.r[2] * 2]) : [0, 0, 0];
          chests.set(p.id, [[c[0] + back[0], c[1] + back[1], c[2] + back[2]], q]);
        }
      }
      ctf?.flags.forEach(f => flag(v, f, teamRgb(f.team), now, f.by && chests.get(f.by.id)));
      tracer?.solids(v);
      // What glows casts nothing: it comes after the last thing that casts a shadow.
      const beamAt = v.length;
      tracer?.draw(v, eye);
      for (const p of crowd) {
        runners.get(p.id)?.trail.draw(v);
      }
      const bodyAt = v.length;
      bodyPieces.length = 0;
      body?.draw(v, eye, yaw, pitch, fx.roll, rgb(colors.get(body.id) ?? '#888'), bodyPieces);
      if (tail + v.length * 4 > cap) {
        cap = tail + v.length * 8;
        alloc();
      }
      // Into the same floats every frame: a new array of some two million a frame was a pause of its own.
      if (floats.length < v.length) {
        floats = new Float32Array(v.length * 2);
      }
      floats.set(v.a.subarray(0, v.length));
      gl.bufferSubData(gl.ARRAY_BUFFER, tail, floats.subarray(0, v.length));
      // The pieces made since the last frame, to the store's buffer (all of it when it has grown).
      if (sent < filled) {
        gl.bindBuffer(gl.ARRAY_BUFFER, held);
        if (roomy == stored.length) {
          gl.bufferSubData(gl.ARRAY_BUFFER, sent * 4, stored.subarray(sent, filled));
        } else {
          gl.bufferData(gl.ARRAY_BUFFER, stored, gl.STATIC_DRAW);
          roomy = stored.length;
        }
        sent = filled;
        gl.bindBuffer(gl.ARRAY_BUFFER, frameBuf);
      }
      // The data made since the last frame, by whole rows of 2048 texels (all of it when it has grown).
      if (read < used) {
        const row = TEXELS * 4;
        const need = Math.ceil(used / row);
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, flesh);
        if (need > rows) {
          // Room to grow, within the 2048 rows every WebGL2 allows (every skin and armour is some 1000).
          rows = Math.max(need, Math.min(need * 2, 2048));
          const all = new Float32Array(rows * row);
          all.set(data.subarray(0, used));
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEXELS, rows, 0, gl.RGBA, gl.FLOAT, all);
        } else {
          const from = Math.floor(read / row);
          const part = new Float32Array((need - from) * row);
          part.set(data.subarray(from * row, used));
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, from, TEXELS, need - from, gl.RGBA, gl.FLOAT, part);
        }
        gl.activeTexture(gl.TEXTURE0);
        read = used;
      }
      // The headlights of the rovers that are driven, after the lights given.
      // Only the lights that reach into the view: the GPU pays for each on every fragment, and a
      // spot's cone lies inside the sphere of its range as a point's light does.
      lit.length = 0;
      for (const l of lights) {
        if (inView(vp, l.p, l.range)) {
          lit.push(l);
        }
      }
      for (const l of beams(rovers.filter(r => !r.ship))) {
        if (inView(vp, l.p, l.range)) {
          lit.push(l);
        }
      }
      const pk = pack(lit);
      const first = ground.length / STRIDE;
      const sunM = sunProj(sunDir, sunAt(eye, yaw));
      // The footprints' map follows the eye; a portrait's eye is elsewhere and leaves it be.
      if (prints && !posing) {
        prints.pass(dt, eye[0], eye[2]);
        gl.bindVertexArray(main);
        // A stamped print leaves its own queue bound: the next frame's vertices would go into it,
        // be refused for its size, and the bodies be drawn from the frame before the first step.
        gl.bindBuffer(gl.ARRAY_BUFFER, frameBuf);
        live = undefined;
        use(land);
      }
      // Layer 0: the sun, once; then one layer per mapped light.
      uni('uniform1f', 'Z', -1);
      // Unit 1 is unbound meanwhile: sampling a map the framebuffer writes is a feedback loop.
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, depth);
      gl.viewport(0, 0, SHADOW, SHADOW);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      use(shade);
      for (let i = 0; i <= pk.maps; i++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, shadows, 0, i);
        const lm = i ? pk.m.subarray(i * 16 - 16, i * 16) : sunM;
        uni('uniformMatrix4fv', 'm', false, lm);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        map(lm);
        gl.drawArrays(gl.TRIANGLES, opaque, first - opaque + beamAt / STRIDE);
        place(true);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      use(land);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, shadows);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
      gl.viewport(0, 0, w, h);
      uni('uniformMatrix4fv', 'm', false, vp);
      uni('uniformMatrix4fv', 'W', false, sunM);
      if (prints) {
        uni('uniform2f', 'Fc', prints.cx, prints.cz);
      }
      uni('uniform3fv', 'E', eye);
      if (
        mirrored &&
        (!mirrorAt || Math.hypot(eye[0] - mirrorAt[0], eye[2] - mirrorAt[1]) > MIRROR_STEP)
      ) {
        mirrorUpload(eye[0], eye[2]);
      }
      uni('uniform1f', 'T', now);
      uni('uniform1f', 'Z', 1);
      // Xenomorph vision uses enemy positions to reveal them through walls.
      const activeHunterMode = seeing ? 0 : hunterMode;
      const prey = seeing
        ? crowd.filter(p => !p.down && colors.get(p.id) !== own)
        : activeHunterMode
          ? [...hunterTargets, ...(activeHunterMode === 1 ? hunterCold : [])].filter(p => !p.down)
          : [];
      prey.length = Math.min(prey.length, 16);
      see(!!(seeing || activeHunterMode));
      uni('uniform1i', 'Vn', seeing || activeHunterMode ? prey.length + 1 : 0);
      uni('uniform1i', 'Hv', activeHunterMode);
      if (prey.length) {
        uni(
          'uniform4fv',
          'Ve',
          prey.flatMap(p => {
            const h = heightOf(p);
            const seen = [0.6, 0.95].some(k => !hidden(world, eye, [p.x, p.y + h * k, p.z]));
            // A cold one (thermal, a xenomorph) is told by its height 100 m too tall: all blue.
            const cold = activeHunterMode === 1 && hunterCold.includes(p) ? 100 : 0;
            return [p.x, p.y, p.z, seen ? h + 0.3 + cold : -h - 0.3 - cold];
          }),
        );
      }
      uni('uniform1i', 'Q', pk.n);
      uni('uniform4fv', 'A', pk.a);
      uni('uniform4fv', 'B', pk.b);
      uni('uniform4fv', 'K', pk.k);
      uni('uniformMatrix4fv', 'M', false, pk.m);
      // Over the edge of space the crater fades into the moon's globe, drawn with the sky.
      const high = posing || world.def.seam === undefined ? 0 : eye[1] - world.def.seam;
      // From a little height the globe is the ground past the relief's edge, where that edge fades.
      const low = posing || !world.relief ? 0 : clamp01((eye[1] - GLOBE_FROM) / GLOBE_IN);
      const globe = low > 0 || high > 0 ? Math.max(altitude(eye[1]), 1) / MOON_R : 0;
      const fade = clamp01(high / ORBIT_FADE);
      const edge = high > 0 ? 1 : low;
      uni('uniform4f', 'Ob', globe, fade, edge, 0);
      // The view ray of each pixel from the camera's axes, for the sky and the globe.
      const rays = [right.map(c => c * tan * (w / h)), up.map(c => c * tan), fwd].flat();
      // In the station's rooms space shows only through the hangar's mouths: the sky's pixels
      // elsewhere are behind a wall, and the GPU would still shade them (the globe's craters).
      const { station } = world.def;
      const sky =
        station && rooms(station).some(([lo, hi]) => eye.every((c, i) => c > lo[i] && c < hi[i]))
          ? cover(vp, mouths(station), w, h)
          : [0, 0, w, h];
      // The globe at half the frame's size, read by the sky and the crater fading into it on unit 2
      // (the composite of the last frame left it empty): its craters, shaded on every pixel, were
      // two thirds of a frame's GPU looking down from orbit, 38 ms at 320 m.
      if (globe && orb && sky && globed) {
        gl.activeTexture(gl.TEXTURE2);
        use(globed);
        uni('uniform3fv', 'J', rays);
        uni('uniform1f', 'Y', 2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, orb.f);
        gl.viewport(0, 0, orb.w, orb.h);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(sky[0] >> 1, sky[1] >> 1, (sky[2] >> 1) + 2, (sky[3] >> 1) + 2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.SCISSOR_TEST);
        uni('uniform1f', 'Y', 0);
        use(land);
        gl.bindTexture(gl.TEXTURE_2D, orb.t);
        gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (heavensN) {
        // The Earth goes with the eye, so it is as far as the stars, and never fades into the globe.
        const sky0 = first - heavensN;
        map(vp);
        const [x, y, z] = d.heavens ?? [0, 0, 0];
        uni('uniform4fv', 'R', [0, 0, 0, 1, eye[0] - x, eye[1] - y, eye[2] - z, 1]);
        uni('uniform4f', 'Ob', globe, fade, edge, 1);
        gl.drawArrays(gl.TRIANGLES, sky0, heavensN);
        uni('uniform4fv', 'R', STILL);
        uni('uniform4f', 'Ob', globe, fade, edge, 0);
      } else {
        map(vp);
      }
      // What moves, with the code of its own materials and none of the map's (fragOf()).
      if (bodyAt || pieces.length) {
        moving();
        if (bodyAt) {
          let start = 0;
          for (const [a, b] of glowRanges) {
            gl.drawArrays(gl.TRIANGLES, first + start / STRIDE, (a - start) / STRIDE);
            uni('uniform1f', 'Gp', 1);
            gl.drawArrays(gl.TRIANGLES, first + a / STRIDE, (b - a) / STRIDE);
            uni('uniform1f', 'Gp', 0);
            start = b;
          }
          gl.drawArrays(gl.TRIANGLES, first + start / STRIDE, (bodyAt - start) / STRIDE);
        }
        place();
        still();
      }
      if (seaN) {
        // The sea over what stands in it: first what it lets through, multiplied into the frame
        // and leaving the depth alone, then the light it adds (WATER in shore.ts).
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
        gl.depthMask(false);
        uni('uniform1f', 'Z', 2);
        gl.drawArrays(gl.TRIANGLES, first - seaN, seaN);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(true);
        uni('uniform1f', 'Z', 1);
        gl.drawArrays(gl.TRIANGLES, first - seaN, seaN);
        gl.disable(gl.BLEND);
      }
      // The sky after the world, at depth 1: shaded only where nothing stands in front of it.
      uni('uniform3fv', 'J', rays);
      uni('uniform1f', 'Y', 1);
      if (sky) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(sky[0], sky[1], sky[2], sky[3]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.SCISSOR_TEST);
      }
      uni('uniform1f', 'Y', 0);
      if (glassN && seen(panes, vp, paned)) {
        // The canopy over what is seen through it, as the sea: what it lets through multiplied
        // into the frame, then the light it adds; it writes no depth.
        gl.enable(gl.BLEND);
        gl.depthMask(false);
        gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
        uni('uniform1f', 'Z', 2);
        gl.drawArrays(gl.TRIANGLES, first - seaN - smokeN - glassN, glassN);
        gl.blendFunc(gl.ONE, gl.ONE);
        uni('uniform1f', 'Z', 1);
        gl.drawArrays(gl.TRIANGLES, first - seaN - smokeN - glassN, glassN);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      if (smokeN) {
        // The smoke over all of it, its colour already times its alpha; a flame has none and adds.
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, first - seaN - smokeN, smokeN);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      if (v.length > bodyAt || bodyPieces.length) {
        // Last, over a cleared depth: the body never sinks into a wall.
        gl.clear(gl.DEPTH_BUFFER_BIT);
        // The own body keeps the vision's filter but lists no enemy: standing inside an enemy's
        // cylinder, its arms and weapon would glow as his (the user, 2026-11-24).
        if (prey.length) {
          uni('uniform1i', 'Vn', 1);
        }
        moving();
        if (v.length > bodyAt) {
          gl.drawArrays(gl.TRIANGLES, first + bodyAt / STRIDE, (v.length - bodyAt) / STRIDE);
        }
        if (bodyPieces.length) {
          gl.bindVertexArray(kept);
          for (const { m, q, t, k, w } of bodyPieces) {
            uni('uniform1f', 'Ak', +(w ?? 0));
            uni('uniform4fv', 'R', [...q, ...t, k]);
            gl.drawArrays(gl.TRIANGLES, m.first, m.count);
          }
          uni('uniform1f', 'Ak', 0);
          uni('uniform4fv', 'R', STILL);
          gl.bindVertexArray(main);
        }
        still();
        if (prey.length) {
          uni('uniform1i', 'Vn', prey.length + 1);
        }
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaa);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, hdr.f);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.useProgram(post);
      // The bright parts at half size, then each level blurred along x into its scratch and back
      // along y; the next level reads the last one, so each is blurrier and half the size.
      pass(bloom[0][0], 0, 1 / w, 1 / h, hdr);
      bloom.forEach(([a, b], i) => {
        pass(b, 1, 1 / b.w, 0, bloom[i && i - 1][0]);
        pass(a, 1, 0, 1 / a.h, b);
      });
      gl.uniform1f(pu.L, fx.lines);
      // Under the sea's surface: tinted and a little blurred (the step between pixels is Y.xy).
      gl.uniform1f(pu.Dp, under);
      pass(undefined, 2, 1 / w, 1 / h, hdr, ...bloom.map(l => l[0]));
      // Units 1 to 3 hold the blurs, which the next frame draws into.
      for (let i = 3; i > 0; i--) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      gl.activeTexture(gl.TEXTURE0);
      live = undefined;
      use(land);
      return true;
    },
    project: (x, y, z) => project(vp, x, y, z),
    steps: id => runners.get(id)?.gait.steps,
    muzzle: id => runners.get(id)?.tip,
    wear: (b, l = new Map()) => {
      [builds, looks] = [b, l];
      // Her skins and their armour now, as the man's are built at the start: not in a frame of the match.
      new Set(b.values()).forEach(k => k && dressed(k));
      for (const look of l.values()) {
        // The programs of their vision, linked now rather than on the frame it is switched on.
        if (look.role === ROLE.XENO || look.role === ROLE.HUNTER) {
          sightOf(land);
          sightOf(bodies);
        }
      }
      for (const look of l.values()) {
        if (look.role === ROLE.HUNTER) {
          warmHunter();
          break;
        }
      }
    },
    vision: on => (seeing = on),
    hunterVision: (mode, targets, cold = []) => {
      hunterMode = mode;
      hunterTargets = targets;
      hunterCold = cold;
    },
    edge: on => (keen = on),
    parried: (id, late) => {
      const r = runners.get(id);
      if (r) {
        // At its block as the ball meets the blade where he is drawn, `late` s behind.
        r.parry = PARRY_IN - late;
      }
    },
    cheer: ids =>
      ids.forEach(id => {
        const r = runners.get(id);
        if (r) {
          r.grin = GRIN;
        }
      }),
    portrait(into, p, build, color, look, inputShot = PORTRAIT) {
      const card = into.getContext('2d');
      if (lost || !card || !size()[1]) {
        return false;
      }
      if (look?.role === ROLE.HUNTER) {
        warmHunter();
      }
      // The complete Hunter model is taller than a standard runner, so keep its mask and boots in
      // the portrait frame together.
      const shot =
        look?.role === ROLE.HUNTER ? { ...inputShot, eye: 1.19, away: 4.6, turn: -0.1 } : inputShot;
      // A runner of his own, with the player's id (his face and hair), standing still far above the map.
      const [crowd, worn, styled] = [runners, builds, looks];
      [runners, builds, looks] = [
        new Map(),
        new Map([[p.id, build]]),
        new Map([[p.id, look ?? {}]]),
      ];
      // The sun on one side of him and the camera on the same one, nearer his front: no glare off the chest.
      const face = Math.atan2(-sunDir[0], -sunDir[2]) + shot.sun;
      const key = `${p.id} ${build} ${color} ${JSON.stringify(look ?? {})} ${JSON.stringify(shot)}`;
      const at = performance.now() / 1000;
      const kept = posed.get(into);
      const again = kept?.key === key;
      // He stands where he was first drawn: the player moving under the menu does not walk him.
      const model: PlayerState = again
        ? kept.model
        : {
            ...p,
            ...{ y: shot.y, vx: 0, vy: 0, vz: 0, yaw: face + (shot.spin ?? 0), pitch: 0 },
            ...{ mode: MODE.GROUND, t: 0 },
            ...{ down: 0, stun: 0, swing: 0, ev: 0, fall: 0, held: 0 },
            // Empty handed.
            ...{
              ammo: -1,
              blade: false,
              wield: false,
              rail: -1,
              rifle: -1,
              railed: false,
              rifled: false,
            },
            // The Hunter's picture shows all he can find, carried, the hands free (the fists:
            // nothing in hand): his weapons are on him only once found (soldier.ts).
            ...(look?.role === ROLE.HUNTER && HUNTER_GEAR),
            ...shot.hold,
          };
      // At ease, the arms down: no fighter's guard. The xenomorph is never at ease: it threatens.
      const r = again ? kept.r : createRunner(model, undefined, build, look ?? {}, true);
      posed.set(into, { key, r, model, at });
      if (!again) {
        r.menace = look?.role === ROLE.XENO;
        if (shot.grin) {
          // Eased in at once: a moment of the face's time, under its first blink's half second.
          r.grin = GRIN;
          r.dt = 0.35;
        }
      }
      runners.set(p.id, r);
      const [a, d] = [face + shot.turn, shot.away];
      const eye: Vec3 = [
        model.x - Math.sin(a) * d + Math.cos(a) * shot.side,
        shot.y + shot.eye,
        model.z - Math.cos(a) * d - Math.sin(a) * shot.side,
      ];
      const lens = { fov: shot.fov - FOV_DEG, roll: 0, lines: 0 } as Effects;
      // A picture, not the view: never through the xenomorph's eyes.
      const shoot = () => {
        const saw = seeing;
        seeing = false;
        api.frame(eye, a + Math.PI, 0, [model], new Map([[p.id, color]]), lens, []);
        seeing = saw;
      };
      // Drawn at the card's size (a small one, as a haircut's, at PICTURE_MIN pixels high), within
      // the screen: its targets and the screen's bottom left corner, which the next frame paints over.
      // The loading screen draws pictures before any frame has sized the canvas.
      const [sw, sh] = size();
      if (canvas.width != sw || canvas.height != sh) {
        canvas.width = sw;
        canvas.height = sh;
      }
      const fit = Math.min(
        Math.max(1, PICTURE_MIN / into.height),
        canvas.width / into.width,
        canvas.height / into.height,
      );
      const [pw, ph] = [Math.floor(into.width * fit), Math.floor(into.height * fit)];
      const sized = `${pw}x${ph}`;
      const frame = swapTargets(asides.get(sized));
      poseAt = [pw, ph];
      // A new runner twice: the first frame makes him, the second draws him settled. One drawn again
      // once, moved on by the time since (a tenth of a second at most). High as he is, no orbit.
      posing = true;
      poseDt = again ? Math.min(0.1, Math.max(0, at - kept.at)) : 0;
      shoot();
      if (!again) {
        shoot();
      }
      posing = false;
      poseDt = 0;
      poseAt = undefined;
      asides.set(sized, swapTargets(frame));
      [runners, builds, looks] = [crowd, worn, styled];
      // GL counts rows from the bottom, the 2D canvas from the top.
      card.drawImage(canvas, 0, canvas.height - ph, pw, ph, 0, 0, into.width, into.height);
      return true;
    },
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
  return api;
};
