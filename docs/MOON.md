# Tranquility: the moon level (the user, 2026-11-09)

A capture the flag in a crater on the moon, with a lunar base, after a reference picture: a wide
flat crater floor ringed by rocky walls, a black sky full of stars with the Earth in it, two large
white domes joined by habitat tubes to long modules, round landing pads with shuttles and lights,
light masts, rovers and boulders on grey regolith. Half gravity, the players float on their jumps.
Space helmets on every runner, after DOOM's 90s marine helmet, not copied.

## Frame and symmetry

- Metres; y up. Play area x 0..160, z 0..280 (`ZED = 280`). Red's half is z > 140, blue's the mirror
  (`flip()` as map.ts does: z → ZED − z, the red tint to blue).
- The crater floor is y = 0, solid everywhere but the rille. Kill floor (`floor`): −20.
- `gravity: 0.5`, `scenery: 'moon'`, `helmets: true`, `name: 'Tranquility'`.
- Sun low from the east, white and hard: `dir ≈ [0.75, 0.35, 0.2]` (unit), `color [3, 2.95, 2.85]`.
  Sky near black: zenith `[0.002, 0.002, 0.006]`, horizon `[0.02, 0.02, 0.035]`. No fog.

## Layout (red's half; blue's is its mirror)

| What        | Where                                    | Size                      | Notes                                                                                                                           |
| ----------- | ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dome        | centre (80, 0, 236)                      | radius 22, height 16      | Collision: 4 stacked tiers (r 22 to 6, tops 6, 11, 14.5, 16), walkable. Visual: a smooth hemisphere with a band of lit windows. |
| Flag base   | (80, 1, 205)                             | octagonal pad 12 × 1 × 12 | In front of the dome, toward blue.                                                                                              |
| Spawns      | 8 at z 262–268, x 56–104                 |                           | Facing −z (yaw 0), as Highline's red.                                                                                           |
| Armoury     | plinth x 60–70, y 0–1.5, z 250–256       |                           | The 4 racks 2.5 m apart on top, as Highline.                                                                                    |
| Landing pad | disc centre (40, 0.25, 220)              | radius 13                 | Collision: a thin 26 × 0.25 × 26 box. A shuttle on it: fuselage box 14 × 3 × 4 as cover.                                        |
| Modules     | (118, 0, 226) and (112, 0, 200)          | 14 × 5 × 8                | Long halls with lit windows.                                                                                                    |
| Tubes       | dome ↔ each module                       | 4 wide × 3.5 high         | Box collision, tops walkable; drawn as rounded tubes.                                                                           |
| Light masts | at the pad's corners and along the tubes | 0.4 × 10 × 0.4            | A lamp on top.                                                                                                                  |
| Field       | z 150–200                                |                           | Open regolith, boulders 2–6 m as cover, low ramps up to the tube tops, a parked rover.                                          |

The middle, z 132–148: **the rille**, a 16 m chasm across the crater, open to the kill floor, with
three crossings: a tube bridge in the middle (x 74–86, a deck at y 0 with low walls), a long jump on
the west (half gravity makes it), and stepping-stone boulders at several heights on the east.

The rim: walls past x < 0, x > 160, z < 0, z > 280, up to y 60 in two steps (STONE): the boundary.
The rocky slopes over and beyond them are drawn only (moonscape.ts).

Packs: health 3, ammo 3, rail cells 2 in each half, on tops; one cell and two of each pack by the
rille. Every jump, gap and climb is sized for half gravity and checked with the physics.

## Pieces

| Piece     | Files                                                                                                                                                                           | Who     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Engine    | world.ts fields (done), physics gravity, map choice (Rules.map, roster `map`, client option, demo select, server `MAP`), render: moon scenery instead of the city, budget 92 KB | agent A |
| Map       | src/shared/moon.ts (`MOON`), its tests                                                                                                                                          | agent B |
| Moonscape | src/client/moonscape.ts: domes, tubes, pads, shuttles, masts, rovers, boulders, crater rim, stars, the Earth, all drawn once                                                    | agent C |
| Helmets   | src/client/helmet.ts, soldier.ts, a visor rim in the HUD                                                                                                                        | agent D |

## The crater (2026-11-10)

The arena above is now the `hole` of a relief (`MOON.relief`, `src/shared/relief.ts`): a 4 m lattice of heights over an ellipse of 300 by 360 m half axes round (80, 140), exactly 0 for 12 m round the arena, mirrored across z = 140. The rim ghosts are gone; two ghost plugs close the rille's ends. Landmarks, ramps, rocks and dishes are in `LAYOUT`. Node heights use no `Math.sin` or `**`, so every engine builds the same lattice (a checksum pins it). Far plane 1200 m, sky at 800 m, budgets 110 and 24 KB. The numbers higher up in this file about the rim and the play area are the first version's.

## The base's inside (2026-11-10)

`src/shared/moonbase.ts` is red's half of the base: the dome's hall (a stepped plan under the upper ghost bands, door toward the flag, mezzanine at 3.5 m), the hollow modules with an airlock each and the tubes as corridors. What stands in the hall is ghost brushes drawn by `src/client/moonbase.ts` with one normal turned from the sun (`INDOORS`): the sun's shadow map only covers 64 m round the eye, so real brushes across the hall would be drawn sunlit. Indoors is lit by glowing strips and panes, no real lights.
