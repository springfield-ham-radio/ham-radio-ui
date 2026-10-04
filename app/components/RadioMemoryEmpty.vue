<script setup lang="ts">
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { useImportExportRunner } from '~/importExport/runner';

const { entry, run } = useImportExportRunner();
const readFromRadio = entry(IMPORT_EXPORT_IDS.readFromRadio);
const openMemory = entry(IMPORT_EXPORT_IDS.openMemory);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
    <p class="text-sm text-muted">Open a memory file or read from a radio to get started.</p>
    <div class="flex flex-wrap items-center justify-center gap-2">
      <UButton
        :icon="readFromRadio.icon"
        color="primary"
        :label="readFromRadio.label"
        @click="run(readFromRadio.id)"
      />
      <UButton
        :icon="openMemory.icon"
        color="neutral"
        variant="outline"
        :label="openMemory.label"
        @click="run(openMemory.id)"
      />
    </div>
  </div>
</template>
