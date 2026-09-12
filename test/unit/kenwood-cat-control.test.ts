import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  decodeKenwoodMode,
  decodeKenwoodPower,
  encodeKenwoodCatCommand,
  encodeKenwoodMode,
  encodeKenwoodPower,
  formatKenwoodFrequencyHz,
  kenwoodCatDialectForModel,
  kenwoodCatDialectForRadio,
  parseKenwoodCatReply,
  parseKenwoodFrequencyHz,
} from '../../app/utils/kenwood-cat-control.ts';

describe('kenwood CAT control', () => {
  describe('encodeKenwoodCatCommand', () => {
    it('should encode a bare command with CR', () => {
      expect(Buffer.from(encodeKenwoodCatCommand('ID')).toString('ascii')).to.equal('ID\r');
      expect(Buffer.from(encodeKenwoodCatCommand('TX')).toString('ascii')).to.equal('TX\r');
    });

    it('should join fields with commas after a space', () => {
      expect(Buffer.from(encodeKenwoodCatCommand('FQ', ['00144600000', 0])).toString('ascii')).to.equal(
        'FQ 00144600000,0\r',
      );
      expect(Buffer.from(encodeKenwoodCatCommand('BC', [1])).toString('ascii')).to.equal('BC 1\r');
    });
  });

  describe('parseKenwoodCatReply', () => {
    it('should parse command and fields', () => {
      expect(parseKenwoodCatReply('FQ 00144600000,0')).to.deep.equal({
        ok: true,
        command: 'FQ',
        fields: ['00144600000', '0'],
        raw: 'FQ 00144600000,0',
      });
      expect(parseKenwoodCatReply('ID TM-D710')).to.deep.equal({
        ok: true,
        command: 'ID',
        fields: ['TM-D710'],
        raw: 'ID TM-D710',
      });
    });

    it('should treat Kenwood error replies as not ok', () => {
      expect(parseKenwoodCatReply('?').ok).to.equal(false);
      expect(parseKenwoodCatReply('N').ok).to.equal(false);
      expect(parseKenwoodCatReply('').ok).to.equal(false);
    });
  });

  describe('frequency', () => {
    it('should format and parse 11-digit Hertz fields', () => {
      expect(formatKenwoodFrequencyHz(144_600_000)).to.equal('00144600000');
      expect(parseKenwoodFrequencyHz('00144600000')).to.equal(144_600_000);
      expect(parseKenwoodFrequencyHz('00430000000')).to.equal(430_000_000);
    });

    it('should reject invalid frequency fields', () => {
      expect(parseKenwoodFrequencyHz('abc')).to.equal(undefined);
      expect(parseKenwoodFrequencyHz('0')).to.equal(undefined);
    });
  });

  describe('dialect', () => {
    it('should use all-mode mapping for TH-F6 and FM-mobile otherwise', () => {
      expect(kenwoodCatDialectForModel('kenwood-th-f6')).to.equal('th-f6');
      expect(kenwoodCatDialectForModel('kenwood-tm-d710a')).to.equal('fm-mobile');
    });

    it('should prefer the driver cat dialect when it is known', () => {
      expect(kenwoodCatDialectForRadio({ model: 'kenwood-th-f6', cat: { dialect: 'fm-mobile' } })).to.equal(
        'fm-mobile',
      );
      expect(kenwoodCatDialectForRadio({ cat: { dialect: 'th-f6' } })).to.equal('th-f6');
      expect(kenwoodCatDialectForRadio({ model: 'kenwood-th-f6' })).to.equal('th-f6');
    });

    it('should map TH-F6 mode codes', () => {
      expect(decodeKenwoodMode(0, 'th-f6')).to.equal('FM');
      expect(decodeKenwoodMode(2, 'th-f6')).to.equal('AM');
      expect(decodeKenwoodMode(4, 'th-f6')).to.equal('USB');
      expect(encodeKenwoodMode('CW', 'th-f6')).to.equal(5);
    });

    it('should map FM-mobile mode 0 to FM', () => {
      expect(decodeKenwoodMode(0, 'fm-mobile')).to.equal('FM');
      expect(encodeKenwoodMode('FM', 'fm-mobile')).to.equal(0);
    });

    it('should map power codes', () => {
      expect(decodeKenwoodPower(0)).to.equal('high');
      expect(decodeKenwoodPower(1)).to.equal('medium');
      expect(decodeKenwoodPower(2)).to.equal('low');
      expect(encodeKenwoodPower('low')).to.equal(2);
    });
  });
});
