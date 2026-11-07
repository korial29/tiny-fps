// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, EAST, NORTH, WEST } from '../../test/yard';
import { DASH_SPEED, MAX_PITCH } from '../shared/constants';
import { EV, KEY } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { STILL } from '../shared/physics';
import {
  DOUBLE_CLICK_MS,
  DOUBLE_TAP_MS,
  WHEEL_MS,
  chosen,
  createInput,
  dashKeys,
  keyBit,
  picked,
  turned,
  WEAPON,
  withWeapon,
} from './input';
import type { Controls } from './input';

describe('keyBit', () => {
  it('maps WASD and the arrows by code, and ignores the rest', () => {
    expect(keyBit('KeyW')).toBe(KEY.FORWARD);
    expect(keyBit('ArrowUp')).toBe(KEY.FORWARD);
    expect(keyBit('KeyS')).toBe(KEY.BACK);
    expect(keyBit('KeyA')).toBe(KEY.LEFT);
    expect(keyBit('ArrowRight')).toBe(KEY.RIGHT);
    expect(keyBit('Space')).toBe(KEY.JUMP);
    expect(keyBit('KeyQ')).toBe(0);
  });

  it('maps Shift to the sprint and C to the crouch, and not Ctrl, nor E (the dash is a double tap)', () => {
    expect(keyBit('ShiftLeft')).toBe(KEY.SPRINT);
    expect(keyBit('ShiftRight')).toBe(KEY.SPRINT);
    expect(keyBit('KeyE')).toBe(0);
    expect(keyBit('KeyC')).toBe(KEY.CROUCH);
    // Ctrl+W closes the tab: the game must not ask for it.
    expect(keyBit('ControlLeft')).toBe(0);
  });
});

const player = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ammo: 30,
  ...o,
});

describe('the weapon choice', () => {
  const { GUN, BLADE, RAIL } = WEAPON;
  it('picks the gun on 1, the katana on 2 and the rail gun on 3, and keeps the choice on any other key', () => {
    expect(picked(BLADE, 'Digit1')).toBe(GUN);
    expect(picked(GUN, 'Digit2')).toBe(BLADE);
    expect(picked(BLADE, 'Digit2')).toBe(BLADE);
    expect(picked(GUN, 'Digit3')).toBe(RAIL);
    expect(picked(RAIL, 'KeyW')).toBe(RAIL);
    expect(picked(GUN, 'Digit4')).toBe(GUN);
  });

  it('sets KEY.BLADE exactly while the katana is chosen, KEY.RAIL while the rail gun is', () => {
    expect(withWeapon(KEY.FORWARD | KEY.FIRE, BLADE)).toBe(KEY.FORWARD | KEY.FIRE | KEY.BLADE);
    expect(withWeapon(KEY.FORWARD | KEY.FIRE, RAIL)).toBe(KEY.FORWARD | KEY.FIRE | KEY.RAIL);
    expect(withWeapon(KEY.FORWARD | KEY.FIRE, GUN)).toBe(KEY.FORWARD | KEY.FIRE);
    expect(withWeapon(KEY.BLADE, GUN)).toBe(KEY.BLADE);
  });

  it('switches to the katana or the rail gun when it is picked up, once, and keeps the choice after', () => {
    const gun = player();
    const both = player({ blade: true });
    expect(chosen(GUN, gun, both)).toBe(BLADE);
    // Switching back to the gun by hand sticks: the next steps are not a pickup.
    expect(chosen(GUN, both, both)).toBe(GUN);
    expect(chosen(BLADE, both, both)).toBe(BLADE);
    expect(chosen(GUN, both, player({ blade: true, rail: 10 }))).toBe(RAIL);
  });

  it('does not switch to the katana at the first state, or when it was already carried', () => {
    expect(chosen(GUN, undefined, player({ blade: true }))).toBe(GUN);
    expect(chosen(GUN, player({ blade: true }), player({ blade: true }))).toBe(GUN);
  });

  it('does not go back to the gun when the gun is picked up later', () => {
    const blade = player({ blade: true, ammo: -1 });
    const both = player({ blade: true, ammo: 30 });
    expect(chosen(BLADE, blade, both)).toBe(BLADE);
    expect(chosen(GUN, blade, both)).toBe(GUN);
  });

  it('goes back to the gun on losing every weapon, going down', () => {
    const both = player({ blade: true, rail: 3 });
    expect(chosen(RAIL, both, player({ blade: false, ammo: -1, down: 60 }))).toBe(GUN);
    // Losing only some of them is not that.
    expect(chosen(BLADE, both, player({ blade: false }))).toBe(BLADE);
    expect(chosen(BLADE, both, player({ blade: true, ammo: -1 }))).toBe(BLADE);
    expect(chosen(RAIL, both, player({ ammo: -1, rail: 3 }))).toBe(RAIL);
    expect(chosen(BLADE, both, undefined)).toBe(GUN);
  });

  it('turns the wheel to the next weapon he has, either way', () => {
    expect(turned(GUN, 1, [true, true, true])).toBe(BLADE);
    expect(turned(GUN, -1, [true, true, true])).toBe(RAIL);
    expect(turned(GUN, 1, [true, false, true])).toBe(RAIL);
    expect(turned(RAIL, 1, [true, false, true])).toBe(GUN);
    expect(turned(BLADE, 1, [false, true, false])).toBe(BLADE);
  });
});

