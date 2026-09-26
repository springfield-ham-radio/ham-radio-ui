import { describe, expect, it } from 'vitest';
import { defaultPredefinedChannelGroupSettings } from '../../app/utils/predefined-channel-settings.ts';
import {
  PREDEFINED_CHANNEL_GROUP_IDS,
  findPredefinedChannel,
  isPredefinedChannelId,
  isPredefinedGroupId,
  predefinedChannelGroups,
  predefinedChannelsForGroup,
  visiblePredefinedChannelGroups,
} from '../../app/utils/predefined-channel-groups.ts';

describe('predefined channel groups', () => {
  const weather = predefinedChannelsForGroup(PREDEFINED_CHANNEL_GROUP_IDS.weather);
  const frs = predefinedChannelsForGroup(PREDEFINED_CHANNEL_GROUP_IDS.frs);
  const gmrs = predefinedChannelsForGroup(PREDEFINED_CHANNEL_GROUP_IDS.gmrs);

  it('should list Weather, FRS, and GMRS as built-in groups', () => {
    expect(predefinedChannelGroups().map((group) => group.name)).toEqual(['Weather', 'FRS', 'GMRS']);
    expect(predefinedChannelGroups().every((group) => group.builtin)).toBe(true);
  });

  it('should list NOAA WX1–WX7 and Environment Canada WX8–WX10 as receive-only', () => {
    expect(weather?.map((channel) => channel.name)).toEqual([
      'WX1',
      'WX2',
      'WX3',
      'WX4',
      'WX5',
      'WX6',
      'WX7',
      'WX8',
      'WX9',
      'WX10',
    ]);
    expect(weather?.[0]).toMatchObject({
      transmitFrequency: 162_550_000,
      receiveFrequency: 162_550_000,
      notes: 'Receive only',
      kind: 'channel',
    });
    expect(weather?.find((channel) => channel.name === 'WX8')).toMatchObject({
      transmitFrequency: 161_650_000,
      receiveFrequency: 161_650_000,
    });
    expect(weather?.find((channel) => channel.name === 'WX10')?.receiveFrequency).toBe(163_275_000);
  });

  it('should list FRS channels 1–22 on the shared and interstitial frequencies', () => {
    expect(frs?.map((channel) => channel.name)).toEqual(Array.from({ length: 22 }, (_, index) => `FRS ${index + 1}`));
    expect(frs?.[0]).toMatchObject({
      transmitFrequency: 462_562_500,
      receiveFrequency: 462_562_500,
      kind: 'channel',
    });
    expect(frs?.find((channel) => channel.name === 'FRS 8')).toMatchObject({
      transmitFrequency: 467_562_500,
      receiveFrequency: 467_562_500,
    });
    expect(frs?.find((channel) => channel.name === 'FRS 22')).toMatchObject({
      transmitFrequency: 462_725_000,
      receiveFrequency: 462_725_000,
    });
  });

  it('should list GMRS simplex channels and repeater pairs, without FRS-only 8–14', () => {
    expect(gmrs?.map((channel) => channel.name)).toEqual([
      'GMRS 1',
      'GMRS 2',
      'GMRS 3',
      'GMRS 4',
      'GMRS 5',
      'GMRS 6',
      'GMRS 7',
      'GMRS 15',
      'GMRS 16',
      'GMRS 17',
      'GMRS 18',
      'GMRS 19',
      'GMRS 20',
      'GMRS 21',
      'GMRS 22',
      'GMRS 15RP',
      'GMRS 16RP',
      'GMRS 17RP',
      'GMRS 18RP',
      'GMRS 19RP',
      'GMRS 20RP',
      'GMRS 21RP',
      'GMRS 22RP',
    ]);
    expect(gmrs?.find((channel) => channel.name === 'GMRS 1')).toMatchObject({
      transmitFrequency: 462_562_500,
      receiveFrequency: 462_562_500,
      kind: 'channel',
    });
    expect(gmrs?.find((channel) => channel.name === 'GMRS 15RP')).toMatchObject({
      transmitFrequency: 467_550_000,
      receiveFrequency: 462_550_000,
      kind: 'repeater',
    });
    expect(gmrs?.some((channel) => channel.name === 'GMRS 8')).toBe(false);
  });

  it('should keep stable ids that are not library channels', () => {
    const wx1 = weather?.[0];

    expect(wx1?.id).toBe('builtin:weather:WX1');
    expect(isPredefinedChannelId(wx1?.id ?? '')).toBe(true);
    expect(isPredefinedChannelId('not-builtin')).toBe(false);
    expect(findPredefinedChannel('builtin:frs:8')?.name).toBe('FRS 8');
    expect(findPredefinedChannel('builtin:weather')).toBeUndefined();
  });

  it('should return channels only for a built-in group id', () => {
    expect(isPredefinedGroupId(PREDEFINED_CHANNEL_GROUP_IDS.gmrs)).toBe(true);
    expect(isPredefinedGroupId('all')).toBe(false);
    expect(predefinedChannelsForGroup('all')).toBeUndefined();
  });

  it('should omit a group when its hide preference is on', () => {
    const settings = {
      ...defaultPredefinedChannelGroupSettings(),
      hideWeather: true,
      hideGmrs: true,
    };

    expect(visiblePredefinedChannelGroups(settings).map((group) => group.id)).toEqual([
      PREDEFINED_CHANNEL_GROUP_IDS.frs,
    ]);
    expect(visiblePredefinedChannelGroups(defaultPredefinedChannelGroupSettings()).map((group) => group.name)).toEqual([
      'Weather',
      'FRS',
      'GMRS',
    ]);
  });
});
