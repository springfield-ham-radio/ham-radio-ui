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
  myRig: 'Handheld',
  myAntenna: 'Home · Whip',
  qslSent: false,
  qslReceived: false,
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
    expect(qso.myRig).toBe('Handheld');
    expect(qso.myAntenna).toBe('Home · Whip');
    expect(qso.qslSent).toBe(false);
    expect(qso.qslReceived).toBe(false);
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

  it('maps QSL_SENT and QSL_RCVD Y to confirmed cards', () => {
    const sent = { ...sample, qslSent: true, qslReceived: true };
    const adi = serializeStationLogAdif([sent]);
    const parsed = parseStationLogAdif(adi);

    expect(adi).toMatch(/<QSL_SENT:1>Y/);
    expect(adi).toMatch(/<QSL_RCVD:1>Y/);
    expect(parsed.qsos[0]?.qslSent).toBe(true);
    expect(parsed.qsos[0]?.qslReceived).toBe(true);
    expect(parsed.qsos[0]?.adifExtra).toEqual({ DXCC: '291' });
  });

  it('keeps requested QSL status in extra fields instead of marking a card sent', () => {
    const adi = '<CALL:4>W1AW<QSO_DATE:8>20240615<TIME_ON:6>143045<MODE:2>FM<QSL_SENT:1>R<QSL_RCVD:1>N<EOR>';
    const parsed = parseStationLogAdif(adi);

    expect(parsed.qsos[0]?.qslSent).toBe(false);
    expect(parsed.qsos[0]?.qslReceived).toBe(false);
    expect(parsed.qsos[0]?.adifExtra).toEqual({ QSL_SENT: 'R' });

    const stored = {
      ...sample,
      adifExtra: { QSL_SENT: 'R' },
    };
    const exported = serializeStationLogAdif([stored]);

    expect(exported).toMatch(/<QSL_SENT:1>R/);
    expect(exported).not.toMatch(/<QSL_SENT:1>Y/);
    expect(exported).not.toMatch(/QSL_RCVD/);
  });

  it('reads MY_RIG_INTL when MY_RIG is absent', () => {
    const adi = '<CALL:4>W1AW<QSO_DATE:8>20240615<TIME_ON:6>143045<MODE:2>FM<MY_RIG_INTL:8>Handheld<MY_ANTENNA:4>Whip<EOR>';
    const parsed = parseStationLogAdif(adi);

    expect(parsed.qsos[0]?.myRig).toBe('Handheld');
    expect(parsed.qsos[0]?.myAntenna).toBe('Whip');
    expect(parsed.qsos[0]?.adifExtra).toBeUndefined();
  });

  it('includes a HamBench PROGRAMID header on export', () => {
    const adi = serializeStationLogAdif([sample]);

    expect(adi).toMatch(/<PROGRAMID:8>HamBench/i);
    expect(adi).toMatch(/<EOH>/i);
  });

  it('round-trips ADIF LAT/LON and MY_LAT/MY_LON through stored coordinates', () => {
    const located = {
      ...sample,
      theirGridsquare: undefined,
      latitude: 30.2672,
      longitude: -97.7431,
      myLatitude: 42.3,
      myLongitude: -71.8,
    };
    const adi = serializeStationLogAdif([located]);

    expect(adi).toMatch(/<LAT:11>N030 16\.032/);
    expect(adi).toMatch(/<LON:11>W097 44\.586/);
    expect(adi).toMatch(/<MY_LAT:11>N042 18\.000/);
    expect(adi).toMatch(/<MY_LON:11>W071 48\.000/);

    const parsed = parseStationLogAdif(adi).qsos[0]!;

    expect(parsed.latitude).toBeCloseTo(30.2672, 4);
    expect(parsed.longitude).toBeCloseTo(-97.7431, 4);
    expect(parsed.myLatitude).toBeCloseTo(42.3, 4);
    expect(parsed.myLongitude).toBeCloseTo(-71.8, 4);
    expect(parsed.adifExtra).toEqual({ DXCC: '291' });
  });

  it('keeps a lone LAT tag in adifExtra on import', () => {
    const adi =
      '<CALL:4>W1AW<QSO_DATE:8>20240615<TIME_ON:6>143045<MODE:2>FM<LAT:12>N030 16.032<DXCC:3>291<EOR>';
    const parsed = parseStationLogAdif(adi).qsos[0]!;

    expect(parsed.latitude).toBeUndefined();
    expect(parsed.adifExtra).toEqual({ LAT: 'N030 16.032', DXCC: '291' });
  });
});
