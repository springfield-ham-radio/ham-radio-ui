import { readDeveloperMode } from '~/utils/developer-mode';

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
    } catch {
      // Running in a browser without the Tauri runtime.
    }
  })();
});
