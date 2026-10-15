import { describe, expect, it } from 'vitest';
import { RadioChannelId } from '@springfield/ham-radio-api';
import { CHANNEL_MAP_BAND_COLORS, CHANNEL_MAP_BAND_FALLBACK } from '../../app/utils/channel-map.ts';
import { MAP_PAGE_ALL_STORED_GROUPS } from '../../app/utils/map-page-settings.ts';
import {
  HOME_STATION_ID,
  createStationAntenna,
  type RadioStation,
  type StationAntenna,
} from '../../app/utils/antenna-station.ts';
import {
  mapChannelFeatures,
  mapChannelRows,
  mapChannelUnlocatedCount,
  MAP_QSO_GRID_CENTER_NOTE,
  mapQsoFeatures,
  mapQsoPrecisionLabel,
  mapQsoUnmappedCount,
  mapRepeaterChannels,
  mapRepeaterFeatures,
  mapRepeaterUnlocatedCount,
  mapStationAntennas,
  mapStationFeatures,
  mapStationHomeUnlocated,
  mapStationOtherUnlocatedCount,
  resolveSelectedGroupIds,
} from '../../app/utils/map-page-layers.ts';
import type { ChannelGroup, ChannelGroupMembership } from '../../app/utils/channel-groups.ts';
import { maidenheadToLatLon } from '../../app/utils/maidenhead.ts';
import { createStationLogQso, type StationLogQso } from '../../app/utils/station-log-db.ts';
import type { SavedChannel } from '../../app/utils/saved-channels-db.ts';

function contact(overrides: Partial<StationLogQso> = {}): StationLogQso {
  return createStationLogQso({
    startedAt: 1_000,
    theirCallsign: 'W1AW',
    mode: 'FM',
    theirGridsquare: 'FN31',
    ...overrides,
  });
}

const groupA = 'group-a';
const groupB = 'group-b';

const groups: ChannelGroup[] = [
  { id: groupA, name: 'Austin', createdAt: 1, updatedAt: 1 },
  { id: groupB, name: 'Hill Country', createdAt: 1, updatedAt: 1 },
  {
    id: 'builtin:weather',
    name: 'Weather',
    builtin: true,
    createdAt: 1,
    updatedAt: 1,
  },
];

const locatedRepeater: SavedChannel = {
  id: RadioChannelId('repeater-located'),
  kind: 'repeater',
  callsign: 'W5TST',
  transmitFrequency: 146_520_000,
  receiveFrequency: 146_940_000,
  latitude: 30.2672,
  longitude: -97.7431,
  createdAt: 1,
  updatedAt: 1,
};

const ordinaryChannel: SavedChannel = {
  id: RadioChannelId('ordinary'),
  kind: 'channel',
  name: 'Simplex',
  transmitFrequency: 446_000_000,
  receiveFrequency: 446_000_000,
  latitude: 30.28,
  longitude: -97.75,
  createdAt: 1,
  updatedAt: 1,
};

const unlocatedRepeater: SavedChannel = {
  id: RadioChannelId('repeater-null-island'),
  kind: 'repeater',
  callsign: 'N0LOC',
  transmitFrequency: 146_340_000,
  receiveFrequency: 146_940_000,
  latitude: 0,
  longitude: 0,
  createdAt: 1,
  updatedAt: 1,
};

const unlocatedOrdinary: SavedChannel = {
  id: RadioChannelId('ordinary-null-island'),
  kind: 'channel',
  name: 'Unlocated simplex',
  transmitFrequency: 146_520_000,
  receiveFrequency: 146_520_000,
  latitude: 0,
  longitude: 0,
  createdAt: 1,
  updatedAt: 1,
};

const equatorRepeater: SavedChannel = {
  id: RadioChannelId('repeater-equator'),
  kind: 'repeater',
  callsign: 'EQ0',
  transmitFrequency: 146_340_000,
  receiveFrequency: 146_940_000,
  latitude: 0,
  longitude: 40,
  createdAt: 1,
  updatedAt: 1,
};

const channels = [locatedRepeater, ordinaryChannel, unlocatedOrdinary, unlocatedRepeater, equatorRepeater];

const memberships: ChannelGroupMembership[] = [
  { groupId: groupA, channelId: locatedRepeater.id },
  { groupId: groupB, channelId: locatedRepeater.id },
  { groupId: groupA, channelId: ordinaryChannel.id },
  { groupId: groupA, channelId: unlocatedOrdinary.id },
  { groupId: groupA, channelId: unlocatedRepeater.id },
  { groupId: groupA, channelId: equatorRepeater.id },
];

