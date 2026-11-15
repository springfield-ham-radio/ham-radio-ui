import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_PAGE_SETTINGS,
  MAP_PAGE_ALL_STORED_GROUPS,
  MAP_PAGE_LAYER_CONTROLS,
  mapTripSelectorVisible,
  nextMapPageGroupSelection,
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
  it('defaults repeaters, channels, contacts, stations, and trips on, APRS off, all stored groups, and no camera', () => {
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
      trips: false,
      aprs: false,
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
      trips: true,
      aprs: false,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('keeps an explicit empty group list', () => {
    const settings = {
      repeaters: true,
      channels: true,
      log: false,
      stations: true,
      trips: true,
      aprs: false,
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
      trips: true,
      aprs: false,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults channels on when only repeaters is stored', () => {
    expect(parseMapPageSettings(JSON.stringify({ repeaters: false, groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: false,
      channels: true,
      log: true,
      stations: true,
      trips: true,
      aprs: false,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults contacts on when the log key is missing', () => {
    expect(parseMapPageSettings(JSON.stringify({ repeaters: true, channels: true, groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: true,
      channels: true,
      log: true,
      stations: true,
      trips: true,
      aprs: false,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults stations on when the stations key is missing', () => {
    expect(parseMapPageSettings(JSON.stringify({ repeaters: true, channels: true, log: true, groupSelection: MAP_PAGE_ALL_STORED_GROUPS }))).toEqual({
      repeaters: true,
      channels: true,
      log: true,
      stations: true,
      trips: true,
      aprs: false,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults trips on when the trips key is missing', () => {
    expect(
      parseMapPageSettings(
        JSON.stringify({
          repeaters: true,
          channels: true,
          log: true,
          stations: true,
          groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
        }),
      ),
    ).toEqual({
      repeaters: true,
      channels: true,
      log: true,
      stations: true,
      trips: true,
      aprs: false,
      groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
    });
  });

  it('defaults APRS off and round-trips an explicit on value', () => {
    expect(DEFAULT_MAP_PAGE_SETTINGS.aprs).toBe(false);
    expect(parseMapPageSettings(JSON.stringify({ repeaters: true })).aprs).toBe(false);
    expect(parseMapPageSettings(JSON.stringify({ aprs: true })).aprs).toBe(true);
    expect(parseMapPageSettings(JSON.stringify({ aprs: false })).aprs).toBe(false);
    expect(parseMapPageSettings(JSON.stringify({ aprs: 'yes' })).aprs).toBe(false);

    const enabled = { ...DEFAULT_MAP_PAGE_SETTINGS, aprs: true };
    expect(parseMapPageSettings(serializeMapPageSettings(enabled))).toEqual(enabled);
  });
});

describe('map layer controls', () => {
  it('places APRS before Stations', () => {
    const keys = MAP_PAGE_LAYER_CONTROLS.map((control) => control.key);

    expect(keys).toEqual(['repeaters', 'channels', 'log', 'aprs', 'stations', 'trips']);
    expect(keys.indexOf('aprs')).toBeLessThan(keys.indexOf('stations'));
    expect(MAP_PAGE_LAYER_CONTROLS.find((control) => control.key === 'aprs')?.label).toBe('APRS');
    expect(MAP_PAGE_LAYER_CONTROLS.find((control) => control.key === 'stations')?.label).toBe('Stations');
  });
});

describe('map trip selector', () => {
  const storedGroupIds = ['library', 'hill-country'];

  it('is visible only while Trips is enabled', () => {
    expect(mapTripSelectorVisible(true)).toBe(true);
    expect(mapTripSelectorVisible(false)).toBe(false);
  });

  it('keeps the selected trip when the selector is hidden', () => {
    expect(
      nextMapPageGroupSelection({
        current: ['hill-country'],
        tripsEnabled: false,
        proposedIds: [],
        storedGroupIds,
      }),
    ).toEqual(['hill-country']);

    expect(
      nextMapPageGroupSelection({
        current: MAP_PAGE_ALL_STORED_GROUPS,
        tripsEnabled: false,
        proposedIds: [],
        storedGroupIds,
      }),
    ).toBe(MAP_PAGE_ALL_STORED_GROUPS);
  });

  it('applies a new selection while the selector is visible', () => {
    expect(
      nextMapPageGroupSelection({
        current: MAP_PAGE_ALL_STORED_GROUPS,
        tripsEnabled: true,
        proposedIds: ['hill-country'],
        storedGroupIds,
      }),
    ).toEqual(['hill-country']);

    expect(
      nextMapPageGroupSelection({
        current: ['hill-country'],
        tripsEnabled: true,
        proposedIds: storedGroupIds,
        storedGroupIds,
      }),
    ).toBe(MAP_PAGE_ALL_STORED_GROUPS);
  });
});
