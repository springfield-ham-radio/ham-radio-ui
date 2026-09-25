import { describe, expect, it } from 'vitest';
import { operatorClassToLicenseClassId } from '@springfield/ham-radio-utils';
import {
  assessPrivilege,
  desiredRadioPrivilege,
  emptyLicenseDirectory,
  migrateLegacyLicenses,
  parseLicenseDirectory,
  privilegeMenu,
  serializeLicenseDirectory,
  soleAmateurIdentity,
  solePrivilegeChoice,
  type AmateurLicense,
  type LicenseDirectory,
  type LicensePerson,
} from '../../app/utils/license-people.ts';
import { transmitPrivilegeWarning } from '../../app/utils/transmit-privileges.ts';

const now = '2026-09-25T00:00:00.000Z';

function ids(): () => string {
  let next = 0;

  return () => {
    next += 1;
    return `id-${next}`;
  };
}

function person(id: string, name: string): LicensePerson {
  return { id, name, createdAt: now, updatedAt: now };
}

function amateur(personId: string, id: string, callSign: string, operatorClass: string): AmateurLicense {
  const licenseClassId = operatorClassToLicenseClassId(operatorClass);

  return {
    id,
    personId,
    kind: 'amateur',
    callSign,
    name: 'Ada',
    operatorClass,
    licenseClassId,
    licenseClassName: operatorClass === 'TECHNICIAN' ? 'Technician' : operatorClass,
    status: 'VALID',
    lookupType: 'Person',
    grantDate: undefined,
    expiryDate: undefined,
    lastActionDate: undefined,
    previousCallSign: undefined,
    previousOperatorClass: undefined,
    trusteeCallSign: undefined,
    trusteeName: undefined,
    gridsquare: 'EM26',
    ulsUrl: undefined,
    updatedAt: now,
  };
}

describe('license people', () => {
  it('should keep a person who holds no license', () => {
    const directory: LicenseDirectory = {
      people: [person('ada', 'Ada')],
      licenses: [],
    };

    const parsed = parseLicenseDirectory(serializeLicenseDirectory(directory));

    expect(parsed).toEqual(directory);
    expect(privilegeMenu(parsed)[0]?.[1]?.label).toBe('No license · FRS');
    expect(solePrivilegeChoice(parsed)).toEqual({ personId: 'ada' });
  });

  it('should default the only license onto a radio', () => {
    const directory: LicenseDirectory = {
      people: [person('ada', 'Ada'), person('sam', 'Sam')],
      licenses: [amateur('ada', 'lic-ada', 'W1AW', 'TECHNICIAN')],
    };

    expect(solePrivilegeChoice(directory)).toEqual({ personId: 'ada', licenseId: 'lic-ada' });
    expect(desiredRadioPrivilege(directory, undefined)).toEqual({ personId: 'ada', licenseId: 'lic-ada' });
    expect(desiredRadioPrivilege(directory, { personId: 'gone' })).toEqual({ personId: 'ada', licenseId: 'lic-ada' });
    expect(desiredRadioPrivilege(directory, { personId: 'sam' })).toEqual({ personId: 'sam' });
  });

  it('should keep an explicit license when several grants exist', () => {
    const directory: LicenseDirectory = {
      people: [person('ada', 'Ada')],
      licenses: [amateur('ada', 'tech', 'W1AW', 'TECHNICIAN'), amateur('ada', 'extra', 'W1AW', 'EXTRA')],
    };

    expect(solePrivilegeChoice(directory)).toBeUndefined();
    expect(desiredRadioPrivilege(directory, { personId: 'ada', licenseId: 'extra' })).toEqual({
      personId: 'ada',
      licenseId: 'extra',
    });
  });

  it('should migrate the previous single amateur and GMRS grants onto one person', () => {
    const directory = migrateLegacyLicenses(
      JSON.stringify({ callSign: 'W1AW', name: 'Ada Lovelace', operatorClass: 'EXTRA', status: 'VALID' }),
      JSON.stringify({ callSign: 'WRKP365', name: 'Ada Lovelace', status: 'VALID' }),
      now,
      ids(),
    );

    expect(directory.people).toEqual([person('id-3', 'Ada Lovelace')]);
    expect(directory.licenses.map((license) => license.kind)).toEqual(['amateur', 'gmrs']);
    expect(directory.licenses.map((license) => license.callSign)).toEqual(['W1AW', 'WRKP365']);
    expect(soleAmateurIdentity(directory).callSign).toBe('W1AW');
  });

  it('should fall back to an empty directory when storage is invalid', () => {
    expect(parseLicenseDirectory(null)).toEqual(emptyLicenseDirectory());
    expect(parseLicenseDirectory('{')).toEqual(emptyLicenseDirectory());
    expect(parseLicenseDirectory(JSON.stringify({ people: [], licenses: [{ callSign: 'W1AW' }] }))).toEqual(
      emptyLicenseDirectory(),
    );
  });

  it('should allow FRS for a person with no license and warn on amateur frequencies', () => {
    const directory: LicenseDirectory = {
      people: [person('sam', 'Sam')],
      licenses: [],
    };
    const choice = { personId: 'sam' };
    const assessment = assessPrivilege(directory, choice);

    expect(transmitPrivilegeWarning(462_562_500, assessment)).toBeUndefined();
    expect(transmitPrivilegeWarning(146_520_000, assessment)?.title).toBe('Outside FRS privileges');
    expect(transmitPrivilegeWarning(467_550_000, assessment)?.detail).toContain('GMRS');
  });

  it('should allow FRS for a Technician and warn on GMRS repeater inputs', () => {
    const directory: LicenseDirectory = {
      people: [person('ada', 'Ada')],
      licenses: [amateur('ada', 'tech', 'W1AW', 'TECHNICIAN')],
    };
    const assessment = assessPrivilege(directory, { personId: 'ada', licenseId: 'tech' });

    expect(transmitPrivilegeWarning(462_562_500, assessment)).toBeUndefined();
    expect(transmitPrivilegeWarning(146_520_000, assessment)).toBeUndefined();
    expect(transmitPrivilegeWarning(467_550_000, assessment)?.title).toBe('Outside Technician privileges');
  });
});
