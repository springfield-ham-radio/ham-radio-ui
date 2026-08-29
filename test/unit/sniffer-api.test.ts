import { describe, it } from 'node:test';
import { expect } from 'chai';
import { snifferFetchErrorMessage, snifferPacketToHex } from '../../app/utils/sniffer-api.ts';

describe('sniffer API helpers', () => {
  it('should format packet bytes as uppercase hex words', () => {
    expect(snifferPacketToHex([0x50, 0xbb, 0x06])).to.equal('50 BB 06');
  });

  it('should prefer API statusMessage from a fetch error', () => {
    expect(
      snifferFetchErrorMessage({
        data: { statusMessage: 'computerPort is required' },
        message: '[POST] failed',
      }),
    ).to.equal('computerPort is required');
  });
});
