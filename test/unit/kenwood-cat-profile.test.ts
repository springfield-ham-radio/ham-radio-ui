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

  it('should resolve a band-indexed TH-D74 profile from the driver cat block', () => {
    const profile = kenwoodCatProfileFromConfig({
      protocol: 'kenwood',
      vfoCount: 2,
      frequencyCommands: ['FQ'],
      frequencyWidth: 10,
      bandIndexed: true,
      modes: ['FM', 'DV', 'AM', 'LSB', 'USB', 'CW', 'NFM', 'DR', 'WFM', 'R-CW'],
      bandModes: [
        ['FM', 'DV', 'AM', 'NFM', 'DR', 'WFM'],
        ['FM', 'DV', 'AM', 'LSB', 'USB', 'CW', 'NFM', 'DR', 'WFM', 'R-CW'],
      ],
      powers: ['H', 'M', 'L', 'EL'],
      modeCommand: 'MD',
      bandControl: true,
      powerBandIndex: true,
      vfoModeCommand: 'VM',
      vfoModes: ['VFO', 'Memory', 'Call', 'DV'],
    });

    expect(profile.wakeCr).toBe(false);
    expect(profile.vfoChannel).toBe(false);
    expect(profile.bandIndexed).toBe(true);
    expect(profile.frequencyWidth).toBe(10);
    expect(profile.modes[1]).toBe('DV');
    expect(profile.modes[6]).toBe('NFM');
    expect(profile.modes[7]).toBe('DR');
    expect(profile.modes[9]).toBe('R-CW');
    expect(profile.vfoModeCommand).toBe('VM');
  });

  it('should reject dual-band Kenwood CAT without vfoChannel or bandIndexed', () => {
    expect(() =>
      kenwoodCatProfileFromConfig({
        protocol: 'kenwood',
        vfoCount: 2,
        modes: ['FM'],
        powers: ['H'],
      }),
    ).toThrow(/vfoChannel or bandIndexed/);
  });

  it('should reject bandModes entries that are not in modes', () => {
    expect(() =>
      kenwoodCatProfileFromConfig({
        protocol: 'kenwood',
        vfoCount: 1,
        bandIndexed: true,
        modes: ['FM'],
        powers: ['H'],
        bandModes: [['USB']],
      }),
    ).toThrow(/not in modes/);
  });
});
