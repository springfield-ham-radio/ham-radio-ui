import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  decimalDegreesToDms,
  dmsToDecimalDegrees,
  formatLatitude,
  formatLongitude,
  isMaidenheadGrid,
  latLonToMaidenhead,
  maidenheadToLatLon,
  normalizeMaidenhead,
  parseDmsInput,
} from '../../app/utils/maidenhead.ts';

describe('maidenhead', () => {
  it('should accept 2-, 4-, and 6-character locators', () => {
    expect(isMaidenheadGrid('FN')).to.equal(true);
    expect(isMaidenheadGrid('FN42')).to.equal(true);
    expect(isMaidenheadGrid('EM48qq')).to.equal(true);
    expect(isMaidenheadGrid('fn42')).to.equal(true);
    expect(isMaidenheadGrid('ZZ99')).to.equal(false);
    expect(isMaidenheadGrid('EM4')).to.equal(false);
  });

  it('should put FN42 at the center of that square', () => {
    const point = maidenheadToLatLon('FN42');

    expect(point?.latitude).to.equal(42.5);
    expect(point?.longitude).to.equal(-71);
  });

  it('should round-trip a 6-character locator through its cell center', () => {
    const grid = 'EM48QQ';
    const point = maidenheadToLatLon(grid);

    expect(point).to.not.equal(undefined);
    expect(latLonToMaidenhead(point!.latitude, point!.longitude, 6)).to.equal(grid);
  });

  it('should encode St. Louis coordinates into EM48', () => {
    expect(latLonToMaidenhead(38.627, -90.1994, 4)).to.equal('EM48');
  });

  it('should normalize locators to uppercase', () => {
    expect(normalizeMaidenhead('  em48qq ')).to.equal('EM48QQ');
    expect(normalizeMaidenhead('nope')).to.equal(undefined);
  });

  it('should format coordinates as degrees, minutes, and decimal seconds', () => {
    expect(formatLatitude(38.5)).to.equal('38° 30\' 00.00" N');
    expect(formatLatitude(-33.9)).to.equal('33° 54\' 00.00" S');
    expect(formatLongitude(-90.1994)).to.equal('90° 11\' 57.84" W');
    expect(formatLongitude(13)).to.equal('13° 00\' 00.00" E');
  });

  it('should split St. Louis decimal degrees into DMS', () => {
    expect(decimalDegreesToDms(38.627, 'latitude')).to.deep.equal({
      degrees: 38,
      minutes: 37,
      seconds: 37.2,
      hemisphere: 'N',
    });
    expect(decimalDegreesToDms(-90.1994, 'longitude')).to.deep.equal({
      degrees: 90,
      minutes: 11,
      seconds: 57.84,
      hemisphere: 'W',
    });
  });

  it('should convert DMS back to signed decimal degrees', () => {
    expect(dmsToDecimalDegrees({ degrees: 38, minutes: 37, seconds: 37.2, hemisphere: 'N' })).to.equal(38.627);
    expect(dmsToDecimalDegrees({ degrees: 90, minutes: 11, seconds: 57.84, hemisphere: 'W' })).to.equal(-90.1994);
    expect(dmsToDecimalDegrees({ degrees: 42, minutes: 30, seconds: 0, hemisphere: 'N' })).to.equal(42.5);
    expect(dmsToDecimalDegrees({ degrees: 71, minutes: 0, seconds: 0, hemisphere: 'W' })).to.equal(-71);
  });

  it('should treat blank DMS fields as an empty coordinate', () => {
    expect(parseDmsInput({ degrees: '', minutes: '', seconds: '', hemisphere: 'N' }, 'latitude')).to.deep.equal({
      empty: true,
    });
  });

  it('should treat missing minutes and seconds as zero', () => {
    const parsed = parseDmsInput({ degrees: '38', minutes: '', seconds: '', hemisphere: 'N' }, 'latitude');

    expect(parsed).to.deep.equal({ empty: false, value: 38 });
  });

  it('should reject unsigned degrees outside the axis range and non-integer minutes', () => {
    expect(parseDmsInput({ degrees: '91', minutes: '0', seconds: '0', hemisphere: 'N' }, 'latitude').error).to.match(
      /0 to 90/,
    );
    expect(parseDmsInput({ degrees: '38', minutes: '60', seconds: '0', hemisphere: 'S' }, 'latitude').error).to.match(
      /minutes/i,
    );
    expect(parseDmsInput({ degrees: '90', minutes: '0', seconds: '0.01', hemisphere: 'N' }, 'latitude').error).to.match(
      /90/,
    );
  });
});