describe('resolveSelectedGroupIds', () => {
  it('returns every stored group for the all-stored sentinel', () => {
    expect(resolveSelectedGroupIds(MAP_PAGE_ALL_STORED_GROUPS, groups)).toEqual([groupA, groupB]);
  });

  it('filters explicit ids to stored groups only', () => {
    expect(resolveSelectedGroupIds([groupB, 'builtin:weather', 'missing'], groups)).toEqual([groupB]);
  });
});

describe('mapRepeaterFeatures', () => {
  it('places a located repeater at longitude-latitude with 2 Meter band color', () => {
    const collection = mapRepeaterFeatures(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS);

    const feature = collection.features.find((entry) => entry.properties.id === String(locatedRepeater.id));

    expect(feature?.geometry.coordinates).toEqual([-97.7431, 30.2672]);
    expect(feature?.properties.band).toBe('2 Meter');
    expect(feature?.properties.bandColor).toBe(CHANNEL_MAP_BAND_COLORS['2 Meter']);
    expect(feature?.properties.bandColor).not.toBe(CHANNEL_MAP_BAND_FALLBACK);
  });

  it('omits ordinary channels but keeps unlocated repeaters for the status line', () => {
    const rows = mapRepeaterChannels(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS);

    expect(rows.map((row) => String(row.id)).sort()).toEqual(
      [String(locatedRepeater.id), String(unlocatedRepeater.id), String(equatorRepeater.id)].sort(),
    );
    expect(mapRepeaterUnlocatedCount(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS)).toBe(1);

    const features = mapRepeaterFeatures(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS);
    expect(features.features.map((feature) => feature.properties.id)).not.toContain(String(unlocatedRepeater.id));
  });

  it('dedupes a repeater that appears in two selected groups', () => {
    const rows = mapRepeaterChannels(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS);
    const located = rows.filter((row) => row.id === locatedRepeater.id);

    expect(located).toHaveLength(1);
  });

  it('limits repeaters to an explicit group list', () => {
    const rows = mapRepeaterChannels(channels, memberships, groups, [groupB]);

    expect(rows.map((row) => String(row.id))).toEqual([String(locatedRepeater.id)]);
  });

  it('keeps a single-axis zero coordinate', () => {
    const collection = mapRepeaterFeatures(channels, memberships, groups, [groupA]);
    const feature = collection.features.find((entry) => entry.properties.id === String(equatorRepeater.id));

    expect(feature?.geometry.coordinates).toEqual([40, 0]);
  });
});

describe('mapChannelFeatures', () => {
  it('includes an ordinary located channel and omits repeaters', () => {
    const collection = mapChannelFeatures(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS);

    expect(collection.features.map((feature) => feature.properties.id)).toEqual([String(ordinaryChannel.id)]);
    expect(collection.features[0]?.properties.band).toBe('70 Centimeter');
  });

  it('limits ordinary channels to an explicit group list', () => {
    const rows = mapChannelRows(channels, memberships, groups, [groupB]);

    expect(rows).toHaveLength(0);
  });

  it('omits (0, 0) from ordinary-channel features and counts it unlocated', () => {
    const collection = mapChannelFeatures(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS);

    expect(collection.features.map((feature) => feature.properties.id)).not.toContain(String(unlocatedOrdinary.id));
    expect(mapChannelUnlocatedCount(channels, memberships, groups, MAP_PAGE_ALL_STORED_GROUPS)).toBe(1);
  });
});

