# tiny-fps

Browser multiplayer rooftop capture the flag with parkour. Keep the project
on the personal `korial29` account. Never move or mirror it to an organisation.
Tooling, CI and transport follow `korial29/air-hockey` (`~/dev/air-hockey`).

## Project rules

- Read these instructions before changing the repo. Change a gameplay rule
  only when the user asks.
- The Node server or local host tab is authoritative. Clients send inputs and
  replay unacknowledged inputs from the host snapshot. Keep host and client
  prediction in exact float32 agreement.
- Keep `src/shared` independent of DOM and Node APIs. Coordinates are in
  metres with y up. Yaw zero faces -z. Read keys through `KeyboardEvent.code`
  and keep HUD controls and input mappings in sync.
- Use syntax allowed by `erasableSyntaxOnly`. Avoid enums, parameter properties
  and namespaces.
- Keep the runtime dependency-free. Use raw WebGL2 and procedural geometry and
  textures. Keep game and 3D libraries, WASM, images and fonts out of the game.
  Reimplement ideas from the GPL-3.0 `carlini/js13k2019-yet-another-doom-clone`
  without copying its code into this Apache-2.0 project.
- Encode every spoken or recorded sound in Ogg Opus at 12 kbps mono
  (`opusenc --speech --bitrate 12`), as `scripts/voice.py` and
  `scripts/cast.py` do. Keep the MP3 fallback as those scripts make it. Load
  each sprite lazily with `import()`, never in the main bundle.
- Check gzip budgets with `npm run build` and `npm run size`. The active limits
  live in [scripts/size.mjs](scripts/size.mjs). Raise a budget only with the
  user's agreement.

## Working on a subsystem

- **Simulation and networking.** Start in `src/shared/room.ts`,
  `src/client/predict.ts` and `src/shared/protocol.ts` as relevant.
  [Architecture reference](docs/ARCHITECTURE.md) has the module map and
  implementation notes. Code and tests define the current wire format and
  behaviour.
- **Maps.** Highline mirrors red's `half` and has a symmetric `centre`. Edit
  those two lists. Keep ROOFTOPS test-course geometry fixed. Check
  `src/shared/highline.test.ts` for symmetry, clearance, routes and captures.
  The route legs in `src/shared/routes.ts` are used by tests and bots. Before
  changing a leg, check where it lands with the actual physics. See
  [Highline design](docs/PLAN.md) and [Tranquility](docs/MOON.md).
- **Bots and combat.** See [bots](docs/BOTS.md) for decision-making and
  benchmarks, including at least 24 bot-only matches against master when
  judging a bot change. See [weapons](docs/WEAPON.md) for combat and
  [Hunter](docs/HUNTER.md) for that class.
- **Client.** `src/client/index.ts` owns the entry point, `hud.ts` the HUD and
  menus, and `render.ts` the WebGL renderer. See [characters](docs/CHARACTERS.md)
  and [graphics](docs/GRAPHICS.md) for their specific work, and
  [design tools](docs/CHARACTERS.md#design-tools) for the turntable page and
  Blender, which sketches shapes but never ships them. Before modelling a
  large 3D shape whose silhouette decides how it reads (a ship, a vehicle, a
  building, a creature, a weapon, a helmet), weigh a Blender blockout first
  and say which way you went and why; small pieces go straight to code. When
  briefing subagents on 3D work, name the pieces worth a blockout. One agent
  at a time drives the live Blender: sketch before fanning out, and hand the
  agreed numbers to the agents. For audio start
  with `audio.ts`, `voice/cast.ts`, `voice/clips.ts` (paths under
  `src/client/`) and the generators in `scripts/cast.py` and `scripts/voice.py`.
  Exclude `src/client/voice/{mp3,opus,cast-mp3,cast-opus}.ts` from general
  searches. They contain generated Base64 payloads.

## Session workflow

A session is continuous improvement by default. These steps override any
default habit of finishing a change with checks and a PR.

1. Make the change. When it is visible, take a screenshot of the result and
   show it. Then stop and ask the user whether the result is OK.
2. Do not chain into tests, lint or PR creation after a change. Tests and lint
   are optional: run them only when the user asks or when you need them to
   understand a problem.
3. Keep iterating on the user's feedback until they say it is OK.
4. Once the user says it is OK, create the PR, then ask whether to run the
   tests locally.
5. If they say no, watch the PR's CI by default and fix any failure it shows.

## Commands and checks

Use Node 24 (`.nvmrc`). Run `npm start` for the Vite demo and
`npm run dev:server` for the WebSocket server on port 8787.

- A fix comes with a regression test, added when the PR is created. Iterate with
  `npx vitest run <test files>` and expand to the affected integration tests.
  `npm run test:ci` runs the suite without coverage. `npm test` adds coverage.
- After adding, splitting or growing a test file, run `npm run test:durations`
  to refresh the timing data used by the four CI shards. Aim for about 15 s
  or less per test file locally. Split slow files by `describe` block.
- For prediction changes, run the same inputs through the room and predictor
  and check exact agreement. Pass `ROOFTOPS` explicitly to the test room.
- Run `npm run lint` for formatting, ESLint and TypeScript checks.
- For visual work, render the built client with a fake socket in headless
  Chromium and inspect the screenshot.

## Rendering performance

Before changing anything drawn each frame, read [rendering rules](docs/PERFORMANCE.md#rules-for-every-change)
and [measurement procedure](docs/PERFORMANCE.md#how-to-measure). Keep match-frame
JavaScript under 8 ms. Build and warm up at load, reuse buffers and avoid
per-vertex allocations. Count vertices at each level of detail. Compare
vertices exactly for a pure speed-up, and show each changed level of detail
from the appropriate distance.

For any 3D rendering change, measure before and after on Highline and
Tranquility with the affected classes. Report match-frame CPU time, first
draw and vertex counts for far, near and close in the PR. Recover regressions
in the same change and consult the user about any remaining increase.

## Git, PRs and releases

- Before starting a feature, fetch `origin/master`, create a worktree on it
  and create the feature's branch there. Never start on the branch or the
  uncommitted changes of another task.
- Branch from `master` (`feature/…` or `fix/…`). Rebase on `origin/master`
  and use `--force-with-lease` when updating a rebased public branch.
- Give every PR one release label (`release:major`, `release:minor`,
  `release:patch` or `release:skip`). On merge, the first three publish to npm,
  tag the merge commit and create a GitHub release.
- Include a game screenshot in the PR. For a visual fix show before and after.
  Use headless Chromium or the browser pane. Push it to the orphan
  `screenshots` branch as `<branch>/<name>.png` and embed the raw GitHub URL.
  Keep screenshots off `master`.
- For multi-agent work, commit the shared types, constants and signatures
  first. Give each agent its own worktree and files. Merge by hand, run every
  check and inspect a screenshot.
- Write code, comments, docs, conventional commit subjects and PRs in English.
  Comment on facts that the code leaves implicit.
