import { describe, expect, it } from 'vitest';
import {
  matchesLibraryBandFilter,
  matchesLibraryOnAirFilter,
  selectionVisibleOnly,
  uniqueLibraryBandTokens,
} from '../../app/utils/channel-library-filters.ts';
import { parseChannelLibraryFilterSettings } from '../../app/utils/channel-library-filter-settings.ts';

describe('channel-library-filters', () => {
  it('lists ADIF band tokens in ham order', () => {
    const tokens = uniqueLibraryBandTokens([
      { transmitFrequency: 446_000_000 },
      { transmitFrequency: 146_520_000 },
      { transmitFrequency: 28_400_000 },
    ]);

    expect(tokens).toEqual(['10m', '2m', '70cm']);
  });

  it('filters by selected bands and treats empty selection as all', () => {
    const channel = { transmitFrequency: 146_520_000 };

    expect(matchesLibraryBandFilter(channel, [])).toBe(true);
    expect(matchesLibraryBandFilter(channel, ['2m'])).toBe(true);
    expect(matchesLibraryBandFilter(channel, ['70cm'])).toBe(false);
    expect(matchesLibraryBandFilter({ transmitFrequency: 999 }, ['2m'])).toBe(false);
  });

  it('filters on-air status and keeps unknown status on All only', () => {
    expect(matchesLibraryOnAirFilter({ onAir: true }, 'all')).toBe(true);
    expect(matchesLibraryOnAirFilter({ onAir: false }, 'all')).toBe(true);
    expect(matchesLibraryOnAirFilter({}, 'all')).toBe(true);
    expect(matchesLibraryOnAirFilter({ onAir: true }, 'on-air')).toBe(true);
    expect(matchesLibraryOnAirFilter({ onAir: false }, 'on-air')).toBe(false);
    expect(matchesLibraryOnAirFilter({}, 'on-air')).toBe(false);
    expect(matchesLibraryOnAirFilter({ onAir: false }, 'off-air')).toBe(true);
    expect(matchesLibraryOnAirFilter({}, 'off-air')).toBe(false);
  });

  it('drops filtered-out rows from the selection used by bulk delete', () => {
    const visible = selectionVisibleOnly({ 'on-2m': true, 'hidden-70cm': true, 'unchecked': false }, ['on-2m']);

    expect(visible).toEqual({ 'on-2m': true });
    expect(Object.keys(visible)).toEqual(['on-2m']);
  });
});

describe('channel-library-filter-settings', () => {
  it('round-trips persisted band and on-air choices', () => {
    const parsed = parseChannelLibraryFilterSettings(
      JSON.stringify({ bands: ['2m', '70cm'], onAir: 'on-air' }),
    );

    expect(parsed).toEqual({ bands: ['2m', '70cm'], onAir: 'on-air' });
    expect(parseChannelLibraryFilterSettings('{"onAir":"bad"}').onAir).toBe('all');
  });
});
