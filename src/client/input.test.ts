// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_PITCH } from '../shared/constants';
import { KEY } from '../shared/types';
import { createInput, keyBit } from './input';
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

  const click = (type: string, button: number) =>
    document.dispatchEvent(new MouseEvent(type, { button }));

  const make = () => {
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    ctl = createInput(canvas);
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

  it('fires while the left button is held under the lock, and releases it unlocked too', () => {
    make();
    lock(true);
    click('mousedown', 2);
    expect(ctl.keys).toBe(0);
    click('mousedown', 0);
    expect(ctl.keys).toBe(KEY.FIRE);
    lock(false);
    expect(ctl.keys).toBe(0);
    lock(true);
    click('mousedown', 0);
    click('mouseup', 2);
    expect(ctl.keys).toBe(KEY.FIRE);
    window.dispatchEvent(new Event('blur'));
    expect(ctl.keys).toBe(0);
    click('mousedown', 0);
    lock(false);
    click('mouseup', 0);
    expect(ctl.keys).toBe(0);
  });

  it('does not fire on the click that takes the lock', () => {
    make();
    click('mousedown', 0);
    lock(true);
    click('mouseup', 0);
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
});
