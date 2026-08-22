<template>
  <UApp>
    <div class="flex h-full flex-col bg-muted text-highlighted">
      <AppHeader />
      <main class="min-h-0 flex-1">
        <NuxtPage />
      </main>
    </div>
    <RadioImportDialog />
    <RadioProgressDialog />
  </UApp>
</template>

<script setup lang="ts">
const { initialize } = useRadio();
const router = useRouter();

useHead({
  titleTemplate: (title) => (title && title !== 'Ham Radio' ? `${title} · Ham Radio` : 'Ham Radio'),
  title: 'Ham Radio',
});

defineShortcuts({
  'meta_,': () => {
    void router.push('/preferences');
  },
});

onMounted(() => {
  void initialize();
});
</script>
