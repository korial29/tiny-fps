import { MAX_PITCH } from '../shared/constants';
import { EV, KEY } from '../shared/types';
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
  // A on AZERTY. Held like Space: move() reads the press off it, toward the keys held (forward without one).
  KeyQ: KEY.DASH,
  KeyR: KEY.RELOAD,
  // Held: the host and ride() read the press off it.
  KeyE: KEY.USE,
};

/** The keys that pick a weapon, in WEAPON's order, and the ones that act on a press: mute, and the rifle's grenade. */
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
const [MUTE, NADE] = ['KeyM', 'KeyG'];

/** Every KeyboardEvent.code the game reads: the title screen's controls must tell them all. */
export const CODES: readonly string[] = [...Object.keys(BITS), ...DIGITS, MUTE, NADE];

/** The four direction bits. */
const DIRS = KEY.FORWARD | KEY.BACK | KEY.LEFT | KEY.RIGHT;

/** Two presses of the same direction key this close (ms) are a dash that way. */
export const DOUBLE_TAP_MS = 250;

/** The keys of the step of a dash toward `dir` (a direction bit): only that direction is held with it. */
export const dashKeys = (keys: number, dir: number): number => (keys & ~DIRS) | dir | KEY.DASH;

/** The KEY bit of a KeyboardEvent.code, 0 for a key the game ignores. */
export const keyBit = (code: string): number => BITS[code] ?? 0;

/** A second press within this of the first (ms) is a double click: the katana's special of the cut (left), the xenomorph's tail special (right or G). */
export const DOUBLE_CLICK_MS = 300;

/** The wheel swaps the weapon at most this often (ms): a trackpad's flick is a hundred events, one swap. */
export const WHEEL_MS = 250;

/** The weapon chosen: 1 through 5 on the keyboard. */
export const WEAPON = { GUN: 0, BLADE: 1, RAIL: 2, RIFLE: 3, FISTS: 4 } as const;

/** The choice after a key: 1 the gun, 2 the katana, 3 the rail gun, 4 the laser rifle, any other key keeps it. */
export const picked = (weapon: number, code: string): number => {
  const k = DIGITS.indexOf(code);
  return k < 0 ? weapon : k;
};

/** Which of the gun, the katana, the rail gun and the laser rifle a player has; all of them when there is no state yet. */
export const owned = (p?: PlayerState): boolean[] =>
  p
    ? [p.ammo >= 0, !!p.blade, (p.rail ?? -1) >= 0, (p.rifle ?? -1) >= 0, true]
    : [true, true, true, true, true];

/**
 * Follow the spawn's weapon and switch to newly picked-up special weapons unless fists are selected.
 */
export const chosen = (weapon: number, was?: PlayerState, now?: PlayerState): number => {
  if (!now || now.down) {
    return WEAPON.GUN;
  }
  if (!was || was.down || now.ev & EV.RESPAWN) {
    return +!!now.wield;
  }
  const [a, b] = [owned(was), owned(now)];
  return weapon === WEAPON.FISTS ? weapon : ([1, 2, 3].find(k => b[k] && !a[k]) ?? weapon);
};

/** The keys of a step with KEY.BLADE set while the katana is the choice, KEY.RAIL while the rail gun is, KEY.RIFLE while the rifle is. */
export const withWeapon = (keys: number, weapon: number): number =>
  keys | [0, KEY.BLADE, KEY.RAIL, KEY.RIFLE, KEY.FISTS][weapon];

