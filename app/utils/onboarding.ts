import {
  HOME_STATION_ID,
  STATION_ANTENNA_STORAGE_KEY,
  hasStationLocation,
  parseStationAntennaStore,
  type RadioStation,
  type StationAntennaStore,
} from '~/utils/antenna-station';
import {
  LEGACY_AMATEUR_LICENSE_STORAGE_KEY,
  LEGACY_GMRS_LICENSE_STORAGE_KEY,
  LICENSE_DIRECTORY_STORAGE_KEY,
  parseLicenseDirectory,
  type LicenseDirectory,
} from '~/utils/license-people';
import { backupFileSegment, parseBackupFileName } from '~/utils/radio-image-backup';
import {
  SAVED_RADIOS_STORAGE_KEY,
  savedRadioDraftHasIssues,
  savedRadioDraftIssues,
  savedRadioNameKey,
  parseSavedRadioStore,
  type SavedRadioDraft,
} from '~/utils/saved-radios';

export const ONBOARDING_STORAGE_KEY = 'ham-radio-onboarding';

/**
 * Slice 4 can finish a new profile. Launch writes `active` and opens the guide
 * when this install has no existing station data.
 */
export const ONBOARDING_LAUNCH_NEW_PROFILES = true;

export const ONBOARDING_STEP_IDS = ['licenses', 'home', 'radios', 'drivers', 'cable', 'read', 'stations'] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStepStatus = 'pending' | 'done' | 'skipped';

export type OnboardingStatus = 'active' | 'completed';

export type OnboardingCompletedReason = 'finished' | 'existing-data';

export interface OnboardingState {
  version: 1;
  status: OnboardingStatus;
  completedReason?: OnboardingCompletedReason;
  steps: Record<OnboardingStepId, OnboardingStepStatus>;
  ownedModuleIds: string[];
}

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  title: string;
  description: string;
  icon: string;
  placeholder: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: 'licenses',
    title: 'Licenses',
    description: 'Call sign and class',
    icon: 'i-lucide-id-card',
    placeholder: 'Skipping this does not change people or call signs.',
  },
  {
    id: 'home',
    title: 'Home',
    description: 'Map and repeaters',
    icon: 'i-lucide-house',
    placeholder: 'Skipping this does not move Home.',
  },
  {
    id: 'radios',
    title: 'Radios',
    description: 'Models you own',
    icon: 'i-lucide-radio',
    placeholder: 'Skipping this does not add or remove a saved radio.',
  },
  {
    id: 'drivers',
    title: 'Drivers',
    description: 'Radio modules',
    icon: 'i-lucide-cpu',
    placeholder: 'Skipping this does not install or remove a driver.',
  },
  {
    id: 'cable',
    title: 'Cable',
    description: 'Programming port',
    icon: 'i-lucide-usb',
    placeholder: 'Skipping this does not pick a serial port or create a radio.',
  },
  {
    id: 'read',
    title: 'First read',
    description: 'Backup before edits',
    icon: 'i-lucide-archive',
    placeholder: 'Skipping this does not read a radio.',
  },
  {
    id: 'stations',
    title: 'Stations',
    description: 'Other sites',
    icon: 'i-lucide-map-pin',
    placeholder: 'Skipping this does not change stations.',
  },
];

export interface OnboardingDataSignals {
  licensePeople: number;
  licenses: number;
  legacyLicenseKeys: boolean;
  savedRadios: number;
  extraStations: number;
  antennas: number;
  homeLocated: boolean;
  installedModules: number;
  savedChannels: number;
  logQsos: number;
  backupFiles: number;
}

export interface OnboardingLaunchPlan {
  /** Written when the key should be created or replaced. Omit to leave storage alone. */
  persist?: OnboardingState;
  open: boolean;
}

