import { fetchCallookLicense } from '~/utils/callook';
import { fetchGmrsLicense } from '~/utils/gmrs-lookup';
import {
  addPerson,
  amateurLicenseClassOptions,
  amateurLicenseFromCallook,
  assessPrivilege,
  createLicensePerson,
  desiredRadioPrivilege,
  emptyLicenseDirectory,
  gmrsLicenseFromLookup,
  homeGridsquareFor,
  soleAmateurIdentity,
  isPrivilegeChoiceValid,
  licensesForPerson,
  logIdentityFor,
  privilegeChoiceFromValue,
  privilegeMenu,
  privilegeOptionCount,
  radioPrivilegeChoice,
  readLicenseDirectory,
  removeLicense,
  removePerson,
  renamePerson,
  samePrivilegeChoice,
  setAmateurClass,
  solePrivilegeChoice,
  upsertLicense,
  writeLicenseDirectory,
  type AmateurLicense,
  type HeldLicense,
  type LicenseDirectory,
  type LicensePerson,
  type PrivilegeAssessment,
  type PrivilegeMenuItem,
  type RadioPrivilegeChoice,
} from '~/utils/license-people';
import { transmitPrivilegeWarning, type TransmitPrivilegeWarning } from '~/utils/transmit-privileges';

export type { AmateurLicense, HeldLicense, LicensePerson, RadioPrivilegeChoice, TransmitPrivilegeWarning };
export { amateurLicenseClassOptions };

/**
 * People and the licenses they hold, plus the grant each radio uses for warnings.
 *
 * A person may hold no license. FRS is allowed for every selection. When only
 * one license is saved, radios without a choice use that license.
 */
