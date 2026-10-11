import { describe, expect, it } from 'vitest';
import { RadioChannelId } from '@springfield/ham-radio-api';
import {
  channelMapBounds,
  channelMapFeatures,
  channelMapLocatedIdKey,
  channelMapUnlocatedCount,
  rangeRingPolygon,
} from '../../app/utils/channel-map.ts';
import { distanceKm } from '../../app/utils/location-format.ts';

const channelId = RadioChannelId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

describe('channelMapFeatures', () => {
  it('places a located repeater at longitude-latitude with metadata', () => {
    const collection = channelMapFeatures([
      {
        id: channelId,
        callsign: 'W5ABC',
        name: 'Austin repeater',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: 30.2672,
        longitude: -97.7431,
        band: '2M',
      },
    ]);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.geometry.coordinates).toEqual([-97.7431, 30.2672]);
    expect(collection.features[0]?.properties.id).toBe(String(channelId));
    expect(collection.features[0]?.properties.callsign).toBe('W5ABC');
    expect(collection.features[0]?.properties.band).toBe('2M');
    expect(collection.features[0]?.properties.transmitLabel).toMatch(/146/);
    expect(collection.features[0]?.properties.receiveLabel).toMatch(/146/);
  });

  it('omits undefined, null, and (0, 0) and counts them unlocated', () => {
    const channels = [
      { id: 'a', transmitFrequency: 146_340_000, receiveFrequency: 146_940_000 },
      {
        id: 'b',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: undefined,
        longitude: undefined,
      },
      {
        id: 'c',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: null as unknown as undefined,
        longitude: null as unknown as undefined,
      },
      {
        id: 'd',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: 0,
        longitude: 0,
      },
      {
        id: 'e',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: 0,
        longitude: 40,
      },
      {
        id: 'f',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: 10,
        longitude: 0,
      },
    ];

    const features = channelMapFeatures(channels);

    expect(features.features.map((feature) => feature.properties.id)).toEqual(['e', 'f']);
    expect(channelMapUnlocatedCount(channels)).toBe(4);
  });

  it('does not add rows that are not in the filtered input list', () => {
    const visible = channelMapFeatures([
      {
        id: 'visible',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: 30,
        longitude: -97,
      },
    ]);

    expect(visible.features).toHaveLength(1);
    expect(visible.features[0]?.properties.id).toBe('visible');
  });
});

describe('rangeRingPolygon', () => {
  it('returns a closed polygon with longitude-first coordinates about radiusKm from center', () => {
    const center = { latitude: 39.0997, longitude: -94.5786 };
    const radiusKm = 25;
    const feature = rangeRingPolygon(center, radiusKm);
    const ring = feature.geometry.coordinates[0]!;

    expect(ring[0]).toEqual(ring.at(-1));
    expect(ring.length).toBeGreaterThan(60);

    const sample = ring[8]!;
    const [longitude, latitude] = sample;
    const distance = distanceKm(center, { latitude, longitude });

    expect(Math.abs(distance - radiusKm)).toBeLessThan(0.5);
  });
});

describe('channelMapBounds', () => {
  it('includes markers and the start pin', () => {
    const features = channelMapFeatures([
      {
        id: 'one',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: 30,
        longitude: -97,
      },
    ]).features;

    const bounds = channelMapBounds(features, { latitude: 40, longitude: -90 });

    expect(bounds).toEqual({
      minLongitude: -97,
      minLatitude: 30,
      maxLongitude: -90,
      maxLatitude: 40,
    });
  });

  it('is undefined when nothing is located', () => {
    expect(channelMapBounds([], undefined)).toBeUndefined();
  });
});

describe('channelMapLocatedIdKey', () => {
  it('changes when the located id set or start point changes', () => {
    const channels = [
      {
        id: 'a',
        transmitFrequency: 146_340_000,
        receiveFrequency: 146_940_000,
        latitude: 30,
        longitude: -97,
      },
    ];

    const withoutStart = channelMapLocatedIdKey(channels);
    const withStart = channelMapLocatedIdKey(channels, { latitude: 40, longitude: -90 });

    expect(withoutStart).not.toBe(withStart);
  });
});
