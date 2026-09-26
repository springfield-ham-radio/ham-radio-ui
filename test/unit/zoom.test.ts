import { describe, expect, it } from 'vitest';
import { ZOOM_IN_COMMAND, ZOOM_OUT_COMMAND, ZOOM_RESET_COMMAND, wheelZoomMultiplier, zoomCommandForKey } from '../../app/utils/zoom.ts';

const baseKey = {
  key: 'a',
  code: 'KeyA',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

describe('zoomCommandForKey', () => {
  it('zooms in on Command or Control plus', () => {
    expect(zoomCommandForKey({ ...baseKey, key: '+', code: 'Equal', metaKey: true })).toBe(ZOOM_IN_COMMAND);
    expect(zoomCommandForKey({ ...baseKey, key: '+', code: 'Equal', ctrlKey: true })).toBe(ZOOM_IN_COMMAND);
  });

  it('leaves equals, minus, and zero to the View menu', () => {
    expect(zoomCommandForKey({ ...baseKey, key: '=', code: 'Equal', metaKey: true })).toBeUndefined();
    expect(zoomCommandForKey({ ...baseKey, key: '-', code: 'Minus', metaKey: true })).toBeUndefined();
    expect(zoomCommandForKey({ ...baseKey, key: '0', code: 'Digit0', ctrlKey: true })).toBeUndefined();
  });

  it('maps the numeric keypad', () => {
    expect(zoomCommandForKey({ ...baseKey, key: '+', code: 'NumpadAdd', metaKey: true })).toBe(ZOOM_IN_COMMAND);
    expect(zoomCommandForKey({ ...baseKey, key: '-', code: 'NumpadSubtract', ctrlKey: true })).toBe(ZOOM_OUT_COMMAND);
    expect(zoomCommandForKey({ ...baseKey, key: '0', code: 'Numpad0', metaKey: true })).toBe(ZOOM_RESET_COMMAND);
  });

  it('ignores chords without a single zoom modifier', () => {
    expect(zoomCommandForKey({ ...baseKey, key: '+', code: 'Equal' })).toBeUndefined();
    expect(zoomCommandForKey({ ...baseKey, key: '+', code: 'Equal', metaKey: true, ctrlKey: true })).toBeUndefined();
    expect(zoomCommandForKey({ ...baseKey, key: '+', code: 'Equal', metaKey: true, altKey: true })).toBeUndefined();
  });
});

describe('wheelZoomMultiplier', () => {
  it('zooms in when the wheel delta is negative', () => {
    expect(wheelZoomMultiplier(-100)).toBeGreaterThan(1);
  });

  it('zooms out when the wheel delta is positive', () => {
    expect(wheelZoomMultiplier(100)).toBeLessThan(1);
  });

  it('stays at 100% when the wheel does not move', () => {
    expect(wheelZoomMultiplier(0)).toBe(1);
  });
});
