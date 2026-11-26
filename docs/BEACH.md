# Landfall: the beach level (the user, 2026-11-25)

A capture the flag on a Caribbean beach: turquoise water, a wide strand of pale sand, a procedural
forest along it and large rocks at its ends. A huge ship has crashed across the beach, its tail in
the water and its nose in the trees, and cuts the sand between the two camps. Its debris is the
parkour. The mood is the first minutes after a crash on a desert island: a broken hull on the sand,
an engine torn off, a wing standing as a ramp, smoke over a blue lagoon. An original ship and
scene, nothing copied from a film or a series.

## Frame and symmetry

- Metres, y up. Play area x 0..110, z 0..250 (`ZED = 250`, 200 until 2026-11-26). Red's half is
  z > 125, blue's the mirror (z → ZED − z, the red tint to blue), as Tranquility.
- Across x (`FRAME` in `src/shared/beach.ts`): deep water at x = 0, the waterline at x = 30, the
  first trees at x = 90, nothing walked past x = 110. Along z the sand runs on past each camp to
  the headlands, whose walls stand 10 m past each end, at z = −10 and z = 260.
- The water's surface is y = 0. The sand rises from the waterline to about 2.5 m at the trees and
  the seabed falls to about −3 m at x = 0.
- Full gravity, no vehicle, no helmet: Highline's runners. `scenery: 'beach'`, key `landfall`.
- Sun high over the sea, warm. Blue sky paling to the horizon, a light haze.

## The water (the user, 2026-11-25: no new rule)

The lagoon is waded, not swum. The seabed is relief like the sand; the water is drawn only. Where
the bed is deeper than a runner can stand in (`floor`, `DEPTH` = −1.4 m of feet: the eye is 1.6 m
over them and stays over the drawn surface), the runner is put back at a spawn, as a fall from
Highline's roofs: at about x = 16. A drowned carrier's flag drops on his last ground. No slowdown,
no swimming, no new wire data.

## The wreck

The hull lies along x on the centre line z = 125, which is its own plane of symmetry, so it is
written once and a wing falls in each half. Radius 7 m, sunk 2 m: its back is 12 m over the sand.
Broken in three (`HULL.sections`): the tail x 6..36 in the water, the middle x 44..74 on the sand,
the nose x 82..106 in the trees at the end of the furrow it ploughed, a bank of sand on each side.

Ways across:

1. The two gaps between the sections, on foot, through debris.
2. The inside of the middle section: a hold and a corridor, a door on each side.
3. The high road: each half's wing (`WING`) is a ramp from the sand to the hull's back. Fast, in
   everyone's sights.
4. Round the tail through the lagoon, from floating debris to a torn engine, where the bed is
   too deep to wade.

In each half a field of debris leads from the camp to the wing: hull panels, containers, a landing
gear, an engine nacelle one runs through (`ENGINES`). Every jump is checked with the physics.

Each camp: an escape pod (`POD`) with tarpaulin shelters, the flag by the pod, the racks on crates.

## Edges

- East: the forest. Palms and undergrowth, the first row's trunks solid, a ghost wall behind.
- North and south: headlands of large rocks, Tranquility's forms (`rockOf`, `stone()`), in light
  granite, wet at the foot (see the longer beach below).
- West: the sea, by its depth.

## Pieces

| Piece    | Files                                                     | What                                                                                   |
| -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Contract | `shared/beach.ts` constants, `world.ts`, `maps.ts`, stubs | The frame, the wreck's footprint, a flat playable map                                  |
| Map      | `shared/beach.ts`, `shared/beach.test.ts`                 | Relief, the wreck and the debris as grey boxes, packs, spawns, the tests               |
| Shore    | `client/shore.ts`, the water in `render.ts`               | The sand's mesh, the water, the horizon, the sky                                       |
| Edge     | `client/jungle.ts`                                        | The forest with its levels of detail, the headlands                                    |
| Wreck    | `client/hulk.ts`                                          | The hull, wings, engines, debris and inside, drawn on the map's boxes (after playtest) |
| Bots     | `shared/nav.ts`, `shared/routes.ts`                       | Navigation, 24 bot matches (after playtest)                                            |
| Mood     | `client/sfx.ts`, `demo/`                                  | Smoke, fire, surf, a song, the menu card (after playtest)                              |

Target: 300,000 vertices at most (Tranquility: 436,467), match-frame JavaScript under 8 ms.

