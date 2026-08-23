<template>
  <UApp>
    <div class="flex h-full flex-col bg-muted text-highlighted">
      <AppHeader />
      <main class="min-h-0 flex-1">
        <NuxtPage />
      </main>
    </div>
    <RadioImportDialog />
    <RadioWriteDialog />
    <RadioProgressDialog />
  </UApp>
</template>

<script setup lang="ts">
import { memoryFileDisplayName } from '~/utils/radio-memory-file';

const { initialize, activeRadioId, memoryFilePath } = useRadio();
const router = useRouter();

useHead({
  titleTemplate: (title) => (title && title !== 'Ham Radio' ? `${title} · Ham Radio` : 'Ham Radio'),
  title: computed(() => {
    const radioName = activeRadioId.value?.name;
    const fileName = memoryFilePath.value ? memoryFileDisplayName(memoryFilePath.value) : undefined;

    if (fileName && radioName) {
      return `${fileName} · ${radioName}`;
    }

    return radioName ?? 'Ham Radio';
  }),
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