describe('createInput', () => {
  let canvas: HTMLCanvasElement;
  let ctl: Controls;
  const lock = (on: boolean) => {
    Object.defineProperty(document, 'pointerLockElement', {
      value: on ? canvas : null,
      configurable: true,
    });
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  const key = (type: string, code: string) =>
    document.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true }));
  const move = (movementX: number, movementY: number) => {
    const e = new MouseEvent('mousemove');
    Object.defineProperties(e, {
      movementX: { value: movementX },
      movementY: { value: movementY },
    });
    document.dispatchEvent(e);
  };

  const make = (onMute?: () => void) => {
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    ctl = createInput(canvas, onMute);
  };
  afterEach(() => {
    ctl.destroy();
    canvas.remove();
    lock(false);
  });

  it('ignores the mouse and the keys until the pointer is locked', () => {
    make();
    move(100, 100);
    key('keydown', 'KeyW');
    expect([ctl.yaw, ctl.pitch, ctl.keys]).toEqual([0, 0, 0]);
  });

  it('turns right with the mouse right, looks up with the mouse up', () => {
    make();
    lock(true);
    move(100, -40);
    expect(ctl.yaw).toBeCloseTo(2 * Math.PI - 0.25);
    expect(ctl.pitch).toBeCloseTo(0.1);
  });

  it('clamps the pitch and wraps the yaw into [0, 2π)', () => {
    make();
    lock(true);
    move(0, -1e6);
    expect(ctl.pitch).toBe(MAX_PITCH);
    move(0, 1e6);
    expect(ctl.pitch).toBe(-MAX_PITCH);
    move(-1e6, 0);
    expect(ctl.yaw).toBeGreaterThanOrEqual(0);
    expect(ctl.yaw).toBeLessThan(2 * Math.PI);
  });

  it('holds keys while down and combines them', () => {
    make();
    lock(true);
    key('keydown', 'KeyW');
    key('keydown', 'Space');
    expect(ctl.keys).toBe(KEY.FORWARD | KEY.JUMP);
    key('keyup', 'KeyW');
    expect(ctl.keys).toBe(KEY.JUMP);
  });

  it('sprints on Shift and crouches on C, together with the move keys', () => {
    make();
    lock(true);
    for (const code of ['KeyW', 'ShiftLeft', 'KeyC']) {
      key('keydown', code);
    }
    expect(ctl.keys).toBe(KEY.FORWARD | KEY.SPRINT | KEY.CROUCH);
    key('keyup', 'ShiftLeft');
    key('keyup', 'KeyC');
    expect(ctl.keys).toBe(KEY.FORWARD);
  });

  describe('the dash', () => {
    let clock = 0;
    beforeEach(() => {
      clock = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => clock);
    });
    afterEach(() => vi.restoreAllMocks());

    /** A press and a release of `code`, `gap` ms after the last one began. */
    const tap = (code: string, gap = 0) => {
      clock += gap;
      key('keydown', code);
      key('keyup', code);
    };
    const DIRS: [string, string, number][] = [
      ['KeyW', 'ArrowUp', KEY.FORWARD],
      ['KeyS', 'ArrowDown', KEY.BACK],
      ['KeyA', 'ArrowLeft', KEY.LEFT],
      ['KeyD', 'ArrowRight', KEY.RIGHT],
    ];

    it.each(
      DIRS.flatMap(
        ([wasd, arrow, bit]) =>
          [
            [wasd, bit],
            [arrow, bit],
          ] as [string, number][],
      ),
    )('a double tap of %s sends one step with DASH and that direction alone', (code, bit) => {
      make();
      lock(true);
      tap(code);
      expect(ctl.take()).toBe(0);
      tap(code, DOUBLE_TAP_MS - 10);
      expect(ctl.take()).toBe(bit | KEY.DASH);
      // Once: the next step has no dash.
      expect(ctl.take()).toBe(0);
    });

    it('is slow to be one: a second press after the window is a first tap', () => {
      make();
      lock(true);
      tap('KeyW');
      tap('KeyW', DOUBLE_TAP_MS + 10);
      expect(ctl.take()).toBe(0);
      // And it starts a window of its own.
      tap('KeyW', 100);
      expect(ctl.take()).toBe(KEY.FORWARD | KEY.DASH);
    });

    it('needs the same key twice, not two different ones, and does not chain into a third tap', () => {
      make();
      lock(true);
      tap('KeyW');
      tap('KeyD', 50);
      expect(ctl.take()).toBe(0);
      tap('KeyW', 50);
      expect(ctl.take()).toBe(KEY.FORWARD | KEY.DASH);
      tap('KeyW', 50);
      expect(ctl.take()).toBe(0);
    });

    it('does not repeat while the key is held, with or without auto-repeat events', () => {
      make();
      lock(true);
      key('keydown', 'KeyW');
      for (let k = 0; k < 5; k++) {
        clock += 40;
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', repeat: true }));
        key('keydown', 'KeyW');
      }
      expect(ctl.take()).toBe(KEY.FORWARD);
      expect(ctl.take()).toBe(KEY.FORWARD);
    });

    it('keeps moving after the dash while the second press is held, and sends the tapped direction only', () => {
      make();
      lock(true);
      key('keydown', 'KeyW');
      key('keydown', 'ShiftLeft');
      // Back, twice, with forward held: the dash goes back, the other keys wait one step.
      tap('KeyS');
      tap('KeyS', 100);
      key('keydown', 'KeyS');
      expect(ctl.take()).toBe(KEY.BACK | KEY.DASH | KEY.SPRINT);
      expect(ctl.take()).toBe(KEY.FORWARD | KEY.BACK | KEY.SPRINT);
      expect(ctl.keys).toBe(KEY.FORWARD | KEY.BACK | KEY.SPRINT);
    });

    it('is not on E, nor on the right button, nor on a double tap of another key', () => {
      make();
      lock(true);
      tap('KeyE');
      tap('KeyE', 50);
      for (const type of ['mousedown', 'mousedown', 'mouseup']) {
        document.dispatchEvent(new MouseEvent(type, { button: 2, cancelable: true }));
      }
      tap('Space');
      tap('Space', 50);
      expect([ctl.take(), ctl.keys]).toEqual([0, 0]);
      const menu = new MouseEvent('contextmenu', { cancelable: true });
      document.dispatchEvent(menu);
      expect(menu.defaultPrevented).toBe(false);
    });

    it('is dropped with the lock, and does nothing without it', () => {
      make();
      tap('KeyW');
      tap('KeyW', 50);
      expect(ctl.take()).toBe(0);
      lock(true);
      tap('KeyW', 50);
      tap('KeyW', 50);
      lock(false);
      expect(ctl.take()).toBe(0);
      lock(true);
      // The first tap of a window is forgotten too.
      tap('KeyA');
      lock(false);
      lock(true);
      tap('KeyA', 50);
      expect(ctl.take()).toBe(0);
    });

    it('is a dash that way in the physics, whatever else is held', () => {
      // Facing north, forward held, sprinting: a double tap of back, left or right.
      for (const [code, vx, vz] of [
        ['KeyS', 0, DASH_SPEED],
        ['KeyA', -DASH_SPEED, 0],
        ['KeyD', DASH_SPEED, 0],
        ['KeyW', 0, -DASH_SPEED],
      ] as const) {
        make();
        lock(true);
        key('keydown', 'KeyW');
        key('keydown', 'ShiftLeft');
        tap(code);
        tap(code, 80);
        key('keydown', code);
        const s = at(0, 0, NORTH);
        s.step(ctl.take(), NORTH);
        expect(s.p.ev & EV.DASH, code).toBe(EV.DASH);
        expect(s.p.vx, code).toBeCloseTo(vx, 4);
        expect(s.p.vz, code).toBeCloseTo(vz, 4);
        ctl.destroy();
        canvas.remove();
        lock(false);
      }
      // Relative to the view: facing west, back is east; facing east, left is north.
      const w = at(0, 0, WEST);
      w.step(dashKeys(KEY.FORWARD, KEY.BACK), WEST);
      expect(w.p.vx).toBeCloseTo(DASH_SPEED, 4);
      const e = at(0, 0, EAST);
      e.step(dashKeys(KEY.FORWARD | KEY.RIGHT, KEY.LEFT), EAST);
      expect(e.p.vz).toBeCloseTo(-DASH_SPEED, 4);
    });
  });

  describe('the trigger', () => {
    const button = (type: string, b: number) =>
      document.dispatchEvent(new MouseEvent(type, { button: b }));

    it('is the left button: held while it is down, under the lock', () => {
      make();
      lock(true);
      button('mousedown', 0);
      expect(ctl.keys).toBe(KEY.FIRE);
      expect(KEY.FIRE).toBe(256);
      key('keydown', 'KeyW');
      expect(ctl.keys).toBe(KEY.FIRE | KEY.FORWARD);
      expect(ctl.take()).toBe(KEY.FIRE | KEY.FORWARD);
      button('mouseup', 0);
      expect(ctl.keys).toBe(KEY.FORWARD);
    });

    it('is not on the right button, nor the middle one', () => {
      make();
      lock(true);
      button('mousedown', 2);
      button('mousedown', 1);
      expect(ctl.keys).toBe(0);
      button('mousedown', 0);
      button('mouseup', 2);
      expect(ctl.keys).toBe(KEY.FIRE);
    });

    it('does nothing before the lock: the click that takes it does not fire', () => {
      make();
      button('mousedown', 0);
      expect(ctl.keys).toBe(0);
    });

    it('lets go with the button even if the lock is lost first, and with the lock and the window', () => {
      make();
      lock(true);
      button('mousedown', 0);
      lock(false);
      expect(ctl.keys).toBe(0);
      lock(true);
      button('mousedown', 0);
      window.dispatchEvent(new Event('blur'));
      expect(ctl.keys).toBe(0);
      lock(true);
      button('mousedown', 0);
      lock(false);
      button('mouseup', 0);
      expect(ctl.keys).toBe(0);
    });

    it('is not a dash, nor a move: only the fire bit', () => {
      make();
      lock(true);
      button('mousedown', 0);
      expect(ctl.keys & ~KEY.FIRE).toBe(0);
    });

    it('sends one step of FIRE and SPECIAL after a double click, however short, and not after two slow clicks', () => {
      let clock = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => clock);
      make();
      lock(true);
      const click = (gap: number) => {
        clock += gap;
        button('mousedown', 0);
        button('mouseup', 0);
      };
      click(0);
      click(DOUBLE_CLICK_MS + 1);
      expect(ctl.take()).toBe(0);
      click(DOUBLE_CLICK_MS);
      expect(ctl.take()).toBe(KEY.FIRE | KEY.SPECIAL);
      expect(ctl.take()).toBe(0);
      // A third click right after is a new first one, not another special.
      click(50);
      expect(ctl.take()).toBe(0);
      click(50);
      expect(ctl.take()).toBe(KEY.FIRE | KEY.SPECIAL);
    });
  });

  it('calls onMute once per press of M, by code, under the lock only', () => {
    let n = 0;
    make(() => n++);
    key('keydown', 'KeyM');
    expect(n).toBe(0);
    lock(true);
    key('keydown', 'KeyM');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', repeat: true }));
    key('keyup', 'KeyM');
    key('keydown', 'KeyN');
    expect(n).toBe(1);
    key('keydown', 'KeyM');
    expect([n, ctl.keys]).toEqual([2, 0]);
  });

  it('clears the keys on blur and when the lock is lost', () => {
    make();
    lock(true);
    key('keydown', 'KeyD');
    window.dispatchEvent(new Event('blur'));
    expect(ctl.keys).toBe(0);
    key('keydown', 'KeyD');
    lock(false);
    expect(ctl.keys).toBe(0);
  });

  it('stops listening once destroyed', () => {
    make();
    lock(true);
    ctl.destroy();
    key('keydown', 'KeyW');
    move(50, 0);
    expect([ctl.yaw, ctl.keys]).toEqual([0, 0]);
  });

  describe('the weapon', () => {
    let clock = 0;
    beforeEach(() => {
      clock = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => clock);
    });
    afterEach(() => vi.restoreAllMocks());
    const wheel = (deltaY: number) => {
      const e = new WheelEvent('wheel', { deltaY, cancelable: true });
      document.dispatchEvent(e);
      return e;
    };

    it('starts with the gun: no BLADE in the keys of a step', () => {
      make();
      lock(true);
      key('keydown', 'KeyW');
      expect(ctl.weapon).toBe(WEAPON.GUN);
      expect(ctl.take()).toBe(KEY.FORWARD);
    });

    it('takes the katana on 2 and the gun on 1, and every step carries BLADE while it is chosen', () => {
      make();
      lock(true);
      key('keydown', 'Digit2');
      key('keydown', 'KeyW');
      expect(ctl.weapon).toBe(WEAPON.BLADE);
      expect(ctl.take()).toBe(KEY.FORWARD | KEY.BLADE);
      expect(ctl.take()).toBe(KEY.FORWARD | KEY.BLADE);
      // The held keys stay as they are: BLADE is not a held key.
      expect(ctl.keys).toBe(KEY.FORWARD);
      key('keydown', 'Digit1');
      expect(ctl.take()).toBe(KEY.FORWARD);
    });

    it('keeps FIRE on the left button, with or without the katana', () => {
      make();
      lock(true);
      key('keydown', 'Digit2');
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      expect(ctl.take()).toBe(KEY.FIRE | KEY.BLADE);
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      expect(ctl.take()).toBe(KEY.BLADE);
    });

    it('keeps BLADE through a dash, which has only the tapped direction', () => {
      make();
      lock(true);
      key('keydown', 'Digit2');
      for (let i = 0; i < 2; i++) {
        key('keydown', 'KeyD');
        key('keyup', 'KeyD');
      }
      expect(ctl.take()).toBe(KEY.RIGHT | KEY.DASH | KEY.BLADE);
    });

    it('swaps the weapons with the wheel, either way, once for a flick, and holds the page still', () => {
      make();
      lock(true);
      expect(wheel(100).defaultPrevented).toBe(true);
      expect(ctl.weapon).toBe(WEAPON.BLADE);
      clock += WHEEL_MS / 2;
      expect(wheel(100).defaultPrevented).toBe(true);
      expect(ctl.weapon).toBe(WEAPON.BLADE);
      clock += WHEEL_MS;
      wheel(-100);
      expect(ctl.weapon).toBe(WEAPON.GUN);
    });

    it('takes the rail gun on 3, and every step carries RAIL while it is chosen', () => {
      make();
      lock(true);
      key('keydown', 'Digit3');
      expect(ctl.weapon).toBe(WEAPON.RAIL);
      expect(ctl.take()).toBe(KEY.RAIL);
    });

    it('turns the wheel past a weapon he does not have', () => {
      make();
      lock(true);
      ctl.track(player(), player({ rail: 10 }));
      expect(ctl.weapon).toBe(WEAPON.RAIL);
      wheel(100);
      expect(ctl.weapon).toBe(WEAPON.GUN);
      clock += WHEEL_MS;
      wheel(-100);
      expect(ctl.weapon).toBe(WEAPON.RAIL);
    });

    it('ignores the wheel and the digits without the lock, and a wheel that does not turn', () => {
      make();
      expect(wheel(100).defaultPrevented).toBe(false);
      key('keydown', 'Digit2');
      expect(ctl.weapon).toBe(WEAPON.GUN);
      lock(true);
      wheel(0);
      expect(ctl.weapon).toBe(WEAPON.GUN);
    });

    it('follows the steps: a katana picked up is chosen, going down chooses the gun, and 1 wins after the pickup', () => {
      make();
      lock(true);
      ctl.track(player(), player({ blade: true }));
      expect(ctl.weapon).toBe(WEAPON.BLADE);
      expect(ctl.take() & KEY.BLADE).toBe(KEY.BLADE);
      key('keydown', 'Digit1');
      ctl.track(player({ blade: true }), player({ blade: true }));
      expect(ctl.weapon).toBe(WEAPON.GUN);
      key('keydown', 'Digit2');
      ctl.track(player({ blade: true }), player({ blade: false, ammo: -1, down: 60 }));
      expect(ctl.weapon).toBe(WEAPON.GUN);
      expect(ctl.take() & KEY.BLADE).toBe(0);
    });

    it('keeps the choice when the lock is lost and found again', () => {
      make();
      lock(true);
      key('keydown', 'Digit2');
      lock(false);
      lock(true);
      expect(ctl.weapon).toBe(WEAPON.BLADE);
    });
  });
});
