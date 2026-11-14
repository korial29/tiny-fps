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

## Rules for every change

1. **Count the vertices of what you add, at every level.** A runner is drawn at lod 3 within 4 m
   (`CLOSE`), lod 1 within 10 m (`NEAR`), lod 0 beyond (`render.ts`); most runners in a match are
   lod 0. Any new piece on a runner takes the level (or a `far` flag) and its far version has about
   a quarter of the vertices or fewer. Say the counts in the PR. A test pins the far ninja under
   12 000 vertices (`soldier.test.ts`); keep it passing, lower it when you can.
2. **Build once, carry every frame.** A piece whose shape does not depend on the pose (pads, guard,
   hair, helmet, a gun) is built once at rest in its joint's space and only turned and moved per
   frame. A piece that depends on a few numbers (a hand on its curl) is cached by those numbers.
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
7. **Hand a per-frame model only the frame's `Verts` in the game.** Tests pass plain arrays and that
   is fine there; in the game, if a plain array ever goes through the same index writes as the
   `Verts` (a mesh built once with `skin()`, say), V8 falls back to a generic path for good: the
   match frame went from 9.3 to 65 ms in Chrome after it happened once. Build a mesh made once in a
   function of its own. The upload copies into one `Float32Array` kept from frame to frame (`floats`
   in `render.ts`); do not allocate one per frame or per object.
8. **A pure speed-up changes no pixel.** Prove it: draw the same runners and body before and after
   and compare every float (the method is below). A level of detail is a visual change: show it
   from the distance it is used at, magnified, before and after.
9. **Measure, do not guess.** Profile before optimising; the hot spot was never where it looked.

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
