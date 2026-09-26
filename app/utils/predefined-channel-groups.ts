import { Frequency, RadioChannelId, RadioToneType, type RadioTone, type SpectrumBand } from '@springfield/ham-radio-api';
import type { ChannelGroup } from '~/utils/channel-groups';
import type { PredefinedChannelGroupSettings } from '~/utils/predefined-channel-settings';
import type { SavedChannel, SavedChannelKind } from '~/utils/saved-channels-db';
import bandsData from '../../node_modules/@springfield/ham-radio-utils/dist/db/bands.json' with { type: 'json' };

export const PREDEFINED_CHANNEL_GROUP_IDS = {
  weather: 'builtin:weather',
  frs: 'builtin:frs',
  gmrs: 'builtin:gmrs',
} as const;

export type PredefinedChannelGroupId = (typeof PREDEFINED_CHANNEL_GROUP_IDS)[keyof typeof PREDEFINED_CHANNEL_GROUP_IDS];

const NO_TONE: RadioTone = { tone: 0, type: RadioToneType.CTCSS };

const GROUP_DEFINITIONS: readonly {
  id: PredefinedChannelGroupId;
  name: string;
  icon: string;
  hideKey: keyof PredefinedChannelGroupSettings;
}[] = [
  {
    id: PREDEFINED_CHANNEL_GROUP_IDS.weather,
    name: 'Weather',
    icon: 'i-lucide-cloud-sun',
    hideKey: 'hideWeather',
  },
  {
    id: PREDEFINED_CHANNEL_GROUP_IDS.frs,
    name: 'FRS',
    // Iconify's Lucide set has no walkie-talkie glyph, so the tab would render blank.
    icon: 'i-lucide-radio-receiver',
    hideKey: 'hideFrs',
  },
  {
    id: PREDEFINED_CHANNEL_GROUP_IDS.gmrs,
    name: 'GMRS',
    icon: 'i-lucide-radio',
    hideKey: 'hideGmrs',
  },
];

interface PlanChannel {
  name: string;
  frequency: number;
}

const bands = bandsData as SpectrumBand[];

function channelsNamed(bandName: string): PlanChannel[] {
  const band = bands.find((entry) => entry.name === bandName);

  return (band?.channels ?? []).map((channel) => ({
    name: channel.name,
    frequency: channel.frequency,
  }));
}

function channelNumber(name: string): number {
  const match = /^(\d+)/.exec(name);

  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function builtinChannel(
  id: string,
  name: string,
  receiveHz: number,
  transmitHz: number,
  kind: SavedChannelKind,
  notes?: string,
): SavedChannel {
  return {
    id: RadioChannelId(id),
    name,
    kind,
    transmitFrequency: Frequency(transmitHz),
    receiveFrequency: Frequency(receiveHz),
    transmitTone: NO_TONE,
    receiveTone: NO_TONE,
    notes,
    createdAt: 0,
    updatedAt: 0,
  };
}

function weatherChannels(): SavedChannel[] {
  const channels = bands
    .filter((band) => band.name === 'Weather Radio' || band.name.startsWith('Weather Radio-'))
    .flatMap((band) => band.channels ?? []);

  return [...channels]
    .sort((left, right) => {
      const leftNumber = /^WX(\d+)$/i.exec(left.name);
      const rightNumber = /^WX(\d+)$/i.exec(right.name);

      return Number(leftNumber?.[1] ?? Number.POSITIVE_INFINITY) - Number(rightNumber?.[1] ?? Number.POSITIVE_INFINITY);
    })
    .map((channel) =>
      builtinChannel(
        `${PREDEFINED_CHANNEL_GROUP_IDS.weather}:${channel.name}`,
        channel.name,
        channel.frequency,
        channel.frequency,
        'channel',
        'Receive only',
      ),
    );
}

function frsChannels(): SavedChannel[] {
  const channels = [...channelsNamed('FRS/GMRS-1'), ...channelsNamed('FRS/GMRS-2')].sort(
    (left, right) => channelNumber(left.name) - channelNumber(right.name),
  );

  return channels.map((channel) =>
    builtinChannel(
      `${PREDEFINED_CHANNEL_GROUP_IDS.frs}:${channel.name}`,
      `FRS ${channel.name}`,
      channel.frequency,
      channel.frequency,
      'channel',
    ),
  );
}

function gmrsChannels(): SavedChannel[] {
  const simplex = channelsNamed('FRS/GMRS-1').sort((left, right) => channelNumber(left.name) - channelNumber(right.name));
  const simplexByName = new Map(simplex.map((channel) => [channel.name, channel.frequency]));
  const repeaters = channelsNamed('GMRS')
    .filter((channel) => channel.name.endsWith('RP'))
    .sort((left, right) => channelNumber(left.name) - channelNumber(right.name));

  const simplexRows = simplex.map((channel) =>
    builtinChannel(
      `${PREDEFINED_CHANNEL_GROUP_IDS.gmrs}:${channel.name}`,
      `GMRS ${channel.name}`,
      channel.frequency,
      channel.frequency,
      'channel',
    ),
  );

  const repeaterRows = repeaters.flatMap((channel) => {
    const outputName = channel.name.slice(0, -2);
    const receiveHz = simplexByName.get(outputName);

    if (receiveHz === undefined) {
      return [];
    }

    return [
      builtinChannel(
        `${PREDEFINED_CHANNEL_GROUP_IDS.gmrs}:${channel.name}`,
        `GMRS ${channel.name}`,
        receiveHz,
        channel.frequency,
        'repeater',
      ),
    ];
  });

  return [...simplexRows, ...repeaterRows];
}

const CHANNELS_BY_GROUP: Record<PredefinedChannelGroupId, SavedChannel[]> = {
  [PREDEFINED_CHANNEL_GROUP_IDS.weather]: weatherChannels(),
  [PREDEFINED_CHANNEL_GROUP_IDS.frs]: frsChannels(),
  [PREDEFINED_CHANNEL_GROUP_IDS.gmrs]: gmrsChannels(),
};

export function isPredefinedGroupId(groupId: string): groupId is PredefinedChannelGroupId {
  return Object.values(PREDEFINED_CHANNEL_GROUP_IDS).includes(groupId as PredefinedChannelGroupId);
}

export function predefinedChannelGroups(): ChannelGroup[] {
  return GROUP_DEFINITIONS.map((group) => ({
    id: group.id,
    name: group.name,
    createdAt: 0,
    updatedAt: 0,
    builtin: true,
    icon: group.icon,
  }));
}

export function visiblePredefinedChannelGroups(settings: PredefinedChannelGroupSettings): ChannelGroup[] {
  return predefinedChannelGroups().filter((group) => {
    const definition = GROUP_DEFINITIONS.find((entry) => entry.id === group.id);

    return definition ? settings[definition.hideKey] !== true : false;
  });
}

export function predefinedChannelsForGroup(groupId: string): SavedChannel[] | undefined {
  if (!isPredefinedGroupId(groupId)) {
    return undefined;
  }

  return CHANNELS_BY_GROUP[groupId];
}

export function findPredefinedChannel(id: string): SavedChannel | undefined {
  for (const channels of Object.values(CHANNELS_BY_GROUP)) {
    const found = channels.find((channel) => channel.id === id);

    if (found) {
      return found;
    }
  }

  return undefined;
}

export function isPredefinedChannelId(id: string): boolean {
  return findPredefinedChannel(id) !== undefined;
}
