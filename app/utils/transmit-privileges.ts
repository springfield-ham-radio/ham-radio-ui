import type { SpectrumBand } from '@springfield/ham-radio-api';
import { BandPlan } from '@springfield/ham-radio-utils';
import licenseClasses from '../../node_modules/@springfield/ham-radio-utils/dist/db/license-classes.json' with { type: 'json' };

const bandPlan = new BandPlan();

/** WX8–WX10 (Environment Canada / marine) sit outside the NOAA 162.400–162.550 MHz envelope. */
const EXTRA_WEATHER_RADIO_FREQUENCIES_HZ = new Set([
  161_650_000,
  161_775_000,
  163_275_000,
]);

const NOAA_WEATHER_RADIO_REFERENCE_HZ = 162_550_000;

export function findBandByFrequency(frequencyHz: number): SpectrumBand | undefined {
  const frequency = Math.round(frequencyHz);
  const band = bandPlan.findBandByFrequency(frequency);

  if (band) {
    return band;
  }

  if (EXTRA_WEATHER_RADIO_FREQUENCIES_HZ.has(frequency)) {
    return bandPlan.findBandByFrequency(NOAA_WEATHER_RADIO_REFERENCE_HZ);
  }

  return undefined;
}

export function displayBandName(name: string): string {
  return name.replace(/-\d+$/, '');
}

export function bandNameForFrequency(frequencyHz: number | undefined): string {
  if (frequencyHz === undefined) {
    return '';
  }

  const band = findBandByFrequency(frequencyHz);

  if (!band) {
    return '';
  }

  return displayBandName(band.name);
}

export function hasTransmitPrivilege(frequencyHz: number, licenseClassId: string): boolean {
  return bandPlan.hasPrivilege(frequencyHz, licenseClassId);
}

export function licenseNameForId(id: string): string | undefined {
  return bandPlan.findPrivilegeById(id)?.name;
}

interface LicenseClass {
  id: string;
  name: string;
}

const LICENSE_CLASSES = licenseClasses as LicenseClass[];
const FRS_LICENSE_CLASS_ID = LICENSE_CLASSES.find((licenseClass) => licenseClass.name === 'FRS')?.id;
const HAM_CLASS_NAMES = new Set(['Technician', 'General', 'Amateur Extra', 'Advanced (Grandfathered)', 'Novice (Grandfathered)']);

export interface TransmitPrivilegeWarning {
  title: string;
  bandLabel: string;
  detail: string;
}

/**
 * Whether this frequency may be transmitted with the given class ids.
 *
 * An empty list means the operator holds no grant. FRS is license-free, so
 * that list is checked as the FRS class. Frequencies outside the band plan
 * are not allowed.
 */
export function isTransmitAllowed(frequencyHz: number, classIds: readonly string[]): boolean {
  const classes = classIds.length > 0 ? classIds : FRS_LICENSE_CLASS_ID ? [FRS_LICENSE_CLASS_ID] : [];

  if (classes.length === 0) {
    return false;
  }

  return classes.some((classId) => hasTransmitPrivilege(frequencyHz, classId));
}

function formatRequiredLicenses(names: string[]): string {
  const licensedNames = names.filter((name) => name !== 'FRS');

  if (licensedNames.length === 0) {
    return 'a different license';
  }

  if (licensedNames.length === 1) {
    return `a ${licensedNames[0]} license`;
  }

  if (licensedNames.length === 2) {
    return `a ${licensedNames[0]} or ${licensedNames[1]} license`;
  }

  return `a ${licensedNames.slice(0, -1).join(', ')}, or ${licensedNames[licensedNames.length - 1]} license`;
}

/**
 * Warning for a transmit frequency that the selected classes cannot use.
 *
 * `active` is false when no license is selected, or the selected grant has
 * no class yet. FRS frequencies do not warn: anyone may use them.
 */
export function transmitPrivilegeWarning(
  frequencyHz: number | undefined,
  options: { active: boolean; classIds: readonly string[]; label: string },
): TransmitPrivilegeWarning | undefined {
  if (!options.active || frequencyHz === undefined || isTransmitAllowed(frequencyHz, options.classIds)) {
    return undefined;
  }

  const band = findBandByFrequency(frequencyHz);
  const frequencyMHz = `${(frequencyHz / 1_000_000).toFixed(4)} MHz`;
  const label = options.label || 'your license';

  if (!band) {
    return {
      title: `Outside ${label} privileges`,
      bandLabel: frequencyMHz,
      detail: 'This frequency is not in a known allocation that your license may transmit on.',
    };
  }

  const bandName = displayBandName(band.name);
  const requiredLicenses = band.privileges
    .map((id) => licenseNameForId(id))
    .filter((name): name is string => Boolean(name) && name !== 'FRS');

  let detail: string;

  if (bandName === 'Weather Radio') {
    detail = 'NOAA Weather Radio is receive-only. Amateur licenses cannot transmit here.';
  } else if (requiredLicenses.length > 0 && requiredLicenses.every((name) => !HAM_CLASS_NAMES.has(name))) {
    detail = `This is a ${bandName} allocation. Transmit requires ${formatRequiredLicenses(requiredLicenses)}.`;
  } else {
    detail = `Transmit on ${bandName} requires ${formatRequiredLicenses(requiredLicenses)}.`;
  }

  return {
    title: `Outside ${label} privileges`,
    bandLabel: `${bandName} · ${frequencyMHz}`,
    detail,
  };
}
