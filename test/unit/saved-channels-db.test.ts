import { describe, expect, it } from 'vitest';
import { Frequency, RadioChannelId, RadioToneType, type RadioChannel } from '@springfield/ham-radio-api';
import {
  coordinateColumnsForDb,
  coordinatesFromPair,
  matchesSavedChannelSearch,
  radioChannelToSavedChannel,
  radioToneFromDb,
  savedChannelRowToModel,
  toneTypeFromDb,
  toneTypeToDb,
  type SavedChannelRow,
} from '../../app/utils/saved-channels-db.ts';

const sampleChannel: RadioChannel = {
  name: 'Local RPT',
  transmitFrequency: Frequency(146_520_000),
  receiveFrequency: Frequency(146_520_000),
  transmitTone: { tone: 885, type: RadioToneType.CTCSS },
  receiveTone: { tone: 23, type: RadioToneType.DCS },
};

describe('saved-channels-db', () => {
  describe('toneTypeToDb / toneTypeFromDb', () => {
    it('round-trips CTCSS and DCS', () => {
      expect(toneTypeToDb(RadioToneType.CTCSS)).toBe('CTCSS');
      expect(toneTypeToDb(RadioToneType.DCS)).toBe('DCS');
      expect(toneTypeFromDb('CTCSS')).toBe(RadioToneType.CTCSS);
      expect(toneTypeFromDb('DCS')).toBe(RadioToneType.DCS);
    });
  });

  describe('savedChannelRowToModel', () => {
    it('maps a database row to a portable RadioChannel', () => {
      const row: SavedChannelRow = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Local RPT',
        kind: 'repeater',
        transmit_frequency: 146_520_000,
        receive_frequency: 146_520_000,
        transmit_tone: 885,
        transmit_tone_type: 'CTCSS',
        receive_tone: 23,
        receive_tone_type: 'DCS',
        notes: 'Club repeater',
        use_type: 'closed',
        on_air: 0,
        callsign: 'WJ1L',
        latitude: 43.5018912,
        longitude: -70.7260259,
        allstar_node: '5517',
        echolink_node: '0',
        irlp_node: null,
        wires_node: ' 1234 ',
        allstar_linked: 1,
        echolink_linked: 1,
        irlp_linked: 0,
        wires_linked: 0,
        created_at: 1_000,
        updated_at: 2_000,
      };

      const model = savedChannelRowToModel(row);

      expect(model.id).toBe(RadioChannelId(row.id));
      expect(model.name).toBe('Local RPT');
      expect(model.kind).toBe('repeater');
      expect(model.transmitFrequency).toBe(Frequency(146_520_000));
      expect(model.receiveFrequency).toBe(Frequency(146_520_000));
      expect(model.transmitTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
      expect(model.receiveTone).toEqual({ tone: 23, type: RadioToneType.DCS });
      expect(model.notes).toBe('Club repeater');
      expect(model.callsign).toBe('WJ1L');
      expect(model.allstarNode).toBe('5517');
      expect(model.echolinkNode).toBeUndefined();
      expect(model.irlpNode).toBeUndefined();
      expect(model.wiresNode).toBe('1234');
      expect(model.allstar).toBe(true);
      expect(model.echolink).toBe(true);
      expect(model.irlp).toBe(false);
      expect(model.wires).toBe(true);
      expect(model.use).toBe('closed');
      expect(model.onAir).toBe(false);
      expect(model.latitude).toBe(43.5018912);
      expect(model.longitude).toBe(-70.7260259);
      expect(model.createdAt).toBe(1_000);
      expect(model.updatedAt).toBe(2_000);
    });

    it('reads a stored Null Island pair as unlocated', () => {
      const row: SavedChannelRow = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Austin',
        kind: 'repeater',
        transmit_frequency: 146_940_000,
        receive_frequency: 146_340_000,
        transmit_tone: 0,
        transmit_tone_type: 'CTCSS',
        receive_tone: 0,
        receive_tone_type: 'CTCSS',
        notes: null,
        use_type: null,
        on_air: null,
        callsign: 'W5KA',
        latitude: 0,
        longitude: 0,
        allstar_node: null,
        echolink_node: null,
        irlp_node: null,
        wires_node: null,
        allstar_linked: 0,
        echolink_linked: 0,
        irlp_linked: 0,
        wires_linked: 0,
        created_at: 1,
        updated_at: 1,
      };

      const model = savedChannelRowToModel(row);

      expect(model.latitude).toBeUndefined();
      expect(model.longitude).toBeUndefined();
    });
  });

  describe('coordinatesFromPair', () => {
    it('keeps a pair only when both coordinates are in range', () => {
      expect(coordinatesFromPair(39.1, -94.5)).toEqual({ latitude: 39.1, longitude: -94.5 });
      expect(coordinatesFromPair(39.1, undefined)).toEqual({});
      expect(coordinatesFromPair(91, -94.5)).toEqual({});
      expect(coordinatesFromPair(null, null)).toEqual({});
    });

    it('treats Null Island as unlocated and keeps a single zero axis', () => {
      expect(coordinatesFromPair(0, 0)).toEqual({});
      expect(coordinatesFromPair(0, -94.5)).toEqual({ latitude: 0, longitude: -94.5 });
      expect(coordinatesFromPair(39.1, 0)).toEqual({ latitude: 39.1, longitude: 0 });
    });
  });

  describe('coordinateColumnsForDb', () => {
    it('binds absent coordinates and Null Island as SQL NULL', () => {
      expect(coordinateColumnsForDb({})).toEqual({ latitude: null, longitude: null });
      expect(coordinateColumnsForDb({ latitude: undefined, longitude: undefined })).toEqual({
        latitude: null,
        longitude: null,
      });
      expect(coordinateColumnsForDb({ latitude: 0, longitude: 0 })).toEqual({ latitude: null, longitude: null });
      expect(coordinateColumnsForDb({ latitude: 0, longitude: -94.5 })).toEqual({ latitude: 0, longitude: -94.5 });
      expect(coordinateColumnsForDb({ latitude: 39.1, longitude: 0 })).toEqual({ latitude: 39.1, longitude: 0 });
    });
  });

  describe('radioChannelToSavedChannel', () => {
    it('copies portable fields and assigns a new id when omitted', () => {
      const saved = radioChannelToSavedChannel(sampleChannel, {
        createdAt: 10,
        updatedAt: 20,
      });

      expect(saved.id).toBeTypeOf('string');
      expect(saved.name).toBe('Local RPT');
      expect(saved.transmitFrequency).toBe(sampleChannel.transmitFrequency);
      expect(saved.receiveTone).toEqual(sampleChannel.receiveTone);
      expect(saved.createdAt).toBe(10);
      expect(saved.updatedAt).toBe(20);
      expect(saved.kind).toBe('channel');
      expect(saved.latitude).toBeUndefined();
      expect(saved.longitude).toBeUndefined();
    });

    it('drops a Null Island pair instead of storing zeros', () => {
      const saved = radioChannelToSavedChannel(sampleChannel, {
        kind: 'repeater',
        latitude: 0,
        longitude: 0,
      });

      expect(saved.latitude).toBeUndefined();
      expect(saved.longitude).toBeUndefined();
      expect(coordinateColumnsForDb(saved)).toEqual({ latitude: null, longitude: null });
    });

    it('keeps a real coordinate pair on add-from-library rows', () => {
      const saved = radioChannelToSavedChannel(sampleChannel, {
        kind: 'repeater',
        latitude: 30.2672,
        longitude: -97.7431,
      });

      expect(saved.latitude).toBeCloseTo(30.2672);
      expect(saved.longitude).toBeCloseTo(-97.7431);
      expect(coordinateColumnsForDb(saved)).toEqual({ latitude: 30.2672, longitude: -97.7431 });
    });
  });

  describe('radioToneFromDb', () => {
    it('builds a RadioTone from stored columns', () => {
      expect(radioToneFromDb(1000, 'CTCSS')).toEqual({ tone: 1000, type: RadioToneType.CTCSS });
    });
  });

  describe('matchesSavedChannelSearch', () => {
    it('matches by name or frequency text', () => {
      const saved = radioChannelToSavedChannel(sampleChannel);

      expect(matchesSavedChannelSearch(saved, 'local')).toBe(true);
      expect(matchesSavedChannelSearch(saved, '146.5200')).toBe(true);
      expect(matchesSavedChannelSearch(saved, '999')).toBe(false);
      expect(matchesSavedChannelSearch(saved, '   ')).toBe(true);
    });

    it('matches a repeater by node number or linked-system name', () => {
      const saved = radioChannelToSavedChannel(sampleChannel, {
        kind: 'repeater',
        allstarNode: '5517',
        echolinkNode: '0',
      });

      expect(saved.allstarNode).toBe('5517');
      expect(saved.echolinkNode).toBeUndefined();
      expect(matchesSavedChannelSearch(saved, '5517')).toBe(true);
      expect(matchesSavedChannelSearch(saved, 'allstar')).toBe(true);
      expect(matchesSavedChannelSearch(saved, 'echolink')).toBe(false);

      const namedOnly = radioChannelToSavedChannel(sampleChannel, {
        kind: 'repeater',
        echolink: true,
      });

      expect(namedOnly.echolinkNode).toBeUndefined();
      expect(namedOnly.echolink).toBe(true);
      expect(matchesSavedChannelSearch(namedOnly, 'echolink')).toBe(true);
    });

    it('matches repeater rows by the repeater kind label', () => {
      const saved = radioChannelToSavedChannel(sampleChannel, { kind: 'repeater' });

      expect(matchesSavedChannelSearch(saved, 'repeater')).toBe(true);
      expect(matchesSavedChannelSearch(radioChannelToSavedChannel(sampleChannel), 'repeater')).toBe(false);
    });
  });
});
