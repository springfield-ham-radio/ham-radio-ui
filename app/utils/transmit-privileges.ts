import { bands, licenseClasses } from '@springfield/ham-radio-utils';

interface LicenseClass {
  id: string;
  name: string;
}

interface BandChannel {
  frequency: number;
}

interface SpectrumBandRecord {
  name: string;
  lowerFrequency: number;
  upperFrequency: number;
  privileges: string[];
  channels?: BandChannel[];
}

const BANDS = bands as SpectrumBandRecord[];
const LICENSE_CLASSES = licenseClasses as LicenseClass[];
const FRS_LICENSE_CLASS_ID = LICENSE_CLASSES.find((licenseClass) => licenseClass.name === 'FRS')?.id;

export function findBandByFrequency(frequencyHz: number): SpectrumBandRecord | undefined {
  const hz = Math.round(frequencyHz);
  const channelMatch = BANDS.find((band) => band.channels?.some((channel) => channel.frequency === hz));

  if (channelMatch) {
    return channelMatch;
  }

  return BANDS.find((band) => hz >= band.lowerFrequency && hz <= band.upperFrequency);
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
  const band = findBandByFrequency(frequencyHz);

  if (!band) {
    return false;
  }

  if (FRS_LICENSE_CLASS_ID && band.privileges.includes(FRS_LICENSE_CLASS_ID)) {
    return true;
  }

  return band.privileges.includes(licenseClassId);
}

export function licenseNameForId(id: string): string | undefined {
  return LICENSE_CLASSES.find((licenseClass) => licenseClass.id === id)?.name;
}
