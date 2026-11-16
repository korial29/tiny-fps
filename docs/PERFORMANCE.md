# Performance

What a frame costs, where it went, and the rules every change has to keep. Written after the
audit of 2026-11-14 (the user: lags in a match). Read it before adding anything that is drawn every
frame: a piece of a runner, of the own body, a prop, a vehicle.

## The budget

A frame at 60 Hz is 16.7 ms for everything: the client's JavaScript, the WebGL calls and the GPU.
The JavaScript that builds the frame's geometry has to stay well under it, **8 ms for a match
frame** (the own body, one runner near, eight far, the traffic), so that a slower laptop still
holds 60 Hz.

The host is not the problem: `Room.tick()` with one person and bots up to 10 costs 0.09 ms, half a
percent of its tick. Lag in this game comes from the client's frame.

## Where the time went

Every runner, the own body and the vehicles are rebuilt on the CPU each frame: the skin is skinned
in JavaScript (`skin()`), the armour is cut out of it (`armor()`), then hands, pads, guard, helmet,
guns are placed vertex by vertex into the frame's vertices (`v` in `Renderer.frame()`), which are
copied to a `Float32Array` and uploaded. The cost is per vertex, every frame, so it is the vertex
count that decides.

Measured in Node (same V8 as Chrome) on an M-series Mac, then checked in the browser pane:

