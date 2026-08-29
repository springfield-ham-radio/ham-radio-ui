import { describe, it } from 'node:test';
import { expect } from 'chai';
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
    expect(formatAdifDate(startedAt)).to.equal('20240615');
    expect(formatAdifTime(startedAt)).to.equal('143045');
    expect(parseAdifDateTime('20240615', '143045')).to.equal(startedAt);
    expect(parseAdifDateTime('20240615', '1430')).to.equal(Date.UTC(2024, 5, 15, 14, 30, 0));
  });

  it('round-trips portable QSO fields through ADI', () => {
    const adi = serializeStationLogAdif([sample]);
    const parsed = parseStationLogAdif(adi);

    expect(parsed.skipped).to.equal(0);
    expect(parsed.qsos).to.have.length(1);

    const qso = parsed.qsos[0]!;
    expect(qso.theirCallsign).to.equal('W1AW');
    expect(qso.startedAt).to.equal(startedAt);
    expect(qso.endedAt).to.equal(startedAt + 120_000);
    expect(qso.frequencyHz).to.equal(146_520_000);
    expect(qso.band).to.equal('2m');
    expect(qso.mode).to.equal('FM');
    expect(qso.rstSent).to.equal('59');
    expect(qso.rstReceived).to.equal('59');
    expect(qso.theirName).to.equal('Hiram');
    expect(qso.theirQth).to.equal('Newington, CT');
    expect(qso.theirGridsquare).to.equal('FN31');
    expect(qso.txPowerWatts).to.equal(5);
    expect(qso.comment).to.equal('Club station, "main"');
    expect(qso.operatorCallsign).to.equal('K1ABC');
    expect(qso.stationCallsign).to.equal('K1ABC');
    expect(qso.myGridsquare).to.equal('FN42');
    expect(qso.adifExtra).to.deep.equal({ DXCC: '291' });
  });

  it('skips records missing CALL or QSO_DATE', () => {
    const adi = [
      '<ADIF_VER:5>3.1.4<EOH>',
      '<CALL:4>W1AW<MODE:2>FM<EOR>',
      '<QSO_DATE:8>20240615<MODE:2>FM<EOR>',
      '<CALL:5>K1ABC<QSO_DATE:8>20240615<TIME_ON:6>120000<MODE:2>CW<EOR>',
    ].join('\n');

    const parsed = parseStationLogAdif(adi);

    expect(parsed.skipped).to.equal(2);
    expect(parsed.qsos).to.have.length(1);
    expect(parsed.qsos[0]?.theirCallsign).to.equal('K1ABC');
    expect(parsed.qsos[0]?.mode).to.equal('CW');
  });

  it('includes a HamBench PROGRAMID header on export', () => {
    const adi = serializeStationLogAdif([sample]);

    expect(adi).to.match(/<PROGRAMID:8>HamBench/i);
    expect(adi).to.match(/<EOH>/i);
  });
});
