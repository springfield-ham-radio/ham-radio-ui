import { describe, expect, it } from 'vitest';
import { createStationLogQso, type StationLogQsoInput } from '../../app/utils/station-log-db.ts';
import {
  formatStationLogLocalTime,
  stationLogBandLabel,
  stationLogPotaRef,
  stationLogQrzStatus,
  summarizeStationLog,
} from '../../app/utils/station-log-summary.ts';

const startedAt = Date.UTC(2024, 5, 15, 14, 30, 0);

function contact(overrides: Partial<StationLogQsoInput> = {}) {
  return createStationLogQso({
    startedAt,
    theirCallsign: 'W1AW',
    mode: 'SSB',
    band: '40m',
    ...overrides,
  });
}

describe('station-log-summary', () => {
  it('counts contacts, unique calls, POTA refs, and QRZ uploads', () => {
    const summary = summarizeStationLog([
      contact({ theirCallsign: 'W1AW', adifExtra: { SIG: 'POTA', SIG_INFO: 'K-1234', QRZCOM_QSO_UPLOAD_STATUS: 'Y' } }),
      contact({ theirCallsign: 'w1aw', adifExtra: { QRZCOM_QSO_UPLOAD_STATUS: 'M' } }),
      contact({ theirCallsign: 'K1ABC', adifExtra: { QRZCOM_QSO_UPLOAD_STATUS: 'N' } }),
      contact({ theirCallsign: 'N0CALL' }),
    ]);

    expect(summary.qsoCount).toBe(4);
    expect(summary.uniqueCalls).toBe(3);
    expect(summary.potaCount).toBe(1);
    expect(summary.qrzCount).toBe(2);
  });

  it('reads hunter, activator, and direct POTA refs, and ignores other programs', () => {
    expect(stationLogPotaRef(contact({ adifExtra: { SIG: 'POTA', SIG_INFO: 'k-1234' } }))).toBe('K-1234');
    expect(
      stationLogPotaRef(
        contact({
          adifExtra: {
            SIG: 'POTA',
            SIG_INFO: 'K-1234',
            MY_SIG: 'POTA',
            MY_SIG_INFO: 'US-5678',
          },
        }),
      ),
    ).toBe('K-1234 US-5678');
    expect(stationLogPotaRef(contact({ adifExtra: { POTA_REF: 'K-1234', MY_POTA_REF: 'K-1234' } }))).toBe('K-1234');
    expect(stationLogPotaRef(contact({ adifExtra: { SIG: 'SOTA', SIG_INFO: 'W0C/FR-004' } }))).toBeUndefined();
    expect(stationLogQrzStatus(contact({ adifExtra: { QRZCOM_QSO_UPLOAD_STATUS: 'y' } }))).toBe('Y');
    expect(stationLogQrzStatus(contact({ adifExtra: { QRZCOM_QSO_UPLOAD_STATUS: 'N' } }))).toBeUndefined();
  });

  it('groups bands and modes by count, and fills a missing band from the frequency', () => {
    const summary = summarizeStationLog([
      contact({ band: '40m', mode: 'ssb' }),
      contact({ band: '40m', mode: 'SSB' }),
      contact({ band: '20m', mode: 'CW' }),
      contact({ theirCallsign: 'K1ABC', band: undefined, frequencyHz: 7_150_000, mode: 'FM' }),
    ]);

    expect(stationLogBandLabel(contact({ band: undefined, frequencyHz: 7_150_000 }))).toBe('40M');
    expect(summary.bands).toEqual([
      { label: '40M', count: 3 },
      { label: '20M', count: 1 },
    ]);
    expect(summary.modes).toEqual([
      { label: 'SSB', count: 2 },
      { label: 'CW', count: 1 },
      { label: 'FM', count: 1 },
    ]);
  });

  it('formats local time in an explicit timezone', () => {
    expect(formatStationLogLocalTime(startedAt, 'UTC')).toBe('2024-06-15 14:30');
    expect(formatStationLogLocalTime(startedAt, 'America/Chicago')).toBe('2024-06-15 09:30');
  });

  it('returns an empty summary for an empty log', () => {
    expect(summarizeStationLog([])).toEqual({
      qsoCount: 0,
      uniqueCalls: 0,
      potaCount: 0,
      qrzCount: 0,
      bands: [],
      modes: [],
    });
  });
});
