# Graphics

Now that the game is at parity (see [PARITY.md](PARITY.md)), the graphics come next, then the level design. Budgets are unchanged: client 30 KB gzip (21.2 KB at the start of this phase, 24.6 KB after G3, 27.6 KB after G4), local 12 KB. Everything is still generated in code, and the GPL clone's code stays off limits.

## Steps

All four steps are done (PRs #15, #16, #17 and #18). The level design phase was dropped for a new direction: see [PLAN.md](PLAN.md).

One PR per step, each playable on its own.

| #   | Step                 | What changes                                                                                                                                                                                                                             |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Materials            | Bump-mapped textures (height in the alpha channel, lit per pixel by the flashlights), a specular term per material, four new materials (metal plates, wood planks, mossy stone, metal grating), and the five levels retextured by theme. |
| G2  | Atmosphere           | A light colour per sector, lava that lights its surroundings, dust motes in the flashlight beams, smoke from explosions, coloured fog.                                                                                                   |
| G3  | Post-processing      | The scene rendered to a texture: bloom on the glows and flashes, a vignette, film grain, gamma.                                                                                                                                          |
| G4  | Models and particles | Rounder walkers and flyers with better animation (a death fall), a more detailed chaingun, ejected shell casings, richer gibs and sparks.                                                                                                |
