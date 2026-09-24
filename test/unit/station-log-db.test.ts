import { describe, expect, it } from 'vitest';
import {
  adifBandFromFrequencyHz,
  createStationLogQso,
  matchesStationLogSearch,
  stationLogQsoRowToModel,
  type StationLogQsoRow,
} from '../../app/utils/station-log-db.ts';

describe('station-log-db', () => {
  describe('adifBandFromFrequencyHz', () => {
    it('maps common amateur allocations to ADIF band tokens', () => {
      expect(adifBandFromFrequencyHz(146_520_000)).toBe('2m');
      expect(adifBandFromFrequencyHz(14_200_000)).toBe('20m');
      expect(adifBandFromFrequencyHz(446_000_000)).toBe('70cm');
    });

    it('returns undefined when frequency is missing or unknown', () => {
      expect(adifBandFromFrequencyHz(undefined)).toBe(undefined);
      expect(adifBandFromFrequencyHz(1_000)).toBe(undefined);
    });
  });

  describe('stationLogQsoRowToModel', () => {
    it('maps a database row to a station log QSO', () => {
      const row: StationLogQsoRow = {
        id: '11111111-1111-1111-1111-111111111111',
        started_at: 1_000,
        ended_at: 2_000,
        their_callsign: 'W1AW',
        frequency_hz: 146_520_000,
        band: '2m',
        mode: 'FM',
        submode: null,
        rst_sent: '59',
        rst_received: '59',
        their_name: 'Hiram',
        their_qth: null,
        their_gridsquare: 'FN31',
        tx_power_watts: 5,
        comment: null,
        operator_callsign: 'K1ABC',
        station_callsign: null,
        my_gridsquare: 'FN42',
        adif_extra: '{"DXCC":"291"}',
        created_at: 1_000,
        updated_at: 2_000,
      };

      const model = stationLogQsoRowToModel(row);

      expect(model.theirCallsign).toBe('W1AW');
      expect(model.frequencyHz).toBe(146_520_000);
      expect(model.adifExtra).toEqual({ DXCC: '291' });
      expect(model.theirQth).toBe(undefined);
    });
  });

  describe('createStationLogQso', () => {
    it('normalizes callsign and mode and derives band', () => {
      const qso = createStationLogQso({
        startedAt: 1_000,
        theirCallsign: 'w1aw',
        mode: 'fm',
        frequencyHz: 146_520_000,
      });

      expect(qso.theirCallsign).toBe('W1AW');
      expect(qso.mode).toBe('FM');
      expect(qso.band).toBe('2m');
      expect(qso.id).toBeTypeOf('string');
    });
  });

  describe('matchesStationLogSearch', () => {
    const qso = createStationLogQso({
      startedAt: 1_000,
      theirCallsign: 'W1AW',
      theirName: 'Hiram',
      mode: 'FM',
      frequencyHz: 146_520_000,
      band: '2m',
    });

    it('matches by callsign, name, mode, or frequency text', () => {
      expect(matchesStationLogSearch(qso, '')).toBe(true);
      expect(matchesStationLogSearch(qso, 'w1aw')).toBe(true);
      expect(matchesStationLogSearch(qso, 'hiram')).toBe(true);
      expect(matchesStationLogSearch(qso, 'fm')).toBe(true);
      expect(matchesStationLogSearch(qso, '146.52')).toBe(true);
      expect(matchesStationLogSearch(qso, '2m')).toBe(true);
      expect(matchesStationLogSearch(qso, 'zz9')).toBe(false);
    });
  });
});
