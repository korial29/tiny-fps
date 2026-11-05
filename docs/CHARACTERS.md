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

C1 and C2 are done: the other runners wear the skin and move with the gait. The own first-person body is done too (the part of C3 that is the eye's): `body.ts` runs its own gait from the predicted state and draws the same skin without the head (`body(2)`). Each frame it puts the head at the camera, leans the trunk with the look, solves the legs again onto the feet the gait planted, and reaches the hands for goals in the camera's space (frame edges on a run, the ledge on a hang or climb, the wall on a wall-run, forward on a dash, one low in a slide). The parkour moves of the runners still use the gait's stand-in poses (`MOVES`); they are the rest of C3.
