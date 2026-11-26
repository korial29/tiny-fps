// The runners' natural gait on the rig (rig.ts). Walk, run and sprint are a few numbers per gait,
// blended by speed. A foot on the ground stays where it landed (two-bone IK), the pelvis sits where
// the stance legs put it, and a swing foot flies from where it left to where the stride will land
// it. The other moves are static poses (MOVES) eased in by critically damped springs, so a switch
// never pops. Everything is in the runner's frame: x right, y up, -z ahead. No DOM.
export * from './gait/types';
export * from './gait/maths';
export * from './gait/constants';
export * from './gait/moves';
export * from './gait/fists';
export * from './gait/create';
