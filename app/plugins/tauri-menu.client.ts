export default defineNuxtPlugin(() => {
  const router = useRouter();

  void (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen('open-preferences', () => {
        void router.push('/preferences');
      });
    } catch {
      // Running in a browser without the Tauri runtime.
    }
  })();
});
