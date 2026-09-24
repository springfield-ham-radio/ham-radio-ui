import { describe, expect, it } from 'vitest';
import { bandNameForFrequency, displayBandName } from '../../app/utils/transmit-privileges.ts';

describe('transmit-privileges', () => {
  describe('displayBandName', () => {
    it('strips a trailing numeric suffix used to split overlapping allocations', () => {
      expect(displayBandName('FRS/GMRS-1')).toBe('FRS/GMRS');
      expect(displayBandName('Weather Radio-10')).toBe('Weather Radio');
      expect(displayBandName('2 Meter')).toBe('2 Meter');
    });
  });

  describe('bandNameForFrequency', () => {
    it('returns an empty string when the frequency is missing or outside the band plan', () => {
      expect(bandNameForFrequency(undefined)).toBe('');
      expect(bandNameForFrequency(100_000_000)).toBe('');
    });

    it('resolves amateur allocations from the transmit frequency', () => {
      expect(bandNameForFrequency(146_520_000)).toBe('2 Meter');
      expect(bandNameForFrequency(446_000_000)).toBe('70 Centimeter');
    });

    it('resolves NOAA weather channels by name', () => {
      expect(bandNameForFrequency(162_550_000)).toBe('Weather Radio');
    });

    it('resolves Environment Canada WX8–WX10 channels as Weather Radio', () => {
      expect(bandNameForFrequency(161_650_000)).toBe('Weather Radio');
      expect(bandNameForFrequency(161_775_000)).toBe('Weather Radio');
      expect(bandNameForFrequency(163_275_000)).toBe('Weather Radio');
    });

    it('uses exact channel matches and a display name without the split suffix', () => {
      expect(bandNameForFrequency(462_562_500)).toBe('FRS/GMRS');
      expect(bandNameForFrequency(467_550_000)).toBe('GMRS');
    });
  });
});
