import { afterEach, describe, expect, it, vi } from 'vitest';
import { callookGeocodeQueries, qthFromCallook, resolveCallookGrid, type CallookResponse } from '../../app/utils/callook.ts';
import { latLonToMaidenhead } from '../../app/utils/maidenhead.ts';

const libertyHill: CallookResponse = {
  status: 'VALID',
  name: 'ROBERT J PORTER',
  address: {
    line1: '411 BLESSING RANCH RD',
    line2: 'LIBERTY HILL, TX 78642',
  },
  location: {
    latitude: '',
    longitude: '',
    gridsquare: '',
  },
};

describe('callook license place', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the license city and state as the QTH', () => {
    expect(qthFromCallook(libertyHill)).toBe('Liberty Hill, TX');
    expect(
      qthFromCallook({
        status: 'VALID',
        address: { line2: 'NEWINGTON, CT 06111' },
      }),
    ).toBe('Newington, CT');
    expect(qthFromCallook({ status: 'VALID', address: { line2: 'PO BOX ONLY' } })).toBeUndefined();
  });

  it('keeps a grid Callook already calculated', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resolveCallookGrid({
        status: 'VALID',
        location: { gridsquare: 'fn31pr' },
      }),
    ).resolves.toBe('FN31PR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('geocodes the mailing address when Callook has no coordinates', async () => {
    const latitude = 30.6722752;
    const longitude = -97.920883;
    const urls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        urls.push(String(input));

        if (urls.length === 1) {
          return Response.json({ features: [] });
        }

        return Response.json({
          features: [{ geometry: { coordinates: [longitude, latitude] } }],
        });
      }),
    );

    await expect(resolveCallookGrid(libertyHill)).resolves.toBe(latLonToMaidenhead(latitude, longitude, 6));
    expect(callookGeocodeQueries(libertyHill)).toEqual([
      '411 BLESSING RANCH RD, LIBERTY HILL, TX 78642',
      'LIBERTY HILL, TX 78642',
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain(encodeURIComponent('411 BLESSING RANCH RD, LIBERTY HILL, TX 78642'));
    expect(urls[1]).toContain(encodeURIComponent('LIBERTY HILL, TX 78642'));
  });
});
