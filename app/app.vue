<template>
  <UApp>
    <div class="flex h-dvh min-h-0 flex-col overflow-hidden bg-muted text-highlighted">
      <AppHeader />
      <DriverModuleUpdateAlert />
      <EmptyCatalogBanner />
      <main class="min-h-0 flex-1 overflow-hidden">
        <NuxtPage />
      </main>
    </div>
    <RadioReadDialog />
    <RadioDirectReadDialog v-model:open="directReadOpen" @confirm="readIntoGuestCard" />
    <RadioWriteDialog />
    <RadioProgressDialog />
    <RadioModulesInstallDialog
      v-model:open="modulesDialogOpen"
      :required="modulesInstallRequired"
      @installed="onModulesInstalled"
    />
    <ChannelPrintDialog />
    <OnboardingStepper />
  </UApp>
</template>

<script setup lang="ts">
import { APP_NAME } from '~/utils/app-name';
import { memoryFileDisplayName } from '~/utils/radio-memory-file';

const {
  initialize,
  activeRadioId,
  memoryFilePath,
  modulesInstallOpen,
  modulesInstallRequired,
  refreshCatalogState,
  directReadOpen,
  readIntoGuestCard,
} = useRadio();
const { settle: settleOnboarding, shellOpen: onboardingOpen, blocksModuleInstall } = useOnboarding();
const { start: startAppUpdater } = useAppUpdater();
const router = useRouter();
const route = useRoute();

const modulesDialogOpen = computed({
  get: () => {
    if (onboardingOpen.value || !modulesInstallOpen.value) {
      return false;
    }

    if (route.path.startsWith('/wavebench')) {
      return false;
    }

    if (route.path.startsWith('/propagation')) {
      return false;
    }

    if (route.path.startsWith('/preferences')) {
      return false;
    }

    if (route.path.startsWith('/driver')) {
      return false;
    }

    if (route.path === '/' && route.query.tab === 'cat' && modulesInstallRequired.value) {
      return false;
    }

    return true;
  },
  set: (open: boolean) => {
    if (!open && onboardingOpen.value) {
      return;
    }

    modulesInstallOpen.value = open;
  },
});

watch(blocksModuleInstall, (block) => {
  if (block) {
    modulesInstallOpen.value = false;
  }
});

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
  void initialize().then(() => settleOnboarding());
  startAppUpdater();
});
</script>
