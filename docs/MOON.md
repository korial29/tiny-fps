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
| Flag base   | (80, 1, 234)                             | step 9.5, dais 8.5, 1 m   | In the dome's hall, 2 m from its centre toward the door (was (80, 1, 205) outdoors, see below).                                 |
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

## Rocks and what they collide with (2026-11-10)

Every rock is a block cut by a flat bed, a top and three rings of hashed planes (`rock()` in `src/client/moonscape.ts`): flat facets, sharp edges, about 25 polygons. The boulders along red's walls and the field's six stones live in `LAYOUT.boulders` and `LAYOUT.stones` (`src/shared/moon.ts`) and each has a ghost box inside its drawn rock; a boulder whose box would leave a crack next to an earlier one is left out. The shuttle's wings and tail fin, the ramps' lamps and the wreck's beacon mast have ghosts too. Not collided with: the small craters, the dishes' heads 5 m up, the rocks past the bound.

## The base's inside (2026-11-10)

`src/shared/moonbase.ts` is red's half of the base: the dome's hall (a stepped plan under the upper ghost bands, door toward the flag, mezzanine at 3.5 m), the hollow modules with an airlock each and the tubes as corridors. What stands in the hall is ghost brushes drawn by `src/client/moonbase.ts` with one normal turned from the sun (`INDOORS`): the sun's shadow map only covers 64 m round the eye, so real brushes across the hall would be drawn sunlit. Indoors is lit by glowing strips and panes, no real lights.

## The rovers (2026-11-10)

`MOON.rovers` parks two a base. `src/shared/rover.ts` is the simulation (`drive()`, thirteen float32 and two seats, deterministic so the driver's client replays it), `src/shared/room.ts` seats players (`enter()`, `seats()`), steps a driven rover with its driver's inputs on arrival and a driverless one in the tick, and runs enemies over (`splat()`); the snapshot carries 54 bytes a rover. On the client, `predict.ts` predicts the driven rover and interpolates the others, `chase.ts` is the camera behind it, `rover.ts` the model, `dust.ts` the dust. The sun's shadow window is now 96 m, centred 29 m ahead of the eye. A rover cannot be damaged; the rider stays in first person.

### Rover collisions (2026-11-10)

- A player on foot walks into a rover's body and stands on it: `hull()` (the stadium round the front and rear circles of `footprint()`, `RB` wide, `BODY_H` tall) goes to `move()` as `bodies`, which `fly()` pushes him out of and takes floors and ceilings from, like a brush. The host passes the rovers as they stand when his input arrives; the predictor the latest snapshot's, with the one he drives or has just left as predicted. Seated players run no `fly()`: their own rover never touches them.
- A rover stops on another: `drive()`'s `fleet`, each body circle against the others' hulls, the speed into them taken away and `BOUNCE` (0.3) of it sent back. A rover never pushes another, so a driver's replay stays exact.
- A run-over is unchanged: `splat()` runs after the driver's step, before the victim's next step pushes him out.

Known limits: a player on a moving rover is not carried, it drives out from under him; a rover moving into a player shoves him on his next input only, and a brush wins over the shove (he can be left inside a rover pressed against a wall until it backs off); a driver whose obstacle (a moving rover, a walking player) moved since the last snapshot is corrected by the next one; the body is not a wall to run along or a ledge to hang from; a rover does not tilt its hull (pitch and roll only raise or lower its ends).

## The flags inside, and the lab (2026-11-10)

Each flag stands in its own dome's hall, on a team-tinted step and dais 2 m from the dome's centre toward the door (red at (80, 1, 234), blue the mirror at z 46), clear of the crates (moved toward the walls) and of the stairs. The old outdoor pad is gone: the lit portal marks the door and the dais shows through it. The step and dais are ghosts with the team tint; `furnishing()` in `src/client/moonbase.ts`, drawn by `render.ts` beside the scenery, draws them indoors in their tint (moonscape mirrors red's half colour for colour, so they cannot go through `moonbase()`). The racks stay where they were, 28 m behind the flag.

`KIT` in `src/shared/moonbase.ts` is the lab kit, each piece a ghost box that `furnishing()` dresses: in the hall a lab bench with screens and a table of rock samples under the west deck, server racks with status lights up to the east deck, a telescope and a sample analyser on the north deck; in the first module two greenhouse racks; in the second lockers and a spacesuit on its stand. Drawn only, no collision: panels on the hall's short walls, a sign over the door, cables under the east deck, cable trays and status lights in the tubes, hazard stripes and a beacon over each airlock. Everything stays off the door's way to the dais, the stairs, the tubes' mouth, the doorways and the packs (tested), and away from the middle of a module's wall, where vision.ts would band a ledge.

## The base's outside (2026-11-10)

`src/client/moonhull.ts` (`hull()`, called by moonscape.ts beside `moonbase()` and mirrored with it, so nothing in it is team-coloured) dresses red's half from outside, 10,620 vertices a half, drawn only:

- Dome: grey seams 2 cm proud of the shell as drawn (eight rings, meridians staggered row on row, a band where the shell springs, plates between the drum's windows), a porthole over every other window, a dark foot with a strip of light, an amber frame round the portal, lights in the ground up to the door, an aerial on top (mast, three cross-bars, a red beacon at 25.4 m).
- Tubes: hoops between the ribs, a lamp on each side of each.
- Modules: a coping, a plinth, ribs between the windows, two portholes on each end wall (a pane inside too) and a vent, a lamp and a sensor cluster over each airlock, a dish on the first roof's corner, three whip aerials along the second's end.

`PORTHOLES` lists them; none is over a doorway, an airlock or a tube (tested), and nothing stands in the door's way, the airlocks, the tube tops or the middle of a module's roof. No collision: the aerial's mast, the dish and the whips are walked through.
