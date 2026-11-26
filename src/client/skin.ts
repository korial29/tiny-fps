// The runner's body: one closed surface generated once per level of detail in the rest pose from
// rings (a cross-section at stations along the trunk, each limb), weighted to the rig's joints and
// deformed on the CPU by dual quaternion skinning, which keeps the volume of a bent joint. The
// trunk runs from the crotch to the crown; the arms hang on it at the armpits and the legs at the
// crotch by sharing its vertices, so normals flow over the joins. Clothes are colour regions of
// the triangles. See rig.ts for the joints and the pose.
export * from './skin/head';
export * from './skin/lofts';
export * from './skin/shape';
export * from './skin/pose';
