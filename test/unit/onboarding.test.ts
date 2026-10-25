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
import {
  ONBOARDING_LAUNCH_NEW_PROFILES,
  ONBOARDING_STEP_IDS,
  completeOnboardingStep,
  createOnboardingState,
  emptyOnboardingDataSignals,
  finishOnboarding,
  firstPendingOnboardingStep,
  onboardingEditToPersist,
  onboardingCableIsDone,
  onboardingDriversAreDone,
  onboardingHasExistingData,
  onboardingHasPendingStep,
  onboardingHomeIsDone,
  onboardingRadioGroups,
  onboardingRadioOwnedIdsAfterToggle,
  onboardingRadiosAreDone,
  onboardingReadContinue,
  onboardingReadIsDone,
  onboardingStoredDocumentNeedsRewrite,
  planOnboardingCableRadios,
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
        installedModelIds: ['baofeng-uv5r'],
        hasPort: true,
      })[0]?.radios[0],
    ).toMatchObject({
      id: 'baofeng-uv5r',
      checked: true,
      canName: false,
      saved: [{ id: 'radio-1', name: 'Handheld', serialPort: '/dev/cu.usb', baudRate: 9600 }],
    });
    expect(
      onboardingRadioGroups({
        models,
        ownedModuleIds: ['kenwood-th-d74'],
        saved: [],
        installedModelIds: ['kenwood-th-d74'],
        hasPort: true,
      })[1]?.radios[0],
    ).toMatchObject({ id: 'kenwood-th-d74', checked: true, canName: true, saved: [] });
    expect(
      onboardingRadioGroups({
        models,
        ownedModuleIds: ['kenwood-th-d74'],
        saved: [],
        installedModelIds: [],
        hasPort: true,
      })[1]?.radios[0]?.canName,
    ).toBe(false);
    expect(
      onboardingRadioGroups({
        models: [],
        ownedModuleIds: [],
        saved: [savedUv5r],
        installedModelIds: [],
        hasPort: false,
      }),
    ).toEqual([
      {
        manufacturer: 'Baofeng',
        radios: [
          {
            id: 'baofeng-uv5r',
            name: 'Handheld',
            checked: true,
            canName: false,
            saved: [{ id: 'radio-1', name: 'Handheld', serialPort: '/dev/cu.usb', baudRate: 9600 }],
          },
        ],
      },
    ]);

    const radiosStep = readFileSync('app/components/OnboardingRadiosStep.vue', 'utf8');

    expect(radiosStep).toContain('Which radios do you have?');
    expect(radiosStep).toContain('Name it / set port');
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

    const skippedDrivers = skipOnboardingStep(picked, 'drivers');
    expect(skippedDrivers.steps.drivers).toBe('skipped');
    expect(skippedDrivers.ownedModuleIds).toEqual(['baofeng-uv5r']);
  });

  it('should finish the cable and read steps from live data', () => {
    expect(onboardingCableIsDone({ desktop: false, selectedPort: '/dev/cu.usb', livePorts: ['/dev/cu.usb'] })).toBe(false);
    expect(onboardingCableIsDone({ desktop: true, selectedPort: '/dev/cu.saved', livePorts: ['/dev/cu.usb'] })).toBe(false);
    expect(onboardingCableIsDone({ desktop: true, selectedPort: '/dev/cu.usb', livePorts: ['/dev/cu.usb'] })).toBe(true);

    const planned = planOnboardingCableRadios({
      ownedModuleIds: ['baofeng-uv5r', 'kenwood-th-d74', 'missing'],
      models: [
        {
          id: 'baofeng-uv5r',
          manufacturer: 'Baofeng',
          displayName: 'UV-5R',
          baudRate: 9600,
          baudRates: [9600],
        },
        {
          id: 'kenwood-th-d74',
          manufacturer: 'Kenwood',
          displayName: 'UV-5R',
          baudRate: 9600,
          baudRates: [9600, 19200],
        },
      ],
      existing: [{ name: 'UV-5R', model: 'already' }],
      serialPort: '/dev/cu.usb',
    });

    expect(planned.error).toBeUndefined();
    expect(planned.drafts.map((draft) => draft.name)).toEqual(['UV-5R 2', 'UV-5R 3']);
    expect(planned.drafts[0]).toMatchObject({ model: 'baofeng-uv5r', serialPort: '/dev/cu.usb', baudRate: 9600 });
    expect(
      planOnboardingCableRadios({
        ownedModuleIds: ['baofeng-uv5r'],
        models: [
          { id: 'baofeng-uv5r', manufacturer: 'Baofeng', displayName: 'UV-5R', baudRate: 9600, baudRates: [9600] },
        ],
        existing: [],
        serialPort: '  ',
      }).error,
    ).toBe('Choose a default serial port');

    expect(
      onboardingReadIsDone({
        fileNames: ['Baofeng_baofeng-uv5r_20261024-215009_read.img'],
        models: [{ manufacturer: 'Baofeng', model: 'baofeng-uv5r' }],
      }),
    ).toBe(true);
    expect(
      onboardingReadIsDone({
        fileNames: ['backups/Baofeng_baofeng-uv5r_20261024-215009_read.img'],
        models: [{ manufacturer: 'baofeng', model: 'Baofeng-UV5R' }],
      }),
    ).toBe(true);
    expect(
      onboardingReadIsDone({
        fileNames: ['Baofeng_baofeng-uv5r_20261024-215009_read.img'],
        models: [{ manufacturer: 'Baofeng', model: 'UV-5R' }],
      }),
    ).toBe(false);
    expect(
      onboardingReadIsDone({
        fileNames: ['Baofeng_baofeng-uv5r_20261025-120000_prewrite.img'],
        models: [{ manufacturer: 'Kenwood', model: 'th-d74' }],
      }),
    ).toBe(false);
    expect(onboardingReadIsDone({ fileNames: [], models: [] })).toBe(false);

    const ready = { id: 'radio-1', name: 'UV-5R', serialPort: '/dev/cu.usb', hasConfig: true };

    expect(
      onboardingReadContinue({
        desktop: true,
        backupsEnabled: true,
        hasBackup: false,
        models: [ready],
      }),
    ).toEqual({ action: 'read', radioId: 'radio-1', name: 'UV-5R', serialPort: '/dev/cu.usb' });
    expect(
      onboardingReadContinue({
        desktop: false,
        backupsEnabled: false,
        hasBackup: true,
        models: [],
      }),
    ).toEqual({ action: 'advance' });
    expect(
      onboardingReadContinue({ desktop: false, backupsEnabled: true, hasBackup: false, models: [ready] }),
    ).toEqual({ action: 'blocked', reason: 'desktop' });
    expect(
      onboardingReadContinue({ desktop: true, backupsEnabled: false, hasBackup: false, models: [ready] }),
    ).toEqual({ action: 'blocked', reason: 'backups' });
    expect(
      onboardingReadContinue({
        desktop: true,
        backupsEnabled: true,
        hasBackup: false,
        models: [{ ...ready, hasConfig: false }],
      }),
    ).toEqual({ action: 'blocked', reason: 'driver', name: 'UV-5R' });
    expect(
      onboardingReadContinue({
        desktop: true,
        backupsEnabled: true,
        hasBackup: false,
        models: [{ ...ready, serialPort: '  ' }],
      }),
    ).toEqual({ action: 'blocked', reason: 'port' });
    expect(
      onboardingReadContinue({ desktop: true, backupsEnabled: true, hasBackup: false, models: [] }),
    ).toEqual({ action: 'blocked', reason: 'port' });

    const stepper = readFileSync('app/components/OnboardingStepper.vue', 'utf8');
    const portDialog = readFileSync('app/components/RadioPortDialog.vue', 'utf8');
    const progressDialog = readFileSync('app/components/RadioProgressDialog.vue', 'utf8');
    const readStep = readFileSync('app/components/OnboardingReadStep.vue', 'utf8');

    expect(stepper).toContain('openReadFromRadio(decision.radioId)');
    expect(stepper).toContain('readAttempted.value = true');
    expect(stepper).not.toContain('z-50');
    expect(portDialog).toContain("overlay: 'z-50'");
    expect(progressDialog).toContain("overlay: 'z-50'");
    expect(readStep).toContain('Go to Cable');
    expect(readStep).toContain('Go to Drivers');
    expect(readStep).toContain('Open Backups');

    expect(existsSync('app/components/OnboardingStationsStep.vue')).toBe(false);
    expect(stepper).not.toContain('OnboardingStationsStep');
    expect(stepper).not.toContain("active.value === 'stations'");
    expect(stepper).toContain('v-if="!isLast"');
    expect(stepper).toContain("active.value === 'read'");
    expect(stepper).toContain('finishOnboarding(marked)');
    expect(readStep).toContain('label="Read radio"');
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

  it('should finish every step when its check passes', () => {
    const completion = {
      licenses: true,
      home: true,
      radios: true,
      drivers: true,
      cable: true,
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
    const state = skipOnboardingStep(createOnboardingState('completed', 'existing-data'), 'cable');
    state.ownedModuleIds = ['kenwood-th-f6'];

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
    expect(parsed && onboardingHasPendingStep(parsed)).toBe(false);
    expect(serializeOnboardingState(parsed!)).not.toContain('stations');
    expect(parsed?.ownedModuleIds).toEqual(['baofeng-uv5r']);

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