interface StorageReader {
  getItem(key: string): string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pendingSteps(): Record<OnboardingStepId, OnboardingStepStatus> {
  return {
    licenses: 'pending',
    home: 'pending',
    radios: 'pending',
    drivers: 'pending',
    cable: 'pending',
    read: 'pending',
    stations: 'pending',
  };
}

export function createOnboardingState(
  status: OnboardingStatus,
  completedReason?: OnboardingCompletedReason,
): OnboardingState {
  const state: OnboardingState = {
    version: 1,
    status,
    steps: pendingSteps(),
    ownedModuleIds: [],
  };

  if (status === 'completed' && completedReason) {
    state.completedReason = completedReason;
  }

  return state;
}

export function onboardingStepIndex(stepId: OnboardingStepId): number {
  return ONBOARDING_STEP_IDS.indexOf(stepId);
}

export function firstPendingOnboardingStep(state: OnboardingState): OnboardingStepId {
  return ONBOARDING_STEP_IDS.find((stepId) => state.steps[stepId] === 'pending') ?? 'licenses';
}

export function onboardingHasPendingStep(state: OnboardingState): boolean {
  return ONBOARDING_STEP_IDS.some((stepId) => state.steps[stepId] === 'pending');
}

export function previousOnboardingStep(stepId: OnboardingStepId): OnboardingStepId | undefined {
  const index = onboardingStepIndex(stepId);
  return index > 0 ? ONBOARDING_STEP_IDS[index - 1] : undefined;
}

export function nextOnboardingStep(stepId: OnboardingStepId): OnboardingStepId | undefined {
  const index = onboardingStepIndex(stepId);
  return index >= 0 && index < ONBOARDING_STEP_IDS.length - 1 ? ONBOARDING_STEP_IDS[index + 1] : undefined;
}

/**
 * Steps the operator has not reached stay disabled. A skipped or done step stays reachable.
 */
export function onboardingStepReached(state: OnboardingState, stepId: OnboardingStepId, active: OnboardingStepId): boolean {
  const activeIndex = onboardingStepIndex(active);
  let unlockedThrough = activeIndex;

  for (const candidate of ONBOARDING_STEP_IDS) {
    if (state.steps[candidate] !== 'pending') {
      unlockedThrough = Math.max(unlockedThrough, onboardingStepIndex(candidate));
    }
  }

  return onboardingStepIndex(stepId) <= unlockedThrough;
}

export function onboardingStepperItems(
  state: OnboardingState,
  active: OnboardingStepId,
): Array<{
  title: string;
  description: string;
  icon: string;
  value: OnboardingStepId;
  slot: OnboardingStepId;
  disabled: boolean;
}> {
  return ONBOARDING_STEPS.map((step) => ({
    title: step.title,
    description: step.description,
    icon: step.icon,
    value: step.id,
    slot: step.id,
    disabled: !onboardingStepReached(state, step.id, active),
  }));
}

export interface OnboardingStepCompletion {
  licenses: boolean;
  home: boolean;
  radios: boolean;
  drivers: boolean;
  cable: boolean;
  read: boolean;
  stations: boolean;
}

/**
 * Done when the directory holds an amateur or GMRS grant, including a manual class.
 * A person with no license is not done.
 */
export function onboardingLicensesAreDone(directory: LicenseDirectory): boolean {
  return directory.licenses.some((license) => license.kind === 'amateur' || license.kind === 'gmrs');
}

/**
 * Done when Home has a grid or a real coordinate pair.
 * A license grid copied onto an empty Home counts.
 */
export function onboardingHomeIsDone(stations: readonly RadioStation[]): boolean {
  const home = stations.find((station) => station.id === HOME_STATION_ID);

  return Boolean(home && hasStationLocation(home));
}

/**
 * Done when the operator checked at least one catalog model, or a saved radio already exists.
 */
export function onboardingRadiosAreDone(input: {
  ownedModuleIds: readonly string[];
  savedRadioCount: number;
}): boolean {
  return input.ownedModuleIds.length > 0 || input.savedRadioCount > 0;
}

/**
 * Desktop only. Every picked model must be installed. With none picked, any installed module is enough.
 * The browser build cannot finish this step.
 */
export function onboardingDriversAreDone(input: {
  ownedModuleIds: readonly string[];
  installedModelIds: readonly string[];
  desktop: boolean;
}): boolean {
  if (!input.desktop) {
    return false;
  }

  if (input.ownedModuleIds.length === 0) {
    return input.installedModelIds.length > 0;
  }

  const installed = new Set(input.installedModelIds);
  return input.ownedModuleIds.every((id) => installed.has(id));
}

/**
 * Done when the selected port was in the live filtered list. A remembered or "(saved)" row does not count.
 * The browser build has no serial ports, so it cannot finish this step.
 */
export function onboardingCableIsDone(input: {
  desktop: boolean;
  selectedPort: string | undefined;
  livePorts: readonly string[];
}): boolean {
  if (!input.desktop || !input.selectedPort) {
    return false;
  }

  return input.livePorts.includes(input.selectedPort);
}

export interface OnboardingCableModel {
  id: string;
  manufacturer: string;
  displayName: string;
  baudRate: number;
  baudRates: readonly number[];
}

/**
 * Saved-radio drafts for owned models that are installed and not already saved.
 * A rejected draft returns its field error and no drafts, so nothing is written.
 */
export function planOnboardingCableRadios(input: {
  ownedModuleIds: readonly string[];
  models: readonly OnboardingCableModel[];
  existing: readonly { name: string; model: string }[];
  serialPort: string;
}): { drafts: SavedRadioDraft[]; error?: string } {
  const taken = new Set(input.existing.map((radio) => savedRadioNameKey(radio.name)));
  const named: Array<{ name: string; model: string }> = input.existing.map((radio) => ({
    name: radio.name,
    model: radio.model,
  }));
  const drafts: SavedRadioDraft[] = [];

  for (const id of input.ownedModuleIds) {
    if (named.some((radio) => radio.model === id)) {
      continue;
    }

    const model = input.models.find((entry) => entry.id === id);

    if (!model) {
      continue;
    }

    let name = model.displayName.trim() || model.id;
    let suffix = 2;

    while (taken.has(savedRadioNameKey(name))) {
      name = `${model.displayName.trim() || model.id} ${suffix}`;
      suffix += 1;
    }

    taken.add(savedRadioNameKey(name));

    const draft: SavedRadioDraft = {
      name,
      manufacturer: model.manufacturer,
      model: id,
      serialPort: input.serialPort,
      baudRate: model.baudRate,
    };
    const issues = savedRadioDraftIssues(draft, {
      radios: named.map((radio) => ({
        id: radio.model,
        name: radio.name,
        manufacturer: '',
        model: radio.model,
        serialPort: input.serialPort,
        createdAt: 0,
        updatedAt: 0,
      })),
      baudRates: model.baudRates,
    });
    const error = Object.values(issues).find((issue) => issue !== undefined);

    if (savedRadioDraftHasIssues(issues)) {
      return { drafts: [], error };
    }

    drafts.push(draft);
    named.push({ name, model: id });
  }

  return { drafts };
}

/**
 * Done when a read or pre-write backup already exists for one of the operator's models.
 */
export function onboardingReadIsDone(input: {
  fileNames: readonly string[];
  models: readonly { manufacturer: string; model: string }[];
}): boolean {
  const wanted = new Set(
    input.models.map((model) => `${backupFileSegment(model.manufacturer)}\0${backupFileSegment(model.model)}`),
  );

  if (wanted.size === 0) {
    return false;
  }

  return input.fileNames.some((fileName) => {
    const parsed = parseBackupFileName(fileName);

    if (!parsed) {
      return false;
    }

    return wanted.has(`${parsed.manufacturer}\0${parsed.model}`);
  });
}

/**
 * Done when a station other than Home exists, or any antenna is stored.
 * The default Home row alone is not done.
 */
export function onboardingStationsAreDone(input: {
  stationIds: readonly string[];
  antennaCount: number;
}): boolean {
  return input.antennaCount > 0 || input.stationIds.some((id) => id !== HOME_STATION_ID);
}

/**
 * Every step can be finished. Continue stays disabled until that step's check passes.
 */
export function onboardingStepIsDone(stepId: OnboardingStepId, completion: OnboardingStepCompletion): boolean {
  return completion[stepId];
}

/**
 * Replace the radios picked before a saved radio can exist. Blank ids are dropped.
 */
export function withOwnedModuleIds(state: OnboardingState, ids: readonly string[]): OnboardingState {
  return {
    ...state,
    ownedModuleIds: parseOwnedModuleIds(ids),
  };
}

export function skipOnboardingStep(state: OnboardingState, stepId: OnboardingStepId): OnboardingState {
  const skipped: OnboardingState = {
    ...state,
    steps: {
      ...state.steps,
      [stepId]: 'skipped',
    },
  };

  if (stepId !== 'radios') {
    return skipped;
  }

  return {
    ...skipped,
    ownedModuleIds: [],
  };
}

export function completeOnboardingStep(state: OnboardingState, stepId: OnboardingStepId): OnboardingState {
  return {
    ...state,
    steps: {
      ...state.steps,
      [stepId]: 'done',
    },
  };
}

export function finishOnboarding(state: OnboardingState): OnboardingState {
  return {
    ...state,
    status: 'completed',
    completedReason: 'finished',
  };
}

function stepStatus(value: unknown): OnboardingStepStatus {
  return value === 'done' || value === 'skipped' ? value : 'pending';
}

function parseOwnedModuleIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();

