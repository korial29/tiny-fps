# Parity with Yet Another Doom Clone

Goal: every feature of carlini's js13k 2019 game, in co-op multiplayer, before we improve graphics and level design. Its code is GPL-3.0: we reimplement the ideas, we copy neither code nor level data.

Budgets: client 30 KB gzip, local host 12 KB.

## Multiplayer choices

- Co-op: the players fight the monsters together; no friendly fire.
- The host runs monsters, bullets, pickups, keys and doors; clients predict only their own player.
- A dead player respawns at the level start after a few seconds; the level is won when every living player has come back through the exit.

## Steps

One PR per step, each playable on its own.

| # | Step | Features |
| --- | --- | --- |
| 1 | Sector maps | Convex sectors with floor and ceiling heights, walls built from height changes, steps up to 0.5 m, falls, procedural textures (brick, tile, Perlin lava, stone), per-sector light. Test map `HALL`. |
| 2 | Chaingun | Hitscan with lag compensation, view model (lathed barrels that spin), kick, muzzle flash, firing slows you, head bob and roll, shake, impact sparks. |
| 3 | Monsters | Walkers (pendulum limbs, red eyes) and flyers; patrol, a 60° sight cone checked each second, chase, walkers shoot bullets and hit in melee, one shot kills, alert on sight or death, gibs and explosions. |
| 4 | Health and progression | Health 9, hit cooldown, red flash, health drops every few kills, colour keys and barred gates, exit then return trip to the door, 5 levels, hard mode on the second run, end screen with the time. |
| 5 | Lights and shadows | Flashlight per player with shadow maps, exit and hit lights, shadowed muzzle flash. |
| 6 | Sound | A small jsfxr-style synth: shot, boom, hit, collect, clock; stereo panning by position; looped music. |
| 7 | HUD and screens | Health bar, damage and pickup fades, low-health cue, title and end screens. |

## Not in the original, kept out for now

Lava damage (the texture only), ammo, reloads, switches and lifts, a level editor.