## As built (2026-11-25)

- The solid east edge is a ghost wall at x = 95 (`EDGE.east`), just behind the first trunks; the
  forest is drawn from there. The capes' walls are at z = 4 and z = 196.
- Each hull section lies level at its own height (`HULL.axis`): backs at 11, 13.25 and 14.5 m, a
  flat back 5 m wide. The hold's side doors are at x 57.5..60.5.
- The headlands' collision is `massed()`, coarser than Tranquility's `fitted()` (620 ms a half),
  within 0.5 m of the drawn rock. Blue's rocks are drawn on the twins of red's ground.
- The sea is the last of the ground's vertices (`lagoon()`), drawn apart in two blended passes
  after the runners. Paint layers −5 (sea) and −1.09 (sand) are taken.
- `LAYOUT.pieces` lists every drawn box by kind for the wreck's artist.

## The wreck drawn, the mood, the bots (2026-11-25)

- `hulk.ts` draws the ship on the map's boxes, which are ghosts (`LAYOUT.pieces`): 37,839 vertices.
  The hull follows the terraces of `RINGS`, their corners cut, not a circle: a 7 m circle stood up
  to 1.5 m off the ledges runners walk. Worst gap where a body touches: 0.28 m. A wing's top is the
  plane through its steps' upper edges: a foot sinks 0 to 0.47 m in it.
- `smoke.ts`: eight columns over the engines and the hull's broken ends, static balls the shader
  turns to smoke (paint layer −6), one blended draw. `AIRS` in `sfx.ts` is a map's ambience: the
  surf, the wind, insects, fire and gulls, scaled by where the listener stands.
- Bots (`nav.ts`, `routes.ts`, `bot.ts`): no floor within 0.3 m of the kill floor, five routes on
  the centre line a bot is given by its id, the lagoon's legs as links. Over 24 matches: east gap
  1,130 crossings, west 1,053, hold 998, back 801, lagoon 516; no drowning; 113 wins for the north
  camp against 115 for the south with the camps swapped.
- The fires burn (the user, 2026-11-25): `FIRES` in `shared/beach.ts` is where smoke.ts draws the
  columns, sfx.ts crackles and the room burns (`WorldDef.fires`): a body in the flames takes
  `FIRE_HP` at once, then each `FIRE_TICKS` (3 hp a second), nobody's hit. None on a way across:
  the nacelle's fire on the sand east of it, the lagoon engine's on its south-west corner.
- The flag's step is a hatch cover lying flush on the sand (5 cm): a 40 cm step read as a floor
  floating over it.
- Known: a bot can still stand on the middle section's shoulder west of x = 50 (a drop over 8 m);
  the health pack by the hold's door stands on a panel 0.59 m high, a jump.

## The ship reworked (the user, 2026-11-25)

The first wreck read as a pipe in terraces. Its shape was blocked out in Blender with the user
(nothing of it ships), then written again here. What follows replaces the hull, the wings and the
bots' routes described above.

- **Hull** (`SHIP`, `LINES`, `DECKS`, `section()` in `beach.ts`): round and hollow, a shell 0.85 m
  thick, the backs where they were (11, 13.25, 14.5 m). Each section has a floor and two decks: the
  middle one the hold (1.25 m), a deck (4.5 m) and the gallery (8.5 m). Tears in both flanks at
  every level, holes in the back and in the decks offset from one level to the next, the broken
  ends open on the gaps, a crate under every hole that is climbed (a jump, then a pull up).
- **Fairings**: a shoulder along each flank at the belt; on the middle section its top is a ledge
  at 8.5 m, level with the gallery.
- **Wings** (`WING`, `thick()`): from the fairing's ledge down to the sand in three pieces, two
  breaks of 3.6 m crossed by a walking jump or on one of two rails 0.45 m wide. Thin: 0.6 m at the
  root, 0.15 m at the tip, drawn and collided alike. Rows rise 0.15 m at most, so a foot is within
  0.075 m of the drawn plane.
- **Engines**: both flank engines are torn off, one on the sand in each half (`ENGINES[0]`,
  about (38.5, 125.3) for red), burning; the tail keeps its main bell and two stubs.
- **Drawn** (`hulk.ts`): one lofted skin a section with smoothed normals, gloss white (paint layer
  −1.05 under `BEACH`: the sky mirrored with a fresnel, a sun glint, panel lines), soot round the
  tears. A nose after Tranquility's ship, its canopy panes of the skin itself; two canted fins,
  blue's snapped. 67,722 vertices. Worst gap to the collision where a body touches: 0.28 m.
