import { describe, expect, it } from 'vitest';
import { CHANNEL_MAP_EMPTY_STYLE, mapCanvasUsesEmptyStyle } from '../../app/utils/map-canvas.ts';

describe('CHANNEL_MAP_EMPTY_STYLE', () => {
  it('is a background-only MapLibre style', () => {
    expect(CHANNEL_MAP_EMPTY_STYLE.version).toBe(8);
    expect(CHANNEL_MAP_EMPTY_STYLE.sources).toEqual({});
    expect(CHANNEL_MAP_EMPTY_STYLE.layers).toHaveLength(1);
    expect(CHANNEL_MAP_EMPTY_STYLE.layers[0]).toMatchObject({
      id: 'channel-map-background',
      type: 'background',
    });
  });
});

describe('mapCanvasUsesEmptyStyle', () => {
  it('recognizes the empty fallback style object', () => {
    expect(mapCanvasUsesEmptyStyle(CHANNEL_MAP_EMPTY_STYLE)).toBe(true);
    expect(mapCanvasUsesEmptyStyle('https://tiles.openfreemap.org/styles/liberty')).toBe(false);
  });
});
