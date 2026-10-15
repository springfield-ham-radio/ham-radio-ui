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
  it('defaults repeaters, channels, contacts, and stations on, all stored groups, and no camera', () => {
    expect(parseMapPageSettings(null)).toEqual(DEFAULT_MAP_PAGE_SETTINGS);
    expect(parseMapPageSettings('')).toEqual(DEFAULT_MAP_PAGE_SETTINGS);
    expect(parseMapPageSettings('{')).toEqual(DEFAULT_MAP_PAGE_SETTINGS);
  });

  it('round-trips camera and group selection', () => {
    const settings = {
      repeaters: true,
      channels: false,
      log: true,
      stations: false,
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
      channels: true,
      log: true,
      stations: true,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('keeps an explicit empty group list', () => {
    const settings = {
      repeaters: true,
      channels: true,
      log: false,
      stations: true,
      groupSelection: [] as string[],
    };

    expect(parseMapPageSettings(serializeMapPageSettings(settings))).toEqual(settings);
  });

  it('defaults repeaters and channels on when the keys are missing', () => {
    expect(parseMapPageSettings(JSON.stringify({ groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: true,
      channels: true,
      log: true,
      stations: true,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults channels on when only repeaters is stored', () => {
    expect(parseMapPageSettings(JSON.stringify({ repeaters: false, groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: false,
      channels: true,
      log: true,
      stations: true,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults contacts on when the log key is missing', () => {
    expect(parseMapPageSettings(JSON.stringify({ repeaters: true, channels: true, groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: true,
      channels: true,
      log: true,
      stations: true,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults stations on when the stations key is missing', () => {
    expect(parseMapPageSettings(JSON.stringify({ repeaters: true, channels: true, log: true, groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: true,
      channels: true,
      log: true,
      stations: true,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });
});
