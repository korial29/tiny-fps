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
