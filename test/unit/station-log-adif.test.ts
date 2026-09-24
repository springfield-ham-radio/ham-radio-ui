import { describe, expect, it } from 'vitest';
import {
  formatAdifDate,
  formatAdifTime,
  parseAdifDateTime,
  parseStationLogAdif,
  serializeStationLogAdif,
} from '../../app/utils/station-log-adif.ts';
import type { StationLogQso } from '../../app/utils/station-log-db.ts';

const startedAt = Date.UTC(2024, 5, 15, 14, 30, 45);

const sample: StationLogQso = {
  id: '11111111-1111-1111-1111-111111111111',
  startedAt,
  endedAt: startedAt + 120_000,
  theirCallsign: 'W1AW',
  frequencyHz: 146_520_000,
  band: '2m',
  mode: 'FM',
  submode: undefined,
  rstSent: '59',
  rstReceived: '59',
  theirName: 'Hiram',
  theirQth: 'Newington, CT',
  theirGridsquare: 'FN31',
  txPowerWatts: 5,
  comment: 'Club station, "main"',
  operatorCallsign: 'K1ABC',
  stationCallsign: 'K1ABC',
  myGridsquare: 'FN42',
  adifExtra: { DXCC: '291' },
  createdAt: 1_000,
  updatedAt: 2_000,
};

describe('station-log-adif', () => {
  it('formats and parses ADIF date/time in UTC', () => {
    expect(formatAdifDate(startedAt)).toBe('20240615');
    expect(formatAdifTime(startedAt)).toBe('143045');
    expect(parseAdifDateTime('20240615', '143045')).toBe(startedAt);
    expect(parseAdifDateTime('20240615', '1430')).toBe(Date.UTC(2024, 5, 15, 14, 30, 0));
  });

  it('round-trips portable QSO fields through ADI', () => {
    const adi = serializeStationLogAdif([sample]);
    const parsed = parseStationLogAdif(adi);

    expect(parsed.skipped).toBe(0);
    expect(parsed.qsos).toHaveLength(1);

    const qso = parsed.qsos[0]!;
    expect(qso.theirCallsign).toBe('W1AW');
    expect(qso.startedAt).toBe(startedAt);
    expect(qso.endedAt).toBe(startedAt + 120_000);
    expect(qso.frequencyHz).toBe(146_520_000);
    expect(qso.band).toBe('2m');
    expect(qso.mode).toBe('FM');
    expect(qso.rstSent).toBe('59');
    expect(qso.rstReceived).toBe('59');
    expect(qso.theirName).toBe('Hiram');
    expect(qso.theirQth).toBe('Newington, CT');
    expect(qso.theirGridsquare).toBe('FN31');
    expect(qso.txPowerWatts).toBe(5);
    expect(qso.comment).toBe('Club station, "main"');
    expect(qso.operatorCallsign).toBe('K1ABC');
    expect(qso.stationCallsign).toBe('K1ABC');
    expect(qso.myGridsquare).toBe('FN42');
    expect(qso.adifExtra).toEqual({ DXCC: '291' });
  });

  it('skips records missing CALL or QSO_DATE', () => {
    const adi = [
      '<ADIF_VER:5>3.1.4<EOH>',
      '<CALL:4>W1AW<MODE:2>FM<EOR>',
      '<QSO_DATE:8>20240615<MODE:2>FM<EOR>',
      '<CALL:5>K1ABC<QSO_DATE:8>20240615<TIME_ON:6>120000<MODE:2>CW<EOR>',
    ].join('\n');

    const parsed = parseStationLogAdif(adi);

    expect(parsed.skipped).toBe(2);
    expect(parsed.qsos).toHaveLength(1);
    expect(parsed.qsos[0]?.theirCallsign).toBe('K1ABC');
    expect(parsed.qsos[0]?.mode).toBe('CW');
  });

  it('includes a HamBench PROGRAMID header on export', () => {
    const adi = serializeStationLogAdif([sample]);

    expect(adi).toMatch(/<PROGRAMID:8>HamBench/i);
    expect(adi).toMatch(/<EOH>/i);
  });
});
