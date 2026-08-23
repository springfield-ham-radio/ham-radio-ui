<script setup lang="ts">
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { memoryFileDisplayName } from '~/utils/radio-memory-file';

const route = useRoute();
const { importOpen, openWriteToRadio, openMemoryFile, saveMemoryFile, saveMemoryFileAs, activeRadioId, memoryFilePath } = useRadio();

const isPreferences = computed(() => route.path.startsWith('/preferences'));
const showBrowserFileActions = ref(false);
const currentFileName = computed(() => {
  return memoryFilePath.value ? memoryFileDisplayName(memoryFilePath.value) : undefined;
});

onMounted(() => {
  showBrowserFileActions.value = !isTauriRuntime();
});

defineShortcuts({
  meta_o: {
    usingInput: true,
    handler: () => {
      if (showBrowserFileActions.value && !isPreferences.value) {
        void openMemoryFile();
      }
    },
  },
  meta_s: {
    usingInput: true,
    handler: () => {
      if (showBrowserFileActions.value && !isPreferences.value) {
        void saveMemoryFile();
      }
    },
  },
  meta_shift_s: {
    usingInput: true,
    handler: () => {
      if (showBrowserFileActions.value && !isPreferences.value) {
        void saveMemoryFileAs();
      }
    },
  },
});
</script>

<template>
  <header class="flex items-center justify-between border-b border-default bg-default px-3 py-2">
    <div class="flex min-w-0 items-center gap-1">
      <UButton
        v-if="isPreferences"
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        to="/"
        aria-label="Back"
      />
      <h1 class="truncate px-1 text-sm font-semibold text-highlighted">
        {{ isPreferences ? 'Preferences' : 'Ham Radio' }}
      </h1>
      <UTooltip
        v-if="!isPreferences && activeRadioId"
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
      <UTooltip v-if="!isPreferences && currentFileName" :text="memoryFilePath">
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

    <div v-if="!isPreferences" class="flex items-center gap-1.5">
      <template v-if="showBrowserFileActions">
        <UButton
          icon="i-lucide-folder-open"
          color="neutral"
          variant="outline"
          size="sm"
          label="Open"
          @click="openMemoryFile"
        />
        <UButton
          icon="i-lucide-save"
          color="neutral"
          variant="outline"
          size="sm"
          label="Save"
          @click="saveMemoryFile"
        />
        <UButton
          icon="i-lucide-save-all"
          color="neutral"
          variant="outline"
          size="sm"
          label="Save As"
          @click="saveMemoryFileAs"
        />
        <UButton
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          size="sm"
          label="Import From Radio"
          @click="importOpen = true"
        />
        <UButton
          icon="i-lucide-upload"
          color="neutral"
          variant="outline"
          size="sm"
          label="Write To Radio"
          @click="openWriteToRadio"
        />
      </template>
      <UTooltip text="Preferences">
        <UButton icon="i-lucide-settings" color="neutral" variant="ghost" to="/preferences" aria-label="Preferences" />
      </UTooltip>
    </div>
  </header>
</template>
