import {
  ONBOARDING_LAUNCH_NEW_PROFILES,
  createOnboardingState,
  onboardingEditToPersist,
  onboardingHasExistingData,
  onboardingLaunchPlan,
  onboardingLocalSignals,
  readOnboardingState,
  writeOnboardingState,
  type OnboardingState,
} from '~/utils/onboarding';
import { listRadioCatalogRecords } from '~/utils/radio-catalog-db';
import { listRadioImageBackups } from '~/utils/radio-image-backup-io';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { listSavedChannels } from '~/utils/saved-channels-db';
import { listStationLogQsos } from '~/utils/station-log-db';

interface RemoteCounts {
  installedModules: number;
  savedChannels: number;
  logQsos: number;
  backupFiles: number;
  complete: boolean;
}

async function countOf(load: () => Promise<unknown[]>): Promise<{ count: number; ok: boolean }> {
  try {
    const rows = await load();
    return { count: rows.length, ok: true };
  } catch {
    return { count: 0, ok: false };
  }
}

/**
 * Desktop rows that mean this install is already in use.
 * Outside the desktop app those stores do not exist, so the counts are zero.
 */
async function readRemoteCounts(): Promise<RemoteCounts> {
  if (!isTauriRuntime()) {
    const modules = await countOf(listRadioCatalogRecords);

    return {
      installedModules: modules.count,
      savedChannels: 0,
      logQsos: 0,
      backupFiles: 0,
      complete: modules.ok,
    };
  }

  const [modules, channels, qsos, backups] = await Promise.all([
    countOf(listRadioCatalogRecords),
    countOf(listSavedChannels),
    countOf(listStationLogQsos),
    countOf(listRadioImageBackups),
  ]);

  return {
    installedModules: modules.count,
    savedChannels: channels.count,
    logQsos: qsos.count,
    backupFiles: backups.count,
    complete: modules.ok && channels.ok && qsos.ok && backups.ok,
  };
}

let settlePromise: Promise<void> | undefined;

/**
 * First-run guide state shared by the shell and Preferences.
 *
 * `persisted` is the document on disk. `session` is what the open shell edits.
 * A new profile is not written as `active` while launch is disabled.
 */
export function useOnboarding() {
  const persisted = useState<OnboardingState | undefined>('onboarding-persisted', () => undefined);
  const session = useState<OnboardingState | undefined>('onboarding-session', () => undefined);
  const shellOpen = useState('onboarding-shell-open', () => false);
  const settled = useState('onboarding-settled', () => false);

  const view = computed(() => session.value ?? persisted.value);
  const blocksModuleInstall = computed(() => persisted.value?.status === 'active');
  const persistsEdits = computed(() => persisted.value !== undefined);

  function applyEdit(next: OnboardingState): void {
    session.value = next;
    const toWrite = onboardingEditToPersist({
      stored: persisted.value,
      next,
      launchNewProfiles: ONBOARDING_LAUNCH_NEW_PROFILES,
    });

    if (!toWrite) {
      return;
    }

    writeOnboardingState(toWrite);
    persisted.value = toWrite;
  }

  function reopen(): void {
    session.value = persisted.value
      ? {
          ...persisted.value,
          steps: { ...persisted.value.steps },
          ownedModuleIds: [...persisted.value.ownedModuleIds],
          pendingRadios: persisted.value.pendingRadios.map((radio) => ({ ...radio })),
        }
      : createOnboardingState('active');
    shellOpen.value = true;
  }

  function close(): void {
    shellOpen.value = false;
    session.value = undefined;
  }

  async function settle(): Promise<void> {
    if (!import.meta.client) {
      return;
    }

    if (settlePromise) {
      await settlePromise;
      return;
    }

    settlePromise = settleOnce();
    await settlePromise;
  }

  async function settleOnce(): Promise<void> {
    const stored = readOnboardingState();
    const local = onboardingLocalSignals(localStorage);
    const remote = await readRemoteCounts();
    const plan = onboardingLaunchPlan({
      stored,
      hasExistingData: onboardingHasExistingData({
        ...local,
        installedModules: remote.installedModules,
        savedChannels: remote.savedChannels,
        logQsos: remote.logQsos,
        backupFiles: remote.backupFiles,
      }),
      signalsComplete: remote.complete,
      launchNewProfiles: ONBOARDING_LAUNCH_NEW_PROFILES,
    });

    if (plan.persist) {
      writeOnboardingState(plan.persist);
      persisted.value = plan.persist;
    } else {
      persisted.value = stored;
    }

    if (plan.open && !shellOpen.value) {
      session.value = persisted.value;
      shellOpen.value = true;
    }

    settled.value = true;
  }

  return {
    persisted,
    session,
    view,
    shellOpen,
    settled,
    blocksModuleInstall,
    persistsEdits,
    applyEdit,
    reopen,
    close,
    settle,
  };
}
