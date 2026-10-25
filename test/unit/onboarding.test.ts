import { describe, expect, it } from 'vitest';
import {
  HOME_STATION_ID,
  STATION_ANTENNA_STORAGE_KEY,
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
  createLicensePerson,
  serializeLicenseDirectory,
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
  onboardingHasExistingData,
  onboardingHasPendingStep,
  onboardingLaunchPlan,
  onboardingLocalSignals,
  onboardingStepIsDone,
  onboardingStepReached,
  parseOnboardingState,
  serializeOnboardingState,
  shouldOpenModuleInstallDialog,
  skipOnboardingStep,
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
  it('should keep new profiles from becoming active until later slices', () => {
    expect(ONBOARDING_LAUNCH_NEW_PROFILES).toBe(false);

    expect(
      onboardingLaunchPlan({
        stored: undefined,
        hasExistingData: false,
        signalsComplete: true,
        launchNewProfiles: ONBOARDING_LAUNCH_NEW_PROFILES,
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
    const finished = finishOnboarding(skipOnboardingStep(createOnboardingState('active'), 'stations'));

    expect(finished.status).toBe('completed');
    expect(finished.completedReason).toBe('finished');
    expect(finished.steps.stations).toBe('skipped');
    expect(finished.steps.licenses).toBe('pending');
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

  it('should leave every step unfinished until a later slice adds the body', () => {
    for (const stepId of ONBOARDING_STEP_IDS) {
      expect(onboardingStepIsDone(stepId)).toBe(false);
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
    expect(parsed?.steps.stations).toBe('pending');
    expect(parsed?.completedReason).toBe('existing-data');
    expect(parsed?.ownedModuleIds).toEqual(['uv-5r']);
  });
});

describe('module install dialog', () => {
  it('should stay closed while onboarding is active and stay open for everyone else', () => {
    expect(shouldOpenModuleInstallDialog({ catalogEmpty: true, onboardingStatus: undefined })).toBe(true);
    expect(shouldOpenModuleInstallDialog({ catalogEmpty: true, onboardingStatus: 'completed' })).toBe(true);
    expect(shouldOpenModuleInstallDialog({ catalogEmpty: true, onboardingStatus: 'active' })).toBe(false);
    expect(shouldOpenModuleInstallDialog({ catalogEmpty: false, onboardingStatus: undefined })).toBe(false);
  });
});
