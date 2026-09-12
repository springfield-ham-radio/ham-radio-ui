<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { APP_NAME } from '~/utils/app-name';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { memoryFileDisplayName } from '~/utils/radio-memory-file';

const route = useRoute();
const router = useRouter();
const { openMemoryFile, saveMemoryFile, saveMemoryFileAs, activeRadioId, memoryFilePath } = useRadio();

const isPreferences = computed(() => route.path.startsWith('/preferences'));
const isRadioPage = computed(() => route.path === '/');
const showBrowserFileActions = ref(false);
const currentFileName = computed(() => {
  return memoryFilePath.value ? memoryFileDisplayName(memoryFilePath.value) : undefined;
});

const sectionItems = computed<TabsItem[]>(() => [
  { label: 'Radio', icon: 'i-lucide-radio', value: 'radio' },
  { label: 'Channels', icon: 'i-lucide-library', value: 'channels' },
  { label: 'Log', icon: 'i-lucide-notebook-pen', value: 'log' },
  { label: 'WaveBench', icon: 'i-lucide-audio-waveform', value: 'wavebench' },
]);

const activeSection = computed({
  get: () => {
    if (route.path.startsWith('/channels')) {
      return 'channels';
    }

    if (route.path.startsWith('/log')) {
      return 'log';
    }

    if (route.path.startsWith('/wavebench')) {
      return 'wavebench';
    }

    return 'radio';
  },
  set: (value: string | number) => {
    if (value === 'channels') {
      void router.push('/channels');
      return;
    }

    if (value === 'log') {
      void router.push('/log');
      return;
    }

    if (value === 'wavebench') {
      void router.push('/wavebench');
      return;
    }

    void router.push('/');
  },
});

onMounted(() => {
  showBrowserFileActions.value = !isTauriRuntime();
});

defineShortcuts({
  meta_o: {
    usingInput: true,
    handler: () => {
      if (showBrowserFileActions.value && isRadioPage.value) {
        void openMemoryFile();
      }
    },
  },
  meta_s: {
    usingInput: true,
    handler: () => {
      if (showBrowserFileActions.value && isRadioPage.value) {
        void saveMemoryFile();
      }
    },
  },
  meta_shift_s: {
    usingInput: true,
    handler: () => {
      if (showBrowserFileActions.value && isRadioPage.value) {
        void saveMemoryFileAs();
      }
    },
  },
});
</script>

<template>
  <header class="relative flex shrink-0 items-center justify-between border-b border-default bg-default px-3 py-2">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <UButton
        v-if="isPreferences"
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        to="/"
        aria-label="Back"
      />
      <h1 class="truncate px-1 text-sm font-semibold text-highlighted">
        {{ isPreferences ? 'Preferences' : APP_NAME }}
      </h1>
      <UTooltip
        v-if="isRadioPage && activeRadioId"
        :text="`${activeRadioId.manufacturer} · ${activeRadioId.model}`"
      >
        <UBadge
          :label="activeRadioId.name"
          color="neutral"
          variant="subtle"
          size="sm"
          icon="i-lucide-radio"
          class="max-w-56 truncate"
        />
      </UTooltip>
      <UTooltip v-if="isRadioPage && currentFileName" :text="memoryFilePath">
        <UBadge
          :label="currentFileName"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-file"
          class="max-w-56 truncate"
        />
      </UTooltip>
    </div>

    <div
      v-if="!isPreferences"
      class="pointer-events-none absolute inset-x-0 flex justify-center"
    >
      <UTabs
        v-model="activeSection"
        :items="sectionItems"
        :content="false"
        color="primary"
        variant="pill"
        size="sm"
        class="pointer-events-auto w-auto"
        :ui="{
          list: 'w-auto',
          trigger: 'grow-0 data-[state=active]:text-highlighted',
          leadingIcon: 'text-current',
          indicator: 'bg-primary/35 shadow-none',
        }"
      />
    </div>

    <div v-if="!isPreferences" class="flex flex-1 items-center justify-end gap-1.5">
      <UTooltip text="Preferences">
        <UButton icon="i-lucide-settings" color="neutral" variant="ghost" to="/preferences" aria-label="Preferences" />
      </UTooltip>
    </div>
  </header>
</template>
