/** Query value for `?fixture=write-failed` on the Radio page. */
export const WRITE_FAILED_DEV_FIXTURE_QUERY = 'write-failed';

/**
 * Minimal CAT-style serial log: pre-write backup read frames with no write-phase I/O.
 * Matches the #107 case where connect fails before the write driver logs traffic.
 */
export function writeFailedDevFixtureSerialLog(): {
  metadata: { startTime: string; totalEntries: number; version: string };
  entries: Array<{
    timestamp: string;
    elapsedMs: number;
    direction: 'SEND' | 'RECV';
    data: number[];
  }>;
} {
  return {
    metadata: { startTime: '2026-10-11T12:00:00.000Z', totalEntries: 2, version: '1.0.0' },
    entries: [
      { timestamp: '0', elapsedMs: 0, direction: 'SEND', data: [0x4d, 0x57] },
      { timestamp: '1', elapsedMs: 12, direction: 'RECV', data: [0x06] },
    ],
  };
}
