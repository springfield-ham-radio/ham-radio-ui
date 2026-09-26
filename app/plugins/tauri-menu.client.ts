import { readDeveloperMode } from '~/utils/developer-mode';
import { ZOOM_BY_COMMAND, wheelZoomMultiplier, zoomCommandForKey } from '~/utils/zoom';

export default defineNuxtPlugin(() => {
  const router = useRouter();
  const { openImportFromRadio, openWriteToRadio, openMemoryFile, saveMemoryFile, saveMemoryFileAs } = useRadio();
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
        void openMemoryFile();
      });
      await listen('save-memory', () => {
        void saveMemoryFile();
      });
      await listen('save-memory-as', () => {
        void saveMemoryFileAs();
      });
      await listen('import-from-radio', () => {
        void router.push('/');
        openImportFromRadio();
      });
      await listen('write-to-radio', () => {
        void router.push('/');
        openWriteToRadio();
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
