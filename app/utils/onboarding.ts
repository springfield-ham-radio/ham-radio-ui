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

export const ONBOARDING_STEP_IDS = ['licenses', 'home', 'radios', 'read'] as const;

/** Step ids removed from the guide. Stored documents may still name them. */
const REMOVED_ONBOARDING_STEP_IDS = ['stations', 'cable', 'drivers'] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStepStatus = 'pending' | 'done' | 'skipped';

export type OnboardingStatus = 'active' | 'completed';

export type OnboardingCompletedReason = 'finished' | 'existing-data';

/** Name and port chosen for a catalog model before its driver can create a saved radio. */
export interface OnboardingPendingRadio {
  modelId: string;
  name: string;
  serialPort: string;
}

export interface OnboardingState {
  version: 1;
  status: OnboardingStatus;
  completedReason?: OnboardingCompletedReason;
  steps: Record<OnboardingStepId, OnboardingStepStatus>;
  ownedModuleIds: string[];
  pendingRadios: OnboardingPendingRadio[];
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
    id: 'read',
    title: 'First read',
    description: 'Backup before edits',
    icon: 'i-lucide-archive',
    placeholder: 'Finish closes the guide. A read is optional.',
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
    read: 'pending',
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
    pendingRadios: [],
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
  read: boolean;
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
}): OnboardingRadioGroup[] {
  const owned = new Set(input.ownedModuleIds.map((id) => id.trim()).filter((id) => id.length > 0));
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
      };
    }),
  }));
}

export interface OnboardingDriverInstallPlan {
  /** Checked models that already have a driver. Continue skips these. */
  installed: string[];
  /** Checked models to download from the official catalog. */
  install: string[];
  /** Checked models that are not installed and are not in the catalog. */
  missing: string[];
}

/**
 * Continue installs the latest catalog driver for every checked model that does not already have one.
 * A model that is already installed is skipped. A model missing from the catalog cannot be installed.
 */
export function planOnboardingDriverInstalls(input: {
  modelIds: readonly string[];
  installedModelIds: readonly string[];
  catalogModelIds: readonly string[];
}): OnboardingDriverInstallPlan {
  const installed = new Set(input.installedModelIds);
  const catalog = new Set(input.catalogModelIds);
  const plan: OnboardingDriverInstallPlan = { installed: [], install: [], missing: [] };

  for (const modelId of input.modelIds) {
    const id = modelId.trim();

    if (!id || plan.installed.includes(id) || plan.install.includes(id) || plan.missing.includes(id)) {
      continue;
    }

    if (installed.has(id)) {
      plan.installed.push(id);
    } else if (catalog.has(id)) {
      plan.install.push(id);
    } else {
      plan.missing.push(id);
    }
  }

  return plan;
}

export interface OnboardingSavedRadioModel {
  id: string;
  manufacturer: string;
  displayName: string;
  baudRate: number;
  baudRates: readonly number[];
}

/**
 * Saved-radio drafts for pending models whose driver is installed and whose own port is set.
 * A model with no port, or no driver yet, stays pending. Each radio keeps its own port.
 */
export function planOnboardingSavedRadios(input: {
  pending: readonly OnboardingPendingRadio[];
  models: readonly OnboardingSavedRadioModel[];
  existing: readonly { name: string; model: string }[];
}): { drafts: SavedRadioDraft[] } {
  const taken = new Set(input.existing.map((radio) => savedRadioNameKey(radio.name)));
  const named: Array<{ name: string; model: string }> = input.existing.map((radio) => ({
    name: radio.name,
    model: radio.model,
  }));
  const drafts: SavedRadioDraft[] = [];

  for (const pending of input.pending) {
    const port = pending.serialPort.trim();

    if (!port || named.some((radio) => radio.model === pending.modelId)) {
      continue;
    }

    const model = input.models.find((entry) => entry.id === pending.modelId);

    if (!model) {
      continue;
    }

    const base = pending.name.trim() || model.displayName.trim() || pending.modelId;
    let name = base;
    let suffix = 2;

    while (taken.has(savedRadioNameKey(name))) {
      name = `${base} ${suffix}`;
      suffix += 1;
    }

    taken.add(savedRadioNameKey(name));

    const draft: SavedRadioDraft = {
      name,
      manufacturer: model.manufacturer,
      model: pending.modelId,
      serialPort: port,
      baudRate: model.baudRate,
    };
    const issues = savedRadioDraftIssues(draft, {
      radios: named.map((radio) => ({
        id: radio.model,
        name: radio.name,
        manufacturer: '',
        model: radio.model,
        serialPort: port,
        createdAt: 0,
        updatedAt: 0,
      })),
      baudRates: model.baudRates,
    });

    if (savedRadioDraftHasIssues(issues)) {
      continue;
    }

    drafts.push(draft);
    named.push({ name, model: pending.modelId });
  }

  return { drafts };
}

