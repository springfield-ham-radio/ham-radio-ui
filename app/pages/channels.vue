<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import type { TableColumn, TableRow } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';
import {
  assignLibraryChannelsToSlots,
  availableChannelNumbers,
  channelCapacity,
  formatFrequencyMHz,
} from '~/utils/channel-edit';
import { formatSavedTone, type SavedChannel } from '~/utils/saved-channels-db';
import { bandNameForFrequency } from '~/utils/transmit-privileges';

useHead({ title: 'Channels' });

const UCheckbox = resolveComponent('UCheckbox');

const {
  filteredChannels,
  isLoading,
  error,
  search,
  refresh,
  createChannel,
  updateChannel,
  removeChannel,
  exportLibraryCsv,
  importLibraryCsv,
} = useSavedChannels();
const { program, memory, settingsMemoryMap, activeRadioId, addChannels } = useRadio();

const isExporting = ref(false);
const isImporting = ref(false);
const isAddingToRadio = ref(false);
const editorOpen = ref(false);
const editingChannel = ref<SavedChannel | undefined>();
const addToRadioOpen = ref(false);
const rowSelection = ref<Record<string, boolean>>({});

interface DisplaySavedChannel extends SavedChannel {
  band: string;
}

const displayChannels = computed<DisplaySavedChannel[]>(() => {
  return filteredChannels.value.map((channel) => ({
    ...channel,
    band: bandNameForFrequency(channel.transmitFrequency),
  }));
});

const selectedLibraryChannels = computed(() => {
  const selected = new Set(
    Object.entries(rowSelection.value)
      .filter(([, isSelected]) => isSelected)
      .map(([id]) => id),
  );

  return displayChannels.value.filter((channel) => selected.has(String(channel.id)));
});

const selectedCount = computed(() => selectedLibraryChannels.value.length);
const occupiedChannelNumbers = computed(() => program.value?.channels.map((channel) => channel.channelNumber) ?? []);
const freeSlotCount = computed(() => {
  return availableChannelNumbers(occupiedChannelNumbers.value, channelCapacity(settingsMemoryMap.value)).length;
});
const radioReady = computed(() => Boolean(program.value && memory.value && activeRadioId.value));
const canAddToRadio = computed(() => selectedCount.value > 0 && radioReady.value && freeSlotCount.value > 0);

const addToRadioTooltip = computed(() => {
  if (selectedCount.value === 0) {
    return 'Select saved channels to add';
  }

  if (!radioReady.value) {
    return 'Open a memory file or import from a radio first';
  }

  if (freeSlotCount.value === 0) {
    return `All memory slots on ${activeRadioId.value?.name ?? 'this radio'} are programmed`;
  }

  return 'Add selected channels to the loaded radio';
});

const addToRadioTitle = computed(() => (selectedCount.value === 1 ? 'Add channel to radio' : 'Add channels to radio'));

const addToRadioDescription = computed(() => {
  const radioName = activeRadioId.value?.name ?? 'the loaded radio';
  const count = selectedCount.value;
  const slots = availableChannelNumbers(occupiedChannelNumbers.value, channelCapacity(settingsMemoryMap.value));
  const take = Math.min(count, slots.length);

  if (take === 0) {
    return `There are no unused memory slots on ${radioName}.`;
  }

  const first = slots[0];
  const last = slots[take - 1];
  const slotLabel = first === last ? `memory slot ${first}` : `memory slots ${first} to ${last}`;

  if (take < count) {
    return `Only ${slots.length} unused slots remain on ${radioName}. Add the first ${take} selected channels to ${slotLabel}? Write to the radio to apply the change on the device.`;
  }

  const channelLabel = count === 1 ? 'this channel' : `${count} channels`;
  return `Add ${channelLabel} to ${radioName} in unused ${slotLabel}? Write to the radio to apply the change on the device.`;
});

const columns = computed<TableColumn<DisplaySavedChannel>[]>(() => [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => {
          table.toggleAllPageRowsSelected(!!value);
        },
        'aria-label': 'Select all saved channels',
        onClick: (event: Event) => {
          event.stopPropagation();
        },
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => {
          row.toggleSelected(!!value);
        },
        'aria-label': `Select ${row.original.name || 'saved channel'}`,
        onClick: (event: Event) => {
          event.stopPropagation();
        },
      }),
  },
  {
    id: 'name',
    header: 'Name',
  },
  { accessorKey: 'band', header: 'Band' },
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
]);

