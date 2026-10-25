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
    description: 'Optional',
    icon: 'i-lucide-map-pin',
    placeholder: 'Finish keeps Home. Another station or an antenna is optional.',
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

export interface OnboardingRadioSavedDetail {
  id: string;
  name: string;
  serialPort: string;
  baudRate?: number;
}

export interface OnboardingRadioChoice {
  id: string;
  name: string;
  checked: boolean;
  saved: OnboardingRadioSavedDetail[];
  /** Name and port can be set only after this checked model has a driver and a port, and no saved radio yet. */
  canName: boolean;
}

export interface OnboardingRadioGroup {
  manufacturer: string;
  radios: OnboardingRadioChoice[];
}

/**
 * Checkbox ids for the Radios step. Unchecking removes the id from the owned list and does not touch saved radios.
 */
export function onboardingRadioOwnedIdsAfterToggle(input: {
  ownedModuleIds: readonly string[];
  modelId: string;
  checked: boolean;
}): string[] {
  const next = new Set(input.ownedModuleIds.map((id) => id.trim()).filter((id) => id.length > 0));
  const modelId = input.modelId.trim();

  if (!modelId) {
    return [...next];
  }

  if (input.checked) {
    next.add(modelId);
  } else {
    next.delete(modelId);
  }

  return [...next];
}

/**
 * One manufacturer list for the Radios step. A saved radio stays checked even when it is not in `ownedModuleIds`.
 */
export function onboardingRadioGroups(input: {
  models: readonly { id: string; manufacturer: string; name: string }[];
  ownedModuleIds: readonly string[];
  saved: readonly {
    id: string;
    name: string;
    manufacturer: string;
    model: string;
    serialPort: string;
    baudRate?: number;
  }[];
  installedModelIds: readonly string[];
  hasPort: boolean;
}): OnboardingRadioGroup[] {
  const owned = new Set(input.ownedModuleIds.map((id) => id.trim()).filter((id) => id.length > 0));
  const installed = new Set(input.installedModelIds);
  const savedByModel = new Map<string, OnboardingRadioSavedDetail[]>();

  for (const radio of input.saved) {
    const detail: OnboardingRadioSavedDetail = {
      id: radio.id,
      name: radio.name,
      serialPort: radio.serialPort,
    };

    if (radio.baudRate !== undefined) {
      detail.baudRate = radio.baudRate;
    }

    const list = savedByModel.get(radio.model) ?? [];
    list.push(detail);
    savedByModel.set(radio.model, list);
  }

  const seen = new Set<string>();
  const buckets = new Map<string, Array<{ id: string; name: string }>>();
  const manufacturers: string[] = [];

  function addModel(manufacturer: string, id: string, name: string): void {
    if (!id || seen.has(id)) {
      return;
    }

    seen.add(id);
    let radios = buckets.get(manufacturer);

    if (!radios) {
      radios = [];
      buckets.set(manufacturer, radios);
      manufacturers.push(manufacturer);
    }

    radios.push({ id, name });
  }

  for (const model of input.models) {
    addModel(model.manufacturer, model.id.trim(), model.name);
  }

  for (const radio of input.saved) {
    addModel(radio.manufacturer, radio.model, radio.name);
  }

  return manufacturers.map((manufacturer) => ({
    manufacturer,
    radios: (buckets.get(manufacturer) ?? []).map((model) => {
      const saved = savedByModel.get(model.id) ?? [];
      const checked = owned.has(model.id) || saved.length > 0;

      return {
        id: model.id,
        name: model.name,
        checked,
        saved,
        canName: checked && saved.length === 0 && installed.has(model.id) && input.hasPort,
      };
    }),
  }));
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

export interface OnboardingReadModel {
  id: string;
  name: string;
  serialPort: string;
  hasConfig: boolean;
}

export type OnboardingReadContinueResult =
  | { action: 'advance' }
  | { action: 'read'; radioId: string; name: string; serialPort: string }
  | { action: 'blocked'; reason: 'desktop' | 'backups' | 'driver' | 'port'; name?: string };

/**
 * Continue opens the read dialog, moves on when a backup already exists, or explains the missing piece.
 * It does not fail closed with no message.
 */
export function onboardingReadContinue(input: {
  desktop: boolean;
  backupsEnabled: boolean;
  hasBackup: boolean;
  models: readonly OnboardingReadModel[];
}): OnboardingReadContinueResult {
  if (input.hasBackup) {
    return { action: 'advance' };
  }

  if (!input.desktop) {
    return { action: 'blocked', reason: 'desktop' };
  }

  if (!input.backupsEnabled) {
    return { action: 'blocked', reason: 'backups' };
  }

  const readable = input.models.find((model) => model.hasConfig && model.serialPort.trim().length > 0);

  if (readable) {
    return {
      action: 'read',
      radioId: readable.id,
      name: readable.name,
      serialPort: readable.serialPort,
    };
  }

  const missingDriver = input.models.find((model) => !model.hasConfig);

  if (missingDriver) {
    return { action: 'blocked', reason: 'driver', name: missingDriver.name };
  }

  return { action: 'blocked', reason: 'port' };
}

/**
 * Done when a read or pre-write backup already exists for one of the operator's models.
 */
export function onboardingReadIsDone(input: {
  fileNames: readonly string[];
  models: readonly { manufacturer: string; model: string }[];
}): boolean {
  const wanted = new Set(
    input.models.map(
      (model) => `${backupFileSegment(model.manufacturer).toLowerCase()}\0${backupFileSegment(model.model).toLowerCase()}`,
    ),
  );

  if (wanted.size === 0) {
    return false;
  }

  return input.fileNames.some((fileName) => {
    const parsed = parseBackupFileName(fileName.trim().split(/[\\/]/).pop() ?? '');

    if (!parsed || (parsed.kind !== 'read' && parsed.kind !== 'prewrite')) {
      return false;
    }

    return wanted.has(`${parsed.manufacturer.toLowerCase()}\0${parsed.model.toLowerCase()}`);
  });
}

/**
 * Home alone finishes this step. Another station or an antenna is optional, so Finish stays enabled.
 */
export function onboardingStationsAreDone(): boolean {
  return true;
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
