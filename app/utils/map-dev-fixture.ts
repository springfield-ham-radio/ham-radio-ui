import { RadioChannelId } from '@springfield/ham-radio-api';
import type { ChannelGroup, ChannelGroupMembership } from '~/utils/channel-groups';
import type { SavedChannel } from '~/utils/saved-channels-db';
import { HOME_STATION_ID } from '~/utils/antenna-station';
import type { RadioStation } from '~/utils/antenna-station';
import { createStationLogQso, type StationLogQso } from '~/utils/station-log-db';

const now = 1_700_000_000_000;

const fixtureGroupTrip = 'fixture-group-trip';
const fixtureGroupLibrary = 'fixture-group-library';

const fixtureRepeaterLocated: SavedChannel = {
  id: RadioChannelId('fixture-repeater-located'),
  kind: 'repeater',
  name: 'Fixture 2m repeater',
  callsign: 'W5FIX',
  transmitFrequency: 146_340_000,
  receiveFrequency: 146_940_000,
  latitude: 30.2672,
  longitude: -97.7431,
  createdAt: now,
  updatedAt: now,
};

const fixtureRepeaterUnlocated: SavedChannel = {
  id: RadioChannelId('fixture-repeater-unlocated'),
  kind: 'repeater',
  name: 'Fixture unlocated repeater',
  callsign: 'N0LOC',
  transmitFrequency: 146_340_000,
  receiveFrequency: 146_940_000,
  latitude: 0,
  longitude: 0,
  createdAt: now,
  updatedAt: now,
};

const fixtureOrdinaryChannel: SavedChannel = {
  id: RadioChannelId('fixture-ordinary-channel'),
  kind: 'channel',
  name: 'Fixture simplex',
  transmitFrequency: 446_000_000,
  receiveFrequency: 446_000_000,
  latitude: 30.28,
  longitude: -97.75,
  createdAt: now,
  updatedAt: now,
};

export interface MapDevFixture {
  channels: SavedChannel[];
  groups: ChannelGroup[];
  memberships: ChannelGroupMembership[];
  stations: RadioStation[];
  qsos: StationLogQso[];
}

/**
 * In-memory map page fixture. Never written to SQLite or localStorage.
 */
export function mapDevFixture(): MapDevFixture {
  const groups: ChannelGroup[] = [
    {
      id: fixtureGroupLibrary,
      name: 'Fixture library',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: fixtureGroupTrip,
      name: 'Fixture trip',
      kind: 'trip',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const memberships: ChannelGroupMembership[] = [
    { groupId: fixtureGroupLibrary, channelId: fixtureRepeaterLocated.id },
    { groupId: fixtureGroupLibrary, channelId: fixtureRepeaterUnlocated.id },
    { groupId: fixtureGroupLibrary, channelId: fixtureOrdinaryChannel.id },
  ];

  const stations: RadioStation[] = [
    {
      id: HOME_STATION_ID,
      nickname: 'Home',
      latitude: 30.27,
      longitude: -97.74,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const qsos: StationLogQso[] = [
    createStationLogQso({
      startedAt: now,
      theirCallsign: 'W1AW',
      mode: 'SSB',
      theirGridsquare: 'EM48',
      qslSent: true,
    }),
    createStationLogQso({
      startedAt: now - 60_000,
      theirCallsign: 'K5FIX',
      mode: 'FM',
      theirGridsquare: 'EM48',
      qslReceived: true,
    }),
    createStationLogQso({
      startedAt: now - 120_000,
      theirCallsign: 'N2ZZ',
      mode: 'CW',
      theirGridsquare: 'EM48ss',
    }),
    createStationLogQso({
      startedAt: now - 180_000,
      theirCallsign: 'NOGRID',
      mode: 'FM',
      theirGridsquare: undefined,
    }),
  ];

  return {
    channels: [fixtureRepeaterLocated, fixtureRepeaterUnlocated, fixtureOrdinaryChannel],
    groups,
    memberships,
    stations,
    qsos,
  };
}
