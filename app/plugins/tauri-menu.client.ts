import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { runImportExport } from '~/importExport/registry';
import { showRadioImageBackups } from '~/utils/radio-image-backup-io';
import { readDeveloperMode } from '~/utils/developer-mode';
import { ZOOM_BY_COMMAND, wheelZoomMultiplier, zoomCommandForKey } from '~/utils/zoom';

export default defineNuxtPlugin(() => {
  const router = useRouter();
  const toast = useToast();
  const { checkForUpdate } = useAppUpdater();
  const { setEnabled: setDeveloperMode } = useDeveloperMode();

  void (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const { invoke } = await import('@tauri-apps/api/core');
      await listen<boolean>('developer-mode-changed', (event) => {
        const checked = event.payload === true;
        setDeveloperMode(checked);

        if (checked) {
          void router.push('/driver');
          return;
        }

        if (router.currentRoute.value.path.startsWith('/driver')) {
          void router.push('/');
        }
      });
      try {
        await invoke('set_developer_mode', { enabled: readDeveloperMode() });
      } catch {
        // The desktop shell is an older build that does not have the View menu command yet.
      }
      await listen('open-preferences', () => {
        void router.push('/preferences');
      });
      await listen('check-for-updates', () => {
        void checkForUpdate('manual');
      });
      await listen('open-memory', () => {
        void router.push('/');
        void runImportExport(IMPORT_EXPORT_IDS.openMemory);
      });
      await listen('save-memory', () => {
        void runImportExport(IMPORT_EXPORT_IDS.saveMemory);
      });
      await listen('save-memory-as', () => {
        void runImportExport(IMPORT_EXPORT_IDS.saveMemoryAs);
      });
      await listen('read-from-radio', () => {
        void router.push('/');
        void runImportExport(IMPORT_EXPORT_IDS.readFromRadio);
      });
      await listen('write-to-radio', () => {
        void router.push('/');
        void runImportExport(IMPORT_EXPORT_IDS.writeToRadio);
      });
      await listen('show-backups', () => {
        void showRadioImageBackups().catch((cause: unknown) => {
          const message = cause instanceof Error ? cause.message : 'Failed to open the backup folder';
          toast.add({
            title: 'Could not open backups',
            description: message,
            color: 'error',
            icon: 'i-lucide-circle-alert',
          });
        });
      });
      window.addEventListener('keydown', (event) => {
        const command = zoomCommandForKey(event);
        if (!command) {
          return;
        }

        event.preventDefault();
        void invoke(command);
      });
      window.addEventListener(
        'wheel',
        (event) => {
          if (!event.ctrlKey || event.deltaY === 0) {
            return;
          }

          event.preventDefault();
          void invoke(ZOOM_BY_COMMAND, { multiplier: wheelZoomMultiplier(event.deltaY) });
        },
        { passive: false },
      );
    } catch {
      // Running in a browser without the Tauri runtime.
    }
  })();
});
