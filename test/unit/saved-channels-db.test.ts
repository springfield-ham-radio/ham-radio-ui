import { describe, it } from 'node:test';
import { expect } from 'chai';
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
      expect(toneTypeToDb(RadioToneType.CTCSS)).to.equal('CTCSS');
      expect(toneTypeToDb(RadioToneType.DCS)).to.equal('DCS');
      expect(toneTypeFromDb('CTCSS')).to.equal(RadioToneType.CTCSS);
      expect(toneTypeFromDb('DCS')).to.equal(RadioToneType.DCS);
    });
  });

  describe('savedChannelRowToModel', () => {
    it('maps a database row to a portable RadioChannel', () => {
      const row: SavedChannelRow = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Local RPT',
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

      expect(model.id).to.equal(RadioChannelId(row.id));
      expect(model.name).to.equal('Local RPT');
      expect(model.transmitFrequency).to.equal(Frequency(146_520_000));
      expect(model.receiveFrequency).to.equal(Frequency(146_520_000));
      expect(model.transmitTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
      expect(model.receiveTone).to.deep.equal({ tone: 23, type: RadioToneType.DCS });
      expect(model.notes).to.equal('Club repeater');
      expect(model.createdAt).to.equal(1_000);
      expect(model.updatedAt).to.equal(2_000);
    });
  });

  describe('radioChannelToSavedChannel', () => {
    it('copies portable fields and assigns a new id when omitted', () => {
      const saved = radioChannelToSavedChannel(sampleChannel, {
        createdAt: 10,
        updatedAt: 20,
      });

      expect(saved.id).to.be.a('string');
      expect(saved.name).to.equal('Local RPT');
      expect(saved.transmitFrequency).to.equal(sampleChannel.transmitFrequency);
      expect(saved.receiveTone).to.deep.equal(sampleChannel.receiveTone);
      expect(saved.createdAt).to.equal(10);
      expect(saved.updatedAt).to.equal(20);
    });
  });

  describe('radioToneFromDb', () => {
    it('builds a RadioTone from stored columns', () => {
      expect(radioToneFromDb(1000, 'CTCSS')).to.deep.equal({ tone: 1000, type: RadioToneType.CTCSS });
    });
  });

  describe('matchesSavedChannelSearch', () => {
    it('matches by name or frequency text', () => {
      const saved = radioChannelToSavedChannel(sampleChannel);

      expect(matchesSavedChannelSearch(saved, 'local')).to.equal(true);
      expect(matchesSavedChannelSearch(saved, '146.5200')).to.equal(true);
      expect(matchesSavedChannelSearch(saved, '999')).to.equal(false);
      expect(matchesSavedChannelSearch(saved, '   ')).to.equal(true);
    });
  });
});
