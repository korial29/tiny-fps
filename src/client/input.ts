import { MAX_PITCH } from '../shared/constants';
import { KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';

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

/** The wheel swaps the weapon at most this often (ms): a trackpad's flick is a hundred events, one swap. */
export const WHEEL_MS = 250;

/** Whether the katana is the choice after a key: 1 the gun, 2 the katana, any other key keeps it. */
export const picked = (blade: boolean, code: string): boolean =>
  code == 'Digit1' ? false : code == 'Digit2' ? true : blade;

/**
 * The choice after a step of the own player. Picking the katana up switches to it, once; losing
 * both weapons (going down) goes back to the gun; anything else, the gun picked up included, keeps it.
 */
export const chosen = (blade: boolean, was?: PlayerState, now?: PlayerState): boolean =>
  !now || (!now.blade && now.ammo < 0) ? false : !!now.blade && !!was && !was.blade ? true : blade;

/** The keys of a step with KEY.BLADE set while the katana is the choice. */
export const withBlade = (keys: number, blade: boolean): number =>
  blade ? keys | KEY.BLADE : keys;

/** Live look angles and held keys; the loop reads them once per step and per frame. */
export interface Controls {
  /** Radians, [0, 2π). Mouse right turns right, which lowers yaw. */
  yaw: number;
  /** Radians, ±MAX_PITCH. Positive looks up. */
  pitch: number;
  /** KEY bits held now. */
  keys: number;
  /** The katana is the chosen weapon (1, 2 and the wheel), the gun otherwise. */
  blade: boolean;
  /**
   * The KEY bits of the next step, read once per step. Same as `keys`, plus BLADE while the katana
   * is chosen, except for the step right after a double tap: it carries DASH and only the tapped
   * direction, so the dash goes that way whatever else is held, and nothing else is on the wire.
   */
  take(): number;
  /** One live step of the own player, its state before and after: a katana picked up is chosen, losing both weapons chooses the gun. */
  track(was?: PlayerState, now?: PlayerState): void;
  /** The canvas holds the pointer lock. */
  locked(): boolean;
  /** Removes every listener. */
  destroy(): void;
}

/**
 * Click the canvas to lock the pointer; while locked the mouse looks, the keys move (WASD, Shift
 * sprints, Space jumps, C crouches, a direction key pressed twice within DOUBLE_TAP_MS dashes that
 * way, the left button fires or cuts, 1 and 2 or the wheel pick the gun or the katana) and M calls `onMute`.
 */
export const createInput = (canvas: HTMLCanvasElement, onMute = () => {}): Controls => {
  const ac = new AbortController();
  const on = <T extends EventTarget>(t: T, type: string, cb: (e: never) => void, o = {}) =>
    t.addEventListener(type, cb as EventListener, { signal: ac.signal, ...o });
  /** Direction keys down now, when each was last pressed (ms), and the dash waiting for its step. */
  const down = new Set<string>();
  const tapped = new Map<string, number>();
  let pending = 0;
  let swapped = -Infinity;
  const c: Controls = {
    yaw: 0,
    pitch: 0,
    keys: 0,
    blade: false,
    take() {
      const keys = pending ? dashKeys(c.keys, pending) : c.keys;
      pending = 0;
      return withBlade(keys, c.blade);
    },
    track: (was, now) => void (c.blade = chosen(c.blade, was, now)),
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
  // The wheel swaps the two weapons, under the lock only.
  on(
    document,
    'wheel',
    (e: WheelEvent) => {
      const now = performance.now();
      if (c.locked() && e.deltaY) {
        e.preventDefault();
        if (now - swapped >= WHEEL_MS) {
          swapped = now;
          c.blade = !c.blade;
        }
      }
    },
    { passive: false },
  );
  on(document, 'keydown', (e: KeyboardEvent) => {
    const bit = keyBit(e.code);
    if (c.locked()) {
      c.blade = picked(c.blade, e.code);
    }
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
