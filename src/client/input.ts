import { MAX_PITCH } from '../shared/constants';
import { KEY } from '../shared/types';

/** Radians per pixel of mouse movement. */
const SENS = 0.0025;
const TAU = Math.PI * 2;

const BITS: Record<string, number> = {
  KeyW: KEY.FORWARD,
  ArrowUp: KEY.FORWARD,
  KeyS: KEY.BACK,
  ArrowDown: KEY.BACK,
  KeyA: KEY.LEFT,
  ArrowLeft: KEY.LEFT,
  KeyD: KEY.RIGHT,
  ArrowRight: KEY.RIGHT,
  Space: KEY.JUMP,
};

/** The KEY bit of a KeyboardEvent.code, 0 for a key the game ignores. */
export const keyBit = (code: string): number => BITS[code] ?? 0;

/** Live look angles and held keys; the loop reads them once per step and per frame. */
export interface Controls {
  /** Radians, [0, 2π). Mouse right turns right, which lowers yaw. */
  yaw: number;
  /** Radians, ±MAX_PITCH. Positive looks up. */
  pitch: number;
  /** KEY bits held now. */
  keys: number;
  /** The canvas holds the pointer lock. */
  locked(): boolean;
  /** Removes every listener. */
  destroy(): void;
}

/**
 * Click the canvas to lock the pointer; while locked the mouse looks, the keys move, the left
 * button fires and M calls `onMute`.
 */
export const createInput = (canvas: HTMLCanvasElement, onMute = () => {}): Controls => {
  const ac = new AbortController();
  const on = <T extends EventTarget>(t: T, type: string, cb: (e: never) => void) =>
    t.addEventListener(type, cb as EventListener, { signal: ac.signal });
  const c: Controls = {
    yaw: 0,
    pitch: 0,
    keys: 0,
    locked: () => (canvas.getRootNode() as Document | ShadowRoot).pointerLockElement == canvas,
    destroy: () => ac.abort(),
  };

  on(canvas, 'click', () => {
    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  });
  on(document, 'mousemove', (e: MouseEvent) => {
    if (c.locked()) {
      c.yaw = (((c.yaw - e.movementX * SENS) % TAU) + TAU) % TAU;
      c.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, c.pitch - e.movementY * SENS));
    }
  });
  on(document, 'keydown', (e: KeyboardEvent) => {
    const bit = keyBit(e.code);
    if (e.code == 'KeyM' && !e.repeat && c.locked()) {
      onMute();
    }
    if (bit && c.locked()) {
      c.keys |= bit;
      e.preventDefault();
    }
  });
  // A release counts even without the lock, so a key never sticks.
  on(document, 'keyup', (e: KeyboardEvent) => {
    c.keys &= ~keyBit(e.code);
  });
  // The click that takes the lock lands before it: it does not fire. A release counts without it.
  on(document, 'mousedown', (e: MouseEvent) => {
    if (e.button == 0 && c.locked()) {
      c.keys |= KEY.FIRE;
    }
  });
  on(document, 'mouseup', (e: MouseEvent) => {
    if (e.button == 0) {
      c.keys &= ~KEY.FIRE;
    }
  });
  const release = () => {
    c.keys = 0;
  };
  on(window, 'blur', release);
  on(document, 'pointerlockchange', () => c.locked() || release());
  return c;
};
