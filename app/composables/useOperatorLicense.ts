import { licenseClasses, operatorClassToLicenseClassId } from '@springfield/ham-radio-utils';
import { fetchCallookLicense } from '~/utils/callook';
import { fetchGmrsLicense, type GmrsLookupStatusEvent } from '~/utils/gmrs-lookup';
import { findBandByFrequency, hasTransmitPrivilege, licenseNameForId, displayBandName } from '~/utils/transmit-privileges';

export interface OperatorLicense {
  callSign: string;
  name: string | undefined;
  operatorClass: string;
  licenseClassId: string | undefined;
  licenseClassName: string | undefined;
  status: 'VALID' | 'INVALID' | 'UPDATING' | 'manual';
  lookupType: string | undefined;
  grantDate: string | undefined;
  expiryDate: string | undefined;
  lastActionDate: string | undefined;
  previousCallSign: string | undefined;
  previousOperatorClass: string | undefined;
  trusteeCallSign: string | undefined;
  trusteeName: string | undefined;
  gridsquare: string | undefined;
  ulsUrl: string | undefined;
  updatedAt: string;
}

interface LicenseClass {
  id: string;
  name: string;
}

export interface GmrsLicense {
  callSign: string;
  name: string | undefined;
  status: 'VALID' | 'INACTIVE';
  city: string | undefined;
  state: string | undefined;
  frn: string | undefined;
  grantDate: string | undefined;
  expiryDate: string | undefined;
  lastActionDate: string | undefined;
  ulsUrl: string | undefined;
  updatedAt: string;
}

const STORAGE_KEY = 'ham-radio-operator-license';
const GMRS_STORAGE_KEY = 'ham-radio-gmrs-license';
const HAM_CLASS_NAMES = new Set(['Technician', 'General', 'Amateur Extra', 'Advanced (Grandfathered)', 'Novice (Grandfathered)']);

const LICENSE_CLASSES = licenseClasses as LicenseClass[];
const GMRS_LICENSE_CLASS_ID = LICENSE_CLASSES.find((licenseClass) => licenseClass.name === 'GMRS')?.id;

export const amateurLicenseClassOptions = LICENSE_CLASSES.filter((licenseClass) => HAM_CLASS_NAMES.has(licenseClass.name)).map((licenseClass) => ({
  label: licenseClass.name,
  value: licenseClass.id,
}));

export interface TransmitPrivilegeWarning {
  title: string;
  bandLabel: string;
  detail: string;
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

function licenseClassNameForId(id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }

  return LICENSE_CLASSES.find((licenseClass) => licenseClass.id === id)?.name;
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

function normalizeUlsUrl(url: string | undefined): string | undefined {
  const trimmed = optionalText(url);

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('http://wireless2.fcc.gov/') || trimmed.startsWith('http://www.fcc.gov/')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }

  return trimmed;
}