export interface OnboardingFinishReadRadio {
  id: string;
  name: string;
  serialPort: string;
  hasConfig: boolean;
  /** Saved radio Finish can open. A pending model is only a note. */
  canRead: boolean;
}

export interface OnboardingFinishReadChoice {
  id: string;
  name: string;
  serialPort: string;
  ready: boolean;
  /** Shown on a disabled row: missing driver, missing port, or both. */
  disabledReason?: string;
}

export interface OnboardingFinishReadPlan {
  enabled: boolean;
  defaultOn: boolean;
  /** First radio that can be read. The select starts here. */
  selectedId?: string;
  radios: OnboardingFinishReadChoice[];
  note?: string;
}

function englishRadioList(names: readonly string[]): string {
  const clean = names.map((name) => name.trim()).filter((name) => name.length > 0);

  if (clean.length <= 1) {
    return clean[0] ?? '';
  }

  if (clean.length === 2) {
    return `${clean[0]} and ${clean[1]}`;
  }

  return `${clean.slice(0, -1).join(', ')}, and ${clean.at(-1)}`;
}

function finishReadDisabledReason(model: OnboardingFinishReadRadio): string | undefined {
  const missingDriver = !model.hasConfig;
  const missingPort = model.serialPort.trim().length === 0;
  const ready = model.canRead && !missingDriver && !missingPort;

  if (ready) {
    return undefined;
  }

  if (missingDriver && missingPort) {
    return 'Needs a driver and a port';
  }

  if (missingDriver) {
    return 'Needs a driver';
  }

  if (missingPort) {
    return 'Needs a port';
  }

  return 'Not saved yet';
}

/**
 * Every checked or saved radio is listed. One that is missing a driver or a port stays
 * in the list but cannot be chosen. The switch is on only when at least one radio can be read.
 */
export function onboardingFinishReadPlan(models: readonly OnboardingFinishReadRadio[]): OnboardingFinishReadPlan {
  const radios: OnboardingFinishReadChoice[] = models.map((model) => {
    const serialPort = model.serialPort.trim();
    const disabledReason = finishReadDisabledReason(model);
    const choice: OnboardingFinishReadChoice = {
      id: model.id,
      name: model.name,
      serialPort,
      ready: disabledReason === undefined,
    };

    if (disabledReason) {
      choice.disabledReason = disabledReason;
    }

    return choice;
  });
  const ready = radios.filter((radio) => radio.ready);
  const missingPort = models.filter((model) => model.hasConfig && model.serialPort.trim().length === 0);
  const missingDriver = models.filter((model) => !model.hasConfig);
  const note = ready.length > 0
    ? undefined
    : missingPort.length > 0
      ? `Set a programming port for ${englishRadioList(missingPort.map((model) => model.name))}.`
      : missingDriver.length > 0
        ? `Install a driver for ${englishRadioList(missingDriver.map((model) => model.name))}.`
        : 'Save a radio before this can read one.';

  return {
    enabled: ready.length > 0,
    defaultOn: ready.length > 0,
    ...(ready[0] ? { selectedId: ready[0].id } : {}),
    radios,
    ...(note ? { note } : {}),
  };
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
  const ownedModuleIds = parseOwnedModuleIds(ids);

  return {
    ...state,
    ownedModuleIds,
    pendingRadios: pendingRadiosForOwned(ownedModuleIds, state.pendingRadios),
  };
}

/**
 * Check or uncheck a catalog model. Unchecking drops its pending name and port and does not delete a saved radio.
 */
