import { describe, expect, it } from 'vitest';
import {
  adifBandFromFrequencyHz,
  createStationLogQso,
  matchesStationLogSearch,
  stationLogQsoRowToModel,
  type StationLogQsoRow,
} from '../../app/utils/station-log-db.ts';
import { promoteAdifExtraCoordinates } from '../../app/utils/station-log-qso-location.ts';

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
        latitude: null,
        longitude: null,
        tx_power_watts: 5,
        comment: null,
        operator_callsign: 'K1ABC',
        station_callsign: null,
        my_gridsquare: 'FN42',
        my_latitude: null,
        my_longitude: null,
        my_rig: 'Handheld',
        my_antenna: 'Home · Whip',
        qsl_sent: 1,
        qsl_rcvd: 0,
        adif_extra: '{"DXCC":"291"}',
        created_at: 1_000,
        updated_at: 2_000,
      };

      const model = stationLogQsoRowToModel(row);

      expect(model.theirCallsign).toBe('W1AW');
      expect(model.frequencyHz).toBe(146_520_000);
      expect(model.adifExtra).toEqual({ DXCC: '291' });
      expect(model.theirQth).toBe(undefined);
      expect(model.myRig).toBe('Handheld');
      expect(model.myAntenna).toBe('Home · Whip');
      expect(model.qslSent).toBe(true);
      expect(model.qslReceived).toBe(false);
    });

    it('promotes ADIF location tags from adif_extra into coordinate fields', () => {
      const row: StationLogQsoRow = {
        id: '22222222-2222-2222-2222-222222222222',
        started_at: 1_000,
        ended_at: null,
        their_callsign: 'W1AW',
        frequency_hz: null,
        band: null,
        mode: 'FM',
        submode: null,
        rst_sent: null,
        rst_received: null,
        their_name: null,
        their_qth: null,
        their_gridsquare: null,
        latitude: null,
        longitude: null,
        tx_power_watts: null,
        comment: null,
        operator_callsign: null,
        station_callsign: null,
        my_gridsquare: null,
        my_latitude: null,
        my_longitude: null,
        my_rig: null,
        my_antenna: null,
        qsl_sent: 0,
        qsl_rcvd: 0,
        adif_extra: '{"LAT":"N030 16.032","LON":"W097 44.586","DXCC":"291"}',
        created_at: 1_000,
        updated_at: 1_000,
      };

      const model = stationLogQsoRowToModel(row);

      expect(model.latitude).toBeCloseTo(30.2672, 4);
      expect(model.longitude).toBeCloseTo(-97.7431, 4);
      expect(model.adifExtra).toEqual({ DXCC: '291' });
    });
  });

  describe('promoteAdifExtraCoordinates integration', () => {
    it('drops null island coordinates from createStationLogQso', () => {
      const qso = createStationLogQso({
        startedAt: 1,
        theirCallsign: 'W1AW',
        mode: 'FM',
        latitude: 0,
        longitude: 0,
      });

      expect(qso.latitude).toBeUndefined();
      expect(qso.longitude).toBeUndefined();
      expect(promoteAdifExtraCoordinates(qso.adifExtra, qso).latitude).toBeUndefined();
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
      expect(qso.qslSent).toBe(false);
      expect(qso.qslReceived).toBe(false);
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
      expect(matchesStationLogSearch({ ...qso, myRig: 'Handheld' }, 'hand')).toBe(true);
      expect(matchesStationLogSearch({ ...qso, myAntenna: 'Home · Whip' }, 'whip')).toBe(true);
      expect(matchesStationLogSearch({ ...qso, comment: 'Picnic table' }, 'picnic')).toBe(true);
      expect(
        matchesStationLogSearch({ ...qso, adifExtra: { SIG: 'POTA', SIG_INFO: 'K-1234' } }, 'k-1234'),
      ).toBe(true);
    });
  });
});
