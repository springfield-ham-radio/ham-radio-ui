import { describe, expect, it } from 'vitest';
import { createStationLogQso, type StationLogQso } from '../../app/utils/station-log-db.ts';
import {
  qslMarkerStatus,
  qslStatusLabel,
  qslTableLabel,
  stationLogMapFeatureCollection,
  stationLogMapPoints,
  stationLogUnmappedCount,
  parseCustomMapStyleUrl,
  resolveMapStyleUrl,
  stationLogMapStyleUrl,
  stationMapFeatureCollection,
  stationMapPins,
} from '../../app/utils/station-log-map.ts';

function contact(overrides: Partial<StationLogQso> = {}): StationLogQso {
  return createStationLogQso({
    startedAt: 1_000,
    theirCallsign: 'W1AW',
    mode: 'FM',
    theirGridsquare: 'FN31',
    ...overrides,
  });
}

describe('qslMarkerStatus', () => {
  it('reports none, sent, received, and both', () => {
    expect(qslMarkerStatus({ qslSent: false, qslReceived: false })).toBe('none');
    expect(qslMarkerStatus({ qslSent: true, qslReceived: false })).toBe('sent');
    expect(qslMarkerStatus({ qslSent: false, qslReceived: true })).toBe('received');
    expect(qslMarkerStatus({ qslSent: true, qslReceived: true })).toBe('both');
  });
});

describe('qsl labels', () => {
  it('uses a short table label and a longer map label', () => {
    expect(qslTableLabel({ qslSent: false, qslReceived: false })).toBe('—');
    expect(qslTableLabel({ qslSent: true, qslReceived: false })).toBe('Sent');
    expect(qslTableLabel({ qslSent: false, qslReceived: true })).toBe('Received');
    expect(qslTableLabel({ qslSent: true, qslReceived: true })).toBe('Both');
    expect(qslStatusLabel('none')).toBe('No card');
    expect(qslStatusLabel('both')).toBe('Card sent and received');
    expect(qslStatusLabel('mixed')).toBe('Mixed');
  });
});

describe('stationLogMapPoints', () => {
  it('places a contact at the center of its grid', () => {
    const points = stationLogMapPoints([contact()]);

    expect(points).toHaveLength(1);
    expect(points[0]?.grid).toBe('FN31');
    expect(points[0]?.status).toBe('none');
    expect(points[0]?.latitude).toBe(41.5);
    expect(points[0]?.longitude).toBe(-73);
  });

  it('skips contacts without a valid grid', () => {
    const points = stationLogMapPoints([
      contact({ theirGridsquare: undefined }),
      contact({ theirCallsign: 'K1ABC', theirGridsquare: 'Connecticut' }),
    ]);

    expect(points).toHaveLength(0);
    expect(stationLogUnmappedCount([
      contact({ theirGridsquare: undefined }),
      contact({ theirCallsign: 'K1ABC', theirGridsquare: 'FN31' }),
    ])).toBe(1);
  });

  it('groups contacts that share a grid, including lowercase locators', () => {
    const first = contact({ qslSent: true });
    const second = contact({ theirCallsign: 'K1ABC', qslReceived: true });
    second.theirGridsquare = 'fn31';

    const points = stationLogMapPoints([first, second]);

    expect(points).toHaveLength(1);
    expect(points[0]?.status).toBe('mixed');
    expect(points[0]?.qsos).toHaveLength(2);
  });

  it('keeps a shared status when every contact in the grid matches', () => {
    const points = stationLogMapPoints([
      contact({ qslSent: true, qslReceived: true }),
      contact({ theirCallsign: 'K1ABC', qslSent: true, qslReceived: true }),
    ]);

    expect(points[0]?.status).toBe('both');
  });

  it('keeps separate points for different grids', () => {
    const points = stationLogMapPoints([
      contact({ theirGridsquare: 'FN42' }),
      contact({ theirCallsign: 'K1ABC', theirGridsquare: 'EM48' }),
    ]);

    expect(points.map((point) => point.grid)).toEqual(['EM48', 'FN42']);
  });
});

describe('stationLogMapFeatureCollection', () => {
  it('emits longitude then latitude and the card status', () => {
    const collection = stationLogMapFeatureCollection(stationLogMapPoints([
      contact({ qslSent: true }),
    ]));

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.geometry.coordinates).toEqual([-73, 41.5]);
    expect(collection.features[0]?.properties).toEqual({
      grid: 'FN31',
      status: 'sent',
      count: 1,
    });
  });
});

