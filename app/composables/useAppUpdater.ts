import { ConsoleTransport, LogLayer } from 'loglayer';
import type { Update } from '@tauri-apps/plugin-updater';
import { APP_NAME } from '~/utils/app-name';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import {
  DEFAULT_UPDATE_CHECK_INTERVAL_MS,
  readAppUpdateSettings,
  writeAppUpdateSettings,
} from '~/utils/app-update-settings';
import { shouldCheckForAppUpdate, updateDownloadPercent, type UpdateCheckReason } from '~/utils/app-update-policy';

export type AppUpdaterStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: 'debug',
    }),
  ],
});

const STARTUP_CHECK_DELAY_MS = 2_500;
const POLL_TICK_MS = 15 * 60 * 1000;
const UPDATE_TOAST_ID = 'app-update';

let pendingUpdate: Update | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

function isPackagedDesktopApp(): boolean {
  return isTauriRuntime() && !import.meta.dev;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Check GitHub Releases for a newer signed installer, download it in the
 * background, and prompt to restart. Never relaunches on its own so a radio
 * transfer is not interrupted.
 */
export function useAppUpdater() {
  const toast = useToast();
  const status = useState<AppUpdaterStatus>('app-updater-status', () => 'idle');
  const autoUpdateEnabled = useState('app-updater-auto-enabled', () => true);
  const currentVersion = useState('app-updater-current-version', () => '');
  const availableVersion = useState<string | undefined>('app-updater-available-version', () => undefined);
  const downloadPercent = useState('app-updater-download-percent', () => 0);
  const lastError = useState<string | undefined>('app-updater-last-error', () => undefined);
  const lastCheckAt = useState<string | undefined>('app-updater-last-check', () => undefined);

  function persist(): void {
    writeAppUpdateSettings({
      autoUpdateEnabled: autoUpdateEnabled.value,
      lastCheckAt: lastCheckAt.value,
    });
  }

  function loadSettings(): void {
    const settings = readAppUpdateSettings();
    autoUpdateEnabled.value = settings.autoUpdateEnabled;
    lastCheckAt.value = settings.lastCheckAt;
  }

  function showReadyToast(version: string): void {
    toast.add({
      id: UPDATE_TOAST_ID,
      title: `${APP_NAME} ${version} is ready`,
      description: 'Restart to finish installing the update. Do not restart in the middle of a radio transfer.',
      icon: 'i-lucide-download',
      color: 'primary',
      duration: 0,
      actions: [
        {
          label: 'Restart',
          color: 'primary',
          onClick: () => {
            void applyUpdateAndRelaunch();
          },
        },
      ],
    });
  }

  async function loadCurrentVersion(): Promise<void> {
    if (!isTauriRuntime() || currentVersion.value) {
      return;
    }

    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      currentVersion.value = await getVersion();
    } catch (cause) {
      logger.withError(cause).warn('Failed to read app version');
    }
  }

  async function checkForUpdate(reason: UpdateCheckReason = 'manual'): Promise<void> {
    loadSettings();

    if (!isPackagedDesktopApp()) {
      if (reason === 'manual') {
        toast.add({
          title: 'Updates are unavailable',
          description: 'Automatic updates run in packaged desktop builds, not in development.',
          icon: 'i-lucide-info',
          color: 'neutral',
        });
      }

      return;
    }

    if (
      !shouldCheckForAppUpdate({
        reason,
        autoUpdateEnabled: autoUpdateEnabled.value,
        lastCheckAt: lastCheckAt.value,
        now: new Date(),
        intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
        inFlight: status.value === 'checking' || status.value === 'downloading',
        readyToRestart: status.value === 'ready' && pendingUpdate !== undefined,
      })
    ) {
      if (reason === 'manual' && status.value === 'ready' && availableVersion.value) {
        showReadyToast(availableVersion.value);
      }

      return;
    }

    status.value = 'checking';
    lastError.value = undefined;
    downloadPercent.value = 0;

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: 30_000 });
      lastCheckAt.value = new Date().toISOString();
      persist();

      if (!update) {
        availableVersion.value = undefined;
        status.value = 'idle';

        if (reason === 'manual') {
          toast.add({
            title: "You're up to date",
            description: currentVersion.value ? `${APP_NAME} ${currentVersion.value} is the latest version.` : 'No update is available.',
            icon: 'i-lucide-check',
            color: 'success',
          });
        }

        logger.info('No application update available');
        return;
      }

      if (pendingUpdate && pendingUpdate.version !== update.version) {
        await pendingUpdate.close().catch(() => undefined);
      }

      pendingUpdate = update;
      availableVersion.value = update.version;
      status.value = 'downloading';
      logger.withMetadata({ version: update.version, currentVersion: update.currentVersion }).info('Downloading application update');

      let downloaded = 0;
      let contentLength = 0;

      await update.download((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
          downloaded = 0;
        }

        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
        }

        downloadPercent.value = updateDownloadPercent({ downloaded, contentLength });
      });

      status.value = 'ready';
      downloadPercent.value = 100;
      showReadyToast(update.version);
    } catch (cause) {
      status.value = 'error';
      lastError.value = errorMessage(cause);
      lastCheckAt.value = new Date().toISOString();
      persist();
      logger.withError(cause).error('Application update check failed');

      if (reason === 'manual') {
        toast.add({
          title: 'Could not check for updates',
          description: lastError.value,
          icon: 'i-lucide-alert-circle',
          color: 'error',
        });
      }
    }
  }

  async function applyUpdateAndRelaunch(): Promise<void> {
    if (!pendingUpdate) {
      return;
    }

    try {
      await pendingUpdate.install();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (cause) {
      lastError.value = errorMessage(cause);
      status.value = 'error';
      logger.withError(cause).error('Failed to install application update');
      toast.add({
        title: 'Could not install update',
        description: lastError.value,
        icon: 'i-lucide-alert-circle',
        color: 'error',
      });
    }
  }

  function setAutoUpdateEnabled(enabled: boolean): void {
    autoUpdateEnabled.value = enabled;
    persist();

    if (enabled) {
      void checkForUpdate('startup');
    }
  }

  function start(): void {
    if (started) {
      return;
    }

    started = true;
    loadSettings();
    void loadCurrentVersion();

    if (!isPackagedDesktopApp()) {
      return;
    }

    startupTimer = setTimeout(() => {
      void checkForUpdate('startup');
    }, STARTUP_CHECK_DELAY_MS);

    pollTimer = setInterval(() => {
      void checkForUpdate('interval');
    }, POLL_TICK_MS);
  }

  function stop(): void {
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = undefined;
    }

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }

    started = false;
  }

  return {
    status,
    autoUpdateEnabled,
    currentVersion,
    availableVersion,
    downloadPercent,
    lastError,
    lastCheckAt,
    isPackagedDesktopApp,
    start,
    stop,
    checkForUpdate,
    applyUpdateAndRelaunch,
    setAutoUpdateEnabled,
  };
}
