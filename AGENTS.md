# tiny-fps

Tiny multiplayer first-person game for the browser: a rooftop capture-the-flag with parkour movement, in progress (see [docs/PLAN.md](docs/PLAN.md)). A personal project on `korial29`: never move or mirror it to an organisation. Tooling, CI and the transport layer come from `korial29/air-hockey` (`~/dev/air-hockey`): when in doubt, do what air-hockey does.

Read this file before any change. Change a gameplay rule only when the user asks.

## Layout

| Path                      | Role                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/constants.ts` | Tick rate, player size, speeds, history length, input bank, default rules (`RULES`)                                                                                                                                                                                                                                                                   |
| `src/shared/types.ts`     | PlayerState, Input, KEY, TEX, Snapshot, Rules, SocketLike, Conn |
| `src/shared/map.ts`       | Maps as data: `ROOFTOPS`, the parkour test course: roofs at several heights, gaps, a stair, an overhang, ledges, a long wall, a low gap, beams |
| `src/shared/world.ts`     | The brush world: `Brush` (a box), `WorldDef` (brushes, spawns, kill floor, sun, sky, fog), `World` (a uniform grid), `build()`, `near()` candidate brushes, `ray()` exact slab test through the grid, `hidden()` line of sight |
| `src/shared/physics.ts`   | `move()` and `spawn()`, shared by the host and the client's prediction: momentum and the movement modes (see Movement below), the player cylinder against the boxes (slide, step up, stand on the highest top, bump a ceiling), respawn under the kill floor |
| `src/shared/protocol.ts`  | Wire format: JSON text frames, binary input and snapshot frames                                                                                                                                                                                                                                                                                       |
| `src/shared/room.ts`      | One game, transport-agnostic: roster, inputs, snapshots, the per-tick history of the players and `rewind()`                                                                                                                                                                                                                                           |
| `src/server/`             | Node `ws` adapter (`@korial29/tiny-fps/server`) and its CLI, copied from air-hockey                                                                                                                                                                                                                                                                   |
| `src/local/`              | Same-browser multiplayer over BroadcastChannel (`@korial29/tiny-fps/local`), copied from air-hockey                                                                                                                                                                                                                                                   |
| `src/client/`             | `tinyFps()` API (`index.ts`), prediction (`predict.ts`), WebGL drawing (`render.ts`), textures, input, the soldier model and its gait tracker (`soldier.ts`), vertex helpers (`mesh.ts`), camera and dust-mote effects (`effects.ts`), HUD (`hud.ts`), the lights of each frame (`lights.ts`), the synth and music (`sfx.ts`), Web Audio (`audio.ts`) |
| `demo/`                   | Demo page                                                                                                                                                                                                                                                                                                                                             |

## Commands

Node 24 (`.nvmrc`).

```bash
npm start           # demo with hot reload (Vite)
npm run dev:server  # WebSocket server on :8787
npm test            # Vitest
npm run lint        # Prettier + ESLint + tsc --noEmit
npm run build       # dist/: client, local, server, types
npm run size        # gzip budgets
```

## Size comes first

- Budgets, gated by `npm run size`: `dist/index.js` ≤ 40 KB gzip, `dist/local.js` ≤ 16 KB (raised by the user: from 12 and 6 for parity with the js13k game, then from 30 and 12 for level design). Raise one only when the user agrees. After step 1 of the plan they stand at 15.1 and 4.3 KB.
- No game or 3D library, no runtime dependency, no images, fonts or assets: geometry and textures are generated in code.
- Raw WebGL2: one scene program (depth passes included) and one small post-processing program. No three.js, no WASM.
- Do not copy code from `carlini/js13k2019-yet-another-doom-clone`: it is GPL-3.0, this project is Apache-2.0. Its ideas (procedural textures, maps as compact data, shadow maps, jsfxr-style sound) are fair game; reimplement them.

## Architecture

- **The host is authoritative**: the Node server or the local host tab.
- **Inputs, not positions**: the client sends one `Input` per step (11 bytes, 60 Hz): held keys (8 bits: forward, back, left, right, jump, sprint, dash, crouch), yaw, pitch, a u16 `seq`, and the `view` tick it draws the others at. The host applies each input on arrival with `move()` and acks the last seq per player in the snapshot. A bank of `INPUT_BURST` inputs per player stops speed hacks.
- **The client predicts** its own player: it applies its inputs at once, and on each snapshot resets to the host state and replays the unacked inputs. Other players are drawn `INTERP_DELAY` (100 ms) in the past, interpolated between snapshots.
- **Snapshots** at 30 Hz (`SNAP_EVERY` 2 of `TICK_HZ` 60): a 4-byte head (type, tick, player count) and 39 bytes per player (position, velocity, the grabbed ledge, look angles, the last acked seq, the movement mode, the time in it, the wall side, the jumps and dash left and their timers: all a `move()` needs to continue from). The wire has no other section yet: flags and scores join it in the next steps.
- **One map, no progression**: the room plays `ROOFTOPS` (`map.ts`), or the `WorldDef` given to its constructor. There is no level index, no health, no pickup and no weapon.
- **Movement** (`physics.ts`, constants in `constants.ts`): `move()` is one step of a state machine over `MODE` (ground, air, wall-run, hang, climb, slide, crouch). Ground control accelerates toward the wished direction, kills the speed across it (`GRIP`) and has friction; the sprint is slow acceleration past `RUN_SPEED`. A dash is a burst (`DASH_TICKS`, no gravity), once on the ground or once in the air per landing, with a cooldown. Jump, dash and the rest are presses (edges on `held`, not holds); a press is kept `JUMP_BUFFER_TICKS` and a jump works `COYOTE_TICKS` after an edge. A ledge is caught in the air on a side the player faces, a top `GRAB_MIN` to `GRAB_MAX` above the feet with room above it; a wall-run needs `WALLRUN_MIN_SPEED` along a wall with forward held. The state is float32 and `Math.hypot` is not used, so host and client agree to the bit. The animation reads `PlayerState.ev` (`EV` bits of the last step) and `fall`, not sent; the predictor's `events()` hands the live ones out once. Keys: WASD, Shift, Space, E or the right button, C.
- **Brush world** (`world.ts`, `physics.ts`): solid axis-aligned boxes, floors are tops, walls are sides, boxes may float. `build()` lists each brush in the 4 m grid cells its footprint covers; physics asks `near()` for the few candidates, `ray()` walks the cells the ray crosses with an exact slab test. The player is a cylinder: it slides along box sides, steps onto a top at most `STEP_H` above the feet, stands on the highest top under its circle, bumps its head on bottoms, and goes back to the spawn of its id under `def.floor`. Sides are judged from the feet at the start of the step. A spawn is `[x, y, z, yaw]`.
- **Lag compensation history** (`room.ts`): every snapshot tick the room keeps the players' states for `MAX_REWIND` ticks. `rewind(id, view)` answers the other players as player `id` drew them at the `view` tick of one of its inputs, interpolated the way the client does. Nothing calls it yet: the tackle of step 7 will. `ray()` and `hidden()` (`world.ts`) are the generic ray and line of sight through the brushes, for the same use.
- **Lighting** (`render.ts`): the sector light is a dim ambient; up to `MAX_LIGHTS` spots and points from `gather()` (`lights.ts`: the flashlights, the lava) add up in the one shader program, and the first `MAX_SHADOWS` shadowed spots get a depth pass into a shadow-map array (the same program, colour writes off). Lava and the unlit layer -2 light themselves. The lit scene goes into a 4x multisampled offscreen target (RGBA16F with `EXT_color_buffer_float`, RGBA8 otherwise), resolved to a texture; the post program adds a three-level bloom, a tone shoulder, a vignette, grain and gamma.
- **`src/shared` never touches the DOM or Node APIs.**
- Coordinates: metres, y up, yaw 0 looks toward -z, `forward(yaw) = (-sin yaw, -cos yaw)` on x, z.
- Keys are read by `KeyboardEvent.code`: WASD on QWERTY is ZQSD on AZERTY with no extra code.
- `erasableSyntaxOnly` is on: no enums, no parameter properties, no namespaces.

## Tests

- Vitest. A fix comes with a test that fails without it.
- Prediction must be checked against the room: the same inputs through the room and through the predictor end at exactly the same place (state is float32 on both sides).
- Visual work: render the built client with a fake socket in headless Chromium, look at the screenshot, then report.

## Git, PRs and releases

- Same flow as air-hockey: branch from `master` (`feature/…`, `fix/…`), one release label per PR, rebase on `origin/master` with `--force-with-lease`, conventional commit subjects in English.
- The PR's label picks the bump (`release:major`, `release:minor`, `release:patch`); `release:skip` publishes nothing. A merge releases at once, with no approval (single maintainer): npm publish, `vX.Y.Z` tag, GitHub Release, built from the PR's merge commit, one release at a time.

## Working with several agents

- The shared contract (types, constants, signatures) is committed first.
- Each agent gets its own worktree from that commit and owns its files; merge by hand, run every check, then look at a screenshot.

## Writing

- English for code, comments, docs, commits and PRs.
- Comments state the non-obvious fact and stop.