function formatLicenseType(type: string | undefined): string | undefined {
  if (!type) {
    return undefined;
  }

  return type
    .toLowerCase()
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readStoredLicense(): OperatorLicense | null {
  if (!import.meta.client) {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as OperatorLicense;
  } catch {
    return null;
  }
}

function writeStoredLicense(license: OperatorLicense | null): void {
  if (!import.meta.client) {
    return;
  }

  if (!license) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
}

function readStoredGmrsLicense(): GmrsLicense | null {
  if (!import.meta.client) {
    return null;
  }

  try {
    const raw = localStorage.getItem(GMRS_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as GmrsLicense;
  } catch {
    return null;
  }
}

function writeStoredGmrsLicense(license: GmrsLicense | null): void {
  if (!import.meta.client) {
    return;
  }

  if (!license) {
    localStorage.removeItem(GMRS_STORAGE_KEY);
    return;
  }

  localStorage.setItem(GMRS_STORAGE_KEY, JSON.stringify(license));
}

function dateForGmrsStatus(statuses: GmrsLookupStatusEvent[] | undefined, code: string): string | undefined {
  return optionalText(statuses?.find((status) => status.value === code)?.created_at);
}

function latestGmrsStatusDate(statuses: GmrsLookupStatusEvent[] | undefined): string | undefined {
  if (!statuses?.length) {
    return undefined;
  }

  return statuses.reduce((latest, status) => (status.created_at > latest ? status.created_at : latest), statuses[0]!.created_at);
}

function gmrsUlsUrl(licenseId: number): string {
  return `https://wireless2.fcc.gov/UlsApp/UlsSearch/license.jsp?licKey=${licenseId}`;
}

export function useOperatorLicense() {
  const license = useState<OperatorLicense | null>('operator-license', () => readStoredLicense());
  const callSignInput = useState('operator-call-sign-input', () => license.value?.callSign ?? '');
  const isLookingUp = useState('operator-license-looking-up', () => false);
  const lookupError = useState<string | null>('operator-license-error', () => null);
  const needsManualClass = useState('operator-license-needs-manual', () => {
    return license.value?.status === 'VALID' && !license.value.licenseClassId && Boolean(license.value.callSign);
  });

  const gmrsLicense = useState<GmrsLicense | null>('gmrs-license', () => readStoredGmrsLicense());
  const gmrsCallSignInput = useState('gmrs-call-sign-input', () => gmrsLicense.value?.callSign ?? '');
  const isLookingUpGmrs = useState('gmrs-license-looking-up', () => false);
  const gmrsLookupError = useState<string | null>('gmrs-license-error', () => null);

  function persist(next: OperatorLicense | null): void {
    license.value = next;
    writeStoredLicense(next);
  }

  function persistGmrs(next: GmrsLicense | null): void {
    gmrsLicense.value = next;
    writeStoredGmrsLicense(next);
  }

  async function lookupCallSign(callSign?: string): Promise<void> {
    const normalized = (callSign ?? callSignInput.value).trim().toUpperCase();
    callSignInput.value = normalized;
    lookupError.value = null;
    needsManualClass.value = false;

    if (!normalized) {
      lookupError.value = 'Enter a US call sign to look up.';
      return;
    }

    isLookingUp.value = true;

    try {
      const response = await fetchCallookLicense(normalized);

      if (response.status === 'INVALID') {
        lookupError.value = `No active US amateur license found for ${normalized}.`;
        return;
      }

      if (response.status === 'UPDATING') {
        lookupError.value = 'Callook is updating its database. Try again in a few minutes.';
        return;
      }

      const operatorClass = response.current?.operClass?.trim() ?? '';
      const licenseClassId = operatorClassToLicenseClassId(operatorClass);
      const resolvedCallSign = response.current?.callsign?.trim().toUpperCase() || normalized;

      const next: OperatorLicense = {
        callSign: resolvedCallSign,
        name: optionalText(response.name),
        operatorClass,
        licenseClassId,
        licenseClassName: licenseClassNameForId(licenseClassId),
        status: 'VALID',
        lookupType: formatLicenseType(response.type),
        grantDate: optionalText(response.otherInfo?.grantDate),
        expiryDate: optionalText(response.otherInfo?.expiryDate),
        lastActionDate: optionalText(response.otherInfo?.lastActionDate),
        previousCallSign: optionalText(response.previous?.callsign)?.toUpperCase(),
        previousOperatorClass: optionalText(response.previous?.operClass),
        trusteeCallSign: optionalText(response.trustee?.callsign)?.toUpperCase(),
        trusteeName: optionalText(response.trustee?.name),
        gridsquare: optionalText(response.location?.gridsquare)?.toUpperCase(),
        ulsUrl: normalizeUlsUrl(response.otherInfo?.ulsUrl),
        updatedAt: new Date().toISOString(),
      };

      callSignInput.value = resolvedCallSign;
      persist(next);
      needsManualClass.value = !licenseClassId;
    } catch (cause) {
      const cached = license.value;

      if (cached) {
        lookupError.value = 'Lookup failed; using the last saved license.';
        return;
      }

      lookupError.value = cause instanceof Error ? cause.message : 'Callook lookup failed.';
    } finally {
      isLookingUp.value = false;
    }
  }

  function setManualLicenseClass(licenseClassId: string): void {
    if (!license.value) {
      return;
    }

    const next: OperatorLicense = {
      ...license.value,
      licenseClassId,
      licenseClassName: licenseClassNameForId(licenseClassId),
      status: license.value.status === 'VALID' ? 'VALID' : 'manual',
      updatedAt: new Date().toISOString(),
    };

    persist(next);
    needsManualClass.value = false;
    lookupError.value = null;
  }

  function clearLicense(): void {
    persist(null);
    callSignInput.value = '';
    lookupError.value = null;
    needsManualClass.value = false;
  }

  async function lookupGmrsCallSign(callSign?: string): Promise<void> {
    const normalized = (callSign ?? gmrsCallSignInput.value).trim().toUpperCase();
    gmrsCallSignInput.value = normalized;
    gmrsLookupError.value = null;

    if (!normalized) {
      gmrsLookupError.value = 'Enter a GMRS call sign to look up.';
      return;
    }

    isLookingUpGmrs.value = true;

    try {
      const result = await fetchGmrsLicense(normalized);

      if (!result.found) {
        gmrsLookupError.value = `No GMRS license found for ${normalized}.`;
        return;
      }

      const payload = result.license;
      const next: GmrsLicense = {
        callSign: payload.callsign.trim().toUpperCase() || normalized,
        name: optionalText(payload.full_name) ?? optionalText(payload.name),
        status: payload.is_active ? 'VALID' : 'INACTIVE',
        city: optionalText(payload.city ?? undefined),
        state: optionalText(payload.state ?? undefined),
        frn: payload.frn === null || payload.frn === undefined ? undefined : String(payload.frn),
        grantDate: dateForGmrsStatus(payload.statuses, 'LIISS'),
        expiryDate: dateForGmrsStatus(payload.statuses, 'LIEXP'),
        lastActionDate: latestGmrsStatusDate(payload.statuses),
        ulsUrl: gmrsUlsUrl(payload.id),
        updatedAt: new Date().toISOString(),
      };

      gmrsCallSignInput.value = next.callSign;
      persistGmrs(next);

      if (!payload.is_active) {
        gmrsLookupError.value = 'This GMRS license is not active and will not be used for privilege checks.';
      }
    } catch (cause) {
      const cached = gmrsLicense.value;

      if (cached) {
        gmrsLookupError.value = 'Lookup failed; using the last saved GMRS license.';
        return;
      }

      gmrsLookupError.value = cause instanceof Error ? cause.message : 'GMRS lookup failed.';
    } finally {
      isLookingUpGmrs.value = false;
    }
  }

  function clearGmrsLicense(): void {
    persistGmrs(null);
    gmrsCallSignInput.value = '';
    gmrsLookupError.value = null;
  }

  function privilegeClassIds(): string[] {
    const classIds: string[] = [];

    if (license.value?.licenseClassId) {
      classIds.push(license.value.licenseClassId);
    }

    if (gmrsLicense.value?.status === 'VALID' && GMRS_LICENSE_CLASS_ID) {
      classIds.push(GMRS_LICENSE_CLASS_ID);
    }

    return classIds;
  }

  const privilegeLicenseLabel = computed(() => {
    const names: string[] = [];

    if (license.value?.licenseClassName) {
      names.push(license.value.licenseClassName);
    }

    if (gmrsLicense.value?.status === 'VALID') {
      names.push('GMRS');
    }

    if (names.length === 0) {
      return 'your license';
    }

    if (names.length === 1) {
      return names[0]!;
    }

    return names.join(' and ');
  });

  const hasPrivilegeContext = computed(() => privilegeClassIds().length > 0);

  function isTransmitAllowed(frequencyHz: number | undefined): boolean {
    const classIds = privilegeClassIds();

    if (classIds.length === 0 || frequencyHz === undefined) {
      return true;
    }

    return classIds.some((classId) => hasTransmitPrivilege(frequencyHz, classId));
  }

  function getTransmitPrivilegeWarning(frequencyHz: number | undefined): TransmitPrivilegeWarning | undefined {
    const classIds = privilegeClassIds();
    const licenseClassName = privilegeLicenseLabel.value;

    if (classIds.length === 0 || frequencyHz === undefined || classIds.some((classId) => hasTransmitPrivilege(frequencyHz, classId))) {
      return undefined;
    }

    const band = findBandByFrequency(frequencyHz);
    const frequencyMHz = `${(frequencyHz / 1_000_000).toFixed(4)} MHz`;

    if (!band) {
      return {
        title: `Outside ${licenseClassName} privileges`,
        bandLabel: frequencyMHz,
        detail: 'This frequency is not in a known allocation that your license may transmit on.',
      };
    }

    const bandName = displayBandName(band.name);
    const requiredLicenses = band.privileges.map((id) => licenseNameForId(id)).filter((name): name is string => Boolean(name) && name !== 'FRS');

    let detail: string;

    if (band.name === 'Weather Radio') {
      detail = 'NOAA Weather Radio is receive-only. Amateur licenses cannot transmit here.';
    } else if (requiredLicenses.length > 0 && requiredLicenses.every((name) => !HAM_CLASS_NAMES.has(name))) {
      detail = `This is a ${bandName} allocation. Transmit requires ${formatRequiredLicenses(requiredLicenses)}.`;
    } else {
      detail = `Transmit on ${bandName} requires ${formatRequiredLicenses(requiredLicenses)}.`;
    }

    return {
      title: `Outside ${licenseClassName} privileges`,
      bandLabel: `${bandName} · ${frequencyMHz}`,
      detail,
    };
  }

  return {
    license,
    callSignInput,
    isLookingUp,
    lookupError,
    needsManualClass,
    amateurLicenseClassOptions,
    lookupCallSign,
    setManualLicenseClass,
    clearLicense,
    gmrsLicense,
    gmrsCallSignInput,
    isLookingUpGmrs,
    gmrsLookupError,
    lookupGmrsCallSign,
    clearGmrsLicense,
    privilegeLicenseLabel,
    hasPrivilegeContext,
    isTransmitAllowed,
    getTransmitPrivilegeWarning,
  };
}