- **The ground under it** (`shore.ts`, `jungle.ts`): the furrow is cracked ash, plates of 0.3 to
  1 m with dark sunk cracks, a few glowing, out to the banks, then scorched sand; the trees ahead
  of the nose are snapped and burnt (`snags`), the undergrowth gone in a fan.
- **Ways across**, a runner from red's spawn to blue's flag: west gap 21.3 s, hold 22.0 s, high
  road (wing, ledge, gallery, wing) 23.1 s by jumps and 25.9 s on the rails, east gap 25.8 s,
  lagoon 26.9 s. The back is also reached from the ledge by two jumps up the skin.
- **Bots**: the nav joins no two floors with a third between them, knows a jump and pull up of at
  most 2.8 m as a link, and keeps five ways on the line (any floor over 4 m is the high road).
  Over 144 matches the camps score 51 % and 49 %.
- Known: fins and stubs are drawn only; the sand banked under a wing's solid rows is a wall; the
  wing's root is free between x 45 and 55; bots rarely go up inside the hull; no frame time was
  measured with the new ship and the ash.

## The cabin and the canopy (the user, 2026-11-26)

The ship carried troops. Its inside now says so, and the canopy is glass.

- **Troop seats** (`troops()`, `ROWS_OF_SEATS` in `hulk.ts`): fold-down rows along both flanks,
  facing in, a seat every 0.55 m: a canvas pan and a webbed back slung from three tubes, legs every
  other seat; down, folded up, hanging broken or gone, a belt's strap dangling now and then. In the
  middle section's hold (x 44.6..57.1 and 60.9..73.4) and deck (44.6..47.3, 55.3..66.8,
  70.7..73.4), on the nose's floor (82.6..88.9, 91.1..94.5) and deck (91.2..94.5). The rows leave
  the doors, the tears, the holes across a deck and the broken ends free, none within 2.9 m of the
  centre line, and stop short of the wall in the trees. Drawn only: they stand 0.22 to 0.64 m off
  the lining, so a runner pressed to the wall passes 0.3 to 0.6 m into them.
- **The flight deck** (`cockpit()`), past x 97 on the upper deck's line, behind the wall in the
  trees: seen, never reached. A floor to the panel (x 101.4), two pilots' seats with their harnesses
  (the co-pilot's torn from its rails and tipped against the pedestal), the pedestal with four
  throttles, two pulled back, the instrument panel under the windscreen and its glare shield, faces
  dim green, amber or dead, the overhead panel torn from its forward mount and hanging, cables
  down from it, and on the floor a fallen panel, a cushion and plates against the flanks.
- **The canopy's glass** (`canopy()`, paint layer `CANOPY` = −7, `CANOPY_GLSL` in `paint.ts`): the
  panes past the arch (x 92) over the sill, no longer of the skin; one pane on each flank broken
  (`SHATTER`, x 98.3..101), shards round it. It is `Decor.glass`, the ground's vertices before the
  smoke and the sea, drawn after the runners in the sea's two blended passes: what it lets through
  multiplied into the frame (dark blue-green, less at a grazing angle), then the sky it mirrors by a
  fresnel term and the sun's glint added. Seen from either side; it writes no depth and casts no
  shadow (the shadow maps draw only the opaque runs).
- **The skin seen from inside**: the hull paint's inner face is dark and matt (`PANEL` in
  `paint.ts`), so the nose round the panes reads as the flight deck's lining with no mesh of its own.
- The nose's front, under and ahead of the canopy, stays opaque skin.
- **Vertices**: 80,886 opaque (67,722 before; the cabin 13,632, drawn first so the skin and the
  linings it hides from inside are not shaded twice) and 576 of glass. The map has no level of
  detail: one count.
- **Frame** (headless Chrome on Metal, 1600 × 900, three runners at 3 m, before and after
  alternated in one series on a loaded machine, medians of the runs not slowed by the load): GPU
  16.6 to 16.9 ms at the spawn (CPU 8.5 to 8.7), 16.7 to 17.1 ms looking down the nose at the flight
  deck from (90, 11.3, 100) (CPU 8.7 to 8.9). Highline unchanged (12.4 to 12.5 ms); Tranquility's
  path is untouched. A first version cost about 1 ms of CPU and 2.6 ms of GPU there (measured
  under load): taking the glass out saved 0.5 ms of GPU, taking the cabin out (with a lining of the
  nose drawn 5 cm inside the skin, after it) another 0.5 ms, both shading the inside twice. Now that
  lining is the skin's own dark inner face, the cabin goes first, and the glass is one run of its
  own whose two passes are skipped when it is out of the frustum.

