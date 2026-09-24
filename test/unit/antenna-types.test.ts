import { describe, expect, it } from 'vitest';
import {
  ANTENNA_TYPES,
  antennaBandsAreLineOfSight,
  antennaTypeById,
  antennaTypeUsesHeading,
  bandWavelengthM,
  bandsForEnabledTraps,
  estimateGainDbi,
  estimateTakeoffDeg,
  isAntennaBandId,
  isAntennaTypeId,
  trapResonantBands,
} from '../../app/utils/antenna-types.ts';

describe('antenna types', () => {
  it('should expose the generic families used for the station list', () => {
    expect(ANTENNA_TYPES.map((type) => type.id)).toEqual([
      'dipole',
      'inverted-v',
      'quarter-wave-vertical',
      'yagi-3el',
      'magloop',
      'end-fed',
      'dual-band-vertical',
      'vhf-yagi',
      'uhf-yagi',
    ]);
  });

  it('should treat only catalog ids as antenna types', () => {
    expect(isAntennaTypeId('dipole')).toBe(true);
    expect(isAntennaTypeId('yagi-3el')).toBe(true);
    expect(isAntennaTypeId('dual-band-vertical')).toBe(true);
    expect(isAntennaTypeId('vhf-yagi')).toBe(true);
    expect(isAntennaTypeId('uhf-yagi')).toBe(true);
    expect(isAntennaTypeId('A3S')).toBe(false);
    expect(isAntennaTypeId(undefined)).toBe(false);
  });

  it('should require a heading for dipole and Yagi, not for a vertical', () => {
    expect(antennaTypeUsesHeading(antennaTypeById('dipole')!)).toBe(true);
    expect(antennaTypeUsesHeading(antennaTypeById('yagi-3el')!)).toBe(true);
    expect(antennaTypeUsesHeading(antennaTypeById('vhf-yagi')!)).toBe(true);
    expect(antennaTypeUsesHeading(antennaTypeById('uhf-yagi')!)).toBe(true);
    expect(antennaTypeUsesHeading(antennaTypeById('quarter-wave-vertical')!)).toBe(false);
    expect(antennaTypeUsesHeading(antennaTypeById('magloop')!)).toBe(false);
    expect(antennaTypeUsesHeading(antennaTypeById('dual-band-vertical')!)).toBe(false);
  });

  it('should map band ids to meters of wavelength, including 70 cm as 0.7 m', () => {
    expect(bandWavelengthM('160m')).toBe(160);
    expect(bandWavelengthM('20m')).toBe(20);
    expect(bandWavelengthM('6m')).toBe(6);
    expect(bandWavelengthM('2m')).toBe(2);
    expect(bandWavelengthM('70cm')).toBe(0.7);
  });

  it('should accept 2 m / 70 cm as antenna bands, not 23 cm', () => {
    expect(isAntennaBandId('2m')).toBe(true);
    expect(isAntennaBandId('70cm')).toBe(true);
    expect(isAntennaBandId('20m')).toBe(true);
    expect(isAntennaBandId('23cm')).toBe(false);
  });

  it('should treat only 2 m / 70 cm tags as line-of-sight', () => {
    expect(antennaBandsAreLineOfSight(['2m', '70cm'])).toBe(true);
    expect(antennaBandsAreLineOfSight(['2m'])).toBe(true);
    expect(antennaBandsAreLineOfSight(['20m'])).toBe(false);
    expect(antennaBandsAreLineOfSight(['2m', '20m'])).toBe(false);
    expect(antennaBandsAreLineOfSight([])).toBe(false);
  });

  it('should lower estimated takeoff as a Yagi is raised in wavelengths', () => {
    const yagi = antennaTypeById('yagi-3el')!;
    const low = estimateTakeoffDeg(yagi, 10, '20m');
    const high = estimateTakeoffDeg(yagi, 20, '20m');

    expect(high).toBeLessThan(low);
    expect(high).toBeGreaterThanOrEqual(6);
    expect(low).toBeLessThanOrEqual(25);
  });

  it('should keep inverted-V takeoff higher than a Yagi at the same height', () => {
    const invertedV = antennaTypeById('inverted-v')!;
    const yagi = antennaTypeById('yagi-3el')!;

    expect(estimateTakeoffDeg(invertedV, 10, '20m')).toBeGreaterThan(estimateTakeoffDeg(yagi, 10, '20m'));
  });

  it('should estimate 70 cm takeoff from 0.7 m wavelength, not 70 m', () => {
    const yagi = antennaTypeById('uhf-yagi')!;

    expect(estimateTakeoffDeg(yagi, 10, '70cm')).toBe(6);
  });

  it('should allow traps only on dipoles, inverted-Vs, and HF Yagis', () => {
    expect(antennaTypeById('dipole')!.supportsTraps).toBe(true);
    expect(antennaTypeById('inverted-v')!.supportsTraps).toBe(true);
    expect(antennaTypeById('yagi-3el')!.supportsTraps).toBe(true);
    expect(antennaTypeById('quarter-wave-vertical')!.supportsTraps).toBe(false);
    expect(antennaTypeById('vhf-yagi')!.supportsTraps).toBe(false);
  });

  it('should put traps on every HF band except the lowest', () => {
    expect(trapResonantBands(['80m', '40m'])).toEqual(['40m']);
    expect(trapResonantBands(['20m', '15m', '10m'])).toEqual(['15m', '10m']);
    expect(trapResonantBands(['40m'])).toEqual([]);
    expect(trapResonantBands(['40m', '2m'])).toEqual([]);
  });

  it('should add the next-lower HF band when traps are enabled on a single band', () => {
    expect(bandsForEnabledTraps(['40m'])).toEqual(['80m', '40m']);
    expect(bandsForEnabledTraps(['160m'])).toEqual(['160m', '80m']);
    expect(bandsForEnabledTraps(['80m', '40m'])).toEqual(['80m', '40m']);
  });

  it('should derate catalog gain when traps are in the elements', () => {
    const dipole = antennaTypeById('dipole')!;

    expect(estimateGainDbi(dipole, false)).toBe(2.15);
    expect(estimateGainDbi(dipole, true)).toBe(1.65);
  });
});
