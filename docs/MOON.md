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

| What         | Where                                              | Size                    | Notes                                                                                                                           |
| ------------ | -------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dome         | centre (80, 0, 236)                                | radius 22, height 16    | Collision: 4 stacked tiers (r 22 to 6, tops 6, 11, 14.5, 16), walkable. Visual: a smooth hemisphere with a band of lit windows. |
| Flag base    | (80, 1, 234)                                       | step 9.5, dais 8.5, 1 m | In the dome's hall, 2 m from its centre toward the door (was (80, 1, 205) outdoors, see below).                                 |
| Spawns       | 8 at z 262–268, x 56–104                           |                         | Facing −z (yaw 0), as Highline's red.                                                                                           |
| Armoury      | plinth x 60–70, y 0–1.5, z 250–256                 |                         | The 4 racks 2.5 m apart on top, as Highline.                                                                                    |
| Landing pads | disc centres (40, 0.25, 220) and (13.5, 0.25, 220) | radius 13               | Collision: a thin 26 × 0.25 × 26 box. A shuttle on it: fuselage box 14 × 3 × 4 as cover.                                        |
| Modules      | (118, 0, 226) and (112, 0, 200)                    | 14 × 5 × 8              | Long halls with lit windows.                                                                                                    |
| Tubes        | dome ↔ each module                                 | 4 wide × 3.5 high       | Box collision, tops walkable; drawn as rounded tubes.                                                                           |
| Light masts  | along the tubes (the pad's went, 11-14)            | 0.4 × 10 × 0.4          | A lamp on top.                                                                                                                  |
| Field        | z 150–200                                          |                         | Open regolith, boulders 2–6 m as cover, low ramps up to the tube tops, a parked rover.                                          |

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

`src/shared/moonbase.ts` is red's half of the base: the dome's hall (a stepped plan under the upper ghost bands, door toward the flag, mezzanine at 3.5 m), the hollow modules with an airlock each and the tubes as corridors. What stands in the hall is ghost brushes drawn by `src/client/moonbase/` (`props.ts`) with one normal turned from the sun (`INDOORS`): the sun's shadow map only covers 64 m round the eye, so real brushes across the hall would be drawn sunlit. Indoors is lit by glowing strips and panes, no real lights.

## The rovers (2026-11-10)

`MOON.rovers` parks two a base. `src/shared/rover.ts` is the simulation (`drive()`, thirteen float32 and two seats, deterministic so the driver's client replays it), `src/shared/room.ts` seats players (`enter()`, `seats()`), steps a driven rover with its driver's inputs on arrival and a driverless one in the tick, and runs enemies over (`splat()`); the snapshot carries 54 bytes a rover. On the client, `predict.ts` predicts the driven rover and interpolates the others, `chase.ts` is the camera behind it, `rover.ts` the model, `dust.ts` the dust. The sun's shadow window is now 96 m, centred 29 m ahead of the eye. A rover cannot be damaged; the rider stays in first person.

**Boost** (the user, 2026-11-14): Shift with W, as on the ship. A rocket at the back pushes `ROVER.BOOST` (10 m/s²) along the nose on top of the engine, fading to nothing at `VBOOST` (34 m/s); it is not the tyres', whose grip on the moon already caps the engine, so it works with any wheel down. 15 m/s after a second instead of 9, about 32 at the top instead of 22. Keys only, no state: predicted exactly, nothing on the wire. The engine howls higher while it pushes.

### Rover collisions (2026-11-10)

- A player on foot walks into a rover's body and stands on it: `hull()` (the stadium round the front and rear circles of `footprint()`, `RB` wide, `BODY_H` tall) goes to `move()` as `bodies`, which `fly()` pushes him out of and takes floors and ceilings from, like a brush. The host passes the rovers as they stand when his input arrives; the predictor the latest snapshot's, with the one he drives or has just left as predicted. Seated players run no `fly()`: their own rover never touches them.
- A rover stops on another: `drive()`'s `fleet`, each body circle against the others' hulls, the speed into them taken away and `BOUNCE` (0.3) of it sent back. A rover never pushes another, so a driver's replay stays exact.
- A run-over is unchanged: `splat()` runs after the driver's step, before the victim's next step pushes him out.

Known limits: a player on a moving rover is not carried, it drives out from under him; a rover moving into a player shoves him on his next input only, and a brush wins over the shove (he can be left inside a rover pressed against a wall until it backs off); a driver whose obstacle (a moving rover, a walking player) moved since the last snapshot is corrected by the next one; the body is not a wall to run along or a ledge to hang from; a rover does not tilt its hull (pitch and roll only raise or lower its ends).

## The flags inside, and the lab (2026-11-10)

Each flag stands in its own dome's hall. Since 2026-11-27 it is in the hall's middle, at the dome's centre, 2 m up on the command dais (see below; red at (80, 2, 236), blue the mirror at z 44). The old outdoor pad is gone: the lit portal marks the door and the dais shows through it. The dais is ghosts with the team tint; `furnishing()` in `src/client/moonbase/index.ts`, drawn by `render.ts` beside the scenery, draws it (moonscape mirrors red's half colour for colour, so it cannot go through `moonbase()`). The racks stay where they were.

`KIT` in `src/shared/moonbase.ts` is the lab kit, each piece a ghost box that `furnishing()` dresses: in the hall a lab bench with screens and a table of rock samples under the west deck, server racks with status lights up to the east deck, a telescope and a sample analyser on the north deck; in the first module two greenhouse racks; in the second lockers and a spacesuit on its stand. Drawn only, no collision: panels on the hall's short walls, a sign over the door, cables under the east deck, cable trays and status lights in the tubes, hazard stripes and a beacon over each airlock. Everything stays off the door's way to the dais, the stairs, the tubes' mouth, the doorways and the packs (tested), and away from the middle of a module's wall, where vision.ts would band a ledge.

### Modern panels and lit buttons (the user, 2026-11-27)

"Less square, textures, light on the buttons, no bolted metal." The riveted plates (`TEX.METAL`) are gone from the base: its floors and the mezzanine are `TEX.HULL` (the walls since have their own coat, below), smooth satin composite panels of 1 m by 2 m with a fine seam and a faint tone from panel to panel, a little shiny (its `SPEC` row). Landfall and the station keep `METAL`. `src/client/moonbase/round.ts` softens the kit: `bevel()` cuts a box's twelve edges at 45 degrees (bench, screens, racks, analyser, lockers, shelves, the suit), the sample jars are cylinders, and `ring()` draws glowing discs hot in the middle and bars with round ends. Buttons are round on a dark inset, with a halo of their colour round each (the panels on the walls, the analyser); the racks' LEDs, the suit's lights, the lockers', the tubes' status bars and the airlocks' beacons are round too, bright enough to bloom. The furnishing went from 24,108 to 65,736 vertices for both halves, built once at the map's load (about 7 then 18 ms); the frame time indoors did not move.

### The outside through the windows, and the room in them (the user, 2026-11-27)

"Ray tracing on the base's windows", then "the windows must show the moon's ground and the stars (the outside)". The panes seen from inside (the hall's two rows, the modules' strips) take their true normal and a layer of their own, `HALL_GLASS` (-2.4) and `ROOM_GLASS` (-2.35), glows outside the portholes' `PANE` band (`glazed()` in `moonbase/kit.ts`). `GLAZE` in `moonbase/mirror.ts` is GLSL that comes with Tranquility's chunk (`Decor.glaze`) and that `fragOf()` splices into the map's program only (`LAND`), under `MOON`, after the light, as Landfall's granite (`Decor.rock`): not in the main bundle. On those pixels alone:

- **Through the glass**, the view goes on outside: over the horizon the moon's sky (`K0()`: the stars, the Earth, the sun), under it the plane of the ground met by the view, regolith in two scales of noise lit by the sun's height. The pane is a window onto the outside wherever it stands (the drum and the shell between the hall and the crater are not drawn in it).
- **On the glass**, the reflected view is traced through the room the pane looks into: a module's room is a box (slabs) with its three ceiling lamps, its floor and its row of windows; the hall is the union of its four rectangles, crossed slab by slab, its concrete floor, skirting, two rows of windows, the lamp strip under the ledge and the dark dome above. It is mixed in from 8 % face on to 68 % at a grazing angle (Fresnel); the point lights' highlight is left out (it washed the panes white).

Frame time at the windows did not move (2.0 ms, headless Metal); the Tranquility chunk grew by about 1 KB gzip, the main bundle by 24 B.

### A round control station (the user, 2026-11-27)

"Round control desks in place of the square tables", on a picture of a ring of consoles. The table of rock samples by the bench (`KIND.SAMPLES`) is now `KIND.CONSOLE`, `station()` in `moonbase/console.ts`: a dark round plinth 3 m across with a raised middle, a stool, and seven pods 38 degrees apart, open toward the hall's middle (its front). Each pod is a bevelled pedestal under a slab leant 32 degrees toward the stool, a lit lavender screen on it with a circuit drawn dark and three round lights along its inner edge; the pod is made once and turned into place. Its kit box (it is collided with, as the rest of the kit) went from 1.5 x 5 m to 3 x 3 m round (65.75, 236), 1 m high. The furnishing went from 65,736 to 69,636 vertices for both halves.

### The halls, the modules and the corridors dressed (the user, 2026-11-27)

- **The command dais.** The flag moved to the hall's middle and up: `DAIS` in `src/shared/moon.ts`, four octagonal tiers of a step each (0.5 m, walked up) to the flag at 2 m, 4.25 m out at the foot (1.35 m short of the mezzanine's stairs), 2 m at the top. Each tier collides as a middle box and three strips a side along its chamfers (no overlap, as the map's test asks); `src/client/moonbase/dais.ts` draws the true octagons, white, a line of the team's light under each lip, a lit ring round the flag at its reach (1.5 m; the zone's painted square is not drawn on the moon), and a band of the team's colour inlaid in the floor with spokes from the dais's corners. A guard's round (`round()` in `shared/bot.ts`) takes its posts on the floor round the dais when none is on the flag's own (on Highline nothing changes).
- **The hall.** Desks under the floor row of windows (`desk.ts`, dark cabinets, a lit sloped panel), dark grey pilasters between the upper windows, metal railings in place of the mezzanine's parapets, a dark machine for the big crate, a console at the mezzanine's back (`statue.ts`); the ghosts are unchanged. On the two plinths by the door, each team's statues, not collided above the plinth: red's rams (`ram.ts`: a mask of steel plates, red eyes, ribbed horns curled round, before a dark shield) and blue's eagles (`eagle.ts`: the falcon as a silver emblem on edge, in profile toward the door, on a picture the user gave), drawn in red's frame and mirrored. `sculpt.ts` has the shapes they are carved from.
- **Banners.** Either side of each dome's door, outside: a stiff banner on a crossbar in the team's colour, gilt edged, the team's emblem on it flat (`banner.ts`); the furnishing's only vertices with their true normal.
- **Walls.** A coat of their own, `TEX.WALL`: uniform off-white satin, no seam, a little shiny (its `SPEC` row); a dark grey skirting and a rail at a metre on every wall inside, broken at the doors (`lining()`).
- **The first module's shelves** hold rock samples, crystal clusters, jars of coloured liquids and racks of test tubes under white strip lights (`samples.ts`); the spacesuit by the second module's airlock is modelled with rounded limbs, joint rings, a pack and a gold visor (`suit.ts`).
- **The corridors** (`corridor.ts`): a dark frame with cut upper corners every 3.5 m, in each bay a panel of lit slots on one wall and a dark panel with a red light on the other, lamp slats on the ceiling, a grating in the floor and two pipes along the ceiling's edge.
- **Numbers:** the furnishing went from 69,636 to 159,756 vertices for both halves, built once at the map's load (about 47 ms); the scenery from 468,291 to 469,671 (the ramps' bands and the walls' trim), under its cap of 470,000. Budgets (with the user): main 301,824 B, tranquility 30,976 B, local 62,592 B.

## The base's outside (2026-11-10)

`src/client/moonhull.ts` (`hull()`, called by moonscape.ts beside `moonbase()` and mirrored with it, so nothing in it is team-coloured) dresses red's half from outside, 8,976 vertices a half, drawn only. No brick bond (the user, 2026-11-10: science fiction, not masonry): few long lines, angled cuts, light as line work.

- Dome: twelve dark spines from a trench at the springing line up to a collar round the aerial, a trace of light up every other spine and round the collar, angled panel cuts between the spines through the corners of the shell's sides (a hexagon over a trapezoid, then a chevron under a trapezoid), three hatches, vents in the trench, the drum's windows in panels of two and three, a porthole over every other window, a dark foot with a strip of light, an amber frame round the portal, lights in the ground up to the door, an aerial on top (mast, three cross-bars, a red beacon at 25.4 m).
- Tubes: hoops between the ribs, a lamp on each side of each.
- Modules: a coping with a trace of light on the long walls, a plinth, a cut that steps up at 45 degrees from each corner toward the door, two portholes on each end wall (a pane inside too) and a vent, a lamp and a sensor cluster over each airlock, a dish on the first roof's corner, three whip aerials along the second's end.

`PORTHOLES` lists them; none is over a doorway, an airlock or a tube (tested), and nothing stands in the door's way, the airlocks, the tube tops or the middle of a module's roof. No collision: the aerial's mast, the dish and the whips are walked through.

## Reflections on the glass (the user, 2026-11-27)

The portholes, the drum's 70 windows and the modules' windows mirror what is round them over their glow: `glaze()` (`src/client/glass/glaze.ts`) puts their lit glass on the `PANE` layer (-2.2) and leans each normal out from the pane's middle toward its edge, so the glass reads domed and the reflection moves across it as the eye does: 0.8 at a porthole's rim, 0.25 on the flatter windows. The shader keeps the glow, mixes in what `K1()` gives along the reflected ray (black sky, a bright line at the horizon, the grey ground under it), 30 % head on to 80 % at a grazing angle, and adds the sun's highlight, broad and sharp. A porthole is a fan of 12 about its middle (36 vertices, 6 more than before: about 460 more on the map). The boxes are not ray traced (`MIRROR`): the base is ghosts, which the mirrors leave out, and round it there is little but ground and sky.

`src/client/moonbase.ts` is a thin entry over `src/client/moonbase/`: `constants.ts`, `kit.ts` (indoor quads, panels, blocks, doorway frames, linings), `props.ts` (the kit and the hall's dressing), `hall.ts`, `shell.ts` (the dome, the tubes, the modules), the pieces of 2026-11-27 (`dais.ts`, `desk.ts`, `statue.ts`, `sculpt.ts`, `eagle.ts`, `ram.ts`, `banner.ts`, `samples.ts`, `suit.ts`, `corridor.ts`) and `index.ts` (`moonbase()`, `furnishing()`).

## The dome's wall, in slices (2026-11-26)

The ghost wall round each dome was 20 stepped boxes whose corners stood up to 26.4 m from the centre, 4 m outside the drum drawn at 22.4 m: a runner going round the dome hit air and stuck in the notches between the boxes. `SLICES` in `src/shared/moonbase.ts` now builds it in thin slices from the hall to the drum, each reaching the drum at its near end, so a far corner stands out by `SNUG` (0.3 m) at most, under the body's radius: a runner hugging the wall goes round at 5.6 to 5.9 m/s (5.9 in the open). The slices break at the hall's steps and the sides of the two mouths, and stop flush on the second tube's wall where it comes through the drum. The map has 1,709 brushes (cap raised to 1,800); the bots' nav takes 190 ms to build instead of 105 ms.

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

### A few rocks after all (2026-11-12)

The user asked to keep rocks all the same, a few. On top of the section below (the pebbles stay):

- **Sixteen boulders**, eight a side (`ROCKS` in `src/shared/moon.ts`, red's, mirrored): four in the arena's field at (32.5, 156.5), (67.5, 159.5), (97.5, 166) and (128, 177.5), the four of the old field stones nearest the rille, as they were (1.8 to 3.7 m high); two where the boulder field was, at (-50, 330) and (-64, 336); one by the west lane at (-14, 204) and one by the east at (176, 212). None along the walls, none up the crater wall, none round the craters, none under 1.8 m.
- They are the rocks of #208, restored from history: `rockOf()`, `fitted()` and `crag()` in `moon.ts`, `crag()` in `moonscape.ts`, with their fit, no-snag, rover and shot tests on the eight.
- The stone at (97.5, 166) closes the sprint aslant from x 100 that cleared the rille by the bridge's east end: the slant test is back on x 100 and 118. Straight across, a plain sprint and jump crosses at x 2 and 158 (master: 2 and 4): the east end's wall boulders are gone, and the one that let x 4 through too.
- Pebbles: a ring of 18 to 25 at each boulder's foot, none within 1.3 radii of its middle. One pebble in twenty is of the largest size (was one in ten) to pay for the boulders.
- 1,214 brushes (cap 1,300): 714 are the boulders' boxes, 45 a boulder on average. The map loads in about 200 ms (10 ms with no rock, 360 ms with the rocks of #208). 467,919 vertices (cap 470,000).

### No rocks: pebbles (2026-11-12)

The user asked for the rocks to go and for small pebbles of three sizes on the ground, with no collision. This replaces the section below, kept for the record.

- **Removed**, with their boxes: the six field stones, the boulders along the arena's three walls and the boulder field (2,752 boxes in all), the stones drawn on the craters' crests and thrown out round them, the stones along the rille's rim, the thirty rocks drawn up the crater wall. `rockOf()`, `fitted()` and the boxes computed at load are gone: the module loads in about 10 ms (was about 300 ms more). 500 brushes (was 3,252; cap 560).
- **Kept**: the three east stepping stones (their boxes, their drawn pillars, their route tests); the six steps out of each pit; the rille's lips and walls; the twenty blocks drawn round each pit's edge (under 0.65 m, no box: a driver sees the pit coming by them); the rubble at the rille's bottom; the masts' feet under the dishes and the ramps' lamps (the only ghosts of stone left standing on the floor).
- **Pebbles** (`strewn()` and `pebbles()` in `moonscape.ts`, drawn only): three sizes, 0.08, 0.2 and 0.45 m across (each 12 % more or less), the largest under a step's height. Each is a smooth cap in the old rocks' style (`stone()`): an ellipsoid turned and squashed by its seed, a little lumpy, two fifths under the ground, darker than the regolith and darker at its foot; 6, 15 and 45 triangles. 3,150 of them (1,906 small, 984 middle, 260 large). A cluster where each boulder stood (`LAYOUT.sites`), thinning to twice its radius; on each crater's crest and thrown out round it; along the rille's rim; in loose trails; in patches where a noise is high. None within 2.5 m of a base, a pad, a rover's place, a pack or a spawn (`FLATS`), none on the strips of the measured jumps (`STRIPS`), none in a pit's square or the rille. Blue's are red's across the centre line, each on its own ground (the lattice's triangles are not split as in a mirror, so a mirrored height would be up to 6 cm off): every pebble is within a centimetre of the ground as it is walked on.
- 461,139 vertices (cap 470,000): the rocks and stones were 117,000, the pebbles are 114,000.
- Changed for a player: no cover in the field but the mounds, the hollows and the bases. A plain sprint and jump now crosses straight at both closing ends of the rille (x 2 and 158; the east end's boulders are gone) and no longer at x 4. From x 100, 20 degrees west, a sprint and jump clears the rille to (86.4, 131.8), half a metre from the bridge's east end: a field stone stood in the way. The slant test now runs from x 106 and 118.
- Falls short: the small size is a speck from a few metres; on the crater rims and from above the pebbles hardly show; the largest shows its nine sides close up.

### Rocks: rounded, and stopped where they are drawn (2026-11-11)

The user walked into the drawn flank of a rock before being stopped ("you sink into them"), and found the cut rocks too triangular. Both are redone.

**Shape.** `rockOf(seed, R, H)` in `src/shared/moon.ts` is a boulder's form, as its reach from its middle along a unit vector. No plane in it: an ellipsoid stretched unevenly on its three axes and turned by the seed, a dome over its middle (two parts of an ellipse, one of a squarer solid) that leans a little, swollen and shrunk by two low octaves of noise (large soft lobes), with one gentle hollow and one flatter side. Under its middle it goes straight down, as wide as at its middle: it stands in the regolith and its flank is upright at the ground. `rockMid(H)` is the middle's height: 0.3 H, and half of H up to 0.8 m for a low rock. Only + - * /, `Math.sqrt` and the hash.

**Drawn** (`moonscape.ts`): `stone()` throws an icosahedron's sphere onto a form (20 f² triangles, no pole, no sliver) and gives each point the mean normal of its faces, so a rock shades as one rounded mass. A rock is 720 triangles from 2.5 m of radius, 320 from 1.5 m, 180 under, less what is under the ground; one tone, darker at the foot. `boulder()` (the east stepping stones, the pits' steps, the pebbles and the stones on the rims) is the same on a box: a squarer solid for a pillar or a step, its top the box's top, an ellipsoid for a pebble (20 triangles under 1.4 m, which shows its corners close up).

**Collision** (`fitted()`): boxes inside the form, computed at load (about 0.3 s more on this machine; a baked table of 1,370 boxes would not fit the bundle's budget). From the lowest ground round the rock to its top the form is cut in layers. The first is a wall: it goes 0.7 m over the highest ground round the rock, more than a body or a rover steps up, so nothing walks up a rock. Over it a layer ends where the outline has moved 0.16 m on a bearing (0.3 m over a body's height), 0.25 to 0.9 m thick. In each layer the outline is read at its foot and its top on 64 bearings, laid on a grid of 7 to 12 cm, and boxes are picked one after the other: the largest, then the one that brings the most of the outline within 0.16 m of a box, overlapping one already picked, until the whole outline is. A box may stand 7 cm out of the form. A rock whose top is under a metre over the ground has no wall: it is walked over, up its layers.

Measured, and tested, at body height (every 7.5 degrees, every 0.2 m up; horizontally on a flank, vertically where the rock is shallower than 45 degrees):

|                              | before (#190) | now    | asked  |
| ---------------------------- | ------------- | ------ | ------ |
| median                       | 0.69 m        | 0.13 m | 0.15 m |
| nine in ten                  | 1.62 m        | 0.29 m |        |
| nineteen in twenty           | 1.97 m        | 0.36 m | 0.3 m  |
| ninety-nine in a hundred     | 2.67 m        | 0.50 m |        |
| worst                        | 3.71 m        | 1.05 m | 0.45 m |
| a box out of the rock, worst | 0.09 m        | 0.08 m | 0.1 m  |

The median is met; the tail is not. It is at the foot of a rock on rolling ground (the wall is one layer from the lowest ground to 0.7 m over the highest, as wide as the rock is narrowest in it) and on the dome of a low one. A runner walking straight at a rock from eight sides comes a median 0.10 m into its drawn flank, 0.22 m one time in ten, 0.67 m at worst (the worst was over 1.5 m). A rover's nose stops 0.25 m in at most on the six field stones; a shot at body height stops a median under 0.15 m in. A runner sliding past is never held up.

Changed for a player: a rock is as wide as it looks, so the passages between rocks are narrower. A body that jumps at a rock can land on a layer's edge, up to 0.9 m up its flank, its feet under the slope drawn there (a median 0.16 m, 0.52 m at the 99th centile). A rock under a metre is walked over. At the west end of the rille a plain sprint and jump crosses at x = 4 as well as x = 2 (the boulder there is rounder). 3,252 brushes (cap 3,400), 436,467 vertices (cap 440,000). The side profile of a rock is up to 0.92 of its bounding rectangle, not under the 0.85 asked: the upright foot is what lets collision follow it.

### Small relief everywhere (2026-11-12)

The user found large areas dead flat. `rough()` in `src/shared/moon.ts` lays a small relief over the whole lattice.

- **What the lattice carries.** It is 4 m: hummocks and pans from 8 m across, no less. And a patch is exactly level only if every node within 5.7 m of it is, so a level patch costs 6 m of margin whatever its size: the level zones cannot shrink to a metre or two.
- **In the arena**, over the slabs: hummocks only, up to 0.45 m (nothing under the floor), on two noises 10 and 18 m to a wave. **Outside**: hummocks to 0.55 m, pans to -0.45 m and a slow swell, denser. Mirrored (the lattice is built from |z - 140|), no trig, checksum re-pinned.
- **Level, exactly**: the arena's edge (the slabs end there); the lips of the rille; `STRIPS`, the strips of the measured jumps to 16 m from the centre line (the west long jump's take-off and landing x 8 to 28, the bridge's ends x 70 to 90, the east stones' approaches x 122 to 139, the two mounds a rover flies from x 36 to 60 and 132 to 156); `FLATS`: the bases' rectangles, the rovers' places, the mounds' run-ups, and 1.8 m round each pack and spawn as it is walked on. Off: the jump ramps outside with their run-ups and landings, the craters and their rims, the dishes' hill (as steep as a body stands on), the 10 m each side of the centre line round the rille's ends, the crater wall.
- No longer level: the 12 m apron round the arena (a node in six and more is 10 cm off the floor, 0.6 m at most), the lanes round the rille's ends beyond 5 m of the centre line, the 12 m behind the lips (rough from 14 m of the centre line plus the lip's notch), the arena's open floor.
- **Finer than the lattice, drawn only** (`terrain()` in `moonscape.ts`): each node's normal leans by up to 5 degrees from a hash, so the low sun picks out ripples a body does not feel; not on a level node. No vertex added (465,273, cap 470,000). No pebble field: the budget has 4,700 vertices left.
- Measured (tested): open ground level within 2 cm over a window of 10 m: 10.3 % to 8.6 % in the arena (the bases' own rectangles left out), 3.4 % to 1.1 % outside to 0.8 of the bound. The slope cap holds (0.762 at the steepest). No brush that stands on the floor is more than 3 cm off the ground; no rock's boxes end over the ground. Rovers at full throttle across the field, the apron and the outside: none falls, worst vertical speed 5.2 m/s (4.9 before, on the field's mounds), worst tilt 0.47 rad (0.42); on the apron, level before, 1.7 m/s and 0.08 rad with the wheels down all the way. The rocks' fit is unchanged at the median (0.13 m); a rover's nose goes up to 0.71 m into a field stone when a wheel is on a hummock higher than the stone's foot (0.38 m before).
- Falls short: at eye height hummocks of half a metre over 10 m are gentle, the ground reads as rolling rather than rugged; within 6 to 8 m of a base, a pack or a spawn nothing changes; in the arena the share of level ground barely moves, because what was level there is what the game needs level.

### A smooth crater wall and ranges on the horizon (2026-11-11)

The far crest of the crater wall showed as a row of big triangles against the sky. Cause: past the bound the wall's height came from a folded noise 45 m to a wave, drawn on squares of 20 and 40 m, a fan each: every square caught the noise at a different place, so the skyline was one triangle a square.

- **The wall** (`at()` in `src/shared/moon.ts`, past the bound only, where nobody goes): it rounds off under a crest of 28 to 48 m (was 60 to 95 m) that rolls on noise 170 m and 70 m to a wave, and falls to the plain at 1.65 of the bound. The squares are as before; they now carry a form they can. The lattice's checksum is re-pinned (its corner nodes are past the bound).
- **The ranges** (`ranges()` in `moonscape.ts`): three rings of mountains centred on the play area, at 640, 690 and 740 m, past where the wall is down on the plain (594 m at most) and inside the stars' dome (800 m), so the far plane (1,200 m) holds them from anywhere on the bound. They are real geometry at their distance, so they slide behind the wall as a player crosses the crater. A crest every 0.75 degree (480 columns), from noise on the circle: long swells, ridges and three finer octaves, two massifs and two passes a range, each at its own bearings. Up to 140, 180 and 220 m high: 5 to 17 degrees from the middle, over the wall on every bearing; 31 degrees at most from the bound; never on the Earth (tested from the bound all round).
- Painted, not lit: layer -2, which takes no light, each point's grey worked out from the map's sun (from the east): the west ranges look at it and are light, the east ones are in the shade with a rim of light on their crest; spurs come down aslant, a gully between two darker. The nearest range is the darkest and sharpest, the farthest the palest. Their normals look away from the crater, or the shader puts the sun's highlight on them. They are in the shadow passes like all the scenery (the renderer has no way out for static geometry): 28,800 vertices more to transform, nothing to draw in the sun's 96 m window.
- 465,267 vertices (cap 470,000, was 440,000).
- Falls short: the ranges read as modelled hills with pleated flanks rather than as a photograph (three or four rows of points from foot to crest carry no fine shadow), and the fully lit west range is flat.
- Lower and darker since (the user, 2026-11-12: more discreet): highest peaks 75, 95 and 115 m (were 140, 180 and 220), greys about half, no finest teeth on the crest. From the middle they show over the wall on about half the bearings, at most 3.5 degrees over it; in a pass they are behind it.

### More craters, three pits (gone since, see the rift), rims with an outline (2026-11-11)

- `BOWLS` in `src/shared/moon.ts` has 16 entries (31 craters with the twins, 9 to 46 m in radius): the old ones, ten more, some as secondaries on a big one's rim. Each rim wanders with the bearing (0.03 to 0.075 of the radius high, up to 10 % nearer or further), from two noises of the unit vector from the middle (no angle, so no `Math.atan2` in the lattice).
- **Pits.** The Bowl and the twins at (-4, 364) and (-4, -84) are a level terrace (22 m and more, about 5 m down) and one wall up to the rim; in the terrace a pit is cut (`PITS`, `pit()`): 9 m in radius, wandering by 12 %, its floor a brush at `PIT_FLOOR` (-19), 18 m and more under the crest. The lattice cannot carry a cliff (the relief is a floor at any height), so the pit is made as the rille's notches are: a row of void a metre of z at a time, each a pit of the relief, the terrace round it as brushes level with the relief, the wall their sides. The kill floor went from -20 to -26 for it (7 m under the pits' floors, still over the rille's bottom at -30); nothing else reads it but the fall of a body or a rover.
- A pit traps a rover by design: one that drives in lands on its wheels 13 to 15 m down, is not lost (it is over the kill floor) and cannot drive out; its crew walks out. The way out on foot is a flight of six steps against the east wall, each 1.3 m deep and 2 m high (a jump at half gravity rises 2.45 m); the other walls are not climbed (tested). Blocks stand round the edge and the terrace darkens toward it. The Bowl's wreck is on its pit's floor.
- Every other crater is walked and driven out of (tested from each middle).
- Drawn only (`moonscape.ts`): `pits()` (the terrace to an outline through the rows, never short of a brush's edge, the walls in basalt, the floor, a rock on each step, the blocks); `rims()`, a band of detail on the rim of each crater of 12 m and more, five rings 1.2 m apart round the crest, a point every 1.5 m, laid on the lattice and 4 to 25 cm proud of it (it does not replace the lattice's triangles): the crest raised and light, the inner ring dark and streaked; stones on the crests and blocks thrown out; lighter rays in the ground's tone; 72 small craters in the field (were 60), their rims broken by a hash. 437,511 vertices (cap 440,000), 614 brushes (cap 640).

### The rift: cracks, sinkholes, pylons, islands (the user, 2026-11-27)

The user: more parkour by the rille, holes with pylons to jump on, cracks of no square shape that
run almost to the bases' doors and join at their sides, so that a player jumps from island to
island; the pits were of no use and are gone (the Bowl and its twins are plain craters again, the
wreck on the Bowl's floor).

- **One grid** (`src/shared/moon/rift.ts`): half-metre cells over red's side out to 76 m from the
  centre line, blue's the mirror. A cell is open in the rille or a notch of its lip (`LIP`, cell
  for cell), or where three of its corners or four lie in a crack or a sinkhole and it is in a
  square of four such cells (no slot under a metre). The cracks are lines of points with a half
  width that a noise swells (0.8 to 1.2 times) and a finer one breaks; the sinkholes, circles that
  wander with the bearing. The floor's boxes (`floor()`), the relief's voids (`voids()`, indexed
  per lattice square in `relief.ts`) and the scenery all read the same cells. Boxes are merged
  row to row in columns of 8 m, so away from a crack the field is a few big boxes.
- **The islands.** A front crack runs wall to wall in front of the base; two long ones from the
  rille end 6 m short of the dome's door and 5 m short of the east module's airlock; side ones
  join them and the two sinkholes. Seven islands a side: the west jump's, the north-west, the west
  mound's, the bridge's, the middle one in front of the dome, the hollow's and the east one with
  the stones and the east mound. Kept whole: the west jump's run-up (it starts at z 169 now), the
  bridge's landing, the east stones' approach, each mound and the rover's run-up behind it.
- **Jumps** (`CROSSINGS`, `hops()`): a point in a crack and the way across; the take-off a metre
  short of the edge, the landing 1.5 m past the far one, a sprint over 5 m of void. The bots' nav
  links them both ways (`nav.ts`), each flown with the physics in `moon.test.ts`.
- **Pylons** (`PYLONS`): nine a side in the sinkholes and the cracks' wide parts, tops from -0.4
  to 1.2 m, each within 3.5 m of another or an edge.
- **Rovers.** Ramps in the relief (`KICKERS`, 1.2 m up over 7 m to the crack's edge, level 4 m
  across), each marked by an orange band painted along the crack's edge at its top (in eight pieces on a line fitted to the edge across the ramp, set back until none of it is over the void, 2026-11-27), as the west
  long jump's spur is (the user: discreet; white wing debris first, then this): one on each crack branch between two islands
  where there is room, toward the rille, and both ways over the front crack at x 62 and x 154.
  None on the short branch west of the west sinkhole (the west jump's strip and a rock), on the
  east one from the sinkhole to the front (a rack, a rock and the east run-up) nor on the second
  long crack's lower half and the east side crack (their south side is a strip of lip, no room to
  land). Three rovers a team, parked in sight before the base:
  one facing each two-way ramp, (57, 219) turned toward the west one, off the bots' way to the
  door, and (154, 218); one in front of the dome (90, 208), facing the middle ramp, which a bot
  boards on its way out. Each ramp is flown by a rover both sides in `moon.test.ts`.
- **Moved for room:** the ammo packs to (103, 164.5) and (131, 188), three rocks a few metres
  (36, 156.5), (100, 167), and two pebble sites.
- **Drawn** (`src/client/moonscape/rift.ts`): every lattice square with an open corner is the
  rift's. Closed cells drawn whole (runs merged, across rows too where the square is level, split
  on the lattice's diagonal where it is not), a cell with three open corners as a triangle at its
  closed one: the chamfers that keep the edges from reading as steps. Basalt walls in two courses
  (to 4 m, then to 30 m, darker) along every bare edge, in pieces of 3 m, each broken by a hash; a
  black bottom; a pillar under each pylon. The old apron, rim and ravine walls are gone.
- **Numbers:** 467,151 vertices for the scenery (431,799 before, cap 470,000), about 2,300
  brushes with the station (cap 2,500), budgets: main 300,288 B, local 62,208 B, tranquility
  24,192 B.

## The combat ships (2026-11-11)

The user: the draft shuttle on each pad becomes a combat ship a player boards and flies, up to a limit. Their choices: arcade controls, lasers and missiles, a ceiling plus the crater's edge, a ship that can be shot down and comes back.

- `MOON.ships` stands one on each pad, nose toward the other base. Two pads a base since 2026-11-20 (the user: a second ship a team), the second at x 13.5 west of the first, so four ships: red's two, then blue's (`homeOf()`). With the four rovers that is eight vehicles, past the three bits the snapshot's head had for them: the head is five bytes, a byte of players and one of vehicles. The shuttle's brush and its three ghosts are gone; the ship is a solid body (`shipHull()`) players walk into and stand on, as a rover.
- `src/shared/ship.ts` is the simulation: a `Rover` with `ship` set, so it shares the rovers' seats, snapshot slot (three bytes a vehicle: kind and health, wreck time, missiles), prediction and chase camera. `rover.ts` hands it to `pilot()` wherever it would `drive()`. One seat; a flag's carrier does not fly.
- Controls: the look aims the nose, W and S thrust and brake, A and D slide, Space and C climb and sink, Shift boosts, a click fires the two lasers (bolts, as the rover's), G a missile (a grenade at 60 m/s from a pod that flies straight, no gravity, and bursts out to `MISSILE_R`, 14 m: the user, 2026-11-14; `Ball.missile`, bit 7 of its power byte on the wire). Four missiles, one loaded back every 5 s. With nobody at the stick it falls to a floor.
- The limit: the climb fades over the last 20 m under `CEIL` (120 m) and a push brings it back past it; the same at `EDGE` (0.88 of the crater's bound). Never more than 12 m past either. The HUD warns from half way into the last 20 m.
- Health: a vehicle's, 10 HP like a rover's (see Vehicle damage below; until 2026-11-12 the ship alone had an armour of 60 and came back after 10 s).

### The ship's look (2026-11-12)

The user: rework the ship's style after the long-nosed strike fighters of the films, without four wings or four engines; what he loves is the nose and the cockpit. Then: the engines against the hull's central block, not on the wings, and details on the body (grooves, zones of pipes, technical parts left bare). It is the game's own ship: those things in their proportions and character, everything else its own.

- `src/client/craft.ts`, in the ship's frame (`HULL`, `ENGINE`, `WING`, `FEET`, `LIGHTS`): a nose that tapers straight from the windscreen's foot to a blunt sensor tip and its probe, 45 % of the ship (flat top, shoulders, grey chines, a dark keel, the team's band and stripe); the cockpit behind it, a tub with a seat, a panel and a yoke under a low canopy of six flat panes in a frame of struts, which runs into a spine; an engine against each flank of the hull's back, a wide cowl with a deep intake, the turbine's spinner 0.6 m out of its middle (the wing starts behind the hole's bottom: the user saw the wing's root across it) and a thinner exhaust; two canted fins on the hull's back, either side of the bay (the user: not on the engines); two wings out from under the engines, swept back and drooping, a cannon slung under each and the missiles further out; three legs (`legs()`: down with nobody aboard and under 3 m/s, folded by 12 m/s).
- Bare parts, near level only: grooves across the nose's joints and along its sides, two vents on its top, a trench of pipes along each flank under the cockpit, an open bay of pipes, units and a tank in the back behind the spine (what the chase camera looks down on), ribs and pipes on the exhausts, ducts at the tail. Then, the user wanting more small details like printed circuits or pipes: thin tracks with a pad at their end on the nose's top and on the wings (grey, a little darker than the hull: the user found dark, copper and lit ones too loud), a pipe under each shoulder of the nose with two branches, one along the foot of the spine, three along each cowl.
- The panes are see-through near by (the smoke's layer, alpha to coverage: more opaque face on, clear edge on), so the pilot shows; far away they are dark polished glass.
- Three levels of detail (`BUDGET`: 1,400, 2,400 and 5,000 vertices at most; `SHIP_NEAR` 45 m, `SHIP_MID` 160 m in `render/constants.ts`).
- The simulation moved with the shape, along the nose only: `COCKPIT` 2.6 m back and 0.6 m up (the pilot's shoulders at the sill), the cannons' muzzles (`SHIP_GUNS`) 3.1 m back under the wings, the pods (`PODS`) 3.4 m back under the wings. The hull's body, its hit spheres, its handling and the chase camera are as they were.

Known limits: a rover never pushes a ship, nor a ship another vehicle: each stops on the other.

### Wings and crashes (the user, 2026-11-12)

The user: the wings went through everything, shots on another ship or a rover seemed to do nothing, and a ship should be heard and hurt when it crashes.

- `WING` (the wings' three sections) moved from `craft.ts` to `ship.ts`: what is drawn is what collides. `wings()` are four stadiums along the middle of the chord (two a side, `KICK_H` thick over the wing's bottom), added to the hull by `shipBodies()` and `hulls()` (`rover.ts`): players on foot walk into the wings and stand on them, rovers and cuts meet them. `struck()` and `reach()` add the wings as boxes along the span in the ship's frame (`WING_BOXES`), so a bolt, a ball or a missile on a wing hurts the ship.
- In flight (`pilot()`): the wing tips are pushed out of the brushes' sides like the hull's circles, the wings' undersides (`TOUCH`) lift the ship over the floor under them (banked low, a tip went into the ground) without landing it, and the hull's circles and the tips stop on the other vehicles' bodies (`drive()` hands them in), `SHIP.BOUNCE` of the speed into them sent back. Ships now collide with rovers and with each other.
- A crash: the speed a step's collisions take away (the vertical part halved: sinking onto a pad on C is no crash) is the jolt; past `SHIP.CRASH` (12 m/s) it costs 1 hp each `SHIP.CRASH_HP` (4) more (`Room.crash()`, nobody's shot, the blast its own team's). A wall at the top speed takes 9, at full boost the ship blows up. Piloted or not.
- The lasers' aim (`aimOf()`, the room's `sight()`): the two beams crossed at a fixed `GUN_AIM` (50 m for a rover, 80 m for a ship), so on a rover nearer than that they went either side of it. They now cross on what the look meets within the guns' range (a brush, an enemy vehicle's hull, an enemy on foot as the driver drew him), `AIM_MIN` (8 m) at least; the missiles fly there too, and the reticle shows the same point.
- A rover's crash (`drive()`, `ROVER.CRASH` 10 m/s, `CRASH_HP` 3): the speed on the level that walls and vehicles take away; a landing is the springs' and no crash. A wall at the top speed takes 5. Heard as the ship's `CRASH`.
- Heard (`foley.ts` `ship()`, `sfx/sounds.ts`): the ship has its own looped engine, `JET` (a jet's roar and a turbine's whine, louder and higher with the speed, the thrust and the boost, low on its pad); `CRASH` when a frame takes more speed off it than the engines can; every vehicle's laser bolt is a `BLASTER`, a chirp diving fast from 1.9 kHz, as in the films.

## Vehicle damage (the user, 2026-11-12)

A rover and a ship have `VEHICLE.HP` (10) of health, full when parked afresh. `Room.hurt()` is the one way it goes down; it is the host's alone, like a player's `hp`, and no step reads it, so the driver's replay is unchanged.

| Weapon                      | Takes from a hull                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Plasma ball                 | Its power: 1, up to `CHARGE_MAX` (5) charged                                                                         |
| Laser rifle round           | 1 for every `VEHICLE.GRAZE` (4) that meet the hull, from anyone (a body takes 1 for every 2)                         |
| A vehicle's bolt            | 1 for every `BOLT_GRAZE` (2) that meet the hull, from anyone; a body takes `BOLT_HP` (1) each (the user, 2026-11-16) |
| Rail gun                    | 1 at the first touch, 1 more each `RAIL_DRAIN` ticks while it holds and `RAIL_TICKS` after                           |
| Grenade, a ship's missile   | `blast()`'s rule on the hull: `NADE_HP` (5) on it, less with the distance, nothing from 5 m or behind a brush        |
| Katana                      | The cut's hp (2, heavy 3); an arc of energy its cut's too                                                            |
| Fists, a run-over, a tackle | Nothing                                                                                                              |

- **Whose**: a vehicle is of its driver's team (else its rider's), and of the team whose base it is parked at when empty (`homeOf()`: the first half of the rovers, and of the ships, are red's). A team's shots pass through its own vehicles and take nothing, as for a teammate.
- **Hull and crew**: the hull is the rover's three body circles `BODY_H` tall, the ship's `HITS` spheres (`struck()`, `reach()`, `slashed()` in `rover.ts`). A shot the hull stops does not reach the crew; one that passes over it hits who sits there. A blast takes nothing from who is seated.
- **Lag**: the katana and the rail gun strike the hull where the shooter drew it (`Room.hulls()`, the history keeps the vehicles). Balls, rounds, bolts and grenades fly against it where it is now, like against a player: at a rover's top speed (23 m/s) that is 2.3 m of lead per 100 ms of delay, on a body 4.4 m long.
- **At 0** (`Room.wreck()`): its crew goes down on the spot through `harm()` (flags drop, respawns as usual), the shooter's `hits` goes up once more, a grenade's blast of his goes off at its centre (`boom()`), and it is a wreck for `VEHICLE.WRECK` ticks (5 s): no seat (`nearby()`), not hurt again, solid to who is up and no obstacle to who is down (`solid()`). A rover's wreck keeps `VEHICLE.SKID` of its speed each tick (it stops within 5 m); a ship's falls. Then `renew()` parks it afresh on its spawn. A new match, a new map and an empty room park everything afresh; the kill floor does as before.
- **Wire**: no byte more. The rover's block had three bytes for a ship (kind and armour, wreck, missiles): the first now carries bit 7 the kind and bits 0-6 the health of any vehicle, the second the wreck's ticks in fours rounded up. A map without vehicles sends the same bytes as before.
- **Prediction**: the driver's client takes `hp` from the snapshot and replays `drive()` or `pilot()` as before. When a snapshot shows him off the wheel, the rover he predicted becomes the ghost (`predict.ts`), which skids as the host's wreck does and is eased onto it over `ROVER_BLEND` ms.
- **Seen and heard** (`src/client/wreck.ts`): arcs at 12 fixed places per vehicle (`ANCHORS`), `arcs()` of them by health (none at 10, 1 to 2 from 9 to 7, 4 to 6 from 6 to 4, 9 to 11 under), in an order of the vehicle's own, each a forked bolt in 4 slots of 10 at 30 slots a second (a function of the vehicle, the health and the slot), with sparks, the bolts' light and a crackle; the hull is scorched round them. The explosion: three fireballs, a ring on the ground, 36 pieces of debris, a boom and a shake within 40 m. The wreck: soot, sagged (`pose()`), no lights, smoke; over its last second it crumbles into embers (`char()`); the fresh vehicle shimmers in over half a second. The HUD: ten pips over the speed for who sits in it (`Hud.hull()`, the `tt` tag), a half-size bar over the nearest other vehicle within 14 m (a ship 24 m) in sight.

## Orbit (the user, 2026-11-14)

A ship climbs out of the crater into space and the fight goes on up there, ships against ships. Its goal is the orbital station (below).

- **The seam** (`ORBIT.SEAM`, 300 m, `WorldDef.seam` on the moon): the edge of space. A shot that crosses it either way bursts there (`fly()` in `plasma.ts`, so the host and the predictor agree, missiles included): the ground and the sky never hit each other. The ground's own guns reach 80 m at most; it is the ships' lasers and missiles that it stops.
- **The ceiling** (`SHIP.CEIL` = `ORBIT.TOP`, 960 m, was 120): under the 1024 m a ball's height has on the wire, so the protocol is unchanged. The warning reads `HIGH ORBIT · DESCEND`.
- **The height shown** (`altitude()` in `ship.ts`): the true one up to the seam, then a power of the height over it, to `ORBIT.ALT` (250 km) at the ceiling. Space is small to fly through and looks high. The HUD shows it in km with `ORBIT`.
- **The globe** (`mg()` in the scene shader (`render/shader.ts`)): the moon as a sphere of 1737.4 km seen from `altitude()`, drawn with the sky: its albedo from the regolith's texture, maria from noise, craters on up to eight sizes (`cr()`, many small and a few large, the large ones shallower, a few fresh ones with a pale halo) lit by the sun, the sizes under two pixels or far wider than the view left out. From `GLOBE_FROM` (20 m) up it is the ground past the relief, whose edge (1.25 to 1.6 of the bound) fades into it, so the crater runs on into a plain; over the seam the whole crater fades into it within 250 m of climb, past 260 m from the eye (a ship near by stays sharp).
- **Craters on the ground** (`cs()`): the regolith's shader draws them at 6, 22 and 78 m cells, a bell bowl and a soft rim lit by the sun, on what faces up; the globe's plain carries the same ones on, so the edge does not show. Colour and light only: no vertex, no collision.
- **The stars** (`sk()`): drawn by the sky's shader from the view's direction alone, over the whole sky and behind the globe, so they never slide past a ship. The Earth (`heavens()` in `moonscape.ts`) goes with the eye from `HEAVENS`.
- **Cost**: the globe is shaded once a frame at half the frame's size (`orb`, the scene program's `Y` 2, with the full-size pixel's footprint so it keeps the same craters), scissored to the hangar's mouths inside the station; the sky and the crater fading into it read it off unit 2. A pixel faded through into it skips the ground's shading. The sky is drawn after the world, shaded only where nothing is in front of it; reflections take the sky without it; a crater cell looks at its neighbours on the near side alone. Looking down from a ship, 15.7 ms of GPU a frame at most at any height (40 ms before, 2026-11-19, docs/PERFORMANCE.md).
- **The sun's shadow** now fades past the depth of its window too: from high up the ground under the eye lay past it, a dark square.

Known limit: a missile that bursts just under the seam can still hurt a ship just over it through its blast.

## The orbital station (the user, 2026-11-14)

A side mission: a pilot is told to fly up to a station over the rille; inside he finds the command post and presses its button; a countdown runs for everyone; unless an enemy presses the same button in time, lasers from the station's cannon disintegrate the whole other team, who are back only after 15 s. That leaves his team time to score.

- **Where** (`station()` in `src/shared/station.ts`, `MOON.station`): over (80, 140), the deck at 600 m, between the seam and the ceiling. Symmetric across z like the rest of the map.
- **Its look**, after the user's picture of a satellite and its proportions: a cylinder standing on its axis, 88 m wide and 170 m tall (`HULL`), crinkled gold foil over silver, a domed cap with a small dish, a wing of four solar panels each side (longer than the body, facing either base), and under it the laser cannon: a black aperture barrel seven tenths of the body wide, banded, flared, its red lens glowing, a white sunshade beside it. Drawn once with the scenery by `satellite()` in `src/client/satellite.ts`, from the sizes of `HULL` and `PARTS` (shared). The cylinder, the cannon, the wings, the dome and the dish's mast are ghost brushes (solid, not drawn; the round ones in 4 m slices), so a ship or a shot stops on what it sees.
- **Its plating** (the user, 2026-11-27, after a picture of a big ship's hull): the gold foil keeps to the middle (`foiled()`, the deck + 44 m to the top - 36 m); under it and over it the wall is matte grey plating, each panel of 4 columns by 3 rows a shade apart, and `plating()` in `src/client/station/hull.ts` dresses it: a dark seam up every fourth column, raised plates (half with a smaller one on them) and darker blocks, about one of each a 2 m of height on each half, lines of lit windows (0.7 by 0.45 m, in groups of four to eight) every 10 m up each band, and two trenches round the body (a dark floor between bevelled lips, blocks in it), under the mouths and under the cap. Each piece stands at an angle and its mirror across z, off the mouths and the wings' booms. 17,880 vertices (the station 65,940, from 48,060); `satellite()` takes about 13 ms more to build.
- **Inside**: a hangar along z, 40 m wide and 88 long, runs out to the wall at both ends, so each team's ship flies in from its own side (11 m high at the mouths). Through a doorway in its east wall, behind a sliding door like the base's (the last of `MOON.doors`), the command room with its console (`post`), below. Decor (`hangar()`, the user's asks): pipes with brackets and valves along the walls, ducts and lamps under the roof, a yellow landing circle with its lights where each team's ship sets down (where the bots land), the way out lit (amber chevrons on the deck toward each mouth, a green bar across the mouth's edge, up its sides and under its lintel). Lamps light the hangar and the room while the eye is within 160 m (`lamps()`), red and pulsing while a strike counts down.
- **The command room** (the user, 2026-11-27, after a picture of a throne room): east of the hangar, from its east wall to the window over the axis, 17 m by 26 and 30 m high (`COMMAND` in `src/shared/station.ts`). Ten steps of 0.4 m (under `STEP_H`) climb from the doorway to a 4 m dais, galleries as high along the side walls; the console stands on the dais. The east wall is a round window 22 m across that shows space: the wall there is a ghost, `vista()` adds its square to the sky's rectangle in the rooms (`render.ts`), the hull leaves out every facet that meets the pane (`cut()`) and a tube and a collar (`src/client/station/command.ts`) cover the stepped edge. The wings stand over the hangar's mouths (north and south, `PARTS.WING` 0.54, the panels from 27 m over the deck) so the window looks out between them. `command.ts` dresses the room: the window's frame, spokes and lit arch, lit steps, railings, ribs, screens, beams, two hanging lamps, a chair facing the window. The console's brush is an untinted ghost (a tinted ghost is drawn as furniture on the moon, `furnishing()`): `computer.ts` draws it as a computer (keys, a tower of screens), and `button.ts` its round red button each frame, glowing while READY, sunk into its seat until READY again, and four red beacons that flash while a strike counts down; `lamps()` adds two red beams that sweep the room then, and the klaxon sounds again every 1.5 s for whoever is in the station (`KLAXON`, `play/match.ts`). 15,536 more vertices drawn with the scenery (`hangar()` 22,752, from 6,228; the satellite 64,926, from 65,940); the tube and the collar have one face each, the one seen (two on one plane, split along opposite diagonals, flickered: nothing is culled); the button and beacons 828 a frame within 160 m, 40 µs.
- **The rules** (`Station`, ticked by the room at `TICK_HZ`): READY → a press of USE (E) on foot within `STATION.REACH` (1 m) of the console arms it for the presser's team (ARMED, 30 s). A press by the other team in that time cancels it (COOL, 90 s). At 0 every player of the other team is put down (`harm(Infinity)`, no frag) and held down (`Room.hold()`: `down` kept at `DOWN_TICKS` until the last of the 15 s, the predictor needs nothing new), those already down too; a carried flag drops as usual (STRUCK, 15 s). Then COOL to 90 s from the strike, then READY. A new match, a new map and an empty room reset it; it waits while a match is over.
- **Wire**: two bytes after the doors (`Snapshot.station`: phase, the team that armed it, whole seconds left), the doors' section written even with no door. Only on a map with a station.
- **Seen and heard**: the HUD's line under the score (`mission.ts`, `Hud.mission()`): to a pilot and to who is in the station while it waits (`Secondary mission · fly up to the orbital station`, then `find the command post, press E`), to everyone while a strike is armed (red and blinking for the team that must cancel it), and during the strike; its amber marker points at the hangar from outside and at the console from inside (`marks.ts`, kind `station` or `post`). Banners and sounds come from the phase changes (`beats.ts`: `armed`, `cancelled`, `strike`; `SOUND.ALARM`, `SOUND.STRIKE`). At the strike four red lasers from round the cannon's muzzle (`StationDef.gun`) come down on each of the other team (`Tracer.strike()`), with a burst at the feet; the disintegrated are not drawn, nor their tags, while they wait, and their own HUD reads `DISINTEGRATED`.
- Over the seam, what is above it no longer fades into the globe (`render.ts`): the station, and the ships, stay drawn from afar in orbit.

- **The bots** (`src/shared/sortie.ts`, `Room.errands()`): while the mission waits, or the other team's strike counts down, each team sends at most one bot, the nearest to its ship when the ship stands free on its pad and the bot carries no flag. It boards, flies up in front of its own mouth (`steer()`: the nose on the point, the speed and the height eased so it can still brake), in, down on its circle, out, through the door to the console, and presses; while its team's strike counts down it stands guard there and fights whoever comes; afterwards it boards again, leaves by its own mouth, comes straight down well under the cannon and lands on its pad. From its base a bot cancels a strike with a second or two to spare.
- **A ship left in the station** (`Room.recall()`) goes home to its pad 20 s after the last player has left the station (`STATION.RECALL`), so a team whose pilot died up there can fly the mission again.