## The longer beach (the user, 2026-11-26)

The beach is 25 % longer, the camps further apart, and the headlands read as the beach going on.

- `ZED = 250`: the wreck on z = 125. Everything of the wreck's (the hull, the wings, the engines,
  the floats, the lagoon's legs, the debris and the packs on it) keeps its place from the centre
  line, 25 m on in red's half. The camp goes 45 m on: pod (60, 219), flag on the hatch at
  (60, 211), spawns at z 226 and 229, the camp's level sand z 209..229. Into the 20 m between the
  field of debris and the camp went a panel (west), a standing container and the rifle's crate.
  The line of debris's first panel and container are lower (0.65 m, 1.875 m over the sand): the
  dunes are higher there than on the camp's level sand, and the jumps keep their steps.
- The lattice (`relief.origin`, `NODE` in `beach.ts`) runs through z = 1, so a row of nodes lies on
  the centre line and every node has its twin (250 / 4 is not whole). The sand round the wreck is
  node for node what it was round z = 100.
- The headland (the user, second pass): the beach is seen to go on. Behind the camp, ten low
  blocks scattered on the sand (`ROCKS`, solid), bigger toward the trees where the mass begins;
  along the waterline open sand. The wall at z = ZED − `EDGE.cape` = 260 stands on open sand there,
  unseen, and the drawn sand and sea run on past it to a few stacks standing in the sea and a reef.
  Past the wall, drawn only: low blocks thinning out on the sand, the mass on the trees' side as
  tors (a block or two set on a wide one, `lift` in jungle.ts), stepping up inland; the forest's
  line runs 70 m past the end on the trees' side only (from x = 80). `massed()` is finer on a low
  block (1 m strips, 1 m layers): 356 boxes for both headlands, 851 brushes in all (1,007 before).
  The palms' first row is 28 trunks a side.
- The blocks' form is `blockOf()` in `beach.ts`, not moon.ts `rockOf()`: superellipsoids of the
  powers 4 and 8 blended (flat faces, rounded edges), turned and stretched by the seed, sheared by
  two steep planes, dented by a low noise. jungle.ts turns each triangle's normals a quarter of the
  way to its face's, so the faces read.
- Granite (`GRANITE` in `granite.ts`, compiled under `BEACH` for TEX.ROCK only), from large to small:
  a tone warmer and cooler over metres (what is seen from afar), dark weathering streaks down the
  steep faces, lichen in patches (pale or dark) on those facing up, thin dark cracks and a few pale
  veins, then interlocking crystals of about 6 cm (a cheap Voronoi on a warped lattice: white and
  pinkish feldspar, grey and smoky quartz) with black mica in uneven clusters, and laths of pink
  feldspar up to 10 cm in patches. Each scale fades to its mean with distance. Tranquility's basalt
  is untouched. The rocks' vertex shade is 0.72 to 0.86 (it was 0.4 to 0.6), the wet foot as before.
- The granite's GLSL comes with Landfall's chunk (`Decor.rock`, `granite.ts`), spliced into the map's
  program by `fragOf()`: not in the main bundle. Every scale a pixel no longer holds is skipped, not
  faded; the noises are shared. At 1600 × 900 (headless Chrome, Metal), the granite costs about
  3 ms of GPU with a boulder filling half the screen (it cost 8 ms all on), and the camp's view is
  1 ms cheaper than master's.
- Vertices, the drawn level without smoke: 257,634 → 262,734 (sand 35,232 → 40,440, sea 13,908 →
  16,008, rocks 51,756 → 45,006, palms 29,736 → 39,648, forest, undergrowth and canopy 55,872 →
  51,624). Ways across, red's spawn to blue's flag side (beach.test.ts): east gap 23.4 → 27.8 s,
  west gap 19.0 → 23.4 s, hold 19.7 → 24.1 s, high road 22.5 → 24.8 s, rails 23.5 → 27.9 s, lower
  deck 20.8 → 25.1 s, lagoon 19.8 → 22.7 s.
