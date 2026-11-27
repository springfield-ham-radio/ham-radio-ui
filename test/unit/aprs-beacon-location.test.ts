import { describe, expect, it } from 'vitest';
import {
  HOME_STATION_ID,
  defaultStationAntennaStore,
  replaceStationInStore,
  updateRadioStation,
  type StationAntennaStore,
} from '~/utils/antenna-station';
import { maidenheadToLatLon } from '~/utils/maidenhead';
import { formatAprsBeaconSummaryPosition, resolveAprsBeaconLocation } from '~/utils/aprs-beacon-location';

function storeWithHomeAt(thirty: number, lon: number): StationAntennaStore {
  let store = defaultStationAntennaStore();
  const home = store.stations.find((entry) => entry.id === HOME_STATION_ID);

  if (!home) {
    throw new Error('home');
  }

  store = replaceStationInStore(
    store,
    updateRadioStation(home, {
      nickname: 'Home',
      latitude: thirty,
      longitude: lon,
      locationSource: 'coordinates',
    }),
  );

  return store;
}

describe('resolveAprsBeaconLocation', () => {
  it('returns coordinates from the selected station when latitude and longitude are set', () => {
    const store = storeWithHomeAt(30.5187, -97.879);

    expect(resolveAprsBeaconLocation(store)).toEqual({
      latitude: 30.5187,
      longitude: -97.879,
      label: 'Home',
    });
  });

  it('prefers an explicit stationId when provided', () => {
    const store = {
      ...storeWithHomeAt(30, -97),
      stations: [
        ...storeWithHomeAt(30, -97).stations,
        {
          id: 'station-cabin',
          nickname: 'Cabin',
          createdAt: 1,
          updatedAt: 1,
          latitude: 45.1,
          longitude: -93.2,
          locationSource: 'coordinates' as const,
        },
      ],
    };

    expect(resolveAprsBeaconLocation(store, { stationId: 'station-cabin' })).toEqual({
      latitude: 45.1,
      longitude: -93.2,
      label: 'Cabin',
    });
  });

  it('resolves grid-only stations to a Maidenhead center', () => {
    let store = defaultStationAntennaStore();
    const home = store.stations.find((entry) => entry.id === HOME_STATION_ID);

    if (!home) {
      throw new Error('home');
    }

    store = replaceStationInStore(
      store,
      updateRadioStation(home, {
        nickname: 'Home',
        gridsquare: 'EM13',
        locationSource: 'grid',
      }),
    );

    const prefill = resolveAprsBeaconLocation(store);

    const gridCenter = maidenheadToLatLon('EM13');

    expect(prefill?.label).toBe('Home');
    expect(prefill?.latitude).toBeCloseTo(gridCenter?.latitude ?? 0, 2);
    expect(prefill?.longitude).toBeCloseTo(gridCenter?.longitude ?? 0, 2);
  });

  it('returns undefined when no station location exists', () => {
    expect(resolveAprsBeaconLocation(defaultStationAntennaStore())).toBeUndefined();
  });

  it('formats summary position strings', () => {
    expect(formatAprsBeaconSummaryPosition(30.5187, -97.879)).toBe('30.5187° N, 97.8790° W');
    expect(formatAprsBeaconSummaryPosition(0, 0)).toBe('0.0000° N, 0.0000° E');
  });
});