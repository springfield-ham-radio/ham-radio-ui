import type { SpectrumBand } from '@springfield/ham-radio-api';
import { BandPlan } from '@springfield/ham-radio-utils';

const bandPlan = new BandPlan();

export function findBandByFrequency(frequencyHz: number): SpectrumBand | undefined {
  return bandPlan.findBandByFrequency(frequencyHz);
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
