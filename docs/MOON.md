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

| | before (#190) | now | asked |
| --- | --- | --- | --- |
| median | 0.69 m | 0.13 m | 0.15 m |
| nine in ten | 1.62 m | 0.29 m | |
| nineteen in twenty | 1.97 m | 0.36 m | 0.3 m |
| ninety-nine in a hundred | 2.67 m | 0.50 m | |
| worst | 3.71 m | 1.05 m | 0.45 m |
| a box out of the rock, worst | 0.09 m | 0.08 m | 0.1 m |

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

### More craters, three pits, rims with an outline (2026-11-11)

- `BOWLS` in `src/shared/moon.ts` has 16 entries (31 craters with the twins, 9 to 46 m in radius): the old ones, ten more, some as secondaries on a big one's rim. Each rim wanders with the bearing (0.03 to 0.075 of the radius high, up to 10 % nearer or further), from two noises of the unit vector from the middle (no angle, so no `Math.atan2` in the lattice).
- **Pits.** The Bowl and the twins at (-4, 364) and (-4, -84) are a level terrace (22 m and more, about 5 m down) and one wall up to the rim; in the terrace a pit is cut (`PITS`, `pit()`): 9 m in radius, wandering by 12 %, its floor a brush at `PIT_FLOOR` (-19), 18 m and more under the crest. The lattice cannot carry a cliff (the relief is a floor at any height), so the pit is made as the rille's notches are: a row of void a metre of z at a time, each a pit of the relief, the terrace round it as brushes level with the relief, the wall their sides. The kill floor went from -20 to -26 for it (7 m under the pits' floors, still over the rille's bottom at -30); nothing else reads it but the fall of a body or a rover.
- A pit traps a rover by design: one that drives in lands on its wheels 13 to 15 m down, is not lost (it is over the kill floor) and cannot drive out; its crew walks out. The way out on foot is a flight of six steps against the east wall, each 1.3 m deep and 2 m high (a jump at half gravity rises 2.45 m); the other walls are not climbed (tested). Blocks stand round the edge and the terrace darkens toward it. The Bowl's wreck is on its pit's floor.
- Every other crater is walked and driven out of (tested from each middle).
- Drawn only (`moonscape.ts`): `pits()` (the terrace to an outline through the rows, never short of a brush's edge, the walls in basalt, the floor, a rock on each step, the blocks); `rims()`, a band of detail on the rim of each crater of 12 m and more, five rings 1.2 m apart round the crest, a point every 1.5 m, laid on the lattice and 4 to 25 cm proud of it (it does not replace the lattice's triangles): the crest raised and light, the inner ring dark and streaked; stones on the crests and blocks thrown out; lighter rays in the ground's tone; 72 small craters in the field (were 60), their rims broken by a hash. 437,511 vertices (cap 440,000), 614 brushes (cap 640).

## The combat ships (2026-11-11)

The user: the draft shuttle on each pad becomes a combat ship a player boards and flies, up to a limit. Their choices: arcade controls, lasers and missiles, a ceiling plus the crater's edge, a ship that can be shot down and comes back.

- `MOON.ships` stands one on each pad, nose toward the other base. The shuttle's brush and its three ghosts are gone; the ship is a solid body (`shipHull()`) players walk into and stand on, as a rover.
- `src/shared/ship.ts` is the simulation: a `Rover` with `ship` set, so it shares the rovers' seats, snapshot slot (three bytes more a vehicle: kind and armour, wreck time, missiles), prediction and chase camera. `rover.ts` hands it to `pilot()` wherever it would `drive()`. One seat; a flag's carrier does not fly.
- Controls: the look aims the nose, W and S thrust and brake, A and D slide, Space and C climb and sink, Shift boosts, a click fires the two lasers (bolts, as the rover's), G a missile (a grenade at 60 m/s from a pod, `NADE` burst). Four missiles, one loaded back every 5 s. With nobody at the stick it falls to a floor.
- The limit: the climb fades over the last 20 m under `CEIL` (120 m) and a push brings it back past it; the same at `EDGE` (0.88 of the crater's bound). Never more than 12 m past either. The HUD warns from half way into the last 20 m.
- Armour 60: a bolt or a rifle round takes 1, a plasma ball 2 per point of power, a missile's burst up to 14 within 7 m of the hull. Only a piloted enemy ship is hit; the hull stops the shot before its pilot. At 0 it blows up where it is, its pilot goes down, and it is back new on its pad 10 s later.

Known limits: the rail gun and the katana do not touch a ship; ships do not collide with rovers or each other in flight (a rover stops on a parked one); a pilot's own missile burst can still reach him.
