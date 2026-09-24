import { describe, expect, it } from 'vitest';
import { Frequency, RadioChannelId, RadioToneType, type RadioChannel } from '@springfield/ham-radio-api';
import {
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
      expect(model.createdAt).toBe(1_000);
      expect(model.updatedAt).toBe(2_000);
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

    it('matches repeater rows by the repeater kind label', () => {
      const saved = radioChannelToSavedChannel(sampleChannel, { kind: 'repeater' });

      expect(matchesSavedChannelSearch(saved, 'repeater')).toBe(true);
      expect(matchesSavedChannelSearch(radioChannelToSavedChannel(sampleChannel), 'repeater')).toBe(false);
    });
  });
});
