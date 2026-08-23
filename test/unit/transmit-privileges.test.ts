import { describe, it } from 'node:test';
import { expect } from 'chai';
import { bandNameForFrequency, displayBandName } from '../../app/utils/transmit-privileges.ts';

describe('transmit-privileges', () => {
  describe('displayBandName', () => {
    it('strips a trailing numeric suffix used to split overlapping allocations', () => {
      expect(displayBandName('FRS/GMRS-1')).to.equal('FRS/GMRS');
      expect(displayBandName('2 Meter')).to.equal('2 Meter');
    });
  });

  describe('bandNameForFrequency', () => {
    it('returns an empty string when the frequency is missing or outside the band plan', () => {
      expect(bandNameForFrequency(undefined)).to.equal('');
      expect(bandNameForFrequency(100_000_000)).to.equal('');
    });

    it('resolves amateur allocations from the transmit frequency', () => {
      expect(bandNameForFrequency(146_520_000)).to.equal('2 Meter');
      expect(bandNameForFrequency(446_000_000)).to.equal('70 Centimeter');
    });

    it('uses exact channel matches and a display name without the split suffix', () => {
      expect(bandNameForFrequency(462_562_500)).to.equal('FRS/GMRS');
      expect(bandNameForFrequency(467_550_000)).to.equal('GMRS');
    });
  });
});
