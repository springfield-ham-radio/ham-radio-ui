import { RadioChannelId } from '@springfield/ham-radio-api';
import type { ChannelGroup, ChannelGroupMembership } from '~/utils/channel-groups';
import type { SavedChannel } from '~/utils/saved-channels-db';
import { createStationAntenna, HOME_STATION_ID } from '~/utils/antenna-station';
import type { RadioStation, StationAntenna } from '~/utils/antenna-station';
import { createStationLogQso, type StationLogQso } from '~/utils/station-log-db';

const now = 1_700_000_000_000;

const fixtureGroupTrip = 'fixture-group-trip';
const fixtureGroupLibrary = 'fixture-group-library';
const fixtureStationGridOnly = 'fixture-station-grid';

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

const fixtureTripStopNear: SavedChannel = {
  id: RadioChannelId('fixture-trip-near'),
  kind: 'repeater',
  name: 'Fixture trip near',
  callsign: 'W5NEA',
  transmitFrequency: 146_520_000,
  receiveFrequency: 146_520_000,
  latitude: 30.275,
  longitude: -97.745,
  createdAt: now,
  updatedAt: now,
};

const fixtureTripStopMid: SavedChannel = {
  id: RadioChannelId('fixture-trip-mid'),
  kind: 'repeater',
  name: 'Fixture trip mid',
  callsign: 'W5MID',
  transmitFrequency: 146_520_000,
  receiveFrequency: 146_520_000,
  latitude: 30.29,
  longitude: -97.72,
  createdAt: now,
  updatedAt: now,
};

const fixtureTripStopFar: SavedChannel = {
  id: RadioChannelId('fixture-trip-far'),
  kind: 'repeater',
  name: 'Fixture trip far',
  callsign: 'W5FAR',
  transmitFrequency: 146_520_000,
  receiveFrequency: 146_520_000,
  latitude: 30.32,
  longitude: -97.68,
  createdAt: now,
  updatedAt: now,
};

const fixtureTripStopUnlocated: SavedChannel = {
  id: RadioChannelId('fixture-trip-unlocated'),
  kind: 'repeater',
  name: 'Fixture trip unlocated',
  callsign: 'N0TRP',
  transmitFrequency: 146_520_000,
  receiveFrequency: 146_520_000,
  latitude: 0,
  longitude: 0,
  createdAt: now,
  updatedAt: now,
};

export interface MapDevFixture {
  channels: SavedChannel[];
  groups: ChannelGroup[];
  memberships: ChannelGroupMembership[];
  stations: RadioStation[];
  antennas: StationAntenna[];
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
    { groupId: fixtureGroupTrip, channelId: fixtureTripStopNear.id },
    { groupId: fixtureGroupTrip, channelId: fixtureTripStopMid.id },
    { groupId: fixtureGroupTrip, channelId: fixtureTripStopFar.id },
    { groupId: fixtureGroupTrip, channelId: fixtureTripStopUnlocated.id },
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
    {
      id: fixtureStationGridOnly,
      nickname: 'Grid shack',
      gridsquare: 'EM41',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const antennas: StationAntenna[] = [
    createStationAntenna(
      {
        stationId: HOME_STATION_ID,
        nickname: 'Fixture dipole',
        typeId: 'dipole',
        heightAglM: 10,
        headingDeg: 90,
        bands: ['20m'],
      },
      { now },
    ),
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
    channels: [
      fixtureRepeaterLocated,
      fixtureRepeaterUnlocated,
      fixtureOrdinaryChannel,
      fixtureTripStopNear,
      fixtureTripStopMid,
      fixtureTripStopFar,
      fixtureTripStopUnlocated,
    ],
    groups,
    memberships,
    stations,
    antennas,
    qsos,
  };
}
