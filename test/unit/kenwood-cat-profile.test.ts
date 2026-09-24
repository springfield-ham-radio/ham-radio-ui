import { describe, expect, it } from 'vitest';
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

    expect(profile.wakeCr).toBe(false);
    expect(profile.vfoCount).toBe(2);
    expect(profile.vfoChannel).toBe(true);
    expect(profile.frequencyCommands).toEqual(['FO']);
    expect(profile.powers).toEqual(['High', 'Medium', 'Low']);
    expect(lookupCatCode(profile.powers, 'medium')).toBe(1);
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

    expect(profile.wakeCr).toBe(true);
    expect(profile.vfoCount).toBe(1);
    expect(profile.vfoChannel).toBe(false);
    expect(profile.frequencyCommands).toEqual(['FQ', 'FO']);
    expect(profile.modeCommand).toBe('MD');
    expect(profile.frequencyWidth).toBe(11);
  });

  it('should reject a non-Kenwood protocol', () => {
    expect(() => kenwoodCatProfileFromConfig({ protocol: 'icom-ci-v' })).toThrow(/Kenwood CAT/);
  });
});