export function onboardingRadioPicksAfterToggle(input: {
  ownedModuleIds: readonly string[];
  pendingRadios: readonly OnboardingPendingRadio[];
  modelId: string;
  modelName: string;
  checked: boolean;
}): { ownedModuleIds: string[]; pendingRadios: OnboardingPendingRadio[] } {
  const ownedModuleIds = onboardingRadioOwnedIdsAfterToggle({
    ownedModuleIds: input.ownedModuleIds,
    modelId: input.modelId,
    checked: input.checked,
  });
  const modelId = input.modelId.trim();
  const pendingRadios = ownedModuleIds.map((id) => {
    const current = input.pendingRadios.find((radio) => radio.modelId === id);

    if (current) {
      return current;
    }

    return {
      modelId: id,
      name: id === modelId ? input.modelName.trim() : '',
      serialPort: '',
    };
  });

  return { ownedModuleIds, pendingRadios };
}

/** Replace the name or port stored for one pending model. */
export function onboardingPendingRadioChange(
  pendingRadios: readonly OnboardingPendingRadio[],
  modelId: string,
  patch: { name?: string; serialPort?: string },
): OnboardingPendingRadio[] {
  return pendingRadios.map((radio) => {
    if (radio.modelId !== modelId) {
      return radio;
    }

    return {
      modelId: radio.modelId,
      name: patch.name !== undefined ? patch.name : radio.name,
      serialPort: patch.serialPort !== undefined ? patch.serialPort : radio.serialPort,
    };
  });
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
    pendingRadios: [],
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

function pendingRadiosForOwned(
  ownedModuleIds: readonly string[],
  pendingRadios: readonly OnboardingPendingRadio[],
): OnboardingPendingRadio[] {
  return ownedModuleIds.map((modelId) => {
    const current = pendingRadios.find((radio) => radio.modelId === modelId);

    return current ?? { modelId, name: '', serialPort: '' };
  });
}

function parsePendingRadios(value: unknown, ownedModuleIds: readonly string[]): OnboardingPendingRadio[] {
  const stored: OnboardingPendingRadio[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry) || typeof entry.modelId !== 'string') {
        continue;
      }

      const modelId = entry.modelId.trim();

      if (!modelId || stored.some((radio) => radio.modelId === modelId)) {
        continue;
      }

      stored.push({
        modelId,
        name: typeof entry.name === 'string' ? entry.name.trim() : '',
        serialPort: typeof entry.serialPort === 'string' ? entry.serialPort.trim() : '',
      });
    }
  }

  return pendingRadiosForOwned(ownedModuleIds, stored);
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
    const hadRemovedStep = REMOVED_ONBOARDING_STEP_IDS.some((stepId) => stepId in storedSteps);

    for (const stepId of ONBOARDING_STEP_IDS) {
      steps[stepId] = stepStatus(storedSteps[stepId]);
    }

    const ownedModuleIds = parseOwnedModuleIds(parsed.ownedModuleIds);
    const state: OnboardingState = {
      version: 1,
      status: parsed.status,
      steps,
      ownedModuleIds,
      pendingRadios: parsePendingRadios(parsed.pendingRadios, ownedModuleIds),
    };

    if (parsed.status === 'completed') {
      state.completedReason = parsed.completedReason === 'finished' ? 'finished' : 'existing-data';
    } else if (hadRemovedStep && !onboardingHasPendingStep(state)) {
      state.status = 'completed';
      state.completedReason = 'finished';
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
    pendingRadios: state.pendingRadios,
  };

  if (state.status === 'completed' && state.completedReason) {
    stored.completedReason = state.completedReason;
  }

  return JSON.stringify(stored);
}

/**
 * True when a stored document still names a removed step, such as `stations`, `cable`, or `drivers`.
 * Reading that document drops the step, and this says the rewritten document should be saved.
 */
export function onboardingStoredDocumentNeedsRewrite(raw: string | null): boolean {
  if (!raw) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || !isRecord(parsed.steps)) {
      return false;
    }

    return REMOVED_ONBOARDING_STEP_IDS.some((stepId) => stepId in parsed.steps);
  } catch {
    return false;
  }
}

export function readOnboardingState(): OnboardingState | undefined {
  if (!import.meta.client) {
    return undefined;
  }

  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    const state = parseOnboardingState(raw);

    if (state && onboardingStoredDocumentNeedsRewrite(raw)) {
      writeOnboardingState(state);
    }

    return state;
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
