# tiny-fps

Tiny multiplayer first-person shooter for the browser. A personal project on `korial29`: never move or mirror it to an organisation. Tooling, CI and the transport layer come from `korial29/air-hockey` (`~/dev/air-hockey`): when in doubt, do what air-hockey does.

Read this file before any change. Change a gameplay rule only when the user asks.

## Layout

| Path | Role |
| --- | --- |
| `src/shared/constants.ts` | Tick rate, player size, speeds, network scale, default rules (`RULES`) |
| `src/shared/types.ts` | PlayerState, Input, KEY, Box, MapDef, Snapshot, Rules, SocketLike, Conn |
| `src/shared/map.ts` | Maps as data: `YARD`, the first one (walled yard, pillars, a platform) |
| `src/shared/physics.ts` | `move()` and `spawn()`, shared by the host and the client's prediction |
| `src/shared/protocol.ts` | Wire format: JSON text frames, binary input and snapshot frames |
| `src/shared/room.ts` | One game, transport-agnostic: roster, inputs, snapshots |
| `src/server/` | Node `ws` adapter (`@korial29/tiny-fps/server`) and its CLI, copied from air-hockey |
| `src/local/` | Same-browser multiplayer over BroadcastChannel (`@korial29/tiny-fps/local`), copied from air-hockey |
| `src/client/` | `tinyFps()` API (`index.ts`), prediction (`predict.ts`), WebGL drawing (`render.ts`), input (`input.ts`) |
| `demo/` | Demo page |

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

- Budgets, gated by `npm run size`: `dist/index.js` ≤ 12 KB gzip, `dist/local.js` ≤ 6 KB. Raise one only when the user agrees.
- No game or 3D library, no runtime dependency, no images, fonts or assets: geometry and textures are generated in code.
- Raw WebGL2, one small shader program. No three.js, no WASM.
- Do not copy code from `carlini/js13k2019-yet-another-doom-clone`: it is GPL-3.0, this project is Apache-2.0. Its ideas (procedural textures, maps as compact data, shadow maps, jsfxr-style sound) are fair game; reimplement them.

## Architecture

- **The host is authoritative**: the Node server or the local host tab.
- **Inputs, not positions**: the client sends one `Input` per step (8 bytes, 60 Hz): held keys, yaw, pitch, a u16 `seq`. The host applies each input on arrival with `move()` and acks the last seq per player in the snapshot. A bank of `INPUT_BURST` inputs per player stops speed hacks.
- **The client predicts** its own player: it applies its inputs at once, and on each snapshot resets to the host state and replays the unacked inputs. Other players are drawn `INTERP_DELAY` (100 ms) in the past, interpolated between snapshots.
- **Snapshots** at 30 Hz (`SNAP_EVERY` 2 of `TICK_HZ` 60), 16 bytes per player.
- **`src/shared` never touches the DOM or Node APIs.**
- Coordinates: metres, y up, yaw 0 looks toward -z, `forward(yaw) = (-sin yaw, -cos yaw)` on x, z. Maps stay inside [0, 127] m (u16 fixed point, `SCALE` 512).
- Keys are read by `KeyboardEvent.code`: WASD on QWERTY is ZQSD on AZERTY with no extra code.
- `erasableSyntaxOnly` is on: no enums, no parameter properties, no namespaces.

## Tests

- Vitest. A fix comes with a test that fails without it.
- Prediction must be checked against the room: the same inputs through the room and through the predictor end at the same place (within the wire's fixed point).
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
