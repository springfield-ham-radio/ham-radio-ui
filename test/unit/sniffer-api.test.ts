import { describe, it } from 'node:test';
import { expect } from 'chai';
import { snifferFetchErrorMessage, snifferPacketToHex, snifferEventSourceErrorAction } from '../../app/utils/sniffer-api.ts';

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

  it('should ignore EventSource errors from a replaced or reconnecting stream', () => {
    const current = {};
    const stale = {};

    expect(snifferEventSourceErrorAction({ current, source: stale, readyState: 2 })).to.equal('ignore');
    expect(snifferEventSourceErrorAction({ current, source: current, readyState: 0 })).to.equal('ignore');
    expect(snifferEventSourceErrorAction({ current, source: current, readyState: 2 })).to.equal('drop');
  });
});
