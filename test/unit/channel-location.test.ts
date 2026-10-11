import { describe, expect, it } from 'vitest';
import {
  CHANNEL_LOCATION_EMPTY,
  compareChannelLocation,
  formatChannelLocation,
  sortChannelsByLocation,
} from '../../app/utils/channel-location.ts';

describe('formatChannelLocation', () => {
  it('shows city and state, then coordinates, then an em dash', () => {
    expect(formatChannelLocation({ city: 'Austin', state: 'Texas' })).toBe('Austin, Texas');
    expect(formatChannelLocation({ city: 'Austin - South Austin Med Ctr', state: 'Texas' })).toBe(
      'Austin - South Austin Med Ctr, Texas',
    );
    expect(formatChannelLocation({ city: 'Lyman' })).toBe('Lyman');
    expect(formatChannelLocation({ state: 'Maine' })).toBe('Maine');
    expect(formatChannelLocation({ latitude: 30.2672, longitude: -97.7431 })).toMatch(/N/);
    expect(formatChannelLocation({ latitude: 30.2672, longitude: -97.7431 })).toMatch(/W/);
    expect(formatChannelLocation({})).toBe(CHANNEL_LOCATION_EMPTY);
    expect(formatChannelLocation({ latitude: 0, longitude: 0 })).toBe(CHANNEL_LOCATION_EMPTY);
    expect(formatChannelLocation({ city: 'Austin', state: 'Texas', latitude: 30, longitude: -97 })).toBe('Austin, Texas');
  });
});

describe('sortChannelsByLocation', () => {
  const rows = [
    { id: 'blank', city: undefined, state: undefined },
    { id: 'austin', city: 'Austin', state: 'Texas' },
    { id: 'leander', city: 'Leander', state: 'Texas' },
    { id: 'coords', city: undefined, state: undefined, latitude: 43.5, longitude: -70.7 },
  ];

  it('sorts city labels ahead of coordinates and leaves unlocated rows last', () => {
    const ascending = sortChannelsByLocation(rows, 'asc').map((row) => row.id);
    const descending = sortChannelsByLocation(rows, 'desc').map((row) => row.id);

    expect(ascending[0]).toBe('coords');
    expect(ascending[1]).toBe('austin');
    expect(ascending[2]).toBe('leander');
    expect(ascending[3]).toBe('blank');
    expect(descending[0]).toBe('leander');
    expect(descending[1]).toBe('austin');
    expect(descending.at(-2)).toBe('coords');
    expect(descending.at(-1)).toBe('blank');
    expect(compareChannelLocation(rows[1]!, rows[2]!)).toBeLessThan(0);
  });
});