| Measure                                         | Before                  | After               |
| ----------------------------------------------- | ----------------------- | ------------------- |
| Match frame, Highline (own body, 1 near, 8 far) | 43 ms                   | 9.7 ms              |
| Match frame, Tranquility                        | 34 ms                   | 8.9 ms              |
| Same frame in the browser (Chrome's V8)         | 33 ms                   | 9.3 ms              |
| In the game, browser pane, Highline, 8 bots     | 39.5 fps                | 60 fps (the screen) |
| The same: a frame's CPU (median, 90th)          | 23.4 ms, 28.7 ms        | 8.4 ms, 9.1 ms      |
| The same: a frame's GPU (median)                | 7.7 ms                  | 8.2 ms              |
| Own first-person body                           | 10.6 ms                 | 6.5 ms              |
| Ninja far away (lod 0)                          | 3.4 ms, 23 000 vertices | 11 000 vertices     |
| Ninja's hood (`dress()`), close                 | 8.9 ms                  | 3.1 ms              |
| Both hands, close                               | 5.1 ms                  | 0.8 ms              |
| First close marine's armour (`cook()`)          | 440 ms freeze mid-match | 290 ms, at map load |
| Her close hair, first of the five styles        | 373 ms freeze mid-match | 370 ms, at map load |

What made the difference, and is now a rule:

- **The guard and the shoulder pads had no level of detail.** A runner 30 m away drew 8 900
  vertices of guard and 6 000 of pads, more than his whole skin. They now take `far`.
- **The hands were built from scratch every frame**, ten thousand vertices of tubes and closures,
  though they change only when a grip does. They are now built once in the hand's own space per
  set of parameters (`hand()`'s cache) and only carried to the wrist.
- **`dress()` worked per triangle corner**: each skin vertex is the corner of about six triangles, so
  it did the same `atan2`, `turn()` and skull lookup six times. It now works once per vertex.
- **One-off work happened in a frame of the match.** An armour's recipe is cooked the first time a
  skin is drawn with it: 290 ms for the close one, the moment someone runs up to you.
- **Small allocations in loops over vertices**: `turn()` returning arrays, `for (const h of [k, k + 3])`,
  `const [a, b] = [x, y]` on fresh literals, `.map()` inside `push(...)`. Written out as scalars,
  the same arithmetic in the same order.
- **The frame's vertices were a `number[]` built afresh each frame.** Appending to a JS array that
  grows to millions costs about 4 ns a number (V8 copies it into ever larger stores), against 0.5 ns
  into a typed array; a match frame writes some 2 million. They now go into a `Verts` (`verts.ts`):
  a `Float64Array` that only grows, kept by the renderer from frame to frame, with a `length` that
  is the write cursor. That alone took the frame from 18 to 9.7 ms.

What is still to look at:

- **The GPU, on a weaker machine.** On an M-series Mac a frame takes about 8 ms of GPU at 1.9
  million pixels (the canvas is capped at `MAX_PIXELS`, 2.1 million), unchanged by this work: not
  the bottleneck there. Each shadow map (the sun's and each shadowed spot) draws the whole level,
  city and skyline included (216 000 vertices on Highline), then the scene draws everything once
  more at 4x MSAA in RGBA16F. On an integrated GPU, look there first.

## The audit of 2026-11-15

The game had gone back under 60 fps (the user: a new audit). Measured in Chrome with the real GPU
(an M2, 1728 by 1013, a local game with 8 bots), then each of the 21 commits since #253 in turn:

| Measure                          | #253   | Before the fix | After     |
| -------------------------------- | ------ | -------------- | --------- |
| Highline: frames a second        | 60     | 51 to 56       | 60        |
| Highline: a frame's GPU (median) | 7.1 ms | 15.8 to 17 ms  | 9.5–11 ms |
| Highline: a frame's CPU (median) | 6.7 ms | 13 to 18 ms    | 8.5 ms    |
| Tranquility: frames a second     | –      | 52 to 57       | 59 to 60  |
| Tranquility: a frame's GPU       | –      | 15.5 to 17 ms  | 14.6 ms   |

The GPU was the bottleneck, and two changes made it so. The CPU's time went up with it only
because the GL calls wait on a GPU that is behind.

- **The skin's texture (#269) worked out seven 3D noises on every pixel of the screen**, the city's
  included, though all of it was multiplied by `kb`, 0 off the skin. A shader does what it is told
  even when the result is multiplied by zero: 3.7 ms a frame. They now run under `if(kb>0.)`.
- **The moon's globe, stars, craters and orbit fade (#259) cost Highline 2.4 ms a frame** without
  ever running there: uniforms at 0 kept them from running, not from weighing on the program (its
  registers, so how many pixels the GPU shades at once). `fragOf()` compiles them in only for a map
  that has the moon (`#define MOON`, the blocks under `#ifdef MOON`).

The same frames before and after, time frozen, from the rooftop, the moon's ground and orbit, are
the same to the byte.

Still to do, found by the same audit:

- **Close hair is made the first time a woman comes within `CLOSE`**: 53 to 113 ms a style, in a
  frame of the match (rule 5), 412 ms for the five. `dressed()` should make them at the map's load.
- **Close hair is made the first time a woman comes within `CLOSE`**: done in #276, made at the
  map's load.
- **The own body is 70 % of a frame's JavaScript**: 4.1 ms (2.6 at #253), the marine's armour on
  it 73 000 vertices since #257. #277 works out each shared corner once: 2.3 ms.

### Tranquility in 2 v 2

The user had lag playing 2 v 2 on the moon after the fixes above. Running about a local game in
Chrome (the same M2), it ran at 50 to 54 frames a second with 47 to 62 pauses of 35 to 87 ms in
20 s. Standing still away from the bots, or on Highline, it was smooth.

The host is not it (a tick costs 0.18 ms there with 4 bots, none over 5 ms), and neither is the
upload of the frame's vertices, although `bufferSubData` led the profile: it only waited on a GPU
that was behind, and three buffers in turn changed nothing. The GPU was behind when astronauts came
near: three at 3 m took a frame from 14 to 36 ms. It was the pixels' cost (none at a quarter of
the pixels, none with flat shading) and the moon's own (three marines as close on Highline cost
nothing). The armour's wear (#267) and the stars in the sky that a reflection asks for (`K1(r,0.)`,
#259) cost next to nothing alone, but together they made the shader three times as dear. Taking
out either one was enough, which looks like a program too big for the GPU's registers.

The stars are now drawn only where the sky is asked for at a width (`px > 0`): the sky itself and
the orbit's fade, not a reflection, where they were a few dots on a visor. In the game, 2 v 2: 60
frames a second, no pause over 35 ms in three runs of 20 s, a frame's GPU 24-31 ms at the 90th
percentile down to 14 ms. Close up, 10 to 14 pixels in 400 000 change, by 22 levels at most.

## Moving the work to the GPU

The plan agreed on 2026-11-14 (the user), one step and one PR at a time, the size budget raised by
what each step costs:

1. **Rigid pieces through the store** (done): `store.ts` keeps a piece built once at the origin
   (`mesh()`); a frame lists where each one stands (`Pieces`: a turn, a place, a scale) and the scene's
   vertex shader places it (`R` in `VERT`), in the shadow passes and the scene alike. The runners'
   pads, collar, guard, helmets, pack, crotch panel, pouch and buckle go there (`soldier()`'s `list`,
   `pads()`'s). Without a list (the tests, the own body, a runner coming apart) the old path draws
   them into `out`, and `store.highline.test.ts` and `store.moon.test.ts` check both give the same triangles. Measured: 202 000 to
   159 000 vertices written a match frame, the frame's CPU 9.7 to 8.7 ms in the browser, the GPU's
   time the same.
2. **Guns, katana, cars, and the own hands** (done): the gun's and the rail gun's and the rifle's
   bodies and the katana's blade go through the store when lit (`held()`'s and `sword()`'s
   `list`; while one comes on, its glow is dimmed on the CPU and it stays in `out`), and so do the
   cars (`traffic()`'s drawer, one piece by paint). The runners' hands were already found in
   `hand()`'s cache; the own body's were not: a grip's curl eased onto its 0.9 wandered in its last
   bits frame to frame and built both hands again each time, so `hand()` rounds its numbers to a
   billionth. Measured in Node: Highline 8.9 to 8.0 ms, Tranquility 8.2 to 6.4 ms (medians), its
   spikes of 120 ms gone.
3. **The runners' skin and armour, in the vertex shader** (done for the marine and the astronaut):
   they go together, since `armor()` reads the skinned skin back. `flesh.ts` puts a skin's vertices
   (place, normal, joints, weight, shade, and the face's channels as records), its corners and the
   armour's vertices (their skin triangle, each corner's weights and distance, the swell's slope) in
   `store.ts`'s `data`, a float texture read by `texelFetch` with no vertex array; a frame sends a
   runner's 25 dual quaternions, his palette and his face's weights. `VERT`'s modes 1 and 2 are
   `skin()` and `armor()` for one vertex; `test/flesh.ts` is their twin in JavaScript, and
   `store.highline.test.ts` and `store.moon.test.ts` check it draws what the CPU draws: places within a tenth of a millimetre,
   colours as they are, a few armour walls' normals a degree or two off (slivers 1.5 mm tall whose
   own normal takes the floats' error). Measured in Node: Tranquility 5.9 to 3.8 ms a frame,
   Highline 7.0 to 6.3 ms (half the runners there being ninjas, still on the CPU).
4. **The ninja** (done): his hood (`dress()`) works out each head vertex from `scalp()`, too much
   for a shader, so `skinOf()` bakes it for each skin and each face's traits (a player's, constant):
   the skin at rest shaped by the traits, `dress()` on it, its pressed places taken as the rest's and
   its bare share kept per vertex (`hb` in `VERT`). The shader then adds only the expressions, none
   under the guard. `store.test.ts` holds every expression at its full, alone, within 0.1 mm of the
   CPU's (0.08 mm at most: the jaw stays behind the guard), and the hood's colour within a fraction of
   a level of 255. Measured in Node: Highline 6.2 to 4.0 ms a frame. The first build of it went
   through `skin()` with a plain array and slowed every `skin()` after it (the own body's too) by
   three milliseconds a frame: rule 9.

The own first-person body stays on the CPU: `relax()` smooths its shoulders once posed, which a
vertex shader cannot do. Its armour was most of its time (the audit of 2026-11-15: 3 of the
marine's 4 ms, 73 000 vertices): `armor()` worked out each triangle's three corners, and a corner
is shared by two or three triangles (73 000 corners, 26 600 distinct on the marine). It now works
out each distinct corner once (`shared()`, kept per wearer with the recipe), then writes the
triangles from them: the same floats, 4.0 to 2.3 ms for the marine, 1.5 to 1.2 ms for the ninja.
Leaving out the plates the eye never sees did not pay: drawn from the bots' states and the routes'
hangs and climbs at six pitches, the back plates and the shoulder blades do show (the camera sits
behind the head on a ledge), and what never showed (the belly's plate, the gusset, the hips' straps)
is 2.5 % of it.

## The xenomorph (2026-11-16)

An audit of the xenomorph (#279) found one runner of it five to twelve times dearer than an
astronaut, and up to fifteen people can play it on the moon. Measured in Node (`soldier()` with the
store's list, as in the game), one runner a frame, and the first frame of one in a fresh process:

| Measure                    | Before           | After            | Astronaut        |
| -------------------------- | ---------------- | ---------------- | ---------------- |
| Far (lod 0): CPU, vertices | 0.74 ms, 23 094  | 0.12 ms, 10 680  | 0.06 ms, 10 344  |
| Near (lod 1)               | 1.62 ms, 75 993  | 0.17 ms, 70 281  | 0.16 ms, 41 040  |
| Close (lod 3)              | 3.44 ms, 182 892 | 0.31 ms, 169 647 | 0.67 ms, 139 860 |
| Pieces drawn a pass        | 23               | 14 far, 17       | 9                |
| First frame of a close one | 104 ms           | 7 ms             |                  |
| Its own first-person body  | 2.9 ms           | 1.2 ms           | 2.9 ms           |

- **The spine and the neck's pipes were rebuilt every frame through `sheet()`**, which allocates per
  triangle: 60 % of its time. Both only follow joints, so the back's half of the spine and the pipes
  are baked into its skin (`backOf()` in `xeno.ts`, appended by `shape()`), each point on the two
  joints of the bones it lies between, and `flesh()` poses them. The tail stays on the CPU
  (`tail()`), written straight into `out`; its first ring is the skin's last, on the pelvis alone,
  so there is no crack.
- **Its rigid pieces were made on first sight**: 70 to 90 ms for the close skull. `partsOf()` lists
  them, one piece per joint where they were several, and `render.ts` makes them at the map's load.
  The skull works out each node of its grid once (it is the corner of six triangles), and its close
  grid is 50 by 72, packed harder round the eyes, where it was 64 by 92: the same steps round the
  orbits, a third fewer vertices.
- **Its far level kept most of the near one**: every rib row, every toe's knuckle and pad, the pipes.
  Far, every third row of ribs, the toes' digits and claws, no pipes; near, the veins' trunks alone.
  `soldier.kit.test.ts` holds the far one under 11 000 vertices and a quarter of the near one.
- **Hair-thin pieces cast no shadow**: a `Draw` with `s` (the veins, the teeth, the eyes' glow) is
  left out of the depth passes.
- **Its claws grew every hand vertex every frame**, about the wrist; `hand()` now grows its cached
  hand once (`grow`), hers too.

## Rules for every change

1. **Count the vertices of what you add, at every level.** A runner is drawn at lod 3 within 4 m
   (`CLOSE`), lod 1 within 10 m (`NEAR`), lod 0 beyond (`render.ts`); most runners in a match are
   lod 0. Any new piece on a runner takes the level (or a `far` flag) and its far version has about
   a quarter of the vertices or fewer. Say the counts in the PR. A test pins the far ninja under
   12 000 vertices (`soldier.test.ts`); keep it passing, lower it when you can.
2. **Build once, carry every frame.** A piece whose shape does not depend on the pose (pads, guard,
   hair, helmet, a gun) is built once at rest in its joint's space and only turned and moved per
   frame. A piece that depends on a few numbers (a hand on its curl) is cached by those numbers, rounded: an eased number wanders in its last bits and a key made of it misses every frame (the own hands did).
3. **Work per vertex, not per corner.** `skin()` writes three corners per triangle; anything that
   reads them back and computes from the position does it once per skin vertex (`s.t[h]`), as
   `dress()` does.
4. **No allocation inside a loop over vertices.** No array literals, destructuring of fresh arrays,
   `map`, `forEach` with closures, spread or `Math.hypot(...v)` there. Write the scalars out, one
   `const` each: `let [x, y, z] = [a, b, c]` reassigned in a loop is not optimised away (the pads
   took 40 % less once it was plain numbers). Write into `out` by index (`out[o] = …`) rather than
   `push(...)` with many arguments.
5. **Nothing over a few milliseconds in a frame of a match.** Anything built lazily on first use
   (skins, armour recipes, a model's mesh) is prepared when the map loads: `createRenderer()` for the
   man, `Renderer.wear()` for a build that appears in the roster. Time the first draw of what you add,
   not only the steady state.
6. **Write into the frame's `Verts`, never a new array.** A model takes `out: Out` (`number[] |
Verts`, `verts.ts`): `out.push(...)` for a few numbers, and for many, `const a = room(out, n)`
   (room for `n` numbers more), writes `a[w++] = …` from `w = out.length`, then `out.length = w`.
   Read back what is already there through `room(out, 0)`. Never keep `a` across a `push` or another
   model's call: the store may have moved. No `slice`, `splice`, `concat` or spread of the frame's
   vertices, and no temporary array per object to copy in afterwards.
7. **A runner's flesh goes through `flesh()`.** A new piece of the skin or the armour (a channel, a
   colour rule, a region) is written twice: in `skin()` or `armor()` and in `VERT`'s modes 1 and 2,
   and in `test/flesh.ts`, which the `store` tests hold to the CPU's output. A change to one alone
   shows as a runner that differs from the own body and the tests.
8. **A rigid piece goes through the store.** A piece that only follows a joint (no vertex of its
   own moving) is made once at the origin and drawn with `rigid()` in `soldier()` or a `list` of its
   own: its key names everything its vertices depend on (level, colours, build), never the pose. A
   piece that changes shape or colour each frame stays in `out`. Merge the pieces on one joint (one
   draw a pass each), make them at the map's load, and mark one too thin for a shadow (`thin`,
   `Draw.s`): the depth passes skip it.
9. **Hand a per-frame model only the frame's `Verts` in the game.** Tests pass plain arrays and that
   is fine there; in the game, if a plain array ever goes through the same index writes as the
   `Verts` (a mesh built once with `skin()`, say), V8 falls back to a generic path for good: the
   match frame went from 9.3 to 65 ms in Chrome after it happened once. That holds for what is built
   once too: `mesh()` and `skinOf()` build into a `Verts` of their own for that reason. The upload copies into one `Float32Array` kept from frame to frame (`floats`
   in `render.ts`); do not allocate one per frame or per object.
10. **A pure speed-up changes no pixel.** Prove it: draw the same runners and body before and after
    and compare every float (the method is below). A level of detail is a visual change: show it
    from the distance it is used at, magnified, before and after.
11. **Measure, do not guess.** Profile before optimising; the hot spot was never where it looked.
12. **A pixel pays for what it computes, not for what it keeps.** In the fragment shader, work that
    only some pixels need (the skin's, the armour's wear) goes under an `if` on what tells them
    apart; multiplying it by a factor that is 0 elsewhere still pays for it on every pixel.
13. **What a map does not have is not compiled in.** Code for one map only goes under an `#ifdef`
    that `fragOf()` defines for it (`MOON`), not behind a uniform at 0: unrun, it still slows the
    whole program. `render.test.ts` checks that Highline's shader has none of the moon's.

14. **Look at a frame with the runners up close, on every map.** A cost that only shows when a few
    of them fill the screen (a close fight) is missed by a frame of the map alone, and that is when
    the player feels it. Time the GPU at fixed views with three runners at 3 m, as below.

## How to measure

Scratch scripts, kept out of the repo (put them in your scratchpad or delete them before
committing). Bundle with esbuild so the profile keeps function names and lines:

```bash
npx esbuild src/bench.ts --bundle --platform=node --format=esm --outfile=/tmp/bench.mjs
node /tmp/bench.mjs
```

A match frame, in `src/bench.ts`:

```ts
import { MAPS } from './shared/maps';
import { build } from './shared/world';
import { spawn } from './shared/physics';
import { MODE } from './shared/types';
import { ROLE } from './shared/kit';
import { animate, soldier } from './client/soldier';
import type { Runner } from './client/soldier';
import { createBody } from './client/body';
import { Verts } from './client/verts';

const def = MAPS.highline;
const world = build(def);
const ps = Array.from({ length: 10 }, (_, i) => {
  const p = spawn(i + 1, world, i, i % 2);
  [p.vx, p.mode, p.ammo] = [3 + i, MODE.GROUND, 10];
  return p;
});
const book = new Map<number, Runner>();
const looks = new Map(ps.map((p, i) => [p.id, { role: i % 2 ? ROLE.NINJA : ROLE.MARINE }]));
const body = createBody(world);
const v = new Verts();
let floats = new Float32Array(0);
const frame = () => {
  animate(book, ps.slice(1), 1 / 60, world, undefined, [], new Map(), looks);
  v.length = 0;
  ps.slice(1).forEach((p, i) =>
    soldier(v, book.get(p.id)!, [0.9, 0.2, 0.1], i ? 0 : 1, false, true),
  );
  body.update(ps[0], 1 / 60, 0, 16 / 9);
  body.draw(v, [ps[0].x, ps[0].y + 1.6, ps[0].z], 0, 0);
  if (floats.length < v.length) {
    floats = new Float32Array(v.length * 2);
  }
  floats.set(v.a.subarray(0, v.length));
};
for (let i = 0; i < 60; i++) frame();
const t0 = performance.now();
for (let i = 0; i < 200; i++) frame();
console.log(((performance.now() - t0) / 200).toFixed(2), 'ms a frame');
```

- **Profile**: start `node:inspector/promises`' `Profiler` after the warm-up, write the profile to
  a `.cpuprofile` and sum self and inclusive time per function (or open it in Chrome's DevTools).
- **First-use cost**: time the first `soldier()` of each role, build and level, and the first
  `body.draw()`, in a fresh process.
- **Same pixels**: run the same runners (every role, both builds, every level, gun, katana, bare
  hands, both maps) and the own body, save every float to a file, change the code, run again and
  compare. A pure refactor must match exactly (worst difference 0).
- **In the browser**: the dev server in the browser pane (`preview_start`), a local game with bots
  (`?map=highline&bots=8&mode=local`), then count `requestAnimationFrame` over 8 s. The pane, and
  the app's window, must be showing: hidden, it runs at 1 frame a second or less and the numbers
  mean nothing. A steadier measure of the JavaScript alone: in the page's console, import the
  modules through Vite (`import('/@fs/<repo>/src/client/soldier.ts')`) and time the frame above,
  in a page reloaded for it (what ran in it before changes what V8 compiled).
- **The GPU's time**: before the game starts, wrap `HTMLCanvasElement.prototype.getContext` to
  keep the first `webgl2` context and its `EXT_disjoint_timer_query_webgl2`, and wrap
  `requestAnimationFrame` so each callback runs between `beginQuery(TIME_ELAPSED_EXT)` and
  `endQuery`; read the queries back when `QUERY_RESULT_AVAILABLE`, skipping any while
  `GPU_DISJOINT_EXT` is set. The same wrapper times each callback on the CPU.

- **The GPU at fixed views**: a scratch page in `demo/` (not committed) that builds the map, puts
  runners where you want them (three at 3 m in front of the camera for a close fight), freezes
  `performance.now` and `Date.now`, and draws each view some 90 frames under the timer above; take
  each view's median past its first 20. Alternate the views (A, B, A, B): the GPU is shared with the
  rest of the Mac and one run of a view can be off by tens of milliseconds. Wrap
  `WebGL2RenderingContext.prototype.shaderSource` to rewrite the shader by a URL parameter, to take
  out one part at a time and find what costs.
