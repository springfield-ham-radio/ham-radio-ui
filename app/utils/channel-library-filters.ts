import { channelHasLinkedNode } from '~/utils/linked-nodes';
import { adifBandFromFrequencyHz } from '~/utils/station-log-db';

/** ADIF band tokens, longest / highest first for stable sort. */
const BAND_TOKEN_ORDER = [
  '2190m',
  '630m',
  '560m',
  '160m',
  '80m',
  '60m',
  '40m',
  '30m',
  '20m',
  '17m',
  '15m',
  '12m',
  '10m',
  '6m',
  '4m',
  '2m',
  '1.25m',
  '70cm',
  '33cm',
  '23cm',
  '13cm',
  '9cm',
  '6cm',
  '3cm',
  '1.25cm',
  '2.4ghz',
  '5ghz',
] as const;

export type ChannelOnAirFilter = 'all' | 'on-air' | 'off-air';

export type ChannelLinkedFilter = 'all' | 'linked-only';

export type ChannelTripOpenFilter = 'all' | 'open-only';

export interface ChannelLibraryFilterSettings {
  /** Empty means all bands. */
  bands: string[];
  onAir: ChannelOnAirFilter;
}

export const DEFAULT_CHANNEL_LIBRARY_FILTER_SETTINGS: ChannelLibraryFilterSettings = {
  bands: [],
  onAir: 'all',
};

export function adifBandTokenForChannel(channel: { transmitFrequency: number }): string | undefined {
  return adifBandFromFrequencyHz(channel.transmitFrequency);
}

/**
 * ADIF band tokens present on these channels, in a ham-friendly order.
 */
export function uniqueLibraryBandTokens(channels: readonly { transmitFrequency: number }[]): string[] {
  const present = new Set<string>();

  for (const channel of channels) {
    const token = adifBandTokenForChannel(channel);

    if (token) {
      present.add(token);
    }
  }

  const ordered = BAND_TOKEN_ORDER.filter((token) => present.has(token));
  const extras = [...present].filter((token) => !BAND_TOKEN_ORDER.includes(token as (typeof BAND_TOKEN_ORDER)[number]));
  extras.sort((left, right) => left.localeCompare(right));

  return [...ordered, ...extras];
}

export function libraryBandFilterItems(tokens: readonly string[]): Array<{ label: string; value: string }> {
  return tokens.map((token) => ({ label: token, value: token }));
}

export function matchesLibraryBandFilter(
  channel: { transmitFrequency: number },
  selectedBands: readonly string[],
): boolean {
  if (selectedBands.length === 0) {
    return true;
  }

  const token = adifBandTokenForChannel(channel);

  return token !== undefined && selectedBands.includes(token);
}

/**
 * Selection keys that are still in the filtered table. Hidden rows are not selected.
 */
export function selectionVisibleOnly(
  selection: Record<string, boolean>,
  visibleIds: readonly string[],
): Record<string, boolean> {
  const visible = new Set(visibleIds);
  const next: Record<string, boolean> = {};

  for (const [id, selected] of Object.entries(selection)) {
    if (selected && visible.has(id)) {
      next[id] = true;
    }
  }

  return next;
}

/**
 * Channels an export should write.
 * A selection exports those rows. Otherwise the visible table.
 * Rows that are filtered out, or that are not in the library, are left out.
 */
export function channelsForLibraryExport<T extends { id: string | number }>(input: {
  selected: readonly T[];
  visible: readonly T[];
  libraryIds: readonly string[];
}): T[] {
  const library = new Set(input.libraryIds);
  const visibleIds = new Set(input.visible.map((channel) => String(channel.id)));
  const inLibrary = (channel: T) => library.has(String(channel.id)) && visibleIds.has(String(channel.id));

  if (input.selected.length > 0) {
    return input.selected.filter(inLibrary);
  }

  return input.visible.filter(inLibrary);
}
export function matchesLibraryOnAirFilter(channel: { onAir?: boolean }, filter: ChannelOnAirFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (channel.onAir === undefined) {
    return false;
  }

  return filter === 'on-air' ? channel.onAir === true : channel.onAir === false;
}

export function matchesLibraryLinkedFilter(
  channel: Parameters<typeof channelHasLinkedNode>[0],
  filter: ChannelLinkedFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  return channelHasLinkedNode(channel);
}
