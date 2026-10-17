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
 * Rows without repeater on-air status appear only when the filter is All.
 */
export function matchesLibraryOnAirFilter(channel: { onAir?: boolean }, filter: ChannelOnAirFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (channel.onAir === undefined) {
    return false;
  }

  return filter === 'on-air' ? channel.onAir === true : channel.onAir === false;
}
