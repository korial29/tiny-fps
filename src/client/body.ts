// The own player's body in first person, Mirror's Edge style: the runners' skin (skin.ts) on the rig
// (rig.ts), posed by its own gait (gait.ts) from the predicted state and seen from its head, which
// is left out. The gait gives the stride, the trunk and the feet it plants. Here the body is moved
// so that its head sits at the camera, leaned with the look, the legs are solved again onto the
// planted feet and the hands are put on goals placed in the view: the frame edges on a run, the
// ledge on a hang, the wall on a wall-run. Drawn by the renderer over a cleared depth, like a view
// model. No DOM, pure but for the state it keeps.
export * from './body/types';
export * from './body/constants';
export * from './body/hunter';
export * from './body/reach';
export * from './body/wield';
export * from './body/fingers';
export * from './body/glove';
export * from './body/hands';
export * from './body/motion';
export * from './body/create';
