<script setup lang="ts">
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const route = useRoute();
const { importOpen, openMemoryFile, saveMemoryFile } = useRadio();

const isPreferences = computed(() => route.path.startsWith('/preferences'));
const showBrowserFileActions = ref(false);

onMounted(() => {
  showBrowserFileActions.value = !isTauriRuntime();
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
    </div>

    <div v-if="!isPreferences" class="flex items-center gap-1.5">
      <template v-if="showBrowserFileActions">
        <UButton
          icon="i-lucide-folder-open"
          color="neutral"
          variant="outline"
          size="sm"
          label="Open Memory"
          @click="openMemoryFile"
        />
        <UButton
          icon="i-lucide-save"
          color="neutral"
          variant="outline"
          size="sm"
          label="Save Memory"
          @click="saveMemoryFile"
        />
        <UButton
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          size="sm"
          label="Import From Radio"
          @click="importOpen = true"
        />
      </template>
      <UTooltip text="Preferences">
        <UButton icon="i-lucide-settings" color="neutral" variant="ghost" to="/preferences" aria-label="Preferences" />
      </UTooltip>
    </div>
  </header>
</template>
