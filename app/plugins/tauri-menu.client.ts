export default defineNuxtPlugin(() => {
  const router = useRouter();
  const { importOpen, openMemoryFile, saveMemoryFile } = useRadio();

  void (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen('open-preferences', () => {
        void router.push('/preferences');
      });
      await listen('open-memory', () => {
        void router.push('/');
        void openMemoryFile();
      });
      await listen('save-memory', () => {
        void saveMemoryFile();
      });
      await listen('import-from-radio', () => {
        void router.push('/');
        importOpen.value = true;
      });
    } catch {
      // Running in a browser without the Tauri runtime.
    }
  })();
});
