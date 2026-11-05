# tiny-fps

[![npm version](https://img.shields.io/npm/v/@korial29/tiny-fps.svg)](https://www.npmjs.com/package/@korial29/tiny-fps)
[![npm downloads](https://img.shields.io/npm/dm/@korial29/tiny-fps.svg)](https://www.npmjs.com/package/@korial29/tiny-fps)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@korial29/tiny-fps)](https://bundlephobia.com/package/@korial29/tiny-fps)
[![CI](https://github.com/korial29/tiny-fps/actions/workflows/ci.yml/badge.svg)](https://github.com/korial29/tiny-fps/actions/workflows/ci.yml)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/npm/l/@korial29/tiny-fps.svg)](LICENSE)
[![play the demo](https://img.shields.io/badge/demo-play%20now-ff6b35)](https://korial29.github.io/tiny-fps/)

**▶ Play it now: https://korial29.github.io/tiny-fps/**

A tiny co-op first-person shooter for the browser, written in TypeScript with raw WebGL2, no game library and no runtime dependency. Players team up against walkers and flyers through five dark levels: find the keys, open the barred gates, reach the goal, then get everyone back to the start. Everything is generated in code: geometry, textures, lights. There are no images, fonts or assets to serve.

It is inspired by carlini's [Yet Another Doom Clone](https://github.com/carlini/js13k2019-yet-another-doom-clone) (js13k 2019), and adds multiplayer. Only the ideas are reused, not the code.

![A dark corridor in the flashlight's beam, a walker at the far end](https://raw.githubusercontent.com/korial29/tiny-fps/master/docs/screenshot-corridor.jpg)

![The stairs down to the goal room, lit cyan by the goal, with gibs on the floor](https://raw.githubusercontent.com/korial29/tiny-fps/master/docs/screenshot-goal.jpg)

![Back to the start: the open exit glows green at the end of the corridor](https://raw.githubusercontent.com/korial29/tiny-fps/master/docs/screenshot-exit.jpg)

## Framework-agnostic, light to add

`tinyFps()` mounts the game into any element, inside its own Shadow DOM: React, Vue, Angular, Svelte or a plain page, nothing leaks in or out. The game draws everything on one WebGL2 canvas that fills the container.

| Entry                       | What it is                                                             | Size (gzip) |
| --------------------------- | ---------------------------------------------------------------------- | ----------- |
| `@korial29/tiny-fps`        | The game client: rendering, lights and shadows, input, prediction, HUD | ~18 KB      |
| `@korial29/tiny-fps/local`  | Same-browser multiplayer, no server: the host runs in a tab            | ~9.5 KB     |
| `@korial29/tiny-fps/server` | Node WebSocket server (needs `ws`)                                     | Node only   |

CI checks the budgets (40 KB and 16 KB) on every pull request.

## Live demo

https://korial29.github.io/tiny-fps/

1. Open the page, pick a name and play: you are alone against the monsters.
2. For co-op on one machine, open it in a second tab of the same browser and join with another name: the tabs play together, with no server.
3. To play across devices, pick the server mode and give it the URL of a running `tiny-fps-server`.

---

## Installation

```sh
npm install @korial29/tiny-fps
```

The unscoped name `tiny-fps` belongs to another package. The server entry also needs [`ws`](https://github.com/websockets/ws), an optional peer dependency:

```sh
npm install ws
```

---

## Basic usage

### Tabs of the same browser, no server

```ts
import { tinyFps } from '@korial29/tiny-fps';
import { localSocket } from '@korial29/tiny-fps/local';

const game = tinyFps(document.getElementById('game')!, {
  name: 'Ana',
  socket: localSocket('my-room'),
});
```

Every tab that opens `localSocket('my-room')` joins the same game over a [`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel). One tab hosts the game, elected with [`navigator.locks`](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API); when it closes, another tab takes over with a fresh game. `navigator.locks` needs a secure context: on `http://` from a LAN address, each tab plays alone.

### Across devices, with a WebSocket server

```ts
// server.ts (Node)
import { serve } from '@korial29/tiny-fps/server';

const stop = serve({ port: 8787 }); // or serve({ server: existingHttpServer })
```

```ts
// in the browser
import { tinyFps } from '@korial29/tiny-fps';

tinyFps(document.getElementById('game')!, {
  name: 'Ana',
  url: 'wss://your-host.example/my-room',
});
```

Each URL path is its own room: `/my-room` and `/other` are two separate games. A ready-made server ships as a command:

```sh
PORT=8787 npx tiny-fps-server
```

### Sizing

The canvas fills its container, at any size and ratio. Give the container a size:

```css
#game {
  width: 100vw;
  height: 100dvh;
}
```

---

## API

### `tinyFps(container, options)`

Mounts the game and joins. Returns `{ on, players, destroy }`.

| Option   | Type         | Description                                                                                  |
| -------- | ------------ | -------------------------------------------------------------------------------------------- |
| `name`   | `string`     | Player name shown above your head (16 characters max). A taken name gets a suffix (`Bob 2`). |
| `url`    | `string`     | WebSocket URL, room in the path. Ignored when `socket` is given.                             |
| `socket` | `SocketLike` | Any WebSocket-like object, e.g. `localSocket('room')`.                                       |

Without WebGL2 the game stays connected and says so on screen.

### `on(event, callback)`

| Event    | When                                                     |
| -------- | -------------------------------------------------------- |
| `open`   | Connected.                                               |
| `close`  | Disconnected.                                            |
| `roster` | A player joined or left; read the list with `players()`. |

```ts
game.on('roster', () => console.log(game.players().map(p => p.name)));
```

### `players()`

Everyone in the room, you included: `{ id, name, color }[]`. Each player has a colour of their own.

### `destroy()`

Leaves the game, stops rendering, releases the pointer and removes the game's DOM. Safe to call twice.

### `localSocket(room, rules?)`: `@korial29/tiny-fps/local`

A same-browser socket for `tinyFps`. `rules` apply to the game the tab hosts, so pass the same ones from every tab.

### `serve({ port | server, rules? })`: `@korial29/tiny-fps/server`

Starts the WebSocket server, one room per URL path, and returns an async `stop()`. `rules` apply to every room.

### `SocketLike`

The subset of `WebSocket` the client uses: `binaryType`, `onopen`, `onclose`, `onmessage`, `send(data)` and `close()`. A real `WebSocket` and `localSocket()` both fit, and so does a relay over a transport you already have. Text frames are JSON, and binary frames (inputs, snapshots) must arrive as an `ArrayBuffer` of exactly their bytes.

### Rules

| Rule         | Default | Description                                                 |
| ------------ | ------- | ----------------------------------------------------------- |
| `maxPlayers` | `16`    | Players in a room; the next ones are told the room is full. |

---

## Controls

| Action | Keys                                                          |
| ------ | ------------------------------------------------------------- |
| Look   | Mouse (click the game to lock the pointer, Esc to release it) |
| Move   | WASD, or the arrow keys                                       |
| Jump   | Space                                                         |
| Fire   | Left mouse button, held                                       |
| Mute   | M (remembered)                                                |

Keys are read by their position (`KeyboardEvent.code`), so on an AZERTY keyboard WASD is ZQSD with nothing to set.

---

## How a game plays

- **Co-op**: everyone fights the monsters together; there is no friendly fire. Up to 16 players.
- **Chaingun**: 12 shots a second, at half speed while you fire. The host decides every hit, and moves the targets back to where you saw them (lag compensation).
- **Monsters**:
  - Walkers patrol the floors, fire bullets and strike up close.
  - Flyers float over steps and pits.
  - They spot you within 60° of where they face and never through a wall, then alert their neighbours. One shot kills.
- **Health**: 9 points. A hit takes one, then you can't be hurt for a second. A dead player comes back at the start 3 s later. Every 4th kill leaves a health pack.
- **Keys and gates**: red, blue and yellow keys open the barred gates of their colour, for the whole team.
- **The way out**: the start room locks behind you. Touch the goal to open it, then the level is won once every living player is back inside.
- **Five levels**: Warm-up, Foundry, Cistern, Loop and Citadel. Then the run starts over in hard mode, with faster monsters that strike and fire more often. The end screen shows the time and each player's kills and deaths.
- **Sound**: every sound is synthesised in code and placed left or right by where it comes from; a dark music loops under it. The sound starts with the click that locks the pointer.
- **Dark levels**: your flashlight casts shadows, and so do muzzle flashes. Explosions, hits, bullets, the goal and the open exit light up their surroundings.

---

## Features

Parity with the js13k game is tracked in [`docs/PARITY.md`](docs/PARITY.md).

- [x] Multiplayer over WebSocket, or between tabs of one browser with no server
- [x] Doom-style sector maps: steps, pits, low ceilings, balconies, eight procedural materials (brick, tile, lava, stone, metal, wood, moss, grating) with bump mapping and per-material highlights, each level themed
- [x] Client-side prediction, exact to the bit, and the other players interpolated
- [x] Chaingun with lag-compensated hitscan, spinning barrels, recoil, muzzle flash, head bob, sparks
- [x] Walkers and flyers: patrol, sight cone, alert, chase, bullets, melee, gibs and explosions
- [x] Health, hit cooldown, death and respawn, health drops, team keys and barred gates
- [x] Five levels, the goal and the way back, hard mode on the next run, end screen with the time
- [x] Flashlights with shadow maps, lit muzzle flashes, explosion, hit, bullet, goal and exit lights
- [x] Atmosphere: a light colour per room, a fog colour per level, flickering lava light, dust in the flashlight beam, soft smoke after explosions
- [x] Post-processing: bloom on flashes, lava and glows, tone mapping, vignette, film grain, 4x antialiasing
- [x] Models and particles: hunched walkers with jointed limbs, flapping flyers, soldiers for the other players, a detailed chaingun, ejected brass casings, streaking sparks, gibs that leave blood splats
- [x] Sound: a jsfxr-style synthesiser (shot, boom, hit, collect, clock, burst), stereo by position, a looped music; M mutes
- [x] HUD and screens: health bar, damage vignette and pickup fades, low-health pulse and heartbeat, title and pause screen, death countdown, end screen with each player's kills and deaths
- [x] Shadow DOM, zero runtime dependencies, size-gated in CI

---

## How it works

- **The host is authoritative**: the Node server, or the host tab in local mode. It runs the players, the monsters, the bullets, the pickups and the levels.
- **Inputs, not positions**: each client sends one 11-byte input per step at 60 Hz, holding its keys, view angles and the moment it sees the others at. It predicts its own player at once and replays what the host has not acknowledged yet.
- **Snapshots** go out at 30 Hz: players, shots, monsters, bullets, events and pickups, in a compact binary format. The other players and the monsters are drawn 100 ms in the past, interpolated between snapshots.
- **Rendering**: one WebGL2 shader program and one vertex buffer, up to 16 lights, with up to 4 shadow maps drawn by the same program.

---

## Development

Node 24 (see `.nvmrc`).

```sh
npm install
npm start            # demo with hot reload (Vite)
npm run dev:server   # WebSocket server on :8787
npm test             # Vitest
npm run lint         # Prettier, ESLint, tsc
npm run build        # dist/: client, local, server, types
npm run size         # gzip budgets
```

The demo reads `?name=`, `?mode=local|server` and `?url=` from its URL, which makes testing several players in several tabs quick.

Pull requests need one release label (`release:major`, `release:minor`, `release:patch` or `release:skip`). Merging one into `master` publishes the matching npm release. See [`.github/CI.md`](.github/CI.md).

---

## License

[Apache-2.0](LICENSE)
