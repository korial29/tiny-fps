# Rooftop CTF

A new direction, set by the user on 2026-11-05: an open-air capture-the-flag game between two teams of players, inspired by Mirror's Edge. The parkour movement and the character come first. There are no CPU enemies, no campaign levels and no weapons: a carrier is stopped by a tackle.

[PARITY.md](PARITY.md) and [GRAPHICS.md](GRAPHICS.md) record the work that came before. The renderer (lights, shadows, bloom, materials), the netcode (prediction, lag compensation), the sound and the HUD carry over.

Budgets: client 40 KB gzip, local 16 KB.

## The game

- **Map**: one symmetric rooftop map under an open sky. Two team bases on opposite towers, with routes between them at several heights: rooftops, gaps, ledges, ramps, pipes and cranes. Falling off the roofs sends you back to your base.
- **Teams**: red and blue, balanced as players join, up to 8 a side.
- **Capture the flag**:
  - Touch the enemy flag to take it.
  - Carry it home to your own flag while that one is at its base, and you score.
  - A dropped flag returns home after a few seconds, or at once when a teammate touches it.
  - A match ends at a score limit or a time limit.
- **Movement**, the heart of the game:
  - momentum (acceleration, air control, friction);
  - sprint and dash, the dash with a cooldown;
  - double jump;
  - ledge grab, then climb up;
  - wall-run along a wall, and slide under an obstacle;
  - coyote time and jump buffering, so jumps feel fair.
- **Look**: clean white concrete and glass with strong colour accents, and "runner vision" (red on the edges and objects you can use). A bright sky and a sun with sharp shadows, a hazy city skyline, bloom.

## Steps

One PR per step, each playable on its own. Steps 2 to 4 carry the priority.

Step 1 is done: the client weighs 15.1 KB gzip and the local host 4.3 KB, down from 27.6 and 9.9. Step 2 is done: the brush world, ROOFTOPS, an open sky and the sun, at 15.0 and 4.2 KB.

| #   | Step                       | What changes                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clean slate (done)         | Remove monsters, levels, keys, gates, the goal and the exit, the chaingun and its hitscan, health, and the progression rules tied to them. Keep the netcode (prediction, the rewind history that tackles will use), the renderer, post-processing, sound and the HUD shell. One flat test rooftop, `ROOF`.                                                    |
| 2   | Brush world (done)         | Replace the sector maps with brushes: boxes now, slopes later. Platforms at any height, overhangs and ledges, which sectors cannot do. Capsule physics against brushes (step-up, ground, ceilings), exact prediction kept. Rendering of brushes with the existing materials, an open sky dome and a sun with a directional shadow map. A parkour test course. |
| 3   | Movement (done)            | Momentum, sprint, dash, double jump, ledge grab and climb, wall-run, slide, coyote time, jump buffer, all in the shared deterministic physics, predicted exactly. Tunable constants, and a test per move.                                                                                                                                                     |
| 4   | First-person body (done)   | Visible arms and legs (body awareness), animated from the movement state: arms pumping on a sprint, hands reaching on a grab and pushing on a climb, a tuck on a double jump. Camera feel: FOV kick on sprint and dash, a landing dip, roll, speed lines. Footsteps, a whoosh on the dash, a grunt on a grab.                                                 |
| 5   | Third-person runner (done) | The other players drawn as runners with the full set of moves (run, sprint, jump, double-jump flip, dash, hang, climb, land) in their team colour. Movement state carried in the snapshots.                                                                                                                                                                   |
| 6   | Capture the flag           | Teams and team spawns, bases, flags (take, carry on the back, drop, return, capture), score and match rules, end screen. HUD: score, the state of both flags, a marker toward each flag. Sounds.                                                                                                                                                              |
| 7   | Tackle                     | A dash or slide into an enemy carrier makes them drop the flag and stumbles them for a moment, resolved by the host with the rewind history. The tackled player's camera and body react, with a sound.                                                                                                                                                        |
| 8   | Mirror's Edge look         | Palette and materials (white concrete, glass, coloured panels), runner vision, sky and sun tuning, the city skyline backdrop.                                                                                                                                                                                                                                 |
| 9   | The CTF map                | The symmetric rooftop map with several routes and heights, laid out for the moves of step 3, checked by a reachability test and by playing it.                                                                                                                                                                                                                |

## Decisions

- A carrier is stopped by a tackle; there are no weapons (the user, 2026-11-05).
- Wall-run and slide come in step 3, with the other moves (the user, 2026-11-05).