describe('mapQsoFeatures', () => {
  it('places FN31 at the grid center with grid-center metadata', () => {
    const center = maidenheadToLatLon('FN31');
    const collection = mapQsoFeatures([contact()]);
    const feature = collection.features[0];

    expect(collection.features).toHaveLength(1);
    expect(feature?.geometry.coordinates).toEqual([center?.longitude, center?.latitude]);
    expect(feature?.properties).toEqual({
      grid: 'FN31',
      status: 'none',
      count: 1,
      locationKind: 'grid-center',
      precisionLength: 4,
      precisionLabel: 'square center · about 2° × 1°',
    });

    for (const value of Object.values(feature?.properties ?? {})) {
      expect(['string', 'number']).toContain(typeof value);
    }
  });

  it('labels a 2-character field and a 6-character subsquare', () => {
    const field = mapQsoFeatures([contact({ theirGridsquare: 'FN' })]).features[0];
    const subsquare = mapQsoFeatures([contact({ theirGridsquare: 'FN31ab' })]).features[0];
    const fieldCenter = maidenheadToLatLon('FN');
    const subsquareCenter = maidenheadToLatLon('FN31ab');

    expect(field?.properties.precisionLength).toBe(2);
    expect(field?.properties.precisionLabel).toBe('field center · about 20° × 10°');
    expect(field?.geometry.coordinates).toEqual([fieldCenter?.longitude, fieldCenter?.latitude]);
    expect(subsquare?.properties.precisionLength).toBe(6);
    expect(subsquare?.properties.precisionLabel).toBe('subsquare center · about 5′ × 2.5′');
    expect(subsquare?.geometry.coordinates).toEqual([subsquareCenter?.longitude, subsquareCenter?.latitude]);
    expect(mapQsoPrecisionLabel('not-a-grid')).toBe('');
  });

  it('omits invalid and missing grids', () => {
    const qsos = [
      contact({ theirGridsquare: undefined }),
      contact({ theirCallsign: 'K1ABC', theirGridsquare: 'Connecticut' }),
      contact({ theirCallsign: 'N0ZZ', theirGridsquare: 'FN31' }),
    ];
    const collection = mapQsoFeatures(qsos);

    expect(collection.features.map((feature) => feature.properties.grid)).toEqual(['FN31']);
    expect(mapQsoUnmappedCount(qsos)).toBe(2);
  });

  it('groups two contacts on one grid into one feature', () => {
    const collection = mapQsoFeatures([
      contact(),
      contact({ theirCallsign: 'K1ABC' }),
    ]);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.properties.count).toBe(2);
    expect(collection.features[0]?.properties.grid).toBe('FN31');
  });

  it('clusters one thousand contacts into three grid features', () => {
    const grids = ['FN31', 'EM48', 'DM04'];
    const qsos: StationLogQso[] = [];

    for (let index = 0; index < 1_000; index += 1) {
      qsos.push(
        contact({
          theirCallsign: `K${index}`,
          theirGridsquare: grids[index % grids.length],
        }),
      );
    }

    const collection = mapQsoFeatures(qsos);

    expect(collection.features).toHaveLength(3);
    expect(collection.features.reduce((sum, feature) => sum + feature.properties.count, 0)).toBe(1_000);
    expect(mapQsoUnmappedCount(qsos)).toBe(0);
  });

  it('lists the three cell spans in the standing note', () => {
    expect(MAP_QSO_GRID_CENTER_NOTE).toContain('field center · about 20° × 10°');
    expect(MAP_QSO_GRID_CENTER_NOTE).toContain('square center · about 2° × 1°');
    expect(MAP_QSO_GRID_CENTER_NOTE).toContain('subsquare center · about 5′ × 2.5′');
  });
});

describe('mapStationFeatures', () => {
  const home: RadioStation = {
    id: HOME_STATION_ID,
    nickname: 'Home',
    latitude: 30.27,
    longitude: -97.74,
    createdAt: 1,
    updatedAt: 1,
  };

  const portable: RadioStation = {
    id: 'station-portable',
    nickname: 'Portable',
    gridsquare: 'EM48',
    createdAt: 1,
    updatedAt: 1,
  };

  const unlocated: RadioStation = {
    id: 'station-missing',
    nickname: 'Missing',
    createdAt: 1,
    updatedAt: 1,
  };

  const stations = [home, portable, unlocated];

  it('marks Home as home and another located site as station', () => {
    const collection = mapStationFeatures(stations);

    expect(collection.features.map((feature) => feature.properties.role)).toEqual(['home', 'station']);
    expect(collection.features[0]?.properties.id).toBe(HOME_STATION_ID);
    expect(collection.features[1]?.properties.id).toBe('station-portable');
  });

  it('uses stored coordinates instead of the grid center', () => {
    const collection = mapStationFeatures([
      {
        ...home,
        gridsquare: 'FN31',
        latitude: 41.7,
        longitude: -72.5,
      },
    ]);

    expect(collection.features[0]?.geometry.coordinates).toEqual([-72.5, 41.7]);
  });

  it('omits Null Island and stations with no location', () => {
    expect(
      mapStationFeatures([{ id: 'null', nickname: 'Null', latitude: 0, longitude: 0, createdAt: 1, updatedAt: 1 }])
        .features,
    ).toHaveLength(0);
    expect(mapStationFeatures([unlocated]).features).toHaveLength(0);
    expect(mapStationHomeUnlocated(stations)).toBe(false);
    expect(mapStationOtherUnlocatedCount(stations)).toBe(1);
  });

  it('returns only antennas assigned to a station', () => {
    const atHome = createStationAntenna({
      stationId: HOME_STATION_ID,
      nickname: 'Dipole',
      typeId: 'dipole',
      heightAglM: 10,
      headingDeg: 90,
      bands: ['20m'],
    });
    const onRadio = createStationAntenna({
      radioId: 'radio-1',
      nickname: 'Whip',
      typeId: 'dual-band-vertical',
      heightAglM: 1.5,
      bands: ['2m', '70cm'],
    });
    const antennas: StationAntenna[] = [atHome, onRadio];

    expect(mapStationAntennas(HOME_STATION_ID, antennas)).toEqual([atHome]);
    expect(mapStationAntennas('station-portable', antennas)).toEqual([]);
  });
});
