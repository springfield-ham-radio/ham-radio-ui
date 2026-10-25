import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HOME_STATION_ID,
  STATION_ANTENNA_STORAGE_KEY,
  applyLicenseGridToHomeIfEmpty,
  createRadioStation,
  createStationAntenna,
  defaultAntennaDraft,
  defaultStationAntennaStore,
  serializeStationAntennaStore,
} from '../../app/utils/antenna-station.ts';
import {
  LEGACY_AMATEUR_LICENSE_STORAGE_KEY,
  LEGACY_GMRS_LICENSE_STORAGE_KEY,
  LICENSE_DIRECTORY_STORAGE_KEY,
  applyOnboardingLicense,
  createLicensePerson,
  emptyLicenseDirectory,
  onboardingLicenseClassOptions,
  onboardingLicenseFieldErrors,
  onboardingLicenseFormCanSave,
  onboardingLicensePrefill,
  serializeLicenseDirectory,
  type AmateurLicense,
  type GmrsLicenseRecord,
  type LicenseDirectory,
} from '../../app/utils/license-people.ts';
import { revalidateShownFields, shownFormErrorsAfterRevalidate } from '../../app/utils/shown-form-errors.ts';
import {
  ONBOARDING_LAUNCH_NEW_PROFILES,
  ONBOARDING_STEP_IDS,
  completeOnboardingStep,
  createOnboardingState,
  emptyOnboardingDataSignals,
  finishOnboarding,
  firstPendingOnboardingStep,
  onboardingEditToPersist,
  onboardingDriversAreDone,
  onboardingHasExistingData,
  onboardingHasPendingStep,
  onboardingHomeIsDone,
  onboardingPendingRadioChange,
  onboardingRadioGroups,
  onboardingRadioOwnedIdsAfterToggle,
  onboardingRadioPicksAfterToggle,
  onboardingFinishReadPlan,
  onboardingRadiosAreDone,
  onboardingStoredDocumentNeedsRewrite,
  planOnboardingSavedRadios,
  onboardingLaunchPlan,
  onboardingLicensesAreDone,
  onboardingLocalSignals,
  nextOnboardingStep,
  onboardingStepIsDone,
  onboardingStepReached,
  parseOnboardingState,
  serializeOnboardingState,
  skipOnboardingStep,
  withOwnedModuleIds,
} from '../../app/utils/onboarding.ts';
import { SAVED_RADIOS_STORAGE_KEY, serializeSavedRadioStore } from '../../app/utils/saved-radios.ts';
import type { SavedRadio } from '../../app/utils/saved-radios.ts';

function storage(entries: Record<string, string> = {}): { getItem(key: string): string | null } {
  return {
    getItem(key: string): string | null {
      return entries[key] ?? null;
    },
  };
}

function signals(partial: Partial<ReturnType<typeof emptyOnboardingDataSignals>> = {}) {
  return { ...emptyOnboardingDataSignals(), ...partial };
}

