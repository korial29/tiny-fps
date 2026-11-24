# Characters

The user's direction, 2026-11-05: focus on the characters, realistic bodies and natural movement, procedural, with no assets (the user's choice over a 3D model with motion capture). Budgets stay: client 40 KB gzip (32.2 KB at the start of this phase), local 16 KB.

Prior art, for the ideas only:

- David Rosen's GDC talk _An Indie Approach to Procedural Animation_ (Overgrowth): a few key poses, smooth interpolation, springs and inverse kinematics.
- Biomechanics gait data: hip, knee and ankle angles over a stride for walking and running.

## Steps

| #   | Step                 | What changes                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Skinned body         | One shared skeleton (`rig.ts`) for the own body and the other runners. A continuous skin, generated from cross-section profiles (shoulders, chest, waist, hips, thighs, calves, arms, hands, head), weighted to the bones and deformed on the CPU each frame: no gaps at the joints, no capsules. Clothes as colour regions on the same skin: jacket in the team colour, trousers, shoes, gloves, a hood. |
| C2  | Natural gait         | Walk, run and sprint cycles from gait tables, with cadence and stride from the speed. Feet planted by inverse kinematics (no sliding). The pelvis drops and rotates, the shoulders counter-rotate, the arms swing with a bent elbow, the head stays steady. A lean with acceleration and in turns. Springs for secondary motion (hood, flag). Inertialised transitions between modes.                     |
| C3  | Moves on the new rig | Jump, double jump, fall, landing, dash, hang, climb, wall-run, slide, crouch, stumble, re-posed on the new skeleton with the C2 layers. The own first-person arms and legs use the same rig and skin, seen from the eye.                                                                                                                                                                                  |

C1, C2 and C3 are done. The other runners wear the skin and move with the gait, and their parkour moves are posed for real (`MOVES`, plus two-bone IK for the hands and feet that touch the world: the lip of a ledge, a wall, the floor of a slide; see `reach()` in `gait.ts`). The own first-person body runs its own gait from the predicted state and draws the same skin without the head (`body(2)`) and with fingered gloves: each frame it puts the head at the camera, leans the trunk with the look, solves the legs again onto the feet the gait planted, and reaches the hands for goals in the camera's space.

The look of the runners (the user, 2026-11-07): the sleeves hang from armpits 10 cm under the shoulder joints, so the arms stand apart from the chest; each runner has two eyes (a white almond with a dark iris, in place of the shades) and a hair colour of his own, picked from eight by his id (`hairOf()` in `skin.ts`), the same for every viewer. The near skin was 3 867 vertices, its budget 3 900.

The head and the face (the user, 2026-11-07, "a more realistic body, many more polygons"): the head is no longer rings written by hand but a surface (`section()`, `face()`, `jaw()` in `skin.ts`). Per height a cross-section of the skull, flatter at the front; the face carved into it along its normal: the nose with its bridge set in and its wings, the brow, sockets and lids over the irises, cheekbones, lips, the chin; under a jaw line it blends into the neck, sharp under the chin, soft at the nape. The ears are pieces of their own, like the eyes. Colours are per triangle corner, so the hairline, the brows and the lips blend instead of stepping. Three levels for the other runners: far (beyond `NEAR`, 10 m) 1 716 vertices drawn, near 7 494, close (within `CLOSE`, 4 m) 21 942, with twice the rings (Catmull-Rom, `finer()`) and half more sides; about 1.5 ms of skinning a close runner. The own body keeps the near rings: 2 628.

## Design tools

**The turntable** (`demo/turntable.html`, served by `npm start`): one character through the game's
own renderer, a row per level of detail at a distance that picks it in a match (close 3.2 m, near
7 m, far 14 m), seen from several angles, with the vertices each level writes. Use it to check a
model change from every side and at every level before and after:
`?role=hunter&views=0,90,180&lods=close,far&set=wield:1`. The page's head comment lists every
parameter. It needs a GPU: in headless Chrome, `--use-angle=metal`, not swiftshader.

**Blender, as a sketchbook** (the user, 2026-11-24). Blender and the
[blender-mcp](https://github.com/ahujasid/blender-mcp) server let an agent block out a shape in
Blender (volumes, proportions, sections, seen from any side) before it is written as code. Nothing
made in Blender enters the game: no `.blend`, glTF or OBJ file and no exported vertex array in the
repo. A shape agreed in Blender is written again with the procedural builders of the model's own
module (rings, sections, `mesh()` pieces), in metres with y up, then compared side by side with
its Blender render on the turntable.

Setup, once: Blender (`brew install --cask blender`), `uv` (`brew install uv`), the add-on
`addon.py` of blender-mcp installed and enabled in Blender, and the server in Claude Code
(`claude mcp add blender -s user -- uvx blender-mcp`, then restart it). Each session: in Blender's
3D view, `N`, the BlenderMCP tab, "Connect to Claude". The server runs any Python inside Blender:
keep it to that sketching.
