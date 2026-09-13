import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  encodeKenwoodCatCommand,
  formatKenwoodFrequencyHz,
  kenwoodFoWithFrequency,
  parseKenwoodCatReply,
  parseKenwoodFoReply,
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

    it('should format and parse 10-digit Hertz fields', () => {
      expect(formatKenwoodFrequencyHz(144_600_000, 10)).to.equal('0144600000');
      expect(parseKenwoodFrequencyHz('0144600000')).to.equal(144_600_000);
    });

    it('should reject invalid frequency fields', () => {
      expect(parseKenwoodFrequencyHz('abc')).to.equal(undefined);
      expect(parseKenwoodFrequencyHz('0')).to.equal(undefined);
    });
  });

  describe('FO channel', () => {
    it('should parse a VFO-channel reply and rewrite frequency', () => {
      const parsed = parseKenwoodFoReply(
        parseKenwoodCatReply('FO 0,0144600000,0,0,0,0,0,0,08,08,000,00000000,0'),
        ['FM', 'NFM', 'AM'],
      );

      expect(parsed).to.include({
        band: 0,
        frequencyHz: 144_600_000,
        mode: 'FM',
      });
      expect(kenwoodFoWithFrequency(parsed, 146_520_000, 10)[1]).to.equal('0146520000');
    });
  });
});
