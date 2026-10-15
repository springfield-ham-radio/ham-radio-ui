import { describe, expect, it } from 'vitest';
import { RadioChannelId } from '@springfield/ham-radio-api';
import { CHANNEL_MAP_BAND_COLORS, CHANNEL_MAP_BAND_FALLBACK } from '../../app/utils/channel-map.ts';
import { MAP_PAGE_ALL_STORED_GROUPS } from '../../app/utils/map-page-settings.ts';
import {
  mapRepeaterChannels,
  mapRepeaterFeatures,
  mapRepeaterUnlocatedCount,
  resolveSelectedGroupIds,
} from '../../app/utils/map-page-layers.ts';
import type { ChannelGroup, ChannelGroupMembership } from '../../app/utils/channel-groups.ts';
import type { SavedChannel } from '../../app/utils/saved-channels-db.ts';

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

const channels = [locatedRepeater, ordinaryChannel, unlocatedRepeater, equatorRepeater];

const memberships: ChannelGroupMembership[] = [
  { groupId: groupA, channelId: locatedRepeater.id },
  { groupId: groupB, channelId: locatedRepeater.id },
  { groupId: groupA, channelId: ordinaryChannel.id },
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