    if (trimmed && !ids.includes(trimmed)) {
      ids.push(trimmed);
    }
  }

  return ids;
}

export function parseOnboardingState(raw: string | null): OnboardingState | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || parsed.version !== 1) {
      return undefined;
    }

    if (parsed.status !== 'active' && parsed.status !== 'completed') {
      return undefined;
    }

    const steps = pendingSteps();
    const storedSteps = isRecord(parsed.steps) ? parsed.steps : {};

    for (const stepId of ONBOARDING_STEP_IDS) {
      steps[stepId] = stepStatus(storedSteps[stepId]);
    }

    const state: OnboardingState = {
      version: 1,
      status: parsed.status,
      steps,
      ownedModuleIds: parseOwnedModuleIds(parsed.ownedModuleIds),
    };

    if (parsed.status === 'completed') {
      state.completedReason = parsed.completedReason === 'finished' ? 'finished' : 'existing-data';
    }

    return state;
  } catch {
    return undefined;
  }
}

export function serializeOnboardingState(state: OnboardingState): string {
  const stored: Record<string, unknown> = {
    version: state.version,
    status: state.status,
    steps: state.steps,
    ownedModuleIds: state.ownedModuleIds,
  };

  if (state.status === 'completed' && state.completedReason) {
    stored.completedReason = state.completedReason;
  }

  return JSON.stringify(stored);
}

