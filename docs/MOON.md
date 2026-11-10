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

`src/client/moonhull.ts` (`hull()`, called by moonscape.ts beside `moonbase()` and mirrored with it, so nothing in it is team-coloured) dresses red's half from outside, 8,976 vertices a half, drawn only. No brick bond (the user, 2026-11-10: science fiction, not masonry): few long lines, angled cuts, light as line work.

- Dome: twelve dark spines from a trench at the springing line up to a collar round the aerial, a trace of light up every other spine and round the collar, angled panel cuts between the spines through the corners of the shell's sides (a hexagon over a trapezoid, then a chevron under a trapezoid), three hatches, vents in the trench, the drum's windows in panels of two and three, a porthole over every other window, a dark foot with a strip of light, an amber frame round the portal, lights in the ground up to the door, an aerial on top (mast, three cross-bars, a red beacon at 25.4 m).
- Tubes: hoops between the ribs, a lamp on each side of each.
- Modules: a coping with a trace of light on the long walls, a plinth, a cut that steps up at 45 degrees from each corner toward the door, two portholes on each end wall (a pane inside too) and a vent, a lamp and a sensor cluster over each airlock, a dish on the first roof's corner, three whip aerials along the second's end.

`PORTHOLES` lists them; none is over a doorway, an airlock or a tube (tested), and nothing stands in the door's way, the airlocks, the tube tops or the middle of a module's roof. No collision: the aerial's mast, the dish and the whips are walked through.

## Rough ground: the field, the mounds, the carved rille (2026-11-11)

The user, after playing: the field is flat, the ravine too regular, the rocks too coarse.

- **The relief is in the arena too.** `MOON.relief.hole` is now the rille alone (x 0..160, z 132..148) and `pits` the notches of its lips; everywhere else `ground()` answers. The floor's slabs stay at y 0 as ghosts and `at()` is never under them in the arena: `span()` stands on the higher of the two, so every brush, spawn and pack on the floor is as before. The field is `max(0, noise)` mounds of up to 2.6 m, masked to exactly 0 within 6 m of each rectangle of `FLATS` (the pad, the dome with the armoury and the spawns, the modules, the rovers, the packs, the run-up to each mound), within 12 m of the lips and on the arena's edge. No hollow goes under y 0: a dip is the level floor between two mounds.
- **The lips** are `LIP`, one number for each 4 m of x: 0 the straight lip, n > 0 a notch n lattice cells back (a pit in the relief, a missing piece of slab), n < 0 a spur that many metres in. Spurs only close the two ends (gap 4 m, then 10 m): anywhere else a narrower rille would be a new jump. Straight where a crossing or a mound stands.
- **The mounds** (`MOUNDS`, x 48 and 144, each side): 3 m up over 8 m to the lip (21 degrees), 8 m wide, 8 m of flank, a level run-up of 46 m behind. A rover with 37 m of run-up and more flies the 16 m and lands on the far mound's back; from 20 m it falls and is parked again. A ghost sill 0.5 m thick stands under each lip, as high as the ground behind it: without it a body flying in under the crest would be lifted onto it (the relief is a floor whatever its height).
- **On foot** the rille was already crossed anywhere with a sprint, a jump and a dash or a second jump. A sprint and a jump alone still falls short along the straight lip; it now crosses off a mound, aslant, onto the lower lip beside the far mound, and at the west end where the rille closes (where walking round was already possible).
- **Drawing** (`moonscape.ts`): the arena's floor is the lattice like the rest; `ravine()` draws the lips' walls in basalt, each point but the top row's pushed up to 0.3 m into the void, strata darker with depth, a black bottom 30 m down with a faint seam of light and rubble; the top row is the ground's edge, up over a mound. The small craters keep to level ground. Rocks a player gets near are cut by three more rings of planes (about 130 triangles, 70 before); the ones up the crater wall and on the rille's bottom are not.
- The four packs by the rille moved from 12 to 22 m from the centre line, behind the mounds' feet.

### Second pass (2026-11-11): the lips as a meander, a rim drawn through them, rocks that fit their boxes

- `LIP` is now one number for each **metre** of x, in half metres: how far the lip is behind z 148. It comes from two octaves of noise, is 0 on `STRAIGHT` (the west spurs, each mound and its flanks, the bridge, the east stones), never moves more than 0.5 m from one metre to the next and never goes under 0 but over the last 8 m of each end (6 m in, then 3 m: as before). The brushes are strips half a metre deep, one for each depth wherever the lip is no deeper (fewer than a box a run), 495 brushes in all (cap raised from 450 to 500); the pits are one for each run.
- `moonscape.ts` draws the rim as a line through the lip (`RIM`: at each metre the nearer of the two columns' lips, up to 0.12 m further out), so the ground drawn covers every brush edge and is at most 0.62 m past one (tested). `apron()` draws the ground from the lattice, 8 m behind the straight lip, to the rim, on both sides with its own texture coordinates; `ravine()` the walls under it (`ROWS`: an overhang, buttresses from noise, three strata with a ledge under the upper two, scree) and stones along the rim. Nothing collides with the walls' form.
- A hollow in each field (`HOLLOW`, 2 m deep, 20 m across, at (114, 176) and its twin): the slab is in four pieces round a square whose floor is 3 m down, and the relief is the floor there. No pack, spawn or rover is within 14 m.
- Rocks: `boulder()` presses a sphere of 128 or 512 triangles into the rock's collision box (edges rounded 0.35 m, noise no more than 0.28 m out of a side or 0.05 m in, never over the top, four planes shaving the upper half). The field's stones, the wall boulders, the boulder field and the east stepping stones (now ghosts under rock pillars) use it; the rocks up the crater wall and on the rille's bottom keep the older cut block.
