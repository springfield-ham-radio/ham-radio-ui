import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_PAGE_SETTINGS,
  MAP_PAGE_ALL_STORED_GROUPS,
  parseMapPageCamera,
  parseMapPageSettings,
  serializeMapPageSettings,
} from '../../app/utils/map-page-settings.ts';

describe('parseMapPageCamera', () => {
  it('keeps a finite longitude, latitude, and zoom in range', () => {
    expect(parseMapPageCamera({ longitude: -97.74, latitude: 30.27, zoom: 9.5 })).toEqual({
      longitude: -97.74,
      latitude: 30.27,
      zoom: 9.5,
    });
  });

  it('drops invalid camera values', () => {
    expect(parseMapPageCamera({ longitude: Number.NaN, latitude: 0, zoom: 1 })).toBeUndefined();
    expect(parseMapPageCamera({ longitude: 0, latitude: 95, zoom: 1 })).toBeUndefined();
    expect(parseMapPageCamera({ longitude: 0, latitude: 0, zoom: 25 })).toBeUndefined();
    expect(parseMapPageCamera(null)).toBeUndefined();
  });
});

describe('parseMapPageSettings', () => {
  it('defaults repeaters on, all stored groups, and no camera', () => {
    expect(parseMapPageSettings(null)).toEqual(DEFAULT_MAP_PAGE_SETTINGS);
    expect(parseMapPageSettings('')).toEqual(DEFAULT_MAP_PAGE_SETTINGS);
    expect(parseMapPageSettings('{')).toEqual(DEFAULT_MAP_PAGE_SETTINGS);
  });

  it('round-trips camera and group selection', () => {
    const settings = {
      repeaters: true,
      groupSelection: ['group-a', 'group-b'],
      camera: { longitude: 10, latitude: 20, zoom: 4 },
    };

    expect(parseMapPageSettings(serializeMapPageSettings(settings))).toEqual(settings);
  });

  it('parses the all-stored-groups sentinel', () => {
    expect(
      parseMapPageSettings(
        JSON.stringify({
          repeaters: false,
          groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
        }),
      ),
    ).toEqual({
      repeaters: false,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('keeps an explicit empty group list', () => {
    const settings = {
      repeaters: true,
      groupSelection: [] as string[],
    };

    expect(parseMapPageSettings(serializeMapPageSettings(settings))).toEqual(settings);
  });

  it('defaults repeaters on when the key is missing', () => {
    expect(parseMapPageSettings(JSON.stringify({ groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: true,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });
});