function openCreate(): void {
  editingChannel.value = undefined;
  editorOpen.value = true;
}

function openEdit(channel: SavedChannel): void {
  editingChannel.value = channel;
  editorOpen.value = true;
}

function onSelectChannel(event: Event, row: TableRow<DisplaySavedChannel>): void {
  const target = event.target;

  if (target instanceof Element && target.closest('button, input, [role="checkbox"]')) {
    return;
  }

  openEdit(row.original);
}

function requestAddToRadio(): void {
  if (!canAddToRadio.value) {
    return;
  }

  addToRadioOpen.value = true;
}

async function confirmAddToRadio(): Promise<void> {
  const assignment = assignLibraryChannelsToSlots(
    selectedLibraryChannels.value,
    occupiedChannelNumbers.value,
    settingsMemoryMap.value,
  );

  isAddingToRadio.value = true;

  try {
    const added = await addChannels(assignment.programmed);

    if (added > 0) {
      rowSelection.value = {};
      addToRadioOpen.value = false;
    }
  } finally {
    isAddingToRadio.value = false;
  }
}

async function onSave(payload: {
  channel: RadioChannel;
  notes?: string;
  kind?: SavedChannel['kind'];
  id?: SavedChannel['id'];
}): Promise<void> {
  try {
    if (payload.id) {
      await updateChannel({
        id: payload.id,
        name: payload.channel.name,
        kind: payload.kind ?? editingChannel.value?.kind ?? 'channel',
        transmitFrequency: payload.channel.transmitFrequency,
        receiveFrequency: payload.channel.receiveFrequency,
        transmitTone: payload.channel.transmitTone,
        receiveTone: payload.channel.receiveTone,
        notes: payload.notes,
        createdAt: editingChannel.value?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await createChannel(payload.channel, payload.notes, payload.kind);
    }

    editorOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  }
}

async function onExportCsv(): Promise<void> {
  isExporting.value = true;

  try {
    await exportLibraryCsv();
  } catch {
    // Toast is shown by the composable.
  } finally {
    isExporting.value = false;
  }
}

async function onImportCsv(): Promise<void> {
  isImporting.value = true;

  try {
    await importLibraryCsv();
  } catch {
    // Toast is shown by the composable.
  } finally {
    isImporting.value = false;
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
        <p class="text-xs text-muted">
          Portable channels and imported repeaters. Select rows and choose Add to radio to copy them into unused slots on the loaded radio.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UTooltip text="Export CSV">
          <UButton
            icon="i-lucide-file-down"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="Export channel library to CSV"
            :loading="isExporting"
            @click="onExportCsv"
          />
        </UTooltip>
        <UTooltip text="Import CSV">
          <UButton
            icon="i-lucide-file-up"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="Import channel library, RepeaterBook, or CHIRP CSV"
            :loading="isImporting"
            @click="onImportCsv"
          />
        </UTooltip>
        <UTooltip :text="addToRadioTooltip">
          <span class="inline-flex">
            <UButton
              icon="i-lucide-radio"
              color="primary"
              variant="soft"
              size="sm"
              label="Add to radio"
              :disabled="!canAddToRadio || isAddingToRadio"
              :loading="isAddingToRadio"
              @click="requestAddToRadio"
            />
          </span>
        </UTooltip>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          label="Add channel"
          @click="openCreate"
        />
      </div>
    </div>

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search by name, frequency, or repeater"
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
        v-model:row-selection="rowSelection"
        :data="displayChannels"
        :columns="columns"
        :get-row-id="(row) => String(row.id)"
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
        empty="No saved channels yet. Add one here, import a RepeaterBook or CHIRP CSV, or save memory channels from the Radio page."
        @select="onSelectChannel"
      >
        <template #name-cell="{ row }">
          <div class="flex min-w-0 items-center gap-1.5">
            <UTooltip v-if="row.original.kind === 'repeater'" text="Repeater">
              <UBadge
                color="primary"
                variant="subtle"
                size="xs"
                icon="i-lucide-radio-tower"
                label="Repeater"
                class="shrink-0"
              />
            </UTooltip>
            <span class="truncate">{{ row.original.name || '—' }}</span>
          </div>
        </template>
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
    <UModal
      v-model:open="addToRadioOpen"
      :title="addToRadioTitle"
      :description="addToRadioDescription"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer="{ close }">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton
          color="primary"
          label="Add to radio"
          :loading="isAddingToRadio"
          @click="confirmAddToRadio"
        />
      </template>
    </UModal>
  </div>
</template>
