import { operatorClassToLicenseClassId } from '@springfield/ham-radio-utils';
import licenseClasses from '../../node_modules/@springfield/ham-radio-utils/dist/db/license-classes.json' with { type: 'json' };
import type { CallookResponse } from '~/utils/callook';
import type { GmrsLookupResponse, GmrsLookupStatusEvent } from '~/utils/gmrs-lookup';

export const LICENSE_DIRECTORY_STORAGE_KEY = 'ham-radio-license-directory';
export const LEGACY_AMATEUR_LICENSE_STORAGE_KEY = 'ham-radio-operator-license';
export const LEGACY_GMRS_LICENSE_STORAGE_KEY = 'ham-radio-gmrs-license';

/**
 * Someone who may operate a radio. They can hold no license, in which case
 * they may still transmit on FRS.
 */
export interface LicensePerson {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AmateurLicense {
  id: string;
  personId: string;
  kind: 'amateur';
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

export interface GmrsLicenseRecord {
  id: string;
  personId: string;
  kind: 'gmrs';
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

export type HeldLicense = AmateurLicense | GmrsLicenseRecord;

export interface LicenseDirectory {
  people: LicensePerson[];
  licenses: HeldLicense[];
}

/**
 * Privilege check stored on a radio.
 *
 * `licenseId` selects one grant. When it is absent, the person holds no
 * license and the radio is checked as FRS only.
 */
export interface RadioPrivilegeChoice {
  personId: string;
  licenseId?: string;
}

export interface PrivilegeAssessment {
  /** False when nothing is selected, or the selected grant has no usable class. */
  active: boolean;
  classIds: string[];
  label: string;
}

export interface PrivilegeMenuItem {
  label: string;
  value?: string;
  type?: 'label';
}

interface LicenseClass {
  id: string;
  name: string;
}

const LICENSE_CLASSES = licenseClasses as LicenseClass[];
const HAM_CLASS_NAMES = new Set(['Technician', 'General', 'Amateur Extra', 'Advanced (Grandfathered)', 'Novice (Grandfathered)']);
const GMRS_LICENSE_CLASS_ID = LICENSE_CLASSES.find((licenseClass) => licenseClass.name === 'GMRS')?.id;
const FRS_LICENSE_CLASS_ID = LICENSE_CLASSES.find((licenseClass) => licenseClass.name === 'FRS')?.id;

export const amateurLicenseClassOptions = LICENSE_CLASSES.filter((licenseClass) => HAM_CLASS_NAMES.has(licenseClass.name)).map(
  (licenseClass) => ({
    label: licenseClass.name,
    value: licenseClass.id,
  }),
);

export function emptyLicenseDirectory(): LicenseDirectory {
  return { people: [], licenses: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

function licenseClassNameForId(id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }

  return LICENSE_CLASSES.find((licenseClass) => licenseClass.id === id)?.name;
}

export function licensesForPerson(directory: LicenseDirectory, personId: string): HeldLicense[] {
  return directory.licenses.filter((license) => license.personId === personId);
}

export function samePrivilegeChoice(left: RadioPrivilegeChoice | undefined, right: RadioPrivilegeChoice | undefined): boolean {
  return (left?.personId ?? '') === (right?.personId ?? '') && (left?.licenseId ?? '') === (right?.licenseId ?? '');
}

export function isPrivilegeChoiceValid(directory: LicenseDirectory, choice: RadioPrivilegeChoice | undefined): boolean {
  if (!choice || !directory.people.some((person) => person.id === choice.personId)) {
    return false;
  }

  const held = licensesForPerson(directory, choice.personId);

  if (!choice.licenseId) {
    return held.length === 0;
  }

  return held.some((license) => license.id === choice.licenseId);
}

/**
 * License to apply when a radio has no valid selection.
 *
 * A single saved license is used even if other people hold none. When nobody
 * holds a license and there is only one person, that person is used so the
 * radio is checked as FRS.
 */
export function solePrivilegeChoice(directory: LicenseDirectory): RadioPrivilegeChoice | undefined {
  if (directory.licenses.length === 1) {
    const license = directory.licenses[0]!;

    return { personId: license.personId, licenseId: license.id };
  }

  if (directory.licenses.length === 0 && directory.people.length === 1) {
    return { personId: directory.people[0]!.id };
  }

  return undefined;
}

/**
 * Keep a valid radio selection. Otherwise apply the single-license default.
 */
export function desiredRadioPrivilege(
  directory: LicenseDirectory,
  stored: RadioPrivilegeChoice | undefined,
): RadioPrivilegeChoice | undefined {
  if (isPrivilegeChoiceValid(directory, stored)) {
    return stored;
  }

  return solePrivilegeChoice(directory);
}

export function privilegeValue(choice: RadioPrivilegeChoice): string {
  return choice.licenseId ? `license:${choice.licenseId}` : `person:${choice.personId}`;
}

export function privilegeChoiceFromValue(value: string, directory: LicenseDirectory): RadioPrivilegeChoice | undefined {
  if (value.startsWith('license:')) {
    const licenseId = value.slice('license:'.length);
    const license = directory.licenses.find((candidate) => candidate.id === licenseId);

    if (!license) {
      return undefined;
    }

    return { personId: license.personId, licenseId: license.id };
  }

  if (value.startsWith('person:')) {
    const choice = { personId: value.slice('person:'.length) };

    return isPrivilegeChoiceValid(directory, choice) ? choice : undefined;
  }

  return undefined;
}

export function licenseMenuLabel(license: HeldLicense): string {
  if (license.kind === 'gmrs') {
    return license.status === 'VALID' ? `${license.callSign} · GMRS` : `${license.callSign} · GMRS (inactive)`;
  }

  const className = license.licenseClassName || license.operatorClass || 'Class not set';

  return `${license.callSign} · ${className}`;
}

/**
 * Select menu groups. Each group is a person label followed by that person's licenses.
 *
 * Nuxt UI groups a select by nesting arrays. A `type: 'label'` row is the person name.
 */
export function privilegeMenu(directory: LicenseDirectory): PrivilegeMenuItem[][] {
  return directory.people.map((person) => {
    const held = licensesForPerson(directory, person.id);
    const heading: PrivilegeMenuItem = { label: person.name, type: 'label' };

    if (held.length === 0) {
      return [heading, { label: 'No license · FRS', value: privilegeValue({ personId: person.id }) }];
    }

    return [
      heading,
      ...held.map((license) => ({
        label: licenseMenuLabel(license),
        value: privilegeValue({ personId: person.id, licenseId: license.id }),
      })),
    ];
  });
}

export function privilegeOptionCount(directory: LicenseDirectory): number {
  return privilegeMenu(directory).reduce(
    (count, group) => count + group.filter((item) => item.type !== 'label').length,
    0,
  );
}

/**
 * Class ids used to flag transmit frequencies for a radio's selection.
 *
 * A person with no license is checked as FRS. An amateur grant without a
 * class, and an inactive GMRS grant, are not checked.
 */
export function assessPrivilege(directory: LicenseDirectory, choice: RadioPrivilegeChoice | undefined): PrivilegeAssessment {
  if (!isPrivilegeChoiceValid(directory, choice) || !choice) {
    return { active: false, classIds: [], label: '' };
  }

  if (!choice.licenseId) {
    return {
      active: Boolean(FRS_LICENSE_CLASS_ID),
      classIds: FRS_LICENSE_CLASS_ID ? [FRS_LICENSE_CLASS_ID] : [],
      label: 'FRS',
    };
  }

  const license = directory.licenses.find((candidate) => candidate.id === choice.licenseId);

  if (!license) {
    return { active: false, classIds: [], label: '' };
  }

  if (license.kind === 'gmrs') {
    if (license.status !== 'VALID' || !GMRS_LICENSE_CLASS_ID) {
      return { active: false, classIds: [], label: license.callSign };
    }

    return { active: true, classIds: [GMRS_LICENSE_CLASS_ID], label: 'GMRS' };
  }

  if (!license.licenseClassId) {
    return { active: false, classIds: [], label: license.callSign };
  }

  return {
    active: true,
    classIds: [license.licenseClassId],
    label: license.licenseClassName || license.callSign,
  };
}

/**
 * Call sign and grid for a log entry.
 *
 * An amateur selection is used directly. A GMRS selection or an unlicensed
 * person uses that person's amateur grant when they have exactly one.
 */
export function logIdentityFor(
  directory: LicenseDirectory,
  choice: RadioPrivilegeChoice | undefined,
): { callSign?: string; gridsquare?: string } {
  if (!choice) {
    return {};
  }

  const held = licensesForPerson(directory, choice.personId);
  const selected = choice.licenseId ? held.find((license) => license.id === choice.licenseId) : undefined;

  if (selected?.kind === 'amateur') {
    return { callSign: selected.callSign, gridsquare: selected.gridsquare };
  }

  const amateur = held.filter((license) => license.kind === 'amateur');

  if (amateur.length === 1) {
    return { callSign: amateur[0]!.callSign, gridsquare: amateur[0]!.gridsquare };
  }

  return {};
}

/**
 * Grid copied onto Home when it is empty.
 *
 * Only a single amateur grant is used, so a second person's grid is not applied.
 */
export function homeGridsquareFor(directory: LicenseDirectory): string | undefined {
  return soleAmateurIdentity(directory).gridsquare;
}

/**
 * Call sign and grid when the directory has exactly one amateur grant.
 *
 * Other grants, such as GMRS, do not change this. Several amateur grants do not pick one.
 */
export function soleAmateurIdentity(directory: LicenseDirectory): { callSign?: string; gridsquare?: string } {
  const amateur = directory.licenses.filter((license): license is AmateurLicense => license.kind === 'amateur');

  if (amateur.length !== 1) {
    return {};
  }

  return { callSign: amateur[0]!.callSign, gridsquare: amateur[0]!.gridsquare };
}

export function createLicensePerson(name: string, now: string, id: string): LicensePerson | undefined {
  const trimmed = name.trim();

  if (!trimmed) {
    return undefined;
  }

  return {
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
}

export function addPerson(directory: LicenseDirectory, person: LicensePerson): LicenseDirectory {
  return { people: [...directory.people, person], licenses: directory.licenses };
}

export function renamePerson(directory: LicenseDirectory, personId: string, name: string, now: string): LicenseDirectory {
  const trimmed = name.trim();

  if (!trimmed) {
    return directory;
  }

  return {
    people: directory.people.map((person) => (person.id === personId ? { ...person, name: trimmed, updatedAt: now } : person)),
    licenses: directory.licenses,
  };
}

export function removePerson(directory: LicenseDirectory, personId: string): LicenseDirectory {
  return {
    people: directory.people.filter((person) => person.id !== personId),
    licenses: directory.licenses.filter((license) => license.personId !== personId),
  };
}

export function upsertLicense(directory: LicenseDirectory, license: HeldLicense): LicenseDirectory {
  const index = directory.licenses.findIndex((candidate) => candidate.id === license.id);

  if (index === -1) {
    return { people: directory.people, licenses: [...directory.licenses, license] };
  }

  const licenses = directory.licenses.slice();
  licenses[index] = license;

  return { people: directory.people, licenses };
}

export function removeLicense(directory: LicenseDirectory, licenseId: string): LicenseDirectory {
  return {
    people: directory.people,
    licenses: directory.licenses.filter((license) => license.id !== licenseId),
  };
}

export function setAmateurClass(
  directory: LicenseDirectory,
  licenseId: string,
  licenseClassId: string,
  now: string,
): LicenseDirectory {
  const current = directory.licenses.find((license) => license.id === licenseId);

  if (!current || current.kind !== 'amateur') {
    return directory;
  }

  const next: AmateurLicense = {
    ...current,
    licenseClassId,
    licenseClassName: licenseClassNameForId(licenseClassId),
    status: current.status === 'VALID' ? 'VALID' : 'manual',
    updatedAt: now,
  };

  return upsertLicense(directory, next);
}

function normalizeUlsUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  if (url.startsWith('http://wireless2.fcc.gov/') || url.startsWith('http://www.fcc.gov/')) {
    return `https://${url.slice('http://'.length)}`;
  }

  return url;
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

export function amateurLicenseFromCallook(
  response: CallookResponse,
  personId: string,
  callSign: string,
  id: string,
  now: string,
): AmateurLicense {
  const operatorClass = response.current?.operClass?.trim() ?? '';
  const licenseClassId = operatorClassToLicenseClassId(operatorClass);
  const resolvedCallSign = response.current?.callsign?.trim().toUpperCase() || callSign;

  return {
    id,
    personId,
    kind: 'amateur',
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
    ulsUrl: normalizeUlsUrl(optionalText(response.otherInfo?.ulsUrl)),
    updatedAt: now,
  };
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

export function gmrsUlsUrl(licenseId: number): string {
  return `https://wireless2.fcc.gov/UlsApp/UlsSearch/license.jsp?licKey=${licenseId}`;
}

export function gmrsLicenseFromLookup(
  payload: GmrsLookupResponse,
  personId: string,
  callSign: string,
  id: string,
  now: string,
): GmrsLicenseRecord {
  return {
    id,
    personId,
    kind: 'gmrs',
    callSign: payload.callsign.trim().toUpperCase() || callSign,
    name: optionalText(payload.full_name) ?? optionalText(payload.name),
    status: payload.is_active ? 'VALID' : 'INACTIVE',
    city: optionalText(payload.city ?? undefined),
    state: optionalText(payload.state ?? undefined),
    frn: payload.frn === null || payload.frn === undefined ? undefined : String(payload.frn),
    grantDate: dateForGmrsStatus(payload.statuses, 'LIISS'),
    expiryDate: dateForGmrsStatus(payload.statuses, 'LIEXP'),
    lastActionDate: latestGmrsStatusDate(payload.statuses),
    ulsUrl: gmrsUlsUrl(payload.id),
    updatedAt: now,
  };
}

export function previousLicenseLabel(license: AmateurLicense): string | undefined {
  if (!license.previousCallSign) {
    return undefined;
  }

  if (license.previousOperatorClass) {
    return `${license.previousCallSign} (${license.previousOperatorClass})`;
  }

  return license.previousCallSign;
}

export function trusteeLabel(license: AmateurLicense): string | undefined {
  if (!license.trusteeCallSign && !license.trusteeName) {
    return undefined;
  }

  if (license.trusteeCallSign && license.trusteeName) {
    return `${license.trusteeName} (${license.trusteeCallSign})`;
  }

  return license.trusteeName || license.trusteeCallSign;
}

export function gmrsLocationLabel(license: GmrsLicenseRecord): string | undefined {
  const parts = [license.city, license.state].filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(', ');
}

function parseAmateurLicense(value: unknown, personId: string, fallbackId: string): AmateurLicense | undefined {
  if (!isRecord(value) || !nonEmpty(value.callSign)) {
    return undefined;
  }

  const licenseClassId = optionalText(value.licenseClassId);
  const status = value.status;

  return {
    id: nonEmpty(value.id) ? value.id.trim() : fallbackId,
    personId,
    kind: 'amateur',
    callSign: value.callSign.trim().toUpperCase(),
    name: optionalText(value.name),
    operatorClass: optionalText(value.operatorClass) ?? '',
    licenseClassId,
    licenseClassName: optionalText(value.licenseClassName) ?? licenseClassNameForId(licenseClassId),
    status: status === 'INVALID' || status === 'UPDATING' || status === 'manual' || status === 'VALID' ? status : 'VALID',
    lookupType: optionalText(value.lookupType),
    grantDate: optionalText(value.grantDate),
    expiryDate: optionalText(value.expiryDate),
    lastActionDate: optionalText(value.lastActionDate),
    previousCallSign: optionalText(value.previousCallSign)?.toUpperCase(),
    previousOperatorClass: optionalText(value.previousOperatorClass),
    trusteeCallSign: optionalText(value.trusteeCallSign)?.toUpperCase(),
    trusteeName: optionalText(value.trusteeName),
    gridsquare: optionalText(value.gridsquare)?.toUpperCase(),
    ulsUrl: normalizeUlsUrl(optionalText(value.ulsUrl)),
    updatedAt: optionalText(value.updatedAt) ?? '',
  };
}

function parseGmrsLicense(value: unknown, personId: string, fallbackId: string): GmrsLicenseRecord | undefined {
  if (!isRecord(value) || !nonEmpty(value.callSign)) {
    return undefined;
  }

  return {
    id: nonEmpty(value.id) ? value.id.trim() : fallbackId,
    personId,
    kind: 'gmrs',
    callSign: value.callSign.trim().toUpperCase(),
    name: optionalText(value.name),
    status: value.status === 'INACTIVE' ? 'INACTIVE' : 'VALID',
    city: optionalText(value.city),
    state: optionalText(value.state),
    frn: optionalText(value.frn),
    grantDate: optionalText(value.grantDate),
    expiryDate: optionalText(value.expiryDate),
    lastActionDate: optionalText(value.lastActionDate),
    ulsUrl: normalizeUlsUrl(optionalText(value.ulsUrl)),
    updatedAt: optionalText(value.updatedAt) ?? '',
  };
}

function parsePerson(value: unknown): LicensePerson | undefined {
  if (!isRecord(value) || !nonEmpty(value.id) || !nonEmpty(value.name)) {
    return undefined;
  }

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    createdAt: optionalText(value.createdAt) ?? '',
    updatedAt: optionalText(value.updatedAt) ?? '',
  };
}

function parseHeldLicense(value: unknown): HeldLicense | undefined {
  if (!isRecord(value) || !nonEmpty(value.personId)) {
    return undefined;
  }

  if (value.kind === 'gmrs') {
    return parseGmrsLicense(value, value.personId.trim(), '');
  }

  if (value.kind === 'amateur') {
    return parseAmateurLicense(value, value.personId.trim(), '');
  }

  return undefined;
}

export function parseLicenseDirectory(raw: string | null): LicenseDirectory {
  if (!raw) {
    return emptyLicenseDirectory();
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || !Array.isArray(parsed.people) || !Array.isArray(parsed.licenses)) {
      return emptyLicenseDirectory();
    }

    const people: LicensePerson[] = [];
    const seenPeople = new Set<string>();

    for (const entry of parsed.people) {
      const person = parsePerson(entry);

      if (!person || seenPeople.has(person.id)) {
        continue;
      }

      seenPeople.add(person.id);
      people.push(person);
    }

    const licenses: HeldLicense[] = [];
    const seenLicenses = new Set<string>();

    for (const entry of parsed.licenses) {
      const license = parseHeldLicense(entry);

      if (!license || !license.id || !seenPeople.has(license.personId) || seenLicenses.has(license.id)) {
        continue;
      }

      seenLicenses.add(license.id);
      licenses.push(license);
    }

    return { people, licenses };
  } catch {
    return emptyLicenseDirectory();
  }
}

export function serializeLicenseDirectory(directory: LicenseDirectory): string {
  return JSON.stringify({
    people: directory.people.map((person) => ({
      id: person.id,
      name: person.name,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    })),
    licenses: directory.licenses,
  });
}

/**
 * Turn the previous single amateur grant and single GMRS grant into one person.
 */
export function migrateLegacyLicenses(
  amateurRaw: string | null,
  gmrsRaw: string | null,
  now: string,
  ids: () => string,
): LicenseDirectory {
  let amateur: AmateurLicense | undefined;
  let gmrs: GmrsLicenseRecord | undefined;

  if (amateurRaw) {
    try {
      amateur = parseAmateurLicense(JSON.parse(amateurRaw) as unknown, 'pending', ids());
    } catch {
      amateur = undefined;
    }
  }

  if (gmrsRaw) {
    try {
      gmrs = parseGmrsLicense(JSON.parse(gmrsRaw) as unknown, 'pending', ids());
    } catch {
      gmrs = undefined;
    }
  }

  if (!amateur && !gmrs) {
    return emptyLicenseDirectory();
  }

  const name = amateur?.name || amateur?.callSign || gmrs?.name || gmrs?.callSign || 'Operator';
  const person = createLicensePerson(name, now, ids());

  if (!person) {
    return emptyLicenseDirectory();
  }

  const licenses: HeldLicense[] = [];

  if (amateur) {
    licenses.push({ ...amateur, personId: person.id });
  }

  if (gmrs) {
    licenses.push({ ...gmrs, personId: person.id });
  }

  return { people: [person], licenses };
}

export function readLicenseDirectory(): LicenseDirectory {
  if (!import.meta.client) {
    return emptyLicenseDirectory();
  }

  try {
    const stored = localStorage.getItem(LICENSE_DIRECTORY_STORAGE_KEY);

    if (stored !== null) {
      return parseLicenseDirectory(stored);
    }

    const migrated = migrateLegacyLicenses(
      localStorage.getItem(LEGACY_AMATEUR_LICENSE_STORAGE_KEY),
      localStorage.getItem(LEGACY_GMRS_LICENSE_STORAGE_KEY),
      new Date().toISOString(),
      () => crypto.randomUUID(),
    );

    if (migrated.people.length > 0) {
      localStorage.setItem(LICENSE_DIRECTORY_STORAGE_KEY, serializeLicenseDirectory(migrated));
      localStorage.removeItem(LEGACY_AMATEUR_LICENSE_STORAGE_KEY);
      localStorage.removeItem(LEGACY_GMRS_LICENSE_STORAGE_KEY);
    }

    return migrated;
  } catch {
    return emptyLicenseDirectory();
  }
}

export function writeLicenseDirectory(directory: LicenseDirectory): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(LICENSE_DIRECTORY_STORAGE_KEY, serializeLicenseDirectory(directory));
}

export function radioPrivilegeChoice(radio: {
  privilegePersonId?: string;
  privilegeLicenseId?: string;
}): RadioPrivilegeChoice | undefined {
  if (!radio.privilegePersonId) {
    return undefined;
  }

  if (radio.privilegeLicenseId) {
    return { personId: radio.privilegePersonId, licenseId: radio.privilegeLicenseId };
  }

  return { personId: radio.privilegePersonId };
}
