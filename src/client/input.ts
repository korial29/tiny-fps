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
  KeyR: KEY.RELOAD,
};

/** The four direction bits. */
const DIRS = KEY.FORWARD | KEY.BACK | KEY.LEFT | KEY.RIGHT;

/** Two presses of the same direction key this close (ms) are a dash that way. */
export const DOUBLE_TAP_MS = 250;

/** The keys of the step of a dash toward `dir` (a direction bit): only that direction is held with it. */
export const dashKeys = (keys: number, dir: number): number => (keys & ~DIRS) | dir | KEY.DASH;

/** The KEY bit of a KeyboardEvent.code, 0 for a key the game ignores. */
export const keyBit = (code: string): number => BITS[code] ?? 0;

/** A second left press within this of the first (ms) is a double click: the katana's special cut. */
export const DOUBLE_CLICK_MS = 300;

/** The wheel swaps the weapon at most this often (ms): a trackpad's flick is a hundred events, one swap. */
export const WHEEL_MS = 250;

/** The weapon chosen: 1, 2, 3 and 4 on the keyboard. */
export const WEAPON = { GUN: 0, BLADE: 1, RAIL: 2, RIFLE: 3 } as const;

/** The choice after a key: 1 the gun, 2 the katana, 3 the rail gun, 4 the laser rifle, any other key keeps it. */
export const picked = (weapon: number, code: string): number => {
  const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
  return k < 0 ? weapon : k;
};

/** Which of the gun, the katana, the rail gun and the laser rifle a player has; all of them when there is no state yet. */
export const owned = (p?: PlayerState): boolean[] =>
  p
    ? [p.ammo >= 0, !!p.blade, (p.rail ?? -1) >= 0, (p.rifle ?? -1) >= 0]
    : [true, true, true, true];

/**
 * The choice after a step of the own player. Picking the katana, the rail gun or the rifle up switches to
 * it, once; losing every weapon (going down) goes back to the gun; anything else, the gun picked
 * up included, keeps it.
 */
export const chosen = (weapon: number, was?: PlayerState, now?: PlayerState): number => {
  const [a, b] = [owned(was), owned(now)];
  return !now || !b.some(Boolean)
    ? WEAPON.GUN
    : ((was && [WEAPON.BLADE, WEAPON.RAIL, WEAPON.RIFLE].find(k => b[k] && !a[k])) ?? weapon);
};

/** The keys of a step with KEY.BLADE set while the katana is the choice, KEY.RAIL while the rail gun is, KEY.RIFLE while the rifle is. */
export const withWeapon = (keys: number, weapon: number): number =>
  keys | [0, KEY.BLADE, KEY.RAIL, KEY.RIFLE][weapon];

/** The choice the wheel turns to, `dir` 1 or -1: the next weapon he has, round the four. */
export const turned = (weapon: number, dir: number, have: boolean[]): number => {
  for (let k = 1; k <= 4; k++) {
    const n = (weapon + dir * k + 4) % 4;
    if (have[n]) {
      return n;
    }
  }
  return weapon;
};

/** Live look angles and held keys; the loop reads them once per step and per frame. */
export interface Controls {
  /** Radians, [0, 2π). Mouse right turns right, which lowers yaw. */
  yaw: number;
  /** Radians, ±MAX_PITCH. Positive looks up. */
  pitch: number;
  /** KEY bits held now. */
  keys: number;
  /** The chosen weapon (WEAPON: 1, 2, 3 and the wheel). */
  weapon: number;
  /**
   * The KEY bits of the next step, read once per step. Same as `keys`, plus BLADE while the katana
   * is chosen and RAIL while the rail gun is, except for the step right after a double tap: it carries DASH and only the tapped
   * direction, so the dash goes that way whatever else is held, and nothing else is on the wire.
   * The step after a double click carries FIRE and SPECIAL, however short the click was.
   */
  take(): number;
  /** One live step of the own player, its state before and after: a katana or a rail gun picked up is chosen, losing every weapon chooses the gun. */
  track(was?: PlayerState, now?: PlayerState): void;
  /** The canvas holds the pointer lock. */
  locked(): boolean;
  /** Removes every listener. */
  destroy(): void;
}

/**
 * Click the canvas to lock the pointer; while locked the mouse looks, the keys move (WASD, Shift
 * sprints, Space jumps, C crouches, a direction key pressed twice within DOUBLE_TAP_MS dashes that
 * way, the left button fires or cuts and a double click cuts the special, 1, 2 and 3 or the wheel pick
 * the gun, the katana or the rail gun) and M calls `onMute`.
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
  /** When the left button was last pressed (ms), and a double click waiting for its step. */
  let clicked = -Infinity;
  let special = false;
  /** The weapons the own player has as of the last step, for the wheel. */
  let have = owned();
  const c: Controls = {
    yaw: 0,
    pitch: 0,
    keys: 0,
    weapon: WEAPON.GUN,
    take() {
      const keys =
        (pending ? dashKeys(c.keys, pending) : c.keys) | (special ? KEY.FIRE | KEY.SPECIAL : 0);
      pending = 0;
      special = false;
      return withWeapon(keys, c.weapon);
    },
    track: (was, now) => {
      c.weapon = chosen(c.weapon, was, now);
      have = owned(now);
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
      const now = performance.now();
      special ||= now - clicked <= DOUBLE_CLICK_MS;
      clicked = special ? -Infinity : now;
    }
  });
  on(document, 'mouseup', (e: MouseEvent) => {
    if (!e.button) {
      c.keys &= ~KEY.FIRE;
    }
  });
  // The wheel turns to the next weapon he has, down forward and up back, under the lock only.
  on(
    document,
    'wheel',
    (e: WheelEvent) => {
      const now = performance.now();
      if (c.locked() && e.deltaY) {
        e.preventDefault();
        if (now - swapped >= WHEEL_MS) {
          swapped = now;
          c.weapon = turned(c.weapon, Math.sign(e.deltaY), have);
        }
      }
    },
    { passive: false },
  );
  on(document, 'keydown', (e: KeyboardEvent) => {
    const bit = keyBit(e.code);
    if (c.locked()) {
      c.weapon = picked(c.weapon, e.code);
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
