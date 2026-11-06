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
  ShiftLeft: KEY.SPRINT,
  ShiftRight: KEY.SPRINT,
  // Not Ctrl: Ctrl+W closes the tab and the browser keeps it.
  KeyC: KEY.CROUCH,
};

/** The four direction bits. */
const DIRS = KEY.FORWARD | KEY.BACK | KEY.LEFT | KEY.RIGHT;

/** Two presses of the same direction key this close (ms) are a dash that way. */
export const DOUBLE_TAP_MS = 250;

/** The keys of the step of a dash toward `dir` (a direction bit): only that direction is held with it. */
export const dashKeys = (keys: number, dir: number): number => (keys & ~DIRS) | dir | KEY.DASH;

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
  /**
   * The KEY bits of the next step, read once per step. Same as `keys`, except for the step right
   * after a double tap: it carries DASH and only the tapped direction, so the dash goes that way
   * whatever else is held, and nothing else is on the wire.
   */
  take(): number;
  /** The canvas holds the pointer lock. */
  locked(): boolean;
  /** Removes every listener. */
  destroy(): void;
}

/**
 * Click the canvas to lock the pointer; while locked the mouse looks, the keys move (WASD, Shift
 * sprints, Space jumps, C crouches, a direction key pressed twice within DOUBLE_TAP_MS dashes that
 * way, the left button fires) and M calls `onMute`.
 */
export const createInput = (canvas: HTMLCanvasElement, onMute = () => {}): Controls => {
  const ac = new AbortController();
  const on = <T extends EventTarget>(t: T, type: string, cb: (e: never) => void) =>
    t.addEventListener(type, cb as EventListener, { signal: ac.signal });
  /** Direction keys down now, when each was last pressed (ms), and the dash waiting for its step. */
  const down = new Set<string>();
  const tapped = new Map<string, number>();
  let pending = 0;
  const c: Controls = {
    yaw: 0,
    pitch: 0,
    keys: 0,
    take() {
      const keys = pending ? dashKeys(c.keys, pending) : c.keys;
      pending = 0;
      return keys;
    },
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
  // The left button fires, under the lock only; a release always counts. The right one does nothing.
  on(document, 'mousedown', (e: MouseEvent) => {
    if (c.locked() && !e.button) {
      c.keys |= KEY.FIRE;
    }
  });
  on(document, 'mouseup', (e: MouseEvent) => {
    if (!e.button) {
      c.keys &= ~KEY.FIRE;
    }
  });
  on(document, 'keydown', (e: KeyboardEvent) => {
    const bit = keyBit(e.code);
    if (e.code == 'KeyM' && !e.repeat && c.locked()) {
      onMute();
    }
    if (bit && c.locked()) {
      // A press is a key going down: an auto-repeat is a hold, not a second tap.
      if (bit & DIRS && !e.repeat && !down.has(e.code)) {
        const now = performance.now();
        const before = tapped.get(e.code);
        if (before !== undefined && now - before <= DOUBLE_TAP_MS) {
          pending = bit;
          tapped.delete(e.code);
        } else {
          tapped.set(e.code, now);
        }
      }
      down.add(e.code);
      c.keys |= bit;
      e.preventDefault();
    }
  });
  // A release counts even without the lock, so a key never sticks.
  on(document, 'keyup', (e: KeyboardEvent) => {
    down.delete(e.code);
    c.keys &= ~keyBit(e.code);
  });
  const release = () => {
    c.keys = pending = 0;
    down.clear();
    tapped.clear();
  };
  on(window, 'blur', release);
  on(document, 'pointerlockchange', () => c.locked() || release());
  return c;
};
