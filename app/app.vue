<template>
  <UApp>
    <div class="flex h-dvh min-h-0 flex-col overflow-hidden bg-muted text-highlighted">
      <AppHeader />
      <main class="min-h-0 flex-1 overflow-hidden">
        <NuxtPage />
      </main>
    </div>
    <RadioImportDialog />
    <RadioWriteDialog />
    <RadioProgressDialog />
    <RadioModulesInstallDialog
      v-model:open="modulesInstallOpen"
      :required="modulesInstallRequired"
      @installed="onModulesInstalled"
    />
  </UApp>
</template>

<script setup lang="ts">
import { APP_NAME } from '~/utils/app-name';
import { memoryFileDisplayName } from '~/utils/radio-memory-file';

const { initialize, activeRadioId, memoryFilePath, modulesInstallOpen, modulesInstallRequired, refreshCatalogState } =
  useRadio();
const { start: startAppUpdater } = useAppUpdater();
const router = useRouter();

useHead({
  titleTemplate: (title) => (title && title !== APP_NAME ? `${title} · ${APP_NAME}` : APP_NAME),
  title: computed(() => {
    const radioName = activeRadioId.value?.name;
    const fileName = memoryFilePath.value ? memoryFileDisplayName(memoryFilePath.value) : undefined;

    if (fileName && radioName) {
      return `${fileName} · ${radioName}`;
    }

    return radioName ?? APP_NAME;
  }),
});

defineShortcuts({
  'meta_,': () => {
    void router.push('/preferences');
  },
});

async function onModulesInstalled(): Promise<void> {
  modulesInstallRequired.value = false;
  await refreshCatalogState();
}

onMounted(() => {
  void initialize();
  startAppUpdater();
});
</script>
