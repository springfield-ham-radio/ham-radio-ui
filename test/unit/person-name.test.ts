import { describe, expect, it } from 'vitest';
import { amateurLicenseFromCallook, gmrsLicenseFromLookup } from '../../app/utils/license-people.ts';
import { mixedCaseLookupName } from '../../app/utils/person-name.ts';

describe('mixedCaseLookupName', () => {
  it('should title-case an all-uppercase lookup name', () => {
    expect(mixedCaseLookupName('BRYAN HUNT')).toBe('Bryan Hunt');
    expect(mixedCaseLookupName('  BRYAN HUNT  ')).toBe('Bryan Hunt');
  });

  it('should keep hyphens, apostrophes, and the Mc prefix', () => {
    expect(mixedCaseLookupName('SMITH-JONES')).toBe('Smith-Jones');
    expect(mixedCaseLookupName("O'BRIEN")).toBe("O'Brien");
    expect(mixedCaseLookupName('D’ANGELO')).toBe('D’Angelo');
    expect(mixedCaseLookupName('MCDONALD')).toBe('McDonald');
    expect(mixedCaseLookupName('MCKAY')).toBe('McKay');
    expect(mixedCaseLookupName('SMITH-MCDONALD')).toBe('Smith-McDonald');
    expect(mixedCaseLookupName('MACDONALD')).toBe('Macdonald');
  });

  it('should keep roman-numeral suffixes and Jr or Sr', () => {
    expect(mixedCaseLookupName('BRYAN HUNT III')).toBe('Bryan Hunt III');
    expect(mixedCaseLookupName('BRYAN HUNT JR')).toBe('Bryan Hunt Jr.');
    expect(mixedCaseLookupName('BRYAN HUNT JR.')).toBe('Bryan Hunt Jr.');
    expect(mixedCaseLookupName('BRYAN HUNT SR')).toBe('Bryan Hunt Sr.');
    expect(mixedCaseLookupName("MARY ANN O'BRIEN-SMITH III")).toBe("Mary Ann O'Brien-Smith III");
  });

  it('should store the mixed-case name from amateur and GMRS lookup', () => {
    expect(
      amateurLicenseFromCallook(
        { status: 'VALID', name: 'BRYAN HUNT III', current: { callsign: 'W1AW', operClass: 'GENERAL' } },
        'person',
        'W1AW',
        'license',
        '2026-01-01T00:00:00.000Z',
      ).name,
    ).toBe('Bryan Hunt III');
    expect(
      gmrsLicenseFromLookup(
        {
          id: 1,
          type: 'ZA',
          callsign: 'WRKP365',
          full_name: "O'BRIEN",
          status: 'A',
          service: 'ZA',
          is_active: true,
        },
        'person',
        'WRKP365',
        'license',
        '2026-01-01T00:00:00.000Z',
      ).name,
    ).toBe("O'Brien");
    expect(
      amateurLicenseFromCallook(
        { status: 'VALID', name: 'Bryan Hunt', current: { callsign: 'W1AW', operClass: 'GENERAL' } },
        'person',
        'W1AW',
        'license',
        '2026-01-01T00:00:00.000Z',
      ).name,
    ).toBe('Bryan Hunt');
  });

  it('should leave a name that already has mixed case unchanged', () => {
    expect(mixedCaseLookupName('Bryan Hunt')).toBe('Bryan Hunt');
    expect(mixedCaseLookupName("O'Brien")).toBe("O'Brien");
    expect(mixedCaseLookupName('McDonald')).toBe('McDonald');
    expect(mixedCaseLookupName('Bryan HUNT III')).toBe('Bryan HUNT III');
    expect(mixedCaseLookupName('')).toBe('');
  });
});
