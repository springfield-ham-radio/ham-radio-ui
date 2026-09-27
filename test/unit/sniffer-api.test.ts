import { describe, expect, it } from 'vitest';
import {
  snifferFetchErrorMessage,
  snifferPacketToHex,
  snifferEventSourceErrorAction,
  mergeSnifferPackets,
  snifferPacketsNeedReload,
  type SnifferPacket,
} from '../../app/utils/sniffer-api.ts';

function packet(id: number, data: number[]): SnifferPacket {
  return {
    id,
    timestamp: '000.000',
    elapsedMs: 0,
    direction: 'COMPUTER->RADIO',
    data,
  };
}

describe('sniffer API helpers', () => {
  it('should format packet bytes as uppercase hex words', () => {
    expect(snifferPacketToHex([0x50, 0xbb, 0x06])).toBe('50 BB 06');
  });

  it('should prefer API statusMessage from a fetch error', () => {
    expect(
      snifferFetchErrorMessage({
        data: { statusMessage: 'computerPort is required' },
        message: '[POST] failed',
      }),
    ).toBe('computerPort is required');
  });

  it('should reload when the sniffer has frames the list does not', () => {
    expect(snifferPacketsNeedReload(0, 2, 0)).toBe(true);
    expect(snifferPacketsNeedReload(2, 2, 0)).toBe(false);
    expect(snifferPacketsNeedReload(0, 2, 2)).toBe(false);
    expect(snifferPacketsNeedReload(0, 3, 2)).toBe(true);
  });

  it('should merge sniffer frames by id and keep a cleared list empty', () => {
    const first = packet(1, [0x50]);
    const second = packet(2, [0x06]);

    expect(mergeSnifferPackets([], [first, second], 0)).toEqual([first, second]);
    expect(mergeSnifferPackets([first], [first, second], 0)).toEqual([first, second]);
    expect(mergeSnifferPackets([], [first, second], 2)).toEqual([]);
  });

  it('should ignore EventSource errors from a replaced or reconnecting stream', () => {
    const current = {};
    const stale = {};

    expect(snifferEventSourceErrorAction({ current, source: stale, readyState: 2 })).toBe('ignore');
    expect(snifferEventSourceErrorAction({ current, source: current, readyState: 0 })).toBe('ignore');
    expect(snifferEventSourceErrorAction({ current, source: current, readyState: 2 })).toBe('drop');
  });
});