/** The choice the wheel turns to, `dir` 1 or -1: the next weapon he has, including fists. */
export const turned = (weapon: number, dir: number, have: boolean[]): number => {
  for (let k = 1; k <= DIGITS.length; k++) {
    const n = (weapon + dir * k + DIGITS.length) % DIGITS.length;
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
  /** At a ship's stick (the client sets it): a press of G or of the right button is a missile whatever the weapon. */
  pilot: boolean;
  /**
   * Playing the xenomorph (the client sets it): the right button strikes with the tail as FIRE cuts
   * with the katana, KEY.BLADE while it is held (a charge at the strike's top), with SPECIAL on the
   * step after a double click of it (the special); G is a short press of it.
   */
  beast: boolean;
  /**
   * The KEY bits of the next step, read once per step. Same as `keys`, plus BLADE while the katana
   * is chosen and RAIL while the rail gun is, except for the step right after a double tap: it carries DASH and only the tapped
   * direction, so the dash goes that way whatever else is held, and nothing else is on the wire.
   * The step after a press of G or of the right button carries SPECIAL: the katana's special cut
   * with it in hand, a grenade with the rifle, a missile at a ship's stick (step() ignores it with
   * the other guns).
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
 * sprints, Space jumps, Q dashes, C crouches, E gets in and out of a rover, a direction key pressed twice within DOUBLE_TAP_MS dashes that
 * way, the left button fires or cuts, G or the right button cuts the katana's special or launches a
 * grenade with the rifle, 1, 2 and 3 or the wheel pick
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
  /** G (or the right button, but for the xenomorph) pressed, waiting for its step: the katana's special, a grenade with the rifle, a missile at a ship's stick. */
  let nade = false;
  /** A double left click, waiting for its step, and when the left button was last pressed (ms): the katana's special of the cut. */
  let special = false;
  let clicked = -Infinity;
  /** The right button pressed, waiting for its step, held now, and when it was last pressed (ms): the xenomorph's tail. */
  let sting = false;
  let stinging = false;
  let stung = -Infinity;
  let twist = false;
  /** The weapons the own player has as of the last step, for the wheel. */
  let have = owned();
  const c: Controls = {
    yaw: 0,
    pitch: 0,
    keys: 0,
    weapon: WEAPON.GUN,
    pilot: false,
    beast: false,
    take() {
      const moved = pending ? dashKeys(c.keys, pending) : c.keys;
      if (c.beast) {
        const keys =
          moved |
          (nade || sting || stinging ? KEY.BLADE : 0) |
          (twist ? KEY.BLADE | KEY.SPECIAL : 0);
        pending = 0;
        nade = sting = twist = false;
        return keys;
      }
      const keys =
        moved |
        (nade ? KEY.SPECIAL : 0) |
        (special && !c.pilot && c.weapon != WEAPON.RIFLE ? KEY.FIRE | KEY.SPECIAL : 0);
      pending = 0;
      nade = special = sting = false;
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
  // The xenomorph's tail: held, it charges at the top of its strike; it strikes on the release.
  const tail = () => {
    const now = performance.now();
    [sting, stinging] = [true, true];
    twist ||= now - stung <= DOUBLE_CLICK_MS;
    stung = twist ? -Infinity : now;
  };
  // The left button fires, under the lock only; a release always counts. The right one stings
  // with the xenomorph's tail.
  on(document, 'mousedown', (e: MouseEvent) => {
    if (c.locked() && e.button == 2) {
      // On every weapon and vehicle the right button is G (the user, 2026-11-16); the xenomorph's is its tail.
      nade ||= !c.beast;
      tail();
    }
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
    if (e.button == 2) {
      stinging = false;
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
    if (e.code == MUTE && !e.repeat && c.locked()) {
      onMute();
    }
    if (e.code == NADE && !e.repeat && c.locked()) {
      // The xenomorph's G is its tail, held as the right button is (the user, 2026-11-17).
      if (c.beast) {
        tail();
      } else {
        nade = true;
      }
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
    if (e.code == NADE) {
      stinging = false;
    }
  });
  const release = () => {
    c.keys = pending = 0;
    sting = stinging = false;
    down.clear();
    tapped.clear();
  };
  on(window, 'blur', release);
  on(document, 'pointerlockchange', () => c.locked() || release());
  return c;
};
