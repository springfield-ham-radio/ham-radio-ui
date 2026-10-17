<script setup lang="ts">
import {
  channelLibraryFileExportRows,
  channelLibraryFileImportSources,
} from '~/importExport/channel-file-catalog';
import type { ImportExportAvailabilityContext } from '~/importExport/types';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  context: ImportExportAvailabilityContext;
  exportScopeSummary: string;
  pendingId?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();

const activeTab = shallowRef<'import' | 'export'>('import');

const tabItems = [
  { label: 'Import', value: 'import', icon: 'i-lucide-file-up' },
  { label: 'Export', value: 'export', icon: 'i-lucide-file-down' },
];

const importRows = computed(() => channelLibraryFileImportSources(props.context));
const exportRows = computed(() => channelLibraryFileExportRows(props.context));

watch(open, (isOpen) => {
  if (isOpen) {
    activeTab.value = 'import';
  }
});

function choose(id: string, available: boolean): void {
  if (!available || props.pendingId) {
    return;
  }

  emit('select', id);
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import / Export"
    description="Move channel library files. Read from Radio and Write to Radio stay on the Radio menu."
    modal
    dismissible
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <UTabs v-model="activeTab" :items="tabItems" class="w-full" />
        <p v-if="activeTab === 'export'" class="text-sm text-muted">{{ exportScopeSummary }}</p>
        <ul class="divide-y divide-default overflow-hidden rounded-lg ring-1 ring-default">
          <li
            v-for="row in activeTab === 'import' ? importRows : exportRows"
            :key="row.id"
            class="bg-default"
          >
            <UButton
              color="neutral"
              variant="ghost"
              class="h-auto w-full justify-start rounded-none px-3 py-3 text-left"
              :disabled="!row.available || Boolean(pendingId)"
              :loading="pendingId === row.id"
              @click="choose(row.id, row.available)"
            >
              <span class="flex min-w-0 flex-1 items-start gap-3">
                <UIcon :name="row.icon" class="mt-0.5 size-4 shrink-0 text-muted" />
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-highlighted">{{ row.label }}</span>
                  <span v-if="row.description" class="mt-0.5 block text-xs text-muted">{{ row.description }}</span>
                  <span v-if="!row.available && row.reason" class="mt-1 block text-xs text-warning">{{ row.reason }}</span>
                </span>
              </span>
            </UButton>
          </li>
        </ul>
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Close" @click="close" />
    </template>
  </UModal>
</template>
