import type { SpectrumBand } from '@springfield/ham-radio-api';
import { BandPlan } from '@springfield/ham-radio-utils';

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