describe('onboarding existing data', () => {
  it('should ignore a profile that only has the default Home station', () => {
    expect(onboardingHasExistingData(emptyOnboardingDataSignals())).toBe(false);
    expect(onboardingLocalSignals(storage())).toEqual({
      licensePeople: 0,
      licenses: 0,
      legacyLicenseKeys: false,
      savedRadios: 0,
      extraStations: 0,
      antennas: 0,
      homeLocated: false,
    });
    expect(
      onboardingLocalSignals(
        storage({
          [STATION_ANTENNA_STORAGE_KEY]: serializeStationAntennaStore(defaultStationAntennaStore()),
        }),
      ).homeLocated,
    ).toBe(false);
  });

  it('should treat a person, a license, or a legacy license key as existing data', () => {
    const person = createLicensePerson('Ada', '2026-01-01T00:00:00.000Z', 'person-1');
    expect(person).toBeDefined();
    const directory = serializeLicenseDirectory({ people: [person!], licenses: [] });

    expect(
      onboardingHasExistingData(
        signals(onboardingLocalSignals(storage({ [LICENSE_DIRECTORY_STORAGE_KEY]: directory }))),
      ),
    ).toBe(true);
    expect(
      onboardingLocalSignals(storage({ [LEGACY_AMATEUR_LICENSE_STORAGE_KEY]: '{"callSign":"W1AW"}' })).legacyLicenseKeys,
    ).toBe(true);
    expect(
      onboardingLocalSignals(storage({ [LEGACY_GMRS_LICENSE_STORAGE_KEY]: ' ' })).legacyLicenseKeys,
    ).toBe(false);
  });

  it('should treat saved radios, another station, an antenna, or a located Home as existing data', () => {
    const radio: SavedRadio = {
      id: 'radio-1',
      name: 'Handheld',
      manufacturer: 'Baofeng',
      model: 'UV-5R',
      serialPort: '/dev/tty.usbserial',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(
      onboardingLocalSignals(storage({ [SAVED_RADIOS_STORAGE_KEY]: serializeSavedRadioStore({ radios: [radio] }) }))
        .savedRadios,
    ).toBe(1);

    const home = defaultStationAntennaStore();
    home.stations[0] = { ...home.stations[0]!, gridsquare: 'EM48', locationSource: 'grid' };
    expect(
      onboardingLocalSignals(storage({ [STATION_ANTENNA_STORAGE_KEY]: serializeStationAntennaStore(home) })).homeLocated,
    ).toBe(true);

    const extra = defaultStationAntennaStore();
    extra.stations.push(createRadioStation({ nickname: 'Cabin', gridsquare: 'FN42' }, { id: 'station-cabin', now: 2 }));
    expect(
      onboardingLocalSignals(storage({ [STATION_ANTENNA_STORAGE_KEY]: serializeStationAntennaStore(extra) })).extraStations,
    ).toBe(1);

    const withAntenna = defaultStationAntennaStore();
    withAntenna.antennas.push(
      createStationAntenna(
        { ...defaultAntennaDraft(), nickname: 'Dipole', stationId: HOME_STATION_ID },
        { id: 'ant-1', now: 3 },
      ),
    );
    expect(
      onboardingLocalSignals(storage({ [STATION_ANTENNA_STORAGE_KEY]: serializeStationAntennaStore(withAntenna) }))
        .antennas,
    ).toBe(1);
  });

  it('should treat installed modules, channels, log rows, and backups as existing data', () => {
    expect(onboardingHasExistingData(signals({ installedModules: 1 }))).toBe(true);
    expect(onboardingHasExistingData(signals({ savedChannels: 1 }))).toBe(true);
    expect(onboardingHasExistingData(signals({ logQsos: 1 }))).toBe(true);
    expect(onboardingHasExistingData(signals({ backupFiles: 1 }))).toBe(true);
  });
});

describe('onboarding launch plan', () => {
  it('should open a new profile and keep an existing profile closed', () => {
    expect(ONBOARDING_LAUNCH_NEW_PROFILES).toBe(true);

    const fresh = onboardingLaunchPlan({
      stored: undefined,
      hasExistingData: false,
      signalsComplete: true,
      launchNewProfiles: ONBOARDING_LAUNCH_NEW_PROFILES,
    });

    expect(fresh.open).toBe(true);
    expect(fresh.persist?.status).toBe('active');
    expect(fresh.persist?.steps.licenses).toBe('pending');

    expect(
      onboardingLaunchPlan({
        stored: undefined,
        hasExistingData: false,
        signalsComplete: true,
        launchNewProfiles: false,
      }),
    ).toEqual({ open: false });
  });

  it('should mark an existing profile completed without opening the shell', () => {
    const plan = onboardingLaunchPlan({
      stored: undefined,
      hasExistingData: true,
      signalsComplete: true,
      launchNewProfiles: false,
    });

    expect(plan.open).toBe(false);
    expect(plan.persist?.status).toBe('completed');
    expect(plan.persist?.completedReason).toBe('existing-data');
    expect(plan.persist?.steps.licenses).toBe('pending');
    expect(plan.persist?.ownedModuleIds).toEqual([]);
  });

  it('should not start a new profile when the desktop probe failed', () => {
    expect(
      onboardingLaunchPlan({
        stored: undefined,
        hasExistingData: false,
        signalsComplete: false,
        launchNewProfiles: true,
      }),
    ).toEqual({ open: false });
  });

  it('should open an active document and leave a completed document closed', () => {
    const active = createOnboardingState('active');
    const completed = createOnboardingState('completed', 'finished');

    expect(
      onboardingLaunchPlan({
        stored: active,
        hasExistingData: false,
        signalsComplete: true,
        launchNewProfiles: false,
      }),
    ).toEqual({ open: true });
    expect(
      onboardingLaunchPlan({
        stored: completed,
        hasExistingData: true,
        signalsComplete: true,
        launchNewProfiles: true,
      }),
    ).toEqual({ open: false });
  });

  it('should open a brand-new profile only when launch is enabled', () => {
    const plan = onboardingLaunchPlan({
      stored: undefined,
      hasExistingData: false,
      signalsComplete: true,
      launchNewProfiles: true,
    });

    expect(plan.open).toBe(true);
    expect(plan.persist?.status).toBe('active');
    expect(plan.persist?.completedReason).toBeUndefined();
  });
});

describe('onboarding step transitions', () => {
  it('should skip and complete one step without changing the others or the status', () => {
    const initial = createOnboardingState('active');

    const skipped = skipOnboardingStep(initial, 'licenses');
    expect(skipped.status).toBe('active');
    expect(skipped.steps.licenses).toBe('skipped');
    expect(skipped.steps.home).toBe('pending');
    expect(firstPendingOnboardingStep(skipped)).toBe('home');

    const done = completeOnboardingStep(skipped, 'home');
    expect(done.steps.home).toBe('done');
    expect(done.steps.licenses).toBe('skipped');
    expect(onboardingHasPendingStep(done)).toBe(true);
  });

  it('should finish without clearing skipped steps', () => {
    const finished = finishOnboarding(skipOnboardingStep(createOnboardingState('active'), 'read'));

    expect(finished.status).toBe('completed');
    expect(finished.completedReason).toBe('finished');
    expect(finished.steps.read).toBe('skipped');
    expect(finished.steps.licenses).toBe('pending');
    expect(nextOnboardingStep('read')).toBeUndefined();
  });

  it('should keep later steps disabled until they are reached', () => {
    const initial = createOnboardingState('active');

    expect(onboardingStepReached(initial, 'licenses', 'licenses')).toBe(true);
    expect(onboardingStepReached(initial, 'home', 'licenses')).toBe(false);

    const skipped = skipOnboardingStep(initial, 'licenses');
    expect(onboardingStepReached(skipped, 'licenses', 'home')).toBe(true);
    expect(onboardingStepReached(skipped, 'home', 'home')).toBe(true);
    expect(onboardingStepReached(skipped, 'radios', 'home')).toBe(false);
  });

  it('should finish licenses only when an amateur or GMRS grant exists', () => {
    const person = createLicensePerson('Ada', '2026-01-01T00:00:00.000Z', 'person-1');
    expect(person).toBeDefined();

    const none: LicenseDirectory = { people: person ? [person] : [], licenses: [] };
    expect(onboardingLicensesAreDone(emptyLicenseDirectory())).toBe(false);
    expect(onboardingLicensesAreDone(none)).toBe(false);

    const manual: AmateurLicense = {
      id: 'lic-1',
      personId: 'person-1',
      kind: 'amateur',
      callSign: 'W1AW',
      name: 'Ada',
      operatorClass: 'TECHNICIAN',
      licenseClassId: undefined,
      licenseClassName: 'Technician',
      status: 'manual',
      lookupType: undefined,
      grantDate: undefined,
      expiryDate: undefined,
      lastActionDate: undefined,
      previousCallSign: undefined,
      previousOperatorClass: undefined,
      trusteeCallSign: undefined,
      trusteeName: undefined,
      gridsquare: 'EM48',
      ulsUrl: undefined,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const gmrs: GmrsLicenseRecord = {
      id: 'gmrs-1',
      personId: 'person-1',
      kind: 'gmrs',
      callSign: 'WRKP365',
      name: 'Ada',
      status: 'VALID',
      city: undefined,
      state: undefined,
      frn: undefined,
      grantDate: undefined,
      expiryDate: undefined,
      lastActionDate: undefined,
      ulsUrl: undefined,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(onboardingLicensesAreDone({ people: none.people, licenses: [{ ...manual, status: 'VALID' }] })).toBe(true);
    expect(onboardingLicensesAreDone({ people: none.people, licenses: [manual] })).toBe(true);
    expect(onboardingLicensesAreDone({ people: none.people, licenses: [gmrs] })).toBe(true);
  });

  it('should save one onboarding person and license from the inline form', () => {
    const technician = onboardingLicenseClassOptions.find((option) => option.label === 'Technician');
    const gmrsClass = onboardingLicenseClassOptions.find((option) => option.label === 'GMRS');
    expect(technician).toBeDefined();
    expect(gmrsClass).toBeDefined();

    const emptyForm = { name: '', callSign: '', licenseClassId: '' };
    expect(onboardingLicenseFormCanSave(emptyForm)).toBe(false);
    expect(onboardingLicenseFieldErrors(emptyForm)).toEqual({
      name: 'Enter a name',
      callSign: 'Enter a call sign',
      licenseClassId: 'Select a license class',
    });
    expect(onboardingLicenseFormCanSave({ name: 'Ada', callSign: 'W1AW', licenseClassId: '' })).toBe(false);
    expect(onboardingLicensePrefill(emptyLicenseDirectory()).editingExisting).toBe(false);

    const created = applyOnboardingLicense({
      directory: emptyLicenseDirectory(),
      form: { name: ' Ada ', callSign: 'w1aw', licenseClassId: technician!.value },
      now: '2026-01-02T00:00:00.000Z',
      newPersonId: 'person-1',
      newLicenseId: 'lic-1',
    });
    expect(created.people).toEqual([
      {
        id: 'person-1',
        name: 'Ada',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(created.licenses).toHaveLength(1);
    const createdLicense = created.licenses[0];
    expect(createdLicense?.kind).toBe('amateur');
    expect(createdLicense?.callSign).toBe('W1AW');
    expect(createdLicense && 'licenseClassId' in createdLicense ? createdLicense.licenseClassId : undefined).toBe(technician!.value);
    expect(createdLicense && 'status' in createdLicense ? createdLicense.status : undefined).toBe('manual');

    const other = createLicensePerson('Grace', '2026-01-01T00:00:00.000Z', 'person-2');
    const second: GmrsLicenseRecord = {
      id: 'gmrs-2',
      personId: 'person-1',
      kind: 'gmrs',
      callSign: 'WRKP365',
      name: 'Ada',
      status: 'VALID',
      city: 'Springfield',
      state: 'IL',
      frn: undefined,
      grantDate: undefined,
      expiryDate: undefined,
      lastActionDate: undefined,
      ulsUrl: undefined,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const directory: LicenseDirectory = {
      people: [...created.people, other!],
      licenses: [
        {
          ...(created.licenses[0] as AmateurLicense),
          status: 'VALID',
          gridsquare: 'EM48',
          grantDate: '2020-01-01',
        },
        second,
      ],
    };
    const prefill = onboardingLicensePrefill(directory);
    expect(prefill).toMatchObject({
      personId: 'person-1',
      licenseId: 'lic-1',
      name: 'Ada',
      callSign: 'W1AW',
      licenseClassId: technician!.value,
      editingExisting: true,
    });

    const renamed = applyOnboardingLicense({
      directory,
      form: { name: 'Ada Lovelace', callSign: 'W1AW', licenseClassId: technician!.value },
      personId: prefill.personId,
      licenseId: prefill.licenseId,
      now: '2026-01-03T00:00:00.000Z',
      newPersonId: 'person-new',
      newLicenseId: 'lic-new',
    });
    expect(renamed.people.map((person) => person.name)).toEqual(['Ada Lovelace', 'Grace']);
    expect(renamed.licenses).toHaveLength(2);
    const kept = renamed.licenses.find((license) => license.id === 'lic-1') as AmateurLicense;
    expect(kept.gridsquare).toBe('EM48');
    expect(kept.grantDate).toBe('2020-01-01');
    expect(kept.status).toBe('VALID');
    expect(renamed.licenses.find((license) => license.id === 'gmrs-2')).toEqual(second);

    const replaced = applyOnboardingLicense({
      directory,
      form: { name: 'Ada', callSign: 'K1JT', licenseClassId: technician!.value },
      personId: 'person-1',
      licenseId: 'lic-1',
      now: '2026-01-04T00:00:00.000Z',
      newPersonId: 'person-new',
      newLicenseId: 'lic-new',
    });
    const manual = replaced.licenses.find((license) => license.id === 'lic-1') as AmateurLicense;
    expect(manual.callSign).toBe('K1JT');
    expect(manual.status).toBe('manual');
    expect(manual.gridsquare).toBeUndefined();
    expect(replaced.licenses.find((license) => license.id === 'gmrs-2')).toEqual(second);

    const lookedUp: AmateurLicense = {
      ...(created.licenses[0] as AmateurLicense),
      id: 'pending',
      personId: 'pending',
      callSign: 'W1AW',
      status: 'VALID',
      gridsquare: 'FN31',
      grantDate: '2019-06-01',
    };
    const fromLookup = applyOnboardingLicense({
      directory: emptyLicenseDirectory(),
      form: { name: 'Hiram', callSign: 'W1AW', licenseClassId: technician!.value },
      lookedUp,
      now: '2026-01-05T00:00:00.000Z',
      newPersonId: 'person-3',
      newLicenseId: 'lic-3',
    });
    const looked = fromLookup.licenses[0] as AmateurLicense;
    expect(looked.id).toBe('lic-3');
    expect(looked.personId).toBe('person-3');
    expect(looked.gridsquare).toBe('FN31');
    expect(looked.grantDate).toBe('2019-06-01');
    expect(looked.status).toBe('VALID');

    const gmrsSaved = applyOnboardingLicense({
      directory: emptyLicenseDirectory(),
      form: { name: 'Ada', callSign: 'wrkp365', licenseClassId: gmrsClass!.value },
      now: '2026-01-06T00:00:00.000Z',
      newPersonId: 'person-4',
      newLicenseId: 'lic-4',
    });
    expect(gmrsSaved.licenses[0]).toMatchObject({ kind: 'gmrs', callSign: 'WRKP365', status: 'VALID' });

    const unchanged = applyOnboardingLicense({
      directory,
      form: { name: '', callSign: 'W1AW', licenseClassId: technician!.value },
      personId: 'person-1',
      licenseId: 'lic-1',
      now: '2026-01-07T00:00:00.000Z',
      newPersonId: 'person-new',
      newLicenseId: 'lic-new',
    });
    expect(unchanged).toBe(directory);
  });

  it('should finish Home when a license grid already filled it', () => {
    const empty = defaultStationAntennaStore();
    expect(onboardingHomeIsDone(empty.stations)).toBe(false);

    const filled = applyLicenseGridToHomeIfEmpty(empty, 'EM48', 1);
    expect(onboardingHomeIsDone(filled.stations)).toBe(true);
    expect(filled.stations.find((station) => station.id === HOME_STATION_ID)?.gridsquare).toBe('EM48');
  });

  it('should finish Radios from a picked model or an existing saved radio', () => {
    expect(onboardingRadiosAreDone({ ownedModuleIds: [], savedRadioCount: 0 })).toBe(false);
    expect(onboardingRadiosAreDone({ ownedModuleIds: ['baofeng-uv5r'], savedRadioCount: 0 })).toBe(true);
    expect(onboardingRadiosAreDone({ ownedModuleIds: [], savedRadioCount: 1 })).toBe(true);

    const models = [
      { id: 'baofeng-uv5r', manufacturer: 'Baofeng', name: 'UV-5R' },
      { id: 'kenwood-th-d74', manufacturer: 'Kenwood', name: 'TH-D74' },
    ];
    const savedUv5r = {
      id: 'radio-1',
      name: 'Handheld',
      manufacturer: 'Baofeng',
      model: 'baofeng-uv5r',
      serialPort: '/dev/cu.usb',
      baudRate: 9600,
    };

    expect(
      onboardingRadioOwnedIdsAfterToggle({
        ownedModuleIds: ['baofeng-uv5r'],
        modelId: 'baofeng-uv5r',
        checked: false,
      }),
    ).toEqual([]);
    expect(
      onboardingRadioGroups({
        models,
        ownedModuleIds: [],
        saved: [savedUv5r],
      })[0]?.radios[0],
    ).toMatchObject({
      id: 'baofeng-uv5r',
      checked: true,
      saved: [{ id: 'radio-1', name: 'Handheld', serialPort: '/dev/cu.usb', baudRate: 9600 }],
    });
    expect(
      onboardingRadioGroups({
        models,
        ownedModuleIds: ['kenwood-th-d74'],
        saved: [],
      })[1]?.radios[0],
    ).toMatchObject({ id: 'kenwood-th-d74', checked: true, saved: [] });
    expect(
      onboardingRadioGroups({
        models: [],
        ownedModuleIds: [],
        saved: [savedUv5r],
      }),
    ).toEqual([
      {
        manufacturer: 'Baofeng',
        radios: [
          {
            id: 'baofeng-uv5r',
            name: 'Handheld',
            checked: true,
            saved: [{ id: 'radio-1', name: 'Handheld', serialPort: '/dev/cu.usb', baudRate: 9600 }],
          },
        ],
      },
    ]);

    const checked = onboardingRadioPicksAfterToggle({
      ownedModuleIds: [],
      pendingRadios: [],
      modelId: 'kenwood-th-d74',
      modelName: 'TH-D74',
      checked: true,
    });
    expect(checked.ownedModuleIds).toEqual(['kenwood-th-d74']);
    expect(checked.pendingRadios).toEqual([{ modelId: 'kenwood-th-d74', name: 'TH-D74', serialPort: '' }]);
    expect(
      onboardingPendingRadioChange(checked.pendingRadios, 'kenwood-th-d74', { serialPort: '/dev/cu.kenwood' }),
    ).toEqual([{ modelId: 'kenwood-th-d74', name: 'TH-D74', serialPort: '/dev/cu.kenwood' }]);
    expect(
      onboardingRadioPicksAfterToggle({
        ...checked,
        modelId: 'kenwood-th-d74',
        modelName: 'TH-D74',
        checked: false,
      }).pendingRadios,
    ).toEqual([]);

    const radiosStep = readFileSync('app/components/OnboardingRadiosStep.vue', 'utf8');

    expect(radiosStep).toContain('Which radios do you have?');
    expect(radiosStep).toContain('<USelect');
    expect(radiosStep).toContain('Unplugged');
    expect(radiosStep).toContain('aria-label="Refresh serial ports"');
    expect(radiosStep).not.toContain('Name it / set port');
    expect(radiosStep).not.toContain('SavedRadiosPreference');
    expect(radiosStep).not.toContain('Radio page opens these as cards');
    expect(radiosStep).not.toContain('AntennaStationPreference');
    expect(onboardingRadioOwnedIdsAfterToggle({ ownedModuleIds: [], modelId: 'kenwood-th-d74', checked: true })).toEqual([
      'kenwood-th-d74',
    ]);
  });

  it('should finish Drivers only on the desktop, for every picked model or any module', () => {
    expect(
      onboardingDriversAreDone({
        ownedModuleIds: [],
        installedModelIds: ['baofeng-uv5r'],
        desktop: false,
      }),
    ).toBe(false);
    expect(
      onboardingDriversAreDone({
        ownedModuleIds: [],
        installedModelIds: [],
        desktop: true,
      }),
    ).toBe(false);
    expect(
      onboardingDriversAreDone({
        ownedModuleIds: [],
        installedModelIds: ['baofeng-uv5r'],
        desktop: true,
      }),
    ).toBe(true);
    expect(
      onboardingDriversAreDone({
        ownedModuleIds: ['baofeng-uv5r', 'kenwood-th-d74'],
        installedModelIds: ['baofeng-uv5r'],
        desktop: true,
      }),
    ).toBe(false);
    expect(
      onboardingDriversAreDone({
        ownedModuleIds: ['baofeng-uv5r'],
        installedModelIds: ['baofeng-uv5r', 'other'],
        desktop: true,
      }),
    ).toBe(true);
  });

  it('should clear picked radios on skip and keep saved selections on other skips', () => {
    const picked = withOwnedModuleIds(createOnboardingState('active'), [' baofeng-uv5r ', 'baofeng-uv5r', '']);

    expect(picked.ownedModuleIds).toEqual(['baofeng-uv5r']);

    const skippedRadios = skipOnboardingStep(picked, 'radios');
    expect(skippedRadios.steps.radios).toBe('skipped');
    expect(skippedRadios.ownedModuleIds).toEqual([]);
    expect(skippedRadios.pendingRadios).toEqual([]);

    const skippedDrivers = skipOnboardingStep(picked, 'drivers');
    expect(skippedDrivers.steps.drivers).toBe('skipped');
    expect(skippedDrivers.ownedModuleIds).toEqual(['baofeng-uv5r']);
  });

  it('should save each pending radio on its own port once that driver is installed', () => {
    const models = [
      {
        id: 'baofeng-uv5r',
        manufacturer: 'Baofeng',
        displayName: 'UV-5R',
        baudRate: 9600,
        baudRates: [9600],
      },
      {
        id: 'kenwood-tm-d710a',
        manufacturer: 'Kenwood',
        displayName: 'TM-D710A',
        baudRate: 57600,
        baudRates: [9600, 57600],
      },
    ];
    const planned = planOnboardingSavedRadios({
      pending: [
        { modelId: 'baofeng-uv5r', name: 'UV-5R', serialPort: '/dev/cu.baofeng' },
        { modelId: 'kenwood-tm-d710a', name: 'TM-D710A', serialPort: '/dev/cu.kenwood' },
        { modelId: 'kenwood-th-d74', name: 'TH-D74', serialPort: '/dev/cu.other' },
        { modelId: 'baofeng-uv82', name: '', serialPort: '  ' },
      ],
      models,
      existing: [{ name: 'UV-5R', model: 'already' }],
    });

    expect(planned.drafts.map((draft) => draft.name)).toEqual(['UV-5R 2', 'TM-D710A']);
    expect(planned.drafts[0]).toMatchObject({ model: 'baofeng-uv5r', serialPort: '/dev/cu.baofeng', baudRate: 9600 });
    expect(planned.drafts[1]).toMatchObject({
      model: 'kenwood-tm-d710a',
      serialPort: '/dev/cu.kenwood',
      baudRate: 57600,
    });
    expect(
      planOnboardingSavedRadios({
        pending: [{ modelId: 'baofeng-uv5r', name: 'UV-5R', serialPort: '  ' }],
        models: [models[0]!],
        existing: [],
      }).drafts,
    ).toEqual([]);

    const uv5r = { id: 'radio-uv5r', name: 'UV-5R', serialPort: '/dev/cu.usb', hasConfig: true, canRead: true };
    const tmD710a = {
      id: 'radio-tmd710a',
      name: 'TM-D710A',
      serialPort: '/dev/cu.usb2',
      hasConfig: true,
      canRead: true,
    };

    expect(onboardingFinishReadPlan([])).toEqual({
      enabled: false,
      defaultOn: false,
      radios: [],
      note: 'Save a radio before this can read one.',
    });
    expect(onboardingFinishReadPlan([{ ...uv5r, hasConfig: false }])).toEqual({
      enabled: false,
      defaultOn: false,
      radios: [{
        id: 'radio-uv5r',
        name: 'UV-5R',
        serialPort: '/dev/cu.usb',
        ready: false,
        disabledReason: 'Needs a driver',
      }],
      note: 'Install a driver for UV-5R.',
    });
    expect(onboardingFinishReadPlan([{ ...uv5r, serialPort: '  ' }])).toEqual({
      enabled: false,
      defaultOn: false,
      radios: [{
        id: 'radio-uv5r',
        name: 'UV-5R',
        serialPort: '',
        ready: false,
        disabledReason: 'Needs a port',
      }],
      note: 'Set a programming port for UV-5R.',
    });
    expect(
      onboardingFinishReadPlan([
        { ...uv5r, serialPort: '' },
        { ...tmD710a, serialPort: ' ' },
      ]),
    ).toEqual({
      enabled: false,
      defaultOn: false,
      radios: [
        {
          id: 'radio-uv5r',
          name: 'UV-5R',
          serialPort: '',
          ready: false,
          disabledReason: 'Needs a port',
        },
        {
          id: 'radio-tmd710a',
          name: 'TM-D710A',
          serialPort: '',
          ready: false,
          disabledReason: 'Needs a port',
        },
      ],
      note: 'Set a programming port for UV-5R and TM-D710A.',
    });
    expect(onboardingFinishReadPlan([uv5r])).toEqual({
      enabled: true,
      defaultOn: true,
      selectedId: 'radio-uv5r',
      radios: [{ id: 'radio-uv5r', name: 'UV-5R', serialPort: '/dev/cu.usb', ready: true }],
    });
    expect(onboardingFinishReadPlan([
      { ...uv5r, hasConfig: false, canRead: false, serialPort: '' },
      tmD710a,
    ])).toEqual({
      enabled: true,
      defaultOn: true,
      selectedId: 'radio-tmd710a',
      radios: [
        {
          id: 'radio-uv5r',
          name: 'UV-5R',
          serialPort: '',
          ready: false,
          disabledReason: 'Needs a driver and a port',
        },
        { id: 'radio-tmd710a', name: 'TM-D710A', serialPort: '/dev/cu.usb2', ready: true },
      ],
    });
    expect(onboardingFinishReadPlan([uv5r, tmD710a, { ...uv5r, id: 'bare', name: 'Bare', hasConfig: false, canRead: false }])).toEqual({
      enabled: true,
      defaultOn: true,
      selectedId: 'radio-uv5r',
      radios: [
        { id: 'radio-uv5r', name: 'UV-5R', serialPort: '/dev/cu.usb', ready: true },
        { id: 'radio-tmd710a', name: 'TM-D710A', serialPort: '/dev/cu.usb2', ready: true },
        {
          id: 'bare',
          name: 'Bare',
          serialPort: '/dev/cu.usb',
          ready: false,
          disabledReason: 'Needs a driver',
        },
      ],
    });

    const stepper = readFileSync('app/components/OnboardingStepper.vue', 'utf8');
    const portDialog = readFileSync('app/components/RadioPortDialog.vue', 'utf8');
    const progressDialog = readFileSync('app/components/RadioProgressDialog.vue', 'utf8');
    const readStep = readFileSync('app/components/OnboardingReadStep.vue', 'utf8');

    expect(stepper).toContain('openCard(radioId)');
    expect(stepper).toContain('openReadFromRadio(cardId)');
    expect(stepper).toContain("finishOnboarding(completeOnboardingStep(state.value, 'read'))");
    expect(stepper).not.toContain('onboardingReadContinue');
    expect(stepper).not.toContain('refreshReadBackups');
    expect(stepper).not.toContain('z-50');
    expect(portDialog).toContain("overlay: 'z-50'");
    expect(progressDialog).toContain("overlay: 'z-50'");
    expect(progressDialog).toContain('RadioErrorDetails');
    expect(readStep).toContain('label="Read my radio when I finish"');
    expect(readStep).toContain('description="The read saves a backup before any edits."');
    expect(readStep).toContain('<USelect');
    expect(readStep).not.toContain('USelectMenu');
    expect(readStep).toContain('plan.radios.length > 1');
    expect(readStep).toContain('disabled: !radio.ready');
    expect(readStep).toContain('description: radio.disabledReason');
    expect(readStep).toContain(':disabled="!plan.enabled"');
    expect(stepper).toContain('canRead: false');
    expect(readStep).not.toContain('Read radio');
    expect(readStep).not.toContain('Go to Cable');
    expect(readStep).not.toContain('Go to Drivers');
    expect(readStep).not.toContain('Open Backups');

    expect(existsSync('app/components/OnboardingStationsStep.vue')).toBe(false);
    expect(stepper).not.toContain('OnboardingStationsStep');
    expect(stepper).not.toContain("active.value === 'stations'");
    expect(existsSync('app/components/OnboardingCableStep.vue')).toBe(false);
    expect(stepper).not.toContain('OnboardingCableStep');
    expect(stepper).not.toContain("active.value === 'cable'");
    expect(stepper).toContain('planOnboardingSavedRadios');
    expect(readStep).toContain('radio.serialPort');
    expect(stepper).toContain('v-if="!isLast"');
    expect(stepper).toContain("active.value === 'read'");
    expect(ONBOARDING_STEP_IDS).not.toContain('cable');
    expect(readStep).not.toContain('Skip stays available');
    expect(ONBOARDING_STEP_IDS).not.toContain('stations');
    expect(ONBOARDING_STEP_IDS.at(-1)).toBe('read');

    const stationEditor = readFileSync('app/components/RadioStationEditor.vue', 'utf8');

    expect(stepper).toContain('hide-save');
    expect(stepper).toContain('saveHomeStation');
    expect(stepper).toContain('homeSessionDraft');
    expect(stepper).toContain('OnboardingLicensesStep');
    expect(stepper).toContain('licenseEditor.value?.save()');
    expect(stepper).toContain('licenseSessionDraft');
    expect(stepper).not.toContain('LicensePeoplePreference');
    const skipSource = stepper.slice(stepper.indexOf('function skip()'), stepper.indexOf('function continueStep()'));
    expect(skipSource).not.toContain('licenseEditor');
    expect(skipSource).not.toContain('saveOnboardingLicense');

    const licensesStep = readFileSync('app/components/OnboardingLicensesStep.vue', 'utf8');
    const licensePreference = readFileSync('app/components/LicensePeoplePreference.vue', 'utf8');
    const preferences = readFileSync('app/pages/preferences.vue', 'utf8');

    expect(licensesStep).toContain('More people and licenses can be managed in Preferences.');
    expect(licensesStep).toContain('label="Lookup"');
    expect(licensesStep).toContain('label="Name"');
    expect(licensesStep).toContain('label="Call sign"');
    expect(licensesStep).toContain('label="License class"');
    expect(licensesStep).not.toContain('Add person');
    expect(licensesStep).not.toContain('Add amateur license');
    expect(licensesStep).not.toContain('Add GMRS license');
    expect(licensesStep).not.toContain('LicensePeoplePreference');
    expect(licensesStep).not.toContain('label="Save"');
    expect(licensePreference).toContain('Add person');
    expect(preferences).toContain('LicensePeoplePreference');
    expect(stationEditor).toContain('v-if="!hideSave"');
    expect(stationEditor).toContain(":label=\"isCreate ? 'Add' : 'Save'\"");
  });

  it('should hide onboarding license and Home errors until blur or Continue', () => {
    function templateOf(source: string): string {
      return source.slice(source.indexOf('<template>'), source.lastIndexOf('</template>'));
    }

    const licenses = readFileSync('app/components/OnboardingLicensesStep.vue', 'utf8');
    const home = readFileSync('app/components/RadioStationEditor.vue', 'utf8');
    const stepper = readFileSync('app/components/OnboardingStepper.vue', 'utf8');
    const licenseTemplate = templateOf(licenses);
    const homeTemplate = templateOf(home);

    expect(licenseTemplate).toContain('<UForm');
    expect(licenseTemplate).toContain(':validate="validateLicense"');
    expect(licenseTemplate).toContain('name="name"');
    expect(licenseTemplate).toContain('name="callSign"');
    expect(licenseTemplate).toContain('name="licenseClassId"');
    expect(licenseTemplate).not.toContain(':error=');
    expect(licenseTemplate).not.toContain('Enter a name');
    expect(licenseTemplate).not.toContain('Enter a call sign');
    expect(licenseTemplate).not.toContain('Select a license class');
    expect(licenses).toContain('await form.value.validate()');
    expect(licenses).not.toContain('showFieldErrors');

    expect(homeTemplate).toContain('<UForm');
    expect(homeTemplate).toContain(':validate="validateStation"');
    expect(homeTemplate).toContain('name="nickname"');
    expect(homeTemplate).toContain('name="gridsquare"');
    expect(homeTemplate).toContain('name="latitude"');
    expect(homeTemplate).toContain('name="longitude"');
    expect(homeTemplate).not.toContain(':error=');
    expect(homeTemplate).not.toContain('Enter a station name');
    expect(home).toContain('await form.value.validate()');
    expect(home).not.toContain('showFieldErrors');
    expect(home).not.toContain('nicknameError');

    expect(stepper).toContain('await licenseEditor.value?.save()');
    expect(stepper).toContain('await homeEditor.value?.save()');
    expect(stepper).not.toContain('licenseCanSave');
    expect(stepper).not.toContain('homeCanSave');

    const form = readFileSync('node_modules/@nuxt/ui/dist/runtime/components/Form.vue', 'utf8');
    expect(form).toContain('const errors = ref([])');
    expect(form).toContain('!(event.eager || blurredFields.has(event.name))');

    expect(onboardingLicenseFieldErrors({ name: '', callSign: '', licenseClassId: '' })).toEqual({
      name: 'Enter a name',
      callSign: 'Enter a call sign',
      licenseClassId: 'Select a license class',
    });
  });

  it('should clear the license class error when Lookup fills a valid class', async () => {
    const general = onboardingLicenseClassOptions.find((option) => option.label === 'General');
    expect(general).toBeDefined();

    const current = [
      { name: 'name', message: 'Enter a name' },
      { name: 'callSign', message: 'Enter a call sign' },
      { name: 'licenseClassId', message: 'Select a license class' },
    ];
    const values = { name: '', callSign: 'W1AW', licenseClassId: '' };
    let errors = [...current];
    const form = {
      getErrors: () => errors,
      validate: async (opts: { name: string[]; silent: true }) => {
        values.name = 'Bryan';
        values.callSign = 'W1AW';
        values.licenseClassId = general!.value;
        const fieldErrors = onboardingLicenseFieldErrors(values);
        const next = [
          fieldErrors?.name ? { name: 'name', message: fieldErrors.name } : undefined,
          fieldErrors?.callSign ? { name: 'callSign', message: fieldErrors.callSign } : undefined,
          fieldErrors?.licenseClassId ? { name: 'licenseClassId', message: fieldErrors.licenseClassId } : undefined,
        ].filter((error): error is { name: string; message: string } => error !== undefined);
        errors = shownFormErrorsAfterRevalidate(errors, next, opts.name);
      },
    };

    await revalidateShownFields(form, ['name', 'callSign', 'licenseClassId']);

    expect(errors.find((error) => error.name === 'licenseClassId')).toBeUndefined();
    expect(errors).toEqual([]);
    expect(
      shownFormErrorsAfterRevalidate(
        current,
        [{ name: 'name', message: 'Enter a name' }],
        ['name', 'callSign', 'licenseClassId'],
      ),
    ).toEqual([{ name: 'name', message: 'Enter a name' }]);

    const licenses = readFileSync('app/components/OnboardingLicensesStep.vue', 'utf8');
    const lookup = licenses.slice(licenses.indexOf('async function onLookup'), licenses.indexOf('async function save'));
    expect(lookup).toContain('state.licenseClassId =');
    expect(lookup).toContain('revalidateShownFields(form.value, licenseFields)');
    expect(licenses).toContain("const licenseFields = ['name', 'callSign', 'licenseClassId']");

    const selectMenu = readFileSync('node_modules/@nuxt/ui/dist/runtime/components/SelectMenu.vue', 'utf8');
    const onUpdate = selectMenu.slice(selectMenu.indexOf('function onUpdate'), selectMenu.indexOf('function onUpdateOpen'));
    expect(onUpdate).toContain('emitFormChange()');
    const formSource = readFileSync('node_modules/@nuxt/ui/dist/runtime/components/Form.vue', 'utf8');
    expect(formSource).toContain('return ["input", "blur", "change"]');

    const home = readFileSync('app/components/RadioStationEditor.vue', 'utf8');
    const grid = home.slice(home.indexOf('function onGridInput'), home.indexOf('function onCoordinateInput'));
    const coordinates = home.slice(home.indexOf('function onCoordinateInput'), home.indexOf('function close'));
    expect(grid).toContain('latitudeDms.value = dmsInputFromDecimal');
    expect(grid).toContain('revalidateShownFields(form.value, locationFields)');
    expect(coordinates).toContain('gridText.value = grid');
    expect(coordinates).toContain('revalidateShownFields(form.value, locationFields)');
    expect(home).toContain("const locationFields = ['gridsquare', 'latitude', 'longitude']");
  });

  it('should finish every step when its check passes', () => {
    const completion = {
      licenses: true,
      home: true,
      radios: true,
      drivers: true,
      read: true,
    };

    for (const stepId of ONBOARDING_STEP_IDS) {
      expect(onboardingStepIsDone(stepId, completion)).toBe(true);
      expect(onboardingStepIsDone(stepId, { ...completion, [stepId]: false })).toBe(false);
    }
  });

  it('should not persist an active document for a new profile while launch is off', () => {
    const draft = skipOnboardingStep(createOnboardingState('active'), 'licenses');

    expect(
      onboardingEditToPersist({
        stored: undefined,
        next: draft,
        launchNewProfiles: false,
      }),
    ).toBeUndefined();
    expect(
      onboardingEditToPersist({
        stored: undefined,
        next: draft,
        launchNewProfiles: true,
      }),
    ).toEqual(draft);
  });

  it('should keep an existing-data document completed when the guide is reopened', () => {
    const stored = createOnboardingState('completed', 'existing-data');
    const next = finishOnboarding(skipOnboardingStep(stored, 'licenses'));
    const persisted = onboardingEditToPersist({
      stored,
      next,
      launchNewProfiles: false,
    });

    expect(persisted?.status).toBe('completed');
    expect(persisted?.completedReason).toBe('existing-data');
    expect(persisted?.steps.licenses).toBe('skipped');
  });
});

describe('onboarding storage', () => {
  it('should round-trip a completed document and reject junk', () => {
    const state = withOwnedModuleIds(
      skipOnboardingStep(createOnboardingState('completed', 'existing-data'), 'drivers'),
      ['kenwood-th-f6'],
    );

    expect(parseOnboardingState(serializeOnboardingState(state))).toEqual(state);
    expect(parseOnboardingState(null)).toBeUndefined();
    expect(parseOnboardingState('{')).toBeUndefined();
    expect(parseOnboardingState('[]')).toBeUndefined();
    expect(parseOnboardingState(JSON.stringify({ version: 2, status: 'active' }))).toBeUndefined();
    expect(parseOnboardingState(JSON.stringify({ version: 1, status: 'nope' }))).toBeUndefined();
  });

  it('should fill missing steps and default an unknown completed reason', () => {
    const parsed = parseOnboardingState(
      JSON.stringify({
        version: 1,
        status: 'completed',
        steps: { licenses: 'done' },
        ownedModuleIds: ['', '  uv-5r  ', 'uv-5r'],
      }),
    );

    expect(parsed?.steps.licenses).toBe('done');
    expect(parsed?.steps.read).toBe('pending');
    expect(parsed && 'stations' in parsed.steps).toBe(false);
    expect(parsed?.completedReason).toBe('existing-data');
    expect(parsed?.ownedModuleIds).toEqual(['uv-5r']);
  });

  it('should drop a stored stations step and finish the guide when nothing else is pending', () => {
    const raw = JSON.stringify({
      version: 1,
      status: 'active',
      steps: {
        licenses: 'done',
        home: 'done',
        radios: 'skipped',
        drivers: 'done',
        cable: 'done',
        read: 'done',
        stations: 'pending',
      },
      ownedModuleIds: ['baofeng-uv5r'],
    });

    expect(onboardingStoredDocumentNeedsRewrite(raw)).toBe(true);
    const parsed = parseOnboardingState(raw);

    expect(parsed?.status).toBe('completed');
    expect(parsed?.completedReason).toBe('finished');
    expect(parsed?.steps.read).toBe('done');
    expect(parsed?.steps.radios).toBe('skipped');
    expect(parsed && 'stations' in parsed.steps).toBe(false);
    expect(parsed && 'cable' in parsed.steps).toBe(false);
    expect(parsed && onboardingHasPendingStep(parsed)).toBe(false);
    expect(serializeOnboardingState(parsed!)).not.toContain('stations');
    expect(serializeOnboardingState(parsed!)).not.toContain('cable');
    expect(parsed?.ownedModuleIds).toEqual(['baofeng-uv5r']);

    const cableOnly = JSON.stringify({
      version: 1,
      status: 'active',
      steps: {
        licenses: 'done',
        home: 'done',
        radios: 'done',
        drivers: 'done',
        cable: 'pending',
        read: 'done',
      },
      ownedModuleIds: ['baofeng-uv5r'],
      pendingRadios: [{ modelId: 'baofeng-uv5r', name: 'UV-5R', serialPort: '/dev/cu.usb' }],
    });
    const droppedCable = parseOnboardingState(cableOnly);

    expect(onboardingStoredDocumentNeedsRewrite(cableOnly)).toBe(true);
    expect(droppedCable?.status).toBe('completed');
    expect(droppedCable?.completedReason).toBe('finished');
    expect(droppedCable && 'cable' in droppedCable.steps).toBe(false);
    expect(droppedCable?.pendingRadios).toEqual([
      { modelId: 'baofeng-uv5r', name: 'UV-5R', serialPort: '/dev/cu.usb' },
    ]);

    const stillActive = JSON.stringify({
      version: 1,
      status: 'active',
      steps: { licenses: 'pending', stations: 'done' },
      ownedModuleIds: [],
    });
    const kept = parseOnboardingState(stillActive);

    expect(onboardingStoredDocumentNeedsRewrite(stillActive)).toBe(true);
    expect(kept?.status).toBe('active');
    expect(kept?.steps.licenses).toBe('pending');
    expect(kept && 'stations' in kept.steps).toBe(false);
    expect(onboardingStoredDocumentNeedsRewrite(serializeOnboardingState(createOnboardingState('active')))).toBe(false);
  });
});