export function readOnboardingState(): OnboardingState | undefined {
  if (!import.meta.client) {
    return undefined;
  }

  try {
    return parseOnboardingState(localStorage.getItem(ONBOARDING_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function readOnboardingStatus(): OnboardingStatus | undefined {
  return readOnboardingState()?.status;
}

export function writeOnboardingState(state: OnboardingState): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(ONBOARDING_STORAGE_KEY, serializeOnboardingState(state));
}

export function emptyOnboardingDataSignals(): OnboardingDataSignals {
  return {
    licensePeople: 0,
    licenses: 0,
    legacyLicenseKeys: false,
    savedRadios: 0,
    extraStations: 0,
    antennas: 0,
    homeLocated: false,
    installedModules: 0,
    savedChannels: 0,
    logQsos: 0,
    backupFiles: 0,
  };
}

export function stationOnboardingSignals(store: StationAntennaStore): Pick<
  OnboardingDataSignals,
  'extraStations' | 'antennas' | 'homeLocated'
> {
  const home = store.stations.find((station) => station.id === HOME_STATION_ID);

  return {
    extraStations: store.stations.filter((station) => station.id !== HOME_STATION_ID).length,
    antennas: store.antennas.length,
    homeLocated: home ? hasStationLocation(home) : false,
  };
}

function legacyKeyPresent(raw: string | null): boolean {
  return raw !== null && raw.trim().length > 0;
}

/**
 * Signals that live in localStorage. The default empty Home station is not data.
 */
export function onboardingLocalSignals(storage: StorageReader): Pick<
  OnboardingDataSignals,
  'licensePeople' | 'licenses' | 'legacyLicenseKeys' | 'savedRadios' | 'extraStations' | 'antennas' | 'homeLocated'
> {
  const directory = parseLicenseDirectory(storage.getItem(LICENSE_DIRECTORY_STORAGE_KEY));
  const stations = stationOnboardingSignals(parseStationAntennaStore(storage.getItem(STATION_ANTENNA_STORAGE_KEY)));

  return {
    licensePeople: directory.people.length,
    licenses: directory.licenses.length,
    legacyLicenseKeys:
      legacyKeyPresent(storage.getItem(LEGACY_AMATEUR_LICENSE_STORAGE_KEY)) ||
      legacyKeyPresent(storage.getItem(LEGACY_GMRS_LICENSE_STORAGE_KEY)),
    savedRadios: parseSavedRadioStore(storage.getItem(SAVED_RADIOS_STORAGE_KEY)).radios.length,
    ...stations,
  };
}

export function onboardingHasExistingData(signals: OnboardingDataSignals): boolean {
  return (
    signals.licensePeople > 0 ||
    signals.licenses > 0 ||
    signals.legacyLicenseKeys ||
    signals.savedRadios > 0 ||
    signals.extraStations > 0 ||
    signals.antennas > 0 ||
    signals.homeLocated ||
    signals.installedModules > 0 ||
    signals.savedChannels > 0 ||
    signals.logQsos > 0 ||
    signals.backupFiles > 0
  );
}

/**
 * Decide what launch should write and whether the shell opens by itself.
 *
 * An incomplete probe (database or backup listing failed) never starts a new
 * profile. Existing local data can still be marked `existing-data`.
 */
export function onboardingLaunchPlan(input: {
  stored: OnboardingState | undefined;
  hasExistingData: boolean;
  signalsComplete: boolean;
  launchNewProfiles: boolean;
}): OnboardingLaunchPlan {
  if (input.stored?.status === 'completed') {
    return { open: false };
  }

  if (input.stored?.status === 'active') {
    return { open: true };
  }

  if (input.hasExistingData) {
    return {
      persist: createOnboardingState('completed', 'existing-data'),
      open: false,
    };
  }

  if (!input.signalsComplete || !input.launchNewProfiles) {
    return { open: false };
  }

  return {
    persist: createOnboardingState('active'),
    open: true,
  };
}

/**
 * Persist a Skip / Finish edit without creating `active` for a new profile
 * before `launchNewProfiles` is on. A completed document keeps its reason.
 */
export function onboardingEditToPersist(input: {
  stored: OnboardingState | undefined;
  next: OnboardingState;
  launchNewProfiles: boolean;
}): OnboardingState | undefined {
  if (!input.stored) {
    return input.launchNewProfiles ? input.next : undefined;
  }

  if (input.stored.status === 'completed') {
    return {
      ...input.next,
      status: 'completed',
      completedReason: input.stored.completedReason ?? 'existing-data',
    };
  }

  return input.next;
}