describe('stationLogMapStyleUrl', () => {
  it('follows the app theme unless a style is chosen', () => {
    expect(stationLogMapStyleUrl('theme', 'light')).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(stationLogMapStyleUrl('theme', 'dark')).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(stationLogMapStyleUrl('bright', 'dark')).toBe('https://tiles.openfreemap.org/styles/bright');
    expect(stationLogMapStyleUrl('fiord', 'light')).toBe('https://tiles.openfreemap.org/styles/fiord');
  });
});

describe('parseCustomMapStyleUrl', () => {
  it('accepts only non-empty https URLs', () => {
    const custom = 'https://example.com/maps/style.json';

    expect(parseCustomMapStyleUrl(custom)).toBe(custom);
    expect(parseCustomMapStyleUrl(`  ${custom}  `)).toBe(custom);
    expect(parseCustomMapStyleUrl('')).toBeUndefined();
    expect(parseCustomMapStyleUrl('   ')).toBeUndefined();
    expect(parseCustomMapStyleUrl('http://example.com/style.json')).toBeUndefined();
    expect(parseCustomMapStyleUrl('pmtiles://example.com/planet.pmtiles')).toBeUndefined();
    expect(parseCustomMapStyleUrl('/styles/local.json')).toBeUndefined();
    expect(parseCustomMapStyleUrl('not-a-url')).toBeUndefined();
  });
});

describe('resolveMapStyleUrl', () => {
  const custom = 'https://tiles.example.com/style.json';

  it('uses a valid custom URL instead of the named style', () => {
    expect(resolveMapStyleUrl('dark', 'light', custom)).toBe(custom);
    expect(resolveMapStyleUrl('theme', 'dark', custom)).toBe(custom);
  });

  it('falls back to the named OpenFreeMap style when custom is missing or invalid', () => {
    expect(resolveMapStyleUrl('theme', 'light', undefined)).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(resolveMapStyleUrl('theme', 'dark', '')).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(resolveMapStyleUrl('bright', 'dark', 'http://insecure.example/style.json')).toBe(
      'https://tiles.openfreemap.org/styles/bright',
    );
  });
});

describe('stationMapPins', () => {
  it('uses stored coordinates instead of the grid center', () => {
    const pins = stationMapPins([
      { id: 'home', nickname: 'Home', gridsquare: 'FN31', latitude: 41.7, longitude: -72.5 },
    ]);

    expect(pins).toEqual([
      { id: 'home', nickname: 'Home', gridsquare: 'FN31', latitude: 41.7, longitude: -72.5 },
    ]);
  });

  it('falls back to the grid center when coordinates are missing', () => {
    const pins = stationMapPins([
      { id: 'cabin', nickname: 'Cabin', gridsquare: 'fn31' },
    ]);

    expect(pins).toEqual([
      { id: 'cabin', nickname: 'Cabin', gridsquare: 'FN31', latitude: 41.5, longitude: -73 },
    ]);
  });

  it('skips a station with no location and sorts the rest by nickname', () => {
    const pins = stationMapPins([
      { id: 'home', nickname: 'Home' },
      { id: 'portable', nickname: 'Portable', gridsquare: 'EM48' },
      { id: 'cabin', nickname: 'Cabin', gridsquare: 'FN42' },
    ]);

    expect(pins.map((pin) => pin.nickname)).toEqual(['Cabin', 'Portable']);
  });

  it('treats Null Island as unlocated but keeps a single zero axis', () => {
    expect(stationMapPins([{ id: 'null', nickname: 'Null', latitude: 0, longitude: 0 }])).toHaveLength(0);
    expect(stationMapPins([{ id: 'equator', nickname: 'Equator', latitude: 0, longitude: -72.5 }])).toEqual([
      { id: 'equator', nickname: 'Equator', gridsquare: undefined, latitude: 0, longitude: -72.5 },
    ]);
  });
});

describe('stationMapFeatureCollection', () => {
  it('emits longitude then latitude and the station id', () => {
    const collection = stationMapFeatureCollection(stationMapPins([
      { id: 'home', nickname: 'Home', latitude: 41.7, longitude: -72.5 },
    ]));

    expect(collection.features[0]?.geometry.coordinates).toEqual([-72.5, 41.7]);
    expect(collection.features[0]?.properties).toEqual({ id: 'home', nickname: 'Home' });
  });
});
