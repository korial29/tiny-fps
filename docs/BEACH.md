# Landfall: the beach level (the user, 2026-11-25)

A capture the flag on a Caribbean beach: turquoise water, a wide strand of pale sand, a procedural
forest along it and large rocks at its ends. A huge ship has crashed across the beach, its tail in
the water and its nose in the trees, and cuts the sand between the two camps. Its debris is the
parkour. The mood is the first minutes after a crash on a desert island: a broken hull on the sand,
an engine torn off, a wing standing as a ramp, smoke over a blue lagoon. An original ship and
scene, nothing copied from a film or a series.

## Frame and symmetry

- Metres, y up. Play area x 0..110, z 0..200 (`ZED = 200`). Red's half is z > 100, blue's the
  mirror (z → ZED − z, the red tint to blue), as Tranquility.
- Across x (`FRAME` in `src/shared/beach.ts`): deep water at x = 0, the waterline at x = 30, the
  first trees at x = 90, nothing walked past x = 110. Along z the headlands close the beach before
  z = 8 and after z = 192.
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

The hull lies along x on the centre line z = 100, which is its own plane of symmetry, so it is
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
- North and south: headlands of large rocks, Tranquility's (`rockOf`, `fitted`, `stone()`), as dark
  volcanic rock, wet at the foot.
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
