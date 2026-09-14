import { describe, it } from 'node:test';
import { expect } from 'chai';
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
    expect(ANTENNA_TYPES.map((type) => type.id)).to.deep.equal([
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
    expect(isAntennaTypeId('dipole')).to.equal(true);
    expect(isAntennaTypeId('yagi-3el')).to.equal(true);
    expect(isAntennaTypeId('dual-band-vertical')).to.equal(true);
    expect(isAntennaTypeId('vhf-yagi')).to.equal(true);
    expect(isAntennaTypeId('uhf-yagi')).to.equal(true);
    expect(isAntennaTypeId('A3S')).to.equal(false);
    expect(isAntennaTypeId(undefined)).to.equal(false);
  });

  it('should require a heading for dipole and Yagi, not for a vertical', () => {
    expect(antennaTypeUsesHeading(antennaTypeById('dipole')!)).to.equal(true);
    expect(antennaTypeUsesHeading(antennaTypeById('yagi-3el')!)).to.equal(true);
    expect(antennaTypeUsesHeading(antennaTypeById('vhf-yagi')!)).to.equal(true);
    expect(antennaTypeUsesHeading(antennaTypeById('uhf-yagi')!)).to.equal(true);
    expect(antennaTypeUsesHeading(antennaTypeById('quarter-wave-vertical')!)).to.equal(false);
    expect(antennaTypeUsesHeading(antennaTypeById('magloop')!)).to.equal(false);
    expect(antennaTypeUsesHeading(antennaTypeById('dual-band-vertical')!)).to.equal(false);
  });

  it('should map band ids to meters of wavelength, including 70 cm as 0.7 m', () => {
    expect(bandWavelengthM('160m')).to.equal(160);
    expect(bandWavelengthM('20m')).to.equal(20);
    expect(bandWavelengthM('6m')).to.equal(6);
    expect(bandWavelengthM('2m')).to.equal(2);
    expect(bandWavelengthM('70cm')).to.equal(0.7);
  });

  it('should accept 2 m / 70 cm as antenna bands, not 23 cm', () => {
    expect(isAntennaBandId('2m')).to.equal(true);
    expect(isAntennaBandId('70cm')).to.equal(true);
    expect(isAntennaBandId('20m')).to.equal(true);
    expect(isAntennaBandId('23cm')).to.equal(false);
  });

  it('should treat only 2 m / 70 cm tags as line-of-sight', () => {
    expect(antennaBandsAreLineOfSight(['2m', '70cm'])).to.equal(true);
    expect(antennaBandsAreLineOfSight(['2m'])).to.equal(true);
    expect(antennaBandsAreLineOfSight(['20m'])).to.equal(false);
    expect(antennaBandsAreLineOfSight(['2m', '20m'])).to.equal(false);
    expect(antennaBandsAreLineOfSight([])).to.equal(false);
  });

  it('should lower estimated takeoff as a Yagi is raised in wavelengths', () => {
    const yagi = antennaTypeById('yagi-3el')!;
    const low = estimateTakeoffDeg(yagi, 10, '20m');
    const high = estimateTakeoffDeg(yagi, 20, '20m');

    expect(high).to.be.lessThan(low);
    expect(high).to.be.at.least(6);
    expect(low).to.be.at.most(25);
  });

  it('should keep inverted-V takeoff higher than a Yagi at the same height', () => {
    const invertedV = antennaTypeById('inverted-v')!;
    const yagi = antennaTypeById('yagi-3el')!;

    expect(estimateTakeoffDeg(invertedV, 10, '20m')).to.be.greaterThan(estimateTakeoffDeg(yagi, 10, '20m'));
  });

  it('should estimate 70 cm takeoff from 0.7 m wavelength, not 70 m', () => {
    const yagi = antennaTypeById('uhf-yagi')!;

    expect(estimateTakeoffDeg(yagi, 10, '70cm')).to.equal(6);
  });

  it('should allow traps only on dipoles, inverted-Vs, and HF Yagis', () => {
    expect(antennaTypeById('dipole')!.supportsTraps).to.equal(true);
    expect(antennaTypeById('inverted-v')!.supportsTraps).to.equal(true);
    expect(antennaTypeById('yagi-3el')!.supportsTraps).to.equal(true);
    expect(antennaTypeById('quarter-wave-vertical')!.supportsTraps).to.equal(false);
    expect(antennaTypeById('vhf-yagi')!.supportsTraps).to.equal(false);
  });

  it('should put traps on every HF band except the lowest', () => {
    expect(trapResonantBands(['80m', '40m'])).to.deep.equal(['40m']);
    expect(trapResonantBands(['20m', '15m', '10m'])).to.deep.equal(['15m', '10m']);
    expect(trapResonantBands(['40m'])).to.deep.equal([]);
    expect(trapResonantBands(['40m', '2m'])).to.deep.equal([]);
  });

  it('should add the next-lower HF band when traps are enabled on a single band', () => {
    expect(bandsForEnabledTraps(['40m'])).to.deep.equal(['80m', '40m']);
    expect(bandsForEnabledTraps(['160m'])).to.deep.equal(['160m', '80m']);
    expect(bandsForEnabledTraps(['80m', '40m'])).to.deep.equal(['80m', '40m']);
  });

  it('should derate catalog gain when traps are in the elements', () => {
    const dipole = antennaTypeById('dipole')!;

    expect(estimateGainDbi(dipole, false)).to.equal(2.15);
    expect(estimateGainDbi(dipole, true)).to.equal(1.65);
  });
});
