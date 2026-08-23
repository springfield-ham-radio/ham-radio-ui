<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import type { TableColumn } from '@nuxt/ui';
import { formatFrequencyMHz } from '~/utils/channel-edit';
import { formatSavedTone, type SavedChannel } from '~/utils/saved-channels-db';

useHead({ title: 'Channels' });

const { filteredChannels, isLoading, error, search, refresh, createChannel, updateChannel, removeChannel } =
  useSavedChannels();

const editorOpen = ref(false);
const editingChannel = ref<SavedChannel | undefined>();

const columns: TableColumn<SavedChannel>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => row.original.name || '—',
  },
  {
    id: 'transmit',
    header: 'TX',
    cell: ({ row }) => formatFrequencyMHz(row.original.transmitFrequency),
  },
  {
    id: 'receive',
    header: 'RX',
    cell: ({ row }) => formatFrequencyMHz(row.original.receiveFrequency),
  },
  {
    id: 'txTone',
    header: 'TX Tone',
    cell: ({ row }) => formatSavedTone(row.original.transmitTone),
  },
  {
    id: 'rxTone',
    header: 'RX Tone',
    cell: ({ row }) => formatSavedTone(row.original.receiveTone),
  },
  {
    id: 'actions',
    header: '',
  },
];

function openCreate(): void {
  editingChannel.value = undefined;
  editorOpen.value = true;
}

function openEdit(channel: SavedChannel): void {
  editingChannel.value = channel;
  editorOpen.value = true;
}

async function onSave(payload: {
  channel: RadioChannel;
  notes?: string;
  id?: SavedChannel['id'];
}): Promise<void> {
  try {
    if (payload.id) {
      await updateChannel({
        id: payload.id,
        name: payload.channel.name,
        transmitFrequency: payload.channel.transmitFrequency,
        receiveFrequency: payload.channel.receiveFrequency,
        transmitTone: payload.channel.transmitTone,
        receiveTone: payload.channel.receiveTone,
        notes: payload.notes,
        createdAt: editingChannel.value?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await createChannel(payload.channel, payload.notes);
    }

    editorOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  }
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="flex h-full flex-col gap-3 px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">Channel library</h2>
        <p class="text-xs text-muted">Reusable portable channels stored in the app database.</p>
      </div>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        size="sm"
        label="Add channel"
        class="shrink-0"
        @click="openCreate"
      />
    </div>

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search by name or frequency"
      size="sm"
      class="w-full max-w-sm"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load channel library"
      :description="error"
    />

    <div class="min-h-0 flex-1 overflow-auto">
      <UTable
        :data="filteredChannels"
        :columns="columns"
        :loading="isLoading"
        sticky
        class="max-h-full"
        :ui="{
          thead: 'bg-default',
          th: 'h-8 px-2 py-0 text-sm font-medium bg-default',
          td: 'h-8 px-2 py-0 text-xs tabular-nums align-middle',
          empty: 'py-8 text-center text-sm text-muted',
          tr: 'cursor-pointer',
        }"
        empty="No saved channels yet. Add one here, or save memory channels from the Radio page."
        @select="(row) => openEdit(row.original)"
      >
        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-0.5" @click.stop>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Edit saved channel"
              @click="openEdit(row.original)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Delete saved channel"
              @click="removeChannel(row.original.id)"
            />
          </div>
        </template>
      </UTable>
    </div>

    <SavedChannelEditor v-model:open="editorOpen" :channel="editingChannel" @save="onSave" />
  </div>
</template>
