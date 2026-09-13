import { describe, it } from 'node:test';
import { expect } from 'chai';
import { kenwoodCatProfileFromConfig, lookupCatCode } from '../../app/utils/kenwood-cat-profile.ts';

describe('kenwoodCatProfileFromConfig', () => {
  it('should resolve a VFO-channel mobile profile from the driver cat block', () => {
    const profile = kenwoodCatProfileFromConfig({
      protocol: 'kenwood',
      vfoCount: 2,
      frequencyCommands: ['FO'],
      frequencyWidth: 10,
      vfoChannel: true,
      modes: ['FM', 'NFM', 'AM'],
      powers: ['High', 'Medium', 'Low'],
      bandControl: true,
      powerBandIndex: true,
    });

    expect(profile.wakeCr).to.equal(false);
    expect(profile.vfoCount).to.equal(2);
    expect(profile.vfoChannel).to.equal(true);
    expect(profile.frequencyCommands).to.deep.equal(['FO']);
    expect(profile.powers).to.deep.equal(['High', 'Medium', 'Low']);
    expect(lookupCatCode(profile.powers, 'medium')).to.equal(1);
  });

  it('should resolve a handheld profile with wake CR and FQ then FO', () => {
    const profile = kenwoodCatProfileFromConfig({
      protocol: 'kenwood',
      wakeCr: true,
      frequencyCommands: ['FQ', 'FO'],
      modes: ['FM', 'WFM', 'AM', 'LSB', 'USB', 'CW'],
      powers: ['High', 'Medium', 'Low'],
      modeCommand: 'MD',
    });

    expect(profile.wakeCr).to.equal(true);
    expect(profile.vfoCount).to.equal(1);
    expect(profile.vfoChannel).to.equal(false);
    expect(profile.frequencyCommands).to.deep.equal(['FQ', 'FO']);
    expect(profile.modeCommand).to.equal('MD');
    expect(profile.frequencyWidth).to.equal(11);
  });

  it('should reject a non-Kenwood protocol', () => {
    expect(() => kenwoodCatProfileFromConfig({ protocol: 'icom-ci-v' })).to.throw(/Kenwood CAT/);
  });
});