export function useOperatorLicense() {
  const directory = useState<LicenseDirectory>('license-directory', () => emptyLicenseDirectory());
  const hydrated = useState('license-directory-hydrated', () => false);
  const { radios, assignPrivilege } = useSavedRadios();

  if (import.meta.client && !hydrated.value) {
    directory.value = readLicenseDirectory();
    hydrated.value = true;
  }

  const people = computed(() => directory.value.people);
  const privilegeGroups = computed<PrivilegeMenuItem[][]>(() => privilegeMenu(directory.value));
  const privilegeChoices = computed(() => privilegeOptionCount(directory.value));
  const solePrivilege = computed(() => solePrivilegeChoice(directory.value));
  const homeGridsquare = computed(() => homeGridsquareFor(directory.value));
  const amateurIdentity = computed(() => soleAmateurIdentity(directory.value));

  function persist(next: LicenseDirectory): void {
    directory.value = next;
    writeLicenseDirectory(next);
  }

  watch(
    [directory, radios],
    () => {
      if (!import.meta.client) {
        return;
      }

      for (const radio of radios.value) {
        const stored = radioPrivilegeChoice(radio);
        const desired = desiredRadioPrivilege(directory.value, stored);

        if (!samePrivilegeChoice(stored, desired)) {
          assignPrivilege(radio.id, desired);
        }
      }
    },
    { immediate: import.meta.client },
  );

  function licensesFor(personId: string): HeldLicense[] {
    return licensesForPerson(directory.value, personId);
  }

  function addLicensePerson(name: string): LicensePerson | undefined {
    const person = createLicensePerson(name, new Date().toISOString(), crypto.randomUUID());

    if (!person) {
      return undefined;
    }

    persist(addPerson(directory.value, person));
    return person;
  }

  function renameLicensePerson(personId: string, name: string): void {
    persist(renamePerson(directory.value, personId, name, new Date().toISOString()));
  }

  function removeLicensePerson(personId: string): void {
    persist(removePerson(directory.value, personId));
  }

  function existingLicenseId(personId: string, kind: HeldLicense['kind'], callSign: string): string {
    return (
      directory.value.licenses.find(
        (license) => license.personId === personId && license.kind === kind && license.callSign === callSign,
      )?.id ?? crypto.randomUUID()
    );
  }

  async function addAmateurLicense(personId: string, callSign: string): Promise<string | undefined> {
    const normalized = callSign.trim().toUpperCase();

    if (!directory.value.people.some((person) => person.id === personId)) {
      return 'That person is no longer saved.';
    }

    if (!normalized) {
      return 'Enter a US call sign to look up.';
    }

    try {
      const response = await fetchCallookLicense(normalized);

      if (response.status === 'INVALID') {
        return `No active US amateur license found for ${normalized}.`;
      }

      if (response.status === 'UPDATING') {
        return 'Callook is updating its database. Try again in a few minutes.';
      }

      const resolvedCallSign = response.current?.callsign?.trim().toUpperCase() || normalized;
      const next = amateurLicenseFromCallook(
        response,
        personId,
        normalized,
        existingLicenseId(personId, 'amateur', resolvedCallSign),
        new Date().toISOString(),
      );

      persist(upsertLicense(directory.value, next));
      return undefined;
    } catch (cause) {
      return cause instanceof Error ? cause.message : 'Callook lookup failed.';
    }
  }

  async function addGmrsLicense(personId: string, callSign: string): Promise<string | undefined> {
    const normalized = callSign.trim().toUpperCase();

    if (!directory.value.people.some((person) => person.id === personId)) {
      return 'That person is no longer saved.';
    }

    if (!normalized) {
      return 'Enter a GMRS call sign to look up.';
    }

    try {
      const result = await fetchGmrsLicense(normalized);

      if (!result.found) {
        return `No GMRS license found for ${normalized}.`;
      }

      const resolvedCallSign = result.license.callsign.trim().toUpperCase() || normalized;
      const next = gmrsLicenseFromLookup(
        result.license,
        personId,
        normalized,
        existingLicenseId(personId, 'gmrs', resolvedCallSign),
        new Date().toISOString(),
      );

      persist(upsertLicense(directory.value, next));
      return undefined;
    } catch (cause) {
      return cause instanceof Error ? cause.message : 'GMRS lookup failed.';
    }
  }

  function setManualLicenseClass(licenseId: string, licenseClassId: string): void {
    persist(setAmateurClass(directory.value, licenseId, licenseClassId, new Date().toISOString()));
  }

  function clearHeldLicense(licenseId: string): void {
    persist(removeLicense(directory.value, licenseId));
  }

  function choiceForRadio(radio: { privilegePersonId?: string; privilegeLicenseId?: string } | undefined): RadioPrivilegeChoice | undefined {
    if (!radio) {
      return undefined;
    }

    const stored = radioPrivilegeChoice(radio);

    return isPrivilegeChoiceValid(directory.value, stored) ? stored : undefined;
  }

  function setRadioPrivilege(radioId: string, value: string): void {
    const choice = privilegeChoiceFromValue(value, directory.value);

    if (!choice) {
      return;
    }

    assignPrivilege(radioId, choice);
  }

  function assessmentFor(choice: RadioPrivilegeChoice | undefined): PrivilegeAssessment {
    return assessPrivilege(directory.value, choice);
  }

  function getTransmitPrivilegeWarning(
    frequencyHz: number | undefined,
    choice: RadioPrivilegeChoice | undefined,
  ): TransmitPrivilegeWarning | undefined {
    return transmitPrivilegeWarning(frequencyHz, assessPrivilege(directory.value, choice));
  }

  function identityFor(choice: RadioPrivilegeChoice | undefined): { callSign?: string; gridsquare?: string } {
    return logIdentityFor(directory.value, choice);
  }

  return {
    people,
    privilegeGroups,
    privilegeChoices,
    solePrivilege,
    amateurIdentity,
    homeGridsquare,
    amateurLicenseClassOptions,
    licensesFor,
    addLicensePerson,
    renameLicensePerson,
    removeLicensePerson,
    addAmateurLicense,
    addGmrsLicense,
    setManualLicenseClass,
    clearHeldLicense,
    choiceForRadio,
    setRadioPrivilege,
    assessmentFor,
    getTransmitPrivilegeWarning,
    identityFor,
  };
}
