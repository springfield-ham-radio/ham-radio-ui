export default defineNuxtPlugin(() => {
  const router = useRouter();
  const { importOpen, openWriteToRadio, openMemoryFile, saveMemoryFile, saveMemoryFileAs } = useRadio();
  const { checkForUpdate } = useAppUpdater();

  void (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
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
        importOpen.value = true;
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
