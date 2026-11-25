import { describe, expect, it, vi } from 'vitest';
import { serialDebugPacketsWhenActive } from '../../app/utils/serial-debug-packets.ts';
import * as snifferCapture from '../../app/utils/sniffer-capture.ts';

describe('serialDebugPacketsWhenActive', () => {
  const log = {
    metadata: { startTime: 't', totalEntries: 2, version: '1.0.0' },
    entries: [
      { timestamp: '0', elapsedMs: 0, direction: 'SEND' as const, data: [0x52] },
      { timestamp: '1', elapsedMs: 1, direction: 'RECV' as const, data: [0x57] },
    ],
  };

  it('returns an empty list when the Debug tab is inactive', () => {
    const spy = vi.spyOn(snifferCapture, 'snifferPacketsFromSerialLog');
    expect(serialDebugPacketsWhenActive(false, log)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('forwards to snifferPacketsFromSerialLog when active', () => {
    const packets = serialDebugPacketsWhenActive(true, log);
    expect(packets.length).toBeGreaterThan(0);
    expect(packets[0]?.direction).toBe('COMPUTER->RADIO');
  });
});